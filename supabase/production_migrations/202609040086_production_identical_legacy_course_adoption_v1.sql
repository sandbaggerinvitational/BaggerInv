-- Identical legacy course adoption only. Installation is inert: no domain rows
-- are inserted/updated/deleted. The general dependency guard stays unchanged.
begin;

-- One ordered semantic representation for proposed, snapshot and active holes.
-- Unknown keys are not authority; all scoring/yardage fields must be explicit.
create function production_control.legacy_course_adoption_holes_v1(input jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  value jsonb;
  result_value jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(input) is distinct from 'array'
     or jsonb_array_length(input) <> 18 then return null; end if;
  for value in select item from jsonb_array_elements(input) item loop
    if jsonb_typeof(value) is distinct from 'object'
       or coalesce(value->>'hole_number', '') !~ '^[0-9]+$'
       or coalesce(value->>'par', '') !~ '^[0-9]+$'
       or coalesce(value->>'stroke_index', '') !~ '^[0-9]+$'
       or not (value ? 'yardage')
       or (value->>'yardage' is not null
         and value->>'yardage' !~ '^[0-9]+$')
       or (value->>'hole_number')::integer not between 1 and 18
       or (value->>'par')::integer not between 3 and 6
       or (value->>'stroke_index')::integer not between 1 and 18
       or (value->>'yardage')::integer not between 1 and 999 then
      return null;
    end if;
    result_value := result_value || jsonb_build_array(jsonb_build_object(
      'hole_number', (value->>'hole_number')::integer,
      'par', (value->>'par')::integer,
      'stroke_index', (value->>'stroke_index')::integer,
      'yardage', (value->>'yardage')::integer
    ));
  end loop;
  if (select count(distinct item->>'hole_number') from jsonb_array_elements(result_value) item) <> 18
     or (select count(distinct item->>'stroke_index') from jsonb_array_elements(result_value) item) <> 18 then
    return null;
  end if;
  return (select jsonb_agg(item order by (item->>'hole_number')::integer)
    from jsonb_array_elements(result_value) item);
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end;
$$;

-- Read-only certification. Never callable directly by clients/service_role.
-- The mutation additionally locks the affected matches and serializes with
-- publication and Odds jobs before invoking this proof in the transaction.
create function production_control.certify_identical_legacy_course_adoption_v1(
  target_tournament text, manifest jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  holes jsonb;
  actual_holes jsonb;
  actual_rounds jsonb;
  target_course text := manifest->>'course_id';
  target_tee text := manifest->>'tee';
  rounds_value jsonb := manifest->'round_numbers';
  match_value scoring_authority.matches%rowtype;
  snapshot scoring_authority.scoring_snapshots%rowtype;
  detail scoring_authority.tournament_setup_match_details_v1%rowtype;
  matched_count integer := 0;
  hole_fingerprint text;
begin
  -- This extends only the installed current-2026 Setup operation, not annual
  -- activation, global course creation, or dormant/Preview authoring.
  if target_tournament is distinct from '2026'
     or coalesce(target_course, '') = '' or coalesce(target_tee, '') = ''
     or jsonb_typeof(rounds_value) is distinct from 'array'
     or jsonb_array_length(rounds_value) = 0
     or exists (select 1 from jsonb_array_elements_text(rounds_value) r
       where r !~ '^[1-9][0-9]*$')
     or exists (select 1 from scoring_authority.tournament_setup_course_tees_v1 c
       where c.tournament_id = target_tournament
         and c.course_id = target_course and c.tee_id = target_tee) then
    return jsonb_build_object('eligible', false);
  end if;
  holes := production_control.legacy_course_adoption_holes_v1(manifest->'holes');
  if holes is null or (select sum((h->>'par')::integer)
       from jsonb_array_elements(holes) h) is distinct from (manifest->>'par')::integer
     or (manifest->>'rating')::numeric is null
     or (manifest->>'slope')::integer is null then
    return jsonb_build_object('eligible', false);
  end if;
  hole_fingerprint := encode(extensions.digest(holes::text, 'sha256'), 'hex');

  -- The old operation materializes all matches sharing this course/tee. Require
  -- callers to name that entire round set, and reject any round whose matches
  -- disagree or hide an override. Never silently select one retained snapshot.
  select jsonb_agg(r order by r) into actual_rounds from (
    select distinct m.round_number r from scoring_authority.matches m
    join scoring_authority.scoring_snapshots s on s.snapshot_id = m.scoring_snapshot_id
    where m.tournament_id = target_tournament
      and s.course_id = target_course and s.tee = target_tee
  ) rounds;
  if actual_rounds is distinct from rounds_value then
    return jsonb_build_object('eligible', false);
  end if;
  for match_value in select m.* from scoring_authority.matches m
    where m.tournament_id = target_tournament
      and m.round_number in (select r::integer from jsonb_array_elements_text(rounds_value) r)
    order by m.match_id
  loop
    if match_value.status <> 'UPCOMING'
       or not production_control.handicap_v1_match_is_unstarted(match_value.match_id)
       or match_value.unresolved_mutations <> 0
       or exists (select 1 from scoring_authority.score_mutations s where s.match_id = match_value.match_id)
       or exists (select 1 from scoring_authority.hole_scores s where s.match_id = match_value.match_id)
       or exists (select 1 from scoring_authority.finalized_scorecard_snapshots s where s.match_id = match_value.match_id)
       or exists (select 1 from scoring_authority.scoring_ingress_leases l
         where l.match_id = match_value.match_id and l.expires_at > statement_timestamp())
       or exists (select 1 from scoring_authority.scoring_permissions p
         where p.match_id = match_value.match_id and (p.can_score or p.revoked_at is null
           or p.permission_revision <> match_value.permission_revision)) then
      return jsonb_build_object('eligible', false);
    end if;
    select s.* into strict snapshot from scoring_authority.scoring_snapshots s
      where s.snapshot_id = match_value.scoring_snapshot_id
        and s.match_id = match_value.match_id and s.tournament_id = target_tournament;
    if snapshot.course_id is distinct from target_course or snapshot.tee is distinct from target_tee
       or snapshot.rating is distinct from (manifest->>'rating')::numeric
       or snapshot.slope is distinct from (manifest->>'slope')::integer
       or snapshot.par is distinct from (manifest->>'par')::integer
       or production_control.legacy_course_adoption_holes_v1(snapshot.hole_definitions) is distinct from holes then
      return jsonb_build_object('eligible', false);
    end if;
    select jsonb_agg(jsonb_build_object('hole_number', h.hole_number, 'par', h.par,
      'stroke_index', h.stroke_index, 'yardage', h.yardage) order by h.hole_number)
      into actual_holes from scoring_authority.match_holes h where h.match_id = match_value.match_id;
    if production_control.legacy_course_adoption_holes_v1(actual_holes) is distinct from holes
       or exists (select 1 from scoring_authority.match_holes h
         where h.match_id = match_value.match_id and h.snapshot_id <> snapshot.snapshot_id)
       or encode(extensions.digest(actual_holes::text, 'sha256'), 'hex') is distinct from hole_fingerprint then
      return jsonb_build_object('eligible', false);
    end if;
    select d.* into detail from scoring_authority.tournament_setup_match_details_v1 d
      where d.match_id = match_value.match_id;
    if found and (detail.tournament_id <> target_tournament
       or detail.round_number <> match_value.round_number
       or detail.course_id is distinct from target_course or detail.tee_id is distinct from target_tee
       or detail.prepared_setup_revision is not null or detail.prepared_configuration_fingerprint is not null) then
      return jsonb_build_object('eligible', false);
    end if;
    if exists (select 1 from scoring_authority.tournament_setup_round_courses_v1 a
      where a.tournament_id = target_tournament and a.round_number = match_value.round_number
        and (a.course_id <> target_course or a.tee_id <> target_tee)) then
      return jsonb_build_object('eligible', false);
    end if;
    matched_count := matched_count + 1;
  end loop;
  if matched_count = 0 then return jsonb_build_object('eligible', false); end if;
  return jsonb_build_object('eligible', true, 'courseId', target_course, 'tee', target_tee,
    'matchCount', matched_count, 'orderedHoleFingerprint', hole_fingerprint);
exception when no_data_found or invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('eligible', false);
end;
$$;

revoke all on function production_control.legacy_course_adoption_holes_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function production_control.certify_identical_legacy_course_adoption_v1(text, jsonb)
  from public, anon, authenticated, service_role;

-- Retain the certified operation and all existing write/revision semantics;
-- only the dependency decision above materialization is extended.
create or replace function production_control.apply_tournament_setup_course_v1(
  input jsonb,
  next_revision bigint,
  actor_player text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'course') = 'object'
    then input->'course' else input end;
  requested_course text := pg_catalog.btrim(coalesce(
    payload->>'course_id', payload->>'courseId', ''
  ));
  target_course text;
  target_tee text := pg_catalog.btrim(coalesce(
    payload->>'tee_id', payload->>'tee', ''
  ));
  target_name text;
  target_location text;
  target_rating numeric;
  target_slope integer;
  target_par integer;
  holes_input jsonb := payload->'holes';
  rounds_input jsonb;
  normalized_holes jsonb := '[]'::jsonb;
  normalized_rounds jsonb := '[]'::jsonb;
  hole_value jsonb;
  round_value jsonb;
  hole_number integer;
  hole_par integer;
  stroke_index integer;
  yardage_value integer;
  round_number_value integer;
  current_manifest jsonb;
  target_manifest jsonb;
  changed_value boolean := false;
  dependencies jsonb;
  equivalence jsonb;
  warning_values jsonb := '[]'::jsonb;
begin
  if requested_course = '' or target_tee = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_ID_TEE_REQUIRED';
  end if;
  select known.course_id into target_course
  from (
    select course.course_id, 1 priority
    from scoring_authority.tournament_setup_course_tees_v1 course
    where course.tournament_id = '2026'
    union all
    select snapshot.course_id, 2
    from scoring_authority.scoring_snapshots snapshot
    where snapshot.tournament_id = '2026'
    union all
    select identity_value.course_id, 3
    from scoring_authority.completed_history_course_identities identity_value
  ) known
  where pg_catalog.lower(known.course_id) = pg_catalog.lower(requested_course)
  order by (known.course_id = requested_course) desc, known.priority
  limit 1;
  if target_course is null then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_EXISTING_COURSE_ID_REQUIRED';
  end if;
  target_name := pg_catalog.btrim(coalesce(
    payload->>'course_name', payload->>'display_name',
    payload->>'displayName', payload->>'name',
    (select course.display_name
      from scoring_authority.tournament_setup_course_tees_v1 course
      where course.tournament_id = '2026'
        and course.course_id = target_course and course.tee_id = target_tee),
    (select identity_value.canonical_name
      from scoring_authority.completed_history_course_identities identity_value
      where identity_value.course_id = target_course),
    target_course
  ));
  target_location := nullif(pg_catalog.btrim(coalesce(
    payload->>'location', nullif(pg_catalog.concat_ws(', ',
      nullif(pg_catalog.btrim(payload->>'city'), ''),
      nullif(pg_catalog.btrim(payload->>'state'), '')
    ), ''),
    (select course.location
      from scoring_authority.tournament_setup_course_tees_v1 course
      where course.tournament_id = '2026'
        and course.course_id = target_course and course.tee_id = target_tee),
    (select identity_value.canonical_location
      from scoring_authority.completed_history_course_identities identity_value
      where identity_value.course_id = target_course), ''
  )), '');
  begin
    target_rating := coalesce(payload->>'rating',
      payload->>'courseRating')::numeric;
    target_slope := coalesce(payload->>'slope',
      payload->>'slopeRating')::integer;
    target_par := (payload->>'par')::integer;
  exception when others then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_SCORING_VALUES_INVALID';
  end;
  if target_name = '' or pg_catalog.length(target_name) > 240
     or target_rating is null or target_rating <= 0 or target_rating > 100
     or target_slope not between 55 and 155
     or target_par not between 54 and 90
     or pg_catalog.jsonb_typeof(holes_input) is distinct from 'array'
     or pg_catalog.jsonb_array_length(holes_input) <> 18 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_SCORING_VALUES_INVALID';
  end if;
  for hole_value in
    select item from pg_catalog.jsonb_array_elements(holes_input) item
  loop
    begin
      hole_number := coalesce(hole_value->>'hole_number',
        hole_value->>'holeNumber', hole_value->>'number')::integer;
      hole_par := (hole_value->>'par')::integer;
      stroke_index := coalesce(hole_value->>'stroke_index',
        hole_value->>'strokeIndex')::integer;
      yardage_value := nullif(hole_value->>'yardage', '')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_HOLE_DEFINITION_INVALID';
    end;
    if hole_number not between 1 and 18 or hole_par not between 3 and 6
       or stroke_index not between 1 and 18
       or (yardage_value is not null and yardage_value not between 1 and 999)
    then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_HOLE_DEFINITION_INVALID';
    end if;
    normalized_holes := normalized_holes || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'hole_number', hole_number, 'par', hole_par,
        'stroke_index', stroke_index, 'yardage', yardage_value
      )
    );
  end loop;
  select pg_catalog.jsonb_agg(value order by (value->>'hole_number')::integer)
    into normalized_holes
  from pg_catalog.jsonb_array_elements(normalized_holes) value;
  if (select pg_catalog.count(distinct (value->>'hole_number')::integer)
      from pg_catalog.jsonb_array_elements(normalized_holes) value) <> 18
     or (select pg_catalog.count(distinct (value->>'stroke_index')::integer)
      from pg_catalog.jsonb_array_elements(normalized_holes) value) <> 18
     or (select pg_catalog.sum((value->>'par')::integer)
      from pg_catalog.jsonb_array_elements(normalized_holes) value)
        <> target_par then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_HOLE_NUMBER_STROKE_INDEX_INCOMPLETE';
  end if;

  rounds_input := case
    when pg_catalog.jsonb_typeof(payload->'round_numbers') = 'array'
      then payload->'round_numbers'
    when pg_catalog.jsonb_typeof(payload->'roundNumbers') = 'array'
      then payload->'roundNumbers'
    when coalesce(payload->>'round_number', payload->>'roundNumber', '') <> ''
      then pg_catalog.jsonb_build_array(coalesce(payload->>'round_number',
        payload->>'roundNumber')::integer)
    else '[]'::jsonb end;
  if pg_catalog.jsonb_array_length(rounds_input) = 0 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_ROUND_ASSIGNMENT_REQUIRED';
  end if;
  for round_value in
    select item from pg_catalog.jsonb_array_elements(rounds_input) item
  loop
    begin
      round_number_value := (round_value #>> '{}')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_COURSE_ROUND_INVALID';
    end;
    if not exists (
      select 1 from scoring_authority.rounds round_row
      where round_row.tournament_id = '2026'
        and round_row.round_number = round_number_value
    ) then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_COURSE_ROUND_INVALID';
    end if;
    normalized_rounds := normalized_rounds ||
      pg_catalog.jsonb_build_array(round_number_value);
  end loop;
  select pg_catalog.jsonb_agg(value order by (value #>> '{}')::integer)
    into normalized_rounds
  from (
    select distinct value from (
      select value
      from pg_catalog.jsonb_array_elements(normalized_rounds) value
      union all
      select pg_catalog.to_jsonb(assignment.round_number)
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = '2026'
        and assignment.course_id = target_course
        and assignment.tee_id = target_tee
    ) retained
  ) deduplicated;

  select pg_catalog.jsonb_build_object(
    'course_id', course.course_id, 'tee', course.tee_id,
    'display_name', course.display_name, 'location', course.location,
    'rating', course.rating, 'slope', course.slope, 'par', course.par,
    'holes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'hole_number', hole.hole_number, 'par', hole.par,
        'stroke_index', hole.stroke_index, 'yardage', hole.yardage
      ) order by hole.hole_number)
      from scoring_authority.tournament_setup_course_holes_v1 hole
      where hole.tournament_id = course.tournament_id
        and hole.course_id = course.course_id and hole.tee_id = course.tee_id
    ), '[]'::jsonb),
    'round_numbers', coalesce((
      select pg_catalog.jsonb_agg(assignment.round_number
        order by assignment.round_number)
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = course.tournament_id
        and assignment.course_id = course.course_id
        and assignment.tee_id = course.tee_id
    ), '[]'::jsonb)
  ) into current_manifest
  from scoring_authority.tournament_setup_course_tees_v1 course
  where course.tournament_id = '2026' and course.course_id = target_course
    and course.tee_id = target_tee;
  target_manifest := pg_catalog.jsonb_build_object(
    'course_id', target_course, 'tee', target_tee,
    'display_name', target_name, 'location', target_location,
    'rating', target_rating, 'slope', target_slope, 'par', target_par,
    'holes', normalized_holes, 'round_numbers', normalized_rounds
  );
  changed_value := current_manifest is distinct from target_manifest;
  if changed_value then
    -- Match the existing publication -> Odds-runtime lock order. Job requests
    -- and worker transitions hold the shared runtime lock; publication holds
    -- the publication lock. Keep both proofs stable through the Setup commit.
    perform pg_catalog.pg_advisory_xact_lock(731132026057::bigint);
    perform pg_catalog.pg_advisory_xact_lock(731102026031::bigint);
    perform 1 from scoring_authority.matches m
    where m.tournament_id = '2026' and (
      m.round_number in (select (r #>> '{}')::integer
        from pg_catalog.jsonb_array_elements(normalized_rounds) r)
      or exists (select 1 from scoring_authority.scoring_snapshots s
        where s.snapshot_id = m.scoring_snapshot_id
          and s.course_id = target_course and s.tee = target_tee)
    ) order by m.match_id for update;
    if exists (
      select 1
      from scoring_authority.matches match_value
      join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
      where match_value.tournament_id = '2026'
        and snapshot.course_id = target_course and snapshot.tee = target_tee
        and not production_control.handicap_v1_match_is_unstarted(
          match_value.match_id
        )
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_STARTED_MATCH_LOCKED',
        'blockers', pg_catalog.jsonb_build_array('STARTED_MATCH_DEPENDENCY')
      );
    end if;
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      null, null, null, null, 'COURSE'
    );
    -- Never change the shared dependency guard. This exception removes only
    -- an existing published-snapshot dependency, never active/publish-ready work.
    if dependencies ? 'ODDS_PUBLICATION_DEPENDENCY'
       and exists (select 1 from scoring_authority.odds_publication_current p
         where p.tournament_id = '2026' and p.publication_state = 'PUBLISHED')
       and not exists (select 1 from scoring_authority.odds_calculation_jobs j
         where j.tournament_id = '2026' and (
           j.status in ('PENDING', 'RUNNING', 'RETRYABLE')
           or (j.status = 'SUCCEEDED' and j.publication_status = 'READY')
         )) then
      equivalence := production_control.certify_identical_legacy_course_adoption_v1(
        '2026', target_manifest
      );
      if coalesce((equivalence->>'eligible')::boolean, false) then
        select coalesce(pg_catalog.jsonb_agg(code), '[]'::jsonb) into dependencies
        from pg_catalog.jsonb_array_elements(dependencies) code
        where code #>> '{}' <> 'ODDS_PUBLICATION_DEPENDENCY';
        warning_values := pg_catalog.jsonb_build_array('ODDS_PUBLICATION_REVIEW_REQUIRED');
      end if;
    end if;
    if pg_catalog.jsonb_array_length(dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', dependencies
      );
    end if;
    insert into scoring_authority.tournament_setup_course_tees_v1 (
      tournament_id, course_id, tee_id, display_name, location,
      rating, slope, par, setup_revision, updated_by_player_id
    ) values (
      '2026', target_course, target_tee, target_name, target_location,
      target_rating, target_slope, target_par, next_revision, actor_player
    ) on conflict (tournament_id, course_id, tee_id) do update set
      display_name = excluded.display_name,
      location = excluded.location,
      rating = excluded.rating,
      slope = excluded.slope,
      par = excluded.par,
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    delete from scoring_authority.tournament_setup_course_holes_v1
    where tournament_id = '2026' and course_id = target_course
      and tee_id = target_tee;
    insert into scoring_authority.tournament_setup_course_holes_v1 (
      tournament_id, course_id, tee_id, hole_number, par, stroke_index,
      yardage, setup_revision
    ) select '2026', target_course, target_tee,
      (value->>'hole_number')::integer, (value->>'par')::integer,
      (value->>'stroke_index')::integer,
      nullif(value->>'yardage', '')::integer, next_revision
    from pg_catalog.jsonb_array_elements(normalized_holes) value;
    insert into scoring_authority.tournament_setup_round_courses_v1 (
      tournament_id, round_number, course_id, tee_id, setup_revision,
      updated_by_player_id
    ) select '2026', (value #>> '{}')::integer, target_course,
      target_tee, next_revision, actor_player
    from pg_catalog.jsonb_array_elements(rounds_input) value
    on conflict (tournament_id, round_number) do update set
      course_id = excluded.course_id,
      tee_id = excluded.tee_id,
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    insert into scoring_authority.tournament_setup_match_details_v1 (
      match_id, tournament_id, round_number, match_number, course_id, tee_id,
      tee_time, starting_hole, setup_revision, prepared_setup_revision,
      prepared_configuration_fingerprint, updated_by_player_id
    )
    select match_value.match_id, '2026', match_value.round_number,
      nullif(pg_catalog.regexp_replace(match_value.match_id, '^.*-', ''), '')::integer,
      target_course, target_tee,
      nullif(presentation.tee_time, '')::time,
      coalesce(nullif(presentation.starting_hole, '')::integer, 1),
      next_revision, null, null, actor_player
    from scoring_authority.matches match_value
    join scoring_authority.scoring_snapshots snapshot
      on snapshot.snapshot_id = match_value.scoring_snapshot_id
    left join scoring_authority.game_center_presentations presentation
      on presentation.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
      and snapshot.course_id = target_course and snapshot.tee = target_tee
      and production_control.handicap_v1_match_is_unstarted(
        match_value.match_id
      )
    on conflict (match_id) do update set
      setup_revision = excluded.setup_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    update scoring_authority.tournament_setup_match_details_v1 detail set
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      setup_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where detail.tournament_id = '2026'
      and (detail.course_id = target_course and detail.tee_id = target_tee
        or detail.round_number in (
          select (value #>> '{}')::integer
          from pg_catalog.jsonb_array_elements(normalized_rounds) value
        ));
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'warnings', warning_values,
    'targetKind', 'COURSE_TEE',
    'targetId', target_course || ':' || target_tee,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'courseId', target_course, 'tee', target_tee,
      'holeCount', 18, 'roundNumbers', normalized_rounds,
      'complete', true,
      'identicalLegacyAdoption', coalesce((equivalence->>'eligible')::boolean, false)
    )
  );
end;
$$;

revoke all on function production_control.apply_tournament_setup_course_v1(jsonb, bigint, text)
  from public, anon, authenticated, service_role;

commit;
