-- Owner-authorized one-job recovery. Installation does not claim/rebind a job.
begin;
do $repair$
declare d text;
begin
  d := pg_get_functiondef('public.claim_production_calcutta_v1_recalculation(jsonb)'::regprocedure);
  if (length(d)-length(replace(d,'pg_catalog.least(','')))/length('pg_catalog.least(') <> 1
     or (length(d)-length(replace(d,'pg_catalog.greatest(','')))/length('pg_catalog.greatest(') <> 1 then
    raise exception 'PRODUCTION_CALCUTTA_CLAIM_REPAIR_SOURCE_MISMATCH';
  end if;
  execute replace(replace(d,'pg_catalog.least(','least('),'pg_catalog.greatest(','greatest(');
end $repair$;

create table production_control.calcutta_exact_job_recoveries_v1 (
  recovery_id uuid primary key default extensions.gen_random_uuid(),
  job_id uuid not null unique references scoring_authority.calcutta_v1_recalculation_jobs(job_id),
  prior_activation bigint not null,
  new_activation bigint not null check(new_activation > prior_activation),
  auction_revision bigint not null,
  publication_revision bigint not null,
  pre_state_hash text not null check(pre_state_hash ~ '^[a-f0-9]{64}$'),
  post_state_hash text not null check(post_state_hash ~ '^[a-f0-9]{64}$'),
  director_player_id text not null,
  director_auth_user_id uuid not null,
  release_plan_hash text not null,
  reason_code text not null check(reason_code='STRANDED_PENDING_JOB_AFTER_PROTECTED_RELEASE'),
  recovered_at timestamptz not null default clock_timestamp(),
  response jsonb not null
);
alter table production_control.calcutta_exact_job_recoveries_v1 enable row level security;
revoke all on production_control.calcutta_exact_job_recoveries_v1 from public,anon,authenticated,service_role;
create function production_control.reject_calcutta_recovery_evidence_mutation_v1() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'PRODUCTION_CALCUTTA_RECOVERY_EVIDENCE_IMMUTABLE'; end $$;
create trigger calcutta_recovery_evidence_immutable before update or delete or truncate
on production_control.calcutta_exact_job_recoveries_v1 for each statement
execute function production_control.reject_calcutta_recovery_evidence_mutation_v1();
revoke all on function production_control.reject_calcutta_recovery_evidence_mutation_v1() from public,anon,authenticated,service_role;

-- Protected operator only: no public RPC, no runtime grant, no Director UI action.
create function production_control.carry_forward_exact_calcutta_job_v1(input jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,production_control,scoring_authority
set timezone='UTC' as $$
declare
  a production_control.cutover_activation_state%rowtype;
  h production_control.postcutover_normal_release_head%rowtype;
  c scoring_authority.calcutta_v1_current%rowtype;
  j scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  auction scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication scoring_authority.calcutta_v1_publication_revisions%rowtype;
  prior production_control.calcutta_exact_job_recoveries_v1%rowtype;
  pre_hash text; post_hash text; response_value jsonb;
  recovery uuid := extensions.gen_random_uuid();
begin
  perform production_control.assert_production_service_role();
  if input->>'job_id' is distinct from '83ed6e87-1a2c-4100-a8d6-9480621c7e8e'
     or input->>'expected_tournament_id' is distinct from '2026'
     or input->>'contract_version' is distinct from 'production-calcutta-v1'
     or input->>'reason_code' is distinct from 'STRANDED_PENDING_JOB_AFTER_PROTECTED_RELEASE'
     or coalesce(input->>'expected_job_hash','') !~ '^[a-f0-9]{64}$'
     or coalesce(input->>'release_plan_hash','') !~ '^[a-f0-9]{64}$'
     or coalesce(input->>'request_fingerprint','') !~ '^[a-f0-9]{64}$' then
    raise exception 'PRODUCTION_CALCUTTA_RECOVERY_SCOPE_DENIED';
  end if;
  -- Same admission/release lock, followed by canonical activation/current/job locks.
  -- Table locks also serialize otherwise independent claim/result/job insertion paths.
  perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
  select * into strict a from production_control.cutover_activation_state
    where scope_key='BAGGER_INV_PRODUCTION' for update;
  select * into strict h from production_control.postcutover_normal_release_head
    where scope_key='BAGGER_INV_PRODUCTION' for update;
  perform plan_hash from production_control.release_attempts_v1
    where plan_hash=input->>'release_plan_hash' and state='ACTIVE' for share;
  if not found then raise exception 'PRODUCTION_CALCUTTA_RECOVERY_RELEASE_DENIED'; end if;
  perform production_control.assert_production_calcutta_v1_runtime(input);
  perform production_control.assert_production_scoring_actor(input,true);
  if (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION') is distinct from '2026'
     or h.activation_revision is distinct from a.activation_revision
     or h.deployment_commit is distinct from a.expected_deployment_commit
     or not exists(select 1 from production_control.release_attempts_v1
       where plan_hash=input->>'release_plan_hash' and state='ACTIVE')
     or not exists(select 1 from production_control.postcutover_normal_release_rebindings
       where release_rebind_id=h.release_rebind_id
       and activation_revision_before=(input->>'expected_prior_activation_revision')::bigint
       and activation_revision_after=a.activation_revision)
     or a.activation_revision <= (input->>'expected_prior_activation_revision')::bigint then
    raise exception 'PRODUCTION_CALCUTTA_RECOVERY_RELEASE_DENIED';
  end if;
  select * into strict c from scoring_authority.calcutta_v1_current
    where tournament_id='2026' for update;
  lock table scoring_authority.calcutta_v1_recalculation_jobs in share row exclusive mode;
  lock table scoring_authority.calcutta_v1_auction_fact_revisions,
    scoring_authority.calcutta_v1_publication_revisions,
    scoring_authority.calcutta_v1_result_revisions in share mode;
  select * into strict j from scoring_authority.calcutta_v1_recalculation_jobs
    where job_id=(input->>'job_id')::uuid for update;
  select * into strict auction from scoring_authority.calcutta_v1_auction_fact_revisions
    where auction_revision_id=c.auction_revision_id;
  select * into strict publication from scoring_authority.calcutta_v1_publication_revisions
    where publication_revision_id=c.publication_revision_id;
  if c.configuration_revision<>2 or c.auction_revision<>37 or c.publication_revision<>41
     or c.configuration_revision is distinct from (input->>'expected_configuration_revision')::bigint
     or c.configuration_fingerprint is distinct from input->>'expected_configuration_fingerprint'
     or c.auction_revision is distinct from (input->>'expected_auction_revision')::bigint
     or c.auction_fingerprint is distinct from input->>'expected_auction_fingerprint'
     or c.publication_revision is distinct from (input->>'expected_publication_revision')::bigint
     or c.state<>'AUCTION_COMPLETE' or c.publication_state<>'PUBLISHED'
     or publication.publication_state<>'PUBLISHED' or publication.auction_revision<>c.auction_revision
     or publication.auction_fingerprint<>c.auction_fingerprint
     or c.result_revision<>0
     or exists(select 1 from scoring_authority.calcutta_v1_result_revisions where tournament_id='2026')
     or exists(select 1 from scoring_authority.calcutta_v1_auction_fact_revisions where tournament_id='2026' and auction_revision>c.auction_revision)
     or exists(select 1 from scoring_authority.calcutta_v1_publication_revisions where tournament_id='2026' and publication_revision>c.publication_revision)
     or auction.auction_fingerprint<>c.auction_fingerprint
     or production_control.calcutta_v1_hash(auction.auction_manifest)<>c.auction_fingerprint
     or jsonb_array_length(auction.auction_manifest->'purchases')<>24
     or (select count(distinct p->>'player_id') from jsonb_array_elements(auction.auction_manifest->'purchases')p)<>24
     or (select sum((p->>'purchase_price')::numeric) from jsonb_array_elements(auction.auction_manifest->'purchases')p)<>18500
     or (select count(*) from (select o->>'player_id' from jsonb_array_elements(auction.auction_manifest->'ownership')o group by o->>'player_id' having sum((o->>'ownership_fraction')::numeric)=1) s)<>24 then
    raise exception 'PRODUCTION_CALCUTTA_RECOVERY_CANONICAL_STATE_CHANGED';
  end if;
  if j.tournament_id<>'2026' or j.status<>'PENDING' or j.attempts<>0
     or j.started_at is not null or j.completed_at is not null
     or j.claimed_by is not null or j.claim_token is not null or j.lease_expires_at is not null
     or j.last_error_code is not null or j.last_error_safe is not null
     or j.configuration_revision_id<>c.configuration_revision_id
     or j.configuration_fingerprint<>c.configuration_fingerprint
     or j.auction_revision_id<>c.auction_revision_id or j.auction_revision<>c.auction_revision
     or j.auction_fingerprint<>c.auction_fingerprint
     or j.source_fingerprint<>production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))
     or exists(select 1 from scoring_authority.calcutta_v1_recalculation_jobs other
       where other.tournament_id='2026' and other.job_id<>j.job_id
       and (other.status in ('PENDING','RUNNING','SUCCEEDED') or other.requested_at>j.requested_at)) then
    raise exception 'PRODUCTION_CALCUTTA_RECOVERY_JOB_INELIGIBLE';
  end if;
  select * into prior from production_control.calcutta_exact_job_recoveries_v1 where job_id=j.job_id;
  if found then
    if prior.prior_activation is distinct from (input->>'expected_prior_activation_revision')::bigint
       or prior.new_activation<>a.activation_revision or j.activation_revision<>a.activation_revision
       or prior.pre_state_hash is distinct from input->>'expected_job_hash'
       or prior.post_state_hash<>production_control.calcutta_v1_hash(to_jsonb(j))
       or prior.release_plan_hash is distinct from input->>'release_plan_hash' then
      raise exception 'PRODUCTION_CALCUTTA_RECOVERY_RECEIPT_CONFLICT';
    end if;
    return prior.response||jsonb_build_object('idempotent',true);
  end if;
  pre_hash:=production_control.calcutta_v1_hash(to_jsonb(j));
  if j.activation_revision is distinct from (input->>'expected_prior_activation_revision')::bigint
     or pre_hash is distinct from input->>'expected_job_hash' then
    raise exception 'PRODUCTION_CALCUTTA_RECOVERY_PRESTATE_CHANGED';
  end if;
  update scoring_authority.calcutta_v1_recalculation_jobs
    set activation_revision=a.activation_revision where job_id=j.job_id returning * into j;
  post_hash:=production_control.calcutta_v1_hash(to_jsonb(j));
  response_value:=jsonb_build_object('ok',true,'code','PRODUCTION_CALCUTTA_EXACT_JOB_CARRIED',
    'recovery_id',recovery,'job_id',j.job_id,'prior_activation',input->'expected_prior_activation_revision',
    'new_activation',a.activation_revision,'auction_revision',c.auction_revision,
    'publication_revision',c.publication_revision,'pre_state_hash',pre_hash,'post_state_hash',post_hash,
    'status',j.status,'attempts',j.attempts,'idempotent',false);
  insert into production_control.calcutta_exact_job_recoveries_v1
    (recovery_id,job_id,prior_activation,new_activation,auction_revision,publication_revision,
     pre_state_hash,post_state_hash,director_player_id,director_auth_user_id,release_plan_hash,reason_code,response)
    values(recovery,j.job_id,(input->>'expected_prior_activation_revision')::bigint,a.activation_revision,
     c.auction_revision,c.publication_revision,pre_hash,post_hash,input#>>'{authorization,player_id}',
     (input#>>'{authorization,auth_user_id}')::uuid,input->>'release_plan_hash',input->>'reason_code',response_value);
  insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
    values('PRODUCTION_CALCUTTA_EXACT_JOB_CARRIED','CALCUTTA','2026',input#>>'{authorization,player_id}',
      input->>'request_fingerprint','SUCCEEDED',response_value);
  return response_value;
end $$;
revoke all on function production_control.carry_forward_exact_calcutta_job_v1(jsonb)
  from public,anon,authenticated,service_role;
commit;
