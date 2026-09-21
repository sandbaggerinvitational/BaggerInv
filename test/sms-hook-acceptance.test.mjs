import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as acceptance from '../lib/production-sms-hook-acceptance.js';
import {approvedSmsHook} from '../lib/production-approved-sms-hook.js';
const now=1800000000000,key=Buffer.alloc(32,8),uid='00000000-0000-4000-8000-000000009801';
const proof={ok:true,code:'ACCEPTANCE_DATABASE_ROLLED_BACK',authorized:true,fixtureRolledBack:true,directorPhoneValidated:true,attemptValidated:true,playerId:'SMS_TEST_A',authUserId:uid};
function fixture(){
 const raw=JSON.stringify({user:{id:uid,new_phone:'12025550190'},sms:{phone:'12025550190',otp:'000000'}}),id='bagger_acceptance_fixture01';
 const plan={version:1,purpose:'SMS_OFF_HOSTED_ACCEPTANCE',projectRef:'ymqhhtxaywtqllynrmxe',apiOrigin:'https://baggerinv.com',applicationSha:'a'.repeat(40),issuedAt:now-1000,expiresAt:now+60000,requests:[{eventId:id,bodyHash:createHash('sha256').update(raw).digest('hex'),fixtureCase:'authorized'}]};
 const env={VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),PARTICIPANT_SMS_AUTH_ENABLED:'false',PARTICIPANT_SMS_SEND_HOOK_ENABLED:'false',PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN:JSON.stringify(plan),SUPABASE_SEND_SMS_HOOK_SECRET:'whsec_'+key.toString('base64'),TWILIO_VERIFY_SERVICE_SID:'VA'+'a'.repeat(32),TWILIO_ACCOUNT_SID:'AC'+'b'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-complete-config-must-never-be-used'};
 const headers=new Headers({'webhook-id':id,'webhook-timestamp':String(now/1000),'webhook-signature':'v1,'+createHmac('sha256',key).update(`${id}.${now/1000}.${raw}`).digest('base64')});
 return {raw,headers,env,now,plan};
}
test('exact protected acceptance authorizes, prepares, and cannot call transport with complete provider config',async()=>{
 const f=fixture();let calls=0,sends=0;const prior=globalThis.fetch;globalThis.fetch=async()=>{sends++;throw Error('NETWORK_FORBIDDEN');};
 try{const r=await acceptance.acceptSmsHookWithoutDelivery(f,{authorizeFixture:async x=>{calls++;assert.equal(x.phone_e164,'+12025550190');assert.equal(x.fixture_case,'authorized');assert.ok(!('otp' in x));return proof;},fetchImpl:async()=>{sends++;throw Error('FORBIDDEN');}});
 assert.equal(calls,1);assert.equal(sends,0);assert.equal(r.code,'ACCEPTANCE_TRANSPORT_SUPPRESSED');assert.equal(r.twilioApiCalls,0);assert.equal(r.fixtureRolledBack,true);
 assert.ok(!JSON.stringify(r).includes('000000'));assert.ok(!JSON.stringify(r).includes('12025550190'));
 }finally{globalThis.fetch=prior;}
});
const bad=[['no signature',f=>f.headers.delete('webhook-signature')],['wrong signature',f=>f.headers.set('webhook-signature','v1,AAAA')],['changed body',f=>f.raw+=' '],['expired signature',f=>f.now+=301000],['ordinary event',f=>f.headers.set('webhook-id','msg_normal')],['unknown reserved event',f=>f.headers.set('webhook-id','bagger_acceptance_unknown')],['missing plan',f=>delete f.env.PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN],['SMS on',f=>f.env.PARTICIPANT_SMS_AUTH_ENABLED='true'],['preview',f=>f.env.VERCEL_ENV='preview'],['wrong SHA',f=>f.env.VERCEL_GIT_COMMIT_SHA='b'.repeat(40)],['expired plan',f=>{f.plan.expiresAt=now;f.env.PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN=JSON.stringify(f.plan);}],['unbounded plan',f=>{f.plan.expiresAt=now+7200001;f.env.PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN=JSON.stringify(f.plan);}],['duplicate event',f=>{f.plan.requests.push(f.plan.requests[0]);f.env.PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN=JSON.stringify(f.plan);}],['unknown fixture',f=>{f.plan.requests[0].fixtureCase='arbitrary-user';f.env.PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN=JSON.stringify(f.plan);}],['wrong project',f=>{f.plan.projectRef='other';f.env.PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN=JSON.stringify(f.plan);}]];
for(const [name,alter] of bad)test(name+' denies before database',async()=>{const f=fixture();alter(f);let calls=0;await assert.rejects(acceptance.acceptSmsHookWithoutDelivery(f,{authorizeFixture:async()=>{calls++;return proof;}}));assert.equal(calls,0);});
for(const override of [{ok:false},{fixtureRolledBack:false},{authorized:false},{authUserId:'00000000-0000-4000-8000-000000009802'},{playerId:'CB01'},{directorPhoneValidated:false},{attemptValidated:false},{code:'CLAIMED'}])test('invalid database evidence denied',async()=>{await assert.rejects(acceptance.acceptSmsHookWithoutDelivery(fixture(),{authorizeFixture:async()=>({...proof,...override})}));});
test('database timeout/uncertainty cannot fall through to sending',async()=>{await assert.rejects(acceptance.acceptSmsHookWithoutDelivery(fixture(),{authorizeFixture:async()=>{throw Error('TIMEOUT');}}));});
test('normal production SMS OFF still fails with original code before database/provider',async()=>{let calls=0;const f=fixture();await assert.rejects(approvedSmsHook(f,{rpc:()=>{calls++;},fetchImpl:()=>{calls++;}}),e=>e.code==='SMS_HOOK_DISABLED');assert.equal(calls,0);});
const source=readFileSync(new URL('../app/api/auth/hooks/send-sms/route.js',import.meta.url),'utf8');
function route(f){let live=0,db=0;const mods={
 'next/server':{NextResponse:{json:(b,{status=200,headers}={})=>new Response(JSON.stringify(b),{status,headers})}},
 'production-sms-hook-acceptance.js':{...acceptance,acceptSmsHookWithoutDelivery:(x,deps)=>acceptance.acceptSmsHookWithoutDelivery({...x,env:f.env,now:f.now},deps)},
 'production-approved-sms-hook.js':{approvedSmsHook:(x,deps)=>{live++;return approvedSmsHook({...x,env:f.env,now:f.now},deps);}},
 'production-cutover-activation-contract.js':{assertProductionCutoverRequest:r=>{if(new URL(r.url).origin!=='https://baggerinv.com')throw Error('WRONG_HOST');}},
 'participant-identity-supabase.js':{participantIdentityRpc:async(n,{input})=>{db++;assert.equal(n,'accept_production_phone_hook_fixture_v1');assert.equal(input.fixture_case,'authorized');return{payload:proof};}}
 };
 const code=source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,path)=>`const {${names}}=mods[${JSON.stringify(mods[path]?path:path.split('/').at(-1))}];`).replace(/export /g,'');
 const POST=new Function('mods','process',code+';return POST;')(mods,{env:f.env});return{POST,live:()=>live,db:()=>db};
}
test('actual route isolates acceptance from live sender',async()=>{const f=fixture(),h=route(f);const r=await h.POST(new Request('https://baggerinv.com/api/auth/hooks/send-sms',{method:'POST',body:f.raw,headers:f.headers}));assert.equal(r.status,200);assert.equal((await r.json()).code,'ACCEPTANCE_TRANSPORT_SUPPRESSED');assert.equal(h.db(),1);assert.equal(h.live(),0);});
for(const alter of [f=>delete f.env.PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN,f=>f.env.PARTICIPANT_SMS_AUTH_ENABLED='true',f=>f.headers.delete('webhook-signature')])test('reserved request cannot reach live sender after removal, SMS enablement or failed signature',async()=>{const f=fixture();alter(f);const h=route(f);const r=await h.POST(new Request('https://baggerinv.com/api/auth/hooks/send-sms',{method:'POST',body:f.raw,headers:f.headers}));assert.equal(r.status,403);assert.equal(h.live(),0);assert.equal(h.db(),0);});
test('public acceptance query/headers cannot select acceptance for ordinary event',async()=>{const f=fixture();f.headers.set('webhook-id','msg_normal');f.headers.set('x-bagger-acceptance','true');const h=route(f);const r=await h.POST(new Request('https://baggerinv.com/api/auth/hooks/send-sms?acceptance=true',{method:'POST',body:f.raw,headers:f.headers}));assert.equal(r.status,403);assert.equal(h.db(),0);assert.equal(h.live(),1);});
