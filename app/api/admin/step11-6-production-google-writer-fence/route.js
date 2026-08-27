import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  assertProductionWriterFenceDirectorAuthorization,
  authorizeProductionWriterFenceDirectorCandidateControl,
} from "../../../../lib/preview-director-authorization.js";
import { PRODUCTION_CANONICAL_HOSTNAME } from
  "../../../../lib/production-shadow-candidate.js";
import {
  normalizeProductionWriterQuiesceEvidenceInput,
  probeProductionWriterQuiesceOrigins,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA,
  PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT,
  publicProductionWriterQuiesceError,
} from "../../../../lib/production-google-writer-fence-quiesce.js";
import {
  executeProductionGoogleWriterProviderFence,
  productionGoogleWriterFenceRehearsalEnvironment,
  productionGoogleWriterProviderFenceEnvironment,
  publicProductionGoogleWriterFenceError,
  PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR,
} from "../../../../lib/production-google-writer-fence-rehearsal-server.js";
import {
  productionGoogleWriterQuiesceReceiptDependencies,
} from "../../../../lib/production-google-writer-fence-receipt-server.js";
import {
  executeProductionVercelWafProviderAction,
} from "../../../../lib/production-vercel-waf-provider-executor.js";
import {
  verifyVercelProviderAttestation,
  VERCEL_PROVIDER_ALIAS_INVENTORY_RECORD_COUNT,
  VERCEL_PROVIDER_ATTESTATION_INITIAL_MAX_AGE_SECONDS,
  VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA,
  VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV,
} from "../../../../lib/vercel-provider-attestation.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const noStore = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json(
  { error: "Not found." },
  { status: 404, headers: noStore },
);
const QUIESCE_ACTIONS = new Set([
  "issue-provider-attestation-challenge",
  "inspect-provider-attestation-challenge",
  "inspect-retained-provider-attestation-challenge",
  "abandon-provider-attestation-challenge",
  "begin-provider-quiesce",
  "finalize-provider-quiesce",
  "inspect-provider-quiesce",
]);
const PERSISTENT_ACTIONS = new Map([
  ["install-persistent-provider-fence", "install"],
  ["abort-persistent-provider-fence-install", "abort-install"],
  ["inspect-persistent-provider-fence", "inspect"],
  ["refresh-persistent-provider-fence", "refresh"],
  ["remove-persistent-provider-fence", "remove"],
]);
const REHEARSAL_ACL_ACTIONS = new Map([
  ["inspect-drive-acl-rehearsal", "inspect"],
  ["downgrade-drive-acl-rehearsal", "install"],
  ["restore-drive-acl-rehearsal", "abort-install"],
]);
const REHEARSAL_WAF_EXECUTOR_ACTIONS = new Map([
  ["recover-rejected-vercel-waf-provider-epoch", "RECOVER_REJECTED"],
  ["install-vercel-waf-provider-fence", "INSTALL"],
  ["reattest-vercel-waf-provider-fence", "REATTEST"],
  ["restore-vercel-waf-provider-baseline", "RESTORE"],
  ["retire-rejected-vercel-waf-provider-epoch", "RETIRE_REJECTED"],
]);
const INPUT_KEYS = new Set([
  "action", "confirmation", "currentVerificationId", "evidenceRequestId",
  "challengeRequestId",
  "expectedBaselineFingerprint", "expectedBranch",
  "expectedCanonicalValueFingerprint", "expectedCommitSha",
  "expectedDirectorPlayerId", "expectedWorkbookId", "fenceId",
  "installRequestId", "operationRequestId", "ownerFreezeConfirmation",
  "ownerFreezeTtlSeconds", "ownerOverrideOperationallyFrozen",
  "priorEvidenceId", "quiesceEvidenceId", "quiescePurpose",
  "providerAttestationStage", "providerChallengeId",
  "providerAttestationConsumeRequestId",
  "providerAttestation", "rehearsalRunId", "rehearsalRequestId", "routingRule",
  "providerRetainedChallenge", "abandonRequestId",
  "criticalWafEpochId",
  "criticalWafObservationId", "criticalWafQuiesceStage",
]);

async function authorize(request) {
  const director = await authorizeProductionWriterFenceDirectorCandidateControl(
    request,
  );
  try {
    return {
      director,
      actor: assertProductionWriterFenceDirectorAuthorization(director),
    };
  } catch {
    return null;
  }
}

function candidateEnvironment(environment) {
  return Object.freeze({
    ...environment,
    resources: Object.freeze({
      ...environment.resources,
      candidateDeploymentId: clean(process.env.VERCEL_DEPLOYMENT_ID),
      deploymentHostname: clean(process.env.VERCEL_URL),
    }),
  });
}

function publicControlReceipt(receipt = {}) {
  const verification = receipt.verification || null;
  const abort = receipt.abort || null;
  return Object.freeze({
    runId: clean(receipt.runId || receipt.run_id),
    fenceId: clean(receipt.fenceId || receipt.fence_id),
    installRequestId: clean(receipt.installRequestId || receipt.install_request_id),
    quiesceEvidenceId: clean(receipt.quiesceEvidenceId || receipt.quiesce_evidence_id),
    criticalWafEpochId: clean(
      receipt.criticalWafEpochId || receipt.critical_waf_epoch_id,
    ),
    activeVerificationId: clean(
      receipt.activeVerificationId || receipt.active_verification_id,
    ),
    removalRequestId: clean(receipt.removalRequestId || receipt.removal_request_id),
    abortRequestId: clean(
      abort?.abortRequestId || abort?.abort_request_id ||
        receipt.abortRequestId || receipt.abort_request_id,
    ),
    protectionDescriptionPrefix: clean(
      receipt.protectionDescriptionPrefix || receipt.protection_description_prefix,
    ),
    status: clean(receipt.status).toUpperCase(),
    certificationPassed:
      receipt.certificationPassed === true || receipt.certification_passed === true,
    installedAt: receipt.installedAt || receipt.installed_at || null,
    removalAuthorizedAt:
      receipt.removalAuthorizedAt || receipt.removal_authorized_at || null,
    removedAt: receipt.removedAt || receipt.removed_at || null,
    providerSettlementStage: clean(
      receipt.providerSettlementStage || receipt.provider_settlement_stage,
    ).toUpperCase(),
    providerSettlementLatestObservationId: clean(
      receipt.providerSettlementLatestObservationId ||
        receipt.provider_settlement_latest_observation_id,
    ),
    protectionsInstalledObservationId: clean(
      receipt.protectionsInstalledObservationId ||
        receipt.protections_installed_observation_id,
    ),
    settlementReadback1ObservationId: clean(
      receipt.settlementReadback1ObservationId ||
        receipt.settlement_readback_1_observation_id,
    ),
    settlementReadback2ObservationId: clean(
      receipt.settlementReadback2ObservationId ||
        receipt.settlement_readback_2_observation_id,
    ),
    providerSettlementNextEligibleAt:
      receipt.providerSettlementNextEligibleAt ||
        receipt.provider_settlement_next_eligible_at || null,
    providerSettlementRemainingWaitSeconds: Number(
      receipt.providerSettlementRemainingWaitSeconds ??
        receipt.provider_settlement_remaining_wait_seconds ?? 0,
    ),
    settlementStructuralCanaryFingerprint: clean(
      receipt.settlementStructuralCanaryFingerprint ||
        receipt.settlement_structural_canary_fingerprint ||
        receipt.protectionsInstalledStructuralCanaryFingerprint ||
        receipt.protections_installed_structural_canary_fingerprint,
    ),
    admissionState: clean(
      receipt.admissionState || receipt.admission_state,
    ).toUpperCase(),
    settlementCompletedAt:
      receipt.settlementCompletedAt || receipt.settlement_completed_at || null,
    admissionReservationActive:
      receipt.admissionReservationActive === true ||
        receipt.admission_reservation_active === true,
    admissionReservationState: clean(
      receipt.admissionReservationState || receipt.admission_reservation_state,
    ).toUpperCase(),
    idempotent: receipt.idempotent === true,
    abort: abort ? Object.freeze({
      abortId: clean(abort.abortId || abort.abort_id),
      abortRequestId: clean(abort.abortRequestId || abort.abort_request_id),
      requestFingerprint: clean(
        abort.requestFingerprint || abort.request_fingerprint,
      ),
      restorationEvidenceFingerprint: clean(
        abort.restorationEvidenceFingerprint ||
          abort.restoration_evidence_fingerprint,
      ),
      removedProtectedRangeIds: Array.isArray(
        abort.removedProtectedRangeIds || abort.removed_protected_range_ids,
      ) ? [
          ...(abort.removedProtectedRangeIds || abort.removed_protected_range_ids),
        ].map(Number) : [],
      activeRunOwnedProtectionCount: Number(
        abort.activeRunOwnedProtectionCount ??
          abort.active_run_owned_protection_count ?? -1,
      ),
      restoredProviderFingerprint: clean(
        abort.restoredProviderFingerprint || abort.restored_provider_fingerprint,
      ),
      restoredAclFingerprint: clean(
        abort.restoredAclFingerprint || abort.restored_acl_fingerprint,
      ),
      restoredCanonicalValueFingerprint: clean(
        abort.restoredCanonicalValueFingerprint ||
          abort.restored_canonical_value_fingerprint,
      ),
      restoredCombinedValueFingerprint: clean(
        abort.restoredCombinedValueFingerprint ||
          abort.restored_combined_value_fingerprint,
      ),
      restoredFormulaFingerprint: clean(
        abort.restoredFormulaFingerprint || abort.restored_formula_fingerprint,
      ),
      providerObservedAt:
        abort.providerObservedAt || abort.provider_observed_at || null,
      abortedAt: abort.abortedAt || abort.aborted_at || null,
    }) : null,
    verification: verification ? Object.freeze({
      verificationId: clean(verification.verification_id),
      quiesceEvidenceId: clean(verification.quiesce_evidence_id),
      protectionCount: Number(verification.protection_count),
      protectionSetFingerprint: clean(verification.protection_set_fingerprint),
      providerFingerprint: clean(verification.provider_fingerprint),
      canonicalValueFingerprint: clean(verification.canonical_value_fingerprint),
      formulaFingerprint: clean(verification.formula_fingerprint),
      expiresAt: verification.expires_at || null,
    }) : null,
  });
}

function publicQuiesceReceipt(receipt = {}) {
  return Object.freeze({
    found: receipt.found !== false,
    evidenceId: clean(receipt.evidence_id || receipt.evidenceId),
    evidenceRequestId: clean(receipt.evidence_request_id || receipt.evidenceRequestId),
    priorEvidenceId: clean(receipt.prior_evidence_id || receipt.priorEvidenceId),
    status: clean(receipt.status).toUpperCase(),
    purpose: clean(receipt.purpose).toUpperCase(),
    candidateAliasOrigin: clean(
      receipt.candidate_alias_origin || receipt.candidateAliasOrigin,
    ),
    candidateImmutableOrigin: clean(
      receipt.candidate_immutable_origin || receipt.candidateImmutableOrigin,
    ),
    originInventoryCount: Number(receipt.origin_inventory_count),
    originInventoryFingerprint: clean(receipt.origin_inventory_fingerprint),
    providerInventorySchema: clean(
      receipt.provider_inventory_schema || receipt.providerInventorySchema,
    ),
    retainedProviderInventoryCount: Number(
      receipt.retained_provider_inventory_count || receipt.retainedProviderInventoryCount,
    ),
    retainedProviderInventoryFingerprint: clean(
      receipt.retained_provider_inventory_fingerprint ||
        receipt.retainedProviderInventoryFingerprint,
    ),
    liveProviderInventoryCount: Number(
      receipt.live_provider_inventory_count || receipt.liveProviderInventoryCount,
    ),
    liveProviderInventoryFingerprint: clean(
      receipt.live_provider_inventory_fingerprint || receipt.liveProviderInventoryFingerprint,
    ),
    liveOriginInventoryCount: Number(
      receipt.live_origin_inventory_count || receipt.liveOriginInventoryCount,
    ),
    liveOriginInventoryFingerprint: clean(
      receipt.live_origin_inventory_fingerprint || receipt.liveOriginInventoryFingerprint,
    ),
    aliasRecaptureCount: Number(
      receipt.alias_recapture_count || receipt.aliasRecaptureCount,
    ),
    aliasInventoryCount: Number(
      receipt.alias_inventory_count || receipt.aliasInventoryCount,
    ),
    aliasInventoryFingerprint: clean(
      receipt.alias_inventory_fingerprint || receipt.aliasInventoryFingerprint,
    ),
    aliasPaginationPageCount: Number(
      receipt.alias_pagination_page_count || receipt.aliasPaginationPageCount,
    ),
    aliasPaginationFingerprint: clean(
      receipt.alias_pagination_fingerprint || receipt.aliasPaginationFingerprint,
    ),
    beginAliasAttestationId: clean(
      receipt.begin_alias_attestation_id || receipt.beginAliasAttestationId,
    ),
    beginAliasAttestationFingerprint: clean(
      receipt.begin_alias_attestation_fingerprint ||
        receipt.beginAliasAttestationFingerprint,
    ),
    beginAliasProviderObservedAt:
      receipt.begin_alias_provider_observed_at ||
        receipt.beginAliasProviderObservedAt || null,
    finalizeAliasAttestationId: clean(
      receipt.finalize_alias_attestation_id || receipt.finalizeAliasAttestationId,
    ),
    finalizeAliasAttestationFingerprint: clean(
      receipt.finalize_alias_attestation_fingerprint ||
        receipt.finalizeAliasAttestationFingerprint,
    ),
    finalizeAliasProviderObservedAt:
      receipt.finalize_alias_provider_observed_at ||
        receipt.finalizeAliasProviderObservedAt || null,
    routingRuleAllMethodFenceRequiredHostCount: Number(
      receipt.routing_rule_all_method_fence_required_host_count ||
        receipt.routingRuleAllMethodFenceRequiredHostCount,
    ),
    routingRuleAllMethodFenceRequiredHostsFingerprint: clean(
      receipt.routing_rule_all_method_fence_required_hosts_fingerprint ||
        receipt.routingRuleAllMethodFenceRequiredHostsFingerprint,
    ),
    routingRuleAllMethodFenceRequiredPathCount: Number(
      receipt.routing_rule_all_method_fence_required_path_count ||
        receipt.routingRuleAllMethodFenceRequiredPathCount,
    ),
    routingRuleAllMethodFenceRequiredPathsFingerprint: clean(
      receipt.routing_rule_all_method_fence_required_paths_fingerprint ||
        receipt.routingRuleAllMethodFenceRequiredPathsFingerprint,
    ),
    probeOriginCount: Number(receipt.probe_origin_count),
    probeVectorCount: Number(receipt.probe_vector_count),
    probeRecordCount: Number(receipt.probe_record_count),
    firstProbeFingerprint: clean(receipt.first_probe_fingerprint),
    secondProbeFingerprint: clean(receipt.second_probe_fingerprint),
    probeScopeFingerprint: clean(
      receipt.probe_scope_fingerprint || receipt.probeScopeFingerprint,
    ),
    deploymentScopeFingerprint: clean(receipt.deployment_scope_fingerprint),
    drainStartedAt: receipt.drain_started_at || null,
    drainCompletedAt: receipt.drain_completed_at || null,
    verifiedAt: receipt.verified_at || null,
    expiresAt: receipt.expires_at || null,
    ownerFreezeExpiresAt: receipt.owner_freeze_expires_at || null,
    idempotent: receipt.idempotent === true,
  });
}

function publicProviderAttestationChallenge(receipt = {}) {
  return Object.freeze({
    found: receipt.found !== false,
    challengeId: clean(receipt.challenge_id || receipt.challengeId),
    challengeRequestId: clean(
      receipt.challenge_request_id || receipt.challengeRequestId,
    ),
    operationRequestId: clean(
      receipt.operation_request_id || receipt.operationRequestId,
    ),
    evidenceRequestId: clean(receipt.evidence_request_id || receipt.evidenceRequestId),
    challengeRequestFingerprint: clean(
      receipt.challenge_request_fingerprint || receipt.challengeRequestFingerprint,
    ),
    stage: clean(receipt.stage).toUpperCase(),
    purpose: clean(receipt.purpose).toUpperCase(),
    status: clean(receipt.status).toUpperCase(),
    vercelProjectId: clean(receipt.vercel_project_id || receipt.vercelProjectId),
    vercelTeamId: clean(receipt.vercel_team_id || receipt.vercelTeamId),
    candidateDeploymentId: clean(
      receipt.candidate_deployment_id || receipt.candidateDeploymentId,
    ),
    candidateDeploymentCommit: clean(
      receipt.candidate_deployment_commit || receipt.candidateDeploymentCommit,
    ),
    candidateDeploymentTarget: clean(
      receipt.candidate_deployment_target || receipt.candidateDeploymentTarget,
    ).toUpperCase(),
    candidateAliasOrigin: clean(
      receipt.candidate_alias_origin || receipt.candidateAliasOrigin,
    ),
    candidateImmutableOrigin: clean(
      receipt.candidate_immutable_origin || receipt.candidateImmutableOrigin,
    ),
    routingRuleId: clean(receipt.routing_rule_id || receipt.routingRuleId),
    routingRuleConfigVersion: clean(
      receipt.routing_rule_config_version || receipt.routingRuleConfigVersion,
    ),
    issuedAt: receipt.issued_at || receipt.issuedAt || null,
    expiresAt: receipt.expires_at || receipt.expiresAt || null,
    consumedAt: receipt.consumed_at || receipt.consumedAt || null,
    consumedAttestationId: clean(
      receipt.consumed_attestation_id || receipt.consumedAttestationId,
    ),
    consumedAttestationFingerprint: clean(
      receipt.consumed_attestation_fingerprint || receipt.consumedAttestationFingerprint,
    ),
    consumedProviderAttestation:
      receipt.consumed_provider_attestation || receipt.consumedProviderAttestation || null,
    consumeRequestId: clean(receipt.consume_request_id || receipt.consumeRequestId),
    abandonedAt: receipt.abandoned_at || receipt.abandonedAt || null,
    abandonRequestId: clean(
      receipt.abandon_request_id || receipt.abandonRequestId,
    ),
    abandonRequestFingerprint: clean(
      receipt.abandon_request_fingerprint || receipt.abandonRequestFingerprint,
    ),
    abandonEligible:
      receipt.abandon_eligible === true || receipt.abandonEligible === true,
    abandonmentCode: clean(
      receipt.abandonment_code || receipt.abandonmentCode,
    ).toUpperCase(),
    abandonmentReason: clean(
      receipt.abandonment_reason || receipt.abandonmentReason,
    ).toUpperCase(),
    serverObservedAt: receipt.server_observed_at || receipt.serverObservedAt || null,
    idempotent: receipt.idempotent === true,
  });
}

function recoveredConsumedProviderAttestation(challenge) {
  const value = challenge.consumedProviderAttestation;
  const records = value?.live_origin_inventory;
  const count = Number(value?.live_origin_inventory_count);
  const fingerprint = clean(value?.live_origin_inventory_fingerprint).toLowerCase();
  const aliasRecords = value?.alias_inventory_records;
  const aliasCount = Number(value?.alias_inventory_count);
  const aliasFingerprint = clean(value?.alias_inventory_fingerprint).toLowerCase();
  const aliasPaginationPageCount = Number(value?.alias_pagination_page_count);
  const aliasPaginationFingerprint = clean(
    value?.alias_pagination_fingerprint,
  ).toLowerCase();
  const bindingExpiresAt = Date.parse(clean(value?.binding_expires_at));
  const providerObservedAt = Date.parse(clean(value?.provider_observed_at));
  const current = Date.now();
  if (!value || Array.isArray(value) || typeof value !== "object" ||
      clean(value.attestation_id).toLowerCase() !== challenge.consumedAttestationId ||
      clean(value.attestation_fingerprint).toLowerCase() !==
        challenge.consumedAttestationFingerprint ||
      clean(value.challenge_id).toLowerCase() !== challenge.challengeId ||
      clean(value.challenge_request_fingerprint).toLowerCase() !==
        challenge.challengeRequestFingerprint ||
      clean(value.operation_request_id).toLowerCase() !== challenge.operationRequestId ||
      clean(value.evidence_request_id).toLowerCase() !== challenge.evidenceRequestId ||
      clean(value.stage).toUpperCase() !== challenge.stage ||
      clean(value.purpose).toUpperCase() !== challenge.purpose ||
      value.signature_verified !== true ||
      !new Set(["RESERVED", "BOUND"]).has(clean(value.status).toUpperCase()) ||
      clean(value.vercel_project_id) !== challenge.vercelProjectId ||
      clean(value.vercel_team_id) !== challenge.vercelTeamId ||
      clean(value.candidate_deployment_id) !== challenge.candidateDeploymentId ||
      clean(value.candidate_deployment_commit).toLowerCase() !==
        challenge.candidateDeploymentCommit ||
      clean(value.candidate_deployment_target).toUpperCase() !==
        challenge.candidateDeploymentTarget ||
      clean(value.routing_rule_id) !== challenge.routingRuleId ||
      clean(value.routing_rule_config_version) !== challenge.routingRuleConfigVersion ||
      Number(value.routing_rule_pending_draft_change_count) !== 0 ||
      clean(value.routing_rule_hostname_operator).toUpperCase() !==
        "DOES_NOT_EQUAL" ||
      clean(value.routing_rule_canonical_hostname).toLowerCase() !==
        PRODUCTION_CANONICAL_HOSTNAME ||
      Number(value.routing_rule_earlier_active_bypass_rule_count) !== 0 ||
      !Array.isArray(records) || count !== records.length ||
      count < PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT ||
      !/^[0-9a-f]{64}$/.test(fingerprint) ||
      sha256(JSON.stringify(records)) !== fingerprint ||
      !Array.isArray(aliasRecords) ||
      aliasCount !== VERCEL_PROVIDER_ALIAS_INVENTORY_RECORD_COUNT ||
      aliasRecords.length !== aliasCount ||
      !/^[0-9a-f]{64}$/.test(aliasFingerprint) ||
      sha256(JSON.stringify(aliasRecords)) !== aliasFingerprint ||
      !Number.isSafeInteger(aliasPaginationPageCount) ||
      aliasPaginationPageCount < 1 ||
      !/^[0-9a-f]{64}$/.test(aliasPaginationFingerprint) ||
      clean(value.provider_inventory_schema) !==
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA ||
      Number(value.retained_origin_inventory_count) !==
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT ||
      clean(value.retained_origin_inventory_fingerprint).toLowerCase() !==
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT ||
      Number(value.retained_provider_inventory_count) !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT ||
      clean(value.retained_provider_inventory_fingerprint).toLowerCase() !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT ||
      Number(value.live_provider_inventory_count) !== count ||
      !/^[0-9a-f]{64}$/.test(
        clean(value.live_provider_inventory_fingerprint).toLowerCase(),
      ) ||
      !Number.isFinite(providerObservedAt) ||
      providerObservedAt > current + 30_000 ||
      current - providerObservedAt >
        VERCEL_PROVIDER_ATTESTATION_INITIAL_MAX_AGE_SECONDS * 1_000 ||
      !Number.isFinite(bindingExpiresAt) || bindingExpiresAt <= current) {
    const error = new Error("The durable consumed provider reservation was invalid.");
    error.code = "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RESERVATION_INVALID";
    error.status = 409;
    throw error;
  }
  return Object.freeze({
    attestationId: challenge.consumedAttestationId,
    attestationFingerprint: challenge.consumedAttestationFingerprint,
    signerKeyFingerprint: clean(value.signer_key_fingerprint).toLowerCase(),
    signerKeyVersion: clean(value.signer_key_version),
    stage: challenge.stage,
    purpose: challenge.purpose,
    challengeId: challenge.challengeId,
    challengeRequestFingerprint: challenge.challengeRequestFingerprint,
    operationRequestId: challenge.operationRequestId,
    requestFingerprint: clean(value.request_fingerprint).toLowerCase(),
    signatureVerified: true,
    vercelProjectId: challenge.vercelProjectId,
    vercelTeamId: challenge.vercelTeamId,
    candidateDeploymentId: challenge.candidateDeploymentId,
    candidateDeploymentCommit: challenge.candidateDeploymentCommit,
    candidateDeploymentTarget: challenge.candidateDeploymentTarget,
    candidateAliasOrigin: challenge.candidateAliasOrigin,
    candidateImmutableOrigin: challenge.candidateImmutableOrigin,
    routingRuleId: challenge.routingRuleId,
    routingRuleConfigVersion: challenge.routingRuleConfigVersion,
    routingRuleEtag: value.routing_rule_etag ?? null,
    routingRuleFingerprint: clean(value.routing_rule_fingerprint).toLowerCase(),
    routingRulePendingDraftChangeCount:
      Number(value.routing_rule_pending_draft_change_count),
    routingRuleHostnameOperator:
      clean(value.routing_rule_hostname_operator).toUpperCase(),
    routingRuleCanonicalHostname:
      clean(value.routing_rule_canonical_hostname).toLowerCase(),
    routingRuleEarlierActiveBypassRuleCount:
      Number(value.routing_rule_earlier_active_bypass_rule_count),
    routingRuleAllMethodFenceRequiredHostCount:
      Number(value.routing_rule_all_method_fence_required_host_count),
    routingRuleAllMethodFenceRequiredHostsFingerprint:
      clean(value.routing_rule_all_method_fence_required_hosts_fingerprint).toLowerCase(),
    routingRuleAllMethodFenceRequiredPathCount:
      Number(value.routing_rule_all_method_fence_required_path_count),
    routingRuleAllMethodFenceRequiredPathsFingerprint:
      clean(value.routing_rule_all_method_fence_required_paths_fingerprint).toLowerCase(),
    providerInventorySchema: clean(value.provider_inventory_schema),
    retainedProviderInventoryCount:
      Number(value.retained_provider_inventory_count),
    retainedProviderInventoryFingerprint:
      clean(value.retained_provider_inventory_fingerprint).toLowerCase(),
    liveProviderInventoryCount: Number(value.live_provider_inventory_count),
    liveProviderInventoryFingerprint:
      clean(value.live_provider_inventory_fingerprint).toLowerCase(),
    liveOriginInventoryCount: count,
    liveOriginInventoryFingerprint: fingerprint,
    liveOriginInventoryRecords: records,
    aliasInventoryCount: aliasCount,
    aliasInventoryFingerprint: aliasFingerprint,
    aliasInventoryRecords: aliasRecords,
    aliasPaginationPageCount,
    aliasPaginationFingerprint,
    redactedEnvironmentScopeFingerprint:
      clean(value.redacted_environment_scope_fingerprint).toLowerCase(),
    credentialConfinementEvidenceSchema:
      clean(value.credential_confinement_evidence_schema),
    credentialConfinementRecordCount:
      Number(value.credential_confinement_record_count),
    credentialConfinementRecordsFingerprint:
      clean(value.credential_confinement_records_fingerprint).toLowerCase(),
    credentialConfinementEvidenceFingerprint:
      clean(value.credential_confinement_evidence_fingerprint).toLowerCase(),
    providerObservedAt: new Date(providerObservedAt).toISOString(),
  });
}

function attesterRequestFromChallenge(challenge) {
  if (challenge.found === false) return null;
  return Object.freeze({
    schemaVersion: VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA,
    challengeId: challenge.challengeId,
    challengeRequestFingerprint: challenge.challengeRequestFingerprint,
    requestId: challenge.operationRequestId,
    stage: challenge.stage,
    purpose: challenge.purpose,
    projectId: challenge.vercelProjectId,
    teamId: challenge.vercelTeamId,
    candidateDeploymentId: challenge.candidateDeploymentId,
    candidateCommitSha: challenge.candidateDeploymentCommit,
    candidateDeploymentTarget: challenge.candidateDeploymentTarget,
    candidateAliasOrigin: challenge.candidateAliasOrigin,
    candidateImmutableOrigin: challenge.candidateImmutableOrigin,
    routingRuleId: challenge.routingRuleId,
    routingRuleConfigVersion: challenge.routingRuleConfigVersion,
  });
}

function exactExecutionInput(input, action) {
  return { ...input, action };
}

function exactWafExecutorInput(input, action) {
  return {
    action,
    criticalWafEpochId: input.criticalWafEpochId,
    fenceId: input.fenceId,
    operationRequestId: input.operationRequestId,
    quiescePurpose: "REHEARSAL",
  };
}

async function inspectOwnerFingerprint(input, dependencies) {
  const inspectionInput = exactExecutionInput(input, "inspect");
  const result = await executeProductionGoogleWriterProviderFence(
    inspectionInput,
    { authorization: dependencies.authorization },
  );
  const ownerPrincipalFingerprint = clean(
    result.inspection?.drivePermissionAudit?.ownerPrincipalFingerprint,
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(ownerPrincipalFingerprint)) {
    const error = new Error("The Drive owner identity could not be proved server-side.");
    error.code = "STEP11_6_WRITER_QUIESCE_OWNER_IDENTITY_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
  return ownerPrincipalFingerprint;
}

async function executeQuiesce(input, dependencies) {
  const purpose = clean(input.quiescePurpose).toUpperCase();
  const baseEnvironment = purpose === "REHEARSAL"
    ? productionGoogleWriterFenceRehearsalEnvironment(process.env)
    : purpose === "CUTOVER"
      ? productionGoogleWriterProviderFenceEnvironment(process.env)
      : null;
  if (!baseEnvironment?.allowed) {
    const error = new Error("The requested writer-quiesce mode is unavailable.");
    error.code = "STEP11_6_WRITER_QUIESCE_ENVIRONMENT_UNAVAILABLE";
    error.status = 404;
    throw error;
  }
  const environment = candidateEnvironment(baseEnvironment);
  if (input.action === "inspect-retained-provider-attestation-challenge" ||
      input.action === "abandon-provider-attestation-challenge") {
    const receipt = input.action === "inspect-retained-provider-attestation-challenge"
      ? await dependencies.quiesce.inspectRetainedChallenge({ input })
      : await dependencies.quiesce.abandonChallenge({ input });
    return {
      ok: true,
      action: input.action,
      challenge: publicProviderAttestationChallenge(receipt),
    };
  }
  if (input.action === "issue-provider-attestation-challenge" ||
      input.action === "inspect-provider-attestation-challenge") {
    const receipt = input.action === "issue-provider-attestation-challenge"
      ? await dependencies.quiesce.issueChallenge({ input, environment })
      : await dependencies.quiesce.inspectChallenge({ input, environment });
    const challenge = publicProviderAttestationChallenge(receipt);
    return {
      ok: true,
      action: input.action,
      challenge,
      providerAttestationRequest: attesterRequestFromChallenge(challenge),
    };
  }
  if (input.action === "inspect-provider-quiesce") {
    const receipt = await dependencies.quiesce.inspect({ input, environment });
    return { ok: true, action: input.action, quiesce: publicQuiesceReceipt(receipt) };
  }
  // Discover a previously committed receipt before requiring a new, fresh
  // provider attestation. This preserves lost-response idempotency without
  // allowing an expired proof to authorize new probes or mutations.
  const discoveryInput = input.action === "begin-provider-quiesce"
    ? { ...input, quiesceEvidenceId: "" }
    : input;
  const discovered = await dependencies.quiesce.inspect({
    input: discoveryInput,
    environment,
  });
  const discoveredStatus = clean(discovered.status).toUpperCase();
  if (discovered.found !== false && (
    input.action === "begin-provider-quiesce" || discoveredStatus === "VERIFIED"
  )) {
    return {
      ok: true,
      action: input.action,
      recoveredFromDurableReceipt: true,
      quiesce: publicQuiesceReceipt(discovered),
    };
  }
  if (input.action === "finalize-provider-quiesce" &&
      discovered.found !== false && discoveredStatus !== "DRAINING") {
    const error = new Error("The durable quiesce receipt was not finalizable.");
    error.code = "STEP11_6_WRITER_QUIESCE_STATE_INVALID";
    error.status = 409;
    throw error;
  }
  const attestationStage = input.action === "begin-provider-quiesce"
    ? "BEGIN" : "FINALIZE";
  const challengeReceipt = await dependencies.quiesce.inspectChallenge({
    input: { ...input, providerAttestationStage: attestationStage },
    environment,
  });
  const challenge = publicProviderAttestationChallenge(challengeReceipt);
  if (!challenge.found || !new Set(["ISSUED", "CONSUMED"]).has(challenge.status)) {
    const error = new Error("A fresh database-issued provider challenge was required.");
    error.code = "STEP11_6_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_REQUIRED";
    error.status = 409;
    throw error;
  }
  const attestationRequest = attesterRequestFromChallenge(challenge);
  const claimedAttestationId = clean(
    input.providerAttestation?.attestation?.attestationId,
  ).toLowerCase();
  const claimedAttestationFingerprint = clean(
    input.providerAttestation?.attestationFingerprint,
  ).toLowerCase();
  if (challenge.status === "CONSUMED" && (
    clean(input.providerAttestationConsumeRequestId).toLowerCase() !==
      challenge.consumeRequestId ||
    (input.providerAttestation && (
      claimedAttestationId !== challenge.consumedAttestationId ||
      claimedAttestationFingerprint !== challenge.consumedAttestationFingerprint
    ))
  )) {
    const error = new Error("The consumed provider reservation did not match the retry.");
    error.code = "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RESERVATION_MISMATCH";
    error.status = 409;
    throw error;
  }
  const providerAttestation = challenge.status === "CONSUMED" &&
      !input.providerAttestation
    ? recoveredConsumedProviderAttestation(challenge)
    : verifyVercelProviderAttestation(
      input.providerAttestation,
      {
        env: process.env,
        request: attestationRequest,
        expectedRoutingRuleRevision: input.routingRule?.revision,
        // A consumed reservation preserves exact lost-response idempotency; it
        // does not extend the provider/WAF observation window. BEGIN and
        // FINALIZE must each remain bound to a provider snapshot no older than
        // the normal two-minute admission policy.
        initialMaxAgeSeconds:
          VERCEL_PROVIDER_ATTESTATION_INITIAL_MAX_AGE_SECONDS,
      },
    );
  const normalized = normalizeProductionWriterQuiesceEvidenceInput(
    input,
    environment,
    { providerAttestation },
  );
  // Consume the one-time DB challenge and reserve this exact signed provider
  // evidence before the exhaustive edge probes begin. An exact retry is
  // idempotent; scope drift or reuse is rejected by the control plane.
  const providerReservation = challenge.status === "CONSUMED"
    ? challenge.consumedProviderAttestation
    : await dependencies.quiesce.reserveChallenge({
      input: { ...input, providerAttestationStage: attestationStage },
      environment,
      normalized,
      providerAttestation,
    });
  if (!new Set(["RESERVED", "BOUND"]).has(
    clean(providerReservation.status).toUpperCase(),
  )) {
    const error = new Error("The provider attestation was not durably reserved.");
    error.code = "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RESERVATION_INVALID";
    error.status = 409;
    throw error;
  }
  const probes = await probeProductionWriterQuiesceOrigins(normalized, {
    fetchImpl: globalThis.fetch,
  });
  if (input.action === "begin-provider-quiesce") {
    const serverOwnerPrincipalFingerprint = await inspectOwnerFingerprint(
      input,
      dependencies,
    );
    const receipt = await dependencies.quiesce.begin({
      input: { ...input, serverOwnerPrincipalFingerprint },
      environment,
      normalized,
      probes,
      providerReservation,
    });
    return {
      ok: true,
      action: input.action,
      quiesce: publicQuiesceReceipt(receipt),
      probeCount: probes.probeCount,
      deniedCount: probes.deniedCount,
      unresolvedProbeCount: probes.unresolvedProbeCount,
      edgeProofFingerprint: probes.edgeProofFingerprint,
    };
  }
  const receipt = await dependencies.quiesce.finalize({
    input,
    environment,
    normalized,
    probes,
    providerReservation,
  });
  return {
    ok: true,
    action: input.action,
    quiesce: publicQuiesceReceipt(receipt),
    probeCount: probes.probeCount,
    deniedCount: probes.deniedCount,
    unresolvedProbeCount: probes.unresolvedProbeCount,
    edgeProofFingerprint: probes.edgeProofFingerprint,
  };
}

export async function POST(request) {
  const authorization = await authorize(request);
  if (!authorization) return unavailable();
  if (!/^application\/json(?:;|$)/i.test(clean(request.headers.get("content-type")))) {
    return NextResponse.json({
      error: "A JSON request body is required.",
      code: "STEP11_6_GOOGLE_WRITER_FENCE_JSON_REQUIRED",
    }, { status: 415, headers: noStore });
  }
  let input;
  try { input = await request.json(); }
  catch {
    return NextResponse.json({
      error: "A valid JSON request body is required.",
      code: "STEP11_6_GOOGLE_WRITER_FENCE_JSON_INVALID",
    }, { status: 400, headers: noStore });
  }
  if (!input || Array.isArray(input) || typeof input !== "object" ||
      Object.keys(input).some((key) => !INPUT_KEYS.has(key))) {
    return NextResponse.json({
      error: "The writer-fence request contract was not exact.",
      code: "STEP11_6_GOOGLE_WRITER_FENCE_PAYLOAD_INVALID",
    }, { status: 400, headers: noStore });
  }
  const action = clean(input.action);
  if (!QUIESCE_ACTIONS.has(action) && !PERSISTENT_ACTIONS.has(action) &&
      !REHEARSAL_ACL_ACTIONS.has(action) &&
      !REHEARSAL_WAF_EXECUTOR_ACTIONS.has(action)) {
    return NextResponse.json({
      error: "The writer-fence action was invalid.",
      code: "STEP11_6_GOOGLE_WRITER_FENCE_ACTION_INVALID",
    }, { status: 400, headers: noStore });
  }
  const dependencies = {
    authorization: authorization.director,
    quiesce: productionGoogleWriterQuiesceReceiptDependencies({
      authorization: authorization.director,
    }),
  };
  try {
    let result;
    if (QUIESCE_ACTIONS.has(action)) {
      result = await executeQuiesce(input, dependencies);
    } else if (REHEARSAL_WAF_EXECUTOR_ACTIONS.has(action)) {
      const baseEnvironment = productionGoogleWriterFenceRehearsalEnvironment(
        process.env,
      );
      if (!baseEnvironment?.allowed) {
        const error = new Error("The exact writer-fence rehearsal is unavailable.");
        error.code = "STEP11_6_VERCEL_WAF_EXECUTOR_ENVIRONMENT_UNAVAILABLE";
        error.status = 404;
        throw error;
      }
      result = await executeProductionVercelWafProviderAction(
        exactWafExecutorInput(
          input,
          REHEARSAL_WAF_EXECUTOR_ACTIONS.get(action),
        ),
        {
          authorization: authorization.director,
          environment: candidateEnvironment(baseEnvironment),
        },
      );
    } else if (PERSISTENT_ACTIONS.has(action)) {
      result = await executeProductionGoogleWriterProviderFence(
        exactExecutionInput(input, PERSISTENT_ACTIONS.get(action)),
        { authorization: authorization.director },
      );
    } else {
      result = await executeProductionGoogleWriterProviderFence(
        exactExecutionInput({ ...input, quiescePurpose: "REHEARSAL" },
          REHEARSAL_ACL_ACTIONS.get(action)),
        { authorization: authorization.director },
      );
    }
    return NextResponse.json({
      ...result,
      controlReceipt: result.controlReceipt
        ? publicControlReceipt(result.controlReceipt) : undefined,
      actor: {
        playerId: PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR,
        role: "DIRECTOR",
        tournamentId: "2026",
      },
      secretsExposed: false,
      previewResourceFallback: false,
    }, { headers: noStore });
  } catch (error) {
    const payload = QUIESCE_ACTIONS.has(action)
      ? publicProductionWriterQuiesceError(error)
      : publicProductionGoogleWriterFenceError(error);
    console.error("Production Google writer-fence operation stopped safely", {
      code: payload.code,
      action: action.toLowerCase(),
      restoreRequired: payload.diagnostics?.restoreRequired === true,
    });
    return NextResponse.json(payload, {
      status: Number(error?.status || 503),
      headers: noStore,
    });
  }
}
