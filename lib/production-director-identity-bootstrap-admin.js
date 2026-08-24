import "server-only";

import {
  buildProductionDirectorIdentityBootstrap,
  productionDirectorIdentityApprovalInput,
  safeProductionDirectorIdentityBootstrap,
} from "./production-director-identity-bootstrap.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";
import {
  createProductionCandidateAuthAdminClient,
  provisionProductionCandidateAuthUser,
} from "./supabase-auth-admin.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function rpc(client, functionName, parameters) {
  const { data, error } = await client.rpc(functionName, parameters);
  if (error) throw error;
  if (data?.ok !== true) {
    const failure = new Error(`Production Director identity bootstrap failed at ${functionName}.`);
    failure.code = data?.code || "PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_FAILED";
    throw failure;
  }
  return data;
}

function currentShadowReadInput() {
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: "2026",
  };
}

/**
 * One resumable, service-role-only Step 10B bootstrap:
 *
 *   current-shadow V2 proof -> bounded identity import -> exact owner approval
 *   -> the existing collision-safe single-candidate Auth preprovisioner.
 *
 * It cannot send an OTP, grant Director entitlement, enable scoring ingress,
 * select a public read source, or create more than the one bounded Auth user.
 */
export async function bootstrapProductionDirectorIdentityAndAuthUser(
  evidence,
  { client = createProductionCandidateAuthAdminClient() } = {},
) {
  const bootstrap = buildProductionDirectorIdentityBootstrap(evidence);
  const current = await rpc(
    client,
    "read_production_current_shadow_v2_revision",
    { input: currentShadowReadInput() },
  );
  const currentSourceFingerprint = String(current?.revision?.source_fingerprint || "").trim().toLowerCase();
  if (currentSourceFingerprint !== bootstrap.currentShadowSourceFingerprint) {
    const error = new Error("Production current-shadow evidence advanced before identity bootstrap.");
    error.code = "PRODUCTION_DIRECTOR_IDENTITY_CURRENT_SHADOW_ADVANCED";
    throw error;
  }

  const imported = await rpc(
    client,
    "import_production_director_identity_projection",
    { input: bootstrap.importInput },
  );
  const runId = String(imported?.runId || "").trim();
  if (!UUID.test(runId) || imported?.sourceFingerprint !== bootstrap.identitySourceFingerprint ||
      imported?.playerId !== bootstrap.playerId || Number(imported?.contactsImported) !== 1 ||
      Number(imported?.authUsersCreated) !== 0 || imported?.googleWrite !== false ||
      imported?.previewRpcUsed !== false) {
    const error = new Error("Production identity import did not return the bounded expected result.");
    error.code = "PRODUCTION_DIRECTOR_IDENTITY_IMPORT_RESULT_INVALID";
    throw error;
  }

  const approved = await rpc(
    client,
    "approve_production_director_identity_projection",
    { input: productionDirectorIdentityApprovalInput(bootstrap, { runId }) },
  );
  if (approved?.status !== "APPROVED" || approved?.runId !== runId ||
      approved?.sourceFingerprint !== bootstrap.identitySourceFingerprint ||
      approved?.playerId !== bootstrap.playerId || Number(approved?.authUsersCreated) !== 0 ||
      approved?.googleWrite !== false || approved?.previewRpcUsed !== false) {
    const error = new Error("Production identity approval did not return the exact expected result.");
    error.code = "PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_RESULT_INVALID";
    throw error;
  }

  const provisioned = await provisionProductionCandidateAuthUser({
    email: bootstrap.email,
    playerId: bootstrap.playerId,
    tournamentId: "2026",
    sourceFingerprint: bootstrap.currentShadowSourceFingerprint,
    identitySourceFingerprint: bootstrap.identitySourceFingerprint,
  }, { client });
  const candidate = await rpc(
    client,
    "read_production_auth_candidate",
    { target_tournament_id: "2026" },
  );
  const candidateStatus = String(candidate?.status || "");
  const emailConfirmed = candidate?.emailConfirmed === true;
  const validCandidateState = (candidateStatus === "PREPARED" && !emailConfirmed) ||
    (candidateStatus === "VERIFIED" && emailConfirmed);
  if (candidate?.found !== true || !validCandidateState ||
      candidate?.playerId !== bootstrap.playerId || candidate?.authUserId !== provisioned?.user?.id ||
      Number(candidate?.authUserCount) !== 1) {
    const error = new Error("Production Auth candidate did not reach an exact certified state.");
    error.code = "PRODUCTION_AUTH_CANDIDATE_CERTIFIED_STATE_REQUIRED";
    throw error;
  }

  return Object.freeze({
    ok: true,
    contractVersion: bootstrap.contractVersion,
    evidence: safeProductionDirectorIdentityBootstrap(bootstrap),
    currentShadow: Object.freeze({
      importRunId: current.revision.import_run_id,
      sourceFingerprint: currentSourceFingerprint,
      pairingState: current.revision.pairing_state,
    }),
    identityProjection: Object.freeze({
      runId,
      status: approved.status,
      configurationRevision: Number(approved.configurationRevision),
      sourceFingerprint: approved.sourceFingerprint,
      importDuplicate: imported.duplicate === true,
      approvalDuplicate: approved.duplicate === true,
    }),
    authCandidate: Object.freeze({
      authUserId: candidate.authUserId,
      playerId: candidate.playerId,
      status: candidateStatus,
      authUserCount: Number(candidate.authUserCount),
      created: provisioned.created === true,
      emailConfirmed,
      otpSent: false,
      directorEntitlementGranted: false,
    }),
    safety: Object.freeze({
      googleWrites: 0,
      previewRpcsUsed: 0,
      otpRequests: 0,
      entitlementsGranted: 0,
      scoringAuthorityChanged: false,
      participantIdentityAuthorityChanged: false,
      publicReadSourceChanged: false,
    }),
  });
}
