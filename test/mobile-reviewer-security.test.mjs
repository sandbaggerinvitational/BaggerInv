import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalReviewerContext,isCanonicalReviewer,requireReviewerRead,reviewerRevision} from '../lib/mobile-reviewer-identity.js';
const authUserId='40000000-0000-4000-8000-000000000001',tournamentId='2026';
const now=Date.UTC(2026,8,11);
const fixture=()=>({kind:'observer',authUserId,tournament:{id:tournamentId,name:'Fixture',year:2026},active:true,contextRevision:1,expiresAt:new Date(now+3600000).toISOString(),admin:false,scoring:false});
const context=(v=fixture())=>canonicalReviewerContext(v,{authUserId,tournamentId,now});
test('observer is a distinct noncompetitive canonical context, never a client role flag',()=>{
 const c=context();assert.equal(isCanonicalReviewer(c),true);assert.equal(c.playerId,undefined);assert.equal(c.team,undefined);
 assert.equal(isCanonicalReviewer({...c}),false);
 assert.throws(()=>requireReviewerRead({...c},{surface:'today',now}));
 for(const patch of [{authUserId:'other'},{kind:'participant'},{active:false},{contextRevision:0},{expiresAt:new Date(now).toISOString()},{playerId:'P1'},{team:{id:'T1'}},{membership:{active:true}},{admin:true},{scoring:true}])assert.throws(()=>context({...fixture(),...patch}));
});
test('published reads and one completed match only; every mutation/personal/admin path denied',()=>{
 const c=context();
 for(const surface of ['session','today','matches','leaders','odds','net-skins','calcutta','history','records','schedule','guide'])assert.doesNotThrow(()=>requireReviewerRead(c,{surface,now}));
 for(const surface of ['match-detail','scorecard']) {
  assert.throws(()=>requireReviewerRead(c,{surface,matchId:'final-1',now}),'Identity alone grants no match capability');
  assert.throws(()=>requireReviewerRead(c,{surface,matchId:'other-final',now}));
 }
 for(const surface of ['admin','director','passport','scoring','finalize','reopen','net-skins-entry','calcutta-purchase','odds-publish'])assert.throws(()=>requireReviewerRead(c,{surface,now}));
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.throws(()=>requireReviewerRead(c,{method,surface:'matches',now}));
 assert.throws(()=>requireReviewerRead(c,{surface:'today',now:now+3600000}));
 assert.notEqual(reviewerRevision(c),reviewerRevision(context({...fixture(),contextRevision:2})));
});

import {issueMobileNativeCertification,verifyMobileNativeCertification} from '../lib/mobile-native-certification.js';
import {environment,productionContext} from './fixtures/pn2-native.mjs';
test('observer certificate cannot become a participant or survive entitlement revision',()=>{
 const env=environment(['certification','reads']), observer=context();
 const production={...productionContext(),observer};delete production.participant;
 const identity={authUserId,tournamentId,env,productionContext:production,now:()=>now};
 const proof=issueMobileNativeCertification(identity).token;
 assert.doesNotThrow(()=>verifyMobileNativeCertification({...identity,token:proof}));
 assert.throws(()=>verifyMobileNativeCertification({...identity,token:proof,playerId:'P1',productionContext:productionContext()}));
 for(const patch of [{contextRevision:2},{expiresAt:new Date(now+7200000).toISOString()}]) {
  assert.throws(()=>verifyMobileNativeCertification({...identity,token:proof,productionContext:{...production,observer:context({...fixture(),...patch})}}));
 }
 assert.throws(()=>issueMobileNativeCertification({...identity,productionContext:{...production,observer:{...observer}}}));
});

import {resolveMobileBearerIdentity} from '../lib/mobile-bearer-identity.js';
import {recheckMobileNativeIdentity} from '../lib/mobile-native-admission.js';
import {authorityFixtures,request} from './fixtures/pn2-native.mjs';
test('real bearer admission rejects observer scoring and fails closed on revoked read entitlement',async()=>{
 const env=environment(['reads','certification','scoring']), f=authorityFixtures(env);
 const current=canonicalReviewerContext({...fixture(),expiresAt:new Date(Date.now()+3600000).toISOString()},{authUserId,tournamentId});
 const proof=issueMobileNativeCertification({authUserId,tournamentId,env,productionContext:{...productionContext(),observer:current}}).token;
 let active=true, participantCalls=0;
 const dependencies={nativeAdmission:f.dependencies,verifyAccessToken:async()=>({status:'active',authUserId}),
   readReviewer:async()=>active?current:null,readForAuth:async()=>{participantCalls++;return {payload:{ok:false,code:'ACTIVE_USER_PLAYER_LINK_REQUIRED'}};}};
 const req=request('matches',{headers:{authorization:'Bearer synthetic','x-bagger-certification':proof,'x-reviewer':'true'}});
 const identity=await resolveMobileBearerIdentity({request:req,env,dependencies});
 assert.equal(identity.kind,'observer');assert.equal(identity.playerId,undefined);assert.equal(participantCalls,0);
 await assert.rejects(()=>resolveMobileBearerIdentity({request:req,capability:'scoring',env,dependencies}),{code:'PARTICIPANT_NOT_FOUND'});
 active=false;
 await assert.rejects(()=>recheckMobileNativeIdentity(identity,'reads',env),{code:'AUTH_CERTIFICATION_FAILED'});
 await assert.rejects(()=>resolveMobileBearerIdentity({request:req,env,dependencies}),{code:'PARTICIPANT_NOT_FOUND'});
});

import {mobileScoringHoleResult,mobileScoringFinalizeResult,mobileScoringCurrentResult} from '../lib/mobile-v1-scoring.js';
test('direct scoring service calls reject observers before any authorization or write dependency',async()=>{
 const identity={kind:'observer',authUserId,tournamentId,context:context()};
 const dependencies=new Proxy({}, {get(){throw new Error('Observer must never reach a mutation dependency');}});
 for(const invoke of [mobileScoringHoleResult,mobileScoringFinalizeResult])
  await assert.rejects(()=>invoke(identity,{matchId:'final-1'},{dependencies}),{code:'SCORING_NOT_AUTHORIZED'});
 const result=await mobileScoringCurrentResult(identity,{dependencies});
 assert.equal(result.body.data.scoring,null);
 await assert.rejects(()=>mobileScoringCurrentResult(identity,{matchId:'other-final',dependencies}),{code:'PARTICIPANT_NOT_FOUND'});
});

import {requestMobileNativeOtp,certifyMobileNativeOtp} from '../lib/mobile-native-auth.js';
test('reviewer uses normal captcha/email OTP request and verified bearer certification without participant enrollment',async()=>{
 const env=environment(['auth','certification']),f=authorityFixtures(env),calls=[];
 const raw={...fixture(),expiresAt:new Date(Date.now()+3600000).toISOString()};
 const reviewerOtp=async(op,input)=>{
  calls.push(op);
  if(op==='request')assert.equal(input.email,'review@example.invalid');
  if(op==='delivery')assert.equal(input.succeeded,true);
  if(['verify','complete'].includes(op))assert.equal(input.auth_user_id,authUserId);
  return {handled:true,allowed:true,requestId:authUserId,authUserId,tournamentId,email:'review@example.invalid',context:raw};
 };
 const dependencies={nativeAdmission:f.dependencies,reviewerOtp,minimumDurationMs:0,consumeClientRateLimit:()=>({allowed:true}),consumeCertificationRateLimit:()=>({allowed:true}),authClient:{},
  authorizeEligibility:()=>assert.fail('Reviewer must not enter competitive enrollment'),
  sendOtp:async(_,input)=>{assert.equal(input.email,'review@example.invalid');assert.equal(input.verificationType,'email');assert.ok(input.captchaToken);calls.push('mock-delivery');return {error:null};},
  verifyUser:async()=>({status:'active',authUserId,email:'review@example.invalid',emailVerified:true})};
 const issued=await requestMobileNativeOtp({env,request:request('auth/otp/request'),input:{method:'email',identifier:'review@example.invalid',captchaToken:'synthetic-captcha-token-at-least-twenty-characters'},dependencies});
 assert.equal(issued.status,202);assert.equal(issued.body.data.verificationType,'email');
 const certified=await certifyMobileNativeOtp({env,request:request('auth/otp/certify',{headers:{authorization:'Bearer synthetic'}}),input:{challengeId:authUserId},dependencies});
 assert.equal(certified.status,200);assert.match(certified.body.data.certificationToken,/^v2p\./);
 assert.deepEqual(calls,['request','mock-delivery','delivery','verify','complete']);
});

import {readMobileProductionMatchDetail} from '../lib/mobile-v1-production-match-detail.js';
import {rawFixture} from './fixtures/pn1-mobile.mjs';
import {mobileMatchDetailDataFromPreviewView} from '../lib/mobile-v1-match-detail.js';
import {assertMobileV1Schema} from './support/mobile-v1-schema-validator.mjs';
test('observer cannot use the ordinary current-tournament Match Detail transport',async()=>{
 const identity={kind:'observer',authUserId,tournamentId,context:context()};
 await assert.rejects(()=>readMobileProductionMatchDetail(identity,'final-1',{env:environment(['reads']),dependencies:{readCurrentTournamentRuntime:async()=>({lifecycle:'ACTIVE',tournamentId})}}),{code:'PARTICIPANT_NOT_FOUND'});
});

import {mobileSessionResult} from '../lib/mobile-api-v1.js';
test('observer session schema exposes no competitive identity and rejects a mixed principal',async()=>{
 const c=context();const response=mobileSessionResult({kind:'observer',authUserId,tournamentId,context:c}).body;
 await assertMobileV1Schema('session',response);
 assert.equal(response.data.player,undefined);
 await assert.rejects(()=>assertMobileV1Schema('session',{...response,data:{...response.data,player:{playerId:'P1',displayName:'Fake',team:null}}}));
});
