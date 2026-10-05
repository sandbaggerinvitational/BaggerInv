// Owner provisioning tool, never a client API. One canonical tee-time update
// creates genuine derived demand. Scoring preparation is a separate contract.
import {randomUUID} from 'node:crypto';
import {supervisorEnvelope} from '../../lib/certification-worker-supervision.js';
import {certificationOperationRpc,replayCertificationIngress} from '../../lib/certification-runtime-server.js';
import {buildTournamentSetupMutation,normalizeProductionTournamentSetupPayload} from '../../lib/production-tournament-setup-contract.js';
import {fixtureIdentities} from './certification-part2a-fixture.mjs';

export const DEMAND_CONTRACT='certification-worker-demand-v2';
const operation='DIRECTOR.MUTATE_SETUP';
const authorization={tournament_id:'2026',role:'DIRECTOR',player_id:'P01',auth_user_id:fixtureIdentities[0].auth_user_id};
const states=new Set(['PLANNED','UNKNOWN','DEMAND_READY','NOT_COMMITTED']);
const keys=['contract','binding','operation_request_id','expected_revision','tee_time','state'];
const fail=code=>Object.assign(new Error(code),{code});
function binding(env,dependencies){
 const b=supervisorEnvelope(env,dependencies);
 return {resource_id:b.resource.resource_id,project_ref:b.resource.project_ref,
  registration_revision:b.resource.registration_revision,release_commit:b.deployment.release_commit,
  deployment_id:b.deployment.deployment_id};
}
function payload(checkpoint){
 const value=buildTournamentSetupMutation('upsert-match',{matchId:'2026-R3-11',roundNumber:3,matchNumber:11,
  courseId:'C3',tee:'Tournament',teeTime:checkpoint.tee_time,expectedRevision:checkpoint.expected_revision,
  operationRequestId:checkpoint.operation_request_id});
 delete value.operation_request_id;
 return {...value,action:'upsert-match'};
}
function checked(value,bound){
 if(!value||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||
  value.contract!==DEMAND_CONTRACT||!states.has(value.state)||!['08:01','08:02'].includes(value.tee_time)||
  !Number.isSafeInteger(value.expected_revision)||value.expected_revision<0||
  !value.binding||Array.isArray(value.binding)||Object.keys(value.binding).length!==Object.keys(bound).length||
  Object.entries(bound).some(([k,v])=>value.binding[k]!==v))throw fail('CERTIFICATION_DEMAND_CHECKPOINT_DENIED');
 payload(value); // The canonical DTO validates the stable operation UUID too.
 return structuredClone(value);
}

/** Read-only planning. Persist the returned plan before executing it. No
 * credential, context token, lease token, private payload or caller target. */
export async function planCertificationWorkerDemand({env=process.env,dependencies={},operationRequestId=randomUUID()}={}){
 const bound=binding(env,dependencies);
 const model=normalizeProductionTournamentSetupPayload((await certificationOperationRpc(
  'DIRECTOR.READ_SETUP',{}, {env,authorization},dependencies)).payload);
 const match=model.matches.find(m=>m.matchId==='2026-R3-11');
 if(!match||match.status!=='UPCOMING'||match.format!=='SI'||match.scoredHoles!==0||
  match.courseId!=='C3'||match.tee!=='Tournament')throw fail('CERTIFICATION_DEMAND_FIXTURE_REQUIRED');
 return checked({contract:DEMAND_CONTRACT,binding:bound,operation_request_id:operationRequestId,
  expected_revision:model.revision,tee_time:match.teeTime.startsWith('08:01')?'08:02':'08:01',state:'PLANNED'},bound);
}

/** onCheckpoint must durably save before dispatch; failure stops the write.
 * Resuming always verifies the full original request through canonical replay.
 * Missing/ADMITTED/UNKNOWN outcomes never prove NOT_COMMITTED and never cause
 * an automatic replacement request, new revision, second setup step or cycle. */
export async function createCertificationWorkerDemand({env=process.env,dependencies={},checkpoint,onCheckpoint}={}){
 const bound=binding(env,dependencies);
 const plan=checked(checkpoint||await planCertificationWorkerDemand({env,dependencies}),bound);
 const input=payload(plan),options={env,authorization,operationRequestId:plan.operation_request_id};
 const replay=async()=>(await replayCertificationIngress(operation,input,options,dependencies)).payload;
 const finish=async(value,errorCode)=>{
  const outcome=value?.state==='COMMITTED'?'COMMITTED':value?.state==='NOT_COMMITTED'?'NOT_COMMITTED':'UNKNOWN';
  const state=outcome==='COMMITTED'?'DEMAND_READY':outcome;
  const saved={...plan,state};
  if(onCheckpoint)await onCheckpoint(structuredClone(saved));
  return {ok:outcome==='COMMITTED',state,canonical_outcome:outcome,operation_request_id:plan.operation_request_id,
   checkpoint:saved,payload:{ok:outcome==='COMMITTED',code:outcome==='COMMITTED'?'CERTIFICATION_DEMAND_READY':
    outcome==='NOT_COMMITTED'?value.result.code:'CERTIFICATION_DEMAND_OUTCOME_UNKNOWN',
    ...(value?.result?.revision!==undefined?{revision:value.result.revision}:{}),
    ...(value?.result?.blockers?{blockers:value.result.blockers}:{}),...(errorCode?{transport_code:errorCode}: {})},
   preparation:'NOT_REQUIRED_FOR_DERIVED_WORK',current_work:'REVALIDATE_SOURCE_AND_CYCLE_AT_CANONICAL_CLAIM'};
 };
 // SQL rejects conflicting reuse before any new mutation. This lookup works
 // while admission is disabled, so STOP does not hide committed evidence.
 let known=await replay();
 if(known.lease_id!==null||plan.state!=='PLANNED')return finish(known);
 if(typeof onCheckpoint!=='function')throw fail('CERTIFICATION_DEMAND_DURABLE_CHECKPOINT_REQUIRED');
 await onCheckpoint(structuredClone(plan));
 await onCheckpoint({...structuredClone(plan),state:'UNKNOWN'});
 let error;
 try{await certificationOperationRpc(operation,input,options,dependencies);}
 catch(e){error=e;}
 try{known=await replay();}
 catch(e){return finish(undefined,error?.code||e.code||'CERTIFICATION_TRANSPORT_UNAVAILABLE');}
 return finish(known,error?.code);
}
