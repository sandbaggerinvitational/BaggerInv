// Real independent consumer processes; only owned Unix-socket SQL is reachable.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {repositoryRoot} from './postgres17.mjs';
import {createCertificationWorkerDemand} from '../../../tools/reliability/certification-worker-demand.mjs';
import {demandCheckpointSink} from './certification-demand-checkpoint.mjs';
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function waitFor(read,predicate,timeout=15000){
 const end=Date.now()+timeout;for(;;){const value=read();if(predicate(value))return value;
  if(Date.now()>end)assert.fail('LOCAL_CANONICAL_WAIT_EXPIRED');await delay(100);}
}
export function consumerProcess(f,entry){
 const child=spawn(process.execPath,[repositoryRoot+'/test/support/reliability/certification-supervisor-child.mjs'],
  {env:{PATH:process.env.PATH},stdio:['ignore','ignore','pipe','ipc']});
 let stderr='';child.stderr.on('data',b=>{stderr+=b;});
 const exited=once(child,'exit');
 const result=new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);
  child.once('exit',(code,signal)=>{if(code||signal)reject(new Error('LOCAL_CONSUMER_EXIT:'+code+':'+signal+':'+stderr));});});
 // A killed process intentionally has no outward ACK. Avoid unhandled rejection.
 result.catch(()=>{});
 child.send({socket:f.cluster.socket,port:f.cluster.port,database:f.database,env:f.env,
  registrationManifest:f.dependencies.registrationManifest,queueEntry:entry});
 return {child,result,exited};
}
export async function consumeProcess(f,entry){await f.due(entry);const p=consumerProcess(f,entry),r=await p.result;await p.exited;return r;}
export async function demand(f){return createCertificationWorkerDemand({env:f.env,dependencies:f.dependencies,onCheckpoint:demandCheckpointSink(f.cluster)});}
export function invocation(f,entry){return JSON.parse(f.q(`select to_jsonb(i)from production_control.worker_supervisor_invocations_v1 i where invocation_id='${entry.message.invocation_id}'`));}
export function resume(f,changes={}){return f.start({action:'RESUME',budget:1,duration_seconds:60,
 reconciliation_reason:'Owned local synthetic cause corrected and authoritative outcomes reconciled',...changes});}
export function assertDrain(f){const s=f.status();for(const k of ['pending_work','active_claims','active_leases','dead_letters','expired_claims'])assert.equal(s.counts[k],0,k);
 assert.equal(f.q("select count(*)from production_control.worker_supervisor_invocations_v1 where state in('RUNNING','UNKNOWN')"),'0');
 assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
 assert.equal(f.q("select production_control.derived_final_recap_ready_v1('2026')"),'f');
 assert.equal(f.q('select count(*)from scoring_authority.calcutta_v1_recalculation_jobs'),'0');
}
