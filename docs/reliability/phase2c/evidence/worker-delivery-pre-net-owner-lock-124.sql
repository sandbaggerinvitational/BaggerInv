-- Phase2C candidate: bounded autonomous delivery of already-authorized derived work.
-- No score RPC, calculator, approval, publication or canonical trigger changes.
begin;
do $boundary$
begin
  if exists(select 1 from production_control.annual_side_game_runtime_certifications_v1) then
    raise exception using errcode='55000', message='DERIVED_DELIVERY_EXISTING_CERTIFICATION_REQUIRES_REVIEW';
  end if;
  if encode(extensions.digest((select prosrc from pg_proc where oid=
      'production_control.flush_score_derived_intents_v1(text,text,integer)'::regprocedure),'sha256'),'hex')
      <> '658d7c0d742ea872fe7330f7593d3f58a7623bf64916df3b20174c2e312e625e' then
    raise exception 'DERIVED_DELIVERY_REQUIRES_ORDERED_NET_SKINS_123';
  end if;
end;
$boundary$;

-- Constant defaults avoid rewriting historical result/job payloads on installation.
do $columns$
declare name text;
begin
  foreach name in array array['calcutta_v1_recalculation_jobs','net_skins_v1_recalculation_jobs','competition_recalculation_jobs'] loop
    execute format('alter table scoring_authority.%I
      add column delivery_available_at timestamptz not null default ''-infinity'',
      add column delivery_cycle bigint not null default 1 check(delivery_cycle>0),
      add column delivery_attempts integer not null default 0 check(delivery_attempts between 0 and 5),
      add column delivery_dead_letter_at timestamptz,
      add column delivery_error_class text check(delivery_error_class in (''RETRYABLE'',''TERMINAL''))',name);
    execute format('create index %I on scoring_authority.%I(tournament_id,delivery_available_at)
      where status in (''PENDING'',''FAILED'') and delivery_dead_letter_at is null',name||'_delivery_due',name);
    execute format('create index %I on scoring_authority.%I(tournament_id,delivery_dead_letter_at)
      where delivery_dead_letter_at is not null',name||'_delivery_terminal',name);
  end loop;
end;
$columns$;
alter table scoring_authority.calcutta_v1_recalculation_jobs add column delivery_score_origin boolean not null default false;
create index score_derived_intents_terminal_v1 on scoring_authority.score_derived_intents_v1(tournament_id,intent_id)
  where status='DEAD_LETTER';

create table production_control.score_derived_delivery_attempts_v1 (
  event_id bigint generated always as identity primary key,
  tournament_id text not null,
  family text not null check(family in('CALCUTTA','NET_SKINS','COMPETITION','INTELLIGENCE','INTENT')),
  work_identity text not null check(length(work_identity) between 1 and 200),
  cycle bigint not null check(cycle>0),
  attempt integer not null check(attempt between 0 and 5),
  transition text not null check(transition in('RUNNING','SUCCEEDED','RETRYABLE','DEAD_LETTER','SUPERSEDED','REQUEUED')),
  safe_code text check(length(safe_code)<=120),
  worker_id text check(length(worker_id)<=160),
  runtime_generation_id uuid,
  originating_activation_revision bigint,
  handling_activation_revision bigint,
  handling_release_commit text,
  processor_contract text not null default 'score-derived-delivery-v1' check(processor_contract='score-derived-delivery-v1'),
  related_work_identity text check(length(related_work_identity)<=200),
  recorded_at timestamptz not null default clock_timestamp()
);
create index score_derived_delivery_attempts_work_v1 on production_control.score_derived_delivery_attempts_v1
  (tournament_id,family,work_identity,cycle,event_id);
alter table production_control.score_derived_delivery_attempts_v1 enable row level security;
revoke all on production_control.score_derived_delivery_attempts_v1 from public,anon,authenticated,service_role;
revoke all on sequence production_control.score_derived_delivery_attempts_v1_event_id_seq from public,anon,authenticated,service_role;
create function production_control.capture_derived_delivery_provenance_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 select activation_revision,expected_deployment_commit into new.handling_activation_revision,new.handling_release_commit
 from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION';
 return new;
end;
$fn$;
revoke all on function production_control.capture_derived_delivery_provenance_v1() from public,anon,authenticated,service_role;
create trigger capture_derived_delivery_provenance before insert on production_control.score_derived_delivery_attempts_v1
 for each row execute function production_control.capture_derived_delivery_provenance_v1();


create function production_control.derived_delivery_retryable_v1(code text)
returns boolean language sql immutable security definer set search_path=pg_catalog as $fn$
 select upper(coalesce(code,'')) ~ '^(40001|40P01|57014|55P03|08[A-Z0-9]{3})$'
   or upper(coalesce(code,'')) ~ '(TIMEOUT|CONNECTION|TRANSPORT|FETCH_FAILED|LEASE_EXPIRED|ABORTERROR|TIMEOUTERROR)'
$fn$;
create function production_control.derived_delivery_delay_v1(attempt integer,identity_value text)
returns interval language sql immutable security definer set search_path=pg_catalog as $fn$
 select make_interval(secs=>least(300,power(2,greatest(1,least(5,attempt)))::integer
   + (get_byte(extensions.digest(coalesce(identity_value,''),'sha256'),0)%3)))
$fn$;

-- This trigger runs only on derived queues, never on the canonical score tables.
-- Historical events are append-only; a requeue increments the cycle, never erases them.
create function production_control.capture_derived_delivery_transition_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare row_value jsonb; old_value jsonb; family_value text; identity_value text;
  transition_value text; retryable boolean; code_value text;
begin
  row_value:=to_jsonb(new); old_value:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  family_value:=case tg_table_name when 'calcutta_v1_recalculation_jobs' then 'CALCUTTA'
    when 'net_skins_v1_recalculation_jobs' then 'NET_SKINS'
    else case when row_value->>'engine_key' in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES') then 'COMPETITION' else 'INTELLIGENCE' end end;
  identity_value:=coalesce(row_value->>'job_id',concat(new.tournament_id,':',row_value->>'round_number',':',row_value->>'engine_key'));
  if tg_op='UPDATE' and tg_table_name='competition_recalculation_jobs'
      and family_value='INTELLIGENCE' and old.status='RUNNING' and new.status='SUCCEEDED' then
    -- Completion snapshots/runs retain each engine's output fingerprint. Keep
    -- the canonical demand identity here so a later eligible FinalRecap can
    -- safely rejoin successful siblings from that same demand.
    new.requested_source_revision:=old.requested_source_revision;
  end if;
  if tg_op='UPDATE' and new.status='PENDING' and tg_table_name='competition_recalculation_jobs'
      and row_value->'requested_source_revision' is distinct from old_value->'requested_source_revision' then
    new.delivery_cycle:=old.delivery_cycle+1; new.delivery_attempts:=0; new.attempts:=0;
    new.delivery_dead_letter_at:=null; new.delivery_error_class:=null;
    new.delivery_available_at:=clock_timestamp();
  end if;
  if tg_op='UPDATE' and tg_table_name='competition_recalculation_jobs'
      and row_value->>'engine_key' in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')
      and old.status='SUCCEEDED' and new.status='RUNNING' then
    -- The bundle claim already proved distinct pending demand. Rejoining a
    -- successful sibling is a new bounded attempt cycle, never failed-work reset.
    new.delivery_cycle:=old.delivery_cycle+1; new.delivery_attempts:=0;
    new.delivery_available_at:=clock_timestamp();
    code_value:='SUCCESSFUL_SIBLING_REJOINED_BUNDLE';
  end if;
  if new.status='RUNNING' and (tg_op='INSERT' or old_value->>'status'<>'RUNNING'
      or row_value->>'started_at' is distinct from old_value->>'started_at') then
    if new.delivery_dead_letter_at is not null or new.delivery_attempts>=5
       or new.delivery_available_at>clock_timestamp() then
      raise exception using errcode='55P03',message='DERIVED_DELIVERY_NOT_DUE';
    end if;
    new.delivery_attempts:=new.delivery_attempts+1;
    transition_value:='RUNNING';
  elsif tg_op='UPDATE' and old.status='RUNNING' and new.status in('FAILED','PENDING')
      and new.delivery_cycle=old.delivery_cycle then
    code_value:=coalesce(nullif(new.last_error_code,''),'DERIVED_LEASE_EXPIRED');
    retryable:=production_control.derived_delivery_retryable_v1(code_value);
    new.delivery_error_class:=case when retryable then 'RETRYABLE' else 'TERMINAL' end;
    if retryable and new.delivery_attempts<5 then
      new.status:='PENDING'; new.completed_at:=null;
      new.delivery_available_at:=clock_timestamp()+production_control.derived_delivery_delay_v1(new.delivery_attempts,identity_value);
      new.delivery_dead_letter_at:=null; transition_value:='RETRYABLE';
    else
      new.status:='FAILED'; new.completed_at:=clock_timestamp();
      new.delivery_dead_letter_at:=clock_timestamp(); transition_value:='DEAD_LETTER';
    end if;
    new.claim_token:=null; new.claimed_by:=null; new.lease_expires_at:=null;
  elsif tg_op='UPDATE' and new.status in('SUCCEEDED','SUPERSEDED') and old.status is distinct from new.status then
    transition_value:=new.status;
    new.delivery_dead_letter_at:=null; new.delivery_error_class:=null;
  end if;
  if transition_value is not null then
    insert into production_control.score_derived_delivery_attempts_v1
      (tournament_id,family,work_identity,cycle,attempt,transition,safe_code,worker_id,runtime_generation_id,originating_activation_revision)
    values(new.tournament_id,family_value,identity_value,new.delivery_cycle,new.delivery_attempts,
      transition_value,left(code_value,120),left(coalesce(row_value->>'claimed_by',old_value->>'claimed_by'),160),
      nullif(row_value->>'runtime_generation_id','')::uuid,nullif(row_value->>'activation_revision','')::bigint);
  end if;
  return new;
end;
$fn$;
do $triggers$
declare name text;
begin
 foreach name in array array['calcutta_v1_recalculation_jobs','net_skins_v1_recalculation_jobs','competition_recalculation_jobs'] loop
  execute format('create trigger capture_derived_delivery before insert or update on scoring_authority.%I
    for each row execute function production_control.capture_derived_delivery_transition_v1()',name);
 end loop;
end;
$triggers$;

create function production_control.assert_score_derived_delivery_scope_v1(input jsonb)
returns text language plpgsql security definer set search_path=pg_catalog as $fn$
declare target text;
begin
  if input->>'contract_version' is distinct from 'score-derived-delivery-v1' then
    raise exception using errcode='22023',message='DERIVED_DELIVERY_CONTRACT_REQUIRED';
  end if;
  select tournament_id into strict target from production_control.current_tournament_pointer_v1
    where scope_key='BAGGER_INV_PRODUCTION';
  if target='2026' then perform production_control.assert_frozen_2026_derived_worker_v1(input);
  else
    if input->>'annual_scoring_operation' is null or input->>'annual_scoring_operation' not in(
      'score_derived_delivery_tick_v1','fail_score_derived_preclaim_v1','fail_intelligence_derived_bundle_v1','requeue_score_derived_delivery_v1') then
      raise exception using errcode='42501',message='DERIVED_DELIVERY_OPERATION_REQUIRED'; end if;
    perform production_control.assert_future_production_scoring_runtime_v1(input);
    if not exists(select 1 from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION' and workers_enabled)
      or (select production_control.cutover_phase_rank(read_cutover_phase) from production_control.cutover_activation_state
        where scope_key='BAGGER_INV_PRODUCTION')<production_control.cutover_phase_rank('WORKERS') then
      raise exception using errcode='55000',message='PRODUCTION_DERIVED_WORKER_RUNTIME_REQUIRED'; end if;
  end if;
  return target;
end;
$fn$;

-- A scheduling prefilter only. The unchanged JavaScript final gate remains
-- authoritative. Both rows below are current facts, never publication history.
create function production_control.derived_final_recap_ready_v1(target text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $fn$
declare match_count integer; complete boolean;
begin
 select count(*),bool_and(status='FINAL' and scorecard_complete) into match_count,complete
 from scoring_authority.matches where tournament_id=target;
 if match_count<>24 or not coalesce(complete,false) then return false; end if;
 return exists(select 1 from scoring_authority.odds_published_snapshots
  where tournament_id=target and milestone='Final Results' and is_current_for_milestone and publication_verified
    and published_payload->>'phase'='Final Results');
end;
$fn$;
revoke all on function production_control.derived_final_recap_ready_v1(text) from public,anon,authenticated,service_role;

create function public.score_derived_delivery_tick_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare target text; generation uuid; activation bigint; final_ready boolean:=false; result_value jsonb; total integer:=0; terminal_count integer;
  family_value text; calcutta_current scoring_authority.calcutta_v1_current%rowtype;
  worker text:=btrim(coalesce(input->>'worker_id',''));
begin
  target:=production_control.assert_score_derived_delivery_scope_v1(input);
  if worker !~ '^[A-Za-z0-9_.:-]{1,160}$' or input->>'operation_id' is null then
    raise exception using errcode='22023',message='DERIVED_DELIVERY_WORKER_REQUIRED';
  end if;
  if target<>'2026' then select runtime_generation_id into strict generation
    from production_control.annual_scoring_runtime_authorities_v1 where tournament_id=target and authority_status='ACTIVE'; end if;
  select activation_revision into strict activation from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION';
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
$fn$;

create function production_control.intelligence_delivery_ready_v1(target text, engines jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  -- The bundle is one calculation. Acquire its existing bounded rows in key order.
  perform 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0
    and engine_key in(select jsonb_array_elements_text(engines))
    order by case engine_key when 'TEAM_MOMENTUM' then 1 when 'TOURNAMENT_STORYLINES' then 2
      when 'TOURNAMENT_INTELLIGENCE' then 3 when 'PROJECTION_EDITORIAL' then 4 when 'TOURNAMENT_FINAL_RECAP' then 5 end for update;
  if exists(select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0
    and engine_key in(select jsonb_array_elements_text(engines)) and
      (delivery_dead_letter_at is not null or (delivery_attempts>=5 and status<>'SUCCEEDED') or delivery_available_at>clock_timestamp()
       or (status='RUNNING' and coalesce(lease_expires_at,started_at+interval '90 seconds')>=clock_timestamp()))) then return false; end if;
  if exists(select 1 from scoring_authority.competition_recalculation_jobs value where value.tournament_id=target and value.round_number=0
    and value.engine_key in(select jsonb_array_elements_text(engines)) and (
      value.runtime_generation_id is distinct from (select case when target='2026' then null::uuid else a.runtime_generation_id end
        from production_control.current_tournament_pointer_v1 p left join production_control.annual_scoring_runtime_authorities_v1 a
          on a.tournament_id=target and a.authority_status='ACTIVE' where p.scope_key='BAGGER_INV_PRODUCTION')
      or value.requested_source_revision is distinct from (select demand.requested_source_revision
        from scoring_authority.competition_recalculation_jobs demand where demand.tournament_id=target and demand.round_number=0
          and demand.engine_key in(select jsonb_array_elements_text(engines)) and demand.status in('PENDING','FAILED')
        order by demand.engine_key limit 1))) then return false; end if;
  return exists(select 1 from scoring_authority.competition_recalculation_jobs where tournament_id=target and round_number=0
    and engine_key in(select jsonb_array_elements_text(engines)) and status in('PENDING','FAILED'));
end;
$fn$;

create function pg_temp.patch_derived_delivery_v1(signature text,expected_hash text,changes jsonb)
returns void language plpgsql as $fn$
declare definition text; source text; item jsonb; before_attributes jsonb; after_attributes jsonb;
begin
 select pg_get_functiondef(p.oid),p.prosrc,jsonb_build_object('owner',p.proowner,'acl',p.proacl,
   'definer',p.prosecdef,'config',p.proconfig,'volatile',p.provolatile,'parallel',p.proparallel)
 into strict definition,source,before_attributes from pg_proc p where p.oid=signature::regprocedure;
 if encode(extensions.digest(source,'sha256'),'hex')<>expected_hash then raise exception 'DERIVED_DELIVERY_SOURCE_MISMATCH: %',signature; end if;
 for item in select value from jsonb_array_elements(changes) loop
  if (length(definition)-length(replace(definition,item->>0,'')))/length(item->>0)<>1 then
   raise exception 'DERIVED_DELIVERY_PATCH_COUNT_MISMATCH: %',signature; end if;
  definition:=replace(definition,item->>0,item->>1);
 end loop;
 execute definition;
 select jsonb_build_object('owner',p.proowner,'acl',p.proacl,'definer',p.prosecdef,'config',p.proconfig,
   'volatile',p.provolatile,'parallel',p.proparallel) into strict after_attributes
 from pg_proc p where p.oid=signature::regprocedure;
 if before_attributes is distinct from after_attributes then raise exception 'DERIVED_DELIVERY_ATTRIBUTES_CHANGED: %',signature; end if;
end;
$fn$;

-- Source reviewed against installed056+097; only the private score materializer
-- uses exact canonical source equality. Generic compatibility reads are unchanged.
do $score_enqueue$
declare definition text; source text;
begin
 select pg_get_functiondef(oid),prosrc into strict definition,source from pg_proc where oid=
  'production_control.enqueue_production_calcutta_v1(text,text,boolean,text,text)'::regprocedure;
 if encode(extensions.digest(source,'sha256'),'hex')<>'4f538710822d6bf65d7052c8f10b08e5a5ab87b7802d0fed2d56437294d89dfa' then raise exception 'DERIVED_DELIVERY_ENQUEUE_SOURCE_MISMATCH'; end if;
 definition:=replace(definition,'FUNCTION production_control.enqueue_production_calcutta_v1(',
  'FUNCTION production_control.enqueue_score_calcutta_v1(');
 definition:=replace(definition,'and (value.source_fingerprint = source_fingerprint_value or production_control.late_r3_result_compatible_v1(value.result_id,source_fingerprint_value))','and value.source_fingerprint = source_fingerprint_value');
 definition:=replace(definition,E'  if found then\n    return pg_catalog.jsonb_build_object(',
    E'  if found then\n    update scoring_authority.calcutta_v1_recalculation_jobs set delivery_score_origin=true where job_id=job_value.job_id and source_fingerprint=source_fingerprint_value;\n    return pg_catalog.jsonb_build_object(');
 definition:=replace(definition,E'  completed_rounds_value :=',
    E'  update scoring_authority.calcutta_v1_recalculation_jobs set delivery_score_origin=true where job_id=job_value.job_id and source_fingerprint=source_fingerprint_value;\n  completed_rounds_value :=');
 execute definition;
end;
$score_enqueue$;
revoke all on function production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text) from public,anon,authenticated,service_role;

select pg_temp.patch_derived_delivery_v1('public.claim_production_calcutta_v1_recalculation(jsonb)','380f258defe0f8818b4e1e701fa8bce920693c2ee2009ff6195c59d0b1c35bd6',
$changes$[
  [
    "    and value.status = 'PENDING'",
    "    and value.status = 'PENDING' and value.delivery_dead_letter_at is null\n    and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp()"
  ],
  [
    "    replacement_job := production_control.enqueue_production_calcutta_v1(\n      'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value, false, null, null\n    );",
    "    replacement_job := case when job_value.delivery_score_origin then\n      production_control.enqueue_score_calcutta_v1(\n      'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value, false, null, null\n    )\n      else production_control.enqueue_production_calcutta_v1(\n      'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value, false, null, null\n    ) end;"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.claim_production_net_skins_v1_recalculation(jsonb)','60cd42a3ff991528c4dd0a9c31d50171281c19cff3ec03ab088377d27df70273',
$changes$[
  [
    "    and value.status = 'PENDING'",
    "    and value.status = 'PENDING' and value.delivery_dead_letter_at is null\n    and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp()"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.future_production_claim_calcutta_recalculation_v1(jsonb)','14d56a9903584df13d0e0f55e9e27e9622f4f3db6ea78e29da0f88c559af2715',
$changes$[
  [
    "    and value.status = 'PENDING'",
    "    and value.status = 'PENDING' and value.delivery_dead_letter_at is null\n    and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp()"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.future_production_claim_competition_derived_jobs_v1(jsonb)','ad8805f52e950258a504f644f305e0e62ab3982c6c28d1e8491281fbd55081ab',
$changes$[
  [
    "      and value.status in ('PENDING', 'FAILED')",
    "      and value.status in ('PENDING', 'FAILED') and value.delivery_dead_letter_at is null\n      and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp()"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.future_production_claim_intelligence_derived_bundle_v1(jsonb)','91b032510ed073e6029d6bfbc642024d4528279e69cd09d8766760649d4d459b',
$changes$[
  [
    "  foreach key_value in array engine_values loop",
    "  if not production_control.intelligence_delivery_ready_v1(target,input->'engine_keys') then\n    return jsonb_build_object('ok',true,'empty',true,'code','NO_PENDING_INTELLIGENCE');\n  end if;\n  foreach key_value in array engine_values loop"
  ],
  [
    "requested_source_revision = excluded.requested_source_revision,",
    "requested_source_revision = scoring_authority.competition_recalculation_jobs.requested_source_revision,"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.future_production_claim_net_skins_recalculation_v1(jsonb)','ab7f11348f7c52a330d3980a12f6b87a74d9727920fe1248c71c02269f66034c',
$changes$[
  [
    "    and value.status = 'PENDING'",
    "    and value.status = 'PENDING' and value.delivery_dead_letter_at is null\n    and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp()"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('production_control.frozen_2026_claim_competition_derived_jobs_v1(jsonb)','5275392de1be4e1281a18692b8ce930a9e5f91084ca51a543e722cf12d4ce5ab',
$changes$[
  [
    "      and value.status in ('PENDING', 'FAILED')",
    "      and value.status in ('PENDING', 'FAILED') and value.delivery_dead_letter_at is null\n      and value.delivery_attempts<5 and value.delivery_available_at<=clock_timestamp()"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('production_control.frozen_2026_claim_intelligence_derived_bundle_v1(jsonb)','92a1acb2d4d733a240c2fc5a5736da1f2cd095a5ff9b97f4749bc003f75b06dc',
$changes$[
  [
    "  for key_value in\n",
    "  if not production_control.intelligence_delivery_ready_v1(target,input->'engine_keys') then\n    return jsonb_build_object('ok',true,'empty',true,'code','NO_PENDING_INTELLIGENCE');\n  end if;\n  for key_value in\n"
  ],
  [
    "requested_source_revision = excluded.requested_source_revision,",
    "requested_source_revision = scoring_authority.competition_recalculation_jobs.requested_source_revision,"
  ]
]$changes$::jsonb);

-- P2C-NEW-CALCUTTA-CURRENT-JOB-LOCK: existing enqueue/control acquires
-- current before jobs. Claims must first retain121's intent -> current order;
-- completion/failure have no intent locks. No lease/source/result guard changes.

select pg_temp.patch_derived_delivery_v1('public.future_production_fail_calcutta_recalculation_v1(jsonb)','9ff5d3beec4c05f828179ba25e67469daa11e7b32b2978bc61ad77d6ad83f22d',
$changes$[
  [
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = target;",
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = target\n  for update;"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.future_production_complete_calcutta_recalculation_v1(jsonb)','7c1bfa346fe1a39e76878074fc9416814381031117d2a4c9c0adb7e3fa83b4bf',
$changes$[
  [
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = target;",
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = target\n  for update;"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.future_production_claim_calcutta_recalculation_v1(jsonb)','016f209070afad58d8ba894968e345f628d2ad5c718fcafa0da54ca9386384c5',
$changes$[
  [
    "  perform production_control.flush_score_derived_intents_v1(target, 'CALCUTTA', 8);",
    ""
  ],
  [
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = target;",
    "  perform production_control.flush_score_derived_intents_v1(target, 'CALCUTTA', 8);\n  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = target\n  for update;"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.complete_production_calcutta_v1_recalculation(jsonb)','68083bda8241546d6f5dc1f557b9001b3e41afba067632e416c3358a0e9b8092',
$changes$[
  [
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026';",
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026'\n  for update;"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.claim_production_calcutta_v1_recalculation(jsonb)','ef3ae390187f047d3d6d61eb01b1c55686467c072d3d3350b10c50086c2b56a3',
$changes$[
  [
    "  perform production_control.flush_score_derived_intents_v1('2026', 'CALCUTTA', 8);",
    ""
  ],
  [
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026';",
    "  perform production_control.flush_score_derived_intents_v1('2026', 'CALCUTTA', 8);\n  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026'\n  for update;"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('public.fail_production_calcutta_v1_recalculation(jsonb)','d3a773b28febf2b315fc4029916b94ed17da5268f021455e3bff4e671787aa45',
$changes$[
  [
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026';",
    "  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026'\n  for update;"
  ]
]$changes$::jsonb);

select pg_temp.patch_derived_delivery_v1('production_control.flush_score_derived_intents_v1(text,text,integer)','658d7c0d742ea872fe7330f7593d3f58a7623bf64916df3b20174c2e312e625e',
$changes$[
  [
    "perform production_control.enqueue_production_calcutta_v1(",
    "perform production_control.enqueue_score_calcutta_v1("
  ],
  [
    "status = case when attempts + 1 >= 5 then 'DEAD_LETTER' else 'RETRYABLE' end",
    "status = case when attempts + 1 >= 5 or not production_control.derived_delivery_retryable_v1(error_state) then 'DEAD_LETTER' else 'RETRYABLE' end"
  ],
  [
    "available_at = clock_timestamp() + make_interval(secs => least(300, power(2, attempts + 1)::integer))",
    "available_at = clock_timestamp() + production_control.derived_delivery_delay_v1(attempts+1,intent_id::text)"
  ],
  [
    "    exception when others then",
    "    exception when query_canceled or others then"
  ],
  [
    "      failed := failed + 1;",
    "      failed := failed + 1;\n      if error_state='57014' then exit; end if;"
  ],
  [
    "    'maximum', maximum, 'family', family_value);",
    "    'maximum', maximum, 'family', family_value, 'cancelled', error_states ? '57014');"
  ]
]$changes$::jsonb);

alter table scoring_authority.score_derived_intents_v1 add column delivery_cycle bigint not null default 1 check(delivery_cycle>0);
create function production_control.capture_derived_intent_attempt_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 insert into production_control.score_derived_delivery_attempts_v1
  (tournament_id,family,work_identity,cycle,attempt,transition,safe_code,worker_id,runtime_generation_id)
 values(new.tournament_id,'INTENT',new.intent_id::text,new.delivery_cycle,new.attempts,
  case new.status when 'SUCCEEDED' then 'SUCCEEDED' when 'DEAD_LETTER' then 'DEAD_LETTER' else 'RETRYABLE' end,
  new.last_sqlstate,'score-derived-intent-worker-v1',new.runtime_generation_id);
 return new;
end;
$fn$;
revoke all on function production_control.capture_derived_intent_attempt_v1() from public,anon,authenticated,service_role;
create trigger capture_derived_intent_attempt after update on scoring_authority.score_derived_intents_v1
 for each row when(new.attempts>old.attempts) execute function production_control.capture_derived_intent_attempt_v1();

alter table production_control.score_derived_delivery_attempts_v1 add column recovery_request_id uuid unique,
 add column recovery_request_hash text check(recovery_request_hash ~ '^[a-f0-9]{64}$'),
 add column recovery_actor_id uuid,
 add column recovery_reason text check(length(recovery_reason) between 3 and 120);

create function public.requeue_score_derived_delivery_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare target text; generation uuid; family_value text:=input->>'family'; identity_value text:=input->>'work_identity';
  request_value uuid:=(input->>'request_id')::uuid; table_name text; predicate text; retained jsonb; lookup_identity text;
  expected_cycle bigint:=(input->>'expected_cycle')::bigint;
  expected_attempt integer:=(input->>'expected_attempt')::integer; next_cycle bigint; prior_event bigint;
  request_hash text; prior_hash text; actor_id uuid:=(input#>>'{authorization,auth_user_id}')::uuid;
begin
 target:=production_control.assert_score_derived_delivery_scope_v1(input);
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
$fn$;

create function public.fail_intelligence_derived_bundle_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare target text; affected integer;
begin
 target:=production_control.assert_score_derived_delivery_scope_v1(input);
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
$fn$;

create function public.fail_score_derived_preclaim_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare target text; generation uuid; activation bigint; item jsonb; family_value text:=input->>'family'; table_name text; predicate text; retained jsonb;
  affected integer:=0; code_value text:=left(coalesce(input->>'error_code','DERIVED_INPUT_FAILED'),120);
begin
 target:=production_control.assert_score_derived_delivery_scope_v1(input);
 if family_value not in('CALCUTTA','COMPETITION','INTELLIGENCE') or jsonb_typeof(input->'work')<>'array'
   or jsonb_array_length(input->'work')>5 or btrim(coalesce(input->>'worker_id',''))='' then
  raise exception using errcode='22023',message='DERIVED_PRECLAIM_SCOPE_REQUIRED'; end if;
 if target<>'2026' then select runtime_generation_id into strict generation from production_control.annual_scoring_runtime_authorities_v1
  where tournament_id=target and authority_status='ACTIVE'; end if;
 select activation_revision into strict activation from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION';
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
$fn$;


create function public.future_production_score_derived_delivery_tick_v1(input jsonb)
returns jsonb language sql security definer set search_path=pg_catalog as $fn$
 select public.score_derived_delivery_tick_v1(input)
$fn$;
revoke all on function public.future_production_score_derived_delivery_tick_v1(jsonb) from public,anon,authenticated,service_role;
create function public.future_production_requeue_score_derived_delivery_v1(input jsonb)
returns jsonb language sql security definer set search_path=pg_catalog as $fn$
 select public.requeue_score_derived_delivery_v1(input)
$fn$;
revoke all on function public.future_production_requeue_score_derived_delivery_v1(jsonb) from public,anon,authenticated,service_role;
create function public.future_production_fail_intelligence_derived_bundle_v1(input jsonb)
returns jsonb language sql security definer set search_path=pg_catalog as $fn$
 select public.fail_intelligence_derived_bundle_v1(input)
$fn$;
revoke all on function public.future_production_fail_intelligence_derived_bundle_v1(jsonb) from public,anon,authenticated,service_role;
create function public.future_production_fail_score_derived_preclaim_v1(input jsonb)
returns jsonb language sql security definer set search_path=pg_catalog as $fn$
 select public.fail_score_derived_preclaim_v1(input)
$fn$;
revoke all on function public.future_production_fail_score_derived_preclaim_v1(jsonb) from public,anon,authenticated,service_role;

-- A compatible release never transfers an old lease. Equal canonical/configuration/
-- auction/generation facts permit only an atomic supersede + current-authority enqueue.
create function production_control.recover_derived_calcutta_activation_v1(target text)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare current_value scoring_authority.calcutta_v1_current%rowtype;
 old_job scoring_authority.calcutta_v1_recalculation_jobs%rowtype; generation uuid; activation bigint;
 source_value text; replacement jsonb; total integer:=0;
begin
 select * into current_value from scoring_authority.calcutta_v1_current where tournament_id=target for update;
 if not found or current_value.configuration_revision=0 or current_value.auction_revision=0 then return 0; end if;
 select activation_revision into strict activation from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION';
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
$fn$;
revoke all on function production_control.recover_derived_calcutta_activation_v1(text) from public,anon,authenticated,service_role;

-- All public delivery entrypoints remain service-only and retain current runtime
-- assertions. Requeue additionally verifies an actual active Director identity.
insert into production_control.annual_scoring_rpc_allowlist_v1
 (operation_name,target_rpc,required_phase,operation_class,required_worker) values
 ('score_derived_delivery_tick_v1','public.future_production_score_derived_delivery_tick_v1','WORKERS','MUTATION',null),
 ('fail_score_derived_preclaim_v1','public.future_production_fail_score_derived_preclaim_v1','WORKERS','MUTATION',null),
 ('requeue_score_derived_delivery_v1','public.future_production_requeue_score_derived_delivery_v1','WORKERS','MUTATION',null),
 ('fail_intelligence_derived_bundle_v1','public.future_production_fail_intelligence_derived_bundle_v1','WORKERS','MUTATION',null);
do $privileges$
declare sig text;
begin
 foreach sig in array array[
  'production_control.derived_delivery_retryable_v1(text)',
  'production_control.derived_delivery_delay_v1(integer,text)',
  'production_control.capture_derived_delivery_transition_v1()',
  'production_control.assert_score_derived_delivery_scope_v1(jsonb)',
  'production_control.intelligence_delivery_ready_v1(text,jsonb)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',sig);
 end loop;
 foreach sig in array array['public.score_derived_delivery_tick_v1(jsonb)','public.fail_score_derived_preclaim_v1(jsonb)',
  'public.requeue_score_derived_delivery_v1(jsonb)','public.fail_intelligence_derived_bundle_v1(jsonb)'] loop
  execute format('revoke all on function %s from public,anon,authenticated',sig);
  execute format('grant execute on function %s to service_role',sig);
 end loop;
end;
$privileges$;

alter function production_control.annual_side_game_implementation_manifest_v1()
 rename to annual_side_game_implementation_manifest_pre_delivery_v1;
create function production_control.annual_side_game_implementation_manifest_v1()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $fn$
declare baseline jsonb; helper_manifest jsonb; queue_manifest jsonb; table_manifest jsonb; required_count integer; valid_count integer;
begin
 baseline:=production_control.annual_side_game_implementation_manifest_pre_delivery_v1();
 select jsonb_agg(jsonb_build_object('signature',signature,'source',p.prosrc,'acl',p.proacl,
   'definer',p.prosecdef,'configuration',p.proconfig) order by signature),count(*),
   count(*) filter(where p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[]
    and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    and (has_function_privilege('service_role',p.oid,'EXECUTE')=is_public))
 into helper_manifest,required_count,valid_count from (values
  ('production_control.derived_final_recap_ready_v1(text)',false),
  ('production_control.capture_derived_delivery_provenance_v1()',false),
  ('production_control.capture_derived_intent_attempt_v1()',false),
  ('production_control.recover_derived_calcutta_activation_v1(text)',false),
  ('production_control.derived_delivery_retryable_v1(text)',false),
  ('production_control.derived_delivery_delay_v1(integer,text)',false),
  ('production_control.capture_derived_delivery_transition_v1()',false),
  ('production_control.assert_score_derived_delivery_scope_v1(jsonb)',false),
  ('production_control.intelligence_delivery_ready_v1(text,jsonb)',false),
  ('production_control.annual_side_game_implementation_manifest_pre_delivery_v1()',false),
  ('public.future_production_score_derived_delivery_tick_v1(jsonb)',false),
  ('public.future_production_requeue_score_derived_delivery_v1(jsonb)',false),
  ('public.future_production_fail_intelligence_derived_bundle_v1(jsonb)',false),
  ('public.future_production_fail_score_derived_preclaim_v1(jsonb)',false),
  ('public.score_derived_delivery_tick_v1(jsonb)',true),
  ('public.fail_score_derived_preclaim_v1(jsonb)',true),
  ('public.requeue_score_derived_delivery_v1(jsonb)',true),
  ('public.fail_intelligence_derived_bundle_v1(jsonb)',true)
 )required(signature,is_public) left join pg_proc p on p.oid=to_regprocedure(signature);
 if required_count<>18 or valid_count<>18 then raise exception 'DERIVED_DELIVERY_HELPER_SECURITY_REQUIRED'; end if;
 -- The clone preserves its reviewed predecessor search_path and all other attributes.
 if has_function_privilege('service_role','production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text)','EXECUTE')
  or has_function_privilege('anon','production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text)','EXECUTE')
  or has_function_privilege('authenticated','production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text)','EXECUTE') then
  raise exception 'DERIVED_DELIVERY_PRIVATE_ENQUEUE_REQUIRED'; end if;
 select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'acl',c.relacl,
  'columns',(select jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'notNull',attnotnull)
    order by attnum) from pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped),
  'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid=c.oid),
  'indexes',(select jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text) from pg_index where indrelid=c.oid),
  'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid=c.oid and not tgisinternal)) order by c.relname)
 into queue_manifest from pg_class c where c.oid in('scoring_authority.calcutta_v1_recalculation_jobs'::regclass,
  'scoring_authority.net_skins_v1_recalculation_jobs'::regclass,'scoring_authority.competition_recalculation_jobs'::regclass,
  'scoring_authority.score_derived_intents_v1'::regclass);
 select jsonb_build_object('rls',relrowsecurity,'acl',relacl,
  'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
     'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
     where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid=c.oid),
  'indexes',(select jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text) from pg_index where indrelid=c.oid),
  'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid=c.oid and not tgisinternal),
  'sequenceAcl',(select relacl from pg_class where oid='production_control.score_derived_delivery_attempts_v1_event_id_seq'::regclass))
 into table_manifest from pg_class c
 where c.oid='production_control.score_derived_delivery_attempts_v1'::regclass and relrowsecurity
  and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
 if table_manifest is null then raise exception 'DERIVED_DELIVERY_ATTEMPT_SECURITY_REQUIRED'; end if;
 return baseline||jsonb_build_object('scoreDerivedDeliveryContract','score-derived-delivery-v1',
  'scoreDerivedDeliveryHelpers',helper_manifest,'scoreDerivedDeliveryQueues',queue_manifest,
  'scoreDerivedDeliveryAttempts',table_manifest,'scoreDerivedCalcuttaWorkerLocks',
  (select jsonb_agg(jsonb_build_object('signature',signature,'source',p.prosrc,'acl',p.proacl,
    'owner',p.proowner,'definer',p.prosecdef,'configuration',p.proconfig) order by signature)
   from (values
    ('public.claim_production_calcutta_v1_recalculation(jsonb)'),
    ('public.complete_production_calcutta_v1_recalculation(jsonb)'),
    ('public.fail_production_calcutta_v1_recalculation(jsonb)'),
    ('public.future_production_claim_calcutta_recalculation_v1(jsonb)'),
    ('public.future_production_complete_calcutta_recalculation_v1(jsonb)'),
    ('public.future_production_fail_calcutta_recalculation_v1(jsonb)')
   ) required(signature) join pg_proc p on p.oid=signature::regprocedure),
  'scoreDerivedCurrentEnqueue',
  (select jsonb_build_object('source',prosrc,'acl',proacl,'definer',prosecdef,'configuration',proconfig)
   from pg_proc where oid='production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text)'::regprocedure));
end;
$fn$;
revoke all on function production_control.annual_side_game_implementation_manifest_v1() from public,anon,authenticated,service_role;
revoke all on function production_control.annual_side_game_implementation_manifest_pre_delivery_v1() from public,anon,authenticated,service_role;
drop function pg_temp.patch_derived_delivery_v1(text,text,jsonb);
commit;
