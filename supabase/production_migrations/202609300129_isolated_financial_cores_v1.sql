-- Reduced, owner-approved isolated financial context; no data changes at install.
-- Canonical entry/auction ledgers, rules, CAS and replay order are preserved.
-- No configuration core, historical update or general delivery trigger replacement.
begin;

do $extract$
declare installed text;
begin
 -- Reject owner/ACL/attribute drift before extracting authority, including
 -- unexpected default grants. Installation never broadens an existing owner.
 if not exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
   where p.oid='public.save_production_net_skins_entries_v1(jsonb)'::regprocedure
     and p.proowner=(select oid from pg_roles where rolname=current_user)
     and p.prosecdef and p.provolatile='v' and not p.proisstrict and not p.proretset
     and p.proparallel='u' and not p.proleakproof and l.lanname='plpgsql'
     and p.proconfig=array['search_path=pg_catalog']
     and (select count(*) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))=2
     and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
         or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
   raise exception 'ISOLATED_FINANCIAL_PRIVILEGE_BASELINE_MISMATCH: save_production_net_skins_entries_v1';
 end if;
 select prosrc into strict installed from pg_proc where oid='public.save_production_net_skins_entries_v1(jsonb)'::regprocedure;
 if encode(extensions.digest(installed,'sha256'),'hex')<>'570a92f93d420227da384df0624c2e9f06ee60da32c125d9f9200b857455c9c3' then
   raise exception 'ISOLATED_FINANCIAL_BASELINE_MISMATCH: save_production_net_skins_entries_v1';
 end if;
 execute $core_sql$create function production_control.canonical_net_skins_entries_core_v1(input jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $core_body$
declare rn integer; expected bigint; request_id_value uuid; hash_value text; current_revision bigint;
  prior production_control.net_skins_entry_revisions_v1%rowtype;
  field jsonb; row_value jsonb; canonical jsonb:='[]'; item jsonb; configured_value boolean; response_value jsonb;
begin
  if coalesce(input->>'round_number','') !~ '^[1-9][0-9]?$' or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
    or jsonb_typeof(input->'configured') is distinct from 'boolean' or jsonb_typeof(input->'entries') is distinct from 'array'
    or input->>'actor_player_id' is distinct from input#>>'{authorization,player_id}'
    or input->>'actor_auth_user_id' is distinct from input#>>'{authorization,auth_user_id}' then
    raise exception 'TOURNAMENT_SETUP_SKINS_ENTRIES_INPUT_INVALID'; end if;
  rn:=(input->>'round_number')::integer; expected:=(input->>'expected_revision')::bigint;
  configured_value:=(input->>'configured')::boolean; request_id_value:=(input->>'operation_request_id')::uuid;
  if request_id_value is null then raise exception 'TOURNAMENT_SETUP_OPERATION_REQUEST_ID_REQUIRED'; end if;
  hash_value:=production_control.tournament_setup_hash_v1(input);
  -- Serialize with ordinary single/round pair saves, then with financial workers.
  perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
  select * into prior from production_control.net_skins_entry_revisions_v1 where tournament_id='2026' and request_id=request_id_value;
  if found then
    if prior.request_hash is distinct from hash_value then raise exception 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT'; end if;
    return prior.response||jsonb_build_object('idempotent',true);
  end if;
  lock table scoring_authority.matches,scoring_authority.match_participants,scoring_authority.tournament_players,
    scoring_authority.scoring_permissions,scoring_authority.scoring_ingress_leases,
    scoring_authority.net_skins_configuration_entries,scoring_authority.net_skins_v1_recalculation_jobs,
    scoring_authority.net_skins_v1_result_revisions in share mode;
  select coalesce(max(revision),0) into current_revision from production_control.net_skins_entry_revisions_v1
    where tournament_id='2026' and round_number=rn;
  if expected<>current_revision then raise exception 'TOURNAMENT_SETUP_SKINS_ENTRIES_REVISION_STALE'; end if;
  if not exists(select 1 from scoring_authority.rounds where tournament_id='2026' and round_number=rn and format in('BB','SC','SI'))
    then raise exception 'TOURNAMENT_SETUP_SKINS_ROUND_INVALID'; end if;
  if exists(select 1 from scoring_authority.matches m where m.tournament_id='2026' and m.round_number=rn
      and not production_control.handicap_v1_match_is_unstarted(m.match_id))
    or exists(select 1 from scoring_authority.scoring_permissions p join scoring_authority.matches m using(match_id)
      where m.tournament_id='2026' and m.round_number=rn and p.can_score and p.revoked_at is null)
    or exists(select 1 from scoring_authority.scoring_ingress_leases l join scoring_authority.matches m using(match_id)
      where m.tournament_id='2026' and m.round_number=rn and l.expires_at>clock_timestamp())
    or exists(select 1 from scoring_authority.net_skins_configuration_entries where tournament_id='2026' and round_number=rn)
    or exists(select 1 from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026' and round_number=rn)
    or exists(select 1 from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026' and round_number=rn and status in('PENDING','RUNNING'))
    then raise exception 'TOURNAMENT_SETUP_SKINS_ENTRIES_DEPENDENCY_BLOCKED'; end if;
  field:=production_control.net_skins_entry_field_v1('2026',rn);
  if exists(select 1 from jsonb_array_elements(field) f cross join lateral jsonb_array_elements_text(f->'playerIds') p
    group by p having count(*)>1) then raise exception 'TOURNAMENT_SETUP_SKINS_DUPLICATE_PLAYER'; end if;
  if input->>'field_fingerprint' is distinct from production_control.tournament_setup_hash_v1(field)
    then raise exception 'TOURNAMENT_SETUP_SKINS_PAIRING_STALE'; end if;
  if jsonb_array_length(input->'entries')<>jsonb_array_length(field)
    or (select count(distinct value->>'key') from jsonb_array_elements(input->'entries'))<>jsonb_array_length(field)
    then raise exception 'TOURNAMENT_SETUP_SKINS_ENTRY_SET_INVALID'; end if;
  for item in select value from jsonb_array_elements(field) loop
    select value into row_value from jsonb_array_elements(input->'entries') where value->>'key'=item->>'key';
    if row_value is null or jsonb_typeof(row_value->'entered') is distinct from 'boolean'
      or row_value->>'bindingFingerprint' is distinct from item->>'bindingFingerprint'
      or (not configured_value and row_value->>'entered'='true') then
      raise exception 'TOURNAMENT_SETUP_SKINS_ENTRY_BINDING_INVALID'; end if;
    canonical:=canonical||jsonb_build_array(item||jsonb_build_object('entered',(row_value->>'entered')::boolean));
  end loop;
  if configured_value and jsonb_array_length(field)=0 then raise exception 'TOURNAMENT_SETUP_SKINS_PAIRINGS_REQUIRED'; end if;
  response_value:=jsonb_build_object('ok',true,'revision',current_revision+1,'roundNumber',rn,'idempotent',false,
    'scoringMutationCreated',false,'financialMutationCreated',false,'publicationCreated',false);
  insert into production_control.net_skins_entry_revisions_v1(tournament_id,round_number,revision,request_id,request_hash,
    field_fingerprint,configured,entries,actor_player_id,actor_auth_user_id,response)
    values('2026',rn,current_revision+1,request_id_value,hash_value,input->>'field_fingerprint',configured_value,canonical,
      input->>'actor_player_id',(input->>'actor_auth_user_id')::uuid,response_value);
  return response_value;
end;
$core_body$;$core_sql$;
 execute $wrapper_sql$create or replace function public.save_production_net_skins_entries_v1(input jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $wrapper_body$begin
  perform production_control.assert_tournament_setup_runtime_v1(input);
  return production_control.canonical_net_skins_entries_core_v1(input);
end;$wrapper_body$;$wrapper_sql$;
end;
$extract$;
revoke all on function production_control.canonical_net_skins_entries_core_v1(jsonb) from public,anon,authenticated,service_role;

do $extract$
declare installed text;
begin
 -- Reject owner/ACL/attribute drift before extracting authority, including
 -- unexpected default grants. Installation never broadens an existing owner.
 if not exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
   where p.oid='public.replace_production_calcutta_v1_auction_facts(jsonb)'::regprocedure
     and p.proowner=(select oid from pg_roles where rolname=current_user)
     and p.prosecdef and p.provolatile='v' and not p.proisstrict and not p.proretset
     and p.proparallel='u' and not p.proleakproof and l.lanname='plpgsql'
     and p.proconfig=array['search_path=pg_catalog, production_control, scoring_authority']
     and (select count(*) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))=2
     and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
         or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
   raise exception 'ISOLATED_FINANCIAL_PRIVILEGE_BASELINE_MISMATCH: replace_production_calcutta_v1_auction_facts';
 end if;
 select prosrc into strict installed from pg_proc where oid='public.replace_production_calcutta_v1_auction_facts(jsonb)'::regprocedure;
 if encode(extensions.digest(installed,'sha256'),'hex')<>'02cb4d732c0ef2ad8ccb94f0f95d79b3b613e2636897fb42b909d2a0c2daac54' then
   raise exception 'ISOLATED_FINANCIAL_BASELINE_MISMATCH: replace_production_calcutta_v1_auction_facts';
 end if;
 execute $core_sql$create function production_control.canonical_calcutta_auction_core_v1(input jsonb, context jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $core_body$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  manifest_value jsonb;
  auction_fingerprint_value text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  payload_hash_value text := production_control.calcutta_v1_hash(input);
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_REPLACE_AUCTION', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
  end if;

  if context is null then
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  end if;
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;

  if current_value.state = 'NOT_CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;

  manifest_value :=
    production_control.build_production_calcutta_v1_auction(input);
  auction_fingerprint_value := production_control.calcutta_v1_hash(
    manifest_value
  );
  if context is null then
  resource_fingerprint_value := production_control.calcutta_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'vercel_project_id', input->>'vercel_project_id',
      'vercel_team_id', input->>'vercel_team_id',
      'vercel_environment', 'production',
      'deployment_commit', activation.expected_deployment_commit,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision
    )
  );
  else
    resource_fingerprint_value := context->>'resource_fingerprint';
  end if;

  insert into scoring_authority.calcutta_v1_auction_fact_revisions (
    tournament_id, auction_revision, state, auction_manifest,
    auction_fingerprint, resource_fingerprint, activation_revision,
    authority_epoch_id, recorded_by_player_id, recorded_by_auth_user_id,
    request_fingerprint, request_payload_hash, recorded_at
  ) values (
    '2026', current_value.auction_revision + 1, 'AUCTION_COMPLETE',
    manifest_value, auction_fingerprint_value, resource_fingerprint_value,
    case when context is null then activation.activation_revision else (context->>'activation_revision')::bigint end, case when context is null then activation.authority_generation_id else (context->>'authority_epoch_id')::uuid end,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.now()
  ) returning * into auction_value;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    current_value.configuration_revision, auction_value.auction_revision,
    current_value.configuration_fingerprint, auction_fingerprint_value,
    'UNPUBLISHED', 'AUCTION_REPLACED', actor_player, actor_auth_user,
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'operation', 'AUCTION_REPLACED',
      'request_fingerprint', request_fingerprint_value
    )), payload_hash_value, null
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'SUPERSEDED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' and status in ('PENDING', 'RUNNING');
  update scoring_authority.calcutta_v1_result_revisions
  set is_current = false, superseded_at = pg_catalog.now()
  where tournament_id = '2026' and is_current;

  update scoring_authority.calcutta_v1_current
  set auction_revision_id = auction_value.auction_revision_id,
      auction_revision = auction_value.auction_revision,
      auction_fingerprint = auction_fingerprint_value,
      publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'UNPUBLISHED', state = 'AUCTION_COMPLETE',
      result_revision = 0, updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED',
      'purchase_count', pg_catalog.jsonb_array_length(
        manifest_value->'purchases'
      ),
      'ownership_count', pg_catalog.jsonb_array_length(
        manifest_value->'ownership'
      ),
      'pot', manifest_value->>'pot',
      'currency_code', 'USD',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED',
    'state', 'AUCTION_COMPLETE',
    'publication_state', 'UNPUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', auction_value.auction_revision,
    'auction_fingerprint', auction_fingerprint_value,
    'publication_revision', publication_value.publication_revision,
    'currency_code', 'USD',
    'pot', manifest_value->>'pot',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_REPLACE_AUCTION', input, response_value
  );
  return response_value;
end;
$core_body$;$core_sql$;
 execute $wrapper_sql$create or replace function public.replace_production_calcutta_v1_auction_facts(input jsonb) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $wrapper_body$begin
  perform production_control.assert_production_calcutta_v1_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  return production_control.canonical_calcutta_auction_core_v1(input,null);
end;$wrapper_body$;$wrapper_sql$;
end;
$extract$;
revoke all on function production_control.canonical_calcutta_auction_core_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

do $extract$
declare installed text;
begin
 -- Reject owner/ACL/attribute drift before extracting authority, including
 -- unexpected default grants. Installation never broadens an existing owner.
 if not exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
   where p.oid='public.clear_production_calcutta_v1_auction_entry(jsonb)'::regprocedure
     and p.proowner=(select oid from pg_roles where rolname=current_user)
     and p.prosecdef and p.provolatile='v' and not p.proisstrict and not p.proretset
     and p.proparallel='u' and not p.proleakproof and l.lanname='plpgsql'
     and p.proconfig=array['search_path=pg_catalog, production_control, scoring_authority']
     and (select count(*) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))=2
     and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
         or a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
   raise exception 'ISOLATED_FINANCIAL_PRIVILEGE_BASELINE_MISMATCH: clear_production_calcutta_v1_auction_entry';
 end if;
 select prosrc into strict installed from pg_proc where oid='public.clear_production_calcutta_v1_auction_entry(jsonb)'::regprocedure;
 if encode(extensions.digest(installed,'sha256'),'hex')<>'60a31e54426b2ca65d027923eb69a2eb8f2458df3b6e1e6768882e59e18ef0fa' then
   raise exception 'ISOLATED_FINANCIAL_BASELINE_MISMATCH: clear_production_calcutta_v1_auction_entry';
 end if;
 execute $core_sql$create function production_control.canonical_calcutta_clear_core_v1(input jsonb, context jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $core_body$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  manifest_value jsonb;
  predecessor_manifest jsonb;
  target_player text := pg_catalog.btrim(coalesce(input->>'player_id', ''));
  remaining_purchases jsonb;
  remaining_ownership jsonb;
  pot_value numeric;
  auction_fingerprint_value text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  payload_hash_value text := production_control.calcutta_v1_hash(input);
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_CLEAR_ENTRY', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
  end if;

  if context is null then
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  end if;
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;

  -- Recheck after acquiring the same canonical locks used by Save/Publish.
  -- Concurrent retries must return the original receipt, not create revisions.
  existing_response := production_control.lookup_cutover_receipt('CALCUTTA_V1_CLEAR_ENTRY', input);
  if existing_response is not null then return existing_response; end if;
  if current_value.publication_state <> 'UNPUBLISHED' then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_CLEAR_PUBLISHED_DENIED';
  end if;
  if current_value.result_revision <> 0
     or exists(select 1 from scoring_authority.calcutta_v1_result_revisions
       where tournament_id='2026' and (is_current or auction_revision_id=current_value.auction_revision_id))
     or exists(select 1 from scoring_authority.calcutta_v1_recalculation_jobs
       where tournament_id='2026' and status in ('PENDING','RUNNING')) then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_CLEAR_RESULT_DEPENDENCY';
  end if;
  if not exists(select 1 from scoring_authority.tournament_players
      where tournament_id='2026' and player_id=target_player and participation_status='ACTIVE') then
    raise exception using errcode='22023', message='PRODUCTION_CALCUTTA_CLEAR_PLAYER_DENIED';
  end if;
  if current_value.state = 'NOT_CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;

  select auction_manifest into strict predecessor_manifest
  from scoring_authority.calcutta_v1_auction_fact_revisions
  where auction_revision_id=current_value.auction_revision_id and tournament_id='2026';
  if not exists(select 1 from jsonb_array_elements(predecessor_manifest->'purchases') p
      where p->>'player_id'=target_player) then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_ENTRY_NOT_ENTERED';
  end if;
  select coalesce(jsonb_agg(p order by p->>'player_id'),'[]'::jsonb),
         coalesce(sum((p->>'purchase_price')::numeric),0)
    into remaining_purchases,pot_value
    from jsonb_array_elements(predecessor_manifest->'purchases') p where p->>'player_id'<>target_player;
  select coalesce(jsonb_agg(o order by o->>'player_id',o->>'owner_player_id'),'[]'::jsonb)
    into remaining_ownership
    from jsonb_array_elements(predecessor_manifest->'ownership') o where o->>'player_id'<>target_player;
  -- Derive exclusively from locked canonical facts; the client cannot replace another entry.
  manifest_value := predecessor_manifest || jsonb_build_object(
    'purchases',remaining_purchases,'ownership',remaining_ownership,'pot',pot_value);
  if jsonb_array_length(remaining_purchases)>0 then
    manifest_value := production_control.build_production_calcutta_v1_auction(manifest_value);
  elsif remaining_ownership <> '[]'::jsonb then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_CLEAR_ORPHAN_OWNERSHIP';
  end if;
  auction_fingerprint_value := production_control.calcutta_v1_hash(
    manifest_value
  );
  if context is null then
  resource_fingerprint_value := production_control.calcutta_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'vercel_project_id', input->>'vercel_project_id',
      'vercel_team_id', input->>'vercel_team_id',
      'vercel_environment', 'production',
      'deployment_commit', activation.expected_deployment_commit,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision
    )
  );
  else
    resource_fingerprint_value := context->>'resource_fingerprint';
  end if;

  insert into scoring_authority.calcutta_v1_auction_fact_revisions (
    tournament_id, auction_revision, state, auction_manifest,
    auction_fingerprint, resource_fingerprint, activation_revision,
    authority_epoch_id, recorded_by_player_id, recorded_by_auth_user_id,
    request_fingerprint, request_payload_hash, recorded_at
  ) values (
    '2026', current_value.auction_revision + 1, 'AUCTION_COMPLETE',
    manifest_value, auction_fingerprint_value, resource_fingerprint_value,
    case when context is null then activation.activation_revision else (context->>'activation_revision')::bigint end, case when context is null then activation.authority_generation_id else (context->>'authority_epoch_id')::uuid end,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.now()
  ) returning * into auction_value;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    current_value.configuration_revision, auction_value.auction_revision,
    current_value.configuration_fingerprint, auction_fingerprint_value,
    'UNPUBLISHED', 'AUCTION_REPLACED', actor_player, actor_auth_user,
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'operation', 'AUCTION_REPLACED',
      'request_fingerprint', request_fingerprint_value
    )), payload_hash_value, null
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_current
  set auction_revision_id = auction_value.auction_revision_id,
      auction_revision = auction_value.auction_revision,
      auction_fingerprint = auction_fingerprint_value,
      publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'UNPUBLISHED', state = 'AUCTION_COMPLETE',
      result_revision = 0, updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_ENTRY_CLEARED', actor_player,
    pg_catalog.jsonb_build_object(
      'cleared_player_id', target_player,
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED',
      'prior_auction_revision', current_value.auction_revision,
      'purchase_count', pg_catalog.jsonb_array_length(
        manifest_value->'purchases'
      ),
      'ownership_count', pg_catalog.jsonb_array_length(
        manifest_value->'ownership'
      ),
      'pot', manifest_value->>'pot',
      'currency_code', 'USD',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_ENTRY_CLEARED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'cleared_player_id', target_player,
      'prior_auction_revision', current_value.auction_revision,
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_ENTRY_CLEARED',
    'state', 'AUCTION_COMPLETE',
    'cleared_player_id', target_player,
    'publication_state', 'UNPUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', auction_value.auction_revision,
    'auction_fingerprint', auction_fingerprint_value,
    'publication_revision', publication_value.publication_revision,
    'currency_code', 'USD',
    'pot', manifest_value->>'pot',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_CLEAR_ENTRY', input, response_value
  );
  return response_value;
end;
$core_body$;$core_sql$;
 execute $wrapper_sql$create or replace function public.clear_production_calcutta_v1_auction_entry(input jsonb) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $wrapper_body$begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_calcutta_v1_runtime(input);
  if input->>'contract_version' is distinct from 'production-calcutta-v1'
     or input->>'expected_tournament_id' is distinct from '2026'
     or (select tournament_id from production_control.current_tournament_pointer_v1
         where scope_key='BAGGER_INV_PRODUCTION') is distinct from '2026' then
    raise exception using errcode='42501', message='PRODUCTION_CALCUTTA_CLEAR_SCOPE_DENIED';
  end if;
  perform production_control.assert_production_scoring_actor(input, true);
  return production_control.canonical_calcutta_clear_core_v1(input,null);
end;$wrapper_body$;$wrapper_sql$;
end;
$extract$;
revoke all on function production_control.canonical_calcutta_clear_core_v1(jsonb,jsonb) from public,anon,authenticated,service_role;


-- Only the two admitted isolated auction commands can create this marker.
-- It is not an authorization primitive, cannot be forged by a runtime role,
-- and is never consumed by score submission or ordinary worker admission.
create table production_control.isolated_financial_audit_context_v1 (
 backend_pid integer not null,
 transaction_id xid8 not null,
 tournament_id text not null check(tournament_id='2026'),
 action text not null check(action in('replace-auction','clear-entry')),
 operation_request_id uuid not null,
 request_fingerprint text not null,
 context jsonb not null check(jsonb_typeof(context)='object'),
 primary key(backend_pid,transaction_id)
);
alter table production_control.isolated_financial_audit_context_v1 enable row level security;
revoke all on production_control.isolated_financial_audit_context_v1 from public,anon,authenticated,service_role;

create function production_control.capture_isolated_auction_supersession_provenance_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare marker production_control.isolated_financial_audit_context_v1%rowtype;
begin
 select * into marker from production_control.isolated_financial_audit_context_v1
 where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id()
   and tournament_id=new.tournament_id and action in('replace-auction','clear-entry');
 if not found then return new; end if;
 new.handling_activation_revision:=(marker.context->>'activation_revision')::bigint;
 new.handling_release_commit:=marker.context->>'release_commit';
 new.safe_code:='ISOLATED_DIRECTOR_AUCTION_SUPERSEDED';
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('ISOLATED_DIRECTOR_DERIVED_SUPERSEDED','CALCUTTA',new.tournament_id,
   marker.context->>'actor_player_id',marker.request_fingerprint,'SUCCEEDED',jsonb_build_object(
     'runtime','ISOLATED','context_binding_id',marker.context->>'binding_id',
     'context_token',marker.context->>'context_token','operation_request_id',marker.operation_request_id,
     'action',marker.action,'actor_auth_user_id',marker.context->>'actor_auth_user_id',
     'delivery_event_id',new.event_id,'work_identity',new.work_identity,
     'originating_activation_revision',new.originating_activation_revision,
     'handling_activation_revision',new.handling_activation_revision,'handling_release_commit',new.handling_release_commit));
 return new;
end;
$fn$;
revoke all on function production_control.capture_isolated_auction_supersession_provenance_v1() from public,anon,authenticated,service_role;
-- PostgreSQL orders equal-kind triggers by name: this runs after the unchanged
-- capture_derived_delivery_provenance default, only for these new event rows.
create trigger zz_isolated_auction_supersession_provenance before insert on production_control.score_derived_delivery_attempts_v1
 for each row when(new.family='CALCUTTA' and new.transition='SUPERSEDED' and new.tournament_id='2026')
 execute function production_control.capture_isolated_auction_supersession_provenance_v1();

create function production_control.isolated_director_financial_operation_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare payload jsonb:=coalesce(input->'payload','{}'); domain_input jsonb; fingerprint text; result jsonb;
 status_read boolean:=not mutation and input->>'mode'='status'; original_token text;
 entry_receipt production_control.net_skins_entry_revisions_v1%rowtype; operation_name text;
begin
 if context->>'tournament_id' is distinct from '2026' or jsonb_typeof(payload) is distinct from 'object' then
   raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
 end if;
 original_token:=case when status_read then input->>'expected_context_token' else context->>'context_token' end;
 if input->>'family'='NET_SKINS_ENTRIES' then
   if not mutation and not coalesce(status_read,false) then return production_control.net_skins_entries_projection_v1('2026'); end if;
   if input->>'action' is distinct from 'save' then raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID'; end if;
   domain_input:=payload||jsonb_build_object('contract_version','production-tournament-setup-v1',
     'environment','ISOLATED','tournament_id','2026','context_binding_id',context->>'binding_id',
     'context_token',original_token,'actor_auth_user_id',context->>'actor_auth_user_id',
     'actor_player_id',context->>'actor_player_id','authorization',context->'authorization',
     'operation_request_id',context->>'operation_request_id');
   if status_read then
     select * into entry_receipt from production_control.net_skins_entry_revisions_v1
       where tournament_id='2026' and request_id=(context->>'operation_request_id')::uuid;
     if found then
       if entry_receipt.request_hash is distinct from production_control.tournament_setup_hash_v1(domain_input) then
         raise exception 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT'; end if;
       return jsonb_build_object('ok',true,'outcome','COMMITTED','receipt',entry_receipt.response);
     end if;
     return jsonb_build_object('ok',true,'outcome','UNKNOWN','receipt',null,'code','ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND');
   end if;
   result:=production_control.canonical_net_skins_entries_core_v1(domain_input);
 elsif input->>'family'='CALCUTTA_MANAGEMENT' then
   if not mutation and not coalesce(status_read,false) then
     return production_control.director_calcutta_management_projection_v1('2026',(payload->>'predecessor_auction_revision')::bigint);
   end if;
   operation_name:=case input->>'action' when 'replace-auction' then 'CALCUTTA_V1_REPLACE_AUCTION' when 'clear-entry' then 'CALCUTTA_V1_CLEAR_ENTRY' else null end;
   if operation_name is null then raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID'; end if;
   fingerprint:=production_control.calcutta_v1_hash(jsonb_build_object('binding_id',context->>'binding_id',
     'family',input->>'family','action',input->>'action','operation_request_id',context->>'operation_request_id'));
   domain_input:=payload||jsonb_build_object('contract_version','production-calcutta-v1',
     'environment','ISOLATED','tournament_id','2026','expected_tournament_id','2026',
     'context_binding_id',context->>'binding_id','context_token',original_token,
     'actor_id',context->>'actor_player_id','operation_request_id',context->>'operation_request_id',
     'authorization',context->'authorization','request_fingerprint',fingerprint);
   if status_read then
     result:=production_control.lookup_cutover_receipt(operation_name,domain_input);
     if result is not null then return jsonb_build_object('ok',true,'outcome','COMMITTED','receipt',result); end if;
     return jsonb_build_object('ok',true,'outcome','UNKNOWN','receipt',null,'code','ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND');
   end if;
   insert into production_control.isolated_financial_audit_context_v1(backend_pid,transaction_id,tournament_id,action,operation_request_id,request_fingerprint,context)
   values(pg_backend_pid(),pg_current_xact_id(),'2026',input->>'action',(context->>'operation_request_id')::uuid,fingerprint,context);
   if input->>'action'='replace-auction' then result:=production_control.canonical_calcutta_auction_core_v1(domain_input,context);
   else result:=production_control.canonical_calcutta_clear_core_v1(domain_input,context); end if;
   delete from production_control.isolated_financial_audit_context_v1 where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id();
 else raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID';
 end if;
 if coalesce((result->>'ok')::boolean,false) and not coalesce((result->>'idempotent')::boolean,false) then
   insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
   values('ISOLATED_DIRECTOR_FINANCIAL_OPERATION',input->>'family','2026',context->>'actor_player_id',fingerprint,'SUCCEEDED',
     jsonb_build_object('runtime','ISOLATED','context_binding_id',context->>'binding_id','context_token',context->>'context_token',
       'actor_auth_user_id',context->>'actor_auth_user_id','operation_request_id',context->>'operation_request_id',
       'action',input->>'action','activation_revision',context->'activation_revision','release_commit',context->>'release_commit','receipt',result));
 end if;
 return result;
end;
$fn$;
revoke all on function production_control.isolated_director_financial_operation_v1(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
-- Do not silently accept default privileges granting a new core/context to an
-- unrelated role. Refuse the whole migration; do not rewrite that role's ACL.
do $private_acl$
declare name text; owner_value oid; object_value regprocedure;
begin
 select oid into strict owner_value from pg_roles where rolname=current_user;
 foreach name in array array[
  'production_control.canonical_net_skins_entries_core_v1(jsonb)',
  'production_control.canonical_calcutta_auction_core_v1(jsonb,jsonb)',
  'production_control.canonical_calcutta_clear_core_v1(jsonb,jsonb)',
  'production_control.capture_isolated_auction_supersession_provenance_v1()',
  'production_control.isolated_director_financial_operation_v1(jsonb,jsonb,boolean)'] loop
  object_value:=name::regprocedure;
  if not exists(select 1 from pg_proc p where p.oid=object_value and p.proowner=owner_value
     and p.prosecdef and p.proconfig=array['search_path=pg_catalog']
     and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where a.grantee<>owner_value or a.grantor<>owner_value)) then
   raise exception 'ISOLATED_FINANCIAL_PRIVATE_ACL_MISMATCH: %',name;
  end if;
 end loop;
 if not exists(select 1 from pg_class c where c.oid='production_control.isolated_financial_audit_context_v1'::regclass
    and c.relowner=owner_value and c.relrowsecurity
    and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a
      where a.grantee<>owner_value or a.grantor<>owner_value)) then
  raise exception 'ISOLATED_FINANCIAL_CONTEXT_ACL_MISMATCH';
 end if;
end;
$private_acl$;
commit;
