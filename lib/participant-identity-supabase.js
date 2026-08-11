import { assertParticipantIdentityAdministrativeEnvironment } from "./participant-identity-authority.js";

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!String(secret).startsWith("sb_secret_")) result.authorization = `Bearer ${secret}`;
  return result;
}

export async function participantIdentityRpc(functionName, body = {}, { env = process.env, timeoutMs = 12_000 } = {}) {
  if (!/^[a-z0-9_]+$/.test(String(functionName || ""))) throw new Error("A valid participant identity RPC name is required.");
  assertParticipantIdentityAdministrativeEnvironment(env);
  const url = `${String(env.SUPABASE_SCORING_MIRROR_URL).replace(/\/$/, "")}/rest/v1/rpc/${functionName}`;
  const response = await fetch(url, {
    method: "POST",
    headers: headers(env.SUPABASE_SCORING_MIRROR_SECRET_KEY),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Participant identity RPC failed (${response.status}).`);
    error.status = response.status;
    error.identityDiagnostics = { functionName, code: payload?.code || "", message: payload?.message || "", details: payload?.details || "" };
    throw error;
  }
  return { ok: true, payload };
}

export const readParticipantIdentityAdmin = (tournamentId, options) => participantIdentityRpc("read_participant_identity_admin", { target_tournament_id: tournamentId || null }, options);
export const importParticipantIdentityConfiguration = (input, options) => participantIdentityRpc("import_participant_identity_configuration", { input }, options);
export const approveParticipantIdentityConfiguration = ({ runId, fingerprint, approvedBy }, options) => participantIdentityRpc("approve_participant_identity_configuration", { run_id: runId, expected_fingerprint: fingerprint, approved_by_name: approvedBy }, options);
export const readParticipantIdentityContext = ({ tournamentId, playerId }, options) => participantIdentityRpc("read_participant_identity_context", { target_tournament_id: tournamentId, target_player_id: playerId }, options);
export const readParticipantIdentityContextForAuth = ({ tournamentId, authUserId }, options) => participantIdentityRpc("read_participant_identity_context_for_auth", { target_auth_user_id: authUserId, target_tournament_id: tournamentId || null }, options);
export const recordParticipantIdentityShadowObservation = (observation, options) => participantIdentityRpc("record_participant_identity_shadow_observation", { observation }, options);
export const inspectParticipantIdentitySecurity = (options) => participantIdentityRpc("inspect_participant_identity_security", {}, options);
