-- Step 10A Production-only completed-history and current-tournament shadow imports.
--
-- These operations are dormant, service-role-only, and independently prove the
-- exact Production project/workbook/tournament scope. They never enable
-- scoring ingress, enqueue Google/outbox work, create Auth users, or select a
-- Production application read source.
begin;

create or replace function public.import_production_completed_history_year(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp
as $$
declare
  production_project constant text := 'ymqhhtxaywtqllynrmxe';
  historical_source constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  environment_value text := upper(btrim(coalesce(input->>'environment', '')));
  project_value text := btrim(coalesce(input->>'project_ref', ''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := btrim(coalesce(input->>'actor_id', ''));
  authorization_value jsonb := input->'director_authorization';
  authorization_id text := btrim(coalesce(input #>> '{director_authorization,authorization_id}', ''));
  authorization_time timestamptz;
  target_year integer;
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  payload_fingerprint_value text := lower(btrim(coalesce(input->>'payload_fingerprint', '')));
  payload_body jsonb := input->'payload';
  tournament_value jsonb;
  expected_source_fingerprint text := lower(btrim(coalesce(input #>> '{correction,expected_source_fingerprint}', '')));
  correction_reason_value text := btrim(coalesce(input #>> '{correction,reason}', ''));
  validation jsonb;
  current_revision scoring_authority.completed_history_revisions%rowtype;
  previous_revision_id_value uuid;
  revision_id_value uuid := gen_random_uuid();
  import_run_id_value uuid := gen_random_uuid();
  revision_number_value bigint := 1;
  operation_value text := 'INITIAL_IMPORT';
  database_payload_fingerprint_value text;
  request_fingerprint_value text;
  canonical_counts_value jsonb;
  certification_value jsonb;
  item jsonb;
  previous_control_import_run_id_value uuid;
begin
  if not exists (
    select 1
    from production_control.resource_scope resource
    join production_control.tournament_scopes scope
      on scope.source_workbook_id = resource.google_workbook_id
     and scope.tournament_id = target_tournament
     and scope.tournament_year::text = target_tournament
    where resource.scope_key = 'BAGGER_INV_PRODUCTION'
      and resource.project_ref = production_project
      and resource.google_workbook_id = historical_source
      and resource.current_tournament_read_authority = 'GOOGLE'
      and resource.scoring_authority = 'GOOGLE'
      and resource.participant_identity_authority = 'PASSPORT'
      and not resource.public_supabase_reads_enabled
      and not resource.scoring_ingress_enabled
      and not resource.google_writes_enabled
      and not resource.auth_user_creation_enabled
      and not resource.odds_publication_enabled
      and not resource.workers_enabled
      and scope.scope_kind = 'COMPLETED_HISTORY'
      and scope.active_for_shadow_import
  ) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_FOUNDATION_SCOPE_NOT_READY');
  end if;
  if environment_value <> 'PRODUCTION'
     or project_value <> production_project
     or source_workbook <> historical_source then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_COMPLETED_HISTORY_SCOPE_REQUIRED');
  end if;
  if jsonb_typeof(authorization_value) <> 'object'
     or coalesce((authorization_value->>'authorized')::boolean, false) is not true
     or authorization_value->>'scope' <> 'PRODUCTION_COMPLETED_HISTORY_SHADOW_IMPORT'
     or authorization_value->>'actor_id' <> actor
     or length(authorization_id) < 8 then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_HISTORY_IMPORT_AUTHORIZATION_REQUIRED');
  end if;
  begin
    authorization_time := (authorization_value->>'authorized_at')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_HISTORY_IMPORT_AUTHORIZATION_REQUIRED');
  end;
  if authorization_time < now() - interval '15 minutes'
     or authorization_time > now() + interval '1 minute' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_HISTORY_IMPORT_AUTHORIZATION_EXPIRED');
  end if;
  begin target_year := (input->>'tournament_year')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
  end;
  if actor = ''
     or target_year not between 2017 and 2025
     or target_tournament <> target_year::text
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or payload_fingerprint_value !~ '^[0-9a-f]{64}$'
     or btrim(coalesce(input->>'import_contract_version', '')) = ''
     or btrim(coalesce(input->>'correction_set_version', '')) = ''
     or btrim(coalesce(input->>'importer_version', '')) = ''
     or jsonb_typeof(coalesce(input->'source_counts', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(input->'certification', '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETED_HISTORY_PROVENANCE_REQUIRED');
  end if;

  validation := scoring_authority.validate_completed_history_payload(input);
  if coalesce((validation->>'ok')::boolean, false) is not true then
    return validation;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload_body->'courses') incoming
    join scoring_authority.completed_history_course_identities existing
      on existing.course_id = incoming->>'course_id'
    where (
      lower(btrim(existing.canonical_name))
        <> lower(btrim(coalesce(incoming->>'canonical_name', '')))
      or lower(btrim(coalesce(existing.canonical_location, '')))
        <> lower(btrim(coalesce(incoming->>'canonical_location', '')))
    )
      and (expected_source_fingerprint = '' or length(correction_reason_value) < 10)
  ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_COURSE_IDENTITY_CONFLICT');
  end if;
  canonical_counts_value := validation->'counts';
  certification_value := coalesce(input->'certification', '{}'::jsonb) || jsonb_build_object(
    'database_validated', true,
    'final_score_reconciled', true,
    'champion_reconciled', true,
    'participant_structure_reconciled', true,
    'missing_scorecards_are_not_zeroes', true,
    'derived_team_1_points', validation->'derived_team_1_points',
    'derived_team_2_points', validation->'derived_team_2_points'
  );
  tournament_value := payload_body->'tournament';

  perform pg_advisory_xact_lock(hashtext('production-completed-history-' || target_year::text));
  select import_run_id into previous_control_import_run_id_value
  from production_control.import_runs
  where domain = 'COMPLETED_HISTORY'
    and tournament_id = target_tournament
    and tournament_year = target_year
    and source_workbook_id = historical_source
    and status = 'SUCCEEDED'
  order by completed_at desc nulls last, started_at desc
  limit 1;
  select revision.* into current_revision
  from scoring_authority.completed_history_current_revisions current_pointer
  join scoring_authority.completed_history_revisions revision
    on revision.revision_id = current_pointer.revision_id
  where current_pointer.tournament_year = target_year
  for update of current_pointer;

  database_payload_fingerprint_value := encode(
    extensions.digest(payload_body::text, 'sha256'), 'hex'
  );
  request_fingerprint_value := encode(
    extensions.digest((input - 'director_authorization' - 'correction')::text, 'sha256'), 'hex'
  );

  if current_revision.revision_id is not null then
    if current_revision.source_fingerprint = source_fingerprint_value
       and current_revision.payload_fingerprint = payload_fingerprint_value
       and current_revision.database_payload_fingerprint = database_payload_fingerprint_value then
      return jsonb_build_object(
        'ok', true, 'changed', false, 'duplicate', true,
        'tournament_id', target_tournament, 'tournament_year', target_year,
        'revision_id', current_revision.revision_id,
        'revision_number', current_revision.revision_number,
        'source_fingerprint', current_revision.source_fingerprint,
        'payload_fingerprint', current_revision.payload_fingerprint,
        'database_payload_fingerprint', current_revision.database_payload_fingerprint,
        'canonical_counts', current_revision.canonical_counts,
        'certification', current_revision.certification
      );
    end if;
    if expected_source_fingerprint <> current_revision.source_fingerprint
       or length(correction_reason_value) < 10 then
      return jsonb_build_object(
        'ok', false, 'code', 'HISTORICAL_RECONCILIATION_REQUIRED',
        'current_revision_id', current_revision.revision_id,
        'current_source_fingerprint', current_revision.source_fingerprint,
        'incoming_source_fingerprint', source_fingerprint_value,
        'current_payload_fingerprint', current_revision.payload_fingerprint,
        'incoming_payload_fingerprint', payload_fingerprint_value
      );
    end if;
    operation_value := 'CORRECTION';
    previous_revision_id_value := current_revision.revision_id;
    revision_number_value := current_revision.revision_number + 1;
  elsif target_year > 2017 and not exists (
    select 1 from scoring_authority.completed_history_current_revisions
    where tournament_year = target_year - 1
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'PRIOR_HISTORY_YEAR_NOT_CERTIFIED',
      'required_year', target_year - 1
    );
  end if;

  -- A transaction-local capability is required by every new-table trigger.
  -- It is set only after Production/project/source/Director checks and validation.
  perform set_config('scoring_authority.completed_history_import', 'on', true);
  if exists (
    select 1 from scoring_authority.tournaments
    where tournament_year = target_year and tournament_id <> target_tournament
  ) then
    raise exception using errcode = '23505', message = 'HISTORICAL_TOURNAMENT_IDENTITY_CONFLICT';
  end if;

  insert into scoring_authority.tournaments (
    tournament_id, tournament_year, name, source_workbook_id, scoring_authority,
    imported_at, created_at, updated_at
  ) values (
    target_tournament, target_year, tournament_value->>'name', historical_source,
    'GOOGLE', now(), now(), now()
  )
  on conflict (tournament_id) do update set
    name = excluded.name,
    source_workbook_id = excluded.source_workbook_id,
    scoring_authority = 'GOOGLE',
    imported_at = now(), updated_at = now();

  for item in select value from jsonb_array_elements(payload_body->'players') loop
    insert into scoring_authority.players (player_id, display_name, source_payload)
    values (
      item->>'player_id', item->>'display_name',
      coalesce(item->'source_payload', '{}'::jsonb)
        || jsonb_build_object('completed_history_last_seen_year', target_year)
    )
    on conflict (player_id) do update set
      source_payload = scoring_authority.players.source_payload
        || coalesce(excluded.source_payload, '{}'::jsonb)
        || jsonb_build_object('completed_history_last_seen_year', target_year),
      updated_at = now();
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'courses') loop
    insert into scoring_authority.completed_history_course_identities (
      course_id, canonical_name, canonical_location, first_seen_year, identity_payload
    ) values (
      item->>'course_id', item->>'canonical_name', nullif(item->>'canonical_location', ''),
      target_year, coalesce(item->'identity_payload', '{}'::jsonb)
    ) on conflict (course_id) do update set
      canonical_name = excluded.canonical_name,
      canonical_location = excluded.canonical_location,
      identity_payload = scoring_authority.completed_history_course_identities.identity_payload
        || excluded.identity_payload
    where expected_source_fingerprint <> '' and length(correction_reason_value) >= 10;
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'teams') loop
    insert into scoring_authority.teams (
      tournament_id, team_id, team_side, name, source_payload
    ) values (
      target_tournament, item->>'team_id', (item->>'team_side')::integer,
      item->>'name', coalesce(item->'source_payload', '{}'::jsonb)
    )
    on conflict (tournament_id, team_id) do update set
      team_side = excluded.team_side, name = excluded.name,
      source_payload = excluded.source_payload;
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'roster') loop
    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side, participation_status,
      source_roster_key, source_payload
    ) values (
      target_tournament, item->>'player_id', item->>'team_id',
      (item->>'team_side')::integer,
      coalesce(item->>'participation_status', 'ACTIVE'),
      item->>'source_roster_key', coalesce(item->'source_payload', '{}'::jsonb)
    )
    on conflict (tournament_id, player_id) do update set
      team_id = excluded.team_id, team_side = excluded.team_side,
      participation_status = excluded.participation_status,
      source_roster_key = excluded.source_roster_key,
      source_payload = excluded.source_payload, updated_at = now();
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'rounds') loop
    insert into scoring_authority.rounds (
      tournament_id, round_number, format, name, handicap_allowance, status, source_payload
    ) values (
      target_tournament, (item->>'round_number')::integer, item->>'format',
      coalesce(nullif(item->>'name', ''), 'Round ' || (item->>'round_number')),
      nullif(item->>'handicap_allowance', '')::numeric, 'FINAL',
      coalesce(item->'source_payload', '{}'::jsonb)
    )
    on conflict (tournament_id, round_number) do update set
      format = excluded.format, name = excluded.name,
      handicap_allowance = excluded.handicap_allowance, status = 'FINAL',
      source_payload = excluded.source_payload;
  end loop;

  insert into scoring_authority.completed_history_revisions (
    revision_id, project_ref, source_workbook_id, tournament_id, tournament_year,
    revision_number, source_fingerprint, payload_fingerprint,
    database_payload_fingerprint, import_contract_version, correction_set_version,
    importer_version, source_counts, canonical_counts, certification, operation,
    previous_revision_id, correction_reason, imported_by
  ) values (
    revision_id_value, production_project, historical_source, target_tournament, target_year,
    revision_number_value, source_fingerprint_value, payload_fingerprint_value,
    database_payload_fingerprint_value, input->>'import_contract_version',
    input->>'correction_set_version', input->>'importer_version',
    coalesce(input->'source_counts', '{}'::jsonb), canonical_counts_value,
    certification_value, operation_value, previous_revision_id_value,
    case when operation_value = 'CORRECTION' then correction_reason_value else null end,
    actor
  );

  insert into scoring_authority.completed_history_tournament_facts (
    revision_id, tournament_id, tournament_year, start_date, end_date, destination,
    timezone, lifecycle, score_availability, official_team_1_points,
    official_team_2_points, total_awarded_points, expected_configured_points,
    champion_team_side, champion_team_id, team_size, source_payload
  ) values (
    revision_id_value, target_tournament, target_year,
    nullif(tournament_value->>'start_date', '')::date,
    nullif(tournament_value->>'end_date', '')::date,
    nullif(tournament_value->>'destination', ''), nullif(tournament_value->>'timezone', ''),
    'FINAL', tournament_value->>'score_availability',
    nullif(tournament_value->>'official_team_1_points', '')::numeric,
    nullif(tournament_value->>'official_team_2_points', '')::numeric,
    nullif(tournament_value->>'total_awarded_points', '')::numeric,
    nullif(tournament_value->>'expected_configured_points', '')::numeric,
    (tournament_value->>'champion_team_side')::integer,
    tournament_value->>'champion_team_id',
    nullif(tournament_value->>'team_size', '')::integer,
    coalesce(tournament_value->'source_payload', '{}'::jsonb)
  );

  for item in select value from jsonb_array_elements(payload_body->'teams') loop
    insert into scoring_authority.completed_history_team_facts (
      revision_id, tournament_id, team_id, team_side, name, captain_player_id,
      logo_key, presentation_identity, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'team_id',
      (item->>'team_side')::integer, item->>'name',
      nullif(item->>'captain_player_id', ''), nullif(item->>'logo_key', ''),
      coalesce(item->'presentation_identity', '{}'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'roster') loop
    insert into scoring_authority.completed_history_roster_facts (
      revision_id, tournament_id, player_id, display_name, team_id, team_side,
      participation_status, is_captain, is_governor, tournament_handicap, source_roster_key, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'player_id',
      coalesce(nullif(item->>'display_name', ''), (
        select p.display_name from scoring_authority.players p where p.player_id = item->>'player_id'
      )), item->>'team_id', (item->>'team_side')::integer,
      coalesce(item->>'participation_status', 'ACTIVE'),
      coalesce((item->>'is_captain')::boolean, false),
      (item->>'is_governor')::boolean,
      nullif(item->>'tournament_handicap', '')::numeric,
      item->>'source_roster_key',
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'rounds') loop
    insert into scoring_authority.completed_history_round_facts (
      revision_id, tournament_id, round_number, format, name, team_size,
      points_per_match, handicap_allowance, course_appearance_id,
      scoring_semantics, source_payload
    ) values (
      revision_id_value, target_tournament, (item->>'round_number')::integer,
      item->>'format', coalesce(nullif(item->>'name', ''), 'Round ' || (item->>'round_number')),
      (item->>'team_size')::integer, nullif(item->>'points_per_match', '')::numeric,
      nullif(item->>'handicap_allowance', '')::numeric,
      nullif(item->>'course_appearance_id', ''),
      coalesce(item->'scoring_semantics', '{}'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'course_appearances') loop
    insert into scoring_authority.completed_history_course_appearances (
      revision_id, tournament_id, appearance_id, round_number, course_id,
      source_course_id, display_name, location, tee, rating, slope, yardage,
      par, hole_definitions, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'appearance_id',
      (item->>'round_number')::integer, item->>'course_id', item->>'source_course_id',
      item->>'display_name', nullif(item->>'location', ''), nullif(item->>'tee', ''),
      nullif(item->>'rating', '')::numeric, nullif(item->>'slope', '')::integer,
      nullif(item->>'yardage', '')::integer, nullif(item->>'par', '')::integer,
      coalesce(item->'hole_definitions', '[]'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'matches') loop
    insert into scoring_authority.completed_history_matches (
      revision_id, tournament_id, match_id, round_number, format,
      course_appearance_id, lifecycle, completion_state, scorecard_coverage,
      result, result_winner, team_1_points, team_2_points, points_available,
      points_availability, source_match_key, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'match_id',
      (item->>'round_number')::integer, item->>'format', item->>'course_appearance_id',
      'FINAL', item->>'completion_state', item->>'scorecard_coverage',
      item->>'result', item->>'result_winner',
      nullif(item->>'team_1_points', '')::numeric,
      nullif(item->>'team_2_points', '')::numeric,
      nullif(item->>'points_available', '')::numeric,
      item->>'points_availability', item->>'source_match_key',
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'match_participants') loop
    insert into scoring_authority.completed_history_match_participants (
      revision_id, match_id, player_id, team_side, player_slot,
      tournament_handicap, applied_handicap, applied_strokes, source_payload
    ) values (
      revision_id_value, item->>'match_id', item->>'player_id',
      (item->>'team_side')::integer, (item->>'player_slot')::integer,
      nullif(item->>'tournament_handicap', '')::numeric,
      nullif(item->>'applied_handicap', '')::numeric,
      nullif(item->>'applied_strokes', '')::numeric,
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'scorecards') loop
    insert into scoring_authority.completed_history_scorecards (
      revision_id, scorecard_id, match_id, entity_kind, player_id, team_side,
      player_slot, coverage_status, recorded_holes, hole_values, score_semantics,
      source_payload
    ) values (
      revision_id_value, item->>'scorecard_id', item->>'match_id',
      item->>'entity_kind', nullif(item->>'player_id', ''),
      nullif(item->>'team_side', '')::integer, nullif(item->>'player_slot', '')::integer,
      item->>'coverage_status', (item->>'recorded_holes')::integer,
      coalesce(item->'hole_values', '[]'::jsonb),
      coalesce(item->'score_semantics', '{}'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'awards') loop
    insert into scoring_authority.completed_history_awards (
      revision_id, tournament_id, award_id, award_type, label, recipient_kind,
      winner_player_id, winner_team_id, recipient_display, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'award_id', item->>'award_type',
      item->>'label', item->>'recipient_kind', nullif(item->>'winner_player_id', ''),
      nullif(item->>'winner_team_id', ''), nullif(item->>'recipient_display', ''),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'record_eligibility') loop
    insert into scoring_authority.completed_history_record_eligibility (
      revision_id, match_id, player_id, is_record_eligible, reason_code, source_payload
    ) values (
      revision_id_value, item->>'match_id', item->>'player_id',
      (item->>'is_record_eligible')::boolean, item->>'reason_code',
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'corrections') loop
    insert into scoring_authority.completed_history_correction_applications (
      revision_id, correction_id, category, description, evidence, source_payload
    ) values (
      revision_id_value, item->>'correction_id', item->>'category',
      item->>'description', coalesce(item->'evidence', '{}'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  insert into scoring_authority.completed_history_import_runs (
    import_run_id, revision_id, tournament_id, tournament_year, operation,
    status, source_fingerprint, payload_fingerprint, request_fingerprint,
    actor_id, metadata
  ) values (
    import_run_id_value, revision_id_value, target_tournament, target_year,
    operation_value, 'SUCCEEDED', source_fingerprint_value,
    payload_fingerprint_value, request_fingerprint_value, actor,
    jsonb_build_object(
      'project_ref', production_project, 'source_workbook_id', historical_source,
      'director_authorization_id', authorization_id,
      'import_contract_version', input->>'import_contract_version',
      'correction_set_version', input->>'correction_set_version',
      'importer_version', input->>'importer_version'
    )
  );

  insert into scoring_authority.completed_history_current_revisions (
    tournament_id, tournament_year, revision_id, project_ref,
    source_workbook_id, advanced_by, advanced_at
  ) values (
    target_tournament, target_year, revision_id_value, production_project,
    historical_source, actor, now()
  )
  on conflict (tournament_id) do update set
    revision_id = excluded.revision_id, project_ref = excluded.project_ref,
    source_workbook_id = excluded.source_workbook_id,
    advanced_by = excluded.advanced_by, advanced_at = excluded.advanced_at;

  insert into production_control.import_runs (
    import_run_id, domain, tournament_id, tournament_year, source_workbook_id,
    source_fingerprint, payload_fingerprint, database_fingerprint,
    importer_contract, correction_registry_version, actor, status,
    previous_import_run_id, counts, started_at, completed_at
  ) values (
    import_run_id_value, 'COMPLETED_HISTORY', target_tournament, target_year, historical_source,
    source_fingerprint_value, payload_fingerprint_value, database_payload_fingerprint_value,
    input->>'import_contract_version', input->>'correction_set_version', actor,
    'SUCCEEDED', previous_control_import_run_id_value, canonical_counts_value, now(), now()
  );

  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (
    target_tournament,
    case when operation_value = 'INITIAL_IMPORT'
      then 'COMPLETED_HISTORY_YEAR_CERTIFIED'
      else 'COMPLETED_HISTORY_YEAR_CORRECTED' end,
    actor,
    jsonb_build_object(
      'revisionId', revision_id_value, 'revisionNumber', revision_number_value,
      'sourceFingerprint', source_fingerprint_value,
      'payloadFingerprint', payload_fingerprint_value,
      'databasePayloadFingerprint', database_payload_fingerprint_value,
      'operation', operation_value, 'canonicalCounts', canonical_counts_value,
      'directorAuthorizationId', authorization_id,
      'correctionReason', case when operation_value = 'CORRECTION'
        then correction_reason_value else null end
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'duplicate', false,
    'operation', operation_value, 'tournament_id', target_tournament,
    'tournament_year', target_year, 'revision_id', revision_id_value,
    'revision_number', revision_number_value, 'import_run_id', import_run_id_value,
    'source_fingerprint', source_fingerprint_value,
    'payload_fingerprint', payload_fingerprint_value,
    'database_payload_fingerprint', database_payload_fingerprint_value,
    'canonical_counts', canonical_counts_value, 'certification', certification_value
  );
end;
$$;


revoke all on function public.import_production_completed_history_year(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.import_production_completed_history_year(jsonb) to service_role;

create or replace function public.read_production_completed_history_shadow(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp
as $$
declare
  production_project constant text := 'ymqhhtxaywtqllynrmxe';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_year integer;
  target_tournament text;
  mode_value text := upper(btrim(coalesce(input->>'mode', 'YEAR')));
  revision_value scoring_authority.completed_history_revisions%rowtype;
  actual_counts jsonb;
  expected_counts jsonb;
  readback_fingerprint text;
  parity boolean;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref', '')) <> production_project
     or btrim(coalesce(input->>'source_workbook_id', '')) <> production_workbook then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_COMPLETED_HISTORY_SCOPE_REQUIRED');
  end if;

  if mode_value = 'YEARS' then
    return jsonb_build_object(
      'ok', true,
      'mode', mode_value,
      'years', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tournament_id', revision.tournament_id,
          'tournament_year', revision.tournament_year,
          'revision_id', revision.revision_id,
          'revision_number', revision.revision_number,
          'source_fingerprint', revision.source_fingerprint,
          'payload_fingerprint', revision.payload_fingerprint,
          'database_payload_fingerprint', revision.database_payload_fingerprint,
          'canonical_counts', revision.canonical_counts,
          'correction_set_version', revision.correction_set_version,
          'certified_at', revision.certified_at
        ) order by revision.tournament_year)
        from scoring_authority.completed_history_current_revisions current_pointer
        join scoring_authority.completed_history_revisions revision
          on revision.revision_id = current_pointer.revision_id
        where revision.project_ref = production_project
          and revision.source_workbook_id = production_workbook
      ), '[]'::jsonb)
    );
  end if;
  if mode_value <> 'YEAR' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_COMPLETED_HISTORY_READ_MODE');
  end if;
  begin
    target_year := (input->>'tournament_year')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
  end;
  target_tournament := btrim(coalesce(input->>'tournament_id', target_year::text));
  if target_year not between 2017 and 2025 or target_tournament <> target_year::text
     or not exists (
       select 1 from production_control.tournament_scopes scope
       where scope.tournament_id = target_tournament
         and scope.tournament_year = target_year
         and scope.source_workbook_id = production_workbook
         and scope.scope_kind = 'COMPLETED_HISTORY'
     ) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_COMPLETED_HISTORY_YEAR_NOT_ALLOWED');
  end if;

  select revision.* into revision_value
  from scoring_authority.completed_history_current_revisions current_pointer
  join scoring_authority.completed_history_revisions revision
    on revision.revision_id = current_pointer.revision_id
  where current_pointer.tournament_id = target_tournament
    and current_pointer.tournament_year = target_year
    and revision.project_ref = production_project
    and revision.source_workbook_id = production_workbook;
  if revision_value.revision_id is null then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_COMPLETED_HISTORY_YEAR_NOT_IMPORTED');
  end if;

  actual_counts := jsonb_build_object(
    'teams', (select count(*) from scoring_authority.completed_history_team_facts where revision_id = revision_value.revision_id),
    'players', (select count(distinct player_id) from scoring_authority.completed_history_roster_facts where revision_id = revision_value.revision_id),
    'roster', (select count(*) from scoring_authority.completed_history_roster_facts where revision_id = revision_value.revision_id),
    'rounds', (select count(*) from scoring_authority.completed_history_round_facts where revision_id = revision_value.revision_id),
    'courses', (select count(distinct course_id) from scoring_authority.completed_history_course_appearances where revision_id = revision_value.revision_id),
    'course_appearances', (select count(*) from scoring_authority.completed_history_course_appearances where revision_id = revision_value.revision_id),
    'matches', (select count(*) from scoring_authority.completed_history_matches where revision_id = revision_value.revision_id),
    'match_participants', (select count(*) from scoring_authority.completed_history_match_participants where revision_id = revision_value.revision_id),
    'scorecards', (select count(*) from scoring_authority.completed_history_scorecards where revision_id = revision_value.revision_id),
    'complete_scorecards', (select count(*) from scoring_authority.completed_history_scorecards where revision_id = revision_value.revision_id and coverage_status = 'COMPLETE'),
    'partial_scorecards', (select count(*) from scoring_authority.completed_history_scorecards where revision_id = revision_value.revision_id and coverage_status = 'PARTIAL'),
    'unavailable_scorecards', (select count(*) from scoring_authority.completed_history_scorecards where revision_id = revision_value.revision_id and coverage_status = 'UNAVAILABLE'),
    'recorded_hole_rows', (select coalesce(sum(recorded_holes), 0) from scoring_authority.completed_history_scorecards where revision_id = revision_value.revision_id),
    'awards', (select count(*) from scoring_authority.completed_history_awards where revision_id = revision_value.revision_id),
    'record_eligibility', (select count(*) from scoring_authority.completed_history_record_eligibility where revision_id = revision_value.revision_id),
    'record_exclusions', (select count(*) from scoring_authority.completed_history_record_eligibility where revision_id = revision_value.revision_id and not is_record_eligible),
    'corrections', (select count(*) from scoring_authority.completed_history_correction_applications where revision_id = revision_value.revision_id)
  );
  expected_counts := revision_value.canonical_counts;
  parity := not exists (
    select 1
    from jsonb_each_text(expected_counts) expected
    where actual_counts ? expected.key
      and actual_counts->>expected.key <> expected.value
  );
  readback_fingerprint := encode(extensions.digest(jsonb_build_object(
    'revision_id', revision_value.revision_id,
    'source_fingerprint', revision_value.source_fingerprint,
    'payload_fingerprint', revision_value.payload_fingerprint,
    'actual_counts', actual_counts
  )::text, 'sha256'), 'hex');
  return jsonb_build_object(
    'ok', true,
    'mode', mode_value,
    'tournament_id', target_tournament,
    'tournament_year', target_year,
    'revision', to_jsonb(revision_value),
    'expected_counts', expected_counts,
    'actual_counts', actual_counts,
    'parity', parity,
    'readback_fingerprint', readback_fingerprint,
    'import_run', (
      select to_jsonb(run)
      from production_control.import_runs run
      where run.domain = 'COMPLETED_HISTORY'
        and run.tournament_id = target_tournament
        and run.tournament_year = target_year
        and run.status = 'SUCCEEDED'
      order by run.completed_at desc
      limit 1
    )
  );
end;
$$;

revoke all on function public.read_production_completed_history_shadow(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.read_production_completed_history_shadow(jsonb) to service_role;

create or replace function production_control.current_tournament_shadow_projection(target_tournament text)
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp
as $$
  select jsonb_build_object(
    'tournament', coalesce((
      select to_jsonb(tournament) - 'created_at' - 'updated_at' - 'imported_at'
      from scoring_authority.tournaments tournament
      where tournament.tournament_id = target_tournament
    ), '{}'::jsonb),
    'teams', coalesce((
      select jsonb_agg(to_jsonb(team) order by team.team_side, team.team_id)
      from scoring_authority.teams team where team.tournament_id = target_tournament
    ), '[]'::jsonb),
    'tournament_players', coalesce((
      select jsonb_agg(to_jsonb(roster) - 'created_at' - 'updated_at' order by roster.team_side, roster.source_roster_key, roster.player_id)
      from scoring_authority.tournament_players roster where roster.tournament_id = target_tournament
    ), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(to_jsonb(round_value) order by round_value.round_number)
      from scoring_authority.rounds round_value where round_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'snapshots', coalesce((
      select jsonb_agg(to_jsonb(snapshot) - 'imported_at' order by snapshot.match_id, snapshot.snapshot_revision)
      from scoring_authority.scoring_snapshots snapshot where snapshot.tournament_id = target_tournament
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(to_jsonb(match_value) order by match_value.round_number, match_value.match_id)
      from scoring_authority.matches match_value where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'match_participants', coalesce((
      select jsonb_agg(to_jsonb(participant) order by participant.match_id, participant.team_side, participant.player_slot)
      from scoring_authority.match_participants participant
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(to_jsonb(permission) - 'updated_at' order by permission.match_id, permission.player_id)
      from scoring_authority.scoring_permissions permission
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'match_holes', coalesce((
      select jsonb_agg(to_jsonb(hole) order by hole.match_id, hole.hole_number)
      from scoring_authority.match_holes hole
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'hole_scores', coalesce((
      select jsonb_agg(to_jsonb(score) - 'created_at' - 'updated_at' order by score.match_id, score.hole_number)
      from scoring_authority.hole_scores score
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'checkpoints', coalesce((
      select jsonb_agg(to_jsonb(checkpoint) - 'updated_at' order by checkpoint.match_id)
      from scoring_authority.google_match_checkpoints checkpoint
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'ingress', coalesce((
      select to_jsonb(gate) - 'updated_at'
      from scoring_authority.ingress_gates gate where gate.tournament_id = target_tournament
    ), '{}'::jsonb)
  );
$$;

revoke all on function production_control.current_tournament_shadow_projection(text) from public, anon, authenticated, service_role;

create or replace function public.import_production_current_tournament_shadow(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp
as $$
declare
  production_project constant text := 'ymqhhtxaywtqllynrmxe';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_tournament constant text := '2026';
  target_year constant integer := 2026;
  actor text := btrim(coalesce(input->>'actor_id', ''));
  authorization_payload jsonb := input->'director_authorization';
  authorization_time timestamptz;
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  payload_fingerprint_value text := lower(btrim(coalesce(input->>'payload_fingerprint', '')));
  payload_body jsonb := input->'payload';
  tournament_value jsonb := input#>'{payload,tournament}';
  database_payload_fingerprint_value text;
  database_fingerprint_value text;
  current_projection jsonb;
  existing_run production_control.import_runs%rowtype;
  previous_tournament_run_id uuid;
  previous_scoring_run_id uuid;
  tournament_run_id uuid := extensions.gen_random_uuid();
  scoring_run_id uuid := extensions.gen_random_uuid();
  item jsonb;
  counts_value jsonb;
  enabled_operational_trigger_count bigint;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref', '')) <> production_project
     or btrim(coalesce(input->>'source_workbook_id', '')) <> production_workbook
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or btrim(coalesce(input->>'tournament_year', '')) <> target_year::text
     or upper(btrim(coalesce(payload_body->>'environment', ''))) <> 'PRODUCTION'
     or btrim(coalesce(payload_body->>'source_workbook_id', '')) <> production_workbook
     or btrim(coalesce(tournament_value->>'tournament_id', '')) <> target_tournament
     or btrim(coalesce(tournament_value->>'tournament_year', '')) <> target_year::text then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CURRENT_SHADOW_SCOPE_REQUIRED');
  end if;
  if not exists (
    select 1
    from production_control.resource_scope resource
    join production_control.tournament_scopes scope
      on scope.tournament_id = target_tournament
     and scope.tournament_year = target_year
     and scope.source_workbook_id = resource.google_workbook_id
    where resource.scope_key = 'BAGGER_INV_PRODUCTION'
      and resource.project_ref = production_project
      and resource.project_url = 'https://ymqhhtxaywtqllynrmxe.supabase.co'
      and resource.google_workbook_id = production_workbook
      and resource.vercel_project = 'bagger-inv'
      and resource.canonical_domain = 'https://baggerinv.com'
      and resource.current_tournament_read_authority = 'GOOGLE'
      and resource.scoring_authority = 'GOOGLE'
      and resource.participant_identity_authority = 'PASSPORT'
      and not resource.public_supabase_reads_enabled
      and not resource.scoring_ingress_enabled
      and not resource.google_writes_enabled
      and not resource.auth_user_creation_enabled
      and not resource.odds_publication_enabled
      and not resource.workers_enabled
      and scope.scope_kind = 'CURRENT_TOURNAMENT'
      and scope.active_for_shadow_import
  ) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_FOUNDATION_SCOPE_NOT_READY');
  end if;
  if exists (select 1 from production_control.worker_controls where enabled or scheduler_installed or google_writes_allowed) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_SHADOW_WORKERS_MUST_REMAIN_DORMANT');
  end if;
  select count(*) into enabled_operational_trigger_count
  from pg_catalog.pg_trigger trigger_value
  where trigger_value.tgname in (
      'net_skins_hole_score_recalculation', 'tournament_storylines_score_change',
      'calcutta_official_match_change', 'capture_scorecard_archive_transition',
      'net_skins_match_lifecycle_recalculation', 'tournament_derived_match_change',
      'odds_google_mirror_supersession', 'tournament_storylines_net_skins_change'
  ) and trigger_value.tgenabled <> 'D';
  if enabled_operational_trigger_count > 0 then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_OPERATIONAL_TRIGGER_MUST_REMAIN_DISABLED');
  end if;
  if jsonb_typeof(authorization_payload) <> 'object'
     or coalesce((authorization_payload->>'authorized')::boolean, false) is not true
     or authorization_payload->>'scope' <> 'PRODUCTION_CURRENT_TOURNAMENT_SHADOW_IMPORT'
     or authorization_payload->>'actor_id' <> actor
     or length(btrim(coalesce(authorization_payload->>'authorization_id', ''))) < 8 then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_CURRENT_SHADOW_AUTHORIZATION_REQUIRED');
  end if;
  begin
    authorization_time := (authorization_payload->>'authorized_at')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_CURRENT_SHADOW_AUTHORIZATION_REQUIRED');
  end;
  if authorization_time < now() - interval '15 minutes' or authorization_time > now() + interval '1 minute' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_CURRENT_SHADOW_AUTHORIZATION_EXPIRED');
  end if;
  if actor = ''
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or payload_fingerprint_value !~ '^[0-9a-f]{64}$'
     or btrim(coalesce(input->>'import_contract_version', '')) = ''
     or jsonb_typeof(payload_body) <> 'object'
     or jsonb_typeof(coalesce(payload_body->'players', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'teams', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'tournament_players', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'rounds', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'snapshots', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'matches', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'match_participants', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'permissions', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'match_holes', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'hole_scores', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(payload_body->'checkpoints', '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CURRENT_SHADOW_PROVENANCE_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('production-current-shadow-' || target_tournament));
  database_payload_fingerprint_value := encode(extensions.digest(payload_body::text, 'sha256'), 'hex');
  select run.* into existing_run
  from production_control.import_runs run
  where run.domain = 'CURRENT_SCORING_SHADOW'
    and run.tournament_id = target_tournament
    and run.tournament_year = target_year
    and run.source_workbook_id = production_workbook
    and run.source_fingerprint = source_fingerprint_value
    and run.payload_fingerprint = payload_fingerprint_value
    and run.status = 'SUCCEEDED'
  order by run.completed_at desc
  limit 1;
  if existing_run.import_run_id is not null then
    current_projection := production_control.current_tournament_shadow_projection(target_tournament);
    database_fingerprint_value := encode(extensions.digest(current_projection::text, 'sha256'), 'hex');
    if database_fingerprint_value <> existing_run.database_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CURRENT_SHADOW_DRIFT_DETECTED',
        'expected_database_fingerprint', existing_run.database_fingerprint,
        'actual_database_fingerprint', database_fingerprint_value);
    end if;
    return jsonb_build_object('ok', true, 'changed', false, 'duplicate', true,
      'tournament_id', target_tournament, 'tournament_year', target_year,
      'source_fingerprint', source_fingerprint_value,
      'payload_fingerprint', payload_fingerprint_value,
      'database_payload_fingerprint', database_payload_fingerprint_value,
      'database_fingerprint', database_fingerprint_value,
      'import_run_id', existing_run.import_run_id,
      'counts', existing_run.counts,
      'authority', 'GOOGLE', 'scoring_ingress', 'DISABLED');
  end if;
  if exists (select 1 from scoring_authority.google_outbox_events where tournament_id = target_tournament)
     or exists (select 1 from scoring_authority.score_mutations mutation join scoring_authority.matches match_value using (match_id) where match_value.tournament_id = target_tournament)
     or exists (select 1 from scoring_authority.authority_epochs where tournament_id = target_tournament)
     or exists (select 1 from scoring_authority.scoring_ingress_leases where tournament_id = target_tournament) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CURRENT_SHADOW_HAS_AUTHORITATIVE_ACTIVITY');
  end if;

  select import_run_id into previous_tournament_run_id
  from production_control.import_runs
  where domain = 'CURRENT_TOURNAMENT' and tournament_id = target_tournament and status = 'SUCCEEDED'
  order by completed_at desc nulls last limit 1;
  select import_run_id into previous_scoring_run_id
  from production_control.import_runs
  where domain = 'CURRENT_SCORING_SHADOW' and tournament_id = target_tournament and status = 'SUCCEEDED'
  order by completed_at desc nulls last limit 1;

  delete from scoring_authority.matches where tournament_id = target_tournament;
  delete from scoring_authority.scoring_snapshots where tournament_id = target_tournament;
  delete from scoring_authority.ingress_gates where tournament_id = target_tournament;
  delete from scoring_authority.tournament_players where tournament_id = target_tournament;

  insert into scoring_authority.tournaments (
    tournament_id, tournament_year, name, source_workbook_id, scoring_authority, imported_at, updated_at
  ) values (
    target_tournament, target_year, tournament_value->>'name', production_workbook, 'GOOGLE', now(), now()
  ) on conflict (tournament_id) do update set
    tournament_year = excluded.tournament_year,
    name = excluded.name,
    source_workbook_id = excluded.source_workbook_id,
    scoring_authority = 'GOOGLE',
    imported_at = now(), updated_at = now();

  for item in select value from jsonb_array_elements(coalesce(payload_body->'players', '[]'::jsonb)) loop
    insert into scoring_authority.players (player_id, display_name, source_payload)
    values (item->>'player_id', item->>'display_name', coalesce(item->'source_payload', '{}'::jsonb))
    on conflict (player_id) do update set
      display_name = excluded.display_name,
      source_payload = scoring_authority.players.source_payload || excluded.source_payload,
      updated_at = now();
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'teams', '[]'::jsonb)) loop
    insert into scoring_authority.teams (tournament_id, team_id, team_side, name, source_payload)
    values (target_tournament, item->>'team_id', (item->>'team_side')::integer, item->>'name', coalesce(item->'source_payload', '{}'::jsonb))
    on conflict (tournament_id, team_id) do update set
      team_side = excluded.team_side, name = excluded.name, source_payload = excluded.source_payload;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'tournament_players', '[]'::jsonb)) loop
    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side, participation_status, source_roster_key, source_payload
    ) values (
      target_tournament, item->>'player_id', item->>'team_id', (item->>'team_side')::integer,
      coalesce(item->>'participation_status', 'ACTIVE'), item->>'source_roster_key', coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'rounds', '[]'::jsonb)) loop
    insert into scoring_authority.rounds (
      tournament_id, round_number, format, name, handicap_allowance, status, source_payload
    ) values (
      target_tournament, (item->>'round_number')::integer, item->>'format', item->>'name',
      nullif(item->>'handicap_allowance', '')::numeric, coalesce(item->>'status', 'UPCOMING'), coalesce(item->'source_payload', '{}'::jsonb)
    ) on conflict (tournament_id, round_number) do update set
      format = excluded.format, name = excluded.name,
      handicap_allowance = excluded.handicap_allowance,
      status = excluded.status, source_payload = excluded.source_payload;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'snapshots', '[]'::jsonb)) loop
    insert into scoring_authority.scoring_snapshots (
      snapshot_id, tournament_id, match_id, snapshot_revision, scoring_rules_version, format,
      handicap_allowance, course_id, tee, rating, slope, par, match_netting_baseline,
      hole_definitions, participant_configuration, team_configuration, effective_at, canonical_hash
    ) values (
      item->>'snapshot_id', target_tournament, item->>'match_id', (item->>'snapshot_revision')::bigint,
      item->>'scoring_rules_version', item->>'format', nullif(item->>'handicap_allowance', '')::numeric,
      item->>'course_id', item->>'tee', nullif(item->>'rating', '')::numeric,
      nullif(item->>'slope', '')::integer, (item->>'par')::integer,
      item->>'match_netting_baseline', item->'hole_definitions', item->'participant_configuration',
      item->'team_configuration', nullif(item->>'effective_at', '')::timestamptz, item->>'canonical_hash'
    );
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'matches', '[]'::jsonb)) loop
    insert into scoring_authority.matches (
      match_id, tournament_id, round_number, format, scoring_snapshot_id, status, scoring_locked,
      permission_revision, match_revision, source_google_revision, scored_holes, current_hole,
      holes_remaining, team_1_holes_won, team_2_holes_won, running_result, result_winner,
      clinched, scorecard_complete, unresolved_mutations, source_google_updated_at,
      authority_updated_at, finalized_at
    ) values (
      item->>'match_id', target_tournament, (item->>'round_number')::integer, item->>'format',
      item->>'scoring_snapshot_id', item->>'status', coalesce((item->>'scoring_locked')::boolean, false),
      coalesce((item->>'permission_revision')::bigint, 1), coalesce((item->>'match_revision')::bigint, 0),
      coalesce((item->>'source_google_revision')::bigint, 0), coalesce((item->>'scored_holes')::integer, 0),
      coalesce((item->>'current_hole')::integer, 0), coalesce((item->>'holes_remaining')::integer, 18),
      coalesce((item->>'team_1_holes_won')::integer, 0), coalesce((item->>'team_2_holes_won')::integer, 0),
      coalesce(item->>'running_result', 'Scheduled'), coalesce(item->>'result_winner', ''),
      coalesce((item->>'clinched')::boolean, false), coalesce((item->>'scorecard_complete')::boolean, false), 0,
      nullif(item->>'source_google_updated_at', '')::timestamptz,
      coalesce(nullif(item->>'authority_updated_at', '')::timestamptz, now()),
      nullif(item->>'finalized_at', '')::timestamptz
    );
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'match_participants', '[]'::jsonb)) loop
    insert into scoring_authority.match_participants (
      match_id, player_id, team_side, player_slot, handicap_index, course_handicap, playing_handicap, final_strokes
    ) values (
      item->>'match_id', item->>'player_id', (item->>'team_side')::integer, (item->>'player_slot')::integer,
      nullif(item->>'handicap_index', '')::numeric, nullif(item->>'course_handicap', '')::numeric,
      (item->>'playing_handicap')::numeric, (item->>'final_strokes')::integer
    );
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'permissions', '[]'::jsonb)) loop
    insert into scoring_authority.scoring_permissions (match_id, player_id, can_score, permission_revision, revoked_at)
    values (item->>'match_id', item->>'player_id', coalesce((item->>'can_score')::boolean, false),
      coalesce((item->>'permission_revision')::bigint, 1), nullif(item->>'revoked_at', '')::timestamptz);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'match_holes', '[]'::jsonb)) loop
    insert into scoring_authority.match_holes (match_id, hole_number, snapshot_id, stroke_index, par, yardage)
    values (item->>'match_id', (item->>'hole_number')::integer, item->>'snapshot_id',
      (item->>'stroke_index')::integer, (item->>'par')::integer, nullif(item->>'yardage', '')::integer);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'hole_scores', '[]'::jsonb)) loop
    insert into scoring_authority.hole_scores (
      match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
      team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score, hole_winner,
      source_google_revision, source_google_updated_at, mutation_key, actor_id, created_at, updated_at
    ) values (
      item->>'match_id', (item->>'hole_number')::integer, (item->>'hole_revision')::bigint,
      item->'team_1_gross_scores', item->'team_2_gross_scores', item->'team_1_strokes', item->'team_2_strokes',
      (item->>'team_1_net_score')::integer, (item->>'team_2_net_score')::integer, item->>'hole_winner',
      coalesce((item->>'source_google_revision')::bigint, 0), nullif(item->>'source_google_updated_at', '')::timestamptz,
      item->>'mutation_key', coalesce(item->>'actor_id', 'Production Google shadow import'),
      coalesce(nullif(item->>'source_google_updated_at', '')::timestamptz, now()),
      coalesce(nullif(item->>'source_google_updated_at', '')::timestamptz, now())
    );
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload_body->'checkpoints', '[]'::jsonb)) loop
    insert into scoring_authority.google_match_checkpoints (
      match_id, last_supabase_match_revision, google_match_updated_at, google_match_revision,
      google_hole_revisions, verified_fingerprint, verified_at
    ) values (
      item->>'match_id', (item->>'last_supabase_match_revision')::bigint,
      nullif(item->>'google_match_updated_at', '')::timestamptz,
      coalesce((item->>'google_match_revision')::bigint, 0), coalesce(item->'google_hole_revisions', '{}'::jsonb),
      item->>'verified_fingerprint', now()
    );
  end loop;

  insert into scoring_authority.ingress_gates (
    tournament_id, state, authority, active_epoch_id, unresolved_client_queues, updated_by
  ) values (target_tournament, 'PAUSED', 'GOOGLE', null, 0, actor);
  if exists (select 1 from scoring_authority.google_outbox_events where tournament_id = target_tournament) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_SHADOW_IMPORT_CREATED_OUTBOX';
  end if;

  counts_value := jsonb_build_object(
    'players', jsonb_array_length(coalesce(payload_body->'players', '[]'::jsonb)),
    'tournament_players', jsonb_array_length(coalesce(payload_body->'tournament_players', '[]'::jsonb)),
    'teams', jsonb_array_length(coalesce(payload_body->'teams', '[]'::jsonb)),
    'rounds', jsonb_array_length(coalesce(payload_body->'rounds', '[]'::jsonb)),
    'snapshots', jsonb_array_length(coalesce(payload_body->'snapshots', '[]'::jsonb)),
    'matches', jsonb_array_length(coalesce(payload_body->'matches', '[]'::jsonb)),
    'match_participants', jsonb_array_length(coalesce(payload_body->'match_participants', '[]'::jsonb)),
    'permissions', jsonb_array_length(coalesce(payload_body->'permissions', '[]'::jsonb)),
    'match_holes', jsonb_array_length(coalesce(payload_body->'match_holes', '[]'::jsonb)),
    'hole_scores', jsonb_array_length(coalesce(payload_body->'hole_scores', '[]'::jsonb)),
    'checkpoints', jsonb_array_length(coalesce(payload_body->'checkpoints', '[]'::jsonb))
  );
  current_projection := production_control.current_tournament_shadow_projection(target_tournament);
  database_fingerprint_value := encode(extensions.digest(current_projection::text, 'sha256'), 'hex');

  insert into production_control.import_runs (
    import_run_id, domain, tournament_id, tournament_year, source_workbook_id,
    source_fingerprint, payload_fingerprint, database_fingerprint, importer_contract,
    actor, status, previous_import_run_id, counts, started_at, completed_at
  ) values (
    tournament_run_id, 'CURRENT_TOURNAMENT', target_tournament, target_year, production_workbook,
    source_fingerprint_value, payload_fingerprint_value, database_fingerprint_value,
    input->>'import_contract_version', actor, 'SUCCEEDED', previous_tournament_run_id,
    counts_value, now(), now()
  );
  insert into production_control.import_runs (
    import_run_id, domain, tournament_id, tournament_year, source_workbook_id,
    source_fingerprint, payload_fingerprint, database_fingerprint, importer_contract,
    actor, status, previous_import_run_id, counts, started_at, completed_at
  ) values (
    scoring_run_id, 'CURRENT_SCORING_SHADOW', target_tournament, target_year, production_workbook,
    source_fingerprint_value, payload_fingerprint_value, database_fingerprint_value,
    input->>'import_contract_version', actor, 'SUCCEEDED', previous_scoring_run_id,
    counts_value, now(), now()
  );
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'PRODUCTION_CURRENT_TOURNAMENT_SHADOW_IMPORTED', actor,
    jsonb_build_object(
      'currentTournamentImportRunId', tournament_run_id,
      'currentScoringImportRunId', scoring_run_id,
      'sourceFingerprint', source_fingerprint_value,
      'payloadFingerprint', payload_fingerprint_value,
      'databasePayloadFingerprint', database_payload_fingerprint_value,
      'databaseFingerprint', database_fingerprint_value,
      'counts', counts_value,
      'authority', 'GOOGLE', 'ingress', 'PAUSED', 'googleWrites', false
    ));
  return jsonb_build_object(
    'ok', true, 'changed', true, 'duplicate', false,
    'tournament_id', target_tournament, 'tournament_year', target_year,
    'current_tournament_import_run_id', tournament_run_id,
    'current_scoring_import_run_id', scoring_run_id,
    'source_fingerprint', source_fingerprint_value,
    'payload_fingerprint', payload_fingerprint_value,
    'database_payload_fingerprint', database_payload_fingerprint_value,
    'database_fingerprint', database_fingerprint_value,
    'counts', counts_value,
    'authority', 'GOOGLE', 'scoring_ingress', 'DISABLED',
    'google_outbox_events', 0, 'auth_users_created', 0
  );
end;
$$;

revoke all on function public.import_production_current_tournament_shadow(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.import_production_current_tournament_shadow(jsonb) to service_role;

create or replace function public.read_production_current_tournament_shadow(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp
as $$
declare
  production_project constant text := 'ymqhhtxaywtqllynrmxe';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_tournament constant text := '2026';
  mode_value text := upper(btrim(coalesce(input->>'mode', 'DIAGNOSTICS')));
  projection jsonb;
  fingerprint_value text;
  latest_run production_control.import_runs%rowtype;
  counts_value jsonb;
  actual_counts jsonb;
  parity boolean;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref', '')) <> production_project
     or btrim(coalesce(input->>'source_workbook_id', '')) <> production_workbook
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or btrim(coalesce(input->>'tournament_year', '')) <> '2026'
     or not exists (
       select 1 from production_control.resource_scope resource
       where resource.scope_key = 'BAGGER_INV_PRODUCTION'
         and resource.project_ref = production_project
         and resource.google_workbook_id = production_workbook
         and resource.current_tournament_read_authority = 'GOOGLE'
         and resource.scoring_authority = 'GOOGLE'
         and resource.participant_identity_authority = 'PASSPORT'
         and not resource.public_supabase_reads_enabled
         and not resource.scoring_ingress_enabled
         and not resource.google_writes_enabled
         and not resource.auth_user_creation_enabled
         and not resource.odds_publication_enabled
         and not resource.workers_enabled
     ) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CURRENT_SHADOW_SCOPE_REQUIRED');
  end if;
  if mode_value not in ('DIAGNOSTICS', 'CURRENT_STATE') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CURRENT_SHADOW_READ_MODE');
  end if;
  select run.* into latest_run
  from production_control.import_runs run
  where run.domain = 'CURRENT_SCORING_SHADOW'
    and run.tournament_id = target_tournament
    and run.tournament_year = 2026
    and run.source_workbook_id = production_workbook
    and run.status = 'SUCCEEDED'
  order by run.completed_at desc
  limit 1;
  if latest_run.import_run_id is null then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CURRENT_SHADOW_NOT_IMPORTED');
  end if;
  projection := production_control.current_tournament_shadow_projection(target_tournament);
  fingerprint_value := encode(extensions.digest(projection::text, 'sha256'), 'hex');
  counts_value := latest_run.counts;
  actual_counts := jsonb_build_object(
    'tournament_players', (select count(*) from scoring_authority.tournament_players where tournament_id = target_tournament),
    'teams', (select count(*) from scoring_authority.teams where tournament_id = target_tournament),
    'rounds', (select count(*) from scoring_authority.rounds where tournament_id = target_tournament),
    'snapshots', (select count(*) from scoring_authority.scoring_snapshots where tournament_id = target_tournament),
    'matches', (select count(*) from scoring_authority.matches where tournament_id = target_tournament),
    'match_participants', (select count(*) from scoring_authority.match_participants participant join scoring_authority.matches match_value using (match_id) where match_value.tournament_id = target_tournament),
    'permissions', (select count(*) from scoring_authority.scoring_permissions permission join scoring_authority.matches match_value using (match_id) where match_value.tournament_id = target_tournament),
    'match_holes', (select count(*) from scoring_authority.match_holes hole join scoring_authority.matches match_value using (match_id) where match_value.tournament_id = target_tournament),
    'hole_scores', (select count(*) from scoring_authority.hole_scores score join scoring_authority.matches match_value using (match_id) where match_value.tournament_id = target_tournament),
    'checkpoints', (select count(*) from scoring_authority.google_match_checkpoints checkpoint join scoring_authority.matches match_value using (match_id) where match_value.tournament_id = target_tournament)
  );
  parity := latest_run.database_fingerprint = fingerprint_value
    and not exists (
      select 1 from jsonb_each_text(actual_counts) actual
      where counts_value ? actual.key and counts_value->>actual.key <> actual.value
    );
  return jsonb_build_object(
    'ok', true,
    'mode', mode_value,
    'tournament_id', target_tournament,
    'tournament_year', 2026,
    'source_fingerprint', latest_run.source_fingerprint,
    'payload_fingerprint', latest_run.payload_fingerprint,
    'expected_database_fingerprint', latest_run.database_fingerprint,
    'actual_database_fingerprint', fingerprint_value,
    'expected_counts', counts_value,
    'actual_counts', actual_counts,
    'parity', parity,
    'authority', 'GOOGLE',
    'ingress', (select to_jsonb(gate) from scoring_authority.ingress_gates gate where gate.tournament_id = target_tournament),
    'outbox_count', (select count(*) from scoring_authority.google_outbox_events where tournament_id = target_tournament),
    'worker_controls_enabled', (select count(*) from production_control.worker_controls where enabled or scheduler_installed or google_writes_allowed),
    'import_run', to_jsonb(latest_run),
    'data', case when mode_value = 'CURRENT_STATE' then projection else null end
  );
end;
$$;

revoke all on function public.read_production_current_tournament_shadow(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.read_production_current_tournament_shadow(jsonb) to service_role;

create or replace function public.inspect_production_shadow_import_security()
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp
as $$
  select jsonb_build_object(
    'project_ref', (select project_ref from production_control.resource_scope where scope_key = 'BAGGER_INV_PRODUCTION'),
    'workbook_id', (select google_workbook_id from production_control.resource_scope where scope_key = 'BAGGER_INV_PRODUCTION'),
    'public_reads_enabled', (select public_supabase_reads_enabled from production_control.resource_scope where scope_key = 'BAGGER_INV_PRODUCTION'),
    'scoring_ingress_enabled', (select scoring_ingress_enabled from production_control.resource_scope where scope_key = 'BAGGER_INV_PRODUCTION'),
    'google_writes_enabled', (select google_writes_enabled from production_control.resource_scope where scope_key = 'BAGGER_INV_PRODUCTION'),
    'auth_user_creation_enabled', (select auth_user_creation_enabled from production_control.resource_scope where scope_key = 'BAGGER_INV_PRODUCTION'),
    'workers_enabled', (select workers_enabled from production_control.resource_scope where scope_key = 'BAGGER_INV_PRODUCTION'),
    'active_worker_controls', (select count(*) from production_control.worker_controls where enabled or scheduler_installed or google_writes_allowed),
    'operational_triggers_enabled', (
      select count(*) from pg_catalog.pg_trigger trigger_value
      where trigger_value.tgname in (
        'net_skins_hole_score_recalculation', 'tournament_storylines_score_change',
        'calcutta_official_match_change', 'capture_scorecard_archive_transition',
        'net_skins_match_lifecycle_recalculation', 'tournament_derived_match_change',
        'odds_google_mirror_supersession', 'tournament_storylines_net_skins_change'
      ) and trigger_value.tgenabled <> 'D'
    ),
    'outbox_events', (select count(*) from scoring_authority.google_outbox_events),
    'auth_users', (select count(*) from auth.users),
    'privileges', jsonb_build_object(
      'anon_history_import', has_function_privilege('anon', 'public.import_production_completed_history_year(jsonb)', 'execute'),
      'authenticated_history_import', has_function_privilege('authenticated', 'public.import_production_completed_history_year(jsonb)', 'execute'),
      'service_history_import', has_function_privilege('service_role', 'public.import_production_completed_history_year(jsonb)', 'execute'),
      'anon_current_import', has_function_privilege('anon', 'public.import_production_current_tournament_shadow(jsonb)', 'execute'),
      'authenticated_current_import', has_function_privilege('authenticated', 'public.import_production_current_tournament_shadow(jsonb)', 'execute'),
      'service_current_import', has_function_privilege('service_role', 'public.import_production_current_tournament_shadow(jsonb)', 'execute')
    )
  );
$$;

revoke all on function public.inspect_production_shadow_import_security() from public, anon, authenticated, service_role;
grant execute on function public.inspect_production_shadow_import_security() to service_role;

notify pgrst, 'reload schema';

commit;
