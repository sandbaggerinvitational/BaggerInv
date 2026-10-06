import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createCalcuttaQueueFixture}from'./support/reliability/certification-calcutta-queue-fixture.mjs';
import{certificationDirectorStack}from'./support/reliability/certification-director-proof.mjs';
import{certificationOddsStack}from'./support/reliability/certification-odds-proof.mjs';
import{sqlFile,sqlResult,jsonLiteral,repositoryRoot,destroyIsolatedCluster,restartIsolatedCluster}from'./support/reliability/postgres17.mjs';
import{canonicalDirectorOperationsRequest}from'../lib/canonical-director-operations-client.js';
import{certificationOperationRpc,certificationProjectionRpc}from'../lib/certification-runtime-server.js';
import{oddsParticipantRoute}from'./support/reliability/certification-odds-participant-proof.mjs';
import{fixtureIdentities}from'../tools/reliability/certification-part2a-fixture.mjs';
import{entryDraft,entrySaveRequest}from'../lib/net-skins-entry-workspace.js';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-odds-input-configuration-v1.sql';
test('complete fixed synthetic Odds chain through real Director routes and owned PG17/safeupdate',async t=>{
 const f=await createCalcuttaQueueFixture({emptyAuction:false}),q=f.q,evidence={hosted:false,postgres:17,safeupdate:'on',cases:[]};
 const run=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){failure=e;throw e;}});if(failure)throw failure;};
 const install=()=>sqlFile(f.cluster,f.database,artifact,{role:''});
 const invoke=(op,payload,authorization=f.authorization,id=randomUUID())=>certificationOperationRpc(op,payload,{env:f.env,authorization,operationRequestId:id},f.dependencies);
 let director,odds,command,calculation,pubCommand,publication;
 const view=()=>JSON.parse(q('select to_jsonb(c)from scoring_authority.odds_input_configurations c where is_current'));
 const job=id=>JSON.parse(q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${id}'`));
 const configRequest=async(s,input=null)=>{try{return await canonicalDirectorOperationsRequest(input,{family:'ODDS_INPUT_CONFIGURATION',fetchImpl:s.request});}catch(e){e.message+=' '+JSON.stringify(s.calls.findLast(c=>c.error)?.error);throw e;}};
 const configCommand=async(s=director,payload={})=>({family:'ODDS_INPUT_CONFIGURATION',action:'configure',operationRequestId:randomUUID(),
  expectedContextToken:(await configRequest(s)).context.contextToken,payload:{expectedConfigurationRevision:0,profile:'CERTIFICATION_DEFAULTS_V1',confirmation:'CONFIGURE SYNTHETIC ODDS INPUTS',reason:'Owner-approved deterministic synthetic fixture; no Google or Production source.',...payload}});
 const errorDetail=s=>JSON.stringify(s.calls.findLast(c=>c.error)?.error);
 const client=async(...args)=>{try{return await odds.client(...args);}catch(e){e.message+=' '+errorDetail(odds);throw e;}};
 const reconcileIngress=()=>{
  for(const row of JSON.parse(q("select coalesce(jsonb_agg(to_jsonb(l)),'[]')from production_control.certification_ingress_leases_v1 l where state in('ADMITTED','UNKNOWN')"))){
   const b={contract_version:'certification-runtime-v1',...f.envelope,phase:'DIRECTOR',operation_id:row.operation_id,operation_request_id:row.operation_request_id,payload:{}};
   const r=sqlResult(f.cluster,f.database,`set role service_role;select public.resolve_certification_ingress_v1(${jsonLiteral(b)})`,{role:'service_role'});assert.equal(r.status,0,r.stderr);
  }
 };
 const drain=async()=>{
  reconcileIngress();f.start({budget:3,duration_seconds:180});
  for(const e of f.batch().messages){if(f.status().counts.pending_work===0)break;f.register(e);await f.due(e);const result=await f.consume(e);assert.equal(result.outcome,'SUCCEEDED',JSON.stringify(result));}
  f.stop();assert.equal(f.status().counts.pending_work,0);
 };
 try{
  for(const n of['certification-calcutta-publication-v1.sql','certification-net-skins-result-read-v1.sql','certification-net-skins-calculation-v1.sql'])sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/'+n,{role:''});
  const metadata=()=>q("select jsonb_agg(jsonb_build_object('id',oid,'owner',proowner,'acl',proacl,'security',prosecdef,'config',proconfig)order by oid)from pg_proc where oid in('production_control.certification_operation_phase_v1(text,boolean)'::regprocedure,'production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure,'production_control.worker_supervisor_scope_v1()'::regprocedure)");
  const rls=()=>q("select jsonb_agg(jsonb_build_object('id',oid,'rls',relrowsecurity,'acl',relacl)order by oid)from pg_class where relkind='r'and relnamespace in('scoring_authority'::regnamespace,'production_control'::regnamespace)");
  await run('atomic predecessor mismatch rollback; replay; metadata/RLS/private core unchanged; safeupdate on',async()=>{
   const before=metadata(),policies=rls(),src=await readFile(artifact,'utf8'),m=JSON.parse(src.split('$manifest$')[1]);
   const bad=sqlResult(f.cluster,f.database,src.replace(m[0].old_hash,'0'.repeat(64)),{role:''});assert.notEqual(bad.status,0);assert.match(bad.stderr,/PREDECESSOR_MISMATCH/);
   assert.equal(q("select to_regprocedure('production_control.dispatch_certification_odds_configuration_v1(jsonb,jsonb,boolean)')is null"),'t');
   install();install();assert.equal(metadata(),before);assert.equal(rls(),policies);assert.equal(q("select current_setting('safeupdate.enabled')"),'on');
  });
  f.toggle(true);director=await f.director();odds=await certificationOddsStack(f);
  await run('absent inputs deny calculation before any job exists',async()=>{
   assert.equal((await configRequest(director)).data.state,'NOT_CONFIGURED');
   const c=await client();await assert.rejects(client({action:'calculate',operationRequestId:randomUUID(),expectedContextToken:c.context.token,phase:'Round 3 Pairings Announced',iterations:10000}));
   assert.equal(q('select count(*)from scoring_authority.odds_calculation_jobs'),'0');
  });
  await run('fixed synthetic Director configuration; canonical validator/revision/current/receipt/audit; no imported seed',async()=>{
   command=await configCommand();const r=await configRequest(director,command);assert.equal(r.receipt.configuration_revision,1);assert.equal(r.receipt.provenance,'CERTIFICATION_SYNTHETIC');
   const v=view();assert.equal(v.configuration_revision,1);assert.deepEqual(v.historical_ratings,{});assert.equal(Object.keys(v.canonical_settings).length,30);assert.equal(v.validation_diagnostics.googleAccess,false);evidence.profile=v.canonical_settings;
   assert.equal(v.validation_diagnostics.productionSource,false);assert.equal(q('select count(*)from production_control.prediction_settings_audit_events_v1'),'1');
  });
  await run('exact configuration replay, conflict, stale revision and repeated identical demand',async()=>{
   assert.equal((await configRequest(director,command)).receipt.configuration_revision,1);
   await assert.rejects(configRequest(director,{...command,payload:{...command.payload,reason:'Changed review'}}));
   await assert.rejects(configRequest(director,await configCommand()));
   const same=await configCommand(director,{expectedConfigurationRevision:1});assert.equal((await configRequest(director,same)).receipt.code,'CERTIFICATION_ODDS_INPUTS_UNCHANGED');
   assert.equal(q('select count(*)from scoring_authority.odds_input_configurations'),'1');
  });
  await run('configuration lost client ACK, authoritative COMMITTED / NOT_COMMITTED status',async()=>{
   const c=await configCommand(director,{expectedConfigurationRevision:1});
   const lost=await certificationDirectorStack(f,{loseResponse:(u,i)=>i.method==='POST'});await assert.rejects(configRequest(lost,c));
   const status=await configRequest(director,{...c,mode:'status'});assert.equal(status.outcome,'COMMITTED');
   assert.equal((await configRequest(director,{...c,operationRequestId:randomUUID(),mode:'status'})).outcome,'NOT_COMMITTED');
  });
  await run('participant/signed-out/anon/authenticated/service_role cannot author or choose private processor/targets',async()=>{
   for(const playerId of['P12','P11'])for(const role of['PLAYER','DIRECTOR']){const s=await certificationDirectorStack(f,{authorization:{status:'active',source:'entitlement',identity:{authUserId:fixtureIdentities.find(x=>x.player_id===playerId).auth_user_id,actor:{id:playerId,role},tournamentId:'2026'}}});await assert.rejects(configRequest(s));}
   for(const authorization of[{status:'signed-out'},{status:'active',source:'service_role'},{status:'active',source:'authenticated'}])await assert.rejects(configRequest(await certificationDirectorStack(f,{authorization})));
   for(const role of['anon','authenticated','service_role']){assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select production_control.dispatch_certification_odds_configuration_v1('{}','{}',true)`,{role}).status,0);assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select public.execute_certification_operation_v1('{}')`,{role}).status,0);}
   for(const p of[{settings:{}},{resource:'x'},{tournamentId:'2025'},{processor:'x'},{source:'GOOGLE'}])await assert.rejects(configRequest(director,{...command,operationRequestId:randomUUID(),payload:{...command.payload,...p}}));
  });
  // Same four-player/two-match local counterpart; all source facts use shipping
  // operations. This is fixture construction, never a hosted scoring replay.
  const round=(await director.transport.entriesRequest()).rounds.find(r=>r.roundNumber===3),draft=entryDraft(round);draft.configured=true;draft.entries[round.entrants.findIndex(e=>e.playerIds.includes('P12'))].entered=true;
  await f.mutation('prepare-scoring-context',{matchId:'2026-R3-12'});
  assert.equal((await director.transport.entriesRequest(entrySaveRequest(round,draft,randomUUID()))).revision,1);
  const match=()=>JSON.parse(q("select to_jsonb(m)from scoring_authority.matches m where match_id='2026-R3-12'"));
  for(const action of['mark-live','access-activate']){const m=match();await director.transport.controlRequest(action,{matchId:m.match_id,expectedMatchRevision:m.match_revision,expectedPermissionRevision:m.permission_revision,operationRequestId:randomUUID()});}
  for(let hole=1;hole<=18;hole++){const m=match(),key='local:odds:h'+hole;await invoke('SCORING.SUBMIT_HOLE',{match_id:m.match_id,mutation_key:key,hole_number:hole,expected_match_revision:m.match_revision,expected_hole_revision:0,team_1_gross_scores:[4],team_2_gross_scores:[5]},
   {tournament_id:'2026',role:'PLAYER',player_id:'P12',auth_user_id:fixtureIdentities[1].auth_user_id,match_id:m.match_id,permission_revision:m.permission_revision},key);}
  // Lawful synthetic Calcutta history 1 -> empty 2 -> nonempty 3, never row inserts.
  for(const clear of[false,true,false]){
   const c=f.current(),payload={contract_version:'production-calcutta-v1',expected_configuration_revision:c.configuration_revision,
    expected_configuration_fingerprint:c.configuration_fingerprint,expected_auction_revision:c.auction_revision,
    expected_auction_fingerprint:c.auction_fingerprint,expected_publication_revision:c.publication_revision,
    ...(clear?{action:'clear-entry',player_id:'P01'}:{action:'replace-auction',purchases:[{player_id:'P01',purchase_price:'1'}],ownership:[{player_id:'P01',owner_player_id:'P12',ownership_fraction:'1'}]})};
   const r=await invoke(clear?'DIRECTOR.CLEAR_CALCUTTA_AUCTION':'DIRECTOR.REPLACE_CALCUTTA_AUCTION',payload);assert.equal(r.payload.ok,true);
  }
  const m=match(),key='local:odds:final';await invoke('SCORING.FINALIZE_MATCH',{match_id:m.match_id,mutation_key:key,expected_match_revision:m.match_revision},{...f.authorization,match_id:m.match_id,permission_revision:m.permission_revision},key);
  await drain();
  await director.transport.netSkinsConfigurationRequest({expectedConfigurationRevision:0,eligibleRoundNumbers:[3],entryRevisions:{3:1},operationRequestId:randomUUID()});
  const net=await director.transport.netSkinsCalculationRequest();const nr=await director.transport.netSkinsCalculationRequest({expectedConfigurationRevision:net.configuration_revision,entryRevisions:net.entry_revisions,sourceFingerprints:net.source_fingerprints,operationRequestId:randomUUID()});assert.equal(nr.receipt.result_state,'OFFICIAL');
  const cal=await director.transport.calcuttaPublicationRequest();await director.transport.calcuttaPublicationRequest({expectedConfigurationRevision:cal.configuration_revision,expectedConfigurationFingerprint:cal.configuration_fingerprint,
   expectedAuctionRevision:cal.auction_revision,expectedAuctionFingerprint:cal.auction_fingerprint,expectedPublicationRevision:cal.publication_revision,expectedResultRevision:cal.result_revision,expectedSourceFingerprint:cal.source_fingerprint,operationRequestId:randomUUID()});
  evidence.fixture={matches:2,final:1,upcoming:1,scores:18,netSkins:'OFFICIAL',calcutta:'PROVISIONAL/PUBLISHED',auction:3};
  await run('truthful incomplete two-match phase; Director after() calculation/checkpoints/current result',async()=>{
   const c=await client();const req={action:'calculate',operationRequestId:randomUUID(),expectedContextToken:c.context.token,phase:'Round 3 Pairings Announced',iterations:10000};
   calculation=await client(req);assert.equal(calculation.accepted,true);assert.equal(odds.scheduled.length,1);
   await odds.scheduled.shift()();const j=job(calculation.jobId);assert.equal(j.status,'SUCCEEDED',errorDetail(odds));assert.equal(j.completed_iterations,10000);assert.ok(j.checkpoint_count>0);
   assert.equal(j.result_payload.phase,'Round 3 Pairings Announced');assert.equal(j.publication_status,'READY');evidence.calculation={phase:j.phase,iterations:j.completed_iterations,checkpoints:j.checkpoint_count,attempts:j.attempt_count};
   assert.equal((await client(req)).jobId,j.job_id);
  });
  await run('existing separate Director publication; replay; truthful milestone/phase/current pointer',async()=>{
   const c=await client(null,{jobId:calculation.jobId});pubCommand={action:'publish',operationRequestId:randomUUID(),expectedContextToken:c.context.token,jobId:calculation.jobId,confirmPublication:true,expectedPublicationRevision:c.publication.revision,expectedSnapshotId:c.publication.snapshotId};
   const basis=odds.calls.findLast(x=>x.input.payload?.odds_operation==='read_production_odds_calculation_jobs').input,j=job(calculation.jobId);
   const wrong={...basis,operation_id:'ODDS.publish_production_championship_odds_v1',operation_request_id:randomUUID(),expected_context_token:c.context.token,
    payload:{odds_operation:'publish_production_championship_odds_v1',job_id:j.job_id,milestone:'Final Results',expected_source_fingerprint:j.source_revision.source_fingerprint,
     expected_result_fingerprint:j.result_fingerprint,expected_publication_revision:c.publication.revision,expected_snapshot_id:c.publication.snapshotId}};
   const denied=sqlResult(f.cluster,f.database,`set role service_role;select public.dispatch_certification_odds_v1(${jsonLiteral(wrong)})`,{role:'service_role'});
   assert.notEqual(denied.status,0);assert.match(denied.stderr,/PUBLICATION_RESULT_STALE/);
   publication=await client(pubCommand);assert.equal(publication.publicationCreated,true);assert.equal((await client(pubCommand)).snapshotId,publication.snapshotId);
   const p=await odds.published();assert.equal(p.payload.ok,true);assert.equal(p.payload.data.snapshots.length,1);assert.equal(p.payload.data.snapshots[0].milestone,'Round 3 Pairings Announced');
  });
  await run('FinalRecap remains ineligible after current non-Final Results publication',()=>{assert.equal(q("select production_control.derived_final_recap_ready_v1('2026')"),'f');assert.equal(q("select coalesce(max(attempts),0)from scoring_authority.competition_recalculation_jobs where engine_key='TOURNAMENT_FINAL_RECAP'"),'0');});
  
  await run('actual shipping participant Odds GET HTTP200, public phase/result, no settings/claims/checkpoints or Google',async()=>{
   const route=await oddsParticipantRoute(f,odds.certificationDependencies),r=await route.get(),data=await r.json();
   assert.equal(r.status,200,JSON.stringify(data));assert.equal(data.publication.currentMilestone,'Round 3 Pairings Announced');assert.ok(data.snapshots.length);
   assert.equal(r.headers.get('X-Published-Odds-Google-Requests'),'0');
   assert.doesNotMatch(JSON.stringify(data),/canonical_settings|effective_settings|historical_ratings|checkpoint_payload|claim_token|input_snapshot|validation_diagnostics/);
   for(const role of['anon','authenticated'])for(const table of['odds_input_configurations','odds_calculation_jobs'])assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select *from scoring_authority.${table}`,{role}).status,0);
   const out=await oddsParticipantRoute(f,odds.certificationDependencies,{signedOut:true});assert.equal((await out.get()).status,401);
  });
  await run('configuration/calculation/publication exact target/environment/release binding; no ordinary Preview/Production/old Preview',async()=>{
   for(const change of[{VERCEL_ENV:'development'},{VERCEL_ENV:'production'},{VERCEL_DEPLOYMENT_ID:'dpl_wrong'},
    {VERCEL_GIT_COMMIT_SHA:'d'.repeat(40)},{VERCEL_PROJECT_ID:'prj_wrong'},
    {BAGGER_CERTIFICATION_RESOURCE_ID:'CERTIFICATION:11111111-1111-4111-8111-111111111111'},
    {SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co'}, {BAGGER_CERTIFICATION_RESOURCE_ID:''}]){
    const environment={...f.env,...change},d=await certificationDirectorStack(f,{environment});await assert.rejects(configRequest(d));
    const o=await certificationOddsStack(f,{environment});await assert.rejects(o.client());
    await assert.rejects(o.client({...pubCommand,operationRequestId:randomUUID()}));
   }
   for(const authorization of[{status:'signed-out'},{status:'active',source:'authenticated'},
    {status:'active',source:'service_role'},...['P12','P11'].map(id=>({status:'active',source:'entitlement',identity:{authUserId:fixtureIdentities.find(v=>v.player_id===id).auth_user_id,actor:{id,role:'PLAYER'},tournamentId:'2026'}}))]){
    const o=await certificationOddsStack(f,{authorization});await assert.rejects(o.client());
    await assert.rejects(o.client({...pubCommand,operationRequestId:randomUUID()}));
   }
   for(const op of['DIRECTOR.CONFIGURE_ODDS_INPUTS','request_production_odds_calculation_job','publish_production_championship_odds_v1']){
    const b={contract_version:'certification-runtime-v1',...f.bound,phase:'DIRECTOR',operation_id:op==='DIRECTOR.CONFIGURE_ODDS_INPUTS'?op:'ODDS.'+op,operation_request_id:randomUUID(),payload:op==='DIRECTOR.CONFIGURE_ODDS_INPUTS'?{}:{odds_operation:op}};
    const name=op==='DIRECTOR.CONFIGURE_ODDS_INPUTS'?'execute_certification_operation_v1':'dispatch_certification_odds_v1';
    assert.notEqual(sqlResult(f.cluster,f.database,`set role service_role;select public.${name}(${jsonLiteral(b)})`,{role:'service_role'}).status,0);
   }
  });
  await run('durable checkpoints resume across actual owned database restart, attempts preserved, duplicate completion harmless',async()=>{
   const c=await client(),r=await client({action:'calculate',operationRequestId:randomUUID(),expectedContextToken:c.context.token,phase:'Round 3 Pairings Announced',iterations:25000});
   await assert.rejects(odds.worker(r.jobId,{chunkIterations:1000,failureAt:'AFTER_CHECKPOINT'}));
   const before=job(r.jobId);assert.equal(before.status,'RETRYABLE');assert.equal(before.completed_iterations,1000);assert.equal(before.attempt_count,1);
   restartIsolatedCluster(f.cluster);assert.equal(job(r.jobId).completed_iterations,1000);const result=await odds.worker(r.jobId);assert.equal(result.completed,true);assert.equal(result.attempts,2);
   assert.equal(job(r.jobId).completed_iterations,25000);assert.equal((await odds.worker(r.jobId)).processed,false);
   evidence.resume={checkpoint:1000,completed:25000,attempts:[1,2],realDatabaseRestart:true};
   // Publish this result before a source change so no READY work is abandoned.
   const v=await client(null,{jobId:r.jobId});await client({action:'publish',operationRequestId:randomUUID(),expectedContextToken:v.context.token,jobId:r.jobId,confirmPublication:true,expectedPublicationRevision:v.publication.revision,expectedSnapshotId:v.publication.snapshotId});
  });
  await run('lost calculation/result/publication ACK reconciles COMMITTED; unknown request truthful; no duplicate result/publication',async()=>{
   const c=await client(),req={action:'calculate',operationRequestId:randomUUID(),expectedContextToken:c.context.token,phase:'Round 3 Pairings Announced',iterations:50000};
   const lost=await certificationOddsStack(f,{loseResponse:(_u,i)=>i.method==='POST'});await assert.rejects(lost.client(req));
   const status=await client({action:'status',originalAction:'calculate',operationRequestId:req.operationRequestId});assert.equal(status.state,'COMMITTED');
   const r=await client(req);assert.equal(r.jobId,status.receipt.job_id||status.receipt.jobId);
   const dbLost=await certificationOddsStack(f,{loseRpcResponse:(n,p,v)=>p.payload?.odds_operation==='complete_production_odds_calculation_job'&&v.ok});
   await assert.rejects(dbLost.worker(r.jobId));assert.equal(job(r.jobId).status,'SUCCEEDED');assert.equal((await odds.worker(r.jobId)).processed,false);
   const v=await client(null,{jobId:r.jobId}),p={action:'publish',operationRequestId:randomUUID(),expectedContextToken:v.context.token,jobId:r.jobId,confirmPublication:true,expectedPublicationRevision:v.publication.revision,expectedSnapshotId:v.publication.snapshotId};
   await assert.rejects(lost.client(p));assert.equal((await client({action:'status',originalAction:'publish',operationRequestId:p.operationRequestId})).state,'COMMITTED');
   assert.equal((await client(p)).duplicate,true);
   assert.equal((await client({action:'status',originalAction:'calculate',operationRequestId:randomUUID()})).state,'UNKNOWN');
  });
  await run('lawful new source rejects old result/claim; current result B completes/publishes; history preserved',async()=>{
   const c=await client(),r=await client({action:'calculate',operationRequestId:randomUUID(),expectedContextToken:c.context.token,phase:'Round 3 Pairings Announced',iterations:100000});await odds.worker(r.jobId);
   const v=await client(null,{jobId:r.jobId}),p={action:'publish',operationRequestId:randomUUID(),expectedContextToken:v.context.token,jobId:r.jobId,confirmPublication:true,expectedPublicationRevision:v.publication.revision,expectedSnapshotId:v.publication.snapshotId};
   await assert.rejects(client({...p,phase:'Final Results'}));
   await f.source(director);await assert.rejects(client(p));
   // A rejected publication transaction rolls back. Reconcile the obsolete
   // READY job through the existing canonical claim validator, which commits
   // SUPERSEDED without executing another calculation.
   await assert.rejects(odds.worker(r.jobId));assert.equal(job(r.jobId).publication_status,'STALE');
   const current=await client(),held=await client({action:'calculate',operationRequestId:randomUUID(),expectedContextToken:current.context.token,phase:'Round 3 Pairings Announced',iterations:100000});
   const preserved=q("select jsonb_agg(to_jsonb(s)order by hole_number)from scoring_authority.hole_scores s where match_id='2026-R3-12'");
   const lifecycle=async op=>{const m=match(),id='local:odds:'+op+':'+randomUUID();const result=await invoke('SCORING.'+op,{match_id:m.match_id,mutation_key:id,expected_match_revision:m.match_revision},{...f.authorization,match_id:m.match_id,permission_revision:m.permission_revision},id);assert.equal(result.payload.ok,true);};
   let advanced=false;const stale=await certificationOddsStack(f,{afterRpc:async(_n,input,value)=>{
    if(!advanced&&input.payload?.odds_operation==='checkpoint_production_odds_calculation_job'&&value.completed_iterations===100000){advanced=true;await lifecycle('REOPEN_MATCH');}
   }});
   await assert.rejects(stale.worker(held.jobId));assert.equal(advanced,true);assert.equal(job(held.jobId).status,'SUPERSEDED');assert.equal(job(held.jobId).result_payload,null);
   await lifecycle('FINALIZE_MATCH');assert.equal(q("select jsonb_agg(to_jsonb(s)order by hole_number)from scoring_authority.hole_scores s where match_id='2026-R3-12'"),preserved);
   const now=await client(),b=await client({action:'calculate',operationRequestId:randomUUID(),expectedContextToken:now.context.token,phase:'Round 3 Pairings Announced',iterations:10000});await odds.worker(b.jobId);
   const reviewed=await client(null,{jobId:b.jobId});await client({action:'publish',operationRequestId:randomUUID(),expectedContextToken:reviewed.context.token,jobId:b.jobId,confirmPublication:true,expectedPublicationRevision:reviewed.publication.revision,expectedSnapshotId:reviewed.publication.snapshotId});
   assert.notEqual(r.jobId,b.jobId);assert.equal(q('select count(*)from scoring_authority.odds_published_snapshots where is_current_official'),'1');evidence.stale={oldClaim:'SUPERSEDED',oldCompletion:'DENIED',newResult:'CURRENT'};
  });
  await run('complete ordinary derived drain, no pending Odds/UNKNOWN, final STOP/disabled/paused; no Google jobs',async()=>{
   await drain();
   assert.equal(f.status().counts.pending_work,0);assert.equal(f.status().counts.active_claims,0);
   assert.equal(q("select count(*)from scoring_authority.odds_calculation_jobs where status in('PENDING','RUNNING','RETRYABLE')or(status='SUCCEEDED'and publication_status='READY')"),'0');
   assert.equal(q("select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');
   assert.equal(q('select count(*)from scoring_authority.odds_google_mirror_jobs'),'0');assert.equal(q('select count(*)from scoring_authority.google_outbox_events'),'0');
   assert.equal(q("select production_control.derived_final_recap_ready_v1('2026')"),'f');f.toggle(false);assert.equal(f.status().state,'OFF');
   assert.equal(q("select state from scoring_authority.ingress_gates where tournament_id='2026'"),'PAUSED');evidence.final={state:f.status().state,counts:f.status().counts};
  });
  evidence.googleCalls=0;evidence.productionData=0;

 }finally{evidence.completedAt=new Date().toISOString();const dir=repositoryRoot+'/docs/reliability/phase2d-odds-certification/evidence';await mkdir(dir,{recursive:true});await writeFile(dir+'/integration.json',JSON.stringify(evidence,null,2)+'\n');await destroyIsolatedCluster(f.cluster);}
});
