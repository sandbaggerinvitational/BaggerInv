-- Resource-local derived execution; domain/lease/retry algorithms are unchanged.
-- Scaffold: SupabaseCLI2.56.1 migration new certification_derived_gateways_v1;
-- mapped to repository ordinal133. No scheduler or provider is installed.
begin;

create function production_control.canonical_execution_resource_id_v1()
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare resource production_control.canonical_resource_v1%rowtype; context jsonb;
begin
 select * into strict resource from production_control.canonical_resource_v1 where singleton;
 if resource.resource_class='PRODUCTION' then return resource.resource_id; end if;
 context:=production_control.current_certification_context_v1();
 if context->>'resource_id' is distinct from resource.resource_id then
  raise exception using errcode='42501',message='CERTIFICATION_DOMAIN_CONTEXT_REQUIRED'; end if;
 return resource.resource_id;
end;
$$;
create function production_control.canonical_execution_activation_revision_v1()
returns bigint language plpgsql security definer set search_path=pg_catalog as $$
declare resource production_control.canonical_resource_v1%rowtype; context jsonb; revision bigint;
begin
 select * into strict resource from production_control.canonical_resource_v1 where singleton;
 if resource.resource_class='PRODUCTION' then
  select activation_revision into strict revision from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION';
  return revision;
 end if;
 context:=production_control.current_certification_context_v1();
 if context->>'resource_id' is distinct from resource.resource_id then
  raise exception using errcode='42501',message='CERTIFICATION_DOMAIN_CONTEXT_REQUIRED'; end if;
 return (context->>'activation_revision')::bigint;
end;
$$;
revoke all on function production_control.canonical_execution_resource_id_v1(),production_control.canonical_execution_activation_revision_v1() from public,anon,authenticated,service_role;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.flush_score_derived_intents_v1(text,text,integer)'::regprocedure),'sha256'),'hex')<>'b978acf2441ec0dc635403fe7a80e71627a6361dde968627572f231184b3e642' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.flush_score_derived_intents_v1(text,text,integer)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.flush_score_derived_intents_v1(target text, family_value text, maximum integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  intent scoring_authority.score_derived_intents_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation uuid;
  activation_revision_value bigint;
  engine text;
  processed integer := 0;
  failed integer := 0;
  error_state text;
  error_states jsonb := '[]'::jsonb;
  current_revision jsonb;
  ready_at timestamptz := clock_timestamp();
  round_lock_number integer;
begin
  if family_value not in ('CALCUTTA', 'NET_SKINS', 'COMPETITION')
     or maximum is null or maximum not between 1 and 8 then
    raise exception using errcode = '22023', message = 'SCORE_DERIVED_INTENT_SCOPE_INVALID';
  end if;
  perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
  select * into strict pointer from production_control.current_tournament_pointer_v1
    where scope_key = production_control.canonical_execution_resource_id_v1();
  if pointer.tournament_id is distinct from target then
    raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_POINTER_CHANGED';
  end if;
  if target = '2026' then
    if not exists (select 1 from scoring_authority.ingress_gates
      where tournament_id = target and state = 'OPEN' and authority = 'SUPABASE') then
      raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_ADMISSION_CLOSED';
    end if;
  else
    select runtime_generation_id into generation
      from production_control.annual_scoring_runtime_authorities_v1
      where tournament_id = target and authority_status = 'ACTIVE' and admission_state = 'OPEN';
    if generation is null then
      raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_RUNTIME_REQUIRED';
    end if;
  end if;
  activation_revision_value:=production_control.canonical_execution_activation_revision_v1();
  -- Canonical round order before any intent or derived job row lock.
  if family_value = 'NET_SKINS' then
    for round_lock_number in 1..3 loop
      if target = '2026' then
        perform pg_advisory_xact_lock(hashtextextended(format(
          'production-net-skins-v1:enqueue:2026:R%s', round_lock_number),
          202608290055));
      else
        perform pg_advisory_xact_lock(hashtextextended(format(
          'production-net-skins-v1:enqueue:%s:%s:R%s', target, generation,
          round_lock_number), 202608300074));
      end if;
    end loop;
  end if;
  for intent in select * from scoring_authority.score_derived_intents_v1 value
    where value.tournament_id = target and value.family = family_value
      and value.status in ('PENDING', 'RETRYABLE') and value.available_at <= ready_at
    order by value.available_at, value.created_at, value.intent_id
    for update skip locked limit maximum
  loop
    begin
      if intent.runtime_generation_id is distinct from generation then
        raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_GENERATION_CHANGED';
      end if;
      if family_value = 'CALCUTTA' then
        if target = '2026' then
          perform production_control.enqueue_score_calcutta_v1(
            intent.reason, 'score-derived-intent-v1', false, null, null);
        else
          perform production_control.enqueue_annual_calcutta_v1(
            target, generation, activation_revision_value,
            intent.reason, 'score-derived-intent-v1', false, null, null);
        end if;
      elsif family_value = 'NET_SKINS' then
        if target = '2026' then
          perform production_control.enqueue_production_net_skins_v1_round(
            intent.round_number, intent.reason, 'score-derived-intent-v1');
        else
          perform production_control.enqueue_annual_net_skins_v1_round(
            target, generation, intent.round_number, intent.reason, 'score-derived-intent-v1');
        end if;
      else
        -- Current canonical authority is read by the existing processors.
        -- This revision is provenance, never an alternative score snapshot.
        select jsonb_build_object('matchId', value.match_id,
          'matchRevision', value.match_revision, 'status', value.status,
          'scorecardComplete', value.scorecard_complete,
          'resultWinner', value.result_winner)
          into current_revision from scoring_authority.matches value
          where value.match_id = intent.match_id and value.tournament_id = target;
        foreach engine in array array['TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES',
          'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL', 'TOURNAMENT_FINAL_RECAP'] loop
          insert into scoring_authority.competition_recalculation_jobs (
            tournament_id, round_number, engine_key, status,
            requested_source_revision, requested_at, started_at, completed_at,
            last_error_code, last_error_safe, runtime_generation_id,
            claim_token, claimed_by, lease_expires_at, updated_at
          ) values (target, 0, engine, 'PENDING', jsonb_build_object(
              'reason', intent.reason, 'revision', coalesce(current_revision, '{}'::jsonb),
              'intentRevision', intent.canonical_revision,
              'transactional', true, 'derivedIntentId', intent.intent_id),
            clock_timestamp(), null, null, null, null, generation,
            null, null, null, clock_timestamp())
          on conflict (tournament_id, round_number, engine_key) do update set
            status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
            requested_at = excluded.requested_at, started_at = null, completed_at = null,
            last_error_code = null, last_error_safe = null,
            runtime_generation_id = excluded.runtime_generation_id,
            claim_token = null, claimed_by = null, lease_expires_at = null,
            updated_at = excluded.updated_at;
        end loop;
      end if;
      update scoring_authority.score_derived_intents_v1 set status = 'SUCCEEDED',
        attempts = attempts + 1, last_sqlstate = null,
        completed_at = clock_timestamp(), updated_at = clock_timestamp()
        where intent_id = intent.intent_id;
      processed := processed + 1;
    exception when query_canceled or others then
      get stacked diagnostics error_state = returned_sqlstate;
      if not error_states ? error_state then
        error_states := error_states || jsonb_build_array(error_state);
      end if;
      update scoring_authority.score_derived_intents_v1
        set attempts = attempts + 1,
          status = case when attempts + 1 >= 5 or not production_control.derived_delivery_retryable_v1(error_state) then 'DEAD_LETTER' else 'RETRYABLE' end,
          last_sqlstate = error_state,
          available_at = clock_timestamp() + production_control.derived_delivery_delay_v1(attempts+1,intent_id::text),
          updated_at = clock_timestamp()
        where intent_id = intent.intent_id;
      failed := failed + 1;
      if error_state='57014' then exit; end if;
    end;
  end loop;
  if processed + failed > 0 then
    raise log 'BAGGER_OPERATIONAL_EVENT %', jsonb_build_object(
      'schema_version', 'score-derived-intent-worker-v1',
      'domain', family_value, 'operation', 'SCORE_DERIVED_INTENT_FLUSH',
      'processed', processed, 'failed', failed, 'maximum', maximum,
      'database_error_classes', error_states,
      'outcome', case when failed > 0 then 'DERIVED_WORK_RETRY_REQUIRED' else 'MATERIALIZED' end);
  end if;
  return jsonb_build_object('processed', processed, 'failed', failed,
    'maximum', maximum, 'family', family_value, 'cancelled', error_states ? '57014');
end;
$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.recover_derived_calcutta_activation_v1(text)'::regprocedure),'sha256'),'hex')<>'bda05d8ca64393b4eb487b1206a73e1f0dc99abba7e57630ec501e0d8e754a8e' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.recover_derived_calcutta_activation_v1(text)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.recover_derived_calcutta_activation_v1(target text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare current_value scoring_authority.calcutta_v1_current%rowtype;
 old_job scoring_authority.calcutta_v1_recalculation_jobs%rowtype; generation uuid; activation bigint;
 source_value text; replacement jsonb; total integer:=0;
begin
 select * into current_value from scoring_authority.calcutta_v1_current where tournament_id=target for update;
 if not found or current_value.configuration_revision=0 or current_value.auction_revision=0 then return 0; end if;
 activation:=production_control.canonical_execution_activation_revision_v1();
 if target<>'2026' then select runtime_generation_id into strict generation from production_control.annual_scoring_runtime_authorities_v1
  where tournament_id=target and authority_status='ACTIVE'; end if;
 -- Only one active Calcutta job exists for a tournament. The indexed probe avoids history.
 select * into old_job from scoring_authority.calcutta_v1_recalculation_jobs
 where tournament_id=target and status in('PENDING','RUNNING') and activation_revision<>activation
  and runtime_generation_id is not distinct from generation
  and (status='PENDING' or lease_expires_at<clock_timestamp())
  and configuration_revision=current_value.configuration_revision and configuration_fingerprint=current_value.configuration_fingerprint
  and auction_revision=current_value.auction_revision and auction_fingerprint=current_value.auction_fingerprint
 for update;
 if not found then return 0; end if;
 source_value:=production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision(target));
 if source_value is distinct from old_job.source_fingerprint then return 0; end if;
 update scoring_authority.calcutta_v1_recalculation_jobs set status='SUPERSEDED',claimed_by=null,claim_token=null,
  lease_expires_at=null,completed_at=clock_timestamp(),updated_at=clock_timestamp() where job_id=old_job.job_id;
 if target='2026' then replacement:=production_control.enqueue_score_calcutta_v1('COMPATIBLE_ACTIVATION_RECOVERY','score-derived-delivery-v1',false,null,null);
 else replacement:=production_control.enqueue_annual_calcutta_v1(target,generation,activation,
  'COMPATIBLE_ACTIVATION_RECOVERY','score-derived-delivery-v1',false,null,null); end if;
 insert into production_control.score_derived_delivery_attempts_v1(tournament_id,family,work_identity,cycle,attempt,
  transition,safe_code,runtime_generation_id,related_work_identity,originating_activation_revision)
 values(target,'CALCUTTA',old_job.job_id::text,old_job.delivery_cycle,old_job.delivery_attempts,'SUPERSEDED',
  'COMPATIBLE_ACTIVATION_REPLACEMENT',generation,replacement->>'job_id',old_job.activation_revision);
 return 1;
end;
$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.enqueue_production_calcutta_v1(text,text,boolean,text,text)'::regprocedure),'sha256'),'hex')<>'4f538710822d6bf65d7052c8f10b08e5a5ab87b7802d0fed2d56437294d89dfa' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.enqueue_production_calcutta_v1(text,text,boolean,text,text)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.enqueue_production_calcutta_v1(reason_value text, requested_by_value text, force_value boolean DEFAULT false, request_fingerprint_value text DEFAULT NULL::text, request_payload_hash_value text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  activation_revision_value bigint;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  current_result scoring_authority.calcutta_v1_result_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  completed_rounds_value integer[];
begin
  activation_revision_value:=production_control.canonical_execution_activation_revision_v1();
  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;
  if not found or current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;

  source_revision_value :=
    production_control.calcutta_v1_source_revision('2026');
  source_fingerprint_value := production_control.calcutta_v1_hash(
    source_revision_value
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'production-calcutta-v1:enqueue:2026', 202608290056
    )
  );

  select value.* into current_result
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and (value.source_fingerprint = source_fingerprint_value or production_control.late_r3_result_compatible_v1(value.result_id,source_fingerprint_value))
    and value.is_current
  limit 1;
  if found and not force_value then
    return pg_catalog.jsonb_build_object(
      'job_id', null,
      'status', 'CURRENT',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'source_fingerprint', source_fingerprint_value,
      'result_revision', current_result.result_revision
    );
  end if;

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.activation_revision = activation_revision_value
    and value.source_fingerprint = source_fingerprint_value
    and value.status in ('PENDING', 'RUNNING')
  order by value.requested_at desc, value.job_id desc
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'status', job_value.status,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'source_fingerprint', job_value.source_fingerprint,
      'result_revision', null
    );
  end if;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'SUPERSEDED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' and status in ('PENDING', 'RUNNING');
  insert into scoring_authority.calcutta_v1_recalculation_jobs (
    tournament_id, configuration_revision_id, configuration_revision,
    configuration_fingerprint, auction_revision_id, auction_revision,
    auction_fingerprint, activation_revision, source_revision,
    source_fingerprint, status, reason, requested_by,
    request_fingerprint, request_payload_hash
  ) values (
    '2026', current_value.configuration_revision_id,
    current_value.configuration_revision,
    current_value.configuration_fingerprint,
    current_value.auction_revision_id, current_value.auction_revision,
    current_value.auction_fingerprint, activation_revision_value,
    source_revision_value, source_fingerprint_value, 'PENDING',
    pg_catalog.left(coalesce(nullif(reason_value, ''),
      'EXPLICIT_RECALCULATION'), 120),
    pg_catalog.left(coalesce(nullif(requested_by_value, ''),
      'production-calcutta-v1'), 160),
    request_fingerprint_value, request_payload_hash_value
  ) returning * into job_value;

  completed_rounds_value :=
    production_control.calcutta_v1_completed_rounds();
  update scoring_authority.calcutta_v1_current
  set state = case
        when current_result.result_id is not null
          and current_result.result_state = 'OFFICIAL'
          and 3 = any(completed_rounds_value) then 'OFFICIAL'
        when current_result.result_id is not null
          and coalesce(pg_catalog.array_length(
            completed_rounds_value, 1
          ), 0) > 0 then 'IN_PROGRESS'
        else 'AUCTION_COMPLETE' end,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  return pg_catalog.jsonb_build_object(
    'job_id', job_value.job_id,
    'status', job_value.status,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'source_fingerprint', job_value.source_fingerprint,
    'result_revision', null
  );
end;
$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text)'::regprocedure),'sha256'),'hex')<>'7211163e5d7572deab21f051b1ca2e104afa1e6a15e9b5711f7ff7917425c3ae' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.enqueue_score_calcutta_v1(reason_value text, requested_by_value text, force_value boolean DEFAULT false, request_fingerprint_value text DEFAULT NULL::text, request_payload_hash_value text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  activation_revision_value bigint;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  current_result scoring_authority.calcutta_v1_result_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  completed_rounds_value integer[];
begin
  activation_revision_value:=production_control.canonical_execution_activation_revision_v1();
  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;
  if not found or current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;

  source_revision_value :=
    production_control.calcutta_v1_source_revision('2026');
  source_fingerprint_value := production_control.calcutta_v1_hash(
    source_revision_value
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'production-calcutta-v1:enqueue:2026', 202608290056
    )
  );

  select value.* into current_result
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.source_fingerprint = source_fingerprint_value
    and value.is_current
  limit 1;
  if found and not force_value then
    return pg_catalog.jsonb_build_object(
      'job_id', null,
      'status', 'CURRENT',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'source_fingerprint', source_fingerprint_value,
      'result_revision', current_result.result_revision
    );
  end if;

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.activation_revision = activation_revision_value
    and value.source_fingerprint = source_fingerprint_value
    and value.status in ('PENDING', 'RUNNING')
  order by value.requested_at desc, value.job_id desc
  limit 1;
  if found then
    update scoring_authority.calcutta_v1_recalculation_jobs set delivery_score_origin=true where job_id=job_value.job_id and source_fingerprint=source_fingerprint_value;
    return pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'status', job_value.status,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'source_fingerprint', job_value.source_fingerprint,
      'result_revision', null
    );
  end if;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'SUPERSEDED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' and status in ('PENDING', 'RUNNING');
  insert into scoring_authority.calcutta_v1_recalculation_jobs (
    tournament_id, configuration_revision_id, configuration_revision,
    configuration_fingerprint, auction_revision_id, auction_revision,
    auction_fingerprint, activation_revision, source_revision,
    source_fingerprint, status, reason, requested_by,
    request_fingerprint, request_payload_hash
  ) values (
    '2026', current_value.configuration_revision_id,
    current_value.configuration_revision,
    current_value.configuration_fingerprint,
    current_value.auction_revision_id, current_value.auction_revision,
    current_value.auction_fingerprint, activation_revision_value,
    source_revision_value, source_fingerprint_value, 'PENDING',
    pg_catalog.left(coalesce(nullif(reason_value, ''),
      'EXPLICIT_RECALCULATION'), 120),
    pg_catalog.left(coalesce(nullif(requested_by_value, ''),
      'production-calcutta-v1'), 160),
    request_fingerprint_value, request_payload_hash_value
  ) returning * into job_value;

  update scoring_authority.calcutta_v1_recalculation_jobs set delivery_score_origin=true where job_id=job_value.job_id and source_fingerprint=source_fingerprint_value;
  completed_rounds_value :=
    production_control.calcutta_v1_completed_rounds();
  update scoring_authority.calcutta_v1_current
  set state = case
        when current_result.result_id is not null
          and current_result.result_state = 'OFFICIAL'
          and 3 = any(completed_rounds_value) then 'OFFICIAL'
        when current_result.result_id is not null
          and coalesce(pg_catalog.array_length(
            completed_rounds_value, 1
          ), 0) > 0 then 'IN_PROGRESS'
        else 'AUCTION_COMPLETE' end,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  return pg_catalog.jsonb_build_object(
    'job_id', job_value.job_id,
    'status', job_value.status,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'source_fingerprint', job_value.source_fingerprint,
    'result_revision', null
  );
end;
$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.capture_derived_delivery_provenance_v1()'::regprocedure),'sha256'),'hex')<>'4e47cac3c630dbe23d33d6d5465cccb5453ce78068edcc7ecfe7f434690fefaf' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.capture_derived_delivery_provenance_v1()'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.capture_derived_delivery_provenance_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare context jsonb;
begin
 if (select resource_class from production_control.canonical_resource_v1 where singleton)='CERTIFICATION' then
  context:=production_control.current_certification_context_v1();
  if new.tournament_id is distinct from context->>'tournament_id' then
   raise exception using errcode='42501',message='CERTIFICATION_DELIVERY_TARGET_MISMATCH'; end if;
  new.handling_activation_revision:=(context->>'activation_revision')::bigint;
  new.handling_release_commit:=context->>'release_commit';
  insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
  values('CERTIFICATION_DERIVED_DELIVERY','DERIVED_DELIVERY',new.tournament_id,
   coalesce(context->>'actor_player_id','certification-derived-worker'),context->>'context_token','RECORDED',
   jsonb_build_object('runtime','CERTIFICATION','resource_id',context->>'resource_id','installation_id',context->>'installation_id',
    'binding_id',context->>'binding_id','operation_request_id',context->>'operation_request_id',
    'delivery_event_id',new.event_id,'family',new.family,'work_identity',new.work_identity,
    'originating_activation_revision',new.originating_activation_revision,
    'handling_activation_revision',new.handling_activation_revision,'handling_release_commit',new.handling_release_commit));
  return new;
 end if;
 select activation_revision,expected_deployment_commit into new.handling_activation_revision,new.handling_release_commit
 from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION';
 return new;
end;
$function$;


create function production_control.assert_canonical_derived_scope_v1(input jsonb, context jsonb)
returns text language plpgsql security definer set search_path=pg_catalog as $$
begin
 if context is null then return production_control.assert_score_derived_delivery_scope_v1(input); end if;
 perform production_control.assert_canonical_scoring_context_v1(input,context,'RUNTIME');
 if context->>'phase' not in('WORKERS','DIRECTOR') or input->>'contract_version' is distinct from 'score-derived-delivery-v1' then
  raise exception using errcode='42501',message='CERTIFICATION_DERIVED_CONTEXT_REQUIRED'; end if;
 return context->>'tournament_id';
end;
$$;
create function production_control.assert_canonical_financial_worker_context_v1(input jsonb, context jsonb, family text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if context is null then
  if family='CALCUTTA' then perform production_control.assert_production_calcutta_v1_runtime(input);
  elsif family='NET_SKINS' then perform production_control.assert_production_net_skins_v1_runtime(input);
  else raise exception using errcode='42501',message='CERTIFICATION_DERIVED_FAMILY_INVALID'; end if;
  return;
 end if;
 perform production_control.assert_canonical_scoring_context_v1(input,context,'RUNTIME');
 if (family='CALCUTTA' and context->>'phase' is distinct from 'WORKERS')
  or (family='NET_SKINS' and context->>'phase' is distinct from 'DIRECTOR') then
  raise exception using errcode='42501',message='CERTIFICATION_DERIVED_CONTEXT_REQUIRED'; end if;
 if input->>'expected_activation_revision' is distinct from context->>'activation_revision' then
  raise exception using errcode='40001',message=case family when 'CALCUTTA' then 'PRODUCTION_CALCUTTA_ACTIVATION_REVISION_CONFLICT' else 'PRODUCTION_NET_SKINS_ACTIVATION_REVISION_CONFLICT' end;
 end if;
end;
$$;
revoke all on function production_control.assert_canonical_derived_scope_v1(jsonb,jsonb),production_control.assert_canonical_financial_worker_context_v1(jsonb,jsonb,text) from public,anon,authenticated,service_role;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='score_derived_delivery_tick_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'12c7784ef6af5f69d8cc4a93b27c91777a12c40265048f99c40fc0b1538cca6b' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: score_derived_delivery_tick_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_score_derived_delivery_tick_v1_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare target text; generation uuid; activation bigint; final_ready boolean:=false; result_value jsonb; total integer:=0; terminal_count integer;
  family_value text; calcutta_current scoring_authority.calcutta_v1_current%rowtype;
  worker text:=btrim(coalesce(input->>'worker_id',''));
begin
  target:=production_control.assert_canonical_derived_scope_v1(input,canonical_context);
  if worker !~ '^[A-Za-z0-9_.:-]{1,160}$' or input->>'operation_id' is null then
    raise exception using errcode='22023',message='DERIVED_DELIVERY_WORKER_REQUIRED';
  end if;
  if target<>'2026' then select runtime_generation_id into strict generation
    from production_control.annual_scoring_runtime_authorities_v1 where tournament_id=target and authority_status='ACTIVE'; end if;
  activation:=production_control.canonical_execution_activation_revision_v1();
  -- One family per transaction. Combining financial and Competition queue locks
  -- here inverts existing match controls and owner Net Skins completion order.
  -- The supported adapter calls all three families in separate RPC transactions.
  family_value:=input->>'materialization_family';
  if family_value is null or family_value not in('NET_SKINS','CALCUTTA','COMPETITION') then
    raise exception using errcode='22023',message='DERIVED_MATERIALIZATION_FAMILY_REQUIRED'; end if;
  -- Preserve123's ordered Net Skins prefix within its isolated transaction.
  begin
    result_value:=production_control.flush_score_derived_intents_v1(target,family_value,8);
    total:=total+coalesce((result_value->>'processed')::integer,0);
    if coalesce((result_value->>'cancelled')::boolean,false) then
      -- The timeout receipt is durable when this RPC commits. Do no more database
      -- traversal after cancellation; incomplete status cannot be mistaken for idle.
      return jsonb_build_object('ok',true,'cancelled',true,'statusIncomplete',true,
        'materialized',total,'pendingAutomatic',1,'blockedAutomatic',0,'activeLeases',0,'terminal',0,
        'ready',jsonb_build_object('CALCUTTA',false,'COMPETITION',false,'INTELLIGENCE',false),
        'work','[]'::jsonb,'waitingOwner',jsonb_build_object('NET_SKINS',0));
    end if;
  end;
  if family_value='CALCUTTA' then perform production_control.recover_derived_calcutta_activation_v1(target); end if;
  -- Existing annual leases plus a bounded expiry for frozen2026 timestamp claims.
  if family_value='COMPETITION' then
  -- Lock the complete bounded marker set before testing a changing lease clock.
  -- This matches controls even if another marker expires while locks are awaited.
  perform 1 from scoring_authority.competition_recalculation_jobs
    where tournament_id=target and round_number=0 and engine_key in
      ('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')
    order by case engine_key when 'TEAM_MOMENTUM' then 1 when 'TOURNAMENT_STORYLINES' then 2
      when 'TOURNAMENT_INTELLIGENCE' then 3 when 'PROJECTION_EDITORIAL' then 4 when 'TOURNAMENT_FINAL_RECAP' then 5 end for update;
  update scoring_authority.competition_recalculation_jobs set status='FAILED',completed_at=clock_timestamp(),
    last_error_code='DERIVED_LEASE_EXPIRED',last_error_safe='Derived work will be retried.',
    claim_token=null,claimed_by=null,lease_expires_at=null
    where tournament_id=target and round_number=0 and engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')
      and runtime_generation_id is not distinct from generation and status='RUNNING'
      and coalesce(lease_expires_at,started_at+interval '90 seconds')<clock_timestamp();
  end if;
  select * into calcutta_current from scoring_authority.calcutta_v1_current where tournament_id=target;
  final_ready:=production_control.derived_final_recap_ready_v1(target);
  select count(*) into terminal_count from (
    (select 1 from scoring_authority.score_derived_intents_v1 where tournament_id=target and status='DEAD_LETTER' limit 101)
    union all (select 1 from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id=target and delivery_dead_letter_at is not null limit 101)
    union all (select 1 from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id=target and delivery_dead_letter_at is not null limit 101)
    union all (select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0 and delivery_dead_letter_at is not null limit 5)
    limit 101
  ) bounded;
  return jsonb_build_object('ok',true,'scope',jsonb_build_object('tournamentId',target,'runtimeGenerationId',generation),
    'cancelled',false,'statusIncomplete',false,'materialized',total,'terminal',terminal_count,'terminalTruncated',terminal_count=101,
    'pendingAutomatic',(select count(*) from (
      (select 1 from scoring_authority.score_derived_intents_v1 where tournament_id=target and runtime_generation_id is not distinct from generation and family in('CALCUTTA','COMPETITION') and status<>'SUCCEEDED' limit 101)
      union all (select 1 from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id=target and runtime_generation_id is not distinct from generation and activation_revision=activation
        and configuration_revision=calcutta_current.configuration_revision and auction_revision=calcutta_current.auction_revision
        and status in('PENDING','RUNNING') limit 1)
      union all (select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0
        and runtime_generation_id is not distinct from generation
        and (engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL')
          or (final_ready and engine_key='TOURNAMENT_FINAL_RECAP')) and status<>'SUCCEEDED' limit 5)
      limit 101)bounded),
    'pendingAutomaticLimit',101,
    'blockedAutomatic',(select count(*) from (
      (select 1 from scoring_authority.score_derived_intents_v1 where tournament_id=target
        and runtime_generation_id is distinct from generation and family in('CALCUTTA','COMPETITION') and status<>'SUCCEEDED' limit 101)
      union all (select 1 from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id=target and status in('PENDING','RUNNING')
        and (runtime_generation_id is distinct from generation or activation_revision<>activation
          or configuration_revision<>calcutta_current.configuration_revision or auction_revision<>calcutta_current.auction_revision) limit 1)
      union all (select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0
        and runtime_generation_id is distinct from generation and (engine_key<>'TOURNAMENT_FINAL_RECAP' or final_ready) and status<>'SUCCEEDED' limit 5)
      limit 101)bounded),'blockedAutomaticLimit',101,
    'activeLeases',(select count(*) from (
      (select 1 from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id=target and runtime_generation_id is not distinct from generation and activation_revision=activation and status='RUNNING' and lease_expires_at>=clock_timestamp() limit 1)
      union all (select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0 and runtime_generation_id is not distinct from generation and status='RUNNING'
        and coalesce(lease_expires_at,started_at+interval '90 seconds')>=clock_timestamp() limit 5)
    )bounded),
    'ready',jsonb_build_object(
      'CALCUTTA',calcutta_current.configuration_revision>0 and calcutta_current.auction_revision>0 and exists(
        select 1 from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id=target
          and runtime_generation_id is not distinct from generation
          and activation_revision=activation
          and configuration_revision=calcutta_current.configuration_revision and auction_revision=calcutta_current.auction_revision
          and (status='PENDING' or(status='RUNNING' and lease_expires_at<clock_timestamp()))
          and delivery_dead_letter_at is null and delivery_available_at<=clock_timestamp()),
      'COMPETITION',exists(select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0 and runtime_generation_id is not distinct from generation
        and engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES') and status in('PENDING','FAILED')
        and delivery_dead_letter_at is null and delivery_available_at<=clock_timestamp()),
      'INTELLIGENCE',exists(select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0 and runtime_generation_id is not distinct from generation
        and (engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL') or (final_ready and engine_key='TOURNAMENT_FINAL_RECAP'))
        and status in('PENDING','FAILED') and delivery_dead_letter_at is null and delivery_available_at<=clock_timestamp())
        and not exists(select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0
          and (engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL') or (final_ready and engine_key='TOURNAMENT_FINAL_RECAP'))
          and (runtime_generation_id is distinct from generation or delivery_dead_letter_at is not null or (delivery_attempts>=5 and status<>'SUCCEEDED')
            or delivery_available_at>clock_timestamp() or(status='RUNNING' and coalesce(lease_expires_at,started_at+interval '90 seconds')>=clock_timestamp())))
        and not exists(select 1 from scoring_authority.competition_recalculation_jobs sibling
          where sibling.tournament_id=target and sibling.round_number=0
            and (sibling.engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL') or(final_ready and sibling.engine_key='TOURNAMENT_FINAL_RECAP'))
            and sibling.requested_source_revision is distinct from (select demand.requested_source_revision
              from scoring_authority.competition_recalculation_jobs demand where demand.tournament_id=target and demand.round_number=0
                and (demand.engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL') or(final_ready and demand.engine_key='TOURNAMENT_FINAL_RECAP'))
                and demand.status in('PENDING','FAILED') order by demand.engine_key limit 1))),
    'waitingPublication',jsonb_build_object('FINAL_RECAP',(select count(*) from scoring_authority.competition_recalculation_jobs
      where tournament_id=target and round_number=0 and engine_key='TOURNAMENT_FINAL_RECAP' and status<>'SUCCEEDED'
        and runtime_generation_id is not distinct from generation and not final_ready)),
    'waitingOwner',jsonb_build_object('NET_SKINS',(select count(*) from scoring_authority.net_skins_v1_recalculation_jobs
      where tournament_id=target and round_number between 1 and 3 and runtime_generation_id is not distinct from generation
        and configuration_revision=(select configuration_revision from scoring_authority.net_skins_v1_configuration_current where tournament_id=target) and status in('PENDING','RUNNING'))),
    'work',coalesce((select jsonb_agg(v) from (
      select 'CALCUTTA'::text as family,job_id::text as key,delivery_cycle as cycle,delivery_attempts as attempt
      from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id=target and status='PENDING'
        and activation_revision=activation and configuration_revision=calcutta_current.configuration_revision and auction_revision=calcutta_current.auction_revision
        and runtime_generation_id is not distinct from generation and delivery_dead_letter_at is null and delivery_available_at<=clock_timestamp()
      union all select case when engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES') then 'COMPETITION' else 'INTELLIGENCE' end,
        engine_key,delivery_cycle,delivery_attempts from scoring_authority.competition_recalculation_jobs
        where tournament_id=target and round_number=0 and (engine_key<>'TOURNAMENT_FINAL_RECAP' or final_ready) and status in('PENDING','FAILED')
        and runtime_generation_id is not distinct from generation and delivery_dead_letter_at is null and delivery_available_at<=clock_timestamp()
      limit 6
    )v),'[]'::jsonb),
    'calcutta',jsonb_build_object('configurationRevision',calcutta_current.configuration_revision,
      'configurationFingerprint',calcutta_current.configuration_fingerprint,'auctionRevision',calcutta_current.auction_revision,
      'auctionFingerprint',calcutta_current.auction_fingerprint));
end;
$function$;
revoke all on function production_control.canonical_score_derived_delivery_tick_v1_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.score_derived_delivery_tick_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_score_derived_delivery_tick_v1_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='fail_score_derived_preclaim_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'6abcd333cc3a0c7e379e7cdf06622883df3f7f9854bcfcd3edeb0dfd564dcd51' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: fail_score_derived_preclaim_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_fail_score_derived_preclaim_v1_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare target text; generation uuid; activation bigint; item jsonb; family_value text:=input->>'family'; table_name text; predicate text; retained jsonb;
  affected integer:=0; code_value text:=left(coalesce(input->>'error_code','DERIVED_INPUT_FAILED'),120);
begin
 target:=production_control.assert_canonical_derived_scope_v1(input,canonical_context);
 if family_value not in('CALCUTTA','COMPETITION','INTELLIGENCE') or jsonb_typeof(input->'work')<>'array'
   or jsonb_array_length(input->'work')>5 or btrim(coalesce(input->>'worker_id',''))='' then
  raise exception using errcode='22023',message='DERIVED_PRECLAIM_SCOPE_REQUIRED'; end if;
 if target<>'2026' then select runtime_generation_id into strict generation from production_control.annual_scoring_runtime_authorities_v1
  where tournament_id=target and authority_status='ACTIVE'; end if;
 activation:=production_control.canonical_execution_activation_revision_v1();
 table_name:=case when family_value='CALCUTTA' then 'calcutta_v1_recalculation_jobs' else 'competition_recalculation_jobs' end;
 predicate:=case when family_value='CALCUTTA' then 'job_id=$2::uuid' else 'engine_key=$2 and round_number=0' end;
 for item in select value from jsonb_array_elements(input->'work') loop
  if item->>'family'<>family_value then continue; end if;
  if family_value='CALCUTTA' and coalesce(item->>'key','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
   raise exception using errcode='22023',message='DERIVED_PRECLAIM_IDENTITY_INVALID'; end if;
  execute format('select to_jsonb(v) from scoring_authority.%I v where tournament_id=$1 and %s
    and status in(''PENDING'',''FAILED'') and delivery_cycle=$3 and delivery_attempts=$4
    and delivery_dead_letter_at is null and delivery_available_at<=clock_timestamp() for update skip locked',table_name,predicate)
   into retained using target,item->>'key',(item->>'cycle')::bigint,(item->>'attempt')::integer;
  if retained is null or nullif(retained->>'runtime_generation_id','')::uuid is distinct from generation then continue; end if;
  if family_value='CALCUTTA' then
   if (retained->>'activation_revision')::bigint is distinct from activation or not exists(
    select 1 from scoring_authority.calcutta_v1_current c where c.tournament_id=target
      and c.configuration_revision=(retained->>'configuration_revision')::bigint
      and c.auction_revision=(retained->>'auction_revision')::bigint) then continue; end if;
  elsif (case when retained->>'engine_key' in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES') then 'COMPETITION'
    when retained->>'engine_key' in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP') then 'INTELLIGENCE' end) is distinct from family_value then continue;
  end if;
  if retained->>'engine_key'='TOURNAMENT_FINAL_RECAP' and not production_control.derived_final_recap_ready_v1(target) then continue; end if;
  execute format('update scoring_authority.%I set status=''RUNNING'',attempts=attempts+1,started_at=clock_timestamp(),
   completed_at=null,claim_token=extensions.gen_random_uuid(),claimed_by=$3,lease_expires_at=clock_timestamp()+interval ''60 seconds''
   where tournament_id=$1 and %s',table_name,predicate) using target,item->>'key',input->>'worker_id';
  execute format('update scoring_authority.%I set status=''FAILED'',completed_at=clock_timestamp(),last_error_code=$3,
   last_error_safe=''Derived input is temporarily unavailable.'',claim_token=null,claimed_by=null,lease_expires_at=null
   where tournament_id=$1 and %s',table_name,predicate) using target,item->>'key',code_value;
  affected:=affected+1;
 end loop;
 return jsonb_build_object('ok',true,'marked',affected);
end;
$function$;
revoke all on function production_control.canonical_fail_score_derived_preclaim_v1_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fail_score_derived_preclaim_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_fail_score_derived_preclaim_v1_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='fail_intelligence_derived_bundle_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'d31ffd2a6b0cde4b5a34685a35da6af49da74e4ca25d89d5df4cc1545a167796' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: fail_intelligence_derived_bundle_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_fail_intelligence_derived_bundle_v1_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare target text; affected integer;
begin
 target:=production_control.assert_canonical_derived_scope_v1(input,canonical_context);
 -- Failure acknowledgement follows the same marker order as claim and controls.
 -- Preserve the existing status, timestamp and token predicates on the UPDATE.
 perform 1 from scoring_authority.competition_recalculation_jobs
   where tournament_id=target and round_number=0 and engine_key in
     ('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')
   order by case engine_key when 'TOURNAMENT_INTELLIGENCE' then 3
     when 'PROJECTION_EDITORIAL' then 4 when 'TOURNAMENT_FINAL_RECAP' then 5 end for update;
 update scoring_authority.competition_recalculation_jobs set status='FAILED',completed_at=clock_timestamp(),
  last_error_code=left(coalesce(input->>'error_code','INTELLIGENCE_CALCULATION_FAILED'),120),
  last_error_safe='Prepared intelligence is temporarily unavailable.',claim_token=null,claimed_by=null,lease_expires_at=null,
  updated_at=clock_timestamp()
 where tournament_id=target and round_number=0 and engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')
  and status='RUNNING' and started_at=(input->>'claim_started_at')::timestamptz
  and (target='2026' or (claim_token=(input->>'claim_token')::uuid and claimed_by=input->>'worker_id'));
 get diagnostics affected=row_count;
 return jsonb_build_object('ok',true,'marked',affected,'superseded',affected=0);
end;
$function$;
revoke all on function production_control.canonical_fail_intelligence_derived_bundle_v1_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fail_intelligence_derived_bundle_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_fail_intelligence_derived_bundle_v1_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='requeue_score_derived_delivery_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'d636c9382970db1ce06040f093439a53854444ee736c593a924a7340235717cd' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: requeue_score_derived_delivery_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_requeue_score_derived_delivery_v1_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare target text; generation uuid; family_value text:=input->>'family'; identity_value text:=input->>'work_identity';
  request_value uuid:=(input->>'request_id')::uuid; table_name text; predicate text; retained jsonb; lookup_identity text;
  expected_cycle bigint:=(input->>'expected_cycle')::bigint;
  expected_attempt integer:=(input->>'expected_attempt')::integer; next_cycle bigint; prior_event bigint;
  request_hash text; prior_hash text; actor_id uuid:=(input#>>'{authorization,auth_user_id}')::uuid;
begin
 target:=production_control.assert_canonical_derived_scope_v1(input,canonical_context);
 if target<>'2026' then select runtime_generation_id into strict generation from production_control.annual_scoring_runtime_authorities_v1
  where tournament_id=target and authority_status='ACTIVE'; end if;
 if target='2026' then perform production_control.assert_production_scoring_actor(input,true);
 else perform production_control.assert_future_production_scoring_actor_v1(input,target,true); end if;
 if request_value is null or identity_value is null or expected_cycle is null or expected_attempt is null
    or length(btrim(coalesce(input->>'reason','')))<3 or length(input->>'reason')>120 then
  raise exception using errcode='22023',message='DERIVED_REQUEUE_IDENTITY_AND_REASON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_value::text,202609280124));
 request_hash:=encode(extensions.digest(jsonb_build_object('target',target,'family',family_value,'identity',identity_value,
   'cycle',expected_cycle,'attempt',expected_attempt,'reason',input->>'reason','actor',actor_id)::text,'sha256'),'hex');
 select event_id,recovery_request_hash into prior_event,prior_hash from production_control.score_derived_delivery_attempts_v1 where recovery_request_id=request_value;
 if found then
  if prior_hash is distinct from request_hash then raise exception using errcode='22023',message='DERIVED_REQUEUE_REQUEST_REUSE_CONFLICT'; end if;
  return jsonb_build_object('ok',true,'idempotent',true,'eventId',prior_event); end if;
 if family_value='INTENT' then
  select to_jsonb(v) into retained from scoring_authority.score_derived_intents_v1 v
   where v.tournament_id=target and v.intent_id=identity_value::uuid for update;
  if retained is null or retained->>'status'<>'DEAD_LETTER' or (retained->>'delivery_cycle')::bigint<>expected_cycle
     or (retained->>'attempts')::integer<>expected_attempt then
   raise exception using errcode='40001',message='DERIVED_REQUEUE_STATE_CHANGED'; end if;
  if nullif(retained->>'runtime_generation_id','')::uuid is distinct from generation then
   raise exception using errcode='55000',message='DERIVED_REQUEUE_GENERATION_CHANGED'; end if;
  next_cycle:=expected_cycle+1;
  update scoring_authority.score_derived_intents_v1 set status='PENDING',attempts=0,last_sqlstate=null,
   available_at=clock_timestamp(),delivery_cycle=next_cycle,updated_at=clock_timestamp() where intent_id=identity_value::uuid;
 else
  table_name:=case family_value when 'CALCUTTA' then 'calcutta_v1_recalculation_jobs'
   when 'NET_SKINS' then 'net_skins_v1_recalculation_jobs' when 'COMPETITION' then 'competition_recalculation_jobs'
   when 'INTELLIGENCE' then 'competition_recalculation_jobs' end;
  if table_name is null then raise exception using errcode='22023',message='DERIVED_REQUEUE_FAMILY_INVALID'; end if;
  if table_name='competition_recalculation_jobs' then
   lookup_identity:=substring(identity_value from length(target)+4);
   if identity_value<>target||':0:'||lookup_identity or lookup_identity not in
      ('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP') then
    raise exception using errcode='22023',message='DERIVED_REQUEUE_IDENTITY_INVALID'; end if;
   predicate:='round_number=0 and engine_key=$2';
  else
   if identity_value !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception using errcode='22023',message='DERIVED_REQUEUE_IDENTITY_INVALID'; end if;
   lookup_identity:=identity_value;
   predicate:='job_id=$2::uuid';
  end if;
  execute format('select to_jsonb(v) from scoring_authority.%I v where tournament_id=$1 and %s for update',table_name,predicate)
   into retained using target,lookup_identity;
  if retained is null or retained->>'status'<>'FAILED' or retained->>'delivery_dead_letter_at' is null
     or (retained->>'delivery_cycle')::bigint<>expected_cycle or (retained->>'delivery_attempts')::integer<>expected_attempt
     or (table_name='competition_recalculation_jobs' and
       (case when retained->>'engine_key' in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES') then 'COMPETITION' else 'INTELLIGENCE' end)<>family_value) then
   raise exception using errcode='40001',message='DERIVED_REQUEUE_STATE_CHANGED'; end if;
  if nullif(retained->>'runtime_generation_id','')::uuid is distinct from generation then
   raise exception using errcode='55000',message='DERIVED_REQUEUE_GENERATION_CHANGED'; end if;
  if family_value='CALCUTTA' and (not exists(select 1 from scoring_authority.calcutta_v1_current c
      where c.tournament_id=target and c.configuration_revision=(retained->>'configuration_revision')::bigint
      and c.configuration_fingerprint=retained->>'configuration_fingerprint'
      and c.auction_revision=(retained->>'auction_revision')::bigint and c.auction_fingerprint=retained->>'auction_fingerprint')
    or retained->>'source_fingerprint' is distinct from production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision(target))) then
   raise exception using errcode='55000',message='DERIVED_REQUEUE_FINANCIAL_SOURCE_CHANGED'; end if;
  if family_value='NET_SKINS' and (not exists(select 1 from scoring_authority.net_skins_v1_configuration_current c
      where c.tournament_id=target and c.configuration_revision=(retained->>'configuration_revision')::bigint)
    or retained->>'source_fingerprint' is distinct from production_control.net_skins_v1_hash(
      production_control.net_skins_v1_round_source_revision(target,(retained->>'round_number')::integer))) then
   raise exception using errcode='55000',message='DERIVED_REQUEUE_FINANCIAL_SOURCE_CHANGED'; end if;
  if retained->>'engine_key'='TOURNAMENT_FINAL_RECAP' and not production_control.derived_final_recap_ready_v1(target) then
   raise exception using errcode='55000',message='DERIVED_FINAL_RECAP_GATE_REQUIRED'; end if;
  next_cycle:=expected_cycle+1;
  execute format('update scoring_authority.%I set status=''PENDING'',completed_at=null,attempts=0,
   delivery_attempts=0,delivery_cycle=$3,delivery_dead_letter_at=null,delivery_error_class=null,
   delivery_available_at=clock_timestamp(),last_error_code=null,last_error_safe=null,updated_at=clock_timestamp()
   where tournament_id=$1 and %s',table_name,predicate) using target,lookup_identity,next_cycle;
 end if;
 insert into production_control.score_derived_delivery_attempts_v1
  (tournament_id,family,work_identity,cycle,attempt,transition,safe_code,recovery_request_id,recovery_request_hash,recovery_actor_id,recovery_reason,runtime_generation_id,originating_activation_revision)
 values(target,family_value,identity_value,next_cycle,0,'REQUEUED','AUTHORIZED_CAUSE_CORRECTION',request_value,request_hash,actor_id,input->>'reason',generation,nullif(retained->>'activation_revision','')::bigint)
 returning event_id into prior_event;
 return jsonb_build_object('ok',true,'idempotent',false,'eventId',prior_event,'cycle',next_cycle);
end;
$function$;
revoke all on function production_control.canonical_requeue_score_derived_delivery_v1_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.requeue_score_derived_delivery_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_requeue_score_derived_delivery_v1_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='claim_production_calcutta_v1_recalculation(jsonb)'::regprocedure),'sha256'),'hex')<>'a2442635c55d2df893a270785b8139e3b35dbef30f9563e4a817641189e3036a' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: claim_production_calcutta_v1_recalculation(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_claim_calcutta_v1_recalculation_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  calculation_input jsonb;
  core_view jsonb;
  current_source jsonb;
  current_source_fingerprint text;
  replacement_job jsonb;
  expected_result_revision bigint;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  lease_seconds_value integer := least(
    300, greatest(
      15, coalesce((input->>'lease_seconds')::integer, 60)
    )
  );
  claim_token_value uuid;
begin
  perform production_control.assert_canonical_financial_worker_context_v1(input,canonical_context,'CALCUTTA');
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_CLAIM', input
  );
  if existing_response is not null then return existing_response; end if;
  if worker_value = '' or pg_catalog.length(worker_value) > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_WORKER_ID_REQUIRED';
  end if;

  perform production_control.flush_score_derived_intents_v1('2026', 'CALCUTTA', 8);
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
  if current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;



  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = case when attempts >= 5 then 'FAILED' else 'PENDING' end,
      claimed_by = null, claim_token = null, lease_expires_at = null,
      completed_at = case when attempts >= 5
        then pg_catalog.now() else null end,
      last_error_code = case when attempts >= 5
        then 'PRODUCTION_CALCUTTA_LEASE_EXHAUSTED' else null end,
      last_error_safe = case when attempts >= 5
        then 'Calcutta recalculation is temporarily unavailable.' else null end,
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and configuration_revision = current_value.configuration_revision
    and configuration_fingerprint = current_value.configuration_fingerprint
    and auction_revision = current_value.auction_revision
    and auction_fingerprint = current_value.auction_fingerprint
    and activation_revision =
      (input->>'expected_activation_revision')::bigint
    and status = 'RUNNING' and lease_expires_at <= pg_catalog.now();

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.activation_revision =
      (input->>'expected_activation_revision')::bigint
    and value.status = 'PENDING' and value.delivery_dead_letter_at is null
    and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp() and value.attempts < 5
  order by value.requested_at, value.job_id
  for update skip locked
  limit 1;

  if not found then
    if exists (
      select 1 from scoring_authority.calcutta_v1_recalculation_jobs value
      where value.tournament_id = '2026'
        and value.configuration_revision = current_value.configuration_revision
        and value.auction_revision = current_value.auction_revision
        and value.status = 'FAILED'
    ) then
      update scoring_authority.calcutta_v1_current
      set state = 'UNAVAILABLE', updated_at = pg_catalog.now()
      where tournament_id = '2026';
    end if;
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_EMPTY',
      'job', null,
      'calculation_input', null,
      'idempotent', false
    );
    perform production_control.store_cutover_receipt(
      'CALCUTTA_V1_CLAIM', input, response_value
    );
    return response_value;
  end if;

  current_source := production_control.calcutta_v1_source_revision('2026');
  current_source_fingerprint := production_control.calcutta_v1_hash(
    current_source
  );
  if current_source_fingerprint <> job_value.source_fingerprint then
    update scoring_authority.calcutta_v1_recalculation_jobs
    set status = 'SUPERSEDED', completed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where job_id = job_value.job_id;
    replacement_job := case when job_value.delivery_score_origin then
      production_control.enqueue_score_calcutta_v1(
      'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value, false, null, null
    )
      else production_control.enqueue_production_calcutta_v1(
      'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value, false, null, null
    ) end;
    select value.* into strict job_value
    from scoring_authority.calcutta_v1_recalculation_jobs value
    where value.job_id = (replacement_job->>'job_id')::uuid
    for update;
  end if;

  claim_token_value := extensions.gen_random_uuid();
  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'RUNNING', attempts = attempts + 1,
      claimed_by = worker_value, claim_token = claim_token_value,
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(secs => lease_seconds_value),
      started_at = pg_catalog.now(), completed_at = null,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id
  returning * into job_value;

  select coalesce(pg_catalog.max(value.result_revision), 0)
    into expected_result_revision
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = '2026';
  select value.* into strict configuration_value
  from scoring_authority.calcutta_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;
  select value.* into strict auction_value
  from scoring_authority.calcutta_v1_auction_fact_revisions value
  where value.auction_revision_id = current_value.auction_revision_id;

  core_view := public.read_leaderboards_core_view('2026');
  core_view := jsonb_set(core_view,'{data,full_net_authority}',production_control.full_net_tournament_v1('2026'));
  if coalesce((core_view->>'ok')::boolean, false) is not true then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_CANONICAL_INPUT_UNAVAILABLE';
  end if;
  calculation_input := pg_catalog.jsonb_build_object(
    'tournament', core_view#>'{data,tournament}',
    'configuration', pg_catalog.jsonb_build_object(
      'tournament_id', '2026',
      'tournament_year', 2026,
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint',
        current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'purchases', auction_value.auction_manifest->'purchases',
      'ownership', auction_value.auction_manifest->'ownership',
      'point_structure',
        configuration_value.configuration_manifest->'point_structure',
      'payout_structure',
        configuration_value.configuration_manifest->'payout_structure',
      'financial_contract',
        configuration_value.configuration_manifest->'financial_contract'
    ),
    'core_view', core_view->'data'
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_CLAIMED',
    'job', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'activation_revision', job_value.activation_revision,
      'source_fingerprint', job_value.source_fingerprint,
      'claim_token', job_value.claim_token,
      'lease_expires_at', job_value.lease_expires_at,
      'expected_result_revision', expected_result_revision
    ),
    'calculation_input', calculation_input,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_CLAIM', input, response_value
  );
  return response_value;
end;
$function$;
revoke all on function production_control.canonical_claim_calcutta_v1_recalculation_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.claim_production_calcutta_v1_recalculation(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$begin return production_control.canonical_claim_calcutta_v1_recalculation_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='complete_production_calcutta_v1_recalculation(jsonb)'::regprocedure),'sha256'),'hex')<>'37c634815bb67fac29c9ea027aeab18bfd54562157a2f5a86ae021281ee7aee2' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: complete_production_calcutta_v1_recalculation(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_complete_calcutta_v1_recalculation_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  current_source jsonb;
  current_source_fingerprint text;
  current_result_revision bigint;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  requested_result_state text := pg_catalog.upper(coalesce(
    input->>'result_state', ''
  ));
  result_state_value text;
  result_payload_value jsonb := input->'result_payload';
  payload_hash_value text;
begin
  perform production_control.assert_canonical_financial_worker_context_v1(input,canonical_context,'CALCUTTA');
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_COMPLETE', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or input->>'engine_version' is distinct from 'calcutta-full-net-v3'
     or requested_result_state not in ('PROVISIONAL', 'OFFICIAL')
     or pg_catalog.jsonb_typeof(coalesce(
       result_payload_value, 'null'::jsonb
     )) <> 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_COMPLETION_INPUT_INVALID';
  end if;
  result_state_value := requested_result_state;

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

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.job_id = job_id_value
  for update;
  if not found or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.configuration_fingerprint <>
       current_value.configuration_fingerprint
     or job_value.auction_revision <> current_value.auction_revision
     or job_value.auction_fingerprint <> current_value.auction_fingerprint
     or job_value.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.now()
     or input->>'expected_source_fingerprint' is distinct from
       job_value.source_fingerprint then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_JOB_LEASE_REQUIRED';
  end if;

  current_source := production_control.calcutta_v1_source_revision('2026');
  current_source_fingerprint := production_control.calcutta_v1_hash(
    current_source
  );
  if current_source_fingerprint <> job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_SOURCE_REVISION_CONFLICT';
  end if;

  payload_hash_value := production_control.calcutta_v1_hash(
    result_payload_value
  );
  perform production_control.validate_production_calcutta_v1_result(
    result_state_value, result_payload_value
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'production-calcutta-v1:result:2026', 202608290056
    )
  );
  select coalesce(pg_catalog.max(value.result_revision), 0)
    into current_result_revision
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = '2026';
  if current_result_revision <>
       coalesce((input->>'expected_result_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_RESULT_REVISION_CONFLICT';
  end if;

  update scoring_authority.calcutta_v1_result_revisions
  set is_current = false, superseded_at = pg_catalog.now()
  where tournament_id = '2026' and is_current;
  insert into scoring_authority.calcutta_v1_result_revisions (
    tournament_id, configuration_revision_id, configuration_revision,
    configuration_fingerprint, auction_revision_id, auction_revision,
    auction_fingerprint, result_revision, job_id, engine_version,
    source_fingerprint, result_state, engine_result_payload, payload_hash,
    is_current, calculated_by, calculated_at
  ) values (
    '2026', job_value.configuration_revision_id,
    job_value.configuration_revision, job_value.configuration_fingerprint,
    job_value.auction_revision_id, job_value.auction_revision,
    job_value.auction_fingerprint, current_result_revision + 1,
    job_value.job_id, 'calcutta-full-net-v3', job_value.source_fingerprint,
    result_state_value, result_payload_value, payload_hash_value,
    true, worker_value, pg_catalog.now()
  ) returning * into result_value;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'SUCCEEDED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      last_error_code = null, last_error_safe = null,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id;
  update scoring_authority.calcutta_v1_current
  set state = case
        when result_state_value = 'OFFICIAL' then 'OFFICIAL'
        when pg_catalog.jsonb_array_length(
          result_payload_value->'completedRounds'
        ) > 0 then 'IN_PROGRESS'
        else 'AUCTION_COMPLETE' end,
      result_revision = result_value.result_revision,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED',
    worker_value, pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'result_revision', result_value.result_revision,
      'result_state', requested_result_state,
      'source_fingerprint', job_value.source_fingerprint,
      'result_fingerprint', payload_hash_value,
      'publication_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED', 'CALCUTTA',
    '2026', worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'configuration_revision', job_value.configuration_revision,
      'auction_revision', job_value.auction_revision,
      'result_revision', result_value.result_revision,
      'result_state', requested_result_state,
      'publication_changed', false
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED',
    'job_id', job_value.job_id,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'result_revision', result_value.result_revision,
    'result_state', requested_result_state,
    'result_fingerprint', payload_hash_value,
    'publication_state', current_value.publication_state,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_COMPLETE', input, response_value
  );
  return response_value;
end;
$function$;
revoke all on function production_control.canonical_complete_calcutta_v1_recalculation_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.complete_production_calcutta_v1_recalculation(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$begin return production_control.canonical_complete_calcutta_v1_recalculation_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='fail_production_calcutta_v1_recalculation(jsonb)'::regprocedure),'sha256'),'hex')<>'e3b25e64f1eb3eefc5e000f72cf2844befcce42a90aba2cdc18bcbac7076a9d9' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: fail_production_calcutta_v1_recalculation(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_fail_calcutta_v1_recalculation_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  error_code_value text := pg_catalog.upper(pg_catalog.left(coalesce(
    nullif(input->>'error_code', ''),
    'PRODUCTION_CALCUTTA_CALCULATION_FAILED'
  ), 120));
  error_safe_value text := pg_catalog.left(coalesce(
    nullif(input->>'error_safe', ''),
    'Calcutta recalculation is temporarily unavailable.'
  ), 300);
begin
  perform production_control.assert_canonical_financial_worker_context_v1(input,canonical_context,'CALCUTTA');
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_FAIL', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or error_code_value !~ '^[A-Z0-9_:-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_FAILURE_INPUT_INVALID';
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

  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.job_id = job_id_value
  for update;
  if not found or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.configuration_fingerprint <>
       current_value.configuration_fingerprint
     or job_value.auction_revision <> current_value.auction_revision
     or job_value.auction_fingerprint <> current_value.auction_fingerprint
     or job_value.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_JOB_LEASE_REQUIRED';
  end if;

  update scoring_authority.calcutta_v1_recalculation_jobs
  set status = 'FAILED', claimed_by = null, claim_token = null,
      lease_expires_at = null, completed_at = pg_catalog.now(),
      last_error_code = error_code_value,
      last_error_safe = error_safe_value, updated_at = pg_catalog.now()
  where job_id = job_value.job_id;
  update scoring_authority.calcutta_v1_current
  set state = 'UNAVAILABLE',
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED', 'CALCUTTA',
    '2026', worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'FAILED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'configuration_revision', job_value.configuration_revision,
      'auction_revision', job_value.auction_revision,
      'source_fingerprint', job_value.source_fingerprint,
      'error_code', error_code_value
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED',
    'job_id', job_value.job_id,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'state', 'UNAVAILABLE',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_FAIL', input, response_value
  );
  return response_value;
end;
$function$;
revoke all on function production_control.canonical_fail_calcutta_v1_recalculation_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fail_production_calcutta_v1_recalculation(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$begin return production_control.canonical_fail_calcutta_v1_recalculation_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='claim_production_net_skins_v1_recalculation(jsonb)'::regprocedure),'sha256'),'hex')<>'70d8836de7710fa9a17920539c3145ed5de7da6a983ad7eb3bba78270cdd7e9f' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: claim_production_net_skins_v1_recalculation(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_claim_net_skins_v1_recalculation_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  calculation_input jsonb;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  lease_seconds_value integer := least(300, greatest(
    15, coalesce((input->>'lease_seconds')::integer, 60)
  ));
  current_source jsonb;
  current_source_fingerprint text;
  expected_result_revision bigint;
  claim_token_value uuid;
begin
  perform production_control.assert_canonical_financial_worker_context_v1(input,canonical_context,'NET_SKINS');
  existing_response := production_control.lookup_cutover_receipt(
    'NET_SKINS_V1_CLAIM', input
  );
  if existing_response is not null then return existing_response; end if;
  if worker_value = '' or pg_catalog.length(worker_value) > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_WORKER_ID_REQUIRED';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  if current_value.state <> 'CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;

  perform production_control.flush_score_derived_intents_v1('2026', 'NET_SKINS', 8);

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = case when attempts >= 5 then 'FAILED' else 'PENDING' end,
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = case when attempts >= 5
        then pg_catalog.now() else null end,
      last_error_code = case when attempts >= 5
        then 'PRODUCTION_NET_SKINS_LEASE_EXHAUSTED' else null end,
      last_error_safe = case when attempts >= 5
        then 'Net Skins recalculation is temporarily unavailable.' else null end,
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and configuration_revision = current_value.configuration_revision
    and status = 'RUNNING'
    and lease_expires_at <= pg_catalog.now();

  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.status = 'PENDING' and value.delivery_dead_letter_at is null
    and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp()
    and value.attempts < 5
  order by value.requested_at, value.round_number
  for update skip locked
  limit 1;

  if not found then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_EMPTY',
      'job', null,
      'calculation_input', null,
      'idempotent', false
    );
    perform production_control.store_cutover_receipt(
      'NET_SKINS_V1_CLAIM', input, response_value
    );
    return response_value;
  end if;

  current_source := production_control.net_skins_v1_round_source_revision(
    '2026', job_value.round_number
  );
  current_source_fingerprint :=
    production_control.net_skins_v1_hash(current_source);
  if current_source_fingerprint <> job_value.source_fingerprint then
    update scoring_authority.net_skins_v1_recalculation_jobs
    set status = 'SUPERSEDED', completed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where job_id = job_value.job_id;
    job_value := production_control.enqueue_production_net_skins_v1_round(
      job_value.round_number, 'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value
    );
    select value.* into job_value
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.job_id = job_value.job_id
    for update;
  end if;

  claim_token_value := extensions.gen_random_uuid();
  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'RUNNING',
      attempts = attempts + 1,
      claimed_by = worker_value,
      claim_token = claim_token_value,
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(secs => lease_seconds_value),
      started_at = pg_catalog.now(),
      completed_at = null,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id
  returning * into job_value;

  select coalesce(pg_catalog.max(value.result_revision), 0)
    into expected_result_revision
  from scoring_authority.net_skins_v1_result_revisions value
  where value.tournament_id = '2026'
    and value.round_number = job_value.round_number;

  calculation_input := public.read_net_skins_input_view('2026');
  calculation_input := jsonb_set(calculation_input,'{data,full_net_authority}',production_control.full_net_tournament_v1('2026'));
  calculation_input := jsonb_set(calculation_input,'{data,net_skins_entry_authority}',production_control.net_skins_entries_projection_v1('2026'));
  if coalesce((calculation_input->>'ok')::boolean, false) is not true then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_UNAVAILABLE';
  end if;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_CLAIMED',
    'job', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'source_fingerprint', job_value.source_fingerprint,
      'claim_token', job_value.claim_token,
      'lease_expires_at', job_value.lease_expires_at,
      'expected_result_revision', expected_result_revision
    ),
    'calculation_input', calculation_input->'data',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'NET_SKINS_V1_CLAIM', input, response_value
  );
  return response_value;
end;
$function$;
revoke all on function production_control.canonical_claim_net_skins_v1_recalculation_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.claim_production_net_skins_v1_recalculation(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$begin return production_control.canonical_claim_net_skins_v1_recalculation_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='complete_production_net_skins_v1_recalculation(jsonb)'::regprocedure),'sha256'),'hex')<>'2f3c88b69d9029415a027d28909ead3f9f66bbb5132f1fdb7cd1a07f637d5c6d' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: complete_production_net_skins_v1_recalculation(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_complete_net_skins_v1_recalculation_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  result_value scoring_authority.net_skins_v1_result_revisions%rowtype;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  result_state_value text := pg_catalog.upper(coalesce(
    input->>'result_state', ''
  ));
  result_payload_value jsonb := input->'result_payload';
  normalized_result_value jsonb;
  payload_hash_value text;
  current_source_value jsonb;
  current_source_fingerprint text;
  current_result_revision bigint;
  expected_result_revision bigint := coalesce(
    (input->>'expected_result_revision')::bigint, -1
  );
begin
  perform production_control.assert_canonical_financial_worker_context_v1(input,canonical_context,'NET_SKINS');
  existing_response := production_control.lookup_cutover_receipt(
    'NET_SKINS_V1_COMPLETE', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or input->>'engine_version' is distinct from 'net-skins-full-net-v2'
     or result_state_value not in ('PROVISIONAL', 'OFFICIAL')
     or pg_catalog.jsonb_typeof(coalesce(
       result_payload_value, 'null'::jsonb
     )) <> 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_COMPLETION_INPUT_INVALID';
  end if;

  perform production_control.lock_net_skins_storylines_v1('2026',input);
  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026'
  for update;
  if current_value.state <> 'CONFIGURED'
     or current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.job_id = job_id_value
  for update;
  if not found
     or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_JOB_LEASE_REQUIRED';
  end if;
  if input->>'source_fingerprint'
       is distinct from job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';
  end if;

  current_source_value :=
    production_control.net_skins_v1_round_source_revision(
      '2026', job_value.round_number
    );
  current_source_fingerprint :=
    production_control.net_skins_v1_hash(current_source_value);
  if current_source_fingerprint <> job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';
  end if;
  if coalesce((result_payload_value->>'round')::integer, 0) <>
       job_value.round_number then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_RESULT_ROUND_MISMATCH';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('production-net-skins-v1:2026:R%s',
        job_value.round_number), 202608290055
    )
  );
  select coalesce(pg_catalog.max(value.result_revision), 0)
    into current_result_revision
  from scoring_authority.net_skins_v1_result_revisions value
  where value.tournament_id = '2026'
    and value.round_number = job_value.round_number;
  if current_result_revision <> expected_result_revision then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_RESULT_REVISION_CONFLICT';
  end if;

  if result_state_value = 'OFFICIAL' then
    normalized_result_value :=
      production_control.normalize_production_net_skins_v1_official_result(
        job_value.round_number, result_payload_value
      );
  else
    normalized_result_value := null;
    if pg_catalog.jsonb_typeof(coalesce(
         result_payload_value->'skins', 'null'::jsonb
       )) <> 'array'
       or pg_catalog.jsonb_typeof(coalesce(
         result_payload_value->'leaderboard', 'null'::jsonb
       )) <> 'array' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_PROVISIONAL_RESULT_INVALID';
    end if;
  end if;
  payload_hash_value := production_control.net_skins_v1_hash(
    result_payload_value
  );

  update scoring_authority.net_skins_v1_result_revisions
  set is_current = false, superseded_at = pg_catalog.now()
  where tournament_id = '2026'
    and round_number = job_value.round_number
    and is_current;

  insert into scoring_authority.net_skins_v1_result_revisions (
    tournament_id, round_number, configuration_revision_id,
    configuration_revision, result_revision, job_id, engine_version,
    configuration_fingerprint, source_fingerprint, result_state,
    engine_result_payload, public_result_payload, payload_hash, is_current,
    calculated_by, calculated_at, published_at
  ) values (
    '2026', job_value.round_number,
    job_value.configuration_revision_id,
    job_value.configuration_revision, current_result_revision + 1,
    job_value.job_id, 'net-skins-full-net-v2',
    job_value.configuration_fingerprint, job_value.source_fingerprint,
    result_state_value, result_payload_value, normalized_result_value,
    payload_hash_value, true, worker_value, pg_catalog.now(),
    case when result_state_value = 'OFFICIAL'
      then pg_catalog.now() else null end
  ) returning * into result_value;

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'SUCCEEDED',
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      last_error_code = null,
      last_error_safe = null,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED',
    worker_value, pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'result_revision', result_value.result_revision,
      'result_state', result_state_value,
      'source_fingerprint', job_value.source_fingerprint,
      'payload_hash', payload_hash_value,
      'published', result_state_value = 'OFFICIAL'
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED', 'NET_SKINS',
    '2026', worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'result_revision', result_value.result_revision,
      'result_state', result_state_value,
      'published', result_state_value = 'OFFICIAL'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED',
    'job_id', job_value.job_id,
    'round_number', job_value.round_number,
    'configuration_revision', job_value.configuration_revision,
    'result_revision', result_value.result_revision,
    'result_state', result_state_value,
    'published', result_state_value = 'OFFICIAL',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'NET_SKINS_V1_COMPLETE', input, response_value
  );
  return response_value;
end;
$function$;
revoke all on function production_control.canonical_complete_net_skins_v1_recalculation_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.complete_production_net_skins_v1_recalculation(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$begin return production_control.canonical_complete_net_skins_v1_recalculation_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='fail_production_net_skins_v1_recalculation(jsonb)'::regprocedure),'sha256'),'hex')<>'991df00d0791df9bede37e3fe44ec9f83b0b4d6ceffc7b17907974148a08cf0a' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: fail_production_net_skins_v1_recalculation(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_fail_net_skins_v1_recalculation_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  error_code_value text := pg_catalog.upper(pg_catalog.left(
    coalesce(nullif(input->>'error_code', ''),
      'PRODUCTION_NET_SKINS_CALCULATION_FAILED'), 120
  ));
  error_safe_value text := pg_catalog.left(coalesce(
    nullif(input->>'error_safe', ''),
    'Net Skins recalculation is temporarily unavailable.'
  ), 300);
begin
  perform production_control.assert_canonical_financial_worker_context_v1(input,canonical_context,'NET_SKINS');
  existing_response := production_control.lookup_cutover_receipt(
    'NET_SKINS_V1_FAIL', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or error_code_value !~ '^[A-Z0-9_:-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_FAILURE_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.job_id = job_id_value
  for update;
  if not found
     or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_JOB_LEASE_REQUIRED';
  end if;

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'FAILED',
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      last_error_code = error_code_value,
      last_error_safe = error_safe_value,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED', 'NET_SKINS',
    '2026', worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'FAILED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'error_code', error_code_value
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED',
    'job_id', job_value.job_id,
    'round_number', job_value.round_number,
    'configuration_revision', job_value.configuration_revision,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'NET_SKINS_V1_FAIL', input, response_value
  );
  return response_value;
end;
$function$;
revoke all on function production_control.canonical_fail_net_skins_v1_recalculation_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fail_production_net_skins_v1_recalculation(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$begin return production_control.canonical_fail_net_skins_v1_recalculation_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.frozen_2026_claim_competition_derived_jobs_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'3529897da990dc903783742d1eb4402b064f8d1d844b36efbcc4e7397ac26bc9' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.frozen_2026_claim_competition_derived_jobs_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_claim_competition_derived_jobs_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_engines text[];
  claims jsonb;
begin
  if canonical_context is not null then
    perform production_control.assert_canonical_scoring_context_v1(input,canonical_context,'RUNTIME');
    if canonical_context->>'phase' is distinct from 'WORKERS' then raise exception using errcode='42501',message='CERTIFICATION_DERIVED_CONTEXT_REQUIRED'; end if;
  end if;
  if (canonical_context is null and pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW')
     or target_tournament = ''
     or pg_catalog.jsonb_typeof(input->'engine_keys') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_CLAIM_REQUIRED'
    );
  end if;
  select coalesce(pg_catalog.array_agg(
    pg_catalog.upper(pg_catalog.btrim(value))
  ), array[]::text[]) into target_engines
  from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value;
  if pg_catalog.cardinality(target_engines) = 0 or exists (
    select 1 from pg_catalog.unnest(target_engines) requested(engine_key)
    where requested.engine_key not in (
      'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES'
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'
    );
  end if;
  with candidates as (
    select value.tournament_id, value.round_number, value.engine_key
    from scoring_authority.competition_recalculation_jobs value
    where value.tournament_id = target_tournament
      and value.round_number = 0
      and value.engine_key = any(target_engines)
      and value.status in ('PENDING', 'FAILED') and value.delivery_dead_letter_at is null
      and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp()
    order by value.engine_key
    for update skip locked
  ), claimed as (
    update scoring_authority.competition_recalculation_jobs value set
      status = 'RUNNING', attempts = value.attempts + 1,
      started_at = pg_catalog.clock_timestamp(), completed_at = null,
      last_error_code = null, last_error_safe = null,
      updated_at = pg_catalog.now()
    from candidates candidate
    where value.tournament_id = candidate.tournament_id
      and value.round_number = candidate.round_number
      and value.engine_key = candidate.engine_key
    returning value.engine_key, value.started_at, value.requested_at,
      value.requested_source_revision, value.attempts
  ) select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'engine_key', engine_key, 'claim_started_at', started_at,
      'requested_at', requested_at,
      'requested_source_revision', requested_source_revision,
      'attempt', attempts
    ) order by engine_key), '[]'::jsonb)
  into claims from claimed;
  return pg_catalog.jsonb_build_object('ok', true, 'claims', claims);
end;
$function$;
revoke all on function production_control.canonical_claim_competition_derived_jobs_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION production_control.frozen_2026_claim_competition_derived_jobs_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_claim_competition_derived_jobs_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.frozen_2026_write_competition_derived_snapshot_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'7ae66018d409d3e8a559d84583408e0a724fbd3c0d6b2835cd92cff4ce2d3df5' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.frozen_2026_write_competition_derived_snapshot_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_write_competition_derived_snapshot_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_round integer := coalesce((input->>'round_number')::integer, 0);
  target_engine text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'engine_key', ''
  )));
  target_engine_version text := pg_catalog.btrim(coalesce(
    input->>'engine_version', ''
  ));
  target_configuration text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'configuration_fingerprint', ''
  )));
  target_source text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'source_fingerprint', ''
  )));
  target_payload_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'payload_hash', ''
  )));
  target_payload jsonb := coalesce(input->'result_payload', 'null'::jsonb);
  target_actor text := pg_catalog.btrim(coalesce(
    input->>'calculated_by', ''
  ));
  target_calculated_at timestamptz := coalesce(
    (input->>'calculated_at')::timestamptz, pg_catalog.now()
  );
  target_started_at timestamptz := coalesce(
    (input->>'started_at')::timestamptz, target_calculated_at
  );
  target_claim_started_at timestamptz :=
    (input->>'claim_started_at')::timestamptz;
  target_duration numeric := greatest(
    0, coalesce((input->>'duration_ms')::numeric, 0)
  );
  snapshot_id uuid;
  run_id uuid;
  logical_replay boolean := false;
  claimed_job scoring_authority.competition_recalculation_jobs%rowtype;
begin
  if canonical_context is not null then
    perform production_control.assert_canonical_scoring_context_v1(input,canonical_context,'RUNTIME');
    if canonical_context->>'phase' is distinct from 'WORKERS' then raise exception using errcode='42501',message='CERTIFICATION_DERIVED_CONTEXT_REQUIRED'; end if;
  end if;
  if (canonical_context is null and pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED'
    );
  end if;
  if target_tournament = '' or target_actor = ''
     or target_engine_version = ''
     or target_engine not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
     or target_configuration !~ '^[0-9a-f]{64}$'
     or target_source !~ '^[0-9a-f]{64}$'
     or target_payload_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(target_payload) <> 'object'
     or target_claim_started_at is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_SNAPSHOT_REQUIRED'
    );
  end if;
  select value.* into claimed_job
  from scoring_authority.competition_recalculation_jobs value
  where value.tournament_id = target_tournament
    and value.round_number = target_round
    and value.engine_key = target_engine and value.status = 'RUNNING'
    and value.started_at = target_claim_started_at
  for update;
  if claimed_job.engine_key is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'STALE_DERIVED_JOB', 'superseded', true
    );
  end if;
  select value.id into snapshot_id
  from scoring_authority.competition_derived_snapshots value
  where value.tournament_id = target_tournament
    and value.round_number = target_round
    and value.engine_key = target_engine
    and value.engine_version = target_engine_version
    and value.configuration_fingerprint = target_configuration
    and value.source_fingerprint = target_source
    and value.payload_hash = target_payload_hash
  limit 1;
  logical_replay := snapshot_id is not null;
  update scoring_authority.competition_derived_snapshots value set
    is_current = false
  where value.tournament_id = target_tournament
    and value.round_number = target_round
    and value.engine_key = target_engine and value.is_current
    and value.id is distinct from snapshot_id;
  if snapshot_id is null then
    insert into scoring_authority.competition_derived_snapshots (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, result_state,
      result_payload, payload_hash, is_current, calculated_at
    ) values (
      target_tournament, target_round, target_engine,
      target_engine_version, target_configuration, target_source,
      'PROVISIONAL', target_payload, target_payload_hash, true,
      target_calculated_at
    ) returning id into snapshot_id;
  else
    update scoring_authority.competition_derived_snapshots value set
      is_current = true, result_payload = target_payload,
      calculated_at = target_calculated_at
    where value.id = snapshot_id;
  end if;
  insert into scoring_authority.competition_derived_runs (
    tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status,
    calculated_by, started_at, completed_at, duration_ms
  ) values (
    target_tournament, target_round, target_engine, target_engine_version,
    target_configuration, target_source, target_payload_hash, 'SUCCEEDED',
    target_actor, target_started_at, target_calculated_at, target_duration
  ) on conflict (
    tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status
  ) do update set
    completed_at = excluded.completed_at,
    duration_ms = excluded.duration_ms,
    calculated_by = excluded.calculated_by
  returning id into run_id;
  update scoring_authority.competition_recalculation_jobs value set
    status = 'SUCCEEDED', requested_source_revision =
      pg_catalog.jsonb_build_object(
        'sourceFingerprint', target_source,
        'configurationFingerprint', target_configuration,
        'payloadHash', target_payload_hash
      ),
    completed_at = pg_catalog.now(), last_error_code = null,
    last_error_safe = null, updated_at = pg_catalog.now()
  where value.tournament_id = target_tournament
    and value.round_number = target_round
    and value.engine_key = target_engine and value.status = 'RUNNING'
    and value.started_at = target_claim_started_at;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target_tournament, target_engine || '_DERIVED_STATE_CALCULATED',
    target_actor, pg_catalog.jsonb_build_object(
      'snapshotId', snapshot_id, 'runId', run_id,
      'sourceFingerprint', target_source,
      'payloadHash', target_payload_hash,
      'engineVersion', target_engine_version,
      'logicalReplay', logical_replay,
      'claimStartedAt', target_claim_started_at
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'snapshot_id', snapshot_id,
    'run_id', run_id, 'logical_replay', logical_replay
  );
end;
$function$;
revoke all on function production_control.canonical_write_competition_derived_snapshot_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION production_control.frozen_2026_write_competition_derived_snapshot_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_write_competition_derived_snapshot_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.frozen_2026_mark_competition_derived_job_failed_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'a46c1820da34d05a5d6fcd89e7c22ab4123651cd0d79a5b395699c20d173e293' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.frozen_2026_mark_competition_derived_job_failed_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_mark_competition_derived_job_failed_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_engine text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'engine_key', ''
  )));
  target_claim timestamptz := (input->>'claim_started_at')::timestamptz;
  updated_count integer := 0;
begin
  if canonical_context is not null then
    perform production_control.assert_canonical_scoring_context_v1(input,canonical_context,'RUNTIME');
    if canonical_context->>'phase' is distinct from 'WORKERS' then raise exception using errcode='42501',message='CERTIFICATION_DERIVED_CONTEXT_REQUIRED'; end if;
  end if;
  if (canonical_context is null and pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW')
     or target_tournament = ''
     or target_engine not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
     or target_claim is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_FAILURE_REQUIRED'
    );
  end if;
  update scoring_authority.competition_recalculation_jobs value set
    status = 'FAILED', completed_at = pg_catalog.now(),
    last_error_code = pg_catalog.left(pg_catalog.btrim(coalesce(
      input->>'error_code', 'DERIVED_CALCULATION_FAILED'
    )), 120),
    last_error_safe = pg_catalog.left(pg_catalog.btrim(coalesce(
      input->>'error_safe',
      'Prepared competition content is temporarily unavailable.'
    )), 400),
    updated_at = pg_catalog.now()
  where value.tournament_id = target_tournament
    and value.round_number = 0 and value.engine_key = target_engine
    and value.status = 'RUNNING' and value.started_at = target_claim;
  get diagnostics updated_count = row_count;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'marked', updated_count = 1,
    'superseded', updated_count = 0
  );
end;
$function$;
revoke all on function production_control.canonical_mark_competition_derived_job_failed_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION production_control.frozen_2026_mark_competition_derived_job_failed_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_mark_competition_derived_job_failed_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.frozen_2026_claim_intelligence_derived_bundle_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'3dfd1f61e8ba03ad4d3de72be8b505cafdc64df856d591b42cfaaa6b7b151d0d' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.frozen_2026_claim_intelligence_derived_bundle_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_claim_intelligence_derived_bundle_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target text := pg_catalog.btrim(coalesce(input->>'tournament_id', ''));
  actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'requested_by', ''
  )), 180);
  claim_time timestamptz := pg_catalog.clock_timestamp();
  key_value text;
begin
  if canonical_context is not null then
    perform production_control.assert_canonical_scoring_context_v1(input,canonical_context,'RUNTIME');
    if canonical_context->>'phase' is distinct from 'WORKERS' then raise exception using errcode='42501',message='CERTIFICATION_DERIVED_CONTEXT_REQUIRED'; end if;
  end if;
  if (canonical_context is null and pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW')
     or target = '' or actor = '' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_INTELLIGENCE_CLAIM_REQUIRED'
    );
  end if;
  if not production_control.intelligence_delivery_ready_v1(target,input->'engine_keys') then
    return jsonb_build_object('ok',true,'empty',true,'code','NO_PENDING_INTELLIGENCE');
  end if;
  for key_value in
    select pg_catalog.upper(pg_catalog.btrim(value))
    from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value
  loop
    if key_value not in (
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'
      );
    end if;
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, requested_at, started_at, updated_at
    ) values (
      target, 0, key_value, 'RUNNING',
      pg_catalog.jsonb_build_object('requestedBy', actor),
      claim_time, claim_time, pg_catalog.now()
    ) on conflict (tournament_id, round_number, engine_key) do update set
      status = 'RUNNING',
      requested_source_revision = scoring_authority.competition_recalculation_jobs.requested_source_revision,
      requested_at = claim_time, started_at = claim_time,
      completed_at = null, last_error_code = null,
      last_error_safe = null, updated_at = pg_catalog.now();
  end loop;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'claim_started_at', claim_time
  );
end;
$function$;
revoke all on function production_control.canonical_claim_intelligence_derived_bundle_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION production_control.frozen_2026_claim_intelligence_derived_bundle_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_claim_intelligence_derived_bundle_core_v2(input,null); end;$function$;

do $check$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.frozen_2026_write_intelligence_derived_bundle_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'852390c7aa81228593e1c98a2884a1268c1bbaca32604bb6ebfb53b536ad8acc' then
  raise exception 'CERTIFICATION_DERIVED_PREDECESSOR_MISMATCH: production_control.frozen_2026_write_intelligence_derived_bundle_v1(jsonb)'; end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_write_intelligence_derived_bundle_core_v2(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_source text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'source_fingerprint', ''
  )));
  target_actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'calculated_by', ''
  )), 180);
  target_duration numeric := greatest(
    0, coalesce((input->>'duration_ms')::numeric, 0)
  );
  engine jsonb;
  target_engine_key text;
  target_engine_version text;
  target_payload jsonb;
  target_payload_hash text;
  target_claim timestamptz;
  snapshot_id uuid;
  written jsonb := '[]'::jsonb;
begin
  if canonical_context is not null then
    perform production_control.assert_canonical_scoring_context_v1(input,canonical_context,'RUNTIME');
    if canonical_context->>'phase' is distinct from 'WORKERS' then raise exception using errcode='42501',message='CERTIFICATION_DERIVED_CONTEXT_REQUIRED'; end if;
  end if;
  if (canonical_context is null and pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW')
     or target_tournament = '' or target_actor = ''
     or target_source !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'engines') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_INTELLIGENCE_BUNDLE_REQUIRED'
    );
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments value
    where value.tournament_id = target_tournament
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_NOT_FOUND'
    );
  end if;
  for engine in
    select value from pg_catalog.jsonb_array_elements(input->'engines') value
  loop
    target_engine_key := pg_catalog.upper(pg_catalog.btrim(coalesce(
      engine->>'key', ''
    )));
    target_engine_version := pg_catalog.btrim(coalesce(
      engine->>'version', ''
    ));
    target_payload := coalesce(engine->'result', 'null'::jsonb);
    target_payload_hash := pg_catalog.lower(pg_catalog.btrim(coalesce(
      engine->>'payload_hash', ''
    )));
    begin
      target_claim := (engine->>'claim_started_at')::timestamptz;
    exception when others then
      target_claim := null;
    end;
    if target_engine_key not in (
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ) or target_engine_version = ''
      or pg_catalog.jsonb_typeof(target_payload) <> 'object'
      or target_payload_hash !~ '^[0-9a-f]{64}$'
      or target_claim is null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'INVALID_INTELLIGENCE_ENGINE_PAYLOAD'
      );
    end if;
    if target_engine_key = 'TOURNAMENT_FINAL_RECAP'
       and coalesce((input#>>'{final_gate,eligible}')::boolean, false)
         is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FINAL_RECAP_GATE_REQUIRED'
      );
    end if;
    if not production_control
      .frozen_2026_intelligence_claim_is_current_v1(
        target_tournament, target_engine_key, target_claim
      ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'STALE_INTELLIGENCE_WORKER',
        'superseded', true, 'engineKey', target_engine_key
      );
    end if;
    select value.id into snapshot_id
    from scoring_authority.competition_derived_snapshots value
    where value.tournament_id = target_tournament
      and value.round_number = 0
      and value.engine_key = target_engine_key
      and value.engine_version = target_engine_version
      and value.source_fingerprint = target_source
      and value.payload_hash = target_payload_hash
    limit 1;
    update scoring_authority.competition_derived_snapshots value set
      is_current = false
    where value.tournament_id = target_tournament
      and value.round_number = 0
      and value.engine_key = target_engine_key and value.is_current
      and value.id is distinct from snapshot_id;
    if snapshot_id is null then
      insert into scoring_authority.competition_derived_snapshots (
        tournament_id, round_number, engine_key, engine_version,
        configuration_fingerprint, source_fingerprint, result_state,
        result_payload, payload_hash, is_current, calculated_at
      ) values (
        target_tournament, 0, target_engine_key, target_engine_version,
        pg_catalog.encode(extensions.digest(
          target_engine_version || ':canonical-supabase-input-v1',
          'sha256'
        ), 'hex'), target_source,
        case when target_engine_key = 'TOURNAMENT_FINAL_RECAP'
          then 'OFFICIAL' else 'PROVISIONAL' end,
        target_payload, target_payload_hash, true, pg_catalog.now()
      ) returning id into snapshot_id;
    else
      update scoring_authority.competition_derived_snapshots value set
        is_current = true, calculated_at = pg_catalog.now()
      where value.id = snapshot_id;
    end if;
    insert into scoring_authority.competition_derived_runs (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash,
      status, calculated_by, started_at, completed_at, duration_ms
    ) values (
      target_tournament, 0, target_engine_key, target_engine_version,
      pg_catalog.encode(extensions.digest(
        target_engine_version || ':canonical-supabase-input-v1',
        'sha256'
      ), 'hex'), target_source, target_payload_hash, 'SUCCEEDED',
      target_actor, target_claim, pg_catalog.now(), target_duration
    ) on conflict (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash, status
    ) do update set
      completed_at = pg_catalog.now(), duration_ms = excluded.duration_ms;
    update scoring_authority.competition_recalculation_jobs value set
      status = 'SUCCEEDED', requested_source_revision =
        pg_catalog.jsonb_build_object(
          'sourceFingerprint', target_source,
          'payloadHash', target_payload_hash
        ),
      completed_at = pg_catalog.now(), updated_at = pg_catalog.now(),
      last_error_code = null, last_error_safe = null
    where value.tournament_id = target_tournament
      and value.round_number = 0 and value.engine_key = target_engine_key
      and value.status = 'RUNNING' and value.started_at = target_claim;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'STALE_INTELLIGENCE_WORKER',
        'superseded', true, 'engineKey', target_engine_key
      );
    end if;
    written := written || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'engineKey', target_engine_key, 'snapshotId', snapshot_id
      )
    );
  end loop;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target_tournament, 'INTELLIGENCE_DERIVED_BUNDLE_CALCULATED',
    target_actor, pg_catalog.jsonb_build_object(
      'sourceFingerprint', target_source,
      'engines', written, 'finalGate', input->'final_gate'
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'written', written, 'final_gate', input->'final_gate'
  );
end;
$function$;
revoke all on function production_control.canonical_write_intelligence_derived_bundle_core_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION production_control.frozen_2026_write_intelligence_derived_bundle_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$begin return production_control.canonical_write_intelligence_derived_bundle_core_v2(input,null); end;$function$;

create function production_control.dispatch_certification_derived_operation_v1(input jsonb, context jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;
begin
 perform production_control.assert_canonical_scoring_context_v1('{}',context,'RUNTIME');
 if jsonb_typeof(payload) is distinct from 'object' or payload ?| array['resource','deployment','authorization','environment',
  'project_ref','project_url','actor_player_id','actor_auth_user_id','auth_user_id','player_id','role','context_token',
  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',
  'admission_revision','governance_tournament_id'] then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;
 if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')
  or (payload ? 'expected_activation_revision' and payload->>'expected_activation_revision' is distinct from context->>'activation_revision')
  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id') then
  raise exception using errcode='40001',message='CERTIFICATION_DERIVED_CONTEXT_STALE'; end if;
 command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id','environment','CERTIFICATION',
  'expected_activation_revision',context->'activation_revision','expected_epoch_id',context->>'authority_epoch_id',
  'operation_id',input->>'operation_request_id','authorization',input->'authorization');
 if operation_id like 'DIRECTOR.%' then
  perform production_control.assert_production_scoring_actor(command,true);
 elsif btrim(coalesce(command->>'worker_id','')) !~ '^[A-Za-z0-9_.:-]{1,160}$' then
  raise exception using errcode='22023',message='DERIVED_DELIVERY_WORKER_REQUIRED';
 end if;
 case operation_id
 when 'WORKERS.DELIVERY_TICK' then
  return production_control.canonical_score_derived_delivery_tick_v1_core_v2(command||jsonb_build_object('contract_version','score-derived-delivery-v1'),context);
 when 'WORKERS.FAIL_PRECLAIM' then
  return production_control.canonical_fail_score_derived_preclaim_v1_core_v2(command||jsonb_build_object('contract_version','score-derived-delivery-v1'),context);
 when 'WORKERS.COMPETITION_CLAIM' then
  perform production_control.flush_score_derived_intents_v1('2026','COMPETITION',8);
  return production_control.canonical_claim_competition_derived_jobs_core_v2(command,context);
 when 'WORKERS.COMPETITION_WRITE' then
  return production_control.canonical_write_competition_derived_snapshot_core_v2(command,context);
 when 'WORKERS.COMPETITION_FAIL' then
  return production_control.canonical_mark_competition_derived_job_failed_core_v2(command,context);
 when 'WORKERS.INTELLIGENCE_CLAIM' then
  perform production_control.flush_score_derived_intents_v1('2026','COMPETITION',8);
  return production_control.canonical_claim_intelligence_derived_bundle_core_v2(command,context);
 when 'WORKERS.INTELLIGENCE_WRITE' then
  return production_control.canonical_write_intelligence_derived_bundle_core_v2(command,context);
 when 'WORKERS.INTELLIGENCE_FAIL' then
  return production_control.canonical_fail_intelligence_derived_bundle_v1_core_v2(command||jsonb_build_object('contract_version','score-derived-delivery-v1'),context);
 when 'WORKERS.CALCUTTA_CLAIM' then
  return production_control.canonical_claim_calcutta_v1_recalculation_core_v2(command,context);
 when 'WORKERS.CALCUTTA_COMPLETE' then
  return production_control.canonical_complete_calcutta_v1_recalculation_core_v2(command,context);
 when 'WORKERS.CALCUTTA_FAIL' then
  return production_control.canonical_fail_calcutta_v1_recalculation_core_v2(command,context);
 when 'DIRECTOR.NET_SKINS_CLAIM' then
  return production_control.canonical_claim_net_skins_v1_recalculation_core_v2(command,context);
 when 'DIRECTOR.NET_SKINS_COMPLETE' then
  return production_control.canonical_complete_net_skins_v1_recalculation_core_v2(command,context);
 when 'DIRECTOR.NET_SKINS_FAIL' then
  return production_control.canonical_fail_net_skins_v1_recalculation_core_v2(command,context);
 when 'DIRECTOR.REQUEUE_DERIVED' then
  if command->>'request_id' is distinct from input->>'operation_request_id' then
   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;
  return production_control.canonical_requeue_score_derived_delivery_v1_core_v2(command||jsonb_build_object('contract_version','score-derived-delivery-v1'),context);
 else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';
 end case;
end;
$$;
revoke all on function production_control.dispatch_certification_derived_operation_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

-- The prior explicit allowlist and domain dispatcher remain the sole entry;
-- no arbitrary RPC/function name is admitted by the additional family branch.
do $extend$
declare definition text; old_body text; new_body text;
begin
 select pg_get_functiondef(oid),prosrc into strict definition,old_body from pg_proc
  where oid='production_control.certification_operation_phase_v1(text,boolean)'::regprocedure;
 new_body:=replace(old_body,E'begin\n',E'begin\n if mutation and operation_id in(''WORKERS.DELIVERY_TICK'',''WORKERS.FAIL_PRECLAIM'',''WORKERS.COMPETITION_CLAIM'',''WORKERS.COMPETITION_WRITE'',''WORKERS.COMPETITION_FAIL'',''WORKERS.INTELLIGENCE_CLAIM'',''WORKERS.INTELLIGENCE_WRITE'',''WORKERS.INTELLIGENCE_FAIL'',''WORKERS.CALCUTTA_CLAIM'',''WORKERS.CALCUTTA_COMPLETE'',''WORKERS.CALCUTTA_FAIL'') then return ''WORKERS''; end if;\n if mutation and operation_id in(''DIRECTOR.NET_SKINS_CLAIM'',''DIRECTOR.NET_SKINS_COMPLETE'',''DIRECTOR.NET_SKINS_FAIL'',''DIRECTOR.REQUEUE_DERIVED'') then return ''DIRECTOR''; end if;\n');
 if new_body=old_body then raise exception 'CERTIFICATION_DERIVED_PHASE_SEAM_MISSING'; end if;
 execute replace(definition,old_body,new_body);
 select pg_get_functiondef(oid),prosrc into strict definition,old_body from pg_proc
  where oid='production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure;
 new_body:=replace(old_body,E'begin\n',E'begin\n if mutation and (operation_id like ''WORKERS.%'' or operation_id in(''DIRECTOR.NET_SKINS_CLAIM'',''DIRECTOR.NET_SKINS_COMPLETE'',''DIRECTOR.NET_SKINS_FAIL'',''DIRECTOR.REQUEUE_DERIVED'')) then\n  return production_control.dispatch_certification_derived_operation_v1(input,context);\n end if;\n');
 if new_body=old_body then raise exception 'CERTIFICATION_DERIVED_DISPATCH_SEAM_MISSING'; end if;
 execute replace(definition,old_body,new_body);
 select pg_get_functiondef(oid),prosrc into strict definition,old_body from pg_proc
  where oid='public.execute_certification_operation_v1(jsonb)'::regprocedure;
 new_body:=replace(old_body,E'context->>''tournament_id'',input#>>''{authorization,player_id}'',',
  E'context->>''tournament_id'',coalesce(input#>>''{authorization,player_id}'',input#>>''{payload,worker_id}'',''certification-derived-worker''),');
 if new_body=old_body then raise exception 'CERTIFICATION_DERIVED_AUDIT_SEAM_MISSING'; end if;
 execute replace(definition,old_body,new_body);
end;
$extend$;
notify pgrst,'reload schema';
commit;
