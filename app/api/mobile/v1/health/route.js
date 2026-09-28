import { withOperationalRoute, recordOperationalError } from "../../../../../lib/operational-telemetry.js";
import { NextResponse } from "next/server.js";
import { mobileNativeHealthResult } from "../../../../../lib/mobile-native-admission.js";

export const dynamic = "force-dynamic";

async function telemetryGET(request) {
  const result = await mobileNativeHealthResult(request);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withOperationalRoute({ route: "/api/mobile/v1/health", domain: "TOURNAMENT_READ" }, telemetryGET);
