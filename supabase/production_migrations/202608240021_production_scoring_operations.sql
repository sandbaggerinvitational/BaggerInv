-- Step 11 reviewed Production scoring and Google compatibility operations.
--
-- This migration is dormant when applied. Every mutation requires the exact
-- staged release/resource tuple from 019, the committed Supabase authority
-- epoch, OPEN ingress, and service_role. Google worker claims additionally
-- require the corresponding explicitly-enabled worker control. No scheduler
-- is installed and no Google network operation is performed by SQL.
begin;

alter table scoring_authority.score_mutations
  drop constraint if exists score_mutations_mutation_type_check;
alter table scoring_authority.score_mutations
  add constraint score_mutations_mutation_type_check check (mutation_type in (
    'HOLE_SCORE', 'FINALIZE', 'REOPEN', 'MARK_LIVE',
    'SCORING_LOCK', 'SCORING_UNLOCK', 'ACCESS_ACTIVATE', 'ACCESS_REVOKE'
  ));

alter table scoring_authority.google_outbox_events
  drop constraint if exists google_outbox_events_event_type_check;
alter table scoring_authority.google_outbox_events
  add constraint google_outbox_events_event_type_check check (event_type in (
    'HOLE_SCORE_UPSERTED', 'MATCH_FINALIZED', 'MATCH_REOPENED',
    'MATCH_MARKED_LIVE', 'SCORING_LOCKED', 'SCORING_UNLOCKED',
    'SCORING_ACCESS_ACTIVATED', 'SCORING_ACCESS_REVOKED'
  ));

create or replace function production_control.assert_production_scoring_runtime(
  input jsonb,
  required_worker text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  required_worker_name text := upper(coalesce(required_worker, ''));
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select * into strict activation from production_control.cutover_activation_state
    where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource from production_control.resource_scope
    where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate from scoring_authority.ingress_gates
    where tournament_id = '2026';

  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or not activation.scoring_ingress_enabled
     or activation.authority_generation_id <> nullif(input->>'expected_epoch_id', '')::uuid
     or resource.scoring_authority <> 'SUPABASE'
     or not resource.scoring_ingress_enabled
     or gate.state <> 'OPEN'
     or gate.authority <> 'SUPABASE'
     or gate.active_epoch_id <> activation.authority_generation_id
     or not exists (
       select 1 from scoring_authority.tournaments
       where tournament_id = '2026' and scoring_authority = 'SUPABASE'
     ) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_SUPABASE_SCORING_RUNTIME_REQUIRED';
  end if;

  if required_worker_name <> '' then
    if required_worker_name not in ('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE')
       or not resource.workers_enabled
       or not resource.google_writes_enabled
       or not exists (
         select 1
         from production_control.worker_controls controls
         join production_control.worker_contracts contracts using (worker_name)
         where controls.worker_name = required_worker_name
           and controls.enabled and controls.google_writes_allowed
           and contracts.operation_allowed and contracts.requires_google_write
           and not contracts.authoritative_write_allowed
           and coalesce(controls.metadata->>'activation_epoch_id', '') = activation.authority_generation_id::text
           and coalesce(controls.metadata->>'deployment_commit', '') = activation.expected_deployment_commit
           and coalesce(controls.metadata->>'google_service_account', '') = activation.expected_google_service_account
       ) then
      raise exception using errcode = 'P0001', message = 'PRODUCTION_SCORING_WORKER_NOT_ENABLED';
    end if;
  end if;
end;
$$;

create or replace function production_control.assert_production_scoring_actor(
  input jsonb,
  require_director boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth
as $$
declare
  actor text := btrim(coalesce(input#>>'{authorization,player_id}', ''));
  actor_role text := upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  actor_auth_user uuid := nullif(input#>>'{authorization,auth_user_id}', '')::uuid;
begin
  if input#>>'{authorization,tournament_id}' <> '2026'
     or actor = ''
     or actor_auth_user is null
     or actor_role not in ('PLAYER', 'DIRECTOR')
     or (require_director and actor_role <> 'DIRECTOR') then
    raise exception using errcode = '42501', message = case when require_director
      then 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED'
      else 'PRODUCTION_SCORING_AUTHORIZATION_REQUIRED' end;
  end if;

  -- Never trust a role/player assertion supplied by the server request. Re-read
  -- the current Auth link, confirmed identifier, tournament membership and
  -- role on every mutation so revoked/stale sessions lose authority promptly.
  if not exists (
    select 1
    from participant_identity.user_player_links link
    join auth.users auth_user
      on auth_user.id = link.auth_user_id and auth_user.email_confirmed_at is not null
    join participant_identity.participant_auth_identifiers identifier
      on identifier.auth_user_id = link.auth_user_id
     and identifier.player_id = link.player_id
     and identifier.identifier_type = 'EMAIL'
     and identifier.status = 'VERIFIED'
    join participant_identity.tournament_roles tournament_role
      on tournament_role.tournament_id = '2026'
     and tournament_role.auth_user_id = link.auth_user_id
     and tournament_role.role = case when actor_role = 'DIRECTOR' then 'DIRECTOR' else 'PARTICIPANT' end
     and tournament_role.role_active
     and tournament_role.revoked_at is null
    join scoring_authority.tournament_players membership
      on membership.tournament_id = '2026'
     and membership.player_id = link.player_id
     and membership.participation_status = 'ACTIVE'
    where link.auth_user_id = actor_auth_user
      and link.player_id = actor
      and link.status = 'ACTIVE'
      and link.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = case when require_director
      then 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED'
      else 'PRODUCTION_SCORING_AUTHORIZATION_REQUIRED' end;
  end if;

  if actor_role = 'DIRECTOR' and not exists (
    select 1
    from production_control.director_entitlements entitlement
    where entitlement.auth_user_id = actor_auth_user
      and entitlement.tournament_id = '2026'
      and entitlement.player_id = actor
      and entitlement.role in ('DIRECTOR', 'OWNER')
      and entitlement.status = 'ACTIVE'
      and entitlement.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED';
  end if;
end;
$$;

-- Production lifecycle RPCs call the reviewed snapshot helpers explicitly in
-- the same transaction. Keep the historical trigger disabled so there is one
-- deterministic archive transition and one audit trail per mutation.
alter table scoring_authority.matches disable trigger capture_scorecard_archive_transition;

create or replace function public.mutate_production_match_control(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  operation text := upper(coalesce(input->>'operation', ''));
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  expected_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_match_revision bigint;
  next_permission_revision bigint;
  permission_changes boolean;
  target_locked boolean;
  target_access boolean;
  event_type text;
  mutation_type text;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  transition_at timestamptz := clock_timestamp();
begin
  perform production_control.assert_production_scoring_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  if operation not in ('MARK_LIVE', 'SCORING_LOCK', 'SCORING_UNLOCK', 'ACCESS_ACTIVATE', 'ACCESS_REVOKE')
     or coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CONTROL_OPERATION');
  end if;
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(jsonb_build_object(
    'match_id', target_match, 'operation', operation, 'actor_id', actor
  ));
  select * into mutation_row from scoring_authority.score_mutations
    where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || jsonb_build_object('idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if expected_match <> match_row.match_revision then
    return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  if expected_permission <> match_row.permission_revision then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if match_row.status = 'FINAL' then
    return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL');
  end if;
  if operation = 'MARK_LIVE' and match_row.status = 'LIVE' then
    return jsonb_build_object('ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match, 'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision, 'status', match_row.status,
      'scoring_locked', match_row.scoring_locked, 'google_outbox_created', false);
  end if;
  if operation = 'MARK_LIVE' and match_row.status <> 'UPCOMING' then
    return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_UPCOMING');
  end if;
  if operation in ('SCORING_UNLOCK', 'ACCESS_ACTIVATE') and
     ((operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked)
       or (operation = 'SCORING_UNLOCK' and not match_row.scoring_locked)) then
    if operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked then
      return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED');
    end if;
    if not exists (select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and (not can_score or revoked_at is not null
        or permission_revision <> match_row.permission_revision)) then
      return jsonb_build_object('ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
        'match_id', target_match, 'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'scoring_locked', match_row.scoring_locked, 'access_active', true,
        'google_outbox_created', false);
    end if;
  end if;
  if operation = 'SCORING_LOCK' and match_row.scoring_locked and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision)
  ) then
    return jsonb_build_object('ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match, 'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', true, 'access_active', false, 'google_outbox_created', false);
  end if;
  if operation = 'ACCESS_REVOKE' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision)
  ) then
    return jsonb_build_object('ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match, 'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', match_row.scoring_locked, 'access_active', false,
      'google_outbox_created', false);
  end if;

  select coalesce(jsonb_agg(to_jsonb(permission) order by player_id), '[]'::jsonb)
    into before_permissions from scoring_authority.scoring_permissions permission
    where match_id = target_match;
  next_match_revision := match_row.match_revision + 1;
  permission_changes := operation <> 'MARK_LIVE';
  next_permission_revision := match_row.permission_revision + case when permission_changes then 1 else 0 end;
  target_locked := case operation
    when 'SCORING_LOCK' then true
    when 'SCORING_UNLOCK' then false
    else match_row.scoring_locked end;
  target_access := case operation
    when 'SCORING_LOCK' then false
    when 'SCORING_UNLOCK' then true
    when 'ACCESS_ACTIVATE' then true
    when 'ACCESS_REVOKE' then false
    else exists (select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and can_score and revoked_at is null) end;
  event_type := case operation
    when 'MARK_LIVE' then 'MATCH_MARKED_LIVE'
    when 'SCORING_LOCK' then 'SCORING_LOCKED'
    when 'SCORING_UNLOCK' then 'SCORING_UNLOCKED'
    when 'ACCESS_ACTIVATE' then 'SCORING_ACCESS_ACTIVATED'
    else 'SCORING_ACCESS_REVOKED' end;
  mutation_type := operation;

  update scoring_authority.matches set
    status = case when operation = 'MARK_LIVE' then 'LIVE' else status end,
    scoring_locked = target_locked,
    match_revision = next_match_revision,
    permission_revision = next_permission_revision,
    authority_updated_at = transition_at,
    updated_at = transition_at
  where match_id = target_match returning * into next_match_row;
  if permission_changes then
    update scoring_authority.scoring_permissions set
      can_score = target_access,
      permission_revision = next_permission_revision,
      revoked_at = case when target_access then null else transition_at end,
      updated_at = transition_at
    where match_id = target_match;
  end if;
  select coalesce(jsonb_agg(to_jsonb(permission) order by player_id), '[]'::jsonb)
    into after_permissions from scoring_authority.scoring_permissions permission
    where match_id = target_match;
  result_value := jsonb_build_object(
    'ok', true, 'code', operation, 'match_id', target_match,
    'google_target_match_id', target_match,
    'match_revision', next_match_revision,
    'previous_permission_revision', match_row.permission_revision,
    'permission_revision', next_permission_revision,
    'status', next_match_row.status,
    'scoring_locked', target_locked,
    'access_active', target_access,
    'updated_at', transition_at,
    'permission_transition', jsonb_build_object('before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (
    target_match, mutation_identity, mutation_type, payload_hash_value,
    match_row.match_revision, next_match_revision, result_value, actor
  );
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (
    target_match, mutation_identity, event_type, match_row.match_revision,
    next_match_revision,
    jsonb_build_object('match', to_jsonb(match_row), 'permissions', before_permissions),
    jsonb_build_object('match', to_jsonb(next_match_row), 'permissions', after_permissions), actor
  );
  insert into scoring_authority.audit_events (
    tournament_id, match_id, mutation_key, action, actor_id, metadata
  ) values ('2026', target_match, mutation_identity, event_type, actor, result_value);
  insert into scoring_authority.google_outbox_events (
    tournament_id, match_id, match_revision, mutation_key,
    event_type, payload, payload_hash
  ) values (
    '2026', target_match, next_match_revision, mutation_identity,
    event_type, result_value, payload_hash_value
  );
  return result_value;
end;
$$;

create or replace function public.claim_production_google_outbox(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  event_row scoring_authority.google_outbox_events%rowtype;
  worker text := left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
  lease integer := greatest(5, least(coalesce((input->>'lease_seconds')::integer, 30), 300));
begin
  perform production_control.assert_production_scoring_runtime(input, 'SCORING_GOOGLE_OUTBOX');
  if worker = '' then return jsonb_build_object('ok', false, 'code', 'WORKER_ID_REQUIRED'); end if;
  select event.* into event_row
  from scoring_authority.google_outbox_events event
  join scoring_authority.google_match_checkpoints checkpoint using (match_id)
  where event.tournament_id = '2026'
    and event.status in ('PENDING', 'RETRYABLE', 'PROCESSING')
    and event.available_at <= now()
    and (event.status <> 'PROCESSING' or event.lease_expires_at < now())
    and event.match_revision = checkpoint.last_supabase_match_revision + 1
  order by event.created_at, event.match_id, event.match_revision
  for update of event skip locked limit 1;
  if not found then return jsonb_build_object('ok', true, 'event', null); end if;
  update scoring_authority.google_outbox_events set
    status = 'PROCESSING', attempts = attempts + 1, claimed_by = worker,
    lease_expires_at = now() + make_interval(secs => lease), last_attempt_at = now()
  where id = event_row.id returning * into event_row;
  return jsonb_build_object(
    'ok', true, 'event', to_jsonb(event_row),
    'checkpoint', (select to_jsonb(checkpoint) from scoring_authority.google_match_checkpoints checkpoint
      where checkpoint.match_id = event_row.match_id)
  );
end;
$$;

create or replace function public.claim_production_google_outbox_event(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  event_row scoring_authority.google_outbox_events%rowtype;
  checkpoint_row scoring_authority.google_match_checkpoints%rowtype;
  target_event uuid := nullif(input->>'event_id', '')::uuid;
  worker text := left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
  lease integer := greatest(5, least(coalesce((input->>'lease_seconds')::integer, 45), 300));
begin
  perform production_control.assert_production_scoring_runtime(input, 'SCORING_GOOGLE_OUTBOX');
  if worker = '' then return jsonb_build_object('ok', false, 'code', 'WORKER_ID_REQUIRED'); end if;
  select * into event_row from scoring_authority.google_outbox_events
    where id = target_event and tournament_id = '2026' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_NOT_FOUND'); end if;
  select * into checkpoint_row from scoring_authority.google_match_checkpoints
    where match_id = event_row.match_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_NOT_FOUND'); end if;
  if event_row.status = 'DELIVERED' then
    return jsonb_build_object('ok', true, 'idempotent', true,
      'event', to_jsonb(event_row), 'checkpoint', to_jsonb(checkpoint_row));
  end if;
  if event_row.status = 'BLOCKED' then return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_BLOCKED'); end if;
  if event_row.status = 'PROCESSING' and event_row.lease_expires_at >= now() then
    return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_LEASE_ACTIVE');
  end if;
  if event_row.status not in ('PENDING', 'RETRYABLE', 'PROCESSING')
     or event_row.available_at > now() then
    return jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_NOT_READY');
  end if;
  if event_row.match_revision <> checkpoint_row.last_supabase_match_revision + 1 then
    return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_ORDER_CONFLICT');
  end if;
  update scoring_authority.google_outbox_events set
    status = 'PROCESSING', attempts = attempts + 1, claimed_by = worker,
    lease_expires_at = now() + make_interval(secs => lease), last_attempt_at = now()
  where id = event_row.id returning * into event_row;
  return jsonb_build_object('ok', true, 'event', to_jsonb(event_row), 'checkpoint', to_jsonb(checkpoint_row));
end;
$$;

create or replace function public.complete_production_google_outbox(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  event_row scoring_authority.google_outbox_events%rowtype;
  checkpoint_row scoring_authority.google_match_checkpoints%rowtype;
  worker text := left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
begin
  perform production_control.assert_production_scoring_runtime(input, 'SCORING_GOOGLE_OUTBOX');
  select * into event_row from scoring_authority.google_outbox_events
    where id = nullif(input->>'event_id', '')::uuid and tournament_id = '2026' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND'); end if;
  select * into checkpoint_row from scoring_authority.google_match_checkpoints
    where match_id = event_row.match_id for update;
  if event_row.status = 'DELIVERED' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'checkpoint', to_jsonb(checkpoint_row));
  end if;
  if event_row.status <> 'PROCESSING' or worker = '' or event_row.claimed_by <> worker
     or event_row.lease_expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'OUTBOX_CLAIM_STALE');
  end if;
  if event_row.match_revision <> checkpoint_row.last_supabase_match_revision + 1 then
    return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_ORDER_CONFLICT',
      'current_revision', checkpoint_row.last_supabase_match_revision);
  end if;
  if coalesce(input->>'verified_fingerprint', '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'OUTBOX_READBACK_FINGERPRINT_REQUIRED');
  end if;
  update scoring_authority.google_outbox_events set
    status = 'DELIVERED', delivered_at = now(), lease_expires_at = null,
    claimed_by = null, last_error_code = null, last_error_safe = null
  where id = event_row.id;
  update scoring_authority.google_match_checkpoints set
    last_supabase_match_revision = event_row.match_revision,
    google_match_updated_at = nullif(input->>'google_match_updated_at', '')::timestamptz,
    google_match_revision = coalesce((input->>'google_match_revision')::bigint, google_match_revision),
    google_hole_revisions = case when event_row.hole_number is null then google_hole_revisions
      else google_hole_revisions || jsonb_build_object(event_row.hole_number::text,
        coalesce((input->>'google_hole_revision')::bigint, event_row.hole_revision)) end,
    last_outbox_event_id = event_row.id,
    verified_fingerprint = input->>'verified_fingerprint',
    verified_at = now(), updated_at = now()
  where match_id = event_row.match_id returning * into checkpoint_row;
  return jsonb_build_object('ok', true, 'idempotent', false, 'checkpoint', to_jsonb(checkpoint_row));
end;
$$;

create or replace function public.fail_production_google_outbox(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  worker text := left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
  delay_seconds integer := greatest(1, least(coalesce((input->>'retry_after_seconds')::integer, 1), 300));
  updated_count integer;
begin
  perform production_control.assert_production_scoring_runtime(input, 'SCORING_GOOGLE_OUTBOX');
  update scoring_authority.google_outbox_events set
    status = case when coalesce((input->>'block')::boolean, false) then 'BLOCKED' else 'RETRYABLE' end,
    available_at = now() + make_interval(secs => delay_seconds),
    lease_expires_at = null, claimed_by = null,
    last_error_code = left(coalesce(input->>'error_code', 'DELIVERY_FAILED'), 80),
    last_error_safe = left(coalesce(input->>'error_safe', 'Google mirror delivery will retry.'), 240)
  where id = nullif(input->>'event_id', '')::uuid
    and tournament_id = '2026' and status = 'PROCESSING'
    and claimed_by = worker and lease_expires_at >= now();
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then return jsonb_build_object('ok', false, 'code', 'OUTBOX_CLAIM_STALE'); end if;
  return jsonb_build_object('ok', true,
    'status', case when coalesce((input->>'block')::boolean, false) then 'BLOCKED' else 'RETRYABLE' end);
end;
$$;

create or replace function public.inspect_production_scoring_workers(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  return jsonb_build_object(
    'ok', true,
    'authority', (select scoring_authority from scoring_authority.tournaments where tournament_id = '2026'),
    'ingress', (select to_jsonb(gate) from scoring_authority.ingress_gates gate where tournament_id = '2026'),
    'worker_controls', (select coalesce(jsonb_object_agg(worker_name, jsonb_build_object(
      'enabled', enabled, 'google_writes_allowed', google_writes_allowed,
      'scheduler_installed', scheduler_installed
    ) order by worker_name), '{}'::jsonb) from production_control.worker_controls
      where worker_name in ('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE')),
    'outbox_counts', (select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, count(*)::integer total from scoring_authority.google_outbox_events
        where tournament_id = '2026' group by status) grouped),
    'archive_counts', (select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, count(*)::integer total from scoring_authority.scorecard_archive_jobs
        where tournament_id = '2026' group by status) grouped),
    'no_automatic_fallback', true
  );
end;
$$;

create or replace function public.finalize_production_match(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  actor_role text := upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  supplied_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  progress jsonb;
  archive_result jsonb;
  transition_at timestamptz := clock_timestamp();
begin
  perform production_control.assert_production_scoring_runtime(input);
  perform production_control.assert_production_scoring_actor(input, false);
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match
     or actor_role not in ('PLAYER', 'DIRECTOR') then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(jsonb_build_object(
    'match_id', target_match, 'action', 'FINALIZE', 'actor_id', actor
  ));
  select * into mutation_row from scoring_authority.score_mutations
    where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || jsonb_build_object('idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if supplied_permission <> match_row.permission_revision then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if actor_role = 'PLAYER' and not exists (
    select 1 from scoring_authority.scoring_permissions where match_id = target_match
      and player_id = actor and can_score and revoked_at is null
      and permission_revision = match_row.permission_revision
  ) then return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); end if;
  if match_row.status = 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if match_row.scoring_locked then return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if expected_match <> match_row.match_revision then
    return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  if match_row.scored_holes <> 18 or not match_row.scorecard_complete then
    return jsonb_build_object('ok', false, 'code', 'SCORECARD_INCOMPLETE',
      'scored_holes', match_row.scored_holes);
  end if;
  if match_row.unresolved_mutations > 0 then
    return jsonb_build_object('ok', false, 'code', 'UNRESOLVED_MUTATIONS');
  end if;
  progress := scoring_authority.match_progress(target_match, match_row.format);
  if btrim(coalesce(progress->>'result_winner', '')) = ''
     or progress->>'result_winner' <> match_row.result_winner
     or coalesce((progress->>'scorecard_complete')::boolean, false) is not true
     or progress->>'team_1_points' is null
     or progress->>'team_2_points' is null then
    return jsonb_build_object('ok', false, 'code', 'RESULT_UNAVAILABLE');
  end if;
  select coalesce(jsonb_agg(to_jsonb(permission) order by player_id), '[]'::jsonb)
    into before_permissions from scoring_authority.scoring_permissions permission
    where match_id = target_match;
  next_revision := match_row.match_revision + 1;
  next_permission_revision := match_row.permission_revision + 1;
  update scoring_authority.matches set
    status = 'FINAL', scoring_locked = true, match_revision = next_revision,
    permission_revision = next_permission_revision, finalized_at = transition_at,
    authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match returning * into next_match_row;
  update scoring_authority.scoring_permissions set
    can_score = false, permission_revision = next_permission_revision,
    revoked_at = transition_at, updated_at = transition_at
  where match_id = target_match;
  select coalesce(jsonb_agg(to_jsonb(permission) order by player_id), '[]'::jsonb)
    into after_permissions from scoring_authority.scoring_permissions permission
    where match_id = target_match;
  archive_result := scoring_authority.capture_finalized_scorecard_snapshot(target_match, actor);
  result_value := jsonb_build_object(
    'ok', true, 'code', 'FINALIZED', 'match_id', target_match,
    'google_target_match_id', target_match, 'match_revision', next_revision,
    'permission_revision', next_permission_revision,
    'previous_permission_revision', match_row.permission_revision,
    'scoring_locked', true, 'access_active', false,
    'result_winner', match_row.result_winner, 'scorecard_complete', true,
    'scored_holes', 18, 'updated_at', transition_at,
    'match', progress,
    'team_1_points', (progress->>'team_1_points')::numeric,
    'team_2_points', (progress->>'team_2_points')::numeric,
    'scorecard_archive', archive_result,
    'permission_transition', jsonb_build_object('before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (
    target_match, mutation_identity, 'FINALIZE', payload_hash_value,
    match_row.match_revision, next_revision, result_value, actor
  );
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (
    target_match, mutation_identity, 'MATCH_FINALIZED', match_row.match_revision,
    next_revision,
    jsonb_build_object('match', to_jsonb(match_row), 'permissions', before_permissions),
    jsonb_build_object('match', to_jsonb(next_match_row), 'permissions', after_permissions), actor
  );
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
    values ('2026', target_match, mutation_identity, 'MATCH_FINALIZED', actor, result_value);
  insert into scoring_authority.google_outbox_events (
    tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash
  ) values ('2026', target_match, next_revision, mutation_identity, 'MATCH_FINALIZED', result_value, payload_hash_value);
  return result_value;
end;
$$;

create or replace function public.reopen_production_match(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  supplied_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  archive_result jsonb;
  transition_at timestamptz := clock_timestamp();
begin
  perform production_control.assert_production_scoring_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(jsonb_build_object(
    'match_id', target_match, 'action', 'REOPEN', 'actor_id', actor
  ));
  select * into mutation_row from scoring_authority.score_mutations
    where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || jsonb_build_object('idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if supplied_permission <> match_row.permission_revision then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if match_row.status <> 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FINAL'); end if;
  if expected_match <> match_row.match_revision then
    return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  select coalesce(jsonb_agg(to_jsonb(permission) order by player_id), '[]'::jsonb)
    into before_permissions from scoring_authority.scoring_permissions permission
    where match_id = target_match;
  next_revision := match_row.match_revision + 1;
  next_permission_revision := match_row.permission_revision + 1;
  update scoring_authority.matches set
    status = 'LIVE', scoring_locked = false, match_revision = next_revision,
    permission_revision = next_permission_revision, finalized_at = null,
    authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match returning * into next_match_row;
  update scoring_authority.scoring_permissions set
    can_score = true, permission_revision = next_permission_revision,
    revoked_at = null, updated_at = transition_at
  where match_id = target_match;
  select coalesce(jsonb_agg(to_jsonb(permission) order by player_id), '[]'::jsonb)
    into after_permissions from scoring_authority.scoring_permissions permission
    where match_id = target_match;
  archive_result := scoring_authority.invalidate_finalized_scorecard_snapshot(
    target_match, next_revision, actor
  );
  result_value := jsonb_build_object(
    'ok', true, 'code', 'REOPENED', 'match_id', target_match,
    'google_target_match_id', target_match, 'match_revision', next_revision,
    'permission_revision', next_permission_revision,
    'previous_permission_revision', match_row.permission_revision,
    'scoring_locked', false, 'access_active', true,
    'scorecard_complete', match_row.scorecard_complete, 'updated_at', transition_at,
    'official_points_active', false, 'scorecard_archive', archive_result,
    'permission_transition', jsonb_build_object('before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (
    target_match, mutation_identity, 'REOPEN', payload_hash_value,
    match_row.match_revision, next_revision, result_value, actor
  );
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (
    target_match, mutation_identity, 'MATCH_REOPENED', match_row.match_revision,
    next_revision,
    jsonb_build_object('match', to_jsonb(match_row), 'permissions', before_permissions),
    jsonb_build_object('match', to_jsonb(next_match_row), 'permissions', after_permissions), actor
  );
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
    values ('2026', target_match, mutation_identity, 'MATCH_REOPENED', actor, result_value);
  insert into scoring_authority.google_outbox_events (
    tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash
  ) values ('2026', target_match, next_revision, mutation_identity, 'MATCH_REOPENED', result_value, payload_hash_value);
  return result_value;
end;
$$;

create or replace function public.read_production_scoring_authority(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  target_match text := input->>'match_id';
  mode text := upper(coalesce(input->>'mode', 'DIAGNOSTICS'));
  payload jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  if mode = 'MATCH' then
    select to_jsonb(match_value) into payload
    from scoring_authority.matches match_value
    where match_id = target_match and tournament_id = '2026';
  elsif mode = 'SCORECARD' then
    select jsonb_build_object(
      'match', to_jsonb(match_value),
      'holes', coalesce((select jsonb_agg(to_jsonb(hole) order by hole_number)
        from scoring_authority.hole_scores hole where hole.match_id = match_value.match_id), '[]'::jsonb)
    ) into payload
    from scoring_authority.matches match_value
    where match_id = target_match and tournament_id = '2026';
  elsif mode = 'CURRENT_STATE' then
    select jsonb_build_object(
      'matches', coalesce((select jsonb_agg(to_jsonb(match_value) order by round_number, match_id)
        from scoring_authority.matches match_value where tournament_id = '2026'), '[]'::jsonb),
      'holes', coalesce((select jsonb_agg(to_jsonb(hole) order by hole.match_id, hole.hole_number)
        from scoring_authority.hole_scores hole join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = '2026'), '[]'::jsonb),
      'players', coalesce((select jsonb_agg(to_jsonb(player) order by player_id)
        from scoring_authority.tournament_players player where tournament_id = '2026'), '[]'::jsonb),
      'snapshots', coalesce((select jsonb_agg(to_jsonb(snapshot) order by match_id)
        from scoring_authority.scoring_snapshots snapshot where tournament_id = '2026'), '[]'::jsonb),
      'permissions', coalesce((select jsonb_agg(to_jsonb(permission) order by match_id, player_id)
        from scoring_authority.scoring_permissions permission join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = '2026'), '[]'::jsonb),
      'checkpoints', coalesce((select jsonb_agg(to_jsonb(checkpoint) order by match_id)
        from scoring_authority.google_match_checkpoints checkpoint join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = '2026'), '[]'::jsonb)
    ) into payload;
  elsif mode = 'DIAGNOSTICS' then
    select jsonb_build_object(
      'matches', (select count(*) from scoring_authority.matches where tournament_id = '2026'),
      'holes', (select count(*) from scoring_authority.hole_scores hole join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = '2026'),
      'permissions', (select count(*) from scoring_authority.scoring_permissions permission join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = '2026'),
      'pending_outbox', (select count(*) from scoring_authority.google_outbox_events where tournament_id = '2026' and status <> 'DELIVERED'),
      'authority', (select scoring_authority from scoring_authority.tournaments where tournament_id = '2026'),
      'ingress', (select to_jsonb(gate) from scoring_authority.ingress_gates gate where tournament_id = '2026')
    ) into payload;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_READ_MODE');
  end if;
  return jsonb_build_object('ok', true, 'mode', mode, 'data', payload);
end;
$$;

create or replace function public.read_production_scoring_participant_context(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth
as $$
declare
  target_match text := input->>'match_id';
  actor text := input->>'player_id';
  actor_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
  participant_role text := upper(coalesce(input->>'role', 'PLAYER'));
  supplied_permission_revision bigint := coalesce((input->>'permission_revision')::bigint, -1);
  match_row scoring_authority.matches%rowtype;
  permission_ok boolean := false;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026';
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if actor_auth_user is not null
     and input->>'tournament_id' = '2026'
     and supplied_permission_revision = match_row.permission_revision
     and exists (
       select 1
       from participant_identity.user_player_links link
       join auth.users auth_user
         on auth_user.id = link.auth_user_id and auth_user.email_confirmed_at is not null
       join participant_identity.participant_auth_identifiers identifier
         on identifier.auth_user_id = link.auth_user_id
        and identifier.player_id = link.player_id
        and identifier.identifier_type = 'EMAIL'
        and identifier.status = 'VERIFIED'
       join participant_identity.tournament_roles tournament_role
         on tournament_role.tournament_id = '2026'
        and tournament_role.auth_user_id = link.auth_user_id
        and tournament_role.role = case when participant_role = 'DIRECTOR' then 'DIRECTOR' else 'PARTICIPANT' end
        and tournament_role.role_active
        and tournament_role.revoked_at is null
       join scoring_authority.tournament_players membership
         on membership.tournament_id = '2026'
        and membership.player_id = link.player_id
        and membership.participation_status = 'ACTIVE'
       where link.auth_user_id = actor_auth_user
         and link.player_id = actor
         and link.status = 'ACTIVE'
         and link.revoked_at is null
     )
     and (participant_role <> 'DIRECTOR' or exists (
       select 1 from production_control.director_entitlements entitlement
       where entitlement.auth_user_id = actor_auth_user
         and entitlement.tournament_id = '2026'
         and entitlement.player_id = actor
         and entitlement.role in ('DIRECTOR', 'OWNER')
         and entitlement.status = 'ACTIVE'
         and entitlement.revoked_at is null
     )) then
    if participant_role = 'PLAYER' then
      select exists (select 1 from scoring_authority.scoring_permissions
        where match_id = target_match and player_id = actor and can_score
          and revoked_at is null and permission_revision = match_row.permission_revision)
        into permission_ok;
    elsif participant_role = 'DIRECTOR' then
      permission_ok := true;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'match', to_jsonb(match_row),
    'holes', coalesce((select jsonb_agg(to_jsonb(hole) order by hole_number)
      from scoring_authority.hole_scores hole where hole.match_id = target_match), '[]'::jsonb),
    'authorization', jsonb_build_object(
      'verified', permission_ok,
      'writable', permission_ok and match_row.status <> 'FINAL' and not match_row.scoring_locked,
      'permission_revision', match_row.permission_revision
    )
  ));
end;
$$;

create or replace function public.submit_production_hole_score(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  match_row scoring_authority.matches%rowtype;
  hole_row scoring_authority.hole_scores%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  permission_row scoring_authority.scoring_permissions%rowtype;
  target_match text := input->>'match_id';
  target_hole integer := nullif(input->>'hole_number', '')::integer;
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  actor_role text := upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  team_1_gross jsonb := input->'team_1_gross_scores';
  team_2_gross jsonb := input->'team_2_gross_scores';
  expected_match bigint := coalesce(nullif(input->>'expected_match_revision', '')::bigint, -1);
  expected_hole bigint := coalesce(nullif(input->>'expected_hole_revision', '')::bigint, -1);
  expected_count integer;
  current_hole_revision bigint := 0;
  hole_exists boolean := false;
  next_hole_revision bigint;
  next_match_revision bigint;
  stroke_index_value integer;
  team_1_strokes jsonb;
  team_2_strokes jsonb;
  team_1_net integer;
  team_2_net integer;
  winner text;
  progress jsonb;
  before_state jsonb;
  payload_hash_value text;
  result_value jsonb;
  transition_at timestamptz := clock_timestamp();
begin
  perform production_control.assert_production_scoring_runtime(input);
  perform production_control.assert_production_scoring_actor(input, false);
  if coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if actor_role = 'PLAYER' then
    select * into permission_row from scoring_authority.scoring_permissions
      where match_id = target_match and player_id = actor;
    if not found or not permission_row.can_score or permission_row.revoked_at is not null then
      return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
    end if;
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> permission_row.permission_revision
       or permission_row.permission_revision <> match_row.permission_revision then
      return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
        'current_permission_revision', match_row.permission_revision);
    end if;
  elsif actor_role = 'DIRECTOR' then
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> match_row.permission_revision then
      return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
        'current_permission_revision', match_row.permission_revision);
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(jsonb_build_object(
    'match_id', target_match, 'hole_number', target_hole,
    'team_1_gross_scores', team_1_gross, 'team_2_gross_scores', team_2_gross,
    'actor_id', actor
  ));
  select * into mutation_row from scoring_authority.score_mutations
    where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || jsonb_build_object('idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if match_row.scoring_locked then return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if match_row.status = 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if target_hole not between 1 and 18 then return jsonb_build_object('ok', false, 'code', 'INVALID_HOLE'); end if;
  if expected_match <> match_row.match_revision then
    return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  select * into hole_row from scoring_authority.hole_scores
    where match_id = target_match and hole_number = target_hole;
  hole_exists := found;
  if hole_exists then current_hole_revision := hole_row.hole_revision; end if;
  if expected_hole <> current_hole_revision then
    return jsonb_build_object('ok', false, 'code', 'HOLE_REVISION_CONFLICT',
      'current_hole_revision', current_hole_revision);
  end if;
  expected_count := case when match_row.format = 'BB' then 2 else 1 end;
  if not scoring_authority.valid_gross_scores(team_1_gross, expected_count)
     or not scoring_authority.valid_gross_scores(team_2_gross, expected_count) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_GROSS_SCORES');
  end if;
  if hole_exists and hole_row.team_1_gross_scores = team_1_gross
     and hole_row.team_2_gross_scores = team_2_gross then
    progress := scoring_authority.match_progress(target_match, match_row.format);
    return jsonb_build_object('ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'idempotent', true, 'match_id', target_match, 'hole_number', target_hole,
      'hole_revision', hole_row.hole_revision, 'match_revision', match_row.match_revision,
      'updated_at', hole_row.updated_at, 'match', progress,
      'audit_created', false, 'google_outbox_created', false);
  end if;
  select stroke_index into stroke_index_value from scoring_authority.match_holes
    where match_id = target_match and hole_number = target_hole;
  if stroke_index_value is null then return jsonb_build_object('ok', false, 'code', 'INVALID_SCORING_SNAPSHOT'); end if;
  if match_row.format = 'SC' then
    select jsonb_build_array(scoring_authority.strokes_on_hole((snapshot.team_configuration->>'team_1_strokes')::integer, stroke_index_value)),
      jsonb_build_array(scoring_authority.strokes_on_hole((snapshot.team_configuration->>'team_2_strokes')::integer, stroke_index_value))
      into team_1_strokes, team_2_strokes
    from scoring_authority.scoring_snapshots snapshot
    where snapshot_id = match_row.scoring_snapshot_id;
  else
    select jsonb_agg(scoring_authority.strokes_on_hole(participant.final_strokes, stroke_index_value) order by participant.player_slot)
      into team_1_strokes from scoring_authority.match_participants participant
      where match_id = target_match and team_side = 1;
    select jsonb_agg(scoring_authority.strokes_on_hole(participant.final_strokes, stroke_index_value) order by participant.player_slot)
      into team_2_strokes from scoring_authority.match_participants participant
      where match_id = target_match and team_side = 2;
  end if;
  if match_row.format = 'BB' then
    select min(gross::integer - stroke::integer) into team_1_net
    from jsonb_array_elements_text(team_1_gross) with ordinality g(gross, n)
    join jsonb_array_elements_text(team_1_strokes) with ordinality s(stroke, n2) on n = n2;
    select min(gross::integer - stroke::integer) into team_2_net
    from jsonb_array_elements_text(team_2_gross) with ordinality g(gross, n)
    join jsonb_array_elements_text(team_2_strokes) with ordinality s(stroke, n2) on n = n2;
  else
    team_1_net := (team_1_gross->>0)::integer - (team_1_strokes->>0)::integer;
    team_2_net := (team_2_gross->>0)::integer - (team_2_strokes->>0)::integer;
  end if;
  winner := case when team_1_net = team_2_net then 'Halved'
    when team_1_net < team_2_net then 'Team 1' else 'Team 2' end;
  before_state := case when current_hole_revision = 0 then '{}'::jsonb else to_jsonb(hole_row) end;
  next_hole_revision := current_hole_revision + 1;
  next_match_revision := match_row.match_revision + 1;
  insert into scoring_authority.hole_scores (
    match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
    team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
    hole_winner, mutation_key, actor_id
  ) values (
    target_match, target_hole, next_hole_revision, team_1_gross, team_2_gross,
    team_1_strokes, team_2_strokes, team_1_net, team_2_net, winner, mutation_identity, actor
  ) on conflict (match_id, hole_number) do update set
    hole_revision = excluded.hole_revision,
    team_1_gross_scores = excluded.team_1_gross_scores,
    team_2_gross_scores = excluded.team_2_gross_scores,
    team_1_strokes = excluded.team_1_strokes,
    team_2_strokes = excluded.team_2_strokes,
    team_1_net_score = excluded.team_1_net_score,
    team_2_net_score = excluded.team_2_net_score,
    hole_winner = excluded.hole_winner,
    mutation_key = excluded.mutation_key,
    actor_id = excluded.actor_id,
    updated_at = transition_at;
  progress := scoring_authority.match_progress(target_match, match_row.format);
  update scoring_authority.matches set
    match_revision = next_match_revision,
    scored_holes = (progress->>'scored_holes')::integer,
    current_hole = (progress->>'current_hole')::integer,
    holes_remaining = (progress->>'holes_remaining')::integer,
    team_1_holes_won = (progress->>'team_1_holes_won')::integer,
    team_2_holes_won = (progress->>'team_2_holes_won')::integer,
    running_result = progress->>'running_result',
    result_winner = progress->>'result_winner',
    clinched = (progress->>'clinched')::boolean,
    scorecard_complete = (progress->>'scorecard_complete')::boolean,
    authority_updated_at = transition_at,
    updated_at = transition_at
  where match_id = target_match;
  result_value := jsonb_build_object(
    'ok', true, 'code', 'ACCEPTED', 'match_id', target_match,
    'google_target_match_id', target_match, 'hole_number', target_hole,
    'hole_revision', next_hole_revision, 'match_revision', next_match_revision,
    'permission_revision', match_row.permission_revision, 'updated_at', transition_at,
    'gross', jsonb_build_object('team_1', team_1_gross, 'team_2', team_2_gross),
    'strokes', jsonb_build_object('team_1', team_1_strokes, 'team_2', team_2_strokes),
    'net', jsonb_build_object('team_1', team_1_net, 'team_2', team_2_net),
    'hole_winner', winner, 'match', progress,
    'audit_created', true, 'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, hole_number, payload_hash,
    previous_match_revision, next_match_revision, previous_hole_revision,
    next_hole_revision, result, actor_id
  ) values (
    target_match, mutation_identity, 'HOLE_SCORE', target_hole, payload_hash_value,
    match_row.match_revision, next_match_revision, current_hole_revision,
    next_hole_revision, result_value, actor
  );
  insert into scoring_authority.score_revision_history (
    match_id, hole_number, mutation_key, action, previous_match_revision,
    next_match_revision, previous_hole_revision, next_hole_revision,
    before_state, after_state, actor_id
  ) values (
    target_match, target_hole, mutation_identity, 'HOLE_SCORE_UPSERTED',
    match_row.match_revision, next_match_revision, current_hole_revision,
    next_hole_revision, before_state, result_value, actor
  );
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
    values ('2026', target_match, mutation_identity, 'HOLE_SCORE_UPSERTED', actor, result_value);
  insert into scoring_authority.google_outbox_events (
    tournament_id, match_id, match_revision, hole_number, hole_revision,
    mutation_key, event_type, payload, payload_hash
  ) values (
    '2026', target_match, next_match_revision, target_hole, next_hole_revision,
    mutation_identity, 'HOLE_SCORE_UPSERTED', result_value, payload_hash_value
  );
  return result_value;
end;
$$;

create or replace function public.claim_production_scorecard_archive_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  worker text := left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
  token uuid := extensions.gen_random_uuid();
  lease integer := greatest(15, least(coalesce((input->>'lease_seconds')::integer, 60), 300));
begin
  perform production_control.assert_production_scoring_runtime(input, 'ROUND_SCORECARDS_ARCHIVE');
  if worker = '' then return jsonb_build_object('ok', false, 'code', 'WORKER_ID_REQUIRED'); end if;
  update scoring_authority.scorecard_archive_jobs older set
    status = 'SUPERSEDED', lease_expires_at = null, claimed_by = null,
    claim_token = null, updated_at = now()
  where older.tournament_id = '2026'
    and older.status in ('PENDING', 'RETRYABLE', 'PROCESSING')
    and (older.status <> 'PROCESSING' or older.lease_expires_at < now())
    and exists (select 1 from scoring_authority.scorecard_archive_jobs newer
      where newer.match_id = older.match_id and newer.match_revision > older.match_revision
        and newer.status in ('PENDING', 'RETRYABLE', 'PROCESSING', 'VERIFIED'));
  select * into job_row from scoring_authority.scorecard_archive_jobs job
  where job.tournament_id = '2026'
    and (job.status in ('PENDING', 'RETRYABLE')
      or (job.status = 'PROCESSING' and job.lease_expires_at < now()))
    and job.available_at <= now()
    and not exists (select 1 from scoring_authority.scorecard_archive_jobs newer
      where newer.match_id = job.match_id and newer.match_revision > job.match_revision
        and newer.status in ('PENDING', 'RETRYABLE', 'PROCESSING', 'VERIFIED'))
  order by job.available_at, job.created_at, job.match_id
  for update skip locked limit 1;
  if not found then return jsonb_build_object('ok', true, 'job', null); end if;
  update scoring_authority.scorecard_archive_jobs set
    status = 'PROCESSING', attempts = attempts + 1, claimed_by = worker,
    claim_token = token, lease_expires_at = now() + make_interval(secs => lease),
    updated_at = now()
  where job_id = job_row.job_id returning * into job_row;
  return jsonb_build_object(
    'ok', true,
    'job', to_jsonb(job_row) || jsonb_build_object('id', job_row.job_id),
    'snapshot', (select to_jsonb(snapshot) from scoring_authority.finalized_scorecard_snapshots snapshot
      where snapshot.snapshot_id = job_row.snapshot_id),
    'checkpoint', (select to_jsonb(checkpoint) from scoring_authority.scorecard_archive_checkpoints checkpoint
      where checkpoint.match_id = job_row.match_id)
  );
end;
$$;

create or replace function public.complete_production_scorecard_archive_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  match_row scoring_authority.matches%rowtype;
  snapshot_row scoring_authority.finalized_scorecard_snapshots%rowtype;
  newer_job scoring_authority.scorecard_archive_jobs%rowtype;
  requested_status text := upper(coalesce(input->>'verified_status', ''));
begin
  perform production_control.assert_production_scoring_runtime(input, 'ROUND_SCORECARDS_ARCHIVE');
  select * into job_row from scoring_authority.scorecard_archive_jobs
    where job_id = nullif(input->>'job_id', '')::uuid and tournament_id = '2026' for update;
  if not found or job_row.status <> 'PROCESSING'
     or job_row.claim_token <> nullif(input->>'claim_token', '')::uuid
     or job_row.claimed_by <> left(coalesce(input->>'worker_id', ''), 160)
     or job_row.lease_expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_CLAIM_STALE');
  end if;
  select * into newer_job from scoring_authority.scorecard_archive_jobs
    where match_id = job_row.match_id and match_revision > job_row.match_revision
    order by match_revision desc limit 1;
  if found then
    update scoring_authority.scorecard_archive_jobs set
      status = 'SUPERSEDED', claim_token = null, claimed_by = null,
      lease_expires_at = null, updated_at = now() where job_id = job_row.job_id;
    update scoring_authority.scorecard_archive_jobs set
      status = 'RETRYABLE', available_at = now(), verified_at = null, updated_at = now()
      where job_id = newer_job.job_id and status in ('VERIFIED', 'PENDING', 'RETRYABLE');
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_STALE_WORKER_REQUEUED');
  end if;
  select * into match_row from scoring_authority.matches where match_id = job_row.match_id;
  select * into snapshot_row from scoring_authority.finalized_scorecard_snapshots where snapshot_id = job_row.snapshot_id;
  if snapshot_row.snapshot_id is null
     or coalesce(input->>'source_fingerprint', '') <> job_row.source_fingerprint
     or coalesce(input->>'archive_payload_hash', '') <> job_row.archive_payload_hash
     or coalesce((input->>'snapshot_revision')::bigint, -1) <> job_row.snapshot_revision
     or coalesce((input->>'finalized_match_revision')::bigint, -1) <> job_row.match_revision
     or coalesce(input->>'google_readback_hash', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(input->'expected_logical_identities', 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(input->'google_row_numbers', 'null'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_CHECKPOINT_PAYLOAD_INVALID');
  end if;
  if (job_row.event_type = 'SCORECARD_ARCHIVE_UPSERT'
      and (match_row.status <> 'FINAL' or snapshot_row.state <> 'CURRENT' or requested_status <> 'VERIFIED'))
     or (job_row.event_type = 'SCORECARD_ARCHIVE_INVALIDATE'
      and (match_row.status = 'FINAL' or requested_status <> 'INVALIDATED')) then
    update scoring_authority.scorecard_archive_jobs set
      status = 'SUPERSEDED', claim_token = null, claimed_by = null,
      lease_expires_at = null, updated_at = now() where job_id = job_row.job_id;
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_LIFECYCLE_SUPERSEDED');
  end if;
  update scoring_authority.scorecard_archive_jobs set
    status = 'VERIFIED', verified_at = now(), claim_token = null, claimed_by = null,
    lease_expires_at = null, last_error_code = null, last_error_safe = null, updated_at = now()
  where job_id = job_row.job_id;
  insert into scoring_authority.scorecard_archive_checkpoints (
    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,
    finalized_match_revision, source_fingerprint, archive_payload_hash,
    expected_logical_identities, google_row_numbers, google_readback_hash,
    status, last_job_id, last_error_code, last_error_safe, verified_at
  ) values (
    job_row.match_id, '2026', job_row.snapshot_id, job_row.snapshot_revision,
    job_row.match_revision, job_row.source_fingerprint, job_row.archive_payload_hash,
    input->'expected_logical_identities', input->'google_row_numbers', input->>'google_readback_hash',
    requested_status, job_row.job_id, null, null, now()
  ) on conflict (match_id) do update set
    tournament_id = excluded.tournament_id,
    current_snapshot_id = excluded.current_snapshot_id,
    finalized_snapshot_revision = excluded.finalized_snapshot_revision,
    finalized_match_revision = excluded.finalized_match_revision,
    source_fingerprint = excluded.source_fingerprint,
    archive_payload_hash = excluded.archive_payload_hash,
    expected_logical_identities = excluded.expected_logical_identities,
    google_row_numbers = excluded.google_row_numbers,
    google_readback_hash = excluded.google_readback_hash,
    status = excluded.status, last_job_id = excluded.last_job_id,
    last_error_code = null, last_error_safe = null,
    verified_at = excluded.verified_at, updated_at = now();
  return jsonb_build_object('ok', true, 'checkpoint',
    (select to_jsonb(checkpoint) from scoring_authority.scorecard_archive_checkpoints checkpoint
      where checkpoint.match_id = job_row.match_id));
end;
$$;

create or replace function public.fail_production_scorecard_archive_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  delay_seconds integer := greatest(2, least(coalesce((input->>'retry_after_seconds')::integer, 30), 3600));
  blocked boolean := coalesce((input->>'block')::boolean, false);
begin
  perform production_control.assert_production_scoring_runtime(input, 'ROUND_SCORECARDS_ARCHIVE');
  select * into job_row from scoring_authority.scorecard_archive_jobs
    where job_id = nullif(input->>'job_id', '')::uuid and tournament_id = '2026' for update;
  if not found or job_row.status <> 'PROCESSING'
     or job_row.claim_token <> nullif(input->>'claim_token', '')::uuid
     or job_row.claimed_by <> left(coalesce(input->>'worker_id', ''), 160)
     or job_row.lease_expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_CLAIM_STALE');
  end if;
  update scoring_authority.scorecard_archive_jobs set
    status = case when blocked then 'BLOCKED' else 'RETRYABLE' end,
    available_at = now() + make_interval(secs => delay_seconds), lease_expires_at = null,
    claimed_by = null, claim_token = null,
    last_error_code = left(coalesce(input->>'error_code', 'ARCHIVE_DELIVERY_FAILED'), 120),
    last_error_safe = left(coalesce(input->>'error_safe', 'Round Scorecards archive delivery failed.'), 500),
    updated_at = now()
  where job_id = job_row.job_id;
  update scoring_authority.scorecard_archive_checkpoints set
    status = 'FAILED', last_job_id = job_row.job_id,
    last_error_code = left(coalesce(input->>'error_code', 'ARCHIVE_DELIVERY_FAILED'), 120),
    last_error_safe = left(coalesce(input->>'error_safe', 'Round Scorecards archive delivery failed.'), 500),
    updated_at = now()
  where match_id = job_row.match_id and finalized_match_revision <= job_row.match_revision;
  return jsonb_build_object('ok', true,
    'status', case when blocked then 'BLOCKED' else 'RETRYABLE' end);
end;
$$;

create or replace function public.inspect_production_scorecard_archive_state(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  return jsonb_build_object(
    'ok', true, 'tournament_id', '2026',
    'snapshots', coalesce((select jsonb_agg(to_jsonb(snapshot) order by match_id, snapshot_revision)
      from scoring_authority.finalized_scorecard_snapshots snapshot where tournament_id = '2026'), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(job) - 'claim_token' order by created_at, match_id)
      from scoring_authority.scorecard_archive_jobs job where tournament_id = '2026'), '[]'::jsonb),
    'checkpoints', coalesce((select jsonb_agg(to_jsonb(checkpoint) order by match_id)
      from scoring_authority.scorecard_archive_checkpoints checkpoint where tournament_id = '2026'), '[]'::jsonb)
  );
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'production_control.assert_production_scoring_runtime(jsonb,text)',
    'production_control.assert_production_scoring_actor(jsonb,boolean)',
    'public.read_production_scoring_authority(jsonb)',
    'public.read_production_scoring_participant_context(jsonb)',
    'public.submit_production_hole_score(jsonb)',
    'public.mutate_production_match_control(jsonb)',
    'public.finalize_production_match(jsonb)',
    'public.reopen_production_match(jsonb)',
    'public.claim_production_google_outbox(jsonb)',
    'public.claim_production_google_outbox_event(jsonb)',
    'public.complete_production_google_outbox(jsonb)',
    'public.fail_production_google_outbox(jsonb)',
    'public.inspect_production_scoring_workers(jsonb)',
    'public.claim_production_scorecard_archive_job(jsonb)',
    'public.complete_production_scorecard_archive_job(jsonb)',
    'public.fail_production_scorecard_archive_job(jsonb)',
    'public.inspect_production_scorecard_archive_state(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', signature);
  end loop;
end
$$;

grant execute on function public.read_production_scoring_authority(jsonb) to service_role;
grant execute on function public.read_production_scoring_participant_context(jsonb) to service_role;
grant execute on function public.submit_production_hole_score(jsonb) to service_role;
grant execute on function public.mutate_production_match_control(jsonb) to service_role;
grant execute on function public.finalize_production_match(jsonb) to service_role;
grant execute on function public.reopen_production_match(jsonb) to service_role;
grant execute on function public.claim_production_google_outbox(jsonb) to service_role;
grant execute on function public.claim_production_google_outbox_event(jsonb) to service_role;
grant execute on function public.complete_production_google_outbox(jsonb) to service_role;
grant execute on function public.fail_production_google_outbox(jsonb) to service_role;
grant execute on function public.inspect_production_scoring_workers(jsonb) to service_role;
grant execute on function public.claim_production_scorecard_archive_job(jsonb) to service_role;
grant execute on function public.complete_production_scorecard_archive_job(jsonb) to service_role;
grant execute on function public.fail_production_scorecard_archive_job(jsonb) to service_role;
grant execute on function public.inspect_production_scorecard_archive_state(jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
