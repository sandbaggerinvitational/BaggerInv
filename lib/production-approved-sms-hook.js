import 'server-only';
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const e164=value=>{const s=String(value??'');return /^\+?[1-9][0-9]{7,14}$/.test(s)?`+${s.replace(/^\+/,'')}`:null;};
export function smsHookConfiguration(env=process.env){
 if(env.VERCEL_ENV!=='production'||env.PARTICIPANT_SMS_SEND_HOOK_ENABLED!=='true'||env.PARTICIPANT_SMS_AUTH_ENABLED!=='true')fail('SMS_HOOK_DISABLED');
 const secret=String(env.SUPABASE_SEND_SMS_HOOK_SECRET??'').replace(/^v1,whsec_/,'').replace(/^whsec_/,'');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(secret)||Buffer.from(secret,'base64').length<32)fail('SMS_HOOK_CONFIG');
 if(!/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')||!/^VA[0-9a-f]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID||'')||!env.TWILIO_AUTH_TOKEN||/[\r\n]/.test(env.TWILIO_AUTH_TOKEN))fail('SMS_HOOK_CONFIG');
 return {key:Buffer.from(secret,'base64'),account:env.TWILIO_ACCOUNT_SID,service:env.TWILIO_VERIFY_SERVICE_SID,token:env.TWILIO_AUTH_TOKEN};
}
export function verifySmsHook(raw,headers,key,now=Date.now()){
 const id=headers.get('webhook-id'),stamp=headers.get('webhook-timestamp'),signatures=headers.get('webhook-signature');
 if(typeof raw!=='string'||Buffer.byteLength(raw)>32768||!id||!/^[A-Za-z0-9_-]{1,200}$/.test(id)||!/^\d{10}$/.test(stamp||'')||Math.abs(now-Number(stamp)*1000)>300000||!signatures||signatures.length>2048)fail('SMS_HOOK_UNAUTHORIZED');
 const expected=createHmac('sha256',key).update(`${id}.${stamp}.${raw}`).digest();
 if(!signatures.split(/\s+/).some(s=>{const [v,b]=s.split(',');if(v!=='v1'||!/^[A-Za-z0-9+/]+={0,2}$/.test(b||''))return false;const got=Buffer.from(b,'base64');return got.length===expected.length&&timingSafeEqual(got,expected);}))fail('SMS_HOOK_UNAUTHORIZED');
 let payload;try{payload=JSON.parse(raw);}catch{fail('SMS_HOOK_INVALID');}
 // Provider supplies the actual destination in sms.phone in current Auth. Older
 // documented payloads use new_phone/phone. Conflicting values always deny.
 const candidate=payload?.user?.new_phone||payload?.user?.phone;
 const phone=e164(payload?.sms?.phone??candidate);
 if(!uuid.test(payload?.user?.id||'')||!phone||!/^\d{6}$/.test(payload?.sms?.otp||'')||typeof payload.sms.otp!=='string'||(payload?.sms?.phone&&candidate&&e164(candidate)!==phone))fail('SMS_HOOK_INVALID');
 return {authUserId:payload.user.id,phone,otp:payload.sms.otp,eventHash:createHash('sha256').update(id).digest('hex')};
}
export async function approvedSmsHook({raw,headers,env=process.env,now=Date.now()},{rpc,fetchImpl=fetch}){
 const config=smsHookConfiguration(env);
 const v=verifySmsHook(raw,headers,config.key,now);
 const binding={auth_user_id:v.authUserId,phone_e164:v.phone,event_hash:v.eventHash};
 const claimed=await rpc({...binding,action:'claim'});
 if(claimed?.ok!==true||claimed.state!=='CLAIMED'||!uuid.test(claimed.attemptId||''))fail('SMS_HOOK_DENIED');
 // Cancel only the exact prior receipt before replacing Supabase's code on resend.
 let state='UNCERTAIN',receipt=null;
 try{
 if(claimed.priorVerificationSid){
 if(claimed.verifyServiceSid!==config.service)throw Error('VERIFY_SERVICE_MISMATCH');
 await updateVerifyStatus(config,claimed.priorVerificationSid,v.phone,'canceled',fetchImpl,700);
 }
 const response=await fetchImpl(`https://verify.twilio.com/v2/Services/${config.service}/Verifications`,{
 method:'POST',redirect:'error',signal:AbortSignal.timeout(1500),
 headers:verifyHeaders(config),body:new URLSearchParams({To:v.phone,Channel:'sms',CustomCode:v.otp}).toString()});
 const body=await response.json().catch(()=>null);
 if(response.status===201&&validVerifyReceipt(body,config,v.phone,'pending')&&body.sid!==claimed.priorVerificationSid){
 state='SENT';receipt={verification_sid:body.sid,verify_service_sid:body.service_sid};
 }else if([400,401,403,404,422,429].includes(response.status))state='FAILED';
 }catch{/* no retry or new send after uncertain cancellation/provider outcome */}
 const recorded=await rpc({...binding,action:state.toLowerCase(),...(receipt||{})});
 if(recorded?.ok!==true||recorded.attemptId!==claimed.attemptId||recorded.state!==state||state!=='SENT')fail('SMS_HOOK_DELIVERY_UNCONFIRMED');
 return {};
}
const verificationSid=s=>/^VE[0-9a-f]{32}$/i.test(s||'');
const verifyHeaders=c=>({Authorization:`Basic ${Buffer.from(`${c.account}:${c.token}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'});
export function validVerifyReceipt(b,c,phone,status){return verificationSid(b?.sid)&&b.account_sid===c.account&&b.service_sid===c.service&&e164(b.to)===phone&&b.channel==='sms'&&b.status===status;}
export async function updateVerifyStatus(config,sid,phone,status,fetchImpl=fetch,timeout=1500){
 if(!verificationSid(sid)||!['approved','canceled'].includes(status))fail('VERIFY_RECEIPT_INVALID');
 const response=await fetchImpl(`https://verify.twilio.com/v2/Services/${config.service}/Verifications/${sid}`,{
 method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),headers:verifyHeaders(config),body:new URLSearchParams({Status:status}).toString()});
 const body=await response.json().catch(()=>null);
 if(response.status!==200||!validVerifyReceipt(body,config,phone,status)||body.sid!==sid)fail('VERIFY_STATUS_UNCERTAIN');
}
// Feedback is telemetry AFTER canonical Supabase verification and DB completion.
// It cannot verify a code, associate a phone, create a session or grant authority.
export async function approvedVerifyFeedback({attemptId,authUserId,env=process.env},{rpc,fetchImpl=fetch}){
 const config=smsHookConfiguration(env);
 const binding={attempt_id:attemptId,auth_user_id:authUserId};
 const claim=await rpc({...binding,action:'claim'});
 if(claim?.ok!==true||claim.state!=='CLAIMED'||claim.attemptId!==attemptId||claim.verifyServiceSid!==config.service||!e164(claim.phoneE164))fail('VERIFY_FEEDBACK_DENIED');
 let state='UNCERTAIN';
 try{await updateVerifyStatus(config,claim.verificationSid,claim.phoneE164,'approved',fetchImpl);state='ACKNOWLEDGED';}catch{}
 const recorded=await rpc({...binding,action:state.toLowerCase()});
 if(recorded?.ok!==true||recorded.state!==state)fail('VERIFY_FEEDBACK_UNCONFIRMED');
 return {state};
}
