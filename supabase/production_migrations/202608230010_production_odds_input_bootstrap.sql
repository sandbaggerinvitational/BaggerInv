-- Step 10B: one-time dormant Production Championship Odds input bootstrap.
--
-- This operation creates only the first immutable odds_input_configurations
-- row from certified Production artifacts. It cannot calculate or publish
-- Odds, enqueue a Google mirror, enable a worker, change an authority, or
-- accept Preview resources.
begin;

create table production_control.odds_input_bootstrap_claims (
  bootstrap_key text primary key
    check (bootstrap_key = 'STEP10B_PRODUCTION_ODDS_INPUT_V1'),
  tournament_id text not null check (tournament_id = '2026'),
  operation text not null check (operation = 'ODDS_INPUT_CONFIGURATION_BOOTSTRAP'),
  actor text not null check (actor = 'step10b-production-shadow-bootstrap'),
  bootstrap_contract text not null
    check (bootstrap_contract = 'production-odds-input-bootstrap-v1'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  bundle_fingerprint text not null check (bundle_fingerprint ~ '^[0-9a-f]{64}$'),
  configuration_id uuid not null references scoring_authority.odds_input_configurations(id),
  consumed_at timestamptz not null default now(),
  check (btrim(actor) <> '')
);
alter table production_control.odds_input_bootstrap_claims enable row level security;
revoke all on production_control.odds_input_bootstrap_claims
  from public, anon, authenticated, service_role;
grant select on production_control.odds_input_bootstrap_claims to service_role;

create or replace function public.bootstrap_production_odds_input_configuration(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  claim production_control.odds_input_bootstrap_claims%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
  request_text text := coalesce(input->>'request_canonical_json','');
  source_text text := coalesce(input->>'source_canonical_json','');
  payload_text text := coalesce(input->>'payload_canonical_json','');
  settings_text text := coalesce(input->>'settings_canonical_json','');
  effective_settings_text text := coalesce(input->>'effective_settings_canonical_json','');
  ratings_text text := coalesce(input->>'ratings_canonical_json','');
  pairing_text text := coalesce(input->>'pairing_canonical_json','');
  bundle_text text := coalesce(input->>'bundle_canonical_json','');
  request_value jsonb;
  source_value jsonb;
  payload_value jsonb;
  settings_value jsonb;
  effective_settings_value jsonb;
  ratings_value jsonb;
  pairing_value jsonb;
  bundle_value jsonb;
  expected_request jsonb;
  expected_bundle jsonb;
  database_pairing jsonb;
  request_fingerprint_value text := lower(btrim(coalesce(input->>'request_fingerprint','')));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint','')));
  payload_fingerprint_value text := lower(btrim(coalesce(input->>'payload_fingerprint','')));
  bundle_fingerprint_value text := lower(btrim(coalesce(input#>>'{payload,bundle_fingerprint}','')));
  settings_fingerprint_value text := lower(btrim(coalesce(input#>>'{payload,settings_fingerprint}','')));
  effective_settings_fingerprint_value text := lower(btrim(coalesce(input#>>'{payload,effective_settings_fingerprint}','')));
  ratings_fingerprint_value text := lower(btrim(coalesce(input#>>'{payload,ratings_fingerprint}','')));
  pairing_fingerprint_value text := lower(btrim(coalesce(input#>>'{payload,pairing_fingerprint}','')));
  pre_calculation_job_count bigint;
  pre_published_snapshot_count bigint;
  pre_mirror_job_count bigint;
  pre_active_worker_flag_count bigint;
begin
  scope := production_control.assert_current_shadow_v2_dormant();
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ODDS_INPUT_BOOTSTRAP_SERVICE_ROLE_REQUIRED';
  end if;
  select count(*) into pre_calculation_job_count
  from scoring_authority.odds_calculation_jobs;
  select count(*) into pre_published_snapshot_count
  from scoring_authority.odds_published_snapshots;
  select count(*) into pre_mirror_job_count
  from scoring_authority.odds_google_mirror_jobs;
  select count(*) into pre_active_worker_flag_count
  from production_control.worker_controls
  where enabled or scheduler_installed or google_writes_allowed;
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref','')) <> scope.project_ref
     or btrim(coalesce(input->>'project_url','')) <> scope.project_url
     or btrim(coalesce(input->>'source_workbook_id','')) <> scope.google_workbook_id
     or btrim(coalesce(input->>'tournament_id','')) <> '2026'
     or coalesce((input->>'tournament_year')::integer,0) <> 2026
     or upper(btrim(coalesce(input->>'operation',''))) <> 'ODDS_INPUT_CONFIGURATION_BOOTSTRAP'
     or btrim(coalesce(input->>'actor_id','')) <> 'step10b-production-shadow-bootstrap'
     or btrim(coalesce(input->>'bootstrap_contract_version','')) <> 'production-odds-input-bootstrap-v1'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or payload_fingerprint_value !~ '^[0-9a-f]{64}$'
     or bundle_fingerprint_value !~ '^[0-9a-f]{64}$'
     or settings_fingerprint_value !~ '^[0-9a-f]{64}$'
     or effective_settings_fingerprint_value !~ '^[0-9a-f]{64}$'
     or ratings_fingerprint_value !~ '^[0-9a-f]{64}$'
     or pairing_fingerprint_value !~ '^[0-9a-f]{64}$'
     or btrim(request_text) = '' or btrim(source_text) = ''
     or btrim(payload_text) = '' or btrim(settings_text) = ''
     or btrim(effective_settings_text) = '' or btrim(ratings_text) = ''
     or btrim(pairing_text) = '' or btrim(bundle_text) = '' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ODDS_INPUT_BOOTSTRAP_SCOPE_REQUIRED';
  end if;

  begin
    request_value := request_text::jsonb;
    source_value := source_text::jsonb;
    payload_value := payload_text::jsonb;
    settings_value := settings_text::jsonb;
    effective_settings_value := effective_settings_text::jsonb;
    ratings_value := ratings_text::jsonb;
    pairing_value := pairing_text::jsonb;
    bundle_value := bundle_text::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_INPUT_CANONICAL_EVIDENCE_INVALID';
  end;

  expected_request := jsonb_build_object(
    'actor_id','step10b-production-shadow-bootstrap',
    'bootstrap_contract_version','production-odds-input-bootstrap-v1',
    'environment','PRODUCTION',
    'operation','ODDS_INPUT_CONFIGURATION_BOOTSTRAP',
    'payload_fingerprint',payload_fingerprint_value,
    'project_ref',scope.project_ref,
    'project_url',scope.project_url,
    'source_fingerprint',source_fingerprint_value,
    'source_workbook_id',scope.google_workbook_id,
    'tournament_id','2026',
    'tournament_year',2026
  );
  expected_bundle := jsonb_build_object(
    'configuration_revision',1,
    'effective_settings_fingerprint',effective_settings_fingerprint_value,
    'pairing_fingerprint',pairing_fingerprint_value,
    'ratings_contract_version','sandbagger-ratings-existing-engine-v1',
    'ratings_fingerprint',ratings_fingerprint_value,
    'settings_fingerprint',settings_fingerprint_value,
    'source_fingerprint',source_fingerprint_value,
    'tournament_id','2026'
  );

  if request_value is distinct from expected_request
     or source_value is distinct from input->'source_evidence'
     or payload_value is distinct from input->'payload'
     or settings_value is distinct from input#>'{payload,settings}'
     or effective_settings_value is distinct from input#>'{payload,effective_settings}'
     or ratings_value is distinct from input#>'{payload,historical_ratings}'
     or pairing_value is distinct from input#>'{source_evidence,current_pairing_sequence}'
     or bundle_value is distinct from expected_bundle
     or encode(extensions.digest(request_text,'sha256'),'hex') <> request_fingerprint_value
     or encode(extensions.digest(source_text,'sha256'),'hex') <> source_fingerprint_value
     or encode(extensions.digest(payload_text,'sha256'),'hex') <> payload_fingerprint_value
     or encode(extensions.digest(settings_text,'sha256'),'hex') <> settings_fingerprint_value
     or encode(extensions.digest(effective_settings_text,'sha256'),'hex') <> effective_settings_fingerprint_value
     or encode(extensions.digest(ratings_text,'sha256'),'hex') <> ratings_fingerprint_value
     or encode(extensions.digest(pairing_text,'sha256'),'hex') <> pairing_fingerprint_value
     or encode(extensions.digest(bundle_text,'sha256'),'hex') <> bundle_fingerprint_value then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_INPUT_CANONICAL_EVIDENCE_MISMATCH';
  end if;

  if jsonb_typeof(payload_value->'settings') <> 'array'
     or jsonb_array_length(payload_value->'settings') < 30
     or jsonb_typeof(payload_value->'canonical_settings') <> 'object'
     or scoring_authority.jsonb_object_length(payload_value->'canonical_settings') <> 30
     or jsonb_typeof(payload_value->'effective_settings') <> 'object'
     or scoring_authority.jsonb_object_length(payload_value->'effective_settings') <> 30
     or jsonb_typeof(payload_value->'historical_ratings') <> 'object'
     or scoring_authority.jsonb_object_length(payload_value->'historical_ratings') <> 41
     or payload_value->>'settings_contract_version' <> 'prediction-settings-v1'
     or payload_value->>'ratings_contract_version' <> 'sandbagger-ratings-existing-engine-v1'
     or payload_value->>'pairing_contract_version' <> 'production-current-pairing-sequence-v1'
     or payload_value->>'validation_status' <> 'VALID'
     or source_value->>'source_workbook_id' <> scope.google_workbook_id
     or jsonb_typeof(source_value->'completed_history') <> 'array'
     or jsonb_array_length(source_value->'completed_history') <> 9
     or jsonb_typeof(source_value->'current_tournament') <> 'object'
     or jsonb_typeof(source_value->'prediction_settings') <> 'object'
     or jsonb_typeof(source_value->'player_editorial') <> 'object'
     or jsonb_typeof(source_value->'ratings_engine') <> 'object'
     or source_value#>>'{ratings_engine,contract_version}' <> 'sandbagger-ratings-existing-engine-v1'
     or lower(btrim(coalesce(source_value#>>'{ratings_engine,source_sha256}',''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(source_value#>>'{ratings_engine,canonical_history_fingerprint}',''))) !~ '^[0-9a-f]{64}$'
     or coalesce((source_value#>>'{ratings_engine,start_rating}')::integer,0) <> 1500
     or coalesce((source_value#>>'{ratings_engine,k_factor}')::integer,0) <> 24
     or source_value#>'{ratings_engine,categories}' <> '[
       {"id":"OVERALL","format":null},
       {"id":"BB","format":"BB"},
       {"id":"SC","format":"SC"},
       {"id":"SI","format":"SI"}
     ]'::jsonb
     or source_value#>>'{current_tournament,import_contract_version}' <> 'production-current-shadow-v2'
     or source_value#>>'{prediction_settings,contract_version}' <> 'prediction-settings-v1'
     or source_value#>>'{player_editorial,contract_version}' <> 'player-public-profile-v1' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_INPUT_COMPLETE_CONTRACT_REQUIRED';
  end if;

  if (select jsonb_agg((value->>'year')::integer order by ordinal)
      from jsonb_array_elements(source_value->'completed_history') with ordinality history(value,ordinal))
      <> '[2017,2018,2019,2020,2021,2022,2023,2024,2025]'::jsonb
     or exists (
       select 1
       from jsonb_array_elements(source_value->'completed_history') evidence
       where not exists (
         select 1
         from scoring_authority.completed_history_current_revisions pointer
         join scoring_authority.completed_history_revisions revision
           on revision.revision_id = pointer.revision_id
         where pointer.tournament_year = (evidence->>'year')::integer
           and pointer.tournament_id = evidence->>'year'
           and pointer.project_ref = scope.project_ref
           and pointer.source_workbook_id = scope.google_workbook_id
           and revision.source_fingerprint = lower(evidence->>'source_fingerprint')
           and revision.payload_fingerprint = lower(evidence->>'payload_fingerprint')
           and revision.correction_set_version = evidence->>'correction_registry_version'
       )
     ) then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_INPUT_HISTORY_REVISION_MISMATCH';
  end if;

  if not exists (
    select 1
    from production_control.current_shadow_revisions revision
    where revision.tournament_id = '2026'
      and revision.source_workbook_id = scope.google_workbook_id
      and revision.source_fingerprint = source_value#>>'{current_tournament,source_fingerprint}'
      and revision.payload_fingerprint = source_value#>>'{current_tournament,payload_fingerprint}'
  ) then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_INPUT_CURRENT_REVISION_MISMATCH';
  end if;
  if not exists (
    select 1
    from production_control.projection_current pointer
    join production_control.projection_revisions revision
      on revision.revision_id = pointer.revision_id
    where pointer.domain = 'PLAYER_EDITORIAL'
      and pointer.tournament_id = '2026'
      and revision.source_fingerprint = source_value#>>'{player_editorial,source_fingerprint}'
      and revision.payload_fingerprint = source_value#>>'{player_editorial,payload_fingerprint}'
      and revision.source_workbook_id = scope.google_workbook_id
  ) then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_INPUT_PLAYER_PROJECTION_MISMATCH';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'match_id', match.match_id,
    'round_number', match.round_number,
    'format', upper(match.format),
    'status', upper(match.status),
    'course_id', snapshot.course_id,
    'tee', snapshot.tee,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', participant.player_id,
        'team_side', participant.team_side,
        'player_slot', participant.player_slot
      ) order by participant.team_side, participant.player_slot, participant.player_id)
      from scoring_authority.match_participants participant
      where participant.match_id = match.match_id
    ), '[]'::jsonb)
  ) order by match.round_number, match.match_id), '[]'::jsonb)
  into database_pairing
  from scoring_authority.matches match
  join scoring_authority.scoring_snapshots snapshot
    on snapshot.snapshot_id = match.scoring_snapshot_id
  where match.tournament_id = '2026';
  if database_pairing is distinct from pairing_value
     or jsonb_array_length(database_pairing) <> 24 then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_INPUT_PAIRING_REVISION_MISMATCH';
  end if;

  if exists (
    select 1 from jsonb_object_keys(ratings_value) as rating_key(player_id)
    where not exists (
      select 1 from scoring_authority.players player
      where player.player_id = rating_key.player_id
    )
  ) or exists (
    select 1 from scoring_authority.players player
    where not ratings_value ? player.player_id
  ) then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_INPUT_RATINGS_IDENTITY_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtext('step10b-production-odds-input-bootstrap'));
  select * into claim
  from production_control.odds_input_bootstrap_claims value
  where value.bootstrap_key = 'STEP10B_PRODUCTION_ODDS_INPUT_V1'
  for update;
  if claim.bootstrap_key is not null then
    if claim.operation <> 'ODDS_INPUT_CONFIGURATION_BOOTSTRAP'
       or claim.actor <> 'step10b-production-shadow-bootstrap'
       or claim.bootstrap_contract <> 'production-odds-input-bootstrap-v1'
       or claim.request_fingerprint <> request_fingerprint_value
       or claim.source_fingerprint <> source_fingerprint_value
       or claim.payload_fingerprint <> payload_fingerprint_value
       or claim.bundle_fingerprint <> bundle_fingerprint_value then
      raise exception using errcode = '42501',
        message = 'PRODUCTION_ODDS_INPUT_BOOTSTRAP_ALREADY_USED';
    end if;
    select * into strict config
    from scoring_authority.odds_input_configurations value
    where value.id = claim.configuration_id;
    if config.bundle_fingerprint <> bundle_fingerprint_value then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_INPUT_BOOTSTRAP_STATE_DIVERGED';
    end if;
    return jsonb_build_object(
      'ok',true,'changed',false,'duplicate',true,
      'configuration_id',config.id,'configuration_revision',config.configuration_revision,
      'bundle_fingerprint',config.bundle_fingerprint,
      'settings_fingerprint',config.settings_fingerprint,
      'effective_settings_fingerprint',config.effective_settings_fingerprint,
      'ratings_fingerprint',config.ratings_fingerprint,
      'pairing_fingerprint',config.pairing_fingerprint,
      'superseded',not config.is_current,
      'shadow_only',true,'calculation_performed',false,'publication_created',false,
      'google_write',false,'worker_enabled',false,'authority_changed',false
    );
  end if;

  if exists (select 1 from scoring_authority.odds_input_configurations)
     or exists (select 1 from scoring_authority.odds_input_import_runs) then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_INPUT_BOOTSTRAP_EMPTY_STATE_REQUIRED';
  end if;

  insert into scoring_authority.odds_input_configurations(
    tournament_id,configuration_revision,source_workbook_id,settings,historical_ratings,
    settings_fingerprint,ratings_fingerprint,pairing_fingerprint,bundle_fingerprint,is_current,
    imported_by,source_tab,source_fingerprint,canonical_settings,effective_settings,
    effective_settings_fingerprint,settings_contract_version,validation_status,
    validation_diagnostics,synchronized_at,previous_configuration_id
  ) values (
    '2026',1,scope.google_workbook_id,payload_value->'settings',payload_value->'historical_ratings',
    settings_fingerprint_value,ratings_fingerprint_value,pairing_fingerprint_value,
    bundle_fingerprint_value,true,'step10b-production-shadow-bootstrap','Prediction Settings',
    source_fingerprint_value,payload_value->'canonical_settings',payload_value->'effective_settings',
    effective_settings_fingerprint_value,'prediction-settings-v1','VALID',
    jsonb_build_object(
      'bootstrapContract','production-odds-input-bootstrap-v1',
      'ratingsContract','sandbagger-ratings-existing-engine-v1',
      'pairingContract','production-current-pairing-sequence-v1',
      'sourceEvidence',source_value,
      'payloadFingerprint',payload_fingerprint_value,
      'requestFingerprint',request_fingerprint_value,
      'shadowOnly',true,
      'calculationPerformed',false,
      'publicationCreated',false,
      'googleWrite',false,
      'authorityChanged',false
    ),now(),null
  ) returning * into config;

  insert into scoring_authority.odds_input_import_runs(
    tournament_id,bundle_fingerprint,status,requested_by
  ) values ('2026',bundle_fingerprint_value,'APPLIED','step10b-production-shadow-bootstrap');
  insert into production_control.odds_input_bootstrap_claims(
    bootstrap_key,tournament_id,operation,actor,bootstrap_contract,
    request_fingerprint,source_fingerprint,payload_fingerprint,bundle_fingerprint,
    configuration_id
  ) values (
    'STEP10B_PRODUCTION_ODDS_INPUT_V1','2026','ODDS_INPUT_CONFIGURATION_BOOTSTRAP',
    'step10b-production-shadow-bootstrap','production-odds-input-bootstrap-v1',
    request_fingerprint_value,source_fingerprint_value,payload_fingerprint_value,
    bundle_fingerprint_value,config.id
  );
  insert into production_control.operation_audit_events(
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_ODDS_INPUT_BOOTSTRAPPED','ODDS_INPUT_CONFIGURATION','2026',
    'step10b-production-shadow-bootstrap',request_fingerprint_value,'SUCCEEDED',
    jsonb_build_object(
      'configurationId',config.id,'configurationRevision',1,
      'bundleFingerprint',bundle_fingerprint_value,
      'sourceFingerprint',source_fingerprint_value,
      'payloadFingerprint',payload_fingerprint_value,
      'settingsFingerprint',settings_fingerprint_value,
      'effectiveSettingsFingerprint',effective_settings_fingerprint_value,
      'ratingsFingerprint',ratings_fingerprint_value,
      'pairingFingerprint',pairing_fingerprint_value,
      'serviceRoleOnly',true,'singleUse',true,'shadowOnly',true,
      'calculationPerformed',false,'publicationCreated',false,
      'googleWrite',false,'workerEnabled',false,'authorityChanged',false
    )
  );

  if (select count(*) from scoring_authority.odds_calculation_jobs) <> pre_calculation_job_count
     or (select count(*) from scoring_authority.odds_published_snapshots) <> pre_published_snapshot_count
     or (select count(*) from scoring_authority.odds_google_mirror_jobs) <> pre_mirror_job_count
     or (select count(*) from production_control.worker_controls
         where enabled or scheduler_installed or google_writes_allowed) <> pre_active_worker_flag_count then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_INPUT_BOOTSTRAP_CREATED_OPERATIONAL_WORK';
  end if;

  return jsonb_build_object(
    'ok',true,'changed',true,'duplicate',false,
    'configuration_id',config.id,'configuration_revision',config.configuration_revision,
    'bundle_fingerprint',config.bundle_fingerprint,
    'settings_fingerprint',config.settings_fingerprint,
    'effective_settings_fingerprint',config.effective_settings_fingerprint,
    'ratings_fingerprint',config.ratings_fingerprint,
    'pairing_fingerprint',config.pairing_fingerprint,
    'calculation_jobs_before_after',jsonb_build_array(
      pre_calculation_job_count,(select count(*) from scoring_authority.odds_calculation_jobs)),
    'published_snapshots_before_after',jsonb_build_array(
      pre_published_snapshot_count,(select count(*) from scoring_authority.odds_published_snapshots)),
    'mirror_jobs_before_after',jsonb_build_array(
      pre_mirror_job_count,(select count(*) from scoring_authority.odds_google_mirror_jobs)),
    'shadow_only',true,'calculation_performed',false,'publication_created',false,
    'google_write',false,'worker_enabled',false,'authority_changed',false
  );
end;
$$;
revoke all on function public.bootstrap_production_odds_input_configuration(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_production_odds_input_configuration(jsonb)
  to service_role;

commit;
