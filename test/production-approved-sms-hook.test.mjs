import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {approvedSmsHook,verifySmsHook,smsHookConfiguration} from '../lib/production-approved-sms-hook.js';
const uid='00000000-0000-4000-8000-000000000001',aid='10000000-0000-4000-8000-000000000001';
const env={VERCEL_ENV:'production',PARTICIPANT_SMS_SEND_HOOK_ENABLED:'true',PARTICIPANT_SMS_AUTH_ENABLED:'true',SUPABASE_SEND_SMS_HOOK_SECRET:'v1,whsec_'+Buffer.alloc(32,7).toString('base64'),TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-test-credential-only'};
const now=1800000000000;
function request(payload={user:{id:uid,new_phone:'12025550123'},sms:{phone:'12025550123',otp:'123456'}}){
 const raw=JSON.stringify(payload),headers=new Headers({'webhook-id':'msg_fixture1','webhook-timestamp':String(now/1000)});
 headers.set('webhook-signature','v1,'+createHmac('sha256',smsHookConfiguration(env).key).update(`msg_fixture1.${now/1000}.${raw}`).digest('base64'));
 return {raw,headers,env,now};
}
function fixture({deny=false,response,throwSend=false,recordFail=false}={}){
 const calls=[];let sent=0,state;
 const rpc=async x=>{calls.push(x);if(deny)throw Error('DENIED');if(x.action==='claim'){if(state)throw Error('REPLAY');state='CLAIMED';return{ok:true,state,attemptId:aid};}if(recordFail)throw Error('database unavailable');state=x.action.toUpperCase();return{ok:true,state,attemptId:aid};};
 const fetchImpl=async(url,opts)=>{sent++;assert.equal(url,`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`);const form=new URLSearchParams(opts.body);assert.equal(form.get('To'),'+12025550123');assert.equal(form.get('CustomCode'),'123456');assert.equal(form.get('Channel'),'sms');assert.equal(form.has('Body'),false);assert.equal(opts.redirect,'error');assert.ok(opts.signal);if(throwSend)throw Error('network timeout');return response||{status:201,json:async()=>({sid:'VE'+'c'.repeat(32),account_sid:env.TWILIO_ACCOUNT_SID,service_sid:env.TWILIO_VERIFY_SERVICE_SID,channel:'sms',to:'+12025550123',status:'pending'})};};
 return {rpc,fetchImpl,calls,sent:()=>sent,state:()=>state};
}
test('approved hook sends the Supabase six-digit code exactly once and records receipt',async()=>{const f=fixture();assert.deepEqual(await approvedSmsHook(request(),f),{});assert.equal(f.sent(),1);assert.deepEqual(f.calls.map(x=>x.action),['claim','sent']);assert.ok(!JSON.stringify(f.calls).includes('123456'));assert.ok(!JSON.stringify(f.calls).includes('synthetic-test-credential'));});
test('database denial prevents any provider dispatch',async()=>{const f=fixture({deny:true});await assert.rejects(approvedSmsHook(request(),f));assert.equal(f.sent(),0);});
for(const change of [q=>q.headers.delete('webhook-signature'),q=>q.headers.set('webhook-signature','v1,AAAA'),q=>q.raw+=' ',q=>q.now+=300001,q=>q.headers.set('webhook-id','other'),q=>q.env={...env,PARTICIPANT_SMS_AUTH_ENABLED:'false'}])test('unauthenticated/stale/altered/disabled hook never calls database or provider',async()=>{const f=fixture(),q=request();change(q);await assert.rejects(approvedSmsHook(q,f));assert.equal(f.sent(),0);assert.equal(f.calls.length,0);});
for(const payload of [{user:{id:uid,new_phone:'12025550124'},sms:{phone:'12025550123',otp:'123456'}},{user:{id:'wrong'},sms:{phone:'12025550123',otp:'123456'}},{user:{id:uid},sms:{phone:'12025550123',otp:'12345'}},{user:{id:uid},sms:{phone:'evil URL',otp:'123456'}}])test('malformed or conflicting signed provider payload denied before dispatch',async()=>{const f=fixture();await assert.rejects(approvedSmsHook(request(payload),f));assert.equal(f.calls.length,0);});
test('documented older payload is accepted only with unambiguous signed destination',()=>{const q=request({user:{id:uid,new_phone:'12025550123'},sms:{otp:'123456'}});assert.equal(verifySmsHook(q.raw,q.headers,smsHookConfiguration(env).key,now).phone,'+12025550123');});
test('duplicate callback cannot send twice',async()=>{const f=fixture();await approvedSmsHook(request(),f);await assert.rejects(approvedSmsHook(request(),f));assert.equal(f.sent(),1);});
test('provider timeout records uncertainty with no retry',async()=>{const f=fixture({throwSend:true});await assert.rejects(approvedSmsHook(request(),f));assert.equal(f.state(),'UNCERTAIN');assert.equal(f.sent(),1);});
test('provider 5xx is uncertain even if response body looks successful',async()=>{const f=fixture({response:{status:503,json:async()=>({sid:'VE'+'c'.repeat(32)})}});await assert.rejects(approvedSmsHook(request(),f));assert.equal(f.state(),'UNCERTAIN');});
test('provider explicit rejected request records failed',async()=>{const f=fixture({response:{status:429,json:async()=>({})}});await assert.rejects(approvedSmsHook(request(),f));assert.equal(f.state(),'FAILED');});
test('wrong returned account/destination cannot certify send',async()=>{const f=fixture({response:{status:201,json:async()=>({sid:'VE'+'c'.repeat(32),account_sid:'other',to:'+12025550124',status:'pending'})}});await assert.rejects(approvedSmsHook(request(),f));assert.equal(f.state(),'UNCERTAIN');});
test('lost receipt write does not claim success or resend',async()=>{const f=fixture({recordFail:true});await assert.rejects(approvedSmsHook(request(),f));assert.equal(f.state(),'CLAIMED');assert.equal(f.sent(),1);});
test('no secret/provider output in successful or denied hook response',async()=>{const f=fixture({response:{status:400,json:async()=>({secret:'DO-NOT-RETURN'})}});await assert.rejects(approvedSmsHook(request(),f),e=>e.message==='SMS_HOOK_DELIVERY_UNCONFIRMED');});
