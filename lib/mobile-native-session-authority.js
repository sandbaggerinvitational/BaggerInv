import {MobileApiError} from './mobile-api-v1.js';
import {authorizeParticipantPhoneLoginProof} from './participant-identity-supabase.js';

// Called only after online Supabase getUser verifies this bearer. No JWT material
// is trusted before that check, returned to clients, logged, or persisted here.
export async function readNativeSessionAuthority({request,verification,authUserId,playerId,tournamentId,channel,env,dependencies={}}) {
 if(verification?.status==='unavailable') throw new MobileApiError('MOBILE_API_UNAVAILABLE');
 if(verification?.status!=='active' || verification.authUserId!==authUserId || !verification.emailVerified || !verification.security?.emailConfirmedAt) throw new MobileApiError('INVALID_TOKEN');
 let claims;
 try { claims=JSON.parse(Buffer.from(request.headers.get('authorization').split(' ')[1].split('.')[1],'base64url')); }
 catch { throw new MobileApiError('INVALID_TOKEN'); }
 if(claims.sub!==authUserId || !/^[0-9a-f-]{36}$/i.test(claims.session_id||'') || !['aal1','aal2'].includes(claims.aal)) throw new MobileApiError('INVALID_TOKEN');
 const s=verification.security;
 const authority={sessionId:claims.session_id,aal:claims.aal,email:s.email,emailConfirmedAt:s.emailConfirmedAt,identities:s.identities};
 if(channel==='phone') {
  let result;
  try {result=await (dependencies.readPhoneAuthority||authorizeParticipantPhoneLoginProof)({auth_user_id:authUserId,player_id:playerId,tournament_id:tournamentId},{...dependencies.rpcOptions,env});}
  catch {throw new MobileApiError('MOBILE_API_UNAVAILABLE');}
  const p=result?.payload;
  if(!p?.ok || p.allowed!==true || p.authUserId!==authUserId || p.playerId!==playerId || p.tournamentId!==tournamentId || p.phoneConfirmed!==true || !p.identifierId || !Number.isSafeInteger(p.identifierRevision) || !s.phoneConfirmedAt || String(p.phoneE164||'').replace(/^\+/,'')!==String(s.phone||'').replace(/^\+/,'')) throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
  authority.phone={identifierId:p.identifierId,revision:p.identifierRevision,confirmedAt:s.phoneConfirmedAt,phone:s.phone};
 }
 return authority;
}
