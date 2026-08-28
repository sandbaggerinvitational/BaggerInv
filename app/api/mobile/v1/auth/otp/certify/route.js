import { NextResponse } from "next/server.js";
import { mobileApiErrorResult } from "../../../../../../../lib/mobile-api-v1.js";
import { certifyMobileNativeOtp, readMobileNativeAuthJson } from "../../../../../../../lib/mobile-native-auth.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let result;
  try {
    const input = await readMobileNativeAuthJson(request);
    result = await certifyMobileNativeOtp({ request, input });
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
