-- Production Calcutta V1 canonical configuration, manual auction facts,
-- explicit publication, deterministic derived-result jobs, and bounded read.
-- Installation is intentionally inert: it seeds only 2026 / NOT_CONFIGURED.
-- It does not change scoring/read/identity authority, ingress, maintenance,
-- worker state, Odds authority, Google rollback controls, or any tournament fact.
--
-- calcutta-js-v1 remains the sole payout/calculation engine. SQL validates and
-- revisions its inputs, leases calculation work, rejects stale writes, and
-- publishes the existing engine model only for the current config+auction pair.
begin;

create table scoring_authority.calcutta_v1_configuration_revisions (
  configuration_revision_id uuid primary key
    default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  configuration_revision bigint not null check (configuration_revision > 0),
  contract_version text not null check (
    contract_version = 'production-calcutta-v1'
  ),
  state text not null check (state in ('NOT_CONFIGURED', 'CONFIGURED')),
  configuration_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(configuration_manifest) = 'object'
  ),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  resource_fingerprint text not null check (
    resource_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  activation_revision bigint not null check (activation_revision >= 0),
  authority_epoch_id uuid,
  configured_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  configured_by_auth_user_id uuid references auth.users(id) on delete restrict,
  request_fingerprint text unique check (
    request_fingerprint is null
    or request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text check (
    request_payload_hash is null
    or request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  configured_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (tournament_id, configuration_revision),
  check (
    (state = 'NOT_CONFIGURED'
      and configured_by_player_id is null
      and configured_by_auth_user_id is null
      and configured_at is null
      and request_fingerprint is null)
    or
    (state = 'CONFIGURED'
      and configured_by_player_id is not null
      and configured_by_auth_user_id is not null
      and configured_at is not null
      and request_fingerprint is not null
      and request_payload_hash is not null)
  )
);

create table scoring_authority.calcutta_v1_auction_fact_revisions (
  auction_revision_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  auction_revision bigint not null check (auction_revision > 0),
  state text not null check (state = 'AUCTION_COMPLETE'),
  auction_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(auction_manifest) = 'object'
  ),
  auction_fingerprint text not null check (
    auction_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  resource_fingerprint text not null check (
    resource_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  activation_revision bigint not null check (activation_revision >= 0),
  authority_epoch_id uuid,
  recorded_by_player_id text not null references
    scoring_authority.players(player_id) on delete restrict,
  recorded_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  request_fingerprint text not null unique check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text not null check (
    request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  recorded_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (tournament_id, auction_revision)
);

create table scoring_authority.calcutta_v1_publication_revisions (
  publication_revision_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  publication_revision bigint not null check (publication_revision > 0),
  configuration_revision bigint not null check (configuration_revision > 0),
  auction_revision bigint not null check (auction_revision >= 0),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  auction_fingerprint text check (
    auction_fingerprint is null or auction_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  publication_state text not null check (
    publication_state in ('UNPUBLISHED', 'PUBLISHED')
  ),
  action text not null check (action in (
    'CONFIGURATION_REPLACED', 'AUCTION_REPLACED',
    'DIRECTOR_PUBLISHED', 'DIRECTOR_UNPUBLISHED'
  )),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  request_fingerprint text not null unique check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text not null check (
    request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  published_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (tournament_id, publication_revision),
  check (
    (publication_state = 'PUBLISHED' and published_at is not null)
    or (publication_state = 'UNPUBLISHED' and published_at is null)
  )
);

create table scoring_authority.calcutta_v1_current (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  configuration_revision_id uuid not null unique references
    scoring_authority.calcutta_v1_configuration_revisions(
      configuration_revision_id
    ) on delete restrict,
  configuration_revision bigint not null check (configuration_revision > 0),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  auction_revision_id uuid unique references
    scoring_authority.calcutta_v1_auction_fact_revisions(
      auction_revision_id
    ) on delete restrict,
  auction_revision bigint not null default 0 check (auction_revision >= 0),
  auction_fingerprint text check (
    auction_fingerprint is null or auction_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  publication_revision_id uuid unique references
    scoring_authority.calcutta_v1_publication_revisions(
      publication_revision_id
    ) on delete restrict,
  publication_revision bigint not null default 0 check (
    publication_revision >= 0
  ),
  publication_state text not null default 'UNPUBLISHED' check (
    publication_state in ('UNPUBLISHED', 'PUBLISHED')
  ),
  state text not null check (state in (
    'NOT_CONFIGURED', 'CONFIGURED', 'AUCTION_COMPLETE',
    'IN_PROGRESS', 'OFFICIAL', 'UNAVAILABLE'
  )),
  result_revision bigint not null default 0 check (result_revision >= 0),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (auction_revision = 0 and auction_revision_id is null
      and auction_fingerprint is null)
    or (auction_revision > 0 and auction_revision_id is not null
      and auction_fingerprint is not null)
  ),
  check (
    (publication_revision = 0 and publication_revision_id is null)
    or (publication_revision > 0 and publication_revision_id is not null)
  ),
  check (state <> 'NOT_CONFIGURED' or auction_revision = 0),
  check (publication_state <> 'PUBLISHED'
    or (state <> 'NOT_CONFIGURED' and auction_revision > 0))
);

create table scoring_authority.calcutta_v1_recalculation_jobs (
  job_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  configuration_revision_id uuid not null references
    scoring_authority.calcutta_v1_configuration_revisions(
      configuration_revision_id
    ) on delete restrict,
  configuration_revision bigint not null check (configuration_revision > 0),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  auction_revision_id uuid not null references
    scoring_authority.calcutta_v1_auction_fact_revisions(
      auction_revision_id
    ) on delete restrict,
  auction_revision bigint not null check (auction_revision > 0),
  auction_fingerprint text not null check (
    auction_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  activation_revision bigint not null check (activation_revision >= 0),
  source_revision jsonb not null check (
    pg_catalog.jsonb_typeof(source_revision) = 'object'
  ),
  source_fingerprint text not null check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  status text not null default 'PENDING' check (
    status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SUPERSEDED')
  ),
  reason text not null check (
    pg_catalog.btrim(reason) <> '' and pg_catalog.length(reason) <= 120
  ),
  requested_by text not null check (
    pg_catalog.btrim(requested_by) <> '' and pg_catalog.length(requested_by) <= 160
  ),
  request_fingerprint text unique check (
    request_fingerprint is null
    or request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text check (
    request_payload_hash is null
    or request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  attempts integer not null default 0 check (attempts between 0 and 10),
  claimed_by text,
  claim_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_safe text,
  requested_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (status = 'RUNNING' and claimed_by is not null
      and pg_catalog.btrim(claimed_by) <> '' and claim_token is not null
      and lease_expires_at is not null and started_at is not null
      and completed_at is null)
    or (status <> 'RUNNING' and claimed_by is null
      and claim_token is null and lease_expires_at is null)
  ),
  check (
    (status in ('SUCCEEDED', 'FAILED', 'SUPERSEDED')
      and completed_at is not null)
    or (status in ('PENDING', 'RUNNING') and completed_at is null)
  )
);

create unique index production_calcutta_v1_one_active_job
  on scoring_authority.calcutta_v1_recalculation_jobs(tournament_id)
  where status in ('PENDING', 'RUNNING');

create index production_calcutta_v1_claim_queue
  on scoring_authority.calcutta_v1_recalculation_jobs(status, requested_at)
  where status in ('PENDING', 'RUNNING');

create table scoring_authority.calcutta_v1_result_revisions (
  result_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  configuration_revision_id uuid not null references
    scoring_authority.calcutta_v1_configuration_revisions(
      configuration_revision_id
    ) on delete restrict,
  configuration_revision bigint not null check (configuration_revision > 0),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  auction_revision_id uuid not null references
    scoring_authority.calcutta_v1_auction_fact_revisions(
      auction_revision_id
    ) on delete restrict,
  auction_revision bigint not null check (auction_revision > 0),
  auction_fingerprint text not null check (
    auction_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  result_revision bigint not null check (result_revision > 0),
  job_id uuid not null unique references
    scoring_authority.calcutta_v1_recalculation_jobs(job_id) on delete restrict,
  engine_version text not null check (engine_version = 'calcutta-js-v1'),
  source_fingerprint text not null check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  result_state text not null check (result_state in ('PROVISIONAL', 'OFFICIAL')),
  engine_result_payload jsonb not null check (
    pg_catalog.jsonb_typeof(engine_result_payload) = 'object'
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  is_current boolean not null default true,
  calculated_by text not null check (
    pg_catalog.btrim(calculated_by) <> ''
    and pg_catalog.length(calculated_by) <= 160
  ),
  calculated_at timestamptz not null,
  superseded_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (tournament_id, result_revision),
  check (
    (is_current and superseded_at is null)
    or (not is_current and superseded_at is not null)
  )
);

create unique index production_calcutta_v1_one_current_result
  on scoring_authority.calcutta_v1_result_revisions(tournament_id)
  where is_current;

create index production_calcutta_v1_result_history
  on scoring_authority.calcutta_v1_result_revisions(
    tournament_id, result_revision desc
  );

alter table scoring_authority.calcutta_v1_configuration_revisions
  enable row level security;
alter table scoring_authority.calcutta_v1_auction_fact_revisions
  enable row level security;
alter table scoring_authority.calcutta_v1_publication_revisions
  enable row level security;
alter table scoring_authority.calcutta_v1_current
  enable row level security;
alter table scoring_authority.calcutta_v1_recalculation_jobs
  enable row level security;
alter table scoring_authority.calcutta_v1_result_revisions
  enable row level security;

revoke all on table
  scoring_authority.calcutta_v1_configuration_revisions,
  scoring_authority.calcutta_v1_auction_fact_revisions,
  scoring_authority.calcutta_v1_publication_revisions,
  scoring_authority.calcutta_v1_current,
  scoring_authority.calcutta_v1_recalculation_jobs,
  scoring_authority.calcutta_v1_result_revisions
  from public, anon, authenticated, service_role;

grant select on table
  scoring_authority.calcutta_v1_configuration_revisions,
  scoring_authority.calcutta_v1_auction_fact_revisions,
  scoring_authority.calcutta_v1_publication_revisions,
  scoring_authority.calcutta_v1_current,
  scoring_authority.calcutta_v1_recalculation_jobs,
  scoring_authority.calcutta_v1_result_revisions
  to service_role;

create or replace function production_control.calcutta_v1_hash(input jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(input::text, 'sha256'), 'hex')
$$;

revoke all on function production_control.calcutta_v1_hash(jsonb)
  from public, anon, authenticated, service_role;

-- Immutable installation seed. No auction facts, publication, or result are
-- fabricated. ON CONFLICT DO NOTHING makes installation additive/replay-safe.
with binding as (
  select
    activation.activation_revision,
    activation.authority_generation_id,
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id
    )) as resource_fingerprint
  from production_control.resource_scope resource
  join production_control.cutover_activation_state activation
    on activation.scope_key = resource.scope_key
  where resource.scope_key = 'BAGGER_INV_PRODUCTION'
), inserted as (
  insert into scoring_authority.calcutta_v1_configuration_revisions (
    tournament_id, configuration_revision, contract_version, state,
    configuration_manifest, configuration_fingerprint,
    resource_fingerprint, activation_revision, authority_epoch_id
  )
  select
    '2026', 1, 'production-calcutta-v1', 'NOT_CONFIGURED',
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'tournament_id', '2026',
      'tournament_year', 2026,
      'state', 'NOT_CONFIGURED',
      'currency_code', 'USD',
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'point_structure', '[]'::jsonb,
      'payout_structure', '[]'::jsonb,
      'financial_contract', pg_catalog.jsonb_build_object(
        'auction_unit', 'PLAYER',
        'auction_workflow', 'MANUAL_FINAL_AUCTION_FACTS',
        'live_bidding', false,
        'tie_rule',
          'COMPETITION_RANK_WITH_OCCUPIED_PLACE_AWARD_AVERAGING',
        'payout_rounding', 'NONE',
        'scramble_asset',
          'PLAYER_PURCHASE_WITH_PAIRING_PERFORMANCE_SPLIT_EQUALLY',
        'completion_rule',
          'ALL_PURCHASED_PLAYERS_HAVE_OFFICIAL_COMPLETED_ROUND_RESULT'
      )
    ),
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'tournament_id', '2026',
      'state', 'NOT_CONFIGURED'
    )),
    binding.resource_fingerprint,
    binding.activation_revision,
    binding.authority_generation_id
  from binding
  on conflict (tournament_id, configuration_revision) do nothing
  returning configuration_revision_id, configuration_revision,
    configuration_fingerprint
), seeded as (
  select configuration_revision_id, configuration_revision,
    configuration_fingerprint from inserted
  union all
  select configuration_revision_id, configuration_revision,
    configuration_fingerprint
  from scoring_authority.calcutta_v1_configuration_revisions
  where tournament_id = '2026' and configuration_revision = 1
  limit 1
)
insert into scoring_authority.calcutta_v1_current (
  tournament_id, configuration_revision_id, configuration_revision,
  configuration_fingerprint, auction_revision, publication_revision,
  publication_state, state, result_revision
)
select '2026', configuration_revision_id, configuration_revision,
  configuration_fingerprint, 0, 0, 'UNPUBLISHED', 'NOT_CONFIGURED', 0
from seeded
on conflict (tournament_id) do nothing;

create or replace function production_control.assert_production_calcutta_v1_runtime(
  input jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  expected_activation bigint := coalesce(
    (input->>'expected_activation_revision')::bigint, -1
  );
begin
  perform production_control.assert_production_scoring_runtime(input, null);
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';

  if expected_activation <> activation.activation_revision then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_ACTIVATION_REVISION_CONFLICT';
  end if;
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.participant_identity_authority <> 'SUPABASE'
     or not resource.public_supabase_reads_enabled
     or not resource.scoring_ingress_enabled
     or input->>'vercel_project_id'
        is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'vercel_team_id'
        is distinct from 'team_kPw5zaib8uaQJALAwj4fWI6R'
     or pg_catalog.lower(coalesce(input->>'vercel_environment', ''))
        <> 'production' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_RUNTIME_REQUIRED';
  end if;
end;
$$;

revoke all on function
  production_control.assert_production_calcutta_v1_runtime(jsonb)
  from public, anon, authenticated, service_role;

create or replace function production_control.build_production_calcutta_v1_configuration(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control
as $$
declare
  row_value jsonb;
  place_value integer;
  point_rows jsonb := '[]'::jsonb;
  payout_rows jsonb := '[]'::jsonb;
  seen_places integer[] := '{}'::integer[];
  total_payout numeric := 0;
  positive_points boolean := false;
  fraction_value numeric;
begin
  if input->>'contract_version' is distinct from 'production-calcutta-v1'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'point_structure', 'null'::jsonb
     )) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'payout_structure', 'null'::jsonb
     )) <> 'array'
     or pg_catalog.jsonb_array_length(input->'point_structure') = 0
     or pg_catalog.jsonb_array_length(input->'payout_structure') = 0 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_INPUT_INVALID';
  end if;

  for row_value in
    select value from pg_catalog.jsonb_array_elements(
      input->'point_structure'
    ) value order by (value->>'place')::integer
  loop
    if pg_catalog.jsonb_typeof(row_value) <> 'object'
       or not (row_value ?& array[
         'place', 'round_1_award', 'round_2_award', 'round_3_award'
       ])
       or row_value->'place' = 'null'::jsonb
       or row_value->'round_1_award' = 'null'::jsonb
       or row_value->'round_2_award' = 'null'::jsonb
       or row_value->'round_3_award' = 'null'::jsonb then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_POINT_STRUCTURE_INVALID';
    end if;
    place_value := (row_value->>'place')::integer;
    if place_value < 1 or place_value = any(seen_places)
       or (row_value->>'round_1_award')::numeric < 0
       or (row_value->>'round_2_award')::numeric < 0
       or (row_value->>'round_3_award')::numeric < 0 then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_POINT_STRUCTURE_INVALID';
    end if;
    seen_places := pg_catalog.array_append(seen_places, place_value);
    positive_points := positive_points
      or (row_value->>'round_1_award')::numeric > 0
      or (row_value->>'round_2_award')::numeric > 0
      or (row_value->>'round_3_award')::numeric > 0;
    point_rows := point_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'place', place_value,
        'round_1_award', (row_value->>'round_1_award')::numeric,
        'round_2_award', (row_value->>'round_2_award')::numeric,
        'round_3_award', (row_value->>'round_3_award')::numeric
      )
    );
  end loop;
  if not positive_points then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_POINT_STRUCTURE_INVALID';
  end if;

  seen_places := '{}'::integer[];
  for row_value in
    select value from pg_catalog.jsonb_array_elements(
      input->'payout_structure'
    ) value order by (value->>'place')::integer
  loop
    if pg_catalog.jsonb_typeof(row_value) <> 'object'
       or not (row_value ?& array[
         'place', 'round_1_fraction', 'round_2_fraction',
         'round_3_fraction', 'overall_fraction'
       ])
       or row_value->'place' = 'null'::jsonb
       or row_value->'round_1_fraction' = 'null'::jsonb
       or row_value->'round_2_fraction' = 'null'::jsonb
       or row_value->'round_3_fraction' = 'null'::jsonb
       or row_value->'overall_fraction' = 'null'::jsonb then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_PAYOUT_STRUCTURE_INVALID';
    end if;
    place_value := (row_value->>'place')::integer;
    if place_value < 1 or place_value = any(seen_places)
       or (row_value->>'round_1_fraction')::numeric < 0
       or (row_value->>'round_2_fraction')::numeric < 0
       or (row_value->>'round_3_fraction')::numeric < 0
       or (row_value->>'overall_fraction')::numeric < 0 then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_PAYOUT_STRUCTURE_INVALID';
    end if;
    seen_places := pg_catalog.array_append(seen_places, place_value);
    fraction_value :=
      (row_value->>'round_1_fraction')::numeric
      + (row_value->>'round_2_fraction')::numeric
      + (row_value->>'round_3_fraction')::numeric
      + (row_value->>'overall_fraction')::numeric;
    total_payout := total_payout + fraction_value;
    payout_rows := payout_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'place', place_value,
        'round_1_fraction',
          (row_value->>'round_1_fraction')::numeric,
        'round_2_fraction',
          (row_value->>'round_2_fraction')::numeric,
        'round_3_fraction',
          (row_value->>'round_3_fraction')::numeric,
        'overall_fraction', (row_value->>'overall_fraction')::numeric
      )
    );
  end loop;
  if total_payout <> 1 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_PAYOUT_TOTAL_MISMATCH';
  end if;

  return pg_catalog.jsonb_build_object(
    'contract_version', 'production-calcutta-v1',
    'tournament_id', '2026',
    'tournament_year', 2026,
    'state', 'CONFIGURED',
    'currency_code', 'USD',
    'publication_policy',
      'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
    'point_structure', point_rows,
    'payout_structure', payout_rows,
    'financial_contract', pg_catalog.jsonb_build_object(
      'auction_unit', 'PLAYER',
      'eligible_entrants', 'ACTIVE_TOURNAMENT_PLAYERS',
      'auction_workflow', 'MANUAL_FINAL_AUCTION_FACTS',
      'live_bidding', false,
      'minimum_bid', null,
      'opening_bid', null,
      'bid_increment', null,
      'pot_rule', 'SUM_PURCHASE_PRICES',
      'round_scoring_basis',
        'CANONICAL_SUPABASE_OFFICIAL_GROSS_NET_RESULTS',
      'overall_scoring_basis', 'DESCENDING_TOTAL_CALCUTTA_POINTS',
      'tie_rule',
        'COMPETITION_RANK_WITH_OCCUPIED_PLACE_AWARD_AVERAGING',
      'payout_rounding', 'NONE',
      'scramble_asset',
        'PLAYER_PURCHASE_WITH_PAIRING_PERFORMANCE_SPLIT_EQUALLY',
      'completion_rule',
        'ALL_PURCHASED_PLAYERS_HAVE_OFFICIAL_COMPLETED_ROUND_RESULT',
      'settlement_tracking', 'NOT_MODELED',
      'payout_total_fraction', 1
    )
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_INPUT_INVALID';
end;
$$;

revoke all on function
  production_control.build_production_calcutta_v1_configuration(jsonb)
  from public, anon, authenticated, service_role;

create or replace function production_control.build_production_calcutta_v1_auction(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
declare
  purchase_value jsonb;
  ownership_value jsonb;
  entrant_value text;
  owner_value text;
  price_value numeric;
  share_value numeric;
  purchases_value jsonb := '[]'::jsonb;
  ownership_value_out jsonb := '[]'::jsonb;
  seen_entrants text[] := '{}'::text[];
  seen_ownership text[] := '{}'::text[];
  pot_value numeric := 0;
begin
  if input->>'contract_version' is distinct from 'production-calcutta-v1'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'purchases', 'null'::jsonb
     )) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'ownership', 'null'::jsonb
     )) <> 'array'
     or pg_catalog.jsonb_array_length(input->'purchases') = 0
     or pg_catalog.jsonb_array_length(input->'ownership') = 0 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
  end if;

  for purchase_value in
    select value from pg_catalog.jsonb_array_elements(input->'purchases') value
    order by value->>'player_id'
  loop
    if pg_catalog.jsonb_typeof(purchase_value) <> 'object'
       or not (purchase_value ?& array[
         'player_id', 'purchase_price'
       ])
       or purchase_value->'player_id' = 'null'::jsonb
       or purchase_value->'purchase_price' = 'null'::jsonb then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_PURCHASE_INVALID';
    end if;
    entrant_value := pg_catalog.btrim(coalesce(
      purchase_value->>'player_id', ''
    ));
    price_value := (purchase_value->>'purchase_price')::numeric;
    if entrant_value = '' or entrant_value = any(seen_entrants)
       or price_value < 0 or not exists (
         select 1 from scoring_authority.tournament_players membership
         where membership.tournament_id = '2026'
           and membership.player_id = entrant_value
           and membership.participation_status = 'ACTIVE'
       ) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_PURCHASE_INVALID';
    end if;
    seen_entrants := pg_catalog.array_append(seen_entrants, entrant_value);
    pot_value := pot_value + price_value;
    purchases_value := purchases_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'player_id', entrant_value,
        'purchase_price', price_value
      )
    );
  end loop;
  for ownership_value in
    select value from pg_catalog.jsonb_array_elements(input->'ownership') value
    order by value->>'player_id', value->>'owner_player_id'
  loop
    if pg_catalog.jsonb_typeof(ownership_value) <> 'object'
       or not (ownership_value ?& array[
         'player_id', 'owner_player_id', 'ownership_fraction'
       ])
       or ownership_value->'player_id' = 'null'::jsonb
       or ownership_value->'owner_player_id' = 'null'::jsonb
       or ownership_value->'ownership_fraction' = 'null'::jsonb then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_OWNERSHIP_INVALID';
    end if;
    entrant_value := pg_catalog.btrim(coalesce(
      ownership_value->>'player_id', ''
    ));
    owner_value := pg_catalog.btrim(coalesce(
      ownership_value->>'owner_player_id', ''
    ));
    share_value := (ownership_value->>'ownership_fraction')::numeric;
    if entrant_value = '' or not (entrant_value = any(seen_entrants))
       or owner_value = '' or share_value <= 0 or share_value > 1
       or (entrant_value || ':' || owner_value) = any(seen_ownership)
       or not exists (
         select 1 from scoring_authority.tournament_players membership
         where membership.tournament_id = '2026'
           and membership.player_id = owner_value
           and membership.participation_status = 'ACTIVE'
       ) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_OWNERSHIP_INVALID';
    end if;
    seen_ownership := pg_catalog.array_append(
      seen_ownership, entrant_value || ':' || owner_value
    );
    ownership_value_out := ownership_value_out ||
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'player_id', entrant_value,
        'owner_player_id', owner_value,
        'ownership_fraction', share_value
      ));
  end loop;

  if exists (
    select 1 from pg_catalog.unnest(seen_entrants) entrant
    where coalesce((
      select pg_catalog.sum((owner_row->>'ownership_fraction')::numeric)
      from pg_catalog.jsonb_array_elements(ownership_value_out) owner_row
      where owner_row->>'player_id' = entrant
    ), 0) <> 1
  ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_OWNERSHIP_TOTAL_MISMATCH';
  end if;

  return pg_catalog.jsonb_build_object(
    'contract_version', 'production-calcutta-v1',
    'tournament_id', '2026',
    'state', 'AUCTION_COMPLETE',
    'currency_code', 'USD',
    'auction_unit', 'PLAYER',
    'entry_workflow', 'MANUAL_FINAL_AUCTION_FACTS',
    'pot', pot_value,
    'purchases', purchases_value,
    'ownership', ownership_value_out
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
end;
$$;

revoke all on function
  production_control.build_production_calcutta_v1_auction(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.configure_production_calcutta_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  manifest_value jsonb;
  configuration_fingerprint_value text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  payload_hash_value text := production_control.calcutta_v1_hash(input);
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_CONFIGURE', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_INPUT_INVALID';
  end if;

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;

  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or (
       current_value.configuration_fingerprint is distinct from
         nullif(input->>'expected_configuration_fingerprint', '')
       and not (
         current_value.state = 'NOT_CONFIGURED'
         and current_value.configuration_revision = 1
         and current_value.auction_revision = 0
         and current_value.publication_revision = 0
         and nullif(input->>'expected_configuration_fingerprint', '') is null
       )
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;

  manifest_value :=
    production_control.build_production_calcutta_v1_configuration(input);
  configuration_fingerprint_value :=
    production_control.calcutta_v1_hash(manifest_value);
  resource_fingerprint_value := production_control.calcutta_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'vercel_project_id', input->>'vercel_project_id',
      'vercel_team_id', input->>'vercel_team_id',
      'vercel_environment', 'production',
      'deployment_commit', activation.expected_deployment_commit,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision
    )
  );

  insert into scoring_authority.calcutta_v1_configuration_revisions (
    tournament_id, configuration_revision, contract_version, state,
    configuration_manifest, configuration_fingerprint,
    resource_fingerprint, activation_revision, authority_epoch_id,
    configured_by_player_id, configured_by_auth_user_id,
    request_fingerprint, request_payload_hash, configured_at
  ) values (
    '2026', current_value.configuration_revision + 1,
    'production-calcutta-v1', 'CONFIGURED', manifest_value,
    configuration_fingerprint_value, resource_fingerprint_value,
    activation.activation_revision, activation.authority_generation_id,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.now()
  ) returning * into configuration_value;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    configuration_value.configuration_revision,
    current_value.auction_revision, configuration_fingerprint_value,
    current_value.auction_fingerprint, 'UNPUBLISHED',
    'CONFIGURATION_REPLACED', actor_player, actor_auth_user,
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'operation', 'CONFIGURATION_REPLACED',
      'request_fingerprint', request_fingerprint_value
    )), payload_hash_value, null
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'SUPERSEDED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' and status in ('PENDING', 'RUNNING');
  update scoring_authority.calcutta_v1_result_revisions
  set is_current = false, superseded_at = pg_catalog.now()
  where tournament_id = '2026' and is_current;

  update scoring_authority.calcutta_v1_current
  set configuration_revision_id = configuration_value.configuration_revision_id,
      configuration_revision = configuration_value.configuration_revision,
      configuration_fingerprint = configuration_fingerprint_value,
      publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'UNPUBLISHED',
      state = case when current_value.auction_revision > 0
        then 'AUCTION_COMPLETE' else 'CONFIGURED' end,
      result_revision = 0,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_CONFIGURED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', configuration_value.configuration_revision,
      'configuration_fingerprint', configuration_fingerprint_value,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED',
      'payout_rounding', 'NONE',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_CONFIGURED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', configuration_value.configuration_revision,
      'configuration_fingerprint', configuration_fingerprint_value,
      'auction_revision', current_value.auction_revision,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_CONFIGURED',
    'state', case when current_value.auction_revision > 0
      then 'AUCTION_COMPLETE' else 'CONFIGURED' end,
    'publication_state', 'UNPUBLISHED',
    'configuration_revision', configuration_value.configuration_revision,
    'configuration_fingerprint', configuration_fingerprint_value,
    'auction_revision', current_value.auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'publication_revision', publication_value.publication_revision,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_CONFIGURE', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function public.configure_production_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.configure_production_calcutta_v1(jsonb)
  to service_role;

create or replace function public.replace_production_calcutta_v1_auction_facts(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  manifest_value jsonb;
  auction_fingerprint_value text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  payload_hash_value text := production_control.calcutta_v1_hash(input);
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_REPLACE_AUCTION', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
  end if;

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;

  if current_value.state = 'NOT_CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;

  manifest_value :=
    production_control.build_production_calcutta_v1_auction(input);
  auction_fingerprint_value := production_control.calcutta_v1_hash(
    manifest_value
  );
  resource_fingerprint_value := production_control.calcutta_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'vercel_project_id', input->>'vercel_project_id',
      'vercel_team_id', input->>'vercel_team_id',
      'vercel_environment', 'production',
      'deployment_commit', activation.expected_deployment_commit,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision
    )
  );

  insert into scoring_authority.calcutta_v1_auction_fact_revisions (
    tournament_id, auction_revision, state, auction_manifest,
    auction_fingerprint, resource_fingerprint, activation_revision,
    authority_epoch_id, recorded_by_player_id, recorded_by_auth_user_id,
    request_fingerprint, request_payload_hash, recorded_at
  ) values (
    '2026', current_value.auction_revision + 1, 'AUCTION_COMPLETE',
    manifest_value, auction_fingerprint_value, resource_fingerprint_value,
    activation.activation_revision, activation.authority_generation_id,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.now()
  ) returning * into auction_value;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    current_value.configuration_revision, auction_value.auction_revision,
    current_value.configuration_fingerprint, auction_fingerprint_value,
    'UNPUBLISHED', 'AUCTION_REPLACED', actor_player, actor_auth_user,
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'operation', 'AUCTION_REPLACED',
      'request_fingerprint', request_fingerprint_value
    )), payload_hash_value, null
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'SUPERSEDED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' and status in ('PENDING', 'RUNNING');
  update scoring_authority.calcutta_v1_result_revisions
  set is_current = false, superseded_at = pg_catalog.now()
  where tournament_id = '2026' and is_current;

  update scoring_authority.calcutta_v1_current
  set auction_revision_id = auction_value.auction_revision_id,
      auction_revision = auction_value.auction_revision,
      auction_fingerprint = auction_fingerprint_value,
      publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'UNPUBLISHED', state = 'AUCTION_COMPLETE',
      result_revision = 0, updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED',
      'purchase_count', pg_catalog.jsonb_array_length(
        manifest_value->'purchases'
      ),
      'ownership_count', pg_catalog.jsonb_array_length(
        manifest_value->'ownership'
      ),
      'pot', manifest_value->>'pot',
      'currency_code', 'USD',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED',
    'state', 'AUCTION_COMPLETE',
    'publication_state', 'UNPUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', auction_value.auction_revision,
    'auction_fingerprint', auction_fingerprint_value,
    'publication_revision', publication_value.publication_revision,
    'currency_code', 'USD',
    'pot', manifest_value->>'pot',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_REPLACE_AUCTION', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.replace_production_calcutta_v1_auction_facts(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.replace_production_calcutta_v1_auction_facts(jsonb)
  to service_role;

create or replace function production_control.calcutta_v1_source_revision(
  target_tournament_id text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
  select pg_catalog.jsonb_build_object(
    'tournament_id', target_tournament_id,
    'rounds', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'round_number', round_value.round_number,
        'format', round_value.format,
        'status', round_value.status
      ) order by round_value.round_number)
      from scoring_authority.rounds round_value
      where round_value.tournament_id = target_tournament_id
        and round_value.round_number between 1 and 3
    ), '[]'::jsonb),
    'matches', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'match_id', match_value.match_id,
        'round_number', match_value.round_number,
        'format', match_value.format,
        'status', match_value.status,
        'match_revision', match_value.match_revision,
        'permission_revision', match_value.permission_revision,
        'scored_holes', match_value.scored_holes,
        'scorecard_complete', match_value.scorecard_complete,
        'result_winner', match_value.result_winner,
        'finalized_at', match_value.finalized_at,
        'scoring_snapshot_id', match_value.scoring_snapshot_id,
        'participants', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'player_id', participant.player_id,
            'team_side', participant.team_side,
            'player_slot', participant.player_slot,
            'course_handicap', participant.course_handicap,
            'playing_handicap', participant.playing_handicap,
            'final_strokes', participant.final_strokes
          ) order by participant.team_side, participant.player_slot,
            participant.player_id)
          from scoring_authority.match_participants participant
          where participant.match_id = match_value.match_id
        ), '[]'::jsonb)
      ) order by match_value.round_number, match_value.match_id)
      from scoring_authority.matches match_value
      where match_value.tournament_id = target_tournament_id
        and match_value.round_number between 1 and 3
    ), '[]'::jsonb),
    'holes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'match_id', score.match_id,
        'round_number', match_value.round_number,
        'hole_number', score.hole_number,
        'hole_revision', score.hole_revision,
        'team_1_gross_scores', score.team_1_gross_scores,
        'team_2_gross_scores', score.team_2_gross_scores,
        'team_1_strokes', score.team_1_strokes,
        'team_2_strokes', score.team_2_strokes,
        'team_1_net_score', score.team_1_net_score,
        'team_2_net_score', score.team_2_net_score,
        'hole_winner', score.hole_winner
      ) order by match_value.round_number, score.match_id, score.hole_number)
      from scoring_authority.hole_scores score
      join scoring_authority.matches match_value
        on match_value.match_id = score.match_id
      where match_value.tournament_id = target_tournament_id
        and match_value.round_number between 1 and 3
    ), '[]'::jsonb)
  )
$$;

revoke all on function
  production_control.calcutta_v1_source_revision(text)
  from public, anon, authenticated, service_role;

create or replace function production_control.calcutta_v1_completed_rounds()
returns integer[]
language sql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
  select coalesce(pg_catalog.array_agg(candidate.round_number
    order by candidate.round_number), '{}'::integer[])
  from pg_catalog.generate_series(1, 3) candidate(round_number)
  where exists (
      select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = '2026'
        and match_value.round_number = candidate.round_number
    )
    and not exists (
      select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = '2026'
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
      where current_value.tournament_id = '2026'
        and not exists (
          select 1
          from scoring_authority.matches match_value
          join scoring_authority.match_participants participant
            on participant.match_id = match_value.match_id
          where match_value.tournament_id = '2026'
            and match_value.round_number = candidate.round_number
            and match_value.status = 'FINAL'
            and match_value.scorecard_complete
            and match_value.finalized_at is not null
            and participant.player_id = purchase->>'player_id'
        )
    )
$$;

revoke all on function
  production_control.calcutta_v1_completed_rounds()
  from public, anon, authenticated, service_role;

create or replace function production_control.enqueue_production_calcutta_v1(
  reason_value text,
  requested_by_value text,
  force_value boolean default false,
  request_fingerprint_value text default null,
  request_payload_hash_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  current_result scoring_authority.calcutta_v1_result_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  completed_rounds_value integer[];
begin
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;
  if not found or current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;

  source_revision_value :=
    production_control.calcutta_v1_source_revision('2026');
  source_fingerprint_value := production_control.calcutta_v1_hash(
    source_revision_value
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'production-calcutta-v1:enqueue:2026', 202608290056
    )
  );

  select value.* into current_result
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.source_fingerprint = source_fingerprint_value
    and value.is_current
  limit 1;
  if found and not force_value then
    return pg_catalog.jsonb_build_object(
      'job_id', null,
      'status', 'CURRENT',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'source_fingerprint', source_fingerprint_value,
      'result_revision', current_result.result_revision
    );
  end if;

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.activation_revision = activation.activation_revision
    and value.source_fingerprint = source_fingerprint_value
    and value.status in ('PENDING', 'RUNNING')
  order by value.requested_at desc, value.job_id desc
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'status', job_value.status,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'source_fingerprint', job_value.source_fingerprint,
      'result_revision', null
    );
  end if;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'SUPERSEDED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' and status in ('PENDING', 'RUNNING');
  insert into scoring_authority.calcutta_v1_recalculation_jobs (
    tournament_id, configuration_revision_id, configuration_revision,
    configuration_fingerprint, auction_revision_id, auction_revision,
    auction_fingerprint, activation_revision, source_revision,
    source_fingerprint, status, reason, requested_by,
    request_fingerprint, request_payload_hash
  ) values (
    '2026', current_value.configuration_revision_id,
    current_value.configuration_revision,
    current_value.configuration_fingerprint,
    current_value.auction_revision_id, current_value.auction_revision,
    current_value.auction_fingerprint, activation.activation_revision,
    source_revision_value, source_fingerprint_value, 'PENDING',
    pg_catalog.left(coalesce(nullif(reason_value, ''),
      'EXPLICIT_RECALCULATION'), 120),
    pg_catalog.left(coalesce(nullif(requested_by_value, ''),
      'production-calcutta-v1'), 160),
    request_fingerprint_value, request_payload_hash_value
  ) returning * into job_value;

  completed_rounds_value :=
    production_control.calcutta_v1_completed_rounds();
  update scoring_authority.calcutta_v1_current
  set state = case
        when current_result.result_id is not null
          and current_result.result_state = 'OFFICIAL'
          and 3 = any(completed_rounds_value) then 'OFFICIAL'
        when current_result.result_id is not null
          and coalesce(pg_catalog.array_length(
            completed_rounds_value, 1
          ), 0) > 0 then 'IN_PROGRESS'
        else 'AUCTION_COMPLETE' end,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  return pg_catalog.jsonb_build_object(
    'job_id', job_value.job_id,
    'status', job_value.status,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'source_fingerprint', job_value.source_fingerprint,
    'result_revision', null
  );
end;
$$;

revoke all on function
  production_control.enqueue_production_calcutta_v1(
    text, text, boolean, text, text
  ) from public, anon, authenticated, service_role;

create or replace function scoring_authority.enqueue_production_calcutta_v1_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  row_payload jsonb := case when tg_op = 'DELETE'
    then pg_catalog.to_jsonb(old) else pg_catalog.to_jsonb(new) end;
  target_tournament text;
  target_match_id text;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
begin
  if tg_table_name = 'rounds' then
    target_tournament := row_payload->>'tournament_id';
  elsif tg_table_name = 'matches' then
    target_tournament := row_payload->>'tournament_id';
  else
    target_match_id := row_payload->>'match_id';
    select match_value.tournament_id into target_tournament
    from scoring_authority.matches match_value
    where match_value.match_id = target_match_id;
  end if;
  if target_tournament is distinct from '2026' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  if not found or current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.current_tournament_id <> '2026' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform production_control.enqueue_production_calcutta_v1(
    case
      when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'
      when tg_table_name = 'rounds' then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'
      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'
    end,
    'production-calcutta-v1-trigger', false, null, null
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function
  scoring_authority.enqueue_production_calcutta_v1_change()
  from public, anon, authenticated, service_role;

-- The legacy Calcutta hook targets the Preview-derived job table. Replace it
-- with the V1 pair-aware lifecycle so Production never queues Preview work.
drop trigger if exists calcutta_official_match_change
  on scoring_authority.matches;

create trigger production_calcutta_v1_hole_score_recalculation
after insert or update or delete on scoring_authority.hole_scores
for each row execute function
  scoring_authority.enqueue_production_calcutta_v1_change();

create trigger production_calcutta_v1_match_lifecycle_recalculation
after update of status, result_winner, scorecard_complete, finalized_at,
  match_revision on scoring_authority.matches
for each row execute function
  scoring_authority.enqueue_production_calcutta_v1_change();

create trigger production_calcutta_v1_round_lifecycle_recalculation
after update of status on scoring_authority.rounds
for each row execute function
  scoring_authority.enqueue_production_calcutta_v1_change();

create or replace function public.enqueue_production_calcutta_v1_recalculation(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_value jsonb;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_ENQUEUE', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_REQUEST_FINGERPRINT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;

  job_value := production_control.enqueue_production_calcutta_v1(
    pg_catalog.left(coalesce(nullif(input->>'reason', ''),
      'EXPLICIT_RECALCULATION'), 120),
    pg_catalog.left(coalesce(nullif(input->>'requested_by', ''),
      'production-calcutta-v1'), 160),
    true, request_fingerprint_value,
    production_control.calcutta_v1_hash(input)
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_ENQUEUED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', current_value.auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'job', job_value,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_ENQUEUE', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.enqueue_production_calcutta_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.enqueue_production_calcutta_v1_recalculation(jsonb)
  to service_role;

create or replace function public.publish_production_calcutta_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_value jsonb;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_PUBLISH', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;
  if current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0
     or current_value.auction_revision_id is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;

  if current_value.publication_state = 'PUBLISHED' then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED',
      'state', current_value.state,
      'publication_state', 'PUBLISHED',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'job', null,
      'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      'CALCUTTA_V1_PUBLISH', input, response_value
    );
    return response_value;
  end if;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    current_value.configuration_revision, current_value.auction_revision,
    current_value.configuration_fingerprint,
    current_value.auction_fingerprint, 'PUBLISHED',
    'DIRECTOR_PUBLISHED', actor_player, actor_auth_user,
    request_fingerprint_value,
    production_control.calcutta_v1_hash(input), pg_catalog.now()
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_current
  set publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'PUBLISHED', updated_at = pg_catalog.now()
  where tournament_id = '2026';

  job_value := production_control.enqueue_production_calcutta_v1(
    'DIRECTOR_PUBLISHED', actor_player, false, null, null
  );
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_PUBLISHED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_PUBLISHED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'job_id', job_value->>'job_id'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_PUBLISHED',
    'state', current_value.state,
    'publication_state', 'PUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', current_value.auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'publication_revision', current_value.publication_revision,
    'result_revision', nullif(current_value.result_revision, 0),
    'job', job_value,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_PUBLISH', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function public.publish_production_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_production_calcutta_v1(jsonb)
  to service_role;

create or replace function public.unpublish_production_calcutta_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_UNPUBLISH', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;

  if current_value.publication_state = 'UNPUBLISHED' then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_CALCUTTA_V1_ALREADY_UNPUBLISHED',
      'state', current_value.state,
      'publication_state', 'UNPUBLISHED',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      'CALCUTTA_V1_UNPUBLISH', input, response_value
    );
    return response_value;
  end if;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    current_value.configuration_revision, current_value.auction_revision,
    current_value.configuration_fingerprint,
    current_value.auction_fingerprint, 'UNPUBLISHED',
    'DIRECTOR_UNPUBLISHED', actor_player, actor_auth_user,
    request_fingerprint_value,
    production_control.calcutta_v1_hash(input), null
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_current
  set publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'UNPUBLISHED', updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_UNPUBLISHED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', publication_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'state_preserved', current_value.state,
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_UNPUBLISHED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', publication_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'state_preserved', current_value.state
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_UNPUBLISHED',
    'state', current_value.state,
    'publication_state', 'UNPUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', current_value.auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'publication_revision', publication_value.publication_revision,
    'result_revision', nullif(current_value.result_revision, 0),
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_UNPUBLISH', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function public.unpublish_production_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.unpublish_production_calcutta_v1(jsonb)
  to service_role;

create or replace function public.claim_production_calcutta_v1_recalculation(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  calculation_input jsonb;
  core_view jsonb;
  current_source jsonb;
  current_source_fingerprint text;
  replacement_job jsonb;
  expected_result_revision bigint;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  lease_seconds_value integer := pg_catalog.least(
    300, pg_catalog.greatest(
      15, coalesce((input->>'lease_seconds')::integer, 60)
    )
  );
  claim_token_value uuid;
begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_CLAIM', input
  );
  if existing_response is not null then return existing_response; end if;
  if worker_value = '' or pg_catalog.length(worker_value) > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_WORKER_ID_REQUIRED';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = case when attempts >= 5 then 'FAILED' else 'PENDING' end,
      claimed_by = null, claim_token = null, lease_expires_at = null,
      completed_at = case when attempts >= 5
        then pg_catalog.now() else null end,
      last_error_code = case when attempts >= 5
        then 'PRODUCTION_CALCUTTA_LEASE_EXHAUSTED' else null end,
      last_error_safe = case when attempts >= 5
        then 'Calcutta recalculation is temporarily unavailable.' else null end,
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and configuration_revision = current_value.configuration_revision
    and configuration_fingerprint = current_value.configuration_fingerprint
    and auction_revision = current_value.auction_revision
    and auction_fingerprint = current_value.auction_fingerprint
    and activation_revision =
      (input->>'expected_activation_revision')::bigint
    and status = 'RUNNING' and lease_expires_at <= pg_catalog.now();

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.activation_revision =
      (input->>'expected_activation_revision')::bigint
    and value.status = 'PENDING' and value.attempts < 5
  order by value.requested_at, value.job_id
  for update skip locked
  limit 1;

  if not found then
    if exists (
      select 1 from scoring_authority.calcutta_v1_recalculation_jobs value
      where value.tournament_id = '2026'
        and value.configuration_revision = current_value.configuration_revision
        and value.auction_revision = current_value.auction_revision
        and value.status = 'FAILED'
    ) then
      update scoring_authority.calcutta_v1_current
      set state = 'UNAVAILABLE', updated_at = pg_catalog.now()
      where tournament_id = '2026';
    end if;
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_EMPTY',
      'job', null,
      'calculation_input', null,
      'idempotent', false
    );
    perform production_control.store_cutover_receipt(
      'CALCUTTA_V1_CLAIM', input, response_value
    );
    return response_value;
  end if;

  current_source := production_control.calcutta_v1_source_revision('2026');
  current_source_fingerprint := production_control.calcutta_v1_hash(
    current_source
  );
  if current_source_fingerprint <> job_value.source_fingerprint then
    update scoring_authority.calcutta_v1_recalculation_jobs
    set status = 'SUPERSEDED', completed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where job_id = job_value.job_id;
    replacement_job := production_control.enqueue_production_calcutta_v1(
      'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value, false, null, null
    );
    select value.* into strict job_value
    from scoring_authority.calcutta_v1_recalculation_jobs value
    where value.job_id = (replacement_job->>'job_id')::uuid
    for update;
  end if;

  claim_token_value := extensions.gen_random_uuid();
  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'RUNNING', attempts = attempts + 1,
      claimed_by = worker_value, claim_token = claim_token_value,
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(secs => lease_seconds_value),
      started_at = pg_catalog.now(), completed_at = null,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id
  returning * into job_value;

  select coalesce(pg_catalog.max(value.result_revision), 0)
    into expected_result_revision
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = '2026';
  select value.* into strict configuration_value
  from scoring_authority.calcutta_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;
  select value.* into strict auction_value
  from scoring_authority.calcutta_v1_auction_fact_revisions value
  where value.auction_revision_id = current_value.auction_revision_id;

  core_view := public.read_leaderboards_core_view('2026');
  if coalesce((core_view->>'ok')::boolean, false) is not true then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_CANONICAL_INPUT_UNAVAILABLE';
  end if;
  calculation_input := pg_catalog.jsonb_build_object(
    'tournament', core_view#>'{data,tournament}',
    'configuration', pg_catalog.jsonb_build_object(
      'tournament_id', '2026',
      'tournament_year', 2026,
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint',
        current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'purchases', auction_value.auction_manifest->'purchases',
      'ownership', auction_value.auction_manifest->'ownership',
      'point_structure',
        configuration_value.configuration_manifest->'point_structure',
      'payout_structure',
        configuration_value.configuration_manifest->'payout_structure',
      'financial_contract',
        configuration_value.configuration_manifest->'financial_contract'
    ),
    'core_view', core_view->'data'
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_CLAIMED',
    'job', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'activation_revision', job_value.activation_revision,
      'source_fingerprint', job_value.source_fingerprint,
      'claim_token', job_value.claim_token,
      'lease_expires_at', job_value.lease_expires_at,
      'expected_result_revision', expected_result_revision
    ),
    'calculation_input', calculation_input,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_CLAIM', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.claim_production_calcutta_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.claim_production_calcutta_v1_recalculation(jsonb)
  to service_role;

create or replace function production_control.validate_production_calcutta_v1_result(
  target_result_state text,
  engine_payload jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  golfer_value jsonb;
  portfolio_value jsonb;
  completed_rounds integer[];
  canonical_completed_rounds integer[];
  expected_entrant_count integer;
  expected_owner_count integer;
begin
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  select value.* into strict auction_value
  from scoring_authority.calcutta_v1_auction_fact_revisions value
  where value.auction_revision_id = current_value.auction_revision_id;

  if pg_catalog.jsonb_typeof(engine_payload) <> 'object'
     or not (engine_payload ?& array[
       'available', 'year', 'pot', 'completedRounds',
       'tournamentComplete', 'distributedPrizePool',
       'guaranteedDistributed', 'remainingPrizePool',
       'golfers', 'portfolios'
     ])
     or engine_payload->'available' = 'null'::jsonb
     or engine_payload->'year' = 'null'::jsonb
     or engine_payload->'pot' = 'null'::jsonb
     or engine_payload->'tournamentComplete' = 'null'::jsonb
     or pg_catalog.jsonb_typeof(engine_payload->'completedRounds') <> 'array'
     or pg_catalog.jsonb_typeof(engine_payload->'golfers') <> 'array'
     or pg_catalog.jsonb_typeof(engine_payload->'portfolios') <> 'array'
     or coalesce((engine_payload->>'year')::integer, 0) <> 2026
     or (engine_payload->>'pot')::numeric < 0
     or (engine_payload->>'pot')::numeric <>
       (auction_value.auction_manifest->>'pot')::numeric
     or engine_payload::text ~*
       '"(email|auth_user_id|authUserId|phone|service_role|serviceRole|secret|credential)"[[:space:]]*:'
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(engine_payload) key_value
       where not (key_value = any(array[
         'available', 'year', 'pot', 'distributedPrizePool',
         'guaranteedDistributed', 'remainingPrizePool',
         'completedRounds', 'tournamentComplete', 'golfers', 'portfolios',
         'storylines', 'hero', 'source'
       ]))
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_PAYLOAD_INVALID';
  end if;

  begin
    select pg_catalog.array_agg(value::integer order by value::integer)
      into completed_rounds
    from pg_catalog.jsonb_array_elements_text(
      engine_payload->'completedRounds'
    ) value;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_PAYLOAD_INVALID';
  end;
  if coalesce(pg_catalog.array_length(completed_rounds, 1), 0) <>
       coalesce((
         select pg_catalog.count(distinct value)
         from pg_catalog.unnest(completed_rounds) value
       ), 0)
     or exists (
       select 1 from pg_catalog.unnest(coalesce(
         completed_rounds, '{}'::integer[]
       )) value where value not between 1 and 3
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_PAYLOAD_INVALID';
  end if;
  completed_rounds := coalesce(completed_rounds, '{}'::integer[]);
  canonical_completed_rounds :=
    production_control.calcutta_v1_completed_rounds();
  if completed_rounds is distinct from canonical_completed_rounds then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_COMPLETED_ROUNDS_CONFLICT';
  end if;

  expected_entrant_count := pg_catalog.jsonb_array_length(
    auction_value.auction_manifest->'purchases'
  );
  for golfer_value in
    select value from pg_catalog.jsonb_array_elements(
      engine_payload->'golfers'
    ) value
  loop
    if pg_catalog.jsonb_typeof(golfer_value) <> 'object'
       or pg_catalog.btrim(coalesce(golfer_value->>'playerId', '')) = ''
       or golfer_value#>>'{player,id}' is distinct from
         golfer_value->>'playerId'
       or pg_catalog.btrim(coalesce(
         golfer_value#>>'{player,name}', ''
       )) = ''
       or not exists (
         select 1 from pg_catalog.jsonb_array_elements(
           auction_value.auction_manifest->'purchases'
         ) purchase
         where purchase->>'player_id' = golfer_value->>'playerId'
       ) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_RESULT_ENTRANT_INVALID';
    end if;
  end loop;
  if pg_catalog.jsonb_array_length(engine_payload->'golfers') <>
       expected_entrant_count
     or (
       select pg_catalog.count(distinct golfer->>'playerId')
       from pg_catalog.jsonb_array_elements(engine_payload->'golfers') golfer
     ) <> expected_entrant_count then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_ENTRANT_INVALID';
  end if;

  select pg_catalog.count(distinct ownership->>'owner_player_id')
    into expected_owner_count
  from pg_catalog.jsonb_array_elements(
    auction_value.auction_manifest->'ownership'
  ) ownership;
  for portfolio_value in
    select value from pg_catalog.jsonb_array_elements(
      engine_payload->'portfolios'
    ) value
  loop
    if pg_catalog.jsonb_typeof(portfolio_value) <> 'object'
       or pg_catalog.btrim(coalesce(portfolio_value->>'ownerId', '')) = ''
       or portfolio_value#>>'{owner,id}' is distinct from
         portfolio_value->>'ownerId'
       or pg_catalog.btrim(coalesce(
         portfolio_value#>>'{owner,name}', ''
       )) = ''
       or not exists (
         select 1 from pg_catalog.jsonb_array_elements(
           auction_value.auction_manifest->'ownership'
         ) ownership
         where ownership->>'owner_player_id' =
           portfolio_value->>'ownerId'
       ) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_RESULT_OWNER_INVALID';
    end if;
  end loop;
  if pg_catalog.jsonb_array_length(engine_payload->'portfolios') <>
       expected_owner_count
     or (
       select pg_catalog.count(distinct portfolio->>'ownerId')
       from pg_catalog.jsonb_array_elements(
         engine_payload->'portfolios'
       ) portfolio
     ) <> expected_owner_count then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_OWNER_INVALID';
  end if;

  if target_result_state = 'OFFICIAL' then
    if coalesce((engine_payload->>'tournamentComplete')::boolean, false)
         is not true
       or not (3 = any(completed_rounds)) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CALCUTTA_OFFICIAL_FINALIZATION_REQUIRED';
    end if;
  elsif target_result_state = 'PROVISIONAL' then
    if coalesce((engine_payload->>'tournamentComplete')::boolean, false)
         is true then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_RESULT_STATE_INVALID';
    end if;
  else
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_STATE_INVALID';
  end if;
  perform production_control.project_production_calcutta_v1_result(
    engine_payload
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_PAYLOAD_INVALID';
end;
$$;

revoke all on function
  production_control.validate_production_calcutta_v1_result(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.complete_production_calcutta_v1_recalculation(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  current_source jsonb;
  current_source_fingerprint text;
  current_result_revision bigint;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  requested_result_state text := pg_catalog.upper(coalesce(
    input->>'result_state', ''
  ));
  result_state_value text;
  result_payload_value jsonb := input->'result_payload';
  payload_hash_value text;
begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_COMPLETE', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or input->>'engine_version' is distinct from 'calcutta-js-v1'
     or requested_result_state not in ('PROVISIONAL', 'OFFICIAL')
     or pg_catalog.jsonb_typeof(coalesce(
       result_payload_value, 'null'::jsonb
     )) <> 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_COMPLETION_INPUT_INVALID';
  end if;
  result_state_value := requested_result_state;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.job_id = job_id_value
  for update;
  if not found or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.configuration_fingerprint <>
       current_value.configuration_fingerprint
     or job_value.auction_revision <> current_value.auction_revision
     or job_value.auction_fingerprint <> current_value.auction_fingerprint
     or job_value.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.now()
     or input->>'expected_source_fingerprint' is distinct from
       job_value.source_fingerprint then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_JOB_LEASE_REQUIRED';
  end if;

  current_source := production_control.calcutta_v1_source_revision('2026');
  current_source_fingerprint := production_control.calcutta_v1_hash(
    current_source
  );
  if current_source_fingerprint <> job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_SOURCE_REVISION_CONFLICT';
  end if;

  payload_hash_value := production_control.calcutta_v1_hash(
    result_payload_value
  );
  perform production_control.validate_production_calcutta_v1_result(
    result_state_value, result_payload_value
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'production-calcutta-v1:result:2026', 202608290056
    )
  );
  select coalesce(pg_catalog.max(value.result_revision), 0)
    into current_result_revision
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = '2026';
  if current_result_revision <>
       coalesce((input->>'expected_result_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_RESULT_REVISION_CONFLICT';
  end if;

  update scoring_authority.calcutta_v1_result_revisions
  set is_current = false, superseded_at = pg_catalog.now()
  where tournament_id = '2026' and is_current;
  insert into scoring_authority.calcutta_v1_result_revisions (
    tournament_id, configuration_revision_id, configuration_revision,
    configuration_fingerprint, auction_revision_id, auction_revision,
    auction_fingerprint, result_revision, job_id, engine_version,
    source_fingerprint, result_state, engine_result_payload, payload_hash,
    is_current, calculated_by, calculated_at
  ) values (
    '2026', job_value.configuration_revision_id,
    job_value.configuration_revision, job_value.configuration_fingerprint,
    job_value.auction_revision_id, job_value.auction_revision,
    job_value.auction_fingerprint, current_result_revision + 1,
    job_value.job_id, 'calcutta-js-v1', job_value.source_fingerprint,
    result_state_value, result_payload_value, payload_hash_value,
    true, worker_value, pg_catalog.now()
  ) returning * into result_value;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'SUCCEEDED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      last_error_code = null, last_error_safe = null,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id;
  update scoring_authority.calcutta_v1_current
  set state = case
        when result_state_value = 'OFFICIAL' then 'OFFICIAL'
        when pg_catalog.jsonb_array_length(
          result_payload_value->'completedRounds'
        ) > 0 then 'IN_PROGRESS'
        else 'AUCTION_COMPLETE' end,
      result_revision = result_value.result_revision,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED',
    worker_value, pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'result_revision', result_value.result_revision,
      'result_state', requested_result_state,
      'source_fingerprint', job_value.source_fingerprint,
      'result_fingerprint', payload_hash_value,
      'publication_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED', 'CALCUTTA',
    '2026', worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'configuration_revision', job_value.configuration_revision,
      'auction_revision', job_value.auction_revision,
      'result_revision', result_value.result_revision,
      'result_state', requested_result_state,
      'publication_changed', false
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED',
    'job_id', job_value.job_id,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'result_revision', result_value.result_revision,
    'result_state', requested_result_state,
    'result_fingerprint', payload_hash_value,
    'publication_state', current_value.publication_state,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_COMPLETE', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.complete_production_calcutta_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.complete_production_calcutta_v1_recalculation(jsonb)
  to service_role;

create or replace function public.fail_production_calcutta_v1_recalculation(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  error_code_value text := pg_catalog.upper(pg_catalog.left(coalesce(
    nullif(input->>'error_code', ''),
    'PRODUCTION_CALCUTTA_CALCULATION_FAILED'
  ), 120));
  error_safe_value text := pg_catalog.left(coalesce(
    nullif(input->>'error_safe', ''),
    'Calcutta recalculation is temporarily unavailable.'
  ), 300);
begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_FAIL', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or error_code_value !~ '^[A-Z0-9_:-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_FAILURE_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.job_id = job_id_value
  for update;
  if not found or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.configuration_fingerprint <>
       current_value.configuration_fingerprint
     or job_value.auction_revision <> current_value.auction_revision
     or job_value.auction_fingerprint <> current_value.auction_fingerprint
     or job_value.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_JOB_LEASE_REQUIRED';
  end if;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'FAILED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      last_error_code = error_code_value,
      last_error_safe = error_safe_value, updated_at = pg_catalog.now()
  where job_id = job_value.job_id;
  update scoring_authority.calcutta_v1_current
  set state = 'UNAVAILABLE',
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED', 'CALCUTTA',
    '2026', worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'FAILED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'configuration_revision', job_value.configuration_revision,
      'auction_revision', job_value.auction_revision,
      'source_fingerprint', job_value.source_fingerprint,
      'error_code', error_code_value
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED',
    'job_id', job_value.job_id,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'state', 'UNAVAILABLE',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_FAIL', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.fail_production_calcutta_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.fail_production_calcutta_v1_recalculation(jsonb)
  to service_role;

create or replace function production_control.project_production_calcutta_v1_result(
  engine_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
declare
  golfer_value jsonb;
  round_value jsonb;
  portfolio_value jsonb;
  investment_value jsonb;
  player_name text;
  owner_name text;
  projected_rounds jsonb;
  projected_golfers jsonb := '[]'::jsonb;
  projected_investments jsonb;
  projected_portfolios jsonb := '[]'::jsonb;
begin
  -- This is an allowlist projection, not payout calculation. Values remain
  -- exactly those produced by calcutta-js-v1; identity labels are re-bound to
  -- the canonical Player directory so arbitrary worker payload fields cannot
  -- leak through the participant/native contract.
  for golfer_value in
    select value from pg_catalog.jsonb_array_elements(
      engine_payload->'golfers'
    ) value
    order by (value->>'rank')::integer, value->>'playerId'
  loop
    if pg_catalog.jsonb_typeof(golfer_value) <> 'object'
       or not (golfer_value ?& array[
         'playerId', 'player', 'rank', 'tieSize', 'purchasePrice',
         'rounds', 'totalPoints', 'overallPayoutPercent',
         'totalPayoutPercent', 'currentPayoutValue',
         'guaranteedWinnings', 'remainingUpside', 'netProfit', 'roi'
       ])
       or pg_catalog.jsonb_typeof(golfer_value->'rounds') <> 'object' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESULT_INVALID';
    end if;
    select player.display_name into strict player_name
    from scoring_authority.players player
    where player.player_id = golfer_value->>'playerId';
    projected_rounds := '[]'::jsonb;
    for round_value in
      select entry.value
      from pg_catalog.jsonb_each(golfer_value->'rounds') entry
      order by (entry.value->>'round')::integer
    loop
      if pg_catalog.jsonb_typeof(round_value) <> 'object'
         or not (round_value ?& array[
           'round', 'format', 'gross', 'net', 'fullCourseHandicap',
           'place', 'tieSize', 'points', 'payoutPercent',
           'guaranteedWinnings'
         ]) then
        raise exception using errcode = '22023',
          message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESULT_INVALID';
      end if;
      projected_rounds := projected_rounds ||
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'round', (round_value->>'round')::integer,
          'format', round_value->>'format',
          'gross', (round_value->>'gross')::numeric,
          'net', (round_value->>'net')::numeric,
          'fullCourseHandicap',
            (round_value->>'fullCourseHandicap')::numeric,
          'place', (round_value->>'place')::integer,
          'tieSize', (round_value->>'tieSize')::integer,
          'points', (round_value->>'points')::numeric,
          'payoutPercent', (round_value->>'payoutPercent')::numeric,
          'guaranteedWinnings',
            (round_value->>'guaranteedWinnings')::numeric
        ));
    end loop;
    projected_golfers := projected_golfers ||
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'playerId', golfer_value->>'playerId',
        'player', pg_catalog.jsonb_build_object(
          'id', golfer_value->>'playerId', 'name', player_name
        ),
        'rank', (golfer_value->>'rank')::integer,
        'tieSize', (golfer_value->>'tieSize')::integer,
        'purchasePrice', (golfer_value->>'purchasePrice')::numeric,
        'rounds', projected_rounds,
        'totalPoints', (golfer_value->>'totalPoints')::numeric,
        'overallPayoutPercent',
          (golfer_value->>'overallPayoutPercent')::numeric,
        'totalPayoutPercent',
          (golfer_value->>'totalPayoutPercent')::numeric,
        'currentPayoutValue',
          (golfer_value->>'currentPayoutValue')::numeric,
        'guaranteedWinnings',
          (golfer_value->>'guaranteedWinnings')::numeric,
        'remainingUpside',
          (golfer_value->>'remainingUpside')::numeric,
        'netProfit', (golfer_value->>'netProfit')::numeric,
        'roi', (golfer_value->>'roi')::numeric
      ));
  end loop;

  for portfolio_value in
    select value from pg_catalog.jsonb_array_elements(
      engine_payload->'portfolios'
    ) value
    order by (value->>'rank')::integer, value->>'ownerId'
  loop
    if pg_catalog.jsonb_typeof(portfolio_value) <> 'object'
       or not (portfolio_value ?& array[
         'ownerId', 'owner', 'rank', 'investments', 'purchaseCost',
         'guaranteedWinnings', 'currentPayoutValue', 'netProfit', 'roi'
       ])
       or pg_catalog.jsonb_typeof(
         portfolio_value->'investments'
       ) <> 'array' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESULT_INVALID';
    end if;
    select player.display_name into strict owner_name
    from scoring_authority.players player
    where player.player_id = portfolio_value->>'ownerId';
    projected_investments := '[]'::jsonb;
    for investment_value in
      select value from pg_catalog.jsonb_array_elements(
        portfolio_value->'investments'
      ) value order by value->>'playerId'
    loop
      if pg_catalog.jsonb_typeof(investment_value) <> 'object'
         or not (investment_value ?& array[
           'playerId', 'player', 'ownership', 'purchasePrice',
           'guaranteedWinnings', 'currentPayoutValue', 'netProfit', 'roi'
         ]) then
        raise exception using errcode = '22023',
          message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESULT_INVALID';
      end if;
      select player.display_name into strict player_name
      from scoring_authority.players player
      where player.player_id = investment_value->>'playerId';
      projected_investments := projected_investments ||
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'playerId', investment_value->>'playerId',
          'player', pg_catalog.jsonb_build_object(
            'id', investment_value->>'playerId', 'name', player_name
          ),
          'ownership', (investment_value->>'ownership')::numeric,
          'purchasePrice', (investment_value->>'purchasePrice')::numeric,
          'guaranteedWinnings',
            (investment_value->>'guaranteedWinnings')::numeric,
          'currentPayoutValue',
            (investment_value->>'currentPayoutValue')::numeric,
          'netProfit', (investment_value->>'netProfit')::numeric,
          'roi', (investment_value->>'roi')::numeric
        ));
    end loop;
    projected_portfolios := projected_portfolios ||
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'ownerId', portfolio_value->>'ownerId',
        'owner', pg_catalog.jsonb_build_object(
          'id', portfolio_value->>'ownerId', 'name', owner_name
        ),
        'rank', (portfolio_value->>'rank')::integer,
        'investments', projected_investments,
        'purchaseCost', (portfolio_value->>'purchaseCost')::numeric,
        'guaranteedWinnings',
          (portfolio_value->>'guaranteedWinnings')::numeric,
        'currentPayoutValue',
          (portfolio_value->>'currentPayoutValue')::numeric,
        'netProfit', (portfolio_value->>'netProfit')::numeric,
        'roi', (portfolio_value->>'roi')::numeric
      ));
  end loop;

  return pg_catalog.jsonb_build_object(
    'available', coalesce((engine_payload->>'available')::boolean, false),
    'year', 2026,
    'pot', (engine_payload->>'pot')::numeric,
    'distributedPrizePool',
      (engine_payload->>'distributedPrizePool')::numeric,
    'guaranteedDistributed',
      (engine_payload->>'guaranteedDistributed')::numeric,
    'remainingPrizePool',
      (engine_payload->>'remainingPrizePool')::numeric,
    'completedRounds', engine_payload->'completedRounds',
    'tournamentComplete',
      coalesce((engine_payload->>'tournamentComplete')::boolean, false),
    'golfers', projected_golfers,
    'portfolios', projected_portfolios
  );
exception
  when no_data_found or invalid_text_representation
    or numeric_value_out_of_range then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESULT_INVALID';
end;
$$;

revoke all on function
  production_control.project_production_calcutta_v1_result(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.read_production_calcutta_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  started_at timestamptz := pg_catalog.clock_timestamp();
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  completed_rounds_value integer[] := '{}'::integer[];
  market_value jsonb;
  participant_result_value jsonb;
  state_value text;
  revision_value text;
  result_is_fresh boolean := false;
  result_is_stale boolean := false;
  updating_value boolean := false;
  expose_result boolean := false;
  participant_player text := pg_catalog.btrim(coalesce(
    input->>'player_id', ''
  ));
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or participant_player = ''
     or not exists (
       select 1 from scoring_authority.tournament_players membership
       where membership.tournament_id = '2026'
         and membership.player_id = participant_player
         and membership.participation_status = 'ACTIVE'
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESOURCE_REQUIRED';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  select value.* into strict configuration_value
  from scoring_authority.calcutta_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;

  if current_value.auction_revision > 0 then
    select value.* into strict auction_value
    from scoring_authority.calcutta_v1_auction_fact_revisions value
    where value.auction_revision_id = current_value.auction_revision_id;
    source_revision_value :=
      production_control.calcutta_v1_source_revision('2026');
    source_fingerprint_value := production_control.calcutta_v1_hash(
      source_revision_value
    );
    completed_rounds_value :=
      production_control.calcutta_v1_completed_rounds();

    select value.* into result_value
    from scoring_authority.calcutta_v1_result_revisions value
    where value.tournament_id = '2026'
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.is_current
    limit 1;
    result_is_fresh := result_value.result_id is not null
      and result_value.source_fingerprint = source_fingerprint_value;
    result_is_stale := result_value.result_id is not null
      and result_value.source_fingerprint <> source_fingerprint_value;

    select value.* into job_value
    from scoring_authority.calcutta_v1_recalculation_jobs value
    where value.tournament_id = '2026'
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.source_fingerprint = source_fingerprint_value
    order by value.requested_at desc, value.job_id desc
    limit 1;
    updating_value := job_value.job_id is not null
      and job_value.status in ('PENDING', 'RUNNING');
  end if;

  if current_value.publication_revision > 0 then
    select value.* into strict publication_value
    from scoring_authority.calcutta_v1_publication_revisions value
    where value.publication_revision_id =
      current_value.publication_revision_id;
  end if;

  state_value := case
    when current_value.state = 'NOT_CONFIGURED' then 'NOT_CONFIGURED'
    when current_value.auction_revision = 0 then 'CONFIGURED'
    when result_is_fresh and result_value.result_state = 'OFFICIAL'
      then 'OFFICIAL'
    when result_is_fresh
      and pg_catalog.jsonb_array_length(
        result_value.engine_result_payload->'completedRounds'
      ) > 0 then 'IN_PROGRESS'
    when result_is_fresh then 'AUCTION_COMPLETE'
    -- A Reopen invalidates OFFICIAL semantics immediately. Withhold the old
    -- payload until the worker commits a new canonical revision.
    when result_is_stale and updating_value
      and result_value.result_state = 'OFFICIAL'
      and not (3 = any(completed_rounds_value)) then 'UNAVAILABLE'
    when result_is_stale and updating_value
      and result_value.result_state = 'OFFICIAL'
      then 'OFFICIAL'
    when result_is_stale and updating_value
      and pg_catalog.jsonb_array_length(
        result_value.engine_result_payload->'completedRounds'
      ) > 0 then 'IN_PROGRESS'
    when result_is_stale and updating_value then 'AUCTION_COMPLETE'
    when result_is_stale then 'UNAVAILABLE'
    when job_value.job_id is not null and job_value.status = 'FAILED'
      then 'UNAVAILABLE'
    else 'AUCTION_COMPLETE'
  end;

  expose_result := current_value.publication_state = 'PUBLISHED'
    and result_value.result_id is not null
    and state_value <> 'UNAVAILABLE';

  if current_value.publication_state = 'PUBLISHED' then
    market_value := pg_catalog.jsonb_build_object(
      'pot', (auction_value.auction_manifest->>'pot')::numeric::text,
      'purchases', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'player', pg_catalog.jsonb_build_object(
            'player_id', purchase->>'player_id',
            'display_name', entrant.display_name
          ),
          'purchase_price',
            (purchase->>'purchase_price')::numeric::text,
          'owners', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'player', pg_catalog.jsonb_build_object(
                'player_id', ownership->>'owner_player_id',
                'display_name', owner_player.display_name
              ),
              'ownership_fraction',
                (ownership->>'ownership_fraction')::numeric::text
            ) order by ownership->>'owner_player_id')
            from pg_catalog.jsonb_array_elements(
              auction_value.auction_manifest->'ownership'
            ) ownership
            join scoring_authority.players owner_player
              on owner_player.player_id = ownership->>'owner_player_id'
            where ownership->>'player_id' = purchase->>'player_id'
          ), '[]'::jsonb)
        ) order by purchase->>'player_id')
        from pg_catalog.jsonb_array_elements(
          auction_value.auction_manifest->'purchases'
        ) purchase
        join scoring_authority.players entrant
          on entrant.player_id = purchase->>'player_id'
      ), '[]'::jsonb)
    );
  else
    market_value := null;
  end if;
  participant_result_value := case when expose_result
    then production_control.project_production_calcutta_v1_result(
      result_value.engine_result_payload
    ) else null end;

  revision_value := pg_catalog.format(
    'calcutta-v1:%s:%s:%s:%s:%s:%s',
    current_value.configuration_revision,
    current_value.auction_revision,
    current_value.publication_revision,
    case when result_value.result_id is null
      then 0 else result_value.result_revision end,
    state_value, current_value.publication_state
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'tournament_id', '2026',
      'state', state_value,
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
      'configuration_fingerprint', case
        when state_value = 'NOT_CONFIGURED' then null
        else current_value.configuration_fingerprint end,
      'auction_fingerprint', current_value.auction_fingerprint,
      'result_fingerprint', case when result_value.result_id is null
        then null else result_value.payload_hash end,
      'revision', revision_value,
      'freshness', pg_catalog.jsonb_build_object(
        'stale', result_is_stale,
        'updating', updating_value,
        'configured_at', configuration_value.configured_at,
        'auction_recorded_at', auction_value.recorded_at,
        'published_at', case
          when current_value.publication_state = 'PUBLISHED'
            then publication_value.published_at
          else null end,
        'calculated_at', result_value.calculated_at,
        'source_fingerprint', source_fingerprint_value
      ),
      'market', market_value,
      'result', participant_result_value,
      'query_ms', pg_catalog.round(extract(epoch from
        (pg_catalog.clock_timestamp() - started_at)) * 1000, 3)
    )
  );
end;
$$;

revoke all on function public.read_production_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_calcutta_v1(jsonb)
  to service_role;

create or replace function public.inspect_production_calcutta_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  revision_value text;
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_RESOURCE_ASSERTION_FAILED';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  if current_value.auction_revision > 0 then
    select value.* into result_value
    from scoring_authority.calcutta_v1_result_revisions value
    where value.tournament_id = '2026'
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.is_current
    limit 1;
  end if;
  revision_value := pg_catalog.format(
    'calcutta-v1:%s:%s:%s:%s:%s:%s',
    current_value.configuration_revision,
    current_value.auction_revision,
    current_value.publication_revision,
    case when result_value.result_id is null
      then 0 else result_value.result_revision end,
    current_value.state, current_value.publication_state
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'tournament_id', '2026',
      'state', current_value.state,
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'publication_state', current_value.publication_state,
      'published', current_value.publication_state = 'PUBLISHED',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', case when result_value.result_id is null
        then null else result_value.result_revision end,
      'result_fingerprint', case when result_value.result_id is null
        then null else result_value.payload_hash end,
      'revision', revision_value
    )
  );
end;
$$;

revoke all on function public.inspect_production_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.inspect_production_calcutta_v1(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
