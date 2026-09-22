CREATE OR REPLACE FUNCTION public.finalize_production_match(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
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
$function$
;
