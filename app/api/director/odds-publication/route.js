import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  readProductionOddsPublicationState,
  withdrawProductionOddsPublication,
} from "../../../../lib/production-odds-publication-server.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };

function unavailable() {
  return NextResponse.json({ error: "Not found." }, {
    status: 404,
    headers: responseHeaders,
  });
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
    }, { status: 503, headers: { ...responseHeaders, "Retry-After": "1" } }) };
  }
  if (result.status !== "active" ||
      result.source !== "production-director-entitlement" ||
      result.identity?.impersonating === true) {
    return { response: NextResponse.json({
      error: "Active Tournament Director access is required.",
      code: "DIRECTOR_AUTHORIZATION_REQUIRED",
    }, { status: 403, headers: responseHeaders }) };
  }
  return { identity: result.identity };
}

function safeFailure(error) {
  const candidate = clean(error?.code).toUpperCase();
  const code = /^ODDS_WITHDRAWAL_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "ODDS_WITHDRAWAL_OPERATION_FAILED";
  const messages = {
    ODDS_WITHDRAWAL_INPUT_INVALID: "The current Odds publication details are incomplete. Refresh and review again.",
    ODDS_WITHDRAWAL_PREDECESSOR_STALE: "The Odds publication changed since this page loaded. Refresh and review again.",
    ODDS_WITHDRAWAL_NO_CURRENT_PUBLICATION: "There is no current public Odds publication to withdraw.",
    ODDS_WITHDRAWAL_CALCULATION_IN_PROGRESS: "Finish or resolve the active Odds calculation before withdrawing the current publication.",
    ODDS_WITHDRAWAL_IDEMPOTENCY_CONFLICT: "That operation identity was already used for a different Odds withdrawal.",
    ODDS_WITHDRAWAL_CURRENT_TOURNAMENT_STALE: "The current tournament changed. Refresh before continuing.",
  };
  return {
    error: messages[code] || "The Odds publication withdrawal did not complete.",
    code,
  };
}

export async function POST(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  let input;
  try { input = await request.json(); }
  catch {
    return NextResponse.json({
      error: "A JSON request body is required.",
      code: "ODDS_WITHDRAWAL_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  if (clean(input?.action).toLowerCase() !== "withdraw") {
    return NextResponse.json({
      error: "Unsupported Odds publication action.",
      code: "ODDS_WITHDRAWAL_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  try {
    const current = await readProductionOddsPublicationState();
    const actorAuthUserId = clean(access.identity?.authUserId);
    const actorPlayerId = clean(
      access.identity?.actor?.id || access.identity?.player?.id,
    );
    const scoped = await withDataAuthorityRequestScope({
      label: "production-odds-publication-withdrawal-v1",
      source: "supabase-production-odds-publication-withdrawal-v1",
    }, () => withdrawProductionOddsPublication({
      expectedPublicationPointerRevision:
        input.expectedPublicationPointerRevision,
      expectedPublicationRevision: input.expectedPublicationRevision,
      expectedPublicationSnapshotId: input.expectedPublicationSnapshotId,
      actorAuthUserId,
      actorPlayerId,
      operationRequestId: input.operationRequestId,
      reasonCode: input.reasonCode,
      runtimeContext: current.runtimeContext,
    }));
    for (const path of [
      "/odds-center",
      "/app/odds",
      "/live",
      "/home",
      "/admin/director",
    ]) revalidatePath(path);
    return NextResponse.json({
      ok: true,
      action: "withdraw",
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
    console.error("Production Odds publication withdrawal failed", {
      code: clean(error?.code || "ODDS_WITHDRAWAL_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}
