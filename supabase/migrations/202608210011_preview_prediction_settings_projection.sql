alter table scoring_authority.odds_input_configurations
  add column if not exists source_tab text,
  add column if not exists source_fingerprint text,
  add column if not exists canonical_settings jsonb,
  add column if not exists effective_settings jsonb,
  add column if not exists effective_settings_fingerprint text,
  add column if not exists settings_contract_version text,
  add column if not exists validation_status text,
  add column if not exists validation_diagnostics jsonb,
  add column if not exists synchronized_at timestamptz,
  add column if not exists previous_configuration_id uuid references scoring_authority.odds_input_configurations(id);

alter table scoring_authority.odds_input_configurations
  add constraint odds_input_source_fingerprint_format check (source_fingerprint is null or source_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint odds_input_effective_fingerprint_format check (effective_settings_fingerprint is null or effective_settings_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint odds_input_canonical_settings_object check (canonical_settings is null or jsonb_typeof(canonical_settings) = 'object'),
  add constraint odds_input_effective_settings_object check (effective_settings is null or jsonb_typeof(effective_settings) = 'object'),
  add constraint odds_input_validation_status check (validation_status is null or validation_status in ('VALID','INVALID'));

create index odds_input_prediction_settings_revision_idx
  on scoring_authority.odds_input_configurations (tournament_id, configuration_revision desc)
  where settings_contract_version is not null;

create or replace function public.import_preview_prediction_settings(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target text := btrim(coalesce(input->>'tournament_id',''));
  actor text := btrim(coalesce(input->>'requested_by',''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id',''));
  source_tab_value text := btrim(coalesce(input->>'source_tab',''));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint','')));
  raw_settings_fingerprint text := lower(btrim(coalesce(input->>'settings_fingerprint','')));
  effective_fingerprint text := lower(btrim(coalesce(input->>'effective_settings_fingerprint','')));
  contract_version text := btrim(coalesce(input->>'settings_contract_version',''));
  validation_value text := upper(btrim(coalesce(input->>'validation_status','')));
  current_config scoring_authority.odds_input_configurations%rowtype;
  latest_projection scoring_authority.odds_input_configurations%rowtype;
  next_revision bigint;
  next_bundle_fingerprint text;
  config_id uuid;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then
    return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target='' or actor='' or source_workbook='' or source_tab_value <> 'Prediction Settings'
    or source_fingerprint_value !~ '^[0-9a-f]{64}$'
    or raw_settings_fingerprint !~ '^[0-9a-f]{64}$'
    or effective_fingerprint !~ '^[0-9a-f]{64}$'
    or contract_version <> 'prediction-settings-v1'
    or validation_value <> 'VALID'
    or jsonb_typeof(input->'settings') <> 'array'
    or jsonb_typeof(input->'canonical_settings') <> 'object'
    or jsonb_typeof(input->'effective_settings') <> 'object'
    or jsonb_object_length(input->'canonical_settings') <> 30
    or jsonb_object_length(input->'effective_settings') <> 30 then
    return jsonb_build_object('ok',false,'code','COMPLETE_VALID_PREDICTION_SETTINGS_REQUIRED');
  end if;
  if not exists(
    select 1 from scoring_authority.tournaments t
    where t.tournament_id=target
      and t.tournament_year=(input->>'tournament_year')::integer
      and t.source_workbook_id=source_workbook
  ) then
    return jsonb_build_object('ok',false,'code','PREVIEW_TOURNAMENT_SOURCE_MISMATCH');
  end if;

  select * into latest_projection
  from scoring_authority.odds_input_configurations
  where tournament_id=target and settings_contract_version is not null
  order by configuration_revision desc limit 1;

  if latest_projection.id is not null
    and latest_projection.source_fingerprint=source_fingerprint_value
    and latest_projection.effective_settings_fingerprint=effective_fingerprint
    and latest_projection.settings_contract_version=contract_version
    and latest_projection.validation_status='VALID' then
    insert into scoring_authority.odds_input_import_runs(tournament_id,bundle_fingerprint,status,requested_by)
    values(target,latest_projection.bundle_fingerprint,'NO_CHANGE',actor);
    return jsonb_build_object(
      'ok',true,'changed',false,'duplicate',true,
      'configuration_id',latest_projection.id,
      'configuration_revision',latest_projection.configuration_revision,
      'source_fingerprint',source_fingerprint_value,
      'effective_settings_fingerprint',effective_fingerprint
    );
  end if;

  select * into current_config
  from scoring_authority.odds_input_configurations
  where tournament_id=target and is_current
  for update;
  if current_config.id is null then
    return jsonb_build_object('ok',false,'code','ODDS_INPUT_CONFIGURATION_REQUIRED');
  end if;

  select coalesce(max(configuration_revision),0)+1 into next_revision
  from scoring_authority.odds_input_configurations where tournament_id=target;
  next_bundle_fingerprint := encode(extensions.digest(jsonb_build_object(
    'tournament_id',target,
    'source_fingerprint',source_fingerprint_value,
    'effective_settings_fingerprint',effective_fingerprint,
    'ratings_fingerprint',current_config.ratings_fingerprint,
    'pairing_fingerprint',current_config.pairing_fingerprint,
    'previous_configuration_id',current_config.id,
    'configuration_revision',next_revision
  )::text,'sha256'),'hex');

  update scoring_authority.odds_input_configurations
  set is_current=false,superseded_at=now()
  where tournament_id=target and is_current;

  insert into scoring_authority.odds_input_configurations(
    tournament_id,configuration_revision,source_workbook_id,settings,historical_ratings,
    settings_fingerprint,ratings_fingerprint,pairing_fingerprint,bundle_fingerprint,
    is_current,imported_by,source_tab,source_fingerprint,canonical_settings,effective_settings,
    effective_settings_fingerprint,settings_contract_version,validation_status,
    validation_diagnostics,synchronized_at,previous_configuration_id
  ) values(
    target,next_revision,source_workbook,input->'settings',current_config.historical_ratings,
    raw_settings_fingerprint,current_config.ratings_fingerprint,current_config.pairing_fingerprint,next_bundle_fingerprint,
    true,actor,source_tab_value,source_fingerprint_value,input->'canonical_settings',input->'effective_settings',
    effective_fingerprint,contract_version,validation_value,
    coalesce(input->'validation_diagnostics','{}'::jsonb),now(),latest_projection.id
  ) returning id into config_id;

  insert into scoring_authority.odds_input_import_runs(tournament_id,bundle_fingerprint,status,requested_by)
  values(target,next_bundle_fingerprint,'APPLIED',actor);
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
  values(target,'PREDICTION_SETTINGS_VERSIONED',actor,jsonb_build_object(
    'configurationId',config_id,
    'configurationRevision',next_revision,
    'previousConfigurationId',latest_projection.id,
    'sourceTab',source_tab_value,
    'sourceFingerprint',source_fingerprint_value,
    'effectiveSettingsFingerprint',effective_fingerprint,
    'settingsContractVersion',contract_version
  ));
  return jsonb_build_object(
    'ok',true,'changed',true,'duplicate',false,
    'configuration_id',config_id,
    'configuration_revision',next_revision,
    'previous_configuration_id',latest_projection.id,
    'source_fingerprint',source_fingerprint_value,
    'effective_settings_fingerprint',effective_fingerprint,
    'bundle_fingerprint',next_bundle_fingerprint
  );
end; $$;

create or replace function public.read_preview_prediction_settings(target_tournament_id text) returns jsonb
language plpgsql security definer stable set search_path=scoring_authority,public,extensions,pg_temp as $$
declare revision scoring_authority.odds_input_configurations%rowtype;
begin
  select * into revision
  from scoring_authority.odds_input_configurations
  where tournament_id=target_tournament_id and settings_contract_version is not null
  order by configuration_revision desc limit 1;
  if revision.id is null then
    return jsonb_build_object('ok',false,'code','PREDICTION_SETTINGS_UNAVAILABLE');
  end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'tournament_id',revision.tournament_id,
    'configuration_revision',revision.configuration_revision,
    'previous_configuration_id',revision.previous_configuration_id,
    'source_workbook_id',revision.source_workbook_id,
    'source_tab',revision.source_tab,
    'source_fingerprint',revision.source_fingerprint,
    'settings_fingerprint',revision.settings_fingerprint,
    'effective_settings_fingerprint',revision.effective_settings_fingerprint,
    'settings_contract_version',revision.settings_contract_version,
    'source_settings',revision.settings,
    'canonical_settings',revision.canonical_settings,
    'effective_settings',revision.effective_settings,
    'validation_status',revision.validation_status,
    'validation_diagnostics',coalesce(revision.validation_diagnostics,'{}'::jsonb),
    'synchronized_at',revision.synchronized_at,
    'synchronized_by',revision.imported_by,
    'configuration_is_current',revision.is_current,
    'projection_status',case
      when revision.validation_status='VALID'
        and jsonb_typeof(revision.canonical_settings)='object'
        and jsonb_typeof(revision.effective_settings)='object'
        and jsonb_object_length(revision.canonical_settings)=30
        and jsonb_object_length(revision.effective_settings)=30
        and revision.source_fingerprint ~ '^[0-9a-f]{64}$'
        and revision.effective_settings_fingerprint ~ '^[0-9a-f]{64}$'
      then 'VALID' else 'INVALID' end,
    'freshness','UNKNOWN'
  ));
end; $$;

revoke all on function public.import_preview_prediction_settings(jsonb) from public,anon,authenticated;
revoke all on function public.read_preview_prediction_settings(text) from public,anon,authenticated;
grant execute on function public.import_preview_prediction_settings(jsonb) to service_role;
grant execute on function public.read_preview_prediction_settings(text) to service_role;

notify pgrst,'reload schema';
