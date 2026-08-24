-- Step 10B Production current-tournament shadow import V2.
--
-- This migration intentionally supports the real pre-tournament state where
-- official pairings are pending or partially entered. It never fills a blank
-- participant slot. A V2 import is allowed only while Production Google is
-- canonical and the source proves there is no active/final scoring, scoring
-- access, outbox/archive/mirror work, or public Supabase traffic.
begin;

create table production_control.current_shadow_import_claims (
  claim_id uuid primary key default extensions.gen_random_uuid(),
  bootstrap_key text not null unique default 'STEP10B_CURRENT_SHADOW_V2'
    check (bootstrap_key = 'STEP10B_CURRENT_SHADOW_V2'),
  tournament_id text not null check (tournament_id = '2026'),
  operation text not null check (operation = 'CURRENT_TOURNAMENT_SHADOW_IMPORT'),
  actor text not null check (actor = 'step10b-production-shadow-bootstrap'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  import_contract text not null check (import_contract = 'production-current-shadow-v2'),
  status text not null default 'PENDING' check (status in ('PENDING','CONSUMED','EXPIRED','REJECTED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  consumed_at timestamptz,
  import_run_id uuid references production_control.import_runs(import_run_id),
  check (
    (status = 'PENDING' and consumed_at is null and import_run_id is null)
    or (status = 'CONSUMED' and consumed_at is not null and import_run_id is not null)
    or status in ('EXPIRED','REJECTED')
  )
);

create unique index current_shadow_import_claim_pending_identity
  on production_control.current_shadow_import_claims (
    tournament_id, actor, request_fingerprint, source_fingerprint, payload_fingerprint
  ) where status = 'PENDING';

create table production_control.current_shadow_revisions (
  import_run_id uuid primary key references production_control.import_runs(import_run_id),
  tournament_id text not null check (tournament_id = '2026'),
  tournament_year integer not null check (tournament_year = 2026),
  source_workbook_id text not null check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  pairing_state text not null check (pairing_state in ('PENDING','PARTIAL','COMPLETE')),
  current_context jsonb not null check (jsonb_typeof(current_context) = 'object'),
  tournament_rules jsonb not null check (jsonb_typeof(tournament_rules) = 'array'),
  identity_reconciliation jsonb not null check (jsonb_typeof(identity_reconciliation) = 'object'),
  shadow_safety jsonb not null check (jsonb_typeof(shadow_safety) = 'object'),
  source_payload jsonb not null check (jsonb_typeof(source_payload) = 'object'),
  imported_by text not null check (imported_by = 'step10b-production-shadow-bootstrap'),
  imported_at timestamptz not null default now()
);

alter table production_control.current_shadow_import_claims enable row level security;
alter table production_control.current_shadow_revisions enable row level security;
revoke all on production_control.current_shadow_import_claims from public, anon, authenticated, service_role;
revoke all on production_control.current_shadow_revisions from public, anon, authenticated, service_role;

create or replace function production_control.assert_current_shadow_v2_dormant()
returns production_control.resource_scope
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
begin
  select * into strict scope
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';

  if scope.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or scope.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or scope.google_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or scope.vercel_project <> 'bagger-inv'
     or scope.canonical_domain <> 'https://baggerinv.com'
     or scope.current_tournament_id <> '2026'
     or scope.current_tournament_year <> 2026
     or scope.current_tournament_read_authority <> 'GOOGLE'
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
    select 1 from production_control.tournament_scopes tournament_scope
    where tournament_scope.tournament_id = '2026'
      and tournament_scope.tournament_year = 2026
      and tournament_scope.source_workbook_id = scope.google_workbook_id
      and tournament_scope.scope_kind = 'CURRENT_TOURNAMENT'
      and tournament_scope.active_for_shadow_import
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_TOURNAMENT_SCOPE_REQUIRED';
  end if;
  if exists (
    select 1 from production_control.worker_controls
    where enabled or scheduler_installed or google_writes_allowed
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_SHADOW_WORKERS_MUST_REMAIN_DORMANT';
  end if;
  return scope;
end;
$$;
revoke all on function production_control.assert_current_shadow_v2_dormant()
  from public, anon, authenticated, service_role;

create or replace function public.claim_production_current_tournament_shadow_import(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  claim production_control.current_shadow_import_claims%rowtype;
  operation_value text := upper(btrim(coalesce(input->>'operation','')));
  actor_value text := btrim(coalesce(input->>'actor_id',''));
  request_text text := coalesce(input->>'request_canonical_json','');
  request_value jsonb;
  expected_request jsonb;
  request_fingerprint_value text := lower(btrim(coalesce(input->>'request_fingerprint','')));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint','')));
  payload_fingerprint_value text := lower(btrim(coalesce(input->>'payload_fingerprint','')));
begin
  scope := production_control.assert_current_shadow_v2_dormant();
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_SERVICE_ROLE_REQUIRED';
  end if;
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref','')) <> scope.project_ref
     or btrim(coalesce(input->>'project_url','')) <> scope.project_url
     or btrim(coalesce(input->>'source_workbook_id','')) <> scope.google_workbook_id
     or btrim(coalesce(input->>'tournament_id','')) <> '2026'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or btrim(coalesce(input->>'import_contract_version','')) <> 'production-current-shadow-v2'
     or operation_value <> 'CURRENT_TOURNAMENT_SHADOW_IMPORT'
     or actor_value <> 'step10b-production-shadow-bootstrap'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or payload_fingerprint_value !~ '^[0-9a-f]{64}$'
     or btrim(request_text) = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_CLAIM_SCOPE_REQUIRED';
  end if;

  begin
    request_value := request_text::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'PRODUCTION_CURRENT_SHADOW_REQUEST_EVIDENCE_INVALID';
  end;
  expected_request := jsonb_build_object(
    'actor_id', 'step10b-production-shadow-bootstrap',
    'environment', 'PRODUCTION',
    'import_contract_version', 'production-current-shadow-v2',
    'operation', 'CURRENT_TOURNAMENT_SHADOW_IMPORT',
    'payload_fingerprint', payload_fingerprint_value,
    'project_ref', scope.project_ref,
    'project_url', scope.project_url,
    'source_fingerprint', source_fingerprint_value,
    'source_workbook_id', scope.google_workbook_id,
    'tournament_id', '2026',
    'tournament_year', 2026
  );
  if request_value is distinct from expected_request
     or encode(extensions.digest(request_text,'sha256'),'hex') <> request_fingerprint_value then
    raise exception using errcode = '22023', message = 'PRODUCTION_CURRENT_SHADOW_REQUEST_EVIDENCE_MISMATCH';
  end if;

  update production_control.current_shadow_import_claims value
  set status = 'EXPIRED'
  where value.status = 'PENDING' and value.expires_at <= now();

  insert into production_control.current_shadow_import_claims (
    bootstrap_key, tournament_id, operation, actor, request_fingerprint,
    source_fingerprint, payload_fingerprint, import_contract
  ) values (
    'STEP10B_CURRENT_SHADOW_V2', '2026', operation_value, actor_value,
    request_fingerprint_value, source_fingerprint_value, payload_fingerprint_value,
    'production-current-shadow-v2'
  )
  on conflict (bootstrap_key) do nothing
  returning * into claim;

  if claim.claim_id is null then
    select * into claim
    from production_control.current_shadow_import_claims value
    where value.bootstrap_key = 'STEP10B_CURRENT_SHADOW_V2'
    for update;
    if claim.operation <> operation_value
       or claim.actor <> actor_value
       or claim.request_fingerprint <> request_fingerprint_value
       or claim.source_fingerprint <> source_fingerprint_value
       or claim.payload_fingerprint <> payload_fingerprint_value then
      raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_ALREADY_USED';
    end if;
    if claim.status = 'CONSUMED' and claim.import_run_id is not null then
      return jsonb_build_object('ok', true, 'claim_id', claim.claim_id,
        'tournament_id', '2026', 'request_fingerprint', request_fingerprint_value,
        'single_use', true, 'duplicate', true, 'consumed', true,
        'import_run_id', claim.import_run_id, 'authoritative', false,
        'scoring_ingress', 'DISABLED', 'google_write', false);
    end if;
    if claim.status <> 'PENDING' or claim.expires_at <= now() then
      raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_ALREADY_USED';
    end if;
  end if;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'CURRENT_SHADOW_IMPORT_BOOTSTRAP_CLAIMED', 'CURRENT_TOURNAMENT', '2026', actor_value,
    request_fingerprint_value, 'CLAIMED',
    jsonb_build_object('claimId', claim.claim_id, 'expiresAt', claim.expires_at,
      'operation', operation_value, 'sourceFingerprint', source_fingerprint_value,
      'payloadFingerprint', payload_fingerprint_value, 'singleUse', true,
      'serviceRoleOnly', true, 'authoritative', false)
  );
  return jsonb_build_object('ok', true, 'claim_id', claim.claim_id,
    'expires_at', claim.expires_at, 'tournament_id', '2026',
    'request_fingerprint', request_fingerprint_value, 'single_use', true,
    'authoritative', false, 'scoring_ingress', 'DISABLED', 'google_write', false);
end;
$$;
revoke all on function public.claim_production_current_tournament_shadow_import(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.import_production_current_tournament_shadow(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  claim production_control.current_shadow_import_claims%rowtype;
  existing_run production_control.import_runs%rowtype;
  current_projection jsonb;
  request_value jsonb;
  expected_request jsonb;
  source_value jsonb;
  payload_value jsonb;
  request_text text := coalesce(input->>'request_canonical_json','');
  payload_body jsonb := input->'payload';
  source_text text := coalesce(input->>'source_canonical_json','');
  payload_text text := coalesce(input->>'payload_canonical_json','');
  operation_value text := upper(btrim(coalesce(input->>'operation','')));
  actor_value text := btrim(coalesce(input->>'actor_id',''));
  request_fingerprint_value text := lower(btrim(coalesce(input->>'request_fingerprint','')));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint','')));
  payload_fingerprint_value text := lower(btrim(coalesce(input->>'payload_fingerprint','')));
  database_fingerprint_value text;
  tournament_run_id uuid := extensions.gen_random_uuid();
  scoring_run_id uuid := extensions.gen_random_uuid();
  previous_tournament_run_id uuid;
  previous_scoring_run_id uuid;
  item jsonb;
  counts_value jsonb;
  expected_match_count integer;
  operational_trigger_count integer;
begin
  scope := production_control.assert_current_shadow_v2_dormant();
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_SERVICE_ROLE_REQUIRED';
  end if;
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref','')) <> scope.project_ref
     or btrim(coalesce(input->>'project_url','')) <> scope.project_url
     or btrim(coalesce(input->>'source_workbook_id','')) <> scope.google_workbook_id
     or btrim(coalesce(input->>'tournament_id','')) <> '2026'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or btrim(coalesce(input->>'import_contract_version','')) <> 'production-current-shadow-v2'
     or operation_value <> 'CURRENT_TOURNAMENT_SHADOW_IMPORT'
     or actor_value <> 'step10b-production-shadow-bootstrap'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or payload_fingerprint_value !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(input->'source_payload') <> 'object'
     or jsonb_typeof(payload_body) <> 'object'
     or btrim(request_text) = '' or btrim(source_text) = '' or btrim(payload_text) = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_V2_SCOPE_REQUIRED';
  end if;

  begin
    select * into claim
    from production_control.current_shadow_import_claims value
    where value.claim_id = (input->>'claim_id')::uuid
    for update;
  exception when others then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_CLAIM_REQUIRED';
  end;
  if claim.claim_id is null or claim.status not in ('PENDING','CONSUMED')
     or (claim.status = 'PENDING' and claim.expires_at <= now())
     or (claim.status = 'CONSUMED' and claim.import_run_id is null)
     or claim.tournament_id <> '2026'
     or claim.bootstrap_key <> 'STEP10B_CURRENT_SHADOW_V2'
     or claim.operation <> operation_value
     or claim.actor <> actor_value
     or claim.request_fingerprint <> request_fingerprint_value
     or claim.source_fingerprint <> source_fingerprint_value
     or claim.payload_fingerprint <> payload_fingerprint_value
     or claim.import_contract <> 'production-current-shadow-v2'
  then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_CLAIM_INVALID';
  end if;

  begin
    request_value := request_text::jsonb;
    source_value := source_text::jsonb;
    payload_value := payload_text::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'PRODUCTION_CURRENT_SHADOW_CANONICAL_JSON_INVALID';
  end;
  expected_request := jsonb_build_object(
    'actor_id', 'step10b-production-shadow-bootstrap',
    'environment', 'PRODUCTION',
    'import_contract_version', 'production-current-shadow-v2',
    'operation', 'CURRENT_TOURNAMENT_SHADOW_IMPORT',
    'payload_fingerprint', payload_fingerprint_value,
    'project_ref', scope.project_ref,
    'project_url', scope.project_url,
    'source_fingerprint', source_fingerprint_value,
    'source_workbook_id', scope.google_workbook_id,
    'tournament_id', '2026',
    'tournament_year', 2026
  );
  if request_value is distinct from expected_request
     or encode(extensions.digest(request_text,'sha256'),'hex') <> request_fingerprint_value
     or source_value is distinct from input->'source_payload'
     or payload_value is distinct from payload_body
     or encode(extensions.digest(source_text,'sha256'),'hex') <> source_fingerprint_value
     or encode(extensions.digest(payload_text,'sha256'),'hex') <> payload_fingerprint_value then
    raise exception using errcode = '22023', message = 'PRODUCTION_CURRENT_SHADOW_CANONICAL_EVIDENCE_MISMATCH';
  end if;
  if source_value->>'source_workbook_id' <> scope.google_workbook_id
     or source_value->>'tournament_id' <> '2026'
     or coalesce((source_value->>'tournament_year')::integer,0) <> 2026
     or jsonb_typeof(source_value->'sheets') <> 'array'
     or (select jsonb_agg(value->>'sheet' order by ordinal)
         from jsonb_array_elements(source_value->'sheets') with ordinality sheet(value,ordinal))
        <> '["Tournaments","Live Tournaments","Players","Handicaps","Team Names","Rounds","Tournament Rules","Courses","Course Holes","Live Matches","Matches","Live Hole Scores","Match Update Log","Admin Audit Log"]'::jsonb then
    raise exception using errcode = '22023', message = 'PRODUCTION_CURRENT_SHADOW_SOURCE_CONTRACT_REQUIRED';
  end if;

  if upper(btrim(coalesce(payload_body->>'environment',''))) <> 'PRODUCTION'
     or payload_body->>'source_workbook_id' <> scope.google_workbook_id
     or payload_body#>>'{tournament,tournament_id}' <> '2026'
     or coalesce((payload_body#>>'{tournament,tournament_year}')::integer, 0) <> 2026
     or upper(btrim(coalesce(payload_body#>>'{tournament,lifecycle}',''))) not in ('UPCOMING','SCHEDULED')
     or coalesce((payload_body#>>'{tournament,team_1_score}')::numeric, 0) <> 0
     or coalesce((payload_body#>>'{tournament,team_2_score}')::numeric, 0) <> 0
     or jsonb_typeof(payload_body->'rules') <> 'array'
     or jsonb_array_length(payload_body->'rules') <> 3
     or (select count(distinct (rule->>'round_number')::integer)
         from jsonb_array_elements(payload_body->'rules') rule) <> 3
     or exists (
       select 1 from jsonb_array_elements(payload_body->'rules') rule
       where (rule->>'round_number')::integer not in (1,2,3)
          or upper(rule->>'format') <> case (rule->>'round_number')::integer
            when 1 then 'BB' when 2 then 'SC' when 3 then 'SI' end
     )
     or payload_body#>>'{pairing_contract,contract_version}' <> 'production-current-pairing-state-v1'
     or upper(btrim(coalesce(payload_body#>>'{pairing_contract,state}',''))) not in ('PENDING','PARTIAL','COMPLETE')
     or coalesce((payload_body#>>'{pairing_contract,no_pairings_inferred}')::boolean, false) is not true
     or payload_body#>>'{identity_reconciliation,join_key}' <> 'Player ID'
     or coalesce((payload_body#>>'{identity_reconciliation,historical_appearances_inferred}')::boolean, true)
     or jsonb_array_length(coalesce(payload_body#>'{identity_reconciliation,unresolved_current_only_ids}','[]'::jsonb)) <> 0
     or payload_body#>>'{shadow_safety,direction}' <> 'PRODUCTION_GOOGLE_TO_PRODUCTION_SUPABASE'
     or upper(btrim(coalesce(payload_body#>>'{shadow_safety,scoring_authority}',''))) <> 'GOOGLE'
     or coalesce((payload_body#>>'{shadow_safety,authoritative}')::boolean, true)
     or coalesce((payload_body#>>'{shadow_safety,scoring_ingress_enabled}')::boolean, true)
     or coalesce((payload_body#>>'{shadow_safety,google_outbox_enabled}')::boolean, true)
     or coalesce((payload_body#>>'{shadow_safety,scorecard_archive_enabled}')::boolean, true)
     or coalesce((payload_body#>>'{shadow_safety,google_mirror_enabled}')::boolean, true)
     or coalesce((payload_body#>>'{shadow_safety,participant_scoring_enabled}')::boolean, true)
     or coalesce((payload_body#>>'{shadow_safety,public_reads_enabled}')::boolean, true) then
    raise exception using errcode = '22023', message = 'PRODUCTION_CURRENT_SHADOW_PRE_TOURNAMENT_CONTRACT_REQUIRED';
  end if;

  if exists (
      select 1 from jsonb_array_elements(payload_body#>'{pairing_contract,matches}') value
      where value->>'state' = 'INVALID'
         or coalesce((value#>>'{activity,active}')::boolean, false)
         or coalesce((value#>>'{activity,scored}')::boolean, false)
         or coalesce((value#>>'{activity,access_active}')::boolean, false)
         or coalesce((value#>>'{activity,scoring_locked}')::boolean, false)
         or coalesce((value#>>'{activity,finalized}')::boolean, false)
    )
     or exists (
       select 1 from jsonb_array_elements(coalesce(payload_body->'matches','[]'::jsonb)) value
       where upper(coalesce(value->>'status','')) <> 'UPCOMING'
          or coalesce((value->>'scoring_locked')::boolean, false)
          or coalesce((value->>'scored_holes')::integer, 0) <> 0
          or coalesce((value->>'current_hole')::integer, 0) <> 0
          or coalesce((value->>'scorecard_complete')::boolean, false)
          or btrim(coalesce(value->>'finalized_at','')) <> ''
     )
     or jsonb_array_length(coalesce(payload_body->'hole_scores','[]'::jsonb)) <> 0
     or exists (
       select 1 from jsonb_array_elements(coalesce(payload_body->'permissions','[]'::jsonb)) value
       where coalesce((value->>'can_score')::boolean, false)
     ) then
    raise exception using errcode = '22023', message = 'PRODUCTION_CURRENT_SHADOW_ACTIVITY_PROHIBITED';
  end if;

  expected_match_count := jsonb_array_length(coalesce(payload_body->'matches','[]'::jsonb));
  if expected_match_count <> 24
     or jsonb_array_length(coalesce(payload_body->'players','[]'::jsonb)) <> 41
     or jsonb_array_length(coalesce(payload_body->'tournament_players','[]'::jsonb)) <> 24
     or jsonb_array_length(coalesce(payload_body->'teams','[]'::jsonb)) <> 2
     or jsonb_array_length(coalesce(payload_body->'rounds','[]'::jsonb)) <> 3
     or jsonb_array_length(coalesce(payload_body->'snapshots','[]'::jsonb)) <> expected_match_count
     or jsonb_array_length(coalesce(payload_body->'match_holes','[]'::jsonb)) <> expected_match_count * 18
     or jsonb_array_length(coalesce(payload_body->'permissions','[]'::jsonb))
        <> jsonb_array_length(coalesce(payload_body->'match_participants','[]'::jsonb))
     or (select count(distinct value->>'match_id') from jsonb_array_elements(payload_body->'matches') value)
        <> expected_match_count
     or jsonb_array_length(coalesce(payload_body#>'{pairing_contract,matches}','[]'::jsonb)) <> expected_match_count
     or (select count(*) from jsonb_array_elements(payload_body#>'{pairing_contract,matches}') pairing,
          lateral jsonb_array_elements(coalesce(pairing->'supplied_slots','[]'::jsonb)) supplied)
        <> jsonb_array_length(coalesce(payload_body->'match_participants','[]'::jsonb))
     or exists (
       select 1
       from jsonb_array_elements(payload_body#>'{pairing_contract,matches}') pairing,
         lateral jsonb_array_elements(coalesce(pairing->'supplied_slots','[]'::jsonb)) supplied
       where not exists (
         select 1 from jsonb_array_elements(payload_body->'match_participants') participant
         where participant->>'match_id' = pairing->>'match_id'
           and participant->>'player_id' = supplied->>'player_id'
           and (participant->>'team_side')::integer =
             substring(supplied->>'field' from '^Team ([12])')::integer
           and (participant->>'player_slot')::integer =
             substring(supplied->>'field' from 'Player ([12])$')::integer
       )
     )
     or exists (
       select 1 from jsonb_array_elements(payload_body->'match_participants') participant
       where not exists (
         select 1
         from jsonb_array_elements(payload_body#>'{pairing_contract,matches}') pairing,
           lateral jsonb_array_elements(coalesce(pairing->'supplied_slots','[]'::jsonb)) supplied
         where pairing->>'match_id' = participant->>'match_id'
           and supplied->>'player_id' = participant->>'player_id'
           and substring(supplied->>'field' from '^Team ([12])')::integer =
             (participant->>'team_side')::integer
           and substring(supplied->>'field' from 'Player ([12])$')::integer =
             (participant->>'player_slot')::integer
       )
     )
     or exists (
       select required.player_id
       from (values ('CM01'),('JK02'),('PN01')) required(player_id)
       where not exists (
         select 1 from jsonb_array_elements(coalesce(payload_body->'players','[]'::jsonb)) player
         where player->>'player_id' = required.player_id
       ) or not exists (
         select 1 from jsonb_array_elements(coalesce(payload_body->'tournament_players','[]'::jsonb)) roster
         where roster->>'player_id' = required.player_id
       )
     ) then
    raise exception using errcode = '22023', message = 'PRODUCTION_CURRENT_SHADOW_PAYLOAD_INCOMPLETE';
  end if;

  select count(*) into operational_trigger_count
  from pg_catalog.pg_trigger trigger_value
  where trigger_value.tgname in (
    'net_skins_hole_score_recalculation', 'tournament_storylines_score_change',
    'calcutta_official_match_change', 'capture_scorecard_archive_transition',
    'net_skins_match_lifecycle_recalculation', 'tournament_derived_match_change',
    'odds_google_mirror_supersession', 'tournament_storylines_net_skins_change'
  ) and trigger_value.tgenabled <> 'D';
  if operational_trigger_count > 0 then
    raise exception using errcode = '42501', message = 'PRODUCTION_OPERATIONAL_TRIGGER_MUST_REMAIN_DISABLED';
  end if;
  if exists (select 1 from scoring_authority.google_outbox_events where tournament_id = '2026')
     or exists (select 1 from scoring_authority.score_mutations mutation join scoring_authority.matches match_value using (match_id) where match_value.tournament_id = '2026')
     or exists (select 1 from scoring_authority.authority_epochs where tournament_id = '2026')
     or exists (select 1 from scoring_authority.scoring_ingress_leases where tournament_id = '2026')
     or exists (select 1 from scoring_authority.scorecard_archive_jobs where tournament_id = '2026')
     or exists (select 1 from scoring_authority.odds_google_mirror_jobs where tournament_id = '2026') then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_AUTHORITATIVE_ACTIVITY_PRESENT';
  end if;
  if exists (select 1 from auth.users)
     or exists (select 1 from production_control.director_entitlements where tournament_id = '2026')
     or exists (select 1 from participant_identity.participant_identity_contacts where tournament_id = '2026')
     or exists (select 1 from participant_identity.participant_auth_otp_attempts where tournament_id = '2026')
     or exists (select 1 from participant_identity.participant_auth_identifiers where source_tournament_id = '2026')
     or exists (
       select 1 from participant_identity.user_player_links link
       join scoring_authority.tournament_players player on player.player_id = link.player_id
       where player.tournament_id = '2026'
     ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_IDENTITY_ACTIVITY_PRESENT';
  end if;

  perform pg_advisory_xact_lock(hashtext('production-current-shadow-v2-2026'));
  select * into existing_run from production_control.import_runs run
  where run.domain = 'CURRENT_SCORING_SHADOW'
    and run.tournament_id = '2026'
    and run.tournament_year = 2026
    and run.source_workbook_id = scope.google_workbook_id
    and run.source_fingerprint = source_fingerprint_value
    and run.payload_fingerprint = payload_fingerprint_value
    and run.status = 'SUCCEEDED'
  order by run.completed_at desc limit 1;
  if claim.status = 'CONSUMED' and (
    existing_run.import_run_id is null or claim.import_run_id <> existing_run.import_run_id
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_CURRENT_SHADOW_CONSUMED_CLAIM_DRIFT';
  end if;
  if existing_run.import_run_id is not null then
    current_projection := production_control.current_tournament_shadow_projection('2026');
    database_fingerprint_value := encode(extensions.digest(current_projection::text,'sha256'),'hex');
    if database_fingerprint_value <> existing_run.database_fingerprint then
      raise exception using errcode = 'P0001', message = 'PRODUCTION_CURRENT_SHADOW_DRIFT_DETECTED';
    end if;
    update production_control.current_shadow_import_claims
    set status = 'CONSUMED', consumed_at = now(), import_run_id = existing_run.import_run_id
    where claim_id = claim.claim_id;
    return jsonb_build_object('ok',true,'changed',false,'duplicate',true,
      'import_run_id',existing_run.import_run_id,'database_fingerprint',database_fingerprint_value,
      'authority','GOOGLE','scoring_ingress','DISABLED','google_write',false);
  end if;

  select import_run_id into previous_tournament_run_id
  from production_control.import_runs
  where domain = 'CURRENT_TOURNAMENT' and tournament_id = '2026' and status = 'SUCCEEDED'
  order by completed_at desc nulls last limit 1;
  select import_run_id into previous_scoring_run_id
  from production_control.import_runs
  where domain = 'CURRENT_SCORING_SHADOW' and tournament_id = '2026' and status = 'SUCCEEDED'
  order by completed_at desc nulls last limit 1;

  delete from scoring_authority.matches where tournament_id = '2026';
  delete from scoring_authority.scoring_snapshots where tournament_id = '2026';
  delete from scoring_authority.ingress_gates where tournament_id = '2026';
  delete from scoring_authority.tournament_players where tournament_id = '2026';
  delete from scoring_authority.rounds where tournament_id = '2026';
  delete from scoring_authority.teams where tournament_id = '2026';

  insert into scoring_authority.tournaments (
    tournament_id,tournament_year,name,source_workbook_id,scoring_authority,imported_at,updated_at
  ) values (
    '2026',2026,payload_body#>>'{tournament,name}',scope.google_workbook_id,'GOOGLE',now(),now()
  ) on conflict (tournament_id) do update set
    tournament_year=excluded.tournament_year,name=excluded.name,
    source_workbook_id=excluded.source_workbook_id,scoring_authority='GOOGLE',
    imported_at=now(),updated_at=now();

  for item in select value from jsonb_array_elements(payload_body->'players') loop
    insert into scoring_authority.players (player_id,display_name,source_payload)
    values (item->>'player_id',item->>'display_name',coalesce(item->'source_payload','{}'::jsonb))
    on conflict (player_id) do update set display_name=excluded.display_name,
      source_payload=scoring_authority.players.source_payload || excluded.source_payload,
      updated_at=now();
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'teams') loop
    insert into scoring_authority.teams (tournament_id,team_id,team_side,name,source_payload)
    values ('2026',item->>'team_id',(item->>'team_side')::integer,item->>'name',coalesce(item->'source_payload','{}'::jsonb))
    on conflict (tournament_id,team_id) do update set team_side=excluded.team_side,
      name=excluded.name,source_payload=excluded.source_payload;
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'tournament_players') loop
    insert into scoring_authority.tournament_players (
      tournament_id,player_id,team_id,team_side,participation_status,source_roster_key,source_payload
    ) values ('2026',item->>'player_id',item->>'team_id',(item->>'team_side')::integer,
      coalesce(item->>'participation_status','ACTIVE'),item->>'source_roster_key',coalesce(item->'source_payload','{}'::jsonb));
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'rounds') loop
    insert into scoring_authority.rounds (
      tournament_id,round_number,format,name,handicap_allowance,status,source_payload
    ) values ('2026',(item->>'round_number')::integer,item->>'format',item->>'name',
      nullif(item->>'handicap_allowance','')::numeric,coalesce(item->>'status','UPCOMING'),coalesce(item->'source_payload','{}'::jsonb))
    on conflict (tournament_id,round_number) do update set format=excluded.format,name=excluded.name,
      handicap_allowance=excluded.handicap_allowance,status=excluded.status,source_payload=excluded.source_payload;
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'snapshots') loop
    insert into scoring_authority.scoring_snapshots (
      snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,format,
      handicap_allowance,course_id,tee,rating,slope,par,match_netting_baseline,
      hole_definitions,participant_configuration,team_configuration,effective_at,canonical_hash
    ) values (item->>'snapshot_id','2026',item->>'match_id',(item->>'snapshot_revision')::bigint,
      item->>'scoring_rules_version',item->>'format',nullif(item->>'handicap_allowance','')::numeric,
      item->>'course_id',item->>'tee',nullif(item->>'rating','')::numeric,
      nullif(item->>'slope','')::integer,(item->>'par')::integer,item->>'match_netting_baseline',
      item->'hole_definitions',item->'participant_configuration',item->'team_configuration',
      nullif(item->>'effective_at','')::timestamptz,item->>'canonical_hash');
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'matches') loop
    insert into scoring_authority.matches (
      match_id,tournament_id,round_number,format,scoring_snapshot_id,status,scoring_locked,
      permission_revision,match_revision,source_google_revision,scored_holes,current_hole,
      holes_remaining,team_1_holes_won,team_2_holes_won,running_result,result_winner,
      clinched,scorecard_complete,unresolved_mutations,source_google_updated_at,authority_updated_at,finalized_at
    ) values (item->>'match_id','2026',(item->>'round_number')::integer,item->>'format',item->>'scoring_snapshot_id',
      'UPCOMING',false,coalesce((item->>'permission_revision')::bigint,1),coalesce((item->>'match_revision')::bigint,0),
      coalesce((item->>'source_google_revision')::bigint,0),0,0,18,0,0,
      coalesce(item->>'running_result','Scheduled'),'',false,false,0,
      nullif(item->>'source_google_updated_at','')::timestamptz,
      coalesce(nullif(item->>'authority_updated_at','')::timestamptz,now()),null);
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'match_participants') loop
    insert into scoring_authority.match_participants (
      match_id,player_id,team_side,player_slot,handicap_index,course_handicap,playing_handicap,final_strokes
    ) values (item->>'match_id',item->>'player_id',(item->>'team_side')::integer,(item->>'player_slot')::integer,
      nullif(item->>'handicap_index','')::numeric,nullif(item->>'course_handicap','')::numeric,
      coalesce((item->>'playing_handicap')::numeric,0),coalesce((item->>'final_strokes')::integer,0));
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'permissions') loop
    insert into scoring_authority.scoring_permissions (match_id,player_id,can_score,permission_revision,revoked_at)
    values (item->>'match_id',item->>'player_id',false,coalesce((item->>'permission_revision')::bigint,1),null);
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'match_holes') loop
    insert into scoring_authority.match_holes (match_id,hole_number,snapshot_id,stroke_index,par,yardage)
    values (item->>'match_id',(item->>'hole_number')::integer,item->>'snapshot_id',
      (item->>'stroke_index')::integer,(item->>'par')::integer,nullif(item->>'yardage','')::integer);
  end loop;
  for item in select value from jsonb_array_elements(payload_body->'checkpoints') loop
    insert into scoring_authority.google_match_checkpoints (
      match_id,last_supabase_match_revision,google_match_updated_at,google_match_revision,
      google_hole_revisions,verified_fingerprint,verified_at
    ) values (item->>'match_id',(item->>'last_supabase_match_revision')::bigint,
      nullif(item->>'google_match_updated_at','')::timestamptz,
      coalesce((item->>'google_match_revision')::bigint,0),coalesce(item->'google_hole_revisions','{}'::jsonb),
      item->>'verified_fingerprint',now());
  end loop;
  insert into scoring_authority.ingress_gates (
    tournament_id,state,authority,active_epoch_id,unresolved_client_queues,updated_by
  ) values ('2026','PAUSED','GOOGLE',null,0,claim.actor);

  if exists (select 1 from scoring_authority.google_outbox_events where tournament_id = '2026')
     or exists (select 1 from scoring_authority.scorecard_archive_jobs where tournament_id = '2026')
     or exists (select 1 from scoring_authority.odds_google_mirror_jobs where tournament_id = '2026') then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_SHADOW_IMPORT_CREATED_DELIVERY_WORK';
  end if;

  counts_value := jsonb_build_object(
    'players',jsonb_array_length(payload_body->'players'),
    'tournament_players',jsonb_array_length(payload_body->'tournament_players'),
    'teams',jsonb_array_length(payload_body->'teams'),
    'rounds',jsonb_array_length(payload_body->'rounds'),
    'snapshots',jsonb_array_length(payload_body->'snapshots'),
    'matches',jsonb_array_length(payload_body->'matches'),
    'match_participants',jsonb_array_length(payload_body->'match_participants'),
    'permissions',jsonb_array_length(payload_body->'permissions'),
    'match_holes',jsonb_array_length(payload_body->'match_holes'),
    'hole_scores',0,'checkpoints',jsonb_array_length(payload_body->'checkpoints'),
    'pairing_state',payload_body#>>'{pairing_contract,state}'
  );
  current_projection := production_control.current_tournament_shadow_projection('2026');
  database_fingerprint_value := encode(extensions.digest(current_projection::text,'sha256'),'hex');

  insert into production_control.import_runs (
    import_run_id,domain,tournament_id,tournament_year,source_workbook_id,
    source_fingerprint,payload_fingerprint,database_fingerprint,importer_contract,
    actor,status,previous_import_run_id,counts,started_at,completed_at
  ) values (tournament_run_id,'CURRENT_TOURNAMENT','2026',2026,scope.google_workbook_id,
    source_fingerprint_value,payload_fingerprint_value,database_fingerprint_value,
    'production-current-shadow-v2',claim.actor,'SUCCEEDED',previous_tournament_run_id,counts_value,now(),now());
  insert into production_control.import_runs (
    import_run_id,domain,tournament_id,tournament_year,source_workbook_id,
    source_fingerprint,payload_fingerprint,database_fingerprint,importer_contract,
    actor,status,previous_import_run_id,counts,started_at,completed_at
  ) values (scoring_run_id,'CURRENT_SCORING_SHADOW','2026',2026,scope.google_workbook_id,
    source_fingerprint_value,payload_fingerprint_value,database_fingerprint_value,
    'production-current-shadow-v2',claim.actor,'SUCCEEDED',previous_scoring_run_id,counts_value,now(),now());

  insert into production_control.current_shadow_revisions (
    import_run_id,tournament_id,tournament_year,source_workbook_id,source_fingerprint,
    payload_fingerprint,pairing_state,current_context,tournament_rules,
    identity_reconciliation,shadow_safety,source_payload,imported_by
  ) values (scoring_run_id,'2026',2026,scope.google_workbook_id,source_fingerprint_value,
    payload_fingerprint_value,payload_body#>>'{pairing_contract,state}',payload_body->'tournament',
    payload_body->'rules',payload_body->'identity_reconciliation',payload_body->'shadow_safety',
    input->'source_payload',claim.actor);

  update production_control.current_shadow_import_claims
  set status='CONSUMED',consumed_at=now(),import_run_id=scoring_run_id
  where claim_id=claim.claim_id;
  insert into production_control.operation_audit_events (
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values ('CURRENT_SHADOW_IMPORTED','CURRENT_TOURNAMENT','2026',claim.actor,
    claim.request_fingerprint,'SUCCEEDED',jsonb_build_object(
      'currentTournamentImportRunId',tournament_run_id,'currentScoringImportRunId',scoring_run_id,
      'claimId',claim.claim_id,'pairingState',payload_body#>>'{pairing_contract,state}',
      'counts',counts_value,'authority','GOOGLE','ingress','PAUSED','googleWrite',false,
      'outbox',false,'archive',false,'mirror',false,'singleUseBootstrap',true));

  return jsonb_build_object('ok',true,'changed',true,'duplicate',false,
    'current_tournament_import_run_id',tournament_run_id,
    'current_scoring_import_run_id',scoring_run_id,'source_fingerprint',source_fingerprint_value,
    'payload_fingerprint',payload_fingerprint_value,'database_fingerprint',database_fingerprint_value,
    'counts',counts_value,'pairing_state',payload_body#>>'{pairing_contract,state}',
    'authority','GOOGLE','scoring_ingress','DISABLED','google_write',false,
    'outbox_events',0,'archive_jobs',0,'mirror_jobs',0);
end;
$$;
revoke all on function public.import_production_current_tournament_shadow(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.bootstrap_import_production_current_tournament_shadow(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  claim_result jsonb;
  claim_id_value text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_SERVICE_ROLE_REQUIRED';
  end if;
  -- Claim and import share one database transaction. A failed import rolls
  -- back the claim, so the approved bootstrap cannot expire between calls or
  -- be stranded by a transport interruption. A successful claim is consumed
  -- once; exact repeats return the existing certified import.
  claim_result := public.claim_production_current_tournament_shadow_import(input);
  claim_id_value := btrim(coalesce(claim_result->>'claim_id',''));
  if claim_id_value = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_CLAIM_REQUIRED';
  end if;
  return public.import_production_current_tournament_shadow(
    input || jsonb_build_object('claim_id', claim_id_value)
  );
end;
$$;
revoke all on function public.bootstrap_import_production_current_tournament_shadow(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_import_production_current_tournament_shadow(jsonb)
  to service_role;

create or replace function public.read_production_current_shadow_v2_revision(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  revision production_control.current_shadow_revisions%rowtype;
begin
  scope := production_control.assert_current_shadow_v2_dormant();
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_SERVICE_ROLE_REQUIRED';
  end if;
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref','')) <> scope.project_ref
     or btrim(coalesce(input->>'project_url','')) <> scope.project_url
     or btrim(coalesce(input->>'source_workbook_id','')) <> scope.google_workbook_id
     or btrim(coalesce(input->>'tournament_id','')) <> '2026' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CURRENT_SHADOW_V2_SCOPE_REQUIRED';
  end if;
  select value.* into revision
  from production_control.current_shadow_revisions value
  where value.tournament_id='2026'
  order by value.imported_at desc limit 1;
  if revision.import_run_id is null then
    return jsonb_build_object('ok',false,'code','PRODUCTION_CURRENT_SHADOW_NOT_IMPORTED');
  end if;
  return jsonb_build_object('ok',true,'revision',to_jsonb(revision)-'source_payload',
    'source_sheet_count',jsonb_array_length(revision.source_payload->'sheets'),
    'authority','GOOGLE','scoring_ingress','DISABLED','google_write',false);
end;
$$;
revoke all on function public.read_production_current_shadow_v2_revision(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_current_shadow_v2_revision(jsonb)
  to service_role;

notify pgrst,'reload schema';
commit;
