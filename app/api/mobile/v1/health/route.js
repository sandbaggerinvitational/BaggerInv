import { NextResponse } from "next/server.js";
import { mobileNativeHealthResult } from "../../../../../lib/mobile-native-admission.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const result = await mobileNativeHealthResult(request);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
