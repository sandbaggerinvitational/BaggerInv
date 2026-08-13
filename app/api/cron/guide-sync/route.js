import { NextResponse } from "next/server";

import { assertGuideSyncEnvironment, guideWorkerAuthorized } from "../../../../lib/guide-read-source.js";
import { synchronizeGuideContent } from "../../../../lib/guide-sync-service.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const unavailable = () => NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return unavailable();
  try { assertGuideSyncEnvironment({ triggerType: "SCHEDULED" }); }
  catch { return unavailable(); }
  if (!guideWorkerAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "GUIDE_WORKER_UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const result = await synchronizeGuideContent({ triggerType: "SCHEDULED", requestedBy: "preview-guide-scheduler" });
    return NextResponse.json(result, {
      status: result.ok ? 200 : result.failureCategory === "VALIDATION" ? 422 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({
      ok: false,
      code: "GUIDE_SYNC_FAILED",
      message: "Guide synchronization did not complete.",
      lastKnownGoodPreserved: true,
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
