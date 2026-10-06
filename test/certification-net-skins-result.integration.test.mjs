// Owned PG17+pg-safeupdate. Shipping routes, configuration, calculator and
// canonical claim/completion run unchanged. No hosted/project sockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createCalcuttaQueueFixture} from './support/reliability/certification-calcutta-queue-fixture.mjs';
import {netSkinsParticipantRoute} from './support/reliability/certification-net-skins-read-proof.mjs';
import {destroyIsolatedCluster,sqlFile,sqlResult,jsonLiteral,repositoryRoot} from './support/reliability/postgres17.mjs';
import {entryDraft,entrySaveRequest} from '../lib/net-skins-entry-workspace.js';
import {certificationOperationRpc,certificationProjectionRpc} from '../lib/certification-runtime-server.js';
import {certificationReadAliasRpc} from '../lib/certification-read-adapters.js';
import {processProductionNetSkinsV1Job} from '../lib/production-net-skins-server.js';
import {fixtureIdentities} from '../tools/reliability/certification-part2a-fixture.mjs';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-net-skins-result-read-v1.sql';
const oldRoute=execFileSync('git',['show','434cd813838017f51651b9fa2236d071782a4288:app/api/leaderboards/net-skins/route.js'],{cwd:repositoryRoot,encoding:'utf8'});
test('Full Net Skins: exact 400 predicate, read-only Certification V1 parity and canonical calculation lifecycle',async t=>{
 const f=await createCalcuttaQueueFixture({emptyAuction:false}),q=f.q,evidence={hosted:false,postgres:17,safeupdate:'on',cases:[]};
 const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){failure=e;throw e;}});if(failure)throw failure;};
 const install=()=>sqlFile(f.cluster,f.database,artifact,{role:''});
 const invoke=(op,payload,authorization=f.authorization,id=randomUUID())=>certificationOperationRpc(op,payload,{env:f.env,authorization,operationRequestId:id},f.dependencies);
 const read=async(route,path)=>{const r=await route.get(path);return {status:r.status,data:await r.json()};};
 const jobCount=()=>q('select count(*)from scoring_authority.net_skins_v1_recalculation_jobs');
 const resultCount=()=>q('select count(*)from scoring_authority.net_skins_v1_result_revisions');
 const financial=()=>q("select jsonb_build_object('config',(select jsonb_agg(to_jsonb(c))from scoring_authority.net_skins_v1_configuration_revisions c),'entries',(select jsonb_agg(to_jsonb(e))from production_control.net_skins_entry_revisions_v1 e))");
 let stack,route,originalFinancial,firstResult,completed;
 const domainDenied=pattern=>error=>pattern.test(error.domainCode||error.code||'');
 const reconcileIngress=()=>{
  for(const row of JSON.parse(q("select coalesce(jsonb_agg(to_jsonb(l)),'[]')from production_control.certification_ingress_leases_v1 l where state in('ADMITTED','UNKNOWN')"))){
   const b={contract_version:'certification-runtime-v1',...f.envelope,phase:'DIRECTOR',operation_id:row.operation_id,operation_request_id:row.operation_request_id,payload:{}};
   const r=sqlResult(f.cluster,f.database,`set role service_role;select public.resolve_certification_ingress_v1(${jsonLiteral(b)})`,{role:'service_role'});assert.equal(r.status,0,r.stderr);
  }
 };
 const drainOrdinary=async()=>{
  reconcileIngress();f.start();const entry=f.batch().messages[0];f.register(entry);await f.due(entry);
  const drain=await f.consume(entry);assert.equal(drain.outcome,'SUCCEEDED',JSON.stringify(drain));f.stop();
 };
 const requests=new Map(),calls=[];
 // Only the provider-specific Production transport is substituted. The shipping
 // processor itself and Director actor/CAS validation execute against owned SQL.
 // This is not a claim that a Certification HTTP process route already exists.
 const processOptions={env:f.env,dependencies:{resolveScoringDispatchContext:async()=>({runtime:{tournamentId:'2026'}}),getActivation:()=>({}),
  rpc:async(name,payload)=>{
   if(name==='inspect_production_cutover_authority')return {payload:{ok:true,authority:'SUPABASE',activation_revision:f.context().activation_revision}};
   const operation={claim_production_net_skins_v1_recalculation:'DIRECTOR.NET_SKINS_CLAIM',complete_production_net_skins_v1_recalculation:'DIRECTOR.NET_SKINS_COMPLETE',fail_production_net_skins_v1_recalculation:'DIRECTOR.NET_SKINS_FAIL'}[name];assert.ok(operation,name);
   const clean={...payload};delete clean.expected_activation_revision;
   const key=name+':'+payload.request_fingerprint;if(!requests.has(key))requests.set(key,randomUUID());
   calls.push({operation,payload:clean,id:requests.get(key)});
   return invoke(operation,clean,f.authorization,requests.get(key));
  }}};
 const process=fingerprint=>processProductionNetSkinsV1Job({expectedConfigurationRevision:1,workerId:'local-director-full-net',requestFingerprint:fingerprint},processOptions);
 try{
  sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/certification-calcutta-publication-v1.sql',{role:''});
  f.toggle(true);stack=await f.director();assert.equal((await f.mutation('prepare-scoring-context',{matchId:'2026-R3-12'})).payload.ok,true);
  const round=(await stack.transport.entriesRequest()).rounds.find(r=>r.roundNumber===3),draft=entryDraft(round);
  draft.configured=true;draft.entries[round.entrants.findIndex(e=>e.playerIds.includes('P12'))].entered=true;
  assert.equal((await stack.transport.entriesRequest(entrySaveRequest(round,draft,randomUUID()))).revision,1);
  await stack.transport.netSkinsConfigurationRequest({expectedConfigurationRevision:0,eligibleRoundNumbers:[3],entryRevisions:{3:1},operationRequestId:randomUUID()});
  originalFinancial=financial();
  await check('exact valid GET reproduces 400 at legacy write input.environment=PREVIEW, before a DB write',async()=>{
   const old=await netSkinsParticipantRoute(f,{routeSource:oldRoute}),r=await read(old);
   assert.equal(r.status,400);assert.equal(r.data.code,'CERTIFICATION_INPUT_INVALID');
   assert.equal(old.errors.at(-1).message,'Certification read payload contains authority.');
   const write=old.rpcCalls.find(c=>c.name==='write_net_skins_derived_results');assert.equal(write.body.input.environment,'PREVIEW');
   assert.equal(resultCount(),'0');assert.equal(jobCount(),'0');assert.equal(old.afterCalls.length,0);
   evidence.rootCause={status:400,field:'input.environment',value:'PREVIEW',predicate:'nonempty authority field in certificationReadAliasRpc',operation:write.name};
  });
  f.toggle(false);
  const metadata=()=>q("select jsonb_agg(jsonb_build_object('id',oid,'owner',proowner,'acl',proacl,'definer',prosecdef,'config',proconfig,'volatile',provolatile)order by oid)from pg_proc where oid in('public.read_production_net_skins_frozen_2026_v1(jsonb)'::regprocedure,'public.read_certification_projection_v1(jsonb)'::regprocedure)");
  const rls=()=>q("select jsonb_agg(jsonb_build_object('id',oid,'rls',relrowsecurity,'force',relforcerowsecurity,'acl',relacl)order by oid)from pg_class where relkind='r'and relnamespace in('scoring_authority'::regnamespace,'participant_identity'::regnamespace,'production_control'::regnamespace)");
  const beforeMetadata=metadata(),beforeRls=rls(),source=await readFile(artifact,'utf8'),patches=JSON.parse(source.split('$manifest$')[1]);
  await check('forward mismatch rolls back; exact install/replay preserve metadata, RLS, history and safeupdate',()=>{
   const mismatch=sqlResult(f.cluster,f.database,source.replace(patches[0].old_hash,'0'.repeat(64)),{role:''});assert.notEqual(mismatch.status,0);assert.match(mismatch.stderr,/PREDECESSOR_MISMATCH/);
   assert.equal(q("select to_regprocedure('production_control.canonical_read_net_skins_v1(jsonb,jsonb)')is null"),'t');
   install();const definitions=q("select jsonb_agg(prosrc order by oid)from pg_proc where oid in('public.read_production_net_skins_frozen_2026_v1(jsonb)'::regprocedure,'public.read_certification_projection_v1(jsonb)'::regprocedure)");install();assert.equal(definitions,q("select jsonb_agg(prosrc order by oid)from pg_proc where oid in('public.read_production_net_skins_frozen_2026_v1(jsonb)'::regprocedure,'public.read_certification_projection_v1(jsonb)'::regprocedure)"));
   assert.equal(metadata(),beforeMetadata);assert.equal(rls(),beforeRls);assert.equal(q("select current_setting('safeupdate.enabled')"),'on');assert.equal(financial(),originalFinancial);
  });
  await check('private helper ACL drift blocks replay; anon/authenticated/service_role cannot call it directly',()=>{
   for(const role of ['anon','authenticated','service_role'])assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select production_control.canonical_read_net_skins_v1('{}',null)`,{role}).status,0);
   q('grant execute on function production_control.canonical_read_net_skins_v1(jsonb,jsonb)to anon');assert.throws(install,/PRIVATE_ACL_DRIFT/);
   q('revoke execute on function production_control.canonical_read_net_skins_v1(jsonb,jsonb)from anon');install();
  });
  f.toggle(true);stack=await f.director();route=await netSkinsParticipantRoute(f);
  await check('pre-result valid participant GET=200 CONFIGURED; no calculation, claim, after-hook or private provenance',async()=>{
   const r=await read(route);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.data.netSkinsState.state,'CONFIGURED');assert.deepEqual(r.data.data.netSkins.results,[]);
   assert.equal(jobCount(),'0');assert.equal(resultCount(),'0');assert.equal(route.afterCalls.length,0);assert.ok(route.rpcCalls.every(c=>c.name==='read_production_net_skins_v1'));
   assert.doesNotMatch(JSON.stringify(r.data),/Fingerprint|fingerprint|request_fingerprint|claim_token|receipt|audit|fullNetDetail/);
   evidence.preResult=r.data.data;
  });
  const match=()=>JSON.parse(q("select to_jsonb(m)from scoring_authority.matches m where match_id='2026-R3-12'"));
  const control=async action=>{const m=match();return stack.transport.controlRequest(action,{matchId:m.match_id,expectedMatchRevision:m.match_revision,expectedPermissionRevision:m.permission_revision,operationRequestId:randomUUID()});};
  assert.equal((await f.mutation('prepare-scoring-context',{matchId:'2026-R3-12'})).payload.ok,true);
  await control('mark-live');await control('access-activate');
  for(let hole=1;hole<=18;hole++){
   const m=match(),key='local:net.result:h'+hole,actor={tournament_id:'2026',role:'PLAYER',player_id:'P12',auth_user_id:fixtureIdentities[1].auth_user_id,match_id:m.match_id,permission_revision:m.permission_revision};
   const r=await invoke('SCORING.SUBMIT_HOLE',{match_id:m.match_id,mutation_key:key,hole_number:hole,expected_match_revision:m.match_revision,expected_hole_revision:0,team_1_gross_scores:[4],team_2_gross_scores:[5]},actor,key);assert.equal(r.payload.ok,true);
  }
  await check('real shipping full-Net processor on existing canonical Director transport creates PROVISIONAL; read withholds payouts',async()=>{
   const before=await read(route);assert.equal(before.status,200);assert.equal(before.data.data.netSkinsState.state,'IN_PROGRESS');assert.equal(resultCount(),'0');assert.deepEqual(before.data.data.netSkins.results,[]);
   const r=await process('a'.repeat(64));assert.equal(r.ok,true);assert.equal(r.empty,false);
   firstResult=JSON.parse(q('select to_jsonb(r)from scoring_authority.net_skins_v1_result_revisions r where is_current'));assert.equal(firstResult.result_state,'PROVISIONAL');assert.equal(firstResult.published_at,null);
   const readback=await read(route);assert.equal(readback.status,200);assert.equal(readback.data.data.netSkinsState.state,'IN_PROGRESS');assert.deepEqual(readback.data.data.netSkins.results,[]);
   assert.ok(readback.data.data.netSkins.rounds.every(r=>r.skins.length===0&&r.leaderboard.length===0));evidence.provisional={revision:firstResult.result_revision,publication:'WITHHELD'};
  });
  await check('finalized sole opted-in match permits OFFICIAL despite secondary incomplete; canonical completion also publishes',async()=>{
   await f.source(stack);
   const m=match(),key='local:net.result:final';await invoke('SCORING.FINALIZE_MATCH',{match_id:m.match_id,mutation_key:key,expected_match_revision:m.match_revision},{...f.authorization,match_id:m.match_id,permission_revision:m.permission_revision},key);
   // Resolve lawful score-derived intents first. NET_SKINS remains waiting for
   // its existing Director processor, not an invented Queue engine.
   await drainOrdinary();
   const r=await process('b'.repeat(64));assert.equal(r.ok,true);completed=JSON.parse(q('select to_jsonb(r)from scoring_authority.net_skins_v1_result_revisions r where is_current'));
   assert.equal(completed.result_state,'OFFICIAL');assert.ok(completed.published_at);assert.ok(completed.public_result_payload.skins.length>0);
   assert.equal(q("select status from scoring_authority.matches where match_id='2026-R3-11'"),'UPCOMING');assert.equal(q("select count(*)from scoring_authority.hole_scores where match_id='2026-R3-12'"),'18');
   assert.equal(financial(),originalFinancial);assert.equal(q('select count(*)from scoring_authority.net_skins_v1_result_revisions where is_current'),'1');
   assert.equal(q("select count(*)from production_control.cutover_operation_receipts where operation='NET_SKINS_V1_COMPLETE'"),'2');
   assert.equal(q("select count(*)from production_control.operation_audit_events where event_type='PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED'"),'2');
   assert.equal(q("select count(*)from scoring_authority.audit_events where action='PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED'"),'2');
   evidence.eligibility={entryPlayer:'P12',round:3,primary:'FINAL',secondary:'UPCOMING',publication:'OFFICIAL_ONLY',result:completed.result_revision};
  });
  await check('actual failed route now supplies summary, winners and 18 public hole/detail cells; no internal source/configuration tree',async()=>{
   const r=await read(route);assert.equal(r.status,200);const round=r.data.data.netSkins.rounds[0];assert.equal(round.resultState,'OFFICIAL');assert.equal(round.skinsAwarded,18);assert.equal(round.pot,25);assert.equal(round.leaderboard.length,1);assert.equal(round.leaderboard[0].holeResults.length,18);
   const presentation=await read(route,'/api/leaderboards/net-skins?presentation=participant');assert.equal(presentation.status,200,JSON.stringify(presentation));
   const p=presentation.data.data.presentation;assert.ok(p,JSON.stringify(presentation));assert.equal(p.rounds[0].holes.length,18);assert.equal(p.rounds[0].winners.length,1);
   for(const response of [r,presentation])assert.doesNotMatch(JSON.stringify(response.data),/Fingerprint|fingerprint|claim_token|request_fingerprint|receipt|audit|fullNetDetail|snapshotId|handicapRevisionId/);
   assert.equal(route.afterCalls.length,0);evidence.officialRead={summary:r.data.data,presentation:presentation.data.data};
  });
  await check('calculation replay and exact completion replay retain one immutable current result and historical provisional evidence',async()=>{
   const before=resultCount();await process('b'.repeat(64));assert.equal(resultCount(),before);
   const completion=calls.findLast(c=>c.operation==='DIRECTOR.NET_SKINS_COMPLETE');const again=await invoke(completion.operation,completion.payload,f.authorization,completion.id);assert.equal(again.payload.ok,true);assert.equal(again.payload.idempotent,true);
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_result_revisions where is_current'),'1');
   const historical=JSON.parse(q(`select to_jsonb(r)from scoring_authority.net_skins_v1_result_revisions r where result_id='${firstResult.result_id}'`));
   assert.equal(historical.result_state,'PROVISIONAL');assert.equal(historical.is_current,false);assert.ok(historical.superseded_at);
  });
  await check('stale configuration/entry/source and lost-ownership completion denied; no duplicate output',async()=>{
   await assert.rejects(invoke('DIRECTOR.NET_SKINS_CLAIM',{expected_configuration_revision:99,worker_id:'local-stale',request_fingerprint:'e'.repeat(64)}),domainDenied(/CONFIGURATION_REVISION_CONFLICT/));
   const completion=calls.findLast(c=>c.operation==='DIRECTOR.NET_SKINS_COMPLETE');
   for(const altered of [{source_fingerprint:'0'.repeat(64)},{claim_token:randomUUID()},{expected_result_revision:99}])await assert.rejects(invoke(completion.operation,{...completion.payload,...altered,request_fingerprint:createHash('sha256').update(JSON.stringify(altered)).digest('hex')}),domainDenied(/LEASE_REQUIRED|CONFLICT/));
   await assert.rejects(stack.transport.netSkinsConfigurationRequest({expectedConfigurationRevision:1,eligibleRoundNumbers:[3],entryRevisions:{3:99},operationRequestId:randomUUID()}));
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_result_revisions where is_current'),'1');
  });
  await check('server-bound identity; signed-out, foreign player/resource/project/deployment/release and client authority denied',async()=>{
   const signedOut=await netSkinsParticipantRoute(f,{signedOut:true});assert.equal((await read(signedOut)).status,401);
   await assert.rejects(certificationReadAliasRpc('read_production_net_skins_v1',{input:{player_id:'foreign'}},{env:f.env,certificationDependencies:f.dependencies}),domainDenied(/DENIED/));
   for(const payload of [{player_id:'P12',resource:'PRODUCTION'},{player_id:'P12',deployment:'foreign'},{player_id:'P12',tournament_id:'2027'}])await assert.rejects(certificationReadAliasRpc('read_production_net_skins_v1',{input:payload},{env:f.env,certificationDependencies:f.dependencies}));
   const other=await netSkinsParticipantRoute(f,{playerId:'P11'});assert.equal((await read(other)).status,200); // published tournament results are shared, private own state is not.
   const query=await read(route,'/api/leaderboards/net-skins?player_id=P11&resource=PRODUCTION');assert.equal(query.data.player.id,'P12');
   for(const changed of [{VERCEL_DEPLOYMENT_ID:'dpl_foreign'},{VERCEL_GIT_COMMIT_SHA:'f'.repeat(40)},{SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co'},{BAGGER_CERTIFICATION_RESOURCE_ID:'PRODUCTION:foreign'},{VERCEL_ENV:'production'},{VERCEL_ENV:'development'}])await assert.rejects(certificationProjectionRpc('READS.NET_SKINS_V1',{player_id:'P12'},{env:{...f.env,...changed}},f.dependencies));
   for(const role of ['anon','authenticated','service_role'])assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select public.read_certification_projection_v1('{}')`,{role}).status,0);
   for(const role of ['anon','authenticated']){
    const privateRead=sqlResult(f.cluster,f.database,`set role ${role};select count(*)from scoring_authority.net_skins_v1_configuration_revisions`,{role});
    assert.ok(privateRead.status!==0||privateRead.stdout.trim()==='0','private rows must be denied or filtered by existing RLS');
   }
  });
  await check('Production wrapper retains guard; result projection core matches original shipping body after authority preamble',()=>{
   const extracted=source.split('as $body$')[1].split('$body$;')[0],old=patches[0].old;
   assert.equal(extracted.slice(extracted.indexOf('  select value.* into strict current_value')),old.slice(old.indexOf('  select value.* into strict current_value')));
   const privateWrapper=sqlResult(f.cluster,f.database,"set role service_role;select public.read_production_net_skins_frozen_2026_v1('{}')",{role:'service_role'});assert.notEqual(privateWrapper.status,0);assert.match(privateWrapper.stderr,/permission denied/);
   const denied=sqlResult(f.cluster,f.database,"select public.read_production_net_skins_frozen_2026_v1('{}')",{role:'service_role'});assert.notEqual(denied.status,0);assert.match(denied.stderr,/assert_production_cutover_read_scope/);
  });
  // The fixture's lawful scores/lifecycle create ordinary derived work. Drain
  // it through the existing Queue model, never through a participant read.
  await drainOrdinary();
  f.toggle(false);
  await check('safe OFF/disabled/paused checkpoint retains results and denies reads through closed Certification admission',async()=>{
   const closed=await read(route);assert.equal(closed.status,403);assert.equal(closed.data.code,'CANONICAL_RESOURCE_DEPLOYMENT_DENIED');assert.equal(q("select count(*)from scoring_authority.net_skins_v1_recalculation_jobs where status in('PENDING','RUNNING')"),'0');
   assert.equal(q("select count(*)from scoring_authority.net_skins_v1_recalculation_jobs where claim_token is not null"),'0');assert.equal(financial(),originalFinancial);
   assert.equal(q("select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');
   assert.equal(f.status().enabled,false);
   for(const name of ['pending_work','active_claims','active_leases','dead_letters'])assert.equal(f.status().counts[name],0,name);
   evidence.finalCheckpoint={supervisor:f.status().state,admission:q('select enabled from production_control.certification_admission_v1'),
    ingress:q("select count(*)from scoring_authority.ingress_gates where state<>'PAUSED'"),netJobs:0,netClaims:0,unresolvedDirectorOperations:0,workerCounts:f.status().counts};
  });
 }finally{
  await mkdir(repositoryRoot+'/docs/reliability/phase2d-net-skins-result/evidence',{recursive:true});
  await writeFile(repositoryRoot+'/docs/reliability/phase2d-net-skins-result/evidence/integration.json',JSON.stringify(evidence,null,2)+'\n');
  await destroyIsolatedCluster(f.cluster);
 }
});
