import {MobileApiError,MOBILE_API_VERSION} from './mobile-api-v1.js';
import {resolveMobileBearerIdentity} from './mobile-bearer-identity.js';
import {mobileNativeCertificationFromRequest,extendedCertificationChannel,verifyMobileNativeCertification,wantsExtendedNativeCertification} from './mobile-native-certification.js';
import {certifyCanonicalNativeParticipant} from './mobile-native-participant-certification.js';

export async function renewMobileNativeCertification({request,env=process.env,dependencies={}}) {
 const prior=mobileNativeCertificationFromRequest(request);
 const channel=extendedCertificationChannel(prior);
 if(!channel || !wantsExtendedNativeCertification(request)) throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
 // All ordinary online session, current identity and signed authority checks run.
 // Only the old certificate's time expiry is relaxed in this one server path.
 const verifyCertification=input=>verifyMobileNativeCertification({...input,now:dependencies.now,allowExpiredForRenewal:true});
 const identity=await resolveMobileBearerIdentity({request,capability:'certification',env,dependencies:{...dependencies,verifyCertification}});
 if(identity.kind==='observer') throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
 const data=await certifyCanonicalNativeParticipant({request,authUserId:identity.authUserId,playerId:identity.playerId,tournamentId:identity.tournamentId,channel,priorCertification:prior,env,dependencies});
 return {status:200,body:{ok:true,apiVersion:MOBILE_API_VERSION,data}};
}
