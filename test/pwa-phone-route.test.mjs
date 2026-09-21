import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import * as phone from '../lib/participant-phone-otp.js';
import * as normalize from '../lib/participant-auth-phone.js';
import * as authority from '../lib/participant-identity-authority.js';
import * as feature from '../lib/participant-sms-auth-feature.js';
import * as host from '../lib/production-cutover-activation-contract.js';
import * as transaction from '../lib/participant-phone-cookie-transaction.js';
import {ready} from './fixtures/pwa-production-phone-env.mjs';
const source=await readFile(new URL('../lib/participant-phone-login-handler.js',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111',attempt='22222222-2222-4222-8222-222222222222';
const auth={allowed:true,authUserId:id,playerId:'CB01',tournamentId:'2026',identifierId:'33333333-3333-4333-8333-333333333333',identifierRevision:12,phoneE164:'+12025550123',directorEntitlementState:'NONE',directorRole:'NONE',directorScope:'NONE',directorEntitlementRevision:0,directorEntitlementSource:'NONE',directorEntitlementCount:0,directorEntitlementFingerprint:'a'.repeat(32)};
const complete={ok:true,sameAuthUser:true,sessionEstablished:true,refreshSessionAvailable:true,playerId:'CB01',tournamentId:'2026',directorEntitlementPreserved:true,newDirectorEntitlements:0,scoringAuthorizationUnchanged:true,phoneIdentifierUnchanged:true};
function request(input,url='https://baggerinv.com/api/participant/auth/phone'){return new Request(url,{method:'POST',headers:{host:new URL(url).host,origin:new URL(url).origin,'content-type':'application/json'},body:JSON.stringify(input)});}
async function harness(options={}){
 const calls=[],stored=[],jar=new Map();let providerCalls=0,signouts=0;
 const cookieStore={get:n=>jar.has(n)?{value:jar.get(n)}:undefined,getAll:()=>[...jar].map(([name,value])=>({name,value})),set:(...v)=>stored.push(v)};
 if(options.proof!==false)jar.set(options.oldCookie?'sbi-preview-phone-login-proof':'sbi-participant-phone-login-proof',phone.createParticipantPhoneLoginProof(auth,ready.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET));
 const identity=new Proxy({}, {get:(_,name)=>async input=>{
  calls.push({name,input});
  const overrides=options.rpc||{};if(name in overrides){const value=overrides[name];if(value instanceof Error)throw value;return {payload:value};}
  const payload={beginParticipantPhonePublicRequest:{allowed:true},authorizeParticipantPhoneLoginRequest:auth,authorizeParticipantPhoneLoginProof:auth,beginParticipantPhoneLogin:{allowed:true,...auth,attemptId:attempt,maskedMobile:'••• ••• 0123'},recordParticipantPhoneLoginSend:{ok:true},authorizeParticipantPhoneLoginVerification:{allowed:true,phoneE164:auth.phoneE164},completeParticipantPhoneLogin:complete,cancelParticipantPhoneLogin:{ok:true},recordParticipantPhoneLoginFailure:{ok:true},readParticipantPhoneLoginState:{allowed:true,status:'VERIFICATION_PENDING',attemptId:attempt,maskedMobile:'••• ••• 0123'}}[name];return {payload};
 }});
 const next={NextResponse:{json:(body,{status=200,headers={}}={})=>{const writes=[];return {body,status,headers,writes,cookies:{set:(...v)=>writes.push(v)}};}}};
 const supabase={verifyParticipantAuthClaims:async()=>({status:options.signedIn?'active':'inactive'}),createParticipantAuthServerClient:store=>({auth:{
 signInWithOtp:async input=>{providerCalls++;calls.push({name:'providerRequest',input});if(options.providerError)return {error:options.providerError};return {data:{},error:null};},
 verifyOtp:async input=>{providerCalls++;calls.push({name:'providerVerify',input});store.set('synthetic-session','withheld',{httpOnly:true});if(options.providerError)return {error:options.providerError,data:{}};return {data:{user:{id:options.wrongUser?'44444444-4444-4444-8444-444444444444':id},session:{access_token:'fixture-only',refresh_token:'fixture-only'}},error:null};},
 signOut:async()=>{signouts++;return {error:null};}
 }})};
 const imports={'node:crypto':{randomUUID},'next/headers.js':{cookies:async()=>cookieStore},'next/server.js':next};
 let code=source.replace(/import\s+\{([\s\S]*?)\}\s+from\s+"([^"]+)";/g,(_,names,path)=>{
  let value=imports[path];if(!value){value=path.includes('production-verify-feedback')?{reportCanonicalPhoneVerification:async()=>({status:'ACKNOWLEDGED'})}:path.includes('participant-identity-supabase')?identity:path.includes('participant-auth-phone.js')?normalize:path.includes('participant-identity-authority')?authority:path.includes('participant-phone-otp')?phone:path.includes('participant-sms-auth-feature')?feature:path.includes('supabase-auth-server')?supabase:path.includes('production-cutover-activation-contract')?host:transaction;imports[path]=value;}
  return `const {${names.replaceAll(" as ", ": ")}}=imports[${JSON.stringify(path)}];`;
 }).replaceAll('export ','');
 const routes=new Function('imports',code+'\nreturn createParticipantPhoneLoginHandler();')(imports);
 return {...routes,calls,stored,get providerCalls(){return providerCalls},get signouts(){return signouts}};
}
const saved={...process.env};Object.assign(process.env,ready);
test.after(()=>{for(const key of Object.keys(ready)){if(key in saved)process.env[key]=saved[key];else delete process.env[key];}});
test('unconfigured provider blocks before identity/provider use',async()=>{process.env.PARTICIPANT_SMS_PROVIDER_CONFIGURED='false';try{const h=await harness();const r=await h.POST(request({action:'request'}));assert.equal(r.status,503);assert.equal(r.body.category,'TEXT_UNAVAILABLE');assert.equal(h.providerCalls,0);assert.equal(h.calls.length,0);}finally{process.env.PARTICIPANT_SMS_PROVIDER_CONFIGURED='true';}});
test('staged hostname cannot acquire Production phone authority',async()=>{const h=await harness();assert.equal((await h.POST(request({action:'request'},'https://staging.vercel.app/api/participant/auth/phone'))).status,404);assert.equal(h.calls.length,0);});
test('cross-origin request denied before provider',async()=>{const h=await harness();const r=request({action:'request'});r.headers.set('origin','https://attacker.invalid');assert.equal((await h.POST(r)).status,404);assert.equal(h.providerCalls,0);});
test('known phone request normalizes +1; closed signup; masked response and HttpOnly production proof',async()=>{const h=await harness({proof:false});const r=await h.POST(request({action:'request',phone:'(202) 555-0123',captchaToken:'synthetic-captcha-token-local-only'}));assert.equal(r.status,200);assert.equal(r.body.status,'VERIFICATION_PENDING');const p=h.calls.find(c=>c.name==='providerRequest').input;assert.equal(p.phone,'+12025550123');assert.equal(p.options.shouldCreateUser,false);assert.equal(p.options.channel,'sms');assert.ok(r.writes.some(c=>c[0].name==='sbi-participant-phone-login-proof'&&c[0].httpOnly));assert.doesNotMatch(JSON.stringify(r.body),new RegExp(id));});
test('unknown phone has same public pending response and never calls provider or creates identity',async()=>{const h=await harness({proof:false,rpc:{authorizeParticipantPhoneLoginRequest:{allowed:false}}});const r=await h.POST(request({action:'request',phone:'+12025550124',captchaToken:'synthetic-captcha-token-local-only'}));assert.equal(r.status,200);assert.equal(r.body.status,'VERIFICATION_PENDING');assert.match(r.body.message,/If that mobile/);assert.equal(h.providerCalls,0);assert.equal(r.writes.length,0);});
test('malformed phone rejected safely',async()=>{const h=await harness();const r=await h.POST(request({action:'request',phone:'abc',captchaToken:'synthetic-captcha-token-local-only'}));assert.equal(r.status,400);assert.equal(r.body.category,'INVALID_PHONE');assert.equal(h.providerCalls,0);});
test('server throttle blocks provider even if client cooldown bypassed',async()=>{const h=await harness({rpc:{beginParticipantPhonePublicRequest:{allowed:false,code:'PHONE_OTP_RATE_LIMITED'}}});assert.equal((await h.POST(request({action:'request',phone:'+12025550123',captchaToken:'synthetic-captcha-token-local-only'}))).status,429);assert.equal(h.providerCalls,0);});
test('no captcha never calls provider',async()=>{const h=await harness();assert.equal((await h.POST(request({action:'request',phone:'+12025550123'}))).status,400);assert.equal(h.providerCalls,0);});
test('valid SMS binds provider identity, canonical completion and session cookies',async()=>{const h=await harness();const r=await h.POST(request({action:'verify',attemptId:attempt,token:'123456',phone:'+12025550999',playerId:'OTHER'}));assert.equal(r.status,200);assert.equal(r.body.linkedPlayerId,'CB01');const p=h.calls.find(c=>c.name==='providerVerify').input;assert.equal(p.phone,auth.phoneE164);assert.equal(p.type,'sms');assert.equal(h.signouts,0);assert.equal(h.stored.length,0);assert.ok(r.writes.some(c=>c[0]==='synthetic-session'));});
for(const [label,options] of [['wrong UUID',{wrongUser:true}],['completion rejected',{rpc:{completeParticipantPhoneLogin:{ok:false}}}],['completion exception',{rpc:{completeParticipantPhoneLogin:new Error('synthetic database unavailable')}}],['invalid OTP',{providerError:{code:'otp_expired',status:403}}]])test(`${label} never commits provider cookies`,async()=>{const h=await harness(options);const r=await h.POST(request({action:'verify',attemptId:attempt,token:'123456'}));assert.ok(r.status>=400);assert.equal(r.writes.filter(c=>c[0]==='synthetic-session').length,0);assert.equal(h.stored.length,0);assert.ok(h.signouts>0);});
for(const code of ['PHONE_OTP_STALE','PHONE_OTP_REPLAY','PHONE_OTP_INVALID_OR_EXPIRED'])test(`${code} rejected before provider`,async()=>{const h=await harness({rpc:{authorizeParticipantPhoneLoginVerification:{allowed:false,code}}});const r=await h.POST(request({action:'verify',attemptId:attempt,token:'123456'}));assert.ok(r.status>=400);assert.equal(h.providerCalls,0);});
test('old Preview cookie cannot authorize Production SMS verification',async()=>{const h=await harness({oldCookie:true});assert.equal((await h.POST(request({action:'verify',attemptId:attempt,token:'123456'}))).status,400);assert.equal(h.providerCalls,0);});
test('email request ID without SMS cookie cannot verify through Text',async()=>{const h=await harness({proof:false});assert.equal((await h.POST(request({action:'verify',attemptId:attempt,token:'123456'}))).status,400);assert.equal(h.providerCalls,0);});
test('resend fails closed on uncertain cancellation',async()=>{const h=await harness({rpc:{cancelParticipantPhoneLogin:new Error('uncertain')}});assert.ok((await h.POST(request({action:'resend',attemptId:attempt,captchaToken:'synthetic-captcha-token-local-only'}))).status>=400);assert.equal(h.providerCalls,0);});
