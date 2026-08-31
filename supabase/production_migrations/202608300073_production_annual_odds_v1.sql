-- Step 13E.7B.1: pointer-selected annual Championship Odds authority V1.
--
-- Installation is inert. It creates no input configuration, calculation job,
-- snapshot, publication, worker lease, Google write, or current-tournament
-- transition. The exact installed 2026 bodies remain behind their original
-- public names while 2026 is current. Future Odds work is reachable only for
-- the exact ACTIVE annual runtime generation selected by the server pointer.
begin;

do $dependencies$
begin
  if pg_catalog.to_regprocedure(
       'production_control.assert_annual_scoring_runtime_v1(jsonb,text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'production_control.assert_annual_current_read_v1(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.read_production_odds_calculation_inputs(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.publish_production_championship_odds_v1(jsonb)'
     ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_DEPENDENCY_REQUIRED';
  end if;
end;
$dependencies$;

-- Odds is a real post-commit capability phase. Do not represent it as the
-- weaker SCORING_COMMIT or WORKERS phase merely to fit the original allowlist.
alter table production_control.annual_scoring_rpc_allowlist_v1
  drop constraint if exists
    annual_scoring_rpc_allowlist_v1_required_phase_check;
alter table production_control.annual_scoring_rpc_allowlist_v1
  add constraint production_annual_scoring_required_phase_v2 check (
    required_phase in (
      'CURRENT_READS', 'SCORING_COMMIT', 'WORKERS', 'ODDS_WAR_ROOM',
      'OBSERVATION'
    )
  );

insert into production_control.annual_scoring_rpc_allowlist_v1 (
  operation_name, target_rpc, required_phase, operation_class,
  required_worker
) values (
  'dispatch_production_annual_odds_v1',
  'public.future_production_dispatch_odds_v1',
  'ODDS_WAR_ROOM', 'MUTATION', null
);

create table production_control.annual_odds_operation_allowlist_v1 (
  operation_name text primary key check (
    operation_name ~ '^[a-z][a-z0-9_]{2,95}$'
  ),
  operation_class text not null check (
    operation_class in ('READ', 'MUTATION', 'WORKER')
  ),
  enabled boolean not null default true,
  installed_at timestamptz not null default pg_catalog.clock_timestamp()
);

insert into production_control.annual_odds_operation_allowlist_v1 (
  operation_name, operation_class
) values
  ('read_production_odds_calculation_inputs', 'READ'),
  ('request_production_odds_calculation_job', 'MUTATION'),
  ('claim_production_odds_calculation_job', 'WORKER'),
  ('checkpoint_production_odds_calculation_job', 'WORKER'),
  ('complete_production_odds_calculation_job', 'WORKER'),
  ('fail_production_odds_calculation_job', 'WORKER'),
  ('supersede_production_odds_calculation_job', 'MUTATION'),
  ('read_production_odds_calculation_jobs', 'READ'),
  ('read_production_odds_publication_v1', 'READ'),
  ('publish_production_championship_odds_v1', 'MUTATION');

alter table production_control.annual_odds_operation_allowlist_v1
  enable row level security;
revoke all on table production_control.annual_odds_operation_allowlist_v1
  from public, anon, authenticated, service_role;
grant select on table production_control.annual_odds_operation_allowlist_v1
  to service_role;
create trigger production_annual_odds_allowlist_immutable_v1
before update or delete
on production_control.annual_odds_operation_allowlist_v1
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

-- Preserve auditable hashes of the exact installed 2026 implementation before
-- adding pointer fences. The frozen bodies are never called by the future
-- dispatcher and are not executable directly by service_role.
create table production_control.annual_odds_2026_body_certifications_v1 (
  function_identity text primary key,
  function_definition_hash text not null check (
    function_definition_hash ~ '^[0-9a-f]{64}$'
  ),
  certification_contract text not null check (
    certification_contract = 'production-annual-odds-2026-equivalence-v1'
  ),
  certified_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table production_control.annual_odds_2026_body_certifications_v1
  enable row level security;
revoke all on table production_control.annual_odds_2026_body_certifications_v1
  from public, anon, authenticated, service_role;
grant select on table production_control.annual_odds_2026_body_certifications_v1
  to service_role;
create trigger production_annual_odds_2026_certification_immutable_v1
before update or delete
on production_control.annual_odds_2026_body_certifications_v1
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

do $capture_2026_bodies$
declare signature text;
begin
  foreach signature in array array[
    'production_control.assert_production_odds_calculation_scope(jsonb,boolean)',
    'public.read_production_odds_calculation_inputs(jsonb)',
    'public.request_production_odds_calculation_job(jsonb)',
    'public.claim_production_odds_calculation_job(jsonb)',
    'public.checkpoint_production_odds_calculation_job(jsonb)',
    'public.complete_production_odds_calculation_job(jsonb)',
    'public.fail_production_odds_calculation_job(jsonb)',
    'public.supersede_production_odds_calculation_job(jsonb)',
    'public.read_production_odds_calculation_jobs(jsonb)',
    'public.read_production_odds_publication_v1(jsonb)',
    'public.publish_production_championship_odds_v1(jsonb)',
    'public.read_published_odds_view(text,text)'
  ] loop
    insert into production_control.annual_odds_2026_body_certifications_v1 (
      function_identity, function_definition_hash, certification_contract
    ) values (
      signature,
      pg_catalog.encode(extensions.digest((
        select value.prosrc from pg_catalog.pg_proc value
        where value.oid = signature::regprocedure
      ), 'sha256'), 'hex'),
      'production-annual-odds-2026-equivalence-v1'
    );
  end loop;
end;
$capture_2026_bodies$;

-- All legacy calculation RPCs already pass through this one assertion. Retain
-- the exact old assertion body and add only the shared-lock pointer fence for
-- PRODUCTION_CUTOVER. The historical Step-11 rehearsal path remains explicit.
alter function production_control.assert_production_odds_calculation_scope(
  jsonb, boolean
) rename to assert_production_odds_calculation_scope_frozen_2026_v1;

create function production_control.assert_production_odds_calculation_scope(
  input jsonb,
  require_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $annual_odds_2026_scope$
declare pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'operation_mode', ''
     ))) = 'PRODUCTION_CUTOVER' then
    perform pg_catalog.pg_advisory_xact_lock_shared(
      production_control.scoring_admission_lock_key()
    );
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    if pointer.tournament_id <> '2026' or pointer.tournament_year <> 2026 then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_LEGACY_ODDS_POINTER_CHANGED';
    end if;
  end if;
  perform production_control
    .assert_production_odds_calculation_scope_frozen_2026_v1(
      input, require_enabled
    );
end;
$annual_odds_2026_scope$;

revoke all on function production_control
  .assert_production_odds_calculation_scope_frozen_2026_v1(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function production_control
  .assert_production_odds_calculation_scope(jsonb, boolean)
  from public, anon, authenticated, service_role;

-- The legacy publication read does not pass through the calculation assertion,
-- so preserve its exact body separately and fence its original public name.
alter function public.read_production_odds_publication_v1(jsonb)
  rename to read_production_odds_publication_frozen_2026_v1;
create function public.read_production_odds_publication_v1(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $annual_odds_2026_publication_read$
begin
  perform production_control.assert_frozen_2026_current_read_v1();
  return public.read_production_odds_publication_frozen_2026_v1(input);
end;
$annual_odds_2026_publication_read$;
revoke all on function
  public.read_production_odds_publication_frozen_2026_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_production_odds_publication_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_odds_publication_v1(jsonb)
  to service_role;

create function production_control.assert_annual_odds_runtime_v1(
  input jsonb,
  expected_odds_operation text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $annual_odds_runtime$
declare
  target text;
  annual_operation
    production_control.annual_odds_operation_allowlist_v1%rowtype;
  resource production_control.resource_scope%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  worker production_control.worker_controls%rowtype;
  worker_contract production_control.worker_contracts%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  annual_catalog production_control.future_tournament_catalog_v1%rowtype;
begin
  select value.* into annual_operation
  from production_control.annual_odds_operation_allowlist_v1 value
  where value.operation_name = expected_odds_operation and value.enabled;
  if annual_operation.operation_name is null
     or input->>'annual_odds_dispatch_contract'
       is distinct from 'production-annual-odds-dispatch-v1'
     or input->>'annual_odds_operation'
       is distinct from annual_operation.operation_name then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_ODDS_OPERATION_NOT_ALLOWLISTED';
  end if;
  target := production_control.assert_annual_scoring_runtime_v1(
    input, 'dispatch_production_annual_odds_v1', null
  );
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict runtime
  from production_control.odds_calculation_runtime value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict worker
  from production_control.worker_controls value
  where value.worker_name = 'ODDS_CALCULATION';
  select value.* into strict worker_contract
  from production_control.worker_contracts value
  where value.worker_name = 'ODDS_CALCULATION';
  select value.* into strict annual_resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target;
  select value.* into strict annual_catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target;
  if target = '2026'
     -- The top-level resource tuple remains the immutable Step-12 platform
     -- assertion. The annual Odds target is a separate server-bound domain
     -- tuple and must match the current pointer-selected catalog row.
     or input->>'tournament_id' is distinct from '2026'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'target_tournament_id' is distinct from target
     or coalesce((input->>'target_tournament_year')::integer, 0)
       <> annual_catalog.tournament_year
     or resource.odds_publication_authority <> 'SUPABASE'
     or not resource.odds_publication_enabled
     or resource.scoring_authority <> 'SUPABASE'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or not resource.workers_enabled
     or not runtime.enabled
     or runtime.operation_mode <> 'PRODUCTION_CUTOVER'
     or runtime.cutover_phase <> 'ODDS_WAR_ROOM'
     or runtime.deployment_commit is distinct from input->>'deployment_commit'
     or not worker.enabled or worker.google_writes_allowed
     or not worker_contract.operation_allowed
     or worker_contract.scheduler_installed
     or worker_contract.authoritative_write_allowed
     or annual_resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or annual_resource.source_workbook_id is null
     or annual_resource.source_workbook_id is distinct from
       input->>'annual_destination_workbook_id'
     or exists (
       select 1 from production_control.worker_controls value
       where value.worker_name = 'ODDS_GOOGLE_MIRROR'
         and (value.enabled or value.google_writes_allowed)
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_RUNTIME_REQUIRED';
  end if;
  return target;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_RUNTIME_REQUIRED';
end;
$annual_odds_runtime$;

revoke all on function
  production_control.assert_annual_odds_runtime_v1(jsonb, text)
  from public, anon, authenticated, service_role;

create function production_control.current_annual_odds_inputs_v1(
  target text,
  destination_workbook text,
  input jsonb,
  require_exact_revision boolean default true
)
returns scoring_authority.odds_input_configurations
language plpgsql
security definer
stable
set search_path = pg_catalog
as $annual_odds_inputs$
declare
  config scoring_authority.odds_input_configurations%rowtype;
  revision jsonb := input->'source_revision';
begin
  select value.* into strict config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current;
  if target = '2026'
     or config.source_workbook_id is distinct from destination_workbook
     or config.validation_status is distinct from 'VALID'
     or config.settings_contract_version is distinct from
       'prediction-settings-v1'
     or coalesce(config.source_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or config.settings_fingerprint !~ '^[0-9a-f]{64}$'
     or config.effective_settings_fingerprint !~ '^[0-9a-f]{64}$'
     or config.bundle_fingerprint !~ '^[0-9a-f]{64}$'
     or config.ratings_fingerprint !~ '^[0-9a-f]{64}$'
     or config.pairing_fingerprint !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(config.effective_settings) <> 'object'
     or scoring_authority.jsonb_object_length(
       config.effective_settings
     ) <> 30 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_PREDICTION_SETTINGS_NOT_CURRENT';
  end if;
  if require_exact_revision and (
    pg_catalog.jsonb_typeof(revision) <> 'object'
    or input->>'input_configuration_id' is distinct from config.id::text
    or coalesce((input->>'configuration_revision')::bigint, -1)
      <> config.configuration_revision
    or pg_catalog.lower(coalesce(input->>'settings_fingerprint', ''))
      is distinct from config.settings_fingerprint
    or pg_catalog.lower(coalesce(
      input->>'effective_settings_fingerprint', ''
    )) is distinct from config.effective_settings_fingerprint
    or pg_catalog.lower(coalesce(input->>'input_bundle_fingerprint', ''))
      is distinct from config.bundle_fingerprint
    or pg_catalog.lower(coalesce(revision->>'source_fingerprint', ''))
      is distinct from pg_catalog.lower(config.source_fingerprint)
    or pg_catalog.lower(coalesce(revision->>'bundle_fingerprint', ''))
      is distinct from config.bundle_fingerprint
    or pg_catalog.lower(coalesce(revision->>'settings_fingerprint', ''))
      is distinct from config.settings_fingerprint
    or pg_catalog.lower(coalesce(
      revision->>'effective_settings_fingerprint', ''
    )) is distinct from config.effective_settings_fingerprint
    or pg_catalog.lower(coalesce(revision->>'ratings_fingerprint', ''))
      is distinct from config.ratings_fingerprint
    or pg_catalog.lower(coalesce(revision->>'pairing_fingerprint', ''))
      is distinct from config.pairing_fingerprint
    or coalesce((revision->>'configuration_revision')::bigint, -1)
      <> config.configuration_revision
    or revision->>'annual_tournament_id' is distinct from target
    or revision->>'annual_runtime_generation_id' is distinct from
      input->>'expected_runtime_generation_id'
    or coalesce((revision->>'annual_pointer_revision')::bigint, -1)
      <> coalesce((input->>'expected_pointer_revision')::bigint, -2)
    or revision->>'annual_authority_generation_id' is distinct from
      input->>'expected_annual_authority_generation_id'
    or revision->>'annual_admission_generation_id' is distinct from
      input->>'expected_annual_admission_generation_id'
  ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_ODDS_INPUT_REVISION_STALE';
  end if;
  return config;
exception
  when no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_INPUT_CONFIGURATION_REQUIRED';
end;
$annual_odds_inputs$;

revoke all on function production_control.current_annual_odds_inputs_v1(
  text, text, jsonb, boolean
) from public, anon, authenticated, service_role;

create function production_control.assert_annual_odds_job_scope_v1(
  input jsonb,
  target text,
  retained scoring_authority.odds_calculation_jobs
)
returns void
language plpgsql
security definer
stable
set search_path = pg_catalog
as $annual_odds_job_scope$
declare revision jsonb := retained.source_revision;
begin
  if retained.tournament_id is distinct from target
     or retained.runtime_generation_id is distinct from
       (input->>'expected_runtime_generation_id')::uuid
     or retained.production_operation_mode <> 'PRODUCTION_CUTOVER'
     or retained.production_deployment_commit is distinct from
       input->>'deployment_commit'
     or retained.production_candidate_hostname is not null
     or revision->>'production_job_identity_contract' is distinct from
       'production-odds-calculation-job-identity-v2'
     or revision->>'annual_odds_contract' is distinct from
       'production-annual-odds-dispatch-v1'
     or revision->>'annual_tournament_id' is distinct from target
     or revision->>'annual_runtime_generation_id' is distinct from
       input->>'expected_runtime_generation_id'
     or coalesce((revision->>'annual_pointer_revision')::bigint, -1)
       <> coalesce((input->>'expected_pointer_revision')::bigint, -2)
     or revision->>'annual_authority_generation_id' is distinct from
       input->>'expected_annual_authority_generation_id'
     or revision->>'annual_admission_generation_id' is distinct from
       input->>'expected_annual_admission_generation_id'
     or revision ? 'rehearsal_fixture_contract'
     or revision ? 'rehearsal_fixture_fingerprint'
     or revision ? 'rehearsal_namespace' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_JOB_SCOPE_MISMATCH';
  end if;
end;
$annual_odds_job_scope$;

revoke all on function production_control.assert_annual_odds_job_scope_v1(
  jsonb, text, scoring_authority.odds_calculation_jobs
) from public, anon, authenticated, service_role;

create function production_control.annual_odds_publication_projection_v1(
  target text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $annual_odds_publication_projection$
declare
  started_at timestamptz := pg_catalog.clock_timestamp();
  tournament_value scoring_authority.tournaments%rowtype;
  current_value scoring_authority.odds_publication_current%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  snapshots jsonb;
  history_count integer;
  publication_value jsonb;
begin
  if target = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_TARGET_REQUIRED';
  end if;
  select value.* into strict tournament_value
  from scoring_authority.tournaments value
  where value.tournament_id = target;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into current_value
  from scoring_authority.odds_publication_current value
  where value.tournament_id = target;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'milestone', value.milestone,
    'phase_order', value.phase_order,
    'publication_revision', value.publication_revision,
    'publication_state_revision', value.publication_state_revision,
    'published_at', value.published_at,
    'payload', value.published_payload,
    'payload_hash', value.payload_hash,
    'logical_payload_hash', value.logical_payload_hash,
    'source_fingerprint', value.source_fingerprint,
    'engine_version', value.engine_version,
    'engine_metadata', value.engine_metadata,
    'settings_fingerprint', value.settings_fingerprint,
    'ratings_fingerprint', value.ratings_fingerprint,
    'pairing_fingerprint', value.pairing_fingerprint,
    'authority_contract_version', value.authority_contract_version,
    'origin_authority', value.publication_authority,
    'source_calculation_job_id', value.source_calculation_job_id,
    'published_by_player_id', value.published_by_player_id,
    'google_publication_fingerprint', null,
    'is_current_official', value.is_current_official,
    'publication_verified', value.publication_verified,
    'imported_at', value.imported_at
  ) order by value.phase_order), '[]'::jsonb), pg_catalog.count(*)
    into snapshots, history_count
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = target
    and value.is_current_for_milestone and value.publication_verified;
  if current_value.tournament_id is null then
    publication_value := pg_catalog.jsonb_build_object(
      'contract_version', 'production-odds-publication-v1',
      'authority', 'SUPABASE', 'state', 'UNPUBLISHED',
      'snapshot_id', null, 'publication_revision', 0,
      'source_calculation_revision', '{}'::jsonb,
      'published_at', null, 'published_by_player_id', null,
      'freshness', 'UNPUBLISHED', 'stale', false,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision,
      'resource_binding_fingerprint', null, 'adoption_kind', null,
      'google_publication_fallback', false, 'google_mirror', 'RETIRED',
      'runtime_generation_id', generation.runtime_generation_id
    );
  elsif current_value.publication_authority <> 'SUPABASE'
     or current_value.publication_state <> 'PUBLISHED'
     or current_value.current_snapshot_id is null
     or current_value.publication_revision < 1 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_PUBLICATION_STATE_INVALID';
  else
    publication_value := pg_catalog.jsonb_build_object(
      'contract_version', current_value.contract_version,
      'authority', current_value.publication_authority,
      'state', current_value.publication_state,
      'snapshot_id', current_value.current_snapshot_id,
      'publication_revision', current_value.publication_revision,
      'source_calculation_revision',
        current_value.source_calculation_revision,
      'published_at', current_value.published_at,
      'published_by_player_id', current_value.published_by_player_id,
      'freshness', current_value.freshness,
      'stale', current_value.freshness = 'STALE',
      'authority_epoch_id', current_value.authority_epoch_id,
      'activation_revision', activation.activation_revision,
      'resource_binding_fingerprint',
        current_value.resource_binding_fingerprint,
      'adoption_kind', current_value.adoption_kind,
      'google_publication_fallback', false, 'google_mirror', 'RETIRED',
      'runtime_generation_id', generation.runtime_generation_id
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'data', pg_catalog.jsonb_build_object(
      'tournament', pg_catalog.to_jsonb(tournament_value),
      'publication', publication_value, 'snapshots', snapshots,
      'history_count', history_count,
      'query_ms', extract(epoch from (
        pg_catalog.clock_timestamp() - started_at
      )) * 1000
    )
  );
end;
$annual_odds_publication_projection$;

revoke all on function
  production_control.annual_odds_publication_projection_v1(text)
  from public, anon, authenticated, service_role;

create function public.future_production_dispatch_odds_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_annual_odds_dispatch$
declare
  operation_name text := pg_catalog.btrim(coalesce(
    input->>'annual_odds_operation', ''
  ));
  target text;
  destination text;
  config scoring_authority.odds_input_configurations%rowtype;
  retained scoring_authority.odds_calculation_jobs%rowtype;
  inserted scoring_authority.odds_calculation_jobs%rowtype;
  existing_checkpoint scoring_authority.odds_calculation_checkpoints%rowtype;
  invocation_value jsonb;
  canonical_value jsonb;
  input_snapshot_value jsonb;
  checkpoint_value jsonb;
  job text := pg_catalog.lower(coalesce(input->>'job_id', ''));
  input_hash text := pg_catalog.lower(coalesce(
    input->>'input_fingerprint', ''
  ));
  checkpoint_hash_value text := pg_catalog.lower(coalesce(
    input->>'checkpoint_hash', ''
  ));
  result_hash text := pg_catalog.lower(coalesce(
    input->>'result_fingerprint', ''
  ));
  claim uuid;
  progress integer;
  retryable boolean;
  superseded_count integer := 0;
  next_sequence integer;
  jobs jsonb;
  checkpoints jsonb;
  publication_result jsonb;
begin
  target := production_control.assert_annual_odds_runtime_v1(
    input, operation_name
  );
  destination := input->>'annual_destination_workbook_id';

  if operation_name = 'read_production_odds_calculation_inputs' then
    perform production_control.current_annual_odds_inputs_v1(
      target, destination, input, false
    );
    return public.read_championship_odds_inputs(target);
  end if;

  if operation_name = 'request_production_odds_calculation_job' then
    config := production_control.current_annual_odds_inputs_v1(
      target, destination, input, true
    );
    if job !~ '^[0-9a-f]{64}$'
       or job <> pg_catalog.lower(coalesce(
         input->>'invocation_fingerprint', ''
       ))
       or input_hash !~ '^[0-9a-f]{64}$'
       or checkpoint_hash_value !~ '^[0-9a-f]{64}$'
       or input->>'target_tournament_id' is distinct from target
       or coalesce((input->>'target_tournament_year')::integer, 0)
         <> target::integer
       or input->>'phase' not in (
         'Pre-Tournament', 'After Round 1', 'After Round 2',
         'Round 3 Pairings Announced', 'Final Results'
       )
       or coalesce((input->>'total_iterations')::integer, 0)
         not in (10000, 25000, 50000, 100000)
       or pg_catalog.btrim(coalesce(input->>'engine_version', '')) = ''
       or pg_catalog.btrim(coalesce(
         input->>'publication_contract_version', ''
       )) = ''
       or pg_catalog.btrim(coalesce(
         input->>'checkpoint_contract_version', ''
       )) = ''
       or pg_catalog.btrim(coalesce(
         input->>'deterministic_seed', ''
       )) = ''
       or pg_catalog.btrim(coalesce(input->>'requested_by', '')) = ''
       or pg_catalog.btrim(coalesce(input->>'output_timestamp', '')) = ''
       or pg_catalog.jsonb_typeof(input->'input_snapshot') <> 'object'
       or pg_catalog.jsonb_typeof(input->'checkpoint_payload') <> 'object'
       or pg_catalog.jsonb_typeof(input->'source_revision') <> 'object'
       or pg_catalog.btrim(coalesce(
         input->>'invocation_canonical_json', ''
       )) = ''
       or pg_catalog.btrim(coalesce(
         input->>'input_snapshot_canonical_json', ''
       )) = ''
       or pg_catalog.btrim(coalesce(
         input->>'checkpoint_canonical_json', ''
       )) = '' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_JOB_REQUIRED';
    end if;
    begin
      invocation_value := (input->>'invocation_canonical_json')::jsonb;
      input_snapshot_value :=
        (input->>'input_snapshot_canonical_json')::jsonb;
      checkpoint_value := (input->>'checkpoint_canonical_json')::jsonb;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
    end;
    if input_snapshot_value is distinct from input->'input_snapshot'
       or checkpoint_value is distinct from input->'checkpoint_payload'
       or pg_catalog.encode(extensions.digest(
         input->>'input_snapshot_canonical_json', 'sha256'
       ), 'hex') <> input_hash
       or pg_catalog.encode(extensions.digest(
         input->>'checkpoint_canonical_json', 'sha256'
       ), 'hex') <> checkpoint_hash_value
       or pg_catalog.encode(extensions.digest(
         input->>'invocation_canonical_json', 'sha256'
       ), 'hex') <> job
       or invocation_value->>'tournamentId' is distinct from target
       or invocation_value->>'phase' is distinct from input->>'phase'
       or coalesce((invocation_value->>'iterations')::integer, 0)
         <> (input->>'total_iterations')::integer
       or invocation_value->>'inputFingerprint' is distinct from input_hash
       or invocation_value->>'settingsFingerprint' is distinct from
         config.settings_fingerprint
       or invocation_value->>'operationMode' is distinct from
         'PRODUCTION_CUTOVER'
       or invocation_value->>'annualRuntimeGenerationId' is distinct from
         input->>'expected_runtime_generation_id'
       or coalesce((invocation_value->>'annualPointerRevision')::bigint, -1)
         <> (input->>'expected_pointer_revision')::bigint
       or invocation_value->>'annualAuthorityGenerationId' is distinct from
         input->>'expected_annual_authority_generation_id'
       or invocation_value->>'annualAdmissionGenerationId' is distinct from
         input->>'expected_annual_admission_generation_id'
       or input#>>'{input_snapshot,metadata,settingsFingerprint}'
         is distinct from config.settings_fingerprint
       or input#>>'{input_snapshot,sheets,tournaments,0,Tournament ID}'
         is distinct from target then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_DETERMINISTIC_IDENTITY_MISMATCH';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('production-annual-odds-job:' || job)
    );
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if found then
      perform production_control.assert_annual_odds_job_scope_v1(
        input, target, retained
      );
      if retained.input_fingerprint <> input_hash
         or retained.input_configuration_id <> config.id
         or retained.input_bundle_fingerprint <> config.bundle_fingerprint
         or retained.total_iterations <>
           (input->>'total_iterations')::integer then
        raise exception using errcode = '23505',
          message = 'PRODUCTION_ODDS_CALCULATION_JOB_IDENTITY_CONFLICT';
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', true, 'changed', false, 'duplicate', true,
        'job', pg_catalog.to_jsonb(retained) - 'input_snapshot'
          - 'checkpoint_payload' - 'result_payload' - 'claim_token',
        'publication_created', false, 'mirror_created', false
      );
    end if;
    insert into scoring_authority.odds_calculation_jobs (
      job_id, tournament_id, phase, total_iterations, engine_version,
      publication_contract_version, checkpoint_contract_version,
      deterministic_seed, input_fingerprint, settings_fingerprint,
      invocation_fingerprint, source_revision, input_snapshot,
      checkpoint_payload, checkpoint_hash, requested_by, output_timestamp,
      resource_metrics, input_configuration_id,
      effective_settings_fingerprint, input_bundle_fingerprint,
      production_operation_mode, production_deployment_commit,
      production_candidate_hostname, publication_status,
      publication_reference, runtime_generation_id
    ) values (
      job, target, input->>'phase',
      (input->>'total_iterations')::integer, input->>'engine_version',
      input->>'publication_contract_version',
      input->>'checkpoint_contract_version', input->>'deterministic_seed',
      input_hash, config.settings_fingerprint, job,
      input->'source_revision', input->'input_snapshot',
      input->'checkpoint_payload', checkpoint_hash_value,
      pg_catalog.left(input->>'requested_by', 180),
      (input->>'output_timestamp')::timestamptz,
      coalesce(input->'resource_metrics', '{}'::jsonb), config.id,
      config.effective_settings_fingerprint, config.bundle_fingerprint,
      'PRODUCTION_CUTOVER', input->>'deployment_commit', null,
      'NOT_REQUESTED', '{}'::jsonb,
      (input->>'expected_runtime_generation_id')::uuid
    ) returning * into inserted;
    update scoring_authority.odds_calculation_jobs value set
      status = 'SUPERSEDED', publication_status = 'STALE',
      superseded_by = job, superseded_at = pg_catalog.clock_timestamp(),
      claim_token = null, lease_owner = null, lease_expires_at = null,
      last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
      last_error_safe = 'Canonical Production calculation inputs advanced.',
      updated_at = pg_catalog.clock_timestamp()
    where value.job_id <> job and value.tournament_id = target
      and value.runtime_generation_id =
        (input->>'expected_runtime_generation_id')::uuid
      and value.phase = input->>'phase'
      and value.production_operation_mode = 'PRODUCTION_CUTOVER'
      and value.input_bundle_fingerprint is distinct from
        config.bundle_fingerprint
      and value.status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
      and value.publication_status <> 'PUBLISHED';
    get diagnostics superseded_count = row_count;
    insert into production_control.operation_audit_events (
      event_type, domain, tournament_id, actor, request_fingerprint,
      result, details
    ) values (
      'PRODUCTION_ODDS_CALCULATION_REQUESTED',
      'CHAMPIONSHIP_ODDS_CALCULATION', target,
      pg_catalog.left(input->>'requested_by', 160), job, 'SUCCEEDED',
      pg_catalog.jsonb_build_object(
        'job_id', job, 'phase', input->>'phase',
        'iterations', (input->>'total_iterations')::integer,
        'runtime_generation_id', input->>'expected_runtime_generation_id',
        'input_fingerprint', input_hash,
        'settings_fingerprint', config.settings_fingerprint,
        'input_bundle_fingerprint', config.bundle_fingerprint,
        'superseded_jobs', superseded_count,
        'publication_created', false, 'mirror_created', false
      )
    );
    return pg_catalog.jsonb_build_object(
      'ok', true, 'changed', true, 'duplicate', false,
      'superseded_jobs', superseded_count,
      'job', pg_catalog.to_jsonb(inserted) - 'input_snapshot'
        - 'checkpoint_payload' - 'result_payload' - 'claim_token',
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'claim_production_odds_calculation_job' then
    if job !~ '^[0-9a-f]{64}$'
       or pg_catalog.btrim(coalesce(input->>'worker_id', '')) = '' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_CLAIM_REQUIRED';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
      );
    end if;
    perform production_control.assert_annual_odds_job_scope_v1(
      input, target, retained
    );
    begin
      config := production_control.current_annual_odds_inputs_v1(
        target, destination,
        input || pg_catalog.jsonb_build_object(
          'input_configuration_id', retained.input_configuration_id,
          'configuration_revision',
            retained.source_revision->>'configuration_revision',
          'settings_fingerprint', retained.settings_fingerprint,
          'effective_settings_fingerprint',
            retained.effective_settings_fingerprint,
          'input_bundle_fingerprint', retained.input_bundle_fingerprint,
          'source_revision', retained.source_revision
        ), true
      );
    exception when sqlstate '40001' then
      update scoring_authority.odds_calculation_jobs set
        status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = pg_catalog.clock_timestamp(), claim_token = null,
        lease_owner = null, lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = pg_catalog.clock_timestamp()
      where job_id = job;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
        'retryable', false
      );
    end;
    if retained.input_configuration_id <> config.id
       or retained.input_bundle_fingerprint <> config.bundle_fingerprint then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_ODDS_INPUT_REVISION_STALE';
    end if;
    if retained.status = 'SUCCEEDED' then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'deliver', false, 'completed', true,
        'job', pg_catalog.to_jsonb(retained) - 'claim_token'
      );
    end if;
    if retained.status in ('SUPERSEDED', 'FAILED') then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_' || retained.status,
        'retryable', false
      );
    end if;
    if retained.status = 'RUNNING'
       and retained.lease_expires_at > pg_catalog.clock_timestamp() then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'deliver', false, 'in_progress', true,
        'job', pg_catalog.to_jsonb(retained) - 'input_snapshot'
          - 'checkpoint_payload' - 'result_payload' - 'claim_token'
      );
    end if;
    update scoring_authority.odds_calculation_jobs set
      status = 'RUNNING', attempt_count = attempt_count + 1,
      claim_token = extensions.gen_random_uuid(),
      lease_owner = pg_catalog.left(input->>'worker_id', 180),
      lease_expires_at = pg_catalog.clock_timestamp() + interval '12 minutes',
      started_at = coalesce(started_at, pg_catalog.clock_timestamp()),
      updated_at = pg_catalog.clock_timestamp(), last_error_code = null,
      last_error_safe = null
    where job_id = job returning * into retained;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'deliver', true, 'job', pg_catalog.to_jsonb(retained),
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'checkpoint_production_odds_calculation_job' then
    begin claim := nullif(input->>'claim_token', '')::uuid;
    exception when others then claim := null; end;
    progress := coalesce((input->>'completed_iterations')::integer, 0);
    if job !~ '^[0-9a-f]{64}$' or claim is null
       or checkpoint_hash_value !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(input->'checkpoint_payload') <> 'object'
       or pg_catalog.btrim(coalesce(
         input->>'checkpoint_canonical_json', ''
       )) = '' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_CHECKPOINT_REQUIRED';
    end if;
    begin canonical_value := (input->>'checkpoint_canonical_json')::jsonb;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
    end;
    if canonical_value is distinct from input->'checkpoint_payload'
       or pg_catalog.encode(extensions.digest(
         input->>'checkpoint_canonical_json', 'sha256'
       ), 'hex') <> checkpoint_hash_value then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_CHECKPOINT_FINGERPRINT_MISMATCH';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
      );
    end if;
    perform production_control.assert_annual_odds_job_scope_v1(
      input, target, retained
    );
    if retained.status <> 'RUNNING'
       or retained.claim_token is distinct from claim
       or retained.lease_expires_at <= pg_catalog.clock_timestamp() then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_CLAIM_STALE',
        'retryable', false
      );
    end if;
    if progress < retained.completed_iterations
       or progress > retained.total_iterations then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_PROGRESS_INVALID'
      );
    end if;
    if progress = retained.completed_iterations then
      if retained.checkpoint_hash = checkpoint_hash_value then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'duplicate', true,
          'checkpoint_count', retained.checkpoint_count,
          'completed_iterations', retained.completed_iterations
        );
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_CHECKPOINT_CONFLICT'
      );
    end if;
    select value.* into existing_checkpoint
    from scoring_authority.odds_calculation_checkpoints value
    where value.job_id = job and value.completed_iterations = progress;
    if found then
      if existing_checkpoint.checkpoint_hash = checkpoint_hash_value then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'duplicate', true,
          'checkpoint_count', retained.checkpoint_count,
          'completed_iterations', progress
        );
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_CHECKPOINT_CONFLICT'
      );
    end if;
    next_sequence := retained.checkpoint_count + 1;
    insert into scoring_authority.odds_calculation_checkpoints (
      job_id, checkpoint_sequence, completed_iterations,
      checkpoint_contract_version, checkpoint_payload, checkpoint_hash,
      attempt_number, resource_metrics
    ) values (
      job, next_sequence, progress, retained.checkpoint_contract_version,
      input->'checkpoint_payload', checkpoint_hash_value,
      retained.attempt_count, coalesce(input->'resource_metrics', '{}'::jsonb)
    );
    update scoring_authority.odds_calculation_jobs set
      completed_iterations = progress,
      checkpoint_payload = input->'checkpoint_payload',
      checkpoint_hash = checkpoint_hash_value,
      checkpoint_count = next_sequence,
      resource_metrics = coalesce(input->'resource_metrics', resource_metrics),
      lease_expires_at = pg_catalog.clock_timestamp() + interval '12 minutes',
      updated_at = pg_catalog.clock_timestamp()
    where job_id = job;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'duplicate', false, 'completed_iterations', progress,
      'total_iterations', retained.total_iterations,
      'checkpoint_count', next_sequence,
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'complete_production_odds_calculation_job' then
    begin claim := nullif(input->>'claim_token', '')::uuid;
    exception when others then claim := null; end;
    if job !~ '^[0-9a-f]{64}$' or claim is null
       or result_hash !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(input->'result_payload') <> 'object'
       or pg_catalog.jsonb_typeof(
         input->'result_fingerprint_payload'
       ) <> 'object'
       or pg_catalog.btrim(coalesce(
         input->>'result_canonical_json', ''
       )) = '' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_RESULT_REQUIRED';
    end if;
    begin canonical_value := (input->>'result_canonical_json')::jsonb;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
    end;
    if canonical_value is distinct from input->'result_fingerprint_payload'
       or input->'result_fingerprint_payload' is distinct from
         (input->'result_payload') - 'publishedAt'
       or pg_catalog.encode(extensions.digest(
         input->>'result_canonical_json', 'sha256'
       ), 'hex') <> result_hash then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_RESULT_FINGERPRINT_MISMATCH';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
      );
    end if;
    perform production_control.assert_annual_odds_job_scope_v1(
      input, target, retained
    );
    begin
      config := production_control.current_annual_odds_inputs_v1(
        target, destination,
        input || pg_catalog.jsonb_build_object(
          'input_configuration_id', retained.input_configuration_id,
          'configuration_revision',
            retained.source_revision->>'configuration_revision',
          'settings_fingerprint', retained.settings_fingerprint,
          'effective_settings_fingerprint',
            retained.effective_settings_fingerprint,
          'input_bundle_fingerprint', retained.input_bundle_fingerprint,
          'source_revision', retained.source_revision
        ), true
      );
    exception when sqlstate '40001' then
      update scoring_authority.odds_calculation_jobs set
        status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = pg_catalog.clock_timestamp(), claim_token = null,
        lease_owner = null, lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = pg_catalog.clock_timestamp()
      where job_id = job;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
        'retryable', false, 'publication_created', false,
        'mirror_created', false
      );
    end;
    if retained.input_configuration_id <> config.id
       or retained.input_bundle_fingerprint <> config.bundle_fingerprint then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_ODDS_INPUT_REVISION_STALE';
    end if;
    if retained.status = 'SUCCEEDED' then
      if retained.result_fingerprint = result_hash
         and retained.publication_status = 'READY' then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'duplicate', true, 'job_id', job,
          'result_fingerprint', result_hash,
          'publication_status', retained.publication_status,
          'publication_eligible', true,
          'publication_created', false, 'mirror_created', false
        );
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_RESULT_CONFLICT'
      );
    end if;
    if retained.status <> 'RUNNING'
       or retained.claim_token is distinct from claim
       or retained.lease_expires_at <= pg_catalog.clock_timestamp() then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_CLAIM_STALE'
      );
    end if;
    if retained.completed_iterations <> retained.total_iterations then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_INCOMPLETE'
      );
    end if;
    if input->'result_payload'->>'phase' is distinct from retained.phase
       or coalesce((input->'result_payload'->>'year')::integer, 0)
         <> target::integer then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_RESULT_TOURNAMENT_MISMATCH';
    end if;
    update scoring_authority.odds_calculation_jobs set
      status = 'SUCCEEDED', publication_status = 'READY',
      publication_reference = '{}'::jsonb,
      result_payload = input->'result_payload',
      result_fingerprint = result_hash,
      output_payload_bytes = pg_catalog.greatest(
        0, coalesce((input->>'output_payload_bytes')::integer, 0)
      ),
      resource_metrics = coalesce(input->'resource_metrics', resource_metrics),
      claim_token = null, lease_owner = null, lease_expires_at = null,
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp(),
      last_error_code = null, last_error_safe = null
    where job_id = job returning * into retained;
    insert into production_control.operation_audit_events (
      event_type, domain, tournament_id, actor, request_fingerprint,
      result, details
    ) values (
      'PRODUCTION_ODDS_CALCULATION_SUCCEEDED',
      'CHAMPIONSHIP_ODDS_CALCULATION', target, retained.requested_by,
      job, 'SUCCEEDED', pg_catalog.jsonb_build_object(
        'job_id', job, 'phase', retained.phase,
        'iterations', retained.total_iterations,
        'runtime_generation_id', retained.runtime_generation_id,
        'result_fingerprint', result_hash,
        'checkpoint_count', retained.checkpoint_count,
        'attempt_count', retained.attempt_count,
        'publication_status', 'READY',
        'publication_eligible', true,
        'publication_created', false, 'mirror_created', false
      )
    );
    return pg_catalog.jsonb_build_object(
      'ok', true, 'duplicate', false, 'job_id', job,
      'result_fingerprint', result_hash,
      'checkpoint_count', retained.checkpoint_count,
      'attempt_count', retained.attempt_count,
      'publication_status', 'READY', 'publication_eligible', true,
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'fail_production_odds_calculation_job' then
    begin claim := nullif(input->>'claim_token', '')::uuid;
    exception when others then claim := null; end;
    retryable := coalesce((input->>'retryable')::boolean, true);
    if job !~ '^[0-9a-f]{64}$' or claim is null then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_FAILURE_REQUIRED';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'marked', false, 'stale_claim', true,
        'publication_created', false, 'mirror_created', false
      );
    end if;
    perform production_control.assert_annual_odds_job_scope_v1(
      input, target, retained
    );
    if retained.status <> 'RUNNING'
       or retained.claim_token is distinct from claim then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'marked', false, 'stale_claim', true,
        'publication_created', false, 'mirror_created', false
      );
    end if;
    update scoring_authority.odds_calculation_jobs set
      status = case when retryable then 'RETRYABLE' else 'FAILED' end,
      claim_token = null, lease_owner = null, lease_expires_at = null,
      last_error_code = pg_catalog.left(coalesce(
        nullif(input->>'error_code', ''), 'ODDS_CALCULATION_FAILED'
      ), 120),
      last_error_safe = pg_catalog.left(coalesce(
        nullif(input->>'error_safe', ''),
        'Championship calculation stopped safely.'
      ), 400),
      completed_at = case when retryable then completed_at
        else pg_catalog.clock_timestamp() end,
      updated_at = pg_catalog.clock_timestamp()
    where job_id = job returning * into retained;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'marked', true, 'retryable', retryable,
      'status', retained.status,
      'completed_iterations', retained.completed_iterations,
      'checkpoint_count', retained.checkpoint_count,
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'supersede_production_odds_calculation_job' then
    if job !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_SUPERSESSION_REQUIRED';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
      );
    end if;
    perform production_control.assert_annual_odds_job_scope_v1(
      input, target, retained
    );
    config := production_control.current_annual_odds_inputs_v1(
      target, destination, input, false
    );
    if retained.input_bundle_fingerprint = config.bundle_fingerprint
       and retained.input_configuration_id = config.id then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_INPUTS_STILL_CURRENT'
      );
    end if;
    update scoring_authority.odds_calculation_jobs set
      status = 'SUPERSEDED', publication_status = 'STALE',
      superseded_at = pg_catalog.clock_timestamp(), claim_token = null,
      lease_owner = null, lease_expires_at = null,
      last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
      last_error_safe = 'Canonical Production calculation inputs advanced.',
      updated_at = pg_catalog.clock_timestamp()
    where job_id = job
      and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
    returning * into retained;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'superseded', found,
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'read_production_odds_calculation_jobs' then
    if job <> '' and job !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_ODDS_JOB_ID_INVALID';
    end if;
    if job <> '' then
      select value.* into retained
      from scoring_authority.odds_calculation_jobs value
      where value.job_id = job;
      if found then
        perform production_control.assert_annual_odds_job_scope_v1(
          input, target, retained
        );
      end if;
    end if;
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(value) - 'claim_token'
      order by value.requested_at desc
    ), '[]'::jsonb) into jobs
    from scoring_authority.odds_calculation_jobs value
    where value.tournament_id = target
      and value.runtime_generation_id =
        (input->>'expected_runtime_generation_id')::uuid
      and value.production_operation_mode = 'PRODUCTION_CUTOVER'
      and value.production_deployment_commit = input->>'deployment_commit'
      and value.production_candidate_hostname is null
      and value.source_revision->>'production_job_identity_contract'
        = 'production-odds-calculation-job-identity-v2'
      and value.source_revision->>'annual_odds_contract'
        = 'production-annual-odds-dispatch-v1'
      and (job = '' or value.job_id = job);
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(checkpoint) - 'checkpoint_payload'
      order by checkpoint.job_id, checkpoint.checkpoint_sequence
    ), '[]'::jsonb) into checkpoints
    from scoring_authority.odds_calculation_checkpoints checkpoint
    join scoring_authority.odds_calculation_jobs value
      on value.job_id = checkpoint.job_id
    where value.tournament_id = target
      and value.runtime_generation_id =
        (input->>'expected_runtime_generation_id')::uuid
      and value.production_operation_mode = 'PRODUCTION_CUTOVER'
      and value.production_deployment_commit = input->>'deployment_commit'
      and value.production_candidate_hostname is null
      and value.source_revision->>'annual_odds_contract'
        = 'production-annual-odds-dispatch-v1'
      and (job = '' or checkpoint.job_id = job);
    return pg_catalog.jsonb_build_object(
      'ok', true, 'jobs', jobs, 'checkpoints', checkpoints,
      'operation_mode', 'PRODUCTION_CUTOVER',
      'deployment_commit', input->>'deployment_commit',
      'candidate_hostname', null,
      'runtime_generation_id', input->>'expected_runtime_generation_id',
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'read_production_odds_publication_v1' then
    return production_control.annual_odds_publication_projection_v1(target);
  end if;

  if operation_name = 'publish_production_championship_odds_v1' then
    execute 'select production_control.publish_annual_odds_v1($1, $2)'
      into publication_result using input, target;
    return publication_result;
  end if;

  raise exception using errcode = '42501',
    message = 'PRODUCTION_ANNUAL_ODDS_OPERATION_NOT_ALLOWLISTED';
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ANNUAL_ODDS_INPUT_INVALID';
end;
$future_annual_odds_dispatch$;

revoke all on function public.future_production_dispatch_odds_v1(jsonb)
  from public, anon, authenticated, service_role;

create function production_control.publish_annual_odds_v1(
  input jsonb,
  target text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $publish_annual_odds$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  current_value scoring_authority.odds_publication_current%rowtype;
  current_snapshot scoring_authority.odds_published_snapshots%rowtype;
  job scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
  created_snapshot scoring_authority.odds_published_snapshots%rowtype;
  response_value jsonb;
  binding jsonb;
  source_revision_value jsonb;
  binding_fingerprint text;
  payload_hash_value text;
  expected_revision bigint := coalesce(
    (input->>'expected_publication_revision')::bigint, -1
  );
  expected_snapshot uuid;
  next_revision bigint;
  next_milestone_revision bigint;
  phase_order_value integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth_user uuid;
  expected_authority_epoch uuid;
  request_fingerprint_value text := pg_catalog.lower(coalesce(
    input->>'request_fingerprint', ''
  ));
  expected_request_fingerprint text;
begin
  begin
    expected_snapshot := nullif(input->>'expected_snapshot_id', '')::uuid;
    actor_auth_user := nullif(
      input#>>'{authorization,auth_user_id}', ''
    )::uuid;
    expected_authority_epoch := nullif(
      input->>'expected_authority_epoch_id', ''
    )::uuid;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_PUBLICATION_INPUT_INVALID';
  end;
  perform production_control.assert_future_production_scoring_actor_v1(
    input, target, true
  );
  expected_request_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.concat_ws(E'\n',
      'production-odds-publication-v1', 'PUBLISH', target,
      pg_catalog.lower(coalesce(input->>'job_id', '')),
      coalesce(input->>'expected_activation_revision', ''),
      pg_catalog.lower(coalesce(input->>'expected_authority_epoch_id', '')),
      pg_catalog.lower(coalesce(
        input#>>'{authorization,auth_user_id}', ''
      )), actor_player
    ), 'sha256'
  ), 'hex');
  if target = '2026'
     or input->>'operation' is distinct from
       'PUBLISH_PRODUCTION_CHAMPIONSHIP_ODDS_V1'
     or input->>'contract_version' is distinct from
       'production-odds-publication-v1'
     or input->>'target_tournament_id' is distinct from target
     or coalesce((input->>'target_tournament_year')::integer, 0)
       <> target::integer
     or input->>'vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or input->>'vercel_environment' is distinct from 'production'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce(input->>'job_id', '') !~ '^[0-9a-f]{64}$'
     or expected_revision < 0
     or coalesce(input->>'deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'expected_activation_revision', '') !~ '^[0-9]+$'
     or expected_authority_epoch is null
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or request_fingerprint_value is distinct from
       expected_request_fingerprint then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_PUBLICATION_INPUT_INVALID';
  end if;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target
    and value.runtime_generation_id =
      (input->>'expected_runtime_generation_id')::uuid
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual_resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target;
  select value.* into current_value
  from scoring_authority.odds_publication_current value
  where value.tournament_id = target for update;
  select value.* into job
  from scoring_authority.odds_calculation_jobs value
  where value.job_id = input->>'job_id' for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
    );
  end if;
  perform production_control.assert_annual_odds_job_scope_v1(
    input, target, job
  );
  if job.status = 'SUCCEEDED'
     and job.publication_status = 'PUBLISHED'
     and job.publication_reference->>'contract_version'
       = 'production-odds-publication-v1'
     and job.publication_reference->>'request_fingerprint'
       = request_fingerprint_value then
    select value.* into strict created_snapshot
    from scoring_authority.odds_published_snapshots value
    where value.id = (job.publication_reference->>'snapshot_id')::uuid;
    if current_value.tournament_id is null
       or current_value.publication_authority <> 'SUPABASE'
       or current_value.current_snapshot_id <> created_snapshot.id
       or current_value.publication_revision < 1
       or created_snapshot.tournament_id <> target
       or created_snapshot.source_calculation_job_id <> job.job_id then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ODDS_PUBLICATION_REPLAY_STATE_INVALID';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_ODDS_PUBLISHED',
      'idempotent', true, 'publication_authority', 'SUPABASE',
      'publication_contract_version', 'production-odds-publication-v1',
      'snapshot_id', created_snapshot.id,
      'publication_revision', current_value.publication_revision,
      'publication_state', current_value.publication_state,
      'freshness', current_value.freshness,
      'published_at', created_snapshot.published_at,
      'published_payload', created_snapshot.published_payload,
      'runtime_generation_id', generation.runtime_generation_id,
      'mirror_created', false, 'google_writes', 0
    );
  end if;
  if resource.odds_publication_authority <> 'SUPABASE'
     or not resource.odds_publication_enabled
     or resource.scoring_authority <> 'SUPABASE'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or activation.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       expected_authority_epoch
     or annual_resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or annual_resource.source_workbook_id is distinct from
       input->>'annual_destination_workbook_id'
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or exists (
       select 1 from production_control.worker_controls value
       where value.worker_name = 'ODDS_GOOGLE_MIRROR'
         and (value.enabled or value.google_writes_allowed)
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_PUBLICATION_NOT_SAFE';
  end if;
  if current_value.tournament_id is null then
    if expected_revision <> 0 or expected_snapshot is not null then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ODDS_PUBLICATION_REVISION_CONFLICT';
    end if;
  elsif current_value.publication_authority <> 'SUPABASE'
     or current_value.publication_state <> 'PUBLISHED'
     or current_value.publication_revision <> expected_revision
     or current_value.current_snapshot_id is distinct from expected_snapshot
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ODDS_PUBLICATION_REVISION_CONFLICT';
  end if;
  if job.status <> 'SUCCEEDED'
     or job.publication_status <> 'READY'
     or job.publication_reference <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(job.result_payload) <> 'object'
     or coalesce(job.result_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or job.result_payload->>'phase' is distinct from job.phase
     or coalesce((job.result_payload->>'year')::integer, 0) <> target::integer
     or pg_catalog.jsonb_typeof(job.result_payload->'teams') <> 'array'
     or pg_catalog.jsonb_array_length(job.result_payload->'teams') = 0
     or pg_catalog.jsonb_typeof(job.result_payload->'players') <> 'array'
     or pg_catalog.jsonb_array_length(job.result_payload->'players') = 0
     or (job.result_payload->>'publishedAt')::timestamptz
       is distinct from job.output_timestamp then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_CALCULATION_NOT_PUBLISHABLE';
  end if;
  config := production_control.current_annual_odds_inputs_v1(
    target, annual_resource.source_workbook_id,
    input || pg_catalog.jsonb_build_object(
      'input_configuration_id', job.input_configuration_id,
      'configuration_revision',
        job.source_revision->>'configuration_revision',
      'settings_fingerprint', job.settings_fingerprint,
      'effective_settings_fingerprint', job.effective_settings_fingerprint,
      'input_bundle_fingerprint', job.input_bundle_fingerprint,
      'source_revision', job.source_revision
    ), true
  );
  phase_order_value := pg_catalog.array_position(array[
    'Pre-Tournament', 'After Round 1', 'After Round 2',
    'Round 3 Pairings Announced', 'Final Results'
  ], job.phase) - 1;
  if current_value.current_snapshot_id is not null then
    select value.* into strict current_snapshot
    from scoring_authority.odds_published_snapshots value
    where value.id = current_value.current_snapshot_id;
    if phase_order_value < current_snapshot.phase_order then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ODDS_PUBLICATION_PHASE_REGRESSION';
    end if;
  end if;
  if job.phase = 'Final Results' and exists (
    select 1 from scoring_authority.matches value
    where value.tournament_id = target
      and (value.status <> 'FINAL' or value.scorecard_complete is not true)
  ) then
    raise exception using errcode = '55000',
      message = 'FINAL_RESULTS_NOT_READY';
  end if;
  next_revision := expected_revision + 1;
  select coalesce(pg_catalog.max(value.publication_revision), 0) + 1
    into next_milestone_revision
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = target and value.milestone = job.phase;
  source_revision_value := job.source_revision ||
    pg_catalog.jsonb_build_object(
      'calculation_job_id', job.job_id,
      'calculation_result_fingerprint', job.result_fingerprint,
      'input_configuration_id', config.id,
      'configuration_revision', config.configuration_revision,
      'settings_fingerprint', config.settings_fingerprint,
      'effective_settings_fingerprint',
        config.effective_settings_fingerprint,
      'ratings_fingerprint', config.ratings_fingerprint,
      'pairing_fingerprint', config.pairing_fingerprint,
      'bundle_fingerprint', config.bundle_fingerprint,
      'runtime_generation_id', generation.runtime_generation_id,
      'pointer_revision', generation.pointer_revision,
      'annual_authority_generation_id', generation.authority_generation_id,
      'annual_admission_generation_id', generation.admission_generation_id
    );
  binding := pg_catalog.jsonb_build_object(
    'contract_version', 'production-odds-publication-v1',
    'annual_contract_version', 'production-annual-odds-dispatch-v1',
    'environment', 'PRODUCTION', 'project_ref', resource.project_ref,
    'project_url', resource.project_url,
    'source_workbook_id', annual_resource.source_workbook_id,
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'vercel_environment', 'production',
    'deployment_id', input->>'deployment_id',
    'deployment_commit', input->>'deployment_commit',
    'canonical_domain', resource.canonical_domain,
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'pointer_revision', generation.pointer_revision,
    'authority_generation_id', generation.authority_generation_id,
    'admission_generation_id', generation.admission_generation_id,
    'platform_authority_epoch_id', expected_authority_epoch,
    'activation_revision', activation.activation_revision,
    'publication_revision', next_revision,
    'source_calculation_job_id', job.job_id,
    'google_publication_retired', true,
    'google_mirror_retired', true
  );
  binding_fingerprint :=
    production_control.odds_publication_v1_hash(binding);
  payload_hash_value :=
    production_control.odds_publication_v1_hash(job.result_payload);
  update scoring_authority.odds_published_snapshots set
    is_current_for_milestone = false
  where tournament_id = target and milestone = job.phase
    and is_current_for_milestone;
  update scoring_authority.odds_published_snapshots set
    is_current_official = false
  where tournament_id = target and is_current_official;
  insert into scoring_authority.odds_published_snapshots (
    tournament_id, milestone, phase_order, publication_revision,
    published_at, published_payload, payload_hash, source_fingerprint,
    engine_version, engine_metadata, google_publication_fingerprint,
    google_publication_reference, is_current_for_milestone,
    is_current_official, publication_verified, imported_by,
    logical_payload_hash, settings_fingerprint, ratings_fingerprint,
    pairing_fingerprint, deterministic_seed, publication_actor_id,
    mirror_status, authority_contract_version, publication_authority,
    publication_state_revision, source_calculation_job_id,
    source_calculation_revision, published_by_auth_user_id,
    published_by_player_id, authority_epoch_id, resource_binding,
    resource_binding_fingerprint
  ) values (
    target, job.phase, phase_order_value, next_milestone_revision,
    job.output_timestamp, job.result_payload, payload_hash_value,
    nullif(job.source_revision->>'source_fingerprint', ''),
    job.engine_version, pg_catalog.jsonb_build_object(
      'iterations', job.total_iterations, 'phaseOrder', phase_order_value,
      'calculationJobId', job.job_id,
      'resultFingerprint', job.result_fingerprint,
      'runtimeGenerationId', generation.runtime_generation_id
    ), null, null, true, true, true,
    'production-odds-publication-v1', job.result_fingerprint,
    config.settings_fingerprint, config.ratings_fingerprint,
    config.pairing_fingerprint, job.deterministic_seed, actor_player,
    'RETIRED', 'production-odds-publication-v1', 'SUPABASE',
    next_revision, job.job_id, source_revision_value, actor_auth_user,
    actor_player, expected_authority_epoch, binding, binding_fingerprint
  ) returning * into created_snapshot;
  insert into scoring_authority.odds_publication_current (
    tournament_id, contract_version, publication_authority,
    publication_state, freshness, current_snapshot_id,
    publication_revision, source_calculation_revision, published_at,
    published_by_player_id, published_by_auth_user_id, authority_epoch_id,
    resource_binding, resource_binding_fingerprint, adoption_kind,
    activated_by, activated_at, updated_at
  ) values (
    target, 'production-odds-publication-v1', 'SUPABASE', 'PUBLISHED',
    'CURRENT', created_snapshot.id, next_revision, source_revision_value,
    created_snapshot.published_at, actor_player, actor_auth_user,
    expected_authority_epoch, binding, binding_fingerprint, null,
    actor_player, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ) on conflict (tournament_id) do update set
    publication_state = excluded.publication_state,
    freshness = excluded.freshness,
    current_snapshot_id = excluded.current_snapshot_id,
    publication_revision = excluded.publication_revision,
    source_calculation_revision = excluded.source_calculation_revision,
    published_at = excluded.published_at,
    published_by_player_id = excluded.published_by_player_id,
    published_by_auth_user_id = excluded.published_by_auth_user_id,
    authority_epoch_id = excluded.authority_epoch_id,
    resource_binding = excluded.resource_binding,
    resource_binding_fingerprint = excluded.resource_binding_fingerprint,
    adoption_kind = null, activated_by = excluded.activated_by,
    activated_at = coalesce(
      scoring_authority.odds_publication_current.activated_at,
      excluded.activated_at
    ), updated_at = excluded.updated_at;
  update scoring_authority.odds_calculation_jobs set
    publication_status = 'PUBLISHED',
    publication_reference = pg_catalog.jsonb_build_object(
      'contract_version', 'production-odds-publication-v1',
      'snapshot_id', created_snapshot.id,
      'publication_revision', next_revision,
      'expected_predecessor_revision', expected_revision,
      'expected_predecessor_snapshot_id', expected_snapshot,
      'request_fingerprint', request_fingerprint_value,
      'runtime_generation_id', generation.runtime_generation_id
    ), updated_at = pg_catalog.clock_timestamp()
  where job_id = job.job_id;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_ODDS_PUBLISHED',
    'idempotent', false, 'publication_authority', 'SUPABASE',
    'publication_contract_version', 'production-odds-publication-v1',
    'snapshot_id', created_snapshot.id,
    'publication_revision', next_revision,
    'publication_state', 'PUBLISHED', 'freshness', 'CURRENT',
    'published_at', created_snapshot.published_at,
    'published_payload', created_snapshot.published_payload,
    'runtime_generation_id', generation.runtime_generation_id,
    'mirror_created', false, 'google_writes', 0
  );
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'CHAMPIONSHIP_ODDS_PUBLISHED_SUPABASE', actor_player,
    response_value - 'ok' - 'idempotent' - 'published_payload'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CHAMPIONSHIP_ODDS_PUBLISHED',
    'CHAMPIONSHIP_ODDS_PUBLICATION', target, actor_player,
    request_fingerprint_value, 'SUCCEEDED',
    response_value - 'ok' - 'idempotent' - 'published_payload'
  );
  return response_value;
end;
$publish_annual_odds$;

revoke all on function production_control.publish_annual_odds_v1(jsonb, text)
  from public, anon, authenticated, service_role;

create function public.dispatch_production_annual_odds_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_odds_public_dispatch$
declare result_value jsonb;
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_annual_odds_runtime_v1(
    input, input->>'annual_odds_operation'
  );
  result_value := public.future_production_dispatch_odds_v1(input);
  return result_value;
end;
$annual_odds_public_dispatch$;

revoke all on function public.dispatch_production_annual_odds_v1(jsonb)
  from public, anon, authenticated, service_role;

-- This two-argument reader is the existing website/PWA/mobile contract. Its
-- arguments are treated only as exact-resource assertions. The selected
-- tournament and runtime generation are always read from the pointer while the
-- common transition lock is held; no participant client can choose a year.
alter function public.read_published_odds_view(text, text)
  rename to read_published_odds_view_frozen_2026_v1;

create function public.read_published_odds_view(
  target_tournament_id text default null,
  target_source_workbook_id text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $annual_published_odds_read$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  input jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id = '2026' then
    if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> '2026'
       or pg_catalog.btrim(coalesce(target_source_workbook_id, '')) <>
         '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED'
      );
    end if;
    return public.read_published_odds_view_frozen_2026_v1(
      target_tournament_id, target_source_workbook_id
    );
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual_resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = pointer.tournament_id;
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <>
       pointer.tournament_id
     or pg_catalog.btrim(coalesce(target_source_workbook_id, '')) not in (
       annual_resource.source_workbook_id,
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED'
    );
  end if;
  input := pg_catalog.jsonb_build_object(
    'target_tournament_id', pointer.tournament_id,
    'expected_current_tournament_id', pointer.tournament_id,
    'expected_pointer_revision', pointer.pointer_revision,
    'expected_runtime_generation_id', generation.runtime_generation_id,
    'expected_annual_authority_generation_id',
      generation.authority_generation_id,
    'expected_annual_admission_generation_id',
      generation.admission_generation_id
  );
  perform production_control.assert_annual_current_read_v1(input);
  return production_control.annual_odds_publication_projection_v1(
    pointer.tournament_id
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED'
    );
end;
$annual_published_odds_read$;

revoke all on function
  public.read_published_odds_view_frozen_2026_v1(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.read_published_odds_view(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_published_odds_view(text, text)
  to service_role;

-- A certified future Prediction Settings projection must become the exact
-- tournament-scoped Odds input revision consumed by the annual dispatcher.
-- Keep Google as an explicit authoring source only: the synchronized Supabase
-- configuration is canonical and no published snapshot is copied or created.
create function production_control.annual_odds_pairing_fingerprint_v1(
  target_tournament_id text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_odds_pairing_fingerprint$
declare
  target text := pg_catalog.btrim(coalesce(target_tournament_id, ''));
  catalog production_control.future_tournament_catalog_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  manifest jsonb;
begin
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target;
  select value.* into promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target;
  manifest := pg_catalog.jsonb_build_object(
    'contractVersion', 'production-annual-odds-pairing-context-v1',
    'tournamentId', target,
    'setupRevision', catalog.setup_revision,
    'promotionRevision', coalesce(promotion.promotion_revision, 0),
    'promotionFingerprint', coalesce(
      promotion.promoted_manifest_fingerprint, ''
    ),
    'matches', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'matchId', match_value.match_id,
        'roundNumber', match_value.round_number,
        'format', match_value.format,
        'status', match_value.status,
        'snapshotId', match_value.scoring_snapshot_id,
        'snapshotHash', coalesce(snapshot.canonical_hash, ''),
        'preparedSetupRevision', detail.prepared_setup_revision,
        'configurationFingerprint', coalesce(
          detail.prepared_configuration_fingerprint, ''
        ),
        'participants', coalesce((select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'playerId', participant.player_id,
            'teamId', roster.team_id,
            'teamSide', participant.team_side,
            'playerSlot', participant.player_slot,
            'handicapRevisionId', participant.handicap_revision_id
          ) order by participant.team_side, participant.player_slot)
          from scoring_authority.match_participants participant
          left join scoring_authority.tournament_players roster
            on roster.tournament_id = target
           and roster.player_id = participant.player_id
          where participant.match_id = match_value.match_id), '[]'::jsonb)
      ) order by match_value.round_number, match_value.match_id)
      from scoring_authority.matches match_value
      left join scoring_authority.tournament_setup_match_details_v1 detail
        on detail.match_id = match_value.match_id
      left join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
      where match_value.tournament_id = target), '[]'::jsonb)
  );
  return production_control.future_runtime_hash_v2(manifest);
exception when no_data_found then
  raise exception using errcode = '55000',
    message = 'PRODUCTION_ANNUAL_ODDS_PAIRING_CONTEXT_REQUIRED';
end;
$annual_odds_pairing_fingerprint$;

revoke all on function
  production_control.annual_odds_pairing_fingerprint_v1(text)
  from public, anon, authenticated, service_role;

alter function production_control.current_annual_odds_inputs_v1(
  text, text, jsonb, boolean
) rename to current_annual_odds_inputs_before_pairing_context_v1;

create function production_control.current_annual_odds_inputs_v1(
  target text,
  destination_workbook text,
  input jsonb,
  require_exact_revision boolean default true
)
returns scoring_authority.odds_input_configurations
language plpgsql
security definer
stable
set search_path = pg_catalog
as $annual_odds_current_pairing_context$
declare
  config scoring_authority.odds_input_configurations%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
begin
  config := production_control
    .current_annual_odds_inputs_before_pairing_context_v1(
      target, destination_workbook, input, require_exact_revision
    );
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target;
  if config.pairing_fingerprint is distinct from production_control
       .annual_odds_pairing_fingerprint_v1(target)
     or coalesce((config.validation_diagnostics->>
       'annualSetupRevision')::bigint, -1) <> catalog.setup_revision then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_PREDICTION_SETTINGS_NOT_CURRENT';
  end if;
  return config;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_PREDICTION_SETTINGS_NOT_CURRENT';
end;
$annual_odds_current_pairing_context$;

revoke all on function production_control.current_annual_odds_inputs_v1(
  text, text, jsonb, boolean
) from public, anon, authenticated, service_role;
revoke all on function production_control
  .current_annual_odds_inputs_before_pairing_context_v1(
    text, text, jsonb, boolean
  ) from public, anon, authenticated, service_role;

create function production_control.materialize_future_annual_odds_inputs_v1(
  input jsonb,
  synchronization_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $materialize_future_annual_odds_inputs$
declare
  target text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  binding production_control.future_annual_projection_bindings_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  current_config scoring_authority.odds_input_configurations%rowtype;
  ratings_seed scoring_authority.odds_input_configurations%rowtype;
  projection jsonb;
  pairing_fingerprint_value text;
  next_revision bigint;
  next_bundle text;
  next_id uuid;
  diagnostics jsonb;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'domain', ''))) <>
       'PREDICTION_SETTINGS' then
    return synchronization_response;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'future-annual-odds-inputs:' || target, 0
    )
  );
  select value.* into strict binding
  from production_control.future_annual_projection_bindings_v1 value
  where value.tournament_id = target
    and value.domain = 'PREDICTION_SETTINGS'
    and value.certification_status = 'CERTIFIED' for update;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target for update;
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into current_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current for update;
  if current_config.id is not null then
    ratings_seed := current_config;
  else
    select value.* into strict ratings_seed
    from scoring_authority.odds_input_configurations value
    where value.tournament_id = pointer.tournament_id
      and value.is_current
      and value.validation_status = 'VALID';
  end if;
  projection := binding.projection;
  pairing_fingerprint_value := production_control
    .annual_odds_pairing_fingerprint_v1(target);
  if target = pointer.tournament_id
     or catalog.tournament_year <= 2026
     or catalog.lifecycle not in (
       'DRAFT', 'CONFIGURING', 'READY_FOR_ACTIVATION'
     )
     or binding.source_workbook_id is distinct from
       resource.source_workbook_id
     or input->>'source_fingerprint' is distinct from
       binding.source_fingerprint
     or input->>'payload_fingerprint' is distinct from
       binding.payload_fingerprint
     or pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'validation_status', ''
     ))) <> 'VALID'
     or pg_catalog.jsonb_typeof(projection->'settings') <> 'array'
     or pg_catalog.jsonb_array_length(projection->'settings') <> 30
     or pg_catalog.jsonb_typeof(projection->'canonical_settings') <>
       'object'
     or pg_catalog.jsonb_typeof(projection->'effective_settings') <>
       'object'
     or scoring_authority.jsonb_object_length(
       projection->'canonical_settings'
     ) <> 30
     or scoring_authority.jsonb_object_length(
       projection->'effective_settings'
     ) <> 30
     or pg_catalog.lower(pg_catalog.btrim(coalesce(
       projection->>'settings_fingerprint', ''
     ))) !~ '^[0-9a-f]{64}$'
     or pg_catalog.lower(pg_catalog.btrim(coalesce(
       projection->>'effective_settings_fingerprint', ''
     ))) !~ '^[0-9a-f]{64}$'
     or projection->>'settings_contract_version' is distinct from
       'prediction-settings-v1'
     or projection->>'source_tab' is distinct from 'Prediction Settings'
     or pg_catalog.jsonb_typeof(ratings_seed.historical_ratings) <>
       'object'
     or coalesce(ratings_seed.ratings_fingerprint, '') !~
       '^[0-9a-f]{64}$' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_PREDICTION_SETTINGS_INVALID';
  end if;

  -- An exact synchronization retry is a true no-op only when both the Google
  -- projection and the target setup/pairing context still match.
  if current_config.id is not null
     and current_config.source_fingerprint = binding.source_fingerprint
     and current_config.settings_fingerprint =
       pg_catalog.lower(projection->>'settings_fingerprint')
     and current_config.effective_settings_fingerprint =
       pg_catalog.lower(projection->>'effective_settings_fingerprint')
     and current_config.pairing_fingerprint = pairing_fingerprint_value
     and coalesce((current_config.validation_diagnostics->>
       'annualSetupRevision')::bigint, -1) = catalog.setup_revision then
    return synchronization_response || pg_catalog.jsonb_build_object(
      'configuration_id', current_config.id,
      'configuration_revision', current_config.configuration_revision,
      'bundle_fingerprint', current_config.bundle_fingerprint,
      'oddsInputsChanged', false,
      'idempotent', true
    );
  end if;

  select coalesce(pg_catalog.max(value.configuration_revision), 0) + 1
    into next_revision
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target;
  diagnostics := coalesce(input->'validation_diagnostics', '{}'::jsonb) ||
    pg_catalog.jsonb_build_object(
      'annualProjectionContract',
        'production-future-annual-projection-binding-v1',
      'annualProjectionBindingRevision', binding.binding_revision,
      'annualSetupRevision', catalog.setup_revision,
      'annualPairingFingerprintContract',
        'production-annual-odds-pairing-context-v1',
      'historicalRatingsSourceTournamentId', ratings_seed.tournament_id,
      'historicalRatingsSourceConfigurationId', ratings_seed.id,
      'historicalRatingsCarryForwardReviewed', true
    );
  next_bundle := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-odds-input-bundle-v1',
      'tournamentId', target,
      'sourceFingerprint', binding.source_fingerprint,
      'settingsFingerprint',
        pg_catalog.lower(projection->>'settings_fingerprint'),
      'effectiveSettingsFingerprint',
        pg_catalog.lower(projection->>'effective_settings_fingerprint'),
      'ratingsFingerprint', ratings_seed.ratings_fingerprint,
      'pairingFingerprint', pairing_fingerprint_value,
      'configurationRevision', next_revision,
      'priorTargetConfigurationId', current_config.id
    )
  );
  update scoring_authority.odds_input_configurations set
    is_current = false,
    superseded_at = pg_catalog.clock_timestamp()
  where tournament_id = target and is_current;
  insert into scoring_authority.odds_input_configurations (
    tournament_id, configuration_revision, source_workbook_id,
    settings, historical_ratings, settings_fingerprint,
    ratings_fingerprint, pairing_fingerprint, bundle_fingerprint,
    is_current, imported_by, source_tab, source_fingerprint,
    canonical_settings, effective_settings,
    effective_settings_fingerprint, settings_contract_version,
    validation_status, validation_diagnostics, synchronized_at,
    previous_configuration_id
  ) values (
    target, next_revision, resource.source_workbook_id,
    projection->'settings', ratings_seed.historical_ratings,
    pg_catalog.lower(projection->>'settings_fingerprint'),
    ratings_seed.ratings_fingerprint, pairing_fingerprint_value,
    next_bundle, true, coalesce(nullif(pg_catalog.btrim(
      input->>'requested_by'
    ), ''), 'Production Director ' || actor_player),
    'Prediction Settings', binding.source_fingerprint,
    projection->'canonical_settings', projection->'effective_settings',
    pg_catalog.lower(projection->>'effective_settings_fingerprint'),
    'prediction-settings-v1', 'VALID', diagnostics,
    pg_catalog.clock_timestamp(), current_config.id
  ) returning id into next_id;
  insert into scoring_authority.odds_input_import_runs (
    tournament_id, bundle_fingerprint, status, requested_by
  ) values (
    target, next_bundle, 'APPLIED',
    coalesce(nullif(pg_catalog.btrim(input->>'requested_by'), ''),
      'Production Director ' || actor_player)
  );
  return synchronization_response || pg_catalog.jsonb_build_object(
    'changed', true,
    'configuration_id', next_id,
    'configuration_revision', next_revision,
    'bundle_fingerprint', next_bundle,
    'pairing_fingerprint', pairing_fingerprint_value,
    'oddsInputsChanged', true,
    'idempotent', false
  );
exception
  when no_data_found or unique_violation
    or invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_PREDICTION_SETTINGS_INVALID';
end;
$materialize_future_annual_odds_inputs$;

revoke all on function
  production_control.materialize_future_annual_odds_inputs_v1(jsonb, jsonb)
  from public, anon, authenticated, service_role;

alter function public.synchronize_production_future_annual_projection_v1(
  jsonb
) rename to synchronize_production_future_annual_projection_before_odds_v1;
revoke all on function
  public.synchronize_production_future_annual_projection_before_odds_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.synchronize_production_future_annual_projection_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $synchronize_future_annual_projection_with_odds$
declare response_value jsonb;
begin
  response_value := public
    .synchronize_production_future_annual_projection_before_odds_v1(input);
  return production_control.materialize_future_annual_odds_inputs_v1(
    input, response_value
  );
end;
$synchronize_future_annual_projection_with_odds$;

revoke all on function
  public.synchronize_production_future_annual_projection_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.synchronize_production_future_annual_projection_v1(jsonb)
  to service_role;

-- Annual activation must certify that the materialized Odds configuration is
-- still bound to the exact current setup/pairing manifest. A structural setup
-- change therefore requires the explicit Prediction Settings sync again.
alter function production_control.future_runtime_readiness_v2(text)
  rename to future_runtime_readiness_before_annual_odds_v1;

create function production_control.future_runtime_readiness_v2(
  target_tournament text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $future_runtime_annual_odds_readiness$
declare
  base jsonb;
  blockers jsonb;
  counts jsonb;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
  pairing_fingerprint_value text;
  current_value boolean := false;
begin
  base := production_control
    .future_runtime_readiness_before_annual_odds_v1(target_tournament);
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pg_catalog.btrim(target_tournament);
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = catalog.tournament_id;
  select value.* into config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = catalog.tournament_id and value.is_current;
  pairing_fingerprint_value := production_control
    .annual_odds_pairing_fingerprint_v1(catalog.tournament_id);
  current_value := config.id is not null
    and config.validation_status = 'VALID'
    and config.source_workbook_id = resource.source_workbook_id
    and config.settings_contract_version = 'prediction-settings-v1'
    and config.pairing_fingerprint = pairing_fingerprint_value
    and coalesce((config.validation_diagnostics->>
      'annualSetupRevision')::bigint, -1) = catalog.setup_revision;
  blockers := coalesce(base->'blockers', '[]'::jsonb);
  if not current_value then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_ANNUAL_ODDS_INPUTS_NOT_CURRENT',
        'section', 'Odds',
        'message', 'Synchronize Prediction Settings after the current tournament setup is complete.'
      )
    );
  end if;
  counts := coalesce(base->'counts', '{}'::jsonb) ||
    pg_catalog.jsonb_build_object(
      'annualOddsInputsCurrent', case when current_value then 1 else 0 end,
      'annualOddsInputConfigurationRevision',
        coalesce(config.configuration_revision, 0)
    );
  base := base || pg_catalog.jsonb_build_object(
    'ready', pg_catalog.jsonb_array_length(blockers) = 0,
    'blockerCount', pg_catalog.jsonb_array_length(blockers),
    'blockers', blockers,
    'counts', counts
  );
  return base || pg_catalog.jsonb_build_object(
    'fingerprint', production_control.future_runtime_hash_v2(
      base - 'fingerprint'
    )
  );
end;
$future_runtime_annual_odds_readiness$;

revoke all on function
  production_control.future_runtime_readiness_v2(text)
  from public, anon, authenticated, service_role;
revoke all on function production_control
  .future_runtime_readiness_before_annual_odds_v1(text)
  from public, anon, authenticated, service_role;

-- Assert that wrapping did not alter any frozen implementation body. The
-- original function name is deliberately excluded from the stored hash by
-- hashing pg_proc.prosrc rather than pg_get_functiondef.
do $verify_2026_bodies$
declare
  original_signature text;
  installed_signature text;
  expected_hash text;
  actual_hash text;
begin
  for original_signature, installed_signature in
    select * from (values
      ('production_control.assert_production_odds_calculation_scope(jsonb,boolean)',
       'production_control.assert_production_odds_calculation_scope_frozen_2026_v1(jsonb,boolean)'),
      ('public.read_production_odds_publication_v1(jsonb)',
       'public.read_production_odds_publication_frozen_2026_v1(jsonb)'),
      ('public.read_published_odds_view(text,text)',
       'public.read_published_odds_view_frozen_2026_v1(text,text)'),
      ('public.read_production_odds_calculation_inputs(jsonb)',
       'public.read_production_odds_calculation_inputs(jsonb)'),
      ('public.request_production_odds_calculation_job(jsonb)',
       'public.request_production_odds_calculation_job(jsonb)'),
      ('public.claim_production_odds_calculation_job(jsonb)',
       'public.claim_production_odds_calculation_job(jsonb)'),
      ('public.checkpoint_production_odds_calculation_job(jsonb)',
       'public.checkpoint_production_odds_calculation_job(jsonb)'),
      ('public.complete_production_odds_calculation_job(jsonb)',
       'public.complete_production_odds_calculation_job(jsonb)'),
      ('public.fail_production_odds_calculation_job(jsonb)',
       'public.fail_production_odds_calculation_job(jsonb)'),
      ('public.supersede_production_odds_calculation_job(jsonb)',
       'public.supersede_production_odds_calculation_job(jsonb)'),
      ('public.read_production_odds_calculation_jobs(jsonb)',
       'public.read_production_odds_calculation_jobs(jsonb)'),
      ('public.publish_production_championship_odds_v1(jsonb)',
       'public.publish_production_championship_odds_v1(jsonb)')
    ) mapping(original_signature, installed_signature)
  loop
    select value.function_definition_hash into strict expected_hash
    from production_control.annual_odds_2026_body_certifications_v1 value
    where value.function_identity = original_signature;
    select pg_catalog.encode(extensions.digest(value.prosrc, 'sha256'), 'hex')
      into strict actual_hash
    from pg_catalog.pg_proc value
    where value.oid = installed_signature::regprocedure;
    if actual_hash is distinct from expected_hash then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ODDS_2026_BODY_EQUIVALENCE_FAILED';
    end if;
  end loop;
end;
$verify_2026_bodies$;

comment on function public.dispatch_production_annual_odds_v1(jsonb) is
  'Service-only annual Odds dispatcher. Target and generation are selected by the current Production pointer and revalidated under the annual scoring lock.';
comment on function public.read_published_odds_view(text, text) is
  'Pointer-selected participant-safe Odds publication read. Arguments are exact-resource assertions only; no Google fallback exists.';

notify pgrst, 'reload schema';
commit;
