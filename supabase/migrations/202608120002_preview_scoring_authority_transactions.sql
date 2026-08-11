-- Phase 2 canonical Preview scoring transactions.
-- Service/server RPC only. Google remains the deployed authority until the
-- server-controlled authority flag and a committed epoch both select Supabase.

create or replace function scoring_authority.strokes_on_hole(total_strokes integer, stroke_index integer)
returns integer language sql immutable strict
as $$
  select case when total_strokes <= 0 or stroke_index not between 1 and 18 then 0
    else floor(total_strokes / 18.0)::integer +
      case when mod(total_strokes, 18) > 0 and stroke_index <= mod(total_strokes, 18) then 1 else 0 end
  end
$$;

create or replace function scoring_authority.valid_gross_scores(values_json jsonb, expected_count integer)
returns boolean language sql immutable
as $$
  select case when jsonb_typeof(values_json) = 'array' then
    jsonb_array_length(values_json) = expected_count and not exists (
      select 1 from jsonb_array_elements_text(values_json) value
      where value !~ '^[0-9]+$' or value::integer < 1 or value::integer > 20
    ) else false end
$$;

create or replace function scoring_authority.segment_winner(target_match text, first_hole integer, last_hole integer)
returns text language plpgsql stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare counted integer; team_1 integer; team_2 integer;
begin
  select count(*), count(*) filter (where hole_winner = 'Team 1'), count(*) filter (where hole_winner = 'Team 2')
  into counted, team_1, team_2 from scoring_authority.hole_scores
  where match_id = target_match and hole_number between first_hole and last_hole;
  if counted <> last_hole - first_hole + 1 then return ''; end if;
  return case when team_1 = team_2 then 'Halved' when team_1 > team_2 then 'Team 1' else 'Team 2' end;
end;
$$;

create or replace function scoring_authority.match_progress(target_match text, target_format text)
returns jsonb language plpgsql stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  scored integer := 0; current_hole_value integer := 0; team_1_wins integer := 0; team_2_wins integer := 0;
  holes_remaining_value integer := 18; difference integer := 0; status_text text := 'Scheduled'; result_value text := '';
  clinched_value boolean := false; complete_value boolean := false; contiguous boolean := false;
  clinch_hole integer; clinch_lead integer; clinch_team_1 integer; clinch_team_2 integer;
  front_winner text := ''; back_winner text := ''; overall_winner text := '';
  team_1_points numeric; team_2_points numeric;
begin
  select count(*), coalesce(max(hole_number), 0),
    count(*) filter (where hole_winner = 'Team 1'), count(*) filter (where hole_winner = 'Team 2')
  into scored, current_hole_value, team_1_wins, team_2_wins
  from scoring_authority.hole_scores where match_id = target_match;
  holes_remaining_value := greatest(0, 18 - current_hole_value);
  complete_value := scored = 18 and current_hole_value = 18;
  if current_hole_value > 0 then
    select coalesce(bool_and(existing.hole_number is not null), false) into contiguous
    from generate_series(1, current_hole_value) expected(hole_number)
    left join scoring_authority.hole_scores existing on existing.match_id = target_match and existing.hole_number = expected.hole_number;
  end if;
  difference := team_1_wins - team_2_wins;
  if scored > 0 then status_text := case when difference = 0 then 'All square through ' || current_hole_value
    else (case when difference > 0 then 'Team 1' else 'Team 2' end) || ' ' || abs(difference) || ' UP through ' || current_hole_value end; end if;

  if target_format = 'SI' then
    with running as (
      select hole_number,
        sum(case when hole_winner = 'Team 1' then 1 else 0 end) over (order by hole_number) team_1,
        sum(case when hole_winner = 'Team 2' then 1 else 0 end) over (order by hole_number) team_2
      from scoring_authority.hole_scores where match_id = target_match
    ) select hole_number, abs(team_1 - team_2), team_1, team_2
      into clinch_hole, clinch_lead, clinch_team_1, clinch_team_2
      from running where abs(team_1 - team_2) > 18 - hole_number order by hole_number limit 1;
    if contiguous and clinch_hole is not null then
      clinched_value := true;
      result_value := case when clinch_team_1 > clinch_team_2 then 'Team 1' else 'Team 2' end;
      status_text := result_value || ' wins ' || clinch_lead || ' & ' || (18 - clinch_hole);
    elsif complete_value then
      result_value := case when difference = 0 then 'Halved' when difference > 0 then 'Team 1' else 'Team 2' end;
      status_text := case when result_value = 'Halved' then 'Match halved' else result_value || ' wins ' || abs(difference) || ' UP' end;
    end if;
    if clinched_value or complete_value then
      team_1_points := case when result_value = 'Team 1' then 3 when result_value = 'Halved' then 1.5 else 0 end;
      team_2_points := 3 - team_1_points;
      overall_winner := result_value;
    end if;
  elsif complete_value then
    front_winner := scoring_authority.segment_winner(target_match, 1, 9);
    back_winner := scoring_authority.segment_winner(target_match, 10, 18);
    overall_winner := scoring_authority.segment_winner(target_match, 1, 18);
    result_value := overall_winner;
    team_1_points := (case when front_winner = 'Team 1' then 1 when front_winner = 'Halved' then .5 else 0 end) +
      (case when back_winner = 'Team 1' then 1 when back_winner = 'Halved' then .5 else 0 end) +
      (case when overall_winner = 'Team 1' then 1 when overall_winner = 'Halved' then .5 else 0 end);
    team_2_points := 3 - team_1_points;
  end if;
  return jsonb_build_object(
    'scored_holes', scored, 'current_hole', current_hole_value, 'holes_remaining', holes_remaining_value,
    'team_1_holes_won', team_1_wins, 'team_2_holes_won', team_2_wins, 'running_result', status_text,
    'result_winner', result_value, 'clinched', clinched_value, 'scorecard_complete', complete_value,
    'front_winner', front_winner, 'back_winner', back_winner, 'overall_winner', overall_winner,
    'team_1_points', team_1_points, 'team_2_points', team_2_points
  );
end;
$$;

create or replace function public.submit_hole_score_authoritative(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  server_started timestamptz := clock_timestamp(); lock_started timestamptz; locked_at timestamptz;
  match_row scoring_authority.matches%rowtype; hole_row scoring_authority.hole_scores%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype; permission_row scoring_authority.scoring_permissions%rowtype;
  tournament_row scoring_authority.tournaments%rowtype; gate_row scoring_authority.ingress_gates%rowtype;
  target_match text := input->>'match_id'; target_hole integer := nullif(input->>'hole_number', '')::integer;
  mutation_identity text := input->>'mutation_key'; actor text := input#>>'{authorization,player_id}';
  team_1_gross jsonb := input->'team_1_gross_scores'; team_2_gross jsonb := input->'team_2_gross_scores';
  expected_match bigint := nullif(input->>'expected_match_revision', '')::bigint;
  expected_hole bigint := coalesce(nullif(input->>'expected_hole_revision', '')::bigint, -1);
  expected_updated_at timestamptz := nullif(input->>'expected_match_updated_at', '')::timestamptz;
  rehearsal boolean := coalesce((input->>'rehearsal')::boolean, false);
  payload_hash_value text; expected_count integer; current_hole_revision bigint := 0; next_hole_revision bigint; next_match_revision bigint;
  stroke_index_value integer; team_1_strokes jsonb; team_2_strokes jsonb; team_1_net integer; team_2_net integer; winner text;
  progress jsonb; before_state jsonb; result_value jsonb; authority_now timestamptz := clock_timestamp();
begin
  if coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST'); end if;
  lock_started := clock_timestamp();
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  locked_at := clock_timestamp();
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select * into tournament_row from scoring_authority.tournaments where tournament_id = match_row.tournament_id;
  select * into gate_row from scoring_authority.ingress_gates where tournament_id = match_row.tournament_id;
  if gate_row.state <> 'OPEN' then return jsonb_build_object('ok', false, 'code', 'SCORING_INGRESS_PAUSED'); end if;
  if not rehearsal and (gate_row.authority <> 'SUPABASE' or tournament_row.scoring_authority <> 'SUPABASE') then
    return jsonb_build_object('ok', false, 'code', 'SUPABASE_NOT_AUTHORITY');
  end if;
  if rehearsal and upper(coalesce(input#>>'{authorization,role}', '')) <> 'DIRECTOR' then
    return jsonb_build_object('ok', false, 'code', 'REHEARSAL_DIRECTOR_REQUIRED');
  end if;
  payload_hash_value := encode(digest(jsonb_build_object('match_id', target_match, 'hole_number', target_hole,
    'team_1_gross_scores', team_1_gross, 'team_2_gross_scores', team_2_gross, 'actor_id', actor)::text, 'sha256'), 'hex');
  select * into mutation_row from scoring_authority.score_mutations where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then return mutation_row.result || jsonb_build_object('idempotent', true); end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true or
     input#>>'{authorization,tournament_id}' <> match_row.tournament_id or input#>>'{authorization,match_id}' <> target_match or coalesce(actor, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if upper(coalesce(input#>>'{authorization,role}', 'PLAYER')) = 'PLAYER' then
    select * into permission_row from scoring_authority.scoring_permissions where match_id = target_match and player_id = actor;
    if not found or not permission_row.can_score or permission_row.revoked_at is not null then return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); end if;
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> permission_row.permission_revision or permission_row.permission_revision <> match_row.permission_revision then
      return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE', 'current_permission_revision', match_row.permission_revision);
    end if;
  elsif upper(input#>>'{authorization,role}') in ('MATCH_ACCESS', 'DIRECTOR') then
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> match_row.permission_revision then
      return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE', 'current_permission_revision', match_row.permission_revision);
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if match_row.scoring_locked then return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if match_row.status = 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if target_hole not between 1 and 18 then return jsonb_build_object('ok', false, 'code', 'INVALID_HOLE'); end if;
  if expected_match is not null and expected_match <> match_row.match_revision then
    return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision);
  end if;
  if expected_match is null and expected_updated_at is distinct from match_row.authority_updated_at then
    return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision, 'current_updated_at', match_row.authority_updated_at);
  end if;
  select * into hole_row from scoring_authority.hole_scores where match_id = target_match and hole_number = target_hole;
  if found then current_hole_revision := hole_row.hole_revision; end if;
  if expected_hole <> current_hole_revision then return jsonb_build_object('ok', false, 'code', 'HOLE_REVISION_CONFLICT', 'current_hole_revision', current_hole_revision); end if;
  expected_count := case when match_row.format = 'BB' then 2 else 1 end;
  if not scoring_authority.valid_gross_scores(team_1_gross, expected_count) or not scoring_authority.valid_gross_scores(team_2_gross, expected_count) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_GROSS_SCORES');
  end if;
  select stroke_index into stroke_index_value from scoring_authority.match_holes where match_id = target_match and hole_number = target_hole;
  if stroke_index_value is null then return jsonb_build_object('ok', false, 'code', 'INVALID_SCORING_SNAPSHOT'); end if;
  if match_row.format = 'SC' then
    select jsonb_build_array(scoring_authority.strokes_on_hole((s.team_configuration->>'team_1_strokes')::integer, stroke_index_value)),
      jsonb_build_array(scoring_authority.strokes_on_hole((s.team_configuration->>'team_2_strokes')::integer, stroke_index_value))
      into team_1_strokes, team_2_strokes from scoring_authority.scoring_snapshots s where snapshot_id = match_row.scoring_snapshot_id;
  else
    select jsonb_agg(scoring_authority.strokes_on_hole(p.final_strokes, stroke_index_value) order by p.player_slot)
      into team_1_strokes from scoring_authority.match_participants p where match_id = target_match and team_side = 1;
    select jsonb_agg(scoring_authority.strokes_on_hole(p.final_strokes, stroke_index_value) order by p.player_slot)
      into team_2_strokes from scoring_authority.match_participants p where match_id = target_match and team_side = 2;
  end if;
  if match_row.format = 'BB' then
    select min(gross::integer - stroke::integer) into team_1_net from jsonb_array_elements_text(team_1_gross) with ordinality g(gross, n)
      join jsonb_array_elements_text(team_1_strokes) with ordinality s(stroke, n2) on n = n2;
    select min(gross::integer - stroke::integer) into team_2_net from jsonb_array_elements_text(team_2_gross) with ordinality g(gross, n)
      join jsonb_array_elements_text(team_2_strokes) with ordinality s(stroke, n2) on n = n2;
  else
    team_1_net := (team_1_gross->>0)::integer - (team_1_strokes->>0)::integer;
    team_2_net := (team_2_gross->>0)::integer - (team_2_strokes->>0)::integer;
  end if;
  winner := case when team_1_net = team_2_net then 'Halved' when team_1_net < team_2_net then 'Team 1' else 'Team 2' end;
  before_state := case when current_hole_revision = 0 then '{}'::jsonb else to_jsonb(hole_row) end;
  next_hole_revision := current_hole_revision + 1; next_match_revision := match_row.match_revision + 1;
  insert into scoring_authority.hole_scores (match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
    team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score, hole_winner, mutation_key, actor_id)
  values (target_match, target_hole, next_hole_revision, team_1_gross, team_2_gross, team_1_strokes, team_2_strokes,
    team_1_net, team_2_net, winner, mutation_identity, actor)
  on conflict (match_id, hole_number) do update set hole_revision = excluded.hole_revision,
    team_1_gross_scores = excluded.team_1_gross_scores, team_2_gross_scores = excluded.team_2_gross_scores,
    team_1_strokes = excluded.team_1_strokes, team_2_strokes = excluded.team_2_strokes,
    team_1_net_score = excluded.team_1_net_score, team_2_net_score = excluded.team_2_net_score,
    hole_winner = excluded.hole_winner, mutation_key = excluded.mutation_key, actor_id = excluded.actor_id, updated_at = now();
  progress := scoring_authority.match_progress(target_match, match_row.format);
  update scoring_authority.matches set match_revision = next_match_revision,
    scored_holes = (progress->>'scored_holes')::integer, current_hole = (progress->>'current_hole')::integer,
    holes_remaining = (progress->>'holes_remaining')::integer, team_1_holes_won = (progress->>'team_1_holes_won')::integer,
    team_2_holes_won = (progress->>'team_2_holes_won')::integer, running_result = progress->>'running_result',
    result_winner = progress->>'result_winner', clinched = (progress->>'clinched')::boolean,
    scorecard_complete = (progress->>'scorecard_complete')::boolean, authority_updated_at = authority_now, updated_at = authority_now
  where match_id = target_match;
  result_value := jsonb_build_object('ok', true, 'code', 'ACCEPTED', 'match_id', target_match, 'hole_number', target_hole,
    'google_target_match_id', coalesce(input->>'google_target_match_id', target_match),
    'hole_revision', next_hole_revision, 'match_revision', next_match_revision, 'updated_at', authority_now,
    'gross', jsonb_build_object('team_1', team_1_gross, 'team_2', team_2_gross),
    'strokes', jsonb_build_object('team_1', team_1_strokes, 'team_2', team_2_strokes),
    'net', jsonb_build_object('team_1', team_1_net, 'team_2', team_2_net), 'hole_winner', winner, 'match', progress,
    'audit_created', true, 'google_outbox_created', true,
    'timings', jsonb_build_object('lock_wait_ms', extract(milliseconds from locked_at - lock_started),
      'server_transaction_ms', extract(milliseconds from clock_timestamp() - server_started)));
  insert into scoring_authority.score_mutations (match_id, mutation_key, mutation_type, hole_number, payload_hash,
    previous_match_revision, next_match_revision, previous_hole_revision, next_hole_revision, result, actor_id)
  values (target_match, mutation_identity, 'HOLE_SCORE', target_hole, payload_hash_value, match_row.match_revision,
    next_match_revision, current_hole_revision, next_hole_revision, result_value, actor);
  insert into scoring_authority.score_revision_history (match_id, hole_number, mutation_key, action, previous_match_revision,
    next_match_revision, previous_hole_revision, next_hole_revision, before_state, after_state, actor_id)
  values (target_match, target_hole, mutation_identity, 'HOLE_SCORE_UPSERTED', match_row.match_revision, next_match_revision,
    current_hole_revision, next_hole_revision, before_state, result_value, actor);
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (match_row.tournament_id, target_match, mutation_identity, 'HOLE_SCORE_UPSERTED', actor, result_value);
  insert into scoring_authority.google_outbox_events (tournament_id, match_id, match_revision, hole_number, hole_revision,
    mutation_key, event_type, payload, payload_hash)
  values (match_row.tournament_id, target_match, next_match_revision, target_hole, next_hole_revision, mutation_identity,
    'HOLE_SCORE_UPSERTED', result_value, payload_hash_value);
  return result_value;
end;
$$;

create or replace function public.finalize_match_authoritative(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype; mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id'; mutation_identity text := input->>'mutation_key'; actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1); next_revision bigint; payload_hash_value text; result_value jsonb;
  rehearsal boolean := coalesce((input->>'rehearsal')::boolean, false); gate_authority text;
begin
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select authority into gate_authority from scoring_authority.ingress_gates where tournament_id = match_row.tournament_id;
  if not rehearsal and gate_authority <> 'SUPABASE' then return jsonb_build_object('ok', false, 'code', 'SUPABASE_NOT_AUTHORITY'); end if;
  payload_hash_value := encode(digest(jsonb_build_object('match_id', target_match, 'action', 'FINALIZE', 'actor_id', actor)::text, 'sha256'), 'hex');
  select * into mutation_row from scoring_authority.score_mutations where match_id = target_match and mutation_key = mutation_identity;
  if found then if mutation_row.payload_hash = payload_hash_value then return mutation_row.result || jsonb_build_object('idempotent', true); end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
  if coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true or input#>>'{authorization,match_id}' <> target_match then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); end if;
  if match_row.status = 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if match_row.scoring_locked then return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if expected_match <> match_row.match_revision then return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision); end if;
  if match_row.scored_holes <> 18 or not match_row.scorecard_complete then return jsonb_build_object('ok', false, 'code', 'SCORECARD_INCOMPLETE', 'scored_holes', match_row.scored_holes); end if;
  if match_row.unresolved_mutations > 0 then return jsonb_build_object('ok', false, 'code', 'UNRESOLVED_MUTATIONS'); end if;
  if match_row.result_winner = '' then return jsonb_build_object('ok', false, 'code', 'RESULT_UNAVAILABLE'); end if;
  next_revision := match_row.match_revision + 1;
  result_value := jsonb_build_object('ok', true, 'code', 'FINALIZED', 'match_id', target_match,
    'match_revision', next_revision, 'result_winner', match_row.result_winner, 'scorecard_complete', true,
    'scored_holes', 18, 'updated_at', now(), 'audit_created', true, 'google_outbox_created', true);
  update scoring_authority.matches set status = 'FINAL', scoring_locked = true, match_revision = next_revision,
    finalized_at = now(), authority_updated_at = now(), updated_at = now() where match_id = target_match;
  insert into scoring_authority.score_mutations (match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id)
  values (target_match, mutation_identity, 'FINALIZE', payload_hash_value, match_row.match_revision, next_revision, result_value, actor);
  insert into scoring_authority.score_revision_history (match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id)
  values (target_match, mutation_identity, 'MATCH_FINALIZED', match_row.match_revision, next_revision, to_jsonb(match_row), result_value, actor);
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (match_row.tournament_id, target_match, mutation_identity, 'MATCH_FINALIZED', actor, result_value);
  insert into scoring_authority.google_outbox_events (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)
  values (match_row.tournament_id, target_match, next_revision, mutation_identity, 'MATCH_FINALIZED', result_value, payload_hash_value);
  return result_value;
end;
$$;

create or replace function public.reopen_match_authoritative(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype; mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id'; mutation_identity text := input->>'mutation_key'; actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1); next_revision bigint; payload_hash_value text; result_value jsonb;
  rehearsal boolean := coalesce((input->>'rehearsal')::boolean, false); gate_authority text;
begin
  select * into match_row from scoring_authority.matches where match_id = target_match for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select authority into gate_authority from scoring_authority.ingress_gates where tournament_id = match_row.tournament_id;
  if not rehearsal and gate_authority <> 'SUPABASE' then return jsonb_build_object('ok', false, 'code', 'SUPABASE_NOT_AUTHORITY'); end if;
  if upper(coalesce(input#>>'{authorization,role}', '')) <> 'DIRECTOR' or coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED'); end if;
  payload_hash_value := encode(digest(jsonb_build_object('match_id', target_match, 'action', 'REOPEN', 'actor_id', actor)::text, 'sha256'), 'hex');
  select * into mutation_row from scoring_authority.score_mutations where match_id = target_match and mutation_key = mutation_identity;
  if found then if mutation_row.payload_hash = payload_hash_value then return mutation_row.result || jsonb_build_object('idempotent', true); end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
  if match_row.status <> 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FINAL'); end if;
  if expected_match <> match_row.match_revision then return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision); end if;
  next_revision := match_row.match_revision + 1;
  result_value := jsonb_build_object('ok', true, 'code', 'REOPENED', 'match_id', target_match,
    'match_revision', next_revision, 'scorecard_complete', match_row.scorecard_complete, 'updated_at', now(),
    'audit_created', true, 'google_outbox_created', true);
  update scoring_authority.matches set status = 'LIVE', scoring_locked = false, match_revision = next_revision,
    finalized_at = null, authority_updated_at = now(), updated_at = now() where match_id = target_match;
  insert into scoring_authority.score_mutations (match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id)
  values (target_match, mutation_identity, 'REOPEN', payload_hash_value, match_row.match_revision, next_revision, result_value, actor);
  insert into scoring_authority.score_revision_history (match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id)
  values (target_match, mutation_identity, 'MATCH_REOPENED', match_row.match_revision, next_revision, to_jsonb(match_row), result_value, actor);
  insert into scoring_authority.audit_events (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (match_row.tournament_id, target_match, mutation_identity, 'MATCH_REOPENED', actor, result_value);
  insert into scoring_authority.google_outbox_events (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)
  values (match_row.tournament_id, target_match, next_revision, mutation_identity, 'MATCH_REOPENED', result_value, payload_hash_value);
  return result_value;
end;
$$;

create or replace function public.commit_preview_authority_epoch(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare epoch_row scoring_authority.authority_epochs%rowtype; unresolved integer;
begin
  select * into epoch_row from scoring_authority.authority_epochs where epoch_id = (input->>'epoch_id')::uuid for update;
  if not found or epoch_row.status <> 'PREPARED' then return jsonb_build_object('ok', false, 'code', 'EPOCH_NOT_PREPARED'); end if;
  select count(*) into unresolved from scoring_authority.google_outbox_events where tournament_id = epoch_row.tournament_id and status <> 'DELIVERED';
  if unresolved > 0 then return jsonb_build_object('ok', false, 'code', 'GOOGLE_OUTBOX_NOT_DRAINED', 'unresolved', unresolved); end if;
  if epoch_row.epoch_type = 'ROLLBACK' and exists (
    select 1 from scoring_authority.matches m join scoring_authority.google_match_checkpoints c using (match_id)
    where m.tournament_id = epoch_row.tournament_id and c.last_supabase_match_revision <> m.match_revision
  ) then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BEHIND_SUPABASE'); end if;
  update scoring_authority.authority_epochs set status = 'COMMITTED', committed_at = now() where epoch_id = epoch_row.epoch_id;
  update scoring_authority.ingress_gates set authority = epoch_row.authority_after, state = 'OPEN', active_epoch_id = epoch_row.epoch_id,
    updated_by = input->>'actor_id', updated_at = now() where tournament_id = epoch_row.tournament_id;
  update scoring_authority.tournaments set scoring_authority = epoch_row.authority_after, updated_at = now() where tournament_id = epoch_row.tournament_id;
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (epoch_row.tournament_id, epoch_row.epoch_type || '_EPOCH_COMMITTED', input->>'actor_id', to_jsonb(epoch_row));
  return jsonb_build_object('ok', true, 'code', 'EPOCH_COMMITTED', 'authority', epoch_row.authority_after, 'epoch_id', epoch_row.epoch_id);
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.submit_hole_score_authoritative(jsonb)',
    'public.finalize_match_authoritative(jsonb)',
    'public.reopen_match_authoritative(jsonb)',
    'public.commit_preview_authority_epoch(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
