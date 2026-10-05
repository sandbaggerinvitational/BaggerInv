import { scoringShadowRpc } from "./scoring-shadow.js";
import { certificationRequested } from "./canonical-resource-registration.js";
import { assertCertificationRuntimeContext, certificationProjectionRpc, resolveCertificationRuntimeContext } from "./certification-runtime-server.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const MATCH_ACCESS_ACTIONS = Object.freeze({
  VIEW_MATCH: "VIEW_MATCH",
  VIEW_FINAL_SCORECARD: "VIEW_FINAL_SCORECARD",
  START_SCORING: "START_SCORING",
  VIEW_GAME_CENTER: "VIEW_GAME_CENTER",
});

const certificationDenials = Object.freeze({
  CANONICAL_RESOURCE_BINDING_DENIED: 403,
  CANONICAL_RESOURCE_DEPLOYMENT_DENIED: 403,
  CANONICAL_RESOURCE_REGISTRATION_STALE: 409,
  CANONICAL_RESOURCE_CONTEXT_STALE: 409,
  CANONICAL_RESOURCE_INGRESS_CLOSED: 409,
  CERTIFICATION_CONTEXT_STALE: 409,
  CERTIFICATION_READ_CONTEXT_DENIED: 403,
  CERTIFICATION_READ_TARGET_DENIED: 403,
  CERTIFICATION_CONTEXT_REQUIRED: 403,
  CERTIFICATION_INPUT_INVALID: 400,
});

class MatchAuthorizationError extends Error {
  constructor(code, status) {
    super("This match authorization could not be confirmed.");
    this.code = code;
    this.status = status;
  }
}

export function matchAuthorizationPublicError(error) {
  return error instanceof MatchAuthorizationError
    ? { code: error.code, status: error.status, message: "This match is not available for Player Passport scoring." }
    : { code: "AUTHORIZATION_UNAVAILABLE", status: 503, message: "Scorecard authorization is temporarily unavailable." };
}

async function authorizeCertificationMatchAccess(scope, options) {
  const env = options.env || process.env;
  const dependencies = { ...options.certificationDependencies,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}), timeoutMs: options.timeoutMs || 8_000 };
  try {
    const context = options.certificationContext
      ? assertCertificationRuntimeContext(options.certificationContext, { env, phase: "READS" }, dependencies)
      : await resolveCertificationRuntimeContext({ env, phase: "READS" }, dependencies);
    // Opening a writable scorecard must also satisfy the existing SCORING
    // capability/ingress gate. Read-only final access keeps its READS contract.
    if (scope.action === MATCH_ACCESS_ACTIONS.START_SCORING) {
      const scoring = await resolveCertificationRuntimeContext({ env, phase: "SCORING" }, dependencies);
      if (scoring.context_token !== context.context_token) throw new MatchAuthorizationError("CERTIFICATION_CONTEXT_STALE", 409);
    }
    const result = await certificationProjectionRpc("READS.CURRENT_VIEW", {
      surface: "MATCH_AUTHORIZATION", target_tournament_id: scope.tournamentId,
    }, { env, context }, dependencies);
    const matrix = result.payload;
    if (matrix?.ok !== true || matrix.tournament_id !== scope.tournamentId || !Array.isArray(matrix.decisions)) {
      throw new Error("Canonical match authorization matrix is unavailable.");
    }
    // Each row is the native match_access_decision result. Never reconstruct
    // an allow decision from roster, permissions, or client-selected authority.
    const decisions = matrix.decisions.filter(row => row?.tournament_id === scope.tournamentId &&
      row.player_id === scope.playerId && row.match_id === scope.matchId && row.action === scope.action);
    if (!decisions.length) throw new MatchAuthorizationError("MATCH_AUTHORIZATION_SCOPE_DENIED", 403);
    if (decisions.length !== 1 || typeof decisions[0].allowed !== "boolean" || !clean(decisions[0].code) ||
        typeof decisions[0].read_only !== "boolean" ||
        decisions[0].read_only !== (scope.action !== MATCH_ACCESS_ACTIONS.START_SCORING) ||
        ![decisions[0].permission_revision, decisions[0].match_permission_revision].every(value => Number.isSafeInteger(value) && value >= 0) ||
        (decisions[0].allowed && decisions[0].code !== "AUTHORIZED")) {
      throw new Error("Canonical match authorization decision is invalid.");
    }
    return { ...result, payload: decisions[0] };
  } catch (error) {
    if (error instanceof MatchAuthorizationError) throw error;
    if (Object.hasOwn(certificationDenials, error?.code || "")) {
      throw new MatchAuthorizationError(error.code, certificationDenials[error.code]);
    }
    throw error;
  }
}

export async function authorizeMatchAccess({ tournamentId, playerId, matchId, action }, options = {}) {
  if (certificationRequested(options.env || process.env)) {
    return authorizeCertificationMatchAccess({ tournamentId: clean(tournamentId), playerId: clean(playerId),
      matchId: clean(matchId), action: clean(action).toUpperCase() }, options);
  }
  return scoringShadowRpc("authorize_match_access", {
    target_tournament_id: clean(tournamentId),
    target_player_id: clean(playerId),
    target_match_id: clean(matchId),
    requested_action: clean(action).toUpperCase(),
  }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

export async function readMatchAuthorizationMatrix(tournamentId, options = {}) {
  return scoringShadowRpc("read_match_authorization_matrix", {
    target_tournament_id: clean(tournamentId),
  }, { ...options, timeoutMs: options.timeoutMs || 12_000 });
}

export function expectedMatchAuthorizationDecision(authorityImport = {}, {
  tournamentId,
  playerId,
  matchId,
  action,
} = {}) {
  const payload = authorityImport.payload || authorityImport;
  const targetTournament = clean(tournamentId || payload.tournament?.tournament_id);
  const targetPlayer = clean(playerId);
  const targetMatch = clean(matchId);
  const requestedAction = clean(action).toUpperCase();
  const match = (payload.matches || []).find((row) => clean(row.match_id) === targetMatch && clean(row.tournament_id) === targetTournament);
  const membership = (payload.tournament_players || []).find((row) => clean(row.tournament_id) === targetTournament && clean(row.player_id) === targetPlayer);
  const membershipActive = clean(membership?.participation_status).toUpperCase() === "ACTIVE";
  const participant = (payload.match_participants || []).some((row) => clean(row.match_id) === targetMatch && clean(row.player_id) === targetPlayer);
  const permission = (payload.permissions || []).find((row) => clean(row.match_id) === targetMatch && clean(row.player_id) === targetPlayer);
  const status = clean(match?.status).toUpperCase();
  const locked = match?.scoring_locked === true;
  const permissionActive = permission?.can_score === true && !clean(permission?.revoked_at);
  let allowed = false;
  let code = "AUTHORIZED";
  if (!Object.values(MATCH_ACCESS_ACTIONS).includes(requestedAction)) code = "INVALID_ACTION";
  else if (!match) code = "MATCH_NOT_FOUND";
  else if (!membershipActive) code = "TOURNAMENT_MEMBERSHIP_INACTIVE";
  else if (!participant) code = "NOT_MATCH_PARTICIPANT";
  else if ([MATCH_ACCESS_ACTIONS.VIEW_MATCH, MATCH_ACCESS_ACTIONS.VIEW_GAME_CENTER].includes(requestedAction)) allowed = true;
  else if (requestedAction === MATCH_ACCESS_ACTIONS.VIEW_FINAL_SCORECARD) {
    if (status !== "FINAL") code = "MATCH_NOT_FINAL";
    else allowed = true;
  } else if (requestedAction === MATCH_ACCESS_ACTIONS.START_SCORING) {
    if (status === "FINAL") code = "MATCH_FINAL";
    else if (locked) code = "MATCH_LOCKED";
    else if (!permissionActive) code = "SCORING_PERMISSION_REVOKED";
    else if (number(permission?.permission_revision) !== number(match?.permission_revision)) code = "SCORING_PERMISSION_STALE";
    else if (status !== "LIVE") code = "MATCH_NOT_SCOREABLE";
    else allowed = true;
  }
  return {
    allowed,
    code: allowed ? "AUTHORIZED" : code,
    action: requestedAction,
    tournament_id: targetTournament,
    player_id: targetPlayer,
    player_display_name: clean((payload.players || []).find((row) => clean(row.player_id) === targetPlayer)?.display_name),
    match_id: targetMatch,
    membership_active: membershipActive,
    participant_membership: participant,
    match_status: status,
    scoring_locked: locked,
    can_score: permissionActive,
    permission_revision: number(permission?.permission_revision),
    match_permission_revision: number(match?.permission_revision),
    read_only: requestedAction !== MATCH_ACCESS_ACTIONS.START_SCORING,
  };
}

export function expectedMatchAuthorizationMatrix(authorityImport = {}) {
  const payload = authorityImport.payload || authorityImport;
  const tournamentId = clean(payload.tournament?.tournament_id);
  const players = (payload.tournament_players || []).filter((row) => clean(row.participation_status).toUpperCase() === "ACTIVE");
  return players.flatMap((player) => (payload.matches || []).flatMap((match) =>
    Object.values(MATCH_ACCESS_ACTIONS).map((action) => expectedMatchAuthorizationDecision(authorityImport, {
      tournamentId,
      playerId: player.player_id,
      matchId: match.match_id,
      action,
    }))
  ));
}

const comparable = (decision = {}) => ({
  allowed: decision.allowed === true,
  code: clean(decision.code),
  action: clean(decision.action),
  tournament_id: clean(decision.tournament_id),
  player_id: clean(decision.player_id),
  player_display_name: clean(decision.player_display_name),
  match_id: clean(decision.match_id),
  membership_active: decision.membership_active === true,
  participant_membership: decision.participant_membership === true,
  match_status: clean(decision.match_status),
  scoring_locked: decision.scoring_locked === true,
  can_score: decision.can_score === true,
  permission_revision: number(decision.permission_revision),
  match_permission_revision: number(decision.match_permission_revision),
  read_only: decision.read_only === true,
});

const decisionKey = (row) => [row.player_id, row.match_id, row.action].map(clean).join(":");

export function compareMatchAuthorizationMatrix(expected = [], actual = []) {
  const expectedMap = new Map(expected.map((row) => [decisionKey(row), comparable(row)]));
  const actualMap = new Map(actual.map((row) => [decisionKey(row), comparable(row)]));
  const missing = [...expectedMap.keys()].filter((key) => !actualMap.has(key));
  const unexpected = [...actualMap.keys()].filter((key) => !expectedMap.has(key));
  const divergences = [...expectedMap.entries()].flatMap(([key, wanted]) => {
    const observed = actualMap.get(key);
    return observed && JSON.stringify(wanted) !== JSON.stringify(observed) ? [{ key, expected: wanted, actual: observed }] : [];
  });
  return { pass: !missing.length && !unexpected.length && !divergences.length, missing, unexpected, divergences };
}
