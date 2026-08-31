import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { productionCutoverPhaseAtLeast } from "../../../../lib/production-cutover-activation-contract.js";
import { drainFutureMatchGoogleCompatibility } from "../../../../lib/future-match-google-compatibility-worker.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const privateHeaders = { "Cache-Control": "private, no-store" };

function authorized(request) {
  // Reuse the already-held downstream scoring-mirror worker secret. This route
  // does not introduce another owner-held credential or expose its value.
  const configured = clean(process.env.SCORING_GOOGLE_OUTBOX_WORKER_SECRET);
  const supplied = clean(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

export function futureMatchGoogleCompatibilityWorkerEnabled(env = process.env) {
  return clean(env.VERCEL_ENV).toLowerCase() === "production" &&
    productionCutoverPhaseAtLeast(env, "WORKERS") &&
    clean(env.SCORING_AUTHORITY).toLowerCase() === "supabase" &&
    truthy(env.PRODUCTION_SUPABASE_WORKERS_ENABLED) &&
    truthy(env.PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED);
}

export async function GET() {
  return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, {
    status: 405,
    headers: { ...privateHeaders, Allow: "POST" },
  });
}

export async function POST(request) {
  if (!futureMatchGoogleCompatibilityWorkerEnabled()) {
    return NextResponse.json({ ok: false, code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_DISABLED" }, {
      status: 404,
      headers: privateHeaders,
    });
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_UNAUTHORIZED" }, {
      status: 401,
      headers: privateHeaders,
    });
  }
  const body = await request.json().catch(() => ({}));
  if (clean(body.action || "drain").toLowerCase() !== "drain") {
    return NextResponse.json({ ok: false, code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_ACTION_INVALID" }, {
      status: 400,
      headers: privateHeaders,
    });
  }
  const targetTournamentId = clean(body.targetTournamentId || body.target_tournament_id);
  if (!/^\d{4}$/.test(targetTournamentId) || Number(targetTournamentId) <= 2026) {
    return NextResponse.json({ ok: false, code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_TARGET_REQUIRED" }, {
      status: 400,
      headers: privateHeaders,
    });
  }
  const result = await drainFutureMatchGoogleCompatibility({
    maximum: Math.max(1, Math.min(Number(body.maximum) || 5, 25)),
    stopOnFailure: false,
    workerId: `production-future-match-google:${process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "worker"}`,
    targetTournamentId,
    env: process.env,
  });
  return NextResponse.json({
    ok: result.ok,
    delivered: result.delivered,
    failed: result.failed,
    durationMs: result.durationMs,
    deliveries: result.deliveries.map((delivery) => ({
      ok: delivery.ok,
      jobId: delivery.jobId,
      tournamentId: delivery.tournamentId,
      matchId: delivery.matchId,
      idempotent: delivery.idempotent,
      errorCode: delivery.errorCode,
      errorStage: delivery.errorStage,
    })),
  }, { status: result.ok ? 200 : 503, headers: privateHeaders });
}
