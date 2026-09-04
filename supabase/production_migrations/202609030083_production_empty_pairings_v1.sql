-- Post-Step 14: general zero-or-complete pairing semantics.
--
-- Installation is inert. This migration only replaces the bounded Tournament
-- Setup pairing implementation and adds private helpers. No match, participant,
-- permission, snapshot, setup revision, receipt, or audit row is changed here.
begin;

create or replace function production_control.assert_tournament_setup_pairing_clear_safe_v1(
  target_match_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  match_value scoring_authority.matches%rowtype;
begin
  select value.* into strict match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.match_id = target_match_id
  for update;

  perform 1
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.match_id = target_match_id
    and lease.expires_at > pg_catalog.clock_timestamp()
  for update;

  if not production_control.handicap_v1_match_is_unstarted(target_match_id)
     or exists (
       select 1
       from scoring_authority.scoring_permissions permission
       where permission.match_id = target_match_id
         and (permission.can_score
           or permission.permission_revision <> match_value.permission_revision)
     )
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.match_id = target_match_id
         and lease.expires_at > pg_catalog.clock_timestamp()
     )
     or exists (
       select 1 from scoring_authority.finalized_scorecard_snapshots finalized
       where finalized.match_id = target_match_id
     ) then
    raise exception using errcode = '55000',
      message = 'TOURNAMENT_SETUP_PAIRING_CLEAR_UNSAFE';
  end if;
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_MATCH_NOT_FOUND';
end;
$$;

create or replace function production_control.materialize_tournament_setup_legacy_match_v1(
  target_match_id text,
  next_revision bigint,
  actor_player text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  match_value scoring_authority.matches%rowtype;
  snapshot_value scoring_authority.scoring_snapshots%rowtype;
  presentation_value scoring_authority.game_center_presentations%rowtype;
  target_match_number integer;
  target_starting_hole integer;
  target_tee_time time without time zone;
  target_course_name text;
  target_course_location text;
  hole_count integer;
  stroke_count integer;
  hole_par integer;
  existing_hole_count integer;
  existing_round_course scoring_authority.tournament_setup_round_courses_v1%rowtype;
begin
  if exists (
    select 1 from scoring_authority.tournament_setup_match_details_v1 detail
    where detail.match_id = target_match_id
  ) then
    return false;
  end if;

  select value.* into strict match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.match_id = target_match_id
  for update;
  select value.* into strict snapshot_value
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = match_value.scoring_snapshot_id
    and value.tournament_id = '2026'
    and value.match_id = target_match_id;
  select value.* into strict presentation_value
  from scoring_authority.game_center_presentations value
  where value.tournament_id = '2026' and value.match_id = target_match_id;

  begin
    target_match_number := coalesce(
      nullif(pg_catalog.btrim(presentation_value.display_match_number), '')::integer,
      nullif(pg_catalog.regexp_replace(target_match_id, '^.*-', ''), '')::integer
    );
    target_starting_hole := nullif(
      pg_catalog.btrim(presentation_value.starting_hole), ''
    )::integer;
    target_tee_time := case
      when nullif(pg_catalog.btrim(presentation_value.tee_time), '') is null
        then null
      else presentation_value.tee_time::time without time zone
    end;
  exception when others then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_INVALID';
  end;

  if snapshot_value.format is distinct from match_value.format
     or pg_catalog.btrim(coalesce(snapshot_value.course_id, '')) = ''
     or pg_catalog.btrim(coalesce(snapshot_value.tee, '')) = ''
     or snapshot_value.rating is null or snapshot_value.rating <= 0
     or snapshot_value.slope is null or snapshot_value.slope not between 55 and 155
     or snapshot_value.par not between 54 and 90
     or target_match_number not between 1 and 99
     or target_starting_hole not between 1 and 18
     or not exists (
       select 1 from scoring_authority.rounds round_value
       where round_value.tournament_id = '2026'
         and round_value.round_number = match_value.round_number
         and round_value.format = match_value.format
     )
     or pg_catalog.jsonb_typeof(snapshot_value.hole_definitions)
       is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_INVALID';
  end if;

  begin
    select pg_catalog.count(*)::integer,
      pg_catalog.count(distinct coalesce(
        hole->>'hole_number', hole->>'holeNumber', hole->>'number'
      ))::integer,
      pg_catalog.count(distinct coalesce(
        hole->>'stroke_index', hole->>'strokeIndex'
      ))::integer,
      pg_catalog.sum((hole->>'par')::integer)::integer
    into hole_count, existing_hole_count, stroke_count, hole_par
    from pg_catalog.jsonb_array_elements(snapshot_value.hole_definitions) hole;
  exception when others then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_INVALID';
  end;
  if hole_count <> 18 or existing_hole_count <> 18 or stroke_count <> 18
     or hole_par <> snapshot_value.par
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(snapshot_value.hole_definitions) hole
       where coalesce(hole->>'hole_number', hole->>'holeNumber', hole->>'number')::integer
           not between 1 and 18
          or (hole->>'par')::integer not between 3 and 6
          or coalesce(hole->>'stroke_index', hole->>'strokeIndex')::integer
            not between 1 and 18
          or (nullif(hole->>'yardage', '') is not null
            and (hole->>'yardage')::integer not between 1 and 999)
     ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_INVALID';
  end if;

  select coalesce(history_course.canonical_name,
      nullif(pg_catalog.btrim(presentation_value.course_name), '')),
    history_course.canonical_location
  into target_course_name, target_course_location
  from (select 1) seed
  left join scoring_authority.completed_history_course_identities history_course
    on history_course.course_id = snapshot_value.course_id;
  if pg_catalog.btrim(coalesce(target_course_name, '')) = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_INVALID';
  end if;

  insert into scoring_authority.tournament_setup_course_tees_v1 (
    tournament_id, course_id, tee_id, display_name, location,
    rating, slope, par, setup_revision, updated_by_player_id
  ) values (
    '2026', snapshot_value.course_id, snapshot_value.tee,
    target_course_name, target_course_location, snapshot_value.rating,
    snapshot_value.slope, snapshot_value.par, next_revision, actor_player
  ) on conflict (tournament_id, course_id, tee_id) do nothing;

  select pg_catalog.count(*)::integer into existing_hole_count
  from scoring_authority.tournament_setup_course_holes_v1 hole
  where hole.tournament_id = '2026'
    and hole.course_id = snapshot_value.course_id
    and hole.tee_id = snapshot_value.tee;
  if existing_hole_count = 0 then
    insert into scoring_authority.tournament_setup_course_holes_v1 (
      tournament_id, course_id, tee_id, hole_number, par, stroke_index,
      yardage, setup_revision
    )
    select '2026', snapshot_value.course_id, snapshot_value.tee,
      coalesce(hole->>'hole_number', hole->>'holeNumber', hole->>'number')::integer,
      (hole->>'par')::integer,
      coalesce(hole->>'stroke_index', hole->>'strokeIndex')::integer,
      nullif(hole->>'yardage', '')::integer,
      next_revision
    from pg_catalog.jsonb_array_elements(snapshot_value.hole_definitions) hole;
  elsif existing_hole_count <> 18 then
    raise exception using errcode = '55000',
      message = 'TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_CONFLICT';
  end if;

  select value.* into existing_round_course
  from scoring_authority.tournament_setup_round_courses_v1 value
  where value.tournament_id = '2026'
    and value.round_number = match_value.round_number
  for update;
  if found and (
    existing_round_course.course_id is distinct from snapshot_value.course_id
    or existing_round_course.tee_id is distinct from snapshot_value.tee
  ) then
    raise exception using errcode = '55000',
      message = 'TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_CONFLICT';
  elsif not found then
    insert into scoring_authority.tournament_setup_round_courses_v1 (
      tournament_id, round_number, course_id, tee_id, setup_revision,
      updated_by_player_id
    ) values (
      '2026', match_value.round_number, snapshot_value.course_id,
      snapshot_value.tee, next_revision, actor_player
    );
  end if;

  insert into scoring_authority.tournament_setup_match_details_v1 (
    match_id, tournament_id, round_number, match_number, course_id, tee_id,
    tee_time, starting_hole, setup_revision, prepared_setup_revision,
    prepared_configuration_fingerprint, updated_by_player_id
  ) values (
    target_match_id, '2026', match_value.round_number, target_match_number,
    snapshot_value.course_id, snapshot_value.tee, target_tee_time,
    target_starting_hole, next_revision, null, null, actor_player
  );
  return true;
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_REQUIRED';
end;
$$;

create or replace function production_control.apply_tournament_setup_pairings_v1(
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
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'pairings') = 'object'
    then input->'pairings' else input end;
  target_match text := pg_catalog.btrim(coalesce(
    payload->>'match_id', payload->>'matchId', ''
  ));
  supplied_format text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    payload->>'format', ''
  )));
  participants_input jsonb := payload->'participants';
  normalized jsonb := '[]'::jsonb;
  item jsonb;
  player_value text;
  side_value integer;
  slot_value integer;
  expected_count integer;
  participant_count integer;
  match_value scoring_authority.matches%rowtype;
  current_handicap uuid;
  current_manifest jsonb;
  context_value jsonb;
  participant_item jsonb;
  dependencies jsonb;
  filtered_dependencies jsonb;
  warnings_value jsonb := '[]'::jsonb;
  next_permission_revision bigint;
  changed_value boolean := false;
  legacy_setup_materialized boolean := false;
begin
  if target_match = '' or pg_catalog.jsonb_typeof(participants_input)
       is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRINGS_INPUT_INVALID';
  end if;
  select value.* into strict match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.match_id = target_match
  for update;
  if supplied_format <> match_value.format then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRING_FORMAT_MISMATCH';
  end if;
  expected_count := case when match_value.format = 'SI' then 2 else 4 end;
  participant_count := pg_catalog.jsonb_array_length(participants_input);
  if participant_count not in (0, expected_count) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRING_COUNT_INVALID';
  end if;

  if participant_count = expected_count then
    for item in select value
      from pg_catalog.jsonb_array_elements(participants_input) entry(value)
    loop
      begin
        player_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
          item->>'player_id', item->>'playerId', ''
        )));
        side_value := coalesce(item->>'team_side', item->>'teamSide')::integer;
        slot_value := coalesce(item->>'player_slot', item->>'playerSlot')::integer;
      exception when others then
        raise exception using errcode = '22023',
          message = 'TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID';
      end;
      if player_value = '' or side_value not in (1, 2)
         or slot_value not between 1 and (case when match_value.format = 'SI'
           then 1 else 2 end)
         or not exists (
           select 1 from scoring_authority.tournament_players membership
           where membership.tournament_id = '2026'
             and membership.player_id = player_value
             and membership.team_side = side_value
             and membership.participation_status = 'ACTIVE'
         ) then
        raise exception using errcode = '22023',
          message = 'TOURNAMENT_SETUP_PAIRING_ACTIVE_TEAM_MEMBERSHIP_REQUIRED';
      end if;
      normalized := normalized || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'player_id', player_value, 'team_side', side_value,
          'player_slot', slot_value
        )
      );
    end loop;
    select coalesce(pg_catalog.jsonb_agg(value order by
        (value->>'team_side')::integer, (value->>'player_slot')::integer),
        '[]'::jsonb)
      into normalized
    from pg_catalog.jsonb_array_elements(normalized) value;
    if (select pg_catalog.count(distinct value->>'player_id')
        from pg_catalog.jsonb_array_elements(normalized) value) <> expected_count
       or (select pg_catalog.count(distinct
          (value->>'team_side') || ':' || (value->>'player_slot'))
        from pg_catalog.jsonb_array_elements(normalized) value) <> expected_count
       or (select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(normalized) value
        where (value->>'team_side')::integer = 1) <> expected_count / 2
       or (select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(normalized) value
        where (value->>'team_side')::integer = 2) <> expected_count / 2 then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(normalized) requested
      join scoring_authority.match_participants participant
        on participant.player_id = requested->>'player_id'
      join scoring_authority.matches other_match
        on other_match.match_id = participant.match_id
       and other_match.tournament_id = '2026'
       and other_match.round_number = match_value.round_number
       and other_match.match_id <> target_match
    ) then
      raise exception using errcode = '23505',
        message = 'TOURNAMENT_SETUP_ROUND_DUPLICATE_PLAYER';
    end if;
    select current_value.revision_id into strict current_handicap
    from scoring_authority.handicap_revision_current current_value
    where current_value.tournament_id = '2026';
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(normalized) requested
      where not exists (
        select 1 from scoring_authority.handicap_revision_entries entry
        where entry.revision_id = current_handicap
          and entry.tournament_id = '2026'
          and entry.player_id = requested->>'player_id'
      )
    ) then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_PAIRING_APPROVED_HANDICAP_REQUIRED';
    end if;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'player_id', participant.player_id,
    'team_side', participant.team_side,
    'player_slot', participant.player_slot
  ) order by participant.team_side, participant.player_slot), '[]'::jsonb)
  into current_manifest
  from scoring_authority.match_participants participant
  where participant.match_id = target_match;
  changed_value := current_manifest is distinct from normalized;

  if changed_value then
    if participant_count = 0 then
      perform production_control.assert_tournament_setup_pairing_clear_safe_v1(
        target_match
      );
    else
      perform production_control.assert_tournament_setup_match_mutable_v1(
        target_match
      );
    end if;
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      null, null, match_value.round_number, target_match, 'PAIRINGS'
    );
    if participant_count = 0 then
      select coalesce(pg_catalog.jsonb_agg(value order by value), '[]'::jsonb)
      into filtered_dependencies
      from pg_catalog.jsonb_array_elements_text(dependencies) value
      where value not in (
        'ACTIVE_SCORING_ACCESS_DEPENDENCY', 'ODDS_PUBLICATION_DEPENDENCY'
      );
      if dependencies ? 'ODDS_PUBLICATION_DEPENDENCY' then
        warnings_value := pg_catalog.jsonb_build_array(
          'Published Odds remain unchanged; review them after new pairings are configured.'
        );
      end if;
    else
      filtered_dependencies := dependencies;
    end if;
    if pg_catalog.jsonb_array_length(filtered_dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', filtered_dependencies
      );
    end if;

    if participant_count = 0 then
      legacy_setup_materialized :=
        production_control.materialize_tournament_setup_legacy_match_v1(
          target_match, next_revision, actor_player
        );
    elsif not exists (
      select 1 from scoring_authority.tournament_setup_match_details_v1 detail
      where detail.match_id = target_match
    ) then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_MATCH_DETAILS_REQUIRED';
    end if;

    next_permission_revision := match_value.permission_revision + 1;
    delete from scoring_authority.scoring_permissions permission
    where permission.match_id = target_match;
    delete from scoring_authority.match_participants participant
    where participant.match_id = target_match;

    if participant_count = expected_count then
      insert into scoring_authority.match_participants (
        match_id, player_id, team_side, player_slot, tournament_handicap,
        handicap_index, course_handicap, playing_handicap, final_strokes,
        handicap_revision_id
      )
      select target_match, requested->>'player_id',
        (requested->>'team_side')::integer,
        (requested->>'player_slot')::integer,
        handicap.tournament_handicap, handicap.tournament_handicap,
        handicap.tournament_handicap, 0, 0, current_handicap
      from pg_catalog.jsonb_array_elements(normalized) requested
      join scoring_authority.handicap_revision_entries handicap
        on handicap.revision_id = current_handicap
       and handicap.tournament_id = '2026'
       and handicap.player_id = requested->>'player_id';
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
      insert into scoring_authority.scoring_permissions (
        match_id, player_id, can_score, permission_revision,
        revoked_at, updated_at
      )
      select target_match, requested->>'player_id', false,
        next_permission_revision, pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp()
      from pg_catalog.jsonb_array_elements(normalized) requested;
    else
      delete from scoring_authority.match_holes hole
      where hole.match_id = target_match;
    end if;

    update scoring_authority.matches set
      permission_revision = next_permission_revision,
      match_revision = match_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
    update scoring_authority.tournament_setup_match_details_v1 set
      setup_revision = next_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'PAIRINGS', 'targetId', target_match,
    'warnings', warnings_value,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'matchId', target_match, 'format', match_value.format,
      'participantCount', participant_count,
      'handicapRevisionId', current_handicap,
      'pairingsCleared', participant_count = 0,
      'legacySetupMaterialized', legacy_setup_materialized,
      'legacySnapshotRetained', match_value.scoring_snapshot_id,
      'scoringPermissionGranted', false,
      'scoringMutationCreated', false
    )
  );
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_MATCH_OR_HANDICAP_CONTEXT_REQUIRED';
end;
$$;

revoke all on function
  production_control.assert_tournament_setup_pairing_clear_safe_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.materialize_tournament_setup_legacy_match_v1(text, bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.apply_tournament_setup_pairings_v1(jsonb, bigint, text)
  from public, anon, authenticated, service_role;

comment on function
  production_control.assert_tournament_setup_pairing_clear_safe_v1(text) is
  'Private fail-closed proof for clearing all participants from a strictly unstarted Production match.';
comment on function
  production_control.materialize_tournament_setup_legacy_match_v1(text, bigint, text) is
  'Private evidence-preserving bridge for an imported match without a Tournament Setup detail row.';
comment on function
  production_control.apply_tournament_setup_pairings_v1(jsonb, bigint, text) is
  'Private zero-or-complete pairing mutation; empty pairings require the stronger unstarted clear proof.';

commit;
