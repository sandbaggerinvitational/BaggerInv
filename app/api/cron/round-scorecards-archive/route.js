import { NextResponse } from "next/server";
import { drainScorecardArchiveJobs, reconcileRoundScorecardsArchives } from "../../../../lib/scorecard-archive-worker.js";
import { roundScorecardsArchiveEnvironment } from "../../../../lib/round-scorecards-archive.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clean = (value) => String(value ?? "").trim();

function authorized(request) {
  const configured = clean(process.env.ROUND_SCORECARDS_ARCHIVE_WORKER_SECRET);
  const supplied = clean(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  return configured.length >= 32 && supplied.length === configured.length && supplied === configured;
}

async function archiveOperation(request) {
  const gate = roundScorecardsArchiveEnvironment();
  if (!gate.enabled) return NextResponse.json({ ok: false, code: gate.reason }, { status: gate.productionBlocked ? 403 : 404 });
  if (!authorized(request)) return NextResponse.json({ ok: false, code: "ARCHIVE_WORKER_UNAUTHORIZED" }, { status: 401 });
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  if (body.action === "reconcile") {
    const result = await reconcileRoundScorecardsArchives({ tournamentId: body.tournamentId || "2026" });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  }
  const result = await drainScorecardArchiveJobs({ maximum: 5, stopOnFailure: false });
  return NextResponse.json({
    ok: result.ok,
    delivered: result.delivered,
    failed: result.failed,
    durationMs: result.durationMs,
    deliveries: result.deliveries.map((delivery) => ({
      ok: delivery.ok,
      jobId: delivery.jobId,
      matchId: delivery.matchId,
      matchRevision: delivery.matchRevision,
      eventType: delivery.eventType,
      rowCount: delivery.rowCount,
      errorCode: delivery.errorCode,
      errorStage: delivery.errorStage,
    })),
  }, { status: result.ok ? 200 : 503 });
}

export async function GET(request) {
  return archiveOperation(request);
}

export async function POST(request) {
  return archiveOperation(request);
}
