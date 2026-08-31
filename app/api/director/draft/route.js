import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  commitProductionDraftRevision,
  copyProductionDraftSetup,
  readProductionDraftAuthoring,
  stageProductionDraftRevision,
  validateProductionDraftRevision,
} from "../../../../lib/production-draft-authoring-server.js";
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
  const code = /^(?:PRODUCTION_)?DRAFT_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "DRAFT_OPERATION_FAILED";
  const messages = {
    DRAFT_CORRECTION_REQUIRED: "This completed Draft is read-only. A separate historical correction workflow is required.",
    DRAFT_HISTORICAL_FROZEN: "This completed Draft is read-only.",
    DRAFT_PREDECESSOR_STALE: "The Draft changed since this page loaded. Refresh and review again.",
    DRAFT_NO_CHANGES: "No Draft Setup or pick values changed.",
    DRAFT_IDEMPOTENCY_CONFLICT: "That operation identity was already used for a different Draft change.",
    DRAFT_DRAFT_NOT_VALIDATED: "Validate the stored Draft revision before saving it.",
    DRAFT_PLAYER_DUPLICATE: "A Player may be selected only once in a Draft.",
    DRAFT_PLAYER_NOT_IN_TOURNAMENT: "A selected Player is not eligible for this tournament.",
    DRAFT_PICK_ROSTER_TEAM_MISMATCH: "A selected Player does not belong to the chosen tournament Team.",
    DRAFT_COMPLETED_PICK_MISSING: "A completed Draft must contain every configured selection.",
    DRAFT_GOOGLE_AUTHORING_RETIRED: "Production Drafts are now authored in this Director Console.",
    DRAFT_VALIDATION_FAILED: "Draft values need review before they can be saved.",
  };
  const diagnostics = error?.diagnostics || {};
  const issues = [
    ...(Array.isArray(diagnostics.issues) ? diagnostics.issues : []),
    ...(Array.isArray(diagnostics.errors) ? diagnostics.errors : []),
  ];
  return {
    error: messages[code] || error?.message || "The Draft operation did not complete.",
    code,
    issues,
  };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const targetTournamentId = clean(request.nextUrl.searchParams.get("targetTournamentId"));
    const scoped = await withDataAuthorityRequestScope({
      label: "production-draft-authoring-read",
      source: "supabase-production-draft-authoring-v1",
    }, () => readProductionDraftAuthoring({
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
    console.error("Production Draft read failed", {
      code: clean(error?.code || "DRAFT_READ_FAILED"),
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
      code: "DRAFT_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const action = clean(input?.action).toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({
      error: "Unsupported Draft action.",
      code: "DRAFT_ACTION_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const values = {
    ...actor(access.identity),
    targetTournamentId: input.targetTournamentId,
    sourceTournamentId: input.sourceTournamentId,
    expectedRevision: input.expectedRevision,
    operationRequestId: input.operationRequestId,
    draftId: input.draftId,
    configuration: input.configuration,
    picks: input.picks,
    reason: input.reason,
    confirmation: input.confirmation,
  };
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-draft-authoring-${action}`,
      source: "supabase-production-draft-authoring-v1",
    }, () => {
      if (action === "stage") return stageProductionDraftRevision(values);
      if (action === "validate") return validateProductionDraftRevision(values);
      if (action === "commit") return commitProductionDraftRevision(values);
      return copyProductionDraftSetup(values);
    });
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, { headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) } });
  } catch (error) {
    console.error("Production Draft mutation failed", {
      action,
      code: clean(error?.code || "DRAFT_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}
