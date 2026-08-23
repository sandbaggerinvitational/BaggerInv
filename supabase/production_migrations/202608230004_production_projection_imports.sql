-- Step 10A: dormant, Production-scoped projection import/read contracts.
--
-- These operations populate shadow projections from the Production workbook only.
-- They do not enable public reads, scoring ingress, workers, Google writes, Auth user
-- creation, Odds publication, or any application authority change.
begin;

create table production_control.projection_revisions (
  revision_id uuid primary key default extensions.gen_random_uuid(),
  domain text not null check (domain in (
    'GUIDE','PLAYER_EDITORIAL','PREDICTION_SETTINGS','DRAFT',
    'NET_SKINS_CONFIGURATION','CALCUTTA_CONFIGURATION','PUBLISHED_ODDS'
  )),
  tournament_id text not null check (tournament_id = '2026'),
  tournament_year integer not null check (tournament_year = 2026),
  revision_number bigint not null check (revision_number > 0),
  previous_revision_id uuid references production_control.projection_revisions(revision_id),
  project_ref text not null check (project_ref = 'ymqhhtxaywtqllynrmxe'),
  project_url text not null check (project_url = 'https://ymqhhtxaywtqllynrmxe.supabase.co'),
  source_workbook_id text not null check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  source_tabs jsonb not null check (jsonb_typeof(source_tabs) = 'array'),
  contract_version text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  source_payload jsonb not null check (jsonb_typeof(source_payload) in ('object','array')),
  projection_payload jsonb not null check (jsonb_typeof(projection_payload) = 'object'),
  validation_status text not null check (validation_status in ('VALID','NOT_CONFIGURED')),
  validation_diagnostics jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_diagnostics) = 'object'),
  imported_by text not null check (btrim(imported_by) <> ''),
  imported_at timestamptz not null default now(),
  unique (domain, tournament_id, revision_number),
  check (previous_revision_id is null or revision_number > 1)
);

create table production_control.projection_current (
  domain text not null,
  tournament_id text not null check (tournament_id = '2026'),
  revision_id uuid not null references production_control.projection_revisions(revision_id),
  advanced_by text not null check (btrim(advanced_by) <> ''),
  advanced_at timestamptz not null default now(),
  primary key (domain, tournament_id),
  unique (revision_id)
);

create table production_control.player_editorial_facts (
  revision_id uuid not null references production_control.projection_revisions(revision_id),
  player_id text not null references scoring_authority.players(player_id),
  public_profile jsonb not null check (jsonb_typeof(public_profile) = 'object'),
  primary key (revision_id, player_id)
);

alter table production_control.projection_revisions enable row level security;
alter table production_control.projection_current enable row level security;
alter table production_control.player_editorial_facts enable row level security;
revoke all on production_control.projection_revisions from public, anon, authenticated, service_role;
revoke all on production_control.projection_current from public, anon, authenticated, service_role;
revoke all on production_control.player_editorial_facts from public, anon, authenticated, service_role;
grant select on production_control.projection_revisions to service_role;
grant select on production_control.projection_current to service_role;
grant select on production_control.player_editorial_facts to service_role;

create or replace function production_control.assert_projection_scope(
  input jsonb,
  expected_domain text,
  expected_contract text,
  expected_tabs jsonb
) returns void
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
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
     or jsonb_typeof(coalesce(input->'payload','null'::jsonb)) <> 'object' then
    raise exception using errcode = '42501', message = 'PRODUCTION_PROJECTION_SCOPE_REQUIRED';
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

create or replace function production_control.assert_projection_read_scope(
  input jsonb,
  expected_domain text,
  expected_contract text,
  expected_tabs jsonb
) returns void
language plpgsql
security definer
stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
begin
  select * into strict scope from production_control.resource_scope
  where scope_key='BAGGER_INV_PRODUCTION';
  if upper(btrim(coalesce(input->>'environment','')))<>'PRODUCTION'
     or btrim(coalesce(input->>'project_ref',''))<>scope.project_ref
     or btrim(coalesce(input->>'project_url',''))<>scope.project_url
     or btrim(coalesce(input->>'source_workbook_id',''))<>scope.google_workbook_id
     or btrim(coalesce(input->>'tournament_id',''))<>scope.current_tournament_id
     or coalesce((input->>'tournament_year')::integer,0)<>scope.current_tournament_year
     or upper(btrim(coalesce(input->>'domain','')))<>expected_domain
     or btrim(coalesce(input->>'contract_version',''))<>expected_contract
     or coalesce(input->'source_tabs','null'::jsonb)<>expected_tabs then
    raise exception using errcode='42501',message='PRODUCTION_PROJECTION_READ_SCOPE_REQUIRED';
  end if;
  if scope.current_tournament_read_authority<>'GOOGLE'
     or scope.scoring_authority<>'GOOGLE'
     or scope.participant_identity_authority<>'PASSPORT'
     or scope.public_supabase_reads_enabled or scope.scoring_ingress_enabled
     or scope.google_writes_enabled or scope.auth_user_creation_enabled
     or scope.odds_publication_enabled or scope.workers_enabled then
    raise exception using errcode='42501',message='DORMANT_PRODUCTION_FOUNDATION_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.register_projection_revision(
  input jsonb,
  expected_domain text,
  expected_contract text,
  expected_tabs jsonb
) returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  current_revision production_control.projection_revisions%rowtype;
  inserted_revision production_control.projection_revisions%rowtype;
  next_revision bigint;
  source_hash text := lower(btrim(input->>'source_fingerprint'));
  payload_hash text := lower(btrim(input->>'payload_fingerprint'));
  actor text := btrim(input->>'requested_by');
  existing_run production_control.import_runs%rowtype;
begin
  perform production_control.assert_projection_scope(input, expected_domain, expected_contract, expected_tabs);
  perform pg_advisory_xact_lock(hashtext('production-projection:' || expected_domain || ':2026'));

  select r.* into current_revision
  from production_control.projection_current c
  join production_control.projection_revisions r on r.revision_id = c.revision_id
  where c.domain = expected_domain and c.tournament_id = '2026'
  for update of c;

  if current_revision.revision_id is not null
     and current_revision.payload_fingerprint = payload_hash then
    if current_revision.source_fingerprint = source_hash then
      return jsonb_build_object(
        'ok', true, 'changed', false, 'duplicate', true,
        'revision_id', current_revision.revision_id,
        'revision_number', current_revision.revision_number,
        'source_fingerprint', source_hash,
        'payload_fingerprint', payload_hash,
        'validation_status', current_revision.validation_status
      );
    end if;
    -- A source-only change is recorded in the immutable import ledger but does
    -- not manufacture a duplicate effective projection revision.
    select * into existing_run from production_control.import_runs
    where domain = expected_domain and tournament_id = '2026' and tournament_year = 2026
      and source_workbook_id = input->>'source_workbook_id'
      and source_fingerprint = source_hash and payload_fingerprint = payload_hash;
    if existing_run.import_run_id is null then
      insert into production_control.import_runs (
        domain,tournament_id,tournament_year,source_workbook_id,source_fingerprint,
        payload_fingerprint,database_fingerprint,importer_contract,actor,status,
        previous_import_run_id,counts,completed_at
      ) values (
        expected_domain,'2026',2026,input->>'source_workbook_id',source_hash,
        payload_hash,payload_hash,expected_contract,actor,'DUPLICATE',
        (select import_run_id from production_control.import_runs
          where domain=expected_domain and tournament_id='2026'
          order by started_at desc limit 1),
        jsonb_build_object('effectiveRevisionReused',true),now()
      );
    end if;
    return jsonb_build_object(
      'ok', true, 'changed', false, 'duplicate', true,
      'source_changed_only', true,
      'revision_id', current_revision.revision_id,
      'revision_number', current_revision.revision_number,
      'source_fingerprint', source_hash,
      'payload_fingerprint', payload_hash,
      'validation_status', current_revision.validation_status
    );
  end if;

  if current_revision.revision_id is not null
     and current_revision.source_fingerprint = source_hash
     and current_revision.payload_fingerprint <> payload_hash then
    raise exception using errcode = '23514', message = 'PRODUCTION_SOURCE_PROJECTION_CONFLICT';
  end if;

  select coalesce(max(revision_number),0)+1 into next_revision
  from production_control.projection_revisions
  where domain = expected_domain and tournament_id = '2026';

  insert into production_control.projection_revisions (
    domain,tournament_id,tournament_year,revision_number,previous_revision_id,
    project_ref,project_url,source_workbook_id,source_tabs,contract_version,
    source_fingerprint,payload_fingerprint,source_payload,projection_payload,
    validation_status,validation_diagnostics,imported_by
  ) values (
    expected_domain,'2026',2026,next_revision,current_revision.revision_id,
    input->>'project_ref',input->>'project_url',input->>'source_workbook_id',
    input->'source_tabs',expected_contract,source_hash,payload_hash,
    input->'source_payload',input->'payload',upper(input->>'validation_status'),
    coalesce(input->'validation_diagnostics','{}'::jsonb),actor
  ) returning * into inserted_revision;

  insert into production_control.projection_current(domain,tournament_id,revision_id,advanced_by)
  values(expected_domain,'2026',inserted_revision.revision_id,actor)
  on conflict(domain,tournament_id) do update set
    revision_id=excluded.revision_id,advanced_by=excluded.advanced_by,advanced_at=now();

  insert into production_control.import_runs (
    domain,tournament_id,tournament_year,source_workbook_id,source_fingerprint,
    payload_fingerprint,database_fingerprint,importer_contract,actor,status,
    previous_import_run_id,counts,completed_at
  ) values (
    expected_domain,'2026',2026,input->>'source_workbook_id',source_hash,
    payload_hash,payload_hash,expected_contract,actor,'SUCCEEDED',
    (select import_run_id from production_control.import_runs
      where domain=expected_domain and tournament_id='2026'
      order by started_at desc limit 1),
    jsonb_build_object('revisionId',inserted_revision.revision_id,'revisionNumber',next_revision),now()
  );

  insert into production_control.operation_audit_events(
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_SHADOW_PROJECTION_IMPORTED',expected_domain,'2026',actor,
    source_hash,'SUCCEEDED',jsonb_build_object(
      'revisionId',inserted_revision.revision_id,'revisionNumber',next_revision,
      'previousRevisionId',current_revision.revision_id,'payloadFingerprint',payload_hash,
      'validationStatus',inserted_revision.validation_status,'authorityChanged',false,
      'googleWrite',false,'publicReadEnabled',false
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'duplicate', false,
    'revision_id', inserted_revision.revision_id,
    'revision_number', inserted_revision.revision_number,
    'previous_revision_id', inserted_revision.previous_revision_id,
    'source_fingerprint', source_hash,
    'payload_fingerprint', payload_hash,
    'validation_status', inserted_revision.validation_status
  );
end;
$$;

create or replace function production_control.read_projection(
  input jsonb,
  expected_domain text,
  expected_contract text,
  expected_tabs jsonb
) returns jsonb
language plpgsql
security definer
stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  revision production_control.projection_revisions%rowtype;
begin
  perform production_control.assert_projection_read_scope(input, expected_domain, expected_contract, expected_tabs);
  select r.* into revision
  from production_control.projection_current c
  join production_control.projection_revisions r on r.revision_id=c.revision_id
  where c.domain=expected_domain and c.tournament_id='2026';
  if revision.revision_id is null then
    return jsonb_build_object('ok',false,'code',expected_domain || '_PROJECTION_UNAVAILABLE');
  end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'domain',revision.domain,'tournament_id',revision.tournament_id,
    'tournament_year',revision.tournament_year,'revision_id',revision.revision_id,
    'revision_number',revision.revision_number,'previous_revision_id',revision.previous_revision_id,
    'source_workbook_id',revision.source_workbook_id,'source_tabs',revision.source_tabs,
    'contract_version',revision.contract_version,'source_fingerprint',revision.source_fingerprint,
    'payload_fingerprint',revision.payload_fingerprint,'validation_status',revision.validation_status,
    'validation_diagnostics',revision.validation_diagnostics,'payload',revision.projection_payload,
    'imported_by',revision.imported_by,'imported_at',revision.imported_at,
    'google_foreground_requests',0,'fallback_used',false,'authoritative',false,'shadow_only',true
  ));
end;
$$;

revoke all on function production_control.assert_projection_scope(jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function production_control.assert_projection_read_scope(jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function production_control.register_projection_revision(jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function production_control.read_projection(jsonb,text,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.import_production_guide_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Tournaments","Guide Sections","Tournament Itinerary","Tournament Timeline","Rule Book","Tournament Rules","Rounds","Dining","Local Guide","Important Contacts","Courses"]'::jsonb;
  registration jsonb;
  source_text text := coalesce(input->>'source_canonical_json','');
  content_text text := coalesce(input->>'content_canonical_json','');
  payload_text text := coalesce(input->>'payload_canonical_json','');
  source_value jsonb;
  content_value jsonb;
  payload_value jsonb;
  guide_revision_id uuid;
  revision_number bigint;
begin
  perform production_control.assert_projection_scope(input,'GUIDE','guide-projection-v1',tabs);
  if upper(input->>'validation_status') <> 'VALID'
     or btrim(source_text)='' or btrim(content_text)='' or btrim(payload_text)='' then
    return jsonb_build_object('ok',false,'code','VALIDATED_PRODUCTION_GUIDE_PROJECTION_REQUIRED');
  end if;
  begin
    source_value := source_text::jsonb;
    content_value := content_text::jsonb;
    payload_value := payload_text::jsonb;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'code','PRODUCTION_GUIDE_CANONICAL_JSON_INVALID');
  end;
  if jsonb_typeof(source_value)<>'object' or jsonb_typeof(content_value)<>'object'
     or jsonb_typeof(payload_value)<>'object'
     or source_value->>'tournamentId'<>'2026'
     or content_value#>>'{tournamentIdentity,id}'<>'2026'
     or coalesce((content_value#>>'{tournamentIdentity,year}')::integer,0)<>2026
     or payload_value<>input->'payload'
     or payload_value->>'schemaVersion'<>'guide-projection-v1'
     or payload_value->'content'<>content_value
     or encode(extensions.digest(source_text,'sha256'),'hex')<>lower(input->>'source_fingerprint')
     or encode(extensions.digest(content_text,'sha256'),'hex')<>lower(btrim(input->>'content_fingerprint'))
     or encode(extensions.digest(payload_text,'sha256'),'hex')<>lower(input->>'payload_fingerprint') then
    return jsonb_build_object('ok',false,'code','PRODUCTION_GUIDE_PROJECTION_HASH_MISMATCH');
  end if;
  if not exists(select 1 from scoring_authority.tournaments
    where tournament_id='2026' and tournament_year=2026
      and source_workbook_id=input->>'source_workbook_id') then
    return jsonb_build_object('ok',false,'code','PRODUCTION_GUIDE_TOURNAMENT_REQUIRED');
  end if;

  registration := production_control.register_projection_revision(input,'GUIDE','guide-projection-v1',tabs);
  if not coalesce((registration->>'changed')::boolean,false) then return registration; end if;
  revision_number := (registration->>'revision_number')::bigint;
  insert into scoring_authority.guide_content_revisions(
    tournament_id,projection_revision,source_workbook_id,content_fingerprint,
    source_workbook_fingerprint,payload_hash,source_canonical_json,content_canonical_json,
    payload_canonical_json,content_payload,validation_status,source_metadata,
    source_sync_sequence,trigger_type,imported_by
  ) values(
    '2026',revision_number,input->>'source_workbook_id',lower(input->>'content_fingerprint'),
    lower(input->>'source_fingerprint'),lower(input->>'payload_fingerprint'),source_text,
    content_text,payload_text,input->'payload','VALID',coalesce(input->'source_metadata','{}'::jsonb),
    revision_number,case when revision_number=1 then 'INITIAL' else 'MANUAL' end,input->>'requested_by'
  ) returning revision_id into guide_revision_id;
  insert into scoring_authority.guide_projection_current(
    tournament_id,source_workbook_id,revision_id,publication_sequence,source_sync_sequence
  ) values('2026',input->>'source_workbook_id',guide_revision_id,revision_number,revision_number)
  on conflict(tournament_id) do update set source_workbook_id=excluded.source_workbook_id,
    revision_id=excluded.revision_id,publication_sequence=excluded.publication_sequence,
    source_sync_sequence=excluded.source_sync_sequence,published_at=now(),last_verified_at=now();
  return registration || jsonb_build_object('guide_revision_id',guide_revision_id,
    'content_fingerprint',lower(input->>'content_fingerprint'),'shadow_only',true);
exception when others then
  return jsonb_build_object('ok',false,'code','PRODUCTION_GUIDE_PROJECTION_IMPORT_FAILED');
end;
$$;
revoke all on function public.import_production_guide_projection(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_production_guide_projection(jsonb) to service_role;

create or replace function public.read_production_guide_projection(input jsonb)
returns jsonb language sql security definer stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
  select production_control.read_projection($1,'GUIDE','guide-projection-v1',
    '["Tournaments","Guide Sections","Tournament Itinerary","Tournament Timeline","Rule Book","Tournament Rules","Rounds","Dining","Local Guide","Important Contacts","Courses"]'::jsonb)
$$;
revoke all on function public.read_production_guide_projection(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_production_guide_projection(jsonb) to service_role;

create or replace function public.import_production_player_editorial(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Players"]'::jsonb;
  registration jsonb;
  revision uuid;
  player_count integer;
  canonical_count integer;
begin
  perform production_control.assert_projection_scope(input,'PLAYER_EDITORIAL','player-public-profile-v1',tabs);
  if upper(input->>'validation_status')<>'VALID'
     or jsonb_typeof(input#>'{payload,players}')<>'array'
     or jsonb_array_length(input#>'{payload,players}')=0 then
    return jsonb_build_object('ok',false,'code','COMPLETE_PRODUCTION_PLAYER_EDITORIAL_REQUIRED');
  end if;
  player_count := jsonb_array_length(input#>'{payload,players}');
  select count(*) into canonical_count from scoring_authority.players;
  if canonical_count=0 or player_count<>canonical_count
     or (select count(distinct value->>'player_id') from jsonb_array_elements(input#>'{payload,players}'))<>player_count
     or exists(select 1 from jsonb_array_elements(input#>'{payload,players}') value
       where btrim(coalesce(value->>'player_id',''))=''
         or jsonb_typeof(value->'public_profile')<>'object'
         or btrim(coalesce(value->'public_profile'->>'Display Name',''))=''
         or btrim(coalesce(value->'public_profile'->>'Slug',''))=''
         or not exists(select 1 from scoring_authority.players p where p.player_id=value->>'player_id'))
     or exists(select 1 from scoring_authority.players p where not exists(
       select 1 from jsonb_array_elements(input#>'{payload,players}') value
       where value->>'player_id'=p.player_id)) then
    return jsonb_build_object('ok',false,'code','PRODUCTION_PLAYER_EDITORIAL_IDENTITY_DIVERGENCE');
  end if;
  registration := production_control.register_projection_revision(input,'PLAYER_EDITORIAL','player-public-profile-v1',tabs);
  if not coalesce((registration->>'changed')::boolean,false) then return registration; end if;
  revision := (registration->>'revision_id')::uuid;
  insert into production_control.player_editorial_facts(revision_id,player_id,public_profile)
  select revision,value->>'player_id',value->'public_profile'
  from jsonb_array_elements(input#>'{payload,players}') value;
  return registration || jsonb_build_object('player_count',player_count,'shadow_only',true);
exception when others then
  return jsonb_build_object('ok',false,'code','PRODUCTION_PLAYER_EDITORIAL_IMPORT_FAILED');
end;
$$;
revoke all on function public.import_production_player_editorial(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_production_player_editorial(jsonb) to service_role;

create or replace function public.read_production_player_editorial(input jsonb)
returns jsonb language sql security definer stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$ select production_control.read_projection($1,'PLAYER_EDITORIAL','player-public-profile-v1','["Players"]'::jsonb) $$;
revoke all on function public.read_production_player_editorial(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_production_player_editorial(jsonb) to service_role;

create or replace function public.import_production_prediction_settings(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Prediction Settings"]'::jsonb;
  registration jsonb;
  payload jsonb := input->'payload';
  current_config scoring_authority.odds_input_configurations%rowtype;
  next_revision bigint;
  next_bundle text;
  config_id uuid;
begin
  perform production_control.assert_projection_scope(input,'PREDICTION_SETTINGS','prediction-settings-v1',tabs);
  if upper(input->>'validation_status')<>'VALID'
     or jsonb_typeof(payload->'settings')<>'array'
     or jsonb_typeof(payload->'canonical_settings')<>'object'
     or jsonb_typeof(payload->'effective_settings')<>'object'
     or scoring_authority.jsonb_object_length(payload->'canonical_settings')<>30
     or scoring_authority.jsonb_object_length(payload->'effective_settings')<>30
     or lower(btrim(coalesce(payload->>'settings_fingerprint',''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(payload->>'effective_settings_fingerprint',''))) !~ '^[0-9a-f]{64}$'
     or coalesce(payload->>'settings_contract_version','')<>'prediction-settings-v1'
     or coalesce(payload->>'source_tab','')<>'Prediction Settings' then
    return jsonb_build_object('ok',false,'code','COMPLETE_VALID_PRODUCTION_PREDICTION_SETTINGS_REQUIRED');
  end if;
  select * into current_config from scoring_authority.odds_input_configurations
  where tournament_id='2026' and is_current for update;
  if current_config.id is null then
    return jsonb_build_object('ok',false,'code','PRODUCTION_ODDS_INPUT_CONFIGURATION_REQUIRED');
  end if;
  registration := production_control.register_projection_revision(input,'PREDICTION_SETTINGS','prediction-settings-v1',tabs);
  if not coalesce((registration->>'changed')::boolean,false) then return registration; end if;
  select coalesce(max(configuration_revision),0)+1 into next_revision
  from scoring_authority.odds_input_configurations where tournament_id='2026';
  next_bundle := encode(extensions.digest(jsonb_build_object(
    'tournament_id','2026','source_fingerprint',lower(input->>'source_fingerprint'),
    'effective_settings_fingerprint',lower(payload->>'effective_settings_fingerprint'),
    'ratings_fingerprint',current_config.ratings_fingerprint,
    'pairing_fingerprint',current_config.pairing_fingerprint,
    'previous_configuration_id',current_config.id,'configuration_revision',next_revision
  )::text,'sha256'),'hex');
  update scoring_authority.odds_input_configurations set is_current=false,superseded_at=now()
  where tournament_id='2026' and is_current;
  insert into scoring_authority.odds_input_configurations(
    tournament_id,configuration_revision,source_workbook_id,settings,historical_ratings,
    settings_fingerprint,ratings_fingerprint,pairing_fingerprint,bundle_fingerprint,is_current,
    imported_by,source_tab,source_fingerprint,canonical_settings,effective_settings,
    effective_settings_fingerprint,settings_contract_version,validation_status,
    validation_diagnostics,synchronized_at,previous_configuration_id
  ) values(
    '2026',next_revision,input->>'source_workbook_id',payload->'settings',current_config.historical_ratings,
    lower(payload->>'settings_fingerprint'),current_config.ratings_fingerprint,current_config.pairing_fingerprint,
    next_bundle,true,input->>'requested_by','Prediction Settings',lower(input->>'source_fingerprint'),
    payload->'canonical_settings',payload->'effective_settings',
    lower(payload->>'effective_settings_fingerprint'),'prediction-settings-v1','VALID',
    coalesce(input->'validation_diagnostics','{}'::jsonb),now(),current_config.id
  ) returning id into config_id;
  insert into scoring_authority.odds_input_import_runs(tournament_id,bundle_fingerprint,status,requested_by)
  values('2026',next_bundle,'APPLIED',input->>'requested_by');
  return registration || jsonb_build_object('configuration_id',config_id,
    'configuration_revision',next_revision,'bundle_fingerprint',next_bundle,
    'effective_settings_fingerprint',lower(payload->>'effective_settings_fingerprint'),'shadow_only',true);
exception when others then
  return jsonb_build_object('ok',false,'code','PRODUCTION_PREDICTION_SETTINGS_IMPORT_FAILED');
end;
$$;
revoke all on function public.import_production_prediction_settings(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_production_prediction_settings(jsonb) to service_role;

create or replace function public.read_production_prediction_settings(input jsonb)
returns jsonb language sql security definer stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$ select production_control.read_projection($1,'PREDICTION_SETTINGS','prediction-settings-v1','["Prediction Settings"]'::jsonb) $$;
revoke all on function public.read_production_prediction_settings(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_production_prediction_settings(jsonb) to service_role;

create or replace function public.import_production_draft_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Draft Settings","Draft Picks"]'::jsonb;
  registration jsonb;
  draft jsonb;
  pick jsonb;
  target text;
  target_year integer;
  current_revision scoring_authority.draft_revisions%rowtype;
  inserted_revision scoring_authority.draft_revisions%rowtype;
  next_revision bigint;
  operation_value text;
  correction text;
  pick_count integer;
  distinct_pick_count integer;
  selected_count integer;
  distinct_player_count integer;
  minimum_pick integer;
  maximum_pick integer;
  results jsonb := '[]'::jsonb;
begin
  perform production_control.assert_projection_scope(input,'DRAFT','draft-projection-v1',tabs);
  if upper(input->>'validation_status')<>'VALID'
     or jsonb_typeof(input#>'{payload,drafts}')<>'array'
     or jsonb_array_length(input#>'{payload,drafts}')=0 then
    return jsonb_build_object('ok',false,'code','COMPLETE_VALID_PRODUCTION_DRAFT_PROJECTION_REQUIRED');
  end if;
  -- Validate the complete batch before registering or writing any revision.
  for draft in select value from jsonb_array_elements(input#>'{payload,drafts}') loop
    target:=btrim(coalesce(draft->>'tournament_id',''));
    target_year:=coalesce((draft->>'tournament_year')::integer,0);
    if target<>target_year::text or target_year not between 2017 and 2026
       or lower(btrim(coalesce(draft->>'source_fingerprint',''))) !~ '^[0-9a-f]{64}$'
       or lower(btrim(coalesce(draft->>'configuration_fingerprint',''))) !~ '^[0-9a-f]{64}$'
       or lower(btrim(coalesce(draft->>'picks_fingerprint',''))) !~ '^[0-9a-f]{64}$'
       or lower(btrim(coalesce(draft->>'payload_fingerprint',''))) !~ '^[0-9a-f]{64}$'
       or upper(btrim(coalesce(draft->>'validation_status',''))) <> 'VALID'
       or jsonb_typeof(draft->'validation_diagnostics')<>'object'
       or jsonb_typeof(draft->'source_settings')<>'object'
       or jsonb_typeof(draft->'source_picks')<>'array'
       or jsonb_typeof(draft->'configuration')<>'object'
       or jsonb_typeof(draft->'picks')<>'array'
       or jsonb_typeof(draft->'presentation_seed')<>'object'
       or not exists(select 1 from scoring_authority.tournaments t
         where t.tournament_id=target and t.tournament_year=target_year
           and t.source_workbook_id=input->>'source_workbook_id') then
      return jsonb_build_object('ok',false,'code','PRODUCTION_DRAFT_REVISION_INVALID','year',target_year);
    end if;
    pick_count:=jsonb_array_length(draft->'picks');
    if pick_count=0 or pick_count<>coalesce((draft#>>'{configuration,total_picks}')::integer,0)
       or not exists(select 1 from scoring_authority.teams where tournament_id=target and team_id=draft#>>'{configuration,team_1_id}')
       or not exists(select 1 from scoring_authority.teams where tournament_id=target and team_id=draft#>>'{configuration,team_2_id}')
       or not exists(select 1 from scoring_authority.teams where tournament_id=target and team_id=draft#>>'{configuration,first_pick_team_id}') then
      return jsonb_build_object('ok',false,'code','PRODUCTION_DRAFT_CONFIGURATION_INVALID','year',target_year);
    end if;
    select count(distinct (value->>'pick_number')::integer),min((value->>'pick_number')::integer),
      max((value->>'pick_number')::integer),
      count(*) filter(where nullif(value->>'player_id','') is not null),
      count(distinct nullif(value->>'player_id','')) filter(where nullif(value->>'player_id','') is not null)
    into distinct_pick_count,minimum_pick,maximum_pick,selected_count,distinct_player_count
    from jsonb_array_elements(draft->'picks');
    if distinct_pick_count<>pick_count or minimum_pick<>1 or maximum_pick<>pick_count
       or selected_count<>distinct_player_count then
      return jsonb_build_object('ok',false,'code','PRODUCTION_DRAFT_PICK_ORDER_INVALID','year',target_year);
    end if;
    for pick in select value from jsonb_array_elements(draft->'picks') loop
      if (pick->>'round_number')::integer<>(((pick->>'pick_number')::integer-1)/2)+1
         or (pick->>'pick_within_round')::integer<>mod((pick->>'pick_number')::integer-1,2)+1
         or upper(btrim(coalesce(pick->>'status',''))) not in ('PENDING','SELECTED')
         or (upper(btrim(coalesce(pick->>'status','')))='PENDING' and nullif(pick->>'player_id','') is not null)
         or (upper(btrim(coalesce(pick->>'status','')))='SELECTED' and
           (nullif(pick->>'player_id','') is null or nullif(pick->>'team_id','') is null))
         or (nullif(pick->>'player_id','') is not null and not exists(
           select 1 from scoring_authority.tournament_players tp
           where tp.tournament_id=target and tp.player_id=pick->>'player_id' and tp.team_id=pick->>'team_id')) then
        return jsonb_build_object('ok',false,'code','PRODUCTION_DRAFT_PICK_INVALID','year',target_year,'pick',pick->>'pick_number');
      end if;
    end loop;
  end loop;

  registration:=production_control.register_projection_revision(input,'DRAFT','draft-projection-v1',tabs);
  if not coalesce((registration->>'changed')::boolean,false) then return registration; end if;
  perform set_config('scoring_authority.draft_projection_import','on',true);
  for draft in select value from jsonb_array_elements(input#>'{payload,drafts}') loop
    current_revision:=null;
    target:=draft->>'tournament_id'; target_year:=(draft->>'tournament_year')::integer;
    perform pg_advisory_xact_lock(hashtext('production-draft-projection:'||target));
    select r.* into current_revision from scoring_authority.draft_current_revisions c
    join scoring_authority.draft_revisions r on r.revision_id=c.revision_id
    where c.tournament_id=target for update of c;
    if current_revision.revision_id is not null and current_revision.payload_fingerprint=draft->>'payload_fingerprint' then
      results:=results||jsonb_build_array(jsonb_build_object('year',target_year,'changed',false,
        'revision_id',current_revision.revision_id,'revision_number',current_revision.revision_number));
      continue;
    end if;
    if current_revision.revision_id is null then operation_value:='INITIAL_IMPORT'; correction:=null;
    elsif target_year<2026 then
      correction:=nullif(btrim(coalesce(draft->>'correction_reason','')),'');
      if correction is null or length(correction)<10 then
        raise exception using errcode='23514',message='PRODUCTION_DRAFT_HISTORICAL_CORRECTION_REASON_REQUIRED';
      end if;
      operation_value:='HISTORICAL_CORRECTION';
    else operation_value:='CURRENT_SYNC'; correction:=null; end if;
    select coalesce(max(revision_number),0)+1 into next_revision
    from scoring_authority.draft_revisions where tournament_id=target;
    insert into scoring_authority.draft_revisions(
      project_ref,source_workbook_id,source_tabs,tournament_id,tournament_year,revision_number,
      previous_revision_id,source_fingerprint,configuration_fingerprint,picks_fingerprint,payload_fingerprint,
      contract_version,validation_status,validation_diagnostics,source_settings,source_picks,
      configuration,presentation_seed,operation,correction_reason,synchronized_by
    ) values(
      input->>'project_ref',input->>'source_workbook_id',tabs,target,target_year,next_revision,
      current_revision.revision_id,lower(draft->>'source_fingerprint'),lower(draft->>'configuration_fingerprint'),
      lower(draft->>'picks_fingerprint'),lower(draft->>'payload_fingerprint'),'draft-projection-v1','VALID',
      draft->'validation_diagnostics',draft->'source_settings',draft->'source_picks',draft->'configuration',
      draft->'presentation_seed',operation_value,correction,input->>'requested_by'
    ) returning * into inserted_revision;
    insert into scoring_authority.draft_configuration_facts(
      revision_id,tournament_id,tournament_year,draft_name,draft_date,draft_time,time_zone,location,
      status_mode,draft_format,total_picks,team_1_id,team_2_id,team_1_captain_player_id,
      team_2_captain_player_id,first_pick_team_id,notes
    ) values(
      inserted_revision.revision_id,target,target_year,draft#>>'{configuration,name}',
      nullif(draft#>>'{configuration,date}',''),nullif(draft#>>'{configuration,time}',''),
      nullif(draft#>>'{configuration,time_zone}',''),nullif(draft#>>'{configuration,location}',''),
      nullif(draft#>>'{configuration,status_mode}',''),nullif(draft#>>'{configuration,format}',''),
      (draft#>>'{configuration,total_picks}')::integer,draft#>>'{configuration,team_1_id}',
      draft#>>'{configuration,team_2_id}',nullif(draft#>>'{configuration,team_1_captain_player_id}',''),
      nullif(draft#>>'{configuration,team_2_captain_player_id}',''),
      draft#>>'{configuration,first_pick_team_id}',nullif(draft#>>'{configuration,notes}',''));
    insert into scoring_authority.draft_pick_facts(
      revision_id,tournament_id,tournament_year,pick_number,round_number,pick_within_round,
      source_team_id,team_id,player_id,player_name_snapshot,selected_at_source,selected_by_source,
      pick_status,notes,presentation_snapshot
    ) select inserted_revision.revision_id,target,target_year,(value->>'pick_number')::integer,
      (value->>'round_number')::integer,(value->>'pick_within_round')::integer,
      nullif(value->>'source_team_id',''),nullif(value->>'team_id',''),nullif(value->>'player_id',''),
      nullif(value->>'player_name',''),nullif(value->>'selected_at',''),nullif(value->>'selected_by',''),
      upper(value->>'status'),nullif(value->>'notes',''),coalesce(value->'presentation','{}'::jsonb)
    from jsonb_array_elements(draft->'picks');
    insert into scoring_authority.draft_current_revisions(tournament_id,tournament_year,revision_id,advanced_by)
    values(target,target_year,inserted_revision.revision_id,input->>'requested_by')
    on conflict(tournament_id) do update set tournament_year=excluded.tournament_year,
      revision_id=excluded.revision_id,advanced_by=excluded.advanced_by,advanced_at=now();
    results:=results||jsonb_build_array(jsonb_build_object('year',target_year,'changed',true,
      'operation',operation_value,'revision_id',inserted_revision.revision_id,
      'revision_number',inserted_revision.revision_number,'previous_revision_id',current_revision.revision_id));
  end loop;
  return registration||jsonb_build_object('drafts',results,'draft_count',jsonb_array_length(results),'shadow_only',true);
exception when others then
  return jsonb_build_object('ok',false,'code','PRODUCTION_DRAFT_PROJECTION_IMPORT_FAILED');
end;
$$;
revoke all on function public.import_production_draft_projection(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_production_draft_projection(jsonb) to service_role;

create or replace function public.read_production_draft_projection(input jsonb)
returns jsonb language sql security definer stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$ select production_control.read_projection($1,'DRAFT','draft-projection-v1','["Draft Settings","Draft Picks"]'::jsonb) $$;
revoke all on function public.read_production_draft_projection(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_production_draft_projection(jsonb) to service_role;

create or replace function public.import_production_net_skins_configuration(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Net Skins"]'::jsonb;
  registration jsonb;
  round_value jsonb;
  entry_value jsonb;
  revision_number bigint;
  round_count integer:=0;
  entry_count integer:=0;
  not_configured boolean:=upper(input->>'validation_status')='NOT_CONFIGURED';
begin
  perform production_control.assert_projection_scope(input,'NET_SKINS_CONFIGURATION','net-skins-configuration-v1',tabs);
  if jsonb_typeof(input#>'{payload,rounds}')<>'array'
     or (not_configured and (input#>>'{payload,status}'<>'NOT_CONFIGURED'
       or jsonb_array_length(input#>'{payload,rounds}')<>0))
     or (not not_configured and (upper(input->>'validation_status')<>'VALID'
       or jsonb_array_length(input#>'{payload,rounds}')=0)) then
    return jsonb_build_object('ok',false,'code','PRODUCTION_NET_SKINS_CONFIGURATION_INVALID');
  end if;
  if not not_configured then
    for round_value in select value from jsonb_array_elements(input#>'{payload,rounds}') loop
      if coalesce((round_value->>'round_number')::integer,0)<=0
         or upper(btrim(coalesce(round_value->>'format',''))) not in ('BB','SC','SI')
         or lower(btrim(coalesce(round_value->>'configuration_fingerprint',''))) !~ '^[0-9a-f]{64}$'
         or jsonb_typeof(round_value->'entries')<>'array'
         or (upper(round_value->>'format')='SC' and upper(round_value->>'entry_type')<>'PAIRING')
         or (upper(round_value->>'format')<>'SC' and upper(round_value->>'entry_type')<>'INDIVIDUAL')
         or (round_value->>'buy_in_per_entry')::numeric<0
         or (round_value->>'expected_pot')::numeric<>(select count(*)*(round_value->>'buy_in_per_entry')::numeric
           from jsonb_array_elements(round_value->'entries') e where coalesce((e->>'eligible')::boolean,true)) then
        return jsonb_build_object('ok',false,'code','PRODUCTION_NET_SKINS_ROUND_INVALID');
      end if;
      for entry_value in select value from jsonb_array_elements(round_value->'entries') loop
        if btrim(coalesce(entry_value->>'entry_id',''))=''
           or btrim(coalesce(entry_value->>'player_id_1',''))=''
           or (entry_value->>'buy_in')::numeric<>(round_value->>'buy_in_per_entry')::numeric
           or not exists(select 1 from scoring_authority.tournament_players tp
             where tp.tournament_id='2026' and tp.player_id=entry_value->>'player_id_1'
               and tp.participation_status='ACTIVE')
           or (upper(round_value->>'format')='SC' and
             (btrim(coalesce(entry_value->>'player_id_2',''))='' or not exists(
               select 1 from scoring_authority.tournament_players tp where tp.tournament_id='2026'
                 and tp.player_id=entry_value->>'player_id_2' and tp.participation_status='ACTIVE'))) then
          return jsonb_build_object('ok',false,'code','PRODUCTION_NET_SKINS_ENTRY_INVALID');
        end if;
      end loop;
    end loop;
  end if;
  registration:=production_control.register_projection_revision(input,'NET_SKINS_CONFIGURATION','net-skins-configuration-v1',tabs);
  if not coalesce((registration->>'changed')::boolean,false) then return registration; end if;
  revision_number:=(registration->>'revision_number')::bigint;
  delete from scoring_authority.net_skins_configurations where tournament_id='2026';
  if not not_configured then
    for round_value in select value from jsonb_array_elements(input#>'{payload,rounds}') loop
      round_count:=round_count+1;
      insert into scoring_authority.net_skins_configurations(
        tournament_id,round_number,format,enabled,entry_type,buy_in_per_entry,expected_pot,
        completion_rule,payout_rounding,tie_rule,configuration_revision,configuration_fingerprint,
        source_workbook_id,imported_by
      ) values('2026',(round_value->>'round_number')::integer,upper(round_value->>'format'),
        coalesce((round_value->>'enabled')::boolean,true),upper(round_value->>'entry_type'),
        (round_value->>'buy_in_per_entry')::numeric,(round_value->>'expected_pot')::numeric,
        'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL','NONE','NO_SKIN_NO_CARRY',
        revision_number,lower(round_value->>'configuration_fingerprint'),input->>'source_workbook_id',input->>'requested_by');
      for entry_value in select value from jsonb_array_elements(round_value->'entries') loop
        entry_count:=entry_count+1;
        insert into scoring_authority.net_skins_configuration_entries(
          tournament_id,round_number,entry_id,match_number,format,player_id_1,player_id_2,
          team_handicap,buy_in,eligible,source_payload
        ) values('2026',(round_value->>'round_number')::integer,entry_value->>'entry_id',
          btrim(coalesce(entry_value->>'match_number','')),upper(round_value->>'format'),
          entry_value->>'player_id_1',nullif(btrim(coalesce(entry_value->>'player_id_2','')),''),
          nullif(entry_value->>'team_handicap','')::numeric,(entry_value->>'buy_in')::numeric,
          coalesce((entry_value->>'eligible')::boolean,true),coalesce(entry_value->'source_payload','{}'::jsonb));
      end loop;
    end loop;
  end if;
  insert into scoring_authority.net_skins_configuration_import_runs(
    tournament_id,source_workbook_id,configuration_fingerprint,status,round_count,entry_count,requested_by
  ) values('2026',input->>'source_workbook_id',lower(input->>'payload_fingerprint'),'APPLIED',
    round_count,entry_count,input->>'requested_by');
  return registration||jsonb_build_object('configuration_status',case when not_configured then 'NOT_CONFIGURED' else 'VALID' end,
    'round_count',round_count,'entry_count',entry_count,'recalculation_enqueued',false,'shadow_only',true);
exception when others then
  return jsonb_build_object('ok',false,'code','PRODUCTION_NET_SKINS_CONFIGURATION_IMPORT_FAILED');
end;
$$;
revoke all on function public.import_production_net_skins_configuration(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_production_net_skins_configuration(jsonb) to service_role;

create or replace function public.read_production_net_skins_configuration(input jsonb)
returns jsonb language sql security definer stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$ select production_control.read_projection($1,'NET_SKINS_CONFIGURATION','net-skins-configuration-v1','["Net Skins"]'::jsonb) $$;
revoke all on function public.read_production_net_skins_configuration(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_production_net_skins_configuration(jsonb) to service_role;

create or replace function public.import_production_calcutta_configuration(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Calcutta Purchases","Calcutta Ownership","Calcutta Point Structure","Calcutta Payout"]'::jsonb;
  registration jsonb;
  purchase jsonb;
  owner jsonb;
  not_configured boolean:=upper(input->>'validation_status')='NOT_CONFIGURED';
  purchase_count integer:=0;
  ownership_count integer:=0;
  total_market numeric:=0;
  ownership_total numeric;
  next_revision bigint;
  config_id uuid;
begin
  perform production_control.assert_projection_scope(input,'CALCUTTA_CONFIGURATION','calcutta-configuration-v1',tabs);
  if jsonb_typeof(input#>'{payload,purchases}')<>'array'
     or jsonb_typeof(input#>'{payload,ownership}')<>'array'
     or jsonb_typeof(input#>'{payload,point_structure}')<>'array'
     or jsonb_typeof(input#>'{payload,payout_structure}')<>'array'
     or jsonb_typeof(input#>'{payload,financial_contract}')<>'object'
     or (not_configured and (input#>>'{payload,status}'<>'NOT_CONFIGURED'
       or jsonb_array_length(input#>'{payload,purchases}')<>0
       or jsonb_array_length(input#>'{payload,ownership}')<>0))
     or (not not_configured and upper(input->>'validation_status')<>'VALID') then
    return jsonb_build_object('ok',false,'code','PRODUCTION_CALCUTTA_CONFIGURATION_INVALID');
  end if;
  if not not_configured then
    for purchase in select value from jsonb_array_elements(input#>'{payload,purchases}') loop
      if btrim(coalesce(purchase->>'player_id',''))=''
         or coalesce((purchase->>'purchase_price')::numeric,-1)<0
         or not exists(select 1 from scoring_authority.tournament_players tp
           where tp.tournament_id='2026' and tp.player_id=purchase->>'player_id'
             and tp.participation_status='ACTIVE')
         or (select count(*) from jsonb_array_elements(input#>'{payload,purchases}') p
           where p->>'player_id'=purchase->>'player_id')<>1 then
        return jsonb_build_object('ok',false,'code','PRODUCTION_CALCUTTA_PURCHASE_INVALID');
      end if;
      purchase_count:=purchase_count+1;
      total_market:=total_market+(purchase->>'purchase_price')::numeric;
      select coalesce(sum((o->>'ownership_fraction')::numeric),0) into ownership_total
      from jsonb_array_elements(input#>'{payload,ownership}') o
      where o->>'player_id'=purchase->>'player_id';
      if abs(ownership_total-1)>=0.000001 then
        return jsonb_build_object('ok',false,'code','PRODUCTION_CALCUTTA_OWNERSHIP_TOTAL_MISMATCH');
      end if;
    end loop;
    if purchase_count=0
       or abs(coalesce((input#>>'{payload,financial_contract,total_payout_fraction}')::numeric,-1)-1)>=0.000001
       or abs(total_market-coalesce((input#>>'{payload,financial_contract,total_market_value}')::numeric,-1))>=0.005 then
      return jsonb_build_object('ok',false,'code','PRODUCTION_CALCUTTA_FINANCIAL_CONSERVATION_FAILED');
    end if;
    for owner in select value from jsonb_array_elements(input#>'{payload,ownership}') loop
      if btrim(coalesce(owner->>'player_id',''))='' or btrim(coalesce(owner->>'owner_player_id',''))=''
         or coalesce((owner->>'ownership_fraction')::numeric,0)<=0
         or coalesce((owner->>'ownership_fraction')::numeric,0)>1
         or not exists(select 1 from scoring_authority.players p where p.player_id=owner->>'owner_player_id')
         or (select count(*) from jsonb_array_elements(input#>'{payload,ownership}') o
           where o->>'player_id'=owner->>'player_id' and o->>'owner_player_id'=owner->>'owner_player_id')<>1 then
        return jsonb_build_object('ok',false,'code','PRODUCTION_CALCUTTA_OWNERSHIP_INVALID');
      end if;
      ownership_count:=ownership_count+1;
    end loop;
  end if;
  registration:=production_control.register_projection_revision(input,'CALCUTTA_CONFIGURATION','calcutta-configuration-v1',tabs);
  if not coalesce((registration->>'changed')::boolean,false) then return registration; end if;
  update scoring_authority.calcutta_configurations set is_current=false,status='SUPERSEDED',superseded_at=now()
  where tournament_id='2026' and is_current;
  if not not_configured then
    select coalesce(max(configuration_revision),0)+1 into next_revision
    from scoring_authority.calcutta_configurations where tournament_id='2026';
    insert into scoring_authority.calcutta_configurations(
      tournament_id,tournament_year,configuration_revision,configuration_fingerprint,
      purchases,ownership,point_structure,payout_structure,financial_contract,
      source_workbook_id,imported_by
    ) values('2026',2026,next_revision,lower(input->>'payload_fingerprint'),
      input#>'{payload,purchases}',input#>'{payload,ownership}',input#>'{payload,point_structure}',
      input#>'{payload,payout_structure}',input#>'{payload,financial_contract}',
      input->>'source_workbook_id',input->>'requested_by') returning id into config_id;
  end if;
  insert into scoring_authority.calcutta_configuration_import_runs(
    tournament_id,source_workbook_id,configuration_fingerprint,status,purchase_count,
    ownership_count,total_market_value,requested_by
  ) values('2026',input->>'source_workbook_id',lower(input->>'payload_fingerprint'),'APPLIED',
    purchase_count,ownership_count,total_market,input->>'requested_by');
  return registration||jsonb_build_object('configuration_status',case when not_configured then 'NOT_CONFIGURED' else 'VALID' end,
    'configuration_id',config_id,'purchase_count',purchase_count,'ownership_count',ownership_count,
    'total_market_value',total_market,'recalculation_enqueued',false,'shadow_only',true);
exception when others then
  return jsonb_build_object('ok',false,'code','PRODUCTION_CALCUTTA_CONFIGURATION_IMPORT_FAILED');
end;
$$;
revoke all on function public.import_production_calcutta_configuration(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_production_calcutta_configuration(jsonb) to service_role;

create or replace function public.read_production_calcutta_configuration(input jsonb)
returns jsonb language sql security definer stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$ select production_control.read_projection($1,'CALCUTTA_CONFIGURATION','calcutta-configuration-v1',
  '["Calcutta Purchases","Calcutta Ownership","Calcutta Point Structure","Calcutta Payout"]'::jsonb) $$;
revoke all on function public.read_production_calcutta_configuration(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_production_calcutta_configuration(jsonb) to service_role;

create or replace function public.import_production_published_odds(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$
declare
  tabs constant jsonb := '["Odds Control","Odds Snapshots","Odds Team Results","Odds Player Results"]'::jsonb;
  registration jsonb;
  item jsonb;
  milestone text;
  current_milestone text:=btrim(coalesce(input#>>'{payload,current_official_milestone}',''));
  item_published_at timestamptz;
  payload_published_at timestamptz;
  snapshot_id uuid;
  current_snapshot_id uuid;
  next_revision bigint;
  snapshot_count integer;
begin
  perform production_control.assert_projection_scope(input,'PUBLISHED_ODDS','published-odds-v1',tabs);
  if upper(input->>'validation_status')<>'VALID'
     or current_milestone not in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')
     or jsonb_typeof(input#>'{payload,snapshots}')<>'array'
     or jsonb_array_length(input#>'{payload,snapshots}')=0 then
    return jsonb_build_object('ok',false,'code','COMPLETE_PRODUCTION_PUBLISHED_ODDS_REQUIRED');
  end if;
  snapshot_count:=jsonb_array_length(input#>'{payload,snapshots}');
  if (select count(distinct value->>'milestone') from jsonb_array_elements(input#>'{payload,snapshots}'))<>snapshot_count
     or not exists(select 1 from jsonb_array_elements(input#>'{payload,snapshots}') s where s->>'milestone'=current_milestone) then
    return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_MILESTONE_INVALID');
  end if;
  for item in select value from jsonb_array_elements(input#>'{payload,snapshots}') loop
    milestone:=btrim(coalesce(item->>'milestone',''));
    if milestone not in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')
       or coalesce((item->>'phase_order')::integer,-1)<>
          array_position(array['Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results'],milestone)-1
       or coalesce((item#>>'{published_payload,year}')::integer,0)<>2026
       or item#>>'{published_payload,phase}'<>milestone
       or jsonb_typeof(item#>'{published_payload,teams}')<>'array'
       or jsonb_array_length(item#>'{published_payload,teams}')=0
       or jsonb_typeof(item#>'{published_payload,players}')<>'array'
       or jsonb_array_length(item#>'{published_payload,players}')=0
       or lower(btrim(coalesce(item->>'payload_hash',''))) !~ '^[0-9a-f]{64}$'
       or lower(btrim(coalesce(item->>'google_publication_fingerprint',''))) !~ '^[0-9a-f]{64}$'
       or coalesce((item->>'publication_verified')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_SNAPSHOT_INVALID','milestone',milestone);
    end if;
    begin
      item_published_at:=(item->>'published_at')::timestamptz;
      payload_published_at:=(item#>>'{published_payload,publishedAt}')::timestamptz;
    exception when others then
      return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_TIMESTAMP_INVALID');
    end;
    if item_published_at is null or payload_published_at is null or item_published_at<>payload_published_at then
      return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_TIMESTAMP_MISMATCH');
    end if;
  end loop;
  registration:=production_control.register_projection_revision(input,'PUBLISHED_ODDS','published-odds-v1',tabs);
  if not coalesce((registration->>'changed')::boolean,false) then return registration; end if;
  for item in select value from jsonb_array_elements(input#>'{payload,snapshots}')
    order by (value->>'phase_order')::integer loop
    milestone:=item->>'milestone'; snapshot_id:=null;
    select id into snapshot_id from scoring_authority.odds_published_snapshots
    where tournament_id='2026' and milestone=item->>'milestone'
      and published_at=(item->>'published_at')::timestamptz
      and payload_hash=lower(item->>'payload_hash');
    if snapshot_id is null then
      select coalesce(max(publication_revision),0)+1 into next_revision
      from scoring_authority.odds_published_snapshots where tournament_id='2026' and milestone=item->>'milestone';
      insert into scoring_authority.odds_published_snapshots(
        tournament_id,milestone,phase_order,publication_revision,published_at,published_payload,
        payload_hash,source_fingerprint,engine_version,engine_metadata,
        google_publication_fingerprint,google_publication_reference,is_current_for_milestone,
        is_current_official,publication_verified,imported_by,logical_payload_hash,
        settings_fingerprint,ratings_fingerprint,pairing_fingerprint,deterministic_seed,
        publication_actor_id,mirror_status
      ) values('2026',milestone,(item->>'phase_order')::integer,next_revision,
        (item->>'published_at')::timestamptz,item->'published_payload',lower(item->>'payload_hash'),
        nullif(lower(btrim(coalesce(item->>'source_fingerprint',''))),''),
        nullif(btrim(coalesce(item->>'engine_version','')),''),coalesce(item->'engine_metadata','{}'::jsonb),
        lower(item->>'google_publication_fingerprint'),coalesce(item->'google_publication_reference','{}'::jsonb),
        false,false,true,input->>'requested_by',nullif(lower(btrim(coalesce(item->>'logical_payload_hash',''))),''),
        nullif(lower(btrim(coalesce(item->>'settings_fingerprint',''))),''),
        nullif(lower(btrim(coalesce(item->>'ratings_fingerprint',''))),''),
        nullif(lower(btrim(coalesce(item->>'pairing_fingerprint',''))),''),
        nullif(btrim(coalesce(item->>'deterministic_seed','')),''),
        nullif(btrim(coalesce(item->>'publication_actor_id','')),''),'VERIFIED_GOOGLE_IMPORT')
      returning id into snapshot_id;
    end if;
    update scoring_authority.odds_published_snapshots set is_current_for_milestone=false
    where tournament_id='2026' and milestone=item->>'milestone' and id<>snapshot_id and is_current_for_milestone;
    update scoring_authority.odds_published_snapshots set is_current_for_milestone=true where id=snapshot_id;
    if milestone=current_milestone then current_snapshot_id:=snapshot_id; end if;
  end loop;
  update scoring_authority.odds_published_snapshots set is_current_official=false
  where tournament_id='2026' and is_current_official and id<>current_snapshot_id;
  update scoring_authority.odds_published_snapshots set is_current_official=true where id=current_snapshot_id;
  insert into scoring_authority.odds_snapshot_import_runs(
    tournament_id,source_workbook_id,import_fingerprint,current_official_milestone,status,snapshot_count,requested_by
  ) values('2026',input->>'source_workbook_id',lower(input->>'payload_fingerprint'),current_milestone,
    'APPLIED',snapshot_count,input->>'requested_by');
  return registration||jsonb_build_object('snapshot_count',snapshot_count,
    'current_official_milestone',current_milestone,'current_snapshot_id',current_snapshot_id,
    'values_recalculated',false,'publication_created',false,'mirror_job_created',false,'shadow_only',true);
exception when others then
  return jsonb_build_object('ok',false,'code','PRODUCTION_PUBLISHED_ODDS_IMPORT_FAILED');
end;
$$;
revoke all on function public.import_production_published_odds(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_production_published_odds(jsonb) to service_role;

create or replace function public.read_production_published_odds(input jsonb)
returns jsonb language sql security definer stable
set search_path = production_control, scoring_authority, public, extensions, pg_temp
as $$ select production_control.read_projection($1,'PUBLISHED_ODDS','published-odds-v1',
  '["Odds Control","Odds Snapshots","Odds Team Results","Odds Player Results"]'::jsonb) $$;
revoke all on function public.read_production_published_odds(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_production_published_odds(jsonb) to service_role;

-- Revoke default execution on private helpers and assert the explicit RPC surface.
revoke all on all functions in schema production_control from public,anon,authenticated,service_role;
grant execute on function public.import_production_guide_projection(jsonb) to service_role;
grant execute on function public.read_production_guide_projection(jsonb) to service_role;
grant execute on function public.import_production_player_editorial(jsonb) to service_role;
grant execute on function public.read_production_player_editorial(jsonb) to service_role;
grant execute on function public.import_production_prediction_settings(jsonb) to service_role;
grant execute on function public.read_production_prediction_settings(jsonb) to service_role;
grant execute on function public.import_production_draft_projection(jsonb) to service_role;
grant execute on function public.read_production_draft_projection(jsonb) to service_role;
grant execute on function public.import_production_net_skins_configuration(jsonb) to service_role;
grant execute on function public.read_production_net_skins_configuration(jsonb) to service_role;
grant execute on function public.import_production_calcutta_configuration(jsonb) to service_role;
grant execute on function public.read_production_calcutta_configuration(jsonb) to service_role;
grant execute on function public.import_production_published_odds(jsonb) to service_role;
grant execute on function public.read_production_published_odds(jsonb) to service_role;

notify pgrst,'reload schema';
commit;
