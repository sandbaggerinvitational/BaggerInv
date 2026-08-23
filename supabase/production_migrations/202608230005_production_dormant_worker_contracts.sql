-- Step 10A dormant Production worker contracts.
--
-- These contracts describe the final job/worker topology without activating it.
-- They install no scheduler, make no network request, publish nothing, and grant
-- no mutation capability. A later, separately reviewed authority migration is
-- required before any worker can execute.
begin;

insert into production_control.worker_controls (worker_name)
values
  ('NET_SKINS_SYNCHRONIZATION'),
  ('CALCUTTA_SYNCHRONIZATION'),
  ('SCORING_AUTHORITY_TRANSITION')
on conflict (worker_name) do nothing;

create table production_control.worker_contracts (
  worker_name text primary key
    references production_control.worker_controls(worker_name) on delete restrict,
  scope_key text not null default 'BAGGER_INV_PRODUCTION'
    references production_control.resource_scope(scope_key) on delete restrict,
  contract_version text not null default 'production-dormant-worker-v1',
  domain text not null check (domain in (
    'CHAMPIONSHIP_ODDS_CALCULATION',
    'PUBLISHED_ODDS_GOOGLE_MIRROR',
    'SCORING_GOOGLE_MIRROR',
    'ROUND_SCORECARDS_ARCHIVE',
    'GUIDE_PROJECTION',
    'PREDICTION_SETTINGS_PROJECTION',
    'DRAFT_PROJECTION',
    'NET_SKINS_CONFIGURATION',
    'CALCUTTA_CONFIGURATION',
    'NET_SKINS_DERIVED',
    'CALCUTTA_DERIVED',
    'COMPETITION_DERIVED',
    'SCORING_AUTHORITY'
  )),
  operation_kind text not null check (operation_kind in (
    'DURABLE_CALCULATION',
    'GOOGLE_MIRROR',
    'GOOGLE_ARCHIVE',
    'GOOGLE_TO_SUPABASE_SYNCHRONIZATION',
    'DERIVED_RECALCULATION',
    'AUTHORITY_TRANSITION'
  )),
  lifecycle_table text not null,
  checkpoint_table text,
  lifecycle_states jsonb not null check (jsonb_typeof(lifecycle_states) = 'array'),
  allowed_actions jsonb not null check (jsonb_typeof(allowed_actions) = 'array'),
  checkpoint_contract jsonb not null default '{}'::jsonb
    check (jsonb_typeof(checkpoint_contract) = 'object'),
  requires_google_read boolean not null default false,
  requires_google_write boolean not null default false,
  requires_odds_publication boolean not null default false,
  operation_allowed boolean not null default false check (not operation_allowed),
  scheduler_installed boolean not null default false check (not scheduler_installed),
  authoritative_write_allowed boolean not null default false check (not authoritative_write_allowed),
  created_at timestamptz not null default now()
);

insert into production_control.worker_contracts (
  worker_name, domain, operation_kind, lifecycle_table, checkpoint_table,
  lifecycle_states, allowed_actions, checkpoint_contract,
  requires_google_read, requires_google_write, requires_odds_publication
)
values
  (
    'ODDS_CALCULATION', 'CHAMPIONSHIP_ODDS_CALCULATION', 'DURABLE_CALCULATION',
    'scoring_authority.odds_calculation_jobs',
    'scoring_authority.odds_calculation_checkpoints',
    '["PENDING","RUNNING","SUCCEEDED","FAILED","RETRYABLE","SUPERSEDED"]'::jsonb,
    '["REQUEST_CALCULATION","CLAIM_JOB","WRITE_CHECKPOINT","COMPLETE_JOB","FAIL_JOB","SUPERSEDE_JOB"]'::jsonb,
    '{"version":"odds-calculation-checkpoint-v1","random_stream":"SEQUENTIAL_PRNG_STATE","frozen_input":true,"publication_separate":true}'::jsonb,
    false, false, false
  ),
  (
    'ODDS_GOOGLE_MIRROR', 'PUBLISHED_ODDS_GOOGLE_MIRROR', 'GOOGLE_MIRROR',
    'scoring_authority.odds_google_mirror_jobs',
    'scoring_authority.odds_published_snapshots',
    '["PENDING","RUNNING","SUCCEEDED","FAILED","SUPERSEDED"]'::jsonb,
    '["CLAIM_MIRROR","COMPLETE_MIRROR","FAIL_MIRROR"]'::jsonb,
    '{"publication_only":true,"idempotent_snapshot_identity":true,"readback_required":true}'::jsonb,
    false, true, true
  ),
  (
    'SCORING_GOOGLE_OUTBOX', 'SCORING_GOOGLE_MIRROR', 'GOOGLE_MIRROR',
    'scoring_authority.google_outbox_events',
    'scoring_authority.google_match_checkpoints',
    '["PENDING","PROCESSING","DELIVERED","RETRYABLE","BLOCKED"]'::jsonb,
    '["CLAIM_OUTBOX","DELIVER_OUTBOX","VERIFY_READBACK","RETRY_OUTBOX"]'::jsonb,
    '{"match_revision_ordered":true,"idempotent_mutation_key":true,"readback_required":true}'::jsonb,
    false, true, false
  ),
  (
    'ROUND_SCORECARDS_ARCHIVE', 'ROUND_SCORECARDS_ARCHIVE', 'GOOGLE_ARCHIVE',
    'scoring_authority.scorecard_archive_jobs',
    'scoring_authority.scorecard_archive_checkpoints',
    '["PENDING","PROCESSING","VERIFIED","RETRYABLE","BLOCKED","SUPERSEDED"]'::jsonb,
    '["CLAIM_ARCHIVE","WRITE_ARCHIVE","VERIFY_ARCHIVE","INVALIDATE_ARCHIVE","RETRY_ARCHIVE"]'::jsonb,
    '{"snapshot_revision_ordered":true,"archive_hash_required":true,"readback_required":true}'::jsonb,
    false, true, false
  ),
  (
    'GUIDE_SYNCHRONIZATION', 'GUIDE_PROJECTION', 'GOOGLE_TO_SUPABASE_SYNCHRONIZATION',
    'scoring_authority.guide_sync_runs',
    'scoring_authority.guide_sync_controls',
    '["CLAIMED","SUCCEEDED","NOOP","FAILED","REJECTED","STALE"]'::jsonb,
    '["REQUEST_SYNC","CLAIM_SYNC","COMPLETE_SYNC","FAIL_SYNC"]'::jsonb,
    '{"source_fingerprint_required":true,"immutable_revision":true,"readback_required":true}'::jsonb,
    true, false, false
  ),
  (
    'PREDICTION_SETTINGS_SYNCHRONIZATION', 'PREDICTION_SETTINGS_PROJECTION', 'GOOGLE_TO_SUPABASE_SYNCHRONIZATION',
    'scoring_authority.odds_input_import_runs',
    'scoring_authority.odds_input_configurations',
    '["APPLIED","NO_CHANGE","REJECTED"]'::jsonb,
    '["REQUEST_SYNC","VALIDATE_SETTINGS","COMMIT_REVISION","VERIFY_REVISION"]'::jsonb,
    '{"contract":"prediction-settings-v1","source_and_effective_fingerprints":true,"immutable_revision":true}'::jsonb,
    true, false, false
  ),
  (
    'DRAFT_SYNCHRONIZATION', 'DRAFT_PROJECTION', 'GOOGLE_TO_SUPABASE_SYNCHRONIZATION',
    'scoring_authority.draft_revisions',
    'scoring_authority.draft_current_revisions',
    '["VALID"]'::jsonb,
    '["REQUEST_SYNC","VALIDATE_DRAFT","COMMIT_REVISION","VERIFY_REVISION"]'::jsonb,
    '{"source_fingerprint_required":true,"stable_player_ids":true,"immutable_revision":true}'::jsonb,
    true, false, false
  ),
  (
    'NET_SKINS_SYNCHRONIZATION', 'NET_SKINS_CONFIGURATION', 'GOOGLE_TO_SUPABASE_SYNCHRONIZATION',
    'scoring_authority.net_skins_configuration_import_runs',
    'scoring_authority.net_skins_configurations',
    '["APPLIED","NO_CHANGE","REJECTED"]'::jsonb,
    '["REQUEST_SYNC","VALIDATE_CONFIGURATION","COMMIT_REVISION","VERIFY_REVISION"]'::jsonb,
    '{"source_fingerprint_required":true,"production_configuration_only":true,"immutable_revision":true}'::jsonb,
    true, false, false
  ),
  (
    'CALCUTTA_SYNCHRONIZATION', 'CALCUTTA_CONFIGURATION', 'GOOGLE_TO_SUPABASE_SYNCHRONIZATION',
    'scoring_authority.calcutta_configuration_import_runs',
    'scoring_authority.calcutta_configurations',
    '["APPLIED","NO_CHANGE","REJECTED"]'::jsonb,
    '["REQUEST_SYNC","VALIDATE_CONFIGURATION","COMMIT_REVISION","VERIFY_REVISION"]'::jsonb,
    '{"source_fingerprint_required":true,"production_financial_values_only":true,"immutable_revision":true}'::jsonb,
    true, false, false
  ),
  (
    'NET_SKINS_RECALCULATION', 'NET_SKINS_DERIVED', 'DERIVED_RECALCULATION',
    'scoring_authority.competition_recalculation_jobs',
    'scoring_authority.competition_derived_runs',
    '["PENDING","RUNNING","SUCCEEDED","FAILED"]'::jsonb,
    '["REQUEST_RECALCULATION","CLAIM_RECALCULATION","COMPLETE_RECALCULATION","FAIL_RECALCULATION"]'::jsonb,
    '{"engine_key":"NET_SKINS","canonical_scoring_revision_required":true}'::jsonb,
    false, false, false
  ),
  (
    'CALCUTTA_RECALCULATION', 'CALCUTTA_DERIVED', 'DERIVED_RECALCULATION',
    'scoring_authority.competition_recalculation_jobs',
    'scoring_authority.competition_derived_runs',
    '["PENDING","RUNNING","SUCCEEDED","FAILED"]'::jsonb,
    '["REQUEST_RECALCULATION","CLAIM_RECALCULATION","COMPLETE_RECALCULATION","FAIL_RECALCULATION"]'::jsonb,
    '{"engine_key":"CALCUTTA","canonical_scoring_revision_required":true}'::jsonb,
    false, false, false
  ),
  (
    'COMPETITION_DERIVED', 'COMPETITION_DERIVED', 'DERIVED_RECALCULATION',
    'scoring_authority.competition_recalculation_jobs',
    'scoring_authority.competition_derived_runs',
    '["PENDING","RUNNING","SUCCEEDED","FAILED"]'::jsonb,
    '["REQUEST_RECALCULATION","CLAIM_RECALCULATION","COMPLETE_RECALCULATION","FAIL_RECALCULATION"]'::jsonb,
    '{"canonical_scoring_revision_required":true,"partial_results_public":false}'::jsonb,
    false, false, false
  ),
  (
    'SCORING_AUTHORITY_TRANSITION', 'SCORING_AUTHORITY', 'AUTHORITY_TRANSITION',
    'scoring_authority.authority_epochs',
    'scoring_authority.ingress_gates',
    '["PREPARED","COMMITTED","BLOCKED","ABORTED"]'::jsonb,
    '["PREPARE_EPOCH","VERIFY_RECONCILIATION","COMMIT_EPOCH","ABORT_EPOCH"]'::jsonb,
    '{"ingress_closed_before_commit":true,"unresolved_client_queues_zero":true,"reconciliation_fingerprint_required":true}'::jsonb,
    false, false, false
  );

alter table production_control.worker_contracts enable row level security;

create or replace function production_control.assert_exact_worker_resource_scope(
  requested_worker_name text,
  requested_project_ref text,
  requested_project_url text,
  requested_google_workbook_id text,
  requested_vercel_project text,
  requested_canonical_domain text,
  requested_tournament_id text,
  requested_tournament_year integer
)
returns void
language plpgsql
security definer
set search_path to pg_catalog, production_control
as $$
declare
  scope_row production_control.resource_scope%rowtype;
begin
  select * into strict scope_row
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';

  if scope_row.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or scope_row.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or scope_row.google_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or scope_row.vercel_project <> 'bagger-inv'
     or scope_row.canonical_domain <> 'https://baggerinv.com'
     or scope_row.current_tournament_id <> '2026'
     or scope_row.current_tournament_year <> 2026 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_RESOURCE_SCOPE_INVALID';
  end if;

  if requested_project_ref is distinct from scope_row.project_ref
     or requested_project_url is distinct from scope_row.project_url
     or requested_google_workbook_id is distinct from scope_row.google_workbook_id
     or requested_vercel_project is distinct from scope_row.vercel_project
     or requested_canonical_domain is distinct from scope_row.canonical_domain
     or requested_tournament_id is distinct from scope_row.current_tournament_id
     or requested_tournament_year is distinct from scope_row.current_tournament_year then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_RESOURCE_ASSERTION_FAILED';
  end if;

  if not exists (
    select 1
    from production_control.tournament_scopes t
    where t.tournament_id = requested_tournament_id
      and t.tournament_year = requested_tournament_year
      and t.source_workbook_id = requested_google_workbook_id
      and t.scope_kind = 'CURRENT_TOURNAMENT'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_TOURNAMENT_SCOPE_INVALID';
  end if;

  if not exists (
    select 1
    from production_control.worker_contracts c
    join production_control.worker_controls w using (worker_name)
    where c.worker_name = requested_worker_name
      and c.scope_key = 'BAGGER_INV_PRODUCTION'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_WORKER_CONTRACT_UNKNOWN';
  end if;
end;
$$;

create or replace function production_control.read_dormant_worker_status(
  requested_worker_name text,
  requested_project_ref text,
  requested_project_url text,
  requested_google_workbook_id text,
  requested_vercel_project text,
  requested_canonical_domain text,
  requested_tournament_id text,
  requested_tournament_year integer
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, production_control, scoring_authority
as $$
declare
  scope_row production_control.resource_scope%rowtype;
  control_row production_control.worker_controls%rowtype;
  contract_row production_control.worker_contracts%rowtype;
  lifecycle_count bigint := 0;
  checkpoint_count bigint := 0;
begin
  perform production_control.assert_exact_worker_resource_scope(
    requested_worker_name,
    requested_project_ref,
    requested_project_url,
    requested_google_workbook_id,
    requested_vercel_project,
    requested_canonical_domain,
    requested_tournament_id,
    requested_tournament_year
  );

  select * into strict scope_row
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';

  select * into strict control_row
  from production_control.worker_controls
  where worker_name = requested_worker_name;

  select * into strict contract_row
  from production_control.worker_contracts
  where worker_name = requested_worker_name;

  case requested_worker_name
    when 'ODDS_CALCULATION' then
      select count(*) into lifecycle_count from scoring_authority.odds_calculation_jobs;
      select count(*) into checkpoint_count from scoring_authority.odds_calculation_checkpoints;
    when 'ODDS_GOOGLE_MIRROR' then
      select count(*) into lifecycle_count from scoring_authority.odds_google_mirror_jobs;
      select count(*) into checkpoint_count from scoring_authority.odds_published_snapshots;
    when 'SCORING_GOOGLE_OUTBOX' then
      select count(*) into lifecycle_count from scoring_authority.google_outbox_events;
      select count(*) into checkpoint_count from scoring_authority.google_match_checkpoints;
    when 'ROUND_SCORECARDS_ARCHIVE' then
      select count(*) into lifecycle_count from scoring_authority.scorecard_archive_jobs;
      select count(*) into checkpoint_count from scoring_authority.scorecard_archive_checkpoints;
    when 'GUIDE_SYNCHRONIZATION' then
      select count(*) into lifecycle_count from scoring_authority.guide_sync_runs;
      select count(*) into checkpoint_count from scoring_authority.guide_sync_controls;
    when 'PREDICTION_SETTINGS_SYNCHRONIZATION' then
      select count(*) into lifecycle_count from scoring_authority.odds_input_import_runs;
      select count(*) into checkpoint_count from scoring_authority.odds_input_configurations;
    when 'DRAFT_SYNCHRONIZATION' then
      select count(*) into lifecycle_count from scoring_authority.draft_revisions;
      select count(*) into checkpoint_count from scoring_authority.draft_current_revisions;
    when 'NET_SKINS_SYNCHRONIZATION' then
      select count(*) into lifecycle_count from scoring_authority.net_skins_configuration_import_runs;
      select count(*) into checkpoint_count from scoring_authority.net_skins_configurations;
    when 'CALCUTTA_SYNCHRONIZATION' then
      select count(*) into lifecycle_count from scoring_authority.calcutta_configuration_import_runs;
      select count(*) into checkpoint_count from scoring_authority.calcutta_configurations;
    when 'NET_SKINS_RECALCULATION' then
      select count(*) into lifecycle_count from scoring_authority.competition_recalculation_jobs where engine_key = 'NET_SKINS';
      select count(*) into checkpoint_count from scoring_authority.competition_derived_runs where engine_key = 'NET_SKINS';
    when 'CALCUTTA_RECALCULATION' then
      select count(*) into lifecycle_count from scoring_authority.competition_recalculation_jobs where engine_key = 'CALCUTTA';
      select count(*) into checkpoint_count from scoring_authority.competition_derived_runs where engine_key = 'CALCUTTA';
    when 'COMPETITION_DERIVED' then
      select count(*) into lifecycle_count from scoring_authority.competition_recalculation_jobs;
      select count(*) into checkpoint_count from scoring_authority.competition_derived_runs;
    when 'SCORING_AUTHORITY_TRANSITION' then
      select count(*) into lifecycle_count from scoring_authority.authority_epochs;
      select count(*) into checkpoint_count from scoring_authority.ingress_gates;
  end case;

  return jsonb_build_object(
    'state', 'DORMANT',
    'worker', control_row.worker_name,
    'domain', contract_row.domain,
    'operationKind', contract_row.operation_kind,
    'contractVersion', contract_row.contract_version,
    'globalWorkersEnabled', scope_row.workers_enabled,
    'workerEnabled', control_row.enabled,
    'operationAllowed', contract_row.operation_allowed,
    'schedulerInstalled', control_row.scheduler_installed or contract_row.scheduler_installed,
    'googleWritesEnabled', scope_row.google_writes_enabled,
    'googleWritesAllowed', control_row.google_writes_allowed,
    'scoringIngressEnabled', scope_row.scoring_ingress_enabled,
    'oddsPublicationEnabled', scope_row.odds_publication_enabled,
    'lifecycleCount', lifecycle_count,
    'checkpointCount', checkpoint_count,
    'fallbackUsed', false
  );
end;
$$;

create or replace function production_control.request_dormant_worker_operation(
  requested_worker_name text,
  requested_action text,
  request_fingerprint text,
  expected_source_fingerprint text,
  expected_prior_revision jsonb,
  requested_project_ref text,
  requested_project_url text,
  requested_google_workbook_id text,
  requested_vercel_project text,
  requested_canonical_domain text,
  requested_tournament_id text,
  requested_tournament_year integer
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, production_control
as $$
declare
  scope_row production_control.resource_scope%rowtype;
  control_row production_control.worker_controls%rowtype;
  contract_row production_control.worker_contracts%rowtype;
begin
  perform production_control.assert_exact_worker_resource_scope(
    requested_worker_name,
    requested_project_ref,
    requested_project_url,
    requested_google_workbook_id,
    requested_vercel_project,
    requested_canonical_domain,
    requested_tournament_id,
    requested_tournament_year
  );

  if request_fingerprint is null or request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_WORKER_REQUEST_FINGERPRINT_INVALID';
  end if;
  if expected_source_fingerprint is not null and expected_source_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_WORKER_SOURCE_FINGERPRINT_INVALID';
  end if;
  if expected_prior_revision is null or jsonb_typeof(expected_prior_revision) <> 'object' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_WORKER_PRIOR_REVISION_INVALID';
  end if;

  select * into strict scope_row
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict control_row
  from production_control.worker_controls
  where worker_name = requested_worker_name;
  select * into strict contract_row
  from production_control.worker_contracts
  where worker_name = requested_worker_name;

  if requested_action is null or not coalesce(contract_row.allowed_actions ? requested_action, false) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_WORKER_ACTION_NOT_ALLOWED';
  end if;

  -- Every operational action consults both the global and per-worker controls.
  if not scope_row.workers_enabled or not control_row.enabled then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_WORKER_DISABLED';
  end if;
  if contract_row.requires_google_write
     and (not scope_row.google_writes_enabled or not control_row.google_writes_allowed) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_GOOGLE_WRITES_DISABLED';
  end if;
  if contract_row.requires_odds_publication and not scope_row.odds_publication_enabled then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_ODDS_PUBLICATION_DISABLED';
  end if;
  if contract_row.domain = 'SCORING_AUTHORITY' and not scope_row.scoring_ingress_enabled then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_SCORING_INGRESS_DISABLED';
  end if;

  -- This foundation contract is intentionally not activatable in place. Even if
  -- a control row were corrupted, a reviewed activation migration is required.
  if not contract_row.operation_allowed then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_DORMANT_CONTRACT_REQUIRES_ACTIVATION_MIGRATION';
  end if;

  raise exception using errcode = 'P0001', message = 'PRODUCTION_DORMANT_CONTRACT_REQUIRES_ACTIVATION_MIGRATION';
end;
$$;

revoke all on table production_control.worker_contracts from public, anon, authenticated, service_role;
grant select on table production_control.worker_contracts to service_role;

revoke all on function production_control.assert_exact_worker_resource_scope(
  text, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function production_control.read_dormant_worker_status(
  text, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function production_control.request_dormant_worker_operation(
  text, text, text, text, jsonb, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;

grant execute on function production_control.read_dormant_worker_status(
  text, text, text, text, text, text, text, integer
) to service_role;
grant execute on function production_control.request_dormant_worker_operation(
  text, text, text, text, jsonb, text, text, text, text, text, text, integer
) to service_role;

alter default privileges in schema production_control revoke all on functions from public, anon, authenticated;

commit;
