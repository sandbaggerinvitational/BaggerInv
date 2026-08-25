-- Step 11 Production Odds rehearsal isolation.
--
-- The durable calculation worker uses real Production-derived facts, but a
-- rehearsal job is never an official Production calculation/publication. Its
-- input snapshot and source revision must carry an exact candidate-bound,
-- non-writing fixture contract. Production-cutover jobs must not carry that
-- fixture. Job IDs bind operation mode, deployment SHA, candidate hostname,
-- namespace and fixture fingerprint in application code, preventing a retained Step 11 row from
-- colliding with the later Step 12 calculation namespace.
begin;

do $$
begin
  if exists (
    select 1 from scoring_authority.odds_calculation_jobs
    where production_operation_mode is null
       or production_deployment_commit is null
  ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_UNSCOPED_RETAINED_JOB_BLOCKS_ISOLATION';
  end if;
end
$$;

alter table scoring_authority.odds_calculation_jobs
  alter column production_operation_mode set not null,
  alter column production_deployment_commit set not null;

alter table scoring_authority.odds_calculation_jobs
  drop constraint if exists odds_calculation_jobs_publication_status_check;

alter table scoring_authority.odds_calculation_jobs
  add constraint odds_calculation_jobs_publication_status_check
  check (publication_status in (
    'NOT_REQUESTED', 'READY', 'PUBLISHED', 'STALE', 'REHEARSAL_ONLY'
  ));

alter table scoring_authority.odds_calculation_jobs
  drop constraint if exists production_odds_initial_publication_separation_check;

alter table scoring_authority.odds_calculation_jobs
  add constraint production_odds_initial_publication_separation_check
  check (
    case production_operation_mode
      when 'STEP11_REHEARSAL' then coalesce(
        publication_reference = '{}'::jsonb
        and (
          (status = 'SUCCEEDED' and publication_status = 'REHEARSAL_ONLY')
          or (status = 'SUPERSEDED' and publication_status = 'STALE')
          or (
            status in ('PENDING', 'RUNNING', 'RETRYABLE', 'FAILED')
            and publication_status = 'NOT_REQUESTED'
          )
        ),
        false
      )
      when 'PRODUCTION_CUTOVER' then coalesce(
        publication_reference = '{}'::jsonb
        and (
          (status = 'SUCCEEDED' and publication_status = 'READY')
          or (status = 'SUPERSEDED' and publication_status = 'STALE')
          or (
            status in ('PENDING', 'RUNNING', 'RETRYABLE', 'FAILED')
            and publication_status = 'NOT_REQUESTED'
          )
        ),
        false
      )
      else false
    end
  );

alter table scoring_authority.odds_calculation_jobs
  drop constraint if exists production_odds_step11_rehearsal_fixture_check;

alter table scoring_authority.odds_calculation_jobs
  add constraint production_odds_step11_rehearsal_fixture_check
  check (
    case production_operation_mode
    when 'STEP11_REHEARSAL' then coalesce(
      jsonb_typeof(source_revision) = 'object'
      and jsonb_typeof(input_snapshot) = 'object'
      and production_deployment_commit ~ '^[0-9a-f]{40}$'
      and length(production_candidate_hostname) > 0
      and coalesce(
        source_revision->>'production_job_identity_contract'
          = 'production-odds-calculation-job-identity-v2',
        false
      )
      and coalesce(
        source_revision->>'rehearsal_fixture_contract'
          = 'production-odds-step11-rehearsal-fixture-v1',
        false
      )
      and coalesce(
        source_revision->>'rehearsal_fixture_fingerprint'
          ~ '^[0-9a-f]{64}$',
        false
      )
      and coalesce(
        source_revision->>'rehearsal_namespace'
          ~ '^STEP11_ODDS_[0-9a-f]{40}_[0-9a-f]{16}$',
        false
      )
      and coalesce(
        input_snapshot#>>'{metadata,productionRehearsalFixture,contractVersion}'
          = 'production-odds-step11-rehearsal-fixture-v1',
        false
      )
      and coalesce(
        input_snapshot#>>'{metadata,productionRehearsalFixture,candidateSha}'
          = production_deployment_commit,
        false
      )
      and coalesce(
        input_snapshot#>>'{metadata,productionRehearsalFixture,candidateHostname}'
          = production_candidate_hostname,
        false
      )
      and coalesce(
        input_snapshot#>>'{metadata,productionRehearsalFixture,namespace}'
          = source_revision->>'rehearsal_namespace',
        false
      )
      and coalesce(
        input_snapshot#>>'{metadata,productionRehearsalFixture,fixtureFingerprint}'
          = source_revision->>'rehearsal_fixture_fingerprint',
        false
      )
      and coalesce(
        input_snapshot#>'{metadata,productionRehearsalFixture}' @>
          '{
            "canonicalPairingsMutated": false,
            "databasePairingWrites": 0,
            "externalGoogleWrites": 0,
            "publicationEligible": false,
            "mirrorEligible": false
          }'::jsonb,
        false
      ),
      false
    )
    when 'PRODUCTION_CUTOVER' then coalesce(
      jsonb_typeof(source_revision) = 'object'
      and jsonb_typeof(input_snapshot) = 'object'
      and production_deployment_commit ~ '^[0-9a-f]{40}$'
      and coalesce(
        source_revision->>'production_job_identity_contract'
          = 'production-odds-calculation-job-identity-v2',
        false
      )
      and production_candidate_hostname is null
      and coalesce(not (
        coalesce(input_snapshot->'metadata', '{}'::jsonb)
          ? 'productionRehearsalFixture'
      ), false)
      and coalesce(not (source_revision ? 'rehearsal_fixture_contract'), false)
      and coalesce(not (source_revision ? 'rehearsal_fixture_fingerprint'), false)
      and coalesce(not (source_revision ? 'rehearsal_namespace'), false),
      false
    )
    else false
    end
  );

comment on constraint production_odds_step11_rehearsal_fixture_check
  on scoring_authority.odds_calculation_jobs is
  'Separates candidate-bound Step 11 calculation fixtures from Step 12 Production-cutover jobs; neither contract publishes or mirrors by itself.';

create or replace function production_control.assert_production_odds_retained_job_scope(
  input jsonb,
  retained jsonb
)
returns void
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  expected_mode text := upper(coalesce(input->>'operation_mode', ''));
  expected_commit text := lower(coalesce(input->>'deployment_commit', ''));
  expected_hostname text := nullif(lower(coalesce(input->>'candidate_hostname', '')), '');
  retained_mode text := upper(coalesce(retained->>'production_operation_mode', ''));
  retained_commit text := lower(coalesce(retained->>'production_deployment_commit', ''));
  retained_hostname text := nullif(lower(coalesce(retained->>'production_candidate_hostname', '')), '');
  revision jsonb := retained->'source_revision';
begin
  if jsonb_typeof(retained) <> 'object'
     or expected_mode not in ('STEP11_REHEARSAL', 'PRODUCTION_CUTOVER')
     or expected_commit !~ '^[0-9a-f]{40}$'
     or retained->>'tournament_id' is distinct from '2026'
     or retained_mode is distinct from expected_mode
     or retained_commit is distinct from expected_commit
     or retained_hostname is distinct from expected_hostname
     or jsonb_typeof(revision) <> 'object'
     or revision->>'production_job_identity_contract'
          is distinct from 'production-odds-calculation-job-identity-v2' then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_JOB_SCOPE_MISMATCH';
  end if;

  if expected_mode = 'STEP11_REHEARSAL' then
    if expected_hostname is null
       or revision->>'rehearsal_fixture_contract'
            is distinct from 'production-odds-step11-rehearsal-fixture-v1'
       or coalesce(revision->>'rehearsal_fixture_fingerprint', '')
            !~ '^[0-9a-f]{64}$'
       or coalesce(revision->>'rehearsal_namespace', '')
            !~ '^STEP11_ODDS_[0-9a-f]{40}_[0-9a-f]{16}$'
       or retained->>'publication_status' in ('READY', 'PUBLISHED') then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_REHEARSAL_JOB_NOT_ISOLATED';
    end if;
  elsif retained_hostname is not null
     or revision ? 'rehearsal_fixture_contract'
     or revision ? 'rehearsal_fixture_fingerprint'
     or revision ? 'rehearsal_namespace' then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_CUTOVER_JOB_FIXTURE_FORBIDDEN';
  end if;
end;
$$;

create or replace function production_control.guard_production_odds_job_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
begin
  if new.production_operation_mode is distinct from old.production_operation_mode
     or new.production_deployment_commit is distinct from old.production_deployment_commit
     or new.production_candidate_hostname is distinct from old.production_candidate_hostname
     or new.source_revision->>'production_job_identity_contract'
          is distinct from old.source_revision->>'production_job_identity_contract'
     or new.source_revision->>'rehearsal_fixture_contract'
          is distinct from old.source_revision->>'rehearsal_fixture_contract'
     or new.source_revision->>'rehearsal_fixture_fingerprint'
          is distinct from old.source_revision->>'rehearsal_fixture_fingerprint'
     or new.source_revision->>'rehearsal_namespace'
          is distinct from old.source_revision->>'rehearsal_namespace' then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_JOB_SCOPE_IMMUTABLE';
  end if;
  if old.production_operation_mode = 'STEP11_REHEARSAL'
     and new.publication_status in ('READY', 'PUBLISHED') then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_REHEARSAL_PUBLICATION_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_production_odds_job_scope
  on scoring_authority.odds_calculation_jobs;
create trigger guard_production_odds_job_scope
before update on scoring_authority.odds_calculation_jobs
for each row execute function production_control.guard_production_odds_job_scope();

create or replace function production_control.assert_production_odds_request_identity(
  input jsonb
)
returns void
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  identity jsonb;
  mode text := upper(coalesce(input->>'operation_mode', ''));
  commit_sha text := lower(coalesce(input->>'deployment_commit', ''));
  hostname text := nullif(lower(coalesce(input->>'candidate_hostname', '')), '');
  revision jsonb := input->'source_revision';
begin
  begin
    identity := (input->>'invocation_canonical_json')::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
  end;

  if jsonb_typeof(identity) <> 'object'
     or jsonb_typeof(revision) <> 'object'
     or identity->>'productionJobIdentityContract'
          is distinct from 'production-odds-calculation-job-identity-v2'
     or revision->>'production_job_identity_contract'
          is distinct from 'production-odds-calculation-job-identity-v2'
     or upper(coalesce(identity->>'operationMode', '')) is distinct from mode
     or lower(coalesce(identity->>'deploymentCommit', '')) is distinct from commit_sha
     or nullif(lower(coalesce(identity->>'candidateHostname', '')), '')
          is distinct from hostname then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_DETERMINISTIC_IDENTITY_MISMATCH';
  end if;

  if mode = 'STEP11_REHEARSAL' then
    if hostname is null
       or identity->>'rehearsalNamespace'
            is distinct from revision->>'rehearsal_namespace'
       or lower(coalesce(identity->>'rehearsalFixtureFingerprint', ''))
            is distinct from lower(coalesce(
              revision->>'rehearsal_fixture_fingerprint', ''
            ))
       or revision->>'rehearsal_fixture_contract'
            is distinct from 'production-odds-step11-rehearsal-fixture-v1' then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_REHEARSAL_IDENTITY_MISMATCH';
    end if;
  elsif mode = 'PRODUCTION_CUTOVER' then
    if coalesce(identity->>'rehearsalNamespace', '') <> ''
       or coalesce(identity->>'rehearsalFixtureFingerprint', '') <> ''
       or hostname is not null
       or revision ? 'rehearsal_fixture_contract'
       or revision ? 'rehearsal_fixture_fingerprint'
       or revision ? 'rehearsal_namespace' then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_CUTOVER_JOB_FIXTURE_FORBIDDEN';
    end if;
  else
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_OPERATION_MODE_INVALID';
  end if;
end;
$$;

create or replace function public.request_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  config scoring_authority.odds_input_configurations%rowtype;
  existing scoring_authority.odds_calculation_jobs%rowtype;
  inserted scoring_authority.odds_calculation_jobs%rowtype;
  job text := lower(coalesce(input->>'job_id', ''));
  input_hash text := lower(coalesce(input->>'input_fingerprint', ''));
  checkpoint_hash_value text := lower(coalesce(input->>'checkpoint_hash', ''));
  invocation_value jsonb;
  input_snapshot_value jsonb;
  checkpoint_value jsonb;
  superseded_count integer := 0;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  perform production_control.assert_production_odds_request_identity(input);
  config := production_control.current_production_odds_inputs(input);

  if job !~ '^[0-9a-f]{64}$'
     or job <> lower(coalesce(input->>'invocation_fingerprint', ''))
     or input_hash !~ '^[0-9a-f]{64}$'
     or checkpoint_hash_value !~ '^[0-9a-f]{64}$'
     or input->>'tournament_id' <> '2026'
     or input->>'phase' not in (
       'Pre-Tournament', 'After Round 1', 'After Round 2',
       'Round 3 Pairings Announced', 'Final Results'
     )
     or coalesce((input->>'total_iterations')::integer, 0)
          not in (10000, 25000, 50000, 100000)
     or coalesce(input->>'engine_version', '') = ''
     or coalesce(input->>'publication_contract_version', '') = ''
     or coalesce(input->>'checkpoint_contract_version', '') = ''
     or coalesce(input->>'deterministic_seed', '') = ''
     or coalesce(input->>'requested_by', '') = ''
     or coalesce(input->>'output_timestamp', '') = ''
     or jsonb_typeof(input->'input_snapshot') <> 'object'
     or jsonb_typeof(input->'checkpoint_payload') <> 'object'
     or jsonb_typeof(input->'source_revision') <> 'object'
     or coalesce(input->>'invocation_canonical_json', '') = ''
     or coalesce(input->>'input_snapshot_canonical_json', '') = ''
     or coalesce(input->>'checkpoint_canonical_json', '') = '' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_JOB_REQUIRED';
  end if;

  begin
    invocation_value := (input->>'invocation_canonical_json')::jsonb;
    input_snapshot_value := (input->>'input_snapshot_canonical_json')::jsonb;
    checkpoint_value := (input->>'checkpoint_canonical_json')::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
  end;
  if input_snapshot_value is distinct from input->'input_snapshot'
     or checkpoint_value is distinct from input->'checkpoint_payload'
     or encode(extensions.digest(input->>'input_snapshot_canonical_json', 'sha256'), 'hex')
          <> input_hash
     or encode(extensions.digest(input->>'checkpoint_canonical_json', 'sha256'), 'hex')
          <> checkpoint_hash_value
     or encode(extensions.digest(input->>'invocation_canonical_json', 'sha256'), 'hex')
          <> job
     or invocation_value->>'tournamentId' <> '2026'
     or invocation_value->>'phase' is distinct from input->>'phase'
     or coalesce((invocation_value->>'iterations')::integer, 0)
          <> (input->>'total_iterations')::integer
     or invocation_value->>'inputFingerprint' is distinct from input_hash
     or invocation_value->>'settingsFingerprint'
          is distinct from config.settings_fingerprint
     or input#>>'{input_snapshot,metadata,settingsFingerprint}'
          is distinct from config.settings_fingerprint
     or input#>>'{input_snapshot,sheets,tournaments,0,Tournament ID}'
          is distinct from '2026' then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_DETERMINISTIC_IDENTITY_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtext('production-odds-job:' || job));
  select * into existing
  from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if found then
    perform production_control.assert_production_odds_retained_job_scope(
      input, to_jsonb(existing)
    );
    if existing.input_fingerprint <> input_hash
       or existing.input_configuration_id <> config.id
       or existing.input_bundle_fingerprint <> config.bundle_fingerprint
       or existing.total_iterations <> (input->>'total_iterations')::integer then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_ODDS_CALCULATION_JOB_IDENTITY_CONFLICT';
    end if;
    return jsonb_build_object(
      'ok', true, 'changed', false, 'duplicate', true,
      'job', to_jsonb(existing) - 'input_snapshot' - 'checkpoint_payload'
        - 'result_payload' - 'claim_token',
      'publication_created', false, 'mirror_created', false
    );
  end if;

  insert into scoring_authority.odds_calculation_jobs (
    job_id, tournament_id, phase, total_iterations, engine_version,
    publication_contract_version, checkpoint_contract_version,
    deterministic_seed, input_fingerprint, settings_fingerprint,
    invocation_fingerprint, source_revision, input_snapshot,
    checkpoint_payload, checkpoint_hash, requested_by, output_timestamp,
    resource_metrics, input_configuration_id, effective_settings_fingerprint,
    input_bundle_fingerprint, production_operation_mode,
    production_deployment_commit, production_candidate_hostname,
    publication_status, publication_reference
  ) values (
    job, '2026', input->>'phase', (input->>'total_iterations')::integer,
    input->>'engine_version', input->>'publication_contract_version',
    input->>'checkpoint_contract_version', input->>'deterministic_seed',
    input_hash, config.settings_fingerprint, job, input->'source_revision',
    input->'input_snapshot', input->'checkpoint_payload', checkpoint_hash_value,
    left(input->>'requested_by', 180), (input->>'output_timestamp')::timestamptz,
    coalesce(input->'resource_metrics', '{}'::jsonb), config.id,
    config.effective_settings_fingerprint, config.bundle_fingerprint,
    input->>'operation_mode', input->>'deployment_commit',
    nullif(input->>'candidate_hostname', ''), 'NOT_REQUESTED', '{}'::jsonb
  ) returning * into inserted;

  update scoring_authority.odds_calculation_jobs
  set status = 'SUPERSEDED', publication_status = 'STALE',
      superseded_by = job, superseded_at = now(), claim_token = null,
      lease_expires_at = null,
      last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
      last_error_safe = 'Canonical Production calculation inputs advanced.',
      updated_at = now()
  where job_id <> job and tournament_id = '2026' and phase = input->>'phase'
    and production_operation_mode = input->>'operation_mode'
    and production_deployment_commit = input->>'deployment_commit'
    and production_candidate_hostname is not distinct from
      nullif(input->>'candidate_hostname', '')
    and input_bundle_fingerprint is distinct from config.bundle_fingerprint
    and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
    and publication_status <> 'PUBLISHED';
  get diagnostics superseded_count = row_count;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_ODDS_CALCULATION_REQUESTED',
    'CHAMPIONSHIP_ODDS_CALCULATION', '2026',
    left(input->>'requested_by', 160), job, 'SUCCEEDED',
    jsonb_build_object(
      'job_id', job, 'phase', input->>'phase',
      'iterations', (input->>'total_iterations')::integer,
      'input_fingerprint', input_hash,
      'settings_fingerprint', config.settings_fingerprint,
      'effective_settings_fingerprint', config.effective_settings_fingerprint,
      'input_bundle_fingerprint', config.bundle_fingerprint,
      'operation_mode', input->>'operation_mode',
      'deployment_commit', input->>'deployment_commit',
      'candidate_hostname', nullif(input->>'candidate_hostname', ''),
      'superseded_jobs', superseded_count,
      'publication_created', false, 'mirror_created', false
    )
  );
  return jsonb_build_object(
    'ok', true, 'changed', true, 'duplicate', false,
    'superseded_jobs', superseded_count,
    'job', to_jsonb(inserted) - 'input_snapshot' - 'checkpoint_payload'
      - 'result_payload' - 'claim_token',
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.claim_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' or coalesce(input->>'worker_id', '') = '' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_CLAIM_REQUIRED';
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND');
  end if;
  perform production_control.assert_production_odds_retained_job_scope(
    input, to_jsonb(retained)
  );

  config := production_control.current_production_odds_inputs(
    input || jsonb_build_object(
      'input_configuration_id', retained.input_configuration_id,
      'configuration_revision', retained.source_revision->>'configuration_revision',
      'settings_fingerprint', retained.settings_fingerprint,
      'effective_settings_fingerprint', retained.effective_settings_fingerprint,
      'input_bundle_fingerprint', retained.input_bundle_fingerprint,
      'source_revision', retained.source_revision
    )
  );
  if retained.input_configuration_id <> config.id
     or retained.input_bundle_fingerprint <> config.bundle_fingerprint then
    update scoring_authority.odds_calculation_jobs
    set status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = now(), claim_token = null, lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = now()
    where job_id = job;
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
      'retryable', false
    );
  end if;

  if retained.status = 'SUCCEEDED' then
    return jsonb_build_object(
      'ok', true, 'deliver', false, 'completed', true,
      'job', to_jsonb(retained) - 'claim_token'
    );
  end if;
  if retained.status in ('SUPERSEDED', 'FAILED') then
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_' || retained.status,
      'retryable', false
    );
  end if;
  if retained.status = 'RUNNING' and retained.lease_expires_at > now() then
    return jsonb_build_object(
      'ok', true, 'deliver', false, 'in_progress', true,
      'job', to_jsonb(retained) - 'input_snapshot' - 'checkpoint_payload'
        - 'result_payload' - 'claim_token'
    );
  end if;

  update scoring_authority.odds_calculation_jobs
  set status = 'RUNNING', attempt_count = attempt_count + 1,
      claim_token = extensions.gen_random_uuid(),
      lease_owner = left(input->>'worker_id', 180),
      lease_expires_at = now() + interval '12 minutes',
      started_at = coalesce(started_at, now()), updated_at = now(),
      last_error_code = null, last_error_safe = null
  where job_id = job returning * into retained;
  return jsonb_build_object(
    'ok', true, 'deliver', true, 'job', to_jsonb(retained),
    'publication_created', false, 'mirror_created', false
  );
exception when sqlstate 'P0001' then
  if sqlerrm = 'PRODUCTION_ODDS_INPUT_REVISION_STALE' then
    update scoring_authority.odds_calculation_jobs
    set status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = now(), claim_token = null, lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = now()
    where job_id = job and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
      and production_operation_mode = input->>'operation_mode'
      and production_deployment_commit = input->>'deployment_commit'
      and production_candidate_hostname is not distinct from
        nullif(input->>'candidate_hostname', '');
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
      'retryable', false
    );
  end if;
  raise;
end;
$$;

create or replace function public.checkpoint_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  claim uuid := nullif(input->>'claim_token', '')::uuid;
  progress integer := coalesce((input->>'completed_iterations')::integer, 0);
  checkpoint_hash_value text := lower(coalesce(input->>'checkpoint_hash', ''));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  existing_checkpoint scoring_authority.odds_calculation_checkpoints%rowtype;
  next_sequence integer;
  canonical_value jsonb;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' or claim is null
     or checkpoint_hash_value !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(input->'checkpoint_payload') <> 'object'
     or coalesce(input->>'checkpoint_canonical_json', '') = '' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_CHECKPOINT_REQUIRED';
  end if;
  begin
    canonical_value := (input->>'checkpoint_canonical_json')::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
  end;
  if canonical_value is distinct from input->'checkpoint_payload'
     or encode(extensions.digest(input->>'checkpoint_canonical_json', 'sha256'), 'hex')
          <> checkpoint_hash_value then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_CHECKPOINT_FINGERPRINT_MISMATCH';
  end if;

  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND');
  end if;
  perform production_control.assert_production_odds_retained_job_scope(
    input, to_jsonb(retained)
  );
  if retained.status <> 'RUNNING'
     or retained.claim_token is distinct from claim
     or retained.lease_expires_at <= now() then
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_CLAIM_STALE',
      'retryable', false
    );
  end if;
  if progress < retained.completed_iterations or progress > retained.total_iterations then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_PROGRESS_INVALID');
  end if;
  if progress = retained.completed_iterations then
    if retained.checkpoint_hash = checkpoint_hash_value then
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'checkpoint_count', retained.checkpoint_count,
        'completed_iterations', retained.completed_iterations
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_CHECKPOINT_CONFLICT');
  end if;

  select * into existing_checkpoint
  from scoring_authority.odds_calculation_checkpoints
  where job_id = job and completed_iterations = progress;
  if found then
    if existing_checkpoint.checkpoint_hash = checkpoint_hash_value then
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'checkpoint_count', retained.checkpoint_count,
        'completed_iterations', progress
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_CHECKPOINT_CONFLICT');
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
  update scoring_authority.odds_calculation_jobs
  set completed_iterations = progress,
      checkpoint_payload = input->'checkpoint_payload',
      checkpoint_hash = checkpoint_hash_value,
      checkpoint_count = next_sequence,
      resource_metrics = coalesce(input->'resource_metrics', resource_metrics),
      lease_expires_at = now() + interval '12 minutes', updated_at = now()
  where job_id = job;
  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'completed_iterations', progress,
    'total_iterations', retained.total_iterations,
    'checkpoint_count', next_sequence,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.complete_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  claim uuid := nullif(input->>'claim_token', '')::uuid;
  result_hash text := lower(coalesce(input->>'result_fingerprint', ''));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
  canonical_value jsonb;
  completion_publication_status text := case
    when input->>'operation_mode' = 'STEP11_REHEARSAL' then 'REHEARSAL_ONLY'
    else 'READY'
  end;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' or claim is null
     or result_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(input->'result_payload') <> 'object'
     or jsonb_typeof(input->'result_fingerprint_payload') <> 'object'
     or coalesce(input->>'result_canonical_json', '') = '' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_RESULT_REQUIRED';
  end if;
  begin
    canonical_value := (input->>'result_canonical_json')::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
  end;
  if canonical_value is distinct from input->'result_fingerprint_payload'
     or input->'result_fingerprint_payload'
          is distinct from (input->'result_payload') - 'publishedAt'
     or encode(extensions.digest(input->>'result_canonical_json', 'sha256'), 'hex')
          <> result_hash then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_RESULT_FINGERPRINT_MISMATCH';
  end if;

  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND');
  end if;
  perform production_control.assert_production_odds_retained_job_scope(
    input, to_jsonb(retained)
  );

  config := production_control.current_production_odds_inputs(
    input || jsonb_build_object(
      'input_configuration_id', retained.input_configuration_id,
      'configuration_revision', retained.source_revision->>'configuration_revision',
      'settings_fingerprint', retained.settings_fingerprint,
      'effective_settings_fingerprint', retained.effective_settings_fingerprint,
      'input_bundle_fingerprint', retained.input_bundle_fingerprint,
      'source_revision', retained.source_revision
    )
  );
  if retained.input_configuration_id <> config.id
     or retained.input_bundle_fingerprint <> config.bundle_fingerprint then
    update scoring_authority.odds_calculation_jobs
    set status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = now(), claim_token = null, lease_owner = null,
        lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = now()
    where job_id = job;
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
      'retryable', false, 'publication_created', false, 'mirror_created', false
    );
  end if;
  if retained.status = 'SUCCEEDED' then
    if retained.result_fingerprint = result_hash
       and retained.publication_status = completion_publication_status then
      return jsonb_build_object(
        'ok', true, 'duplicate', true, 'job_id', job,
        'result_fingerprint', result_hash,
        'publication_status', retained.publication_status,
        'publication_eligible', input->>'operation_mode' = 'PRODUCTION_CUTOVER',
        'publication_created', false, 'mirror_created', false
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_RESULT_CONFLICT');
  end if;
  if retained.status <> 'RUNNING'
     or retained.claim_token is distinct from claim
     or retained.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_CLAIM_STALE');
  end if;
  if retained.completed_iterations <> retained.total_iterations then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_INCOMPLETE');
  end if;

  update scoring_authority.odds_calculation_jobs
  set status = 'SUCCEEDED',
      publication_status = completion_publication_status,
      publication_reference = '{}'::jsonb,
      result_payload = input->'result_payload',
      result_fingerprint = result_hash,
      output_payload_bytes = greatest(
        0, coalesce((input->>'output_payload_bytes')::integer, 0)
      ),
      resource_metrics = coalesce(input->'resource_metrics', resource_metrics),
      claim_token = null, lease_owner = null, lease_expires_at = null,
      completed_at = now(), updated_at = now(),
      last_error_code = null, last_error_safe = null
  where job_id = job returning * into retained;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when input->>'operation_mode' = 'STEP11_REHEARSAL'
      then 'PRODUCTION_ODDS_REHEARSAL_CALCULATION_SUCCEEDED'
      else 'PRODUCTION_ODDS_CALCULATION_SUCCEEDED' end,
    'CHAMPIONSHIP_ODDS_CALCULATION', '2026', retained.requested_by,
    job, 'SUCCEEDED', jsonb_build_object(
      'job_id', job, 'phase', retained.phase,
      'iterations', retained.total_iterations,
      'result_fingerprint', result_hash,
      'checkpoint_count', retained.checkpoint_count,
      'attempt_count', retained.attempt_count,
      'operation_mode', retained.production_operation_mode,
      'calculation_completed', true,
      'publication_status', retained.publication_status,
      'publication_eligible', retained.production_operation_mode = 'PRODUCTION_CUTOVER',
      'publication_created', false, 'mirror_created', false
    )
  );
  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'job_id', job,
    'result_fingerprint', result_hash,
    'checkpoint_count', retained.checkpoint_count,
    'attempt_count', retained.attempt_count,
    'publication_status', retained.publication_status,
    'publication_eligible', retained.production_operation_mode = 'PRODUCTION_CUTOVER',
    'publication_created', false, 'mirror_created', false
  );
exception when sqlstate 'P0001' then
  if sqlerrm = 'PRODUCTION_ODDS_INPUT_REVISION_STALE' then
    update scoring_authority.odds_calculation_jobs
    set status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = now(), claim_token = null, lease_owner = null,
        lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = now()
    where job_id = job and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
      and production_operation_mode = input->>'operation_mode'
      and production_deployment_commit = input->>'deployment_commit'
      and production_candidate_hostname is not distinct from
        nullif(input->>'candidate_hostname', '');
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
      'retryable', false, 'publication_created', false, 'mirror_created', false
    );
  end if;
  raise;
end;
$$;

create or replace function public.fail_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  claim uuid := nullif(input->>'claim_token', '')::uuid;
  retryable boolean := coalesce((input->>'retryable')::boolean, true);
  retained scoring_authority.odds_calculation_jobs%rowtype;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' or claim is null then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_FAILURE_REQUIRED';
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object(
      'ok', true, 'marked', false, 'stale_claim', true,
      'publication_created', false, 'mirror_created', false
    );
  end if;
  perform production_control.assert_production_odds_retained_job_scope(
    input, to_jsonb(retained)
  );
  if retained.status <> 'RUNNING' or retained.claim_token is distinct from claim then
    return jsonb_build_object(
      'ok', true, 'marked', false, 'stale_claim', true,
      'publication_created', false, 'mirror_created', false
    );
  end if;
  update scoring_authority.odds_calculation_jobs
  set status = case when retryable then 'RETRYABLE' else 'FAILED' end,
      claim_token = null, lease_owner = null, lease_expires_at = null,
      last_error_code = left(coalesce(
        nullif(input->>'error_code', ''), 'ODDS_CALCULATION_FAILED'
      ), 120),
      last_error_safe = left(coalesce(
        nullif(input->>'error_safe', ''),
        'Championship calculation stopped safely.'
      ), 400),
      completed_at = case when retryable then completed_at else now() end,
      updated_at = now()
  where job_id = job
  returning * into retained;
  return jsonb_build_object(
    'ok', true, 'marked', true, 'retryable', retryable,
    'status', retained.status,
    'completed_iterations', retained.completed_iterations,
    'checkpoint_count', retained.checkpoint_count,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.supersede_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_SUPERSESSION_REQUIRED';
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND');
  end if;
  perform production_control.assert_production_odds_retained_job_scope(
    input, to_jsonb(retained)
  );
  select * into strict config from scoring_authority.odds_input_configurations
  where tournament_id = '2026' and is_current;
  if retained.input_bundle_fingerprint = config.bundle_fingerprint
     and retained.input_configuration_id = config.id then
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_INPUTS_STILL_CURRENT'
    );
  end if;
  update scoring_authority.odds_calculation_jobs
  set status = 'SUPERSEDED', publication_status = 'STALE',
      superseded_at = now(), claim_token = null, lease_owner = null,
      lease_expires_at = null,
      last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
      last_error_safe = 'Canonical Production calculation inputs advanced.',
      updated_at = now()
  where job_id = job and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
  returning * into retained;
  return jsonb_build_object(
    'ok', true, 'superseded', found,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.read_production_odds_calculation_jobs(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  jobs jsonb;
  checkpoints jsonb;
  target_job text := nullif(lower(coalesce(input->>'job_id', '')), '');
  retained scoring_authority.odds_calculation_jobs%rowtype;
  requested_mode text := upper(coalesce(input->>'operation_mode', ''));
  requested_commit text := lower(coalesce(input->>'deployment_commit', ''));
  requested_hostname text := nullif(lower(coalesce(input->>'candidate_hostname', '')), '');
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if target_job is not null and target_job !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'PRODUCTION_ODDS_JOB_ID_INVALID';
  end if;
  if target_job is not null then
    select * into retained from scoring_authority.odds_calculation_jobs
    where job_id = target_job;
    if found then
      perform production_control.assert_production_odds_retained_job_scope(
        input, to_jsonb(retained)
      );
    end if;
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(job_value) - 'claim_token'
    order by job_value.requested_at desc
  ), '[]'::jsonb) into jobs
  from scoring_authority.odds_calculation_jobs job_value
  where job_value.tournament_id = '2026'
    and job_value.production_operation_mode = requested_mode
    and job_value.production_deployment_commit = requested_commit
    and lower(job_value.production_candidate_hostname)
      is not distinct from requested_hostname
    and job_value.source_revision->>'production_job_identity_contract'
      = 'production-odds-calculation-job-identity-v2'
    and (target_job is null or job_value.job_id = target_job);

  select coalesce(jsonb_agg(
    to_jsonb(checkpoint_value) - 'checkpoint_payload'
    order by checkpoint_value.job_id, checkpoint_value.checkpoint_sequence
  ), '[]'::jsonb) into checkpoints
  from scoring_authority.odds_calculation_checkpoints checkpoint_value
  join scoring_authority.odds_calculation_jobs job_value
    on job_value.job_id = checkpoint_value.job_id
  where job_value.tournament_id = '2026'
    and job_value.production_operation_mode = requested_mode
    and job_value.production_deployment_commit = requested_commit
    and lower(job_value.production_candidate_hostname)
      is not distinct from requested_hostname
    and job_value.source_revision->>'production_job_identity_contract'
      = 'production-odds-calculation-job-identity-v2'
    and (target_job is null or checkpoint_value.job_id = target_job);

  return jsonb_build_object(
    'ok', true, 'jobs', jobs, 'checkpoints', checkpoints,
    'operation_mode', requested_mode,
    'deployment_commit', requested_commit,
    'candidate_hostname', requested_hostname,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

revoke all on function
  production_control.assert_production_odds_retained_job_scope(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_production_odds_request_identity(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function production_control.guard_production_odds_job_scope()
  from public, anon, authenticated, service_role;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.request_production_odds_calculation_job(jsonb)',
    'public.claim_production_odds_calculation_job(jsonb)',
    'public.checkpoint_production_odds_calculation_job(jsonb)',
    'public.complete_production_odds_calculation_job(jsonb)',
    'public.fail_production_odds_calculation_job(jsonb)',
    'public.supersede_production_odds_calculation_job(jsonb)',
    'public.read_production_odds_calculation_jobs(jsonb)'
  ] loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
commit;
