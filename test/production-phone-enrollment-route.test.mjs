import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import * as proof from '../lib/production-phone-enrollment-proof.js';import * as core from '../lib/production-phone-enrollment.js';
const route=await readFile(new URL('../app/api/participant/auth/phone-enrollment/route.js',import.meta.url),'utf8');
const emailRoute=await readFile(new URL('../app/api/participant/auth/otp/verify/route.js',import.meta.url),'utf8');
const uid='00000000-0000-4000-8000-000000000001';const access='synthetic-email-token';
const env={VERCEL_ENV:'production',PARTICIPANT_PHONE_ENROLLMENT_ENABLED:'true',PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET:'synthetic-local-key-only-123456789012345'};
const key=proof.issueEmailPhoneEnrollmentProof({authUserId:uid,playerId:'CB01',tournamentId:'2026',accessToken:access},env);
function next(body,options={}){return {body,status:options.status||200,cookies:{values:[],set(...x){this.values.push(x);}}};}
async function harness({bearer=false,invalidUser=false,feature=true,wrongProject=false,missingProof=false}={}){
 let originRequired;const calls=[];const config={url:wrongProject?'https://wrong.supabase.co':'https://ymqhhtxaywtqllynrmxe.supabase.co',publishableKey:'synthetic-public-key'};
 const store={get:()=>missingProof?undefined:{value:key},getAll:()=>[]};const client={auth:{getSession:async()=>({data:{session:{access_token:access}}}),getUser:async()=>invalidUser?{error:true}:{data:{user:{id:uid,email_confirmed_at:'2026-01-01'}}}}};
 const modules={
 'production-verify-feedback.js':{reportCanonicalPhoneVerification:async()=>{throw Error('NO_VERIFICATION_EXPECTED');}},
 'next/headers':{cookies:async()=>store},'next/server':{NextResponse:{json:next}},'@supabase/supabase-js':{createClient:()=>client},
 'supabase-auth-server.js':{createParticipantAuthServerClient:()=>client,participantAuthServerConfiguration:()=>config},
 'production-cutover-activation-contract.js':{assertProductionCutoverRequest:(r,e,o)=>{originRequired=o.requireOrigin;if(new URL(r.url).host!=='baggerinv.com'||(o.requireOrigin&&r.headers.get('origin')!=='https://baggerinv.com'))throw Error('BAD_HOST');}},
 'participant-identity-supabase.js':{participantIdentityRpc:async(name,{input})=>{calls.push({name,input});return {payload:{ok:true,status:'ELIGIBLE',authUserId:uid,playerId:'CB01',tournamentId:'2026',approvalRevision:1,phoneE164:'+12025550123',maskedPhone:'••• ••• 0123'}};}},
 'participant-phone-otp.js':{participantPhoneOtpClientFingerprint:()=> 'a'.repeat(64)},
 'production-phone-enrollment-proof.js':{...proof,phoneEnrollmentEnabled:()=>feature},'production-phone-enrollment.js':core,
 'data-authority-request.js':{dataAuthorityFetch:()=>async()=>{throw Error('NO_PROVIDER_EXPECTED');}}
 };
 let code=route.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,path)=>{const found=modules[path]||modules[path.split('/').at(-1)];if(!found)throw Error(path);modules[path]=found;return `const {${names}}=modules[${JSON.stringify(path)}];`;}).replace(/export /g,'');
 const api=new Function('modules','process',code+';return {GET,POST};')(modules,{env});
 const request=(input={},url='https://baggerinv.com/api/participant/auth/phone-enrollment',extra={})=>new Request(url,{method:'POST',headers:{...(bearer?{authorization:`Bearer ${access}`,'x-bagger-email-enrollment-proof':missingProof?'':key}:{origin:'https://baggerinv.com','sec-fetch-site':'same-origin'}),'Content-Type':'application/json',...extra},body:JSON.stringify(input)});
 return {api,request,calls,origin:()=>originRequired};
}
for(const bearer of [false,true])test((bearer?'Build5 bearer':'PWA cookie')+' uses identical canonical enrollment RPC',async()=>{const h=await harness({bearer});const r=await h.api.POST(h.request({action:'state'}));assert.equal(r.status,200);assert.equal(h.calls[0].name,'production_participant_phone_enrollment_v1');assert.deepEqual(h.calls[0].input,{auth_user_id:uid,player_id:'CB01',tournament_id:'2026',action:'state'});assert.equal(r.body.phoneE164,undefined);assert.equal(r.body.authUserId,undefined);assert.equal(h.origin(),!bearer);});
for(const options of [{invalidUser:true},{missingProof:true},{bearer:true,missingProof:true},{wrongProject:true}])test('endpoint rejects '+JSON.stringify(options),async()=>{const h=await harness(options);assert.notEqual((await h.api.POST(h.request({action:'state'}))).status,200);assert.equal(h.calls.length,0);});
test('disabled feature has no side effects',async()=>{const h=await harness({feature:false});assert.equal((await h.api.POST(h.request({action:'state'}))).status,404);assert.equal(h.calls.length,0);});
test('staged hostname cannot enroll',async()=>{const h=await harness({bearer:true});assert.notEqual((await h.api.POST(h.request({action:'state'},'https://preview.vercel.app/api/participant/auth/phone-enrollment'))).status,200);assert.equal(h.calls.length,0);});
test('cross-site cookie POST and malformed bearer denied',async()=>{const h=await harness();for(const headers of [{origin:'https://evil.example'},{authorization:'Basic anything'}]){assert.notEqual((await h.api.POST(h.request({action:'state'},undefined,headers))).status,200);}assert.equal(h.calls.length,0);});
test('body size bounded',async()=>{const h=await harness();assert.equal((await h.api.POST(h.request({x:'x'.repeat(3000)}))).status,400);assert.equal(h.calls.length,0);});
test('caller supplied destination denied by real shared core',async()=>{const h=await harness({bearer:true});assert.notEqual((await h.api.POST(h.request({action:'begin',approvalRevision:1,phone:'+12025550124'}))).status,200);assert.equal(h.calls.length,0);});
async function emailHarness({matches=true,certified=true,enabled=true}={}){
 let recorded=false;const pending=[];
 const modules={
 'production-phone-enrollment-proof.js':{...proof,issueEmailPhoneEnrollmentProof:(x)=>{assert.ok(recorded);return proof.issueEmailPhoneEnrollmentProof(x,enabled?env:{});}},
 '@supabase/ssr':{createServerClient:()=>({auth:{verifyOtp:async()=>({data:{user:{id:matches?uid:'wrong'},session:{access_token:access}},error:null}),signOut:async()=>{}}})},
 'next/server':{NextResponse:Object.assign(function(body,options){return next(body,options);},{json:next})},
 'participant-identity-authority.js':{participantIdentityAuthorityEnvironment:()=>({participantAuthEnabled:true,productionCutoverIdentity:true})},
 'participant-auth-rehearsal.js':{participantAuthEmailHash:()=> 'synthetic-hash'},
 'participant-email-otp-mode.js':{resolveParticipantEmailOtpVerificationType:()=> 'email'},
 'participant-auth-certification-recovery.js':{recordOtpVerificationWithRecovery:async()=>{if(!certified)throw Error('CERT_DENIED');recorded=true;}},
 'participant-identity-supabase.js':{authorizeSingleParticipantOtpVerification:async()=>({payload:{allowed:true,authUserId:uid,playerId:'CB01',tournamentId:'2026',verificationType:'email'}}),recordSingleParticipantOtpVerification:async()=>{}},
 'supabase-auth-server.js':{participantAuthServerConfiguration:()=>({url:'fixture',publishableKey:'fixture'})},
 'data-authority-request.js':{dataAuthorityFetch:()=>()=>{}},
 'production-shadow-candidate.js':{assertProductionShadowCandidateRequest:()=>{}},
 'production-cutover-activation-contract.js':{assertProductionCutoverRequest:()=>{}}
 };
 let code=emailRoute.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,path)=>{modules[path]=modules[path]||modules[path.split('/').at(-1)];if(!modules[path])throw Error(path);return `const {${names}}=modules[${JSON.stringify(path)}];`;}).replace(/export /g,'');
 const POST=new Function('modules',code+';return POST;')(modules);
 const request=new Request('https://baggerinv.com/api/participant/auth/otp/verify',{method:'POST',headers:{origin:'https://baggerinv.com','sec-fetch-site':'same-origin'},body:JSON.stringify({email:'fixture@example.invalid',token:'123456',requestId:'10000000-0000-4000-8000-000000000001'})});request.cookies={getAll:()=>[]};
 return POST(request);
}
test('only successfully certified Email login receives masked-purpose HttpOnly proof',async()=>{const r=await emailHarness();assert.equal(r.status,200);const c=r.cookies.values.find(x=>x[0]?.name===proof.EMAIL_ENROLLMENT_COOKIE)[0];assert.equal(c.httpOnly,true);assert.equal(c.secure,true);assert.equal(proof.verifyEmailPhoneEnrollmentProof(c.value,{authUserId:uid,accessToken:access},env).playerId,'CB01');});
for(const opts of [{matches:false},{certified:false}])test('failed Email cannot issue enrollment proof '+JSON.stringify(opts),async()=>{const r=await emailHarness(opts);assert.notEqual(r.status,200);assert.ok(!r.cookies.values.some(x=>x[0]?.name===proof.EMAIL_ENROLLMENT_COOKIE));});
test('Email remains successful with enrollment disabled',async()=>{const r=await emailHarness({enabled:false});assert.equal(r.status,200);assert.equal(r.cookies.values.length,0);});

test('same-origin cookie GET does not require a browser Origin header',async()=>{const h=await harness();const request=new Request('https://baggerinv.com/api/participant/auth/phone-enrollment');const r=await h.api.GET(request);assert.equal(r.status,200);assert.equal(h.origin(),false);assert.equal(r.body.phoneE164,undefined);});
