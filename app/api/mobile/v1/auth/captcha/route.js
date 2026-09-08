import { NextResponse } from "next/server.js";
import { mobileApiErrorResult } from "../../../../../../lib/mobile-api-v1.js";
import { mobileNativeCaptchaPage } from "../../../../../../lib/mobile-native-auth.js";
import { requireMobileNativeCapability } from "../../../../../../lib/mobile-native-admission.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireMobileNativeCapability("auth", { request });
    const result = mobileNativeCaptchaPage();
    return new Response(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    const result = mobileApiErrorResult(error);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
