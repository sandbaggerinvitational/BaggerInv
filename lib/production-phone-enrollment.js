import {normalizeParticipantAuthPhone} from './participant-auth-phone.js';
import {verifyEmailPhoneEnrollmentProof} from './production-phone-enrollment-proof.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeKeys=['status','playerId','tournamentId','approvalRevision','maskedPhone','challengeId','issuedAt','expiresAt','idempotent','sameAuthUser'];
export const enrollmentPublicResult=v=>Object.fromEntries(safeKeys.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
function fail(code){throw Object.assign(Error(code),{code});}
export async function productionPhoneEnrollment({input,user,accessToken,emailProof,clientFingerprint,env},{rpc,provider}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','approvalRevision','challengeId','token'].includes(k)))fail('PHONE_ENROLLMENT_INVALID');
 if(!user?.id||!user.email_confirmed_at)fail('PHONE_ENROLLMENT_EMAIL_REQUIRED');
 const proof=verifyEmailPhoneEnrollmentProof(emailProof,{authUserId:user.id,accessToken},env);
 const actor={auth_user_id:user.id,player_id:proof.playerId,tournament_id:proof.tournamentId};
 const call=async(action,more={})=>{const x=await rpc({...actor,action,...more});if(x?.ok!==true)fail(x?.code||'PHONE_ENROLLMENT_UNAVAILABLE');return x;};
 const destination=x=>{const p=normalizeParticipantAuthPhone(x.phoneE164);if(p.e164!==x.phoneE164||x.authUserId!==user.id||x.playerId!==proof.playerId||x.tournamentId!==proof.tournamentId)fail('PHONE_ENROLLMENT_CONFLICT');return p.e164;};
 if(input.action==='state'){const x=await call('state');destination(x);return enrollmentPublicResult(x);}
 if(input.action==='begin'||input.action==='resend'){
 if(!Number.isSafeInteger(input.approvalRevision)||input.approvalRevision<1)fail('PHONE_ENROLLMENT_INVALID');
 // Check normalization BEFORE creating a challenge/provider request, then recheck DB at begin.
 const state=await call('state');destination(state);
 if(input.action==='resend'&&!UUID.test(input.challengeId||''))fail('PHONE_ENROLLMENT_INVALID');
 const a=await call(input.action,{approval_revision:input.approvalRevision,client_fingerprint:clientFingerprint,...(input.action==='resend'?{challenge_id:input.challengeId}:{})});
 const phone=destination(a);if(a.status==='VERIFIED')return enrollmentPublicResult(a);
 if(!UUID.test(a.challengeId))fail('PHONE_ENROLLMENT_UNAVAILABLE');
 try{const u=await provider.request(phone);if(u?.id!==user.id)fail('PHONE_ENROLLMENT_PROVIDER_MISMATCH');}
 catch{
 // Only the independently recorded hook's conclusive FAILED receipt releases a
 // request. Lost/ambiguous responses retain the durable reservation for review.
 const ended=await call('send_failed',{challenge_id:a.challengeId}).catch(()=>null);
 fail(ended?.status==='SEND_FAILED'?'PHONE_ENROLLMENT_SEND_FAILED':'PHONE_ENROLLMENT_PROVIDER_UNCERTAIN');
 }
 const sent=await call('sent',{challenge_id:a.challengeId});
 return {...enrollmentPublicResult(sent),issuedAt:a.issuedAt,resendAfterSeconds:60};
 }
 if(input.action==='expire'){if(!UUID.test(input.challengeId||''))fail('PHONE_ENROLLMENT_INVALID');return enrollmentPublicResult(await call('expire',{challenge_id:input.challengeId}));}
 if(input.action==='verify'){
 if(!UUID.test(input.challengeId)||!/^\d{6}$/.test(String(input.token??'')))fail('PHONE_ENROLLMENT_INVALID');
 const a=await call('verify',{challenge_id:input.challengeId});const phone=destination(a);
 let result;
 try{result=await provider.verify(phone,String(input.token));}
 catch(error){
 // Only a conclusive rejected code permits another verification. An uncertain
 // transport outcome stays claimed until expiry/review; no blind provider retry.
 if(error?.invalidCode===true)await call('verify_failed',{challenge_id:input.challengeId});
 fail(error?.invalidCode===true?'PHONE_ENROLLMENT_INVALID_CODE':'PHONE_ENROLLMENT_PROVIDER_UNCERTAIN');
 }
 if(result?.id!==user.id)fail('PHONE_ENROLLMENT_PROVIDER_MISMATCH');
 const completed=await call('complete',{challenge_id:input.challengeId,returned_auth_user_id:result.id});
 return enrollmentPublicResult(completed);
 }
 fail('PHONE_ENROLLMENT_INVALID');
}
