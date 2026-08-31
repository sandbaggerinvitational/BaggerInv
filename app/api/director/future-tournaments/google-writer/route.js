import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../../lib/production-cutover-activation-contract.js";
import {
  certifyProductionFutureGoogleWriter,
  PRODUCTION_FUTURE_GOOGLE_WRITER_CERTIFICATION_ACTIONS,
} from "../../../../../lib/production-future-google-writer-certification-server.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };

function unavailable() {
  return NextResponse.json(
    { error: "Not found." },
    { status: 404, headers: responseHeaders },
  );
}

async function authorize(request) {
  if (clean(process.env.VERCEL_ENV).toLowerCase() !== "production") {
    return { response: unavailable() };
  }
  try {
    assertProductionCutoverActivation({ requiredPhase: "OBSERVATION" });
    assertProductionCutoverRequest(request, process.env, { requireOrigin: true });
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
    }, {
      status: 503,
      headers: { ...responseHeaders, "Retry-After": "1" },
    }) };
  }
  if (result.status !== "active" ||
      result.source !== "production-director-entitlement") {
    return { response: NextResponse.json({
      error: "Active Production Owner access is required.",
      code: "PRODUCTION_FUTURE_GOOGLE_OWNER_REQUIRED",
    }, { status: 403, headers: responseHeaders }) };
  }
  return { identity: result.identity };
}

function safeFailure(error) {
  const candidate = clean(error?.code).toUpperCase();
  const code = /^PRODUCTION_FUTURE_GOOGLE_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_FAILED";
  const status = Number(error?.status || 503);
  return {
    body: {
      error: status === 403
        ? "Active Production Owner access is required."
        : "The annual writer certification operation did not complete.",
      code,
    },
    status: status >= 400 && status < 600 ? status : 503,
  };
}

export async function POST(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({
      error: "A JSON request body is required.",
      code: "PRODUCTION_FUTURE_GOOGLE_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const action = clean(input?.action).toLowerCase();
  if (!PRODUCTION_FUTURE_GOOGLE_WRITER_CERTIFICATION_ACTIONS.includes(action)) {
    return NextResponse.json({
      error: "Unsupported annual writer certification action.",
      code: "PRODUCTION_FUTURE_GOOGLE_ACTION_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  try {
    const identity = access.identity || {};
    const scoped = await withDataAuthorityRequestScope({
      label: `production-future-google-writer-${action}`,
      source: "supabase-production-annual-google-writer-certification-v1",
    }, () => certifyProductionFutureGoogleWriter({
      action,
      actorAuthUserId: clean(identity.authUserId),
      actorPlayerId: clean(identity.actor?.id || identity.player?.id),
      targetTournamentId: input.targetTournamentId,
      expectedResourceRevision: input.expectedResourceRevision,
      expectedSetupRevision: input.expectedSetupRevision,
      expectedPromotionRevision: input.expectedPromotionRevision,
      operationRequestId: input.operationRequestId,
      reason: input.reason,
      // Deliberately do not forward any caller-supplied workbook/destination.
    }));
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, {
      headers: {
        ...responseHeaders,
        ...dataAuthorityResponseHeaders(scoped.diagnostics),
      },
    });
  } catch (error) {
    console.error("Annual Google writer certification failed", {
      action,
      code: clean(error?.code ||
        "PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_FAILED"),
      status: Number(error?.status || 0),
    });
    const failure = safeFailure(error);
    return NextResponse.json(failure.body, {
      status: failure.status,
      headers: responseHeaders,
    });
  }
}
