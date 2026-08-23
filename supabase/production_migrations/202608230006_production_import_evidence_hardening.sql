-- Step 10A review hardening: require independently hashable canonical evidence
-- for projection imports and close mutation surfaces that are not yet backed by
-- a reviewed Director entitlement/claim contract.
--
-- This forward-only migration intentionally leaves applied migrations 001-005
-- immutable. It does not enable reads, authorities, workers, scoring ingress,
-- Google writes, Auth user creation, or Odds publication.
begin;

create or replace function production_control.assert_projection_scope(
  input jsonb,
  expected_domain text,
  expected_contract text,
  expected_tabs jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  source_text text := coalesce(input->>'source_canonical_json','');
  payload_text text := coalesce(input->>'payload_canonical_json','');
  source_value jsonb;
  payload_value jsonb;
  settings_text text;
  effective_settings_text text;
  settings_value jsonb;
  effective_settings_value jsonb;
  snapshot_value jsonb;
  snapshot_item jsonb;
  snapshot_text text;
begin
  select * into strict scope
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';

  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref','')) <> scope.project_ref
     or btrim(coalesce(input->>'project_url','')) <> scope.project_url
     or btrim(coalesce(input->>'source_workbook_id','')) <> scope.google_workbook_id
     or btrim(coalesce(input->>'tournament_id','')) <> scope.current_tournament_id
     or coalesce((input->>'tournament_year')::integer, 0) <> scope.current_tournament_year
     or upper(btrim(coalesce(input->>'domain',''))) <> expected_domain
     or btrim(coalesce(input->>'contract_version','')) <> expected_contract
     or coalesce(input->'source_tabs','null'::jsonb) <> expected_tabs
     or lower(btrim(coalesce(input->>'source_fingerprint',''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(input->>'payload_fingerprint',''))) !~ '^[0-9a-f]{64}$'
     or btrim(coalesce(input->>'requested_by','')) = ''
     or upper(btrim(coalesce(input->>'validation_status',''))) not in ('VALID','NOT_CONFIGURED')
     or jsonb_typeof(coalesce(input->'validation_diagnostics','{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(input->'source_payload','null'::jsonb)) not in ('object','array')
     or jsonb_typeof(coalesce(input->'payload','null'::jsonb)) <> 'object'
     or btrim(source_text) = ''
     or btrim(payload_text) = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_PROJECTION_SCOPE_REQUIRED';
  end if;

  begin
    source_value := source_text::jsonb;
    payload_value := payload_text::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'PRODUCTION_PROJECTION_CANONICAL_JSON_INVALID';
  end;

  if source_value is distinct from input->'source_payload'
     or payload_value is distinct from input->'payload'
     or encode(extensions.digest(source_text,'sha256'),'hex')
       <> lower(btrim(input->>'source_fingerprint'))
     or encode(extensions.digest(payload_text,'sha256'),'hex')
       <> lower(btrim(input->>'payload_fingerprint')) then
    raise exception using errcode = '22023', message = 'PRODUCTION_PROJECTION_CANONICAL_EVIDENCE_MISMATCH';
  end if;

  if expected_domain = 'PREDICTION_SETTINGS' then
    settings_text := coalesce(input->>'settings_canonical_json','');
    effective_settings_text := coalesce(input->>'effective_settings_canonical_json','');
    if btrim(settings_text) = '' or btrim(effective_settings_text) = '' then
      raise exception using errcode = '22023', message = 'PRODUCTION_PREDICTION_SETTINGS_CANONICAL_EVIDENCE_REQUIRED';
    end if;
    begin
      settings_value := settings_text::jsonb;
      effective_settings_value := effective_settings_text::jsonb;
    exception when others then
      raise exception using errcode = '22023', message = 'PRODUCTION_PREDICTION_SETTINGS_CANONICAL_JSON_INVALID';
    end;
    if settings_value is distinct from input#>'{payload,settings}'
       or effective_settings_value is distinct from input#>'{payload,effective_settings}'
       or encode(extensions.digest(settings_text,'sha256'),'hex')
         <> lower(btrim(coalesce(input#>>'{payload,settings_fingerprint}','')))
       or encode(extensions.digest(effective_settings_text,'sha256'),'hex')
         <> lower(btrim(coalesce(input#>>'{payload,effective_settings_fingerprint}',''))) then
      raise exception using errcode = '22023', message = 'PRODUCTION_PREDICTION_SETTINGS_INNER_FINGERPRINT_MISMATCH';
    end if;
  end if;

  if expected_domain = 'PUBLISHED_ODDS' then
    if jsonb_typeof(input#>'{payload,snapshots}') <> 'array' then
      raise exception using errcode = '22023', message = 'PRODUCTION_PUBLISHED_ODDS_CANONICAL_EVIDENCE_REQUIRED';
    end if;
    for snapshot_item in
      select value from jsonb_array_elements(input#>'{payload,snapshots}')
    loop
      snapshot_text := coalesce(snapshot_item->>'published_payload_canonical_json','');
      if btrim(snapshot_text) = '' then
        raise exception using errcode = '22023', message = 'PRODUCTION_PUBLISHED_ODDS_CANONICAL_EVIDENCE_REQUIRED';
      end if;
      begin
        snapshot_value := snapshot_text::jsonb;
      exception when others then
        raise exception using errcode = '22023', message = 'PRODUCTION_PUBLISHED_ODDS_CANONICAL_JSON_INVALID';
      end;
      if snapshot_value is distinct from snapshot_item->'published_payload'
         or encode(extensions.digest(snapshot_text,'sha256'),'hex')
           <> lower(btrim(coalesce(snapshot_item->>'payload_hash',''))) then
        raise exception using errcode = '22023', message = 'PRODUCTION_PUBLISHED_ODDS_SNAPSHOT_HASH_MISMATCH';
      end if;
    end loop;
  end if;

  if scope.current_tournament_read_authority <> 'GOOGLE'
     or scope.scoring_authority <> 'GOOGLE'
     or scope.participant_identity_authority <> 'PASSPORT'
     or scope.public_supabase_reads_enabled
     or scope.scoring_ingress_enabled
     or scope.google_writes_enabled
     or scope.auth_user_creation_enabled
     or scope.odds_publication_enabled
     or scope.workers_enabled then
    raise exception using errcode = '42501', message = 'DORMANT_PRODUCTION_FOUNDATION_REQUIRED';
  end if;

  if not exists (
    select 1 from production_control.tournament_scopes s
    where s.tournament_id = scope.current_tournament_id
      and s.tournament_year = scope.current_tournament_year
      and s.source_workbook_id = scope.google_workbook_id
      and s.scope_kind = 'CURRENT_TOURNAMENT'
      and s.active_for_shadow_import
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_TOURNAMENT_SCOPE_REQUIRED';
  end if;
end;
$$;

revoke all on function production_control.assert_projection_scope(jsonb,text,text,jsonb)
  from public, anon, authenticated, service_role;

-- The v1 current import accepted a caller-supplied authorization object and
-- could replace current data. Keep its public contract present for explicit
-- diagnostics, but make every service-role call a non-mutating fail-closed
-- result until a v2 claim/entitlement contract is separately reviewed.
create or replace function public.import_production_current_tournament_shadow(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp
as $$
begin
  return jsonb_build_object(
    'ok', false,
    'code', 'PRODUCTION_CURRENT_SHADOW_IMPORT_V2_REQUIRED',
    'blocked', true,
    'changed', false,
    'shadow_only', true,
    'authoritative', false,
    'google_write', false,
    'scoring_ingress', 'DISABLED'
  );
end;
$$;
revoke all on function public.import_production_current_tournament_shadow(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_production_current_tournament_shadow(jsonb) to service_role;

-- Completed history was certified and loaded year-by-year during S2. Freeze
-- that mutation surface until a reviewed correction entitlement is added;
-- keep the service-role readback RPC available for parity and drift checks.
revoke all on function public.import_production_completed_history_year(jsonb)
  from public, anon, authenticated, service_role;

-- Preserve the already-applied v1 implementations as inaccessible private
-- helpers and front them with actionable prerequisite checks. This prevents a
-- missing 2026 tournament from surfacing as a generic FK/import exception.
alter function public.import_production_net_skins_configuration(jsonb)
  rename to import_production_net_skins_configuration_v1_internal;
alter function public.import_production_net_skins_configuration_v1_internal(jsonb)
  set schema production_control;
revoke all on function production_control.import_production_net_skins_configuration_v1_internal(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.import_production_net_skins_configuration(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Net Skins"]'::jsonb;
begin
  perform production_control.assert_projection_scope(
    input,'NET_SKINS_CONFIGURATION','net-skins-configuration-v1',tabs
  );
  if not exists (
    select 1 from scoring_authority.tournaments
    where tournament_id='2026' and tournament_year=2026
      and source_workbook_id=input->>'source_workbook_id'
  ) then
    return jsonb_build_object(
      'ok',false,'code','PRODUCTION_NET_SKINS_TOURNAMENT_REQUIRED',
      'changed',false,'shadow_only',true
    );
  end if;
  return production_control.import_production_net_skins_configuration_v1_internal(input);
end;
$$;
revoke all on function public.import_production_net_skins_configuration(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_production_net_skins_configuration(jsonb) to service_role;

alter function public.import_production_calcutta_configuration(jsonb)
  rename to import_production_calcutta_configuration_v1_internal;
alter function public.import_production_calcutta_configuration_v1_internal(jsonb)
  set schema production_control;
revoke all on function production_control.import_production_calcutta_configuration_v1_internal(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.import_production_calcutta_configuration(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Calcutta Purchases","Calcutta Ownership","Calcutta Point Structure","Calcutta Payout"]'::jsonb;
begin
  perform production_control.assert_projection_scope(
    input,'CALCUTTA_CONFIGURATION','calcutta-configuration-v1',tabs
  );
  if not exists (
    select 1 from scoring_authority.tournaments
    where tournament_id='2026' and tournament_year=2026
      and source_workbook_id=input->>'source_workbook_id'
  ) then
    return jsonb_build_object(
      'ok',false,'code','PRODUCTION_CALCUTTA_TOURNAMENT_REQUIRED',
      'changed',false,'shadow_only',true
    );
  end if;
  return production_control.import_production_calcutta_configuration_v1_internal(input);
end;
$$;
revoke all on function public.import_production_calcutta_configuration(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_production_calcutta_configuration(jsonb) to service_role;

notify pgrst,'reload schema';
commit;
