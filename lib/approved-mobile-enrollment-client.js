// Presentation client only. The server selects identity, phone and approval authority.
const endpoint = '/api/participant/auth/phone-enrollment';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mask = /^[•*\s]+[0-9]{4}$/;
export function createApprovedMobileEnrollmentClient({fetchImpl=fetch,onChange=()=>{},now=Date.now}={}) {
 let state={phase:'loading',busy:false,maskedPhone:'',message:'',challengeId:null,approvalRevision:null,expiresAt:null,resendAt:0};
 let active=false;
 const publish=patch=>{state={...state,...patch};onChange({...state});};
 const fail=(code)=>{
  if(code==='PHONE_ENROLLMENT_EMAIL_REQUIRED')publish({phase:'email',message:'Sign out from Player, then sign in with Email to verify your approved mobile.'});
  else if(code==='PHONE_ENROLLMENT_INVALID_CODE')publish({message:'That code is invalid or expired. Check the code and try again.'});
  else publish({phase:'blocked',message:'Mobile verification could not be completed. Do not request another code. Email sign-in remains available; contact the Tournament Director.'});
 };
 async function request(action,token){
  if(active)return false;
  if(action==='begin'&&state.phase!=='eligible')return false;
  if(['verify','resend'].includes(action)&&state.phase!=='code')return false;
  if(action==='verify'&&!/^[0-9]{6}$/.test(token||''))return false;
  if(['verify','resend'].includes(action)&&now()>=state.expiresAt){publish({phase:'blocked',message:'This verification has expired. Email sign-in remains available. Contact the Tournament Director before starting again.'});return false;}
  if(action==='resend'&&now()<state.resendAt)return false;
  active=true;publish({busy:true,message:''});
  try{
   let body;
   if(action==='begin')body={action,approvalRevision:state.approvalRevision};
   if(action==='verify')body={action,challengeId:state.challengeId,token};
   if(action==='resend')body={action,approvalRevision:state.approvalRevision,challengeId:state.challengeId};
   const response=await fetchImpl(endpoint,{method:action==='state'?'GET':'POST',cache:'no-store',credentials:'same-origin',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
   const result=await response.json();
   if(!response.ok||result.ok!==true){fail(result.code);return false;}
   if(result.contract!=='production-approved-phone-enrollment-v1'||!mask.test(result.maskedPhone||'')||!Number.isSafeInteger(result.approvalRevision)||result.approvalRevision<1)throw Error('INVALID_RESPONSE');
   const details={maskedPhone:result.maskedPhone,approvalRevision:result.approvalRevision};
   if(result.status==='VERIFIED'){
    if(action==='verify'&&(result.sameAuthUser!==true||result.challengeId!==state.challengeId))throw Error('INVALID_VERIFICATION');
    publish({...details,phase:'verified',challengeId:null,message:'Your approved mobile is verified. You can now use Text to sign in to this same player account.'});return true;
   }
   if(action==='state'&&result.status==='ELIGIBLE'){publish({...details,phase:'eligible'});return true;}
   const expiry=Date.parse(result.expiresAt);
   if(!['begin','resend'].includes(action)||result.status!=='SENT'||!uuid.test(result.challengeId||'')||!Number.isFinite(expiry)||expiry<=now()||expiry>now()+600000||result.resendAfterSeconds!==60)throw Error('INVALID_SEND');
   if(action==='resend'&&(result.challengeId!==state.challengeId||expiry!==state.expiresAt||result.approvalRevision!==state.approvalRevision))throw Error('INVALID_RESEND');
   publish({...details,phase:'code',challengeId:result.challengeId,expiresAt:expiry,resendAt:now()+60000,message:'Enter the code sent to your approved mobile.'});return true;
  }catch{fail('UNCONFIRMED');return false;}
  finally{active=false;publish({busy:false});}
 }
 return {read:()=>({...state}),load:()=>request('state'),begin:()=>request('begin'),verify:token=>request('verify',token),resend:()=>request('resend')};
}
