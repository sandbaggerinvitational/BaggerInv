\set ON_ERROR_STOP on
-- New, owner-only Model D profile and fixed FinalRecap scope; no domain calculation changes.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-model-d-execution-v1-install',0));
do $$begin
 if current_user<>'postgres' or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres') then raise exception 'MODEL_D_OWNER_REQUIRED';end if;
 if exists(select 1 from production_control.certification_admission_v1 where enabled)
 or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
 or exists(select 1 from production_control.worker_supervisor_v1 where state<>'OFF')
 or exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN'))
 or exists(select 1 from scoring_authority.competition_recalculation_jobs where status='RUNNING')then raise exception 'MODEL_D_SAFE_INSTALL_REQUIRED';end if;
end$$;
do $tables$declare name text;begin
 foreach name in array array['production_control.certification_model_d_profile_v1','production_control.certification_model_d_execution_installation_v1']loop
  if to_regclass(name)is not null and not exists(select 1 from pg_class where oid=to_regclass(name)and relowner='postgres'::regrole and relrowsecurity and not relforcerowsecurity and relacl=array['postgres=arwdDxtm/postgres']::aclitem[])then raise exception 'MODEL_D_TABLE_METADATA_MISMATCH:%',name;end if;
 end loop;
end;$tables$;
create table if not exists production_control.certification_model_d_profile_v1(
 singleton boolean primary key default true check(singleton),purpose text not null check(purpose='PART2C_DRESS_REHEARSAL'),
 resource_id text not null unique,project_ref text not null unique,manifest_digest text not null,
 installation_manifest_digest text not null,request_hash text not null,created_at timestamptz not null default clock_timestamp());
alter table production_control.certification_model_d_profile_v1 enable row level security;
revoke all on production_control.certification_model_d_profile_v1 from public,anon,authenticated,service_role;
do $helpers$begin if to_regprocedure('production_control.worker_supervisor_model_d_v1()')is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('production_control.worker_supervisor_model_d_v1()')and encode(extensions.digest(prosrc,'sha256'),'hex')='fbe02956fd69d1f21cc4609f733ec23fff47e3f63d698aceea3df94d50334ba4'and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and prolang=(select oid from pg_language where lanname='sql')and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'MODEL_D_HELPER_MISMATCH:production_control.worker_supervisor_model_d_v1()';end if;if to_regprocedure('production_control.worker_supervisor_engines_v1()')is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('production_control.worker_supervisor_engines_v1()')and encode(extensions.digest(prosrc,'sha256'),'hex')='7a6a0e624843a412af021096e2125d925bbe5ac717c1bbae4d8d166168c59097'and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and prolang=(select oid from pg_language where lanname='sql')and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'MODEL_D_HELPER_MISMATCH:production_control.worker_supervisor_engines_v1()';end if;if to_regprocedure('production_control.model_d_context_v1(jsonb)')is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('production_control.model_d_context_v1(jsonb)')and encode(extensions.digest(prosrc,'sha256'),'hex')='0d910504796ecfb3510066a2d217eab58944aa5ce1b7446591561ba522cca2e0'and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and prolang=(select oid from pg_language where lanname='sql')and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'MODEL_D_HELPER_MISMATCH:production_control.model_d_context_v1(jsonb)';end if;end;$helpers$;
create or replace function production_control.worker_supervisor_model_d_v1()returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from production_control.certification_model_d_profile_v1 d join production_control.canonical_resource_v1 r
 on r.resource_id=d.resource_id and r.project_ref=d.project_ref and r.manifest_digest=d.manifest_digest
 join production_control.canonical_bootstrap_installation_v1 i on i.manifest_sha256=d.installation_manifest_digest
 where r.singleton and r.resource_class='CERTIFICATION' and r.database_name=current_database() and r.registration_revision=1
 and d.purpose='PART2C_DRESS_REHEARSAL' and r.resource_id<>'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
 and r.project_ref not in('trmcwrljjxwhgtikfdgu','idgigvjjqkfbqjeredpb','ymqhhtxaywtqllynrmxe'));
$$;
create or replace function production_control.worker_supervisor_engines_v1()returns text[] language sql stable security definer set search_path=pg_catalog as $$
 select array['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','CALCUTTA']::text[]
 ||case when production_control.worker_supervisor_model_d_v1()then array['TOURNAMENT_FINAL_RECAP']::text[]else array[]::text[]end;
$$;
create or replace function production_control.model_d_context_v1(context jsonb)returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select production_control.worker_supervisor_model_d_v1() and exists(
 select 1 from production_control.certification_model_d_profile_v1 d where d.singleton
 and context->>'resource_id'=d.resource_id and context->>'project_ref'=d.project_ref and context->>'resource_class'='CERTIFICATION');
$$;
revoke all on function production_control.worker_supervisor_model_d_v1(),production_control.worker_supervisor_engines_v1(),production_control.model_d_context_v1(jsonb)from public,anon,authenticated,service_role;
create table if not exists production_control.certification_model_d_execution_installation_v1(
 singleton boolean primary key default true check(singleton),image jsonb not null,metadata jsonb not null,installed_at timestamptz not null default clock_timestamp());
alter table production_control.certification_model_d_execution_installation_v1 enable row level security;
revoke all on production_control.certification_model_d_execution_installation_v1 from public,anon,authenticated,service_role;
do $patch$
declare e jsonb;h text;before_meta jsonb;after_meta jsonb;all_meta jsonb:='{}';patch_image jsonb:='{}';
begin
 e:=jsonb_build_object('signature','production_control.canonical_configure_net_skins_v1(jsonb, jsonb)','old','1557276917ec4eae560a43d6f9c4063380359f6459580f188dee34a7d4d13207','new','4c7d63dc0790d7dc974086f92dd25f30ab770282a71493ce6130a7c6483b0486');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.canonical_configure_net_skins_v1(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  existing_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  selected_rounds integer[];
  manifest_value jsonb;
  round_value jsonb;
  entry_value jsonb;
  overall_fingerprint text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  payload_hash_value text := production_control.net_skins_v1_hash(input);
  expected_configuration bigint := coalesce(
    (input->>'expected_configuration_revision')::bigint, -1
  );
  actor_player text := pg_catalog.btrim(
    coalesce(input#>>'{authorization,player_id}', '')
  );
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
  response_value jsonb;
  round_count integer := 0;
  entry_count integer := 0;
  affected_rows bigint;
begin
  if canonical_context is null then
    perform production_control.assert_production_net_skins_v1_runtime(input);
  else
    perform production_control.assert_canonical_scoring_context_v1(input, canonical_context, 'RUNTIME');
    if canonical_context->>'tournament_id' is distinct from '2026'
      or canonical_context->>'resource_class' is distinct from 'CERTIFICATION'
      or (not production_control.model_d_context_v1(canonical_context) and (canonical_context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or canonical_context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu')) then
      raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_TARGET_DENIED';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:'||'2026',0));
  perform production_control.assert_production_scoring_actor(input, true);

  if input->>'contract_version'
       is distinct from 'production-net-skins-v1'
     or input->>'publication_policy' is distinct from 'OFFICIAL_ONLY'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'eligible_round_numbers', 'null'::jsonb
     )) <> 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_INPUT_INVALID';
  end if;

  select value.* into existing_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.request_fingerprint = request_fingerprint_value;
  if found then
    if existing_value.request_payload_hash <> payload_hash_value then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_NET_SKINS_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',
      'configuration_revision', existing_value.configuration_revision,
      'configuration_fingerprint',
        existing_value.configuration_fingerprint,
      'state', existing_value.state,
      'rounds', existing_value.configuration_manifest->'rounds',
      'idempotent', true
    );
  end if;

  begin
    select pg_catalog.array_agg(value::integer order by value::integer)
      into selected_rounds
    from pg_catalog.jsonb_array_elements_text(
      input->'eligible_round_numbers'
    ) value;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ELIGIBLE_ROUNDS_INVALID';
  end;

  if canonical_context is null then
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  else
    -- Same domain operation; identity is from the admitted private marker,
    -- never a caller-selected resource, financial fact or Production row.
    activation.activation_revision := (canonical_context->>'activation_revision')::bigint;
    activation.authority_generation_id := (canonical_context->>'authority_epoch_id')::uuid;
    activation.expected_deployment_commit := canonical_context->>'release_commit';
    resource.project_ref := canonical_context->>'project_ref';
    resource.project_url := canonical_context->>'project_url';
    resource.current_tournament_id := canonical_context->>'tournament_id';
    resource.google_workbook_id := 'urn:bagger:synthetic:'||(canonical_context->>'installation_id');
    -- Absence is a revision-zero CAS expectation, never a fabricated ledger row.
  end if;
  if canonical_context is null then
  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026'
  for update;
  else
    select value.* into current_value from scoring_authority.net_skins_v1_configuration_current value
      where value.tournament_id='2026' for update;
    current_value.configuration_revision:=coalesce(current_value.configuration_revision,0);
  end if;

  if activation.activation_revision < 0
     or activation.activation_revision <>
       (input->>'expected_activation_revision')::bigint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_ACTIVATION_REVISION_CONFLICT';
  end if;
  if current_value.configuration_revision <> expected_configuration then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;

  manifest_value :=
    production_control.full_net_skins_manifest_v2('2026',selected_rounds,input->'entry_revisions');
  overall_fingerprint := production_control.net_skins_v1_hash(manifest_value);
  resource_fingerprint_value := production_control.net_skins_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'environment', case when canonical_context is null then 'PRODUCTION' else 'CERTIFICATION' end,
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'vercel_project_id', input->>'vercel_project_id',
      'vercel_team_id', input->>'vercel_team_id',
      'vercel_environment', case when canonical_context is null then 'production' else 'preview' end,
      'deployment_commit', activation.expected_deployment_commit,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision
    )
  );

  insert into scoring_authority.net_skins_v1_configuration_revisions (
    tournament_id, configuration_revision, contract_version, state,
    publication_policy, configuration_manifest, configuration_fingerprint,
    resource_fingerprint, activation_revision, authority_epoch_id,
    configured_by_player_id, configured_by_auth_user_id,
    request_fingerprint, request_payload_hash, configured_at
  ) values (
    '2026', current_value.configuration_revision + 1,
    'production-net-skins-v1', 'CONFIGURED', 'OFFICIAL_ONLY',
    manifest_value, overall_fingerprint, resource_fingerprint_value,
    activation.activation_revision, activation.authority_generation_id,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.now()
  ) returning * into revision_value;

  -- Preserve revision history in the immutable V1 ledger while updating the
  -- installed canonical engine-input tables atomically.
  update scoring_authority.net_skins_configurations
  set enabled = false,
      configuration_revision = revision_value.configuration_revision,
      imported_by = actor_player,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  for round_value in
    select value
    from pg_catalog.jsonb_array_elements(manifest_value->'rounds') value
  loop
    round_count := round_count + 1;
    insert into scoring_authority.net_skins_configurations (
      tournament_id, round_number, format, enabled, entry_type,
      buy_in_per_entry, expected_pot, completion_rule, payout_rounding,
      tie_rule, configuration_revision, configuration_fingerprint,
      source_workbook_id, imported_by, imported_at, approved_at, updated_at
    ) values (
      '2026', (round_value->>'round_number')::integer,
      round_value->>'format', true, round_value->>'entry_type',
      (round_value->>'buy_in_per_entry')::numeric,
      (round_value->>'expected_pot')::numeric,
      round_value->>'completion_rule', round_value->>'payout_rounding',
      round_value->>'tie_rule', revision_value.configuration_revision,
      round_value->>'configuration_fingerprint',
      resource.google_workbook_id, actor_player, pg_catalog.now(),
      pg_catalog.now(), pg_catalog.now()
    ) on conflict (tournament_id, round_number) do update set
      format = excluded.format,
      enabled = true,
      entry_type = excluded.entry_type,
      buy_in_per_entry = excluded.buy_in_per_entry,
      expected_pot = excluded.expected_pot,
      completion_rule = excluded.completion_rule,
      payout_rounding = excluded.payout_rounding,
      tie_rule = excluded.tie_rule,
      configuration_revision = excluded.configuration_revision,
      configuration_fingerprint = excluded.configuration_fingerprint,
      source_workbook_id = excluded.source_workbook_id,
      imported_by = excluded.imported_by,
      imported_at = excluded.imported_at,
      approved_at = excluded.approved_at,
      updated_at = excluded.updated_at;

    delete from scoring_authority.net_skins_configuration_entries
    where tournament_id = '2026'
      and round_number = (round_value->>'round_number')::integer;

    for entry_value in
      select value
      from pg_catalog.jsonb_array_elements(round_value->'entries') value
    loop
      entry_count := entry_count + 1;
      insert into scoring_authority.net_skins_configuration_entries (
        tournament_id, round_number, entry_id, match_number, format,
        player_id_1, player_id_2, team_handicap, buy_in, eligible,
        source_payload, created_at, updated_at
      ) values (
        '2026', (round_value->>'round_number')::integer,
        entry_value->>'entry_id', entry_value->>'match_number',
        round_value->>'format', entry_value->>'player_id_1',
        nullif(entry_value->>'player_id_2', ''),
        nullif(entry_value->>'team_handicap', '')::numeric,
        (entry_value->>'buy_in')::numeric, true,
        pg_catalog.jsonb_build_object(
          'Contract Version', 'production-net-skins-v1',
          'Canonical Match ID', entry_value->>'match_id',
          'Stable Player IDs', entry_value->'player_ids',
          'Eligible Holes', round_value->'eligible_holes',
          'Net Handicap Basis', round_value->>'net_handicap_basis',
          'Entry Revision',entry_value->'entry_revision','Entry Key',entry_value->>'entry_key','Entry Binding Fingerprint',entry_value->>'binding_fingerprint','Individual Stroke Allocation',
            entry_value->'individual_stroke_allocation'
        ),
        pg_catalog.now(), pg_catalog.now()
      );
    end loop;
  end loop;

  if canonical_context is null then
  update scoring_authority.net_skins_v1_configuration_current
  set configuration_revision_id = revision_value.configuration_revision_id,
      configuration_revision = revision_value.configuration_revision,
      state = 'CONFIGURED',
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  else
    insert into scoring_authority.net_skins_v1_configuration_current(tournament_id,configuration_revision_id,configuration_revision,state)
    values('2026',revision_value.configuration_revision_id,revision_value.configuration_revision,'CONFIGURED')
    on conflict(tournament_id) do update set configuration_revision_id=excluded.configuration_revision_id,
      configuration_revision=excluded.configuration_revision,state=excluded.state,updated_at=pg_catalog.now();
  end if;
  get diagnostics affected_rows = row_count;
  if canonical_context is not null and affected_rows <> 1 then
    raise exception using errcode='PT409',message='CERTIFICATION_NET_SKINS_POINTER_DRIFT';
  end if;

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'SUPERSEDED',
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and status in ('PENDING', 'RUNNING');

  update scoring_authority.net_skins_v1_result_revisions
  set is_current = false,
      superseded_at = pg_catalog.now()
  where tournament_id = '2026' and is_current;

  insert into scoring_authority.net_skins_configuration_import_runs (
    tournament_id, source_workbook_id, configuration_fingerprint,
    status, round_count, entry_count, requested_by, imported_at
  ) values (
    '2026', resource.google_workbook_id, overall_fingerprint,
    'APPLIED', round_count, entry_count, actor_player, pg_catalog.now()
  );

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_NET_SKINS_V1_CONFIGURED', actor_player,
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'configuration_revision', revision_value.configuration_revision,
      'configuration_fingerprint', overall_fingerprint,
      'resource_fingerprint', resource_fingerprint_value,
      'round_count', round_count,
      'entry_count', entry_count,
      'publication_policy', 'OFFICIAL_ONLY',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_CONFIGURED', 'NET_SKINS', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', revision_value.configuration_revision,
      'configuration_fingerprint', overall_fingerprint,
      'resource_fingerprint', resource_fingerprint_value,
      'round_count', round_count,
      'entry_count', entry_count,
      'publication_policy', 'OFFICIAL_ONLY'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',
    'configuration_revision', revision_value.configuration_revision,
    'configuration_fingerprint', overall_fingerprint,
    'state', 'CONFIGURED',
    'rounds', manifest_value->'rounds',
    'idempotent', false
  );
  return response_value;
end;
$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.canonical_publish_calcutta_v1(jsonb, jsonb)','old','fdee477fae5e7f8bbb265a898796c075c5b9ac997b891ff0ea5e1257403bb447','new','03d50fb3ed1a88d84c0dc3a3a72a92aed6c7806ca215ff06070f2586fcdad3f3');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.canonical_publish_calcutta_v1(input jsonb, context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_value jsonb;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  source_fingerprint text;
  affected_rows bigint;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  if context is null then
    perform production_control.assert_production_calcutta_v1_runtime(input);
  else
    perform production_control.assert_canonical_scoring_context_v1(input,context,'RUNTIME');
    if context->>'phase' is distinct from 'DIRECTOR'
      or (not production_control.model_d_context_v1(context) and (context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu')) then
      raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PUBLICATION_TARGET_DENIED';
    end if;
    -- Match/source mutations lock access/setup before match rows. Use that
    -- same order so current-result validation and publication are atomic.
    perform pg_advisory_xact_lock(hashtextextended('production-access-governance-v1:2026',0));
    perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
    perform 1 from scoring_authority.matches m where m.tournament_id='2026' order by m.match_id for share;
  end if;
  perform production_control.assert_production_scoring_actor(input, true);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_PUBLISH', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;
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
  if current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0
     or current_value.auction_revision_id is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;

  if context is not null then
    source_fingerprint:=production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'));
    select r.* into result_value from scoring_authority.calcutta_v1_result_revisions r
      where r.tournament_id='2026' and r.is_current and r.result_revision=current_value.result_revision
        and r.configuration_revision=current_value.configuration_revision
        and r.configuration_fingerprint=current_value.configuration_fingerprint
        and r.auction_revision=current_value.auction_revision
        and r.auction_fingerprint=current_value.auction_fingerprint;
    if not found or result_value.source_fingerprint is distinct from source_fingerprint
      or result_value.result_revision is distinct from (input->>'expected_result_revision')::bigint
      or source_fingerprint is distinct from input->>'expected_source_fingerprint' then
      raise exception using errcode='PT409',message='PRODUCTION_CALCUTTA_RESULT_SOURCE_CONFLICT';
    end if;
  end if;

  if current_value.publication_state = 'PUBLISHED' then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED',
      'state', current_value.state,
      'publication_state', 'PUBLISHED',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'job', null,
      'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      'CALCUTTA_V1_PUBLISH', input, response_value
    );
    return response_value;
  end if;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    current_value.configuration_revision, current_value.auction_revision,
    current_value.configuration_fingerprint,
    current_value.auction_fingerprint, 'PUBLISHED',
    'DIRECTOR_PUBLISHED', actor_player, actor_auth_user,
    request_fingerprint_value,
    production_control.calcutta_v1_hash(input), pg_catalog.now()
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_current
  set publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'PUBLISHED', updated_at = pg_catalog.now()
  where tournament_id = '2026';

  get diagnostics affected_rows=row_count;
  if affected_rows<>1 then raise exception using errcode='PT409',message='PRODUCTION_CALCUTTA_PUBLICATION_POINTER_DRIFT';end if;

  job_value := production_control.enqueue_production_calcutta_v1(
    'DIRECTOR_PUBLISHED', actor_player, false, null, null
  );
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_PUBLISHED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_PUBLISHED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'job_id', job_value->>'job_id'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_PUBLISHED',
    'state', current_value.state,
    'publication_state', 'PUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', current_value.auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'publication_revision', current_value.publication_revision,
    'result_revision', nullif(current_value.result_revision, 0),
    'job', job_value,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_PUBLISH', input, response_value
  );
  return response_value;
end;
$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.canonical_read_net_skins_v1(jsonb, jsonb)','old','f6f08a7c15d76c3c76a7e7e8569780fd5c92705e23f0e3036a4727dadc355520','new','cccfba5a35c399403920287502c711a32152d1171a474e9c0c92efa31618ea93');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.canonical_read_net_skins_v1(input jsonb, context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  round_value jsonb;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  result_value scoring_authority.net_skins_v1_result_revisions%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  source_fingerprints_value jsonb := '{}'::jsonb;
  entries_value jsonb;
  eligible_players_value jsonb;
  rounds_value jsonb := '[]'::jsonb;
  round_state text;
  top_state text := 'CONFIGURED';
  round_stale boolean;
  any_unavailable boolean := false;
  any_in_progress boolean := false;
  all_official boolean := true;
  max_result_revision bigint := 0;
  max_calculated_at timestamptz;
  max_published_at timestamptz;
  top_source_fingerprint text;
  revision_token text;
begin
  perform production_control.assert_production_service_role();
  if context is null then
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_RESOURCE_ASSERTION_FAILED';
  end if;
  else
    perform production_control.assert_canonical_scoring_context_v1(input,context,'RUNTIME');
    if context->>'phase' is distinct from 'READS'
      or (not production_control.model_d_context_v1(context) and (context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'))
      or context is distinct from production_control.current_certification_context_v1()
      or input->>'tournament_id' is distinct from '2026'
      or exists(select 1 from jsonb_object_keys(input)k where k not in('player_id','tournament_id'))
      or not production_control.native_calcutta_reader_v1(input->>'player_id','2026',null::uuid) then
      raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_PARTICIPANT_READ_DENIED';end if;
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;

  if current_value.state = 'NOT_CONFIGURED' then
    revision_token := pg_catalog.format(
      'net-skins-v1:%s:0:NOT_CONFIGURED',
      current_value.configuration_revision
    );
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'contract_version', 'production-net-skins-v1',
        'tournament_id', '2026',
        'state', 'NOT_CONFIGURED',
        'publication_policy', 'OFFICIAL_ONLY',
        'configuration_revision', current_value.configuration_revision,
        'result_revision', null,
        'configuration_fingerprint', null,
        'revision', revision_token,
        'freshness', pg_catalog.jsonb_build_object(
          'stale', false,
          'configured_at', null,
          'calculated_at', null,
          'published_at', null,
          'source_fingerprint', null
        ),
        'rounds', '[]'::jsonb
      )
    );
  end if;

  for round_value in
    select value
    from pg_catalog.jsonb_array_elements(
      revision_value.configuration_manifest->'rounds'
    ) value
    order by (value->>'round_number')::integer
  loop
    source_revision_value :=
      production_control.net_skins_v1_round_source_revision(
        '2026', (round_value->>'round_number')::integer
      );
    source_fingerprint_value :=
      production_control.net_skins_v1_hash(source_revision_value);
    source_fingerprints_value := source_fingerprints_value ||
      pg_catalog.jsonb_build_object(
        round_value->>'round_number', source_fingerprint_value
      );

    job_value := null;
    select value.* into job_value
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.tournament_id = '2026'
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision =
        current_value.configuration_revision
    order by value.requested_at desc, value.job_id desc
    limit 1;

    result_value := null;
    select value.* into result_value
    from scoring_authority.net_skins_v1_result_revisions value
    where value.tournament_id = '2026'
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision =
        current_value.configuration_revision
      and value.is_current
    limit 1;

    if result_value.result_id is not null
       and result_value.result_state = 'OFFICIAL'
       and result_value.source_fingerprint = source_fingerprint_value then
      round_state := 'OFFICIAL';
      round_stale := false;
    elsif job_value.job_id is not null
       and job_value.source_fingerprint = source_fingerprint_value
       and job_value.status = 'FAILED' then
      round_state := 'UNAVAILABLE';
      round_stale := true;
    elsif job_value.job_id is not null
       and job_value.source_fingerprint = source_fingerprint_value
       and job_value.status in ('PENDING', 'RUNNING') then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    elsif result_value.result_id is not null
       and result_value.result_state = 'PROVISIONAL'
       and result_value.source_fingerprint = source_fingerprint_value then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    elsif exists (
      select 1
      from scoring_authority.matches match_value
      where match_value.tournament_id = '2026'
        and match_value.round_number =
          (round_value->>'round_number')::integer
        and (match_value.status <> 'UPCOMING'
          or match_value.scored_holes > 0)
    ) then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    else
      round_state := 'CONFIGURED';
      round_stale := false;
    end if;

    entries_value := coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'entry_id', entry->>'entry_id',
          'entry_type', entry->>'entry_type',
          'match_id', entry->>'match_id',
          'player_ids', entry->'player_ids'
        ) order by entry->>'entry_id'
      )
      from pg_catalog.jsonb_array_elements(round_value->'entries') entry
      where coalesce((entry->>'eligible')::boolean, false)
    ), '[]'::jsonb);
    eligible_players_value := coalesce((
      select pg_catalog.jsonb_agg(player_id order by player_id)
      from (
        select distinct pg_catalog.jsonb_array_elements_text(
          entry->'player_ids'
        ) as player_id
        from pg_catalog.jsonb_array_elements(round_value->'entries') entry
        where coalesce((entry->>'eligible')::boolean, false)
      ) player_values
    ), '[]'::jsonb);

    any_unavailable := any_unavailable or round_state = 'UNAVAILABLE';
    any_in_progress := any_in_progress or round_state = 'IN_PROGRESS';
    all_official := all_official and round_state = 'OFFICIAL';
    max_result_revision := greatest(
      max_result_revision, coalesce(result_value.result_revision, 0)
    );
    if result_value.calculated_at is not null
       and (max_calculated_at is null
         or result_value.calculated_at > max_calculated_at) then
      max_calculated_at := result_value.calculated_at;
    end if;
    if result_value.published_at is not null
       and (max_published_at is null
         or result_value.published_at > max_published_at) then
      max_published_at := result_value.published_at;
    end if;

    rounds_value := rounds_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'round_id', round_value->>'round_id',
        'round_number', (round_value->>'round_number')::integer,
        'format', round_value->>'format',
        'entry_type', round_value->>'entry_type',
        'buy_in_per_entry', (round_value->>'buy_in_per_entry')::numeric,
        'eligible_entry_count', pg_catalog.jsonb_array_length(entries_value),
        'eligible_player_ids', eligible_players_value,
        'match_ids', round_value->'match_ids',
        'entries', entries_value,
        'state', round_state,
        'configuration_revision', current_value.configuration_revision,
        'result_revision', case when result_value.result_id is null
          then null else result_value.result_revision end,
        'configuration_fingerprint',
          round_value->>'configuration_fingerprint',
        'freshness', pg_catalog.jsonb_build_object(
          'stale', round_stale,
          'calculated_at', result_value.calculated_at,
          'published_at', case when round_state = 'OFFICIAL'
            then result_value.published_at else null end,
          'source_fingerprint', source_fingerprint_value
        ),
        'result_payload', case when round_state = 'OFFICIAL'
          then result_value.engine_result_payload || jsonb_build_object('participantLabels', production_control.native_published_skins_labels_v1('2026',result_value.engine_result_payload)) else null end,
        'official_results', case when round_state = 'OFFICIAL'
          then result_value.public_result_payload else null end
      )
    );
  end loop;

  top_state := case
    when any_unavailable then 'UNAVAILABLE'
    when all_official and pg_catalog.jsonb_array_length(rounds_value) > 0
      then 'OFFICIAL'
    when any_in_progress
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(rounds_value) value
        where value->>'state' = 'OFFICIAL'
      ) then 'IN_PROGRESS'
    else 'CONFIGURED'
  end;
  top_source_fingerprint := production_control.net_skins_v1_hash(
    source_fingerprints_value
  );
  revision_token := pg_catalog.format(
    'net-skins-v1:%s:%s:%s',
    current_value.configuration_revision,
    max_result_revision,
    top_state
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'tournament_id', '2026',
      'state', top_state,
      'publication_policy', 'OFFICIAL_ONLY',
      'configuration_revision', current_value.configuration_revision,
      'result_revision', case when max_result_revision = 0
        then null else max_result_revision end,
      'configuration_fingerprint',
        revision_value.configuration_fingerprint,
      'revision', revision_token,
      'freshness', pg_catalog.jsonb_build_object(
        'stale', any_unavailable or any_in_progress,
        'configured_at', revision_value.configured_at,
        'calculated_at', max_calculated_at,
        'published_at', max_published_at,
        'source_fingerprint', top_source_fingerprint
      ),
      'rounds', rounds_value
    )
  );
end;
$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.canonical_read_published_calcutta_v1(jsonb, jsonb)','old','e37900e3ceb00b937540a29360bee7acb343efdb968931a00bea0fee2ea6041d','new','d914ae4194679321e013ad788935ae4c47db99516f7df8965f3e6d93b7cdbd3d');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.canonical_read_published_calcutta_v1(input jsonb, context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  started_at timestamptz := pg_catalog.clock_timestamp();
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  completed_rounds_value integer[] := '{}'::integer[];
  market_value jsonb;
  participant_result_value jsonb;
  state_value text;
  revision_value text;
  result_is_fresh boolean := false;
  result_is_stale boolean := false;
  updating_value boolean := false;
  expose_result boolean := false;
  participant_player text := pg_catalog.btrim(coalesce(
    input->>'player_id', ''
  ));
begin
  perform production_control.assert_production_service_role();
  if context is null then
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or not production_control.native_calcutta_reader_v1(participant_player,'2026',nullif(input->>'observer_auth_user_id','')::uuid) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESOURCE_REQUIRED';
  end if;
  else
    perform production_control.assert_canonical_scoring_context_v1(input,context,'RUNTIME');
    if context->>'phase' is distinct from 'READS'
      or (not production_control.model_d_context_v1(context) and (context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'))
      or input ? 'observer_auth_user_id'
      or not production_control.native_calcutta_reader_v1(participant_player,'2026',null::uuid) then
      raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PARTICIPANT_READ_DENIED';end if;
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  select value.* into strict configuration_value
  from scoring_authority.calcutta_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;

  if current_value.auction_revision > 0 then
    select value.* into strict auction_value
    from scoring_authority.calcutta_v1_auction_fact_revisions value
    where value.auction_revision_id = current_value.auction_revision_id;
    source_revision_value :=
      production_control.calcutta_v1_source_revision('2026');
    source_fingerprint_value := production_control.calcutta_v1_hash(
      source_revision_value
    );
    completed_rounds_value :=
      production_control.calcutta_v1_completed_rounds();

    select value.* into result_value
    from scoring_authority.calcutta_v1_result_revisions value
    where value.tournament_id = '2026'
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.is_current
    limit 1;
    result_is_fresh := result_value.result_id is not null
      and (result_value.source_fingerprint = source_fingerprint_value or production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value));
    result_is_stale := result_value.result_id is not null
      and result_value.source_fingerprint <> source_fingerprint_value and not production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value);

    select value.* into job_value
    from scoring_authority.calcutta_v1_recalculation_jobs value
    where value.tournament_id = '2026'
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.source_fingerprint = source_fingerprint_value
    order by value.requested_at desc, value.job_id desc
    limit 1;
    updating_value := (job_value.job_id is not null
      and job_value.status in ('PENDING', 'RUNNING'))
      or exists (select 1 from scoring_authority.score_derived_intents_v1 intent
        where intent.tournament_id = '2026' and intent.family = 'CALCUTTA'
          and intent.status in ('PENDING', 'RETRYABLE'));
  end if;

  if current_value.publication_revision > 0 then
    select value.* into strict publication_value
    from scoring_authority.calcutta_v1_publication_revisions value
    where value.publication_revision_id =
      current_value.publication_revision_id;
  end if;

  state_value := case
    when current_value.state = 'NOT_CONFIGURED' then 'NOT_CONFIGURED'
    when current_value.auction_revision = 0 then 'CONFIGURED'
    when result_is_fresh and result_value.result_state = 'OFFICIAL'
      then 'OFFICIAL'
    when result_is_fresh
      and pg_catalog.jsonb_array_length(
        result_value.engine_result_payload->'completedRounds'
      ) > 0 then 'IN_PROGRESS'
    when result_is_fresh then 'AUCTION_COMPLETE'
    -- A Reopen invalidates OFFICIAL semantics immediately. Withhold the old
    -- payload until the worker commits a new canonical revision.
    when result_is_stale and updating_value
      and result_value.result_state = 'OFFICIAL'
      and not (3 = any(completed_rounds_value)) then 'UNAVAILABLE'
    when result_is_stale and updating_value
      and result_value.result_state = 'OFFICIAL'
      then 'OFFICIAL'
    when result_is_stale and updating_value
      and pg_catalog.jsonb_array_length(
        result_value.engine_result_payload->'completedRounds'
      ) > 0 then 'IN_PROGRESS'
    when result_is_stale and updating_value then 'AUCTION_COMPLETE'
    when result_is_stale then 'UNAVAILABLE'
    when job_value.job_id is not null and job_value.status = 'FAILED'
      then 'UNAVAILABLE'
    else 'AUCTION_COMPLETE'
  end;

  expose_result := current_value.publication_state = 'PUBLISHED'
    and result_value.result_id is not null
    and state_value <> 'UNAVAILABLE';

  if current_value.publication_state = 'PUBLISHED' then
    market_value := pg_catalog.jsonb_build_object(
      'pot', (auction_value.auction_manifest->>'pot')::numeric::text,
      'purchases', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'player', pg_catalog.jsonb_build_object(
            'player_id', purchase->>'player_id',
            'display_name', entrant.display_name
          ),
          'purchase_price',
            (purchase->>'purchase_price')::numeric::text,
          'owners', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'player', pg_catalog.jsonb_build_object(
                'player_id', ownership->>'owner_player_id',
                'display_name', owner_player.display_name
              ),
              'ownership_fraction',
                (ownership->>'ownership_fraction')::numeric::text
            ) order by ownership->>'owner_player_id')
            from pg_catalog.jsonb_array_elements(
              auction_value.auction_manifest->'ownership'
            ) ownership
            join scoring_authority.players owner_player
              on owner_player.player_id = ownership->>'owner_player_id'
            where ownership->>'player_id' = purchase->>'player_id'
          ), '[]'::jsonb)
        ) order by purchase->>'player_id')
        from pg_catalog.jsonb_array_elements(
          auction_value.auction_manifest->'purchases'
        ) purchase
        join scoring_authority.players entrant
          on entrant.player_id = purchase->>'player_id'
      ), '[]'::jsonb)
    );
  else
    market_value := null;
  end if;
  participant_result_value := case when expose_result
    then production_control.project_production_calcutta_v1_result(
      result_value.engine_result_payload
    ) else null end;

  revision_value := pg_catalog.format(
    'calcutta-v1:%s:%s:%s:%s:%s:%s',
    current_value.configuration_revision,
    current_value.auction_revision,
    current_value.publication_revision,
    case when result_value.result_id is null
      then 0 else result_value.result_revision end,
    state_value, current_value.publication_state
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'tournament_id', '2026',
      'state', state_value,
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'publication_state', current_value.publication_state,
      'published', current_value.publication_state = 'PUBLISHED',
      'currency_code', 'USD',
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', current_value.publication_revision,
      'result_revision', case when result_value.result_id is null
        then null else result_value.result_revision end,
      'configuration_fingerprint', case
        when state_value = 'NOT_CONFIGURED' then null
        else current_value.configuration_fingerprint end,
      'auction_fingerprint', current_value.auction_fingerprint,
      'result_fingerprint', case when result_value.result_id is null
        then null else result_value.payload_hash end,
      'revision', revision_value,
      'freshness', pg_catalog.jsonb_build_object(
        'stale', result_is_stale, 'lifecycle_compatible', production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value), 'original_result_source_fingerprint', result_value.source_fingerprint,
        'updating', updating_value,
        'configured_at', configuration_value.configured_at,
        'auction_recorded_at', auction_value.recorded_at,
        'published_at', case
          when current_value.publication_state = 'PUBLISHED'
            then publication_value.published_at
          else null end,
        'calculated_at', result_value.calculated_at,
        'source_fingerprint', source_fingerprint_value
      ),
      'market', market_value,
      'result', participant_result_value,
      'query_ms', pg_catalog.round(extract(epoch from
        (pg_catalog.clock_timestamp() - started_at)) * 1000, 3)
    )
  );
end;
$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.dispatch_certification_calcutta_publication_v1(jsonb, jsonb, boolean)','old','dc2a2759e3f042e8154bc5643ae0c134b0c3ba91d3902d0c3ff2f7f3e4c06e46','new','b0676cae6c80b47782d37f6d432a44db8c65dac45a8cb82be93b04c9f50f3255');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.dispatch_certification_calcutta_publication_v1(input jsonb, context jsonb, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare payload jsonb:=input->'payload';command jsonb;
begin
 perform production_control.assert_canonical_scoring_context_v1('{}',context,'RUNTIME');
 if context->>'phase' is distinct from 'DIRECTOR' or context->>'tournament_id' is distinct from '2026'
   or context->>'resource_class' is distinct from 'CERTIFICATION'
   or (not production_control.model_d_context_v1(context) and (context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'))
   or input->>'phase' is distinct from 'DIRECTOR'
   or input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id' then
   raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PUBLICATION_TARGET_DENIED';end if;
 perform production_control.assert_production_scoring_actor(jsonb_build_object('authorization',input->'authorization'),true);
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'family' is distinct from 'CALCUTTA_PUBLICATION' then
   raise exception using errcode='22023',message='PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';end if;
 if not mutation then
   if input->>'operation_id' is distinct from 'DIRECTOR.READ_CALCUTTA_PUBLICATION' or payload->>'action' is distinct from 'read'
     or exists(select 1 from jsonb_object_keys(payload)k where k not in('family','action')) then
     raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PUBLICATION_INPUT_DENIED';end if;
   return production_control.certification_calcutta_publication_projection_v1('2026');
 end if;
 if input->>'operation_id' is distinct from 'DIRECTOR.PUBLISH_CALCUTTA' or payload->>'action' is distinct from 'publish'
   or exists(select 1 from jsonb_object_keys(payload)k where k not in('family','action','expected_configuration_revision',
     'expected_configuration_fingerprint','expected_auction_revision','expected_auction_fingerprint',
     'expected_publication_revision','expected_result_revision','expected_source_fingerprint'))
   or coalesce(payload->>'expected_configuration_revision','') !~ '^[1-9][0-9]*$'
   or coalesce(payload->>'expected_auction_revision','') !~ '^[1-9][0-9]*$'
   or coalesce(payload->>'expected_publication_revision','') !~ '^(0|[1-9][0-9]*)$'
   or coalesce(payload->>'expected_result_revision','') !~ '^[1-9][0-9]*$'
   or coalesce(payload->>'expected_configuration_fingerprint','') !~ '^[0-9a-f]{64}$'
   or coalesce(payload->>'expected_auction_fingerprint','') !~ '^[0-9a-f]{64}$'
   or coalesce(payload->>'expected_source_fingerprint','') !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';end if;
 command:=(payload-array['family','action'])||jsonb_build_object('contract_version','production-calcutta-v1',
   'tournament_id',context->>'tournament_id','authorization',input->'authorization','actor_id',input#>>'{authorization,player_id}',
   'request_fingerprint',production_control.calcutta_v1_hash(jsonb_build_object('contract','certification-calcutta-publication-v1',
     'resource_id',context->>'resource_id','operation_request_id',input->>'operation_request_id')));
 return production_control.canonical_publish_calcutta_v1(command,context);
end;$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.dispatch_certification_net_skins_calculation_v1(jsonb, jsonb, boolean)','old','388977ac0ac644cbc5193adf8b6946dc80744d0bab0c463dd174473f43f7fd6e','new','c3ce0a6cc51589afb98120cef1475909893f5cbb82e2b0e4162ab5644a34dcf8');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.dispatch_certification_net_skins_calculation_v1(input jsonb, context jsonb, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
 op text:=input->>'operation_id'; p jsonb:=input->'payload'; actor jsonb;
 cfg scoring_authority.net_skins_v1_configuration_current%rowtype;
 manifest jsonb; entries jsonb; r jsonb; rounds jsonb:='[]'; expected_entries jsonb:='{}'; sources jsonb:='{}';
 id text:=lower(input->>'operation_request_id'); base text; outer_fp text; phase_fp text;
 identity jsonb; prior jsonb; claimed jsonb; command jsonb; completed jsonb; failed jsonb;
 j scoring_authority.net_skins_v1_recalculation_jobs%rowtype; outcome text; state text; receipt jsonb; round_lock integer;
begin
 perform production_control.assert_canonical_scoring_context_v1('{}',context,'RUNTIME');
 if context is distinct from production_control.current_certification_context_v1()
  or context->>'phase' is distinct from 'DIRECTOR' or context->>'tournament_id' is distinct from '2026'
  or (not production_control.model_d_context_v1(context) and (context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'))
  or op not in('DIRECTOR.CALCULATE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CALCULATION','DIRECTOR.NET_SKINS_CALCULATION_STATUS')
  or mutation is distinct from (op='DIRECTOR.CALCULATE_NET_SKINS') then
  raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_CALCULATION_CONTEXT_DENIED';end if;
 actor:=jsonb_build_object('tournament_id','2026','authorization',input->'authorization');
 perform production_control.assert_production_scoring_actor(actor,true);
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p)k
  where k not in('expected_configuration_revision','entry_revisions','source_fingerprints')) then
  raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_CALCULATION_INPUT_INVALID';end if;
 select * into cfg from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026';
 if not found then
  -- Absence is a truthful configuration-zero read, not an invented ledger row.
  cfg.state:='NOT_CONFIGURED';cfg.configuration_revision:=0;manifest:='{"rounds":[]}';
 else
  select configuration_manifest into strict manifest from scoring_authority.net_skins_v1_configuration_revisions
   where configuration_revision_id=cfg.configuration_revision_id;
 end if;
 entries:=production_control.net_skins_entries_projection_v1('2026');
 for r in select value from jsonb_array_elements(manifest->'rounds') loop
  expected_entries:=expected_entries||jsonb_build_object(r->>'round_number',r->'entry_revision');
  sources:=sources||jsonb_build_object(r->>'round_number',production_control.net_skins_v1_hash(
    production_control.net_skins_v1_round_source_revision('2026',(r->>'round_number')::integer)));
  rounds:=rounds||jsonb_build_array(jsonb_build_object('round_number',(r->>'round_number')::integer,
   'entry_revision',r->'entry_revision','current_entry_revision',(select v->'revision' from jsonb_array_elements(entries->'rounds')v
    where v->>'roundNumber'=r->>'round_number'),'source_fingerprint',sources->(r->>'round_number'),
   'result_state',(select result_state from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026'
    and round_number=(r->>'round_number')::integer and is_current and configuration_revision=cfg.configuration_revision)));
 end loop;
 if op='DIRECTOR.READ_NET_SKINS_CALCULATION' then
  if p<>'{}'::jsonb then raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_CALCULATION_INPUT_INVALID';end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('tournament_id','2026','state',cfg.state,
   'configuration_revision',cfg.configuration_revision,'entry_revisions',expected_entries,'source_fingerprints',sources,'rounds',rounds,
   'processing',(select count(*) from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026' and status='RUNNING'),
   'pending',(select count(*) from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026' and status='PENDING')));
 end if;
 if coalesce(id,'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or jsonb_typeof(p->'expected_configuration_revision') is distinct from 'number'
  or jsonb_typeof(p->'entry_revisions') is distinct from 'object'
  or jsonb_typeof(p->'source_fingerprints') is distinct from 'object' then
  raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_CALCULATION_INPUT_INVALID';end if;
 -- Serialize only this review identity. Receipts remain the existing durable
 -- domain ledger; no new lease, attempt budget or recovery system is introduced.
 perform pg_advisory_xact_lock(hashtextextended('certification-net-skins-calculation-v1:'||id,0));
 base:=encode(extensions.digest('certification-net-skins-calculation-v1'||chr(10)||id,'sha256'),'hex');
 outer_fp:=encode(extensions.digest('ADMISSION'||chr(10)||base,'sha256'),'hex');
 identity:=p||jsonb_build_object('request_fingerprint',outer_fp,'operation_request_id',id,
  'resource_id',context->>'resource_id','project_ref',context->>'project_ref','authorization',input->'authorization');
 prior:=production_control.lookup_cutover_receipt('CERTIFICATION_NET_SKINS_CALCULATION',identity);
 if op='DIRECTOR.NET_SKINS_CALCULATION_STATUS' then
  outcome:='UNKNOWN';state:='UNCONFIRMED';receipt:=null;
  if prior is not null then
   if prior->'job'='null'::jsonb then
    outcome:='COMMITTED';state:='NO_ELIGIBLE_WORK';receipt:=jsonb_build_object('ok',true,'code',prior->>'code','empty',true,'idempotent',true);
   else
    select * into strict j from scoring_authority.net_skins_v1_recalculation_jobs where job_id=(prior#>>'{job,job_id}')::uuid for update;
    phase_fp:=encode(extensions.digest('production-net-skins-v1'||chr(10)||'COMPLETE:'||upper(j.job_id::text)||chr(10)||base,'sha256'),'hex');
    select response into completed from production_control.cutover_operation_receipts where request_fingerprint=phase_fp and operation='NET_SKINS_V1_COMPLETE';
    phase_fp:=encode(extensions.digest('production-net-skins-v1'||chr(10)||'FAIL:'||upper(j.job_id::text)||chr(10)||base,'sha256'),'hex');
    select response into failed from production_control.cutover_operation_receipts where request_fingerprint=phase_fp and operation='NET_SKINS_V1_FAIL';
    if completed is not null then
     outcome:='COMMITTED';state:='COMPLETED';
     receipt:=(completed-'job_id')||jsonb_build_object('idempotent',true,'empty',false);
    elsif failed is not null or j.claim_token is distinct from (prior#>>'{job,claim_token}')::uuid
      or j.claimed_by is distinct from 'certification-net-skins-director-v1' or j.lease_expires_at<=clock_timestamp() then
     outcome:='NOT_COMMITTED';state:=case when failed is not null then 'FAILED' else 'CLAIM_CLOSED' end;
    else state:='CLAIM_HELD';end if;
   end if;
  end if;
  return jsonb_build_object('ok',true,'outcome',outcome,'state',state,'receipt',receipt);
 end if;
 if prior is not null then return prior;end if;
 if cfg.state<>'CONFIGURED' then raise exception using errcode='55000',message='PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';end if;
 if p->'expected_configuration_revision' is distinct from to_jsonb(cfg.configuration_revision) then
  raise exception using errcode='40001',message='PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';end if;
 if p->'entry_revisions' is distinct from expected_entries or exists(select 1 from jsonb_array_elements(rounds)v
  where v->'entry_revision' is distinct from v->'current_entry_revision') then
  raise exception using errcode='40001',message='FULL_NET_ENTRY_REVISION_STALE_OR_UNAVAILABLE';end if;
 if p->'source_fingerprints' is distinct from sources then
  raise exception using errcode='40001',message='PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';end if;
 -- Shipping separates explicit enqueue from process. Configuration can be
 -- saved after scores finalized, leaving no job/score intent. Materialize at
 -- most one missing configured-round demand through that same private core.
 -- Preserve a successful same-source output and exhausted/failed job history;
 -- ordinary calculation never grants a replacement budget to either.
 for round_lock in 1..3 loop
  perform pg_advisory_xact_lock(hashtextextended(format('production-net-skins-v1:enqueue:2026:R%s',round_lock),202608290055));
 end loop;
 for r in select value from jsonb_array_elements(manifest->'rounds')order by (value->>'round_number')::integer loop
  if not exists(select 1 from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026'
    and round_number=(r->>'round_number')::integer and configuration_revision=cfg.configuration_revision
    and source_fingerprint=sources->>(r->>'round_number') and status<>'SUPERSEDED')
   and not exists(select 1 from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026'
    and round_number=(r->>'round_number')::integer and configuration_revision=cfg.configuration_revision
    and source_fingerprint=sources->>(r->>'round_number') and is_current)then
   perform production_control.enqueue_production_net_skins_v1_round((r->>'round_number')::integer,'DIRECTOR_CALCULATION_REQUEST',input#>>'{authorization,player_id}');
   exit;
  end if;
 end loop;
 -- Canonical claim supplies the input/job. The caller never selects either.
 phase_fp:=encode(extensions.digest('production-net-skins-v1'||chr(10)||'CLAIM'||chr(10)||base,'sha256'),'hex');
 command:=jsonb_build_object('expected_configuration_revision',cfg.configuration_revision,'worker_id','certification-net-skins-director-v1',
  'lease_seconds',60,'request_fingerprint',phase_fp,'expected_activation_revision',context->'activation_revision',
  'tournament_id','2026','environment','CERTIFICATION','expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');
 claimed:=production_control.canonical_claim_net_skins_v1_recalculation_core_v2(command,context);
 if claimed->'job'<>'null'::jsonb and claimed#>>'{job,source_fingerprint}' is distinct from p#>>array['source_fingerprints',claimed#>>'{job,round_number}'] then
  raise exception using errcode='40001',message='PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';end if;
 perform production_control.store_cutover_receipt('CERTIFICATION_NET_SKINS_CALCULATION',identity,claimed);
 return claimed;
end;
$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.dispatch_certification_net_skins_configuration_v1(jsonb, jsonb, boolean)','old','cd79da608d945f60fd688a8247bea8749751ebf31345a24cd3727495a8011651','new','ff911f598b5fa8c0a4c8a3eeb5b7a0f74384e620088136487213b9f913ecb7de');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.dispatch_certification_net_skins_configuration_v1(input jsonb, context jsonb, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare payload jsonb:=input->'payload';command jsonb;current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
 revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
begin
 perform production_control.assert_canonical_scoring_context_v1('{}',context,'RUNTIME');
 if context->>'tournament_id' is distinct from '2026' or context->>'resource_class' is distinct from 'CERTIFICATION'
   or (not production_control.model_d_context_v1(context) and (context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'))
   or input->>'phase' is distinct from 'DIRECTOR'
   or input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id' then
   raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_TARGET_DENIED'; end if;
 perform production_control.assert_production_scoring_actor(jsonb_build_object('authorization',input->'authorization'),true);
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'family' is distinct from 'NET_SKINS_CONFIGURATION' then
   raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_INPUT_INVALID'; end if;
 if not mutation then
   if input->>'operation_id' is distinct from 'DIRECTOR.READ_NET_SKINS_CONFIGURATION'
     or payload->>'action' is distinct from 'read'
     or exists(select 1 from jsonb_object_keys(payload) k where k not in('family','action')) then
     raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_INPUT_DENIED'; end if;
   select * into current_value from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026';
   select * into revision_value from scoring_authority.net_skins_v1_configuration_revisions
     where configuration_revision_id=current_value.configuration_revision_id;
   return jsonb_build_object('ok',true,'tournament_id','2026','configuration_revision',coalesce(current_value.configuration_revision,0),
     'configuration_fingerprint',revision_value.configuration_fingerprint,'state',coalesce(current_value.state,'NOT_CONFIGURED'),
     'rounds',coalesce(revision_value.configuration_manifest->'rounds','[]'::jsonb));
 end if;
 if input->>'operation_id' is distinct from 'DIRECTOR.CONFIGURE_NET_SKINS' or payload->>'action' is distinct from 'configure'
   or exists(select 1 from jsonb_object_keys(payload) k where k not in('family','action','expected_configuration_revision','eligible_round_numbers','entry_revisions'))
   or jsonb_typeof(payload->'entry_revisions') is distinct from 'object'
   or coalesce(payload->>'expected_configuration_revision','') !~ '^(0|[1-9][0-9]*)$' then
   raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_INPUT_INVALID'; end if;
 -- The operation ID is already admitted by the durable ingress/actor gateway.
 -- No request fingerprint or resource material can be supplied in the DTO.
 command:=(payload-array['family','action'])||jsonb_build_object('contract_version','production-net-skins-v1',
   'publication_policy','OFFICIAL_ONLY','tournament_id',context->>'tournament_id','authorization',input->'authorization',
   'expected_epoch_id',context->>'authority_epoch_id','expected_activation_revision',(context->>'activation_revision')::bigint,
   'vercel_project_id',context->>'vercel_project_id','vercel_team_id',context->>'vercel_team_id',
   'request_fingerprint',production_control.certification_net_skins_configuration_fingerprint_v1(context->>'resource_id',input->>'operation_request_id'));
 return production_control.canonical_configure_net_skins_v1(command,context);
exception when raise_exception then
 -- Adapt only the manifest's documented saved-entry CAS denial. Infrastructure
 -- failures retain their original SQLSTATE; Production's null-context path is unchanged.
 if SQLERRM='FULL_NET_ENTRY_REVISION_STALE_OR_UNAVAILABLE' then
   raise exception using errcode='PT409',message='PRODUCTION_NET_SKINS_ENTRY_REVISION_CONFLICT';
 end if;
 raise;
end;$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.dispatch_certification_odds_configuration_v1(jsonb, jsonb, boolean)','old','a8606e73e529d4e467ca109dc47c0f8a9f2ef517aeca915ef57ce8be93298d4d','new','dd7b48d9529ef8ced794d85dec2cd1e3256ad8218d3263f94d1df7857ce43ee5');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.dispatch_certification_odds_configuration_v1(input jsonb, context jsonb, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 op text:=input->>'operation_id';p jsonb:=input->'payload';target text:=context->>'tournament_id';
 actor text:=input#>>'{authorization,player_id}';request_id text:=lower(input->>'operation_request_id');
 cfg scoring_authority.odds_input_configurations%rowtype;proposed jsonb;validation jsonb;
 identity jsonb;prior jsonb;receipt jsonb;source_id text;source_hash text;pairing_hash text;ratings_hash text;bundle_hash text;
 revision bigint;new_id uuid;at_time timestamptz:=clock_timestamp();
begin
 perform production_control.assert_canonical_scoring_context_v1('{}',context,'RUNTIME');
 if context is distinct from production_control.current_certification_context_v1()
  or context->>'phase' is distinct from 'DIRECTOR' or target is distinct from '2026'
  or (not production_control.model_d_context_v1(context) and (context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'))
  or op not in('DIRECTOR.CONFIGURE_ODDS_INPUTS','DIRECTOR.READ_ODDS_INPUT_CONFIGURATION','DIRECTOR.ODDS_INPUT_CONFIGURATION_STATUS')
  or mutation is distinct from (op='DIRECTOR.CONFIGURE_ODDS_INPUTS') then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_CONFIGURATION_CONTEXT_DENIED';end if;
 perform production_control.assert_production_scoring_actor(jsonb_build_object('tournament_id',target,'authorization',input->'authorization'),true);
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p)k
  where k not in('expected_configuration_revision','profile','confirmation','reason')) then
  raise exception using errcode='22023',message='CERTIFICATION_ODDS_CONFIGURATION_INPUT_INVALID';end if;
 select * into cfg from scoring_authority.odds_input_configurations where tournament_id=target and is_current;
 if op='DIRECTOR.READ_ODDS_INPUT_CONFIGURATION' then
  if p<>'{}'::jsonb then raise exception using errcode='22023',message='CERTIFICATION_ODDS_CONFIGURATION_INPUT_INVALID';end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('tournament_id',target,
   'configuration_revision',coalesce(cfg.configuration_revision,0),'configuration_id',cfg.id,
   'state',case when cfg.id is null then 'NOT_CONFIGURED' else 'CONFIGURED' end,
   'profile','CERTIFICATION_DEFAULTS_V1','provenance',cfg.validation_diagnostics->>'authoringAuthority'));
 end if;
 if coalesce(request_id,'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or jsonb_typeof(p->'expected_configuration_revision') is distinct from 'number'
  or p->>'expected_configuration_revision' !~ '^[0-9]+$'
  or p->>'profile' is distinct from 'CERTIFICATION_DEFAULTS_V1'
  or p->>'confirmation' is distinct from 'CONFIGURE SYNTHETIC ODDS INPUTS'
  or coalesce(btrim(p->>'reason'),'')='' or length(p->>'reason')>500 then
  raise exception using errcode='22023',message='CERTIFICATION_ODDS_CONFIGURATION_INPUT_INVALID';end if;
 identity:=jsonb_build_object('request_fingerprint',production_control.prediction_settings_hash_v1(jsonb_build_object(
  'contract','certification-odds-input-configuration-v1','resource_id',context->>'resource_id','operation_id',request_id,
  'actor',input->'authorization')),'request_payload_hash',production_control.prediction_settings_hash_v1(p));
 perform pg_advisory_xact_lock(hashtextextended('certification-odds-inputs:'||target,0));
 prior:=production_control.lookup_cutover_receipt('CERTIFICATION_ODDS_INPUT_CONFIGURATION',identity);
 if op='DIRECTOR.ODDS_INPUT_CONFIGURATION_STATUS' then
  return jsonb_build_object('ok',true,'outcome',case when prior is null then 'NOT_COMMITTED' else 'COMMITTED' end,
   'receipt',prior);end if;
 if prior is not null then return prior||jsonb_build_object('idempotent',true);end if;
 select * into cfg from scoring_authority.odds_input_configurations where tournament_id=target and is_current for update;
 if coalesce(cfg.configuration_revision,0)<>(p->>'expected_configuration_revision')::bigint then
  raise exception using errcode='40001',message='PREDICTION_SETTINGS_PREDECESSOR_STALE';end if;
 -- Fixed reviewed synthetic profile, drawn from the canonical definitions,
 -- never from Production/Google/current settings or client-selected values.
 select jsonb_object_agg(setting_key,default_value)into proposed from production_control.prediction_setting_definitions_v1;
 validation:=production_control.validate_prediction_settings_v1(proposed,cfg.canonical_settings);
 if not coalesce((validation->>'pass')::boolean,false) or validation->>'settingsFingerprint' is distinct from
  'd95218665e2dac25867f6f7f40b4c16256201e6b51eaa38152cb88a2cc92b4c0' then
  raise exception using errcode='22023',message='PREDICTION_SETTINGS_VALIDATION_FAILED';end if;
 if cfg.id is not null and cfg.canonical_settings=validation->'canonicalSettings'
  and cfg.validation_diagnostics->>'authoringAuthority'='CERTIFICATION_SYNTHETIC' then
  receipt:=jsonb_build_object('ok',true,'code','CERTIFICATION_ODDS_INPUTS_UNCHANGED','configuration_id',cfg.id,
   'configuration_revision',cfg.configuration_revision,'idempotent',true,'provenance','CERTIFICATION_SYNTHETIC');
 else
  select provenance_id into strict source_id from production_control.canonical_resource_v1 where singleton;
  select coalesce(max(configuration_revision),0)+1 into revision from scoring_authority.odds_input_configurations where tournament_id=target;
  pairing_hash:=production_control.annual_odds_pairing_fingerprint_v1(target);
  ratings_hash:=production_control.prediction_settings_hash_v1('{}'::jsonb);
  source_hash:=production_control.prediction_settings_hash_v1(jsonb_build_object('contract','certification-odds-input-configuration-v1',
   'resource_id',context->>'resource_id','installation_id',context->>'installation_id','tournament_id',target,
   'configuration_revision',revision,'profile',p->>'profile','settings',validation->'canonicalSettings','historical_ratings','{}'::jsonb));
  bundle_hash:=production_control.prediction_settings_hash_v1(jsonb_build_object('contract','production-odds-input-bundle-v1',
   'tournament_id',target,'configuration_revision',revision,'source_fingerprint',source_hash,
   'settings_fingerprint',validation->>'settingsFingerprint','effective_settings_fingerprint',validation->>'effectiveSettingsFingerprint',
   'ratings_fingerprint',ratings_hash,'pairing_fingerprint',pairing_hash));
  update scoring_authority.odds_input_configurations set is_current=false,superseded_at=at_time where tournament_id=target and is_current;
  insert into scoring_authority.odds_input_configurations(tournament_id,configuration_revision,source_workbook_id,
   settings,historical_ratings,settings_fingerprint,ratings_fingerprint,pairing_fingerprint,bundle_fingerprint,is_current,
   imported_by,source_tab,source_fingerprint,canonical_settings,effective_settings,effective_settings_fingerprint,
   settings_contract_version,validation_status,validation_diagnostics,synchronized_at,previous_configuration_id)
  values(target,revision,source_id,validation->'settingsRows','{}',validation->>'settingsFingerprint',ratings_hash,pairing_hash,bundle_hash,true,
   'Certification Synthetic Director '||actor,'Certification Synthetic Prediction Settings',source_hash,
   validation->'canonicalSettings',validation->'effectiveSettings',validation->>'effectiveSettingsFingerprint','prediction-settings-v1','VALID',
   jsonb_build_object('authoringAuthority','CERTIFICATION_SYNTHETIC','authoringContract','certification-odds-input-configuration-v1',
    'profile',p->>'profile','synthetic',true,'ownerApproved',true,'googleAccess',false,'productionSource',false,
    'resource_id',context->>'resource_id','release_commit',context->>'release_commit','deployment_id',context->>'deployment_id',
    'director_player_id',actor,'director_auth_user_id',input#>>'{authorization,auth_user_id}',
    'completeSchema',true,'reason',p->>'reason','automaticCalculationRequested',false,'automaticPublicationRequested',false),
   at_time,cfg.id)returning scoring_authority.odds_input_configurations.id into new_id;
  receipt:=jsonb_build_object('ok',true,'code','CERTIFICATION_ODDS_INPUTS_CONFIGURED','configuration_id',new_id,
   'configuration_revision',revision,'idempotent',false,'provenance','CERTIFICATION_SYNTHETIC');
  insert into production_control.prediction_settings_audit_events_v1(tournament_id,configuration_id,action,
   actor_player_id,actor_auth_user_id,operation_request_id,request_payload_hash,summary)
  values(target,new_id,'REVISION_COMMITTED',actor,(input#>>'{authorization,auth_user_id}')::uuid,request_id::uuid,
   identity->>'request_payload_hash',receipt||jsonb_build_object('synthetic',true,'googleAccess',false,'productionSource',false));
 end if;
 perform production_control.store_cutover_receipt('CERTIFICATION_ODDS_INPUT_CONFIGURATION',identity,receipt);
 return receipt;
end;
$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.worker_supervisor_binding_v1(jsonb)','old','5a219318f54e62d254c4df2e58ea72e65f5f3af621f77475927d2de3abeeec31','new','c3314344e1bb9d92863888c281e662c117ab84e41bd90a09ebccbd83c9b84ff7');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.worker_supervisor_binding_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare r production_control.canonical_resource_v1%rowtype;a production_control.certification_admission_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;b jsonb;k text;
begin
 perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
 select * into strict r from production_control.canonical_resource_v1 where singleton for share;
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for share;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id for share;
 if r.resource_class<>'CERTIFICATION' or (not production_control.worker_supervisor_model_d_v1() and (r.resource_id<>'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' or r.project_ref<>'trmcwrljjxwhgtikfdgu')) or r.registration_revision<>1 or r.database_name<>current_database()or p.tournament_id<>'2026'
  or exists(select 1 from production_control.resource_scope) or exists(select 1 from production_control.cutover_activation_state)
  or not exists(select 1 from production_control.canonical_bootstrap_installation_v1)
  or not exists(select 1 from scoring_authority.authority_epochs e where e.epoch_id=a.authority_epoch_id
   and e.epoch_type='CERTIFICATION_INITIALIZATION' and e.status='COMMITTED') then
  raise exception using errcode='42501',message='SUPERVISOR_RESOURCE_DENIED';end if;
 foreach k in array array['resource_id','resource_class','installation_id','project_ref','project_url','registration_revision','manifest_digest','schema_contract','schema_digest']loop
  if input#>>array['resource',k] is distinct from to_jsonb(r)->>k then
   raise exception using errcode='42501',message='SUPERVISOR_RESOURCE_DENIED';end if;end loop;
 b:=jsonb_build_object('vercel_team_id',r.vercel_team_id,'vercel_project_id',r.vercel_project_id,
  'git_branch',a.git_branch,'deployment_class',a.deployment_class,'release_commit',a.release_commit,
  'deployment_id',a.deployment_id,'deployment_origin',a.deployment_origin);
 if input->'deployment' is distinct from b or a.deployment_class<>'preview'
  or a.deployment_origin !~ '^https://[a-z0-9-]+\.vercel\.app$' then
  raise exception using errcode='42501',message='SUPERVISOR_DEPLOYMENT_DENIED';end if;
 return jsonb_build_object('resource',input->'resource','deployment',b,'binding_id',a.binding_id,
  'authority_epoch_id',a.authority_epoch_id,'activation_revision',a.activation_revision,
  'admission_revision',a.admission_revision,'pointer_revision',p.pointer_revision,'tournament_id',p.tournament_id);
exception when no_data_found then raise exception using errcode='42501',message='SUPERVISOR_RESOURCE_DENIED';
end;$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.worker_supervisor_counts_v1()','old','76ba2feaecac2c1fe63e451b810d0009e9ad3cf28c47e7fd97eab71cd432c4fe','new','335356755cf016f9b367ac9715d6e495cea97980c24b43051b8a72990fd45ef2');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.worker_supervisor_counts_v1()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select jsonb_build_object('pending_work',
  (select count(*)from scoring_authority.competition_recalculation_jobs j where j.tournament_id='2026'
   and j.engine_key=any(production_control.worker_supervisor_engines_v1()) and (j.engine_key<>'TOURNAMENT_FINAL_RECAP' or production_control.derived_final_recap_ready_v1('2026'))
   and j.status in('PENDING','FAILED')and j.delivery_dead_letter_at is null)
  +(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026'
   and status in('PENDING','FAILED')and delivery_dead_letter_at is null),
 'active_claims',(select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and status='RUNNING'
  and coalesce(lease_expires_at,started_at+interval '90 seconds')>clock_timestamp())
  +(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026'and status='RUNNING'and lease_expires_at>clock_timestamp()),
 'expired_claims',(select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and status='RUNNING'
  and coalesce(lease_expires_at,started_at+interval '90 seconds')<=clock_timestamp())
  +(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026'and status='RUNNING'and lease_expires_at<=clock_timestamp()),
 'dead_letters',(select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and delivery_dead_letter_at is not null)
  +(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026'and delivery_dead_letter_at is not null),
 'active_leases',(select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')),
 'pending_intents',(select count(*)from scoring_authority.score_derived_intents_v1 where tournament_id='2026'and status not in('SUCCEEDED','SUPERSEDED')));
$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.worker_supervisor_scope_v1()','old','a1ea9d479b4cef4ba33a70755b424d673aee62e5bb49b429a030fef9b2571ba9','new','5083f13d1f2a82bbd53941910c2558522088026f46a0c8793a98b16150ddfd46');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.worker_supervisor_scope_v1()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 if production_control.worker_supervisor_model_d_v1() then
  if not exists(select 1 from production_control.worker_supervisor_v1 where singleton and engines=production_control.worker_supervisor_engines_v1()) or exists(select 1 from scoring_authority.odds_published_snapshots where not publication_verified) then raise exception using errcode='42501',message='SUPERVISOR_ENGINE_SCOPE_DENIED';end if;
  return;
 end if;
 -- Closed installed registry, never a message/client engine selector.
 if not exists(select 1 from production_control.worker_supervisor_v1 where singleton and
  engines=array['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','CALCUTTA']::text[])
  or production_control.derived_final_recap_ready_v1('2026')
  -- Published non-Final Odds creates work for the existing Intelligence engines.
  -- This does not admit an Odds processor or FinalRecap to the Queue registry.
  or exists(select 1 from scoring_authority.odds_published_snapshots
   where not publication_verified or milestone='Final Results'
    or published_payload->>'phase'='Final Results') then
  raise exception using errcode='42501',message='SUPERVISOR_ENGINE_SCOPE_DENIED';end if;
end;$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','production_control.worker_supervisor_status_v1(jsonb)','old','7fc0043ab08aa2e7def9bb3315edc722d90e1233876c0cda7701265eef86ac48','new','3bdbc894a63e53507227f02de4456972757f2c0769ed6adb2fc141131e13d8b4');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION production_control.worker_supervisor_status_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;
begin
 perform production_control.worker_supervisor_owner_v1();b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1;
 return jsonb_build_object('ok',true,'state',s.state,'enabled',s.state='ENABLED'and not s.halt_latched and s.expires_at>clock_timestamp(),
 'engine_scope_contract',case when production_control.worker_supervisor_model_d_v1() then 'certification-model-d-execution-v1' else 'certification-queue-calcutta-scope-v1' end,'engines',to_jsonb(s.engines),
 'epoch',s.epoch,'revision',s.revision,'expiry',s.expires_at,'deployment',b->'deployment','slots',s.slots,'budget',s.budget,
 'reserved',(select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='RESERVED'),
 'consumed',(select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and started_at is not null),
 'remaining',(select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='RESERVED'and expires_at>clock_timestamp()),
 'publication',(select jsonb_build_object('reserved',count(*)filter(where publication_state='RESERVED'),'unknown',count(*)filter(where publication_state='UNKNOWN'),
 'accepted',count(*)filter(where publication_state='ACCEPTED'),'delivered',count(*)filter(where publication_state='DELIVERED'),'cancelled',count(*)filter(where publication_state='CANCELLED'))
 from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch),
 'schedule_installed',false,'delivery_certified',false,
 'last_invocation',s.last_invocation,'last_successful_tick',s.last_success,'consecutive_global_failures',s.tick_failures,
 'consecutive_invocation_failures',s.invocation_failures,'next_eligible_at',s.next_at,'reason',s.reason,'halt_latched',s.halt_latched,
 'last_halt_reason',s.last_halt_reason,'degraded',exists(select 1 from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='UNKNOWN'),
 'counts',production_control.worker_supervisor_counts_v1(),
 'global_faults',(select jsonb_build_object('plans',count(*),'remaining_uses',coalesce(sum(remaining_uses),0),
 'consumed_uses',coalesce(sum(initial_uses-remaining_uses-cancelled_uses),0),'cancelled_uses',coalesce(sum(cancelled_uses),0),'correction_required',coalesce(bool_or(corrected_at is null),false))
 from production_control.worker_supervisor_global_faults_v5 where epoch=s.epoch));
end;$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 e:=jsonb_build_object('signature','public.execute_certification_queue_supervisor_v2(jsonb)','old','46aa6ff6551e1eaf80660bc999bfb42e8eea6c30b0d3da3616515538aeab8478','new','55389feec08561bdb7b2773b4432c5b2eedd96bab2ae3450e8909a75b04363cd');
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,before_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h not in(e->>'old',e->>'new')then raise exception 'MODEL_D_PREDECESSOR_MISMATCH:%',e->>'signature';end if;
 if h=e->>'old'then execute $definition$CREATE OR REPLACE FUNCTION public.execute_certification_queue_supervisor_v2(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare s production_control.worker_supervisor_v1%rowtype;i production_control.worker_supervisor_invocations_v1%rowtype;
 b jsonb;ticket jsonb;routing_reason text;routing_disposition text;operation text:=input->>'operation';token text;expected_signature text;plan production_control.worker_supervisor_faults_v1%rowtype;
begin
 perform production_control.assert_production_service_role();
 if input->>'contract' is distinct from 'certification-queue-supervision-v2'then raise exception using errcode='42501',message='SUPERVISOR_OPERATION_DENIED';end if;
 b:=production_control.worker_supervisor_queue_binding_v2(input);
 if operation='DISPOSITION'then
  -- Identification only: no BEGIN, row mutation, claim, counter or run token.
  -- The owner publication ledger binds the opaque provider message to the
  -- private invocation. A payload cannot assert its own terminal state.
  if (select count(*)from jsonb_object_keys(input))<>7
   or input->'runtime' is distinct from b->'deployment'
   or jsonb_typeof(input->'provider_message_id') is distinct from 'string'
   or length(input->>'provider_message_id')not between 1 and 512 then
   raise exception using errcode='42501',message='SUPERVISOR_RESERVATION_DENIED';end if;
  ticket:=input->'message';
  if ticket is null or jsonb_typeof(ticket)<>'object' or(select count(*)from jsonb_object_keys(ticket))<>2
   or ticket->>'version' is distinct from 'certification-queue-supervision-v2' then
   raise exception using errcode='42501',message='SUPERVISOR_MESSAGE_DENIED';end if;
  select * into strict s from production_control.worker_supervisor_v1 where singleton;
  select * into strict i from production_control.worker_supervisor_invocations_v1
   where invocation_id=(ticket->>'invocation_id')::uuid and transport='QUEUE_V2';
  if i.binding_digest !~ '^[0-9a-f]{64}$'or i.reservation_digest !~ '^[0-9a-f]{64}$'
   or not exists(select 1 from production_control.worker_supervisor_receipts_v1 r
    where r.response->>'epoch'=i.epoch::text and r.response->'deployment'=b->'deployment')
   or(i.epoch=s.epoch and i.reservation_digest is distinct from
    production_control.worker_supervisor_queue_digest_v2(i.invocation_id,i.epoch,i.revision,i.sequence,
     i.scheduled_at,i.expires_at,s.authority_context,s.engines))
   or(i.provider_message_id is not null and i.provider_message_id is distinct from input->>'provider_message_id')then
   raise exception using errcode='42501',message='SUPERVISOR_RESERVATION_DENIED';end if;
  routing_disposition:='ACK';
  if i.provider_message_id is null then
   -- Publication acknowledgement may still be lost/in flight. Never delete a
   -- message whose provider identity has not been authoritatively recorded.
   routing_disposition:='RECONCILE';routing_reason:='PUBLICATION_UNKNOWN';
  elsif i.state in('RUNNING','UNKNOWN')then
   -- STOP/expiry cannot prove a possibly committed invocation rolled back.
   routing_disposition:='RECONCILE';routing_reason:=i.state;
  elsif s.state in('OFF','STOPPING')and i.epoch=s.epoch then routing_reason:='STOPPED';
  elsif i.publication_state='CANCELLED'then routing_reason:='CANCELLED';
  elsif i.state='STOPPED'or i.outcome='NOT_STARTED'then routing_reason:='STOPPED';
  elsif i.epoch<>s.epoch or i.revision<>s.revision then routing_reason:='STALE_EPOCH';
  elsif i.state<>'RESERVED'then routing_reason:='REPLAY';
  elsif i.expires_at<=clock_timestamp()or s.expires_at<=clock_timestamp()then routing_reason:='EXPIRED';
  elsif s.state='HALTED'or s.halt_latched then routing_reason:='HALTED';
  elsif b is distinct from s.authority_context then routing_reason:='STALE_CONTEXT';
  elsif not exists(select 1 from production_control.certification_admission_v1
    where resource_id=b#>>'{resource,resource_id}'and enabled)
   or not exists(select 1 from scoring_authority.ingress_gates
    where tournament_id=b->>'tournament_id'and state='OPEN')then routing_reason:='ADMISSION_DENIED';
  else routing_disposition:='ELIGIBLE';routing_reason:='CURRENT';end if;
  return jsonb_build_object('ok',true,'identified',true,'execution_authorized',false,
   'invocation_id',i.invocation_id,'disposition',routing_disposition,'reason',routing_reason);
 end if;
 select * into s from production_control.worker_supervisor_v1 where singleton for update;
 if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;
 if operation='BEGIN'then
  ticket:=input->'message';
  if ticket is null or jsonb_typeof(ticket)<>'object' or (select count(*)from jsonb_object_keys(ticket))<>2
   or ticket->>'version' is distinct from 'certification-queue-supervision-v2' then
   raise exception using errcode='42501',message='SUPERVISOR_MESSAGE_DENIED';end if;
  select * into strict i from production_control.worker_supervisor_invocations_v1
   where invocation_id=(ticket->>'invocation_id')::uuid and transport='QUEUE_V2' for update;
  if input->'runtime' is distinct from b->'deployment' then
   raise exception using errcode='42501',message='SUPERVISOR_DEPLOYMENT_DENIED';end if;
  if i.reservation_digest is distinct from production_control.worker_supervisor_queue_digest_v2(i.invocation_id,i.epoch,i.revision,i.sequence,i.scheduled_at,i.expires_at,s.authority_context,s.engines)
   or i.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='SUPERVISOR_RESERVATION_DENIED';end if;
  if i.outcome='NOT_STARTED' or i.state='STOPPED' then raise exception using errcode='42501',message='SUPERVISOR_DISABLED_OR_STALE';end if;
  if i.state<>'RESERVED' then
   -- A duplicate observes the durable invocation, never starts another tick.
   return jsonb_build_object('ok',true,'admitted',false,'invocation_id',i.invocation_id,'outcome',i.state,
    'uncertain',i.state in('RUNNING','UNKNOWN'));
  end if;
  if s.state<>'ENABLED'or s.halt_latched or s.expires_at<=clock_timestamp()or i.epoch<>s.epoch or i.revision<>s.revision
   or b is distinct from s.authority_context then raise exception using errcode='42501',message='SUPERVISOR_DISABLED_OR_STALE';end if;
  if clock_timestamp()<i.scheduled_at or clock_timestamp()<s.next_at
   or(select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='RUNNING')>=s.slots then
   raise exception using errcode='PT409',message='SUPERVISOR_NOT_DUE_OR_BUSY',
    detail=jsonb_build_object('reason',case when clock_timestamp()<i.scheduled_at or clock_timestamp()<s.next_at then 'NOT_DUE'else 'BUSY'end,
     'retry_after_seconds',case when clock_timestamp()<i.scheduled_at or clock_timestamp()<s.next_at
      then greatest(1,ceil(extract(epoch from(greatest(i.scheduled_at,s.next_at)-clock_timestamp())))::integer)else 15 end)::text;end if;
  perform production_control.worker_supervisor_scope_v1();
  if not exists(select 1 from production_control.certification_admission_v1 where resource_id=b#>>'{resource,resource_id}'and enabled)
   or not exists(select 1 from scoring_authority.ingress_gates where tournament_id=b->>'tournament_id'and state='OPEN')then
   raise exception using errcode='42501',message='SUPERVISOR_ADMISSION_DENIED';end if;
  update production_control.worker_supervisor_v1 set last_invocation=i.invocation_id where singleton and epoch=s.epoch and revision=s.revision;
  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  update production_control.worker_supervisor_invocations_v1 set state='RUNNING',publication_state='DELIVERED',started_at=clock_timestamp(),
   run_token_hash=encode(extensions.digest(token,'sha256'),'hex')where invocation_id=i.invocation_id;
  return jsonb_build_object('ok',true,'admitted',true,'invocation_id',i.invocation_id,'run_token',token,'fault_contract','certification-global-fault-v5',
   'engine_scope_contract',case when production_control.worker_supervisor_model_d_v1() then 'certification-model-d-execution-v1' else 'certification-queue-calcutta-scope-v1' end,'engines',to_jsonb(s.engines));
 end if;
 select * into strict i from production_control.worker_supervisor_invocations_v1 where invocation_id=(input->>'invocation_id')::uuid for update;
 if i.run_token_hash is null or i.run_token_hash is distinct from encode(extensions.digest(input->>'run_token','sha256'),'hex')
  or i.epoch<>s.epoch or i.state<>'RUNNING'or i.reconcile_after<=clock_timestamp() then
  raise exception using errcode='42501',message='SUPERVISOR_RUN_TOKEN_DENIED';end if;
 if operation='STEP'then
  if s.state<>'ENABLED'or s.halt_latched or s.expires_at<=clock_timestamp()or b is distinct from s.authority_context
   or clock_timestamp()>=i.started_at+interval '45 seconds' or input->>'sequence' is distinct from (i.step_sequence+1)::text
   or input->>'kind'not in('TICK','COMPETITION','INTELLIGENCE','CALCUTTA')then
   raise exception using errcode='42501',message='SUPERVISOR_STEP_DENIED';end if;
  perform production_control.worker_supervisor_scope_v1();
  update production_control.worker_supervisor_invocations_v1 set step_sequence=step_sequence+1 where invocation_id=i.invocation_id;
 elsif operation='TICK_RESULT'then
  if i.tick_recorded or jsonb_typeof(input->'success')<>'boolean'then raise exception using errcode='42501',message='SUPERVISOR_TICK_REPLAY_DENIED';end if;
  update production_control.worker_supervisor_invocations_v1 set tick_recorded=true,tick_success=(input->>'success')::boolean where invocation_id=i.invocation_id;
  if (input->>'success')::boolean then
   if s.state='ENABLED'and i.sequence>s.last_tick_sequence then
    update production_control.worker_supervisor_v1 set tick_failures=0,last_success=clock_timestamp(),last_tick_sequence=i.sequence where singleton and epoch=s.epoch and revision=s.revision;
  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;
   end if;
  else
   if input->>'classification'not in('TERMINAL','RETRYABLE')or input->>'code'!~ '^[A-Z0-9_]{1,120}$'then
    raise exception using errcode='42501',message='SUPERVISOR_FAILURE_CLASS_DENIED';end if;
   update production_control.worker_supervisor_v1 set tick_failures=tick_failures+1,last_tick_sequence=greatest(last_tick_sequence,i.sequence),
    state=case when input->>'classification'='TERMINAL'or tick_failures+1>=5 then 'HALTED'else state end,
    halt_latched=halt_latched or input->>'classification'='TERMINAL'or tick_failures+1>=5,
    last_halt_reason=case when input->>'classification'='TERMINAL'then 'TERMINAL_TICK_FAILURE'when tick_failures+1>=5 then 'TICK_RETRY_EXHAUSTED'else last_halt_reason end,
    reason=case when input->>'classification'='TERMINAL'then 'TERMINAL_TICK_FAILURE'when tick_failures+1>=5 then 'TICK_RETRY_EXHAUSTED'else input->>'code'end,
    next_at=greatest(next_at,clock_timestamp()+make_interval(secs=>least(300,power(2,tick_failures+1)::integer))) where singleton and epoch=s.epoch and revision=s.revision;
  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;
  end if;
 elsif operation='FINISH'then
  if input->>'outcome'not in('SUCCEEDED','FAILED','JOB_RETRY','TERMINAL','UNKNOWN','STOPPED')
   or (not i.tick_recorded and input->>'outcome'<>'STOPPED')then
   raise exception using errcode='42501',message='SUPERVISOR_OUTCOME_DENIED';end if;
  if input->>'outcome'='SUCCEEDED'and not i.tick_success then raise exception using errcode='42501',message='SUPERVISOR_FALSE_SUCCESS_DENIED';end if;
  update production_control.worker_supervisor_invocations_v1 set state=input->>'outcome',outcome=input->>'outcome',finished_at=clock_timestamp()where invocation_id=i.invocation_id;
  update production_control.worker_supervisor_v1 set invocation_failures=case when input->>'outcome' in('SUCCEEDED','JOB_RETRY','STOPPED')then 0 else invocation_failures+1 end,
   state=case when input->>'outcome'='TERMINAL'or (input->>'outcome' in('FAILED','UNKNOWN')and invocation_failures+1>=3)then 'HALTED'else state end,
   halt_latched=halt_latched or input->>'outcome'='TERMINAL'or(input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3),
   last_halt_reason=case when input->>'outcome'='TERMINAL'then 'TERMINAL_JOB_FAILURE'when input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else last_halt_reason end,
   reason=case when input->>'outcome'='TERMINAL'then 'TERMINAL_JOB_FAILURE'when input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else reason end where singleton and epoch=s.epoch and revision=s.revision;
  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;
  insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
  values('CERTIFICATION_QUEUE_INVOCATION_FINISHED','RESOURCE','PRIVATE_QUEUE',input->>'outcome',
   jsonb_build_object('invocation_id',i.invocation_id,'epoch',i.epoch,'resource_id',b#>>'{resource,resource_id}',
    'deployment_id',b#>>'{deployment,deployment_id}','outcome',input->>'outcome'));
  return jsonb_build_object('ok',true,'outcome',input->>'outcome');
 elsif operation='GLOBAL_FAULT'then
  return production_control.worker_supervisor_global_fault_take_v5(input);
 elsif operation='FAULT'then
  if input->>'fault_operation'='WORKERS.CALCUTTA_CLAIM'then
   -- Observe a committed canonical claim only. This adds no Calcutta fault
   -- selector and gives the worker no Director or publication authority.
   if input#>>'{payload,worker_id}'is distinct from 'supervised-'||i.invocation_id::text then
    raise exception using errcode='42501',message='SUPERVISOR_FAULT_DENIED';end if;
   update production_control.worker_supervisor_invocations_v1 set claim_evidence=claim_evidence||coalesce((
    select jsonb_agg(jsonb_build_object('engine','CALCUTTA','job_id',j.job_id,'cycle',j.delivery_cycle,
     'source_fingerprint',j.source_fingerprint,'started_at',j.started_at))
    from scoring_authority.calcutta_v1_recalculation_jobs j join production_control.operation_audit_events a on
     a.event_type='CERTIFICATION_CANONICAL_OPERATION'and a.details->>'operation_id'='WORKERS.CALCUTTA_CLAIM'
     and a.details->>'operation_request_id'=input->>'request_id'
     and a.details->>'resource_id'=s.binding#>>'{resource,resource_id}'
     and a.details->>'release_commit'=s.binding#>>'{deployment,release_commit}'
     and a.request_fingerprint=production_control.cutover_payload_hash(input->'payload')
     and a.details#>>'{receipt,job,job_id}'=j.job_id::text
    where j.tournament_id='2026'and j.status='RUNNING'
     and j.claimed_by='supervised-'||i.invocation_id::text
     and j.activation_revision=(s.authority_context->>'activation_revision')::bigint
     and j.lease_expires_at>clock_timestamp()
   ),'[]'::jsonb)where invocation_id=i.invocation_id;
   return jsonb_build_object('ok',true,'fault',null);
  end if;
  if input->>'fault_operation'like '%CLAIM'then
   -- Read the committed canonical receipt, never a caller-provided claim result.
   if input#>>'{payload,worker_id}'is distinct from 'supervised-'||i.invocation_id::text then
    raise exception using errcode='42501',message='SUPERVISOR_FAULT_DENIED';end if;
   update production_control.worker_supervisor_invocations_v1 set claim_evidence=claim_evidence||coalesce((
    select jsonb_agg(jsonb_build_object('engine',j.engine_key,'cycle',j.delivery_cycle,
     'source',j.requested_source_revision,'started_at',j.started_at))
    from scoring_authority.competition_recalculation_jobs j join production_control.operation_audit_events a on
     a.event_type='CERTIFICATION_CANONICAL_OPERATION'and a.details->>'operation_id'=input->>'fault_operation'
     and a.details->>'operation_request_id'=input->>'request_id'
     and a.details->>'resource_id'=s.binding#>>'{resource,resource_id}'
     and a.details->>'release_commit'=s.binding#>>'{deployment,release_commit}'
     and a.request_fingerprint=production_control.cutover_payload_hash(input->'payload')
    where j.tournament_id='2026'and j.status='RUNNING'and j.engine_key=any(s.engines)
     and (j.started_at=(a.details#>>'{receipt,claim_started_at}')::timestamptz or exists(
      select 1 from jsonb_array_elements(coalesce(a.details#>'{receipt,claims}','[]'::jsonb))v
       where v->>'engine_key'=j.engine_key and (v->>'claim_started_at')::timestamptz=j.started_at))
   ),'[]'::jsonb)where invocation_id=i.invocation_id returning * into i;
  end if;
  select f.* into plan from production_control.worker_supervisor_faults_v1 f where f.epoch=s.epoch
   and f.binding_digest=s.binding_digest and f.expires_at>clock_timestamp()and f.consumed_by is null
   and ((f.fault in('LOST_ACK','TRANSIENT','TERMINAL')and input->>'fault_operation'like '%WRITE')or(f.fault in('DISAPPEAR','SUPERSEDE','CONTENTION')and input->>'fault_operation'like '%CLAIM'))
   and exists(select 1 from scoring_authority.competition_recalculation_jobs j where j.tournament_id='2026'
    and j.engine_key=f.engine_key and j.delivery_cycle=f.cycle and j.requested_source_revision=f.source_revision
    and j.status='RUNNING'and exists(select 1 from jsonb_array_elements(i.claim_evidence)v
     where v->>'engine'=j.engine_key and (v->>'cycle')::bigint=j.delivery_cycle
      and (v->>'started_at')::timestamptz=j.started_at
      and (input->>'fault_operation'like '%CLAIM'
       or (input->>'fault_operation'='WORKERS.COMPETITION_WRITE'
        and input#>>'{payload,engine_key}'=j.engine_key
        and (input#>>'{payload,claim_started_at}')::timestamptz=j.started_at)
       or (input->>'fault_operation'='WORKERS.INTELLIGENCE_WRITE'
        and exists(select 1 from jsonb_array_elements(coalesce(input#>'{payload,engines}','[]'::jsonb))engine
         where engine->>'key'=j.engine_key and (engine->>'claim_started_at')::timestamptz=j.started_at)))))
   order by f.plan_id limit 1 for update;
  if not found then return jsonb_build_object('ok',true,'fault',null);end if;
  update production_control.worker_supervisor_faults_v1 set consumed_by=i.invocation_id,consumed_at=clock_timestamp()where plan_id=plan.plan_id;
  return jsonb_build_object('ok',true,'fault',plan.fault,'plan_id',plan.plan_id);
 elsif operation='BARRIER'then
  select * into strict plan from production_control.worker_supervisor_faults_v1 where plan_id=(input->>'plan_id')::uuid;
  if plan.consumed_by<>i.invocation_id then raise exception using errcode='42501',message='SUPERVISOR_FAULT_DENIED';end if;
  return jsonb_build_object('ok',true,'released',plan.released_at is not null or plan.expires_at<=clock_timestamp());
 else raise exception using errcode='42501',message='SUPERVISOR_OPERATION_DENIED';end if;
 return jsonb_build_object('ok',true);
exception when no_data_found or invalid_text_representation then raise exception using errcode='42501',message='SUPERVISOR_REQUEST_DENIED';
end;$function$
$definition$;end if;
 select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef,'lang',prolang)into h,after_meta from pg_proc where oid=(e->>'signature')::regprocedure;
 if h<>e->>'new'or after_meta is distinct from before_meta then raise exception 'MODEL_D_METADATA_DRIFT';end if;
 patch_image:=patch_image||jsonb_build_object(e->>'signature',h);all_meta:=all_meta||jsonb_build_object(e->>'signature',after_meta);
 if exists(select 1 from production_control.certification_model_d_execution_installation_v1 r where r.image<>patch_image or r.metadata<>all_meta)then raise exception 'MODEL_D_RECEIPT_DRIFT';end if;
 insert into production_control.certification_model_d_execution_installation_v1(singleton,image,metadata)values(true,patch_image,all_meta)on conflict(singleton)do nothing;
end;$patch$;
commit;
