// Owned local PG17 only. Auth verification is modeled; route, resolver,
// adapter, resource envelopes, canonical SQL and score revalidation are real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {certificationDirectorStack} from './support/reliability/certification-director-proof.mjs';
import {shippingAuthorizationRoute} from './support/reliability/certification-match-authorization-route.mjs';
import {destroyIsolatedCluster,jsonLiteral,sqlResult} from './support/reliability/postgres17.mjs';
import {canonicalCatalog} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {syntheticActor,syntheticDirector} from './support/reliability/synthetic-tournament.mjs';
import {authorizeMatchAccess} from '../lib/match-authorization-supabase.js';
import {scoringShadowRpc} from '../lib/scoring-shadow.js';
import {resolveCertificationRuntimeContext} from '../lib/certification-runtime-server.js';
import {certificationProjectionRpc} from '../lib/certification-runtime-server.js';
import {resolveSupabaseParticipantIdentity} from '../lib/participant-identity-resolver.js';
import {validateAuthoritativeParticipantSession} from '../lib/scoring-participant-authorization.js';
import {readPreviewScoringParticipantContext,submitCanonicalHoleScore} from '../lib/scoring-authority-supabase.js';

test('canonical Certification match adapter and shipping session preserve SQL authorization',async t=>{
 let f,s;const evidence={environment:'OWNED_LOCAL_POSTGRESQL17_ONLY',hostedMutated:false,remoteCalls:0,
  authProof:'MODELED_VERIFIED_SUBJECT; REAL RESOLVER/CANONICAL SQL',cases:[]};
 const check=async(name,run)=>{let failure;await t.test(name,async()=>{try{await run();evidence.cases.push({name,result:'PASS'});}
  catch(error){failure=error;evidence.cases.push({name,result:'FAIL',error:error.message.slice(0,1000)});throw error;}});if(failure)throw failure;};
 try{
  f=await createCertificationFixture({forwardMigrations:certificationProvisionalProfile,registrationFactory:certificationTransportRegistration});
  const catalog=await canonicalCatalog(f.cluster,f.database),{env,registrationManifest}=f.transportFixture;
  // Extend the retained R2 local fixture with the third synthetic subject and
  // contacts. These are local test facts with all constraints/triggers active.
  const b={playerId:'P11',authUserId:'10000000-0000-4000-8000-000000000011',email:'golfer11@synthetic.invalid'};
  f.q(`begin;
   insert into auth.users(id,email,email_confirmed_at) values('${b.authUserId}','${b.email}',now());
   insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
    values('${b.authUserId}','P11','ACTIVE','SYNTHETIC_FIXTURE',repeat('3',64));
   insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,
    verified_at,verification_source,source_system,created_by,updated_by)
    values('P11','${b.authUserId}','EMAIL','${b.email}','VERIFIED',now(),'SYNTHETIC_FIXTURE','SYNTHETIC_FIXTURE','local-proof','local-proof');
   insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by)
    values('2026','${b.authUserId}','PARTICIPANT','local-proof');
   insert into participant_identity.identity_context_revisions(tournament_id,context_revision,configuration_fingerprint,updated_by)
    values('2026',1,repeat('4',64),'SYNTHETIC_FIXTURE');
   ${[syntheticDirector,syntheticActor,b].map(identity=>`insert into participant_identity.participant_identity_contacts
    (tournament_id,player_id,email,email_normalized,identity_active,configuration_revision,verified_by,verified_at,source_system,source_workbook_id,source_updated_at)
    values('2026','${identity.playerId}','${identity.email}','${identity.email}',true,1,'SYNTHETIC_FIXTURE',now(),'SYNTHETIC_FIXTURE',
     'urn:bagger:synthetic:${f.resource.installation_id}',now());`).join('\n')}
   commit;`);
  const calls=[];let setup='',duringProjection;
  const allowed=new Set(['read_certification_runtime_context_v1','read_certification_projection_v1','read_certification_operation_v1',
   'admit_certification_operation_v1','execute_certification_operation_v1','mark_certification_ingress_unknown_v1']);
  const dependencies={registrationManifest,fetchImpl:async(url,init)=>{
   const target=new URL(url),name=target.pathname.split('/').at(-1);assert.equal(target.origin,f.resource.project_url);assert.ok(allowed.has(name),name);
   assert.equal(init.redirect,'error');assert.equal(init.headers.apikey,env.SUPABASE_SCORING_MIRROR_SECRET_KEY);
   const input=JSON.parse(init.body).input;calls.push({name,input});
   if(name==='read_certification_projection_v1'&&duringProjection){const callback=duringProjection;duringProjection=null;callback();}
   const fixtureSetup=setup?`set local request.jwt.claim.role='service_role';select production_control.push_certification_context_v1(${jsonLiteral(f.envelope)},'DIRECTOR',false);${setup}select production_control.pop_certification_context_v1();`:'';
   const result=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nbegin;${fixtureSetup}\nset local request.jwt.claim.role='service_role';set local role service_role;
    select public.${name}(${jsonLiteral(input)});${setup?'rollback':'commit'};`,{role:''});
   if(result.status!==0){const error=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);assert.ok(error,result.stderr);
    return Response.json({code:error[1],message:error[2]},{status:400});}
   return Response.json(JSON.parse(result.stdout.trim().split('\n').at(-1)));
  }};
  const options={env,certificationDependencies:dependencies};
  // The verified-subject boundary is modeled with a supported loopback local
  // identity environment. readForAuth still executes the actual Certification
  // gateway with the exact registered resource/deployment, without rewriting it.
  const identityEnv={VERCEL_ENV:'development',PARTICIPANT_IDENTITY_AUTHORITY:'supabase',
   SUPABASE_SCORING_MIRROR_URL:'http://127.0.0.1:1',SUPABASE_SCORING_MIRROR_SECRET_KEY:'local-only',
   NEXT_PUBLIC_SUPABASE_AUTH_URL:'http://127.0.0.1:1',NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:'local-only'};
  const request=new Request('http://localhost/api/player-passport/matches');request.cookies={get:()=>undefined};
  const identity=subject=>resolveSupabaseParticipantIdentity({request,env:identityEnv,dependencies:{
   verifyClaims:async()=>subject?{status:'active',claims:{sub:subject}}:{status:'inactive'},
   readForAuth:args=>certificationProjectionRpc('READS.IDENTITY_FOR_AUTH',{target_auth_user_id:args.authUserId,target_tournament_id:'2026'},
    {env},dependencies)}});
  const match='2026-R3-12',scope={tournamentId:'2026',playerId:'P12',matchId:match,action:'START_SCORING'};
  const authorize=overrides=>authorizeMatchAccess({...scope,...overrides},options);
  s=await certificationDirectorStack(f);const client=s.transport;
  const control=async(action)=>{const m=(await client.controlRead()).matches.find(m=>m.matchId===match);
   return client.controlRequest(action,{operationRequestId:randomUUID(),matchId:match,
    expectedMatchRevision:m.matchRevision,expectedPermissionRevision:m.permissionRevision});};
  await check('P01 Director/P12/P11 canonical identities are unchanged; signed-out/unlinked still denied',async()=>{
   for(const subject of [syntheticDirector,syntheticActor,b])assert.equal((await identity(subject.authUserId)).playerId,subject.playerId);
   await assert.rejects(identity(null),{code:'AUTH_SESSION_REQUIRED',status:401});
   await assert.rejects(identity(randomUUID()),{code:'ACTIVE_USER_PLAYER_LINK_REQUIRED',status:403});
  });
  await check('UPCOMING and closed scoring permission cannot authorize START_SCORING',async()=>{
   assert.equal((await authorize()).payload.allowed,false);
   for(const matchId of [match,'2026-R3-11'])await client.setupRequest({action:'prepare-scoring-context',operationRequestId:randomUUID(),
    expectedRevision:(await client.setupRequest()).data.revision,matchId});
   await control('mark-live');assert.equal((await authorize()).payload.code,'SCORING_PERMISSION_REVOKED');
   await control('access-activate');
  });
  let session;
  await check('shipping POST selects only the resolved participant and issues the original signed DTO/session',async()=>{
   const a=await identity(syntheticActor.authUserId);
   const route=await shippingAuthorizationRoute({identity:a,authorize:args=>authorizeMatchAccess(args,options)});
   const result=await route.request({matchId:match,playerId:'P11',resource:'PRODUCTION',deployment_id:'untrusted'});
   assert.equal(result.response.status,200);assert.equal(result.body.authorized,true);session=route.session();
   assert.equal(session.playerId,'P12');assert.equal(session.matchId,match);assert.equal(session.identityAuthority,'supabase');
   const d=(await authorize()).payload;assert.equal(session.accessVersion,d.permission_revision);
   const native=JSON.parse(f.q(`select scoring_authority.match_access_decision('2026','P12','${match}','START_SCORING')`));
   const {query_ms,...actual}=d,{query_ms:ignored,...expected}=native;assert.deepEqual(actual,expected);
  });
  await check('P12 and P11 access only their assigned matches; wrong/missing tournament scope denied',async()=>{
   assert.equal((await authorize({playerId:'P11'})).payload.code,'NOT_MATCH_PARTICIPANT');
   assert.equal((await authorize({matchId:'2026-R3-11',action:'VIEW_MATCH'})).payload.code,'NOT_MATCH_PARTICIPANT');
   assert.equal((await authorize({playerId:'P11',matchId:'2026-R3-11',action:'VIEW_MATCH'})).payload.allowed,true);
   await assert.rejects(authorize({tournamentId:'2027'}),{status:403});
   await assert.rejects(authorize({matchId:'missing'}),{code:'MATCH_AUTHORIZATION_SCOPE_DENIED',status:403});
  });
  const validate=(value=session,subject=syntheticActor.authUserId)=>validateAuthoritativeParticipantSession(request,value,{requireWritable:true,dependencies:{
   env,requireIdentityAuthority:()=>({resolved:'supabase'}),requireScoreAuthority:()=>({resolved:'supabase'}),
   resolveIdentity:()=>identity(subject),readScoringContext:input=>readPreviewScoringParticipantContext(input,options)}});
  await check('signed shipping session feeds unchanged scoring revalidation; cross actor/stale permission denied',async()=>{
   const result=await validate();assert.equal(result.writable,true);assert.equal(result.identity.playerId,'P12');
   await assert.rejects(validate(session,b.authUserId),{code:'ACTIVE_USER_PLAYER_LINK_REQUIRED'});
   await assert.rejects(validate({...session,accessVersion:session.accessVersion-1}),{code:'SCORING_PERMISSION_REVOKED'});
  });
  await check('locked/final lifecycle and stale permissions remain SQL denials',async()=>{
   await control('scoring-lock');assert.equal((await authorize()).payload.code,'MATCH_LOCKED');
   // Transactional local catalog fixture states only; no hosted lifecycle claim.
   setup=`update scoring_authority.matches set status='FINAL' where match_id='${match}';`;
   assert.equal((await authorize()).payload.code,'MATCH_FINAL');setup='';
   await control('scoring-unlock');
   setup=`update scoring_authority.scoring_permissions set permission_revision=permission_revision-1 where match_id='${match}'and player_id='P12';`;
   assert.equal((await authorize()).payload.code,'SCORING_PERMISSION_STALE');setup='';
  });
  const toggle=enabled=>f.owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,
   expected_admission_revision:Number(f.q('select admission_revision from production_control.certification_admission_v1')),enabled,reason:'LOCAL match adapter regression'});
  await check('disabled admission, paused ingress and stale admission token are denied',async()=>{
   const stale=await resolveCertificationRuntimeContext({env,phase:'READS'},dependencies);toggle(false);
   await assert.rejects(authorize(),{code:'CANONICAL_RESOURCE_DEPLOYMENT_DENIED',status:403});toggle(true);
   await assert.rejects(authorizeMatchAccess(scope,{...options,certificationContext:stale}),{code:'CERTIFICATION_CONTEXT_STALE',status:409});
   setup="update scoring_authority.ingress_gates set state='PAUSED';";
   await assert.rejects(authorize(),{code:'CANONICAL_RESOURCE_INGRESS_CLOSED',status:409});setup='';
   duringProjection=()=>{toggle(false);toggle(true);};
   await assert.rejects(authorize(),{code:'CANONICAL_RESOURCE_CONTEXT_STALE',status:409});
  });
  await check('foreign resource and incorrect actual deployment/release fail before any authorization decision',async()=>{
   for(const patch of [{BAGGER_CERTIFICATION_RESOURCE_ID:'CERTIFICATION:'+randomUUID()},
    {SUPABASE_SCORING_MIRROR_URL:'https://'+'z'.repeat(20)+'.supabase.co'},
    {VERCEL_DEPLOYMENT_ID:'dpl_WrongDeployment'},{VERCEL_GIT_COMMIT_SHA:'d'.repeat(40)},
    {VERCEL_GIT_COMMIT_REF:'codex/other'},{VERCEL_URL:'wrong-origin.vercel.app'}])
    await assert.rejects(authorizeMatchAccess(scope,{...options,env:{...env,...patch}}));
   for(const project_ref of ['ymqhhtxaywtqllynrmxe','idgigvjjqkfbqjeredpb','z'.repeat(20)])
    assert.throws(()=>f.rpc('read_certification_runtime_context_v1',{...f.envelope,phase:'READS',
     resource:{...f.resource,project_ref,project_url:`https://${project_ref}.supabase.co`}}),/CANONICAL_RESOURCE_BINDING_DENIED/);
  });
  await check('legacy/unlisted RPCs stay forbidden and private cores/legacy function remain denied to runtime roles',async()=>{
   for(const name of ['authorize_match_access','unlisted_legacy_rpc'])await assert.rejects(scoringShadowRpc(name,{},options),{code:'CERTIFICATION_LEGACY_RPC_FORBIDDEN'});
   for(const role of ['anon','authenticated','service_role'])for(const statement of [
    `select scoring_authority.match_access_decision('2026','P12','${match}','START_SCORING')`,
    `select public.authorize_match_access('2026','P12','${match}','START_SCORING')`]){
    const denied=sqlResult(f.cluster,f.database,`set role ${role};${statement}`,{role:''});assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/);
   }
  });
  await check('stale match revision and stale ingress generation cannot execute via the unchanged scoring wrapper',async()=>{
   const d=(await authorize()).payload,id='local:match-adapter:stale';
   const input={tournament_id:'2026',match_id:match,mutation_key:id,hole_number:1,expected_match_revision:d.match_revision-1,
    expected_hole_revision:0,team_1_gross_scores:[4],team_2_gross_scores:[5],authorization:{role:'PLAYER',player_id:'P12',
     auth_user_id:syntheticActor.authUserId,tournament_id:'2026',match_id:match,permission_revision:d.permission_revision,
     passport_verified:false,production_verified:true}};
   const result=await submitCanonicalHoleScore(input,options);assert.equal(result.payload.ok,false);assert.equal(result.payload.code,'MATCH_REVISION_CONFLICT');
   assert.equal(f.q('select count(*) from scoring_authority.hole_scores'),'0');
   const admitted=calls.findLast(c=>c.name==='admit_certification_operation_v1').input;
   const lease=JSON.parse(f.q(`select production_control.certification_ingress_response_v1(l) from production_control.certification_ingress_leases_v1 l where operation_request_id='${id}'`));
   const bad={...admitted,ingress:{lease_id:lease.lease_id,admission_generation_id:randomUUID()}};
   assert.throws(()=>f.rpc('execute_certification_operation_v1',bad),/CERTIFICATION_INGRESS_BINDING_DENIED/);
   assert.equal(f.q('select count(*) from scoring_authority.hole_scores'),'0');
  });
  await check('catalog ACL/RLS/owners/security/search paths and authorization core definitions stay identical',async()=>{
   assert.deepEqual(await canonicalCatalog(f.cluster,f.database),catalog);
   assert.equal(f.q('select count(*) from production_control.resource_scope'),'0');
   assert.ok(calls.every(call=>call.input.resource.resource_id===f.resource.resource_id||call.name==='read_certification_runtime_context_v1'));
   evidence.catalogUnchanged=true;evidence.positiveScoreCommits=0;evidence.canonicalTransport=calls.map(c=>({name:c.name,phase:c.input.phase,operation:c.input.operation||c.input.operation_id||null}));
  });
 }finally{
  if(f)await destroyIsolatedCluster(f.cluster);
  await mkdir('docs/reliability/phase2d-match-authorization-remediation/evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-match-authorization-remediation/evidence/canonical-proof.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
