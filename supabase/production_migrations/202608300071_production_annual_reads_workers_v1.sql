-- Step 13E.7B annual current reads and generation-bound workers.
--
-- Installation is inert: it does not move the current pointer, create a
-- future tournament, enable a worker, write Google, or change a score. The
-- frozen 2026 RPC names and request shapes remain intact. Explicit HISTORY_2026
-- is deliberately independent of the current pointer.
begin;

-- A transition holds the exclusive form of this lock. Every current read
-- repeats the pointer assertion while holding the shared form, closing the
-- resolver/RPC transaction gap.
create or replace function production_control.assert_frozen_2026_current_read_v1()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_current_read$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id <> '2026' or pointer.tournament_year <> 2026 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CURRENT_READ_POINTER_NOT_2026';
  end if;
end;
$frozen_current_read$;

alter function public.read_production_cutover_current_view(jsonb)
  rename to read_production_cutover_current_view_frozen_2026_v1;

create function public.read_production_cutover_current_view(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $current_read_pointer_fence$
begin
  -- History is a named immutable resource, not a current-tournament alias.
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'surface', '')))
       = 'HISTORY_2026' then
    return public.read_production_cutover_current_view_frozen_2026_v1(input);
  end if;
  perform production_control.assert_frozen_2026_current_read_v1();
  return public.read_production_cutover_current_view_frozen_2026_v1(input);
end;
$current_read_pointer_fence$;

-- The two participant-safe side-game V1 names and the current Guide
-- projection bypass the multiplexed reader. Fence their legacy bodies too,
-- without changing their public names or JSON input shapes.
alter function public.read_production_net_skins_v1(jsonb)
  rename to read_production_net_skins_frozen_2026_v1;
create function public.read_production_net_skins_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $frozen_net_skins_read$
begin
  perform production_control.assert_frozen_2026_current_read_v1();
  return public.read_production_net_skins_frozen_2026_v1(input);
end;
$frozen_net_skins_read$;

alter function public.read_production_calcutta_v1(jsonb)
  rename to read_production_calcutta_frozen_2026_v1;
create function public.read_production_calcutta_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $frozen_calcutta_read$
begin
  perform production_control.assert_frozen_2026_current_read_v1();
  return public.read_production_calcutta_frozen_2026_v1(input);
end;
$frozen_calcutta_read$;

alter function public.read_production_guide_projection(jsonb)
  rename to read_production_guide_projection_frozen_2026_v1;
create function public.read_production_guide_projection(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $frozen_guide_read$
begin
  perform production_control.assert_frozen_2026_current_read_v1();
  return public.read_production_guide_projection_frozen_2026_v1(input);
end;
$frozen_guide_read$;

-- Future current reads use the exact five annual tokens already established
-- by the scoring transition. This is a read assertion, not another pointer or
-- allowlist mechanism.
create or replace function production_control.assert_annual_current_read_v1(
  input jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $annual_current_read$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual_authority production_control.annual_scoring_runtime_authorities_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  google_destination jsonb;
  active_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual_authority
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.runtime_generation_id = generation.runtime_generation_id
    and value.authority_status = 'ACTIVE'
    and value.admission_state = 'OPEN';
  select value.* into strict annual_resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = pointer.tournament_id;
  if pg_catalog.to_regclass(
       'production_control.future_google_writer_targets_v2'
     ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CURRENT_READ_RUNTIME_REQUIRED';
  end if;
  execute $destination$
    select pg_catalog.jsonb_build_object(
      'writerGenerationId', target.writer_generation_id,
      'destinationWorkbookId', target.destination_workbook_id,
      'targetContractFingerprint', target.target_contract_fingerprint,
      'writerDestinationWorkbookId', writer.destination_workbook_id
    )
    from production_control.future_google_writer_targets_v2 target
    join production_control.future_google_writer_generations_v2 writer
      on writer.writer_generation_id = target.writer_generation_id
     and writer.certification_status = 'CERTIFIED'
    where target.tournament_id = $1
      and target.contract_status = 'CERTIFIED'
  $destination$ into google_destination using pointer.tournament_id;
  select pg_catalog.count(*)::integer into active_count
  from production_control.future_annual_runtime_generations_v1 value
  where value.generation_status = 'ACTIVE';
  if pointer.tournament_id = '2026'
     or input->>'target_tournament_id' is distinct from pointer.tournament_id
     or input->>'expected_current_tournament_id'
       is distinct from pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or input->>'expected_runtime_generation_id'
       is distinct from generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id'
       is distinct from generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id'
       is distinct from generation.admission_generation_id::text
     or active_count <> 1
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or annual_authority.pointer_revision <> pointer.pointer_revision
     or annual_authority.lifecycle_revision <> pointer.lifecycle_revision
     or annual_authority.authority_generation_id is distinct from
       generation.authority_generation_id
     or annual_authority.admission_generation_id is distinct from
       generation.admission_generation_id
     or annual_resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or annual_resource.source_workbook_id is null
     or google_destination is null
     or google_destination->>'writerGenerationId' is distinct from
       annual_authority.google_writer_generation_id::text
     or google_destination->>'destinationWorkbookId' is distinct from
       annual_authority.destination_workbook_id
     or google_destination->>'writerDestinationWorkbookId' is distinct from
       annual_authority.destination_workbook_id
     or google_destination->>'destinationWorkbookId' is distinct from
       annual_resource.source_workbook_id
     or google_destination->>'targetContractFingerprint' is distinct from
       annual_authority.google_target_contract_fingerprint then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CURRENT_READ_RUNTIME_REQUIRED';
  end if;
  return pointer.tournament_id;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CURRENT_READ_RUNTIME_REQUIRED';
end;
$annual_current_read$;

alter function public.read_production_future_current_view_v1(jsonb)
  rename to read_production_future_current_view_unfenced_v1;

-- Annual participant-safe side-game readers use the same canonical tables and
-- DTO rules as the frozen V1 readers, but every lookup is pinned to the exact
-- pointer-selected tournament. No configuration, result, or publication state
-- is inherited from 2026.
create function production_control.read_annual_net_skins_v1(target text)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $annual_net_skins_read$
declare
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
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision = current_value.configuration_revision
    order by value.requested_at desc, value.job_id desc limit 1;
    result_value := null;
    select value.* into result_value
    from scoring_authority.net_skins_v1_result_revisions value
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
    max_result_revision := pg_catalog.greatest(
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
end;
$annual_net_skins_read$;

create function production_control.calcutta_v1_completed_rounds(
  target text
)
returns integer[]
language sql stable security definer set search_path = pg_catalog
as $annual_calcutta_completed_rounds$
  select coalesce(pg_catalog.array_agg(candidate.round_number
    order by candidate.round_number), '{}'::integer[])
  from pg_catalog.generate_series(1, 3) candidate(round_number)
  where exists (
      select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = target
        and match_value.round_number = candidate.round_number
    )
    and not exists (
      select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = target
        and match_value.round_number = candidate.round_number
        and (match_value.status <> 'FINAL'
          or not match_value.scorecard_complete
          or match_value.finalized_at is null)
    )
    and not exists (
      select 1
      from scoring_authority.calcutta_v1_current current_value
      join scoring_authority.calcutta_v1_auction_fact_revisions auction
        on auction.auction_revision_id = current_value.auction_revision_id
      cross join lateral pg_catalog.jsonb_array_elements(
        auction.auction_manifest->'purchases'
      ) purchase
      where current_value.tournament_id = target and not exists (
        select 1 from scoring_authority.matches match_value
        join scoring_authority.match_participants participant
          on participant.match_id = match_value.match_id
        where match_value.tournament_id = target
          and match_value.round_number = candidate.round_number
          and match_value.status = 'FINAL'
          and match_value.scorecard_complete
          and match_value.finalized_at is not null
          and participant.player_id = purchase->>'player_id'
      )
    )
$annual_calcutta_completed_rounds$;

create function production_control.read_annual_calcutta_v1(
  target text, participant_player text
)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $annual_calcutta_read$
declare
  started_at timestamptz := pg_catalog.clock_timestamp();
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  source_value jsonb;
  source_fingerprint text;
  completed_rounds integer[] := '{}'::integer[];
  market_value jsonb;
  participant_result jsonb;
  state_value text;
  result_fresh boolean := false;
  result_stale boolean := false;
  updating boolean := false;
  expose_result boolean := false;
begin
  if participant_player = '' or not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = target
      and membership.player_id = participant_player
      and membership.participation_status = 'ACTIVE'
  ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESOURCE_REQUIRED';
  end if;
  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target;
  if current_value.tournament_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'contract_version', 'production-calcutta-v1',
        'tournament_id', target, 'state', 'NOT_CONFIGURED',
        'publication_policy',
          'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
        'publication_state', 'UNPUBLISHED', 'published', false,
        'currency_code', 'USD', 'configuration_revision', 0,
        'auction_revision', 0, 'publication_revision', 0,
        'result_revision', null, 'configuration_fingerprint', null,
        'auction_fingerprint', null, 'result_fingerprint', null,
        'revision', 'calcutta-v1:0:0:0:0:NOT_CONFIGURED:UNPUBLISHED',
        'freshness', pg_catalog.jsonb_build_object(
          'stale', false, 'updating', false, 'configured_at', null,
          'auction_recorded_at', null, 'published_at', null,
          'calculated_at', null, 'source_fingerprint', null
        ), 'market', null, 'result', null, 'query_ms', 0
      )
    );
  end if;
  select value.* into strict configuration_value
  from scoring_authority.calcutta_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id
    and value.tournament_id = target;
  if current_value.auction_revision > 0 then
    select value.* into strict auction_value
    from scoring_authority.calcutta_v1_auction_fact_revisions value
    where value.auction_revision_id = current_value.auction_revision_id
      and value.tournament_id = target;
    source_value := production_control.calcutta_v1_source_revision(target);
    source_fingerprint := production_control.calcutta_v1_hash(source_value);
    completed_rounds :=
      production_control.calcutta_v1_completed_rounds(target);
    select value.* into result_value
    from scoring_authority.calcutta_v1_result_revisions value
    where value.tournament_id = target
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.is_current limit 1;
    result_fresh := result_value.result_id is not null
      and result_value.source_fingerprint = source_fingerprint;
    result_stale := result_value.result_id is not null
      and result_value.source_fingerprint <> source_fingerprint;
    select value.* into job_value
    from scoring_authority.calcutta_v1_recalculation_jobs value
    where value.tournament_id = target
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.source_fingerprint = source_fingerprint
    order by value.requested_at desc, value.job_id desc limit 1;
    updating := job_value.job_id is not null
      and job_value.status in ('PENDING', 'RUNNING');
  end if;
  if current_value.publication_revision > 0 then
    select value.* into strict publication_value
    from scoring_authority.calcutta_v1_publication_revisions value
    where value.publication_revision_id =
      current_value.publication_revision_id
      and value.tournament_id = target;
  end if;
  state_value := case
    when current_value.state = 'NOT_CONFIGURED' then 'NOT_CONFIGURED'
    when current_value.auction_revision = 0 then 'CONFIGURED'
    when result_fresh and result_value.result_state = 'OFFICIAL'
      then 'OFFICIAL'
    when result_fresh and pg_catalog.jsonb_array_length(
      result_value.engine_result_payload->'completedRounds'
    ) > 0 then 'IN_PROGRESS'
    when result_fresh then 'AUCTION_COMPLETE'
    when result_stale and updating
      and result_value.result_state = 'OFFICIAL'
      and not (3 = any(completed_rounds)) then 'UNAVAILABLE'
    when result_stale and updating
      and result_value.result_state = 'OFFICIAL' then 'OFFICIAL'
    when result_stale and updating and pg_catalog.jsonb_array_length(
      result_value.engine_result_payload->'completedRounds'
    ) > 0 then 'IN_PROGRESS'
    when result_stale and updating then 'AUCTION_COMPLETE'
    when result_stale then 'UNAVAILABLE'
    when job_value.job_id is not null and job_value.status = 'FAILED'
      then 'UNAVAILABLE'
    else 'AUCTION_COMPLETE' end;
  expose_result := current_value.publication_state = 'PUBLISHED'
    and result_value.result_id is not null and state_value <> 'UNAVAILABLE';
  if current_value.publication_state = 'PUBLISHED' then
    market_value := pg_catalog.jsonb_build_object(
      'pot', (auction_value.auction_manifest->>'pot')::numeric::text,
      'purchases', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'player', pg_catalog.jsonb_build_object(
            'player_id', purchase->>'player_id',
            'display_name', entrant.display_name
          ), 'purchase_price',
            (purchase->>'purchase_price')::numeric::text,
          'owners', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'player', pg_catalog.jsonb_build_object(
                'player_id', ownership->>'owner_player_id',
                'display_name', owner_player.display_name
              ), 'ownership_fraction',
                (ownership->>'ownership_fraction')::numeric::text
            ) order by ownership->>'owner_player_id'
            ) from pg_catalog.jsonb_array_elements(
              auction_value.auction_manifest->'ownership'
            ) ownership join scoring_authority.players owner_player
              on owner_player.player_id = ownership->>'owner_player_id'
            where ownership->>'player_id' = purchase->>'player_id'
          ), '[]'::jsonb)
        ) order by purchase->>'player_id')
        from pg_catalog.jsonb_array_elements(
          auction_value.auction_manifest->'purchases'
        ) purchase join scoring_authority.players entrant
          on entrant.player_id = purchase->>'player_id'
      ), '[]'::jsonb)
    );
  else market_value := null; end if;
  participant_result := case when expose_result then
    production_control.project_production_calcutta_v1_result(
      result_value.engine_result_payload
    ) else null end;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'tournament_id', target, 'state', state_value,
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'publication_state', current_value.publication_state,
      'published', current_value.publication_state = 'PUBLISHED',
      'currency_code', 'USD',
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', current_value.publication_revision,
      'result_revision', case when result_value.result_id is null
        then null else result_value.result_revision end,
      'configuration_fingerprint', case when state_value = 'NOT_CONFIGURED'
        then null else current_value.configuration_fingerprint end,
      'auction_fingerprint', current_value.auction_fingerprint,
      'result_fingerprint', case when result_value.result_id is null
        then null else result_value.payload_hash end,
      'revision', pg_catalog.format(
        'calcutta-v1:%s:%s:%s:%s:%s:%s',
        current_value.configuration_revision, current_value.auction_revision,
        current_value.publication_revision,
        case when result_value.result_id is null
          then 0 else result_value.result_revision end,
        state_value, current_value.publication_state
      ),
      'freshness', pg_catalog.jsonb_build_object(
        'stale', result_stale, 'updating', updating,
        'configured_at', configuration_value.configured_at,
        'auction_recorded_at', auction_value.recorded_at,
        'published_at', case when current_value.publication_state = 'PUBLISHED'
          then publication_value.published_at else null end,
        'calculated_at', result_value.calculated_at,
        'source_fingerprint', source_fingerprint
      ), 'market', market_value, 'result', participant_result,
      'query_ms', pg_catalog.round(extract(epoch from
        (pg_catalog.clock_timestamp() - started_at)) * 1000, 3)
    )
  );
end;
$annual_calcutta_read$;

create function public.read_production_future_current_view_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_current_read_dispatch$
declare
  target text;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  surface text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'surface', ''
  )));
  result_value jsonb;
begin
  target := production_control.assert_annual_current_read_v1(input);
  if surface = 'NET_SKINS_V1' then
    result_value := production_control.read_annual_net_skins_v1(target);
  elsif surface = 'CALCUTTA_V1' then
    result_value := production_control.read_annual_calcutta_v1(
      target, pg_catalog.btrim(coalesce(input->>'player_id', ''))
    );
  elsif surface = 'PUBLISHED_ODDS' then
    select value.* into strict annual_resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id = target;
    if annual_resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
       or annual_resource.source_workbook_id is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';
    end if;
    result_value := public.read_published_odds_view(
      target, annual_resource.source_workbook_id
    );
  else
    return public.read_production_future_current_view_unfenced_v1(input);
  end if;
  result_value := production_control.mark_cutover_read_response(
    result_value, case
      when surface = 'PUBLISHED_ODDS' then 'READ_CUTOVER'
      when surface in ('NET_SKINS_V1', 'CALCUTTA_V1') then 'OBSERVATION'
      else 'CURRENT_READS' end
  ) || pg_catalog.jsonb_build_object(
    'target_tournament_id', target,
    'target_tournament_year', (select tournament_year
      from production_control.current_tournament_pointer_v1
      where scope_key = 'BAGGER_INV_PRODUCTION'),
    'pointer_revision', (input->>'expected_pointer_revision')::bigint,
    'runtime_generation_id', input->>'expected_runtime_generation_id',
    'annual_authority_generation_id',
      input->>'expected_annual_authority_generation_id',
    'annual_admission_generation_id',
      input->>'expected_annual_admission_generation_id'
  );
  return result_value;
end;
$annual_current_read_dispatch$;

-- Runtime generation identity is nullable only for the frozen 2026 queues and
-- for future setup rows created before annual activation. Such setup rows are
-- never claimable; activation binds them in one transaction.
alter table scoring_authority.google_outbox_events
  add column runtime_generation_id uuid references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict;
alter table scoring_authority.scorecard_archive_jobs
  add column runtime_generation_id uuid references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict;
alter table scoring_authority.competition_recalculation_jobs
  add column runtime_generation_id uuid references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict,
  add column claim_token uuid,
  add column claimed_by text,
  add column lease_expires_at timestamptz;
alter table scoring_authority.net_skins_v1_recalculation_jobs
  add column runtime_generation_id uuid references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict;
alter table scoring_authority.calcutta_v1_recalculation_jobs
  add column runtime_generation_id uuid references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict;
alter table scoring_authority.odds_calculation_jobs
  add column runtime_generation_id uuid references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict;
alter table scoring_authority.odds_google_mirror_jobs
  add column runtime_generation_id uuid references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict;

create or replace function scoring_authority.bind_annual_job_generation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $annual_job_generation$
declare generation_id uuid;
begin
  if new.tournament_id = '2026' then
    new.runtime_generation_id := null;
    return new;
  end if;
  select value.runtime_generation_id into generation_id
  from production_control.future_annual_runtime_generations_v1 value
  join production_control.current_tournament_pointer_v1 pointer
    on pointer.scope_key = 'BAGGER_INV_PRODUCTION'
   and pointer.tournament_id = value.tournament_id
   and pointer.pointer_revision = value.pointer_revision
  where value.tournament_id = new.tournament_id
    and value.generation_status = 'ACTIVE';
  -- Setup-time derived jobs are retained but deliberately unbound. No worker
  -- RPC below can claim a null generation.
  new.runtime_generation_id := generation_id;
  return new;
end;
$annual_job_generation$;

create trigger google_outbox_annual_generation_v1
before insert on scoring_authority.google_outbox_events
for each row execute function scoring_authority.bind_annual_job_generation_v1();
create trigger scorecard_archive_annual_generation_v1
before insert on scoring_authority.scorecard_archive_jobs
for each row execute function scoring_authority.bind_annual_job_generation_v1();
create trigger competition_recalculation_annual_generation_v1
before insert on scoring_authority.competition_recalculation_jobs
for each row execute function scoring_authority.bind_annual_job_generation_v1();
create trigger net_skins_recalculation_annual_generation_v1
before insert on scoring_authority.net_skins_v1_recalculation_jobs
for each row execute function scoring_authority.bind_annual_job_generation_v1();
create trigger calcutta_recalculation_annual_generation_v1
before insert on scoring_authority.calcutta_v1_recalculation_jobs
for each row execute function scoring_authority.bind_annual_job_generation_v1();
create trigger odds_calculation_annual_generation_v1
before insert on scoring_authority.odds_calculation_jobs
for each row execute function scoring_authority.bind_annual_job_generation_v1();
create trigger odds_google_mirror_annual_generation_v1
before insert on scoring_authority.odds_google_mirror_jobs
for each row execute function scoring_authority.bind_annual_job_generation_v1();

create or replace function production_control.bind_pending_annual_jobs_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $bind_pending_annual_jobs$
begin
  if new.generation_status = 'ACTIVE'
     and old.generation_status is distinct from 'ACTIVE' then
    update scoring_authority.google_outbox_events set
      runtime_generation_id = new.runtime_generation_id
    where tournament_id = new.tournament_id
      and runtime_generation_id is null and status <> 'DELIVERED';
    update scoring_authority.scorecard_archive_jobs set
      runtime_generation_id = new.runtime_generation_id
    where tournament_id = new.tournament_id
      and runtime_generation_id is null
      and status not in ('VERIFIED', 'SUPERSEDED');
    update scoring_authority.competition_recalculation_jobs set
      runtime_generation_id = new.runtime_generation_id,
      status = 'PENDING', started_at = null, completed_at = null,
      claim_token = null, claimed_by = null, lease_expires_at = null,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = new.tournament_id
      and runtime_generation_id is null;
    update scoring_authority.net_skins_v1_recalculation_jobs set
      runtime_generation_id = new.runtime_generation_id
    where tournament_id = new.tournament_id
      and runtime_generation_id is null;
    update scoring_authority.calcutta_v1_recalculation_jobs set
      runtime_generation_id = new.runtime_generation_id
    where tournament_id = new.tournament_id
      and runtime_generation_id is null;
    update scoring_authority.odds_calculation_jobs set
      runtime_generation_id = new.runtime_generation_id
    where tournament_id = new.tournament_id
      and runtime_generation_id is null;
    update scoring_authority.odds_google_mirror_jobs set
      runtime_generation_id = new.runtime_generation_id
    where tournament_id = new.tournament_id
      and runtime_generation_id is null;
  end if;
  return new;
end;
$bind_pending_annual_jobs$;

create trigger bind_pending_annual_jobs_on_activation_v1
after update of generation_status
on production_control.future_annual_runtime_generations_v1
for each row execute function production_control.bind_pending_annual_jobs_v1();

-- The legacy derived RPCs are installed by the Preview migration stream, not
-- by the Production migration chain. Leave those names and their 2026 call
-- shapes untouched. Production future work is reachable only through the
-- explicit annual dispatcher targets below.

create or replace function public.future_production_request_competition_derived_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $annual_derived_request$
declare
  target text;
  generation_id uuid;
  engine_value text;
  target_reason text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'reason', 'EXPLICIT_REBUILD'
  )), 120);
  target_actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'requested_by', 'Derived-state worker'
  )), 180);
  requested_count integer := 0;
begin
  target := production_control.assert_future_production_scoring_runtime_v1(input);
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  if pg_catalog.jsonb_typeof(input->'engine_keys') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_REQUEST_REQUIRED'
    );
  end if;
  for engine_value in
    select pg_catalog.upper(pg_catalog.btrim(value))
    from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value
  loop
    if engine_value not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES') then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'
      );
    end if;
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, requested_at, runtime_generation_id,
      claim_token, claimed_by, lease_expires_at, updated_at
    ) values (
      target, 0, engine_value, 'PENDING',
      pg_catalog.jsonb_build_object(
        'reason', target_reason, 'requestedBy', target_actor
      ), pg_catalog.clock_timestamp(), generation_id,
      null, null, null, pg_catalog.clock_timestamp()
    ) on conflict (tournament_id, round_number, engine_key) do update set
      status = 'PENDING',
      requested_source_revision = excluded.requested_source_revision,
      requested_at = pg_catalog.clock_timestamp(),
      started_at = null, completed_at = null,
      runtime_generation_id = generation_id,
      claim_token = null, claimed_by = null, lease_expires_at = null,
      last_error_code = null, last_error_safe = null,
      updated_at = pg_catalog.clock_timestamp();
    requested_count := requested_count + 1;
  end loop;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'requested', requested_count,
    'runtime_generation_id', generation_id
  );
end;
$annual_derived_request$;

create or replace function public.future_production_claim_competition_derived_jobs_v1(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $annual_derived_claim$
declare
  target text;
  generation_id uuid;
  engine_values text[];
  worker text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'worker_id', ''
  )), 160);
  lease_seconds integer := pg_catalog.greatest(15, pg_catalog.least(
    coalesce((input->>'lease_seconds')::integer, 90), 300
  ));
  token uuid := extensions.gen_random_uuid();
  claims jsonb;
begin
  target := production_control.assert_future_production_scoring_runtime_v1(input);
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  if worker = '' or pg_catalog.jsonb_typeof(input->'engine_keys') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_CLAIM_REQUIRED'
    );
  end if;
  select pg_catalog.array_agg(pg_catalog.upper(pg_catalog.btrim(value)))
    into engine_values
  from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value;
  if engine_values is null or pg_catalog.cardinality(engine_values) = 0
     or exists (select 1 from pg_catalog.unnest(engine_values) value
       where value not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'
    );
  end if;
  update scoring_authority.competition_recalculation_jobs value set
    status = 'FAILED', claim_token = null, claimed_by = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    last_error_code = 'DERIVED_LEASE_EXPIRED',
    last_error_safe = 'Derived work will be retried.',
    updated_at = pg_catalog.clock_timestamp()
  where value.tournament_id = target
    and value.runtime_generation_id = generation_id
    and value.status = 'RUNNING'
    and value.lease_expires_at < pg_catalog.clock_timestamp();
  with candidates as (
    select value.tournament_id, value.round_number, value.engine_key
    from scoring_authority.competition_recalculation_jobs value
    where value.tournament_id = target and value.round_number = 0
      and value.runtime_generation_id = generation_id
      and value.engine_key = any(engine_values)
      and value.status in ('PENDING', 'FAILED')
    order by value.engine_key for update skip locked
  ), claimed as (
    update scoring_authority.competition_recalculation_jobs value set
      status = 'RUNNING', attempts = value.attempts + 1,
      started_at = pg_catalog.clock_timestamp(), completed_at = null,
      claim_token = token, claimed_by = worker,
      lease_expires_at = pg_catalog.clock_timestamp()
        + pg_catalog.make_interval(secs => lease_seconds),
      last_error_code = null, last_error_safe = null,
      updated_at = pg_catalog.clock_timestamp()
    from candidates candidate
    where value.tournament_id = candidate.tournament_id
      and value.round_number = candidate.round_number
      and value.engine_key = candidate.engine_key
    returning value.engine_key, value.started_at, value.requested_at,
      value.requested_source_revision, value.attempts, value.claim_token,
      value.runtime_generation_id, value.lease_expires_at
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'engine_key', engine_key, 'claim_started_at', started_at,
    'requested_at', requested_at,
    'requested_source_revision', requested_source_revision,
    'attempt', attempts, 'claim_token', claim_token,
    'runtime_generation_id', runtime_generation_id,
    'lease_expires_at', lease_expires_at
  ) order by engine_key), '[]'::jsonb) into claims from claimed;
  return pg_catalog.jsonb_build_object('ok', true, 'claims', claims);
end;
$annual_derived_claim$;

create or replace function public.future_production_write_competition_derived_snapshot_v1(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $annual_derived_write$
declare
  target text;
  generation_id uuid;
  token uuid;
  worker text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'worker_id', ''
  )), 160);
  target_round integer := coalesce((input->>'round_number')::integer, 0);
  target_engine text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'engine_key', ''
  )));
  target_engine_version text := pg_catalog.btrim(coalesce(
    input->>'engine_version', ''
  ));
  target_configuration text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'configuration_fingerprint', ''
  )));
  target_source text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'source_fingerprint', ''
  )));
  target_payload_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'payload_hash', ''
  )));
  target_payload jsonb := coalesce(input->'result_payload', 'null'::jsonb);
  target_actor text := pg_catalog.btrim(coalesce(input->>'calculated_by', ''));
  target_calculated_at timestamptz := coalesce(
    (input->>'calculated_at')::timestamptz, pg_catalog.clock_timestamp()
  );
  target_started_at timestamptz := coalesce(
    (input->>'started_at')::timestamptz, target_calculated_at
  );
  target_claim_started_at timestamptz :=
    (input->>'claim_started_at')::timestamptz;
  target_duration numeric := pg_catalog.greatest(
    0, coalesce((input->>'duration_ms')::numeric, 0)
  );
  snapshot_id uuid;
  run_id uuid;
  logical_replay boolean := false;
begin
  target := production_control.assert_future_production_scoring_runtime_v1(input);
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  token := nullif(input->>'claim_token', '')::uuid;
  if token is null or worker = '' or target_round <> 0
     or target_actor = '' or target_engine_version = ''
     or target_engine not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
     or target_configuration !~ '^[0-9a-f]{64}$'
     or target_source !~ '^[0-9a-f]{64}$'
     or target_payload_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(target_payload) <> 'object'
     or target_claim_started_at is null or not exists (
    select 1 from scoring_authority.competition_recalculation_jobs value
    where value.tournament_id = target and value.round_number = target_round
      and value.engine_key = target_engine
      and value.runtime_generation_id = generation_id
      and value.status = 'RUNNING' and value.claim_token = token
      and value.claimed_by = worker
      and value.lease_expires_at >= pg_catalog.clock_timestamp()
      and value.started_at = target_claim_started_at
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'STALE_DERIVED_JOB', 'superseded', true
    );
  end if;

  select value.id into snapshot_id
  from scoring_authority.competition_derived_snapshots value
  where value.tournament_id = target and value.round_number = target_round
    and value.engine_key = target_engine
    and value.engine_version = target_engine_version
    and value.configuration_fingerprint = target_configuration
    and value.source_fingerprint = target_source
    and value.payload_hash = target_payload_hash
  limit 1;
  logical_replay := snapshot_id is not null;
  update scoring_authority.competition_derived_snapshots value set
    is_current = false
  where value.tournament_id = target and value.round_number = target_round
    and value.engine_key = target_engine and value.is_current
    and value.id is distinct from snapshot_id;
  if snapshot_id is null then
    insert into scoring_authority.competition_derived_snapshots (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, result_state,
      result_payload, payload_hash, is_current, calculated_at
    ) values (
      target, target_round, target_engine, target_engine_version,
      target_configuration, target_source, 'PROVISIONAL', target_payload,
      target_payload_hash, true, target_calculated_at
    ) returning id into snapshot_id;
  else
    update scoring_authority.competition_derived_snapshots value set
      is_current = true, result_payload = target_payload,
      calculated_at = target_calculated_at
    where value.id = snapshot_id;
  end if;
  insert into scoring_authority.competition_derived_runs (
    tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status,
    calculated_by, started_at, completed_at, duration_ms
  ) values (
    target, target_round, target_engine, target_engine_version,
    target_configuration, target_source, target_payload_hash, 'SUCCEEDED',
    target_actor, target_started_at, target_calculated_at, target_duration
  ) on conflict (
    tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status
  ) do update set
    completed_at = excluded.completed_at,
    duration_ms = excluded.duration_ms,
    calculated_by = excluded.calculated_by
  returning id into run_id;
  update scoring_authority.competition_recalculation_jobs value set
    status = 'SUCCEEDED', requested_source_revision =
      pg_catalog.jsonb_build_object(
        'sourceFingerprint', target_source,
        'configurationFingerprint', target_configuration,
        'payloadHash', target_payload_hash
      ),
    completed_at = pg_catalog.clock_timestamp(),
    last_error_code = null, last_error_safe = null,
    claim_token = null, claimed_by = null, lease_expires_at = null,
    updated_at = pg_catalog.clock_timestamp()
  where value.tournament_id = target and value.round_number = target_round
    and value.engine_key = target_engine
    and value.runtime_generation_id = generation_id
    and value.status = 'RUNNING' and value.claim_token = token
    and value.claimed_by = worker and value.started_at = target_claim_started_at;
  if not found then
    raise exception using errcode = '40001', message = 'STALE_DERIVED_JOB';
  end if;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, target_engine || '_DERIVED_STATE_CALCULATED', target_actor,
    pg_catalog.jsonb_build_object(
      'snapshotId', snapshot_id, 'runId', run_id,
      'runtimeGenerationId', generation_id,
      'sourceFingerprint', target_source,
      'payloadHash', target_payload_hash,
      'engineVersion', target_engine_version,
      'logicalReplay', logical_replay,
      'claimStartedAt', target_claim_started_at
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'snapshot_id', snapshot_id,
    'run_id', run_id, 'logical_replay', logical_replay,
    'runtime_generation_id', generation_id
  );
end;
$annual_derived_write$;

create or replace function public.future_production_fail_competition_derived_job_v1(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $annual_derived_fail$
declare
  target text;
  generation_id uuid;
  updated_count integer;
begin
  target := production_control.assert_future_production_scoring_runtime_v1(input);
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  update scoring_authority.competition_recalculation_jobs value set
    status = 'FAILED', completed_at = pg_catalog.clock_timestamp(),
    claim_token = null, claimed_by = null, lease_expires_at = null,
    last_error_code = pg_catalog.left(pg_catalog.btrim(coalesce(
      input->>'error_code', 'DERIVED_CALCULATION_FAILED'
    )), 120),
    last_error_safe = pg_catalog.left(pg_catalog.btrim(coalesce(
      input->>'error_safe', 'Prepared competition content is unavailable.'
    )), 400), updated_at = pg_catalog.clock_timestamp()
  where value.tournament_id = target and value.round_number = 0
    and value.engine_key = pg_catalog.upper(input->>'engine_key')
    and value.runtime_generation_id = generation_id
    and value.status = 'RUNNING'
    and value.claim_token = nullif(input->>'claim_token', '')::uuid
    and value.claimed_by = pg_catalog.left(input->>'worker_id', 160);
  get diagnostics updated_count = row_count;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'marked', updated_count = 1,
    'superseded', updated_count = 0
  );
end;
$annual_derived_fail$;

create or replace function public.future_production_claim_intelligence_derived_bundle_v1(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $annual_intelligence_claim$
declare
  target text;
  generation_id uuid;
  key_value text;
  engine_values text[];
  claim_time timestamptz := pg_catalog.clock_timestamp();
  token uuid := extensions.gen_random_uuid();
  worker text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'worker_id', ''
  )), 160);
  lease_seconds integer := pg_catalog.greatest(15, pg_catalog.least(
    coalesce((input->>'lease_seconds')::integer, 90), 300
  ));
begin
  target := production_control.assert_future_production_scoring_runtime_v1(input);
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  if worker = '' or pg_catalog.jsonb_typeof(input->'engine_keys') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_INTELLIGENCE_CLAIM_REQUIRED'
    );
  end if;
  select pg_catalog.array_agg(pg_catalog.upper(pg_catalog.btrim(value)))
    into engine_values
  from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value;
  if engine_values is null or pg_catalog.cardinality(engine_values) = 0
     or exists (
       select 1 from pg_catalog.unnest(engine_values) value
       where value not in (
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
       )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'
    );
  end if;
  perform 1
  from scoring_authority.competition_recalculation_jobs value
  where value.tournament_id = target and value.round_number = 0
    and value.engine_key = any(engine_values)
  order by value.engine_key
  for update;
  if exists (
    select 1 from scoring_authority.competition_recalculation_jobs value
    where value.tournament_id = target and value.round_number = 0
      and value.engine_key = any(engine_values)
      and value.runtime_generation_id = generation_id
      and value.status = 'RUNNING'
      and value.lease_expires_at >= pg_catalog.clock_timestamp()
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INTELLIGENCE_LEASE_ACTIVE'
    );
  end if;
  foreach key_value in array engine_values loop
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, attempts, requested_at, started_at,
      runtime_generation_id, claim_token, claimed_by, lease_expires_at,
      updated_at
    ) values (
      target, 0, key_value, 'RUNNING',
      pg_catalog.jsonb_build_object('requestedBy', input->>'requested_by'),
      1, claim_time, claim_time, generation_id, token, worker,
      claim_time + pg_catalog.make_interval(secs => lease_seconds),
      pg_catalog.clock_timestamp()
    ) on conflict (tournament_id, round_number, engine_key) do update set
      status = 'RUNNING',
      requested_source_revision = excluded.requested_source_revision,
      attempts = scoring_authority.competition_recalculation_jobs.attempts + 1,
      requested_at = claim_time, started_at = claim_time,
      completed_at = null, runtime_generation_id = generation_id,
      claim_token = token, claimed_by = worker,
      lease_expires_at = excluded.lease_expires_at,
      last_error_code = null, last_error_safe = null,
      updated_at = pg_catalog.clock_timestamp();
  end loop;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'claim_started_at', claim_time,
    'claim_token', token, 'worker_id', worker,
    'runtime_generation_id', generation_id
  );
end;
$annual_intelligence_claim$;

create or replace function public.future_production_write_intelligence_derived_bundle_v1(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $annual_intelligence_write$
declare
  target text;
  generation_id uuid;
  token uuid;
  worker text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'worker_id', ''
  )), 160);
  engine jsonb;
  key_value text;
  target_source text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'source_fingerprint', ''
  )));
  target_actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'calculated_by', ''
  )), 180);
  target_duration numeric := pg_catalog.greatest(
    0, coalesce((input->>'duration_ms')::numeric, 0)
  );
  target_engine_version text;
  target_payload jsonb;
  target_payload_hash text;
  target_claim timestamptz;
  configuration_fingerprint text;
  snapshot_id uuid;
  written jsonb := '[]'::jsonb;
begin
  target := production_control.assert_future_production_scoring_runtime_v1(input);
  generation_id := (input->>'expected_runtime_generation_id')::uuid;
  token := nullif(input->>'claim_token', '')::uuid;
  if token is null or worker = '' or target_actor = ''
     or target_source !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'engines') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_INTELLIGENCE_BUNDLE_REQUIRED'
    );
  end if;
  for engine in select value
    from pg_catalog.jsonb_array_elements(input->'engines') value
  loop
    key_value := pg_catalog.upper(pg_catalog.btrim(engine->>'key'));
    target_engine_version := pg_catalog.btrim(coalesce(
      engine->>'version', ''
    ));
    target_payload := coalesce(engine->'result', 'null'::jsonb);
    target_payload_hash := pg_catalog.lower(pg_catalog.btrim(coalesce(
      engine->>'payload_hash', ''
    )));
    begin
      target_claim := (engine->>'claim_started_at')::timestamptz;
    exception when others then
      target_claim := null;
    end;
    if key_value not in (
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ) or target_engine_version = ''
      or pg_catalog.jsonb_typeof(target_payload) <> 'object'
      or target_payload_hash !~ '^[0-9a-f]{64}$'
      or target_claim is null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'INVALID_INTELLIGENCE_ENGINE_PAYLOAD'
      );
    end if;
    if key_value = 'TOURNAMENT_FINAL_RECAP'
       and coalesce((input#>>'{final_gate,eligible}')::boolean, false)
         is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FINAL_RECAP_GATE_REQUIRED'
      );
    end if;
    if not exists (
      select 1 from scoring_authority.competition_recalculation_jobs value
      where value.tournament_id = target and value.round_number = 0
        and value.engine_key = key_value
        and value.runtime_generation_id = generation_id
        and value.status = 'RUNNING' and value.claim_token = token
        and value.claimed_by = worker
        and value.lease_expires_at >= pg_catalog.clock_timestamp()
        and value.started_at = target_claim
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'STALE_INTELLIGENCE_WORKER',
        'superseded', true, 'engineKey', key_value
      );
    end if;
    configuration_fingerprint := pg_catalog.encode(extensions.digest(
      target_engine_version || ':canonical-supabase-input-v1', 'sha256'
    ), 'hex');
    select value.id into snapshot_id
    from scoring_authority.competition_derived_snapshots value
    where value.tournament_id = target and value.round_number = 0
      and value.engine_key = key_value
      and value.engine_version = target_engine_version
      and value.source_fingerprint = target_source
      and value.payload_hash = target_payload_hash
    limit 1;
    update scoring_authority.competition_derived_snapshots value set
      is_current = false
    where value.tournament_id = target and value.round_number = 0
      and value.engine_key = key_value and value.is_current
      and value.id is distinct from snapshot_id;
    if snapshot_id is null then
      insert into scoring_authority.competition_derived_snapshots (
        tournament_id, round_number, engine_key, engine_version,
        configuration_fingerprint, source_fingerprint, result_state,
        result_payload, payload_hash, is_current, calculated_at
      ) values (
        target, 0, key_value, target_engine_version,
        configuration_fingerprint, target_source,
        case when key_value = 'TOURNAMENT_FINAL_RECAP'
          then 'OFFICIAL' else 'PROVISIONAL' end,
        target_payload, target_payload_hash, true,
        pg_catalog.clock_timestamp()
      ) returning id into snapshot_id;
    else
      update scoring_authority.competition_derived_snapshots value set
        is_current = true, result_payload = target_payload,
        calculated_at = pg_catalog.clock_timestamp()
      where value.id = snapshot_id;
    end if;
    insert into scoring_authority.competition_derived_runs (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash, status,
      calculated_by, started_at, completed_at, duration_ms
    ) values (
      target, 0, key_value, target_engine_version,
      configuration_fingerprint, target_source, target_payload_hash,
      'SUCCEEDED', target_actor, target_claim,
      pg_catalog.clock_timestamp(), target_duration
    ) on conflict (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash, status
    ) do update set
      completed_at = pg_catalog.clock_timestamp(),
      duration_ms = excluded.duration_ms,
      calculated_by = excluded.calculated_by;
    update scoring_authority.competition_recalculation_jobs value set
      status = 'SUCCEEDED',
      requested_source_revision = pg_catalog.jsonb_build_object(
        'sourceFingerprint', target_source,
        'payloadHash', target_payload_hash
      ), completed_at = pg_catalog.clock_timestamp(),
      last_error_code = null, last_error_safe = null,
      claim_token = null, claimed_by = null, lease_expires_at = null,
      updated_at = pg_catalog.clock_timestamp()
    where value.tournament_id = target and value.round_number = 0
      and value.engine_key = key_value
      and value.runtime_generation_id = generation_id
      and value.status = 'RUNNING' and value.claim_token = token
      and value.claimed_by = worker and value.started_at = target_claim;
    if not found then
      raise exception using errcode = '40001',
        message = 'STALE_INTELLIGENCE_WORKER';
    end if;
    written := written || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'engineKey', key_value, 'snapshotId', snapshot_id
      )
    );
  end loop;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'INTELLIGENCE_DERIVED_BUNDLE_CALCULATED', target_actor,
    pg_catalog.jsonb_build_object(
      'runtimeGenerationId', generation_id,
      'sourceFingerprint', target_source,
      'engines', written, 'finalGate', input->'final_gate'
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'written', written, 'final_gate', input->'final_gate',
    'runtime_generation_id', generation_id
  );
end;
$annual_intelligence_write$;

insert into production_control.annual_scoring_rpc_allowlist_v1 (
  operation_name, target_rpc, required_phase, operation_class,
  required_worker
) values
  ('request_competition_derived_recalculation',
    'public.future_production_request_competition_derived_recalculation_v1',
    'WORKERS', 'MUTATION', null),
  ('claim_competition_derived_jobs',
    'public.future_production_claim_competition_derived_jobs_v1',
    'WORKERS', 'MUTATION', null),
  ('write_competition_derived_snapshot',
    'public.future_production_write_competition_derived_snapshot_v1',
    'WORKERS', 'MUTATION', null),
  ('mark_competition_derived_job_failed',
    'public.future_production_fail_competition_derived_job_v1',
    'WORKERS', 'MUTATION', null),
  ('claim_intelligence_derived_bundle',
    'public.future_production_claim_intelligence_derived_bundle_v1',
    'WORKERS', 'MUTATION', null),
  ('write_intelligence_derived_bundle',
    'public.future_production_write_intelligence_derived_bundle_v1',
    'WORKERS', 'MUTATION', null);

do $derived_future_privileges$
declare signature text;
begin
  foreach signature in array array[
    'public.future_production_request_competition_derived_recalculation_v1(jsonb)',
    'public.future_production_claim_competition_derived_jobs_v1(jsonb)',
    'public.future_production_write_competition_derived_snapshot_v1(jsonb)',
    'public.future_production_fail_competition_derived_job_v1(jsonb)',
    'public.future_production_claim_intelligence_derived_bundle_v1(jsonb)',
    'public.future_production_write_intelligence_derived_bundle_v1(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end;
$derived_future_privileges$;

-- 067 installed future outbox/archive algorithms with the correct target
-- filters and lease behavior. Keep those algorithms, but require the claimed
-- row itself to carry the exact dispatcher generation before it can leave the
-- transaction or be completed/failed.
alter function public.future_production_claim_google_outbox_v1(jsonb)
  rename to future_production_claim_google_outbox_pre_generation_v1;
create function public.future_production_claim_google_outbox_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $annual_outbox_claim$
declare result_value jsonb;
begin
  perform production_control.assert_future_production_scoring_runtime_v1(
    input, 'SCORING_GOOGLE_OUTBOX'
  );
  result_value := public
    .future_production_claim_google_outbox_pre_generation_v1(input);
  if result_value->'event' is not null
     and result_value#>>'{event,runtime_generation_id}'
       is distinct from input->>'expected_runtime_generation_id' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_OUTBOX_RUNTIME_GENERATION_REQUIRED';
  end if;
  return result_value;
end;
$annual_outbox_claim$;

alter function public.future_production_claim_google_outbox_event_v1(jsonb)
  rename to future_production_claim_google_outbox_event_pre_generation_v1;
create function public.future_production_claim_google_outbox_event_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $annual_outbox_event_claim$
declare result_value jsonb;
begin
  perform production_control.assert_future_production_scoring_runtime_v1(
    input, 'SCORING_GOOGLE_OUTBOX'
  );
  if not exists (
    select 1 from scoring_authority.google_outbox_events value
    where value.id = nullif(input->>'event_id', '')::uuid
      and value.runtime_generation_id =
        (input->>'expected_runtime_generation_id')::uuid
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'OUTBOX_EVENT_NOT_FOUND'
    );
  end if;
  result_value := public
    .future_production_claim_google_outbox_event_pre_generation_v1(input);
  if result_value#>>'{event,runtime_generation_id}'
       is distinct from input->>'expected_runtime_generation_id' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_OUTBOX_RUNTIME_GENERATION_REQUIRED';
  end if;
  return result_value;
end;
$annual_outbox_event_claim$;

alter function public.future_production_complete_google_outbox_v1(jsonb)
  rename to future_production_complete_google_outbox_pre_generation_v1;
create function public.future_production_complete_google_outbox_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $annual_outbox_complete$
begin
  perform production_control.assert_future_production_scoring_runtime_v1(
    input, 'SCORING_GOOGLE_OUTBOX'
  );
  if not exists (
    select 1 from scoring_authority.google_outbox_events value
    where value.id = nullif(input->>'event_id', '')::uuid
      and value.runtime_generation_id =
        (input->>'expected_runtime_generation_id')::uuid
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'EVENT_NOT_FOUND'
    );
  end if;
  return public
    .future_production_complete_google_outbox_pre_generation_v1(input);
end;
$annual_outbox_complete$;

alter function public.future_production_fail_google_outbox_v1(jsonb)
  rename to future_production_fail_google_outbox_pre_generation_v1;
create function public.future_production_fail_google_outbox_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $annual_outbox_fail$
begin
  perform production_control.assert_future_production_scoring_runtime_v1(
    input, 'SCORING_GOOGLE_OUTBOX'
  );
  if not exists (
    select 1 from scoring_authority.google_outbox_events value
    where value.id = nullif(input->>'event_id', '')::uuid
      and value.runtime_generation_id =
        (input->>'expected_runtime_generation_id')::uuid
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'EVENT_NOT_FOUND'
    );
  end if;
  return public.future_production_fail_google_outbox_pre_generation_v1(input);
end;
$annual_outbox_fail$;

alter function public.future_production_claim_scorecard_archive_job_v1(jsonb)
  rename to future_production_claim_scorecard_archive_job_pre_generation_v1;
create function public.future_production_claim_scorecard_archive_job_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $annual_archive_claim$
declare result_value jsonb;
begin
  perform production_control.assert_future_production_scoring_runtime_v1(
    input, 'ROUND_SCORECARDS_ARCHIVE'
  );
  result_value := public
    .future_production_claim_scorecard_archive_job_pre_generation_v1(input);
  if result_value->'job' is not null
     and result_value#>>'{job,runtime_generation_id}'
       is distinct from input->>'expected_runtime_generation_id' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ARCHIVE_RUNTIME_GENERATION_REQUIRED';
  end if;
  return result_value;
end;
$annual_archive_claim$;

alter function public.future_production_complete_scorecard_archive_job_v1(jsonb)
  rename to future_production_complete_scorecard_archive_job_pre_generation_v1;
create function public.future_production_complete_scorecard_archive_job_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $annual_archive_complete$
begin
  perform production_control.assert_future_production_scoring_runtime_v1(
    input, 'ROUND_SCORECARDS_ARCHIVE'
  );
  if not exists (
    select 1 from scoring_authority.scorecard_archive_jobs value
    where value.job_id = nullif(input->>'job_id', '')::uuid
      and value.runtime_generation_id =
        (input->>'expected_runtime_generation_id')::uuid
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ARCHIVE_CLAIM_STALE'
    );
  end if;
  return public
    .future_production_complete_scorecard_archive_job_pre_generation_v1(input);
end;
$annual_archive_complete$;

alter function public.future_production_fail_scorecard_archive_job_v1(jsonb)
  rename to future_production_fail_scorecard_archive_job_pre_generation_v1;
create function public.future_production_fail_scorecard_archive_job_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $annual_archive_fail$
begin
  perform production_control.assert_future_production_scoring_runtime_v1(
    input, 'ROUND_SCORECARDS_ARCHIVE'
  );
  if not exists (
    select 1 from scoring_authority.scorecard_archive_jobs value
    where value.job_id = nullif(input->>'job_id', '')::uuid
      and value.runtime_generation_id =
        (input->>'expected_runtime_generation_id')::uuid
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ARCHIVE_CLAIM_STALE'
    );
  end if;
  return public
    .future_production_fail_scorecard_archive_job_pre_generation_v1(input);
end;
$annual_archive_fail$;

-- Certified pre-activation Google compatibility writer. This generation is
-- intentionally separate from the annual scoring generation because every
-- required compatibility row must be certified before activation readiness.
create table production_control.future_google_writer_generations_v2 (
  writer_generation_id uuid primary key default extensions.gen_random_uuid(),
  contract_version text not null check (
    contract_version = 'production-future-google-match-provisioning-v2'
  ),
  destination_workbook_id text not null,
  implementation_fingerprint text not null check (
    implementation_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  certification_status text not null check (
    certification_status = 'CERTIFIED'
  ),
  certified_at timestamptz not null default pg_catalog.clock_timestamp()
);
create unique index production_future_certified_google_writer_destination_v2
  on production_control.future_google_writer_generations_v2(
    destination_workbook_id
  ) where certification_status = 'CERTIFIED';
alter table production_control.future_google_writer_generations_v2
  enable row level security;

create table production_control.future_google_writer_targets_v2 (
  tournament_id text primary key references
    production_control.future_runtime_promotions_v2(tournament_id)
    on delete restrict,
  writer_generation_id uuid not null references
    production_control.future_google_writer_generations_v2(
      writer_generation_id
    ) on delete restrict,
  destination_workbook_id text not null,
  target_contract_fingerprint text not null check (
    target_contract_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  contract_status text not null check (
    contract_status in ('CERTIFIED', 'INVALIDATED')
  ),
  certified_at timestamptz not null default pg_catalog.clock_timestamp(),
  invalidated_at timestamptz,
  check (
    (contract_status = 'CERTIFIED' and invalidated_at is null)
    or (contract_status = 'INVALIDATED' and invalidated_at is not null)
  )
);
alter table production_control.future_google_writer_targets_v2
  enable row level security;

create or replace function public.read_production_annual_google_destination_v1(
  input jsonb
)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $annual_google_destination$
declare
  target_id text;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  annual_authority production_control.annual_scoring_runtime_authorities_v1%rowtype;
  writer production_control.future_google_writer_generations_v2%rowtype;
  target production_control.future_google_writer_targets_v2%rowtype;
begin
  perform production_control.assert_production_service_role();
  target_id := production_control.assert_annual_current_read_v1(input);
  select value.* into strict annual_resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target_id;
  select value.* into strict target
  from production_control.future_google_writer_targets_v2 value
  where value.tournament_id = target_id
    and value.contract_status = 'CERTIFIED';
  select value.* into strict writer
  from production_control.future_google_writer_generations_v2 value
  where value.writer_generation_id = target.writer_generation_id
    and value.certification_status = 'CERTIFIED';
  select value.* into strict annual_authority
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = target_id
    and value.runtime_generation_id =
      (input->>'expected_runtime_generation_id')::uuid
    and value.authority_status = 'ACTIVE';
  if annual_resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or annual_resource.source_workbook_id is null
     or target.destination_workbook_id is distinct from
       annual_resource.source_workbook_id
     or writer.destination_workbook_id is distinct from
       annual_resource.source_workbook_id
     or annual_authority.google_writer_generation_id is distinct from
       target.writer_generation_id
     or annual_authority.destination_workbook_id is distinct from
       target.destination_workbook_id
     or annual_authority.google_target_contract_fingerprint
       is distinct from target.target_contract_fingerprint then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_CERTIFIED',
    'contractVersion', 'production-annual-google-destination-v1',
    'tournamentId', target_id,
    'writerGenerationId', target.writer_generation_id,
    'destinationWorkbookId', target.destination_workbook_id,
    'targetContractFingerprint', target.target_contract_fingerprint,
    'implementationFingerprint', writer.implementation_fingerprint,
    'nonAuthoritative', true, 'rollbackAllowed', false
  );
exception when no_data_found then
  raise exception using errcode = '55000',
    message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';
end;
$annual_google_destination$;

-- Installation deliberately creates no writer generation or target. A future
-- workbook must be certified by a separately authorized release operation;
-- until that row exists, preparation, activation, and worker dispatch all fail
-- closed. In particular the frozen platform workbook is never inferred as an
-- annual destination.

alter table production_control.future_match_google_compatibility_jobs_v1
  add column writer_generation_id uuid references
    production_control.future_google_writer_generations_v2(
      writer_generation_id
    ) on delete restrict,
  add column destination_workbook_id text,
  add column target_contract_fingerprint text,
  add column structural_fingerprint text,
  add column structural_runtime_revision bigint,
  add constraint production_future_google_target_fingerprint_v2 check (
    target_contract_fingerprint is null
    or target_contract_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint production_future_google_structural_fingerprint_v2 check (
    structural_fingerprint is null
    or structural_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint production_future_google_certified_writer_shape_v2 check (
    not writer_installed or (
      writer_generation_id is not null
      and destination_workbook_id is not null
      and target_contract_fingerprint is not null
      and structural_fingerprint is not null
      and structural_runtime_revision is not null
      and structural_runtime_revision > 0
    )
  );

create or replace function production_control.sync_future_google_writer_job_v2(
  target_tournament text,
  target_match text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $sync_future_google_writer_job$
declare
  target production_control.future_google_writer_targets_v2%rowtype;
  binding production_control.future_runtime_match_bindings_v2%rowtype;
  fingerprint_value text;
  eligible boolean := false;
begin
  select value.* into target
  from production_control.future_google_writer_targets_v2 value
  where value.tournament_id = target_tournament
    and value.contract_status = 'CERTIFIED';
  select value.* into binding
  from production_control.future_runtime_match_bindings_v2 value
  where value.tournament_id = target_tournament
    and value.match_id = target_match;
  eligible := target.tournament_id is not null
    and binding.match_id is not null
    and binding.runtime_state = 'PREPARED'
    and binding.configuration_fingerprint ~ '^[0-9a-f]{64}$';
  if eligible then
    fingerprint_value := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'tournamentId', target_tournament, 'matchId', target_match,
        'writerGenerationId', target.writer_generation_id,
        'destinationWorkbookId', target.destination_workbook_id,
        'targetContractFingerprint', target.target_contract_fingerprint,
        'structuralSetupRevision', binding.structural_setup_revision,
        'runtimeRevision', binding.runtime_revision,
        'configurationFingerprint', binding.configuration_fingerprint
      )
    );
  end if;
  update production_control.future_match_google_compatibility_jobs_v1 value set
    writer_installed = eligible,
    writer_generation_id = case when eligible
      then target.writer_generation_id else value.writer_generation_id end,
    destination_workbook_id = case when eligible
      then target.destination_workbook_id else value.destination_workbook_id end,
    target_contract_fingerprint = case when eligible
      then target.target_contract_fingerprint
      else value.target_contract_fingerprint end,
    structural_fingerprint = case when eligible
      then fingerprint_value else null end,
    structural_runtime_revision = case when eligible
      then binding.runtime_revision else null end,
    status = case
      when value.status = 'NOT_REQUIRED' then 'NOT_REQUIRED'
      when not eligible then 'PROVISIONING_REQUIRED'
      when value.structural_fingerprint is distinct from fingerprint_value
        or value.writer_generation_id is distinct from target.writer_generation_id
        or value.destination_workbook_id
          is distinct from target.destination_workbook_id
        or value.target_contract_fingerprint
          is distinct from target.target_contract_fingerprint
        then 'PROVISIONING_REQUIRED'
      else value.status end,
    expected_manifest_fingerprint = case
      when eligible and value.structural_fingerprint = fingerprint_value
        and value.writer_generation_id = target.writer_generation_id
        and value.destination_workbook_id = target.destination_workbook_id
        and value.target_contract_fingerprint = target.target_contract_fingerprint
      then value.expected_manifest_fingerprint else null end,
    readback_fingerprint = case
      when eligible and value.structural_fingerprint = fingerprint_value
        and value.writer_generation_id = target.writer_generation_id
        and value.destination_workbook_id = target.destination_workbook_id
        and value.target_contract_fingerprint = target.target_contract_fingerprint
      then value.readback_fingerprint else null end,
    readback_checkpoint = case
      when eligible and value.structural_fingerprint = fingerprint_value
        and value.writer_generation_id = target.writer_generation_id
        and value.destination_workbook_id = target.destination_workbook_id
        and value.target_contract_fingerprint = target.target_contract_fingerprint
      then value.readback_checkpoint else null end,
    certified_at = case
      when eligible and value.structural_fingerprint = fingerprint_value
        and value.writer_generation_id = target.writer_generation_id
        and value.destination_workbook_id = target.destination_workbook_id
        and value.target_contract_fingerprint = target.target_contract_fingerprint
      then value.certified_at else null end,
    claim_token = null, claimed_by = null, lease_expires_at = null,
    available_at = pg_catalog.clock_timestamp(),
    safe_error_code = case when eligible then null
      else 'FUTURE_GOOGLE_WRITER_CONTRACT_NOT_READY' end,
    updated_at = pg_catalog.clock_timestamp()
  where value.tournament_id = target_tournament
    and value.match_id = target_match;
end;
$sync_future_google_writer_job$;

create or replace function production_control.sync_future_google_writer_binding_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $sync_future_google_writer_binding$
begin
  perform production_control.sync_future_google_writer_job_v2(
    new.tournament_id, new.match_id
  );
  return new;
end;
$sync_future_google_writer_binding$;

create trigger sync_future_google_writer_binding_v2
after insert or update of runtime_state, runtime_revision,
  structural_setup_revision, configuration_fingerprint
on production_control.future_runtime_match_bindings_v2
for each row execute function
  production_control.sync_future_google_writer_binding_v2();

-- Bind any already-prepared future rows. This does not claim or write them.
do $sync_existing_future_google_jobs$
declare job record;
begin
  for job in select value.tournament_id, value.match_id
    from production_control.future_match_google_compatibility_jobs_v1 value
    where value.tournament_id <> '2026'
  loop
    perform production_control.sync_future_google_writer_job_v2(
      job.tournament_id, job.match_id
    );
  end loop;
end;
$sync_existing_future_google_jobs$;

create or replace function production_control.future_google_match_manifest_v2(
  target_match text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $future_google_manifest_v2$
declare
  job production_control.future_match_google_compatibility_jobs_v1%rowtype;
  manifest jsonb;
begin
  select value.* into strict job
  from production_control.future_match_google_compatibility_jobs_v1 value
  where value.match_id = target_match;
  if not job.writer_installed or job.writer_generation_id is null
     or job.destination_workbook_id is null
     or job.target_contract_fingerprint is null
     or job.structural_fingerprint is null
     or job.structural_runtime_revision is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_WRITER_BINDING_REQUIRED';
  end if;
  manifest := production_control.future_google_match_manifest_v1(target_match);
  return manifest || pg_catalog.jsonb_build_object(
    'contractVersion', 'production-future-google-match-provisioning-v2',
    'writerGenerationId', job.writer_generation_id,
    'destinationWorkbookId', job.destination_workbook_id,
    'targetContractFingerprint', job.target_contract_fingerprint,
    'structuralFingerprint', job.structural_fingerprint,
    'runtimeRevision', job.structural_runtime_revision
  );
end;
$future_google_manifest_v2$;

create or replace function production_control.assert_future_google_writer_v2(
  input jsonb,
  require_exact_contract boolean default true
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $assert_future_google_writer$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_google_writer_targets_v2%rowtype;
  writer production_control.future_google_writer_generations_v2%rowtype;
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  -- Resolve the deployment/runtime binding only after holding the shared
  -- admission lock so a concurrent annual application rebind cannot validate
  -- the predecessor deployment and then race past its atomic replacement.
  perform production_control.assert_annual_scoring_platform_v1(
    input, 'WORKERS', null
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict target
  from production_control.future_google_writer_targets_v2 value
  where value.tournament_id = target_id
    and value.contract_status = 'CERTIFIED';
  select value.* into strict writer
  from production_control.future_google_writer_generations_v2 value
  where value.writer_generation_id = target.writer_generation_id
    and value.certification_status = 'CERTIFIED';
  if target_id = '' or target_id = '2026'
     or pointer.tournament_id = target_id
     or target.destination_workbook_id
       is distinct from writer.destination_workbook_id
     or not exists (
       select 1 from production_control.future_runtime_promotions_v2 value
       where value.tournament_id = target_id
         and value.runtime_status in ('PROMOTED', 'READY')
     ) or (require_exact_contract and (
       input->>'contract_version' is distinct from writer.contract_version
       or input->>'expected_writer_generation_id'
         is distinct from writer.writer_generation_id::text
       or input->>'destination_workbook_id'
         is distinct from writer.destination_workbook_id
       or input->>'expected_target_contract_fingerprint'
         is distinct from target.target_contract_fingerprint
     )) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_WRITER_CONTRACT_REQUIRED';
  end if;
  return target_id;
exception
  when invalid_text_representation or no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_WRITER_CONTRACT_REQUIRED';
end;
$assert_future_google_writer$;

create or replace function public.resolve_production_future_match_google_compatibility_v2(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $resolve_future_google_writer$
declare
  target_id text;
  target production_control.future_google_writer_targets_v2%rowtype;
  writer production_control.future_google_writer_generations_v2%rowtype;
begin
  target_id := production_control.assert_future_google_writer_v2(input, false);
  select value.* into strict target
  from production_control.future_google_writer_targets_v2 value
  where value.tournament_id = target_id and value.contract_status = 'CERTIFIED';
  select value.* into strict writer
  from production_control.future_google_writer_generations_v2 value
  where value.writer_generation_id = target.writer_generation_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'contractVersion', writer.contract_version,
    'targetTournamentId', target_id,
    'writerGenerationId', writer.writer_generation_id,
    'destinationWorkbookId', target.destination_workbook_id,
    'targetContractFingerprint', target.target_contract_fingerprint,
    'implementationFingerprint', writer.implementation_fingerprint,
    'nonAuthoritative', true, 'rollbackAllowed', false
  );
end;
$resolve_future_google_writer$;

create or replace function public.claim_production_future_match_google_compatibility_v2(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $claim_future_google_writer$
declare
  target_id text;
  job production_control.future_match_google_compatibility_jobs_v1%rowtype;
  token uuid := extensions.gen_random_uuid();
  worker text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'worker_id', ''
  )), 120);
  lease_seconds integer := pg_catalog.greatest(30, pg_catalog.least(
    coalesce((input->>'lease_seconds')::integer, 120), 300
  ));
  manifest jsonb;
  manifest_fingerprint text;
begin
  target_id := production_control.assert_future_google_writer_v2(input, true);
  if worker !~ '^[A-Za-z0-9_.:-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_COMPATIBILITY_WORKER_INVALID';
  end if;
  update production_control.future_match_google_compatibility_jobs_v1 value set
    status = 'RETRYABLE', claim_token = null, claimed_by = null,
    lease_expires_at = null, available_at = pg_catalog.clock_timestamp(),
    safe_error_code = 'FUTURE_GOOGLE_WRITER_LEASE_EXPIRED',
    updated_at = pg_catalog.clock_timestamp()
  where value.tournament_id = target_id
    and value.writer_generation_id =
      (input->>'expected_writer_generation_id')::uuid
    and value.destination_workbook_id = input->>'destination_workbook_id'
    and value.target_contract_fingerprint =
      input->>'expected_target_contract_fingerprint'
    and value.status = 'PROCESSING'
    and value.lease_expires_at < pg_catalog.clock_timestamp();
  select value.* into job
  from production_control.future_match_google_compatibility_jobs_v1 value
  join production_control.future_runtime_match_bindings_v2 binding
    on binding.tournament_id = value.tournament_id
   and binding.match_id = value.match_id
  where value.tournament_id = target_id and value.writer_installed
    and value.writer_generation_id =
      (input->>'expected_writer_generation_id')::uuid
    and value.destination_workbook_id = input->>'destination_workbook_id'
    and value.target_contract_fingerprint =
      input->>'expected_target_contract_fingerprint'
    and value.status in ('PROVISIONING_REQUIRED', 'RETRYABLE')
    and value.available_at <= pg_catalog.clock_timestamp()
    and binding.runtime_state = 'PREPARED'
    and binding.runtime_revision = value.structural_runtime_revision
    and binding.configuration_fingerprint is not null
  order by value.created_at, value.match_id
  for update of value skip locked limit 1;
  if job.job_id is null then
    return pg_catalog.jsonb_build_object('ok', true, 'job', null);
  end if;
  manifest := production_control.future_google_match_manifest_v2(job.match_id);
  manifest_fingerprint := production_control.future_runtime_hash_v2(manifest);
  update production_control.future_match_google_compatibility_jobs_v1 value set
    status = 'PROCESSING', attempts = value.attempts + 1,
    claimed_by = worker, claim_token = token,
    lease_expires_at = pg_catalog.clock_timestamp()
      + pg_catalog.make_interval(secs => lease_seconds),
    last_attempt_at = pg_catalog.clock_timestamp(),
    expected_manifest_fingerprint = manifest_fingerprint,
    safe_error_code = null, updated_at = pg_catalog.clock_timestamp()
  where value.job_id = job.job_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'job', pg_catalog.jsonb_build_object(
      'jobId', job.job_id, 'tournamentId', job.tournament_id,
      'matchId', job.match_id, 'claimToken', token,
      'attempt', job.attempts + 1,
      'expectedManifestFingerprint', manifest_fingerprint,
      'writerGenerationId', job.writer_generation_id,
      'destinationWorkbookId', job.destination_workbook_id,
      'targetContractFingerprint', job.target_contract_fingerprint,
      'structuralFingerprint', job.structural_fingerprint,
      'runtimeRevision', job.structural_runtime_revision,
      'manifest', manifest,
      'requiredArtifacts', pg_catalog.jsonb_build_array(
        'LIVE_MATCHES_ROW', 'MATCHES_ROW'
      ), 'sourceWorkbookId', job.destination_workbook_id
    )
  );
end;
$claim_future_google_writer$;

create or replace function public.complete_production_future_match_google_compatibility_v2(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $complete_future_google_writer$
declare
  target_id text;
  job production_control.future_match_google_compatibility_jobs_v1%rowtype;
  current_manifest_fingerprint text;
begin
  target_id := production_control.assert_future_google_writer_v2(input, true);
  select value.* into strict job
  from production_control.future_match_google_compatibility_jobs_v1 value
  where value.job_id = (input->>'job_id')::uuid
    and value.tournament_id = target_id
    and value.writer_generation_id =
      (input->>'expected_writer_generation_id')::uuid
    and value.destination_workbook_id = input->>'destination_workbook_id'
    and value.target_contract_fingerprint =
      input->>'expected_target_contract_fingerprint'
  for update;
  current_manifest_fingerprint := production_control.future_runtime_hash_v2(
    production_control.future_google_match_manifest_v2(job.match_id)
  );
  if job.status = 'CERTIFIED' then
    if job.expected_manifest_fingerprint
         is distinct from input->>'expected_manifest_fingerprint'
       or current_manifest_fingerprint
         is distinct from input->>'expected_manifest_fingerprint'
       or job.readback_fingerprint
         is distinct from input->>'readback_fingerprint'
       or job.readback_checkpoint is distinct from input->'readback_checkpoint'
       or job.structural_fingerprint
         is distinct from input->>'expected_structural_fingerprint' then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_COMPATIBILITY_COMPLETION_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 'CERTIFIED', 'idempotent', true,
      'jobId', job.job_id, 'matchId', job.match_id
    );
  end if;
  if job.status <> 'PROCESSING' or not job.writer_installed
     or job.claim_token is distinct from (input->>'claim_token')::uuid
     or job.lease_expires_at <= pg_catalog.clock_timestamp()
     or job.expected_manifest_fingerprint
       is distinct from input->>'expected_manifest_fingerprint'
     or current_manifest_fingerprint
       is distinct from input->>'expected_manifest_fingerprint'
     or job.structural_fingerprint
       is distinct from input->>'expected_structural_fingerprint'
     or input->>'readback_fingerprint' !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'readback_checkpoint') <> 'object'
     or coalesce((input#>>'{readback_checkpoint,liveMatchVerified}')::boolean,
       false) is not true
     or coalesce((input#>>'{readback_checkpoint,archiveMatchVerified}')::boolean,
       false) is not true
     or input#>>'{readback_checkpoint,writerGenerationId}'
       is distinct from job.writer_generation_id::text
     or input#>>'{readback_checkpoint,destinationWorkbookId}'
       is distinct from job.destination_workbook_id
     or input#>>'{readback_checkpoint,targetContractFingerprint}'
       is distinct from job.target_contract_fingerprint
     or input#>>'{readback_checkpoint,structuralFingerprint}'
       is distinct from job.structural_fingerprint
     or coalesce((input#>>'{readback_checkpoint,runtimeRevision}')::bigint, -1)
       <> job.structural_runtime_revision then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_FUTURE_COMPATIBILITY_COMPLETION_STALE';
  end if;
  update production_control.future_match_google_compatibility_jobs_v1 value set
    status = 'CERTIFIED', readback_fingerprint = input->>'readback_fingerprint',
    readback_checkpoint = input->'readback_checkpoint',
    certified_at = pg_catalog.clock_timestamp(), claim_token = null,
    claimed_by = null, lease_expires_at = null, safe_error_code = null,
    updated_at = pg_catalog.clock_timestamp()
  where value.job_id = job.job_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 'CERTIFIED', 'jobId', job.job_id,
    'matchId', job.match_id, 'readbackFingerprint',
      input->>'readback_fingerprint', 'idempotent', false
  );
end;
$complete_future_google_writer$;

create or replace function public.fail_production_future_match_google_compatibility_v2(
  input jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $fail_future_google_writer$
declare
  target_id text;
  job production_control.future_match_google_compatibility_jobs_v1%rowtype;
  retryable boolean := coalesce((input->>'retryable')::boolean, false);
  next_status text;
  safe_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'safe_error_code', ''
  )));
begin
  target_id := production_control.assert_future_google_writer_v2(input, true);
  select value.* into strict job
  from production_control.future_match_google_compatibility_jobs_v1 value
  where value.job_id = (input->>'job_id')::uuid
    and value.tournament_id = target_id
    and value.writer_generation_id =
      (input->>'expected_writer_generation_id')::uuid
    and value.destination_workbook_id = input->>'destination_workbook_id'
    and value.target_contract_fingerprint =
      input->>'expected_target_contract_fingerprint'
  for update;
  if job.status <> 'PROCESSING'
     or job.claim_token is distinct from (input->>'claim_token')::uuid
     or safe_code !~ '^[A-Z0-9_]{3,120}$' then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_FUTURE_COMPATIBILITY_FAILURE_STALE';
  end if;
  next_status := case when retryable and job.attempts < 10
    then 'RETRYABLE' else 'BLOCKED' end;
  update production_control.future_match_google_compatibility_jobs_v1 value set
    status = next_status, safe_error_code = safe_code,
    available_at = case when next_status = 'RETRYABLE'
      then pg_catalog.clock_timestamp() + interval '30 seconds'
      else value.available_at end,
    claim_token = null, claimed_by = null, lease_expires_at = null,
    updated_at = pg_catalog.clock_timestamp()
  where value.job_id = job.job_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', next_status, 'jobId', job.job_id,
    'matchId', job.match_id, 'retryable', next_status = 'RETRYABLE'
  );
end;
$fail_future_google_writer$;

-- Certified writer generations and target bindings are immutable evidence.
-- A changed implementation or destination requires a new additive contract;
-- it cannot silently retarget jobs already certified by this migration.
create trigger future_google_writer_generation_immutable_v2
before update or delete
on production_control.future_google_writer_generations_v2
for each row execute function
  production_control.reject_future_runtime_immutable_v2();
create trigger future_google_writer_target_immutable_v2
before update or delete
on production_control.future_google_writer_targets_v2
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

revoke all on table production_control.future_google_writer_generations_v2
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_google_writer_targets_v2
  from public, anon, authenticated, service_role;

do $public_rpc_privileges$
declare signature text;
begin
  foreach signature in array array[
    'public.read_production_cutover_current_view(jsonb)',
    'public.read_production_net_skins_v1(jsonb)',
    'public.read_production_calcutta_v1(jsonb)',
    'public.read_production_guide_projection(jsonb)',
    'public.read_production_future_current_view_v1(jsonb)',
    'public.read_production_annual_google_destination_v1(jsonb)',
    'public.resolve_production_future_match_google_compatibility_v2(jsonb)',
    'public.claim_production_future_match_google_compatibility_v2(jsonb)',
    'public.complete_production_future_match_google_compatibility_v2(jsonb)',
    'public.fail_production_future_match_google_compatibility_v2(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
    execute pg_catalog.format(
      'grant execute on function %s to service_role', signature
    );
  end loop;
end;
$public_rpc_privileges$;

do $internal_rpc_privileges$
declare signature text;
begin
  foreach signature in array array[
    'public.read_production_cutover_current_view_frozen_2026_v1(jsonb)',
    'public.read_production_net_skins_frozen_2026_v1(jsonb)',
    'public.read_production_calcutta_frozen_2026_v1(jsonb)',
    'public.read_production_guide_projection_frozen_2026_v1(jsonb)',
    'public.read_production_future_current_view_unfenced_v1(jsonb)',
    'public.future_production_claim_google_outbox_pre_generation_v1(jsonb)',
    'public.future_production_claim_google_outbox_event_pre_generation_v1(jsonb)',
    'public.future_production_complete_google_outbox_pre_generation_v1(jsonb)',
    'public.future_production_fail_google_outbox_pre_generation_v1(jsonb)',
    'public.future_production_claim_google_outbox_v1(jsonb)',
    'public.future_production_claim_google_outbox_event_v1(jsonb)',
    'public.future_production_complete_google_outbox_v1(jsonb)',
    'public.future_production_fail_google_outbox_v1(jsonb)',
    'public.future_production_claim_scorecard_archive_job_pre_generation_v1(jsonb)',
    'public.future_production_complete_scorecard_archive_job_pre_generation_v1(jsonb)',
    'public.future_production_fail_scorecard_archive_job_pre_generation_v1(jsonb)',
    'public.future_production_claim_scorecard_archive_job_v1(jsonb)',
    'public.future_production_complete_scorecard_archive_job_v1(jsonb)',
    'public.future_production_fail_scorecard_archive_job_v1(jsonb)',
    'public.claim_production_future_match_google_compatibility_v1(jsonb)',
    'public.complete_production_future_match_google_compatibility_v1(jsonb)',
    'public.fail_production_future_match_google_compatibility_v1(jsonb)',
    'public.claim_production_future_google_compatibility_job_v1(jsonb)',
    'public.complete_production_future_google_compatibility_job_v1(jsonb)',
    'public.fail_production_future_google_compatibility_job_v1(jsonb)',
    'production_control.assert_frozen_2026_current_read_v1()',
    'production_control.assert_annual_current_read_v1(jsonb)',
    'production_control.read_annual_net_skins_v1(text)',
    'production_control.calcutta_v1_completed_rounds(text)',
    'production_control.read_annual_calcutta_v1(text,text)',
    'production_control.bind_pending_annual_jobs_v1()',
    'production_control.sync_future_google_writer_job_v2(text,text)',
    'production_control.sync_future_google_writer_binding_v2()',
    'production_control.future_google_match_manifest_v2(text)',
    'production_control.assert_future_google_writer_v2(jsonb,boolean)',
    'scoring_authority.bind_annual_job_generation_v1()'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end;
$internal_rpc_privileges$;

comment on function public.read_production_cutover_current_view(jsonb) is
  'Frozen 2026 current read fenced by the annual pointer; explicit HISTORY_2026 remains immutable history.';
comment on function public.read_production_future_current_view_v1(jsonb) is
  'Current annual read requiring the exact active pointer and five server-owned annual generation tokens.';
comment on function public.read_production_annual_google_destination_v1(jsonb) is
  'Reads an explicitly certified exact annual Google destination; migration installation never creates or infers a target.';
comment on function public.claim_production_future_match_google_compatibility_v2(jsonb) is
  'Claims one exact future-only certified Google compatibility job with lease recovery and structural manifest binding.';
comment on function public.complete_production_future_match_google_compatibility_v2(jsonb) is
  'Stores fresh non-authoritative Google readback; exact lost-response retries are idempotent and no rollback is attempted.';

notify pgrst, 'reload schema';
commit;
