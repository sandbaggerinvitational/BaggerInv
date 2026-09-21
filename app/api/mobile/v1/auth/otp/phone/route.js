import {NextResponse} from 'next/server.js';
import {createParticipantPhoneLoginHandler} from '../../../../../../../lib/participant-phone-login-handler.js';
import {readMobileNativeAuthJson} from '../../../../../../../lib/mobile-native-auth.js';
import {mobileApiErrorResult} from '../../../../../../../lib/mobile-api-v1.js';
export const dynamic='force-dynamic';
export async function POST(request){try{
 const input=await readMobileNativeAuthJson(request);
 if(!['verify','resend','cancel'].includes(input?.action))return NextResponse.json({error:'Invalid request.'},{status:400,headers:{'Cache-Control':'no-store'}});
 return await createParticipantPhoneLoginHandler({native:true}).POST(request,input);
}catch(error){const r=mobileApiErrorResult(error);return NextResponse.json(r.body,{status:r.status,headers:{'Cache-Control':'private, no-store'}});}}
