// Retired public worker ingress. No signature/cookie/header can execute work.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(){return Response.json({ok:false,code:'SUPERVISOR_TRANSPORT_RETIRED'},
 {status:403,headers:{'cache-control':'no-store'}});}
