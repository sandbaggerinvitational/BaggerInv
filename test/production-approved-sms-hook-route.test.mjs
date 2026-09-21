import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import * as hook from '../lib/production-approved-sms-hook.js';
const source=readFileSync(new URL('../app/api/auth/hooks/send-sms/route.js',import.meta.url),'utf8');
const env={VERCEL_ENV:'production',PARTICIPANT_SMS_SEND_HOOK_ENABLED:'true',PARTICIPANT_SMS_AUTH_ENABLED:'true',SUPABASE_SEND_SMS_HOOK_SECRET:'whsec_'+Buffer.alloc(32,7).toString('base64'),TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-fixture-only'};
function harness({deny=false}={}){
 const calls=[];let sends=0;
 const mods={
 'next/server':{NextResponse:{json:(body,{status=200,headers}={})=>new Response(JSON.stringify(body),{status,headers})}},
 'production-approved-sms-hook.js':{approvedSmsHook:(input,deps)=>hook.approvedSmsHook({...input,env},{...deps,fetchImpl:async()=>{sends++;return {status:201,json:async()=>({sid:'VE'+'c'.repeat(32),account_sid:env.TWILIO_ACCOUNT_SID,service_sid:env.TWILIO_VERIFY_SERVICE_SID,channel:'sms',to:'+12025550123',status:'pending'})};}})},
 'production-cutover-activation-contract.js':{assertProductionCutoverRequest:(request)=>{if(new URL(request.url).origin!=='https://baggerinv.com')throw Error('CANONICAL_ONLY');}},
 'participant-identity-supabase.js':{participantIdentityRpc:async(name,{input},opts)=>{calls.push({name,input,opts});if(deny)throw Error('PRIVATE PROVIDER DATA');return {payload:{ok:true,attemptId:'10000000-0000-4000-8000-000000000001',state:input.action==='claim'?'CLAIMED':input.action.toUpperCase()}};}}
 };
 const code=source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,path)=>{const key=mods[path]?path:path.split('/').at(-1);return `const {${names}}=mods[${JSON.stringify(key)}];`;}).replace(/export /g,'');
 const POST=new Function('mods','process',code+';return POST;')(mods,{env});
 const req=(url='https://baggerinv.com/api/auth/hooks/send-sms',signed=true,oversize=false)=>{
 const raw=oversize?'x'.repeat(32769):JSON.stringify({user:{id:'00000000-0000-4000-8000-000000000001',new_phone:'12025550123'},sms:{otp:'123456',phone:'12025550123'}});
 const stamp=String(Math.floor(Date.now()/1000));const headers={'webhook-id':'msg_local1','webhook-timestamp':stamp};if(signed)headers['webhook-signature']='v1,'+createHmac('sha256',hook.smsHookConfiguration(env).key).update(`msg_local1.${stamp}.${raw}`).digest('base64');
 return new Request(url,{method:'POST',headers,body:raw});};
 return{POST,req,calls,sends:()=>sends};
}
test('real hook route composes signature, approved RPC and single mocked Twilio dispatch',async()=>{const h=harness(),r=await h.POST(h.req());assert.equal(r.status,200);assert.deepEqual(await r.json(),{});assert.equal(h.sends(),1);assert.deepEqual(h.calls.map(x=>x.name),['production_participant_phone_dispatch_v1','production_participant_phone_dispatch_v1']);assert.equal(h.calls[0].opts.timeoutMs,1000);});
for(const [name,args] of [['preview',['https://other.vercel.app/api/auth/hooks/send-sms']],['unsigned',[undefined,false]],['oversized',[undefined,true,true]]])test('hook route denies '+name+' before any send',async()=>{const h=harness(),r=await h.POST(h.req(...args));assert.equal(r.status,403);assert.equal(h.sends(),0);assert.equal(h.calls.length,0);assert.equal(r.headers.get('cache-control'),'private, no-store');});
test('hook route hides all database/provider details and OTP on failure',async()=>{const h=harness({deny:true}),r=await h.POST(h.req());assert.equal(r.status,403);assert.equal(h.sends(),0);const body=await r.text();for(const secret of ['123456','12025550123','PRIVATE','00000000'])assert.ok(!body.includes(secret));});
