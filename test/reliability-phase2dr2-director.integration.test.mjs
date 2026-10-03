// Fresh registered Certification resource; real client/API/server/SQL proof.
// The external account-session lookup and HTTP transport are local adapters.
// No Production authority seed, disabled trigger, remote socket or Google call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {destroyIsolatedCluster,jsonLiteral} from './support/reliability/postgres17.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {certificationDirectorStack,provisionCertificationFinancialFixture} from './support/reliability/certification-director-proof.mjs';
import {entryDraft,entrySaveRequest} from '../lib/net-skins-entry-workspace.js';
import {predecessor} from '../lib/calcutta-management-model.js';

const forwardMigrations=certificationProvisionalProfile;
const evidenceFiles=[...forwardMigrations,'test/support/reliability/certification-provisional-profile.mjs','lib/certification-runtime-server.js','lib/isolated-director-operations.js',
 'lib/canonical-director-operations-client.js','app/api/director/canonical-operations/route.js',
 'test/reliability-phase2dr2-director.integration.test.mjs','test/support/reliability/certification-director-proof.mjs'];
const sourceManifest=()=>Object.fromEntries(evidenceFiles.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));

test('Certification seven Director capabilities and reduced financial operations preserve authority',async t=>{
 const beforeSource=sourceManifest(),evidence={environment:'OWNED_LOCAL_POSTGRESQL17',cases:[],
  capabilities:['BROAD-NEW-007','BROAD-NEW-008','BROAD-NEW-009','BROAD-NEW-010','BROAD-NEW-011','BROAD-NEW-012','BROAD-NEW-174'],
  externalNetworkCalls:0,googleCalls:0,productionAccess:false,sessionProof:'SYNTHETIC_SESSION_ADAPTER_REAL_DATABASE_AUTHORIZATION'};
 let f,s;
 const check=async(id,body)=>{let failure;await t.test(id,async()=>{
  try{await body();evidence.cases.push({id,result:'PASS'});}catch(error){failure=error;evidence.cases.push({id,result:'FAIL',error:error.message});throw error;}
 });if(failure)throw failure;};
 try{
  f=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
  s=await certificationDirectorStack(f);const client=s.transport;
  const countLeases=()=>Number(f.q('select count(*)from production_control.certification_ingress_leases_v1'));
  const financialAudit=id=>JSON.parse(f.q(`select details from production_control.operation_audit_events
   where event_type='CERTIFICATION_DIRECTOR_FINANCIAL_OPERATION'and details->>'operation_request_id'='${id}'`));
  const assertOrigin=(id,action)=>{const audit=financialAudit(id);assert.equal(audit.runtime,'CERTIFICATION');
   assert.equal(audit.resource_id,f.resource.resource_id);assert.equal(audit.installation_id,f.resource.installation_id);
   assert.equal(audit.actor_auth_user_id,f.envelope.authorization.auth_user_id);assert.equal(audit.action,action);
   assert.equal(audit.release_commit,f.deployment.release_commit);assert.equal(audit.context_binding_id,f.bindingId);
   assert.equal(f.q(`select state from production_control.certification_ingress_leases_v1 where operation_request_id='${id}'`),'COMMITTED');
   assert.equal(f.q('select count(*)from production_control.isolated_financial_audit_context_v1'),'0');};
  let auctionInput,auctionResult;
  await check('BROAD-NEW-007 course/tee and immutable approved handicap through actual client/API',async()=>{
   const model=(await client.setupRequest()).data,course=model.courses.find(row=>row.roundNumber===1);
   assert.ok(course);assert.equal(course.holes.length,18);assert.match(model.approvedHandicapRevisionId,/^[a-f0-9-]{36}$/);
   const result=await client.setupRequest({action:'upsert-course',operationRequestId:randomUUID(),expectedRevision:model.revision,
    roundNumber:1,courseId:course.courseId,courseName:course.name+' Canonical',city:course.city,state:course.state,
    tee:course.tee,rating:course.rating,slope:course.slope,par:course.par,holes:course.holes});
   assert.equal(result.data.action,'UPSERT_COURSE');assert.equal(result.canonical.approvedHandicapRevisionId,model.approvedHandicapRevisionId);
   assert.equal(result.canonical.courses.find(row=>row.courseId===course.courseId).name,course.name+' Canonical');
  });
  await check('BROAD-NEW-008 stable operation identity, actual receipt/readback and conflict',async()=>{
   const model=(await client.setupRequest()).data,team=model.teams[0],id=randomUUID();
   const input={action:'update-team',operationRequestId:id,expectedRevision:model.revision,teamId:team.teamId,
    teamName:team.name+' Canonical',captainPlayerId:team.captainPlayerId||model.roster.find(p=>p.teamId===team.teamId).playerId};
   const first=await client.setupRequest(input),again=await client.setupRequest(input);assert.deepEqual(again.data,first.data);
   assert.equal(f.q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${id}'`),'1');
   await assert.rejects(client.setupRequest({...input,teamName:'Different same-ID command'}),{code:'DIRECTOR_OPERATIONS_IDENTITY_CONFLICT'});
  });
  await check('BROAD-NEW-009 atomic complete round pairings retain approved handicap reference',async()=>{
   const model=(await client.setupRequest()).data,matches=structuredClone(model.matches.filter(row=>row.roundNumber===1));
   [matches[0].participants[0].playerId,matches[1].participants[0].playerId]=[matches[1].participants[0].playerId,matches[0].participants[0].playerId];
   const result=await client.setupRequest({action:'replace-round-pairings',operationRequestId:randomUUID(),expectedRevision:model.revision,
    roundNumber:1,expectedHandicapRevisionId:model.approvedHandicapRevisionId,matches});
   for(const row of matches)assert.deepEqual(result.canonical.matches.find(m=>m.matchId===row.matchId).participants.map(p=>p.playerId),row.participants.map(p=>p.playerId));
   assert.equal(result.canonical.approvedHandicapRevisionId,model.approvedHandicapRevisionId);
  });
  await check('BROAD-NEW-012 changed setup fails Mark Live until explicit current preparation',async()=>{
   const match=(await client.controlRead()).matches.find(row=>row.matchId==='2026-R1-1');
   await assert.rejects(client.controlRequest('mark-live',{matchId:match.matchId,expectedMatchRevision:match.matchRevision,expectedPermissionRevision:match.permissionRevision,operationRequestId:randomUUID()}),{code:'DIRECTOR_OPERATIONS_DOMAIN_REJECTED'});
   assert.equal((await client.controlRead()).matches.find(row=>row.matchId===match.matchId).status,'UPCOMING');
  });
  // Prepare before opt-ins/financial dependencies; Mark Live follows opt-ins.
  {const model=(await client.setupRequest()).data;await client.setupRequest({action:'prepare-scoring-context',operationRequestId:randomUUID(),expectedRevision:model.revision,matchId:'2026-R1-1'});}
  await check('BROAD-NEW-010 all three formats use immutable Net Skins bindings and truthful financial audit',async()=>{
   for(const roundNumber of[1,2,3]){
    const round=(await client.entriesRequest()).rounds.find(row=>row.roundNumber===roundNumber),draft=entryDraft(round),id=randomUUID();
    draft.configured=true;draft.entries[0].entered=true;
    const result=await client.entriesRequest(entrySaveRequest(round,draft,id));
    assert.equal(result.financialMutationCreated,false);assert.equal(result.scoringMutationCreated,false);assert.equal(result.publicationCreated,false);
    const after=(await client.entriesRequest()).rounds.find(row=>row.roundNumber===roundNumber);
    assert.equal(after.entrants[0].entered,true);assert.equal(after.revision,result.revision);assertOrigin(id,'save');
   }
  });
  await check('BROAD-NEW-174 Prepare/Live/Lock/Unlock/Revoke/Activate remain distinct and audited',async()=>{
   for(const action of['mark-live','scoring-lock','scoring-unlock','access-revoke','access-activate']){
    const match=(await client.controlRead()).matches.find(row=>row.matchId==='2026-R1-1');
    const result=await client.controlRequest(action,{matchId:match.matchId,expectedMatchRevision:match.matchRevision,expectedPermissionRevision:match.permissionRevision,operationRequestId:randomUUID()});assert.equal(result.receipt.ok,true);assert.equal(result.readbackVerified,true);
    if(action==='mark-live')assert.equal(f.q("select count(*)from scoring_authority.scoring_permissions where match_id='2026-R1-1'and can_score"),'0');
   }
   const current=(await client.controlRead()).matches.find(row=>row.matchId==='2026-R1-1');
   assert.equal(current.status,'LIVE');assert.equal(current.scoringLocked,false);assert.equal(current.accessState,'ACTIVE');
  });
  provisionCertificationFinancialFixture(f);
  await check('BROAD-NEW-011 Calcutta replacement/clear preserve ownership, values and publication rules',async()=>{
   const model=(await client.calcuttaRequest('management-read')).data,player=model.players[0],buyer=model.players[1],id=randomUUID();
   const configBefore=f.q("select jsonb_build_object('revision',configuration_revision,'fingerprint',configuration_fingerprint)from scoring_authority.calcutta_v1_current where tournament_id='2026'");
   auctionInput={...predecessor(model),operationRequestId:id,entry:{playerId:player.player_id,purchasePrice:'123.45',owners:[{buyerId:buyer.player_id,percentage:'100'}]}};
   auctionResult=await client.calcuttaRequest('management-entry',auctionInput);
   assert.equal(auctionResult.readbackVerified,true);assert.equal(auctionResult.data.publication_state,'UNPUBLISHED');
   assert.equal(String(auctionResult.data.purchases.find(p=>p.player_id===player.player_id).purchase_price),'123.45');assertOrigin(id,'replace-auction');
   const immutable=f.q(`select md5(auction_manifest::text)from scoring_authority.calcutta_v1_auction_fact_revisions where tournament_id='2026'and auction_revision=${auctionResult.data.auction_revision}`);
   const clearId=randomUUID(),cleared=await client.calcuttaRequest('management-clear-entry',{...predecessor(auctionResult.data),operationRequestId:clearId,playerId:player.player_id});
   assert.equal(cleared.data.purchases.some(p=>p.player_id===player.player_id),false);assertOrigin(clearId,'clear-entry');
   assert.equal(f.q(`select md5(auction_manifest::text)from scoring_authority.calcutta_v1_auction_fact_revisions where tournament_id='2026'and auction_revision=${auctionResult.data.auction_revision}`),immutable);
   assert.equal(f.q("select jsonb_build_object('revision',configuration_revision,'fingerprint',configuration_fingerprint)from scoring_authority.calcutta_v1_current where tournament_id='2026'"),configBefore);
   await assert.rejects(client.calcuttaRequest('management-configure',{}),{code:'DIRECTOR_OPERATIONS_INPUT_INVALID'});
  });
  await check('financial same-ID loss recovery reconstructs immutable predecessor without a second execution',async()=>{
   let lost=false;const isolated=await certificationDirectorStack(f,{loseResponse:(_url,init,response)=>{
    const shouldLose=!lost&&init.method==='POST'&&!JSON.parse(init.body).mode&&response.ok;if(shouldLose)lost=true;return shouldLose;}});
   const model=(await isolated.transport.calcuttaRequest('management-read')).data,id=randomUUID();
   const input={...predecessor(model),operationRequestId:id,entry:{playerId:model.players[0].player_id,purchasePrice:'127.89',owners:[{buyerId:model.players[1].player_id,percentage:'100'}]}};
   await assert.rejects(isolated.transport.calcuttaRequest('management-entry',input),{outcome:'UNKNOWN'});assert.equal(lost,true);
   const result=await isolated.transport.resolve(id);assert.equal(result.outcome,'COMMITTED');assert.equal(result.readbackVerified,true);assertOrigin(id,'replace-auction');
   assert.equal(isolated.calls.filter(c=>c.name==='execute_certification_operation_v1').length,1);
   await assert.rejects(isolated.transport.calcuttaRequest('management-entry',{...input,entry:{...input.entry,purchasePrice:'900'}}),{code:'DIRECTOR_OPERATIONS_IDENTITY_CONFLICT'});
  });
  await check('required financial audit failure rolls back facts/receipt while durable admission remains unresolved',async()=>{
   const isolated=await certificationDirectorStack(f),model=(await isolated.transport.calcuttaRequest('management-read')).data,id=randomUUID();
   const input={...predecessor(model),operationRequestId:id,entry:{playerId:model.players[2].player_id,purchasePrice:'50.01',owners:[{buyerId:model.players[1].player_id,percentage:'100'}]}};
   const facts=()=>f.q("select md5(jsonb_build_object('current',(select to_jsonb(c)from scoring_authority.calcutta_v1_current c where tournament_id='2026'),'history',(select jsonb_agg(to_jsonb(a)order by auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions a),'receipts',(select count(*)from production_control.cutover_operation_receipts))::text)");
   const before=facts();f.q("create function public.certification_test_audit_failure()returns trigger language plpgsql as $$begin if new.event_type='CERTIFICATION_DIRECTOR_FINANCIAL_OPERATION' then raise exception 'CERTIFICATION_TEST_REQUIRED_AUDIT_FAILURE';end if;return new;end$$;create trigger certification_test_audit_failure before insert on production_control.operation_audit_events for each row execute function public.certification_test_audit_failure()");
   try{await assert.rejects(isolated.transport.calcuttaRequest('management-entry',input));}
   finally{f.q('drop trigger certification_test_audit_failure on production_control.operation_audit_events;drop function public.certification_test_audit_failure()');}
   assert.equal(facts(),before);assert.equal(f.q('select count(*)from production_control.isolated_financial_audit_context_v1'),'0');
   assert.equal(f.q(`select count(*)from production_control.operation_audit_events where event_type='CERTIFICATION_DIRECTOR_FINANCIAL_OPERATION'and details->>'operation_request_id'='${id}'`),'0');
   assert.match(f.q(`select state from production_control.certification_ingress_leases_v1 where operation_request_id='${id}'`),/^(ADMITTED|UNKNOWN)$/);
   const outcome=await isolated.transport.resolve(id);assert.equal(outcome.outcome,'UNKNOWN');assert.equal(outcome.receipt,null);
   const admitted=isolated.calls.find(call=>call.name==='admit_certification_operation_v1').input;
   const resolved=f.rpc('resolve_certification_ingress_v1',admitted);assert.equal(resolved.state,'NOT_COMMITTED');
   assert.equal(facts(),before);
  });
  await check('each authority class is fail-closed across every Director read family',async()=>{
   const original=s.authorization,before=countLeases();
   const denied=[{status:'signed-out'}, {...original,identity:{...original.identity,actor:{...original.identity.actor,role:'PLAYER'}}},
    {...original,identity:{...original.identity,actor:{...original.identity.actor,role:'SPECTATOR'}}},
    {...original,identity:{...original.identity,impersonating:true}},
    {...original,identity:{...original.identity,tournamentId:'2097'}},
    {...original,identity:{...original.identity,authUserId:randomUUID()}}];
   const mutationTemplates=new Map(s.requests.filter(row=>row.init.method==='POST').map(row=>JSON.parse(row.init.body)).filter(row=>!row.mode).map(row=>[row.family,row]));
   assert.equal(mutationTemplates.size,5,'Every affected family has an actual successful-path request template');
   try{for(const identity of denied){s.setAuthorization(identity);for(const family of['TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL','NET_SKINS_ENTRIES','CALCUTTA_MANAGEMENT']){
    const response=await s.request('/api/director/canonical-operations?family='+family);assert.equal(response.status,403,JSON.stringify(identity));
    const body=await response.json();assert.equal(body.data,undefined);assert.equal(body.receipt,undefined);
    const deniedWrite=await s.request('/api/director/canonical-operations',{method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({...mutationTemplates.get(family),operationRequestId:randomUUID()})});
    assert.equal(deniedWrite.status,403,`${family}: ${JSON.stringify(identity)}`);
    const deniedBody=await deniedWrite.json();assert.equal(deniedBody.receipt,undefined);assert.notEqual(deniedBody.committed,true);
   }}}finally{s.setAuthorization(original);}
   assert.equal(countLeases(),before);
  });
  await check('server-side entitlement revocation overrides active account adapter and denies financial recovery',async()=>{
   f.q("update production_control.director_entitlements set status='REVOKED',revoked_at=clock_timestamp()where player_id='P01'");
   try{await assert.rejects(client.setupRequest());await assert.rejects(client.calcuttaRequest('management-read'));await assert.rejects(client.resolve(auctionInput.operationRequestId));}
   finally{f.q("update production_control.director_entitlements set status='ACTIVE',revoked_at=null where player_id='P01'");}
  });
  await check('browser privileged fields, cross-origin, stale context and direct private calls are rejected',async()=>{
   const before=countLeases(),base={family:'TOURNAMENT_SETUP',action:'update-tournament',operationRequestId:randomUUID(),expectedContextToken:'0'.repeat(64),payload:{expectedRevision:(await client.setupRequest()).data.revision,name:'Denied'}};
   for(const [input,headers]of[[base,{}],[{...base,payload:{...base.payload,authorization:{role:'DIRECTOR'}}},{}],[base,{origin:'https://untrusted.invalid'}]]){
    const response=await s.request('/api/director/canonical-operations',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(input)});
    assert.ok([400,403,409].includes(response.status),await response.text());
   }
   assert.equal(countLeases(),before);
   for(const role of['anon','authenticated','service_role'])for(const expression of["production_control.canonical_calcutta_auction_core_v1('{}','{}')","production_control.canonical_calcutta_clear_core_v1('{}','{}')","production_control.canonical_net_skins_entries_core_v1('{}')"])
    assert.throws(()=>f.q(`set role ${role};select ${expression}`),/permission denied/);
  });
  await check('Google remains absent; exact resource/provenance and shipping API DTO remain bounded',()=>{
   assert.equal(s.requests.some(row=>/google|sheets|legacy/.test(row.url)),false);
   for(const call of s.calls){assert.equal(call.input.resource.resource_id,f.resource.resource_id);assert.equal(call.input.resource.project_ref,f.resource.project_ref);}
   for(const table of['scoring_authority.google_outbox_events','scoring_authority.scorecard_archive_jobs','scoring_authority.odds_google_mirror_jobs','production_control.future_match_google_compatibility_jobs_v1'])assert.equal(f.q(`select count(*)from ${table}`),'0');
   assert.equal(f.q('select count(*)from production_control.resource_scope'),'0');assert.equal(f.q('select count(*)from production_control.cutover_activation_state'),'0');
   assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');
  });
 }finally{
  evidence.databaseErrors=s?.calls.filter(call=>call.error).map(call=>({name:call.name,error:call.error}))??[];
  const afterSource=sourceManifest();evidence.sourceStable=JSON.stringify(beforeSource)===JSON.stringify(afterSource);evidence.sourceManifest=beforeSource;
  evidence.completed=evidence.cases.filter(row=>row.result==='PASS').length;evidence.failures=evidence.cases.filter(row=>row.result==='FAIL').length;
  evidence.limitations=['Local HTTP/session adapter only; no hosted Auth proof','Synthetic initial Calcutta configuration is fixture provisioning, not a new configuration API','No native physical-device or hosted proof'];
  const directory='docs/reliability/phase2d-resource-model/implementation-evidence';mkdirSync(directory,{recursive:true});
  writeFileSync(directory+'/director-financial-'+new Date().toISOString().replaceAll(':','-')+'.json',JSON.stringify(evidence,null,2)+'\n');
  if(f)await destroyIsolatedCluster(f.cluster);
 }
 assert.equal(evidence.sourceStable,true,'Candidate source changed during proof');
});
