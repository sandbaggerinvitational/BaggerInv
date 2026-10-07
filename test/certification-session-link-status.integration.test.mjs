import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModelDFixture} from './support/reliability/certification-model-d-fixture.mjs';
import {createCalcuttaQueueFixture} from './support/reliability/certification-calcutta-queue-fixture.mjs';
import {sqlResult,sqlFile,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {canonicalCatalog,assertCatalogConvergence} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {verifyParticipantAuthClaims,verifiedParticipantAuthSubject} from '../lib/supabase-auth-server.js';
import {readParticipantSessionContext,participantSessionFailure} from '../lib/participant-session-context.js';
import {readCertificationSessionLinkStatus} from '../lib/certification-runtime-server.js';
import {requireCertificationResourceEnvironment,certificationRegistrationEnvelope} from '../lib/canonical-resource-registration.js';
import {renderCertificationSessionKey} from '../tools/reliability/certification-session-key.mjs';
import {modelDIdentities} from '../tools/reliability/certification-model-d-fixture.mjs';

const key='9a'.repeat(32);
function configureKey(f){const epoch=f.q('select authority_epoch_id from production_control.certification_admission_v1');f.q(`insert into production_control.certification_session_keys_v1(resource_id,registration_revision,authority_epoch_id,attestation_key)values('${f.resource.resource_id}',1,'${epoch}',decode('${key}','hex'))`);f.env.BAGGER_CERTIFICATION_SESSION_ATTESTATION_KEY=key;f.env.BAGGER_CERTIFICATION_SESSION_AUTHORITY_EPOCH=epoch;}
const artifact=repositoryRoot+'/supabase/production_incremental/certification-session-link-status-v1.sql';
const verified=subject=>verifyParticipantAuthClaims({}, {}, {createClient:()=>({auth:{getClaims:async()=>({data:{claims:{sub:subject}},error:null})}})});
function transport(f){return {...f.dependencies,fetchImpl:async(url,init)=>{
 if(new URL(url).pathname.split('/').at(-1)!=='read_certification_session_link_status_v1')return f.dependencies.fetchImpl(url,init);
 assert.equal(new URL(url).origin,f.env.SUPABASE_SCORING_MIRROR_URL);f.lastSessionHeaders={...init.headers};
 const r=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nset role service_role;select set_config('request.headers',${jsonLiteral(init.headers)}::text,false);select public.read_certification_session_link_status_v1(${jsonLiteral(JSON.parse(init.body).input)})`,{role:'service_role'});
 if(r.status!==0){const m=/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(r.stderr);assert.ok(m,r.stderr);return Response.json({code:m[1],message:m[2]},{status:400});}
 return Response.json(JSON.parse(r.stdout.trim().split('\n').at(-1)));
}};}
async function shipping(verification, read, env){
 const source=(await readFile(repositoryRoot+'/app/api/participant/auth/session/route.js','utf8')).split('export async function DELETE')[0]
 .replace(/^import[\s\S]*?;\n/gm,'').replace('export const dynamic','const dynamic').replace('export async function GET','async function GET');
 const seams={cookies:async()=>({}),NextResponse:{json:(v,o)=>Response.json(v,o)},participantIdentityAuthorityEnvironment:()=>({participantAuthEnabled:true,resolved:'supabase'}),verifyParticipantAuthClaims:async()=>verification,
 readParticipantSessionContext:read,participantSessionFailure:e=>participantSessionFailure(e,env),performance};
 const get=new Function(...Object.keys(seams),source+';return GET;')(...Object.values(seams));
 const response=await get(new Request('https://local.invalid/api/participant/auth/session?target_user=ignored&resource=PRODUCTION&playerId=P99'));
 return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
}
const inactive={session:'inactive',identityAuthority:'supabase',code:'ACTIVE_USER_PLAYER_LINK_REQUIRED'};

test('Model D pre-fixture shipping session: minimum binding-only link fact, linked-disabled, negatives and no writes',async()=>{
 const f=await createModelDFixture({provision:false});
 try{
 configureKey(f);
 const keySql=renderCertificationSessionKey({env:f.env,authorityEpoch:f.env.BAGGER_CERTIFICATION_SESSION_AUTHORITY_EPOCH},f.dependencies);
 assert.ok(!keySql.includes(key));
 const readyKeySql=keySql.replace('\\getenv session_attestation_key BAGGER_CERTIFICATION_SESSION_ATTESTATION_KEY',`\\set session_attestation_key ${key}`);
 const keyRow=f.q("select encode(extensions.digest(to_jsonb(k)::text,'sha256'),'hex')from production_control.certification_session_keys_v1 k");
 f.q(readyKeySql);f.q(readyKeySql);assert.equal(f.q("select encode(extensions.digest(to_jsonb(k)::text,'sha256'),'hex')from production_control.certification_session_keys_v1 k"),keyRow);
 assert.throws(()=>f.q(readyKeySql.replace(key,'ab'.repeat(32))),/KEY_CONFLICT/);
 const deps=transport(f),u=await verified(modelDIdentities[1].auth_user_id);
 const read=()=>readParticipantSessionContext(u,{env:f.env},deps);
 const state=()=>f.q("select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb)::text,'sha256'),'hex')from participant_identity.user_player_links l")+'|'+f.q("select jsonb_build_object('players',(select count(*)from scoring_authority.players),'teams',(select count(*)from scoring_authority.teams),'rounds',(select count(*)from scoring_authority.rounds),'matches',(select count(*)from scoring_authority.matches),'scores',(select count(*)from scoring_authority.hole_scores),'links',(select count(*)from participant_identity.user_player_links))");
 assert.deepEqual(JSON.parse(state().split('|')[1]),{players:0,teams:0,rounds:0,matches:0,scores:0,links:0});
 const allTables=JSON.parse(f.q("select jsonb_agg(format('%I.%I',n.nspname,c.relname)order by n.nspname,c.relname)from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'and n.nspname in('participant_identity','production_control','scoring_authority')"));
 const dataSnapshot=()=>Object.fromEntries(allTables.map(name=>[name,f.q(`select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t)order by to_jsonb(t)::text collate "C"),'[]'::jsonb)::text,'sha256'),'hex')from ${name} t`)]));
 const allBefore=dataSnapshot();
 const before=state();
 assert.deepEqual((await shipping({status:'inactive'},()=>assert.fail('signed out must not read'),f.env)).body,{session:'inactive',identityAuthority:'supabase'});
 for(let i=0;i<2;i++){const r=await shipping(u,read,f.env);assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body,inactive);assert.equal(r.cache,'private, no-store');}
 assert.equal(state(),before);assert.deepEqual(dataSnapshot(),allBefore);
 await assert.rejects(readCertificationSessionLinkStatus({status:'active',claims:{sub:modelDIdentities[0].auth_user_id}},{env:f.env},deps),e=>e.code==='AUTH_SESSION_REQUIRED');
 assert.equal(verifiedParticipantAuthSubject(u),modelDIdentities[1].auth_user_id);
 const saved=u.claims.sub;u.claims.sub=modelDIdentities[0].auth_user_id;assert.equal(verifiedParticipantAuthSubject(u),saved);u.claims.sub=saved;
 const envelope=certificationRegistrationEnvelope(requireCertificationResourceEnvironment(f.env,deps));
 const input={contract_version:'certification-session-link-v1',...envelope};
 const direct=(input,headers={})=>sqlResult(f.cluster,f.database,`set role service_role;select set_config('request.headers',${jsonLiteral(headers)}::text,false);select public.read_certification_session_link_status_v1(${jsonLiteral(input)})`,{role:'service_role'});
 const hdr={...f.lastSessionHeaders};
 assert.equal(direct(input,hdr).status,0);
 assert.notEqual(direct(input).status,0,'bare transport without verified-subject assertion denies');
 for(const other of [modelDIdentities[0].auth_user_id,'ffffffff-ffff-4fff-8fff-ffffffffffff']){const denied=direct(input,{...hdr,'x-bagger-session-subject':other});assert.notEqual(denied.status,0);assert.match(denied.stderr,/SESSION_SUBJECT_DENIED/);}
 assert.match(direct(input,{...hdr,'x-bagger-session-time':String(Math.floor(Date.now()/1000)-120)}).stderr,/SESSION_PROOF_STALE/);
 for(const extra of [{target_auth_user_id:modelDIdentities[0].auth_user_id},{player_id:'P01'},{authority_epoch_id:'stale'},{expected_admission_revision:0}])assert.notEqual(direct({...input,...extra},hdr).status,0);
 for(const [section,key,value]of [['resource','resource_id','CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'],['resource','project_ref','trmcwrljjxwhgtikfdgu'],['resource','registration_revision',0],['resource','resource_class','PRODUCTION'],['deployment','release_commit','f'.repeat(40)],['deployment','deployment_id','dpl_WrongDeployment'],['deployment','deployment_origin','https://wrong.vercel.app'],['deployment','git_branch','codex/wrong'],['deployment','vercel_project_id','prj_WrongProject']]){
  const changed=structuredClone(input);changed[section][key]=value;assert.notEqual(direct(changed,hdr).status,0,section+'.'+key);
 }
 for(const role of ['anon','authenticated','service_role']){
  const privateCall=sqlResult(f.cluster,f.database,`set role ${role};select production_control.certification_session_link_status_v1(${jsonLiteral(input)})`,{role});assert.notEqual(privateCall.status,0);
  if(role!=='service_role')assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select public.read_certification_session_link_status_v1(${jsonLiteral(input)})`,{role}).status,0);
 }
 // An internally inconsistent epoch cannot return false link status.
 const epoch=f.env.BAGGER_CERTIFICATION_SESSION_AUTHORITY_EPOCH;
 await assert.rejects(readCertificationSessionLinkStatus(u,{env:{...f.env,BAGGER_CERTIFICATION_SESSION_AUTHORITY_EPOCH:'d1000000-0000-4000-8000-000000000099'}},deps),e=>e.code==='CERTIFICATION_SESSION_AUTHORITY_DENIED');
 assert.equal(f.q('select authority_epoch_id from production_control.certification_admission_v1'),epoch);
 const forged={...hdr,'x-bagger-session-time':String(Math.floor(Date.now()/1000)),'x-bagger-session-epoch':epoch,'x-bagger-session-proof':'0'.repeat(64)};
 assert.notEqual(direct(input,forged).status,0,'bare service-role fabricated subject assertion denies');
 await assert.rejects(readCertificationSessionLinkStatus(u,{env:{...f.env,BAGGER_CERTIFICATION_SESSION_ATTESTATION_KEY:'0'.repeat(64)}},deps),e=>e.code==='CERTIFICATION_SESSION_SUBJECT_DENIED');
 for(const role of ['anon','authenticated','service_role'])assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select * from production_control.certification_session_keys_v1`,{role}).status,0);
 // Minimal owned link fixture only; no matches/rounds/scores or D9 proof.
 f.q(`insert into scoring_authority.players(player_id,display_name)values('P12','Synthetic minimum link proof');insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)values('${modelDIdentities[1].auth_user_id}','P12','ACTIVE','LOCAL_CERTIFICATION','${'a'.repeat(64)}')`);
 assert.equal(await readCertificationSessionLinkStatus(u,{env:f.env},deps),true);
 const denied=await shipping(u,read,f.env);assert.equal(denied.status,403);assert.equal(denied.body.code,'CANONICAL_RESOURCE_DEPLOYMENT_DENIED');assert.notEqual(denied.body.code,inactive.code);assert.deepEqual(Object.keys(denied.body).sort(),['code','identityAuthority','session']);
 // Current positive continuation is a transport model, not D9/D10 scoring proof.
 f.toggle(true);let projections=0;
 const current={...deps,fetchImpl:async(url,init)=>{if(new URL(url).pathname.endsWith('/read_certification_projection_v1')){projections++;return Response.json({ok:true,data:{playerId:'P12',displayName:'Synthetic minimum link proof'}});}return deps.fetchImpl(url,init);}};
 const active=await shipping(u,()=>readParticipantSessionContext(u,{env:f.env},current),f.env);assert.equal(active.status,200);assert.equal(active.body.session,'active');assert.equal(projections,1);f.toggle(false);
 const broken={...deps,fetchImpl:async()=>{throw Error('private infrastructure detail');}};
 const unavailable=await shipping(u,()=>readParticipantSessionContext(u,{env:f.env},broken),f.env);assert.equal(unavailable.status,503);assert.equal(unavailable.body.code,'CERTIFICATION_TRANSPORT_UNAVAILABLE');assert.ok(!JSON.stringify(unavailable.body).includes('private infrastructure'));
 assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');
 assert.equal(f.q('select count(*)from scoring_authority.matches'),'0');
 }finally{await destroyIsolatedCluster(f.cluster);}
});

test('Original Certification forward preserves catalog metadata/history; unlinked and linked-disabled; atomic replay/drift',async()=>{
 const f=await createCalcuttaQueueFixture({emptyAuction:false});
 try{
 for(const n of ['certification-calcutta-publication-v1.sql','certification-net-skins-result-read-v1.sql','certification-net-skins-calculation-v1.sql','certification-odds-input-configuration-v1.sql','certification-model-d-execution-v1.sql'])sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/'+n,{role:''});
 const prior=await canonicalCatalog(f.cluster,f.database),a=await readFile(artifact,'utf8');
 assert.throws(()=>f.q(a.replace('begin;',"begin;alter function production_control.certification_ingress_recovery_resource_v1(jsonb) owner to service_role;")),/PREDECESSOR_MISMATCH/);
 assertCatalogConvergence(await canonicalCatalog(f.cluster,f.database),prior);
 f.q(a);const next=await canonicalCatalog(f.cluster,f.database);
 assert.equal(next.functions.length,prior.functions.length+2);
 for(const fn of prior.functions)assert.deepEqual(next.functions.find(x=>x.identity===fn.identity),fn);
 for(const relation of prior.relations)assert.deepEqual(next.relations.find(x=>x.identity===relation.identity),relation);assert.equal(next.relations.length,prior.relations.length+1);assert.deepEqual(next.policies,prior.policies);
 f.q(a);assertCatalogConvergence(await canonicalCatalog(f.cluster,f.database),next);
 assert.throws(()=>f.q(a.replace('begin;','begin;grant execute on function production_control.certification_session_link_status_v1(jsonb) to service_role;')),/INSTALLED_MISMATCH/);
 assertCatalogConvergence(await canonicalCatalog(f.cluster,f.database),next);
 assert.throws(()=>f.q(a.replace('begin;','begin;alter table production_control.certification_session_keys_v1 disable row level security;')),/KEY_METADATA_MISMATCH/);
 assert.throws(()=>f.q(a.replace('begin;','begin;alter table production_control.certification_session_keys_v1 alter column attestation_key drop not null;')),/KEY_STRUCTURE_MISMATCH/);
 assertCatalogConvergence(await canonicalCatalog(f.cluster,f.database),next);
 configureKey(f);const id='77777777-7777-4777-8777-777777777777';f.q(`insert into auth.users(id,email)values('${id}','synthetic-unlinked@example.invalid')`);
 const u=await verified(id),deps=transport(f);
 const result=await shipping(u,()=>readParticipantSessionContext(u,{env:f.env},deps),f.env);assert.equal(result.status,200,JSON.stringify(result.body));assert.deepEqual(result.body,inactive);
 const linked=await verified(f.q("select auth_user_id from participant_identity.user_player_links where status='ACTIVE'limit 1"));
 f.toggle(false);const linkedDenied=await shipping(linked,()=>readParticipantSessionContext(linked,{env:f.env},deps),f.env);assert.equal(linkedDenied.status,403);assert.equal(linkedDenied.body.code,'CANONICAL_RESOURCE_DEPLOYMENT_DENIED');
 assert.equal(f.q('select cardinality(production_control.worker_supervisor_engines_v1())'),'5');
 }finally{await destroyIsolatedCluster(f.cluster);}
});

// Production/ordinary Preview retain the existing adapter and DTO; this is a
// local boundary model and never a request to either hosted environment.
test('Production and ordinary Preview session selection unchanged; infrastructure remains distinct',async()=>{
 const source=(await readFile(repositoryRoot+'/lib/participant-session-context.js','utf8')).replace(/^import[^;]+;\n/gm,'').replaceAll('export ','');
 for(const classification of ['production','preview']){
  let calls=0;const expected={payload:{ok:false,code:'ACTIVE_USER_PLAYER_LINK_REQUIRED'}};
  const read=new Function('certificationRequested','readCertificationSessionLinkStatus','readParticipantIdentityContextForAuth','verifiedParticipantAuthSubject',source+';return readParticipantSessionContext;')(()=>false,()=>assert.fail('Certification must not be selected'),async(args)=>{calls++;assert.equal(args.authUserId,'model-verified-subject');return expected;},()=>assert.fail('Certification subject capability not used'));
  assert.equal(await read({claims:{sub:'model-verified-subject'}},{env:{VERCEL_ENV:classification}}),expected);assert.equal(calls,1);
 }
 assert.equal(participantSessionFailure(new Error('private'),{}),null);
});
