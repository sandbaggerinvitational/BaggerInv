// UNIT / transport contract. Real SQL, calculation and publication are proved
// separately in the owned PostgreSQL and annual chronology suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {readCertificationDirectorOdds,mutateCertificationDirectorOdds} from '../lib/certification-odds-server.js';
import {certificationOddsRpc,resolveCertificationRuntimeContext} from '../lib/certification-runtime-server.js';
import {canonicalDirectorOddsCommand,canonicalDirectorOddsRequest} from '../lib/canonical-director-odds-client.js';
const operationRequestId='77777777-7777-4777-8777-777777777777';
const jobId='1'.repeat(64);
function fixture(){
 const f=certificationRuntimeFixture();
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;f.requests.push({url,input});
  if(url.endsWith('/read_certification_runtime_context_v1'))return Response.json({contract:'certification-runtime-v1',context:f.contextFor(input)});
  assert.match(url,/\/(dispatch_certification_odds_v1|read_certification_odds_operation_v1)$/);
  if(url.endsWith('/read_certification_odds_operation_v1'))return Response.json({ok:true,state:'UNKNOWN'});
  if(input.payload.odds_operation==='read_production_odds_calculation_jobs')return Response.json({ok:true,jobs:[{
   job_id:jobId,tournament_id:'2026',phase:'Final Results',status:'SUCCEEDED',result_payload:{teams:[]},
   input_snapshot:{private:true},checkpoint_payload:{private:true},claim_token:'private',source_revision:{private:true}}]});
  return Response.json({ok:true,publication:{state:'NEVER_PUBLISHED',revision:0,snapshot_id:null}});
 };
 return f;
}
test('Certification Director read returns explicit fresh state and no private worker envelope',async()=>{
 const f=fixture(),result=await readCertificationDirectorOdds({authorization:f.authorization,env:f.env},f.dependencies);
 assert.equal(result.contract,'certification-director-odds-v1');assert.deepEqual(result.publication,{state:'NEVER_PUBLISHED',revision:0,snapshotId:null});
 assert.equal(result.context.tournamentId,'2026');assert.equal(result.jobs[0].job_id,jobId);
 for(const key of ['input_snapshot','checkpoint_payload','claim_token','source_revision'])assert.equal(result.jobs[0][key],undefined);
 assert.ok(f.requests.slice(1).every(x=>x.input.phase==='DIRECTOR'&&x.input.authorization.role==='DIRECTOR'));
});
for(const kind of ['participant','spectator','signed-out','impersonating','bootstrap'])test(`Certification Odds ${kind} denied before transport`,async()=>{
 const f=fixture();if(kind==='signed-out')f.authorization.status='inactive';
 else if(kind==='impersonating')f.authorization.identity.impersonating=true;
 else if(kind==='bootstrap')f.authorization.source='bootstrap';
 else f.authorization.identity.actor.role=kind==='participant'?'PLAYER':'SPECTATOR';
 await assert.rejects(readCertificationDirectorOdds({authorization:f.authorization,env:f.env},f.dependencies),{code:'DIRECTOR_ODDS_AUTHORIZATION_REQUIRED'});
 assert.equal(f.requests.length,0);
});
test('Certification command requires original identity/context and rejects client authority fields',async()=>{
 const f=fixture();
 for(const extra of [{actor_auth_user_id:'forged'},{resource:{}},{environment:'PRODUCTION'},{expectedContextToken:undefined},{operationRequestId:undefined}]){
  await assert.rejects(mutateCertificationDirectorOdds({authorization:f.authorization,env:f.env,
   input:{action:'calculate',phase:'Final Results',iterations:10000,operationRequestId,expectedContextToken:'b'.repeat(64),...extra}},f.dependencies),{code:'DIRECTOR_ODDS_INPUT_INVALID'});
 }
 assert.equal(f.requests.length,0);
});
test('worker context cannot confer owner publication capability',async()=>{
 const f=fixture(),context=await resolveCertificationRuntimeContext({env:f.env,phase:'WORKERS'},f.dependencies);
 await assert.rejects(certificationOddsRpc('publish_production_championship_odds_v1',{},
  {env:f.env,context,operationRequestId},f.dependencies),{code:'CERTIFICATION_CONTEXT_REQUIRED'});
 assert.equal(f.requests.length,1);
});
test('wrong target and stale context fail closed without fallback',async()=>{
 const f=fixture();f.authorization.identity.tournamentId='2097';
 await assert.rejects(readCertificationDirectorOdds({authorization:f.authorization,env:f.env},f.dependencies),{code:'DIRECTOR_ODDS_SCOPE_MISMATCH'});
 assert.equal(f.requests.length,1);
 f.authorization.identity.tournamentId='2026';
 await assert.rejects(mutateCertificationDirectorOdds({authorization:f.authorization,env:f.env,
  input:{action:'calculate',phase:'Final Results',iterations:10000,operationRequestId,expectedContextToken:'c'.repeat(64)}},f.dependencies),{code:'CERTIFICATION_CONTEXT_STALE'});
 assert.equal(f.requests.length,2);
});
test('lost publication response retains exact operation identity; status does not imply noncommit',async()=>{
 const f=fixture();const transport=f.dependencies.fetchImpl;
 f.dependencies.fetchImpl=(url,init)=>url.endsWith('/dispatch_certification_odds_v1')?Promise.reject(new Error('lost ACK')):transport(url,init);
 await assert.rejects(certificationOddsRpc('publish_production_championship_odds_v1',{job_id:jobId},
  {env:f.env,operationRequestId,authorization:{}},f.dependencies),{code:'CERTIFICATION_TRANSPORT_UNAVAILABLE',outcome:'UNKNOWN',operationRequestId});
 const count=f.requests.length;
 const recovered=await mutateCertificationDirectorOdds({authorization:f.authorization,env:f.env,
  input:{action:'status',originalAction:'publish',operationRequestId}},f.dependencies);
 assert.equal(recovered.state,'UNKNOWN');assert.equal(f.requests.length,count+1);
 assert.match(f.requests.at(-1).url,/read_certification_odds_operation_v1$/);
});
test('client command captures reviewed first CAS and remains stable for explicit retry',async()=>{
 const state={contract:'certification-director-odds-v1',context:{token:'b'.repeat(64),tournamentId:'2026'},publication:{revision:0,snapshotId:null}};
 const command=canonicalDirectorOddsCommand({action:'publish',jobId,confirmPublication:true},state,operationRequestId);
 state.publication.revision=9;state.publication.snapshotId='88888888-8888-4888-8888-888888888888';
 assert.equal(command.expectedPublicationRevision,0);assert.equal(command.expectedSnapshotId,null);
 assert.equal(command.operationTournamentId,'2026');
 const seen=[];
 for(let i=0;i<2;i++)await assert.rejects(canonicalDirectorOddsRequest(command,{fetchImpl:async(_url,init)=>{
  seen.push(init.body);return Response.json({code:'CERTIFICATION_TRANSPORT_UNAVAILABLE',outcome:'UNKNOWN',operationRequestId},{status:503});
 }}),{operationRequestId,outcome:'UNKNOWN'});
 assert.equal(seen[0],seen[1]);
 const legacy={action:'calculate',phase:'Final Results',iterations:10000};assert.equal(canonicalDirectorOddsCommand(legacy,{jobs:[]}),legacy);
});

test('status retains original receipt target after annual advance without granting a historical write',async()=>{
 const f=fixture();f.authorization.identity.tournamentId='2097';
 await mutateCertificationDirectorOdds({authorization:f.authorization,env:f.env,
  input:{action:'status',originalAction:'publish',operationRequestId,operationTournamentId:'2026'}},f.dependencies);
 const sent=f.requests.at(-1);assert.match(sent.url,/read_certification_odds_operation_v1$/);
 assert.equal(sent.input.payload.target_tournament_id,'2026');assert.equal(sent.input.authorization.tournament_id,'2026');
 assert.equal(sent.input.authorization.auth_user_id,f.authorization.identity.authUserId);
 assert.equal(sent.input.authorization.player_id,f.authorization.identity.actor.id);
 assert.equal(f.requests.length,1);
 f.authorization.identity.tournamentId='2026';
 await assert.rejects(mutateCertificationDirectorOdds({authorization:f.authorization,env:f.env,
  input:{action:'calculate',phase:'Final Results',iterations:10000,operationRequestId,expectedContextToken:'b'.repeat(64),operationTournamentId:'2097'}},f.dependencies),
 {code:'DIRECTOR_ODDS_SCOPE_MISMATCH'});
 assert.equal(f.requests.length,2);
});
