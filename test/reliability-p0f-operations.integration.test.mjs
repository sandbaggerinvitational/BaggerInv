// Actual shipping client -> route handler -> server operation -> owned PostgreSQL.
// The external account session adapter is substituted with a synthetic identity;
// current database identity/link/membership/entitlement and domain code are real.
// No hosted resource or Google API is called. No privileged browser access.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createP0FFinancialFixture} from './support/reliability/p0f-financial-fixture.mjs';
import {destroyIsolatedCluster,sqlFile,repositoryRoot} from './support/reliability/postgres17.mjs';
import {readIsolatedDirectorOperations,mutateIsolatedDirectorOperations,resolveIsolatedDirectorOperation} from '../lib/isolated-director-operations.js';
import {createCanonicalDirectorOperationsTransport} from '../lib/canonical-director-operations-client.js';
import {entryDraft,entrySaveRequest} from '../lib/net-skins-entry-workspace.js';
import {predecessor} from '../lib/calcutta-management-model.js';

async function stack(f,options={}){
 const env={VERCEL_ENV:'development',NODE_ENV:'test',SUPABASE_SCORING_MIRROR_URL:f.envelope.resource.project_url,SUPABASE_SCORING_MIRROR_SECRET_KEY:'owned-fixture-only',BAGGER_ISOLATED_DIRECTOR_BINDING_ID:f.envelope.resource.binding_id};
 const authorization={status:'active',source:'entitlement',identity:{authUserId:f.envelope.authorization.auth_user_id,actor:{id:f.envelope.authorization.player_id,role:'DIRECTOR'},tournamentId:'2026'}};
 const calls=[];const rpc=async(name,{input})=>{calls.push({name,input});try{return{payload:f.call(name,input)};}catch(error){throw {shadowDiagnostics:{message:error.message,code:/57014/.test(error.message)?'57014':'P0001'}};}};
 const key='p0f-integration-'+randomUUID();globalThis[key]={NextResponse:Response,withOperationalRoute:(_,fn)=>fn,recordOperationalError:()=>{},authorizePreviewDirector:async()=>authorization,
  readIsolatedDirectorOperations:args=>readIsolatedDirectorOperations({...args,env},{rpc}),
  mutateIsolatedDirectorOperations:args=>mutateIsolatedDirectorOperations({...args,env},{rpc}),
  resolveIsolatedDirectorOperation:args=>resolveIsolatedDirectorOperation({...args,env},{rpc})};
 const source=(await readFile(new URL('../app/api/director/canonical-operations/route.js',import.meta.url),'utf8')).replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_,names)=>`const {${names.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`);
 let route;try{route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+key);}finally{delete globalThis[key];}
 const requests=[];const fetchImpl=async(url,init)=>{
  assert.ok(url.startsWith('/api/director/canonical-operations'));requests.push({url,init});
  const req=new Request('http://localhost'+url,{...init,headers:{...init.headers,origin:'http://localhost'}});
  const response=await route[init.method](req);
  if(!response.ok){const error=await response.clone().json();process.stderr.write(JSON.stringify({event:'isolated-api-denial',status:response.status,code:error.code,domainCode:error.domainCode})+'\n');}
  if(options.loseResponse?.(url,init,response))throw new Error('controlled post-handler response loss');
  return response;
 };
 return{transport:createCanonicalDirectorOperationsTransport({fetchImpl}),calls,requests};
}

test('P0F seven required capability identities use actual canonical PostgreSQL with Google unavailable',async t=>{
 const f=await createP0FFinancialFixture();t.after(()=>destroyIsolatedCluster(f.cluster));
 sqlFile(f.cluster,f.database,path.join(repositoryRoot,'supabase/production_migrations/202609300130_isolated_setup_control_cores_v1.sql'),{role:''});
 const s=await stack(f),transport=s.transport;
 const legacyQueues=['scoring_authority.google_outbox_events','scoring_authority.scorecard_archive_jobs','scoring_authority.odds_google_mirror_jobs','production_control.future_match_google_compatibility_jobs_v1'];
 const queueCounts=()=>legacyQueues.map(table=>Number(f.query(`select count(*) from ${table}`)));
 const queuesBefore=queueCounts();
 await t.test('BROAD-NEW-007 course/tee and approved handicap authority through shipping adapter',async()=>{
  const model=(await transport.setupRequest()).data;assert.match(model.approvedHandicapRevisionId,/^[a-f0-9-]{36}$/);const course=model.courses.find(c=>c.roundNumber===1);assert.ok(course);assert.equal(course.holes.length,18);
  const r=await transport.setupRequest({action:'upsert-course',operationRequestId:randomUUID(),expectedRevision:model.revision,roundNumber:1,courseId:course.courseId,courseName:course.name+' API',city:course.city,state:course.state,tee:course.tee,rating:course.rating,slope:course.slope,par:course.par,holes:course.holes});
  assert.equal(r.data.action,'UPSERT_COURSE');assert.equal(r.canonical.approvedHandicapRevisionId,model.approvedHandicapRevisionId);assert.equal(r.canonical.courses.find(c=>c.courseId===course.courseId).name,course.name+' API');
 });
 await t.test('BROAD-NEW-008 shared reviewed operation ID, receipt, readback and retry pipeline',async()=>{
  const model=(await transport.setupRequest()).data,team=model.teams[0],id=randomUUID();const input={action:'update-team',operationRequestId:id,expectedRevision:model.revision,teamId:team.teamId,teamName:team.name+' API',captainPlayerId:team.captainPlayerId||model.roster.find(p=>p.teamId===team.teamId).playerId};
  const saved=await transport.setupRequest(input),replay=await transport.setupRequest(input);assert.equal(saved.data.revision,replay.data.revision);assert.deepEqual(replay.data,saved.data);
  await assert.rejects(transport.setupRequest({...input,teamName:'Conflicting'}),{code:'DIRECTOR_OPERATIONS_IDENTITY_CONFLICT'});
 });
 await t.test('RECOVERY response loss then changed context finds exact prior receipt without replay',async()=>{
  let lost=false;const p=await stack(f,{loseResponse:(_url,init,response)=>{const lose=!lost&&init.method==='POST'&&!JSON.parse(init.body).mode&&response.ok;if(lose)lost=true;return lose;}});const model=(await p.transport.setupRequest()).data,team=model.teams[0],id=randomUUID();
  const input={action:'update-team',operationRequestId:id,expectedRevision:model.revision,teamId:team.teamId,teamName:team.name+' Recovery',captainPlayerId:team.captainPlayerId||model.roster.find(p=>p.teamId===team.teamId).playerId};await assert.rejects(p.transport.setupRequest(input),{outcome:'UNKNOWN'});assert.equal(lost,true);
  f.query('update production_control.isolated_director_context_v1 set activation_revision=activation_revision+1');
  const result=await p.transport.resolve(id);assert.equal(result.outcome,'COMMITTED');assert.equal(result.readbackVerified,true);assert.equal(result.receipt.action,'UPDATE_TEAM');assert.equal(p.calls.filter(c=>c.name==='execute_isolated_director_operation_v1').length,1);
  assert.equal((await p.transport.setupRequest()).data.teams.find(v=>v.teamId===team.teamId).name,input.teamName);
 });
 await t.test('BROAD-NEW-009 atomic full round pairing replacement with frozen handicap reference',async()=>{
  const model=(await transport.setupRequest()).data,matches=structuredClone(model.matches.filter(m=>m.roundNumber===1));
  [matches[0].participants[0].playerId,matches[1].participants[0].playerId]=[matches[1].participants[0].playerId,matches[0].participants[0].playerId];
  const result=await transport.setupRequest({action:'replace-round-pairings',operationRequestId:randomUUID(),expectedRevision:model.revision,roundNumber:1,expectedHandicapRevisionId:model.approvedHandicapRevisionId,matches});
  assert.equal(result.data.action,'REPLACE_ROUND_PAIRINGS');for(const row of matches)assert.deepEqual(result.canonical.matches.find(m=>m.matchId===row.matchId).participants.map(p=>p.playerId),row.participants.map(p=>p.playerId));
 });
 await t.test('BROAD-NEW-010 Net Skins explicit entry ledger and server-owned field authority',async()=>{
  const model=await transport.entriesRequest(),round=model.rounds.find(r=>r.roundNumber===1),draft=entryDraft(round);draft.configured=true;draft.entries[0].entered=true;
  const result=await transport.entriesRequest(entrySaveRequest(round,draft,randomUUID()));assert.equal(result.financialMutationCreated,false);assert.equal(result.scoringMutationCreated,false);assert.equal(result.publicationCreated,false);
  const saved=(await transport.entriesRequest()).rounds.find(r=>r.roundNumber===1);assert.equal(saved.entrants[0].entered,true);assert.equal(saved.revision,result.revision);
 });
 await t.test('BROAD-NEW-012 contextual lifecycle refuses Mark Live before current preparation',async()=>{
  const matches=(await transport.controlRead()).matches,match=matches.find(m=>m.matchId==='2026-R1-1');
  await assert.rejects(transport.controlRequest('mark-live',{match_id:match.matchId,expected_match_revision:match.matchRevision,expected_permission_revision:match.permissionRevision,operationRequestId:randomUUID()}),{code:'DIRECTOR_OPERATIONS_DOMAIN_REJECTED'});
  assert.equal((await transport.controlRead()).matches.find(m=>m.matchId===match.matchId).status,'UPCOMING');
 });
 await t.test('BROAD-NEW-174 Prepare then Mark Live, lock, unlock, revoke and activate preserve canonical receipts',async()=>{
  process.stderr.write('prepare-dependencies '+f.query("select production_control.tournament_setup_dependency_codes_v1(null,null,1,'2026-R1-1','SCORING_CONTEXT')::text")+'\n');
  const model=(await transport.setupRequest()).data;await transport.setupRequest({action:'prepare-scoring-context',operationRequestId:randomUUID(),expectedRevision:model.revision,matchId:'2026-R1-1'});
  for(const action of ['mark-live','scoring-lock','scoring-unlock','access-revoke','access-activate']){
   const match=(await transport.controlRead()).matches.find(m=>m.matchId==='2026-R1-1');const result=await transport.controlRequest(action,{match_id:match.matchId,expected_match_revision:match.matchRevision,expected_permission_revision:match.permissionRevision,operationRequestId:randomUUID()});assert.equal(result.receipt.ok,true);assert.equal(result.readbackVerified,true);
  }
  const current=(await transport.controlRead()).matches.find(m=>m.matchId==='2026-R1-1');assert.equal(current.status,'LIVE');assert.equal(current.scoringLocked,false);assert.equal(current.accessState,'ACTIVE');
 });
 await t.test('BROAD-NEW-011 Calcutta purchase/ownership and clear are canonical, unpublished, no configuration write',async()=>{
  const model=(await transport.calcuttaRequest('management-read')).data,player=model.players[0],owner=model.players[1];
  const before=f.query("select jsonb_build_object('revision',configuration_revision,'fingerprint',configuration_fingerprint)::text from scoring_authority.calcutta_v1_current where tournament_id='2026'");
  const saved=await transport.calcuttaRequest('management-entry',{...predecessor(model),operationRequestId:randomUUID(),entry:{playerId:player.player_id,purchasePrice:'123.45',owners:[{buyerId:owner.player_id,percentage:'100'}]}});
  assert.equal(saved.readbackVerified,true);assert.equal(saved.data.publication_state,'UNPUBLISHED');assert.equal(String(saved.data.purchases.find(p=>p.player_id===player.player_id).purchase_price),'123.45');
  const cleared=await transport.calcuttaRequest('management-clear-entry',{...predecessor(saved.data),operationRequestId:randomUUID(),playerId:player.player_id});assert.equal(cleared.data.purchases.some(p=>p.player_id===player.player_id),false);
  assert.equal(f.query("select jsonb_build_object('revision',configuration_revision,'fingerprint',configuration_fingerprint)::text from scoring_authority.calcutta_v1_current where tournament_id='2026'"),before);
  await assert.rejects(transport.calcuttaRequest('management-configure',{}),{code:'DIRECTOR_OPERATIONS_INPUT_INVALID'});
 });
 await t.test('SECURITY actual database revocation denies canonical API despite an active account-adapter stub',async()=>{
  f.query("update production_control.director_entitlements set status='REVOKED',revoked_at=now() where player_id='P01'");
  try{await assert.rejects(transport.setupRequest(),{code:'DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED'});}finally{f.query("update production_control.director_entitlements set status='ACTIVE',revoked_at=null where player_id='P01'");}
 });
 assert.equal(s.requests.some(r=>/google|sheets|legacy|preview-environment/.test(r.url)),false);
 assert.equal(s.calls.some(r=>/google|sheets/i.test(r.name)),false);
 assert.equal(f.query("select count(*) from production_control.isolated_financial_audit_context_v1"),'0');
 assert.deepEqual(queueCounts(),queuesBefore,'canonical controls create no retired Google jobs and preserve historical rows');
});
