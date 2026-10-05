import {handleOwnerQueuePublication} from '../../../../../lib/certification-queue-publisher.js';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function POST(request) {
 try{return Response.json(await handleOwnerQueuePublication(request),{headers:{'cache-control':'no-store'}});}
 catch(error){return Response.json({ok:false,code:error?.code||'SUPERVISOR_PUBLICATION_UNAVAILABLE'},
  {status:error?.status||503,headers:{'cache-control':'no-store'}});}
}
