import {NextResponse} from 'next/server';
import {isSmsHookAcceptanceRequest,acceptSmsHookWithoutDelivery} from '../../../../../lib/production-sms-hook-acceptance.js';
import {approvedSmsHook} from '../../../../../lib/production-approved-sms-hook.js';
import {assertProductionCutoverRequest} from '../../../../../lib/production-cutover-activation-contract.js';
import {participantIdentityRpc} from '../../../../../lib/participant-identity-supabase.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request){
 try{
 assertProductionCutoverRequest(request,process.env,{requireOrigin:false});
 // Bound the stream before buffering the sensitive provider payload.
 if(Number(request.headers.get('content-length'))>32768)throw Error('SMS_HOOK_INVALID');
 const reader=request.body?.getReader();if(!reader)throw Error('SMS_HOOK_INVALID');
 const chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>32768)throw Error('SMS_HOOK_INVALID');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const raw=Buffer.concat(chunks).toString('utf8');
 if(isSmsHookAcceptanceRequest(request.headers)){
 const evidence=await acceptSmsHookWithoutDelivery({raw,headers:request.headers},{authorizeFixture:async input=>(await participantIdentityRpc('accept_production_phone_hook_fixture_v1',{input},{timeoutMs:2500,
 resolveProductionIdentityRpc:async()=>({functionName:'accept_production_phone_hook_fixture_v1',body:{input}})})).payload});
 return NextResponse.json(evidence,{headers});
 }

 await approvedSmsHook({raw,headers:request.headers},{rpc:async input=>(await participantIdentityRpc('production_participant_phone_dispatch_v1',{input},{timeoutMs:1000,
 // This fixed-2026 RPC checks the canonical runtime inside its transaction.
 // Avoid a second remote discovery call inside Supabase's five-second hook.
 resolveProductionIdentityRpc:async()=>({functionName:'production_participant_phone_dispatch_v1',body:{input}})})).payload});
 return NextResponse.json({},{headers});
 }catch{
 // Never include error, raw hook input, phone, provider response, OTP or credentials.
 return NextResponse.json({error:{http_code:403,message:'SMS delivery not authorized or not confirmed.'}},{status:403,headers});
 }
}
