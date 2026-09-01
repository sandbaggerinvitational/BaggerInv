import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  copyPreviousProductionGuideAsDraft,
  discardProductionGuideDraft,
  previewProductionGuideDraft,
  publishProductionGuideDraft,
  readProductionGuideAuthoring,
  stageProductionGuideDraft,
  validateProductionGuideDraft,
} from "../../../../lib/production-guide-authoring-server.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };
const ACTIONS = new Set(["stage", "validate", "preview", "publish", "discard", "copy-previous"]);

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
  const code = /^(?:PRODUCTION_)?GUIDE_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "GUIDE_OPERATION_FAILED";
  const messages = {
    GUIDE_PREDECESSOR_STALE: "The published Guide changed since this page loaded. Refresh and review again.",
    GUIDE_DRAFT_VERSION_STALE: "This Guide draft changed since this page loaded. Refresh and review again.",
    GUIDE_IDEMPOTENCY_CONFLICT: "That operation identity was already used for a different Guide change.",
    GUIDE_VALIDATION_FAILED: "Tournament Guide content needs review before it can be published.",
    GUIDE_DRAFT_NOT_VALIDATED: "Validate the stored Guide draft before publishing it.",
    GUIDE_CONTENT_FINGERPRINT_STALE: "Guide content changed after validation. Validate the draft again.",
    GUIDE_VALIDATION_STALE: "Tournament setup or Guide content changed after validation. Validate the draft again.",
    GUIDE_DRAFT_FINGERPRINT_MISMATCH: "The stored Guide draft failed its integrity check. Refresh before continuing.",
    GUIDE_SECTION_SLUG_DUPLICATE: "Each Guide Section needs a unique route slug.",
    GUIDE_LOGICAL_ID_DUPLICATE: "Each Guide item needs a unique stable identity.",
    GUIDE_STABLE_ID_DUPLICATE: "Each Guide item needs a unique stable identity.",
    GUIDE_ROUND_REFERENCE_INVALID: "A Guide item references a round that is not part of this tournament.",
    GUIDE_COURSE_REFERENCE_INVALID: "A Guide item references a course that is not part of this tournament.",
    GUIDE_RULE_SCORING_CONFLICT: "Guide rule copy conflicts with canonical scoring facts. Scoring was not changed.",
    GUIDE_URL_INVALID: "A Guide link is not a valid participant-safe URL.",
    GUIDE_ASSET_INVALID: "A Guide image reference must be an existing safe relative asset path or HTTP(S) URL.",
    GUIDE_EMAIL_INVALID: "An Important Contact email address is invalid.",
    GUIDE_UNSAFE_CONTENT: "Guide content cannot contain HTML, scripts, or control characters.",
    GUIDE_CONTENT_TOO_LARGE: "Tournament Guide content exceeds the bounded authoring limit.",
    GUIDE_COLLECTION_TOO_LARGE: "A Tournament Guide section contains too many items.",
    GUIDE_PRIVATE_CONTACT_PROHIBITED: "Private identity or enrollment contacts cannot be added to the participant Guide.",
    GUIDE_GOOGLE_AUTHORING_RETIRED: "Production Tournament Guides are now authored in this Director Console.",
  };
  const diagnostics = error?.diagnostics || {};
  const issues = [
    ...(Array.isArray(diagnostics.issues) ? diagnostics.issues : []),
    ...(Array.isArray(diagnostics.errors) ? diagnostics.errors : []),
  ];
  return {
    error: messages[code] || error?.message || "The Tournament Guide operation did not complete.",
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
      label: "production-guide-authoring-read",
      source: "supabase-production-guide-authoring-v1",
    }, () => readProductionGuideAuthoring({
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
    console.error("Production Tournament Guide read failed", {
      code: clean(error?.code || "GUIDE_READ_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}

export async function POST(request) {
  // Preview is deliberately POST-only as well: every draft-addressed operation
  // requires the same exact-origin and active Director boundary.
  const access = await authorize(request, { mutation: true });
  if (access.response) return access.response;
  let input;
  try { input = await request.json(); }
  catch {
    return NextResponse.json({
      error: "A JSON request body is required.",
      code: "GUIDE_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const action = clean(input?.action).toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({
      error: "Unsupported Tournament Guide action.",
      code: "GUIDE_ACTION_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const values = {
    ...actor(access.identity),
    targetTournamentId: input.targetTournamentId,
    sourceTournamentId: input.sourceTournamentId,
    expectedRevision: input.expectedRevision ?? input.expectedPublishedRevision,
    expectedRevisionId: input.expectedRevisionId ?? input.expectedPublishedRevisionId,
    expectedDraftVersion: input.expectedDraftVersion,
    operationRequestId: input.operationRequestId,
    draftId: input.draftId,
    content: input.content,
    contentFingerprint: input.contentFingerprint,
    reason: input.reason,
    confirmation: input.confirmation,
  };
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-guide-authoring-${action}`,
      source: "supabase-production-guide-authoring-v1",
    }, () => {
      if (action === "stage") return stageProductionGuideDraft(values);
      if (action === "validate") return validateProductionGuideDraft(values);
      if (action === "preview") return previewProductionGuideDraft(values);
      if (action === "publish") return publishProductionGuideDraft(values);
      if (action === "discard") return discardProductionGuideDraft(values);
      return copyPreviousProductionGuideAsDraft(values);
    });
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, { headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) } });
  } catch (error) {
    console.error("Production Tournament Guide mutation failed", {
      action,
      code: clean(error?.code || "GUIDE_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}
