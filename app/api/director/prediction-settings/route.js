import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  commitProductionPredictionSettings,
  copyProductionPredictionSettingsDraft,
  readProductionPredictionSettingsAuthoring,
  stageProductionPredictionSettings,
  validateProductionPredictionSettings,
} from "../../../../lib/production-prediction-settings-server.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };
const ACTIONS = new Set(["stage", "validate", "commit", "copy-previous"]);

function unavailable() {
  return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
}
async function authorize(request, { mutation = false } = {}) {
  if (clean(process.env.VERCEL_ENV).toLowerCase() !== "production") {
    return { response: unavailable() };
  }
  try {
    assertProductionCutoverActivation({ requiredPhase: "OBSERVATION" });
    if (mutation) assertProductionCutoverRequest(request, process.env, { requireOrigin: true });
  } catch {
    return { response: unavailable() };
  }
  const result = await authorizePreviewDirector({
    request,
    env: process.env,
    allowBootstrap: false,
  });
  if (result.status === "unavailable") {
    return { response: NextResponse.json({
      error: "Director verification is temporarily unavailable.",
      code: "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
    }, { status: 503, headers: { ...responseHeaders, "Retry-After": "1" } }) };
  }
  if (result.status !== "active" || result.source !== "production-director-entitlement") {
    return { response: NextResponse.json({
      error: "Active Tournament Director access is required.",
      code: "DIRECTOR_AUTHORIZATION_REQUIRED",
    }, { status: 403, headers: responseHeaders }) };
  }
  return { identity: result.identity };
}

function actor(identity = {}) {
  return {
    actorAuthUserId: clean(identity.authUserId),
    actorPlayerId: clean(identity.actor?.id || identity.player?.id),
    actorTournamentId: clean(identity.tournamentId || identity.session?.tournamentId),
  };
}

function safeFailure(error) {
  const candidate = clean(error?.code).toUpperCase();
  const code = /^(?:PRODUCTION_)?PREDICTION_SETTINGS_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "PREDICTION_SETTINGS_OPERATION_FAILED";
  const messages = {
    PREDICTION_SETTINGS_UNKNOWN_SETTING: "The proposed configuration contains an unsupported setting.",
    PREDICTION_SETTINGS_COMPLETE_SCHEMA_REQUIRED: "Review all 30 settings before validation.",
    PREDICTION_SETTINGS_PREDECESSOR_STALE: "Prediction Settings changed since this page loaded. Refresh and review again.",
    PREDICTION_SETTINGS_NO_CHANGES: "No Prediction Settings values changed.",
    PREDICTION_SETTINGS_IDEMPOTENCY_CONFLICT: "That operation identity was already used for a different change.",
    PREDICTION_SETTINGS_DRAFT_NOT_VALIDATED: "Validate the stored draft before saving a revision.",
    PREDICTION_SETTINGS_PROBABILITY_BOUNDS_REVERSED: "Minimum Win Probability cannot exceed Maximum Win Probability.",
    PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED: "Production Prediction Settings are now authored in this Director Console.",
  };
  return {
    error: messages[code] || error?.message || "The Prediction Settings operation did not complete.",
    code,
    issues: Array.isArray(error?.diagnostics?.issues) ? error.diagnostics.issues : [],
  };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const targetTournamentId = clean(request.nextUrl.searchParams.get("targetTournamentId"));
    const scoped = await withDataAuthorityRequestScope({
      label: "production-prediction-settings-authoring-read",
      source: "supabase-production-prediction-settings-authoring-v1",
    }, () => readProductionPredictionSettingsAuthoring({
      ...actor(access.identity),
      targetTournamentId,
    }));
    return NextResponse.json({
      ok: true,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, { headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) } });
  } catch (error) {
    console.error("Production Prediction Settings read failed", {
      code: clean(error?.code || "PREDICTION_SETTINGS_READ_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}

export async function POST(request) {
  const access = await authorize(request, { mutation: true });
  if (access.response) return access.response;
  let input;
  try { input = await request.json(); }
  catch {
    return NextResponse.json({
      error: "A JSON request body is required.",
      code: "PREDICTION_SETTINGS_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const action = clean(input?.action).toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({
      error: "Unsupported Prediction Settings action.",
      code: "PREDICTION_SETTINGS_ACTION_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const values = {
    ...actor(access.identity),
    targetTournamentId: input.targetTournamentId,
    sourceTournamentId: input.sourceTournamentId,
    expectedRevision: input.expectedRevision,
    operationRequestId: input.operationRequestId,
    draftId: input.draftId,
    settings: input.settings,
    reason: input.reason,
    confirmation: input.confirmation,
  };
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-prediction-settings-authoring-${action}`,
      source: "supabase-production-prediction-settings-authoring-v1",
    }, () => {
      if (action === "stage") return stageProductionPredictionSettings(values);
      if (action === "validate") return validateProductionPredictionSettings(values);
      if (action === "commit") return commitProductionPredictionSettings(values);
      return copyProductionPredictionSettingsDraft(values);
    });
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, { headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) } });
  } catch (error) {
    console.error("Production Prediction Settings mutation failed", {
      action,
      code: clean(error?.code || "PREDICTION_SETTINGS_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}
