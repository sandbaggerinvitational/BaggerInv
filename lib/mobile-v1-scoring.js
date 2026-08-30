import { normalizeLiveScoringRequest, grossScoresFromCell } from "./live-score-values.js";
import { authorizeMatchAccess, MATCH_ACCESS_ACTIONS } from "./match-authorization-supabase.js";
import { MobileApiError, MOBILE_API_VERSION } from "./mobile-api-v1.js";
import { scoringAuthorityEnvironment } from "./scoring-authority.js";
import { persistParticipantScore } from "./scoring-persistence-adapter.js";
import { readParticipantScoringMatch } from "./scoring-read-service.js";
import { requireScoringReadSource } from "./scoring-read-source.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HOLE_FIELDS = new Set([
  "matchId",
  "holeNumber",
  "teamOneGrossScores",
  "teamTwoGrossScores",
  "mutationId",
  "expectedMatchRevision",
  "expectedHoleRevision",
]);
const FINALIZE_FIELDS = new Set(["matchId", "mutationId", "expectedMatchRevision"]);

function generatedAt(now) {
  return (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
}

function success(data, now) {
  return {
    status: 200,
    body: {
      ok: true,
      apiVersion: MOBILE_API_VERSION,
      data,
      meta: { generatedAt: generatedAt(now) },
    },
  };
}

function strictObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MobileApiError("INVALID_SCORE_INPUT");
  if (Object.keys(value).some((key) => !fields.has(key))) throw new MobileApiError("INVALID_SCORE_INPUT");
  return value;
}

function identifier(value) {
  if (typeof value !== "string") throw new MobileApiError("INVALID_SCORE_INPUT");
  const result = clean(value);
  if (!IDENTIFIER.test(result)) throw new MobileApiError("INVALID_SCORE_INPUT");
  return result;
}

function revision(value) {
  if (typeof value !== "number") throw new MobileApiError("INVALID_SCORE_INPUT");
  const result = value;
  if (!Number.isSafeInteger(result) || result < 0) throw new MobileApiError("INVALID_SCORE_INPUT");
  return result;
}

function canonicalStatus(value) {
  const status = clean(value).toUpperCase();
  if (status === "FINAL") return "completed";
  if (status === "LIVE") return "inProgress";
  return "scheduled";
}

function canonicalWinner(value) {
  const winner = clean(value).toUpperCase();
  if (winner === "TEAM 1") return "teamOne";
  if (winner === "TEAM 2") return "teamTwo";
  if (winner === "HALVED" || winner === "TIE" || winner === "TIED") return "halved";
  return null;
}

function scoreList(value) {
  if (typeof value === "string" && value.includes("/")) {
    return value.split("/").map((item) => number(item)).filter((item) => item !== null);
  }
  return grossScoresFromCell(value).map(Number);
}

function numericList(value) {
  if (!Array.isArray(value)) return value == null || value === "" ? [] : [number(value, 0)];
  return value.map((item) => number(item, 0));
}

function scoringMatchRecords(identity) {
  return Array.isArray(identity?.context?.matches) ? identity.context.matches : [];
}

function matchRecord(identity, matchId) {
  return scoringMatchRecords(identity).find((row) => clean(row?.matchId) === matchId) || null;
}

function selectedMatch(identity, requestedMatchId = "") {
  if (requestedMatchId) {
    const requested = identifier(requestedMatchId);
    const found = matchRecord(identity, requested);
    if (!found) throw new MobileApiError("SCORING_NOT_AUTHORIZED");
    return found;
  }
  const rows = scoringMatchRecords(identity);
  const live = rows.filter((row) => clean(row.status).toUpperCase() === "LIVE");
  const upcoming = rows.filter((row) => clean(row.status).toUpperCase() === "UPCOMING");
  const finals = rows.filter((row) => clean(row.status).toUpperCase() === "FINAL");
  return live.find((row) => row.canScore === true && row.scoringLocked !== true)
    || live[0]
    || upcoming.find((row) => row.canScore === true)
    || upcoming[0]
    || finals.at(-1)
    || null;
}

function sanitizedConflictData(error, matchId) {
  const diagnostics = error?.authoritativeDiagnostics || {};
  const data = { matchId, refreshRequired: true };
  const fields = [
    ["currentMatchRevision", diagnostics.current_match_revision],
    ["currentHoleRevision", diagnostics.current_hole_revision],
    ["currentPermissionRevision", diagnostics.current_permission_revision],
    ["scoredHoles", diagnostics.scored_holes],
  ];
  for (const [key, value] of fields) {
    if (Number.isSafeInteger(Number(value)) && Number(value) >= 0) data[key] = Number(value);
  }
  return data;
}

function failure(code, matchId, error = null) {
  const conflictData = sanitizedConflictData(error, matchId);
  if (["MATCH_REVISION_CONFLICT", "HOLE_REVISION_CONFLICT"].includes(code)) {
    return new MobileApiError("REVISION_CONFLICT", conflictData);
  }
  if (code === "IDEMPOTENCY_CONFLICT") return new MobileApiError("IDEMPOTENCY_CONFLICT", conflictData);
  if (["UNAUTHORIZED", "PERMISSION_STALE", "SCORING_PERMISSION_REVOKED", "SCORING_PERMISSION_STALE",
    "NOT_MATCH_PARTICIPANT", "TOURNAMENT_MEMBERSHIP_INACTIVE"].includes(code)) {
    return new MobileApiError("SCORING_NOT_AUTHORIZED", conflictData);
  }
  if (["SCORING_LOCKED", "MATCH_LOCKED", "MATCH_NOT_SCOREABLE"].includes(code)) {
    return new MobileApiError("SCORING_READ_ONLY", conflictData);
  }
  if (code === "MATCH_FINAL") return new MobileApiError("MATCH_ALREADY_FINALIZED", conflictData);
  if (["SCORECARD_INCOMPLETE", "UNRESOLVED_MUTATIONS", "RESULT_UNAVAILABLE"].includes(code)) {
    return new MobileApiError("FINALIZATION_NOT_READY", conflictData);
  }
  if (["INVALID_REQUEST", "INVALID_HOLE", "INVALID_GROSS_SCORES", "INVALID_SCORE_INPUT"].includes(code)) {
    return new MobileApiError("INVALID_SCORE_INPUT");
  }
  if (code === "MATCH_NOT_FOUND") return new MobileApiError("MATCH_NOT_FOUND");
  if (["SCORING_INGRESS_PAUSED", "SUPABASE_NOT_AUTHORITY", "AUTHORITY_BOUNDARY_MISMATCH",
    "SCORING_VIEW_UNAVAILABLE", "SCORING_SUPABASE_READ_CONFIGURATION_REQUIRED"].includes(code)) {
    return new MobileApiError("SCORING_UNAVAILABLE");
  }
  return new MobileApiError("INTERNAL_ERROR");
}

function throwScoringFailure(error, matchId) {
  if (error instanceof MobileApiError) throw error;
  throw failure(clean(error?.code), matchId, error);
}

function requireMobileScoringAvailable(env, dependencies) {
  const authority = (dependencies.scoringAuthorityEnvironment || scoringAuthorityEnvironment)(env);
  let read;
  try { read = (dependencies.requireScoringReadSource || requireScoringReadSource)(env); }
  catch { throw new MobileApiError("SCORING_UNAVAILABLE"); }
  if (authority?.resolved !== "supabase" || read?.resolved !== "supabase") {
    throw new MobileApiError("SCORING_UNAVAILABLE");
  }
}

async function authorization(identity, matchId, action, { env, dependencies, allowDenied = false }) {
  let result;
  try {
    result = await (dependencies.authorizeMatchAccess || authorizeMatchAccess)({
      tournamentId: identity.tournamentId,
      playerId: identity.playerId,
      matchId,
      action,
    }, { env });
  } catch {
    throw new MobileApiError("SCORING_UNAVAILABLE");
  }
  const decision = result?.payload || {};
  if (decision.allowed !== true && !allowDenied) throw failure(clean(decision.code), matchId);
  return decision;
}

function playerDto(data, identity, side, slot) {
  const match = data.match || {};
  const playerId = clean(match[`Team ${side} Player ${slot}`]);
  if (!playerId) return null;
  return {
    playerId,
    displayName: clean(data.display?.playerNames?.[playerId] || playerId),
    slot,
    isAuthenticatedPlayer: playerId === clean(identity.playerId),
    handicapIndex: number(match[`Team ${side} Player ${slot} Handicap Index`]),
    courseHandicap: number(match[`Team ${side} Player ${slot} Course HCP`]),
    playingHandicap: number(match[`Team ${side} Player ${slot} Playing HCP`]),
    strokes: number(match[`Team ${side} Player ${slot} Stroke`]),
  };
}

function sideDto(data, identity, side) {
  const match = data.match || {};
  return {
    side,
    teamId: clean(match[`Team ${side} Team ID`]) || null,
    name: clean(data.display?.teamNames?.[side] || `Team ${side}`),
    participants: [1, 2].map((slot) => playerDto(data, identity, side, slot)).filter(Boolean),
  };
}

function scoreDto(row = {}) {
  return {
    holeNumber: number(row["Hole Number"], 0),
    revision: number(row.Revision, 0),
    gross: {
      teamOne: scoreList(row["Team 1 Gross Scores"]),
      teamTwo: scoreList(row["Team 2 Gross Scores"]),
    },
    strokes: {
      teamOne: numericList(row["Team 1 Strokes"]),
      teamTwo: numericList(row["Team 2 Strokes"]),
    },
    net: {
      teamOne: number(row["Team 1 Net Score"]),
      teamTwo: number(row["Team 2 Net Score"]),
    },
    winner: canonicalWinner(row["Hole Winner"]),
    updatedAt: clean(row["Updated At"]) || null,
  };
}

function currentScoringDto(data, identity, scoringDecision) {
  const match = data.match || {};
  const authority = data.authority || {};
  const writable = scoringDecision.allowed === true && authority.writable === true;
  return {
    match: {
      matchId: clean(match["Match ID"] || match.id),
      roundNumber: number(match.Round ?? match.round),
      format: clean(match.Format || match.format).toUpperCase(),
      status: canonicalStatus(authority.status || match["Match Status"]),
      matchRevision: number(authority.matchRevision ?? match.matchRevision ?? match.Revision, 0),
      permissionRevision: number(authority.permissionRevision ?? match.permissionRevision, 0),
      result: canonicalWinner(match["Matchup Winner"] || match["18-Hole Winner"]),
    },
    player: {
      playerId: clean(identity.playerId),
      displayName: clean(identity.displayName || identity.playerId),
      teamSide: number(data.participantSide),
    },
    sides: [sideDto(data, identity, 1), sideDto(data, identity, 2)],
    course: {
      courseId: clean(match["Course ID"] || match.course?.id) || null,
      name: clean(data.display?.courseName || match.course?.name) || null,
      tee: clean(match.Tee || match["Tee Played"] || match.course?.tee) || null,
      rating: number(match["Course Rating"]),
      slope: number(match["Slope Rating"]),
      par: number(match.Par),
      holes: (data.courseHoles || []).map((hole) => ({
        holeNumber: number(hole["Hole Number"], 0),
        par: number(hole.Par),
        strokeIndex: number(hole["Stroke Index"]),
        yardage: number(hole.Yardage),
      })),
    },
    scores: (data.holeScores || []).map(scoreDto),
    progress: {
      currentHole: number(match["Current Hole"], 0),
      holesRemaining: number(match["Holes Remaining"], 18),
      scorecardComplete: authority.scorecardComplete === true,
      statusText: clean(match["Match Status Text"]) || null,
    },
    permission: {
      canScore: writable,
      readOnly: !writable,
      canFinalize: writable && data.canConfirm === true,
      reason: writable ? null : ({
        MATCH_FINAL: "matchFinalized",
        MATCH_LOCKED: "matchLocked",
        MATCH_NOT_SCOREABLE: "matchNotActive",
        SCORING_PERMISSION_REVOKED: "permissionRevoked",
        SCORING_PERMISSION_STALE: "permissionChanged",
      })[clean(scoringDecision.code)] || "notAuthorized",
    },
    snapshot: {
      snapshotId: clean(authority.scoringSnapshotId) || null,
      revision: number(authority.scoringSnapshotRevision, 0),
    },
  };
}

export function normalizeMobileHoleMutation(value = {}) {
  const input = strictObject(value, HOLE_FIELDS);
  if (!Number.isInteger(input.holeNumber)
    || !Array.isArray(input.teamOneGrossScores)
    || !Array.isArray(input.teamTwoGrossScores)
    || [...input.teamOneGrossScores, ...input.teamTwoGrossScores].some((score) => typeof score !== "number")) {
    throw new MobileApiError("INVALID_SCORE_INPUT");
  }
  let normalized;
  try {
    normalized = normalizeLiveScoringRequest({
      holeNumber: input.holeNumber,
      team1GrossScores: input.teamOneGrossScores,
      team2GrossScores: input.teamTwoGrossScores,
      expectedRevision: input.expectedHoleRevision,
    });
  } catch {
    throw new MobileApiError("INVALID_SCORE_INPUT");
  }
  return {
    matchId: identifier(input.matchId),
    holeNumber: normalized.holeNumber,
    team1GrossScores: normalized.team1GrossScores,
    team2GrossScores: normalized.team2GrossScores,
    mutationId: identifier(input.mutationId),
    expectedMatchRevision: revision(input.expectedMatchRevision),
    expectedHoleRevision: revision(input.expectedHoleRevision),
  };
}

export function normalizeMobileFinalizeMutation(value = {}) {
  const input = strictObject(value, FINALIZE_FIELDS);
  return {
    matchId: identifier(input.matchId),
    mutationId: identifier(input.mutationId),
    expectedMatchRevision: revision(input.expectedMatchRevision),
  };
}

function assertCanonicalScoreShape(input, format) {
  const expected = clean(format).toUpperCase() === "BB" ? 2
    : ["SC", "SI"].includes(clean(format).toUpperCase()) ? 1 : 0;
  if (!expected) throw new MobileApiError("SCORING_UNAVAILABLE");
  if (input.team1GrossScores.length !== expected || input.team2GrossScores.length !== expected) {
    throw new MobileApiError("INVALID_SCORE_INPUT");
  }
}

export async function mobileScoringCurrentResult(identity, {
  matchId = "",
  env = process.env,
  now,
  dependencies = {},
} = {}) {
  requireMobileScoringAvailable(env, dependencies);
  const selected = selectedMatch(identity, matchId);
  if (!selected) return success({ scoring: null }, now);
  const selectedMatchId = identifier(selected.matchId);
  let viewDecision;
  let scoringDecision;
  try {
    [viewDecision, scoringDecision] = await Promise.all([
      (dependencies.authorizeMatchAccess || authorizeMatchAccess)({
        tournamentId: identity.tournamentId,
        playerId: identity.playerId,
        matchId: selectedMatchId,
        action: MATCH_ACCESS_ACTIONS.VIEW_MATCH,
      }, { env }),
      (dependencies.authorizeMatchAccess || authorizeMatchAccess)({
        tournamentId: identity.tournamentId,
        playerId: identity.playerId,
        matchId: selectedMatchId,
        action: MATCH_ACCESS_ACTIONS.START_SCORING,
      }, { env }),
    ]);
  } catch {
    throw new MobileApiError("SCORING_UNAVAILABLE");
  }
  if (viewDecision?.payload?.allowed !== true) throw failure(clean(viewDecision?.payload?.code), selectedMatchId);
  const scoreDecision = scoringDecision?.payload || {};
  let scoring;
  try {
    scoring = await (dependencies.readParticipantScoringMatch || readParticipantScoringMatch)({
      matchId: selectedMatchId,
      currentPlayerId: identity.playerId,
      authorization: { verified: true, writable: scoreDecision.allowed === true },
      env,
      dependencies: dependencies.scoringReadDependencies || {},
    });
  } catch (error) {
    throwScoringFailure(error, selectedMatchId);
  }
  return success({ scoring: currentScoringDto(scoring.data, identity, scoreDecision) }, now);
}

export async function mobileScoringHoleResult(identity, value, {
  env = process.env,
  now,
  dependencies = {},
} = {}) {
  requireMobileScoringAvailable(env, dependencies);
  const input = normalizeMobileHoleMutation(value);
  const record = matchRecord(identity, input.matchId);
  if (!record) throw new MobileApiError("SCORING_NOT_AUTHORIZED", { matchId: input.matchId, refreshRequired: true });
  assertCanonicalScoreShape(input, record.format);
  const decision = await authorization(identity, input.matchId, MATCH_ACCESS_ACTIONS.START_SCORING,
    { env, dependencies, allowDenied: true });
  const replayProbe = decision.allowed !== true && ["MATCH_FINAL", "MATCH_LOCKED", "MATCH_NOT_SCOREABLE",
    "SCORING_PERMISSION_REVOKED", "SCORING_PERMISSION_STALE"].includes(clean(decision.code));
  if (decision.allowed !== true && !replayProbe) throw failure(clean(decision.code), input.matchId);
  const permissionRevision = number(decision.permission_revision ?? record.permissionRevision, 0);
  let persisted;
  try {
    persisted = await (dependencies.persistParticipantScore || persistParticipantScore)({
      matchId: input.matchId,
      input: {
        holeNumber: input.holeNumber,
        team1GrossScores: input.team1GrossScores,
        team2GrossScores: input.team2GrossScores,
        clientMutationId: input.mutationId,
        expectedMatchRevision: input.expectedMatchRevision,
        expectedRevision: input.expectedHoleRevision,
      },
      current: {
        scope: "match",
        authUserId: identity.authUserId,
        matchId: input.matchId,
        tournamentId: identity.tournamentId,
        playerId: identity.playerId,
        accessVersion: permissionRevision,
        identityAuthority: "supabase",
      },
      canonicalContext: {
        tournamentId: identity.tournamentId,
        matchRevision: input.expectedMatchRevision,
        permissionRevision,
      },
      authorizationContext: {
        source: "mobile-native-certified",
        identity: {
          authUserId: identity.authUserId,
          playerId: identity.playerId,
          tournamentId: identity.tournamentId,
        },
      },
      includeCanonicalAcknowledgement: true,
      updatedBy: "Authenticated mobile participant",
    });
  } catch (error) {
    if (replayProbe && clean(error?.code) !== "IDEMPOTENCY_CONFLICT") {
      throw failure(clean(decision.code), input.matchId, error);
    }
    throwScoringFailure(error, input.matchId);
  }
  if (persisted?.authority !== "supabase" || !persisted.result?.hole) throw new MobileApiError("SCORING_UNAVAILABLE");
  const result = persisted.result;
  if (replayProbe && result.idempotent !== true) throw new MobileApiError("INTERNAL_ERROR");
  return success({
    mutationId: input.mutationId,
    accepted: true,
    idempotent: result.idempotent === true,
    semanticNoop: result.semanticNoop === true,
    matchId: input.matchId,
    hole: scoreDto(result.hole),
    match: {
      revision: number(result.matchRevision, input.expectedMatchRevision),
      status: result.matchComplete ? "readyToFinalize" : "inProgress",
      currentHole: number(result.liveStatus?.currentHole, 0),
      holesRemaining: number(result.liveStatus?.holesRemaining, 18),
      scorecardComplete: result.matchComplete === true,
      statusText: clean(result.liveStatus?.statusText) || null,
    },
    refreshRequired: false,
  }, now);
}

export async function mobileScoringFinalizeResult(identity, value, {
  env = process.env,
  now,
  dependencies = {},
} = {}) {
  requireMobileScoringAvailable(env, dependencies);
  const input = normalizeMobileFinalizeMutation(value);
  if (!matchRecord(identity, input.matchId)) {
    throw new MobileApiError("SCORING_NOT_AUTHORIZED", { matchId: input.matchId, refreshRequired: true });
  }
  const decision = await authorization(identity, input.matchId, MATCH_ACCESS_ACTIONS.START_SCORING, { env, dependencies });
  let persisted;
  try {
    persisted = await (dependencies.persistParticipantScore || persistParticipantScore)({
      matchId: input.matchId,
      input: {
        action: "confirm",
        clientMutationId: input.mutationId,
        expectedMatchRevision: input.expectedMatchRevision,
      },
      current: {
        scope: "match",
        authUserId: identity.authUserId,
        matchId: input.matchId,
        tournamentId: identity.tournamentId,
        playerId: identity.playerId,
        accessVersion: number(decision.permission_revision, 0),
        identityAuthority: "supabase",
      },
      canonicalContext: {
        tournamentId: identity.tournamentId,
        matchRevision: input.expectedMatchRevision,
        permissionRevision: number(decision.permission_revision, 0),
      },
      authorizationContext: {
        source: "mobile-native-certified",
        identity: {
          authUserId: identity.authUserId,
          playerId: identity.playerId,
          tournamentId: identity.tournamentId,
        },
      },
      includeCanonicalAcknowledgement: true,
      updatedBy: "Authenticated mobile participant",
    });
  } catch (error) {
    throwScoringFailure(error, input.matchId);
  }
  if (persisted?.authority !== "supabase" || persisted.result?.matchComplete !== true) {
    throw new MobileApiError("SCORING_UNAVAILABLE");
  }
  const result = persisted.result;
  return success({
    mutationId: input.mutationId,
    accepted: true,
    idempotent: result.idempotent === true,
    match: {
      matchId: input.matchId,
      revision: number(result.matchRevision, input.expectedMatchRevision),
      permissionRevision: number(result.permissionRevision),
      status: "completed",
      scoringLocked: true,
      result: canonicalWinner(result.resultWinner),
      finalizedAt: clean(result["Finalized At"] || result.updatedAt) || null,
    },
    refreshRequired: true,
  }, now);
}
