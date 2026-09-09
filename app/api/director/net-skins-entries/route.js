import { NextResponse } from "next/server";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { assertProductionCutoverActivation, assertProductionCutoverRequest } from "../../../../lib/production-cutover-activation-contract.js";
import { productionNetSkinsEntries } from "../../../../lib/production-tournament-setup-server.js";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const reply = (value, status=200) => NextResponse.json(value,{status,headers});
async function handle(request, mutation) {
  if (process.env.VERCEL_ENV !== "production") return reply({error:"Not found."},404);
  try {
    assertProductionCutoverActivation({requiredPhase:"OBSERVATION"});
    if(mutation) assertProductionCutoverRequest(request,process.env,{requireOrigin:true});
  } catch { return reply({error:"Not found."},404); }
  const access = await authorizePreviewDirector({request,env:process.env,allowBootstrap:false});
  if(access.status !== "active" || access.source !== "production-director-entitlement")
    return reply({error:"Active Tournament Director access is required."},access.status==="unavailable"?503:403);
  let body = null;
  if(mutation) { try { body=await request.json(); } catch { return reply({error:"A JSON body is required."},400); }
    if(!body || typeof body!=="object" || Array.isArray(body)) return reply({error:"An entry revision is required."},400);
  }
  try {
    const identity=access.identity;
    const data=await productionNetSkinsEntries({actorAuthUserId:identity.authUserId,
      actorPlayerId:identity.actor?.id||identity.player?.id},body);
    return reply({ok:true,data});
  } catch(error) {
    const code=/^TOURNAMENT_SETUP_[A-Z0-9_]+$/.test(error?.code||"")?error.code:"TOURNAMENT_SETUP_OPERATION_FAILED";
    return reply({error:`Entries were not saved. Refresh and review the current Round (${code}).`,code},error.status||503);
  }
}
export async function GET(request){return handle(request,false);}
export async function POST(request){return handle(request,true);}
