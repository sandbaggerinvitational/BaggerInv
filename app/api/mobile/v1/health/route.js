import { NextResponse } from "next/server.js";
import { mobileHealthResult } from "../../../../../lib/mobile-api-v1.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = mobileHealthResult();
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
