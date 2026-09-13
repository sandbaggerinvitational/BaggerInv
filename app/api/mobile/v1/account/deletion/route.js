import { NextResponse } from "next/server.js";
import { mobileApiErrorResult } from "../../../../../../lib/mobile-api-v1.js";
import { requireMobileNativeConfiguration } from "../../../../../../lib/mobile-native-admission.js";
import { readMobileNativeAuthJson } from "../../../../../../lib/mobile-native-auth.js";
import { deleteMobileAccount } from "../../../../../../lib/mobile-account-deletion.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    requireMobileNativeConfiguration("auth", { request });
    const input = await readMobileNativeAuthJson(request);
    const body = await deleteMobileAccount({ request, input });
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
  } catch (error) {
    const result = mobileApiErrorResult(error);
    return NextResponse.json(result.body, { status: result.status,
      headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
  }
}
