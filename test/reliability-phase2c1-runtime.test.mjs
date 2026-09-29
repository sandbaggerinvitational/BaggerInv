// Proof layer: UNIT / API contract with injected canonical transports. No provider calls.
import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalReadEnvironment,isolatedCanonicalDatabaseEnvironment} from '../lib/canonical-runtime-source.js';
import {scoringAuthorityEnvironment} from '../lib/scoring-authority.js';
import {participantIdentityAuthorityEnvironment} from '../lib/participant-identity-authority.js';
import {productionCutoverActivationEnvironment,PRODUCTION_VERCEL_PROJECT_ID} from '../lib/production-cutover-activation-contract.js';
import {PRODUCTION_SUPABASE_PROJECT_REF,PRODUCTION_SUPABASE_URL} from '../lib/production-foundation-resource-contract.js';
import {resolveProductionScoringDispatchContext,productionScoringOperationsRpc} from '../lib/production-scoring-operations-server.js';
import {withDataAuthorityRequestScope} from '../lib/data-authority-request.js';
import {assertGoogleRuntimeRetired} from '../lib/google-runtime-retirement.js';
import {persistParticipantScore} from '../lib/scoring-persistence-adapter.js';
const preview={VERCEL_ENV:'preview',SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',SUPABASE_SCORING_MIRROR_SECRET_KEY:'synthetic-only-canonical-key'};
const prod={VERCEL_ENV:'production',VERCEL_PROJECT_ID:PRODUCTION_VERCEL_PROJECT_ID,VERCEL_PROJECT_NAME:'bagger-inv',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),VERCEL_DEPLOYMENT_ID:'dpl_synthetic_retirement',
 PRODUCTION_FOUNDATION_ENABLED:'true',PRODUCTION_CUTOVER_ACTIVATION_ENABLED:'true',PRODUCTION_CUTOVER_PHASE:'SCORING_COMMIT',PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA:'a'.repeat(40),PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID:PRODUCTION_VERCEL_PROJECT_ID,
 PRODUCTION_CANONICAL_DOMAIN:'https://baggerinv.com',PRODUCTION_CUTOVER_TOURNAMENT_ID:'2026',PRODUCTION_CUTOVER_TOURNAMENT_YEAR:'2026',PRODUCTION_SUPABASE_PROJECT_REF,PRODUCTION_SUPABASE_URL,PRODUCTION_SUPABASE_SECRET_KEY:'synthetic-not-a-provider-key-xxxxxxxx',PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED:'true',PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED:'true',PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED:'true',PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH:'11111111-1111-4111-8111-111111111111'};
const selectors=[['home','homeReadEnvironment','HOME_READ_SOURCE'],['my-match','myMatchReadEnvironment','MY_MATCH_READ_SOURCE'],['game-center','gameCenterReadEnvironment','GAME_CENTER_READ_SOURCE'],['leaderboards-core','leaderboardsCoreReadEnvironment','LEADERBOARDS_CORE_READ_SOURCE'],['scoring','scoringReadEnvironment','SCORING_READ_SOURCE'],['net-skins','netSkinsReadEnvironment','NET_SKINS_READ_SOURCE'],['calcutta','calcuttaReadEnvironment','CALCUTTA_READ_SOURCE'],['published-odds','publishedOddsReadEnvironment','PUBLISHED_ODDS_READ_SOURCE']];
for(const [file,name,variable] of selectors)test(`UNIT zeroGoogle ${variable} default/canonical rejection`,async()=>{
 const m=await import(`../lib/${file}-read-source.js`);
 assert.equal(m[name](preview).resolved,'supabase');assert.equal(m[name]({...preview,[variable]:'google'}).blocked,true);
 assert.equal(m[name]({...preview,SUPABASE_SCORING_MIRROR_URL:PRODUCTION_SUPABASE_URL}).blocked,true);
});
test('UNIT zeroGoogle database isolation rejects remote credentials and malformed identities',()=>{
 for(const url of [PRODUCTION_SUPABASE_URL,'https://evil.invalid','https://idgigvjjqkfbqjeredpb.supabase.co.evil.invalid','https://name:secret@idgigvjjqkfbqjeredpb.supabase.co','https://idgigvjjqkfbqjeredpb.supabase.co/path','https://idgigvjjqkfbqjeredpb.supabase.co?x=y'])assert.equal(isolatedCanonicalDatabaseEnvironment({...preview,SUPABASE_SCORING_MIRROR_URL:url}).eligible,false);
 assert.equal(isolatedCanonicalDatabaseEnvironment({...preview,VERCEL_ENV:'development',SUPABASE_SCORING_MIRROR_URL:'http://127.0.0.1:54321'}).eligible,true);
 assert.equal(isolatedCanonicalDatabaseEnvironment({...preview,VERCEL_ENV:'production',SUPABASE_SCORING_MIRROR_URL:'http://127.0.0.1:54321'}).eligible,false);
 assert.equal(canonicalReadEnvironment({},'HOME_READ_SOURCE').blocked,true);
});
test('UNIT scoring canonical-only with no Google configuration',()=>{
 assert.equal(scoringAuthorityEnvironment(preview).resolved,'supabase');assert.equal(scoringAuthorityEnvironment(prod).resolved,'supabase');
 for(const env of [preview,prod])assert.equal(scoringAuthorityEnvironment({...env,SCORING_AUTHORITY:'google'}).blocked,true);
});
test('UNIT Production activation retains security tuple without external workbook admission',()=>{
 assert.equal(productionCutoverActivationEnvironment(prod).allowed,true);
 for(const [key,value] of Object.entries({PRODUCTION_FOUNDATION_ENABLED:'false',PRODUCTION_SUPABASE_PROJECT_REF:'wrong',PRODUCTION_SUPABASE_URL:'https://evil.invalid',PRODUCTION_SUPABASE_SECRET_KEY:'',PRODUCTION_CANONICAL_DOMAIN:'https://evil.invalid',VERCEL_GIT_COMMIT_SHA:'b'.repeat(40),VERCEL_PROJECT_ID:'wrong',PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED:'false',PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED:'false'}))assert.equal(productionCutoverActivationEnvironment({...prod,[key]:value}).allowed,false,key);
});
test('UNIT canonical identity requires matching database/auth authority with no Passport fallback',()=>{
 const env={...preview,NEXT_PUBLIC_SUPABASE_AUTH_URL:preview.SUPABASE_SCORING_MIRROR_URL,NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:'synthetic-public-key'};
 assert.equal(participantIdentityAuthorityEnvironment(env).resolved,'supabase');
 assert.equal(participantIdentityAuthorityEnvironment({...env,NEXT_PUBLIC_SUPABASE_AUTH_URL:PRODUCTION_SUPABASE_URL}).blocked,true);
 assert.equal(participantIdentityAuthorityEnvironment({...env,PARTICIPANT_IDENTITY_AUTHORITY:'passport'}).blocked,true);
});
test('UNIT accidental legacy transport fails locally and attempted Google dependency is observable',async()=>{
 await assert.rejects(withDataAuthorityRequestScope({env:{VERCEL_ENV:'preview'},injectGoogleOutage:true},()=>assertGoogleRuntimeRetired()),e=>e.dataAuthorityDiagnostics.googleAttempts===1&&e.dataAuthorityDiagnostics.blockedGoogleAttempts===1);
 assert.throws(()=>assertGoogleRuntimeRetired(),{code:'GOOGLE_RUNTIME_RETIRED'});
});
test('API annual score dispatch binds canonical generations without calling Google destination RPC',async()=>{
 const runtime={contractVersion:'production-current-tournament-runtime-v1',status:'ANNUAL_ACTIVE_RUNTIME',tournamentId:'2027',tournamentYear:2027,lifecycle:'ACTIVE',pointerRevision:2,lifecycleRevision:4,runtimeGenerationId:'22222222-2222-4222-8222-222222222222',authorityGenerationId:'33333333-3333-4333-8333-333333333333',admissionGenerationId:'44444444-4444-4444-8444-444444444444'};
 const context=await resolveProductionScoringDispatchContext({requiredPhase:'SCORING_COMMIT',env:prod,
 readCurrentTournamentRuntime:async()=>runtime,readScoringPlatformCertification:async()=>({contractVersion:'production-annual-scoring-platform-certification-v1',platformTournamentId:'2026',resourceFingerprint:'6'.repeat(64),certificationFingerprint:'7'.repeat(64),platformAuthorityGenerationId:runtime.authorityGenerationId,platformAdmissionGenerationId:runtime.admissionGenerationId}),
 readAnnualScoringGoogleDestination:async()=>{throw new Error('GOOGLE_DESTINATION_MUST_NOT_BE_READ');}});
 assert.equal(context.googleDestination,null);let request;
 const response=await productionScoringOperationsRpc('submit_production_hole_score',{match_id:'2027-R3-1',annual_destination_workbook_id:'attacker'},
 {env:prod,scoringDispatchContext:context,fetchImpl:async(url,init)=>{request={url,body:JSON.parse(init.body)};return Response.json({ok:true,code:'ACCEPTED'});}});
 assert.equal(response.payload.ok,true);assert.match(request.url,/dispatch_production_annual_scoring_v1$/);
 assert.equal(request.body.input.expected_runtime_generation_id,runtime.runtimeGenerationId);
 assert.equal(request.body.input.expected_pointer_revision,2);assert.equal(Object.hasOwn(request.body.input,'annual_destination_workbook_id'),false);
});
test('API canonical score acknowledgement preserves legacy boolean field and reports retired outbox false',async()=>{
 const result=await persistParticipantScore({matchId:'2026-R3-1',input:{holeNumber:1,clientMutationId:'synthetic-retired-outbox'},current:{},canonicalContext:{tournamentId:'2026',matchRevision:0,permissionRevision:1},includeCanonicalAcknowledgement:true,env:preview,
 dependencies:{submitCanonicalHoleScore:async()=>({durationMs:1,payload:{ok:true,code:'ACCEPTED',google_outbox_created:false,gross:{team_1:[4],team_2:[5]},net:{team_1:4,team_2:5},strokes:{team_1:[0],team_2:[0]},match:{}}})}});
 assert.equal(result.authority,'supabase');assert.equal(result.result.googleOutboxCreated,false);
});
