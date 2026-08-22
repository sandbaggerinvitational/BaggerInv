import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { captureWarRoomInputParity, prepareWarRoomInput } from "../../../../lib/war-room-input-service.js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const clean = (value) => String(value ?? "").trim();

function compactValue(value) {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.length <= 12 ? value : { type: "array", length: value.length };
  return { type: "object", keys: Object.keys(value).sort().slice(0, 20), keyCount: Object.keys(value).length };
}

function compactParityResult(result, limit = 100) {
  const differences = (result?.parity?.differences || []).slice(0, limit).map((row) => ({
    classification: row.classification,
    disposition: row.disposition,
    reason: row.reason,
    path: row.path,
    expected: compactValue(row.expected),
    actual: compactValue(row.actual),
  }));
  return {
    contract: result.contract,
    capturedAt: result.capturedAt,
    selectedRuntimeSource: result.selectedRuntimeSource,
    calculationConsumersChanged: result.calculationConsumersChanged,
    snapshots: result.snapshots,
    parity: {
      pass: result.parity.pass,
      totalDifferences: result.parity.totalDifferences,
      unexplainedDifferences: result.parity.unexplainedDifferences,
      intentionalDifferences: result.parity.intentionalDifferences,
      counts: result.parity.counts,
      unexplainedCounts: result.parity.unexplainedCounts,
      intentionalReasonCounts: result.parity.intentionalReasonCounts,
      returnedDifferences: differences.length,
      differences,
    },
    settings: {
      pass: result.settings.pass,
      google: {
        revision: result.settings.google?.revision,
        contractVersion: result.settings.google?.contractVersion,
        effectiveFingerprint: result.settings.google?.effectiveFingerprint,
        freshness: result.settings.google?.freshness,
      },
      supabase: {
        revision: result.settings.supabase?.revision,
        contractVersion: result.settings.supabase?.contractVersion,
        effectiveFingerprint: result.settings.supabase?.effectiveFingerprint,
        freshness: result.settings.supabase?.freshness,
      },
    },
    zeroGoogleSupabaseShadow: result.zeroGoogleSupabaseShadow,
    performance: result.performance,
  };
}

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
      const compact = /^(1|true|yes)$/i.test(clean(url.searchParams.get("compact")));
      const limitValue = clean(url.searchParams.get("limit"));
      const requestedLimit = limitValue ? Number(limitValue) : Number.NaN;
      const limit = Number.isInteger(requestedLimit) ? Math.min(250, Math.max(0, requestedLimit)) : 100;
      const reportMode = compact && /^(1|true|yes)$/i.test(clean(url.searchParams.get("report")));
      return NextResponse.json({ ok: result.parity.pass, result: compact ? compactParityResult(result, limit) : result }, {
        // Compact report mode is a protected, read-only browser transport. Keep
        // the parity result in `ok`/`result.parity.pass`, while allowing the
        // report body to remain inspectable when the comparison finds diffs.
        status: result.parity.pass || reportMode ? 200 : 409,
        headers: { "cache-control": "no-store" },
      });
    }
    if (operation === "runtime") {
      const prepared = await prepareWarRoomInput({ scope, env: process.env });
      return NextResponse.json({
        ok: true,
        source: prepared.source,
        selection: prepared.selection,
        diagnostics: prepared.diagnostics,
        settings: {
          revision: prepared.bundle.predictionSettings.revision,
          contractVersion: prepared.bundle.predictionSettings.contractVersion,
          effectiveFingerprint: prepared.bundle.predictionSettings.effectiveFingerprint,
          freshness: prepared.bundle.predictionSettings.freshness,
        },
        snapshot: {
          bundleFingerprint: prepared.bundle.fingerprints.bundle,
          orderingFingerprint: prepared.bundle.fingerprints.sections.ordering,
        },
      }, { headers: { "cache-control": "no-store" } });
    }
    if (operation !== "google") return NextResponse.json({ error: "Use operation=compare, operation=runtime, or operation=google." }, { status: 400 });
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
