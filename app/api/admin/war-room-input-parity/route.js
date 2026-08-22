import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { captureWarRoomInputParity, prepareWarRoomInput } from "../../../../lib/war-room-input-service.js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const clean = (value) => String(value ?? "").trim();

function safeError(error) {
  return {
    code: clean(error?.code || "WAR_ROOM_INPUT_DIAGNOSTIC_FAILED"),
    message: clean(error?.message || "War Room input diagnostics failed."),
    ...(error?.diagnostics ? { diagnostics: error.diagnostics } : {}),
  };
}

export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await authorizePreviewDirector({ request, allowBootstrap: true });
  if (director?.status !== "active") return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  const url = new URL(request.url);
  const operation = clean(url.searchParams.get("operation") || "compare").toLowerCase();
  const scope = clean(url.searchParams.get("scope") || "full-diagnostic");
  try {
    if (operation === "compare") {
      const result = await captureWarRoomInputParity({ scope, env: process.env, timeoutMs: 40_000 });
      return NextResponse.json({ ok: result.parity.pass, result }, {
        status: result.parity.pass ? 200 : 409,
        headers: { "cache-control": "no-store" },
      });
    }
    if (operation !== "google") return NextResponse.json({ error: "Use operation=compare or operation=google." }, { status: 400 });
    const prepared = await prepareWarRoomInput({ scope, requestedSource: "google", env: process.env });
    return NextResponse.json({
      ok: true,
      source: prepared.source,
      selection: prepared.selection,
      diagnostics: prepared.diagnostics,
      snapshot: {
        bundleFingerprint: prepared.bundle.fingerprints.bundle,
        settingsFingerprint: prepared.bundle.predictionSettings.effectiveFingerprint,
        orderingFingerprint: prepared.bundle.fingerprints.sections.ordering,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("War Room input diagnostics failed", safeError(error));
    return NextResponse.json({ ok: false, ...safeError(error) }, { status: error?.status || 503 });
  }
}
