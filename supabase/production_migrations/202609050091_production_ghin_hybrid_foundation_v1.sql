-- GHIN / Hybrid Handicap Phase 2A. This additive installation is inert: it
-- creates no identity, observation, pointer, receipt, audit event, or draft.
-- Live GHIN transport is intentionally absent pending provider authorization.
begin;

create table production_control.player_external_identities_v1 (
  identity_id uuid primary key default extensions.gen_random_uuid(),
  player_id text not null references scoring_authority.players(player_id) on delete restrict,
  provider text not null check (provider = 'GHIN'),
  external_identifier text not null check (external_identifier ~ '^[0-9]{5,12}$'),
  status text not null check (status in ('VERIFIED', 'RETIRED')),
  verified_at timestamptz not null,
  verified_by_player_id text not null references scoring_authority.players(player_id) on delete restrict,
  verified_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  verification_source text not null check (verification_source = 'DIRECTOR_CONFIRMED'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retired_at timestamptz,
  retired_by_player_id text references scoring_authority.players(player_id) on delete restrict,
  retired_by_auth_user_id uuid references auth.users(id) on delete restrict,
  check (
    (status = 'VERIFIED' and retired_at is null and retired_by_player_id is null and retired_by_auth_user_id is null)
    or (status = 'RETIRED' and retired_at is not null and retired_by_player_id is not null and retired_by_auth_user_id is not null)
  )
);

create unique index player_external_identities_v1_active_player
  on production_control.player_external_identities_v1(player_id, provider)
  where status = 'VERIFIED';
create unique index player_external_identities_v1_active_external
  on production_control.player_external_identities_v1(provider, external_identifier)
  where status = 'VERIFIED';

create table production_control.handicap_source_observations_v1 (
  observation_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null,
  player_id text not null,
  identity_id uuid not null references production_control.player_external_identities_v1(identity_id) on delete restrict,
  provider text not null check (provider = 'GHIN'),
  current_index numeric not null,
  low_index numeric not null,
  low_index_date date not null,
  hybrid_handicap numeric generated always as (pg_catalog.round((current_index + low_index) / 2::numeric, 1)) stored,
  observed_at timestamptz not null default pg_catalog.clock_timestamp(),
  provenance text not null check (provenance in ('DIRECTOR_MANUAL', 'GHIN_SYNC')),
  status text not null check (status = 'ACCEPTED'),
  source_evidence_fingerprint text not null check (source_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by_player_id text not null references scoring_authority.players(player_id) on delete restrict,
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (tournament_id, player_id) references scoring_authority.tournament_players(tournament_id, player_id) on delete restrict,
  unique (observation_id, tournament_id, player_id)
);

create table production_control.handicap_source_current_v1 (
  tournament_id text not null,
  player_id text not null,
  provider text not null check (provider = 'GHIN'),
  observation_id uuid not null,
  pointer_revision bigint not null check (pointer_revision > 0),
  source_status text not null default 'CURRENT' check (source_status in ('CURRENT', 'STALE')),
  updated_by_player_id text not null references scoring_authority.players(player_id) on delete restrict,
  updated_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, player_id, provider),
  foreign key (observation_id, tournament_id, player_id) references
    production_control.handicap_source_observations_v1(observation_id, tournament_id, player_id) on delete restrict
);

create table production_control.handicap_source_operation_receipts_v1 (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(tournament_id) on delete restrict,
  operation text not null check (operation in ('SET_IDENTITY', 'RETIRE_IDENTITY', 'RECORD_MANUAL_OBSERVATION', 'STAGE_HYBRID_DRAFT')),
  operation_request_id uuid not null,
  declared_request_payload_hash text not null check (declared_request_payload_hash ~ '^[0-9a-f]{64}$'),
  database_request_payload_hash text not null check (database_request_payload_hash ~ '^[0-9a-f]{64}$'),
  actor_player_id text not null references scoring_authority.players(player_id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  response jsonb not null check (pg_catalog.jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tournament_id, operation_request_id)
);

create table production_control.handicap_source_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(tournament_id) on delete restrict,
  action text not null check (action in ('GHIN_IDENTITY_VERIFIED', 'GHIN_IDENTITY_RETIRED', 'MANUAL_SOURCE_RECORDED', 'HYBRID_DRAFT_STAGED')),
  player_id text references scoring_authority.players(player_id) on delete restrict,
  identity_id uuid references production_control.player_external_identities_v1(identity_id) on delete restrict,
  observation_id uuid references production_control.handicap_source_observations_v1(observation_id) on delete restrict,
  handicap_revision_id uuid references scoring_authority.handicap_revisions(revision_id) on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  operation_request_id uuid not null,
  before_state jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(after_state) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table production_control.player_external_identities_v1 enable row level security;
alter table production_control.handicap_source_observations_v1 enable row level security;
alter table production_control.handicap_source_current_v1 enable row level security;
alter table production_control.handicap_source_operation_receipts_v1 enable row level security;
alter table production_control.handicap_source_audit_events_v1 enable row level security;

revoke all on table production_control.player_external_identities_v1,
  production_control.handicap_source_observations_v1,
  production_control.handicap_source_current_v1,
  production_control.handicap_source_operation_receipts_v1,
  production_control.handicap_source_audit_events_v1
from public, anon, authenticated, service_role;

create function production_control.reject_handicap_source_immutable_v1()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode = '55000', message = 'PRODUCTION_HANDICAP_SOURCE_IMMUTABLE';
end;
$$;

create trigger handicap_source_observations_immutable_v1 before update or delete
  on production_control.handicap_source_observations_v1 for each row execute function production_control.reject_handicap_source_immutable_v1();
create trigger handicap_source_receipts_immutable_v1 before update or delete
  on production_control.handicap_source_operation_receipts_v1 for each row execute function production_control.reject_handicap_source_immutable_v1();
create trigger handicap_source_audit_immutable_v1 before update or delete
  on production_control.handicap_source_audit_events_v1 for each row execute function production_control.reject_handicap_source_immutable_v1();

create function production_control.handicap_source_hash_v1(value jsonb)
returns text language sql immutable strict set search_path = pg_catalog, extensions as $$
  select pg_catalog.encode(extensions.digest(
    production_control.prediction_settings_canonical_json_v1(value), 'sha256'
  ), 'hex')
$$;

create function production_control.hybrid_handicap_v1(current_value numeric, low_value numeric)
returns numeric language sql immutable strict set search_path = pg_catalog as $$
  select pg_catalog.round((current_value + low_value) / 2::numeric, 1)
$$;

create function production_control.assert_handicap_source_runtime_v1(input jsonb)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if input->>'contract_version' is distinct from 'production-handicap-source-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or input#>>'{authorization,tournament_id}' is distinct from '2026'
     or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
     or pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'actor_player_id', '')))
       is distinct from pg_catalog.upper(pg_catalog.btrim(coalesce(input#>>'{authorization,player_id}', '')))
     or pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'actor_auth_user_id', '')))
       is distinct from pg_catalog.lower(pg_catalog.btrim(coalesce(input#>>'{authorization,auth_user_id}', ''))) then
    raise exception using errcode = '42501', message = 'PRODUCTION_HANDICAP_SOURCE_SCOPE_REQUIRED';
  end if;
  select value.* into strict scope from production_control.resource_scope value where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict pointer from production_control.current_tournament_pointer_v1 value where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id
     or scope.current_tournament_id <> '2026' or scope.current_tournament_year <> 2026
     or pointer.tournament_id <> '2026' or pointer.tournament_year <> 2026 then
    raise exception using errcode = '42501', message = 'PRODUCTION_HANDICAP_SOURCE_EXACT_RESOURCE_REQUIRED';
  end if;
  perform production_control.assert_production_scoring_actor(input, true);
  return '2026';
end;
$$;

create function production_control.handicap_source_set_fingerprint_v1(target text)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object(
    'tournamentId', target,
    'players', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'playerId', roster.player_id,
      'identityId', identity_value.identity_id,
      'observationId', observation.observation_id,
      'pointerRevision', source_pointer.pointer_revision,
      'sourceStatus', source_pointer.source_status,
      'currentIndex', observation.current_index,
      'lowIndex', observation.low_index,
      'lowIndexDate', observation.low_index_date,
      'hybrid', observation.hybrid_handicap
    ) order by roster.player_id), '[]'::jsonb)
  ))
  from scoring_authority.tournament_players roster
  left join production_control.player_external_identities_v1 identity_value
    on identity_value.player_id = roster.player_id and identity_value.provider = 'GHIN' and identity_value.status = 'VERIFIED'
  left join production_control.handicap_source_current_v1 source_pointer
    on source_pointer.tournament_id = roster.tournament_id and source_pointer.player_id = roster.player_id and source_pointer.provider = 'GHIN'
  left join production_control.handicap_source_observations_v1 observation
    on observation.observation_id = source_pointer.observation_id
  where roster.tournament_id = target and roster.participation_status = 'ACTIVE'
$$;

create function public.read_production_handicap_source_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  target text;
  roster_count integer;
  coverage_count integer;
  players_value jsonb;
begin
  target := production_control.assert_handicap_source_runtime_v1(input);
  if input->>'operation' is distinct from 'READ_PRODUCTION_HANDICAP_SOURCE_V1' then
    raise exception using errcode = '22023', message = 'PRODUCTION_HANDICAP_SOURCE_INPUT_INVALID';
  end if;
  select pg_catalog.count(*)::integer,
    pg_catalog.count(observation.observation_id) filter (where source_pointer.source_status = 'CURRENT')::integer,
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'playerId', roster.player_id,
      'displayName', player.display_name,
      'identityId', identity_value.identity_id,
      'maskedGhinNumber', case when identity_value.identity_id is null then '' else '••••' || pg_catalog.right(identity_value.external_identifier, 4) end,
      'identityStatus', coalesce(identity_value.status, 'UNMAPPED'),
      'pointerRevision', coalesce(source_pointer.pointer_revision, 0),
      'stale', source_pointer.source_status = 'STALE',
      'observationId', observation.observation_id,
      'currentIndex', observation.current_index::text,
      'lowIndex', observation.low_index::text,
      'lowIndexDate', observation.low_index_date,
      'hybrid', observation.hybrid_handicap::text,
      'provenance', observation.provenance,
      'observedAt', observation.observed_at,
      'sourceState', case when identity_value.identity_id is null then 'MISSING_MAPPING' when observation.observation_id is null then 'MISSING_OBSERVATION' when source_pointer.source_status = 'STALE' then 'STALE' else 'COMPLETE' end,
      'observationCount', (select pg_catalog.count(*) from production_control.handicap_source_observations_v1 history where history.tournament_id = target and history.player_id = roster.player_id and history.provider = 'GHIN')
    ) order by player.display_name, roster.player_id), '[]'::jsonb)
  into roster_count, coverage_count, players_value
  from scoring_authority.tournament_players roster
  join scoring_authority.players player using (player_id)
  left join production_control.player_external_identities_v1 identity_value
    on identity_value.player_id = roster.player_id and identity_value.provider = 'GHIN' and identity_value.status = 'VERIFIED'
  left join production_control.handicap_source_current_v1 source_pointer
    on source_pointer.tournament_id = roster.tournament_id and source_pointer.player_id = roster.player_id and source_pointer.provider = 'GHIN'
  left join production_control.handicap_source_observations_v1 observation on observation.observation_id = source_pointer.observation_id
  where roster.tournament_id = target and roster.participation_status = 'ACTIVE';
  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_HANDICAP_SOURCE_READ', 'contractVersion', 'production-handicap-source-v1',
    'tournamentId', target, 'rosterCount', roster_count, 'coverageCount', coverage_count,
    'complete', roster_count > 0 and roster_count = coverage_count,
    'sourceFingerprint', production_control.handicap_source_set_fingerprint_v1(target),
    'autoRefresh', 'DISABLED_AWAITING_PROVIDER_AUTHORIZATION', 'players', players_value
  );
end;
$$;

create function production_control.handicap_source_receipt_v1(
  target text, operation_value text, request_id uuid, declared_hash text, database_hash text,
  actor_player text, actor_auth uuid, response_value jsonb
)
returns void language sql volatile security definer set search_path = pg_catalog as $$
  insert into production_control.handicap_source_operation_receipts_v1(
    tournament_id, operation, operation_request_id, declared_request_payload_hash,
    database_request_payload_hash, actor_player_id, actor_auth_user_id, response
  ) values (target, operation_value, request_id, declared_hash, database_hash, actor_player, actor_auth, response_value)
$$;

create function public.set_production_player_ghin_identity_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target text; actor_player text; actor_auth uuid; request_id uuid; declared_hash text;
  database_hash text; player_value text; external_value text; expected_value uuid;
  current_value production_control.player_external_identities_v1%rowtype;
  prior production_control.handicap_source_operation_receipts_v1%rowtype;
  identity_value uuid; response_value jsonb; event_value uuid := extensions.gen_random_uuid();
begin
  target := production_control.assert_handicap_source_runtime_v1(input);
  actor_player := pg_catalog.upper(pg_catalog.btrim(input#>>'{authorization,player_id}'));
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  declared_hash := pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'request_payload_hash', '')));
  if input->>'operation' is distinct from 'SET_PRODUCTION_PLAYER_GHIN_IDENTITY_V1'
     or coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(input->>'player_id','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
     or coalesce(input->>'external_identifier','') !~ '^[0-9]{5,12}$'
     or declared_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'PRODUCTION_GHIN_IDENTITY_INPUT_INVALID';
  end if;
  request_id := (input->>'operation_request_id')::uuid;
  player_value := pg_catalog.upper(input->>'player_id'); external_value := input->>'external_identifier';
  expected_value := nullif(input->>'expected_identity_id','')::uuid;
  database_hash := production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object(
    'operation','SET_IDENTITY','playerId',player_value,'externalIdentifier',external_value,
    'expectedIdentityId',expected_value,'replaceConfirmed',coalesce((input->>'replace_confirmed')::boolean,false),
    'actorPlayerId',actor_player,'actorAuthUserId',actor_auth
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('production-ghin-identity:' || player_value, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('production-ghin-external:GHIN:' || external_value, 0));
  select value.* into prior from production_control.handicap_source_operation_receipts_v1 value where value.tournament_id=target and value.operation_request_id=request_id;
  if found then
    if prior.declared_request_payload_hash=declared_hash and prior.database_request_payload_hash=database_hash then return prior.response || pg_catalog.jsonb_build_object('idempotent',true); end if;
    raise exception using errcode='23505', message='PRODUCTION_HANDICAP_SOURCE_IDEMPOTENCY_CONFLICT';
  end if;
  if not exists(select 1 from scoring_authority.tournament_players roster where roster.tournament_id=target and roster.player_id=player_value and roster.participation_status='ACTIVE') then
    raise exception using errcode='22023', message='PRODUCTION_HANDICAP_SOURCE_PLAYER_NOT_ACTIVE';
  end if;
  if exists(select 1 from production_control.player_external_identities_v1 value where value.provider='GHIN' and value.external_identifier=external_value and value.status='VERIFIED' and value.player_id<>player_value) then
    raise exception using errcode='23505', message='PRODUCTION_GHIN_IDENTITY_ALREADY_ASSIGNED';
  end if;
  select value.* into current_value from production_control.player_external_identities_v1 value where value.player_id=player_value and value.provider='GHIN' and value.status='VERIFIED' for update;
  if current_value.identity_id is distinct from expected_value then raise exception using errcode='40001', message='PRODUCTION_GHIN_IDENTITY_STALE'; end if;
  if current_value.identity_id is not null then
    if coalesce((input->>'replace_confirmed')::boolean,false) is not true then raise exception using errcode='22023', message='PRODUCTION_GHIN_IDENTITY_REPLACEMENT_CONFIRMATION_REQUIRED'; end if;
    update production_control.player_external_identities_v1 set status='RETIRED',retired_at=pg_catalog.clock_timestamp(),retired_by_player_id=actor_player,retired_by_auth_user_id=actor_auth where identity_id=current_value.identity_id;
    delete from production_control.handicap_source_current_v1 where tournament_id=target and player_id=player_value and provider='GHIN';
  end if;
  insert into production_control.player_external_identities_v1(player_id,provider,external_identifier,status,verified_at,verified_by_player_id,verified_by_auth_user_id,verification_source)
  values(player_value,'GHIN',external_value,'VERIFIED',pg_catalog.clock_timestamp(),actor_player,actor_auth,'DIRECTOR_CONFIRMED') returning identity_id into identity_value;
  response_value := pg_catalog.jsonb_build_object('ok',true,'code','PRODUCTION_GHIN_IDENTITY_VERIFIED','idempotent',false,'playerId',player_value,'identityId',identity_value,'maskedGhinNumber','••••'||pg_catalog.right(external_value,4),'sourceEvidenceCleared',current_value.identity_id is not null,'eventId',event_value);
  insert into production_control.handicap_source_audit_events_v1(event_id,tournament_id,action,player_id,identity_id,actor_player_id,actor_auth_user_id,operation_request_id,before_state,after_state)
  values(event_value,target,'GHIN_IDENTITY_VERIFIED',player_value,identity_value,actor_player,actor_auth,request_id,
    case when current_value.identity_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('identityId',current_value.identity_id,'status','VERIFIED') end,
    pg_catalog.jsonb_build_object('identityId',identity_value,'status','VERIFIED'));
  perform production_control.handicap_source_receipt_v1(target,'SET_IDENTITY',request_id,declared_hash,database_hash,actor_player,actor_auth,response_value);
  return response_value;
end;
$$;

create function public.retire_production_player_ghin_identity_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target text; actor_player text; actor_auth uuid; request_id uuid; declared_hash text; database_hash text;
  player_value text; expected_value uuid; current_value production_control.player_external_identities_v1%rowtype;
  prior production_control.handicap_source_operation_receipts_v1%rowtype; response_value jsonb; event_value uuid := extensions.gen_random_uuid();
begin
  target := production_control.assert_handicap_source_runtime_v1(input); actor_player:=pg_catalog.upper(pg_catalog.btrim(input#>>'{authorization,player_id}')); actor_auth:=(input#>>'{authorization,auth_user_id}')::uuid;
  declared_hash:=pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'request_payload_hash','')));
  if input->>'operation' is distinct from 'RETIRE_PRODUCTION_PLAYER_GHIN_IDENTITY_V1' or coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce(input->>'expected_identity_id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce((input->>'retirement_confirmed')::boolean,false) is not true or declared_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='PRODUCTION_GHIN_IDENTITY_RETIREMENT_INPUT_INVALID'; end if;
  request_id:=(input->>'operation_request_id')::uuid; player_value:=pg_catalog.upper(input->>'player_id'); expected_value:=(input->>'expected_identity_id')::uuid;
  database_hash:=production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object('operation','RETIRE_IDENTITY','playerId',player_value,'expectedIdentityId',expected_value,'actorPlayerId',actor_player,'actorAuthUserId',actor_auth));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('production-ghin-identity:'||player_value,0));
  select value.* into prior from production_control.handicap_source_operation_receipts_v1 value where value.tournament_id=target and value.operation_request_id=request_id;
  if found then if prior.declared_request_payload_hash=declared_hash and prior.database_request_payload_hash=database_hash then return prior.response||pg_catalog.jsonb_build_object('idempotent',true); end if; raise exception using errcode='23505',message='PRODUCTION_HANDICAP_SOURCE_IDEMPOTENCY_CONFLICT'; end if;
  select value.* into current_value from production_control.player_external_identities_v1 value where value.player_id=player_value and value.provider='GHIN' and value.status='VERIFIED' for update;
  if current_value.identity_id is distinct from expected_value then raise exception using errcode='40001',message='PRODUCTION_GHIN_IDENTITY_STALE'; end if;
  update production_control.player_external_identities_v1 set status='RETIRED',retired_at=pg_catalog.clock_timestamp(),retired_by_player_id=actor_player,retired_by_auth_user_id=actor_auth where identity_id=expected_value;
  delete from production_control.handicap_source_current_v1 where tournament_id=target and player_id=player_value and provider='GHIN';
  response_value:=pg_catalog.jsonb_build_object('ok',true,'code','PRODUCTION_GHIN_IDENTITY_RETIRED','idempotent',false,'playerId',player_value,'identityId',expected_value,'eventId',event_value);
  insert into production_control.handicap_source_audit_events_v1(event_id,tournament_id,action,player_id,identity_id,actor_player_id,actor_auth_user_id,operation_request_id,before_state,after_state) values(event_value,target,'GHIN_IDENTITY_RETIRED',player_value,expected_value,actor_player,actor_auth,request_id,pg_catalog.jsonb_build_object('identityId',expected_value,'status','VERIFIED'),pg_catalog.jsonb_build_object('identityId',expected_value,'status','RETIRED'));
  perform production_control.handicap_source_receipt_v1(target,'RETIRE_IDENTITY',request_id,declared_hash,database_hash,actor_player,actor_auth,response_value); return response_value;
end;
$$;

create function public.record_production_manual_handicap_source_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target text; actor_player text; actor_auth uuid; request_id uuid; declared_hash text; database_hash text;
  player_value text; identity_value uuid; expected_pointer bigint; current_value numeric; low_value numeric; low_date_value date;
  active_identity production_control.player_external_identities_v1%rowtype; source_pointer production_control.handicap_source_current_v1%rowtype;
  prior production_control.handicap_source_operation_receipts_v1%rowtype; observation_value uuid:=extensions.gen_random_uuid(); event_value uuid:=extensions.gen_random_uuid(); evidence_hash text; response_value jsonb;
begin
  target:=production_control.assert_handicap_source_runtime_v1(input); actor_player:=pg_catalog.upper(pg_catalog.btrim(input#>>'{authorization,player_id}')); actor_auth:=(input#>>'{authorization,auth_user_id}')::uuid; declared_hash:=pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'request_payload_hash','')));
  if input->>'operation' is distinct from 'RECORD_PRODUCTION_MANUAL_HANDICAP_SOURCE_V1' or coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce(input->>'expected_identity_id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce(input->>'expected_pointer_revision','') !~ '^[0-9]+$' or coalesce(input->>'current_index','') !~ '^-?[0-9]+(\.[0-9]+)?$' or coalesce(input->>'low_index','') !~ '^-?[0-9]+(\.[0-9]+)?$' or coalesce(input->>'low_index_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or input->>'provenance' is distinct from 'DIRECTOR_MANUAL' or declared_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='PRODUCTION_HANDICAP_SOURCE_INPUT_INVALID'; end if;
  request_id:=(input->>'operation_request_id')::uuid; player_value:=pg_catalog.upper(input->>'player_id'); identity_value:=(input->>'expected_identity_id')::uuid; expected_pointer:=(input->>'expected_pointer_revision')::bigint; current_value:=(input->>'current_index')::numeric; low_value:=(input->>'low_index')::numeric; low_date_value:=(input->>'low_index_date')::date;
  database_hash:=production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object('operation','RECORD_MANUAL_OBSERVATION','playerId',player_value,'identityId',identity_value,'expectedPointerRevision',expected_pointer,'currentIndex',current_value,'lowIndex',low_value,'lowIndexDate',low_date_value,'actorPlayerId',actor_player,'actorAuthUserId',actor_auth));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('production-handicap-source:'||target||':'||player_value,0));
  select value.* into prior from production_control.handicap_source_operation_receipts_v1 value where value.tournament_id=target and value.operation_request_id=request_id;
  if found then if prior.declared_request_payload_hash=declared_hash and prior.database_request_payload_hash=database_hash then return prior.response||pg_catalog.jsonb_build_object('idempotent',true); end if; raise exception using errcode='23505',message='PRODUCTION_HANDICAP_SOURCE_IDEMPOTENCY_CONFLICT'; end if;
  select value.* into active_identity from production_control.player_external_identities_v1 value where value.identity_id=identity_value and value.player_id=player_value and value.provider='GHIN' and value.status='VERIFIED' for share;
  if active_identity.identity_id is null then raise exception using errcode='40001',message='PRODUCTION_GHIN_IDENTITY_STALE'; end if;
  select value.* into source_pointer from production_control.handicap_source_current_v1 value where value.tournament_id=target and value.player_id=player_value and value.provider='GHIN' for update;
  if coalesce(source_pointer.pointer_revision,0) <> expected_pointer then raise exception using errcode='40001',message='PRODUCTION_HANDICAP_SOURCE_PREDECESSOR_STALE'; end if;
  evidence_hash:=production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object('provider','GHIN','identityId',identity_value,'playerId',player_value,'currentIndex',current_value,'lowIndex',low_value,'lowIndexDate',low_date_value,'provenance','DIRECTOR_MANUAL'));
  insert into production_control.handicap_source_observations_v1(observation_id,tournament_id,player_id,identity_id,provider,current_index,low_index,low_index_date,provenance,status,source_evidence_fingerprint,created_by_player_id,created_by_auth_user_id)
  values(observation_value,target,player_value,identity_value,'GHIN',current_value,low_value,low_date_value,'DIRECTOR_MANUAL','ACCEPTED',evidence_hash,actor_player,actor_auth);
  insert into production_control.handicap_source_current_v1(tournament_id,player_id,provider,observation_id,pointer_revision,source_status,updated_by_player_id,updated_by_auth_user_id)
  values(target,player_value,'GHIN',observation_value,expected_pointer+1,'CURRENT',actor_player,actor_auth)
  on conflict(tournament_id,player_id,provider) do update set observation_id=excluded.observation_id,pointer_revision=excluded.pointer_revision,source_status='CURRENT',updated_by_player_id=excluded.updated_by_player_id,updated_by_auth_user_id=excluded.updated_by_auth_user_id,updated_at=pg_catalog.clock_timestamp();
  response_value:=pg_catalog.jsonb_build_object('ok',true,'code','PRODUCTION_HANDICAP_SOURCE_RECORDED','idempotent',false,'playerId',player_value,'observationId',observation_value,'pointerRevision',expected_pointer+1,'currentIndex',current_value::text,'lowIndex',low_value::text,'lowIndexDate',low_date_value,'hybrid',production_control.hybrid_handicap_v1(current_value,low_value)::text,'provenance','DIRECTOR_MANUAL','eventId',event_value);
  insert into production_control.handicap_source_audit_events_v1(event_id,tournament_id,action,player_id,identity_id,observation_id,actor_player_id,actor_auth_user_id,operation_request_id,before_state,after_state) values(event_value,target,'MANUAL_SOURCE_RECORDED',player_value,identity_value,observation_value,actor_player,actor_auth,request_id,case when source_pointer.observation_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('observationId',source_pointer.observation_id,'pointerRevision',source_pointer.pointer_revision) end,pg_catalog.jsonb_build_object('observationId',observation_value,'pointerRevision',expected_pointer+1,'evidenceFingerprint',evidence_hash));
  perform production_control.handicap_source_receipt_v1(target,'RECORD_MANUAL_OBSERVATION',request_id,declared_hash,database_hash,actor_player,actor_auth,response_value); return response_value;
end;
$$;

create function public.stage_production_handicap_revision_from_hybrid_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target text; actor_player text; actor_auth uuid; request_id uuid; declared_hash text; database_hash text;
  expected_revision bigint; expected_source text; effective_date_value date; current_source text; roster_count integer; source_count integer;
  canonical_entries jsonb; inner_input jsonb; inner_hash text; result_value jsonb; response_value jsonb;
  prior production_control.handicap_source_operation_receipts_v1%rowtype; event_value uuid:=extensions.gen_random_uuid();
begin
  target:=production_control.assert_handicap_source_runtime_v1(input); actor_player:=pg_catalog.upper(pg_catalog.btrim(input#>>'{authorization,player_id}')); actor_auth:=(input#>>'{authorization,auth_user_id}')::uuid; declared_hash:=pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'request_payload_hash','')));
  if input->>'operation' is distinct from 'STAGE_PRODUCTION_HANDICAP_REVISION_FROM_HYBRID_V1' or coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce(input->>'expected_predecessor_revision','') !~ '^[0-9]+$' or coalesce(input->>'expected_source_fingerprint','') !~ '^[0-9a-f]{64}$' or coalesce(input->>'effective_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or pg_catalog.jsonb_typeof(input->'entries') is distinct from 'array' or declared_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='PRODUCTION_HANDICAP_SOURCE_DRAFT_INPUT_INVALID'; end if;
  request_id:=(input->>'operation_request_id')::uuid; expected_revision:=(input->>'expected_predecessor_revision')::bigint; expected_source:=input->>'expected_source_fingerprint'; effective_date_value:=(input->>'effective_date')::date;
  database_hash:=production_control.handicap_source_hash_v1(pg_catalog.jsonb_build_object('operation','STAGE_HYBRID_DRAFT','expectedRevision',expected_revision,'expectedSourceFingerprint',expected_source,'effectiveDate',effective_date_value,'entries',input->'entries','actorPlayerId',actor_player,'actorAuthUserId',actor_auth));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('production-handicap-source-stage:'||target,0));
  select value.* into prior from production_control.handicap_source_operation_receipts_v1 value where value.tournament_id=target and value.operation_request_id=request_id;
  if found then if prior.declared_request_payload_hash=declared_hash and prior.database_request_payload_hash=database_hash then return prior.response||pg_catalog.jsonb_build_object('idempotent',true); end if; raise exception using errcode='23505',message='PRODUCTION_HANDICAP_SOURCE_IDEMPOTENCY_CONFLICT'; end if;
  current_source:=production_control.handicap_source_set_fingerprint_v1(target);
  if current_source is distinct from expected_source then raise exception using errcode='40001',message='PRODUCTION_HANDICAP_SOURCE_FINGERPRINT_STALE'; end if;
  select pg_catalog.count(*)::integer into roster_count from scoring_authority.tournament_players value where value.tournament_id=target and value.participation_status='ACTIVE';
  select pg_catalog.count(*)::integer into source_count from scoring_authority.tournament_players roster join production_control.player_external_identities_v1 identity_value on identity_value.player_id=roster.player_id and identity_value.provider='GHIN' and identity_value.status='VERIFIED' join production_control.handicap_source_current_v1 source_pointer on source_pointer.tournament_id=target and source_pointer.player_id=roster.player_id and source_pointer.provider='GHIN' and source_pointer.source_status='CURRENT' join production_control.handicap_source_observations_v1 observation on observation.observation_id=source_pointer.observation_id and observation.identity_id=identity_value.identity_id where roster.tournament_id=target and roster.participation_status='ACTIVE';
  if roster_count=0 or source_count<>roster_count or pg_catalog.jsonb_array_length(input->'entries')<>roster_count then raise exception using errcode='22023',message='PRODUCTION_HANDICAP_SOURCE_INCOMPLETE_ROSTER'; end if;
  if exists(select 1 from scoring_authority.tournament_players roster left join pg_catalog.jsonb_array_elements(input->'entries') proposed on proposed->>'player_id'=roster.player_id where roster.tournament_id=target and roster.participation_status='ACTIVE' and (proposed is null or coalesce(proposed->>'tournament_handicap','') !~ '^-?[0-9]+(\.[0-9]+)?$')) then raise exception using errcode='22023',message='PRODUCTION_HANDICAP_SOURCE_INCOMPLETE_ROSTER'; end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'player_id',roster.player_id,
    'tournament_handicap',(proposed->>'tournament_handicap')::numeric,
    'source_index',observation.current_index,
    'low_index',observation.low_index,
    'source_metadata',pg_catalog.jsonb_build_object(
      'source','HYBRID_HANDICAP','provider','GHIN','provenance',observation.provenance,
      'identity_id',identity_value.identity_id,'observation_id',observation.observation_id,
      'source_evidence_fingerprint',observation.source_evidence_fingerprint,
      'hybrid_handicap',observation.hybrid_handicap,
      'manual_tournament_handicap_override',(proposed->>'tournament_handicap')::numeric is distinct from observation.hybrid_handicap
    )
  ) order by roster.player_id) into canonical_entries
  from scoring_authority.tournament_players roster
  join pg_catalog.jsonb_array_elements(input->'entries') proposed on proposed->>'player_id'=roster.player_id
  join production_control.player_external_identities_v1 identity_value on identity_value.player_id=roster.player_id and identity_value.provider='GHIN' and identity_value.status='VERIFIED'
  join production_control.handicap_source_current_v1 source_pointer on source_pointer.tournament_id=target and source_pointer.player_id=roster.player_id and source_pointer.provider='GHIN' and source_pointer.source_status='CURRENT'
  join production_control.handicap_source_observations_v1 observation on observation.observation_id=source_pointer.observation_id and observation.identity_id=identity_value.identity_id
  where roster.tournament_id=target and roster.participation_status='ACTIVE';
  inner_input := input || pg_catalog.jsonb_build_object(
    'contract_version','production-handicap-revision-v1','operation','STAGE_PRODUCTION_HANDICAP_REVISION_V1',
    'expected_predecessor_revision',expected_revision,'effective_date',effective_date_value,
    'method','DIRECTOR_HYBRID_HANDICAP_REVIEW','source_metadata',pg_catalog.jsonb_build_object(
      'entry_mode','PRODUCTION_DIRECTOR_HYBRID','hybrid_formula','round((current_hi + low_hi) / 2, 1)',
      'source_set_fingerprint',current_source,'approval_required',true
    ),'source_evidence_date',null,'entries',canonical_entries
  );
  inner_hash:=production_control.handicap_v1_hash(pg_catalog.jsonb_build_object(
    'operation','STAGE','operation_request_id',request_id,'actor_player_id',actor_player,'actor_auth_user_id',actor_auth,
    'expected_predecessor_revision',expected_revision,'effective_date',effective_date_value,
    'method','DIRECTOR_HYBRID_HANDICAP_REVIEW','source_metadata',inner_input->'source_metadata',
    'source_evidence_date',null,'entries',canonical_entries
  ));
  inner_input:=inner_input||pg_catalog.jsonb_build_object('request_payload_hash',inner_hash);
  result_value:=public.stage_production_handicap_revision_v1(inner_input);
  if result_value->>'ok' is distinct from 'true' then return result_value; end if;
  response_value:=result_value||pg_catalog.jsonb_build_object('code','PRODUCTION_HYBRID_HANDICAP_DRAFT_STAGED','idempotent',false,'sourceFingerprint',current_source,'autoApproved',false,'eventId',event_value);
  insert into production_control.handicap_source_audit_events_v1(event_id,tournament_id,action,handicap_revision_id,actor_player_id,actor_auth_user_id,operation_request_id,before_state,after_state)
  values(event_value,target,'HYBRID_DRAFT_STAGED',(result_value->>'revision_id')::uuid,actor_player,actor_auth,request_id,pg_catalog.jsonb_build_object('approvedRevision',expected_revision,'sourceFingerprint',current_source),pg_catalog.jsonb_build_object('draftRevisionId',result_value->>'revision_id','draftRevision',result_value->>'revision_number','status','DRAFT'));
  perform production_control.handicap_source_receipt_v1(target,'STAGE_HYBRID_DRAFT',request_id,declared_hash,database_hash,actor_player,actor_auth,response_value); return response_value;
end;
$$;

comment on table production_control.player_external_identities_v1 is 'Private external identities. GHIN values are excluded from public and participant projections.';
comment on table production_control.handicap_source_observations_v1 is 'Immutable proposal evidence; never a scoring authority.';
comment on function production_control.hybrid_handicap_v1(numeric,numeric) is 'Phase 2A Hybrid proposal: PostgreSQL numeric mean rounded once to one decimal, half away from zero.';

revoke all on function production_control.reject_handicap_source_immutable_v1(),
  production_control.handicap_source_hash_v1(jsonb),
  production_control.hybrid_handicap_v1(numeric,numeric),
  production_control.assert_handicap_source_runtime_v1(jsonb),
  production_control.handicap_source_set_fingerprint_v1(text),
  production_control.handicap_source_receipt_v1(text,text,uuid,text,text,text,uuid,jsonb)
from public, anon, authenticated, service_role;

revoke all on function public.read_production_handicap_source_v1(jsonb),
  public.set_production_player_ghin_identity_v1(jsonb),
  public.retire_production_player_ghin_identity_v1(jsonb),
  public.record_production_manual_handicap_source_v1(jsonb),
  public.stage_production_handicap_revision_from_hybrid_v1(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.read_production_handicap_source_v1(jsonb),
  public.set_production_player_ghin_identity_v1(jsonb),
  public.retire_production_player_ghin_identity_v1(jsonb),
  public.record_production_manual_handicap_source_v1(jsonb),
  public.stage_production_handicap_revision_from_hybrid_v1(jsonb)
to service_role;

notify pgrst, 'reload schema';
commit;
