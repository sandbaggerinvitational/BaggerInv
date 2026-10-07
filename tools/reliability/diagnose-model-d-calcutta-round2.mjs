// Owned local PostgreSQL model only. Not a hosted executor or execution authority.
// Run with node --conditions=react-server. Drafts are never certified automatically.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {repositoryRoot as root} from '../../test/support/reliability/postgres17.mjs';
const {createModelDFixture}=await import(root+'/test/support/reliability/certification-model-d-fixture.mjs');
const {sqlFile,repositoryRoot,destroyIsolatedCluster,jsonLiteral}=await import(root+'/test/support/reliability/postgres17.mjs');
const {certificationDirectorStack}=await import(root+'/test/support/reliability/certification-director-proof.mjs');
const {certificationOddsStack}=await import(root+'/test/support/reliability/certification-odds-proof.mjs');
const {canonicalDirectorOperationsRequest}=await import(root+'/lib/canonical-director-operations-client.js');
const {canonicalDirectorOddsCommand}=await import(root+'/lib/canonical-director-odds-client.js');
const {entryDraft,entrySaveRequest}=await import(root+'/lib/net-skins-entry-workspace.js');
const {certificationOperationRpc}=await import(root+'/lib/certification-runtime-server.js');
const {calculateProductionFullNetSkins,calculateProductionFullNetCalcutta}=await import(root+'/lib/production-full-net.js');
const {readLeaderboardsCoreView,leaderboardsCoreDataFromSupabaseView}=await import(root+'/lib/leaderboards-core-supabase.js');
const {predecessor}=await import(root+'/lib/calcutta-management-model.js');
const {loadIntelligenceCanonicalInputs,calculateIntelligenceDerivedFromData}=await import(root+'/lib/intelligence-derived-supabase.js');
const hash=s=>createHash('sha256').update(s).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>hash(JSON.stringify(stable(v)));
const opid=s=>{const a=hash('model-d-d10-v1|'+s).slice(0,32).split('');a[12]='4';a[16]='8';const t=a.join('');return`${t.slice(0,8)}-${t.slice(8,12)}-${t.slice(12,16)}-${t.slice(16,20)}-${t.slice(20)}`;};
const fixture=JSON.parse(await fs.readFile(root+'/config/certification-model-d-fixture.json'));
const manifest={version:'model-d-d10-execution-v1',profile:'PART2C_DRESS_REHEARSAL',status:'DRAFT_UNCERTIFIED',matches:[],odds:[],cases:[]};
const f=await createModelDFixture();try{
 sqlFile(f.cluster,f.database,root+'/supabase/production_incremental/certification-model-d-director-score-v1.sql',{role:''});
 const secret='41'.repeat(32);f.env.BAGGER_CERTIFICATION_SESSION_ATTESTATION_KEY=secret;f.env.BAGGER_CERTIFICATION_SESSION_AUTHORITY_EPOCH=f.binding.authority_epoch_id;
 f.q(`insert into production_control.certification_session_keys_v1 values('${f.resource.resource_id}',1,'${f.binding.authority_epoch_id}',decode('${secret}','hex'))`);
 f.toggle(true);const stack=await certificationDirectorStack(f),odds=await certificationOddsStack(f);
 const drain=async label=>{console.log('DRAIN '+label);const states=[];for(let i=0;i<120;i++){const counts=f.status().counts;if(counts.pending_work===0&&counts.pending_intents===0){manifest.drains??=[];manifest.drains.push({label,counts,cycles:states});return;}f.start();const messages=f.batch().messages;assert.equal(messages.length,1);const entry=messages[0];f.register(entry);await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(entry.scheduled_at)-Date.now()+100)));const result=await f.consume(entry);states.push(result);if(f.status().state==='ENABLED')f.stop();if(f.status().state==='HALTED'){
 manifest.status='BLOCKED';manifest.failure={stage:label,invocation:result,status:f.status(),competition:JSON.parse(f.q("select jsonb_agg(jsonb_build_object('engine',engine_key,'status',status,'attempts',delivery_attempts,'cycle',delivery_cycle,'deadLetter',delivery_dead_letter_at,'errorCode',last_error_code,'safeError',last_error_safe))from scoring_authority.competition_recalculation_jobs")),calcutta:JSON.parse(f.q("select jsonb_agg(jsonb_build_object('engine','CALCUTTA','status',status,'attempts',delivery_attempts,'cycle',delivery_cycle,'deadLetter',delivery_dead_letter_at,'errorCode',last_error_code,'safeError',last_error_safe))from scoring_authority.calcutta_v1_recalculation_jobs"))};
 await fs.writeFile('/private/tmp/model-d-manifest-blocker.json',JSON.stringify(manifest,null,2)+'\n');throw Error('MODEL_D_LOCAL_MANIFEST_DERIVED_TERMINAL');}}throw Error('LOCAL_DRAIN_BOUND_EXCEEDED');};
 const m=id=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${id}'`));
 const control=async(action,id)=>{const row=m(id);const identity=opid(action+'|'+id);const r=await stack.transport.controlRequest(action,{matchId:id,expectedMatchRevision:row.match_revision,expectedPermissionRevision:row.permission_revision,operationRequestId:identity});return{action,operationId:identity,expectedMatchRevision:row.match_revision,expectedPermissionRevision:row.permission_revision,result:r};};
 const oddsAt=async phase=>{console.log('ODDS '+phase);const initial=await odds.client();const input=canonicalDirectorOddsCommand({action:'calculate',phase,iterations:10000},initial,opid('odds-calculate|'+phase));const requested=await odds.client(input);const calculated=await odds.worker(requested.jobId);assert.equal(calculated.completed,true);const review=await odds.client(null,{jobId:requested.jobId});const publish=canonicalDirectorOddsCommand({action:'publish',jobId:requested.jobId,confirmPublication:true},review,opid('odds-publish|'+phase));await odds.client(publish);const read=await odds.published();manifest.odds.push({phase,calculateOperationId:input.operationRequestId,publishOperationId:publish.operationRequestId,calculation:calculated,read:read.payload});};
 manifest.preparation=[];
 const prepareRound=async number=>{
 for(const match of fixture.matches.filter(m=>m.round===number)){const rev=Number(f.q("select revision from production_control.tournament_setup_context_v1 where tournament_id='2026'"));const operationId=opid("prepare|"+match.match_id);await stack.transport.setupRequest({action:"prepare-scoring-context",matchId:match.match_id,expectedRevision:rev,operationRequestId:operationId});manifest.preparation.push({matchId:match.match_id,operationId,expectedRevision:rev});}
 const entries=await stack.transport.entriesRequest();const round=entries.rounds.find(r=>r.roundNumber===number),draft=entryDraft(round);draft.configured=true;const expected=number===2?[['P11','P12'],['P13','P14']]:[['P12'],['P13']];for(let i=0;i<round.entrants.length;i++)draft.entries[i].entered=expected.some(ids=>ids.join('|')===round.entrants[i].playerIds.join('|'));await stack.transport.entriesRequest(entrySaveRequest(round,draft,opid('net-entry|'+number)));
 await stack.transport.netSkinsConfigurationRequest({expectedConfigurationRevision:number-1,eligibleRoundNumbers:Array.from({length:number},(_,i)=>i+1),entryRevisions:Object.fromEntries(Array.from({length:number},(_,i)=>[i+1,1])),operationRequestId:opid('net-config|'+number)});
 };
 await prepareRound(1);await prepareRound(2);await prepareRound(3);
 const finance=(await stack.transport.calcuttaRequest('management-read')).data;
 await stack.transport.calcuttaRequest('management-entry',{...predecessor(finance),operationRequestId:opid('calcutta-purchase'),entry:{playerId:'P01',purchasePrice:'1',owners:[{buyerId:'P12',percentage:'100'}]}});
 console.log('NET CONFIG PASS');
 const c=await canonicalDirectorOperationsRequest(null,{family:'ODDS_INPUT_CONFIGURATION',fetchImpl:stack.request});await canonicalDirectorOperationsRequest({family:'ODDS_INPUT_CONFIGURATION',action:'configure',operationRequestId:opid('odds-config'),expectedContextToken:c.context.contextToken,payload:{expectedConfigurationRevision:0,profile:'CERTIFICATION_DEFAULTS_V1',confirmation:'CONFIGURE SYNTHETIC ODDS INPUTS',reason:'Owned local deterministic manifest certification.'}},{family:'ODDS_INPUT_CONFIGURATION',fetchImpl:stack.request});
 await oddsAt('Pre-Tournament');
 for(const rd of fixture.rounds){
 const plans=fixture.matches.filter(x=>x.round===rd.round);if(rd.round===3)await oddsAt('Round 3 Pairings Announced');
 for(const match of plans){console.log('MATCH '+match.match_id);const plan={matchId:match.match_id,round:match.round,format:match.format,participants:match.participants.map(x=>x.player_id),actor:'DIRECTOR_CANONICAL_SCORING_OPERATION',providerIdentity:'DIRECTOR_P01',route:'/api/director/canonical-operations',family:'DIRECTOR_CANONICAL_SCORE',auditActor:'DIRECTOR',operations:[],lifecycle:[]};
 plan.lifecycle.push(await control('mark-live',match.match_id));plan.lifecycle.push(await control('access-activate',match.match_id));
 const ctx=(await stack.transport.read()).context.contextToken;
 const winner=match.round===3?(match.number<=8?1:match.number<=11?2:0):(match.number%3===1?1:match.number%3===2?2:0);
 for(let hole=1;hole<=18;hole++){const row=m(match.match_id),n=match.format==='BB'?2:1,tie=winner===0||hole%3===0;const left=winner===2&&!tie?5:4,right=winner===1&&!tie?5:4;
 const payload={matchId:match.match_id,holeNumber:hole,team1GrossScores:Array(n).fill(left),team2GrossScores:Array(n).fill(right),expectedMatchRevision:row.match_revision,expectedRevision:0,expectedPermissionRevision:row.permission_revision,expectedRound:row.round_number,expectedFormat:row.format};
 const identity=opid('score|'+match.match_id+'|'+hole),input={family:'DIRECTOR_CANONICAL_SCORE',action:'submit-hole',operationRequestId:identity,expectedContextToken:ctx,payload};
 const response=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify(input)});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));plan.operations.push({operationId:identity,payload,expectedSuccessorRevision:result.receipt.match_revision});}
 const row=m(match.match_id),identity=opid('finalize|'+match.match_id);
 const final=await certificationOperationRpc('SCORING.FINALIZE_MATCH',{match_id:match.match_id,mutation_key:identity,expected_match_revision:row.match_revision},{env:f.env,authorization:{...f.authorization,match_id:match.match_id,permission_revision:row.permission_revision},operationRequestId:identity},f.dependencies);assert.equal(final.payload.ok,true,JSON.stringify(final.payload));plan.expectedResult=final.payload;plan.finalState=m(match.match_id);manifest.matches.push(plan);
 }
 const view=await readLeaderboardsCoreView('2026',{env:f.env,certificationDependencies:f.dependencies});assert.equal(view.payload.ok,true);const core=leaderboardsCoreDataFromSupabaseView(view.payload.data);manifest.cases.push({round:rd.round,tournament:core.tournament,rounds:core.rounds.map(r=>({number:r.number,status:r.status}))});
 if(rd.round===2){
 try{
 const configuration=JSON.parse(f.q("select jsonb_build_object('tournament',t,'configuration',jsonb_build_object('tournament_id','2026','tournament_year',2026,'configuration_revision',c.configuration_revision,'configuration_fingerprint',c.configuration_fingerprint,'auction_revision',c.auction_revision,'auction_fingerprint',c.auction_fingerprint,'purchases',a.auction_manifest->'purchases','ownership',a.auction_manifest->'ownership','point_structure',cfg.configuration_manifest->'point_structure','payout_structure',cfg.configuration_manifest->'payout_structure','financial_contract',cfg.configuration_manifest->'financial_contract'))from scoring_authority.calcutta_v1_current c join scoring_authority.calcutta_v1_configuration_revisions cfg on cfg.configuration_revision_id=c.configuration_revision_id join scoring_authority.calcutta_v1_auction_fact_revisions a on a.auction_revision_id=c.auction_revision_id cross join scoring_authority.tournaments t where c.tournament_id='2026'and t.tournament_id='2026'"));
 const fullCore={...view.payload.data,full_net_authority:JSON.parse(f.q("select production_control.full_net_tournament_v1('2026')"))};manifest.calcutta=calculateProductionFullNetCalcutta(configuration,fullCore);assert.equal(manifest.calcutta.canonicalInputVerification.purchasedAssets,1);

 await fs.writeFile('/private/tmp/model-d-calcutta-round2-repro.json',JSON.stringify({status:'CALCULATOR_PASS',result:manifest.calcutta,configuration,fullCore},null,2)+'\n');
 }catch(error){await fs.writeFile('/private/tmp/model-d-calcutta-round2-repro.json',JSON.stringify({status:'FAIL',name:error.name,message:error.message,stack:error.stack},null,2)+'\n');}
 break;
 }if(rd.round<3)await oddsAt('After Round '+rd.round);
 }
 }finally{await destroyIsolatedCluster(f.cluster);}
