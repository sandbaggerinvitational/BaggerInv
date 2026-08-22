import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { runWarRoomCalculationParity } from "../../../../lib/war-room-calculation-parity-service.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const OPERATIONS = new Set(["capture", "championship", "matchup", "simulation", "optimizer", "team-intelligence", "calibration"]);

function safeInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function safeError(error) {
  return {
    code: clean(error?.code || "WAR_ROOM_CALCULATION_PARITY_FAILED"),
    message: clean(error?.message || "War Room calculation parity failed."),
    ...(error?.diagnostics ? { diagnostics: error.diagnostics } : {}),
  };
}

export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await authorizePreviewDirector({ request, allowBootstrap: true });
  if (director?.status !== "active") return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  const url = new URL(request.url);
  const operation = clean(url.searchParams.get("operation") || "capture").toLowerCase();
  if (!OPERATIONS.has(operation)) return NextResponse.json({ error: "Unsupported calculation parity operation." }, { status: 400 });
  const iterations = safeInteger(url.searchParams.get("iterations"), 10_000, 10_000, 100_000);
  const repeat = safeInteger(url.searchParams.get("repeat"), 2, 2, 3);
  const expectedSnapshotToken = clean(url.searchParams.get("snapshot"));
  const reportMode = /^(1|true|yes)$/i.test(clean(url.searchParams.get("report")));
  try {
    const result = await runWarRoomCalculationParity({
      operation,
      env: process.env,
      expectedSnapshotToken,
      iterations,
      repeat,
      timeoutMs: 60_000,
    });
    return NextResponse.json(result, {
      status: result.ok || reportMode ? 200 : 409,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("War Room calculation parity failed", safeError(error));
    return NextResponse.json({ ok: false, operation, ...safeError(error) }, {
      status: error?.status || 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
