CREATE OR REPLACE FUNCTION public.submit_production_hole_score(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority', 'extensions'
AS $function$
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
$function$
