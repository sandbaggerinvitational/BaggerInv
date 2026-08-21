-- PostgreSQL exposes jsonb_array_length but not jsonb_object_length on this
-- Preview project. Keep the compatibility helper private to the canonical
-- scoring schema so both versioned Prediction Settings RPCs can validate the
-- exact 30-key object contract without exposing another public API surface.
create or replace function scoring_authority.jsonb_object_length(value jsonb) returns integer
language sql immutable strict set search_path=pg_catalog,pg_temp as $$
  select count(*)::integer from jsonb_object_keys(value);
$$;

revoke all on function scoring_authority.jsonb_object_length(jsonb) from public,anon,authenticated;

create or replace function public.import_preview_championship_odds_inputs(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target text := btrim(coalesce(input->>'tournament_id',''));
  actor text := btrim(coalesce(input->>'requested_by',''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id',''));
  fingerprint text := lower(btrim(coalesce(input->>'bundle_fingerprint','')));
  source_tab_value text := btrim(coalesce(input->>'source_tab',''));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint','')));
  raw_settings_fingerprint text := lower(btrim(coalesce(input->>'settings_fingerprint','')));
  effective_fingerprint text := lower(btrim(coalesce(input->>'effective_settings_fingerprint','')));
  contract_version text := btrim(coalesce(input->>'settings_contract_version',''));
  validation_value text := upper(btrim(coalesce(input->>'validation_status','')));
  typed_prediction_settings boolean := contract_version <> '';
  existing scoring_authority.odds_input_configurations%rowtype;
  current_config scoring_authority.odds_input_configurations%rowtype;
  latest_projection scoring_authority.odds_input_configurations%rowtype;
  next_revision bigint;
  config_id uuid;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then
    return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target='' or actor='' or source_workbook='' or jsonb_typeof(input->'settings') <> 'array' then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_INPUT_BUNDLE_REQUIRED');
  end if;
  if not exists(
    select 1 from scoring_authority.tournaments t
    where t.tournament_id=target
      and t.tournament_year=(input->>'tournament_year')::integer
      and t.source_workbook_id=source_workbook
  ) then
    return jsonb_build_object('ok',false,'code','PREVIEW_TOURNAMENT_SOURCE_MISMATCH');
  end if;

  if typed_prediction_settings then
    if source_tab_value <> 'Prediction Settings'
      or source_fingerprint_value !~ '^[0-9a-f]{64}$'
      or raw_settings_fingerprint !~ '^[0-9a-f]{64}$'
      or effective_fingerprint !~ '^[0-9a-f]{64}$'
      or contract_version <> 'prediction-settings-v1'
      or validation_value <> 'VALID'
      or jsonb_typeof(input->'canonical_settings') <> 'object'
      or jsonb_typeof(input->'effective_settings') <> 'object'
      or jsonb_object_length(input->'canonical_settings') <> 30
      or jsonb_object_length(input->'effective_settings') <> 30 then
      return jsonb_build_object('ok',false,'code','COMPLETE_VALID_PREDICTION_SETTINGS_REQUIRED');
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
        'effective_settings_fingerprint',effective_fingerprint,
        'bundle_fingerprint',latest_projection.bundle_fingerprint
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
    fingerprint := encode(extensions.digest(jsonb_build_object(
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
      raw_settings_fingerprint,current_config.ratings_fingerprint,current_config.pairing_fingerprint,fingerprint,
      true,actor,source_tab_value,source_fingerprint_value,input->'canonical_settings',input->'effective_settings',
      effective_fingerprint,contract_version,validation_value,
      coalesce(input->'validation_diagnostics','{}'::jsonb),now(),latest_projection.id
    ) returning id into config_id;
    insert into scoring_authority.odds_input_import_runs(tournament_id,bundle_fingerprint,status,requested_by)
    values(target,fingerprint,'APPLIED',actor);
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
      'bundle_fingerprint',fingerprint
    );
  end if;

  if fingerprint !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(input->'historical_ratings') <> 'object'
    or coalesce(input->>'settings_fingerprint','') !~ '^[0-9a-f]{64}$'
    or coalesce(input->>'ratings_fingerprint','') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_INPUT_BUNDLE_REQUIRED');
  end if;
  if jsonb_object_length(input->'historical_ratings')=0 then
    return jsonb_build_object('ok',false,'code','ODDS_RATINGS_REQUIRED');
  end if;
  select * into existing
  from scoring_authority.odds_input_configurations
  where tournament_id=target and bundle_fingerprint=fingerprint;
  if existing.id is not null then
    insert into scoring_authority.odds_input_import_runs(tournament_id,bundle_fingerprint,status,requested_by)
    values(target,fingerprint,'NO_CHANGE',actor);
    return jsonb_build_object(
      'ok',true,'changed',false,'duplicate',true,
      'configuration_id',existing.id,
      'configuration_revision',existing.configuration_revision,
      'bundle_fingerprint',fingerprint
    );
  end if;
  select coalesce(max(configuration_revision),0)+1 into next_revision
  from scoring_authority.odds_input_configurations where tournament_id=target;
  update scoring_authority.odds_input_configurations
  set is_current=false,superseded_at=now()
  where tournament_id=target and is_current;
  insert into scoring_authority.odds_input_configurations(
    tournament_id,configuration_revision,source_workbook_id,settings,historical_ratings,
    settings_fingerprint,ratings_fingerprint,pairing_fingerprint,bundle_fingerprint,imported_by
  ) values(
    target,next_revision,source_workbook,input->'settings',input->'historical_ratings',
    input->>'settings_fingerprint',input->>'ratings_fingerprint',input->>'pairing_fingerprint',fingerprint,actor
  ) returning id into config_id;
  insert into scoring_authority.odds_input_import_runs(tournament_id,bundle_fingerprint,status,requested_by)
  values(target,fingerprint,'APPLIED',actor);
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
  values(target,'CHAMPIONSHIP_ODDS_INPUTS_VERSIONED',actor,jsonb_build_object(
    'configurationId',config_id,'configurationRevision',next_revision,'bundleFingerprint',fingerprint
  ));
  return jsonb_build_object(
    'ok',true,'changed',true,'duplicate',false,
    'configuration_id',config_id,
    'configuration_revision',next_revision,
    'bundle_fingerprint',fingerprint
  );
end; $$;

revoke all on function public.import_preview_championship_odds_inputs(jsonb) from public,anon,authenticated;
grant execute on function public.import_preview_championship_odds_inputs(jsonb) to service_role;

notify pgrst,'reload schema';
