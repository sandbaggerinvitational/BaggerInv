import "server-only";

import { createHash } from "node:crypto";

import {
  PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
  PRODUCTION_VERCEL_PROJECT_ID,
} from "./google-service-account-credential-context.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  .test(clean(value));
const hex64 = (value) => /^[0-9a-f]{64}$/.test(clean(value).toLowerCase());
const integer = (value) => (typeof value === "number" && Number.isSafeInteger(value)) ||
  (typeof value === "string" && /^[0-9]+$/.test(value) &&
    Number.isSafeInteger(Number(value)));

function receiptError(code, message, diagnostics = {}, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.safeDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function rpcHeaders(secret) {
  return {
    apikey: secret,
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  };
}

function safePayload(payload) {
  return Array.isArray(payload) ? payload[0] || {} : payload || {};
}

async function receiptRpc(functionName, input, {
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const allowed = new Set([
    "inspect_production_scoring_admission",
    "begin_production_google_writer_fence_rehearsal",
    "finish_production_google_writer_fence_rehearsal",
    "inspect_production_google_writer_fence_rehearsal",
    "begin_production_vercel_writer_quiesce_evidence",
    "finalize_production_vercel_writer_quiesce_evidence",
    "inspect_production_vercel_writer_quiesce_evidence",
    "issue_production_vercel_provider_attestation_challenge",
    "inspect_production_vercel_provider_attestation_challenge",
    "inspect_production_vercel_provider_challenge_abandonment",
    "abandon_production_vercel_provider_attestation_challenge",
    "consume_production_vercel_provider_attestation_challenge",
    "begin_production_google_writer_provider_fence_install",
    "finish_production_google_writer_provider_fence_install",
    "inspect_production_google_writer_provider_fence",
    "refresh_production_google_writer_provider_fence",
    "authorize_production_google_writer_provider_fence_removal",
    "finish_production_google_writer_provider_fence_removal",
  ]);
  if (!allowed.has(functionName)) {
    throw receiptError("STEP11_6_WRITER_FENCE_RECEIPT_RPC_FORBIDDEN",
      "The requested control-plane receipt operation is not allowlisted.", {}, 403);
  }
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw receiptError("STEP11_6_WRITER_FENCE_RECEIPT_CREDENTIAL_REQUIRED",
      "The Production control-plane credential is unavailable.");
  }
  let response;
  try {
    response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: rpcHeaders(secret),
      body: JSON.stringify({ input }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw receiptError("STEP11_6_WRITER_FENCE_RECEIPT_RESPONSE_UNKNOWN",
      "The authoritative receipt response was not received.", { functionName });
  }
  const payload = safePayload(await response.json().catch(() => null));
  if (!response.ok || payload.ok === false) {
    const providerCode = clean(payload.code || payload.error_code || payload.message)
      .toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 96);
    throw receiptError(
      providerCode || "STEP11_6_WRITER_FENCE_RECEIPT_REJECTED",
      "The Production control plane rejected the writer-fence receipt operation.",
      { functionName, providerStatus: response.status },
      [400, 401, 403, 409].includes(response.status) ? response.status : 503,
    );
  }
  return payload;
}

function exactScope() {
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
  };
}

function value(payload, ...names) {
  for (const name of names) {
    const selected = clean(payload?.[name]);
    if (selected) return selected;
  }
  return "";
}

function numberValue(payload, ...names) {
  for (const name of names) {
    if (integer(payload?.[name])) return Number(payload[name]);
  }
  return null;
}

function candidateIdentity(environment, env) {
  const deploymentId = clean(env.VERCEL_DEPLOYMENT_ID);
  const commit = clean(environment.resources.commitSha).toLowerCase();
  if (!/^dpl_[A-Za-z0-9]{8,64}$/.test(deploymentId) || !/^[0-9a-f]{40}$/.test(commit)) {
    throw receiptError("STEP11_6_WRITER_FENCE_CANDIDATE_IDENTITY_INVALID",
      "The candidate deployment identity is not exact.");
  }
  return { deploymentId, commit };
}

function actorIdentity(actor = {}) {
  const actorId = clean(actor.actorId);
  const authenticatedActorFingerprint = clean(
    actor.authenticatedActorFingerprint,
  ).toLowerCase();
  if (actorId !== "CB01" || !hex64(authenticatedActorFingerprint)) {
    throw receiptError(
      "STEP11_6_WRITER_FENCE_AUTHENTICATED_ACTOR_INVALID",
      "The exact authenticated Production Director identity was unavailable.",
      {},
      403,
    );
  }
  return { actorId, authenticatedActorFingerprint };
}

async function inspectAuthority(options) {
  return receiptRpc("inspect_production_scoring_admission", exactScope(), options);
}

function controlRevisions(authority) {
  const activationRevision = numberValue(authority, "activation_revision");
  const admissionRevision = numberValue(authority, "admission_revision");
  const authorityGeneration = value(authority,
    "authority_generation_id").toLowerCase();
  const admissionGeneration = value(authority,
    "admission_generation_id").toLowerCase();
  if (activationRevision === null || admissionRevision === null ||
      !uuid(authorityGeneration) || !uuid(admissionGeneration)) {
    throw receiptError("STEP11_6_WRITER_FENCE_CONTROL_STATE_INCOMPLETE",
      "The Production authority snapshot could not bind the receipt revisions.");
  }
  return {
    expected_activation_revision: activationRevision,
    expected_authority_generation: authorityGeneration,
    expected_admission_generation: admissionGeneration,
    expected_admission_revision: admissionRevision,
  };
}

function expectedControl(authority) {
  const revisions = controlRevisions(authority);
  if (authority.ok !== true || clean(authority.activation_state).toUpperCase() !== "DORMANT" ||
      clean(authority.authority).toUpperCase() !== "GOOGLE" ||
      clean(authority.scoring_authority).toUpperCase() !== "GOOGLE" ||
      authority.scoring_ingress_enabled !== false ||
      clean(authority.execution_gate).toUpperCase() !== "PAUSED" ||
      clean(authority.admission_state).toUpperCase() !== "OPEN" ||
      authority.admission_protocol_enforced !== false ||
      clean(authority.active_closure_id) ||
      numberValue(authority, "v2_unresolved") !== 0 ||
      numberValue(authority, "legacy_unclassified") !== 0 ||
      authority.first_supabase_canonical_write_possible !== false ||
      authority.first_supabase_canonical_write_observed !== false) {
    throw receiptError(
      "STEP11_6_WRITER_FENCE_CONTROL_STATE_UNSAFE",
      "The Production authority state is not safe for a dormant provider rehearsal.",
      {
        activationState: clean(authority.activation_state).toUpperCase(),
        authority: clean(authority.authority).toUpperCase(),
        admissionState: clean(authority.admission_state).toUpperCase(),
      },
      409,
    );
  }
  return revisions;
}

function originalRehearsalRequestId(input, action) {
  const selected = clean(action === "rehearse"
    ? input.operationRequestId
    : input.rehearsalRequestId).toLowerCase();
  if (!uuid(selected)) {
    throw receiptError("STEP11_6_WRITER_FENCE_REHEARSAL_REQUEST_ID_INVALID",
      "The durable rehearsal request identity was missing.", {}, 400);
  }
  return selected;
}

export function productionGoogleWriterFenceReceiptDependencies({
  env = process.env,
  fetchImpl = globalThis.fetch,
  actor = {},
} = {}) {
  const options = { env, fetchImpl };
  const authenticatedActor = actorIdentity(actor);
  return Object.freeze({
    begin: async ({ input, environment, operationRequestFingerprint,
      baselineProviderFingerprint, baselineProtectedRangesFingerprint,
      baselineCanonicalValueFingerprint, controlEvidence = {} }) => {
      const evidenceFingerprints = [controlEvidence.writerScopeFingerprint,
        controlEvidence.ownerPrincipalFingerprint,
        controlEvidence.canonicalSheetUnionFingerprint];
      if (!hex64(baselineProviderFingerprint) ||
          !hex64(baselineProtectedRangesFingerprint) ||
          !hex64(baselineCanonicalValueFingerprint) ||
          !evidenceFingerprints.every(hex64) ||
          !uuid(controlEvidence.quiesceEvidenceId)) {
        throw receiptError("STEP11_6_WRITER_FENCE_RECEIPT_BASELINE_INVALID",
          "The receipt baseline and control evidence were invalid.", {}, 400);
      }
      const [authority, candidate] = await Promise.all([
        inspectAuthority(options),
        Promise.resolve(candidateIdentity(environment, env)),
      ]);
      return receiptRpc("begin_production_google_writer_fence_rehearsal", {
        ...exactScope(),
        actor_id: authenticatedActor.actorId,
        authenticated_actor_fingerprint:
          authenticatedActor.authenticatedActorFingerprint,
        rehearsal_request_id: originalRehearsalRequestId(input, "rehearse"),
        request_fingerprint: operationRequestFingerprint,
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
        vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID,
        dedicated_google_service_account:
          PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
        ...expectedControl(authority),
        baseline_provider_fingerprint: baselineProviderFingerprint,
        baseline_protected_ranges_fingerprint: baselineProtectedRangesFingerprint,
        baseline_canonical_value_fingerprint: baselineCanonicalValueFingerprint,
        quiesce_evidence_id: clean(controlEvidence.quiesceEvidenceId).toLowerCase(),
        writer_scope_fingerprint: controlEvidence.writerScopeFingerprint,
        owner_principal_fingerprint: controlEvidence.ownerPrincipalFingerprint,
        canonical_sheet_union_fingerprint:
          controlEvidence.canonicalSheetUnionFingerprint,
      }, options);
    },
    inspect: async ({ input, environment }) => {
      const candidate = candidateIdentity(environment, env);
      const runId = clean(input.rehearsalRunId).toLowerCase();
      if (!uuid(runId)) {
        throw receiptError("STEP11_6_WRITER_FENCE_RECEIPT_RUN_ID_INVALID",
          "The exact rehearsal run identity was missing.", {}, 400);
      }
      return receiptRpc("inspect_production_google_writer_fence_rehearsal", {
        ...exactScope(),
        run_id: runId,
        rehearsal_request_id: originalRehearsalRequestId(input, "restore"),
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
      }, options);
    },
    finish: async (details) => {
      const { input, environment, operationRequestFingerprint, controlReceipt } = details;
      const candidate = candidateIdentity(environment, env);
      const runId = value(controlReceipt, "runId", "run_id").toLowerCase();
      const descriptionPrefix = value(controlReceipt,
        "protectionDescriptionPrefix", "protection_description_prefix");
      const outcome = clean(details.outcome).toUpperCase();
      const finishFingerprint = sha256([
        "step11-6-writer-fence-finish-v1",
        operationRequestFingerprint,
        runId,
        outcome,
      ].join("\n"));
      const payload = {
        ...exactScope(),
        actor_id: authenticatedActor.actorId,
        run_id: runId,
        rehearsal_request_id: originalRehearsalRequestId(input,
          clean(input.action).toLowerCase() === "rehearse" ? "rehearse" : "restore"),
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
        request_fingerprint: finishFingerprint,
        outcome,
        failure_code: clean(details.failureCode),
        provider_evidence_fingerprint: clean(details.providerEvidenceFingerprint),
        fenced_provider_fingerprint: clean(details.fencedProviderFingerprint),
        restored_provider_fingerprint: clean(details.restoredProviderFingerprint),
        restored_protected_ranges_fingerprint: clean(details.restoredProtectedRangesFingerprint),
        restored_canonical_value_fingerprint:
          clean(details.restoredCanonicalValueFingerprint),
        restoration_evidence_fingerprint: clean(details.restorationEvidenceFingerprint),
        run_owned_protection_ids: details.runOwnedProtectionIds || [],
        active_run_owned_protection_count: Number(details.activeRunOwnedProtectionCount),
        dedicated_identity_can_edit: details.dedicatedIdentityCanEdit === true,
        legacy_identity_denied: details.legacyIdentityDenied === true,
        google_value_writes_performed: false,
        preview_resources_accessed: false,
        restoration_confirmed: details.restorationConfirmed === true,
        protection_description_prefix: descriptionPrefix,
      };
      return receiptRpc("finish_production_google_writer_fence_rehearsal", payload, options);
    },
  });
}

function exactUuid(value, code) {
  const selected = clean(value).toLowerCase();
  if (!uuid(selected)) {
    throw receiptError(code, "A durable control-plane identity was invalid.", {}, 400);
  }
  return selected;
}

function receiptFingerprint(label, fields) {
  return sha256(`${label}\n${JSON.stringify(fields)}`);
}

function quiesceCandidate(environment, env) {
  const candidate = candidateIdentity(environment, env);
  return {
    ...candidate,
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
  };
}

function verifiedProviderAttestationPayload(value, expectedStage) {
  if (!value || value.signatureVerified !== true ||
      clean(value.stage).toUpperCase() !== expectedStage) {
    throw receiptError(
      "STEP11_6_VERCEL_PROVIDER_ATTESTATION_REQUIRED",
      "A fresh signed Vercel provider attestation was required.",
      {},
      400,
    );
  }
  return {
    attestation_id: clean(value.attestationId).toLowerCase(),
    attestation_fingerprint: clean(value.attestationFingerprint).toLowerCase(),
    signer_key_fingerprint: clean(value.signerKeyFingerprint).toLowerCase(),
    signer_key_version: clean(value.signerKeyVersion),
    stage: clean(value.stage).toUpperCase(),
    purpose: clean(value.purpose).toUpperCase(),
    challenge_id: clean(value.challengeId).toLowerCase(),
    challenge_request_fingerprint:
      clean(value.challengeRequestFingerprint).toLowerCase(),
    operation_request_id: clean(value.operationRequestId).toLowerCase(),
    request_fingerprint: clean(value.requestFingerprint).toLowerCase(),
    signature_verified: true,
    vercel_project_id: clean(value.vercelProjectId),
    vercel_team_id: clean(value.vercelTeamId),
    candidate_deployment_id: clean(value.candidateDeploymentId),
    candidate_deployment_commit: clean(value.candidateDeploymentCommit).toLowerCase(),
    candidate_deployment_target: clean(value.candidateDeploymentTarget).toUpperCase(),
    routing_rule_id: clean(value.routingRuleId),
    routing_rule_config_version: clean(value.routingRuleConfigVersion),
    routing_rule_etag: clean(value.routingRuleEtag) || null,
    routing_rule_fingerprint: clean(value.routingRuleFingerprint).toLowerCase(),
    routing_rule_pending_draft_change_count:
      Number(value.routingRulePendingDraftChangeCount),
    live_origin_inventory_count: Number(value.liveOriginInventoryCount),
    live_origin_inventory_fingerprint:
      clean(value.liveOriginInventoryFingerprint).toLowerCase(),
    redacted_environment_scope_fingerprint:
      clean(value.redactedEnvironmentScopeFingerprint).toLowerCase(),
    credential_confinement_evidence_schema:
      clean(value.credentialConfinementEvidenceSchema),
    credential_confinement_record_count:
      Number(value.credentialConfinementRecordCount),
    credential_confinement_records_fingerprint:
      clean(value.credentialConfinementRecordsFingerprint).toLowerCase(),
    credential_confinement_evidence_fingerprint:
      clean(value.credentialConfinementEvidenceFingerprint).toLowerCase(),
    provider_observed_at: value.providerObservedAt,
  };
}

/** Durable two-snapshot Vercel edge quiesce receipt. */
export function productionGoogleWriterQuiesceReceiptDependencies({
  env = process.env,
  fetchImpl = globalThis.fetch,
  actor = {},
} = {}) {
  const options = { env, fetchImpl };
  const authenticatedActor = actorIdentity(actor);
  function challengeCandidate(environment) {
    const candidate = quiesceCandidate(environment, env);
    const aliasOrigin = `https://${clean(environment.resources.candidateHostname).toLowerCase()}`;
    const immutableOrigin = `https://${clean(environment.resources.deploymentHostname).toLowerCase()}`;
    const target = clean(env.VERCEL_ENV).toLowerCase() === "production"
      ? "PRODUCTION" : "PREVIEW";
    if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(aliasOrigin) ||
        !/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(immutableOrigin) ||
        aliasOrigin === immutableOrigin) {
      throw receiptError(
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_CANDIDATE_INVALID",
        "The exact Vercel candidate origins were unavailable.", {}, 400,
      );
    }
    return { ...candidate, aliasOrigin, immutableOrigin, target };
  }
  function challengeScope(input, environment) {
    const candidate = challengeCandidate(environment);
    const stage = clean(input.providerAttestationStage).toUpperCase();
    const purpose = clean(input.quiescePurpose).toUpperCase();
    const rule = input.routingRule || {};
    const teamId = clean(env.PRODUCTION_VERCEL_PROVIDER_ATTESTATION_TEAM_ID);
    if (!new Set(["BEGIN", "FINALIZE"]).has(stage) ||
        !new Set(["REHEARSAL", "CUTOVER"]).has(purpose) ||
        !/^team_[A-Za-z0-9]{8,80}$/.test(teamId) ||
        clean(rule.projectId) !== PRODUCTION_VERCEL_PROJECT_ID ||
        !/^[A-Za-z0-9._:-]{3,200}$/.test(clean(rule.ruleId)) ||
        !/^[A-Za-z0-9._:-]{1,200}$/.test(clean(rule.revision)) ||
        clean(rule.scope) !== "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE") {
      throw receiptError(
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_SCOPE_INVALID",
        "The Vercel provider-attestation challenge scope was invalid.", {}, 400,
      );
    }
    return { candidate, stage, purpose, rule, teamId };
  }
  function retainedChallengeScope(input) {
    const challenge = input.providerRetainedChallenge || {};
    const stage = clean(challenge.stage).toUpperCase();
    const purpose = clean(challenge.purpose).toUpperCase();
    const challengeId = clean(challenge.challengeId).toLowerCase();
    const challengeRequestId = clean(challenge.challengeRequestId).toLowerCase();
    const operationRequestId = clean(challenge.operationRequestId).toLowerCase();
    const evidenceRequestId = clean(challenge.evidenceRequestId).toLowerCase();
    const candidateDeploymentId = clean(challenge.candidateDeploymentId);
    const candidateDeploymentCommit = clean(
      challenge.candidateDeploymentCommit,
    ).toLowerCase();
    const candidateDeploymentTarget = clean(
      challenge.candidateDeploymentTarget,
    ).toUpperCase();
    const candidateAliasOrigin = clean(challenge.candidateAliasOrigin).toLowerCase();
    const candidateImmutableOrigin = clean(
      challenge.candidateImmutableOrigin,
    ).toLowerCase();
    const routingRuleId = clean(challenge.routingRuleId);
    const routingRuleConfigVersion = clean(challenge.routingRuleConfigVersion);
    const teamId = clean(challenge.vercelTeamId);
    if (!challenge || Array.isArray(challenge) || typeof challenge !== "object" ||
        stage !== "BEGIN" || !new Set(["REHEARSAL", "CUTOVER"]).has(purpose) ||
        !uuid(challengeId) || !uuid(challengeRequestId) ||
        !uuid(operationRequestId) || !uuid(evidenceRequestId) ||
        operationRequestId !== clean(input.operationRequestId).toLowerCase() ||
        evidenceRequestId !== clean(input.evidenceRequestId).toLowerCase() ||
        challengeRequestId !== clean(input.challengeRequestId).toLowerCase() ||
        challengeId !== clean(input.providerChallengeId).toLowerCase() ||
        clean(input.providerAttestationStage).toUpperCase() !== "BEGIN" ||
        clean(input.quiescePurpose).toUpperCase() !== purpose ||
        clean(challenge.vercelProjectId) !== PRODUCTION_VERCEL_PROJECT_ID ||
        !/^team_[A-Za-z0-9]{8,80}$/.test(teamId) ||
        !/^dpl_[A-Za-z0-9]{8,64}$/.test(candidateDeploymentId) ||
        !/^[0-9a-f]{40}$/.test(candidateDeploymentCommit) ||
        !new Set(["PREVIEW", "PRODUCTION"]).has(candidateDeploymentTarget) ||
        !/^https:\/\/[a-z0-9.-]+$/.test(candidateAliasOrigin) ||
        !/^https:\/\/[a-z0-9.-]+$/.test(candidateImmutableOrigin) ||
        !/^[A-Za-z0-9._:-]{3,160}$/.test(routingRuleId) ||
        !/^[A-Za-z0-9._:-]{1,160}$/.test(routingRuleConfigVersion)) {
      throw receiptError(
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RETAINED_CHALLENGE_INVALID",
        "The retained provider challenge binding was invalid.", {}, 400,
      );
    }
    return {
      challengeId, challengeRequestId, operationRequestId, evidenceRequestId,
      stage, purpose, candidateDeploymentId, candidateDeploymentCommit,
      candidateDeploymentTarget, candidateAliasOrigin, candidateImmutableOrigin,
      routingRuleId, routingRuleConfigVersion, teamId,
    };
  }
  function retainedChallengePayload(input) {
    const scope = retainedChallengeScope(input);
    return {
      ...exactScope(),
      actor_id: authenticatedActor.actorId,
      authenticated_actor_fingerprint:
        authenticatedActor.authenticatedActorFingerprint,
      challenge_id: scope.challengeId,
      challenge_request_id: scope.challengeRequestId,
      operation_request_id: scope.operationRequestId,
      evidence_request_id: scope.evidenceRequestId,
      purpose: scope.purpose,
      stage: scope.stage,
      candidate_deployment_id: scope.candidateDeploymentId,
      candidate_deployment_commit: scope.candidateDeploymentCommit,
      candidate_deployment_target: scope.candidateDeploymentTarget,
      candidate_alias_origin: scope.candidateAliasOrigin,
      candidate_immutable_origin: scope.candidateImmutableOrigin,
      vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID,
      vercel_team_id: scope.teamId,
      routing_rule_id: scope.routingRuleId,
      routing_rule_config_version: scope.routingRuleConfigVersion,
      routing_rule_scope: "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
    };
  }
  return Object.freeze({
    issueChallenge: async ({ input, environment }) => {
      const scope = challengeScope(input, environment);
      const challengeRequestId = exactUuid(input.challengeRequestId,
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_REQUEST_INVALID");
      const operationRequestId = exactUuid(input.operationRequestId,
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_OPERATION_REQUEST_INVALID");
      const evidenceRequestId = exactUuid(input.evidenceRequestId,
        "STEP11_6_WRITER_QUIESCE_REQUEST_ID_INVALID");
      const payload = {
        ...exactScope(),
        actor_id: authenticatedActor.actorId,
        authenticated_actor_fingerprint:
          authenticatedActor.authenticatedActorFingerprint,
        challenge_request_id: challengeRequestId,
        operation_request_id: operationRequestId,
        evidence_request_id: evidenceRequestId,
        purpose: scope.purpose,
        stage: scope.stage,
        candidate_deployment_id: scope.candidate.deploymentId,
        candidate_deployment_commit: scope.candidate.commit,
        candidate_deployment_target: scope.candidate.target,
        candidate_alias_origin: scope.candidate.aliasOrigin,
        candidate_immutable_origin: scope.candidate.immutableOrigin,
        vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID,
        vercel_team_id: scope.teamId,
        routing_rule_id: clean(scope.rule.ruleId),
        routing_rule_config_version: clean(scope.rule.revision),
        routing_rule_scope: "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
      };
      payload.request_fingerprint = receiptFingerprint(
        "production-vercel-provider-attestation-challenge-issue-v1",
        payload,
      );
      return receiptRpc(
        "issue_production_vercel_provider_attestation_challenge",
        payload,
        options,
      );
    },
    inspectChallenge: async ({ input, environment }) => {
      const scope = challengeScope(input, environment);
      return receiptRpc(
        "inspect_production_vercel_provider_attestation_challenge",
        {
          ...exactScope(),
          actor_id: authenticatedActor.actorId,
          authenticated_actor_fingerprint:
            authenticatedActor.authenticatedActorFingerprint,
          challenge_id: clean(input.providerChallengeId).toLowerCase() || null,
          operation_request_id: exactUuid(input.operationRequestId,
            "STEP11_6_VERCEL_PROVIDER_ATTESTATION_OPERATION_REQUEST_INVALID"),
          evidence_request_id: exactUuid(input.evidenceRequestId,
            "STEP11_6_WRITER_QUIESCE_REQUEST_ID_INVALID"),
          purpose: scope.purpose,
          stage: scope.stage,
          candidate_deployment_id: scope.candidate.deploymentId,
          candidate_deployment_commit: scope.candidate.commit,
          candidate_deployment_target: scope.candidate.target,
        },
        options,
      );
    },
    inspectRetainedChallenge: async ({ input }) => receiptRpc(
      "inspect_production_vercel_provider_challenge_abandonment",
      retainedChallengePayload(input),
      options,
    ),
    abandonChallenge: async ({ input }) => {
      const payload = {
        ...retainedChallengePayload(input),
        abandon_request_id: exactUuid(
          input.abandonRequestId,
          "STEP11_6_VERCEL_PROVIDER_ATTESTATION_ABANDON_REQUEST_INVALID",
        ),
        abandonment_reason: "EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED",
      };
      payload.request_fingerprint = receiptFingerprint(
        "production-vercel-provider-attestation-challenge-abandon-v1",
        payload,
      );
      return receiptRpc(
        "abandon_production_vercel_provider_attestation_challenge",
        payload,
        options,
      );
    },
    reserveChallenge: async ({ input, environment, normalized, providerAttestation }) => {
      const scope = challengeScope(input, environment);
      const attestation = verifiedProviderAttestationPayload(
        providerAttestation,
        scope.stage,
      );
      const consumeRequestId = exactUuid(
        input.providerAttestationConsumeRequestId,
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_CONSUME_REQUEST_INVALID",
      );
      const challengeId = exactUuid(
        input.providerChallengeId,
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ID_INVALID",
      );
      const challengeRequestId = exactUuid(
        input.challengeRequestId,
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_REQUEST_INVALID",
      );
      const operationRequestId = exactUuid(
        input.operationRequestId,
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_OPERATION_REQUEST_INVALID",
      );
      const evidenceRequestId = exactUuid(
        input.evidenceRequestId,
        "STEP11_6_WRITER_QUIESCE_REQUEST_ID_INVALID",
      );
      const payload = {
        ...exactScope(),
        actor_id: authenticatedActor.actorId,
        authenticated_actor_fingerprint:
          authenticatedActor.authenticatedActorFingerprint,
        consume_request_id: consumeRequestId,
        challenge_id: challengeId,
        challenge_request_id: challengeRequestId,
        operation_request_id: operationRequestId,
        evidence_request_id: evidenceRequestId,
        purpose: scope.purpose,
        stage: scope.stage,
        candidate_deployment_id: scope.candidate.deploymentId,
        candidate_deployment_commit: scope.candidate.commit,
        candidate_deployment_target: scope.candidate.target,
        origin_inventory: normalized.originInventoryTuples,
        live_origin_inventory: normalized.liveOriginInventoryTuples,
        provider_attestation: attestation,
      };
      payload.request_fingerprint = receiptFingerprint(
        "production-vercel-provider-attestation-consume-v1",
        payload,
      );
      return receiptRpc(
        "consume_production_vercel_provider_attestation_challenge",
        payload,
        options,
      );
    },
    begin: async ({ input, environment, normalized, probes, providerReservation }) => {
      const candidate = quiesceCandidate(environment, env);
      const evidenceRequestId = exactUuid(
        input.evidenceRequestId,
        "STEP11_6_WRITER_QUIESCE_REQUEST_ID_INVALID",
      );
      const ownerPrincipalFingerprint = clean(
        input.serverOwnerPrincipalFingerprint,
      ).toLowerCase();
      const ownerFreezeTtlSeconds = Number(input.ownerFreezeTtlSeconds);
      const expectedConfirmation = normalized.purpose === "CUTOVER"
        ? "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS CUTOVER"
        : "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL";
      if (!hex64(ownerPrincipalFingerprint) ||
          input.ownerOverrideOperationallyFrozen !== true ||
          clean(input.ownerFreezeConfirmation) !== expectedConfirmation ||
          !Number.isInteger(ownerFreezeTtlSeconds) ||
          ownerFreezeTtlSeconds !== 1800) {
        throw receiptError(
          "STEP11_6_WRITER_QUIESCE_OWNER_EVIDENCE_INVALID",
          "The server-derived owner identity and explicit owner freeze were required.",
          {},
          400,
        );
      }
      const routingRule = normalized.routingRule;
      const attestationId = exactUuid(
        value(providerReservation, "attestation_id", "attestationId"),
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RESERVATION_INVALID",
      );
      const attestationFingerprint = value(
        providerReservation,
        "attestation_fingerprint",
        "attestationFingerprint",
      ).toLowerCase();
      if (!hex64(attestationFingerprint)) {
        throw receiptError(
          "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RESERVATION_INVALID",
          "The reserved provider attestation was invalid.", {}, 409,
        );
      }
      const requestFingerprint = receiptFingerprint(
        "production-vercel-writer-quiesce-begin-v1",
        {
          evidenceRequestId,
          priorEvidenceId: clean(input.priorEvidenceId).toLowerCase(),
          candidate,
          routingRule,
          originInventoryFingerprint: normalized.originInventoryFingerprint,
          firstProbeFingerprint: probes.probeFingerprint,
          ownerPrincipalFingerprint,
          ownerFreezeTtlSeconds,
          providerAttestationFingerprint: attestationFingerprint,
          credentialConfinementEvidenceFingerprint:
            normalized.credentialConfinementEvidenceFingerprint,
        },
      );
      return receiptRpc("begin_production_vercel_writer_quiesce_evidence", {
        ...exactScope(),
        evidence_request_id: evidenceRequestId,
        prior_evidence_id: clean(input.priorEvidenceId).toLowerCase() || null,
        request_fingerprint: requestFingerprint,
        actor_id: authenticatedActor.actorId,
        authenticated_actor_fingerprint:
          authenticatedActor.authenticatedActorFingerprint,
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
        candidate_deployment_target: normalized.candidateDeploymentTarget,
        vercel_project_id: candidate.projectId,
        routing_rule_id: routingRule.ruleId,
        routing_rule_revision: routingRule.revision,
        routing_rule_scope: routingRule.scope,
        purpose: normalized.purpose,
        main_branch_alias_origin: normalized.mainBranchAliasOrigin,
        candidate_alias_origin: normalized.candidateAliasOrigin,
        candidate_immutable_origin: normalized.candidateImmutableOrigin,
        candidate_credential_generation: normalized.candidateCredentialGeneration,
        // Exact artifact tuples and compact per-origin vector proofs avoid a
        // multi-megabyte repeated origin×method×path request body. The RPC
        // expands and validates the frozen nine-vector coverage server-side.
        origin_inventory: normalized.originInventoryTuples,
        live_origin_inventory: normalized.liveOriginInventoryTuples,
        first_probe_records: probes.probeRecords,
        provider_attestation: {
          attestation_id: attestationId,
          attestation_fingerprint: attestationFingerprint,
        },
        credential_confinement_evidence_schema:
          normalized.credentialConfinementEvidenceSchema,
        credential_confinement_record_count:
          normalized.credentialConfinementRecordCount,
        credential_confinement_records_fingerprint:
          normalized.credentialConfinementRecordsFingerprint,
        credential_confinement_evidence_fingerprint:
          normalized.credentialConfinementEvidenceFingerprint,
        owner_principal_fingerprint: ownerPrincipalFingerprint,
        owner_override_operationally_frozen: true,
        owner_freeze_ttl_seconds: ownerFreezeTtlSeconds,
      }, options);
    },
    finalize: async ({ input, environment, normalized, probes, providerReservation }) => {
      const candidate = quiesceCandidate(environment, env);
      const evidenceId = exactUuid(input.quiesceEvidenceId,
        "STEP11_6_WRITER_QUIESCE_EVIDENCE_ID_INVALID");
      const evidenceRequestId = exactUuid(input.evidenceRequestId,
        "STEP11_6_WRITER_QUIESCE_REQUEST_ID_INVALID");
      const routingRule = normalized.routingRule;
      const attestationId = exactUuid(
        value(providerReservation, "attestation_id", "attestationId"),
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RESERVATION_INVALID",
      );
      const attestationFingerprint = value(
        providerReservation,
        "attestation_fingerprint",
        "attestationFingerprint",
      ).toLowerCase();
      if (!hex64(attestationFingerprint)) {
        throw receiptError(
          "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RESERVATION_INVALID",
          "The reserved provider attestation was invalid.", {}, 409,
        );
      }
      const requestFingerprint = receiptFingerprint(
        "production-vercel-writer-quiesce-finalize-v1",
        {
          evidenceId,
          evidenceRequestId,
          candidate,
          routingRule,
          purpose: normalized.purpose,
          secondProbeFingerprint: probes.probeFingerprint,
          providerAttestationFingerprint: attestationFingerprint,
          credentialConfinementEvidenceFingerprint:
            normalized.credentialConfinementEvidenceFingerprint,
        },
      );
      return receiptRpc("finalize_production_vercel_writer_quiesce_evidence", {
        ...exactScope(),
        evidence_id: evidenceId,
        evidence_request_id: evidenceRequestId,
        request_fingerprint: requestFingerprint,
        actor_id: authenticatedActor.actorId,
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
        candidate_deployment_target: normalized.candidateDeploymentTarget,
        vercel_project_id: candidate.projectId,
        routing_rule_id: routingRule.ruleId,
        routing_rule_revision: routingRule.revision,
        routing_rule_scope: routingRule.scope,
        purpose: normalized.purpose,
        main_branch_alias_origin: normalized.mainBranchAliasOrigin,
        candidate_alias_origin: normalized.candidateAliasOrigin,
        candidate_immutable_origin: normalized.candidateImmutableOrigin,
        candidate_credential_generation: normalized.candidateCredentialGeneration,
        live_origin_inventory: normalized.liveOriginInventoryTuples,
        second_probe_records: probes.probeRecords,
        provider_attestation: {
          attestation_id: attestationId,
          attestation_fingerprint: attestationFingerprint,
        },
        credential_confinement_evidence_schema:
          normalized.credentialConfinementEvidenceSchema,
        credential_confinement_record_count:
          normalized.credentialConfinementRecordCount,
        credential_confinement_records_fingerprint:
          normalized.credentialConfinementRecordsFingerprint,
        credential_confinement_evidence_fingerprint:
          normalized.credentialConfinementEvidenceFingerprint,
      }, options);
    },
    inspect: async ({ input, environment }) => {
      const candidate = quiesceCandidate(environment, env);
      return receiptRpc("inspect_production_vercel_writer_quiesce_evidence", {
        ...exactScope(),
        evidence_id: clean(input.quiesceEvidenceId).toLowerCase() || null,
        evidence_request_id: exactUuid(input.evidenceRequestId,
          "STEP11_6_WRITER_QUIESCE_REQUEST_ID_INVALID"),
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
      }, options);
    },
  });
}

function providerOwnership(receipt, input, environment, env) {
  const candidate = candidateIdentity(environment, env);
  const fenceId = exactUuid(value(receipt, "fence_id", "fenceId"),
    "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ID_INVALID");
  const installRequestId = exactUuid(
    value(receipt, "install_request_id", "installRequestId"),
    "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ID_INVALID",
  );
  const expectedInstallRequestId = clean(
    input.installRequestId || input.operationRequestId,
  ).toLowerCase();
  if (installRequestId !== expectedInstallRequestId ||
      value(receipt, "candidate_deployment_id", "candidateDeploymentId") !==
        candidate.deploymentId ||
      value(receipt, "candidate_deployment_commit", "candidateDeploymentCommit")
        .toLowerCase() !== candidate.commit) {
    throw receiptError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_OWNERSHIP_MISMATCH",
      "The durable provider-fence ownership did not match this candidate.",
      {},
      409,
    );
  }
  return { candidate, fenceId, installRequestId };
}

function providerRequestFingerprint(label, operationRequestFingerprint, ...values) {
  return receiptFingerprint(label, { operationRequestFingerprint, values });
}

/** Durable Step-12-only provider fence control. */
export function productionGoogleWriterProviderFenceControlDependencies({
  env = process.env,
  fetchImpl = globalThis.fetch,
  actor = {},
} = {}) {
  const options = { env, fetchImpl };
  const authenticatedActor = actorIdentity(actor);
  const actorFields = {
    actor_id: authenticatedActor.actorId,
    authenticated_actor_fingerprint:
      authenticatedActor.authenticatedActorFingerprint,
  };
  return Object.freeze({
    discoverInstall: async ({ input, environment }) => {
      const candidate = candidateIdentity(environment, env);
      return receiptRpc("inspect_production_google_writer_provider_fence", {
        ...exactScope(),
        install_request_id: exactUuid(input.operationRequestId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ID_INVALID"),
        fence_id: null,
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
      }, options);
    },
    beginInstall: async (details) => {
      const { input, environment, operationRequestFingerprint } = details;
      const candidate = candidateIdentity(environment, env);
      return receiptRpc("begin_production_google_writer_provider_fence_install", {
        ...exactScope(),
        install_request_id: exactUuid(input.operationRequestId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ID_INVALID"),
        request_fingerprint: operationRequestFingerprint,
        ...actorFields,
        quiesce_evidence_id: exactUuid(input.quiesceEvidenceId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID"),
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
        dedicated_principal_fingerprint: details.dedicatedPrincipalFingerprint,
        legacy_credential_generation_fingerprint:
          details.legacyCredentialGenerationFingerprint,
        baseline_provider_fingerprint: details.baselineProviderFingerprint,
        baseline_acl_fingerprint: details.baselineAclFingerprint,
        baseline_canonical_value_fingerprint:
          details.baselineCanonicalValueFingerprint,
        baseline_formula_fingerprint: details.baselineFormulaFingerprint,
        baseline_combined_value_fingerprint:
          details.baselineCombinedValueFingerprint,
        writer_scope_fingerprint: details.writerScopeFingerprint,
        canonical_sheet_union_fingerprint:
          details.canonicalSheetUnionFingerprint,
      }, options);
    },
    finishInstall: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const quiesceEvidenceId = exactUuid(
        details.input.quiesceEvidenceId,
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
      );
      return receiptRpc("finish_production_google_writer_provider_fence_install", {
        ...exactScope(),
        fence_id: ownership.fenceId,
        install_request_id: ownership.installRequestId,
        quiesce_evidence_id: quiesceEvidenceId,
        request_fingerprint: providerRequestFingerprint(
          "production-google-writer-provider-fence-finish-install-v1",
          details.operationRequestFingerprint,
          details.installedProviderFingerprint,
          details.installedCanonicalValueFingerprint,
          details.installedFormulaFingerprint,
        ),
        actor_id: authenticatedActor.actorId,
        candidate_deployment_id: ownership.candidate.deploymentId,
        candidate_deployment_commit: ownership.candidate.commit,
        protection_description_prefix: value(
          details.controlReceipt,
          "protection_description_prefix",
          "protectionDescriptionPrefix",
        ),
        protection_records: details.protectionRecords,
        provider_fingerprint: details.installedProviderFingerprint,
        acl_fingerprint: details.installedAclFingerprint,
        canonical_value_fingerprint: details.installedCanonicalValueFingerprint,
        formula_fingerprint: details.installedFormulaFingerprint,
        combined_value_fingerprint: details.installedCombinedValueFingerprint,
        permission_inventory_fingerprint: details.permissionInventoryFingerprint,
        structural_canary_fingerprint: details.structuralCanaryFingerprint,
      }, options);
    },
    inspect: async ({ input, environment }) => {
      const candidate = candidateIdentity(environment, env);
      return receiptRpc("inspect_production_google_writer_provider_fence", {
        ...exactScope(),
        install_request_id: exactUuid(input.installRequestId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ID_INVALID"),
        fence_id: clean(input.fenceId).toLowerCase() || null,
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
      }, options);
    },
    refresh: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      return receiptRpc("refresh_production_google_writer_provider_fence", {
        ...exactScope(),
        fence_id: ownership.fenceId,
        install_request_id: ownership.installRequestId,
        quiesce_evidence_id: exactUuid(details.input.quiesceEvidenceId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID"),
        provider_fence_verification_id: exactUuid(
          details.input.currentVerificationId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_VERIFICATION_ID_INVALID",
        ),
        request_fingerprint: details.operationRequestFingerprint,
        actor_id: authenticatedActor.actorId,
        candidate_deployment_id: ownership.candidate.deploymentId,
        candidate_deployment_commit: ownership.candidate.commit,
        protection_description_prefix: value(details.controlReceipt,
          "protection_description_prefix", "protectionDescriptionPrefix"),
        protection_records: details.protectionRecords,
        provider_fingerprint: details.providerFingerprint,
        acl_fingerprint: details.aclFingerprint,
        canonical_value_fingerprint: details.canonicalValueFingerprint,
        formula_fingerprint: details.formulaFingerprint,
        combined_value_fingerprint: details.combinedValueFingerprint,
        permission_inventory_fingerprint: details.permissionInventoryFingerprint,
        structural_canary_fingerprint: details.structuralCanaryFingerprint,
      }, options);
    },
    authorizeRemoval: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const authority = await inspectAuthority(options);
      const expected = controlRevisions(authority);
      return receiptRpc(
        "authorize_production_google_writer_provider_fence_removal",
        {
          ...exactScope(),
          fence_id: ownership.fenceId,
          install_request_id: ownership.installRequestId,
          quiesce_evidence_id: exactUuid(
            details.input.quiesceEvidenceId,
            "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
          ),
          provider_fence_verification_id: exactUuid(
            details.input.currentVerificationId,
            "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_VERIFICATION_ID_INVALID",
          ),
          removal_request_id: exactUuid(details.input.operationRequestId,
            "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_ID_INVALID"),
          request_fingerprint: details.operationRequestFingerprint,
          ...actorFields,
          candidate_deployment_id: ownership.candidate.deploymentId,
          candidate_deployment_commit: ownership.candidate.commit,
          ...expected,
          pre_remove_provider_fingerprint: details.currentProviderFingerprint,
          expected_post_remove_provider_fingerprint:
            details.currentProviderWithoutFenceFingerprint,
          pre_remove_acl_fingerprint: details.currentAclFingerprint,
          pre_remove_canonical_value_fingerprint:
            details.currentCanonicalValueFingerprint,
          pre_remove_formula_fingerprint: details.currentFormulaFingerprint,
          pre_remove_combined_value_fingerprint:
            details.currentCombinedValueFingerprint,
        },
        options,
      );
    },
    finishRemoval: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      return receiptRpc("finish_production_google_writer_provider_fence_removal", {
        ...exactScope(),
        fence_id: ownership.fenceId,
        install_request_id: ownership.installRequestId,
        quiesce_evidence_id: exactUuid(
          details.input.quiesceEvidenceId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
        ),
        removal_request_id: exactUuid(value(details.removalAuthorization,
          "removal_request_id", "removalRequestId"),
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_ID_INVALID"),
        request_fingerprint: providerRequestFingerprint(
          "production-google-writer-provider-fence-finish-removal-v1",
          details.operationRequestFingerprint,
          details.restoredProviderFingerprint,
          details.restorationEvidenceFingerprint,
        ),
        actor_id: authenticatedActor.actorId,
        candidate_deployment_id: ownership.candidate.deploymentId,
        candidate_deployment_commit: ownership.candidate.commit,
        removed_protected_range_ids: details.removedProtectionIds,
        active_run_owned_protection_count:
          Number(details.activeRunOwnedProtectionCount),
        restored_provider_fingerprint: details.restoredProviderFingerprint,
        restored_acl_fingerprint: details.restoredAclFingerprint,
        restored_canonical_value_fingerprint:
          details.restoredCanonicalValueFingerprint,
        restored_formula_fingerprint: details.restoredFormulaFingerprint,
        restored_combined_value_fingerprint:
          details.restoredCombinedValueFingerprint,
        restoration_evidence_fingerprint: details.restorationEvidenceFingerprint,
      }, options);
    },
  });
}
