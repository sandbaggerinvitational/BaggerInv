// Real owner-only release operation over existing synthetic canonical authority.
// No generation, closure, lease, job, publication or context row is fabricated.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {jsonLiteral,openSqlSession} from './postgres17.mjs';

export function certificationReleaseInput(fixture,label='compatible-release'){
 const state=JSON.parse(fixture.q(`select jsonb_build_object('admission',to_jsonb(a),'pointer',to_jsonb(p),
  'generation',to_jsonb(g))from production_control.certification_admission_v1 a
  join production_control.current_tournament_pointer_v1 p on p.scope_key=a.resource_id
  join production_control.certification_initialization_origins_v1 o on o.resource_id=a.resource_id
  join scoring_authority.ingress_gates gate on gate.tournament_id=p.tournament_id
  join production_control.certification_ingress_generations_v1 g on g.resource_id=a.resource_id
   and g.generation_id=coalesce((select bound.generation_id
    from production_control.certification_ingress_generations_v1 bound
    where bound.resource_id=a.resource_id and bound.generation_id=gate.admission_generation_id
     and bound.tournament_id=p.tournament_id and bound.pointer_revision=p.pointer_revision
     and bound.authority_epoch_id=a.authority_epoch_id),o.admission_generation_id)`));
 const suffix=createHash('sha256').update(label+state.admission.release_commit).digest('hex');
 return{state,input:{contract_version:'certification-release-rebind-v1',operation_request_id:randomUUID(),resource:fixture.resource,
  expected_admission_revision:state.admission.admission_revision,expected_release_commit:state.admission.release_commit,
  expected_deployment_id:state.admission.deployment_id,expected_deployment_origin:state.admission.deployment_origin,
  expected_current_tournament_id:state.pointer.tournament_id,expected_pointer_revision:state.pointer.pointer_revision,
  expected_authority_epoch_id:state.admission.authority_epoch_id,expected_ingress_generation_id:state.generation.generation_id,
  deployment_class:'preview',new_release_commit:suffix.slice(0,40),new_deployment_id:'dpl_Release'+suffix.slice(0,24),
  new_deployment_origin:'https://release-'+suffix.slice(0,24)+'.vercel.app',reason:'Synthetic '+label}};
}

export const certificationReleasePreservedSql=`select jsonb_build_object(
 'resource',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by resource_id),'[]')::text)from production_control.canonical_resource_v1 r),
 'pointer',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by scope_key),'[]')::text)from production_control.current_tournament_pointer_v1 r),
 'epochs',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by epoch_id),'[]')::text)from scoring_authority.authority_epochs r),
 'origin',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by resource_id),'[]')::text)from production_control.certification_initialization_origins_v1 r),
 'generations',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by generation_id),'[]')::text)from production_control.certification_ingress_generations_v1 r),
 'closures',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by closure_id),'[]')::text)from production_control.scoring_admission_closures r),
 'leases',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by lease_id),'[]')::text)from production_control.certification_ingress_leases_v1 r),
 'scores',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by match_id,mutation_key),'[]')::text)from scoring_authority.score_mutations r),
 'intents',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by intent_id),'[]')::text)from scoring_authority.score_derived_intents_v1 r),
 'oddsJobs',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by job_id),'[]')::text)from scoring_authority.odds_calculation_jobs r),
 'oddsReceipts',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by operation_request_id),'[]')::text)from production_control.certification_odds_receipts_v1 r),
 'publishedOdds',(select md5(coalesce(jsonb_agg(to_jsonb(r)order by id),'[]')::text)from scoring_authority.odds_published_snapshots r))`;

export function adoptCertificationReleaseReceipt(fixture,receipt){
 // Replace the envelope member; mutating its old object would falsify already
 // captured old-release request identities held elsewhere in the chronology.
 fixture.deployment={...fixture.deployment,release_commit:receipt.release_commit,
  deployment_id:receipt.deployment_id,deployment_origin:receipt.deployment_origin};
 fixture.envelope.deployment=fixture.deployment;
 if(fixture.transportFixture)Object.assign(fixture.transportFixture.env,{
  VERCEL_GIT_COMMIT_SHA:receipt.release_commit,VERCEL_DEPLOYMENT_ID:receipt.deployment_id,
  VERCEL_URL:new URL(receipt.deployment_origin).host});
}

export async function proveCertificationReleaseRebind(fixture,{label,expectedGenerationState,
 historicalGenerationId,rollbackOnly=false,leaveDisabled=false}={}){
 const {input,state}=certificationReleaseInput(fixture,label);
 assert.equal(state.generation.state,expectedGenerationState);
 const session=rollbackOnly?openSqlSession(fixture.cluster,fixture.database):null;
 const q=async sql=>session?session.query(sql):fixture.q(sql);
 const owner=async(name,value)=>JSON.parse(await q(`select production_control.${name}(${jsonLiteral(value)})`));
 const before=await q(certificationReleasePreservedSql),oldEnvelope=structuredClone(fixture.envelope);
 const details={label,proofLayer:'POSTGRESQL',generationId:state.generation.generation_id,
  generationState:state.generation.state,pointerRevision:state.pointer.pointer_revision,
  transaction:rollbackOnly?'ROLLBACK_ONLY':'COMMITTED',googleCalls:0};
 try{
  if(session)await session.query('begin');
  if(state.admission.enabled){
   const disabled=await owner('set_certification_admission_v1',{resource_id:fixture.resource.resource_id,
    expected_admission_revision:input.expected_admission_revision,enabled:false,reason:'Synthetic release maintenance '+label});
   input.expected_admission_revision=disabled.admission_revision;
  }
  const pausedGate=await q('select jsonb_agg(to_jsonb(g)order by tournament_id)from scoring_authority.ingress_gates g');
  if(historicalGenerationId){
   const invalid={...input,operation_request_id:randomUUID(),expected_ingress_generation_id:historicalGenerationId};
   if(session)await session.query(`do $negative$begin
    perform production_control.rebind_certification_release_v1(${jsonLiteral(invalid)});
    raise exception 'EXPECTED_HISTORICAL_GENERATION_DENIAL';
    exception when serialization_failure then
     if sqlerrm<>'CERTIFICATION_RELEASE_CONTEXT_STALE'then raise;end if;
    end;$negative$`);
   else await assert.rejects(owner('rebind_certification_release_v1',invalid),/CONTEXT_STALE|no rows/);
   details.historicalGenerationDenied=true;
  }
  const receipt=await owner('rebind_certification_release_v1',input);
  assert.equal(receipt.ok,true);assert.equal(receipt.enabled,false);
  assert.deepEqual(await owner('rebind_certification_release_v1',input),receipt);
  const conflicting={...input,reason:'Conflicting same operation'};
  if(session)await session.query(`do $negative$begin
   perform production_control.rebind_certification_release_v1(${jsonLiteral(conflicting)});
   raise exception 'EXPECTED_RELEASE_IDEMPOTENCY_CONFLICT';
   exception when serialization_failure then
    if sqlerrm<>'CERTIFICATION_RELEASE_IDEMPOTENCY_CONFLICT'then raise;end if;
   end;$negative$`);
  else await assert.rejects(owner('rebind_certification_release_v1',conflicting),/IDEMPOTENCY_CONFLICT/);
  assert.equal(await q(certificationReleasePreservedSql),before);
  assert.equal(await q('select jsonb_agg(to_jsonb(g)order by tournament_id)from scoring_authority.ingress_gates g'),pausedGate);
  const audit=JSON.parse(await q(`select details from production_control.operation_audit_events
   where event_type='CERTIFICATION_RELEASE_REBOUND'and details->>'operation_request_id'='${input.operation_request_id}'`));
  assert.deepEqual(audit.receipt,receipt);assert.equal(audit.admission_generation_id,state.generation.generation_id);
  details.receipt=receipt;details.sameOperationRetry=true;details.sameOperationConflict=true;
  details.canonicalGraphPreserved=true;details.atomicAuditReadback=true;
  if(rollbackOnly){
   await session.query('rollback');
   assert.equal(fixture.q(`select count(*)from production_control.operation_audit_events
    where event_type='CERTIFICATION_RELEASE_REBOUND'and details->>'operation_request_id'='${input.operation_request_id}'`),'0');
   assert.deepEqual(JSON.parse(fixture.q('select to_jsonb(a)from production_control.certification_admission_v1 a')),state.admission);
  }else{
   adoptCertificationReleaseReceipt(fixture,receipt);
   if(state.admission.enabled&&!leaveDisabled){
    const enable={resource_id:fixture.resource.resource_id,expected_admission_revision:receipt.admission_revision,
     enabled:true,reason:'Synthetic release resume '+label};
    if(state.generation.state==='CLOSED'){
     const beforeAdmission=fixture.q('select to_jsonb(a)from production_control.certification_admission_v1 a');
     const beforeGate=fixture.q(`select to_jsonb(g)from scoring_authority.ingress_gates g where tournament_id='${state.pointer.tournament_id}'`);
     const metadata=JSON.parse(fixture.q("select jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'path',proconfig)from pg_proc where oid='production_control.set_certification_admission_v1(jsonb)'::regprocedure"));
     assert.equal(metadata.owner,'postgres');assert.equal(metadata.definer,false);assert.deepEqual(metadata.path,['search_path=pg_catalog']);
     for(const role of['anon','authenticated','service_role']){
      assert.equal(fixture.q(`select has_function_privilege('${role}','production_control.set_certification_admission_v1(jsonb)','execute')`),'f');
      assert.throws(()=>fixture.q(`set role ${role};select production_control.set_certification_admission_v1(${jsonLiteral(enable)})`),/permission denied/);
     }
     await assert.rejects(owner('set_certification_admission_v1',{...enable,expected_admission_revision:receipt.admission_revision-1}),/REVISION_STALE/);
     await assert.rejects(owner('set_certification_admission_v1',{...enable,resource_id:'CERTIFICATION:'+randomUUID()}),/RESOURCE_DENIED/);
     fixture.q("create function public.r2_closed_enable_audit_fault()returns trigger language plpgsql as $$begin if new.event_type='CERTIFICATION_ADMISSION_CHANGED'then raise exception 'CLOSED_ENABLE_AUDIT_FAILURE';end if;return new;end$$;create trigger r2_closed_enable_audit_fault before insert on production_control.operation_audit_events for each row execute function public.r2_closed_enable_audit_fault()");
     try{await assert.rejects(owner('set_certification_admission_v1',enable),/CLOSED_ENABLE_AUDIT_FAILURE/);}
     finally{fixture.q('drop trigger r2_closed_enable_audit_fault on production_control.operation_audit_events;drop function public.r2_closed_enable_audit_fault()');}
     assert.equal(fixture.q('select to_jsonb(a)from production_control.certification_admission_v1 a'),beforeAdmission);
     assert.equal(fixture.q(`select to_jsonb(g)from scoring_authority.ingress_gates g where tournament_id='${state.pointer.tournament_id}'`),beforeGate);
     assert.equal(fixture.q(certificationReleasePreservedSql),before);
     details.closedEnableNegatives={rolesDenied:['anon','authenticated','service_role'],staleRevisionDenied:true,
      wrongResourceDenied:true,atomicAuditRollback:true,metadata};
    }
    await owner('set_certification_admission_v1',enable);
   }
   assert.throws(()=>fixture.rpc('read_certification_runtime_context_v1',{...oldEnvelope,phase:'READS'}),/DENIED|MISMATCH/);
   if(state.admission.enabled&&!leaveDisabled){
    const current=fixture.context('READS');assert.equal(current.release_commit,receipt.release_commit);
    assert.equal(current.current_tournament_id,state.pointer.tournament_id);details.newContextReadback=true;
    if(state.generation.state==='CLOSED'){
     assert.equal(fixture.q(`select state from scoring_authority.ingress_gates where tournament_id='${state.pointer.tournament_id}'`),'PAUSED');
     const annual=fixture.context('ANNUAL');assert.equal(annual.current_tournament_id,state.pointer.tournament_id);
     for(const phase of['SCORING','DIRECTOR','WORKERS'])assert.throws(()=>fixture.context(phase),/INGRESS_CLOSED/);
     details.closedEnable={deploymentEnabled:true,ingress:'PAUSED',generation:'CLOSED',readsAdmitted:true,annualAdmitted:true,
      scoringDenied:true,directorDenied:true,workersDenied:true,canonicalGraphPreserved:true};
    }

   }
   details.admissionLeftDisabled=leaveDisabled;
  }
  assert.equal(fixture.q(certificationReleasePreservedSql),before);
  return details;
 }finally{if(session){try{await session.query('rollback');}catch{}await session.close();}}
}
