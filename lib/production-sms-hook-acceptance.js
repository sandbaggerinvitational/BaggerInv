import 'server-only';
import {createHash} from 'node:crypto';
import {verifySmsHook} from './production-approved-sms-hook.js';

const deny=()=>{throw Object.assign(new Error('SMS_HOOK_ACCEPTANCE_DENIED'),{code:'SMS_HOOK_ACCEPTANCE_DENIED'});};
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const cases=new Set(['authorized','wrong_uuid','wrong_phone','wrong_player','missing_attempt','stale_approval','revoked_approval','stale_attempt']);
// Reserved event IDs never fall through to the live sender, even after expiry,
// removal of acceptance configuration, or a later change to the SMS capability.
export function isSmsHookAcceptanceRequest(headers){return String(headers.get('webhook-id')||'').startsWith('bagger_acceptance_');}
export async function acceptSmsHookWithoutDelivery({raw,headers,env=process.env,now=Date.now()},{authorizeFixture}){
 if(!isSmsHookAcceptanceRequest(headers)||env.VERCEL_ENV!=='production'||env.PARTICIPANT_SMS_AUTH_ENABLED==='true')deny();
 let plan;try{plan=JSON.parse(env.PARTICIPANT_SMS_HOOK_ACCEPTANCE_PLAN);}catch{deny();}
 if(plan?.version!==1||plan.purpose!=='SMS_OFF_HOSTED_ACCEPTANCE'||!sha(plan.applicationSha)||plan.applicationSha!==env.VERCEL_GIT_COMMIT_SHA
 ||plan.projectRef!=='ymqhhtxaywtqllynrmxe'||plan.apiOrigin!=='https://baggerinv.com'
 ||!Number.isSafeInteger(plan.issuedAt)||!Number.isSafeInteger(plan.expiresAt)||plan.issuedAt>now||plan.expiresAt<=now
 ||plan.expiresAt-plan.issuedAt>7200000||!Array.isArray(plan.requests)||plan.requests.length<1||plan.requests.length>16)deny();
 const matches=plan.requests.filter(x=>x.eventId===headers.get('webhook-id'));
 if(matches.length!==1||!cases.has(matches[0].fixtureCase)||!hash(matches[0].bodyHash)
 ||matches[0].bodyHash!==createHash('sha256').update(raw).digest('hex'))deny();
 const secret=String(env.SUPABASE_SEND_SMS_HOOK_SECRET??'').replace(/^v1,whsec_/,'').replace(/^whsec_/,'');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(secret)||Buffer.from(secret,'base64').length<32)deny();
 const payload=verifySmsHook(raw,headers,Buffer.from(secret,'base64'),now);
 const proof=await authorizeFixture({auth_user_id:payload.authUserId,phone_e164:payload.phone,event_hash:payload.eventHash,fixture_case:matches[0].fixtureCase});
 if(proof?.ok!==true||proof.code!=='ACCEPTANCE_DATABASE_ROLLED_BACK'||proof.authorized!==true||proof.fixtureRolledBack!==true
 ||proof.directorPhoneValidated!==true||proof.attemptValidated!==true||proof.playerId!=='SMS_TEST_A'
 ||proof.authUserId!==payload.authUserId||payload.authUserId!=='00000000-0000-4000-8000-000000009801'
 ||payload.phone!=='+12025550190'||!/^VA[0-9a-f]{32}$/.test(env.TWILIO_VERIFY_SERVICE_SID||''))deny();
 // Preparation only. This module has NO fetch, live sender, provider token,
 // transport callback, or fallback. The rollback-only RPC never dispatches.
 const prepared={url:`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,method:'POST',
 body:new URLSearchParams({To:payload.phone,Channel:'sms',CustomCode:payload.otp}).toString()};
 if(!prepared.body||!prepared.url)deny();
 return {code:'ACCEPTANCE_TRANSPORT_SUPPRESSED',signature:true,databaseAuthorization:true,directorPhoneValidation:true,
 attemptValidation:true,transportPrepared:true,fixtureRolledBack:true,twilioApiCalls:0,smsSent:0};
}
