-- Director-protected diagnostics and deterministic one-event claims for the
-- committed Preview Supabase -> Google scoring mirror.

alter table scoring_authority.google_outbox_events
  add column if not exists last_attempt_at timestamptz;

create or replace function public.claim_preview_google_outbox(worker_id text, lease_seconds integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare event_row scoring_authority.google_outbox_events%rowtype;
begin
  select e.* into event_row
  from scoring_authority.google_outbox_events e
  join scoring_authority.google_match_checkpoints c on c.match_id = e.match_id
  where e.status in ('PENDING', 'RETRYABLE', 'PROCESSING')
    and e.available_at <= now()
    and (e.status <> 'PROCESSING' or e.lease_expires_at < now())
    and e.match_revision = c.last_supabase_match_revision + 1
  order by e.created_at, e.match_id, e.match_revision
  for update of e skip locked
  limit 1;
  if not found then return jsonb_build_object('ok', true, 'event', null); end if;
  update scoring_authority.google_outbox_events set status = 'PROCESSING', attempts = attempts + 1,
    claimed_by = worker_id, lease_expires_at = now() + make_interval(secs => greatest(5, least(lease_seconds, 300))),
    last_attempt_at = now()
  where id = event_row.id
  returning * into event_row;
  return jsonb_build_object('ok', true, 'event', to_jsonb(event_row), 'checkpoint',
    (select to_jsonb(c) from scoring_authority.google_match_checkpoints c where c.match_id = event_row.match_id));
end;
$$;

create or replace function public.inspect_preview_scoring_mirror_operations(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  tournament_key text := coalesce(nullif(input->>'tournament_id', ''), '2026');
  gate jsonb;
  active_epoch jsonb;
  events jsonb;
  counts jsonb;
begin
  select to_jsonb(g) into gate
  from scoring_authority.ingress_gates g
  where g.tournament_id = tournament_key;

  select to_jsonb(e) into active_epoch
  from scoring_authority.authority_epochs e
  where e.epoch_id = nullif(gate->>'active_epoch_id', '')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'match_id', e.match_id,
    'event_type', e.event_type,
    'lifecycle_operation', case e.event_type
      when 'MATCH_REOPENED' then 'FINAL_TO_REOPENED'
      when 'MATCH_FINALIZED' then 'LIVE_TO_FINAL'
      else 'HOLE_SCORE_UPSERT' end,
    'match_revision', e.match_revision,
    'hole_number', e.hole_number,
    'hole_revision', e.hole_revision,
    'mutation_key', e.mutation_key,
    'payload', e.payload,
    'payload_hash', e.payload_hash,
    'status', e.status,
    'attempts', e.attempts,
    'created_at', e.created_at,
    'available_at', e.available_at,
    'last_attempt_at', e.last_attempt_at,
    'lease_expires_at', e.lease_expires_at,
    'claimed_by', e.claimed_by,
    'last_error_code', e.last_error_code,
    'last_error_safe', e.last_error_safe,
    'delivered_at', e.delivered_at,
    'retryable', e.status in ('PENDING', 'RETRYABLE')
      or (e.status = 'PROCESSING' and e.lease_expires_at < now()),
    'claimable', e.status in ('PENDING', 'RETRYABLE', 'PROCESSING')
      and e.available_at <= now()
      and (e.status <> 'PROCESSING' or e.lease_expires_at < now())
      and e.match_revision = coalesce(c.last_supabase_match_revision, -1) + 1,
    'target_checkpoint_revision', coalesce(c.last_supabase_match_revision, -1) + 1,
    'checkpoint', to_jsonb(c),
    'canonical_match', jsonb_build_object(
      'status', m.status,
      'scoring_locked', m.scoring_locked,
      'match_revision', m.match_revision,
      'permission_revision', m.permission_revision,
      'finalized_at', m.finalized_at,
      'updated_at', m.updated_at
    ),
    'canonical_permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', p.player_id,
        'can_score', p.can_score,
        'permission_revision', p.permission_revision,
        'revoked_at', p.revoked_at
      ) order by p.player_id)
      from scoring_authority.scoring_permissions p
      where p.match_id = e.match_id
    ), '[]'::jsonb)
  ) order by e.created_at, e.match_id, e.match_revision), '[]'::jsonb)
  into events
  from scoring_authority.google_outbox_events e
  join scoring_authority.matches m on m.match_id = e.match_id
  left join scoring_authority.google_match_checkpoints c on c.match_id = e.match_id
  where e.tournament_id = tournament_key
    and e.status <> 'DELIVERED';

  select jsonb_object_agg(status, total) into counts
  from (
    select status, count(*)::integer as total
    from scoring_authority.google_outbox_events
    where tournament_id = tournament_key
    group by status
  ) grouped;

  return jsonb_build_object(
    'ok', true,
    'tournament_id', tournament_key,
    'authority', (select scoring_authority from scoring_authority.tournaments where tournament_id = tournament_key),
    'ingress', gate,
    'active_epoch', active_epoch,
    'google_mirror_mode', case when upper(coalesce(gate->>'authority', '')) = 'SUPABASE' then 'ORDERED_OUTBOX' else 'DIRECT_GOOGLE' end,
    'outbox_counts', coalesce(counts, '{}'::jsonb),
    'events', events
  );
end;
$$;

create or replace function public.claim_preview_google_outbox_event(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_event uuid := nullif(input->>'event_id', '')::uuid;
  worker text := coalesce(nullif(input->>'worker_id', ''), 'director-mirror-reconciliation');
  lease_seconds integer := greatest(5, least(coalesce((input->>'lease_seconds')::integer, 45), 300));
  event_row scoring_authority.google_outbox_events%rowtype;
  checkpoint_row scoring_authority.google_match_checkpoints%rowtype;
begin
  if upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
      or coalesce((input->>'director_authorized')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_PREVIEW_REQUIRED');
  end if;
  select * into event_row
  from scoring_authority.google_outbox_events
  where id = target_event
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_NOT_FOUND'); end if;
  select * into checkpoint_row
  from scoring_authority.google_match_checkpoints
  where match_id = event_row.match_id
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_NOT_FOUND'); end if;
  if event_row.status = 'DELIVERED' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'event', to_jsonb(event_row), 'checkpoint', to_jsonb(checkpoint_row));
  end if;
  if event_row.status = 'BLOCKED' then return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_BLOCKED'); end if;
  if event_row.status = 'PROCESSING' and event_row.lease_expires_at >= now() then
    return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_LEASE_ACTIVE');
  end if;
  if event_row.status not in ('PENDING', 'RETRYABLE', 'PROCESSING') then
    return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_NOT_RETRYABLE');
  end if;
  if event_row.available_at > now() then return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_NOT_READY'); end if;
  if event_row.match_revision <> checkpoint_row.last_supabase_match_revision + 1 then
    return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_ORDER_CONFLICT',
      'event_revision', event_row.match_revision,
      'checkpoint_revision', checkpoint_row.last_supabase_match_revision);
  end if;
  update scoring_authority.google_outbox_events
  set status = 'PROCESSING', attempts = attempts + 1, claimed_by = worker,
    lease_expires_at = now() + make_interval(secs => lease_seconds), last_attempt_at = now()
  where id = event_row.id
  returning * into event_row;
  return jsonb_build_object('ok', true, 'event', to_jsonb(event_row), 'checkpoint', to_jsonb(checkpoint_row));
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.claim_preview_google_outbox(text,integer)',
    'public.inspect_preview_scoring_mirror_operations(jsonb)',
    'public.claim_preview_google_outbox_event(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
