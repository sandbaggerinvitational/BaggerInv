import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  mutateProductionFutureYearAdministration,
  readProductionFutureYearAdministration,
} from "../../../../lib/production-future-year-administration-server.js";
import {
  PRODUCTION_FUTURE_YEAR_ADMINISTRATION_ACTIONS,
} from "../../../../lib/production-future-year-administration-contract.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const responseHeaders = { "Cache-Control": "private, no-store" };
const ACTIONS = new Set(PRODUCTION_FUTURE_YEAR_ADMINISTRATION_ACTIONS);

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
  const code = /^(?:(?:PRODUCTION_)?FUTURE_(?:YEAR|TOURNAMENT|TEAM|ROSTER|ROUND|COURSE|MATCH)|PRODUCTION_SUPABASE)_[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "FUTURE_YEAR_OPERATION_FAILED";
  const messages = {
    FUTURE_YEAR_TARGET_TOURNAMENT_INVALID: "Select a valid future tournament year.",
    FUTURE_YEAR_CREATE_PREDECESSOR_INVALID: "A future tournament must be created from revision zero.",
    FUTURE_YEAR_CREATION_MODE_INVALID: "Select Start Blank or Clone Structure.",
    FUTURE_YEAR_CLONE_SOURCE_INVALID: "Structure cloning may use only the certified 2026 source.",
    FUTURE_YEAR_REVISION_REQUIRED: "Refresh Future Tournaments before making this change.",
    FUTURE_YEAR_REVISION_STALE: "Future Tournament setup changed since this page loaded. Refresh and review again.",
    FUTURE_TOURNAMENT_REVISION_STALE: "Future Tournament setup changed since this page loaded. Refresh and review again.",
    FUTURE_YEAR_OPERATION_REQUEST_ID_REQUIRED: "A secure operation identity is required.",
    FUTURE_YEAR_OPERATION_REQUEST_CONFLICT: "That operation identity was already used for a different change.",
    FUTURE_TOURNAMENT_OPERATION_REQUEST_CONFLICT: "That operation identity was already used for a different change.",
    FUTURE_YEAR_REASON_REQUIRED: "Enter a concise non-sensitive reason.",
    FUTURE_YEAR_DATE_INVALID: "Enter valid tournament dates.",
    FUTURE_YEAR_DATE_RANGE_INVALID: "The tournament end date must not precede its start date.",
    FUTURE_YEAR_TIME_ZONE_INVALID: "Enter a valid IANA time zone.",
    FUTURE_YEAR_TEXT_INVALID: "Enter valid tournament details.",
    FUTURE_YEAR_NUMBER_INVALID: "Enter a valid tournament setup number.",
    FUTURE_YEAR_STABLE_ID_INVALID: "Select a valid stable Production identifier.",
    FUTURE_YEAR_ROSTER_INVALID: "Review the future tournament roster and try again.",
    FUTURE_YEAR_ROSTER_DUPLICATE_PLAYER: "A Player may appear only once in the future tournament roster.",
    FUTURE_YEAR_ROSTER_TEAM_INVALID: "A team side requires a selected team.",
    FUTURE_YEAR_MEMBERSHIP_STATUS_INVALID: "Select a supported tournament membership status.",
    FUTURE_YEAR_FORMAT_INVALID: "Select Best Ball, Scramble, or Singles.",
    FUTURE_YEAR_FORMAT_TEAM_SIZE_INVALID: "The team size does not match the selected format.",
    FUTURE_YEAR_COURSE_SOURCE_INVALID: "Select a certified existing course reference.",
    FUTURE_TOURNAMENT_ALREADY_EXISTS: "That future tournament already exists.",
    FUTURE_TOURNAMENT_OWNER_REQUIRED: "Production Owner access is required for this annual-administration action.",
    FUTURE_TOURNAMENT_TARGET_NOT_FOUND: "The selected future tournament was not found.",
    FUTURE_TOURNAMENT_DEPENDENCY_BLOCKED: "A current tournament dependency blocks this change.",
    FUTURE_TOURNAMENT_NOT_READY: "Complete the authoritative readiness items before marking this tournament ready.",
    FUTURE_TEAM_CAPTAIN_OR_INPUT_INVALID: "Choose a valid team identity and an eligible captain from that same future team.",
    FUTURE_TEAM_SIDE_IMMUTABLE: "A configured team cannot be moved to a different stable side.",
    FUTURE_TEAM_SIDE_ALREADY_ASSIGNED: "That future tournament side already has a team.",
    FUTURE_ROSTER_INPUT_INVALID: "Review the complete future tournament roster.",
    FUTURE_ROSTER_PLAYER_INVALID: "Every selected future roster member must be an active global Player.",
    FUTURE_ROSTER_TEAM_INVALID: "Every team assignment must use a configured active future tournament team.",
    FUTURE_ROUND_INPUT_INVALID: "Review the future round format and scoring context.",
    FUTURE_ROUND_MATCH_STRUCTURE_LOCKED: "This round already has a generated match structure and its format is locked.",
    FUTURE_COURSE_REFERENCE_INVALID: "Select a certified existing course and tee for this round.",
    FUTURE_EXISTING_COURSE_TEE_REQUIRED: "Select a certified 2026 course and tee with a complete 18-hole context.",
    FUTURE_MATCH_STRUCTURE_INPUT_INVALID: "Review the future round and requested match count.",
    FUTURE_MATCH_STRUCTURE_ALREADY_GENERATED: "That round already has a deterministic match structure.",
    FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED: "Future tournament activation is not installed in this phase.",
    FUTURE_TOURNAMENT_CLOSE_NOT_INSTALLED: "Tournament close is not installed in this phase.",
    FUTURE_TOURNAMENT_ARCHIVE_NOT_INSTALLED: "Tournament archive is not installed in this phase.",
  };
  return {
    error: messages[code] || "The Future Tournament operation did not complete.",
    code,
  };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const targetTournamentId = clean(
      request.nextUrl.searchParams.get("targetTournamentId") ||
      request.nextUrl.searchParams.get("tournamentId"),
    );
    const scoped = await withDataAuthorityRequestScope({
      label: "production-future-year-administration-read",
      source: "supabase-production-future-year-administration-v1",
    }, () => readProductionFutureYearAdministration({
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
    console.error("Production Future Tournament read failed", {
      code: clean(error?.code || "FUTURE_YEAR_READ_FAILED"),
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
      code: "FUTURE_YEAR_INPUT_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  const action = clean(input?.action).toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({
      error: "Unsupported Future Tournament action.",
      code: "FUTURE_YEAR_ACTION_INVALID",
    }, { status: 400, headers: responseHeaders });
  }
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-future-year-administration-${action}`,
      source: "supabase-production-future-year-administration-v1",
    }, () => mutateProductionFutureYearAdministration({
      ...actor(access.identity),
      action,
      targetTournamentId: input.targetTournamentId,
      tournamentYear: input.tournamentYear,
      expectedRevision: input.expectedRevision,
      operationRequestId: input.operationRequestId,
      reason: input.reason,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      timeZone: input.timeZone,
      destination: input.destination,
      creationMode: input.creationMode,
      cloneSourceTournamentId: input.cloneSourceTournamentId,
      teamId: input.teamId,
      teamSide: input.teamSide,
      teamName: input.teamName,
      captainPlayerId: input.captainPlayerId,
      active: input.active,
      roster: input.roster,
      roundNumber: input.roundNumber,
      roundName: input.roundName,
      format: input.format,
      teamSize: input.teamSize,
      pointsAvailable: input.pointsAvailable,
      handicapAllowance: input.handicapAllowance,
      courseId: input.courseId,
      tee: input.tee,
      sourceTournamentId: input.sourceTournamentId,
      sourceRoundNumber: input.sourceRoundNumber,
      matchCount: input.matchCount,
    }));
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, { headers: { ...responseHeaders, ...dataAuthorityResponseHeaders(scoped.diagnostics) } });
  } catch (error) {
    console.error("Production Future Tournament mutation failed", {
      action,
      code: clean(error?.code || "FUTURE_YEAR_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: responseHeaders,
    });
  }
}
