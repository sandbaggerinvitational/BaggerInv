import { NextResponse } from "next/server.js";
import { mobileApiErrorResult } from "./mobile-api-v1.js";
import { resolveMobileBearerIdentity } from "./mobile-bearer-identity.js";

function requestHasRevision(request, revision) {
  const supplied = String(request?.headers?.get?.("if-none-match") || "").trim();
  if (!supplied || !revision) return false;
  return supplied.split(",").some((value) => value.trim().replace(/^W\//, "").replace(/^\"|\"$/g, "") === revision);
}

export async function mobileV1ReadResponse(request, loader) {
  let result;
  try {
    const identity = await resolveMobileBearerIdentity({ request });
    result = await loader(identity);
  } catch (error) {
    result = mobileApiErrorResult(error);
  }
  const headers = { "Cache-Control": "private, no-cache", Vary: "Authorization" };
  if (result.status === 401) headers["WWW-Authenticate"] = "Bearer";
  if (result.revision) headers.ETag = `"${result.revision}"`;
  if (result.status === 200 && requestHasRevision(request, result.revision)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}
