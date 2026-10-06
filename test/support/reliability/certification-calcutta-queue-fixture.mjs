import {randomUUID} from 'node:crypto';
import {createGlobalFaultFixture} from './certification-global-fault-fixture.mjs';
import {sqlFile,repositoryRoot,destroyIsolatedCluster} from './postgres17.mjs';
import {certificationDirectorStack} from './certification-director-proof.mjs';
import {CERTIFICATION_WORKER_ENGINES} from '../../../lib/certification-worker-engines.js';
export const calcuttaScopeArtifact=repositoryRoot+'/supabase/production_incremental/certification-queue-calcutta-scope-v1.sql';
export async function createCalcuttaQueueFixture({install=true}={}) {
 const f=await createGlobalFaultFixture({emptyAuction:true});
 try {
  for(const name of ['certification-queue-retry-envelope-v6.sql','certification-queue-routing-closure-v7.sql',
   'certification-derived-attempt-cycle-v1.sql','certification-net-skins-configuration-v1.sql'])
   sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/'+name,{role:''});
  f.installCalcutta=()=>sqlFile(f.cluster,f.database,calcuttaScopeArtifact,{role:''});
  if(install)f.installCalcutta();
  f.envelope={...f.bound,authorization:f.authorization};
  f.transportFixture={env:f.env,registrationManifest:f.dependencies.registrationManifest};
  const startInput=f.startInput;f.startInput=changes=>startInput({engines:[...CERTIFICATION_WORKER_ENGINES],...changes});
  f.start=changes=>f.ownerQueue('control',f.startInput({budget:1,duration_seconds:60,...changes}));
  f.current=()=>JSON.parse(f.q('select to_jsonb(c)from scoring_authority.calcutta_v1_current c'));
  f.calcuttaJobs=()=>JSON.parse(f.q("select coalesce(jsonb_agg(to_jsonb(j)order by requested_at,job_id),'[]')from scoring_authority.calcutta_v1_recalculation_jobs j"));
  f.source=async(stack,id='2026-R3-11')=>{
   // One real lock transition per unprepared synthetic match. Repeated lock is
   // a truthful no-op, never treated as a new source or retry budget.
   // Independent compatibility cases use independent owned counterparts.
   const m=JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${id}'`));
   try{return await stack.transport.controlRequest('scoring-lock',{matchId:m.match_id,expectedMatchRevision:m.match_revision,
    expectedPermissionRevision:m.permission_revision,operationRequestId:randomUUID()});}
   catch(error){error.message+=' ('+error.domainCode+')';throw error;}
  };
  f.director=()=>certificationDirectorStack(f);
  f.register=e=>{const id='msg_local_'+e.message.invocation_id;f.ownerQueue('publication',{action:'TRY',invocation_id:e.message.invocation_id});
   f.ownerQueue('publication',{action:'ACK',invocation_id:e.message.invocation_id,message_id:id});return id;};
  return f;
 }catch(error){await destroyIsolatedCluster(f.cluster);throw error;}
}
