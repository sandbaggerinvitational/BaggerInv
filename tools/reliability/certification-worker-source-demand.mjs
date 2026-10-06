// Local/owner provisioning only. This is a real, access-restricting lifecycle
// operation, not an enqueue API or an artificial source/attempt increment.
import {randomUUID} from 'node:crypto';
import {supervisorEnvelope} from '../../lib/certification-worker-supervision.js';
import {certificationOperationRpc,replayCertificationIngress} from '../../lib/certification-runtime-server.js';
import {fixtureIdentities} from './certification-part2a-fixture.mjs';

export const SOURCE_DEMAND_CONTRACT='certification-worker-source-demand-v1';
const operation='DIRECTOR.MATCH_CONTROL',matchId='2026-R3-11';
const actor={tournament_id:'2026',role:'DIRECTOR',player_id:'P01',auth_user_id:fixtureIdentities[0].auth_user_id};
const keys=['contract','binding','operation_request_id','match_revision','permission_revision','state'];
const states=new Set(['PLANNED','UNKNOWN','DEMAND_READY','NO_NEW_SOURCE','NOT_COMMITTED']);
const fail=code=>Object.assign(new Error(code),{code});
function binding(env,dependencies){
 const b=supervisorEnvelope(env,dependencies);
 return {resource_id:b.resource.resource_id,project_ref:b.resource.project_ref,
  registration_revision:b.resource.registration_revision,release_commit:b.deployment.release_commit,
  deployment_id:b.deployment.deployment_id};
}
function checked(value,bound){
 if(!value||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||
  value.contract!==SOURCE_DEMAND_CONTRACT||!states.has(value.state)||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.operation_request_id)||
  !Number.isSafeInteger(value.match_revision)||value.match_revision<0||
  !Number.isSafeInteger(value.permission_revision)||value.permission_revision<0||
  !value.binding||Object.keys(value.binding).length!==Object.keys(bound).length||
  Object.entries(bound).some(([k,v])=>value.binding[k]!==v))throw fail('CERTIFICATION_SOURCE_DEMAND_CHECKPOINT_DENIED');
 return structuredClone(value);
}
export async function planCertificationWorkerSourceDemand({env=process.env,dependencies={},operationRequestId=randomUUID()}={}){
 const bound=binding(env,dependencies);
 const result=(await certificationOperationRpc('DIRECTOR.READ_SETUP',{}, {env,authorization:actor},dependencies)).payload;
 const m=result.data?.matches?.find(m=>m.matchId===matchId);
 if(result.ok!==true||!m||m.status!=='UPCOMING'||m.format!=='SI'||m.scoredHoles!==0||
  m.scoringLocked!==false||m.accessActive!==false||m.courseId!=='C3'||m.tee!=='Tournament')
  throw fail('CERTIFICATION_SOURCE_DEMAND_UNLOCKED_FIXTURE_REQUIRED');
 return checked({contract:SOURCE_DEMAND_CONTRACT,binding:bound,operation_request_id:operationRequestId,
  match_revision:m.matchRevision,permission_revision:m.permissionRevision,state:'PLANNED'},bound);
}
export async function createCertificationWorkerSourceDemand({env=process.env,dependencies={},checkpoint,onCheckpoint}={}){
 const bound=binding(env,dependencies),plan=checked(checkpoint||await planCertificationWorkerSourceDemand({env,dependencies}),bound);
 const payload={action:'scoring-lock',match_id:matchId,expected_match_revision:plan.match_revision,
  expected_permission_revision:plan.permission_revision,mutation_key:plan.operation_request_id};
 const options={env,authorization:{...actor,match_id:matchId,match_revision:plan.match_revision,
  permission_revision:plan.permission_revision},operationRequestId:plan.operation_request_id};
 const replay=async()=>(await replayCertificationIngress(operation,payload,options,dependencies)).payload;
 const finish=async(value,errorCode)=>{
  const outcome=['COMMITTED','NOT_COMMITTED'].includes(value?.state)?value.state:'UNKNOWN';
  const advanced=outcome==='COMMITTED'&&value?.result?.ok===true&&value.result.code==='SCORING_LOCK'
   &&value.result.match_revision===plan.match_revision+1&&value.result.access_active===false;
  const state=outcome==='COMMITTED'?(advanced?'DEMAND_READY':'NO_NEW_SOURCE'):outcome,saved={...plan,state};
  if(onCheckpoint)await onCheckpoint(structuredClone(saved));
  return {ok:advanced,state,canonical_outcome:outcome,
   operation_request_id:plan.operation_request_id,checkpoint:saved,result:value?.result,
   ...(errorCode?{transport_code:errorCode}:{}),preparation:'NOT_REQUIRED',
   source:'CANONICAL_MATCH_REVISION',scoring_authority:'REVOKED',repeat:'REPLAY_OR_NO_CHANGE_NOT_NEW_BUDGET'};
 };
 let known=await replay();
 if(known.lease_id!==null||plan.state!=='PLANNED')return finish(known);
 if(typeof onCheckpoint!=='function')throw fail('CERTIFICATION_SOURCE_DEMAND_DURABLE_CHECKPOINT_REQUIRED');
 await onCheckpoint(structuredClone(plan));await onCheckpoint({...structuredClone(plan),state:'UNKNOWN'});
 let error;
 try{await certificationOperationRpc(operation,payload,options,dependencies);}catch(e){error=e;}
 try{known=await replay();}catch(e){return finish(undefined,error?.code||e.code||'CERTIFICATION_TRANSPORT_UNAVAILABLE');}
 return finish(known,error?.code);
}
