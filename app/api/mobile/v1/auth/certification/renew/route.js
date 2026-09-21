import {NextResponse} from 'next/server.js';
import {mobileApiErrorResult} from '../../../../../../../lib/mobile-api-v1.js';
import {requireMobileNativeConfiguration} from '../../../../../../../lib/mobile-native-admission.js';
import {renewMobileNativeCertification} from '../../../../../../../lib/mobile-native-certification-renewal.js';
export const dynamic='force-dynamic';
export async function POST(request) {
 let result;
 try {
  requireMobileNativeConfiguration('certification',{request});
  if((await request.text()).trim()) throw new Error('Renewal accepts no client identity claims');
  result=await renewMobileNativeCertification({request});
 } catch(error) {result=mobileApiErrorResult(error);}
 return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization, X-Bagger-Certification','X-Content-Type-Options':'nosniff'}});
}
