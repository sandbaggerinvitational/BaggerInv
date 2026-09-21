import {readNativeSessionAuthority} from './mobile-native-session-authority.js';
import {mobileBearerTokenFromRequest,verifyMobileSupabaseAuthenticatedUser} from './mobile-bearer-identity.js';
import {MobileApiError} from './mobile-api-v1.js';
import {requireMobileNativeCapability} from './mobile-native-admission.js';
import {readParticipantIdentityContextForAuth} from './participant-identity-supabase.js';
import {issueMobileNativeCertification,MOBILE_NATIVE_CERTIFICATION_SECONDS,MOBILE_NATIVE_EXTENDED_CERTIFICATION_SECONDS,wantsExtendedNativeCertification,verifyMobileNativeCertification} from './mobile-native-certification.js';
// One existing native certification authority, called only after channel-specific canonical completion.
export async function certifyCanonicalNativeParticipant({request,authUserId,playerId,tournamentId,participant,channel="email",priorCertification=null,env=process.env,dependencies={}}) {
 const p=participant ?? (await (dependencies.readIdentity||readParticipantIdentityContextForAuth)({authUserId,tournamentId},dependencies.rpcOptions))?.payload?.data;
 if(!p || p.authUserId!==authUserId || p.playerId!==playerId || p.tournament?.id!==tournamentId || p.membership?.active!==true) throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
 const admission=await requireMobileNativeCapability('certification',{request,env,dependencies:dependencies.nativeAdmission});
 if(admission && admission.authority.runtime.tournamentId!==tournamentId)throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
 const extended = env.VERCEL_ENV === 'production' && wantsExtendedNativeCertification(request);
 let sessionAuthority = null;
 if (extended) {
   const verification = await (dependencies.verifyUser || verifyMobileSupabaseAuthenticatedUser)(mobileBearerTokenFromRequest(request),{env,client:dependencies.authClient});
   sessionAuthority = await readNativeSessionAuthority({request,verification,authUserId,playerId,tournamentId,channel,env,dependencies});
 }
 if (priorCertification) verifyMobileNativeCertification({token:priorCertification,authUserId,playerId,tournamentId,env,now:dependencies.now,allowExpiredForRenewal:true,productionContext:{runtime:admission.authority.runtime,revocationGeneration:admission.controls.revocationGeneration,participant:p,sessionAuthority}});
 const c=(dependencies.issueCertification||issueMobileNativeCertification)({authUserId,playerId,tournamentId,extended,channel,productionContext:admission?{runtime:admission.authority.runtime,revocationGeneration:admission.controls.revocationGeneration,participant:p,sessionAuthority}:null,env});
 if(!c?.token || c.expiresInSeconds!==(extended ? MOBILE_NATIVE_EXTENDED_CERTIFICATION_SECONDS : MOBILE_NATIVE_CERTIFICATION_SECONDS))throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
 return {certified:true,certificationToken:c.token,expiresInSeconds:c.expiresInSeconds};
}
