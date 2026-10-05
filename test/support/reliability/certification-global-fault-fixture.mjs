import {randomUUID} from 'node:crypto';
import {createQueueFixture} from './certification-queue-fixture.mjs';
import {enableOwnedSafeupdate} from './pg-safeupdate.mjs';
import {sqlFile,repositoryRoot,destroyIsolatedCluster} from './postgres17.mjs';
export const globalArtifact=repositoryRoot+'/supabase/production_incremental/certification-queue-global-fault-v5.sql';
export async function createGlobalFaultFixture({emptyAuction=false}={}){
 const f=await createQueueFixture();
 try{
  for(const name of ['certification-queue-preview-publisher-v3.sql','certification-queue-safeupdate-v4.sql'])
   sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/'+name,{role:''});
  await enableOwnedSafeupdate(f);
  f.installGlobal=()=>sqlFile(f.cluster,f.database,globalArtifact,{role:''});
  f.installGlobal();
  f.globalInput=(action,changes={})=>({...f.bound,action,request_id:randomUUID(),expected_revision:f.status().revision,...changes});
  f.globalControl=input=>f.owner('worker_supervisor_global_fault_control_v5',input);
  f.armGlobal=(fault,uses=1)=>f.globalControl(f.globalInput('ARM',{fault,uses,expires_at:f.status().expiry}));
  f.correctGlobal=()=>f.globalControl(f.globalInput('CORRECT'));
  if(emptyAuction){
   // Reuse the already-certified synthetic purchase/clear fixture chronology,
   // not manual financial rows. Hosted preserved auction is never touched.
   const {certificationOperationRpc}=await import('../../../lib/certification-runtime-server.js');f.toggle(true);
   for(const clear of [false,true]){
    const c=JSON.parse(f.q('select to_jsonb(c)from scoring_authority.calcutta_v1_current c'));
    const input={contract_version:'production-calcutta-v1',expected_configuration_revision:c.configuration_revision,
     expected_configuration_fingerprint:c.configuration_fingerprint,expected_auction_revision:c.auction_revision,
     expected_auction_fingerprint:c.auction_fingerprint,expected_publication_revision:c.publication_revision,
     ...(clear?{action:'clear-entry',player_id:'P01'}:{action:'replace-auction',purchases:[{player_id:'P01',purchase_price:'1'}],
      ownership:[{player_id:'P01',owner_player_id:'P12',ownership_fraction:'1'}]})};
    const r=await certificationOperationRpc(clear?'DIRECTOR.CLEAR_CALCUTTA_AUCTION':'DIRECTOR.REPLACE_CALCUTTA_AUCTION',input,
     {env:f.env,authorization:f.authorization,operationRequestId:randomUUID()},f.dependencies);
    if(r.payload.ok!==true)throw new Error('LOCAL_EMPTY_AUCTION_FIXTURE_FAILED');
   }f.toggle(false);
  }
  return f;
 }catch(error){await destroyIsolatedCluster(f.cluster);throw error;}
}
