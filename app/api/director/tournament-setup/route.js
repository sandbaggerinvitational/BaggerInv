import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  mutateProductionTournamentSetup,
  readProductionTournamentSetup,
} from "../../../../lib/production-tournament-setup-server.js";
import { PRODUCTION_TOURNAMENT_SETUP_ACTIONS } from "../../../../lib/production-tournament-setup-contract.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };
const ACTIONS = new Set(PRODUCTION_TOURNAMENT_SETUP_ACTIONS);

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
  };
}

function safeFailure(error) {
  const candidate = clean(error?.code).toUpperCase();
  const code = /^(?:PRODUCTION_)?TOURNAMENT_SETUP_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate.replace(/^PRODUCTION_TOURNAMENT_SETUP_/, "TOURNAMENT_SETUP_")
    : "TOURNAMENT_SETUP_OPERATION_FAILED";
  const messages = {
    TOURNAMENT_SETUP_REVISION_STALE: "Tournament Setup changed since this page loaded. Refresh and review again.",
    TOURNAMENT_SETUP_MATCH_STARTED: "This match has started and its competition facts are locked.",
    TOURNAMENT_SETUP_MATCH_FROZEN: "This match has scoring or finalization dependencies and cannot be changed in Setup.",
    TOURNAMENT_SETUP_ROUND_STARTED: "This round has started and its format is locked.",
    TOURNAMENT_SETUP_ROUND_STARTED_LOCKED: "This round has started and its competition structure is locked.",
    TOURNAMENT_SETUP_STARTED_MATCH_LOCKED: "A started match locks this tournament setup change.",
    TOURNAMENT_SETUP_TEAM_DEPENDENCY_BLOCKED: "This team change is blocked by current competition dependencies.",
    TOURNAMENT_SETUP_ROSTER_DEPENDENCY_BLOCKED: "This roster assignment is blocked by current competition dependencies.",
    TOURNAMENT_SETUP_FINANCIAL_DEPENDENCY_BLOCKED: "A published or configured side-game dependency must be resolved before this setup change.",
    TOURNAMENT_SETUP_PAIRING_COUNT_INVALID: "The participant count does not match the selected round format.",
    TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID: "Pairings require unique Players in valid team-side slots.",
    TOURNAMENT_SETUP_PAIRING_TEAM_INVALID: "Every paired Player must be an active roster member of the selected team.",
    TOURNAMENT_SETUP_PAIRING_ACTIVE_TEAM_MEMBERSHIP_REQUIRED: "Every paired Player must be an active roster member of the selected team.",
    TOURNAMENT_SETUP_PAIRING_CLEAR_UNSAFE: "Pairings can be cleared only while the match is strictly unstarted, unscored, and inaccessible to scorers.",
    TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_INVALID: "This imported match does not have enough certified setup context for a safe pairing clear.",
    TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_REQUIRED: "This imported match needs certified course and schedule context before its pairings can be cleared.",
    TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_CONFLICT: "This imported match conflicts with the current round or course setup and requires review.",
    TOURNAMENT_SETUP_DUPLICATE_ROUND_PLAYER: "A Player may appear only once within a round.",
    TOURNAMENT_SETUP_ROUND_DUPLICATE_PLAYER: "A Player may appear only once within a round.",
    TOURNAMENT_SETUP_HANDICAP_REQUIRED: "Every paired Player needs the current approved tournament handicap revision.",
    TOURNAMENT_SETUP_PAIRING_APPROVED_HANDICAP_REQUIRED: "Every paired Player needs the current approved tournament handicap revision.",
    TOURNAMENT_SETUP_COURSE_NOT_FOUND: "Select an existing canonical course identity.",
    TOURNAMENT_SETUP_EXISTING_COURSE_ID_REQUIRED: "Select an existing canonical course identity.",
    TOURNAMENT_SETUP_HOLES_INCOMPLETE: "All 18 hole definitions are required.",
    TOURNAMENT_SETUP_HOLE_SEQUENCE_INVALID: "Hole numbers and stroke indexes must each contain 1 through 18 exactly once.",
    TOURNAMENT_SETUP_SCORING_CONTEXT_INCOMPLETE: "Complete the round, course, pairings, and approved handicaps before preparing scoring context.",
    TOURNAMENT_SETUP_SCORING_CONTEXT_REQUIRED_FACT_MISSING: "Complete the round, course, pairings, and approved handicaps before preparing scoring context.",
    TOURNAMENT_SETUP_MATCH_ROUND_COURSE_MISMATCH: "Select the course and tee assigned to this round.",
    TOURNAMENT_SETUP_MATCH_ROUND_FORMAT_MISMATCH: "Refresh this match to the round's current format before preparing its scoring context.",
    TOURNAMENT_SETUP_EXISTING_MATCH_REQUIRED: "New match creation is deferred. Select an existing Production match to configure.",
    TOURNAMENT_SETUP_MEMBERSHIP_REACTIVATION_REQUIRES_ACCESS_GOVERNANCE: "Reactivate this tournament membership through Players & Access before assigning a team.",
    TOURNAMENT_SETUP_DEPENDENCY_BLOCKED: "A current Draft, side-game, Odds, or competition dependency blocks this setup change.",
    TOURNAMENT_SETUP_OPERATION_REQUEST_CONFLICT: "That operation identity was already used for a different change.",
  };
  return {
    error: messages[code] || "The Tournament Setup operation did not complete.",
    code,
  };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: "production-tournament-setup-read",
      source: "supabase-production-tournament-setup-v1",
    }, () => readProductionTournamentSetup(actor(access.identity)));
    return NextResponse.json({
      ok: true,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, { headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) } });
  } catch (error) {
    console.error("Production Tournament Setup read failed", {
      code: clean(error?.code || "TOURNAMENT_SETUP_READ_FAILED"),
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
      code: "TOURNAMENT_SETUP_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const action = clean(input?.action).toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({
      error: "Unsupported Tournament Setup action.",
      code: "TOURNAMENT_SETUP_ACTION_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-tournament-setup-${action}`,
      source: "supabase-production-tournament-setup-v1",
    }, () => mutateProductionTournamentSetup({
      ...input,
      ...actor(access.identity),
      action,
      expectedRevision: input.expectedRevision,
      operationRequestId: input.operationRequestId,
    }));
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, { headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) } });
  } catch (error) {
    console.error("Production Tournament Setup mutation failed", {
      action,
      code: clean(error?.code || "TOURNAMENT_SETUP_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}
