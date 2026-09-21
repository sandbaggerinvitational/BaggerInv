import {MobileApiError} from './mobile-api-v1.js';
import {requireMobileNativeCapability} from './mobile-native-admission.js';
import {readParticipantIdentityContextForAuth} from './participant-identity-supabase.js';
import {issueMobileNativeCertification,MOBILE_NATIVE_CERTIFICATION_SECONDS} from './mobile-native-certification.js';
// One existing native certification authority, called only after channel-specific canonical completion.
export async function certifyCanonicalNativeParticipant({request,authUserId,playerId,tournamentId,participant,env=process.env,dependencies={}}) {
 const p=participant ?? (await (dependencies.readIdentity||readParticipantIdentityContextForAuth)({authUserId,tournamentId},dependencies.rpcOptions))?.payload?.data;
 if(!p || p.authUserId!==authUserId || p.playerId!==playerId || p.tournament?.id!==tournamentId || p.membership?.active!==true) throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
 const admission=await requireMobileNativeCapability('certification',{request,env,dependencies:dependencies.nativeAdmission});
 if(admission && admission.authority.runtime.tournamentId!==tournamentId)throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
 const c=(dependencies.issueCertification||issueMobileNativeCertification)({authUserId,playerId,tournamentId,productionContext:admission?{runtime:admission.authority.runtime,revocationGeneration:admission.controls.revocationGeneration,participant:p}:null,env});
 if(!c?.token || c.expiresInSeconds!==MOBILE_NATIVE_CERTIFICATION_SECONDS)throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
 return {certified:true,certificationToken:c.token,expiresInSeconds:c.expiresInSeconds};
}
