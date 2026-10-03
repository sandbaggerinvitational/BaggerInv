-- Canonical bodies shared by separately admitted Production and Certification wrappers.
-- Scaffold: Supabase CLI 2.56.1 migration new certification_domain_gateways_v1;
-- repository ordinal132. No source historical migrations or authority rows are rewritten.
begin;

create function production_control.assert_canonical_scoring_context_v1(input jsonb, context jsonb, guard_kind text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare current_context jsonb;
begin
 if context is null then
  if guard_kind='RUNTIME' then perform production_control.assert_production_scoring_runtime(input);
  elsif guard_kind='EXACT_READ' then perform production_control.assert_exact_cutover_resource_scope(input,true);
  else raise exception using errcode='42501',message='CANONICAL_DOMAIN_GUARD_INVALID'; end if;
  return;
 end if;
 current_context:=production_control.current_certification_context_v1();
 if current_context is null or context->>'resource_class' is distinct from 'CERTIFICATION'
  or context->>'resource_id' is distinct from current_context->>'resource_id'
  or context->>'installation_id' is distinct from current_context->>'installation_id'
  or context->>'context_token' is distinct from current_context->>'context_token'
  or context->>'tournament_id' is distinct from '2026'
  or context->>'current_tournament_id' is distinct from '2026'
  or (input ? 'tournament_id' and input->>'tournament_id' is distinct from '2026')
  or (input ? 'expected_epoch_id' and input->>'expected_epoch_id' is distinct from context->>'authority_epoch_id') then
  raise exception using errcode='42501',message='CERTIFICATION_DOMAIN_CONTEXT_REQUIRED';
 end if;
end;
$$;
revoke all on function production_control.assert_canonical_scoring_context_v1(jsonb,jsonb,text) from public,anon,authenticated,service_role;

-- Exact predecessor body and privilege validation; public OID is preserved.
do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.submit_production_hole_score(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
   or p.prokind<>'f' or p.proretset or p.proisstrict or p.proleakproof
   or p.prolang<>(select oid from pg_language where lanname='plpgsql')
   or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'24cdec8645b8ec276e13704da14d5521d96997910538a23fd6350153aef580d8'
   or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
       or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable) then
  raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: submit_production_hole_score';
 end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_submit_hole_score_v2(input jsonb, canonical_context jsonb)
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
  perform production_control.assert_canonical_scoring_context_v1(input, canonical_context, 'RUNTIME');
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
    'audit_created', true, 'google_outbox_created', false
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, hole_number, payload_hash,
    previous_match_revision, next_match_revision, previous_hole_revision,
    next_hole_revision, result, actor_id, originating_auth_user_id
  ) values (
    target_match, mutation_identity, 'HOLE_SCORE', target_hole, payload_hash_value,
    match_row.match_revision, next_match_revision, current_hole_revision,
    next_hole_revision, result_value, actor, (input#>>'{authorization,auth_user_id}')::uuid
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
  -- Google runtime retired: external delivery is not canonical authority.
  return result_value;
end;
$function$;
revoke all on function production_control.canonical_submit_hole_score_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.submit_production_hole_score(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority', 'extensions'
AS $function$
begin
 return production_control.canonical_submit_hole_score_v2(input,null);
end;
$function$;


-- Exact predecessor body and privilege validation; public OID is preserved.
do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.finalize_production_match(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
   or p.prokind<>'f' or p.proretset or p.proisstrict or p.proleakproof
   or p.prolang<>(select oid from pg_language where lanname='plpgsql')
   or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'fe8f7db85ed3e1fe827f5c76a312218e347241fa8075d29d6aa226fc9bdc2fad'
   or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
       or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable) then
  raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: finalize_production_match';
 end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_finalize_match_v2(input jsonb, canonical_context jsonb)
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
  perform production_control.assert_canonical_scoring_context_v1(input, canonical_context, 'RUNTIME');
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
    'audit_created', true, 'google_outbox_created', false
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
  -- Google runtime retired: external delivery is not canonical authority.
  return result_value;
end;
$function$;
revoke all on function production_control.canonical_finalize_match_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.finalize_production_match(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
begin
 return production_control.canonical_finalize_match_v2(input,null);
end;
$function$;


-- Exact predecessor body and privilege validation; public OID is preserved.
do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.reopen_production_match(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
   or p.prokind<>'f' or p.proretset or p.proisstrict or p.proleakproof
   or p.prolang<>(select oid from pg_language where lanname='plpgsql')
   or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'bd64f57f2252091d9aaa7408e14280a6734d37f1fce995930bf69198ef8c199b'
   or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
       or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable) then
  raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: reopen_production_match';
 end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_reopen_match_v2(input jsonb, canonical_context jsonb)
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
  perform production_control.assert_canonical_scoring_context_v1(input, canonical_context, 'RUNTIME');
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
    'audit_created', true, 'google_outbox_created', false
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
  -- Google runtime retired: external delivery is not canonical authority.
  return result_value;
end;
$function$;
revoke all on function production_control.canonical_reopen_match_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.reopen_production_match(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
begin
 return production_control.canonical_reopen_match_v2(input,null);
end;
$function$;


-- Exact predecessor body and privilege validation; public OID is preserved.
do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_scoring_authority(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
   or p.prokind<>'f' or p.proretset or p.proisstrict or p.proleakproof
   or p.prolang<>(select oid from pg_language where lanname='plpgsql')
   or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'91cccbf3c3504a05ef5b4ce58b62d7db581700c3ed8c04159ce1f802a4e7c232'
   or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
       or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable) then
  raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: read_production_scoring_authority';
 end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_read_scoring_authority_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  target_match text := input->>'match_id';
  mode text := upper(coalesce(input->>'mode', 'DIAGNOSTICS'));
  payload jsonb;
begin
  perform production_control.assert_canonical_scoring_context_v1(input, canonical_context, 'EXACT_READ');
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
      'pending_outbox', 0 /* external Google delivery retired */,
      'authority', (select scoring_authority from scoring_authority.tournaments where tournament_id = '2026'),
      'ingress', (select to_jsonb(gate) from scoring_authority.ingress_gates gate where tournament_id = '2026')
    ) into payload;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_READ_MODE');
  end if;
  return jsonb_build_object('ok', true, 'mode', mode, 'data', payload);
end;
$function$;
revoke all on function production_control.canonical_read_scoring_authority_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.read_production_scoring_authority(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
begin
 return production_control.canonical_read_scoring_authority_v2(input,null);
end;
$function$;


-- Exact predecessor body and privilege validation; public OID is preserved.
do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_scoring_participant_context(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
   or p.prokind<>'f' or p.proretset or p.proisstrict or p.proleakproof
   or p.prolang<>(select oid from pg_language where lanname='plpgsql')
   or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'63b2b125569265836fe434a4038645b2661ff1e00099e62cdda7fb67da0cf026'
   or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
       or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable) then
  raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: read_production_scoring_participant_context';
 end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_read_scoring_participant_context_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'scoring_authority', 'auth'
AS $function$
declare
  target_match text := input->>'match_id';
  actor text := input->>'player_id';
  actor_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
  participant_role text := upper(coalesce(input->>'role', 'PLAYER'));
  supplied_permission_revision bigint := coalesce((input->>'permission_revision')::bigint, -1);
  match_row scoring_authority.matches%rowtype;
  permission_ok boolean := false;
begin
  perform production_control.assert_canonical_scoring_context_v1(input, canonical_context, 'EXACT_READ');
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
$function$;
revoke all on function production_control.canonical_read_scoring_participant_context_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.read_production_scoring_participant_context(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'scoring_authority', 'auth'
AS $function$
begin
 return production_control.canonical_read_scoring_participant_context_v2(input,null);
end;
$function$;


do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.isolated_director_setup_operation_v1(jsonb,jsonb,boolean)'::regprocedure),'sha256'),'hex')<>'1168ae743dceb2773bc4b7fc3146ad3db79fa5b371dc78662d3206d39afa4f26' then
  raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: isolated_director_setup_operation_v1'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_director_setup_operation_v2(input jsonb, context jsonb, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 family text:=input->>'family'; action text:=input->>'action';
 payload jsonb:=coalesce(input->'payload','{}'::jsonb);
 command jsonb; operation text; match_id_value text; current_read jsonb; control_matches jsonb;
 setup_receipt production_control.tournament_setup_operation_receipts_v1%rowtype;
 control_receipt scoring_authority.score_mutations%rowtype; expected_hash text;
begin
 if context->>'tournament_id' is distinct from '2026'
  or context->>'governance_tournament_id' is distinct from '2026'
  or context->>'actor_player_id' is null or context->>'actor_auth_user_id' is null
  or family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL')
  or jsonb_typeof(payload) is distinct from 'object' then
  raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
 end if;
 command:=(payload-array['environment','project_ref','project_url','source_workbook_id','tournament_id',
  'authorization','actor_player_id','actor_auth_user_id','request_payload_hash','operation_request_id','mutation_key']) ||
  jsonb_build_object('contract_version','production-tournament-setup-v1','environment',coalesce(context->>'resource_class','ISOLATED'),
   'tournament_id',context->>'tournament_id','actor_player_id',context->>'actor_player_id',
   'actor_auth_user_id',context->>'actor_auth_user_id','operation_request_id',context->>'operation_request_id',
   'authorization',jsonb_build_object('tournament_id',context->>'tournament_id',
    'player_id',context->>'actor_player_id','auth_user_id',context->>'actor_auth_user_id','role','DIRECTOR'));
 if not mutation and input->>'mode' is distinct from 'status' then
  current_read:=production_control.canonical_tournament_setup_read_v1(command ||
   jsonb_build_object('operation','READ_PRODUCTION_TOURNAMENT_SETUP_V1'));
  if family='MATCH_CONTROL' then
   select coalesce(jsonb_agg(item.value || jsonb_build_object(
    'matchRevision',m.match_revision,'permissionRevision',m.permission_revision,
    'scorecardComplete',m.scorecard_complete,'unresolvedMutations',m.unresolved_mutations,
    'resultWinner',m.result_winner,'scoringLocked',m.scoring_locked,
    'scoringReady',coalesce((item.value->>'scoring_ready')::boolean,false),
    'permissionComplete',(select count(*) from scoring_authority.scoring_permissions p where p.match_id=m.match_id)=
      (select count(*) from scoring_authority.match_participants p where p.match_id=m.match_id)
      and exists(select 1 from scoring_authority.match_participants p where p.match_id=m.match_id),
    'accessState',case when not exists(select 1 from scoring_authority.scoring_permissions p where p.match_id=m.match_id and p.can_score and p.revoked_at is null) then 'REVOKED'
      when not exists(select 1 from scoring_authority.scoring_permissions p where p.match_id=m.match_id and (not p.can_score or p.revoked_at is not null or p.permission_revision<>m.permission_revision)) then 'ACTIVE' else 'MIXED' end)
    order by m.round_number,m.match_id),'[]') into control_matches
   from jsonb_array_elements(current_read#>'{data,matches}') item(value)
   join scoring_authority.matches m on m.match_id=item.value->>'matchId' and m.tournament_id=context->>'tournament_id';
   current_read:=jsonb_set(current_read,'{data,matches}',control_matches);
  end if;
  return current_read;
 end if;
 if family='MATCH_CONTROL' then
  operation:=case action when 'mark-live' then 'MARK_LIVE' when 'scoring-lock' then 'SCORING_LOCK'
   when 'scoring-unlock' then 'SCORING_UNLOCK' when 'access-activate' then 'ACCESS_ACTIVATE'
   when 'access-revoke' then 'ACCESS_REVOKE' end;
  match_id_value:=payload->>'match_id';
  if operation is null or coalesce(match_id_value,'')='' or
   coalesce(payload->>'expected_match_revision','')!~'^[0-9]+$' or
   coalesce(payload->>'expected_permission_revision','')!~'^[0-9]+$' then
   raise exception using errcode='22023',message='ISOLATED_DIRECTOR_CONTROL_INPUT_INVALID'; end if;
  command:=command || jsonb_build_object('operation',operation,'mutation_key',context->>'operation_request_id',
   'authorization',(command->'authorization') || jsonb_build_object('match_id',match_id_value,
    'permission_revision',(payload->>'expected_permission_revision')::bigint));
  if input->>'mode'='status' then
   expected_hash:=production_control.cutover_payload_hash(jsonb_build_object(
    'match_id',match_id_value,'operation',operation,'actor_id',context->>'actor_player_id'));
   select * into control_receipt from scoring_authority.score_mutations
    where match_id=match_id_value and mutation_key=context->>'operation_request_id';
   if not found then return jsonb_build_object('ok',true,'outcome','UNKNOWN','receipt',null,
    'code','ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND'); end if;
   if control_receipt.payload_hash is distinct from expected_hash then
    raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('ok',true,'outcome','COMMITTED','receipt',control_receipt.result);
  end if;
  return production_control.canonical_match_control_v1(command,input);
 end if;
 operation:=case action when 'update-tournament' then 'UPDATE_TOURNAMENT' when 'update-team' then 'UPDATE_TEAM'
  when 'assign-roster-team' then 'ASSIGN_ROSTER_TEAM' when 'update-round' then 'UPDATE_ROUND'
  when 'upsert-course' then 'UPSERT_COURSE' when 'upsert-match' then 'UPSERT_MATCH'
  when 'replace-pairings' then 'REPLACE_PAIRINGS' when 'prepare-scoring-context' then 'PREPARE_SCORING_CONTEXT'
  when 'replace-round-pairings' then 'REPLACE_ROUND_PAIRINGS' end;
 if operation is null or (family='ROUND_PAIRINGS') is distinct from (operation='REPLACE_ROUND_PAIRINGS')
  or (payload ? 'operation' and payload->>'operation' is distinct from operation) then
  raise exception using errcode='22023',message='ISOLATED_DIRECTOR_SETUP_ACTION_INVALID'; end if;
 command:=command||jsonb_build_object('operation',operation);
 expected_hash:=production_control.tournament_setup_hash_v1(command);
 command:=command||jsonb_build_object('request_payload_hash',expected_hash);
 if input->>'mode'='status' then
  select r.* into setup_receipt from production_control.tournament_setup_operation_receipts_v1 r
   where r.tournament_id=context->>'tournament_id' and r.action=operation
    and r.operation_request_id=(context->>'operation_request_id')::uuid;
  if not found then return jsonb_build_object('ok',true,'outcome','UNKNOWN','receipt',null,
   'code','ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND'); end if;
  if setup_receipt.declared_request_payload_hash is distinct from expected_hash
   or setup_receipt.database_request_payload_hash is distinct from expected_hash then
   raise exception 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('ok',true,'outcome','COMMITTED','receipt',setup_receipt.response);
 end if;
 return production_control.mutate_late_r3_dispatch_v1(command,family='ROUND_PAIRINGS');
end;
$function$;
revoke all on function production_control.canonical_director_setup_operation_v2(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
create or replace function production_control.isolated_director_setup_operation_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 -- Existing isolated admission produces no resource_class. Do not let this
 -- legacy dispatcher accept a certification class through an accidental caller.
 if context ? 'resource_class' then raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED'; end if;
 return production_control.canonical_director_setup_operation_v2(input,context,mutation);
end;
$$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.isolated_director_financial_operation_v1(jsonb,jsonb,boolean)'::regprocedure),'sha256'),'hex')<>'6de96036821a5ed32e909e3707c30c26ca1f9df712b39c5a19164cd63eab37a7' then
  raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: isolated_director_financial_operation_v1'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_director_financial_operation_v2(input jsonb, context jsonb, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare payload jsonb:=coalesce(input->'payload','{}'); domain_input jsonb; fingerprint text; result jsonb;
 status_read boolean:=not mutation and input->>'mode'='status'; original_token text;
 entry_receipt production_control.net_skins_entry_revisions_v1%rowtype; operation_name text;
begin
 if context->>'tournament_id' is distinct from '2026' or jsonb_typeof(payload) is distinct from 'object' then
   raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
 end if;
 original_token:=case when status_read then input->>'expected_context_token' else context->>'context_token' end;
 if input->>'family'='NET_SKINS_ENTRIES' then
   if not mutation and not coalesce(status_read,false) then return production_control.net_skins_entries_projection_v1('2026'); end if;
   if input->>'action' is distinct from 'save' then raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID'; end if;
   domain_input:=payload||jsonb_build_object('contract_version','production-tournament-setup-v1',
     'environment',coalesce(context->>'resource_class','ISOLATED'),'tournament_id','2026','context_binding_id',context->>'binding_id',
     'context_token',original_token,'actor_auth_user_id',context->>'actor_auth_user_id',
     'actor_player_id',context->>'actor_player_id','authorization',context->'authorization',
     'operation_request_id',context->>'operation_request_id');
   if status_read then
     select * into entry_receipt from production_control.net_skins_entry_revisions_v1
       where tournament_id='2026' and request_id=(context->>'operation_request_id')::uuid;
     if found then
       if entry_receipt.request_hash is distinct from production_control.tournament_setup_hash_v1(domain_input) then
         raise exception 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT'; end if;
       return jsonb_build_object('ok',true,'outcome','COMMITTED','receipt',entry_receipt.response);
     end if;
     return jsonb_build_object('ok',true,'outcome','UNKNOWN','receipt',null,'code','ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND');
   end if;
   result:=production_control.canonical_net_skins_entries_core_v1(domain_input);
 elsif input->>'family'='CALCUTTA_MANAGEMENT' then
   if not mutation and not coalesce(status_read,false) then
     return production_control.director_calcutta_management_projection_v1('2026',(payload->>'predecessor_auction_revision')::bigint);
   end if;
   operation_name:=case input->>'action' when 'replace-auction' then 'CALCUTTA_V1_REPLACE_AUCTION' when 'clear-entry' then 'CALCUTTA_V1_CLEAR_ENTRY' else null end;
   if operation_name is null then raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID'; end if;
   fingerprint:=production_control.calcutta_v1_hash(jsonb_build_object('binding_id',context->>'binding_id',
     'family',input->>'family','action',input->>'action','operation_request_id',context->>'operation_request_id'));
   domain_input:=payload||jsonb_build_object('contract_version','production-calcutta-v1',
     'environment',coalesce(context->>'resource_class','ISOLATED'),'tournament_id','2026','expected_tournament_id','2026',
     'context_binding_id',context->>'binding_id','context_token',original_token,
     'actor_id',context->>'actor_player_id','operation_request_id',context->>'operation_request_id',
     'authorization',context->'authorization','request_fingerprint',fingerprint);
   if status_read then
     result:=production_control.lookup_cutover_receipt(operation_name,domain_input);
     if result is not null then return jsonb_build_object('ok',true,'outcome','COMMITTED','receipt',result); end if;
     return jsonb_build_object('ok',true,'outcome','UNKNOWN','receipt',null,'code','ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND');
   end if;
   insert into production_control.isolated_financial_audit_context_v1(backend_pid,transaction_id,tournament_id,action,operation_request_id,request_fingerprint,context)
   values(pg_backend_pid(),pg_current_xact_id(),'2026',input->>'action',(context->>'operation_request_id')::uuid,fingerprint,context);
   if input->>'action'='replace-auction' then result:=production_control.canonical_calcutta_auction_core_v1(domain_input,context);
   else result:=production_control.canonical_calcutta_clear_core_v1(domain_input,context); end if;
   delete from production_control.isolated_financial_audit_context_v1 where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id();
 else raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID';
 end if;
 if coalesce((result->>'ok')::boolean,false) and not coalesce((result->>'idempotent')::boolean,false) then
   insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
   values(case when context->>'resource_class'='CERTIFICATION' then 'CERTIFICATION_DIRECTOR_FINANCIAL_OPERATION' else 'ISOLATED_DIRECTOR_FINANCIAL_OPERATION' end,input->>'family','2026',context->>'actor_player_id',fingerprint,'SUCCEEDED',
     jsonb_build_object('runtime',coalesce(context->>'resource_class','ISOLATED'),'context_binding_id',context->>'binding_id','context_token',context->>'context_token',
       'actor_auth_user_id',context->>'actor_auth_user_id','operation_request_id',context->>'operation_request_id',
       'action',input->>'action','resource_id',context->>'resource_id','installation_id',context->>'installation_id','activation_revision',context->'activation_revision','release_commit',context->>'release_commit','receipt',result));
 end if;
 return result;
end;
$function$;
revoke all on function production_control.canonical_director_financial_operation_v2(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
create or replace function production_control.isolated_director_financial_operation_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 -- Existing isolated admission produces no resource_class. Do not let this
 -- legacy dispatcher accept a certification class through an accidental caller.
 if context ? 'resource_class' then raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED'; end if;
 return production_control.canonical_director_financial_operation_v2(input,context,mutation);
end;
$$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.canonical_match_control_v1(jsonb,jsonb)'::regprocedure),'sha256'),'hex')<>'802e6421bf3e7f396895f51850285d3530edce3acb22c7912db9c351ed75eda7' then
 raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: canonical_match_control_v1'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_match_control_v1(input jsonb, isolated_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  rechecked_context jsonb;
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  operation text := pg_catalog.upper(coalesce(input->>'operation', ''));
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce(
    (input->>'expected_match_revision')::bigint, -1
  );
  expected_permission bigint := coalesce(
    (input#>>'{authorization,permission_revision}')::bigint, -1
  );
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
  readiness_value jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  -- Initial admission is enforced by the Production or isolated entry point.
  if operation not in (
       'MARK_LIVE', 'SCORING_LOCK', 'SCORING_UNLOCK',
       'ACCESS_ACTIVATE', 'ACCESS_REVOKE'
     ) or coalesce(target_match, '') = ''
       or coalesce(mutation_identity, '') = '' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_CONTROL_OPERATION'
    );
  end if;
  -- Tournament Setup always acquires this lock before locking a match. Use the
  -- same order so a setup commit and MARK_LIVE cannot pass one another.
  if operation in ('MARK_LIVE', 'ACCESS_ACTIVATE', 'SCORING_UNLOCK') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-access-governance-v1:2026', 0
    ));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-tournament-setup-v1:2026', 0
    ));
  end if;
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026' for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_FOUND'
    );
  end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'DIRECTOR_REQUIRED'
    );
  end if;
  -- Access-granting operations must validate the current canonical readiness
  -- inside the same transaction, before receipt replay or any permission write.
  -- Setup/access governance hold the advisory locks above; handicap approval
  -- takes all affected match row locks before advancing its current pointer.
  -- READ COMMITTED ensures a waiter sees authority committed before its lock.
  if operation in ('ACCESS_ACTIVATE', 'SCORING_UNLOCK') then
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'SCORING_READINESS_REFRESH_REQUIRED'
      );
    end if;
    if isolated_input is null then
      perform production_control.assert_production_scoring_runtime(input);
      perform production_control.assert_production_scoring_actor(input, true);
    elsif isolated_input->>'contract_version'='certification-runtime-v1' then
      rechecked_context:=production_control.current_certification_context_v1();
      perform production_control.assert_canonical_scoring_context_v1(input,rechecked_context,'RUNTIME');
      perform production_control.assert_production_scoring_actor(input,true);
      if isolated_input->>'operation_id' is distinct from 'DIRECTOR.MATCH_CONTROL'
        or isolated_input#>>'{payload,match_id}' is distinct from target_match
        or isolated_input->>'operation_request_id' is distinct from mutation_identity
        or isolated_input#>>'{authorization,player_id}' is distinct from input#>>'{authorization,player_id}'
        or isolated_input#>>'{authorization,auth_user_id}' is distinct from input#>>'{authorization,auth_user_id}' then
        raise exception using errcode='42501',message='CERTIFICATION_DOMAIN_CONTEXT_REQUIRED';
      end if;
    else
      rechecked_context:=production_control.assert_isolated_director_operation_context_v1(isolated_input,true);
      if isolated_input->>'family' is distinct from 'MATCH_CONTROL'
        or isolated_input#>>'{payload,match_id}' is distinct from target_match
        or rechecked_context->>'actor_player_id' is distinct from input#>>'{authorization,player_id}'
        or rechecked_context->>'actor_auth_user_id' is distinct from input#>>'{authorization,auth_user_id}'
        or rechecked_context->>'operation_request_id' is distinct from mutation_identity
        or rechecked_context->>'tournament_id' is distinct from input->>'tournament_id' then
        raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
      end if;
    end if;
    if match_row.status = 'FINAL' then
      return pg_catalog.jsonb_build_object('ok',false,'code','MATCH_FINAL');
    end if;
    if exists(select 1 from scoring_authority.score_mutations r where r.match_id=target_match
      and ((r.mutation_type in('ACCESS_ACTIVATE','SCORING_UNLOCK') and r.result->>'scoring_context_hash' is not null)
        or r.mutation_type in('HOLE_SCORE','FINALIZE','REOPEN')))
      or exists(select 1 from scoring_authority.hole_scores h where h.match_id=target_match)
      or match_row.scored_holes>0 then
      readiness_value := production_control.assert_production_match_resume_ready_v1(target_match);
    else
      readiness_value := production_control.assert_production_match_scoring_ready_v1(target_match);
    end if;
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', case when readiness_value->>'contractVersion'='production-match-resume-readiness-v1'
          then 'PRODUCTION_MATCH_NOT_RESUME_READY' else 'PRODUCTION_MATCH_NOT_SCORING_READY' end,
        'match_id', target_match,
        'scoring_readiness_contract', readiness_value->>'contractVersion',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false, 'google_outbox_created', false
      );
    end if;
    if expected_match <> match_row.match_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT');
    end if;
    if expected_permission <> match_row.permission_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE');
    end if;
  end if;
  payload_hash_value := production_control.cutover_payload_hash(
    pg_catalog.jsonb_build_object(
      'match_id', target_match, 'operation', operation, 'actor_id', actor
    )
  );
  select * into mutation_row from scoring_authority.score_mutations
    where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'IDEMPOTENCY_CONFLICT'
    );
  end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision
    );
  end if;
  if expected_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision
    );
  end if;
  if match_row.status = 'FINAL' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_FINAL'
    );
  end if;
  if operation = 'MARK_LIVE' and match_row.status = 'LIVE' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'status', match_row.status,
      'scoring_locked', match_row.scoring_locked,
      'google_outbox_created', false
    );
  end if;
  if operation = 'MARK_LIVE' and match_row.status <> 'UPCOMING' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_UPCOMING'
    );
  end if;
  if operation = 'MARK_LIVE' then
    readiness_value :=
      production_control.assert_production_match_scoring_ready_v1(
        target_match
      );
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'code', 'PRODUCTION_MATCH_NOT_SCORING_READY',
        'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'status', match_row.status,
        'scoring_locked', match_row.scoring_locked,
        'scoring_readiness_contract',
          'production-match-scoring-readiness-v1',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false,
        'google_outbox_created', false
      );
    end if;
  end if;
  if operation in ('SCORING_UNLOCK', 'ACCESS_ACTIVATE') and (
       (operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked)
       or (operation = 'SCORING_UNLOCK' and not match_row.scoring_locked)
     ) then
    if operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'SCORING_LOCKED'
      );
    end if;
    if not exists (
      select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and (
        not can_score or revoked_at is not null
        or permission_revision <> match_row.permission_revision
      )
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
        'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'scoring_locked', match_row.scoring_locked,
        'access_active', true,
        'google_outbox_created', false
      );
    end if;
  end if;
  if operation = 'SCORING_LOCK' and match_row.scoring_locked and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (
      can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', true,
      'access_active', false,
      'google_outbox_created', false
    );
  end if;
  if operation = 'ACCESS_REVOKE' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (
      can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', match_row.scoring_locked,
      'access_active', false,
      'google_outbox_created', false
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(permission) order by player_id
  ), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission
  where match_id = target_match;
  next_match_revision := match_row.match_revision + 1;
  permission_changes := operation <> 'MARK_LIVE';
  next_permission_revision := match_row.permission_revision
    + case when permission_changes then 1 else 0 end;
  target_locked := case operation
    when 'SCORING_LOCK' then true
    when 'SCORING_UNLOCK' then false
    else match_row.scoring_locked end;
  target_access := case operation
    when 'SCORING_LOCK' then false
    when 'SCORING_UNLOCK' then true
    when 'ACCESS_ACTIVATE' then true
    when 'ACCESS_REVOKE' then false
    else exists (
      select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and can_score and revoked_at is null
    ) end;
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
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(permission) order by player_id
  ), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission
  where match_id = target_match;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', operation,
    'match_id', target_match,
    'google_target_match_id', target_match,
    'match_revision', next_match_revision,
    'previous_permission_revision', match_row.permission_revision,
    'permission_revision', next_permission_revision,
    'status', next_match_row.status,
    'scoring_locked', target_locked,
    'access_active', target_access,
    'updated_at', transition_at,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions
    ),
    'scoring_context_hash', case when operation in('ACCESS_ACTIVATE','SCORING_UNLOCK')
      then production_control.match_resume_context_hash_v1(target_match) else null end,
    'audit_created', true,
    'google_outbox_created', false
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
    target_match, mutation_identity, event_type,
    match_row.match_revision, next_match_revision,
    pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(match_row),
      'permissions', before_permissions
    ),
    pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(next_match_row),
      'permissions', after_permissions
    ),
    actor
  );
  insert into scoring_authority.audit_events (
    tournament_id, match_id, mutation_key, action, actor_id, metadata
  ) values (
    '2026', target_match, mutation_identity, event_type, actor, result_value
  );
  -- Google runtime retired: external delivery is not canonical authority.
  return result_value;
end;
$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.capture_isolated_auction_supersession_provenance_v1()'::regprocedure),'sha256'),'hex')<>'d4a377edeb7eb0b4170b8205394d9316faa8cc8678937564789a3dd8531cb602' then raise exception 'CERTIFICATION_DOMAIN_PREDECESSOR_MISMATCH: financial provenance'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.capture_isolated_auction_supersession_provenance_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare marker production_control.isolated_financial_audit_context_v1%rowtype;
begin
 select * into marker from production_control.isolated_financial_audit_context_v1
 where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id()
   and tournament_id=new.tournament_id and action in('replace-auction','clear-entry');
 if not found then return new; end if;
 new.handling_activation_revision:=(marker.context->>'activation_revision')::bigint;
 new.handling_release_commit:=marker.context->>'release_commit';
 new.safe_code:=case when marker.context->>'resource_class'='CERTIFICATION' then 'CERTIFICATION_DIRECTOR_AUCTION_SUPERSEDED' else 'ISOLATED_DIRECTOR_AUCTION_SUPERSEDED' end;
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values(case when marker.context->>'resource_class'='CERTIFICATION' then 'CERTIFICATION_DIRECTOR_DERIVED_SUPERSEDED' else 'ISOLATED_DIRECTOR_DERIVED_SUPERSEDED' end,'CALCUTTA',new.tournament_id,
   marker.context->>'actor_player_id',marker.request_fingerprint,'SUCCEEDED',jsonb_build_object(
     'runtime',coalesce(marker.context->>'resource_class','ISOLATED'),'resource_id',marker.context->>'resource_id','installation_id',marker.context->>'installation_id','context_binding_id',marker.context->>'binding_id',
     'context_token',marker.context->>'context_token','operation_request_id',marker.operation_request_id,
     'action',marker.action,'actor_auth_user_id',marker.context->>'actor_auth_user_id',
     'delivery_event_id',new.event_id,'work_identity',new.work_identity,
     'originating_activation_revision',new.originating_activation_revision,
     'handling_activation_revision',new.handling_activation_revision,'handling_release_commit',new.handling_release_commit));
 return new;
end;
$function$;

-- This is a fixed reviewed operation set, never a client-selectable SQL name.
create function production_control.certification_operation_phase_v1(operation_id text, mutation boolean)
returns text language plpgsql immutable set search_path=pg_catalog as $$
begin
 if not mutation and operation_id in('SCORING.READ_AUTHORITY','SCORING.READ_PARTICIPANT_CONTEXT','SCORING.READ_MUTATION_STATUS') then return 'READS'; end if;
 if not mutation and operation_id in('DIRECTOR.READ_SETUP','DIRECTOR.READ_NET_SKINS','DIRECTOR.READ_CALCUTTA',
  'DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS') then return 'DIRECTOR'; end if;
 if mutation and operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH') then return 'SCORING'; end if;
 if mutation and operation_id in('SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then return 'DIRECTOR'; end if;
 raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';
end;
$$;
revoke all on function production_control.certification_operation_phase_v1(text,boolean) from public,anon,authenticated,service_role;

create function production_control.dispatch_certification_operation_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;
 actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;
 status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');
begin
 -- The marker is owner-only and revalidates registered resource/deployment,
 -- current pointer, admission revision and live ingress under transaction locks.
 perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');
 if jsonb_typeof(payload) is distinct from 'object' then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;
 if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',
  'actor_player_id','actor_auth_user_id','auth_user_id','player_id','role','context_token','expected_context_token',
  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',
  'admission_revision','governance_tournament_id'] then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;
 if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')
  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')
  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;
 command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',
  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');
 if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;
 if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then
  perform production_control.assert_production_scoring_actor(command,true);
  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',
   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',
   'operation_request_id',input->>'operation_request_id',
   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));
 end if;
 case operation_id
 when 'SCORING.READ_AUTHORITY' then
  return production_control.canonical_read_scoring_authority_v2(command,context);
 when 'SCORING.READ_PARTICIPANT_CONTEXT' then
  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(
   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',
   'role',input#>>'{authorization,role}'),context);
 when 'SCORING.READ_MUTATION_STATUS' then
  return production_control.read_score_mutation_status_v1(command,'2026');
 when 'SCORING.SUBMIT_HOLE' then
  return production_control.canonical_submit_hole_score_v2(command,context);
 when 'SCORING.FINALIZE_MATCH' then
  return production_control.canonical_finalize_match_v2(command,context);
 when 'SCORING.REOPEN_MATCH' then
  return production_control.canonical_reopen_match_v2(command,context);
 when 'DIRECTOR.READ_SETUP' then
  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';
  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then
   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';
 when 'DIRECTOR.SETUP_STATUS' then
  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';
  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then
   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';
 when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';
 when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';
 when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';
 when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';
 when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';
 when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';
 when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';
 when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';
 when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';
 else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';
 end case;
 dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);
 if status_read then
  -- The original token is receipt-hash provenance only. The current outer
  -- context was freshly admitted and remains the sole execution authority.
  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');
 end if;
 if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then
  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);
 end if;
 return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);
end;
$$;
revoke all on function production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;

create function public.read_certification_operation_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare phase text; context jsonb; result jsonb;
begin
 phase:=production_control.certification_operation_phase_v1(input->>'operation_id',false);
 context:=production_control.push_certification_context_v1(input,phase,false);
 result:=production_control.dispatch_certification_operation_v1(input,context,false);
 perform production_control.pop_certification_context_v1();
 return result;
end;
$$;
create function public.execute_certification_operation_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare phase text; context jsonb; result jsonb;
begin
 phase:=production_control.certification_operation_phase_v1(input->>'operation_id',true);
 context:=production_control.push_certification_context_v1(input,phase,true);
 result:=production_control.dispatch_certification_operation_v1(input,context,true);
 if coalesce((result->>'ok')::boolean,false) and not coalesce((result->>'idempotent')::boolean,false)
   and not coalesce((result->>'semantic_noop')::boolean,false) then
  insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
  values('CERTIFICATION_CANONICAL_OPERATION','CERTIFICATION',context->>'tournament_id',input#>>'{authorization,player_id}',
   production_control.cutover_payload_hash(input->'payload'),'SUCCEEDED',jsonb_build_object(
    'runtime','CERTIFICATION','resource_id',context->>'resource_id','installation_id',context->>'installation_id',
    'binding_id',context->>'binding_id','context_token',context->>'context_token',
    'operation_id',input->>'operation_id','operation_request_id',input->>'operation_request_id',
    'actor_auth_user_id',input#>>'{authorization,auth_user_id}','activation_revision',context->'activation_revision',
    'admission_revision',context->'admission_revision','release_commit',context->>'release_commit',
    'receipt',result));
 end if;
 perform production_control.pop_certification_context_v1();
 return result;
end;
$$;
revoke all on function public.read_certification_operation_v1(jsonb),public.execute_certification_operation_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_certification_operation_v1(jsonb),public.execute_certification_operation_v1(jsonb) to service_role;

notify pgrst,'reload schema';
commit;
