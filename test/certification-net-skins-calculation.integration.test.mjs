import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createCalcuttaQueueFixture} from './support/reliability/certification-calcutta-queue-fixture.mjs';
import {certificationDirectorStack} from './support/reliability/certification-director-proof.mjs';
import {netSkinsParticipantRoute} from './support/reliability/certification-net-skins-read-proof.mjs';
import {sqlFile,sqlResult,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {certificationOperationRpc} from '../lib/certification-runtime-server.js';
import {entryDraft,entrySaveRequest} from '../lib/net-skins-entry-workspace.js';
import {fixtureIdentities} from '../tools/reliability/certification-part2a-fixture.mjs';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-net-skins-calculation-v1.sql';

test('Director Full Net Skins adapter: real route/processor/PG17 safeupdate, truthful claims/results/recovery and participant reads',async t=>{
 const f=await createCalcuttaQueueFixture({emptyAuction:false}),q=f.q,evidence={hosted:false,postgres:17,safeupdate:'on',cases:[]};
 const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){failure=e;throw e;}});if(failure)throw failure;};
 const install=()=>sqlFile(f.cluster,f.database,artifact,{role:''});
 const invoke=(op,payload,authorization=f.authorization,id=randomUUID())=>certificationOperationRpc(op,payload,{env:f.env,authorization,operationRequestId:id},f.dependencies);
 const resultCount=()=>q('select count(*)from scoring_authority.net_skins_v1_result_revisions');
 const read=async(route,path)=>{const r=await route.get(path);return {status:r.status,data:await r.json()};};
 const reconcileIngress=()=>{for(const row of JSON.parse(q("select coalesce(jsonb_agg(to_jsonb(l)),'[]')from production_control.certification_ingress_leases_v1 l where state in('ADMITTED','UNKNOWN')"))){
  const b={contract_version:'certification-runtime-v1',...f.envelope,phase:'DIRECTOR',operation_id:row.operation_id,operation_request_id:row.operation_request_id,payload:{}};
  const r=sqlResult(f.cluster,f.database,`set role service_role;select public.resolve_certification_ingress_v1(${jsonLiteral(b)})`,{role:'service_role'});assert.equal(r.status,0,r.stderr);}};
 const drainOrdinary=async()=>{reconcileIngress();f.start();const e=f.batch().messages[0];f.register(e);await f.due(e);const r=await f.consume(e);assert.equal(r.outcome,'SUCCEEDED',JSON.stringify(r));f.stop();};
 let stack,route,command,official;
 const calculate=async(s=stack,id=randomUUID())=>{const m=await s.transport.netSkinsCalculationRequest();command={expectedConfigurationRevision:m.configuration_revision,entryRevisions:m.entry_revisions,sourceFingerprints:m.source_fingerprints,operationRequestId:id};return s.transport.netSkinsCalculationRequest(command);};
 try{
  for(const x of ['certification-calcutta-publication-v1.sql','certification-net-skins-result-read-v1.sql'])sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/'+x,{role:''});
  const metadata=()=>q("select jsonb_agg(jsonb_build_object('id',oid,'owner',proowner,'acl',proacl,'security',prosecdef,'config',proconfig,'volatile',provolatile)order by oid)from pg_proc where oid in('production_control.certification_operation_phase_v1(text,boolean)'::regprocedure,'production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure)");
  const rls=()=>q("select jsonb_agg(jsonb_build_object('id',oid,'rls',relrowsecurity,'force',relforcerowsecurity,'acl',relacl)order by oid)from pg_class where relkind='r'and relnamespace in('scoring_authority'::regnamespace,'participant_identity'::regnamespace,'production_control'::regnamespace)");
  const before=metadata(),beforeRls=rls(),src=await readFile(artifact,'utf8'),patches=JSON.parse(src.split('$manifest$')[1]);
  await check('atomic hash guard, mismatch rollback, replay, unchanged metadata/RLS and safeupdate enabled',()=>{
   const bad=sqlResult(f.cluster,f.database,src.replace(patches[0].old_hash,'0'.repeat(64)),{role:''});assert.notEqual(bad.status,0);assert.match(bad.stderr,/PREDECESSOR_MISMATCH/);
   assert.equal(q("select to_regprocedure('production_control.dispatch_certification_net_skins_calculation_v1(jsonb,jsonb,boolean)')is null"),'t');
   install();const bodies=q("select jsonb_agg(prosrc order by oid)from pg_proc where oid in('production_control.certification_operation_phase_v1(text,boolean)'::regprocedure,'production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure)");install();assert.equal(metadata(),before);assert.equal(rls(),beforeRls);assert.equal(bodies,q("select jsonb_agg(prosrc order by oid)from pg_proc where oid in('production_control.certification_operation_phase_v1(text,boolean)'::regprocedure,'production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure)"));assert.equal(q("select current_setting('safeupdate.enabled')"),'on');
  });
  await check('private adapter/core deny direct anon, authenticated and bare service_role; no role grants',()=>{
   for(const role of ['anon','authenticated','service_role'])for(const fn of ["production_control.dispatch_certification_net_skins_calculation_v1('{}','{}',true)","public.execute_certification_operation_v1('{}')"])assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select ${fn}`,{role}).status,0);
  });
  await check('private helper ACL drift refuses replay instead of repairing grants',()=>{
   q('grant execute on function production_control.dispatch_certification_net_skins_calculation_v1(jsonb,jsonb,boolean)to anon');assert.throws(install,/PRIVATE_ACL_DRIFT/);
   q('revoke execute on function production_control.dispatch_certification_net_skins_calculation_v1(jsonb,jsonb,boolean)from anon');install();
  });
  f.toggle(true);stack=await f.director();route=await netSkinsParticipantRoute(f);
  await check('not configured is bounded typed state; calculation is denied 409 without claim',async()=>{
   const model=await stack.transport.netSkinsCalculationRequest();assert.equal(model.state,'NOT_CONFIGURED');assert.equal(model.configuration_revision,0);
   const context=(await stack.transport.read()).context,r=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({family:'NET_SKINS_CALCULATION',action:'calculate',operationRequestId:randomUUID(),expectedContextToken:context.contextToken,payload:{expectedConfigurationRevision:1,entryRevisions:{3:1},sourceFingerprints:{3:'a'.repeat(64)}}})});assert.equal(r.status,409,JSON.stringify(await r.clone().json()));assert.equal(resultCount(),'0');
  });
  const round=(await stack.transport.entriesRequest()).rounds.find(r=>r.roundNumber===3),draft=entryDraft(round);draft.configured=true;draft.entries[round.entrants.findIndex(e=>e.playerIds.includes('P12'))].entered=true;
  await f.mutation('prepare-scoring-context',{matchId:'2026-R3-12'});
  assert.equal((await stack.transport.entriesRequest(entrySaveRequest(round,draft,randomUUID()))).revision,1);
  const match=()=>JSON.parse(q("select to_jsonb(m)from scoring_authority.matches m where match_id='2026-R3-12'"));
  const control=async action=>{const m=match();return stack.transport.controlRequest(action,{matchId:m.match_id,expectedMatchRevision:m.match_revision,expectedPermissionRevision:m.permission_revision,operationRequestId:randomUUID()});};
  await control('mark-live');await control('access-activate');
  for(let hole=1;hole<=18;hole++){const m=match(),key='local:net.calc:h'+hole,actor={tournament_id:'2026',role:'PLAYER',player_id:'P12',auth_user_id:fixtureIdentities[1].auth_user_id,match_id:m.match_id,permission_revision:m.permission_revision};const r=await invoke('SCORING.SUBMIT_HOLE',{match_id:m.match_id,mutation_key:key,hole_number:hole,expected_match_revision:m.match_revision,expected_hole_revision:0,team_1_gross_scores:[4],team_2_gross_scores:[5]},actor,key);assert.equal(r.payload.ok,true);}
  await f.source(stack);const m=match(),key='local:net.calc:final';await invoke('SCORING.FINALIZE_MATCH',{match_id:m.match_id,mutation_key:key,expected_match_revision:m.match_revision},{...f.authorization,match_id:m.match_id,permission_revision:m.permission_revision},key);await drainOrdinary();
  await stack.transport.netSkinsConfigurationRequest({expectedConfigurationRevision:0,eligibleRoundNumbers:[3],entryRevisions:{3:1},operationRequestId:randomUUID()});
  await check('pre-result participant GET is bounded HTTP200 and never calculates',async()=>{
   const r=await read(route);assert.equal(r.status,200);assert.deepEqual(r.data.data.netSkins.results,[]);assert.equal(resultCount(),'0');assert.equal(route.afterCalls.length,0);
  });
  assert.equal(q('select count(*)from scoring_authority.net_skins_v1_recalculation_jobs'),'0');
  await check('hosted-equivalent FINAL primary/18 scores, entry1/config1, UPCOMING secondary produces OFFICIAL and auto-publishes',async()=>{
   const r=await calculate();assert.equal(r.receipt.result_state,'OFFICIAL');assert.equal(r.receipt.published,true);assert.equal(r.outcome,'COMMITTED');
   official=JSON.parse(q('select to_jsonb(r)from scoring_authority.net_skins_v1_result_revisions r where is_current'));assert.ok(official.published_at);assert.equal(official.configuration_revision,1);assert.equal(official.source_fingerprint,command.sourceFingerprints[3]);
   assert.equal(q("select status from scoring_authority.matches where match_id='2026-R3-11'"),'UPCOMING');assert.equal(q("select count(*)from scoring_authority.hole_scores where match_id='2026-R3-12'"),'18');
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_result_revisions where is_current'),'1');evidence.official={revision:official.result_revision,phase:official.result_state,source:official.source_fingerprint};
  });
  await check('HTTP200 read integration: summary/winners/18 hole tracker/detail, no private provenance or GET calculation',async()=>{
   const r=await read(route),p=await read(route,'/api/leaderboards/net-skins?presentation=participant');assert.equal(r.status,200);assert.equal(p.status,200);
   const round=r.data.data.netSkins.rounds[0];assert.equal(round.skinsAwarded,18);assert.equal(round.pot,25);assert.equal(round.leaderboard.length,1);assert.equal(round.leaderboard[0].holeResults.length,18);assert.equal(p.data.data.presentation.rounds[0].holes.length,18);assert.equal(p.data.data.presentation.rounds[0].winners.length,1);
   for(const v of [r,p])assert.doesNotMatch(JSON.stringify(v),/Fingerprint|fingerprint|claim_token|request_fingerprint|receipt|audit|fullNetDetail|snapshotId/);assert.equal(route.afterCalls.length,0);evidence.reads={summary:r.data.data,presentation:p.data.data};
  });
  await check('replay across fresh process/transport reconciles without another claim/attempt/result/publication',async()=>{
   const before=q('select jsonb_agg(to_jsonb(j))from scoring_authority.net_skins_v1_recalculation_jobs j'),count=resultCount();
   const replay=await stack.transport.netSkinsCalculationRequest(command);assert.equal(replay.outcome,'COMMITTED');
   const fresh=await f.director();await fresh.transport.read();const second=await fresh.transport.netSkinsCalculationRequest(command);assert.equal(second.outcome,'COMMITTED');assert.equal(resultCount(),count);assert.equal(q('select jsonb_agg(to_jsonb(j))from scoring_authority.net_skins_v1_recalculation_jobs j'),before);
  });
  await check('same operation with conflicting payload and stale configuration/entry/source deny without mutation',async()=>{
   const context=(await stack.transport.read()).context,send=payload=>stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({family:'NET_SKINS_CALCULATION',action:'calculate',payload,operationRequestId:randomUUID(),expectedContextToken:context.contextToken})});
   const clean={...command};delete clean.operationRequestId;
   for(const p of [{...clean,expectedConfigurationRevision:99},{...clean,entryRevisions:{3:99}},{...clean,sourceFingerprints:{3:'0'.repeat(64)}}]){const r=await send(p);assert.equal(r.status,409,JSON.stringify(await r.clone().json()));}
   const conflict=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({family:'NET_SKINS_CALCULATION',action:'calculate',payload:{...clean,expectedConfigurationRevision:99},operationRequestId:command.operationRequestId,expectedContextToken:context.contextToken})});assert.equal(conflict.status,409,JSON.stringify(await conflict.clone().json()));
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_result_revisions where is_current'),'1');
  });
  await check('lost application ACK resolves from exact completion receipt; no duplicate result',async()=>{
   let once=true;const lossy=await certificationDirectorStack(f,{loseResponse:(_u,init)=>init.method==='POST'&&once&&(once=false,true)});
   const id=randomUUID();await assert.rejects(calculate(lossy,id));const state=await lossy.transport.resolve(id);assert.equal(state.outcome,'COMMITTED');assert.equal(state.receipt.empty,true);assert.equal(resultCount(),'1');
  });
  await check('participant A/B, ordinary authentication, signed-out and wrong Director deny calculation',async()=>{
   const context=(await stack.transport.read()).context,payload={...command};delete payload.operationRequestId;
   const send=s=>s.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({family:'NET_SKINS_CALCULATION',action:'calculate',payload,operationRequestId:randomUUID(),expectedContextToken:context.contextToken})});
   for(const actor of [{status:'signed-out'},{status:'active',source:'session',identity:stack.authorization.identity},
    ...[fixtureIdentities[1],fixtureIdentities[2]].flatMap(i=>['PLAYER','DIRECTOR'].map(role=>({status:'active',source:'entitlement',identity:{authUserId:i.auth_user_id,actor:{id:i.player_id,role},tournamentId:'2026'}})))]){
    const denied=await certificationDirectorStack(f,{authorization:actor});const r=await send(denied);assert.equal(r.status,403,JSON.stringify(await r.clone().json()));
   }
  });
  await check('client cannot choose resource, tournament, processor/job; foreign runtime/project/release denies before domain work',async()=>{
   const context=(await stack.transport.read()).context,payload={...command};delete payload.operationRequestId;
   for(const extra of [{resource:'PRODUCTION'},{tournament_id:'2027'},{job_id:randomUUID()},{processor:'arbitrary'},{workerId:'arbitrary'}]){
    const r=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({family:'NET_SKINS_CALCULATION',action:'calculate',payload:{...payload,...extra},operationRequestId:randomUUID(),expectedContextToken:context.contextToken})});assert.equal(r.status,400);
   }
   for(const changed of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_DEPLOYMENT_ID:'dpl_foreign'},
    {VERCEL_GIT_COMMIT_SHA:'f'.repeat(40)},{BAGGER_CERTIFICATION_RESOURCE_ID:'PRODUCTION:foreign'},
    {SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co'}]){
    const denied=await certificationDirectorStack(f,{environment:{...f.env,...changed}});const r=await denied.request('/api/director/canonical-operations?family=NET_SKINS_CALCULATION');assert.ok([403,503].includes(r.status),JSON.stringify(await r.clone().json()));assert.ok(denied.calls.every(c=>c.name==='read_certification_runtime_context_v1'));
   }
  });
  await check('actual canonical operation repeats resource/project/deployment/release checks and private rows stay filtered',()=>{
   const clean={expected_configuration_revision:command.expectedConfigurationRevision,entry_revisions:command.entryRevisions,source_fingerprints:command.sourceFingerprints};
   const b={contract_version:'certification-runtime-v1',...f.envelope,phase:'DIRECTOR',operation_id:'DIRECTOR.CALCULATE_NET_SKINS',operation_request_id:randomUUID(),expected_context_token:f.context().context_token,payload:clean};
   for(const c of [{...b,resource:{...b.resource,resource_id:'PRODUCTION:foreign'}},{...b,resource:{...b.resource,project_ref:'idgigvjjqkfbqjeredpb'}},
    {...b,deployment:{...b.deployment,deployment_id:'dpl_foreign'}},{...b,deployment:{...b.deployment,release_commit:'f'.repeat(40)}},{...b,expected_context_token:'0'.repeat(64)},
    {...b,authorization:{...b.authorization,tournament_id:'2027'}}]){
    const r=sqlResult(f.cluster,f.database,`set role service_role;select public.execute_certification_operation_v1(${jsonLiteral(c)})`,{role:'service_role'});assert.notEqual(r.status,0);assert.match(r.stderr,/DENIED|STALE|MISMATCH/);
   }
   for(const role of ['anon','authenticated']){const r=sqlResult(f.cluster,f.database,`set role ${role};select count(*)from scoring_authority.net_skins_v1_configuration_revisions`,{role});assert.ok(r.status!==0||r.stdout.trim()==='0');}
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_result_revisions where is_current'),'1');
  });
  const lifecycle=async op=>{const m=match(),id='local:net.calc:'+op+':'+randomUUID();const r=await invoke('SCORING.'+op,{match_id:m.match_id,mutation_key:id,expected_match_revision:m.match_revision},{...f.authorization,match_id:m.match_id,permission_revision:m.permission_revision},id);assert.equal(r.payload.ok,true,JSON.stringify(r.payload));};
  const scores=q("select jsonb_agg(to_jsonb(s)order by hole_number)from scoring_authority.hole_scores s where match_id='2026-R3-12'");
  await check('completion ACK lost after real commit reconciles in adapter, with no second publication',async()=>{
   await lifecycle('REOPEN_MATCH');let once=true;
   const lossy=await certificationDirectorStack(f,{afterDatabase:(_name,input)=>{if(input.operation_id==='DIRECTOR.NET_SKINS_COMPLETE'&&once){once=false;throw new Error('SYNTHETIC_DB_COMMIT_ACK_LOSS');}}});
   const r=await calculate(lossy);assert.equal(r.outcome,'COMMITTED');assert.equal(r.receipt.result_state,'PROVISIONAL');assert.equal((await lossy.transport.resolve(command.operationRequestId)).outcome,'COMMITTED');
   const view=await read(route);assert.equal(view.status,200);assert.deepEqual(view.data.data.netSkins.results,[]);assert.equal(route.afterCalls.length,0);
   const current=JSON.parse(q('select to_jsonb(r)from scoring_authority.net_skins_v1_result_revisions r where is_current'));assert.equal(current.published_at,null);evidence.provisional={revision:current.result_revision,publication:'WITHHELD'};
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_result_revisions where is_current'),'1');await lifecycle('FINALIZE_MATCH');
  });
  await check('uncertain BEGIN/claim remains UNKNOWN, replay cannot execute; natural 60s Director lease closes and next operation reclaims',async()=>{
   await drainOrdinary();let once=true;
   const lossy=await certificationDirectorStack(f,{afterDatabase:(_name,input,value)=>{if(input.operation_id==='DIRECTOR.CALCULATE_NET_SKINS'&&value.job&&once){once=false;throw new Error('SYNTHETIC_CLAIM_ACK_LOSS');}}});
   const count=resultCount(),id=randomUUID();await assert.rejects(calculate(lossy,id));const r=await lossy.transport.resolve(id);assert.equal(r.outcome,'UNKNOWN');assert.equal(r.calculationState,'CLAIM_HELD');
   const job=JSON.parse(q("select to_jsonb(j)from scoring_authority.net_skins_v1_recalculation_jobs j where status='RUNNING'"));assert.equal(job.attempts,1);
   await assert.rejects(lossy.transport.netSkinsCalculationRequest(command));assert.equal(resultCount(),count);assert.equal(q(`select attempts from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${job.job_id}'`),'1');
   const wait=Math.max(0,Date.parse(job.lease_expires_at)-Date.now()+150);await new Promise(resolve=>setTimeout(resolve,wait));
   assert.equal((await lossy.transport.resolve(id)).outcome,'NOT_COMMITTED');
   let retried=await calculate();
   if(retried.receipt.empty){const backoff=JSON.parse(q(`select to_jsonb(j)from scoring_authority.net_skins_v1_recalculation_jobs j where job_id='${job.job_id}'`));assert.equal(backoff.status,'PENDING');assert.equal(backoff.attempts,1);assert.equal(backoff.delivery_error_class,'RETRYABLE');await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(backoff.delivery_available_at)-Date.now()+150)));retried=await calculate();}
   assert.equal(retried.outcome,'COMMITTED');assert.equal(retried.receipt.result_state,'OFFICIAL');assert.equal(q(`select attempts from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${job.job_id}'`),'2');evidence.claimRecovery={lease:60,naturalExpiry:true,attempts:[1,2]};
  });
  await check('simultaneous same review and independent review respect one claimant and typed busy/no-work without duplicate computation',async()=>{
   await lifecycle('REOPEN_MATCH');let once=true,id=randomUUID(),second;
   const competing=await certificationDirectorStack(f,{afterDatabase:async(_name,input,value)=>{if(input.operation_id==='DIRECTOR.CALCULATE_NET_SKINS'&&value.job&&once){once=false;
    const context=(await stack.transport.read()).context,payload={...command};delete payload.operationRequestId;
    second=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({family:'NET_SKINS_CALCULATION',action:'calculate',payload,operationRequestId:id,expectedContextToken:context.contextToken})});assert.equal(second.status,409);
    const other=await calculate(stack);assert.equal(other.receipt.empty,true);
   }}});
   const count=resultCount(),r=await calculate(competing,id);assert.equal(r.receipt.result_state,'PROVISIONAL');assert.equal(Number(resultCount()),Number(count)+1);
   assert.equal(q("select attempts from scoring_authority.net_skins_v1_recalculation_jobs where status='SUCCEEDED'order by requested_at desc limit 1"),'1');await lifecycle('FINALIZE_MATCH');await drainOrdinary();await calculate();
  });
  await check('source advancement after claim rejects stale completion; fresh current work drains without pointer corruption',async()=>{
   await lifecycle('REOPEN_MATCH');let once=true;
   const stale=await certificationDirectorStack(f,{afterDatabase:async(_name,input,value)=>{if(input.operation_id==='DIRECTOR.CALCULATE_NET_SKINS'&&value.job&&once){once=false;await lifecycle('FINALIZE_MATCH');}}});
   const count=resultCount(),id=randomUUID();await assert.rejects(calculate(stale,id));const status=await stale.transport.resolve(id);assert.equal(status.outcome,'NOT_COMMITTED');assert.equal(resultCount(),count);
   await drainOrdinary();const fresh=await calculate();assert.equal(fresh.receipt.result_state,'OFFICIAL');assert.equal(q('select count(*)from scoring_authority.net_skins_v1_result_revisions where is_current'),'1');
   assert.equal(q("select jsonb_agg(to_jsonb(s)order by hole_number)from scoring_authority.hole_scores s where match_id='2026-R3-12'"),scores);
  });
  await drainOrdinary();f.toggle(false);
  await check('complete drain and OFF/disabled/paused, no leaked claims/UNKNOWN or financial mutation',()=>{
   assert.equal(q("select count(*)from scoring_authority.net_skins_v1_recalculation_jobs where status in('PENDING','RUNNING')or claim_token is not null"),'0');assert.equal(q("select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');assert.equal(f.status().enabled,false);for(const k of ['pending_work','active_claims','active_leases','dead_letters'])assert.equal(f.status().counts[k],0,k);assert.equal(q('select count(*)from production_control.resource_scope'),'0');
  });
  await mkdir(repositoryRoot+'/docs/reliability/phase2d-net-skins-calculation/evidence',{recursive:true});await writeFile(repositoryRoot+'/docs/reliability/phase2d-net-skins-calculation/evidence/integration.json',JSON.stringify(evidence,null,2)+'\n');
 }finally{await destroyIsolatedCluster(f.cluster);}
});
