-- Step 13E.7B.1: exact annual Net Skins V1 mutation and worker scope.
--
-- The installed 2026 functions are deliberately not replaced. Future work is
-- reachable only through the annual scoring dispatcher and every row written
-- or claimed carries the exact ACTIVE runtime generation. Installation is
-- inert: it configures no tournament, creates no job/result, and moves no
-- pointer or authority state.
begin;

insert into production_control.annual_scoring_rpc_allowlist_v1 (
  operation_name, target_rpc, required_phase, operation_class,
  required_worker
) values
  ('configure_production_net_skins_v1',
    'public.future_production_configure_net_skins_v1',
    'OBSERVATION', 'MUTATION', null),
  ('enqueue_production_net_skins_v1_recalculation',
    'public.future_production_enqueue_net_skins_recalculation_v1',
    'OBSERVATION', 'MUTATION', null),
  ('claim_production_net_skins_v1_recalculation',
    'public.future_production_claim_net_skins_recalculation_v1',
    'OBSERVATION', 'MUTATION', null),
  ('complete_production_net_skins_v1_recalculation',
    'public.future_production_complete_net_skins_recalculation_v1',
    'OBSERVATION', 'MUTATION', null),
  ('fail_production_net_skins_v1_recalculation',
    'public.future_production_fail_net_skins_recalculation_v1',
    'OBSERVATION', 'MUTATION', null);

create or replace function production_control.assert_annual_net_skins_v1(
  input jsonb,
  expected_operation text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $annual_net_skins_assert$
declare
  target text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
begin
  target := production_control.assert_annual_scoring_runtime_v1(
    input, expected_operation, null
  );
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target
    and value.runtime_generation_id =
      (input->>'expected_runtime_generation_id')::uuid
    and value.generation_status = 'ACTIVE';
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target;
  if target = '2026'
     or resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or resource.source_workbook_id is null
     or resource.source_workbook_id is distinct from
       input->>'annual_destination_workbook_id'
     or generation.pointer_revision < 1 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
  end if;
  return target;
exception
  when invalid_text_representation or no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
end;
$annual_net_skins_assert$;

-- Overlay the 071 participant-safe reader so a later generation of the same
-- tournament cannot select a predecessor job/result merely because it was the
-- newest row. The public wrapper already holds the shared admission lock; this
-- helper independently re-proves the exact pointer/generation before reading.
create or replace function production_control.read_annual_net_skins_v1(
  target text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_net_skins_read_v2$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  result_value scoring_authority.net_skins_v1_result_revisions%rowtype;
  round_value jsonb;
  source_value jsonb;
  source_fingerprint text;
  source_fingerprints jsonb := '{}'::jsonb;
  entries_value jsonb;
  eligible_players jsonb;
  rounds_value jsonb := '[]'::jsonb;
  round_state text;
  top_state text;
  round_stale boolean;
  any_unavailable boolean := false;
  any_in_progress boolean := false;
  all_official boolean := true;
  max_result_revision bigint := 0;
  max_calculated_at timestamptz;
  max_published_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select pointer_value.* into strict pointer
  from production_control.current_tournament_pointer_v1 pointer_value
  where pointer_value.scope_key = 'BAGGER_INV_PRODUCTION'
    and pointer_value.tournament_id = target;
  select generation_value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 generation_value
  where generation_value.tournament_id = pointer.tournament_id
    and generation_value.pointer_revision = pointer.pointer_revision
    and generation_value.generation_status = 'ACTIVE';
  if target = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
  end if;

  select value.* into current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = target;
  if current_value.tournament_id is null
     or current_value.state = 'NOT_CONFIGURED' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'contract_version', 'production-net-skins-v1',
        'tournament_id', target, 'state', 'NOT_CONFIGURED',
        'publication_policy', 'OFFICIAL_ONLY',
        'configuration_revision', coalesce(
          current_value.configuration_revision, 0
        ), 'result_revision', null, 'configuration_fingerprint', null,
        'revision', pg_catalog.format(
          'net-skins-v1:%s:0:NOT_CONFIGURED',
          coalesce(current_value.configuration_revision, 0)
        ),
        'freshness', pg_catalog.jsonb_build_object(
          'stale', false, 'configured_at', null, 'calculated_at', null,
          'published_at', null, 'source_fingerprint', null
        ), 'rounds', '[]'::jsonb
      )
    );
  end if;
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id
    and value.tournament_id = target;
  if revision_value.authority_epoch_id is distinct from
       generation.authority_generation_id
     or revision_value.activation_revision <> pointer.pointer_revision then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
  end if;

  for round_value in
    select value from pg_catalog.jsonb_array_elements(
      revision_value.configuration_manifest->'rounds'
    ) value order by (value->>'round_number')::integer
  loop
    source_value := production_control.net_skins_v1_round_source_revision(
      target, (round_value->>'round_number')::integer
    );
    source_fingerprint := production_control.net_skins_v1_hash(source_value);
    source_fingerprints := source_fingerprints ||
      pg_catalog.jsonb_build_object(
        round_value->>'round_number', source_fingerprint
      );
    job_value := null;
    select value.* into job_value
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.tournament_id = target
      and value.runtime_generation_id = generation.runtime_generation_id
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision = current_value.configuration_revision
    order by value.requested_at desc, value.job_id desc limit 1;
    result_value := null;
    select value.* into result_value
    from scoring_authority.net_skins_v1_result_revisions value
    join scoring_authority.net_skins_v1_recalculation_jobs result_job
      on result_job.job_id = value.job_id
     and result_job.tournament_id = value.tournament_id
     and result_job.runtime_generation_id = generation.runtime_generation_id
    where value.tournament_id = target
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision = current_value.configuration_revision
      and value.is_current limit 1;
    if result_value.result_id is not null
       and result_value.result_state = 'OFFICIAL'
       and result_value.source_fingerprint = source_fingerprint then
      round_state := 'OFFICIAL'; round_stale := false;
    elsif job_value.job_id is not null
       and job_value.source_fingerprint = source_fingerprint
       and job_value.status = 'FAILED' then
      round_state := 'UNAVAILABLE'; round_stale := true;
    elsif job_value.job_id is not null
       and job_value.source_fingerprint = source_fingerprint
       and job_value.status in ('PENDING', 'RUNNING') then
      round_state := 'IN_PROGRESS'; round_stale := true;
    elsif result_value.result_id is not null
       and result_value.result_state = 'PROVISIONAL'
       and result_value.source_fingerprint = source_fingerprint then
      round_state := 'IN_PROGRESS'; round_stale := true;
    elsif exists (
      select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = target
        and match_value.round_number =
          (round_value->>'round_number')::integer
        and (match_value.status <> 'UPCOMING' or match_value.scored_holes > 0)
    ) then
      round_state := 'IN_PROGRESS'; round_stale := true;
    else
      round_state := 'CONFIGURED'; round_stale := false;
    end if;
    entries_value := coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'entry_id', entry->>'entry_id', 'entry_type', entry->>'entry_type',
        'match_id', entry->>'match_id', 'player_ids', entry->'player_ids'
      ) order by entry->>'entry_id')
      from pg_catalog.jsonb_array_elements(round_value->'entries') entry
      where coalesce((entry->>'eligible')::boolean, false)
    ), '[]'::jsonb);
    eligible_players := coalesce((
      select pg_catalog.jsonb_agg(player_id order by player_id)
      from (select distinct pg_catalog.jsonb_array_elements_text(
        entry->'player_ids'
      ) player_id from pg_catalog.jsonb_array_elements(
        round_value->'entries'
      ) entry where coalesce((entry->>'eligible')::boolean, false)) players
    ), '[]'::jsonb);
    any_unavailable := any_unavailable or round_state = 'UNAVAILABLE';
    any_in_progress := any_in_progress or round_state = 'IN_PROGRESS';
    all_official := all_official and round_state = 'OFFICIAL';
    max_result_revision := greatest(
      max_result_revision, coalesce(result_value.result_revision, 0)
    );
    max_calculated_at := case
      when result_value.calculated_at is not null and (
        max_calculated_at is null
        or result_value.calculated_at > max_calculated_at
      ) then result_value.calculated_at else max_calculated_at end;
    max_published_at := case
      when result_value.published_at is not null and (
        max_published_at is null or result_value.published_at > max_published_at
      ) then result_value.published_at else max_published_at end;
    rounds_value := rounds_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'round_id', round_value->>'round_id',
        'round_number', (round_value->>'round_number')::integer,
        'format', round_value->>'format',
        'entry_type', round_value->>'entry_type',
        'buy_in_per_entry', (round_value->>'buy_in_per_entry')::numeric,
        'eligible_entry_count', pg_catalog.jsonb_array_length(entries_value),
        'eligible_player_ids', eligible_players,
        'match_ids', round_value->'match_ids', 'entries', entries_value,
        'state', round_state,
        'configuration_revision', current_value.configuration_revision,
        'result_revision', case when result_value.result_id is null
          then null else result_value.result_revision end,
        'configuration_fingerprint',
          round_value->>'configuration_fingerprint',
        'freshness', pg_catalog.jsonb_build_object(
          'stale', round_stale, 'calculated_at', result_value.calculated_at,
          'published_at', case when round_state = 'OFFICIAL'
            then result_value.published_at else null end,
          'source_fingerprint', source_fingerprint
        ),
        'result_payload', case when round_state = 'OFFICIAL'
          then result_value.engine_result_payload else null end,
        'official_results', case when round_state = 'OFFICIAL'
          then result_value.public_result_payload else null end
      )
    );
  end loop;
  top_state := case when any_unavailable then 'UNAVAILABLE'
    when all_official and pg_catalog.jsonb_array_length(rounds_value) > 0
      then 'OFFICIAL'
    when any_in_progress or exists (
      select 1 from pg_catalog.jsonb_array_elements(rounds_value) value
      where value->>'state' = 'OFFICIAL'
    ) then 'IN_PROGRESS' else 'CONFIGURED' end;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'tournament_id', target, 'state', top_state,
      'publication_policy', 'OFFICIAL_ONLY',
      'configuration_revision', current_value.configuration_revision,
      'result_revision', case when max_result_revision = 0
        then null else max_result_revision end,
      'configuration_fingerprint', revision_value.configuration_fingerprint,
      'revision', pg_catalog.format(
        'net-skins-v1:%s:%s:%s', current_value.configuration_revision,
        max_result_revision, top_state
      ),
      'freshness', pg_catalog.jsonb_build_object(
        'stale', any_unavailable or any_in_progress,
        'configured_at', revision_value.configured_at,
        'calculated_at', max_calculated_at,
        'published_at', max_published_at,
        'source_fingerprint',
          production_control.net_skins_v1_hash(source_fingerprints)
      ), 'rounds', rounds_value
    )
  );
exception
  when no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
end;
$annual_net_skins_read_v2$;

create or replace function production_control.build_annual_net_skins_v1_manifest(
  target text,
  selected_round_numbers integer[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_net_skins_manifest$
declare
  round_row scoring_authority.rounds%rowtype;
  match_row record;
  participant_row record;
  side_value integer;
  expected_participants integer;
  participant_count integer;
  stable_participant_count integer;
  hole_count integer;
  team_players text[];
  team_handicap_value numeric;
  entry_value jsonb;
  entries_value jsonb;
  rounds_value jsonb := '[]'::jsonb;
  match_ids_value jsonb;
  round_manifest jsonb;
  format_value text;
  buy_in_value numeric;
  entry_type_value text;
  selected_count integer;
begin
  if target = '' or target = '2026'
     or selected_round_numbers is null
     or coalesce(pg_catalog.array_length(selected_round_numbers, 1), 0) = 0
     or exists (
       select 1 from pg_catalog.unnest(selected_round_numbers) value
       where value not between 1 and 99
     )
     or (select pg_catalog.count(*)
       from pg_catalog.unnest(selected_round_numbers) value) <>
       (select pg_catalog.count(distinct value)
       from pg_catalog.unnest(selected_round_numbers) value) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ELIGIBLE_ROUNDS_INVALID';
  end if;
  selected_count := pg_catalog.array_length(selected_round_numbers, 1);
  if (select pg_catalog.count(*)
      from scoring_authority.rounds value
      where value.tournament_id = target
        and value.round_number = any(selected_round_numbers)
        and value.format in ('BB', 'SC', 'SI')) <> selected_count then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
  end if;

  for round_row in
    select value.* from scoring_authority.rounds value
    where value.tournament_id = target
      and value.round_number = any(selected_round_numbers)
    order by value.round_number
  loop
    format_value := round_row.format;
    expected_participants := case format_value when 'SI' then 2 else 4 end;
    buy_in_value := case format_value when 'SC' then 50 else 25 end;
    entry_type_value := case format_value
      when 'SC' then 'PAIRING' else 'INDIVIDUAL' end;
    entries_value := '[]'::jsonb;
    match_ids_value := '[]'::jsonb;
    if not exists (
      select 1 from scoring_authority.matches value
      where value.tournament_id = target
        and value.round_number = round_row.round_number
    ) then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
    end if;

    for match_row in
      select match_value.*, snapshot.team_configuration,
        coalesce(nullif(presentation.display_match_number, ''),
          match_value.match_id) as engine_match_number
      from scoring_authority.matches match_value
      join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
       and snapshot.tournament_id = match_value.tournament_id
       and snapshot.match_id = match_value.match_id
      left join scoring_authority.game_center_presentations presentation
        on presentation.match_id = match_value.match_id
       and presentation.tournament_id = match_value.tournament_id
      where match_value.tournament_id = target
        and match_value.round_number = round_row.round_number
      order by match_value.match_id
    loop
      if match_row.format <> format_value then
        raise exception using errcode = '23514',
          message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
      end if;
      select pg_catalog.count(*),
        pg_catalog.count(distinct participant.player_id) filter (
          where participant.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
            and exists (
              select 1 from scoring_authority.tournament_players membership
              where membership.tournament_id = target
                and membership.player_id = participant.player_id
                and membership.participation_status = 'ACTIVE'
            )
        ) into participant_count, stable_participant_count
      from scoring_authority.match_participants participant
      where participant.match_id = match_row.match_id;
      if participant_count <> expected_participants
         or stable_participant_count <> expected_participants then
        raise exception using errcode = '23514',
          message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
      end if;
      select pg_catalog.count(distinct hole.hole_number) into hole_count
      from scoring_authority.match_holes hole
      where hole.match_id = match_row.match_id
        and hole.hole_number between 1 and 18;
      if hole_count <> 18 then
        raise exception using errcode = '23514',
          message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
      end if;
      match_ids_value := match_ids_value ||
        pg_catalog.jsonb_build_array(match_row.match_id);

      if format_value = 'SC' then
        for side_value in 1..2 loop
          select pg_catalog.array_agg(participant.player_id order by
              participant.player_slot, participant.player_id)
            into team_players
          from scoring_authority.match_participants participant
          where participant.match_id = match_row.match_id
            and participant.team_side = side_value;
          team_handicap_value := nullif(
            match_row.team_configuration->>
              pg_catalog.format('team_%s_strokes', side_value), ''
          )::numeric;
          if coalesce(pg_catalog.array_length(team_players, 1), 0) <> 2
             or team_handicap_value is null then
            raise exception using errcode = '23514',
              message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
          end if;
          entry_value := pg_catalog.jsonb_build_object(
            'entry_id', pg_catalog.format('%s:R%s:PAIRING:%s:S%s',
              target, round_row.round_number, match_row.match_id, side_value),
            'entry_type', 'PAIRING', 'match_id', match_row.match_id,
            'match_number', match_row.engine_match_number,
            'player_ids', pg_catalog.to_jsonb(team_players),
            'player_id_1', team_players[1], 'player_id_2', team_players[2],
            'team_handicap', team_handicap_value,
            'individual_stroke_allocation', null,
            'buy_in', buy_in_value, 'eligible', true
          );
          entries_value := entries_value ||
            pg_catalog.jsonb_build_array(entry_value);
        end loop;
      else
        for participant_row in
          select participant.*
          from scoring_authority.match_participants participant
          where participant.match_id = match_row.match_id
          order by participant.team_side, participant.player_slot,
            participant.player_id
        loop
          entry_value := pg_catalog.jsonb_build_object(
            'entry_id', pg_catalog.format('%s:R%s:PLAYER:%s', target,
              round_row.round_number, participant_row.player_id),
            'entry_type', 'INDIVIDUAL', 'match_id', match_row.match_id,
            'match_number', match_row.engine_match_number,
            'player_ids', pg_catalog.jsonb_build_array(
              participant_row.player_id),
            'player_id_1', participant_row.player_id, 'player_id_2', null,
            'team_handicap', null, 'individual_stroke_allocation',
              participant_row.final_strokes,
            'buy_in', buy_in_value, 'eligible', true
          );
          entries_value := entries_value ||
            pg_catalog.jsonb_build_array(entry_value);
        end loop;
      end if;
    end loop;

    if pg_catalog.jsonb_array_length(entries_value) = 0
       or (select pg_catalog.count(distinct player_id) from (
         select pg_catalog.jsonb_array_elements_text(entry->'player_ids')
           player_id from pg_catalog.jsonb_array_elements(entries_value) entry
       ) players) <>
       (select pg_catalog.count(*) from (
         select pg_catalog.jsonb_array_elements_text(entry->'player_ids')
           player_id from pg_catalog.jsonb_array_elements(entries_value) entry
       ) players) then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
    end if;
    round_manifest := pg_catalog.jsonb_build_object(
      'round_id', pg_catalog.format('%s:R%s', target,
        round_row.round_number),
      'round_number', round_row.round_number, 'round_name', round_row.name,
      'format', format_value, 'entry_type', entry_type_value,
      'buy_in_per_entry', buy_in_value,
      'expected_pot', pg_catalog.jsonb_array_length(entries_value) *
        buy_in_value,
      'eligible_holes', (select pg_catalog.jsonb_agg(value order by value)
        from pg_catalog.generate_series(1, 18) value),
      'net_handicap_basis', case format_value
        when 'SC' then 'CANONICAL_SCORING_SNAPSHOT_TEAM_STROKES'
        else 'CANONICAL_MATCH_PARTICIPANT_FINAL_STROKES' end,
      'completion_rule',
        'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL',
      'payout_rounding', 'NONE', 'tie_rule', 'NO_SKIN_NO_CARRY',
      'carry_rule', 'NO_CARRY', 'publication_policy', 'OFFICIAL_ONLY',
      'match_ids', match_ids_value, 'entries', entries_value
    );
    round_manifest := round_manifest || pg_catalog.jsonb_build_object(
      'configuration_fingerprint',
      production_control.net_skins_v1_hash(round_manifest)
    );
    rounds_value := rounds_value ||
      pg_catalog.jsonb_build_array(round_manifest);
  end loop;
  return pg_catalog.jsonb_build_object(
    'contract_version', 'production-net-skins-v1',
    'tournament_id', target, 'state', 'CONFIGURED',
    'publication_policy', 'OFFICIAL_ONLY', 'rounds', rounds_value
  );
end;
$annual_net_skins_manifest$;

create or replace function public.future_production_configure_net_skins_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_net_skins_configure$
declare
  target text;
  resource production_control.future_tournament_resources_v1%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  existing_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  selected_rounds integer[];
  manifest_value jsonb;
  round_value jsonb;
  entry_value jsonb;
  overall_fingerprint text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(coalesce(
    input->>'request_fingerprint', ''
  ));
  payload_hash_value text := production_control.net_skins_v1_hash(input);
  expected_configuration bigint := coalesce(
    (input->>'expected_configuration_revision')::bigint, -1
  );
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
  current_revision bigint;
  round_count integer := 0;
  entry_count integer := 0;
begin
  target := production_control.assert_annual_net_skins_v1(
    input, 'configure_production_net_skins_v1'
  );
  perform production_control.assert_future_production_scoring_actor_v1(
    input, target, true
  );
  if input->>'contract_version' is distinct from
       'production-net-skins-v1'
     or input->>'publication_policy' is distinct from 'OFFICIAL_ONLY'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'eligible_round_numbers', 'null'::jsonb
     )) <> 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_INPUT_INVALID';
  end if;
  select value.* into existing_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.request_fingerprint = request_fingerprint_value;
  if found then
    if existing_value.tournament_id <> target
       or existing_value.request_payload_hash <> payload_hash_value then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_NET_SKINS_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',
      'tournament_id', target,
      'runtime_generation_id', input->>'expected_runtime_generation_id',
      'configuration_revision', existing_value.configuration_revision,
      'configuration_fingerprint', existing_value.configuration_fingerprint,
      'state', existing_value.state,
      'rounds', existing_value.configuration_manifest->'rounds',
      'idempotent', true
    );
  end if;
  begin
    select pg_catalog.array_agg(value::integer order by value::integer)
      into selected_rounds
    from pg_catalog.jsonb_array_elements_text(
      input->'eligible_round_numbers'
    ) value;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ELIGIBLE_ROUNDS_INVALID';
  end;
  select value.* into current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = target for update;
  current_revision := coalesce(current_value.configuration_revision, 0);
  if current_revision <> expected_configuration then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target;
  manifest_value := production_control.build_annual_net_skins_v1_manifest(
    target, selected_rounds
  );
  overall_fingerprint := production_control.net_skins_v1_hash(manifest_value);
  resource_fingerprint_value := production_control.net_skins_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'environment', 'PRODUCTION', 'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.source_workbook_id,
      'tournament_id', target,
      'pointer_revision', (input->>'expected_pointer_revision')::bigint,
      'runtime_generation_id', input->>'expected_runtime_generation_id',
      'authority_generation_id',
        input->>'expected_annual_authority_generation_id',
      'admission_generation_id',
        input->>'expected_annual_admission_generation_id'
    )
  );
  insert into scoring_authority.net_skins_v1_configuration_revisions (
    tournament_id, configuration_revision, contract_version, state,
    publication_policy, configuration_manifest, configuration_fingerprint,
    resource_fingerprint, activation_revision, authority_epoch_id,
    configured_by_player_id, configured_by_auth_user_id,
    request_fingerprint, request_payload_hash, configured_at
  ) values (
    target, current_revision + 1, 'production-net-skins-v1', 'CONFIGURED',
    'OFFICIAL_ONLY', manifest_value, overall_fingerprint,
    resource_fingerprint_value, (input->>'expected_pointer_revision')::bigint,
    (input->>'expected_annual_authority_generation_id')::uuid,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.clock_timestamp()
  ) returning * into revision_value;

  update scoring_authority.net_skins_configurations set
    enabled = false, configuration_revision = revision_value.configuration_revision,
    imported_by = actor_player, updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target;
  for round_value in select value from pg_catalog.jsonb_array_elements(
    manifest_value->'rounds'
  ) value loop
    round_count := round_count + 1;
    insert into scoring_authority.net_skins_configurations (
      tournament_id, round_number, format, enabled, entry_type,
      buy_in_per_entry, expected_pot, completion_rule, payout_rounding,
      tie_rule, configuration_revision, configuration_fingerprint,
      source_workbook_id, imported_by, imported_at, approved_at, updated_at
    ) values (
      target, (round_value->>'round_number')::integer,
      round_value->>'format', true, round_value->>'entry_type',
      (round_value->>'buy_in_per_entry')::numeric,
      (round_value->>'expected_pot')::numeric,
      round_value->>'completion_rule', round_value->>'payout_rounding',
      round_value->>'tie_rule', revision_value.configuration_revision,
      round_value->>'configuration_fingerprint', resource.source_workbook_id,
      actor_player, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    ) on conflict (tournament_id, round_number) do update set
      format = excluded.format, enabled = true,
      entry_type = excluded.entry_type,
      buy_in_per_entry = excluded.buy_in_per_entry,
      expected_pot = excluded.expected_pot,
      completion_rule = excluded.completion_rule,
      payout_rounding = excluded.payout_rounding,
      tie_rule = excluded.tie_rule,
      configuration_revision = excluded.configuration_revision,
      configuration_fingerprint = excluded.configuration_fingerprint,
      source_workbook_id = excluded.source_workbook_id,
      imported_by = excluded.imported_by, imported_at = excluded.imported_at,
      approved_at = excluded.approved_at, updated_at = excluded.updated_at;
    delete from scoring_authority.net_skins_configuration_entries
    where tournament_id = target
      and round_number = (round_value->>'round_number')::integer;
    for entry_value in select value from pg_catalog.jsonb_array_elements(
      round_value->'entries'
    ) value loop
      entry_count := entry_count + 1;
      insert into scoring_authority.net_skins_configuration_entries (
        tournament_id, round_number, entry_id, match_number, format,
        player_id_1, player_id_2, team_handicap, buy_in, eligible,
        source_payload, created_at, updated_at
      ) values (
        target, (round_value->>'round_number')::integer,
        entry_value->>'entry_id', entry_value->>'match_number',
        round_value->>'format', entry_value->>'player_id_1',
        nullif(entry_value->>'player_id_2', ''),
        nullif(entry_value->>'team_handicap', '')::numeric,
        (entry_value->>'buy_in')::numeric, true,
        pg_catalog.jsonb_build_object(
          'Contract Version', 'production-net-skins-v1',
          'Canonical Match ID', entry_value->>'match_id',
          'Stable Player IDs', entry_value->'player_ids',
          'Eligible Holes', round_value->'eligible_holes',
          'Net Handicap Basis', round_value->>'net_handicap_basis',
          'Individual Stroke Allocation',
            entry_value->'individual_stroke_allocation'
        ), pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
      );
    end loop;
  end loop;
  insert into scoring_authority.net_skins_v1_configuration_current (
    tournament_id, configuration_revision_id, configuration_revision,
    state, updated_at
  ) values (
    target, revision_value.configuration_revision_id,
    revision_value.configuration_revision, 'CONFIGURED',
    pg_catalog.clock_timestamp()
  ) on conflict (tournament_id) do update set
    configuration_revision_id = excluded.configuration_revision_id,
    configuration_revision = excluded.configuration_revision,
    state = excluded.state, updated_at = excluded.updated_at;
  update scoring_authority.net_skins_v1_recalculation_jobs set
    status = 'SUPERSEDED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target
    and runtime_generation_id =
      (input->>'expected_runtime_generation_id')::uuid
    and status in ('PENDING', 'RUNNING');
  update scoring_authority.net_skins_v1_result_revisions set
    is_current = false, superseded_at = pg_catalog.clock_timestamp()
  where tournament_id = target and is_current;
  insert into scoring_authority.net_skins_configuration_import_runs (
    tournament_id, source_workbook_id, configuration_fingerprint, status,
    round_count, entry_count, requested_by, imported_at
  ) values (
    target, resource.source_workbook_id, overall_fingerprint, 'APPLIED',
    round_count, entry_count, actor_player, pg_catalog.clock_timestamp()
  );
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'PRODUCTION_NET_SKINS_V1_CONFIGURED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', revision_value.configuration_revision,
      'configuration_fingerprint', overall_fingerprint,
      'runtime_generation_id', input->>'expected_runtime_generation_id',
      'round_count', round_count, 'entry_count', entry_count
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_CONFIGURED', 'NET_SKINS', target,
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', revision_value.configuration_revision,
      'configuration_fingerprint', overall_fingerprint,
      'runtime_generation_id', input->>'expected_runtime_generation_id',
      'round_count', round_count, 'entry_count', entry_count
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',
    'tournament_id', target,
    'runtime_generation_id', input->>'expected_runtime_generation_id',
    'configuration_revision', revision_value.configuration_revision,
    'configuration_fingerprint', overall_fingerprint,
    'state', 'CONFIGURED', 'rounds', manifest_value->'rounds',
    'idempotent', false
  );
end;
$future_net_skins_configure$;

create or replace function production_control.enqueue_annual_net_skins_v1_round(
  target text,
  runtime_generation uuid,
  target_round_number integer,
  reason_value text,
  requested_by_value text
)
returns scoring_authority.net_skins_v1_recalculation_jobs
language plpgsql
security definer
set search_path = pg_catalog
as $annual_net_skins_enqueue_round$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  round_value jsonb;
  source_revision_value jsonb;
  source_fingerprint_value text;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target
    and value.runtime_generation_id = runtime_generation
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = target
    and value.runtime_generation_id = runtime_generation;
  if target = '2026'
     or pointer.tournament_id <> target
     or pointer.pointer_revision <> generation.pointer_revision
     or annual.pointer_revision <> pointer.pointer_revision
     or annual.authority_status <> 'ACTIVE'
     or annual.admission_state <> 'OPEN' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
  end if;

  select value.* into current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = target;
  if not found or current_value.state <> 'CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';
  end if;
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id
    and value.tournament_id = target;
  select value into round_value
  from pg_catalog.jsonb_array_elements(
    revision_value.configuration_manifest->'rounds'
  ) value
  where (value->>'round_number')::integer = target_round_number;
  if not found then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ROUND_NOT_CONFIGURED';
  end if;

  source_revision_value :=
    production_control.net_skins_v1_round_source_revision(
      target, target_round_number
    );
  source_fingerprint_value :=
    production_control.net_skins_v1_hash(source_revision_value);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format(
        'production-net-skins-v1:enqueue:%s:%s:R%s',
        target, runtime_generation, target_round_number
      ), 202608300074
    )
  );

  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.tournament_id = target
    and value.runtime_generation_id = runtime_generation
    and value.round_number = target_round_number
    and value.configuration_revision = current_value.configuration_revision
    and value.source_fingerprint = source_fingerprint_value
    and value.status in ('PENDING', 'RUNNING')
  order by value.requested_at desc, value.job_id desc
  limit 1;
  if found then return job_value; end if;

  update scoring_authority.net_skins_v1_recalculation_jobs set
    status = 'SUPERSEDED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target
    and runtime_generation_id = runtime_generation
    and round_number = target_round_number
    and status in ('PENDING', 'RUNNING');

  insert into scoring_authority.net_skins_v1_recalculation_jobs (
    tournament_id, round_number, configuration_revision_id,
    configuration_revision, configuration_fingerprint, source_revision,
    source_fingerprint, status, reason, requested_by,
    runtime_generation_id
  ) values (
    target, target_round_number, revision_value.configuration_revision_id,
    revision_value.configuration_revision,
    round_value->>'configuration_fingerprint', source_revision_value,
    source_fingerprint_value, 'PENDING',
    pg_catalog.left(coalesce(nullif(reason_value, ''),
      'EXPLICIT_RECALCULATION'), 120),
    pg_catalog.left(coalesce(nullif(requested_by_value, ''),
      'production-net-skins-v1'), 160), runtime_generation
  ) returning * into job_value;
  return job_value;
exception
  when no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
end;
$annual_net_skins_enqueue_round$;

create or replace function public.future_production_enqueue_net_skins_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_net_skins_enqueue$
declare
  target text;
  generation_id uuid;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  jobs_value jsonb := '[]'::jsonb;
  round_numbers integer[];
  round_number_value integer;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  expected_configuration bigint := coalesce(
    (input->>'expected_configuration_revision')::bigint, -1
  );
  request_fingerprint_value text := pg_catalog.lower(coalesce(
    input->>'request_fingerprint', ''
  ));
  receipt_operation text;
begin
  target := production_control.assert_annual_net_skins_v1(
    input, 'enqueue_production_net_skins_v1_recalculation'
  );
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  receipt_operation := pg_catalog.format(
    'ANNUAL_NET_SKINS_V1_ENQUEUE:%s', target
  );
  existing_response := production_control.lookup_cutover_receipt(
    receipt_operation, input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_REQUEST_FINGERPRINT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = target for update;
  if current_value.state <> 'CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <> expected_configuration then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id
    and value.tournament_id = target;

  if input ? 'round_numbers' then
    if pg_catalog.jsonb_typeof(input->'round_numbers') <> 'array' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_ROUNDS_INVALID';
    end if;
    begin
      select pg_catalog.array_agg(value::integer order by value::integer)
        into round_numbers
      from pg_catalog.jsonb_array_elements_text(input->'round_numbers') value;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_ROUNDS_INVALID';
    end;
  else
    select pg_catalog.array_agg(
      (value->>'round_number')::integer
      order by (value->>'round_number')::integer
    ) into round_numbers
    from pg_catalog.jsonb_array_elements(
      revision_value.configuration_manifest->'rounds'
    ) value;
  end if;
  if round_numbers is null
     or coalesce(pg_catalog.array_length(round_numbers, 1), 0) = 0
     or (select pg_catalog.count(*)
       from pg_catalog.unnest(round_numbers) value) <>
       (select pg_catalog.count(distinct value)
       from pg_catalog.unnest(round_numbers) value) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ROUNDS_INVALID';
  end if;

  foreach round_number_value in array round_numbers loop
    job_value := production_control.enqueue_annual_net_skins_v1_round(
      target, generation_id, round_number_value,
      pg_catalog.left(coalesce(nullif(input->>'reason', ''),
        'EXPLICIT_RECALCULATION'), 120),
      pg_catalog.left(coalesce(nullif(input->>'requested_by', ''),
        'production-net-skins-v1'), 160)
    );
    jobs_value := jobs_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'job_id', job_value.job_id,
        'tournament_id', job_value.tournament_id,
        'runtime_generation_id', job_value.runtime_generation_id,
        'round_number', job_value.round_number, 'status', job_value.status,
        'source_fingerprint', job_value.source_fingerprint
      )
    );
  end loop;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_ENQUEUED',
    'tournament_id', target, 'runtime_generation_id', generation_id,
    'configuration_revision', current_value.configuration_revision,
    'jobs', jobs_value, 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    receipt_operation, input, response_value
  );
  return response_value;
end;
$future_net_skins_enqueue$;

create or replace function public.future_production_claim_net_skins_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_net_skins_claim$
declare
  target text;
  generation_id uuid;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  calculation_input jsonb;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  lease_seconds_value integer := least(300, greatest(
    15, coalesce((input->>'lease_seconds')::integer, 60)
  ));
  current_source jsonb;
  current_source_fingerprint text;
  expected_result_revision bigint;
  claim_token_value uuid;
  receipt_operation text;
begin
  target := production_control.assert_annual_net_skins_v1(
    input, 'claim_production_net_skins_v1_recalculation'
  );
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  receipt_operation := pg_catalog.format(
    'ANNUAL_NET_SKINS_V1_CLAIM:%s', target
  );
  existing_response := production_control.lookup_cutover_receipt(
    receipt_operation, input
  );
  if existing_response is not null then return existing_response; end if;
  if worker_value = '' or pg_catalog.length(worker_value) > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_WORKER_ID_REQUIRED';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = target;
  if current_value.state <> 'CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;

  update scoring_authority.net_skins_v1_recalculation_jobs set
    status = case when attempts >= 5 then 'FAILED' else 'PENDING' end,
    claimed_by = null, claim_token = null, lease_expires_at = null,
    completed_at = case when attempts >= 5
      then pg_catalog.clock_timestamp() else null end,
    last_error_code = case when attempts >= 5
      then 'PRODUCTION_NET_SKINS_LEASE_EXHAUSTED' else null end,
    last_error_safe = case when attempts >= 5
      then 'Net Skins recalculation is temporarily unavailable.' else null end,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target
    and runtime_generation_id = generation_id
    and configuration_revision = current_value.configuration_revision
    and status = 'RUNNING'
    and lease_expires_at <= pg_catalog.clock_timestamp();

  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.tournament_id = target
    and value.runtime_generation_id = generation_id
    and value.configuration_revision = current_value.configuration_revision
    and value.status = 'PENDING' and value.attempts < 5
  order by value.requested_at, value.round_number
  for update skip locked limit 1;
  if not found then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_EMPTY',
      'tournament_id', target, 'runtime_generation_id', generation_id,
      'job', null, 'calculation_input', null, 'idempotent', false
    );
    perform production_control.store_cutover_receipt(
      receipt_operation, input, response_value
    );
    return response_value;
  end if;

  current_source := production_control.net_skins_v1_round_source_revision(
    target, job_value.round_number
  );
  current_source_fingerprint :=
    production_control.net_skins_v1_hash(current_source);
  if current_source_fingerprint <> job_value.source_fingerprint then
    update scoring_authority.net_skins_v1_recalculation_jobs set
      status = 'SUPERSEDED', completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where job_id = job_value.job_id
      and tournament_id = target
      and runtime_generation_id = generation_id;
    job_value := production_control.enqueue_annual_net_skins_v1_round(
      target, generation_id, job_value.round_number,
      'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value
    );
    select value.* into strict job_value
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.job_id = job_value.job_id
      and value.tournament_id = target
      and value.runtime_generation_id = generation_id for update;
  end if;

  claim_token_value := extensions.gen_random_uuid();
  update scoring_authority.net_skins_v1_recalculation_jobs set
    status = 'RUNNING', attempts = attempts + 1,
    claimed_by = worker_value, claim_token = claim_token_value,
    lease_expires_at = pg_catalog.clock_timestamp()
      + pg_catalog.make_interval(secs => lease_seconds_value),
    started_at = pg_catalog.clock_timestamp(), completed_at = null,
    updated_at = pg_catalog.clock_timestamp()
  where job_id = job_value.job_id
    and tournament_id = target
    and runtime_generation_id = generation_id
  returning * into job_value;

  select coalesce(pg_catalog.max(value.result_revision), 0)
    into expected_result_revision
  from scoring_authority.net_skins_v1_result_revisions value
  where value.tournament_id = target
    and value.round_number = job_value.round_number;
  calculation_input := public.read_net_skins_input_view(target);
  if coalesce((calculation_input->>'ok')::boolean, false) is not true
     or calculation_input#>>'{data,source_revision,tournamentId}'
       is distinct from target then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_UNAVAILABLE';
  end if;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_CLAIMED',
    'tournament_id', target, 'runtime_generation_id', generation_id,
    'job', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id, 'tournament_id', job_value.tournament_id,
      'runtime_generation_id', job_value.runtime_generation_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'source_fingerprint', job_value.source_fingerprint,
      'claim_token', job_value.claim_token,
      'lease_expires_at', job_value.lease_expires_at,
      'expected_result_revision', expected_result_revision
    ),
    'calculation_input', calculation_input->'data', 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    receipt_operation, input, response_value
  );
  return response_value;
end;
$future_net_skins_claim$;

create or replace function production_control.normalize_annual_net_skins_v1_official_result(
  target text,
  target_round_number integer,
  engine_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_net_skins_normalize$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  round_value jsonb;
  skin_value jsonb;
  leaderboard_value jsonb;
  entry_row scoring_authority.net_skins_configuration_entries%rowtype;
  winner_id_1 text;
  winner_id_2 text;
  target_entry_id text;
  hole_number_value integer;
  normalized_skins jsonb := '[]'::jsonb;
  normalized_leaderboard jsonb := '[]'::jsonb;
  configured_entry_count integer;
  normalized_skin_count integer := 0;
  normalized_leader_count integer := 0;
  expected_pot_value numeric;
  seen_holes integer[] := '{}'::integer[];
begin
  if target = '' or target = '2026' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
  end if;
  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = target and value.state = 'CONFIGURED';
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id
    and value.tournament_id = target;
  select value into strict round_value
  from pg_catalog.jsonb_array_elements(
    revision_value.configuration_manifest->'rounds'
  ) value
  where (value->>'round_number')::integer = target_round_number;

  configured_entry_count := pg_catalog.jsonb_array_length(
    round_value->'entries'
  );
  expected_pot_value := (round_value->>'expected_pot')::numeric;
  if pg_catalog.jsonb_typeof(engine_payload) <> 'object'
     or coalesce((engine_payload->>'round')::integer, 0) <>
       target_round_number
     or engine_payload->>'format' is distinct from round_value->>'format'
     or coalesce((engine_payload->>'complete')::boolean, false) is not true
     or coalesce((engine_payload->>'finalized')::boolean, false) is not true
     or coalesce((engine_payload->>'completedHoles')::integer, -1) <> 18
     or coalesce((engine_payload->>'eligibleCount')::integer, -1) <>
       configured_entry_count
     or coalesce((engine_payload->>'pot')::numeric, -1) <>
       expected_pot_value
     or pg_catalog.jsonb_typeof(coalesce(
       engine_payload->'skins', 'null'::jsonb
     )) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(
       engine_payload->'leaderboard', 'null'::jsonb
     )) <> 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
  end if;

  if exists (
    select 1 from (
      select distinct entry->>'match_id' as match_id
      from pg_catalog.jsonb_array_elements(round_value->'entries') entry
    ) configured_match
    left join scoring_authority.matches match_value
      on match_value.match_id = configured_match.match_id
     and match_value.tournament_id = target
     and match_value.round_number = target_round_number
    where match_value.match_id is null or match_value.status <> 'FINAL'
       or not match_value.scorecard_complete
       or match_value.scored_holes <> 18
       or match_value.finalized_at is null
       or pg_catalog.btrim(match_value.result_winner) = ''
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_REFERENCED_MATCHES_NOT_OFFICIAL';
  end if;

  for skin_value in
    select value from pg_catalog.jsonb_array_elements(
      engine_payload->'skins'
    ) value order by (value->>'hole')::integer
  loop
    begin
      hole_number_value := (skin_value->>'hole')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end;
    if hole_number_value not between 1 and 18
       or hole_number_value = any(seen_holes) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end if;
    seen_holes := pg_catalog.array_append(seen_holes, hole_number_value);
    winner_id_1 := pg_catalog.btrim(coalesce(
      skin_value->>'winnerPlayerId', ''
    ));
    winner_id_2 := pg_catalog.btrim(coalesce(
      skin_value->>'winnerPlayerId2', ''
    ));
    if winner_id_1 = '' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end if;
    select value.* into entry_row
    from scoring_authority.net_skins_configuration_entries value
    where value.tournament_id = target
      and value.round_number = target_round_number and value.eligible
      and ((value.format <> 'SC' and value.player_id_1 = winner_id_1
          and winner_id_2 = '')
        or (value.format = 'SC'
          and least(value.player_id_1, value.player_id_2) =
            least(winner_id_1, winner_id_2)
          and greatest(value.player_id_1, value.player_id_2) =
            greatest(winner_id_1, winner_id_2)));
    if not found then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end if;
    target_entry_id := entry_row.entry_id;
    normalized_skin_count := normalized_skin_count + 1;
    normalized_skins := normalized_skins || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'skin_id', pg_catalog.format('%s:R%s:H%s', target,
          target_round_number, hole_number_value),
        'hole_number', hole_number_value,
        'match_id', entry_row.source_payload->>'Canonical Match ID',
        'winner_entry_id', target_entry_id,
        'winner_player_ids', case when entry_row.player_id_2 is null
          then pg_catalog.jsonb_build_array(entry_row.player_id_1)
          else pg_catalog.jsonb_build_array(
            entry_row.player_id_1, entry_row.player_id_2) end,
        'winning_net_score', (skin_value->>'winningNetScore')::numeric,
        'skin_value', (skin_value->>'skinValue')::numeric
      )
    );
  end loop;
  if normalized_skin_count <>
       coalesce((engine_payload->>'skinsAwarded')::integer, -1) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
  end if;

  for leaderboard_value in
    select value from pg_catalog.jsonb_array_elements(
      engine_payload->'leaderboard'
    ) value order by (value->>'rank')::integer, value->>'id'
  loop
    target_entry_id := pg_catalog.btrim(coalesce(
      leaderboard_value->>'id', ''
    ));
    select value.* into entry_row
    from scoring_authority.net_skins_configuration_entries value
    where value.tournament_id = target
      and value.round_number = target_round_number
      and value.entry_id = target_entry_id and value.eligible;
    if not found then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end if;
    normalized_leader_count := normalized_leader_count + 1;
    normalized_leaderboard := normalized_leaderboard ||
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'rank', (leaderboard_value->>'rank')::integer,
        'display_rank', coalesce(leaderboard_value->>'displayRank', ''),
        'entry_id', entry_row.entry_id,
        'player_ids', case when entry_row.player_id_2 is null
          then pg_catalog.jsonb_build_array(entry_row.player_id_1)
          else pg_catalog.jsonb_build_array(
            entry_row.player_id_1, entry_row.player_id_2) end,
        'skins_won', (leaderboard_value->>'skinsWon')::integer,
        'total_winnings', (leaderboard_value->>'totalWinnings')::numeric,
        'winning_hole_numbers', coalesce((
          select pg_catalog.jsonb_agg(
            (skin->>'hole_number')::integer
            order by (skin->>'hole_number')::integer
          ) from pg_catalog.jsonb_array_elements(normalized_skins) skin
          where skin->>'winner_entry_id' = entry_row.entry_id
        ), '[]'::jsonb)
      ));
  end loop;
  if normalized_leader_count <> configured_entry_count then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
  end if;
  return pg_catalog.jsonb_build_object(
    'pot', (engine_payload->>'pot')::numeric,
    'eligible_count', (engine_payload->>'eligibleCount')::integer,
    'completed_holes', (engine_payload->>'completedHoles')::integer,
    'skins_awarded', (engine_payload->>'skinsAwarded')::integer,
    'skin_value', (engine_payload->>'skinValue')::numeric,
    'complete', true, 'finalized', true,
    'skins', normalized_skins, 'leaderboard', normalized_leaderboard
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
end;
$annual_net_skins_normalize$;

create or replace function public.future_production_complete_net_skins_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_net_skins_complete$
declare
  target text;
  generation_id uuid;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  result_value scoring_authority.net_skins_v1_result_revisions%rowtype;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  result_state_value text := pg_catalog.upper(coalesce(
    input->>'result_state', ''
  ));
  result_payload_value jsonb := input->'result_payload';
  normalized_result_value jsonb;
  payload_hash_value text;
  current_source_value jsonb;
  current_source_fingerprint text;
  current_result_revision bigint;
  expected_result_revision bigint := coalesce(
    (input->>'expected_result_revision')::bigint, -1
  );
  receipt_operation text;
begin
  target := production_control.assert_annual_net_skins_v1(
    input, 'complete_production_net_skins_v1_recalculation'
  );
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  receipt_operation := pg_catalog.format(
    'ANNUAL_NET_SKINS_V1_COMPLETE:%s', target
  );
  existing_response := production_control.lookup_cutover_receipt(
    receipt_operation, input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or input->>'engine_version' is distinct from 'net-skins-js-v1'
     or result_state_value not in ('PROVISIONAL', 'OFFICIAL')
     or pg_catalog.jsonb_typeof(coalesce(
       result_payload_value, 'null'::jsonb
     )) <> 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_COMPLETION_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = target for update;
  if current_value.state <> 'CONFIGURED'
     or current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.job_id = job_id_value
    and value.tournament_id = target
    and value.runtime_generation_id = generation_id for update;
  if not found or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_JOB_LEASE_REQUIRED';
  end if;
  if input->>'source_fingerprint'
       is distinct from job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';
  end if;
  current_source_value :=
    production_control.net_skins_v1_round_source_revision(
      target, job_value.round_number
    );
  current_source_fingerprint :=
    production_control.net_skins_v1_hash(current_source_value);
  if current_source_fingerprint <> job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';
  end if;
  if coalesce((result_payload_value->>'round')::integer, 0) <>
       job_value.round_number then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_RESULT_ROUND_MISMATCH';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('production-net-skins-v1:%s:%s:R%s', target,
        generation_id, job_value.round_number), 202608300074
    )
  );
  select coalesce(pg_catalog.max(value.result_revision), 0)
    into current_result_revision
  from scoring_authority.net_skins_v1_result_revisions value
  where value.tournament_id = target
    and value.round_number = job_value.round_number;
  if current_result_revision <> expected_result_revision then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_RESULT_REVISION_CONFLICT';
  end if;
  if result_state_value = 'OFFICIAL' then
    normalized_result_value :=
      production_control.normalize_annual_net_skins_v1_official_result(
        target, job_value.round_number, result_payload_value
      );
  else
    normalized_result_value := null;
    if pg_catalog.jsonb_typeof(coalesce(
         result_payload_value->'skins', 'null'::jsonb
       )) <> 'array'
       or pg_catalog.jsonb_typeof(coalesce(
         result_payload_value->'leaderboard', 'null'::jsonb
       )) <> 'array' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_PROVISIONAL_RESULT_INVALID';
    end if;
  end if;
  payload_hash_value := production_control.net_skins_v1_hash(
    result_payload_value
  );

  update scoring_authority.net_skins_v1_result_revisions set
    is_current = false, superseded_at = pg_catalog.clock_timestamp()
  where tournament_id = target and round_number = job_value.round_number
    and is_current;
  insert into scoring_authority.net_skins_v1_result_revisions (
    tournament_id, round_number, configuration_revision_id,
    configuration_revision, result_revision, job_id, engine_version,
    configuration_fingerprint, source_fingerprint, result_state,
    engine_result_payload, public_result_payload, payload_hash, is_current,
    calculated_by, calculated_at, published_at
  ) values (
    target, job_value.round_number, job_value.configuration_revision_id,
    job_value.configuration_revision, current_result_revision + 1,
    job_value.job_id, 'net-skins-js-v1',
    job_value.configuration_fingerprint, job_value.source_fingerprint,
    result_state_value, result_payload_value, normalized_result_value,
    payload_hash_value, true, worker_value, pg_catalog.clock_timestamp(),
    case when result_state_value = 'OFFICIAL'
      then pg_catalog.clock_timestamp() else null end
  ) returning * into result_value;
  update scoring_authority.net_skins_v1_recalculation_jobs set
    status = 'SUCCEEDED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    last_error_code = null, last_error_safe = null,
    updated_at = pg_catalog.clock_timestamp()
  where job_id = job_value.job_id and tournament_id = target
    and runtime_generation_id = generation_id;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED', worker_value,
    pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id, 'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'result_revision', result_value.result_revision,
      'result_state', result_state_value,
      'source_fingerprint', job_value.source_fingerprint,
      'payload_hash', payload_hash_value,
      'runtime_generation_id', generation_id,
      'published', result_state_value = 'OFFICIAL'
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED', 'NET_SKINS',
    target, worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id, 'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'result_revision', result_value.result_revision,
      'result_state', result_state_value,
      'runtime_generation_id', generation_id,
      'published', result_state_value = 'OFFICIAL'
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED',
    'tournament_id', target, 'runtime_generation_id', generation_id,
    'job_id', job_value.job_id, 'round_number', job_value.round_number,
    'configuration_revision', job_value.configuration_revision,
    'result_revision', result_value.result_revision,
    'result_state', result_state_value,
    'published', result_state_value = 'OFFICIAL', 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    receipt_operation, input, response_value
  );
  return response_value;
end;
$future_net_skins_complete$;

create or replace function public.future_production_fail_net_skins_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_net_skins_fail$
declare
  target text;
  generation_id uuid;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  error_code_value text := pg_catalog.upper(pg_catalog.left(
    coalesce(nullif(input->>'error_code', ''),
      'PRODUCTION_NET_SKINS_CALCULATION_FAILED'), 120
  ));
  error_safe_value text := pg_catalog.left(coalesce(
    nullif(input->>'error_safe', ''),
    'Net Skins recalculation is temporarily unavailable.'
  ), 300);
  receipt_operation text;
begin
  target := production_control.assert_annual_net_skins_v1(
    input, 'fail_production_net_skins_v1_recalculation'
  );
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  receipt_operation := pg_catalog.format(
    'ANNUAL_NET_SKINS_V1_FAIL:%s', target
  );
  existing_response := production_control.lookup_cutover_receipt(
    receipt_operation, input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or error_code_value !~ '^[A-Z0-9_:-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_FAILURE_INPUT_INVALID';
  end if;
  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = target;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.job_id = job_id_value and value.tournament_id = target
    and value.runtime_generation_id = generation_id for update;
  if not found or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_JOB_LEASE_REQUIRED';
  end if;
  update scoring_authority.net_skins_v1_recalculation_jobs set
    status = 'FAILED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    last_error_code = error_code_value, last_error_safe = error_safe_value,
    updated_at = pg_catalog.clock_timestamp()
  where job_id = job_value.job_id and tournament_id = target
    and runtime_generation_id = generation_id;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED', 'NET_SKINS', target,
    worker_value, pg_catalog.lower(input->>'request_fingerprint'), 'FAILED',
    pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id, 'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'runtime_generation_id', generation_id,
      'error_code', error_code_value
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED',
    'tournament_id', target, 'runtime_generation_id', generation_id,
    'job_id', job_value.job_id, 'round_number', job_value.round_number,
    'configuration_revision', job_value.configuration_revision,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    receipt_operation, input, response_value
  );
  return response_value;
end;
$future_net_skins_fail$;

-- Keep the frozen 2026 invalidation trigger intact. This companion is a
-- future-only hook; the two functions are mutually exclusive by tournament.
create or replace function scoring_authority.enqueue_annual_net_skins_v1_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $annual_net_skins_change$
declare
  target_match_id text;
  match_value scoring_authority.matches%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
begin
  target_match_id := case when tg_op = 'DELETE'
    then old.match_id else new.match_id end;
  select value.* into match_value
  from scoring_authority.matches value
  where value.match_id = target_match_id;
  if not found or match_value.tournament_id = '2026' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = match_value.tournament_id;
  if not found or current_value.state <> 'CONFIGURED' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = match_value.tournament_id
    and value.generation_status = 'ACTIVE';
  if pointer.tournament_id <> match_value.tournament_id
     or pointer.pointer_revision <> generation.pointer_revision then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
  end if;
  perform production_control.enqueue_annual_net_skins_v1_round(
    match_value.tournament_id, generation.runtime_generation_id,
    match_value.round_number,
    case when tg_table_name = 'hole_scores'
      then 'CANONICAL_SCORE_CHANGED'
      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,
    'production-net-skins-v1-trigger'
  );
  return case when tg_op = 'DELETE' then old else new end;
exception
  when sqlstate '22023' then
    return case when tg_op = 'DELETE' then old else new end;
end;
$annual_net_skins_change$;

create trigger production_annual_net_skins_v1_hole_score_recalculation
after insert or update or delete on scoring_authority.hole_scores
for each row execute function
  scoring_authority.enqueue_annual_net_skins_v1_change();

create trigger production_annual_net_skins_v1_match_lifecycle_recalculation
after update of status, finalized_at, match_revision, scorecard_complete
on scoring_authority.matches
for each row execute function
  scoring_authority.enqueue_annual_net_skins_v1_change();

revoke all on function production_control.assert_annual_net_skins_v1(
  jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function production_control.build_annual_net_skins_v1_manifest(
  text, integer[]
) from public, anon, authenticated, service_role;
revoke all on function production_control.enqueue_annual_net_skins_v1_round(
  text, uuid, integer, text, text
) from public, anon, authenticated, service_role;
revoke all on function
  production_control.normalize_annual_net_skins_v1_official_result(
    text, integer, jsonb
  ) from public, anon, authenticated, service_role;
revoke all on function scoring_authority.enqueue_annual_net_skins_v1_change()
  from public, anon, authenticated, service_role;

-- Future public targets are callable only by the SECURITY DEFINER annual
-- dispatcher. In particular, service_role cannot bypass its allowlist or
-- synthesize a tournament/generation tuple directly.
revoke all on function public.future_production_configure_net_skins_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.future_production_enqueue_net_skins_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.future_production_claim_net_skins_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.future_production_complete_net_skins_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.future_production_fail_net_skins_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;

comment on function public.future_production_configure_net_skins_v1(jsonb)
is 'Future-only Net Skins V1 configuration, exact annual runtime bound.';
comment on function
  public.future_production_enqueue_net_skins_recalculation_v1(jsonb)
is 'Future-only Net Skins V1 enqueue, exact annual runtime bound.';
comment on function
  public.future_production_claim_net_skins_recalculation_v1(jsonb)
is 'Future-only Net Skins V1 leased claim, exact annual runtime bound.';
comment on function
  public.future_production_complete_net_skins_recalculation_v1(jsonb)
is 'Future-only Net Skins V1 completion, exact annual runtime bound.';
comment on function
  public.future_production_fail_net_skins_recalculation_v1(jsonb)
is 'Future-only Net Skins V1 failure, exact annual runtime bound.';

select pg_catalog.pg_notify('pgrst', 'reload schema');
commit;
