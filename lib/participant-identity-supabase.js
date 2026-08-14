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
export const inspectParticipantIdentityTournamentResolution = (authUserId, options) => participantIdentityRpc("inspect_participant_identity_tournament_resolution", { target_auth_user_id: authUserId }, options);
export const recordParticipantIdentityShadowObservation = (observation, options) => participantIdentityRpc("record_participant_identity_shadow_observation", { observation }, options);
export const readParticipantIdentityShadowDiagnostics = (tournamentId, options) => participantIdentityRpc("read_participant_identity_shadow_diagnostics", { target_tournament_id: tournamentId }, options);
export const inspectParticipantIdentitySecurity = (options) => participantIdentityRpc("inspect_participant_identity_security", {}, options);
export const readSingleParticipantAuthRehearsalPreflight = (tournamentId, options) => participantIdentityRpc("read_single_participant_auth_rehearsal_preflight", { target_tournament_id: tournamentId }, options);
export const linkAuthUserToPlayer = (input, options) => participantIdentityRpc("admin_link_auth_user_to_player", { input }, options);
export const configureSingleParticipantAuthRehearsal = (input, options) => participantIdentityRpc("configure_single_participant_auth_rehearsal", { input }, options);
export const authorizeSingleParticipantOtpRequest = (input, options) => participantIdentityRpc("authorize_single_participant_otp_request", { input }, options);
export const recordSingleParticipantOtpDelivery = (input, options) => participantIdentityRpc("record_single_participant_otp_delivery", { input }, options);
export const authorizeSingleParticipantOtpVerification = (input, options) => participantIdentityRpc("authorize_single_participant_otp_verification", { input }, options);
export const recordSingleParticipantOtpVerification = (input, options) => participantIdentityRpc("record_single_participant_otp_verification", { input }, options);
export const setSingleParticipantAuthRehearsalStatus = (input, options) => participantIdentityRpc("set_single_participant_auth_rehearsal_status", { input }, options);
export const isSingleParticipantAuthShadowEnabled = ({ authUserId, tournamentId }, options) => participantIdentityRpc("is_single_participant_auth_shadow_enabled", { target_auth_user_id: authUserId, target_tournament_id: tournamentId }, options);
export const recordSingleParticipantAuthLogout = ({ authUserId, tournamentId }, options) => participantIdentityRpc("record_single_participant_auth_logout", { target_auth_user_id: authUserId, target_tournament_id: tournamentId }, options);
export const recordSingleParticipantAuthClientDiagnostics = (input, options) => participantIdentityRpc("record_single_participant_auth_client_diagnostics", { input }, options);
export const recordSingleParticipantAuthEmailConfirmation = (input, options) => participantIdentityRpc("record_single_participant_auth_email_confirmation", { input }, options);
export const readSingleParticipantAuthRequestAudit = (tournamentId, options) => participantIdentityRpc("read_single_participant_auth_request_audit", { target_tournament_id: tournamentId }, options);
export const readPreviewDirectorEntitlement = ({ authUserId, tournamentId }, options) => participantIdentityRpc("read_preview_director_entitlement", {
  target_auth_user_id: authUserId,
  target_tournament_id: tournamentId,
}, options);
export const linkPreviewDirectorEntitlement = (input, options) => participantIdentityRpc("link_preview_director_entitlement", { input }, options);
export const revokePreviewDirectorEntitlement = (input, options) => participantIdentityRpc("revoke_preview_director_entitlement", { input }, options);
export const beginPreviewIdentityImpersonation = (input, options) => participantIdentityRpc("begin_preview_identity_impersonation", { input }, options);
export const verifyPreviewIdentityImpersonation = ({ leaseId, tournamentId, directorPlayerId, playerId, directorAuthUserId }, options) => participantIdentityRpc("verify_preview_identity_impersonation", {
  target_lease_id: leaseId,
  target_tournament_id: tournamentId,
  target_director_player_id: directorPlayerId,
  target_player_id: playerId,
  target_director_auth_user_id: directorAuthUserId,
}, options);
export const endPreviewIdentityImpersonation = (input, options) => participantIdentityRpc("end_preview_identity_impersonation", { input }, options);
