import { NextResponse } from "next/server.js";
import { mobileApiErrorResult } from "../../../../../../lib/mobile-api-v1.js";
import { mobileNativeCaptchaPage } from "../../../../../../lib/mobile-native-auth.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
