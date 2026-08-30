import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  mutateProductionPlayersAccess,
  readProductionPlayersAccess,
} from "../../../../lib/production-player-access-server.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };
const ACTIONS = new Set([
  "approve-email",
  "approve-phone",
  "revoke-phone",
  "set-login-preference",
  "suspend-access",
  "resume-access",
  "bulk-enroll",
]);

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
    return {
      response: NextResponse.json({
        error: "Director verification is temporarily unavailable.",
        code: "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
      }, { status: 503, headers: { ...responseHeaders, "Retry-After": "1" } }),
    };
  }
  if (result.status !== "active" || result.source !== "production-director-entitlement") {
    return {
      response: NextResponse.json({
        error: "Active Tournament Director access is required.",
        code: "DIRECTOR_AUTHORIZATION_REQUIRED",
      }, { status: 403, headers: responseHeaders }),
    };
  }
  return { identity: result.identity };
}

function actor(identity = {}) {
  return {
    actorAuthUserId: clean(identity.authUserId),
    actorPlayerId: clean(identity.actor?.id || identity.player?.id),
  };
}

function safeFailure(error) {
  const candidate = clean(error?.code).toUpperCase();
  const code = /^PLAYER_ACCESS_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "PLAYER_ACCESS_OPERATION_FAILED";
  const messages = {
    PLAYER_ACCESS_EMAIL_INVALID: "Enter a valid, real participant email. Placeholder addresses are not allowed.",
    PLAYER_ACCESS_PHONE_INVALID: "Enter a valid mobile number with its country code.",
    PLAYER_ACCESS_EMAIL_COLLISION: "That email is already approved for another Player.",
    PLAYER_ACCESS_PHONE_COLLISION: "That mobile number is already approved for another Player.",
    PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED: "Identifiers may be approved only for an active 2026 tournament member.",
    PLAYER_ACCESS_LINKED_EMAIL_REPAIR_REQUIRED: "This linked account needs a certified identity repair before its email can change.",
    PLAYER_ACCESS_LINKED_IDENTITY_REQUIRED: "Participant access can change only after the Player has completed first-login linking.",
    PLAYER_ACCESS_ENROLLMENT_CLAIM_IN_FLIGHT: "A first-login enrollment is already in progress. Try again after it finishes.",
    PLAYER_ACCESS_VERIFIED_PHONE_REPAIR_REQUIRED: "A verified phone requires a certified repair flow before replacement or revocation.",
    PLAYER_ACCESS_PHONE_CLAIM_IN_FLIGHT: "Mobile verification is already in progress. Try again after it finishes.",
    PLAYER_ACCESS_VERIFIED_PHONE_REQUIRED: "Phone Primary becomes available only after the phone is verified.",
    PLAYER_ACCESS_DIRECTOR_ACCESS_REVIEW_REQUIRED: "Director access must be reviewed separately before participant access can be suspended.",
    PLAYER_ACCESS_RESUME_IDENTITY_NOT_READY: "Participant access cannot resume until the current membership and verified identity are valid.",
    PLAYER_ACCESS_REVISION_STALE: "Players & Access changed since this page loaded. Refresh and review again.",
  };
  return {
    error: messages[code] || "The Players & Access operation did not complete.",
    code,
  };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: "production-players-access-read",
      source: "supabase-production-players-access-v1",
    }, () => readProductionPlayersAccess(actor(access.identity)));
    return NextResponse.json({ ok: true, data: scoped.result }, {
      headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production Players & Access read failed", {
      code: clean(error?.code || "PLAYER_ACCESS_READ_FAILED"),
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
      code: "PLAYER_ACCESS_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const action = clean(input?.action).toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({
      error: "Unsupported Players & Access action.",
      code: "PLAYER_ACCESS_ACTION_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-players-access-${action}`,
      source: "supabase-production-players-access-v1",
    }, () => mutateProductionPlayersAccess({
      ...actor(access.identity),
      action,
      expectedRevision: input.expectedRevision,
      operationRequestId: input.operationRequestId,
      playerId: input.playerId,
      email: input.email,
      phone: input.phone,
      preferredLoginMethod: input.preferredLoginMethod,
      entries: input.entries,
    }));
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, {
      headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production Players & Access mutation failed", {
      action,
      code: clean(error?.code || "PLAYER_ACCESS_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}
