-- Phase 2 Preview authority: make lifecycle locks and participant permissions
-- one versioned state transition, and provide an audited one-time parity repair.

create or replace function public.finalize_match_authoritative_phase2_inner(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  next_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  transition_at timestamptz := clock_timestamp();
  rehearsal boolean := coalesce((input->>'rehearsal')::boolean, false);
  gate_authority text;
begin
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select authority into gate_authority from scoring_authority.ingress_gates where tournament_id = match_row.tournament_id;
  if not rehearsal and gate_authority <> 'SUPABASE' then return jsonb_build_object('ok', false, 'code', 'SUPABASE_NOT_AUTHORITY'); end if;
  payload_hash_value := encode(digest(jsonb_build_object('match_id', target_match, 'action', 'FINALIZE', 'actor_id', actor)::text, 'sha256'), 'hex');
  select * into mutation_row from scoring_authority.score_mutations where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then return mutation_row.result || jsonb_build_object('idempotent', true); end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true or input#>>'{authorization,match_id}' <> target_match then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if match_row.status = 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if match_row.scoring_locked then return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if expected_match <> match_row.match_revision then return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision); end if;
  if match_row.scored_holes <> 18 or not match_row.scorecard_complete then return jsonb_build_object('ok', false, 'code', 'SCORECARD_INCOMPLETE', 'scored_holes', match_row.scored_holes); end if;
  if match_row.unresolved_mutations > 0 then return jsonb_build_object('ok', false, 'code', 'UNRESOLVED_MUTATIONS'); end if;
  if match_row.result_winner = '' then return jsonb_build_object('ok', false, 'code', 'RESULT_UNAVAILABLE'); end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.player_id), '[]'::jsonb)
    into before_permissions from scoring_authority.scoring_permissions p where p.match_id = target_match;
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

  select coalesce(jsonb_agg(to_jsonb(p) order by p.player_id), '[]'::jsonb)
    into after_permissions from scoring_authority.scoring_permissions p where p.match_id = target_match;

  result_value := jsonb_build_object(
    'ok', true, 'code', 'FINALIZED', 'match_id', target_match,
    'match_revision', next_revision, 'permission_revision', next_permission_revision,
    'previous_permission_revision', match_row.permission_revision,
    'scoring_locked', true, 'access_active', false,
    'result_winner', match_row.result_winner, 'scorecard_complete', true,
    'scored_holes', 18, 'updated_at', transition_at,
    'permission_transition', jsonb_build_object('before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id)
  values (target_match, mutation_identity, 'FINALIZE', payload_hash_value, match_row.match_revision, next_revision, result_value, actor);
  insert into scoring_authority.score_revision_history (match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id)
  values (target_match, mutation_identity, 'MATCH_FINALIZED', match_row.match_revision, next_revision,
    jsonb_build_object('match', to_jsonb(match_row), 'permissions', before_permissions),
    jsonb_build_object('match', to_jsonb(next_match_row), 'permissions', after_permissions), actor);
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (match_row.tournament_id, target_match, mutation_identity, 'MATCH_FINALIZED', actor, result_value);
  insert into scoring_authority.google_outbox_events (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)
  values (match_row.tournament_id, target_match, next_revision, mutation_identity, 'MATCH_FINALIZED', result_value, payload_hash_value);
  return result_value;
end;
$$;

create or replace function public.reopen_match_authoritative_phase2_inner(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  next_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  transition_at timestamptz := clock_timestamp();
  rehearsal boolean := coalesce((input->>'rehearsal')::boolean, false);
  gate_authority text;
begin
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select authority into gate_authority from scoring_authority.ingress_gates where tournament_id = match_row.tournament_id;
  if not rehearsal and gate_authority <> 'SUPABASE' then return jsonb_build_object('ok', false, 'code', 'SUPABASE_NOT_AUTHORITY'); end if;
  if upper(coalesce(input#>>'{authorization,role}', '')) <> 'DIRECTOR' or coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  payload_hash_value := encode(digest(jsonb_build_object('match_id', target_match, 'action', 'REOPEN', 'actor_id', actor)::text, 'sha256'), 'hex');
  select * into mutation_row from scoring_authority.score_mutations where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then return mutation_row.result || jsonb_build_object('idempotent', true); end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if match_row.status <> 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FINAL'); end if;
  if expected_match <> match_row.match_revision then return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision); end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.player_id), '[]'::jsonb)
    into before_permissions from scoring_authority.scoring_permissions p where p.match_id = target_match;
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

  select coalesce(jsonb_agg(to_jsonb(p) order by p.player_id), '[]'::jsonb)
    into after_permissions from scoring_authority.scoring_permissions p where p.match_id = target_match;

  result_value := jsonb_build_object(
    'ok', true, 'code', 'REOPENED', 'match_id', target_match,
    'match_revision', next_revision, 'permission_revision', next_permission_revision,
    'previous_permission_revision', match_row.permission_revision,
    'scoring_locked', false, 'access_active', true,
    'scorecard_complete', match_row.scorecard_complete, 'updated_at', transition_at,
    'permission_transition', jsonb_build_object('before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id)
  values (target_match, mutation_identity, 'REOPEN', payload_hash_value, match_row.match_revision, next_revision, result_value, actor);
  insert into scoring_authority.score_revision_history (match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id)
  values (target_match, mutation_identity, 'MATCH_REOPENED', match_row.match_revision, next_revision,
    jsonb_build_object('match', to_jsonb(match_row), 'permissions', before_permissions),
    jsonb_build_object('match', to_jsonb(next_match_row), 'permissions', after_permissions), actor);
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (match_row.tournament_id, target_match, mutation_identity, 'MATCH_REOPENED', actor, result_value);
  insert into scoring_authority.google_outbox_events (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)
  values (match_row.tournament_id, target_match, next_revision, mutation_identity, 'MATCH_REOPENED', result_value, payload_hash_value);
  return result_value;
end;
$$;

create or replace function public.repair_preview_finalization_parity(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  target_match text := input->>'match_id';
  actor text := input->>'actor_id';
  repair_key text := input->>'repair_key';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  next_permission_revision bigint;
  before_permissions jsonb;
  after_permissions jsonb;
  repaired_at timestamptz := clock_timestamp();
  already_canonical boolean;
begin
  if upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
     or coalesce((input->>'director_authorized')::boolean, false) is not true
     or coalesce(actor, '') = '' or coalesce(repair_key, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if match_row.tournament_id <> coalesce(input->>'tournament_id', '')
     or not exists (select 1 from scoring_authority.ingress_gates g where g.tournament_id = match_row.tournament_id and g.authority = 'SUPABASE') then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_AUTHORITY_REQUIRED');
  end if;
  if match_row.status <> 'FINAL' or not match_row.scoring_locked then
    return jsonb_build_object('ok', false, 'code', 'FINAL_LOCK_REQUIRED');
  end if;
  if expected_match <> match_row.match_revision then
    return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision);
  end if;

  select not exists (
    select 1 from scoring_authority.scoring_permissions p
    where p.match_id = target_match and (p.can_score or p.revoked_at is null or p.permission_revision <> match_row.permission_revision)
  ) into already_canonical;
  if already_canonical then
    return jsonb_build_object('ok', true, 'code', 'FINALIZATION_PARITY_ALREADY_CANONICAL', 'idempotent', true,
      'match_id', target_match, 'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision, 'scoring_locked', true, 'access_active', false);
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.player_id), '[]'::jsonb)
    into before_permissions from scoring_authority.scoring_permissions p where p.match_id = target_match;
  next_permission_revision := match_row.permission_revision + 1;
  update scoring_authority.matches set permission_revision = next_permission_revision,
    authority_updated_at = repaired_at, updated_at = repaired_at
  where match_id = target_match returning * into next_match_row;
  update scoring_authority.scoring_permissions set can_score = false,
    permission_revision = next_permission_revision, revoked_at = repaired_at, updated_at = repaired_at
  where match_id = target_match;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.player_id), '[]'::jsonb)
    into after_permissions from scoring_authority.scoring_permissions p where p.match_id = target_match;

  insert into scoring_authority.score_revision_history (match_id, mutation_key, action,
    previous_match_revision, next_match_revision, before_state, after_state, actor_id)
  values (target_match, repair_key, 'FINALIZATION_PERMISSION_REPAIRED', match_row.match_revision, match_row.match_revision,
    jsonb_build_object('match', to_jsonb(match_row), 'permissions', before_permissions),
    jsonb_build_object('match', to_jsonb(next_match_row), 'permissions', after_permissions), actor)
  on conflict (match_id, mutation_key) do nothing;
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (match_row.tournament_id, target_match, repair_key, 'FINALIZATION_PERMISSION_REPAIRED', actor,
    jsonb_build_object('match_revision_unchanged', match_row.match_revision,
      'previous_permission_revision', match_row.permission_revision,
      'permission_revision', next_permission_revision, 'permissions', after_permissions));
  return jsonb_build_object('ok', true, 'code', 'FINALIZATION_PARITY_REPAIRED', 'idempotent', false,
    'match_id', target_match, 'match_revision', match_row.match_revision,
    'previous_permission_revision', match_row.permission_revision,
    'permission_revision', next_permission_revision, 'scoring_locked', true, 'access_active', false,
    'permissions', after_permissions);
end;
$$;

create or replace function public.complete_preview_finalization_parity_repair(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  checkpoint_row scoring_authority.google_match_checkpoints%rowtype;
  target_match text := input->>'match_id';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  actor text := input->>'actor_id';
begin
  if upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
     or coalesce((input->>'director_authorized')::boolean, false) is not true
     or coalesce(actor, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if match_row.status <> 'FINAL' or not match_row.scoring_locked or match_row.match_revision <> expected_match then
    return jsonb_build_object('ok', false, 'code', 'FINAL_STATE_CHANGED');
  end if;
  if exists (select 1 from scoring_authority.google_outbox_events where match_id = target_match and status <> 'DELIVERED') then
    return jsonb_build_object('ok', false, 'code', 'GOOGLE_OUTBOX_NOT_DRAINED');
  end if;
  select * into checkpoint_row from scoring_authority.google_match_checkpoints where match_id = target_match for update;
  if not found or checkpoint_row.last_supabase_match_revision <> match_row.match_revision then
    return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_ORDER_CONFLICT');
  end if;
  update scoring_authority.google_match_checkpoints set
    google_match_updated_at = nullif(input->>'google_match_updated_at', '')::timestamptz,
    google_match_revision = coalesce((input->>'google_match_revision')::bigint, google_match_revision),
    verified_fingerprint = input->>'verified_fingerprint', verified_at = now(), updated_at = now()
  where match_id = target_match returning * into checkpoint_row;
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (match_row.tournament_id, target_match, input->>'repair_key', 'FINALIZATION_PARITY_VERIFIED', actor,
    jsonb_build_object('match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'google_match_updated_at', input->>'google_match_updated_at'));
  return jsonb_build_object('ok', true, 'code', 'FINALIZATION_PARITY_VERIFIED', 'checkpoint', to_jsonb(checkpoint_row));
end;
$$;

revoke all on function public.finalize_match_authoritative_phase2_inner(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.reopen_match_authoritative_phase2_inner(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.repair_preview_finalization_parity(jsonb) from public, anon, authenticated;
revoke all on function public.complete_preview_finalization_parity_repair(jsonb) from public, anon, authenticated;
grant execute on function public.repair_preview_finalization_parity(jsonb) to service_role;
grant execute on function public.complete_preview_finalization_parity_repair(jsonb) to service_role;

notify pgrst, 'reload schema';
