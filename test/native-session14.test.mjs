import assert from 'node:assert/strict';
import test from 'node:test';
import {actor,environment,authorityFixtures,productionContext,request,runtime} from './fixtures/pn2-native.mjs';
import {issueMobileNativeCertification,verifyMobileNativeCertification} from '../lib/mobile-native-certification.js';
import {certifyCanonicalNativeParticipant} from '../lib/mobile-native-participant-certification.js';
import {resolveMobileBearerIdentity,verifyMobileSupabaseAuthenticatedUser} from '../lib/mobile-bearer-identity.js';
import {renewMobileNativeCertification} from '../lib/mobile-native-certification-renewal.js';
import {readNativeSessionAuthority} from '../lib/mobile-native-session-authority.js';
const base=Date.now(),life=1209600, sid='22222222-2222-4222-8222-222222222222';
function fixture(channel='email') {
 const env=environment(['auth','certification','reads']),f=authorityFixtures(env);
 let clock=base,cert=null;
 const claims={sub:actor.authUserId,session_id:sid,aal:'aal1'};
 const jwt=()=>`synthetic.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.local-only`;
 const user={status:'active',authUserId:actor.authUserId,emailVerified:true,security:{email:'synthetic@example.invalid',emailConfirmedAt:'2026-01-01',phone:'12025550123',phoneConfirmedAt:'2026-09-01',identities:[['email-id','email'],['phone-id','phone']]}};
 const p={...productionContext().participant};
 const phone={ok:true,allowed:true,...actor,phoneConfirmed:true,identifierId:'phone-id',identifierRevision:1,phoneE164:'+12025550123'};
 let validContext=true,phoneReads=0;
 const deps={nativeAdmission:f.dependencies,readReviewer:async()=>null,readCurrentTournamentRuntime:async()=>runtime,
 verifyAccessToken:async()=>user,verifyUser:async()=>user,
 readForAuth:async()=>({payload:validContext?{ok:true,data:p}:{ok:false,code:'USER_PLAYER_LINK_REVOKED'}}),
 readIdentity:async()=>({payload:validContext?{ok:true,data:p}:{ok:false}}),
 readPhoneAuthority:async()=>{phoneReads++;return {payload:phone}},
 now:()=>clock,issueCertification:input=>issueMobileNativeCertification({...input,now:()=>clock})};
 const req=()=>request('auth/certification/renew',{headers:{authorization:`Bearer ${jwt()}`,'x-bagger-certification-contract':'14d-v1',...(cert?{'x-bagger-certification':cert}:{})}});
 return {env,user,p,phone,claims,deps,req,channel,setClock:x=>clock=x,revoke:()=>validContext=false,
 issue:async()=>{const out=await certifyCanonicalNativeParticipant({request:req(),...actor,channel,env,dependencies:deps});cert=out.certificationToken;return out},
 read:()=>resolveMobileBearerIdentity({request:req(),env,dependencies:deps}),
 renew:()=>renewMobileNativeCertification({request:req(),env,dependencies:deps}),
 setCert:x=>cert=x,token:()=>cert,phoneReads:()=>phoneReads};
}
for(const channel of ['email','phone']) {
 test(`${channel}: 14-day issue and exact time boundaries`,async()=>{
  const x=fixture(channel),out=await x.issue();assert.equal(out.expiresInSeconds,life);
  const ctx={...productionContext(),sessionAuthority:await readNativeSessionAuthority({request:x.req(),verification:x.user,...actor,channel,env:x.env,dependencies:x.deps})};
  for(const sec of [0,43140,43260,86400,259200,604800,1206000,life-60]) {
   assert.doesNotThrow(()=>verifyMobileNativeCertification({token:x.token(),...actor,env:x.env,productionContext:ctx,now:()=>base+sec*1000}));
  }
  for(const sec of [life,life+1])assert.throws(()=>verifyMobileNativeCertification({token:x.token(),...actor,env:x.env,productionContext:ctx,now:()=>base+sec*1000}),{code:'AUTH_CERTIFICATION_FAILED'});
 });
 test(`${channel}: expired signed certificate renews only through live canonical authority; no OTP`,async()=>{
  const x=fixture(channel);await x.issue();x.setClock(base+(life+1)*1000);const renewed=await x.renew();
  assert.equal(renewed.body.data.expiresInSeconds,life);assert.notEqual(renewed.body.data.certificationToken,x.token());
  assert.equal(renewed.body.data.certificationToken.split('.')[0],channel==='phone'?'v3t':'v3e');
  assert.equal(Object.keys(renewed.body.data).sort().join(','),'certificationToken,certified,expiresInSeconds');
 });
 for(const reason of ['deleted','revoked-session','provider-timeout','revoked-link','inactive','wrong-uuid','wrong-player','changed-revision','changed-email','changed-aal','changed-session','tamper']) {
  test(`${channel}: unexpired/expired certificate denied for ${reason}`,async()=>{
   const x=fixture(channel);await x.issue();
   if(['deleted','revoked-session'].includes(reason))x.user.status='invalid';
   if(reason==='provider-timeout')x.user.status='unavailable';
   if(reason==='revoked-link')x.revoke();if(reason==='inactive')x.p.membership={active:false};
   if(reason==='wrong-uuid')x.user.authUserId='other';if(reason==='wrong-player')x.p.playerId='OTHER';
   if(reason==='changed-revision')x.p.contextRevision++;if(reason==='changed-email')x.user.security.email='other@example.invalid';
   if(reason==='changed-aal')x.claims.aal='aal2';if(reason==='changed-session')x.claims.session_id='33333333-3333-4333-8333-333333333333';
   if(reason==='tamper')x.setCert(x.token().slice(0,-3)+'xyz');
   await assert.rejects(x.read);x.setClock(base+(life+1)*1000);await assert.rejects(x.renew);
  });
 }
}
for(const change of ['revoked','replacement','wrong-user','wrong-player','unverified','conflict'])test(`Text ${change} rejects unexpired access and renewal`,async()=>{
 const x=fixture('phone');await x.issue();
 if(['revoked','conflict'].includes(change))x.phone.allowed=false;
 if(change==='replacement')x.phone.identifierRevision++;
 if(change==='wrong-user')x.phone.authUserId='other';if(change==='wrong-player')x.phone.playerId='OTHER';if(change==='unverified')x.phone.phoneConfirmed=false;
 await assert.rejects(x.read);x.setClock(base+(life+1)*1000);await assert.rejects(x.renew);
});
test('no renewal laundering if authority changes between validation and issuance',async()=>{
 const x=fixture('phone');await x.issue();let n=0;
 x.deps.readPhoneAuthority=async()=>({payload:{...x.phone,identifierRevision:++n===1?1:2}});
 x.setClock(base+(life+1)*1000);await assert.rejects(x.renew);
});
test('Build 4 and existing certificates retain exact legacy wire lifetime',async()=>{
 const x=fixture();const r=request('auth/otp/certify',{headers:{authorization:'Bearer synthetic'}});
 const c=await certifyCanonicalNativeParticipant({request:r,...actor,env:x.env,dependencies:x.deps});
 assert.equal(c.expiresInSeconds,43200);assert.match(c.certificationToken,/^v2p\./);
 x.setCert(c.certificationToken);await assert.rejects(x.renew);
});
test('online provider validation rejects revoked session and does not treat 5xx as definitive',async()=>{
 for(const [status,expected] of [[401,'invalid'],[403,'invalid'],[503,'unavailable'],[429,'unavailable']]) {
  const r=await verifyMobileSupabaseAuthenticatedUser('synthetic',{client:{auth:{getUser:async()=>({error:{status},data:null})}}});assert.equal(r.status,expected);
 }
});
