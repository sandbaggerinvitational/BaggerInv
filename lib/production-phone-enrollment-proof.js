import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
export const EMAIL_ENROLLMENT_COOKIE='sbi-email-phone-enrollment';
export const EMAIL_ENROLLMENT_SECONDS=600;
const clean=x=>String(x??'').trim();
const hash=x=>createHash('sha256').update(x).digest('hex');
function secret(env){const s=clean(env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET);if(s.length<32)throw Error('PHONE_ENROLLMENT_UNAVAILABLE');return s;}
const sign=(v,env)=>createHmac('sha256',secret(env)).update('bagger-email-phone-enrollment-v1.'+v).digest('base64url');
export function phoneEnrollmentEnabled(env=process.env){return env.VERCEL_ENV==='production'&&env.PARTICIPANT_PHONE_ENROLLMENT_ENABLED==='true'&&clean(env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET).length>=32;}
// Called only AFTER canonical Email OTP certification, never from a Text login.
// The token digest binds the proof to that particular authenticated Email session token.
export function issueEmailPhoneEnrollmentProof({authUserId,playerId,tournamentId,accessToken},env=process.env,now=Date.now()){
 if(!phoneEnrollmentEnabled(env))return null;
 if(!/^[0-9a-f-]{36}$/i.test(clean(authUserId))||!clean(playerId)||!/^\d{4}$/.test(clean(tournamentId))||!clean(accessToken))return null;
 const body=Buffer.from(JSON.stringify({v:1,purpose:'EMAIL_PHONE_ENROLLMENT',authUserId,playerId,tournamentId,tokenHash:hash(accessToken),issuedAt:now,expiresAt:now+EMAIL_ENROLLMENT_SECONDS*1000})).toString('base64url');
 return body+'.'+sign(body,env);
}
export function verifyEmailPhoneEnrollmentProof(token,{authUserId,accessToken},env=process.env,now=Date.now()){
 try{
 if(!phoneEnrollmentEnabled(env)||typeof token!=='string'||token.length>2048)throw 0;
 const parts=token.split('.');if(parts.length!==2)throw 0;
 const a=Buffer.from(parts[1]),b=Buffer.from(sign(parts[0],env));if(a.length!==b.length||!timingSafeEqual(a,b))throw 0;
 const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());
 if(p.v!==1||p.purpose!=='EMAIL_PHONE_ENROLLMENT'||p.authUserId!==authUserId||p.tokenHash!==hash(accessToken)||!p.playerId||!/^\d{4}$/.test(p.tournamentId)
 ||!Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt-p.issuedAt!==600000||p.issuedAt>now||now>=p.expiresAt)throw 0;
 return p;
 }catch{throw Error('PHONE_ENROLLMENT_EMAIL_REQUIRED');}
}
