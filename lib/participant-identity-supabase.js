import {
  assertParticipantIdentityAdministrativeEnvironment,
  participantIdentityAuthorityEnvironment,
} from "./participant-identity-authority.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import { productionAuthRecoveryReference } from "./participant-auth-certification-recovery.js";

async function readProductionShadowCandidateServerTransport(env) {
  // Keep the Production secret transport out of the shared Preview module graph.
  // The server-only module is loaded only after the exact candidate assertion passes.
  const { productionShadowCandidateServerTransport } = await import("./production-shadow-candidate-server.js");
  return productionShadowCandidateServerTransport(env);
}

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!String(secret).startsWith("sb_secret_")) result.authorization = `Bearer ${secret}`;
  return result;
}

export async function participantIdentityRpc(functionName, body = {}, { env = process.env, timeoutMs = 12_000 } = {}) {
  if (!/^[a-z0-9_]+$/.test(String(functionName || ""))) throw new Error("A valid participant identity RPC name is required.");
  const authority = participantIdentityAuthorityEnvironment(env);
  const productionRpcNames = {
    authorize_single_participant_otp_request: "authorize_production_auth_candidate_otp_request",
    record_single_participant_otp_delivery: "record_production_auth_candidate_otp_delivery",
    authorize_single_participant_otp_verification: "authorize_production_auth_candidate_otp_verification",
    record_single_participant_otp_verification: "record_production_auth_candidate_otp_verification",
    recover_single_participant_otp_verification: "recover_production_auth_candidate_otp_verification",
    record_single_participant_auth_logout: "record_production_auth_candidate_logout",
    read_participant_identity_context_for_auth: "read_production_auth_candidate_context_for_auth",
    read_participant_identity_context: "read_production_auth_candidate_player_context",
  };
  const selectedFunctionName = authority.productionShadowCandidate
    ? productionRpcNames[functionName] || functionName
    : functionName;
  assertParticipantIdentityAdministrativeEnvironment(env, { operation: selectedFunctionName });
  const transport = authority.productionShadowCandidate
    ? await readProductionShadowCandidateServerTransport(env)
    : {
        url: String(env.SUPABASE_SCORING_MIRROR_URL || "").replace(/\/$/, ""),
        secretKey: env.SUPABASE_SCORING_MIRROR_SECRET_KEY,
      };
  const url = `${String(transport.url).replace(/\/$/, "")}/rest/v1/rpc/${selectedFunctionName}`;
  recordDataAuthorityTransport("supabase", { adapter: "participant-identity-supabase" });
  const response = await fetch(url, {
    method: "POST",
    headers: headers(transport.secretKey),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Participant identity RPC failed (${response.status}).`);
    error.status = response.status;
    error.identityDiagnostics = { functionName: selectedFunctionName, code: payload?.code || "", message: payload?.message || "", details: payload?.details || "" };
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
export const recoverSingleParticipantOtpVerification = (reference, options) => {
  const { requestId, authUserId } = productionAuthRecoveryReference(reference);
  return participantIdentityRpc(
    "recover_single_participant_otp_verification",
    { target_request_id: requestId, target_auth_user_id: authUserId },
    options,
  );
};
export const setSingleParticipantAuthRehearsalStatus = (input, options) => participantIdentityRpc("set_single_participant_auth_rehearsal_status", { input }, options);
export const isSingleParticipantAuthShadowEnabled = ({ authUserId, tournamentId }, options) => participantIdentityRpc("is_single_participant_auth_shadow_enabled", { target_auth_user_id: authUserId, target_tournament_id: tournamentId }, options);
export const recordSingleParticipantAuthLogout = ({ authUserId, tournamentId }, options) => participantIdentityRpc("record_single_participant_auth_logout", { target_auth_user_id: authUserId, target_tournament_id: tournamentId }, options);
export const recordSingleParticipantAuthClientDiagnostics = (input, options) => participantIdentityRpc("record_single_participant_auth_client_diagnostics", { input }, options);
export const recordSingleParticipantAuthEmailConfirmation = (input, options) => participantIdentityRpc("record_single_participant_auth_email_confirmation", { input }, options);
export const readSingleParticipantAuthRequestAudit = (tournamentId, options) => participantIdentityRpc("read_single_participant_auth_request_audit", { target_tournament_id: tournamentId }, options);
export const readParticipantAuthPhoneAdmin = ({ tournamentId, actorAuthUserId }, options) => participantIdentityRpc("read_participant_auth_phone_admin", {
  target_tournament_id: tournamentId,
  actor_auth_user_id: actorAuthUserId,
}, options);
export const manageParticipantAuthPhone = (input, options) => participantIdentityRpc("manage_participant_auth_phone", { input }, options);
export const beginParticipantPhoneOtpAttempt = (input, options) => participantIdentityRpc("begin_participant_phone_otp_attempt", { input }, options);
export const recordParticipantPhoneOtpSend = (input, options) => participantIdentityRpc("record_participant_phone_otp_send", { input }, options);
export const authorizeParticipantPhoneOtpVerification = (input, options) => participantIdentityRpc("authorize_participant_phone_otp_verification", { input }, options);
export const recordParticipantPhoneOtpVerificationFailure = (input, options) => participantIdentityRpc("record_participant_phone_otp_verification_failure", { input }, options);
export const completeParticipantPhoneOtpVerification = (input, options) => participantIdentityRpc("complete_participant_phone_otp_verification", { input }, options);
export const readParticipantPhoneOtpDirectorState = ({ tournamentId, actorAuthUserId }, options) => participantIdentityRpc("read_participant_phone_otp_director_state", {
  target_tournament_id: tournamentId,
  actor_auth_user_id: actorAuthUserId,
}, options);
export const beginParticipantPhoneEnrollment = (input, options) => participantIdentityRpc("begin_participant_phone_enrollment", { input }, options);
export const recordParticipantPhoneEnrollmentSend = (input, options) => participantIdentityRpc("record_participant_phone_enrollment_send", { input }, options);
export const authorizeParticipantPhoneEnrollmentVerification = (input, options) => participantIdentityRpc("authorize_participant_phone_enrollment_verification", { input }, options);
export const recordParticipantPhoneEnrollmentFailure = (input, options) => participantIdentityRpc("record_participant_phone_enrollment_failure", { input }, options);
export const completeParticipantPhoneEnrollment = (input, options) => participantIdentityRpc("complete_participant_phone_enrollment", { input }, options);
export const readParticipantPhoneEnrollmentState = (input, options) => participantIdentityRpc("read_participant_phone_enrollment_state", { input }, options);
export const authorizeParticipantPhoneLoginProof = (input, options) => participantIdentityRpc("authorize_participant_phone_login_proof", { input }, options);
export const authorizeParticipantPhoneLoginRequest = (input, options) => participantIdentityRpc("authorize_participant_phone_login_request", { input }, options);
export const beginParticipantPhonePublicRequest = (input, options) => participantIdentityRpc("begin_participant_phone_public_request", { input }, options);
export const authorizeControlledParticipantPhoneLoginSurface = (options) => participantIdentityRpc("authorize_controlled_participant_phone_login_surface", {}, options);
export const beginParticipantPhoneLogin = (input, options) => participantIdentityRpc("begin_participant_phone_login", { input }, options);
export const recordParticipantPhoneLoginSend = (input, options) => participantIdentityRpc("record_participant_phone_login_send", { input }, options);
export const readParticipantPhoneLoginState = (input, options) => participantIdentityRpc("read_participant_phone_login_state", { input }, options);
export const authorizeParticipantPhoneLoginVerification = (input, options) => participantIdentityRpc("authorize_participant_phone_login_verification", { input }, options);
export const recordParticipantPhoneLoginFailure = (input, options) => participantIdentityRpc("record_participant_phone_login_failure", { input }, options);
export const completeParticipantPhoneLogin = (input, options) => participantIdentityRpc("complete_participant_phone_login", { input }, options);
export const cancelParticipantPhoneLogin = (input, options) => participantIdentityRpc("cancel_participant_phone_login", { input }, options);
export const inspectParticipantAuthIdentifierFoundation = (tournamentId, options) => participantIdentityRpc("inspect_participant_auth_identifier_foundation", {
  target_tournament_id: tournamentId,
}, options);
export const readParticipantSmsRolloutReadiness = (tournamentId, options) => participantIdentityRpc("read_participant_sms_rollout_readiness", {
  target_tournament_id: tournamentId || null,
}, options);
export const readParticipantAuthPhoneEligibility = (phoneE164, options) => participantIdentityRpc("read_participant_auth_phone_eligibility", {
  target_phone_e164: phoneE164,
}, options);
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

export const readProductionAuthCandidate = (tournamentId, options) => participantIdentityRpc(
  "read_production_auth_candidate",
  { target_tournament_id: tournamentId || null },
  options,
);
export const prepareProductionAuthCandidate = (input, options) => participantIdentityRpc(
  "prepare_production_auth_candidate",
  { input },
  options,
);
export const readProductionDirectorEntitlement = ({ authUserId, tournamentId }, options) => participantIdentityRpc(
  "read_production_director_entitlement",
  { target_auth_user_id: authUserId, target_tournament_id: tournamentId },
  options,
);
export const grantProductionDirectorEntitlement = (input, options) => participantIdentityRpc(
  "grant_production_director_entitlement",
  { input },
  options,
);
export const revokeProductionDirectorEntitlement = (input, options) => participantIdentityRpc(
  "revoke_production_director_entitlement",
  { input },
  options,
);
