import { NextResponse } from "next/server";
import { loadParticipantRequestContext } from "../../../lib/participant-request-context.js";
import { runtimePerformanceReport } from "../../../lib/runtime-performance.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const context = await loadParticipantRequestContext(request, { route: "/api/preview-reliability" });
  const google = context.diagnostics.google;
  return NextResponse.json({
    normalizedWorkbookReachable: Boolean(context.tournamentData),
    requiredSheetsFound: Boolean(context.diagnostics.requiredSheetsFound),
    activeTournamentResolved: Boolean(context.tournamentData?.tournament),
    tournamentStatus: context.tournamentData?.tournament?.state || "unavailable",
    googleApiLatencyMs: google.lastLatencyMs,
    retryCount: google.retries,
    cacheBehavior: context.diagnostics.cacheBehavior,
    cacheHitRate: google.sheetCacheHitRate,
    tournamentModelCacheHitRate: context.diagnostics.modelCacheHitRate,
    cachedSheets: google.cachedSheets,
    googleApiRequests: google.apiRequests,
    googleRangesRequested: google.rangesRequested,
    tournamentModelTiming: context.diagnostics.lastTiming,
    slowestOperations: runtimePerformanceReport(),
    passportCookieDetected: context.passportCookiePresent,
    trustedDeviceLookupSuccessful: context.identity.status === "active",
    playerResolved: Boolean(context.identity.identity?.player),
  });
}
