import {reportCanonicalPhoneVerification} from '../../../../../lib/production-verify-feedback.js';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createParticipantAuthServerClient,participantAuthServerConfiguration} from '../../../../../lib/supabase-auth-server.js';
import {assertProductionCutoverRequest} from '../../../../../lib/production-cutover-activation-contract.js';
import {participantIdentityRpc} from '../../../../../lib/participant-identity-supabase.js';
import {participantPhoneOtpClientFingerprint} from '../../../../../lib/participant-phone-otp.js';
import {phoneEnrollmentEnabled,EMAIL_ENROLLMENT_COOKIE} from '../../../../../lib/production-phone-enrollment-proof.js';
import {productionPhoneEnrollment} from '../../../../../lib/production-phone-enrollment.js';
import {dataAuthorityFetch} from '../../../../../lib/data-authority-request.js';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
async function run(request,input){
 if(!phoneEnrollmentEnabled())return json({code:'PHONE_ENROLLMENT_UNAVAILABLE'},404);
 try{
 const authorization=request.headers.get('authorization');
 const bearer=authorization!==null;
 if(bearer&&!/^Bearer \S+$/i.test(authorization))throw Error('PHONE_ENROLLMENT_EMAIL_REQUIRED');
 assertProductionCutoverRequest(request,process.env,{requireOrigin:!bearer && request.method!=='GET'});
 if(!bearer && request.method==='POST' && (request.headers.get('origin')!==new URL(request.url).origin||!['same-origin',null].includes(request.headers.get('sec-fetch-site'))))throw Error('PHONE_ENROLLMENT_EMAIL_REQUIRED');
 const store=await cookies();const config=participantAuthServerConfiguration();
 if(config.url.replace(/\/$/,'')!=='https://ymqhhtxaywtqllynrmxe.supabase.co')throw Error('PHONE_ENROLLMENT_UNAVAILABLE');
 const client=bearer?createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):createParticipantAuthServerClient(store);
 const accessToken=bearer?authorization.slice(7):(await client.auth.getSession()).data?.session?.access_token;
 if(!accessToken)throw Error('PHONE_ENROLLMENT_EMAIL_REQUIRED');
 const checked=await client.auth.getUser(accessToken);
 if(checked.error||!checked.data?.user?.id)throw Error('PHONE_ENROLLMENT_EMAIL_REQUIRED');
 const providerFetch=dataAuthorityFetch('supabase',{adapter:'production-approved-phone-enrollment'});
 const providerCall=async(path,method,body)=>{
 const r=await providerFetch(`${config.url}/auth/v1/${path}`,{method,headers:{apikey:config.publishableKey,Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const x=await r.json().catch(()=>null);
 if(!r.ok||!x)throw Object.assign(Error('PHONE_ENROLLMENT_PROVIDER_FAILED'),{invalidCode:r.status===403&&x?.error_code==='otp_expired'});
 return x.user||x;
 };
 const result=await productionPhoneEnrollment({input,user:checked.data.user,accessToken,
 emailProof:bearer?request.headers.get('x-bagger-email-enrollment-proof'):store.get(EMAIL_ENROLLMENT_COOKIE)?.value,
 clientFingerprint:participantPhoneOtpClientFingerprint(request,process.env.PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET),env:process.env},{
 rpc:async input=>(await participantIdentityRpc('production_participant_phone_enrollment_v1',{input})).payload,
 provider:{request:phone=>providerCall('user','PUT',{phone}),verify:(phone,token)=>providerCall('verify','POST',{phone,token,type:'phone_change'})}
 });
 if(input.action==='verify'&&result.status==='VERIFIED'&&result.sameAuthUser===true)await reportCanonicalPhoneVerification(result.challengeId,checked.data.user.id);
 return json({ok:true,contract:'production-approved-phone-enrollment-v1',...result});
 }catch(error){
 const known=new Set(['PHONE_ENROLLMENT_EMAIL_REQUIRED','PHONE_ENROLLMENT_NOT_ELIGIBLE','PHONE_ENROLLMENT_STALE','PHONE_ENROLLMENT_RATE_LIMITED','PHONE_ENROLLMENT_IN_PROGRESS','PHONE_ENROLLMENT_REVIEW_REQUIRED','PHONE_ENROLLMENT_CONFLICT','PHONE_ENROLLMENT_INVALID','PHONE_ENROLLMENT_INVALID_CODE','PHONE_ENROLLMENT_PROVIDER_UNCERTAIN','PHONE_ENROLLMENT_PROVIDER_MISMATCH','PHONE_ENROLLMENT_SEND_FAILED']);
 const code=known.has(error?.message)?error.message:'PHONE_ENROLLMENT_UNAVAILABLE';
 return json({ok:false,code,message:'Mobile verification could not be completed. Email sign-in remains available.'},code==='PHONE_ENROLLMENT_EMAIL_REQUIRED'?403:code==='PHONE_ENROLLMENT_RATE_LIMITED'?429:409);
 }
}
export async function GET(request){return run(request,{action:'state'});}
export async function POST(request){
 if(Number(request.headers.get('content-length'))>2048)return json({code:'PHONE_ENROLLMENT_INVALID'},400);
 const raw=await request.text();if(raw.length>2048)return json({code:'PHONE_ENROLLMENT_INVALID'},400);
 let input;try{input=JSON.parse(raw);}catch{return json({code:'PHONE_ENROLLMENT_INVALID'},400);}
 return run(request,input);
}
