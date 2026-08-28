import { NextResponse } from "next/server.js";
import { MobileApiError, mobileApiErrorResult } from "./mobile-api-v1.js";
import { resolveMobileBearerIdentity } from "./mobile-bearer-identity.js";

const MAX_JSON_BYTES = 16_384;

export async function readMobileScoringJson(request) {
  const contentType = String(request?.headers?.get?.("content-type") || "").toLowerCase();
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/.test(contentType)) {
    throw new MobileApiError("INVALID_SCORE_INPUT");
  }
  const declaredLength = Number(request?.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new MobileApiError("INVALID_SCORE_INPUT");
  }
  let value;
  try { value = await request.json(); }
  catch { throw new MobileApiError("INVALID_SCORE_INPUT"); }
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_JSON_BYTES) {
    throw new MobileApiError("INVALID_SCORE_INPUT");
  }
  return value;
}

export function mobileScoringMatchIdFromRequest(request) {
  let values;
  try { values = new URL(request.url).searchParams.getAll("matchId"); }
  catch { throw new MobileApiError("INVALID_SCORE_INPUT"); }
  if (values.length > 1) throw new MobileApiError("INVALID_SCORE_INPUT");
  return values[0] || "";
}

export async function mobileV1ScoringResponse(request, loader) {
  let result;
  try {
    const identity = await resolveMobileBearerIdentity({ request });
    result = await loader(identity);
  } catch (error) {
    result = mobileApiErrorResult(error);
  }
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, X-Bagger-Certification",
    "X-Content-Type-Options": "nosniff",
  };
  if (result.status === 401) headers["WWW-Authenticate"] = "Bearer";
  return NextResponse.json(result.body, { status: result.status, headers });
}
