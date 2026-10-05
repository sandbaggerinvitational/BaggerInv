// Owner provisioning tool, not an application API. The fixed synthetic second
// match stays UPCOMING/unscored. Existing canonical setup operations/triggers
// create demand; no job insert, force build, direct processor or hook switch.
import {randomUUID} from 'node:crypto';
import {supervisorEnvelope} from '../../lib/certification-worker-supervision.js';
import {certificationOperationRpc} from '../../lib/certification-runtime-server.js';
import {buildTournamentSetupMutation,normalizeProductionTournamentSetupPayload} from '../../lib/production-tournament-setup-contract.js';
import {fixtureIdentities} from './certification-part2a-fixture.mjs';
export async function createCertificationWorkerDemand({env=process.env,dependencies={}}={}){
 supervisorEnvelope(env,dependencies);
 const authorization={tournament_id:'2026',role:'DIRECTOR',player_id:'P01',auth_user_id:fixtureIdentities[0].auth_user_id};
 const read=()=>certificationOperationRpc('DIRECTOR.READ_SETUP',{}, {env,authorization},dependencies);
 const mutate=async(action,values)=>{
  const model=normalizeProductionTournamentSetupPayload((await read()).payload);
  const payload=buildTournamentSetupMutation(action,{...values,expectedRevision:model.revision,operationRequestId:randomUUID()});
  const id=payload.operation_request_id;delete payload.operation_request_id;
  const result=await certificationOperationRpc('DIRECTOR.MUTATE_SETUP',{...payload,action},{env,authorization,operationRequestId:id},dependencies);
  if(result.payload?.ok!==true)throw Object.assign(new Error('CERTIFICATION_DEMAND_SETUP_REJECTED'),{code:'CERTIFICATION_DEMAND_SETUP_REJECTED'});
  return result;
 };
 const model=normalizeProductionTournamentSetupPayload((await read()).payload);
 const match=model.matches.find(m=>m.matchId==='2026-R3-11');
 if(!match||match.status!=='UPCOMING'||match.format!=='SI')throw new Error('CERTIFICATION_DEMAND_FIXTURE_REQUIRED');
 // Tee time is a synthetic presentation fact, with two fixed alternatives.
 // Update invalidates preparation via the existing setup contract; preparing
 // that current context creates genuine canonical derived demand.
 await mutate('upsert-match',{matchId:'2026-R3-11',roundNumber:3,matchNumber:11,courseId:'C3',tee:'Tournament',
  teeTime:match.teeTime.startsWith('08:01')?'08:02':'08:01',startingHole:1});
 return mutate('prepare-scoring-context',{matchId:'2026-R3-11'});
}
