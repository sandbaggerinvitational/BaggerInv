import { NextResponse } from "next/server";
import { readOddsInputBundle } from "../../../../lib/championship-odds-supabase.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  buildPredictionSettingsProjection,
  PREDICTION_SETTINGS_SOURCE_TAB,
} from "../../../../lib/prediction-settings-contract.js";
import {
  compareStoredPredictionSettings,
  importPredictionSettingsProjection,
  predictionSettingsFreshness,
  predictionSettingsProjectionFromView,
  readPredictionSettingsProjection,
} from "../../../../lib/prediction-settings-supabase.js";
import { readWorkbookSheetsByName } from "../../../../lib/google-sheets-write.js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const clean = (value) => String(value ?? "").trim();

async function directorFor(request) {
  const result = await authorizePreviewDirector({ request, allowBootstrap: true });
  return result?.status === "active" ? result : null;
}

function safeError(error) {
  const shadow = error?.shadowDiagnostics && typeof error.shadowDiagnostics === "object"
    ? {
      status: Number(error?.status || 0),
      path: clean(error.shadowDiagnostics.path),
      code: clean(error.shadowDiagnostics.code),
      message: clean(error.shadowDiagnostics.message),
      details: clean(error.shadowDiagnostics.details),
      hint: clean(error.shadowDiagnostics.hint),
      durationMs: Number(error.shadowDiagnostics.durationMs || 0),
    }
    : null;
  return {
    code: clean(error?.code || shadow?.code || "PREDICTION_SETTINGS_OPERATION_FAILED"),
    message: clean(error?.message || "Prediction Settings operation failed."),
    ...(error?.diagnostics ? { diagnostics: error.diagnostics } : shadow ? { diagnostics: shadow } : {}),
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function settingsFormResponse(payload) {
  const summary = JSON.stringify(payload, null, 2);
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Preview Prediction Settings</title></head><body><main><h1>Preview Prediction Settings</h1><p>Google remains the Director authoring authority. Synchronization reads only the Prediction Settings tab and creates an immutable Supabase projection revision when the source changes.</p><form method="post" action="/api/odds/prediction-settings"><input type="hidden" name="action" value="synchronize"><button type="submit">Synchronize Prediction Settings</button></form><h2>Current diagnostics</h2><pre>${escapeHtml(summary)}</pre></main></body></html>`, {
    headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" },
  });
}

async function sourceProjectionFor(director) {
  const tournamentId = clean(director.identity?.tournamentId || "2026");
  const bundle = await readOddsInputBundle(tournamentId);
  if (!bundle.payload?.ok) throw Object.assign(new Error("Preview tournament scope is unavailable."), { code: bundle.payload?.code || "ODDS_INPUT_CONFIGURATION_REQUIRED" });
  const tournament = bundle.payload.data?.current_state?.tournament || {};
  const workbookId = clean(process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const workbook = await readWorkbookSheetsByName([PREDICTION_SETTINGS_SOURCE_TAB]);
  const rows = (workbook[PREDICTION_SETTINGS_SOURCE_TAB]?.records || []).map(({ record }) => record);
  if (!rows.length) throw Object.assign(new Error("Prediction Settings are unavailable."), { code: "PREDICTION_SETTINGS_REQUIRED" });
  return buildPredictionSettingsProjection({
    tournamentId: clean(tournament.tournament_id || tournamentId),
    tournamentYear: Number(tournament.tournament_year || tournamentId),
    sourceWorkbookId: workbookId,
    rows,
    requestedBy: clean(director.identity?.player?.id || "Director"),
  });
}

async function storedProjection(tournamentId) {
  const result = await readPredictionSettingsProjection(tournamentId);
  return result.payload?.ok ? predictionSettingsProjectionFromView(result.payload.data) : null;
}

export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  const tournamentId = clean(director.identity?.tournamentId || "2026");
  const verifySource = new URL(request.url).searchParams.get("verify") === "source";
  try {
    const stored = await storedProjection(tournamentId);
    let source = null;
    let sourceError = null;
    if (verifySource) {
      try { source = await sourceProjectionFor(director); }
      catch (error) { sourceError = safeError(error); }
    }
    const freshness = predictionSettingsFreshness({ stored, source, sourceError });
    const parity = stored && source ? compareStoredPredictionSettings(source, stored) : null;
    const payload = {
      ok: Boolean(stored),
      sourceAuthority: "GOOGLE",
      projectionDatastore: "SUPABASE",
      tournamentId,
      projection: stored,
      freshness,
      parity,
      sourceVerification: verifySource ? (sourceError ? { ok: false, ...sourceError } : { ok: true, sourceFingerprint: source.source_fingerprint }) : { ok: false, status: "NOT_REQUESTED" },
      googleRead: verifySource ? { tabs: [PREDICTION_SETTINGS_SOURCE_TAB], broadPredictionLoaderUsed: false } : { tabs: [], broadPredictionLoaderUsed: false },
    };
    if (new URL(request.url).searchParams.get("ui") === "1") return settingsFormResponse(payload);
    return NextResponse.json(payload, { status: stored ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ ok: false, ...safeError(error) }, { status: error?.status || 503 });
  }
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  try {
    const input = clean(request.headers.get("content-type")).includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const { action } = input;
    if (action !== "synchronize") return NextResponse.json({ error: "Unsupported Prediction Settings action." }, { status: 400 });
    const source = await sourceProjectionFor(director);
    const imported = await importPredictionSettingsProjection(source);
    if (!imported.payload?.ok) throw Object.assign(new Error("Prediction Settings projection could not be synchronized."), { code: imported.payload?.code || "PREDICTION_SETTINGS_SYNC_FAILED" });
    const stored = await storedProjection(source.tournament_id);
    if (!stored) throw Object.assign(new Error("Prediction Settings projection could not be read back."), { code: "PREDICTION_SETTINGS_READBACK_FAILED" });
    const parity = compareStoredPredictionSettings(source, stored);
    if (!parity.pass) throw Object.assign(new Error("Prediction Settings read-back parity failed."), { code: "PREDICTION_SETTINGS_READBACK_PARITY_FAILED", diagnostics: parity });
    return NextResponse.json({
      ok: true,
      action,
      changed: Boolean(imported.payload.changed),
      duplicate: Boolean(imported.payload.duplicate),
      revision: Number(imported.payload.configuration_revision || stored.revision),
      sourceAuthority: "GOOGLE",
      projectionDatastore: "SUPABASE",
      sourceFingerprint: source.source_fingerprint,
      rawSettingsFingerprint: source.settings_fingerprint,
      effectiveSettingsFingerprint: source.effective_settings_fingerprint,
      contractVersion: source.settings_contract_version,
      validation: source.validation_diagnostics,
      parity,
      freshness: { status: "CURRENT", reason: "SYNCHRONIZED_SOURCE_FINGERPRINT" },
      googleRead: { tabs: [PREDICTION_SETTINGS_SOURCE_TAB], broadPredictionLoaderUsed: false },
    });
  } catch (error) {
    console.error("Prediction Settings synchronization failed", safeError(error));
    return NextResponse.json({ error: "Prediction Settings could not be synchronized.", ...safeError(error) }, { status: error?.status || 503 });
  }
}
