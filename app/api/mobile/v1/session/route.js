import { NextResponse } from "next/server.js";
import { mobileApiErrorResult, mobileSessionResult } from "../../../../../lib/mobile-api-v1.js";
import { resolveMobileBearerIdentity } from "../../../../../lib/mobile-bearer-identity.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  let result;
  try {
    const identity = await resolveMobileBearerIdentity({ request });
    result = mobileSessionResult(identity);
  } catch (error) {
    result = mobileApiErrorResult(error);
  }
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Authorization",
  };
  if (result.status === 401) headers["WWW-Authenticate"] = "Bearer";
  return NextResponse.json(result.body, { status: result.status, headers });
}
