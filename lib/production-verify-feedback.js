import 'server-only';
import {approvedVerifyFeedback} from './production-approved-sms-hook.js';
import {participantIdentityRpc} from './participant-identity-supabase.js';
export async function reportCanonicalPhoneVerification(attemptId,authUserId){
 try{return await approvedVerifyFeedback({attemptId,authUserId},{rpc:async input=>(await participantIdentityRpc('production_participant_phone_feedback_v1',{input},{timeoutMs:1000,resolveProductionIdentityRpc:async()=>({functionName:'production_participant_phone_feedback_v1',body:{input}})})).payload});}
 catch{console.warn('PHONE_VERIFY_FEEDBACK_UNCONFIRMED');return {state:'UNCERTAIN'};}
}
