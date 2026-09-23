import {NextResponse} from 'next/server';
import {readPublicGolf} from '../../../../../lib/spectator-golf-server.js';
import {publicGolfRequest,PublicGolfNotFound} from '../../../../../lib/spectator-golf-service.js';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request,{params}) {
  const {path}=await params;
  if(process.env.SPECTATOR_PWA_ENABLED!=='true'||new URL(request.url).search||!publicGolfRequest(path))return NextResponse.json({error:'Not found.'},{status:404,headers});
  try{return NextResponse.json(await readPublicGolf(path),{headers});}
  catch(error){return NextResponse.json({error:error instanceof PublicGolfNotFound?'Not found.':'Tournament information is temporarily unavailable.'},{status:error instanceof PublicGolfNotFound?404:503,headers});}
}
// No POST, PUT, PATCH or DELETE. Next rejects unsupported methods with 405.
