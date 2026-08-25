import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { productionCutoverPhaseAtLeast } from "../../../../lib/production-cutover-activation-contract.js";
import { drainGoogleOutbox } from "../../../../lib/scoring-google-outbox.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const privateHeaders = { "Cache-Control": "private, no-store" };

function authorized(request) {
  const configured = clean(process.env.SCORING_GOOGLE_OUTBOX_WORKER_SECRET);
  const supplied = clean(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

function workerEnabled(env = process.env) {
  return productionCutoverPhaseAtLeast(env, "WORKERS") &&
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
  if (!workerEnabled()) {
    return NextResponse.json({ ok: false, code: "SCORING_GOOGLE_OUTBOX_DISABLED" }, {
      status: 404,
      headers: privateHeaders,
    });
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, code: "SCORING_GOOGLE_OUTBOX_UNAUTHORIZED" }, {
      status: 401,
      headers: privateHeaders,
    });
  }
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action || "drain").toLowerCase();
  if (action === "inspect") {
    const { productionScoringOperationsRpc } = await import("../../../../lib/production-scoring-operations-server.js");
    const result = await productionScoringOperationsRpc("inspect_production_scoring_workers");
    return NextResponse.json(result.payload, { headers: privateHeaders });
  }
  if (action !== "drain") {
    return NextResponse.json({ ok: false, code: "SCORING_GOOGLE_OUTBOX_ACTION_INVALID" }, {
      status: 400,
      headers: privateHeaders,
    });
  }
  const result = await drainGoogleOutbox({
    maximum: Math.max(1, Math.min(Number(body.maximum) || 5, 25)),
    stopOnFailure: true,
    workerId: `production-outbox:${process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "worker"}`,
    env: process.env,
  });
  return NextResponse.json({
    ok: result.ok,
    delivered: result.delivered,
    failed: result.failed,
    durationMs: result.durationMs,
    deliveries: result.deliveries.map((delivery) => ({
      ok: delivery.ok,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      matchId: delivery.matchId,
      matchRevision: delivery.matchRevision,
      errorCode: delivery.errorCode,
      errorStage: delivery.errorStage,
    })),
  }, { status: result.ok ? 200 : 503, headers: privateHeaders });
}
