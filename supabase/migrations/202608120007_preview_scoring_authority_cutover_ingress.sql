-- Phase 2 Preview authority cutover ingress leases.
-- A lease closes the race between a Google-authoritative request and the
-- database-backed authority epoch that pauses scoring.

create table if not exists scoring_authority.scoring_ingress_leases (
  lease_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(tournament_id) on delete cascade,
  match_id text not null,
  authority text not null check (authority in ('GOOGLE', 'SUPABASE')),
  actor_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists scoring_ingress_leases_tournament_expiry_idx
  on scoring_authority.scoring_ingress_leases (tournament_id, expires_at);

alter table scoring_authority.scoring_ingress_leases enable row level security;
revoke all on table scoring_authority.scoring_ingress_leases from public, anon, authenticated;
grant all on table scoring_authority.scoring_ingress_leases to service_role;

create or replace function public.begin_preview_scoring_ingress(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  tournament_key text := input->>'tournament_id';
  expected_authority text := upper(coalesce(input->>'expected_authority', 'GOOGLE'));
  gate_row scoring_authority.ingress_gates%rowtype;
  lease uuid;
  active_count integer;
begin
  select * into gate_row from scoring_authority.ingress_gates
  where tournament_id = tournament_key for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_IMPORTED'); end if;

  delete from scoring_authority.scoring_ingress_leases
  where tournament_id = tournament_key and expires_at <= now();
  select count(*) into active_count from scoring_authority.scoring_ingress_leases
  where tournament_id = tournament_key and expires_at > now();
  update scoring_authority.ingress_gates set unresolved_client_queues = active_count
  where tournament_id = tournament_key;

  if gate_row.state <> 'OPEN' then
    return jsonb_build_object('ok', false, 'code', 'SCORING_INGRESS_PAUSED');
  end if;
  if gate_row.authority <> expected_authority then
    return jsonb_build_object('ok', false, 'code', 'AUTHORITY_BOUNDARY_MISMATCH',
      'current_authority', gate_row.authority, 'expected_authority', expected_authority);
  end if;

  insert into scoring_authority.scoring_ingress_leases (
    tournament_id, match_id, authority, actor_id, expires_at
  ) values (
    tournament_key, input->>'match_id', expected_authority,
    coalesce(nullif(input->>'actor_id', ''), 'Authorized scorer'),
    now() + make_interval(secs => greatest(30, least(coalesce((input->>'lease_seconds')::integer, 180), 300)))
  ) returning lease_id into lease;
  update scoring_authority.ingress_gates set unresolved_client_queues = active_count + 1
  where tournament_id = tournament_key;
  return jsonb_build_object('ok', true, 'lease_id', lease, 'authority', gate_row.authority,
    'ingress', gate_row.state, 'active_leases', active_count + 1);
end;
$$;

create or replace function public.complete_preview_scoring_ingress(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare tournament_key text; active_count integer;
begin
  delete from scoring_authority.scoring_ingress_leases
  where lease_id = (input->>'lease_id')::uuid returning tournament_id into tournament_key;
  if tournament_key is null then return jsonb_build_object('ok', true, 'idempotent', true); end if;
  select count(*) into active_count from scoring_authority.scoring_ingress_leases
  where tournament_id = tournament_key and expires_at > now();
  update scoring_authority.ingress_gates set unresolved_client_queues = active_count
  where tournament_id = tournament_key;
  return jsonb_build_object('ok', true, 'idempotent', false, 'active_leases', active_count);
end;
$$;

create or replace function public.prepare_preview_authority_epoch(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  tournament_key text := input->>'tournament_id';
  requested_type text := upper(input->>'epoch_type');
  current_authority text;
  unresolved integer;
  epoch uuid;
begin
  if requested_type not in ('CUTOVER', 'ROLLBACK') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EPOCH_TYPE');
  end if;
  select authority into current_authority from scoring_authority.ingress_gates
  where tournament_id = tournament_key for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_IMPORTED'); end if;

  delete from scoring_authority.scoring_ingress_leases
  where tournament_id = tournament_key and expires_at <= now();
  select count(*) into unresolved from scoring_authority.scoring_ingress_leases
  where tournament_id = tournament_key and expires_at > now();
  update scoring_authority.ingress_gates set unresolved_client_queues = unresolved
  where tournament_id = tournament_key;
  if unresolved > 0 then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_QUEUES_NOT_DRAINED', 'unresolved', unresolved);
  end if;

  if requested_type = 'CUTOVER' and current_authority <> 'GOOGLE' then
    return jsonb_build_object('ok', false, 'code', 'AUTHORITY_BOUNDARY_MISMATCH');
  end if;
  if requested_type = 'ROLLBACK' and current_authority <> 'SUPABASE' then
    return jsonb_build_object('ok', false, 'code', 'AUTHORITY_BOUNDARY_MISMATCH');
  end if;
  if requested_type = 'CUTOVER' and exists (
    select 1 from scoring_authority.google_outbox_events
    where tournament_id = tournament_key and status <> 'DELIVERED'
  ) then return jsonb_build_object('ok', false, 'code', 'GOOGLE_OUTBOX_NOT_DRAINED'); end if;

  insert into scoring_authority.authority_epochs (
    tournament_id, epoch_type, status, authority_before, authority_after,
    reconciliation_fingerprint, google_checkpoints, supabase_match_revisions,
    deployment_commit, actor_id, reason
  ) values (
    tournament_key, requested_type, 'PREPARED', current_authority,
    case when requested_type = 'CUTOVER' then 'SUPABASE' else 'GOOGLE' end,
    input->>'reconciliation_fingerprint', input->'google_checkpoints',
    input->'supabase_match_revisions', input->>'deployment_commit', input->>'actor_id',
    coalesce(input->>'reason', '')
  ) returning epoch_id into epoch;
  update scoring_authority.ingress_gates set state = 'PAUSED', active_epoch_id = epoch,
    updated_by = input->>'actor_id', updated_at = now() where tournament_id = tournament_key;
  return jsonb_build_object('ok', true, 'code', 'EPOCH_PREPARED', 'epoch_id', epoch,
    'authority', current_authority, 'ingress', 'PAUSED');
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.begin_preview_scoring_ingress(jsonb)',
    'public.complete_preview_scoring_ingress(jsonb)',
    'public.prepare_preview_authority_epoch(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
