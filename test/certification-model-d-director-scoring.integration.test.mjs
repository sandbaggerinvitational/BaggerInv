import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {readFile,writeFile} from 'node:fs/promises';
import {canonicalCatalog,serialize} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {createModelDFixture} from './support/reliability/certification-model-d-fixture.mjs';
import {certificationDirectorStack} from './support/reliability/certification-director-proof.mjs';
import {sqlFile,sqlResult,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {submitCanonicalHoleScore} from '../lib/scoring-authority-supabase.js';
import {canonicalDirectorOperationsRequest} from '../lib/canonical-director-operations-client.js';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-model-d-director-score-v1.sql';
test('Model D Director shipping score guard uses canonical core and transactional authority',async t=>{
 const f=await createModelDFixture();try{
 const core=()=>f.q("select encode(extensions.digest(pg_get_functiondef('production_control.canonical_submit_hole_score_v2(jsonb,jsonb)'::regprocedure),'sha256'),'hex')");const before=core();
 const metadata=()=>f.q("select jsonb_agg(jsonb_build_object('oid',oid::text,'owner',proowner::text,'acl',proacl,'security',prosecdef,'config',proconfig)order by oid)from pg_proc where pronamespace in(select oid from pg_namespace where nspname in('production_control','scoring_authority','public'))");const originalMetadata=JSON.parse(metadata());
 const dispatchDefinition=f.q("select pg_get_functiondef('production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure)");
 f.q(dispatchDefinition.replace('begin','begin\n -- local mismatched predecessor\n'));
 const mismatch=sqlResult(f.cluster,f.database,await readFile(artifact,'utf8'),{role:''});assert.notEqual(mismatch.status,0);assert.match(mismatch.stderr,/PREDECESSOR_MISMATCH/);assert.equal(f.q("select to_regprocedure('production_control.assert_model_d_director_score_v1(jsonb,boolean)')is null"),'t');f.q(dispatchDefinition);
 sqlFile(f.cluster,f.database,artifact,{role:''});sqlFile(f.cluster,f.database,artifact,{role:''});assert.equal(core(),before);await writeFile('/private/tmp/model-d-director-score-catalog.json',serialize(await canonicalCatalog(f.cluster,f.database)));const installedMetadata=JSON.parse(metadata());for(const row of originalMetadata)assert.deepEqual(installedMetadata.find(r=>r.oid===row.oid),row,'metadata preserved');
 const secret='31'.repeat(32);f.env.BAGGER_CERTIFICATION_SESSION_ATTESTATION_KEY=secret;f.env.BAGGER_CERTIFICATION_SESSION_AUTHORITY_EPOCH=f.binding.authority_epoch_id;
 f.q(`insert into production_control.certification_session_keys_v1 values('${f.resource.resource_id}',1,'${f.binding.authority_epoch_id}',decode('${secret}','hex'))`);
 f.toggle(true);const stack=await certificationDirectorStack(f);let captured;const transport=stack.certificationDependencies.fetchImpl;stack.certificationDependencies.fetchImpl=async(url,init)=>{if(JSON.parse(init.body).input.payload?.director_score_contract&&JSON.parse(init.body).input.payload.match_id==='2026-R3-2')captured={input:JSON.parse(init.body).input,headers:Object.fromEntries(Object.entries(init.headers).filter(([k])=>k.startsWith("x-bagger-director-score-")))};return transport(url,init);};
 const match=id=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${id}'`));
 const submit=async(id,changes={},inputChanges={})=>{const m=match(id);const c=await canonicalDirectorOperationsRequest(null,{family:'TOURNAMENT_SETUP',fetchImpl:stack.request});const payload={matchId:id,holeNumber:1,team1GrossScores:Array(m.format==='BB'?2:1).fill(4),team2GrossScores:Array(m.format==='BB'?2:1).fill(5),expectedMatchRevision:m.match_revision,expectedRevision:0,expectedPermissionRevision:m.permission_revision,expectedRound:m.round_number,expectedFormat:m.format,...changes};
 const input={family:'DIRECTOR_CANONICAL_SCORE',action:'submit-hole',operationRequestId:randomUUID(),expectedContextToken:c.context.contextToken,payload,...inputChanges};const response=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify(input)});return {status:response.status,body:await response.json(),input};};
 await t.test('unprepared, future and closed matches denied without scores',async()=>{const r=await submit('2026-R1-2');assert.equal(r.status,403,JSON.stringify(r.body));assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');assert.equal(f.q("select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');});
 for(const id of ['2026-R1-2','2026-R2-2','2026-R3-2'])await t.test(id+' lawful shipping Director score and replay',async()=>{
 await f.mutation('prepare-scoring-context',{matchId:id});let m=match(id);await stack.transport.controlRequest('mark-live',{matchId:id,expectedMatchRevision:m.match_revision,expectedPermissionRevision:m.permission_revision,operationRequestId:randomUUID()});
 m=match(id);await stack.transport.controlRequest('access-activate',{matchId:id,expectedMatchRevision:m.match_revision,expectedPermissionRevision:m.permission_revision,operationRequestId:randomUUID()});
 const r=await submit(id);assert.equal(r.status,200,JSON.stringify(r.body)+JSON.stringify(stack.calls.findLast(c=>c.error)?.error?.message));assert.equal(r.body.actor,'DIRECTOR');assert.equal(r.body.receipt.ok,true);
 const receipt=JSON.parse(f.q(`select to_jsonb(s)from scoring_authority.score_mutations s where mutation_key='${r.input.operationRequestId}'`));assert.equal(receipt.actor_id,'P01');assert.equal(receipt.originating_auth_user_id,f.authorization.auth_user_id);
 const replay=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify(r.input)});assert.equal(replay.status,200,await replay.text());assert.equal(f.q(`select count(*)from scoring_authority.score_mutations where mutation_key='${r.input.operationRequestId}'`),'1');
 const conflict=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({...r.input,payload:{...r.input.payload,team1GrossScores:r.input.payload.team1GrossScores.map(()=>3)}})});assert.notEqual(conflict.status,200);
 });
 await t.test('payload actor substitution and ordinary participant denied',async()=>{const r=await submit('2026-R1-2',{actor:'DIRECTOR'});assert.equal(r.status,400);const saved=stack.authorization;stack.setAuthorization({status:'active',source:'entitlement',identity:{...saved.identity,actor:{id:'P12',role:'PARTICIPANT'}}});const denied=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({family:'DIRECTOR_CANONICAL_SCORE'})});assert.equal(denied.status,403);stack.setAuthorization(saved);});
 await t.test('signed-out, malformed facts and stale CAS preserve authority',async()=>{
 const saved=stack.authorization;stack.setAuthorization({status:'inactive'});const out=await stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({family:'DIRECTOR_CANONICAL_SCORE'})});assert.equal(out.status,403);stack.setAuthorization(saved);
 for(const changes of [{holeNumber:0},{holeNumber:19},{team1GrossScores:[0,4]},{team2GrossScores:[21,4]},{playerId:'P02'},{expectedRound:3,expectedFormat:'BB'}]){const r=await submit('2026-R1-2',changes);assert.notEqual(r.status,200);}
 const stale=await submit('2026-R1-2',{holeNumber:2,expectedMatchRevision:0});assert.equal(stale.status,409);assert.equal(stale.body.outcome==='COMMITTED',false);
 });
 await t.test('bare service role lacks transport attestation and private helper',()=>{const input=stack.calls.findLast(x=>x.name==='execute_certification_operation_v1'&&x.input.payload?.director_score_contract)?.input;assert.ok(input);const r=sqlResult(f.cluster,f.database,`set role service_role;select public.admit_certification_operation_v1(${jsonLiteral(input)})`,{role:'service_role'});assert.notEqual(r.status,0);assert.match(r.stderr,/ATTESTATION_REQUIRED/);const privateCall=sqlResult(f.cluster,f.database,`set role service_role;select production_control.assert_model_d_director_score_v1('{}',false)`,{role:'service_role'});assert.notEqual(privateCall.status,0);});

 await t.test('transactional binding, admission, permissions and lifecycle negatives',async()=>{
 const base=structuredClone(captured);assert.ok(base);
 const cases=[
 ['wrong resource',i=>i.resource.resource_id='CERTIFICATION:00000000-0000-4000-8000-000000000001'],
 ['wrong project',i=>i.resource.project_ref='zzzzzzzzzzzzzzzzzzzz'],
 ['wrong release',i=>i.deployment.release_commit='a'.repeat(40)],
 ['wrong deployment',i=>i.deployment.deployment_id='dpl_WrongDeployment'],
 ['wrong origin',i=>i.deployment.deployment_origin='https://wrong.vercel.app'],
 ['wrong branch',i=>i.deployment.git_branch='codex/wrong'],
 ['stale registration revision',i=>i.resource.registration_revision=2],
 ['stale context',i=>i.expected_context_token='0'.repeat(64)],
 ['participant role',i=>i.authorization.role='PLAYER'],
 ['arbitrary provider subject',i=>i.authorization.auth_user_id='00000000-0000-4000-8000-000000000001'],
 ['wrong match',i=>i.payload.match_id='2026-R3-fabricated'],
 ['wrong format',i=>i.payload.expected_format='BB'],
 ['wrong round',i=>i.payload.expected_round=1],
 ['client player substitution',i=>i.payload.player_id='P02'],
 ];
 for(const [name,change]of cases){const i=structuredClone(base.input);change(i);const r=sqlResult(f.cluster,f.database,`begin;set local request.jwt.claim.role='service_role';set local request.headers='${JSON.stringify(base.headers)}';select production_control.assert_model_d_director_score_v1(${jsonLiteral(i)},true);rollback;`,{role:''});assert.notEqual(r.status,0,name);}
 const mutations=[
 ['Director admission disabled',"update production_control.certification_admission_v1 set capabilities=array_remove(capabilities,'DIRECTOR')"],
 ['scoring admission disabled',"update production_control.certification_admission_v1 set capabilities=array_remove(capabilities,'SCORING')"],
 ['global admission disabled','update production_control.certification_admission_v1 set enabled=false'],
 ['ingress paused',"update scoring_authority.ingress_gates set state='PAUSED'"],
 ['permission closed',"update scoring_authority.scoring_permissions set can_score=false where match_id='2026-R3-2'"],
 ['locked',"update scoring_authority.matches set scoring_locked=true where match_id='2026-R3-2'"],
 ['FINAL',"update scoring_authority.matches set status='FINAL' where match_id='2026-R3-2'"],
 ['UPCOMING/future',"update scoring_authority.matches set status='UPCOMING' where match_id='2026-R3-2'"],
 ['unprepared',"update scoring_authority.matches set scoring_snapshot_id=null where match_id='2026-R3-2'"],
 ['wrong profile',"update production_control.certification_model_d_profile_v1 set purpose='WRONG'"],
 ];
 for(const [name,mutation]of mutations){const r=sqlResult(f.cluster,f.database,`begin;${mutation};set local request.jwt.claim.role='service_role';set local request.headers='${JSON.stringify(base.headers)}';select production_control.assert_model_d_director_score_v1(${jsonLiteral(base.input)},true);rollback;`,{role:''});assert.notEqual(r.status,0,name);assert.doesNotMatch(r.stderr,/safeupdate|violates check constraint/,name+' must fail authority guard, not injection setup');}
 for(const role of ['anon','authenticated','service_role']){const r=sqlResult(f.cluster,f.database,`set role ${role};select production_control.assert_model_d_director_score_v1('{}',true)`,{role});assert.notEqual(r.status,0,role);}
 assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'3');
 });
 await t.test('participant and Director facts converge; concurrent stale predecessor has one winner',async()=>{
 const id='2026-R1-6';await f.mutation('prepare-scoring-context',{matchId:id});for(const action of ['mark-live','access-activate']){const m=match(id);await stack.transport.controlRequest(action,{matchId:id,expectedMatchRevision:m.match_revision,expectedPermissionRevision:m.permission_revision,operationRequestId:randomUUID()});}
 let m=match(id);const participant={...f.authorization,role:'PLAYER',player_id:'P12',auth_user_id:'d2000000-0000-4000-8000-000000000012',passport_verified:true,match_id:id,permission_revision:m.permission_revision};
 const families=()=>JSON.parse(f.q(`select coalesce(jsonb_object_agg(family,n),'{}'::jsonb)from(select family,count(*)n from scoring_authority.score_derived_intents_v1 where match_id='${id}'group by family)s`));const before=families();
 const r=await submitCanonicalHoleScore({match_id:id,hole_number:1,team_1_gross_scores:[4,4],team_2_gross_scores:[5,5],expected_match_revision:m.match_revision,expected_hole_revision:0,mutation_key:randomUUID(),authorization:participant},{env:f.env,certificationDependencies:f.dependencies});assert.equal(r.payload.ok,true,JSON.stringify(r.payload));const middle=families();
 const director=await submit(id,{holeNumber:2});assert.equal(director.status,200,JSON.stringify(director.body));const after=families();for(const family of Object.keys(after))assert.equal(after[family]-middle[family],middle[family]-(before?.[family]||0),family+' equivalent intents');
 const rows=JSON.parse(f.q(`select jsonb_agg(jsonb_build_object('t1',team_1_gross_scores,'t2',team_2_gross_scores,'winner',hole_winner)order by hole_number)from scoring_authority.hole_scores where match_id='${id}'`));assert.deepEqual(rows[0],rows[1]);
 const baseline=match(id),ctx=(await stack.transport.read()).context.contextToken;
 const input={family:'DIRECTOR_CANONICAL_SCORE',action:'submit-hole',expectedContextToken:ctx,payload:{matchId:id,holeNumber:3,team1GrossScores:[4,4],team2GrossScores:[5,5],expectedMatchRevision:baseline.match_revision,expectedRevision:0,expectedPermissionRevision:baseline.permission_revision,expectedRound:1,expectedFormat:'BB'}};
 const results=await Promise.all([4,5].map(score=>stack.request('/api/director/canonical-operations',{method:'POST',body:JSON.stringify({...input,operationRequestId:randomUUID(),payload:{...input.payload,team1GrossScores:[score,score]}})})));assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(f.q(`select count(*)from scoring_authority.hole_scores where match_id='${id}'and hole_number=3`),'1');assert.equal(f.q("select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');
 });
 assert.equal(core(),before);f.toggle(false);
 }finally{await destroyIsolatedCluster(f.cluster);}
});
