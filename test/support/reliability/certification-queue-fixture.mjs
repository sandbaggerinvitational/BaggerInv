import {supervisorEnvelope} from '../../../lib/certification-worker-supervision.js';
import {randomUUID} from 'node:crypto';
import {createSupervisorFixture} from './certification-supervisor-fixture.mjs';
import {sqlFile,jsonLiteral,repositoryRoot} from './postgres17.mjs';
import {QUEUE_CONTRACT,QUEUE_TOPIC,consumeCertificationQueueMessage,queueControl} from '../../../lib/certification-queue-supervision.js';
import {QUEUE_TIMING} from '../../../lib/certification-queue-timing.js';
export async function createQueueFixture(){
 const f=await createSupervisorFixture();
 sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/certification-worker-supervision-v1.sql',{role:''});
 f.predecessor=f.q('select image::text from production_control.worker_supervisor_installation_v1');
 f.env.VERCEL='1';f.env.BAGGER_CERTIFICATION_QUEUE_TRANSPORT=QUEUE_CONTRACT;
 f.install=()=>sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/certification-worker-queue-supervision-v2.sql',{role:''});
 f.install();f.bound=supervisorEnvelope(f.env,f.dependencies);
 f.ownerQueue=(name,input={})=>f.owner({status:'worker_supervisor_status_v1',control:'worker_supervisor_control_v1',publication:'worker_supervisor_queue_publication_v2',
  reconcile:'worker_supervisor_reconcile_v1',fault_control:'worker_supervisor_fault_control_v1'}[name],{...f.bound,...input});
 f.context=()=>{const b=JSON.parse(f.q(`select production_control.worker_supervisor_queue_binding_v2(${jsonLiteral(f.bound)})`));delete b.resource;delete b.deployment;return b;};
 f.status=()=>f.ownerQueue('status');
 f.startInput=(changes={})=>({action:'START',request_id:randomUUID(),expected_revision:f.status().revision,expected_context:f.context(),
  duration_seconds:180,budget:3,cadence_seconds:60,slots:1,engines:['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL'],...changes});
 f.start=(changes={})=>f.ownerQueue('control',f.startInput(changes));
 f.stop=()=>f.ownerQueue('control',{action:'STOP',request_id:randomUUID(),expected_revision:f.status().revision});
 f.batch=()=>f.ownerQueue('publication',{action:'BATCH'});
 f.due=async(entry)=>{const wait=Date.parse(entry.scheduled_at)-Date.now()+100;if(wait>0)await new Promise(r=>setTimeout(r,wait));};
 f.consume=async(entry,overrides={})=>consumeCertificationQueueMessage(entry.message,{topicName:QUEUE_TOPIC,messageId:'msg_local_'+entry.message.invocation_id,deliveryCount:1,
  createdAt:new Date(Math.min(Date.now(),Date.parse(entry.scheduled_at)-10_000)),expiresAt:new Date(Date.parse(entry.scheduled_at)+QUEUE_TIMING.retentionHorizonSeconds*1000)},
  {env:f.env,dependencies:f.dependencies,...overrides});
 f.control=()=>queueControl({env:f.env,dependencies:f.dependencies});
 f.job=engine=>JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.competition_recalculation_jobs j where engine_key='${engine}'`));
 f.arm=(fault,engine='TEAM_MOMENTUM')=>{const j=f.job(engine);return f.ownerQueue('fault_control',{action:'ARM',expected_revision:f.status().revision,fault,engine_key:engine,cycle:j.delivery_cycle,
  source_revision:j.requested_source_revision,fixture_event_id:Number(f.q("select event_id from production_control.operation_audit_events where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'")),expires_at:new Date(Date.now()+600000).toISOString()});};
 return f;
}
