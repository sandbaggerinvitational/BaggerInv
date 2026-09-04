-- Phase B.1: retire the unused starting-hole requirement from the current
-- Production Tournament Setup contract. Installation is inert: existing
-- presentation/evidence values are retained and no tournament row is updated.

begin;

alter table scoring_authority.tournament_setup_match_details_v1
  alter column starting_hole drop default,
  alter column starting_hole drop not null;

comment on column scoring_authority.tournament_setup_match_details_v1.starting_hole is
  'Optional legacy evidence only. Current Tournament Setup and scoring do not require or synthesize this value.';

-- Older course materialization explicitly supplied 1. Keep that applied
-- implementation intact, but prevent it from manufacturing a current 2026
-- setup fact when it creates a detail overlay for the first time.
create or replace function production_control.omit_current_starting_hole_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.tournament_id = '2026' then
    new.starting_hole := null;
  end if;
  return new;
end;
$$;

drop trigger if exists production_omit_current_starting_hole_v1
  on scoring_authority.tournament_setup_match_details_v1;
create trigger production_omit_current_starting_hole_v1
before insert on scoring_authority.tournament_setup_match_details_v1
for each row execute function
  production_control.omit_current_starting_hole_v1();

revoke all on function production_control.omit_current_starting_hole_v1()
  from public, anon, authenticated, service_role;

-- Replace only the current 2026 match-context mutation. It continues to use
-- every certified authorization, mutability, revision, dependency and audit
-- boundary in the outer RPC, but no longer accepts, validates, persists,
-- hashes, displays, or returns a starting-hole value.
create or replace function production_control.apply_tournament_setup_match_v1(
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
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'match') = 'object'
    then input->'match' else input end;
  target_round integer;
  target_number integer;
  target_match text;
  supplied_match text := pg_catalog.btrim(coalesce(
    payload->>'match_id', payload->>'matchId', ''
  ));
  target_course text := pg_catalog.btrim(coalesce(
    payload->>'course_id', payload->>'courseId', ''
  ));
  target_tee text := pg_catalog.btrim(coalesce(
    payload->>'tee_id', payload->>'tee', ''
  ));
  target_tee_time time without time zone;
  round_value scoring_authority.rounds%rowtype;
  course_value scoring_authority.tournament_setup_course_tees_v1%rowtype;
  current_match scoring_authority.matches%rowtype;
  current_detail scoring_authority.tournament_setup_match_details_v1%rowtype;
  current_snapshot scoring_authority.scoring_snapshots%rowtype;
  changed_value boolean := false;
  semantic_change boolean := false;
  course_change boolean := false;
  dependencies jsonb;
begin
  begin
    target_round := coalesce(payload->>'round_number',
      payload->>'roundNumber')::integer;
    target_number := coalesce(payload->>'match_number',
      payload->>'matchNumber')::integer;
    target_tee_time := nullif(coalesce(payload->>'tee_time',
      payload->>'teeTime'), '')::time;
  exception when others then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_INPUT_INVALID';
  end;
  if target_round not between 1 and 99 or target_number not between 1 and 99
     or target_course = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_INPUT_INVALID';
  end if;
  target_match := pg_catalog.format('2026-R%s-%s', target_round, target_number);
  if supplied_match <> '' and supplied_match <> target_match then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_ID_INVALID';
  end if;
  select value.* into strict round_value
  from scoring_authority.rounds value
  where value.tournament_id = '2026' and value.round_number = target_round;
  if target_tee = '' then
    select assignment.tee_id into target_tee
    from scoring_authority.tournament_setup_round_courses_v1 assignment
    where assignment.tournament_id = '2026'
      and assignment.round_number = target_round
      and assignment.course_id = target_course;
  end if;
  if pg_catalog.btrim(coalesce(target_tee, '')) = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_TEE_ASSIGNMENT_REQUIRED';
  end if;
  select value.* into strict course_value
  from scoring_authority.tournament_setup_course_tees_v1 value
  where value.tournament_id = '2026' and value.course_id = target_course
    and value.tee_id = target_tee;
  if not exists (
    select 1
    from scoring_authority.tournament_setup_round_courses_v1 assignment
    where assignment.tournament_id = '2026'
      and assignment.round_number = target_round
      and assignment.course_id = target_course
      and assignment.tee_id = target_tee
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_ROUND_COURSE_MISMATCH';
  end if;
  select value.* into current_match
  from scoring_authority.matches value where value.match_id = target_match for update;
  if current_match.match_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'TOURNAMENT_SETUP_EXISTING_MATCH_REQUIRED',
      'blockers', pg_catalog.jsonb_build_array(
        'Tournament Setup can update only an existing canonical match.'
      )
    );
  end if;
  select value.* into current_detail
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.match_id = target_match for update;
  select value.* into strict current_snapshot
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = current_match.scoring_snapshot_id;
  semantic_change := current_match.round_number is distinct from target_round
    or current_match.format is distinct from round_value.format
    or current_snapshot.course_id is distinct from target_course
    or current_snapshot.tee is distinct from target_tee;
  course_change := current_snapshot.course_id is distinct from target_course
    or current_snapshot.tee is distinct from target_tee;
  changed_value := semantic_change or current_detail.match_id is null
    or current_detail.tee_time is distinct from target_tee_time
    or current_detail.course_id is distinct from target_course
    or current_detail.tee_id is distinct from target_tee;
  if changed_value then
    perform production_control.assert_tournament_setup_match_mutable_v1(
      target_match
    );
    if semantic_change then
      dependencies := production_control.tournament_setup_dependency_codes_v1(
        null, null, target_round, target_match, 'MATCH'
      );
      if pg_catalog.jsonb_array_length(dependencies) > 0 then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
          'blockers', dependencies
        );
      end if;
    end if;
    update scoring_authority.matches set
      round_number = target_round,
      format = round_value.format,
      match_revision = match_revision + case when semantic_change then 1 else 0 end,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
    insert into scoring_authority.tournament_setup_match_details_v1 (
      match_id, tournament_id, round_number, match_number, course_id, tee_id,
      tee_time, starting_hole, setup_revision, prepared_setup_revision,
      prepared_configuration_fingerprint, updated_by_player_id
    ) values (
      target_match, '2026', target_round, target_number, target_course,
      target_tee, target_tee_time, null, next_revision, null, null,
      actor_player
    ) on conflict (match_id) do update set
      round_number = excluded.round_number,
      match_number = excluded.match_number,
      course_id = excluded.course_id,
      tee_id = excluded.tee_id,
      tee_time = excluded.tee_time,
      setup_revision = excluded.setup_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    insert into scoring_authority.game_center_presentations (
      match_id, tournament_id, course_name, course_logo, course_yardage,
      tee_time, starting_hole, display_match_number, match_sort_order,
      team_1_logo, team_1_primary_color, team_1_secondary_color,
      team_2_logo, team_2_primary_color, team_2_secondary_color,
      tournament_location, tournament_logo, tournament_status,
      tournament_time_zone, source_workbook_id, source_updated_at,
      source_payload_hash, imported_by
    ) values (
      target_match, '2026', course_value.display_name, '', '',
      coalesce(target_tee_time::text, ''), '',
      target_number::text, target_round * 100 + target_number,
      coalesce((select template.team_1_logo
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_1_primary_color
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_1_secondary_color
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_2_logo
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_2_primary_color
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_2_secondary_color
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select operational.destination
        from scoring_authority.tournament_setup_operational_v1 operational
        where operational.tournament_id = '2026'), ''),
      coalesce((select template.tournament_logo
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      'UPCOMING',
      coalesce((select operational.timezone
        from scoring_authority.tournament_setup_operational_v1 operational
        where operational.tournament_id = '2026'), 'America/Chicago'),
      (select tournament.source_workbook_id
       from scoring_authority.tournaments tournament
       where tournament.tournament_id = '2026'),
      null,
      production_control.tournament_setup_hash_v1(
        pg_catalog.jsonb_build_object(
          'match_id', target_match, 'course_name', course_value.display_name,
          'tee_time', target_tee_time,
          'match_number', target_number, 'round_number', target_round
        )
      ), actor_player
    ) on conflict (match_id) do update set
      course_name = excluded.course_name,
      course_logo = case when course_change then excluded.course_logo
        else scoring_authority.game_center_presentations.course_logo end,
      course_yardage = case when course_change then excluded.course_yardage
        else scoring_authority.game_center_presentations.course_yardage end,
      tee_time = excluded.tee_time,
      display_match_number = excluded.display_match_number,
      match_sort_order = excluded.match_sort_order,
      tournament_location = excluded.tournament_location,
      tournament_status = excluded.tournament_status,
      tournament_time_zone = excluded.tournament_time_zone,
      source_payload_hash = excluded.source_payload_hash,
      imported_by = excluded.imported_by,
      updated_at = pg_catalog.clock_timestamp();
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'MATCH', 'targetId', target_match,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'matchId', target_match, 'roundNumber', target_round,
      'matchNumber', target_number, 'format', round_value.format,
      'courseId', target_course, 'tee', target_tee,
      'created', false,
      'scoringPermissionGranted', false,
      'scoringMutationCreated', false
    )
  );
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_ROUND_OR_COURSE_NOT_FOUND';
end;
$$;

revoke all on function production_control.apply_tournament_setup_match_v1(
  jsonb, bigint, text
) from public, anon, authenticated, service_role;

-- Reissue the current scoring-context preparation function without the legacy
-- field in its configuration fingerprint. Snapshot contents, handicap math,
-- hole order, participant configuration and every existing safety assertion
-- remain unchanged.
create or replace function production_control.apply_tournament_setup_scoring_context_v1(
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
  payload jsonb := case
    when pg_catalog.jsonb_typeof(input->'scoring_context') = 'object'
      then input->'scoring_context'
    else input end;
  target_match text := pg_catalog.btrim(coalesce(
    payload->>'match_id', payload->>'matchId', ''
  ));
  match_value scoring_authority.matches%rowtype;
  current_snapshot scoring_authority.scoring_snapshots%rowtype;
  round_value scoring_authority.rounds%rowtype;
  detail_value scoring_authority.tournament_setup_match_details_v1%rowtype;
  course_value scoring_authority.tournament_setup_course_tees_v1%rowtype;
  current_handicap uuid;
  holes_value jsonb;
  participant_manifest jsonb;
  preparation_fingerprint text;
  next_snapshot_revision bigint;
  next_snapshot_id text;
  context_value jsonb;
  participant_item jsonb;
  next_snapshot_hash text;
  dependencies jsonb;
  expected_count integer;
  changed_value boolean := true;
begin
  if target_match = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_SCORING_CONTEXT_INPUT_INVALID';
  end if;
  select value.* into strict match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.match_id = target_match
  for update;
  perform production_control.assert_tournament_setup_match_mutable_v1(
    target_match
  );
  select value.* into strict current_snapshot
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = match_value.scoring_snapshot_id
    and value.match_id = target_match for update;
  select value.* into strict round_value
  from scoring_authority.rounds value
  where value.tournament_id = '2026'
    and value.round_number = match_value.round_number;
  if match_value.format <> round_value.format then
    raise exception using errcode = '55000',
      message = 'TOURNAMENT_SETUP_MATCH_ROUND_FORMAT_MISMATCH';
  end if;
  select value.* into strict detail_value
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.match_id = target_match for update;
  select value.* into strict course_value
  from scoring_authority.tournament_setup_course_tees_v1 value
  where value.tournament_id = '2026'
    and value.course_id = detail_value.course_id
    and value.tee_id = detail_value.tee_id;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'hole_number', hole.hole_number, 'par', hole.par,
    'stroke_index', hole.stroke_index, 'yardage', hole.yardage
  ) order by hole.hole_number) into holes_value
  from scoring_authority.tournament_setup_course_holes_v1 hole
  where hole.tournament_id = '2026'
    and hole.course_id = detail_value.course_id
    and hole.tee_id = detail_value.tee_id;
  if pg_catalog.jsonb_array_length(coalesce(holes_value, '[]'::jsonb)) <> 18
     or (select pg_catalog.sum((value->>'par')::integer)
       from pg_catalog.jsonb_array_elements(holes_value) value)
       <> course_value.par then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_HOLES_INCOMPLETE';
  end if;
  expected_count := case when match_value.format = 'SI' then 2 else 4 end;
  if (select pg_catalog.count(*)
      from scoring_authority.match_participants participant
      where participant.match_id = target_match) <> expected_count then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRINGS_INCOMPLETE';
  end if;
  select current_value.revision_id into strict current_handicap
  from scoring_authority.handicap_revision_current current_value
  where current_value.tournament_id = '2026';
  if exists (
    select 1 from scoring_authority.match_participants participant
    where participant.match_id = target_match
      and not exists (
        select 1 from scoring_authority.handicap_revision_entries entry
        where entry.revision_id = current_handicap
          and entry.tournament_id = '2026'
          and entry.player_id = participant.player_id
      )
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_APPROVED_HANDICAP_COVERAGE_REQUIRED';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'player_id', participant.player_id,
    'team_side', participant.team_side,
    'player_slot', participant.player_slot
  ) order by participant.team_side, participant.player_slot)
  into participant_manifest
  from scoring_authority.match_participants participant
  where participant.match_id = target_match;
  preparation_fingerprint := production_control.tournament_setup_hash_v1(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-tournament-setup-v1',
      'tournament_id', '2026', 'match_id', target_match,
      'round_number', match_value.round_number, 'format', match_value.format,
      'handicap_allowance', round_value.handicap_allowance,
      'course_id', detail_value.course_id, 'tee', detail_value.tee_id,
      'rating', course_value.rating, 'slope', course_value.slope,
      'par', course_value.par, 'holes', holes_value,
      'participants', participant_manifest,
      'handicap_revision_id', current_handicap,
      'setup_revision', detail_value.setup_revision
    )
  );
  if detail_value.prepared_setup_revision = detail_value.setup_revision
     and detail_value.prepared_configuration_fingerprint =
       preparation_fingerprint
     and current_snapshot.handicap_revision_id = current_handicap
     and current_snapshot.course_id = detail_value.course_id
     and current_snapshot.tee = detail_value.tee_id then
    changed_value := false;
  end if;
  if changed_value then
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      null, null, match_value.round_number, target_match, 'SCORING_CONTEXT'
    );
    if pg_catalog.jsonb_array_length(dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', dependencies
      );
    end if;
    select coalesce(pg_catalog.max(snapshot.snapshot_revision), 0) + 1
      into next_snapshot_revision
    from scoring_authority.scoring_snapshots snapshot
    where snapshot.match_id = target_match;
    next_snapshot_id := target_match || ':S' || next_snapshot_revision::text;
    next_snapshot_hash := production_control.tournament_setup_hash_v1(
      pg_catalog.jsonb_build_object(
        'preparation_fingerprint', preparation_fingerprint,
        'snapshot_revision', next_snapshot_revision,
        'state', 'PREPARING'
      )
    );
    insert into scoring_authority.scoring_snapshots (
      snapshot_id, tournament_id, match_id, snapshot_revision,
      scoring_rules_version, format, handicap_allowance,
      course_id, tee, rating, slope, par, match_netting_baseline,
      hole_definitions, participant_configuration, team_configuration,
      effective_at, canonical_hash, handicap_revision_id
    ) values (
      next_snapshot_id, '2026', target_match, next_snapshot_revision,
      current_snapshot.scoring_rules_version, match_value.format,
      round_value.handicap_allowance,
      detail_value.course_id, detail_value.tee_id, course_value.rating,
      course_value.slope, course_value.par,
      current_snapshot.match_netting_baseline, holes_value,
      current_snapshot.participant_configuration,
      current_snapshot.team_configuration,
      pg_catalog.clock_timestamp(), next_snapshot_hash, current_handicap
    );
    update scoring_authority.matches set
      scoring_snapshot_id = next_snapshot_id,
      match_revision = match_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
    context_value := production_control.handicap_v1_match_context(
      target_match, current_handicap
    );
    for participant_item in select value
      from pg_catalog.jsonb_array_elements(
        context_value->'participants'
      ) item(value)
    loop
      update scoring_authority.match_participants set
        tournament_handicap =
          (participant_item->>'tournament_handicap')::numeric,
        handicap_index = (participant_item->>'handicap_index')::numeric,
        course_handicap = (participant_item->>'course_handicap')::numeric,
        playing_handicap = (participant_item->>'playing_handicap')::numeric,
        final_strokes = (participant_item->>'final_strokes')::integer,
        handicap_revision_id = current_handicap
      where match_id = target_match
        and player_id = participant_item->>'player_id';
    end loop;
    next_snapshot_hash := production_control.tournament_setup_hash_v1(
      pg_catalog.jsonb_build_object(
        'preparation_fingerprint', preparation_fingerprint,
        'snapshot_revision', next_snapshot_revision,
        'participants', context_value->'participant_configuration',
        'teams', context_value->'team_configuration'
      )
    );
    update scoring_authority.scoring_snapshots set
      participant_configuration = context_value->'participant_configuration',
      team_configuration = context_value->'team_configuration',
      canonical_hash = next_snapshot_hash,
      handicap_revision_id = current_handicap
    where snapshot_id = next_snapshot_id;
    delete from scoring_authority.match_holes hole
    where hole.match_id = target_match;
    insert into scoring_authority.match_holes (
      match_id, hole_number, snapshot_id, stroke_index, par, yardage
    ) select target_match, (value->>'hole_number')::integer,
      next_snapshot_id, (value->>'stroke_index')::integer,
      (value->>'par')::integer, nullif(value->>'yardage', '')::integer
    from pg_catalog.jsonb_array_elements(holes_value) value;
    update scoring_authority.tournament_setup_match_details_v1 set
      prepared_setup_revision = setup_revision,
      prepared_configuration_fingerprint = preparation_fingerprint,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'SCORING_CONTEXT', 'targetId', target_match,
    'snapshotPrepared', true,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'matchId', target_match,
      'snapshotId', case when changed_value then next_snapshot_id
        else current_snapshot.snapshot_id end,
      'snapshotRevision', case when changed_value then next_snapshot_revision
        else current_snapshot.snapshot_revision end,
      'handicapRevisionId', current_handicap,
      'scoringPermissionGranted', false,
      'scoringMutationCreated', false
    )
  );
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_SCORING_CONTEXT_REQUIRED_FACT_MISSING';
end;
$$;

revoke all on function production_control.apply_tournament_setup_scoring_context_v1(
  jsonb, bigint, text
) from public, anon, authenticated, service_role;

commit;
