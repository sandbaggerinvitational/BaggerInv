import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  readProductionTournamentAwards,
  saveProductionTournamentAwards,
} from "../../../../lib/production-tournament-awards-server.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };

function unavailable() {
  return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
}

async function authorize(request, { mutation = false } = {}) {
  if (clean(process.env.VERCEL_ENV).toLowerCase() !== "production") return { response: unavailable() };
  try {
    assertProductionCutoverActivation({ requiredPhase: "OBSERVATION" });
    if (mutation) assertProductionCutoverRequest(request, process.env, { requireOrigin: true });
  } catch {
    return { response: unavailable() };
  }
  const result = await authorizePreviewDirector({ request, env: process.env, allowBootstrap: false });
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
  };
}

function safeFailure(error) {
  const candidate = clean(error?.code).toUpperCase();
  const code = /^(?:PRODUCTION_)?TOURNAMENT_AWARDS_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate.replace(/^PRODUCTION_TOURNAMENT_AWARDS_/, "TOURNAMENT_AWARDS_")
    : "TOURNAMENT_AWARDS_OPERATION_FAILED";
  const messages = {
    TOURNAMENT_AWARDS_REVISION_STALE: "Awards changed since this page loaded. Refresh and review again.",
    TOURNAMENT_AWARDS_OPERATION_REQUEST_CONFLICT: "That operation identity was already used for a different Awards change.",
    TOURNAMENT_AWARDS_PLAYER_NOT_ACTIVE: "Select an active Player from the current tournament roster.",
    TOURNAMENT_AWARDS_TEAM_NOT_FOUND: "Select a current tournament Team.",
    TOURNAMENT_AWARDS_PENDING_PUBLICATION_INVALID: "Assign a winner before publishing this Award.",
    TOURNAMENT_AWARDS_PUBLISHED_REMOVAL_INVALID: "Retire a previously published Award instead of removing it.",
  };
  return { error: messages[code] || "The Awards operation did not complete.", code };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: "production-tournament-awards-read",
      source: "supabase-production-tournament-awards-v1",
    }, () => readProductionTournamentAwards(actor(access.identity)));
    return NextResponse.json({ ok: true, data: scoped.result, fallbackUsed: false, googleRequests: 0 }, {
      headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production Awards read failed", { code: clean(error?.code || "TOURNAMENT_AWARDS_READ_FAILED"), status: Number(error?.status || 0) });
    return NextResponse.json(safeFailure(error), { status: Number(error?.status || 503), headers: responseHeaders });
  }
}

export async function POST(request) {
  const access = await authorize(request, { mutation: true });
  if (access.response) return access.response;
  let input;
  try { input = await request.json(); }
  catch {
    return NextResponse.json({ error: "A JSON request body is required.", code: "TOURNAMENT_AWARDS_INPUT_INVALID" }, { status: 400, headers: responseHeaders });
  }
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: "production-tournament-awards-save",
      source: "supabase-production-tournament-awards-v1",
    }, () => saveProductionTournamentAwards({ ...input, ...actor(access.identity) }));
    return NextResponse.json({ ok: true, data: scoped.result, fallbackUsed: false, googleRequests: 0 }, {
      headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production Awards mutation failed", { code: clean(error?.code || "TOURNAMENT_AWARDS_OPERATION_FAILED"), status: Number(error?.status || 0) });
    return NextResponse.json(safeFailure(error), { status: Number(error?.status || 503), headers: responseHeaders });
  }
}
