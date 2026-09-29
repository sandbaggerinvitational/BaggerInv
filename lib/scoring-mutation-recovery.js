import { readCanonicalScoreMutationStatus } from "./scoring-authority-supabase.js";
import { setOperationalContext, emitOperationalEvent } from "./operational-telemetry.js";

export const SCORE_RECOVERY_CONTRACT = "score-mutation-recovery-v1";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function scoreRecoveryError(code, status) {
  const error = new Error(status === 401 ? "Sign in to check this score." :
    status === 403 ? "This account cannot check this score." :
    status === 400 ? "Invalid score recovery request." : "Score status is temporarily unavailable.");
  error.code = code; error.status = status; return error;
}
export function normalizeScoreRecoveryRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !["matchId", "mutationId"].includes(key)) ||
      typeof value.matchId !== "string" || value.matchId.length > 120 || !ID.test(value.matchId) ||
      typeof value.mutationId !== "string" || !ID.test(value.mutationId)) {
    throw scoreRecoveryError("SCORE_RECOVERY_INVALID_REQUEST", 400);
  }
  return { matchId: value.matchId, mutationId: value.mutationId };
}
export function assertScoreRecoveryIdentity(identity) {
  if (!identity || !UUID.test(identity.authUserId || "")) throw scoreRecoveryError("AUTH_SESSION_REQUIRED", 401);
  if (identity.kind === "observer" || identity.impersonation || identity.previewMode ||
      identity.context?.observer || !ID.test(identity.playerId || "") ||
      !/^20[2-9][0-9]$/.test(identity.tournamentId || "")) {
    throw scoreRecoveryError("SCORE_RECOVERY_AUTHORIZATION_DENIED", 403);
  }
  return identity;
}
// A read only. Matching current scores do not establish mutation provenance.
// Missing, unbound and other-owner receipts are indistinguishable UNKNOWN.
export async function recoverCanonicalScoreMutation(identity, value, {
  env = process.env, readStatus = readCanonicalScoreMutationStatus,
} = {}) {
  assertScoreRecoveryIdentity(identity);
  const request = normalizeScoreRecoveryRequest(value);
  setOperationalContext({ matchId: request.matchId, mutation_key: request.mutationId });
  const response = await readStatus({
    match_id: request.matchId, mutation_key: request.mutationId,
    authorization: { auth_user_id: identity.authUserId, player_id: identity.playerId,
      tournament_id: identity.tournamentId, match_id: request.matchId, role: "PLAYER" },
  }, { env });
  const payload = response?.payload;
  if (payload?.ok !== true || payload.contract !== SCORE_RECOVERY_CONTRACT ||
      !["COMMITTED", "UNKNOWN"].includes(payload.status) ||
      payload.match_id !== request.matchId || payload.mutation_key !== request.mutationId) {
    throw scoreRecoveryError("SCORE_RECOVERY_UNAVAILABLE", 503);
  }
  if (payload.status === "COMMITTED" && (payload.result?.ok !== true ||
      payload.result.code !== "ACCEPTED" || payload.result.match_id !== request.matchId ||
      !Number.isInteger(payload.result.hole_number) || payload.result.hole_number < 1 ||
      payload.result.hole_number > 18)) throw scoreRecoveryError("SCORE_RECOVERY_UNAVAILABLE", 503);
  emitOperationalEvent({ event: "OUTCOME", domain: "SCORING", phase: "mutation_recovery", outcome: payload.status });
  const result = payload.result;
  return { contract: SCORE_RECOVERY_CONTRACT, status: payload.status,
    matchId: request.matchId, mutationId: request.mutationId,
    retry: payload.status === "COMMITTED" ? "DO_NOT_RESUBMIT" : "CHECK_STATUS",
    ...(payload.status === "COMMITTED" ? { canonical: {
      matchId: result.match_id, holeNumber: result.hole_number,
      matchRevision: result.match_revision, holeRevision: result.hole_revision,
      updatedAt: result.updated_at, gross: result.gross, strokes: result.strokes,
      net: result.net, holeWinner: result.hole_winner, match: result.match,
    } } : {}) };
}
