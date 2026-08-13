create table scoring_authority.odds_input_configurations (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  configuration_revision bigint not null check (configuration_revision > 0),
  source_workbook_id text not null,
  settings jsonb not null check (jsonb_typeof(settings) = 'array'),
  historical_ratings jsonb not null check (jsonb_typeof(historical_ratings) = 'object'),
  settings_fingerprint text not null check (settings_fingerprint ~ '^[0-9a-f]{64}$'),
  ratings_fingerprint text not null check (ratings_fingerprint ~ '^[0-9a-f]{64}$'),
  pairing_fingerprint text not null,
  bundle_fingerprint text not null check (bundle_fingerprint ~ '^[0-9a-f]{64}$'),
  is_current boolean not null default true,
  imported_by text not null,
  imported_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (tournament_id, configuration_revision),
  unique (tournament_id, bundle_fingerprint)
);
create unique index odds_input_current_idx on scoring_authority.odds_input_configurations (tournament_id) where is_current;

create table scoring_authority.odds_input_import_runs (
  id uuid primary key default gen_random_uuid(), tournament_id text not null references scoring_authority.tournaments on delete cascade,
  bundle_fingerprint text not null, status text not null check (status in ('APPLIED','NO_CHANGE','REJECTED')),
  requested_by text not null, imported_at timestamptz not null default now()
);

create table scoring_authority.odds_google_mirror_jobs (
  id uuid primary key default gen_random_uuid(), tournament_id text not null references scoring_authority.tournaments on delete cascade,
  snapshot_id uuid not null references scoring_authority.odds_published_snapshots on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  attempt_count integer not null default 0, last_error_safe text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (snapshot_id)
);

alter table scoring_authority.odds_published_snapshots
  add column if not exists logical_payload_hash text,
  add column if not exists settings_fingerprint text,
  add column if not exists ratings_fingerprint text,
  add column if not exists pairing_fingerprint text,
  add column if not exists deterministic_seed text,
  add column if not exists publication_actor_id text,
  add column if not exists mirror_status text not null default 'VERIFIED_GOOGLE_IMPORT';
create unique index odds_native_publication_idempotency_idx on scoring_authority.odds_published_snapshots
  (tournament_id, milestone, logical_payload_hash, source_fingerprint, settings_fingerprint, ratings_fingerprint, pairing_fingerprint, engine_version, deterministic_seed)
  where logical_payload_hash is not null;

alter table scoring_authority.odds_input_configurations enable row level security;
alter table scoring_authority.odds_input_import_runs enable row level security;
alter table scoring_authority.odds_google_mirror_jobs enable row level security;
revoke all on scoring_authority.odds_input_configurations, scoring_authority.odds_input_import_runs, scoring_authority.odds_google_mirror_jobs from public, anon, authenticated;
grant select, insert, update on scoring_authority.odds_input_configurations, scoring_authority.odds_input_import_runs, scoring_authority.odds_google_mirror_jobs to service_role;

create or replace function public.import_preview_championship_odds_inputs(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare target text:=btrim(coalesce(input->>'tournament_id','')); actor text:=btrim(coalesce(input->>'requested_by',''));
  source_workbook text:=btrim(coalesce(input->>'source_workbook_id','')); fingerprint text:=lower(btrim(coalesce(input->>'bundle_fingerprint','')));
  existing scoring_authority.odds_input_configurations%rowtype; next_revision bigint; config_id uuid;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED'); end if;
  if target='' or actor='' or source_workbook='' or fingerprint !~ '^[0-9a-f]{64}$' or jsonb_typeof(input->'settings') <> 'array'
    or jsonb_typeof(input->'historical_ratings') <> 'object' or coalesce(input->>'settings_fingerprint','') !~ '^[0-9a-f]{64}$'
    or coalesce(input->>'ratings_fingerprint','') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_INPUT_BUNDLE_REQUIRED'); end if;
  if not exists(select 1 from scoring_authority.tournaments t where t.tournament_id=target and t.tournament_year=(input->>'tournament_year')::integer and t.source_workbook_id=source_workbook)
    then return jsonb_build_object('ok',false,'code','PREVIEW_TOURNAMENT_SOURCE_MISMATCH'); end if;
  if jsonb_object_length(input->'historical_ratings')=0 then return jsonb_build_object('ok',false,'code','ODDS_RATINGS_REQUIRED'); end if;
  select * into existing from scoring_authority.odds_input_configurations where tournament_id=target and bundle_fingerprint=fingerprint;
  if existing.id is not null then
    insert into scoring_authority.odds_input_import_runs(tournament_id,bundle_fingerprint,status,requested_by) values(target,fingerprint,'NO_CHANGE',actor);
    return jsonb_build_object('ok',true,'changed',false,'configuration_revision',existing.configuration_revision,'bundle_fingerprint',fingerprint);
  end if;
  select coalesce(max(configuration_revision),0)+1 into next_revision from scoring_authority.odds_input_configurations where tournament_id=target;
  update scoring_authority.odds_input_configurations set is_current=false,superseded_at=now() where tournament_id=target and is_current;
  insert into scoring_authority.odds_input_configurations(tournament_id,configuration_revision,source_workbook_id,settings,historical_ratings,
    settings_fingerprint,ratings_fingerprint,pairing_fingerprint,bundle_fingerprint,imported_by)
  values(target,next_revision,source_workbook,input->'settings',input->'historical_ratings',input->>'settings_fingerprint',input->>'ratings_fingerprint',
    input->>'pairing_fingerprint',fingerprint,actor) returning id into config_id;
  insert into scoring_authority.odds_input_import_runs(tournament_id,bundle_fingerprint,status,requested_by) values(target,fingerprint,'APPLIED',actor);
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata) values(target,'CHAMPIONSHIP_ODDS_INPUTS_VERSIONED',actor,
    jsonb_build_object('configurationId',config_id,'configurationRevision',next_revision,'bundleFingerprint',fingerprint));
  return jsonb_build_object('ok',true,'changed',true,'configuration_revision',next_revision,'bundle_fingerprint',fingerprint);
end; $$;

create or replace function public.read_championship_odds_inputs(target_tournament_id text) returns jsonb
language plpgsql security definer stable set search_path=scoring_authority,public,extensions,pg_temp as $$
declare started timestamptz:=clock_timestamp(); config jsonb; current_state jsonb;
begin
  select to_jsonb(c) into config from scoring_authority.odds_input_configurations c where c.tournament_id=target_tournament_id and c.is_current;
  if config is null then return jsonb_build_object('ok',false,'code','ODDS_INPUT_CONFIGURATION_REQUIRED'); end if;
  current_state:=public.read_leaderboards_core_view(target_tournament_id);
  if coalesce((current_state->>'ok')::boolean,false) is not true then return current_state; end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('input_configuration',config,'current_state',current_state->'data',
    'query_ms',round(extract(epoch from(clock_timestamp()-started))*1000,3)));
end; $$;

create or replace function public.publish_preview_championship_odds(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare target text:=btrim(coalesce(input->>'tournament_id','')); phase text:=btrim(coalesce(input->>'milestone','')); actor text:=btrim(coalesce(input->>'actor_id',''));
  existing_id uuid; snapshot_id uuid; next_revision bigint; published_at timestamptz; current_config scoring_authority.odds_input_configurations%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED'); end if;
  if target='' or actor='' or phase not in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')
    or coalesce(input->>'payload_hash','') !~ '^[0-9a-f]{64}$' or coalesce(input->>'logical_payload_hash','') !~ '^[0-9a-f]{64}$'
    or coalesce(input->>'source_fingerprint','') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_PUBLICATION_REQUIRED'); end if;
  if phase='Final Results' and exists(select 1 from scoring_authority.matches where tournament_id=target and (status<>'FINAL' or scorecard_complete is not true))
    then return jsonb_build_object('ok',false,'code','FINAL_RESULTS_NOT_READY'); end if;
  select * into current_config from scoring_authority.odds_input_configurations where tournament_id=target and is_current for share;
  if current_config.id is null or current_config.settings_fingerprint<>input->>'settings_fingerprint' or current_config.ratings_fingerprint<>input->>'ratings_fingerprint'
    then return jsonb_build_object('ok',false,'code','STALE_ODDS_INPUT_CONFIGURATION'); end if;
  select id into existing_id from scoring_authority.odds_published_snapshots where tournament_id=target and milestone=phase
    and logical_payload_hash=input->>'logical_payload_hash' and source_fingerprint=input->>'source_fingerprint'
    and settings_fingerprint=input->>'settings_fingerprint' and ratings_fingerprint=input->>'ratings_fingerprint'
    and pairing_fingerprint=input->>'pairing_fingerprint' and engine_version=input->>'engine_version' and deterministic_seed=input->>'deterministic_seed';
  if existing_id is not null then return jsonb_build_object('ok',true,'changed',false,'snapshot_id',existing_id,'duplicate',true); end if;
  published_at:=(input->'published_payload'->>'publishedAt')::timestamptz;
  select coalesce(max(publication_revision),0)+1 into next_revision from scoring_authority.odds_published_snapshots where tournament_id=target and milestone=phase;
  update scoring_authority.odds_published_snapshots set is_current_for_milestone=false where tournament_id=target and milestone=phase and is_current_for_milestone;
  update scoring_authority.odds_published_snapshots set is_current_official=false where tournament_id=target and is_current_official;
  insert into scoring_authority.odds_published_snapshots(tournament_id,milestone,phase_order,publication_revision,published_at,published_payload,payload_hash,
    source_fingerprint,engine_version,engine_metadata,google_publication_fingerprint,google_publication_reference,is_current_for_milestone,is_current_official,
    publication_verified,imported_by,logical_payload_hash,settings_fingerprint,ratings_fingerprint,pairing_fingerprint,deterministic_seed,publication_actor_id,mirror_status)
  values(target,phase,array_position(array['Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results'],phase)-1,next_revision,
    published_at,input->'published_payload',input->>'payload_hash',input->>'source_fingerprint',input->>'engine_version',coalesce(input->'simulation_metadata','{}'::jsonb),
    repeat('0',64),jsonb_build_object('status','PENDING'),true,true,true,actor,input->>'logical_payload_hash',input->>'settings_fingerprint',input->>'ratings_fingerprint',
    input->>'pairing_fingerprint',input->>'deterministic_seed',actor,'PENDING') returning id into snapshot_id;
  insert into scoring_authority.odds_google_mirror_jobs(tournament_id,snapshot_id) values(target,snapshot_id);
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata) values(target,'CHAMPIONSHIP_ODDS_PUBLISHED',actor,
    jsonb_build_object('snapshotId',snapshot_id,'milestone',phase,'publicationRevision',next_revision,'googleMirror','PENDING'));
  return jsonb_build_object('ok',true,'changed',true,'snapshot_id',snapshot_id,'publication_revision',next_revision,'google_mirror_status','PENDING');
end; $$;

revoke all on function public.import_preview_championship_odds_inputs(jsonb) from public,anon,authenticated;
revoke all on function public.read_championship_odds_inputs(text) from public,anon,authenticated;
revoke all on function public.publish_preview_championship_odds(jsonb) from public,anon,authenticated;
grant execute on function public.import_preview_championship_odds_inputs(jsonb) to service_role;
grant execute on function public.read_championship_odds_inputs(text) to service_role;
grant execute on function public.publish_preview_championship_odds(jsonb) to service_role;
notify pgrst,'reload schema';
