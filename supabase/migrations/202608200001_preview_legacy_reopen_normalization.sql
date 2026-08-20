-- Preview-only Director operation for legacy Final-archive / mutable-reopen
-- conflicts. Google remains scoring authority; the verified workbook mutation
-- occurs first, then this transaction records the same lifecycle atomically in
-- canonical scoring state without replacing tournament history.

create or replace function public.normalize_preview_legacy_reopen(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  gate_row scoring_authority.ingress_gates%rowtype;
  lease_row scoring_authority.scoring_ingress_leases%rowtype;
  target_match text := btrim(coalesce(input->>'match_id', ''));
  actor text := btrim(coalesce(input->>'actor_id', ''));
  mutation_identity text := btrim(coalesce(input->>'mutation_key', ''));
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  expected_permission bigint := coalesce((input->>'expected_permission_revision')::bigint, -1);
  google_match_revision bigint := greatest(0, coalesce((input->>'google_match_revision')::bigint, 0));
  google_permission_revision bigint := coalesce((input->>'google_permission_revision')::bigint, -1);
  next_match_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  before_permissions jsonb;
  after_permissions jsonb;
  result_value jsonb;
  archive_result jsonb;
  transition_at timestamptz := clock_timestamp();
begin
  if upper(coalesce(input->>'environment', '')) <> 'PREVIEW'
     or coalesce((input->>'director_authorized')::boolean, false) is not true
     or coalesce((input->>'operator_intent_confirmed')::boolean, false) is not true
     or actor = '' or target_match = '' or mutation_identity = '' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_INTENT_REQUIRED');
  end if;
  if upper(coalesce(input->>'google_live_status', '')) <> 'REOPENED'
     or upper(coalesce(input->>'google_archive_status', '')) <> 'REOPENED'
     or coalesce((input->>'google_archive_result_inactive')::boolean, false) is not true
     or coalesce((input->>'google_holes_unchanged')::boolean, false) is not true
     or coalesce(input->>'verified_fingerprint', '') = '' then
    return jsonb_build_object('ok', false, 'code', 'GOOGLE_REOPEN_NOT_VERIFIED');
  end if;

  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select * into gate_row from scoring_authority.ingress_gates where tournament_id = match_row.tournament_id for update;
  if not found or gate_row.state <> 'OPEN' or gate_row.authority <> 'GOOGLE' or gate_row.active_epoch_id is not null then
    return jsonb_build_object('ok', false, 'code', 'GOOGLE_OPEN_INGRESS_REQUIRED');
  end if;
  select * into lease_row from scoring_authority.scoring_ingress_leases
  where lease_id = (input->>'lease_id')::uuid and tournament_id = match_row.tournament_id
    and match_id = target_match and authority = 'GOOGLE' and actor_id = actor and expires_at > now()
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_INGRESS_LEASE_REQUIRED'); end if;
  if exists (select 1 from scoring_authority.google_outbox_events
             where match_id = target_match and status <> 'DELIVERED') then
    return jsonb_build_object('ok', false, 'code', 'GOOGLE_OUTBOX_NOT_DRAINED');
  end if;
  if not exists (select 1 from scoring_authority.scoring_permissions where match_id = target_match) then
    return jsonb_build_object('ok', false, 'code', 'SCORING_PERMISSIONS_NOT_IMPORTED');
  end if;

  payload_hash_value := encode(digest(jsonb_build_object(
    'match_id', target_match, 'action', 'LEGACY_REOPEN_NORMALIZED', 'actor_id', actor,
    'google_match_revision', google_match_revision,
    'google_permission_revision', google_permission_revision,
    'verified_fingerprint', input->>'verified_fingerprint'
  )::text, 'sha256'), 'hex');
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || jsonb_build_object('idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if match_row.status not in ('LIVE', 'FINAL') then
    return jsonb_build_object('ok', false, 'code', 'LEGACY_REOPEN_STATE_REQUIRED', 'status', match_row.status);
  end if;
  if match_row.match_revision <> expected_match then
    return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision);
  end if;
  if match_row.permission_revision <> expected_permission
     or google_permission_revision <= match_row.permission_revision then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_REVISION_CONFLICT',
      'current_permission_revision', match_row.permission_revision);
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.player_id), '[]'::jsonb)
    into before_permissions from scoring_authority.scoring_permissions p where p.match_id = target_match;
  next_match_revision := greatest(match_row.match_revision + 1, google_match_revision);
  next_permission_revision := google_permission_revision;
  update scoring_authority.matches set
    status = 'LIVE', scoring_locked = false, match_revision = next_match_revision,
    permission_revision = next_permission_revision, finalized_at = null,
    source_google_revision = greatest(source_google_revision, google_match_revision),
    source_google_updated_at = nullif(input->>'google_match_updated_at', '')::timestamptz,
    authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match returning * into next_match_row;
  update scoring_authority.scoring_permissions set
    can_score = true, permission_revision = next_permission_revision,
    revoked_at = null, updated_at = transition_at
  where match_id = target_match;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.player_id), '[]'::jsonb)
    into after_permissions from scoring_authority.scoring_permissions p where p.match_id = target_match;

  -- A legacy split can already be LIVE in the canonical row, so the normal
  -- FINAL -> LIVE trigger may not fire. Explicit invalidation is idempotent.
  archive_result := scoring_authority.invalidate_finalized_scorecard_snapshot(
    target_match, next_match_revision, 'Legacy reopen normalization · ' || actor
  );
  result_value := jsonb_build_object(
    'ok', true, 'code', 'LEGACY_REOPEN_NORMALIZED', 'idempotent', false,
    'match_id', target_match, 'match_revision', next_match_revision,
    'permission_revision', next_permission_revision, 'status', 'LIVE',
    'scoring_locked', false, 'access_active', true,
    'hole_scores_preserved', true, 'google_verified', true,
    'google_outbox_created', false, 'archive', archive_result,
    'updated_at', transition_at
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (
    target_match, mutation_identity, 'REOPEN', payload_hash_value,
    match_row.match_revision, next_match_revision, result_value, actor
  );
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (
    target_match, mutation_identity, 'LEGACY_REOPEN_NORMALIZED', match_row.match_revision,
    next_match_revision,
    jsonb_build_object('match', to_jsonb(match_row), 'permissions', before_permissions),
    jsonb_build_object('match', to_jsonb(next_match_row), 'permissions', after_permissions,
      'google_verification', input - 'director_authorized'), actor
  );
  insert into scoring_authority.audit_events (
    tournament_id, match_id, mutation_key, action, actor_id, metadata
  ) values (
    match_row.tournament_id, target_match, mutation_identity,
    'LEGACY_REOPEN_NORMALIZED', actor, result_value || jsonb_build_object(
      'operator_intent_confirmed', true,
      'verified_fingerprint', input->>'verified_fingerprint'
    )
  );
  insert into scoring_authority.google_match_checkpoints (
    match_id, last_supabase_match_revision, google_match_updated_at,
    google_match_revision, google_hole_revisions, verified_fingerprint, verified_at
  ) values (
    target_match, next_match_revision,
    nullif(input->>'google_match_updated_at', '')::timestamptz,
    google_match_revision, coalesce(input->'google_hole_revisions', '{}'::jsonb),
    input->>'verified_fingerprint', transition_at
  ) on conflict (match_id) do update set
    last_supabase_match_revision = excluded.last_supabase_match_revision,
    google_match_updated_at = excluded.google_match_updated_at,
    google_match_revision = excluded.google_match_revision,
    google_hole_revisions = excluded.google_hole_revisions,
    verified_fingerprint = excluded.verified_fingerprint,
    verified_at = excluded.verified_at, updated_at = transition_at;
  return result_value;
end;
$$;

revoke all on function public.normalize_preview_legacy_reopen(jsonb) from public, anon, authenticated;
grant execute on function public.normalize_preview_legacy_reopen(jsonb) to service_role;

notify pgrst, 'reload schema';
