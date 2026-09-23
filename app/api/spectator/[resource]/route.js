import { NextResponse } from 'next/server';
import { readFollowingResource } from '../../../../lib/spectator-read-server.js';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request,{params}) {
  const {resource}=await params;
  if(process.env.SPECTATOR_PWA_ENABLED!=='true'||!['tournament','odds','history','records'].includes(resource)||new URL(request.url).search) {
    return NextResponse.json({error:'Not found.'},{status:404,headers});
  }
  try {
    const result=await readFollowingResource(resource);
    if(Buffer.byteLength(JSON.stringify(result))>524288) throw new Error('RESPONSE_LIMIT');
    return NextResponse.json(result,{headers});
  } catch {
    return NextResponse.json({error:'Tournament information is temporarily unavailable.'},{status:503,headers});
  }
}
// Next supplies 405 for unsupported methods. No mutation handler, cookies, or auth admission.
