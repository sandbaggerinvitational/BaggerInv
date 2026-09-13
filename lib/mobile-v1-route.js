import { requireReviewerRead } from './mobile-reviewer-identity.js';
import { NextResponse } from "next/server.js";
import { mobileApiErrorResult } from "./mobile-api-v1.js";
import { resolveMobileBearerIdentity } from "./mobile-bearer-identity.js";
import { recheckMobileNativeIdentity } from "./mobile-native-admission.js";

function requestHasRevision(request, revision) {
  const supplied = String(request?.headers?.get?.("if-none-match") || "").trim();
  if (!supplied || !revision) return false;
  return supplied.split(",").some((value) => value.trim().replace(/^W\//, "").replace(/^\"|\"$/g, "") === revision);
}

export async function mobileV1ReadResponse(request, loader) {
  let result;
  let historicalFixture = null;
  try {
    const identity = await resolveMobileBearerIdentity({ request });
    if(identity.kind === "observer") {
      const parts=new URL(request.url).pathname.replace(/^\/api\/mobile\/v1\//, "").split("/");
      const surface=parts[0]==="matches" && parts.length===2 ? "match-detail" : parts[0];
      if(parts.length>1 && surface!=="match-detail" && !(surface==="history" && parts.length===2 && /^\d{4}$/.test(parts[1])))
        throw new Error("Review route outside allowlist");
      if (surface === "match-detail") {
        const query = new URL(request.url).searchParams;
        historicalFixture = {tournamentId:query.get("historicalTournament"),year:Number(query.get("historicalYear")),
          revisionId:query.get("historicalRevision"),matchId:decodeURIComponent(parts[1]),bindingRevision:Number(query.get("fixtureRevision"))};
      }
      requireReviewerRead(identity.context,{historicalFixture,method:request.method,surface,matchId:surface==="match-detail" ? decodeURIComponent(parts[1]) : null});
    }
    result = await loader(historicalFixture ? {...identity,requestedHistoricalFixture:historicalFixture} : identity);
    await recheckMobileNativeIdentity(identity, "reads");
  } catch (error) {
    result = mobileApiErrorResult(error);
  }
  const headers = {
    "Cache-Control": "private, no-cache",
    Vary: "Authorization, X-Bagger-Certification",
  };
  if (result.status === 401) headers["WWW-Authenticate"] = "Bearer";
  if (result.revision) headers.ETag = `"${result.revision}"`;
  if (result.status === 200 && requestHasRevision(request, result.revision)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}
