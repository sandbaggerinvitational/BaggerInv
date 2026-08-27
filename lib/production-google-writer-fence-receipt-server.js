import "server-only";

import {
  productionWriterQuiesceRoutingRulePayload,
  verifiedProviderAttestationPayload,
} from
  "./production-google-writer-fence-provider-claim.js";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

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
import { productionGoogleWriterProviderAbortEvidenceHash } from
  "./production-google-writer-provider-abort-evidence.js";
import { createProductionGoogleDriveAclDbDispatchChannel } from
  "./production-google-drive-acl-db-dispatch.js";
import { assertProductionWriterFenceDirectorAuthorization } from
  "./preview-director-authorization.js";
import {
  verifyVercelWafProviderEvidence,
  verifyVercelWafRuleInsertDispatchResult,
  VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV,
  VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV,
} from "./vercel-provider-attestation.js";
import { productionGoogleWriterCriticalWindowProviderRuleContract } from
  "./production-google-writer-critical-window-waf.js";

const productionGoogleDriveAclDbDispatchChannel =
  createProductionGoogleDriveAclDbDispatchChannel();
const authoritativeProductionReceiptFetch = globalThis.fetch;

/** Consume only a receipt issued by this module's private, authoritative RPC
 * channel. A channel constructed by another importer has a disjoint WeakMap
 * and therefore cannot fabricate a capability accepted here. */
export function consumeProductionGoogleDriveAclDbDispatchCapability(capability) {
  return productionGoogleDriveAclDbDispatchChannel.consumeReceipt(capability);
}

export function consumeProductionGoogleDriveAclDbRecoveryCapability(capability) {
  return productionGoogleDriveAclDbDispatchChannel.consumeRecoveryReceipt(
    capability,
  );
}

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

function plainDataSnapshot(value, allowedKeys, code, label) {
  const candidate = value == null ? {} : value;
  let prototype;
  let descriptors;
  try {
    if ((typeof candidate !== "object" && typeof candidate !== "function") ||
        candidate === null || nodeTypes.isProxy(candidate)) {
      throw new TypeError(`${label} must be a non-Proxy object.`);
    }
    prototype = Object.getPrototypeOf(candidate);
    descriptors = Object.getOwnPropertyDescriptors(candidate);
  } catch (cause) {
    throw receiptError(code, `${label} could not be trusted.`, {
      optionsShapeValid: false,
    }, 500, cause);
  }
  const keys = Reflect.ownKeys(descriptors);
  const unknown = keys.filter((key) =>
    typeof key !== "string" || !allowedKeys.has(key));
  const accessors = keys.filter((key) => {
    const descriptor = descriptors[key];
    return typeof descriptor?.get === "function" ||
      typeof descriptor?.set === "function";
  });
  const plain = prototype === Object.prototype || prototype === null;
  if (!plain || unknown.length || accessors.length) {
    throw receiptError(code, `${label} must be a bounded plain-data object.`, {
      accessorCount: accessors.length,
      optionsShapeValid: plain,
      unknownKeyCount: unknown.length,
    }, 500);
  }
  return Object.freeze(Object.fromEntries(keys.map((key) =>
    [key, descriptors[key].value])));
}

function providerFenceControlOptions(optionsInput) {
  const snapshot = plainDataSnapshot(
    optionsInput,
    new Set(["env", "fetchImpl", "actor", "authorization"]),
    "STEP12_GOOGLE_DRIVE_ACL_RECEIPT_DEPENDENCY_INJECTION_FORBIDDEN",
    "The Production ACL dispatch dependency bundle",
  );
  const testOverridesAllowed = clean(process.env.NODE_TEST_CONTEXT) === "child-v8";
  if (!testOverridesAllowed &&
      (snapshot.fetchImpl !== undefined || snapshot.env !== undefined ||
        snapshot.actor !== undefined)) {
    throw receiptError(
      "STEP12_GOOGLE_DRIVE_ACL_RECEIPT_DEPENDENCY_INJECTION_FORBIDDEN",
      "The Production ACL dispatch issuer requires the fixed server RPC transport.",
      {},
      500,
    );
  }
  const selectedEnvironment = testOverridesAllowed && snapshot.env !== undefined
    ? snapshot.env : process.env;
  let environmentDescriptors;
  try {
    if (!selectedEnvironment || nodeTypes.isProxy(selectedEnvironment)) {
      throw new TypeError("The environment must not be a Proxy.");
    }
    environmentDescriptors = Object.getOwnPropertyDescriptors(selectedEnvironment);
  } catch {
    throw receiptError(
      "STEP12_GOOGLE_DRIVE_ACL_RECEIPT_DEPENDENCY_INJECTION_FORBIDDEN",
      "The Production ACL dispatch environment could not be snapshotted.",
      {},
      500,
    );
  }
  const environment = Object.freeze({
    PRODUCTION_SUPABASE_SECRET_KEY:
      environmentDescriptors.PRODUCTION_SUPABASE_SECRET_KEY?.value,
    [VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
      environmentDescriptors[VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]
        ?.value,
    [VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]:
      environmentDescriptors[VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]?.value,
    VERCEL_DEPLOYMENT_ID: environmentDescriptors.VERCEL_DEPLOYMENT_ID?.value,
    VERCEL_ENV: environmentDescriptors.VERCEL_ENV?.value,
  });
  const actor = testOverridesAllowed
    ? plainDataSnapshot(
      snapshot.actor,
      new Set(["actorId", "authenticatedActorFingerprint"]),
      "STEP11_6_WRITER_FENCE_AUTHENTICATED_ACTOR_INVALID",
      "The authenticated Production actor",
    )
    : assertProductionWriterFenceDirectorAuthorization(snapshot.authorization);
  return Object.freeze({
    actor,
    env: environment,
    fetchImpl: testOverridesAllowed && snapshot.fetchImpl !== undefined
      ? snapshot.fetchImpl : authoritativeProductionReceiptFetch,
  });
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
    "begin_production_google_writer_provider_fence_install_dispatch",
    "begin_abort_production_google_writer_provider_fence_install",
    "begin_production_google_writer_provider_fence_abort_dispatch",
    "record_production_google_writer_acl_dispatch_result",
    "inspect_production_vercel_writer_critical_waf_epoch",
    "begin_production_vercel_writer_critical_waf_epoch",
    "begin_production_vercel_writer_critical_waf_dispatch",
    "mark_production_vercel_writer_critical_waf_dispatch_started",
    "record_production_vercel_writer_critical_waf_dispatch_result",
    "record_production_vercel_writer_critical_waf_reattestation",
    "finalize_production_google_writer_fence_waf_restore",
    "bind_production_google_writer_provider_fence_rollback_waf_epoch",
    "abort_production_google_writer_provider_fence_install",
    "record_production_google_writer_provider_fence_settlement",
    "finish_close_production_google_writer_provider_fence_install",
    "inspect_production_google_writer_provider_fence",
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

function candidateWafIdentity(environment, env) {
  const candidate = candidateIdentity(environment, env);
  const aliasOrigin = `https://${clean(
    environment?.resources?.candidateHostname,
  ).toLowerCase()}`;
  const immutableOrigin = `https://${clean(
    environment?.resources?.deploymentHostname,
  ).toLowerCase()}`;
  const target = "PREVIEW";
  if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(aliasOrigin) ||
      !/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(immutableOrigin) ||
      aliasOrigin === immutableOrigin ||
      clean(env.VERCEL_ENV).toLowerCase() !== "preview" ||
      clean(environment?.resources?.vercelProjectId) !==
        PRODUCTION_VERCEL_PROJECT_ID) {
    throw receiptError(
      "STEP11_6_VERCEL_WAF_CANDIDATE_ORIGINS_INVALID",
      "The exact candidate alias and immutable origins were unavailable.",
      {},
      400,
    );
  }
  return Object.freeze({ ...candidate, aliasOrigin, immutableOrigin, target });
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

export function productionGoogleWriterFenceReceiptDependencies(
  optionsInput = {},
) {
  const { actor, env, fetchImpl } = providerFenceControlOptions(optionsInput);
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

/** Durable two-snapshot Vercel edge quiesce receipt. */
export function productionGoogleWriterQuiesceReceiptDependencies(
  optionsInput = {},
) {
  const { actor, env, fetchImpl } = providerFenceControlOptions(optionsInput);
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
    const status = clean(challenge.status).toUpperCase();
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
        !new Set(["BEGIN", "FINALIZE"]).has(stage) ||
        !new Set(["ISSUED", "CONSUMED"]).has(status) ||
        !new Set(["REHEARSAL", "CUTOVER"]).has(purpose) ||
        !uuid(challengeId) || !uuid(challengeRequestId) ||
        !uuid(operationRequestId) || !uuid(evidenceRequestId) ||
        operationRequestId !== clean(input.operationRequestId).toLowerCase() ||
        evidenceRequestId !== clean(input.evidenceRequestId).toLowerCase() ||
        challengeRequestId !== clean(input.challengeRequestId).toLowerCase() ||
        challengeId !== clean(input.providerChallengeId).toLowerCase() ||
        clean(input.providerAttestationStage).toUpperCase() !== stage ||
        clean(input.quiescePurpose).toUpperCase() !== purpose ||
        clean(challenge.vercelProjectId) !== PRODUCTION_VERCEL_PROJECT_ID ||
        !/^team_[A-Za-z0-9]{8,80}$/.test(teamId) ||
        !/^dpl_[A-Za-z0-9]{8,64}$/.test(candidateDeploymentId) ||
        !/^[0-9a-f]{40}$/.test(candidateDeploymentCommit) ||
        !new Set(["PREVIEW", "PRODUCTION"]).has(candidateDeploymentTarget) ||
        !/^https:\/\/[a-z0-9.-]+$/.test(candidateAliasOrigin) ||
        !/^https:\/\/[a-z0-9.-]+$/.test(candidateImmutableOrigin) ||
        !/^[A-Za-z0-9._:-]{3,160}$/.test(routingRuleId) ||
        !/^[A-Za-z0-9._:-]{1,160}$/.test(routingRuleConfigVersion) ||
        (status === "CONSUMED" && (
          !uuid(clean(challenge.consumeRequestId).toLowerCase()) ||
          !uuid(clean(challenge.consumedAttestationId).toLowerCase()) ||
          !hex64(challenge.consumedAttestationFingerprint)
        ))) {
      throw receiptError(
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_RETAINED_CHALLENGE_INVALID",
        "The retained provider challenge binding was invalid.", {}, 400,
      );
    }
    return {
      challengeId, challengeRequestId, operationRequestId, evidenceRequestId,
      stage, purpose, status, candidateDeploymentId, candidateDeploymentCommit,
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
      const scope = retainedChallengeScope(input);
      const retainedPayload = retainedChallengePayload(input);
      const inspected = await receiptRpc(
        "inspect_production_vercel_provider_challenge_abandonment",
        retainedPayload,
        options,
      );
      const durableStatus = clean(inspected.status).toUpperCase();
      const durableReason = clean(
        inspected.abandonment_reason || inspected.abandonmentReason,
      ).toUpperCase();
      const abandonRequestId = exactUuid(
        input.abandonRequestId,
        "STEP11_6_VERCEL_PROVIDER_ATTESTATION_ABANDON_REQUEST_INVALID",
      );
      if (durableStatus === "ABANDONED") {
        // A lost response can discover either a current reason-bearing row or
        // migration 036's immutable, reasonless unconsumed-BEGIN row. Never
        // invoke a newer mutating RPC against a terminal historical receipt.
        // The browser still validates the same challenge, stored request ID,
        // fingerprint, and terminal chronology before clearing local state.
        if (clean(
          inspected.abandon_request_id || inspected.abandonRequestId,
        ).toLowerCase() !== abandonRequestId || !hex64(
          inspected.abandon_request_fingerprint ||
            inspected.abandonRequestFingerprint,
        )) {
          throw receiptError(
            "STEP11_6_VERCEL_PROVIDER_ATTESTATION_ABANDON_RECEIPT_MISMATCH",
            "The authoritative abandoned challenge did not match this recovery request.",
            { stage: scope.stage, status: durableStatus },
            409,
          );
        }
        return inspected;
      }
      const abandonmentReason = durableStatus === "CONSUMED"
          ? "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED"
          : durableStatus === "ISSUED" && scope.stage === "FINALIZE"
            ? "EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED"
            : durableStatus === "ISSUED"
              ? "EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED"
              : "";
      if ((durableStatus !== "ABANDONED" && inspected.abandon_eligible !== true) ||
          !new Set([
            "EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED",
            "EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED",
            "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED",
          ]).has(abandonmentReason)) {
        throw receiptError(
          "STEP11_6_VERCEL_PROVIDER_ATTESTATION_ABANDON_NOT_ELIGIBLE",
          "The authoritative provider challenge is not eligible for abandonment.",
          { stage: scope.stage, status: durableStatus },
          409,
        );
      }
      const payload = {
        ...retainedPayload,
        abandon_request_id: abandonRequestId,
        abandonment_reason: abandonmentReason,
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
        provider_inventory_schema: normalized.providerInventorySchema,
        retained_provider_inventory_count:
          normalized.retainedProviderInventoryCount,
        retained_provider_inventory_fingerprint:
          normalized.retainedProviderInventoryFingerprint,
        live_provider_inventory_count: normalized.liveProviderInventoryCount,
        live_provider_inventory_fingerprint:
          normalized.liveProviderInventoryFingerprint,
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
        ? "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS PRODUCTION CUTOVER"
        : "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL";
      if (!hex64(ownerPrincipalFingerprint) ||
          input.ownerOverrideOperationallyFrozen !== true ||
          clean(input.ownerFreezeConfirmation) !== expectedConfirmation ||
          !Number.isInteger(ownerFreezeTtlSeconds) ||
          ownerFreezeTtlSeconds !== 2100) {
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
          purpose: normalized.purpose,
          ownerFreezeConfirmation: expectedConfirmation,
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
        ...productionWriterQuiesceRoutingRulePayload(routingRule),
        purpose: normalized.purpose,
        main_branch_alias_origin: normalized.mainBranchAliasOrigin,
        candidate_alias_origin: normalized.candidateAliasOrigin,
        candidate_immutable_origin: normalized.candidateImmutableOrigin,
        candidate_credential_generation: normalized.candidateCredentialGeneration,
        // Exact artifact tuples and compact per-origin vector proofs avoid a
        // multi-megabyte repeated origin×method×path request body. The RPC
        // expands and validates the frozen eleven-vector coverage server-side.
        origin_inventory: normalized.originInventoryTuples,
        live_origin_inventory: normalized.liveOriginInventoryTuples,
        provider_inventory_schema: normalized.providerInventorySchema,
        retained_provider_inventory_count:
          normalized.retainedProviderInventoryCount,
        retained_provider_inventory_fingerprint:
          normalized.retainedProviderInventoryFingerprint,
        live_provider_inventory_count: normalized.liveProviderInventoryCount,
        live_provider_inventory_fingerprint:
          normalized.liveProviderInventoryFingerprint,
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
        owner_freeze_confirmation: expectedConfirmation,
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
        authenticated_actor_fingerprint:
          authenticatedActor.authenticatedActorFingerprint,
        candidate_deployment_id: candidate.deploymentId,
        candidate_deployment_commit: candidate.commit,
        candidate_deployment_target: normalized.candidateDeploymentTarget,
        vercel_project_id: candidate.projectId,
        ...productionWriterQuiesceRoutingRulePayload(routingRule),
        purpose: normalized.purpose,
        main_branch_alias_origin: normalized.mainBranchAliasOrigin,
        candidate_alias_origin: normalized.candidateAliasOrigin,
        candidate_immutable_origin: normalized.candidateImmutableOrigin,
        candidate_credential_generation: normalized.candidateCredentialGeneration,
        live_origin_inventory: normalized.liveOriginInventoryTuples,
        provider_inventory_schema: normalized.providerInventorySchema,
        retained_provider_inventory_count:
          normalized.retainedProviderInventoryCount,
        retained_provider_inventory_fingerprint:
          normalized.retainedProviderInventoryFingerprint,
        live_provider_inventory_count: normalized.liveProviderInventoryCount,
        live_provider_inventory_fingerprint:
          normalized.liveProviderInventoryFingerprint,
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

function derivedProviderRequestId(label, installRequestId) {
  const hex = sha256(`${label}\n${installRequestId}`).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-` +
    `${value.slice(16, 20)}-${value.slice(20)}`;
}

function persistentProviderReservationBoundary(authority) {
  const expected = controlRevisions(authority);
  const sourceFingerprint = value(
    authority,
    "expected_source_fingerprint",
    "start_source_fingerprint",
  ).toLowerCase();
  if (authority.ok !== true ||
      clean(authority.activation_state).toUpperCase() !== "GOOGLE_LEASE_ARMED" ||
      clean(authority.authority).toUpperCase() !== "GOOGLE" ||
      clean(authority.scoring_authority).toUpperCase() !== "GOOGLE" ||
      authority.scoring_ingress_enabled !== false ||
      clean(authority.database_execution_gate).toUpperCase() !== "OPEN" ||
      clean(authority.database_admission_state).toUpperCase() !== "OPEN" ||
      authority.provider_admission_reservation_active !== true ||
      !["INSTALLING", "ABORTING", "INSTALLED"].includes(
        clean(authority.provider_admission_reservation_status).toUpperCase(),
      ) ||
      numberValue(authority, "v2_unresolved") !== 0 ||
      numberValue(authority, "legacy_unclassified") !== 0 ||
      authority.first_supabase_canonical_write_possible !== false ||
      authority.first_supabase_canonical_write_observed !== false ||
      !hex64(sourceFingerprint)) {
    throw receiptError(
      "STEP12_GOOGLE_WRITER_PROVIDER_SETTLEMENT_CONTROL_STATE_UNSAFE",
      "The Production authority state no longer matched the reserved provider-fence boundary.",
      {},
      409,
    );
  }
  return {
    ...expected,
    start_source_fingerprint: sourceFingerprint,
  };
}

function rollbackProviderFenceBoundary(authority) {
  const expected = controlRevisions(authority);
  if (authority.ok !== true ||
      clean(authority.activation_state).toUpperCase() !== "ROLLED_BACK" ||
      clean(authority.authority).toUpperCase() !== "GOOGLE" ||
      clean(authority.scoring_authority).toUpperCase() !== "GOOGLE" ||
      authority.scoring_ingress_enabled !== false ||
      clean(authority.database_execution_gate).toUpperCase() !== "PAUSED" ||
      clean(authority.database_admission_state).toUpperCase() !== "CLOSED" ||
      authority.admission_protocol_enforced !== true ||
      !uuid(clean(authority.active_closure_id).toLowerCase()) ||
      authority.provider_admission_reservation_active !== true ||
      clean(authority.provider_admission_reservation_status).toUpperCase() !==
        "INSTALLED" ||
      numberValue(authority, "v2_unresolved") !== 0 ||
      numberValue(authority, "legacy_unclassified") !== 0) {
    throw receiptError(
      "STEP12_GOOGLE_WRITER_ROLLBACK_WAF_BIND_STATE_INVALID",
      "The reconciled Google rollback boundary was not current.",
      {},
      409,
    );
  }
  return expected;
}

function persistentProviderInstallBoundary(authority, operation) {
  const expected = persistentProviderReservationBoundary(authority);
  if (clean(authority.provider_admission_reservation_status).toUpperCase() !==
      "INSTALLING") {
    throw receiptError(
      `STEP12_GOOGLE_WRITER_PROVIDER_FENCE_${operation}_CONTROL_STATE_UNSAFE`,
      "Only the exact unfinished provider-fence installation may perform this operation.",
      {},
      409,
    );
  }
  return expected;
}

function persistentProviderAbortBoundary(authority) {
  const expected = persistentProviderReservationBoundary(authority);
  if (clean(authority.provider_admission_reservation_status).toUpperCase() !==
      "ABORTING") {
    throw receiptError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_CONTROL_STATE_UNSAFE",
      "The provider-fence abort reservation was not durably active.",
      {},
      409,
    );
  }
  return expected;
}

function providerAbortEvidence(details, ownership, expected, authenticatedActor) {
  const removedProtectedRangeIds = [...details.removedProtectionIds]
    .map(Number).sort((left, right) => left - right);
  const providerObservedAt = clean(details.providerObservedAt);
  const evidence = {
    operation: "ABORT_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
    ...exactScope(),
    fence_id: ownership.fenceId,
    install_request_id: ownership.installRequestId,
    abort_request_id: exactUuid(
      details.input.operationRequestId,
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_ID_INVALID",
    ),
    abort_dispatch_id: exactUuid(
      details.abortDispatchId,
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH_ID_INVALID",
    ),
    quiesce_evidence_id: exactUuid(
      details.input.quiesceEvidenceId,
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
    ),
    candidate_deployment_id: ownership.candidate.deploymentId,
    candidate_deployment_commit: ownership.candidate.commit,
    deployment_id: ownership.candidate.deploymentId,
    deployment_commit: ownership.candidate.commit,
    removed_protected_range_ids: removedProtectedRangeIds,
    active_run_owned_protection_count: 0,
    provider_rollback_verified: true,
    restored_provider_fingerprint:
      clean(details.restoredProviderFingerprint).toLowerCase(),
    restored_acl_fingerprint: clean(details.restoredAclFingerprint).toLowerCase(),
    restored_canonical_value_fingerprint:
      clean(details.restoredCanonicalValueFingerprint).toLowerCase(),
    restored_combined_value_fingerprint:
      clean(details.restoredCombinedValueFingerprint).toLowerCase(),
    restored_formula_fingerprint:
      clean(details.restoredFormulaFingerprint).toLowerCase(),
    provider_observed_at: providerObservedAt,
    ...expected,
    actor_id: authenticatedActor.actorId,
    authenticated_actor_fingerprint:
      authenticatedActor.authenticatedActorFingerprint,
  };
  return {
    ...evidence,
    restoration_evidence_fingerprint:
      productionGoogleWriterProviderAbortEvidenceHash(evidence),
  };
}

/** Durable Step-12-only provider fence control. */
export function productionGoogleWriterProviderFenceControlDependencies(
  optionsInput = {},
) {
  const { actor, env, fetchImpl } = providerFenceControlOptions(optionsInput);
  const options = { env, fetchImpl };
  const authenticatedActor = actorIdentity(actor);
  const actorFields = {
    actor_id: authenticatedActor.actorId,
    authenticated_actor_fingerprint:
      authenticatedActor.authenticatedActorFingerprint,
  };
  const aclOutcomeRecorder = ({ direction, ownership, dispatched, details }) => {
    let consumed = false;
    return async (outcomeInput) => {
      const outcome = plainDataSnapshot(
        outcomeInput,
        new Set(["outcomeStatus", "providerObservedAt", "transitionProof"]),
        "STEP12_GOOGLE_DRIVE_ACL_OUTCOME_INVALID",
        "The module-issued Drive ACL outcome",
      );
      const outcomeStatus = clean(outcome.outcomeStatus).toUpperCase();
      const transitionProof = outcome.transitionProof ?? null;
      const transitionProofFingerprint = clean(
        transitionProof?.transitionFingerprint,
      ).toLowerCase();
      if (consumed || !["TARGET_CONFIRMED", "OUTCOME_UNKNOWN"].includes(
        outcomeStatus,
      ) || (outcomeStatus === "TARGET_CONFIRMED" &&
        (!transitionProof || !hex64(transitionProofFingerprint))) ||
        (outcomeStatus === "OUTCOME_UNKNOWN" && transitionProof !== null)) {
        throw receiptError(
          "STEP12_GOOGLE_DRIVE_ACL_OUTCOME_INVALID",
          "The Drive ACL outcome was missing its exact module-issued proof.",
          {},
          409,
        );
      }
      consumed = true;
      const authority = await inspectAuthority(options);
      const expected = direction === "INSTALL"
        ? persistentProviderReservationBoundary(authority)
        : persistentProviderAbortBoundary(authority);
      const dispatchId = exactUuid(
        value(dispatched, "dispatch_id", "dispatchId"),
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ACL_RESULT_DISPATCH_INVALID",
      );
      const resultRequestId = derivedProviderRequestId(
        `production-google-writer-provider-fence-acl-${
          direction.toLowerCase()
        }-${outcomeStatus.toLowerCase()}-result-v1`,
        dispatchId,
      );
      const requestFingerprint = providerRequestFingerprint(
        "production-google-writer-provider-fence-acl-dispatch-result-v1",
        details.operationRequestFingerprint,
        direction,
        outcomeStatus,
        dispatchId,
        resultRequestId,
        transitionProofFingerprint,
      );
      return receiptRpc(
        "record_production_google_writer_acl_dispatch_result",
        {
          ...exactScope(),
          operation:
            "RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ACL_DISPATCH_RESULT",
          direction,
          outcome_status: outcomeStatus,
          fence_id: ownership.fenceId,
          install_request_id: ownership.installRequestId,
          dispatch_id: dispatchId,
          result_request_id: resultRequestId,
          request_fingerprint: requestFingerprint,
          transition_proof: transitionProof,
          transition_proof_fingerprint:
            transitionProofFingerprint || null,
          provider_observed_at: outcome.providerObservedAt || null,
          candidate_deployment_id: ownership.candidate.deploymentId,
          candidate_deployment_commit: ownership.candidate.commit,
          deployment_id: ownership.candidate.deploymentId,
          deployment_commit: ownership.candidate.commit,
          ...expected,
          ...actorFields,
        },
        options,
      );
    };
  };
  const verifiedWafEvidence = ({ envelope, request }) =>
    verifyVercelWafProviderEvidence(envelope, {
      env,
      request,
    });
  const verifiedWafDispatchResult = ({ envelope, request }) =>
    verifyVercelWafRuleInsertDispatchResult(envelope, {
      env,
      request,
    });
  const criticalWafCandidateScope = (evidence, candidate) => {
    const contract = productionGoogleWriterCriticalWindowProviderRuleContract({
      candidateAliasOrigin: evidence.candidateAliasOrigin,
      candidateImmutableOrigin: evidence.candidateImmutableOrigin,
      runOwnedRuleName: evidence.runOwnedRuleName,
      runOwnedRuleNonce: evidence.runOwnedRuleNonce,
    });
    if (contract.ruleFingerprint !== evidence.runOwnedRuleFingerprint) {
      throw receiptError(
        "STEP11_6_VERCEL_WAF_RULE_SCOPE_INVALID",
        "The signed WAF evidence did not match the executable five-group rule.",
        {},
        409,
      );
    }
    // Both Step 11.6 and Step 12 are controlled exclusively from the exact
    // Project Preview candidate alias + immutable deployment. The canonical
    // apex is deliberately denied during the critical window, so CUTOVER must
    // never imply that this route executes from a Production-target runtime.
    const expectedTarget = "PREVIEW";
    if (evidence.candidateAliasOrigin !== candidate.aliasOrigin ||
        evidence.candidateImmutableOrigin !== candidate.immutableOrigin ||
        evidence.candidateDeploymentId !== candidate.deploymentId ||
        evidence.candidateCommitSha !== candidate.commit ||
        evidence.candidateDeploymentTarget !== expectedTarget ||
        candidate.target !== expectedTarget) {
      throw receiptError(
        "STEP11_6_VERCEL_WAF_CANDIDATE_SCOPE_MISMATCH",
        "The signed WAF evidence did not match the executing candidate.",
        {},
        409,
      );
    }
    return Object.freeze({
      candidateControlHostsFingerprint:
        contract.candidateControlHostsFingerprint,
      candidateDeploymentTarget: "PREVIEW",
    });
  };
  return Object.freeze({
    inspectCriticalWafEpoch: async (details) => {
      const epochId = exactUuid(
        details.epochId,
        "STEP11_6_VERCEL_WAF_EPOCH_ID_INVALID",
      );
      const candidate = candidateWafIdentity(details.environment, env);
      return receiptRpc(
        "inspect_production_vercel_writer_critical_waf_epoch",
        {
          ...exactScope(),
          operation: "INSPECT_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH",
          epoch_id: epochId,
          candidate_deployment_id: candidate.deploymentId,
          candidate_deployment_commit: candidate.commit,
        },
        options,
      );
    },
    beginCriticalWafEpoch: async (details) => {
      const evidence = verifiedWafEvidence({
        envelope: details.evidenceEnvelope,
        request: details.evidenceRequest,
      });
      if (evidence.stage !== "BASELINE_CAPTURE") {
        throw receiptError(
          "STEP11_6_VERCEL_WAF_BASELINE_EVIDENCE_REQUIRED",
          "A signed baseline-capture observation was required.",
          {},
          409,
        );
      }
      const candidate = candidateWafIdentity(details.environment, env);
      const scope = criticalWafCandidateScope(evidence, candidate);
      const epochRequestId = exactUuid(
        details.epochRequestId,
        "STEP11_6_VERCEL_WAF_EPOCH_REQUEST_ID_INVALID",
      );
      const baselineObservationRequestId = exactUuid(
        details.baselineObservationRequestId,
        "STEP11_6_VERCEL_WAF_OBSERVATION_REQUEST_ID_INVALID",
      );
      const requestFingerprint = providerRequestFingerprint(
        "production-vercel-writer-critical-waf-epoch-begin-v1",
        evidence.evidenceFingerprint,
        evidence.wafEpochId,
        epochRequestId,
        baselineObservationRequestId,
      );
      return receiptRpc(
        "begin_production_vercel_writer_critical_waf_epoch",
        {
          ...exactScope(),
          operation: "BEGIN_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH",
          epoch_id: evidence.wafEpochId,
          epoch_request_id: epochRequestId,
          baseline_observation_request_id: baselineObservationRequestId,
          purpose: evidence.purpose,
          transition_mode: evidence.transitionMode,
          request_fingerprint: requestFingerprint,
          candidate_deployment_id: candidate.deploymentId,
          candidate_deployment_commit: candidate.commit,
          candidate_deployment_target: scope.candidateDeploymentTarget,
          candidate_alias_origin: evidence.candidateAliasOrigin,
          candidate_immutable_origin: evidence.candidateImmutableOrigin,
          candidate_control_hosts_fingerprint:
            scope.candidateControlHostsFingerprint,
          baseline_waf_evidence: evidence,
          ...actorFields,
        },
        options,
      );
    },
    beginCriticalWafDispatch: async (details) => {
      const epochId = exactUuid(
        details.epochId,
        "STEP11_6_VERCEL_WAF_EPOCH_ID_INVALID",
      );
      const dispatchRequestId = exactUuid(
        details.dispatchRequestId,
        "STEP11_6_VERCEL_WAF_DISPATCH_REQUEST_ID_INVALID",
      );
      const transitionRequestId = exactUuid(
        details.transitionRequestId,
        "STEP11_6_VERCEL_WAF_TRANSITION_REQUEST_ID_INVALID",
      );
      const dispatchStep = clean(details.dispatchStep).toUpperCase();
      const providerIntentFingerprint = clean(
        details.providerIntentFingerprint,
      ).toLowerCase();
      if (!["CRITICAL_RULE_INSERT", "CRITICAL_DRAFT_ACTIVATE",
        "BASELINE_VERSION_ACTIVATE"].includes(dispatchStep) ||
          !hex64(providerIntentFingerprint)) {
        throw receiptError(
          "STEP11_6_VERCEL_WAF_DISPATCH_INTENT_INVALID",
          "The WAF provider dispatch intent was invalid.",
          {},
          400,
        );
      }
      const requestFingerprint = providerRequestFingerprint(
        "production-vercel-writer-critical-waf-dispatch-begin-v1",
        epochId,
        dispatchRequestId,
        transitionRequestId,
        dispatchStep,
        providerIntentFingerprint,
      );
      return receiptRpc(
        "begin_production_vercel_writer_critical_waf_dispatch",
        {
          ...exactScope(),
          operation: "BEGIN_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH",
          epoch_id: epochId,
          dispatch_request_id: dispatchRequestId,
          transition_request_id: transitionRequestId,
          dispatch_step: dispatchStep,
          provider_intent_fingerprint: providerIntentFingerprint,
          request_fingerprint: requestFingerprint,
          restore_request_id: details.restoreRequestId || null,
          restore_request_fingerprint:
            details.restoreRequestFingerprint || null,
          ...actorFields,
        },
        options,
      );
    },
    markCriticalWafDispatchStarted: async (details) => {
      const dispatchId = exactUuid(
        details.dispatchId,
        "STEP11_6_VERCEL_WAF_DISPATCH_ID_INVALID",
      );
      const dispatchRequestId = exactUuid(
        details.dispatchRequestId,
        "STEP11_6_VERCEL_WAF_DISPATCH_REQUEST_ID_INVALID",
      );
      const transitionRequestId = exactUuid(
        details.transitionRequestId,
        "STEP11_6_VERCEL_WAF_TRANSITION_REQUEST_ID_INVALID",
      );
      const requestFingerprint = clean(details.requestFingerprint).toLowerCase();
      if (!hex64(requestFingerprint)) {
        throw receiptError(
          "STEP11_6_VERCEL_WAF_DISPATCH_FINGERPRINT_INVALID",
          "The exact WAF dispatch fingerprint was required.",
          {},
          400,
        );
      }
      return receiptRpc(
        "mark_production_vercel_writer_critical_waf_dispatch_started",
        {
          operation:
            "MARK_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_STARTED",
          dispatch_id: dispatchId,
          dispatch_request_id: dispatchRequestId,
          transition_request_id: transitionRequestId,
          request_fingerprint: requestFingerprint,
        },
        options,
      );
    },
    recordCriticalWafDispatchResult: async (details) => {
      const dispatchId = exactUuid(
        details.dispatchId,
        "STEP11_6_VERCEL_WAF_DISPATCH_ID_INVALID",
      );
      const hasDispatchResult = details.dispatchResultEnvelope != null ||
        details.dispatchResultRequest != null;
      const hasWafEvidence = details.wafEvidenceEnvelope != null ||
        details.wafEvidenceRequest != null;
      if (hasDispatchResult === hasWafEvidence) {
        throw receiptError(
          "STEP11_6_VERCEL_WAF_RESULT_KIND_INVALID",
          "Exactly one signed WAF result kind was required.",
          {},
          400,
        );
      }
      const dispatchResult = hasDispatchResult
        ? verifiedWafDispatchResult({
          envelope: details.dispatchResultEnvelope,
          request: details.dispatchResultRequest,
        }) : null;
      const wafEvidence = hasWafEvidence
        ? verifiedWafEvidence({
          envelope: details.wafEvidenceEnvelope,
          request: details.wafEvidenceRequest,
        }) : null;
      const fingerprint = clean(
        dispatchResult?.evidenceFingerprint ?? wafEvidence?.evidenceFingerprint,
      ).toLowerCase();
      const requestFingerprint = providerRequestFingerprint(
        "production-vercel-writer-critical-waf-dispatch-result-v1",
        dispatchId,
        fingerprint,
      );
      return receiptRpc(
        "record_production_vercel_writer_critical_waf_dispatch_result",
        {
          operation:
            "RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_RESULT",
          dispatch_id: dispatchId,
          request_fingerprint: requestFingerprint,
          observation_request_id: wafEvidence
            ? exactUuid(
              details.observationRequestId,
              "STEP11_6_VERCEL_WAF_OBSERVATION_REQUEST_ID_INVALID",
            ) : null,
          verified_dispatch_result: dispatchResult,
          verified_waf_evidence: wafEvidence,
        },
        options,
      );
    },
    recordCriticalWafReattestation: async (details) => {
      const evidence = verifiedWafEvidence({
        envelope: details.evidenceEnvelope,
        request: details.evidenceRequest,
      });
      if (evidence.stage !== "CRITICAL_REATTEST") {
        throw receiptError(
          "STEP11_6_VERCEL_WAF_REATTESTATION_REQUIRED",
          "A fresh signed critical-window reattestation was required.",
          {},
          409,
        );
      }
      const observationRequestId = exactUuid(
        details.observationRequestId,
        "STEP11_6_VERCEL_WAF_OBSERVATION_REQUEST_ID_INVALID",
      );
      return receiptRpc(
        "record_production_vercel_writer_critical_waf_reattestation",
        {
          operation:
            "RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_REATTESTATION",
          epoch_id: evidence.wafEpochId,
          observation_request_id: observationRequestId,
          request_fingerprint: providerRequestFingerprint(
            "production-vercel-writer-critical-waf-reattest-v1",
            evidence.evidenceFingerprint,
            observationRequestId,
          ),
          verified_waf_evidence: evidence,
        },
        options,
      );
    },
    finalizeWafBaselineRestore: async (details) => {
      const fenceId = exactUuid(
        details.fenceId,
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ID_INVALID",
      );
      const epochId = exactUuid(
        details.epochId,
        "STEP11_6_VERCEL_WAF_EPOCH_ID_INVALID",
      );
      const observationId = exactUuid(
        details.baselineRestoredObservationId,
        "STEP11_6_VERCEL_WAF_OBSERVATION_ID_INVALID",
      );
      return receiptRpc(
        "finalize_production_google_writer_fence_waf_restore",
        {
          ...exactScope(),
          operation:
            "FINALIZE_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_WAF_BASELINE_RESTORE",
          fence_id: fenceId,
          critical_waf_epoch_id: epochId,
          baseline_restored_observation_id: observationId,
          request_fingerprint: providerRequestFingerprint(
            "production-google-writer-provider-waf-baseline-finalize-v1",
            fenceId,
            epochId,
            observationId,
          ),
          ...actorFields,
        },
        options,
      );
    },
    bindRollbackCriticalWafEpoch: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const authority = await inspectAuthority(options);
      const expected = rollbackProviderFenceBoundary(authority);
      const epochId = exactUuid(
        details.criticalWafEpochId || details.input.criticalWafEpochId,
        "STEP11_6_VERCEL_WAF_EPOCH_ID_INVALID",
      );
      const quiesceEvidenceId = exactUuid(
        details.quiesceEvidenceId || details.input.quiesceEvidenceId,
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
      );
      const bindRequestId = exactUuid(
        details.bindRequestId,
        "STEP12_GOOGLE_WRITER_ROLLBACK_WAF_BIND_REQUEST_INVALID",
      );
      const requestFingerprint = providerRequestFingerprint(
        "production-google-writer-provider-fence-rollback-waf-bind-v1",
        ownership.installRequestId,
        ownership.fenceId,
        epochId,
        quiesceEvidenceId,
        bindRequestId,
        ownership.candidate.deploymentId,
        ownership.candidate.commit,
      );
      return receiptRpc(
        "bind_production_google_writer_provider_fence_rollback_waf_epoch",
        {
          ...exactScope(),
          operation:
            "BIND_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ROLLBACK_WAF_EPOCH",
          fence_id: ownership.fenceId,
          critical_waf_epoch_id: epochId,
          quiesce_evidence_id: quiesceEvidenceId,
          bind_request_id: bindRequestId,
          request_fingerprint: requestFingerprint,
          candidate_deployment_id: ownership.candidate.deploymentId,
          candidate_deployment_commit: ownership.candidate.commit,
          deployment_id: ownership.candidate.deploymentId,
          deployment_commit: ownership.candidate.commit,
          ...expected,
          ...actorFields,
        },
        options,
      );
    },
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
      const lifecycleMode = clean(
        details.lifecycleMode || input.quiescePurpose,
      ).toUpperCase();
      if (!["REHEARSAL", "CUTOVER"].includes(lifecycleMode)) {
        throw receiptError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_LIFECYCLE_INVALID",
          "The provider fence lifecycle was invalid.",
          {},
          400,
        );
      }
      return receiptRpc("begin_production_google_writer_provider_fence_install", {
        ...exactScope(),
        install_request_id: exactUuid(input.operationRequestId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ID_INVALID"),
        request_fingerprint: operationRequestFingerprint,
        ...actorFields,
        quiesce_evidence_id: exactUuid(input.quiesceEvidenceId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID"),
        critical_waf_epoch_id: exactUuid(
          details.criticalWafEpochId || input.criticalWafEpochId,
          "STEP11_6_VERCEL_WAF_EPOCH_ID_INVALID",
        ),
        lifecycle_mode: lifecycleMode,
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
    beginInstallDispatch: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const authority = await inspectAuthority(options);
      const expected = persistentProviderInstallBoundary(
        authority,
        "INSTALL_DISPATCH",
      );
      const dispatchRequestId = derivedProviderRequestId(
        "production-google-writer-provider-fence-acl-downgrade-dispatch-v1",
        ownership.installRequestId,
      );
      const requestFingerprint = providerRequestFingerprint(
        "production-google-writer-provider-fence-acl-downgrade-dispatch-v1",
        details.operationRequestFingerprint,
        dispatchRequestId,
        details.transitionIntent.transitionIntentFingerprint,
        details.providerPreflight.providerPreflightFingerprint,
      );
      const rpcInput = {
        ...exactScope(),
        operation:
          "BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH",
        fence_id: ownership.fenceId,
        install_request_id: ownership.installRequestId,
        dispatch_request_id: dispatchRequestId,
        mutation_plan: "DRIVE_ACL_LEGACY_WRITER_TO_READER_V1",
        provider_mutation_class:
          details.transitionIntent.providerMutationClass,
        source_role: details.transitionIntent.sourceRole,
        target_role: details.transitionIntent.targetRole,
        transition_intent: details.transitionIntent,
        transition_intent_fingerprint:
          details.transitionIntent.transitionIntentFingerprint,
        provider_preflight_fingerprint:
          details.providerPreflight.providerPreflightFingerprint,
        request_fingerprint: requestFingerprint,
        quiesce_evidence_id: exactUuid(
          details.input.quiesceEvidenceId,
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
        ),
        candidate_deployment_id: ownership.candidate.deploymentId,
        candidate_deployment_commit: ownership.candidate.commit,
        deployment_id: ownership.candidate.deploymentId,
        deployment_commit: ownership.candidate.commit,
        ...expected,
        ...actorFields,
      };
      const claimClock =
        productionGoogleDriveAclDbDispatchChannel.beginClaim();
      const dispatched = await receiptRpc(
        "begin_production_google_writer_provider_fence_install_dispatch",
        rpcInput,
        options,
      );
      const mutationDispatchUsable = dispatched.dispatch_usable === true &&
        dispatched.replay_usable === true && dispatched.idempotent === false;
      const recoveryDispatchUsable = dispatched.dispatch_usable === false &&
        dispatched.replay_usable === false && dispatched.idempotent === true &&
        ["PROVIDER_MUTATING", "OUTCOME_UNKNOWN"].includes(
          clean(dispatched.status).toUpperCase(),
        );
      if (value(dispatched, "fence_id", "fenceId").toLowerCase() !==
            ownership.fenceId ||
          value(dispatched, "dispatch_request_id", "dispatchRequestId")
            .toLowerCase() !== dispatchRequestId ||
          !uuid(value(dispatched, "dispatch_id", "dispatchId")) ||
          value(dispatched, "mutation_plan", "mutationPlan") !==
            "DRIVE_ACL_LEGACY_WRITER_TO_READER_V1" ||
          value(dispatched, "provider_mutation_class", "providerMutationClass") !==
            details.transitionIntent.providerMutationClass ||
          value(dispatched, "target_role", "targetRole") !== "reader" ||
          value(dispatched, "transition_intent_fingerprint",
            "transitionIntentFingerprint") !==
              details.transitionIntent.transitionIntentFingerprint ||
          value(dispatched, "provider_preflight_fingerprint",
            "providerPreflightFingerprint") !==
              details.providerPreflight.providerPreflightFingerprint ||
          (!mutationDispatchUsable && !recoveryDispatchUsable) ||
          !clean(dispatched.expires_at || dispatched.expiresAt) ||
          !integer(dispatched.remaining_dispatch_budget_ms ??
            dispatched.remainingDispatchBudgetMs)) {
        throw receiptError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH_RECEIPT_INVALID",
          "The provider install dispatch receipt was incomplete.",
        );
      }
      const recordOutcome = aclOutcomeRecorder({
        direction: "INSTALL",
        ownership,
        dispatched,
        details,
      });
      if (mutationDispatchUsable) {
        const databaseDispatchCapability =
          productionGoogleDriveAclDbDispatchChannel.issueReceipt(
            claimClock,
            dispatched,
            recordOutcome,
          );
        return Object.freeze({ ...dispatched, databaseDispatchCapability });
      }
      const databaseRecoveryCapability =
        productionGoogleDriveAclDbDispatchChannel.issueRecoveryReceipt(
          dispatched,
          recordOutcome,
        );
      return Object.freeze({ ...dispatched, databaseRecoveryCapability });
    },
    beginAbortInstall: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const authority = await inspectAuthority(options);
      const expected = persistentProviderInstallBoundary(authority, "ABORT_BEGIN");
      const abortRequestId = exactUuid(
        details.input.operationRequestId,
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_ID_INVALID",
      );
      const requestFingerprint = providerRequestFingerprint(
        "production-google-writer-provider-fence-abort-begin-v1",
        details.operationRequestFingerprint,
        abortRequestId,
      );
      await receiptRpc(
        "begin_abort_production_google_writer_provider_fence_install",
        {
          ...exactScope(),
          operation:
            "BEGIN_ABORT_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
          fence_id: ownership.fenceId,
          install_request_id: ownership.installRequestId,
          abort_request_id: abortRequestId,
          request_fingerprint: requestFingerprint,
          restore_quiesce_evidence_id: exactUuid(
            details.input.quiesceEvidenceId,
            "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
          ),
          candidate_deployment_id: ownership.candidate.deploymentId,
          candidate_deployment_commit: ownership.candidate.commit,
          deployment_id: ownership.candidate.deploymentId,
          deployment_commit: ownership.candidate.commit,
          ...expected,
          ...actorFields,
        },
        options,
      );
      return receiptRpc("inspect_production_google_writer_provider_fence", {
        ...exactScope(),
        install_request_id: ownership.installRequestId,
        fence_id: ownership.fenceId,
        candidate_deployment_id: ownership.candidate.deploymentId,
        candidate_deployment_commit: ownership.candidate.commit,
      }, options);
    },
    beginAbortDispatch: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const authority = await inspectAuthority(options);
      const expected = persistentProviderAbortBoundary(authority);
      const abortRequestId = exactUuid(
        details.input.operationRequestId,
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_ID_INVALID",
      );
      const requestFingerprint = providerRequestFingerprint(
        "production-google-writer-provider-fence-acl-restore-dispatch-v1",
        details.operationRequestFingerprint,
        abortRequestId,
        details.transitionIntent.transitionIntentFingerprint,
        details.providerPreflight.providerPreflightFingerprint,
      );
      const rpcInput = {
        ...exactScope(),
        operation:
          "BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH",
        fence_id: ownership.fenceId,
        install_request_id: ownership.installRequestId,
        abort_request_id: abortRequestId,
        mutation_plan: "DRIVE_ACL_LEGACY_READER_TO_WRITER_V1",
        provider_mutation_class:
          details.transitionIntent.providerMutationClass,
        source_role: details.transitionIntent.sourceRole,
        target_role: details.transitionIntent.targetRole,
        transition_intent: details.transitionIntent,
        transition_intent_fingerprint:
          details.transitionIntent.transitionIntentFingerprint,
        provider_preflight_fingerprint:
          details.providerPreflight.providerPreflightFingerprint,
        request_fingerprint: requestFingerprint,
        candidate_deployment_id: ownership.candidate.deploymentId,
        candidate_deployment_commit: ownership.candidate.commit,
        deployment_id: ownership.candidate.deploymentId,
        deployment_commit: ownership.candidate.commit,
        ...expected,
        ...actorFields,
      };
      const claimClock =
        productionGoogleDriveAclDbDispatchChannel.beginClaim();
      const dispatched = await receiptRpc(
        "begin_production_google_writer_provider_fence_abort_dispatch",
        rpcInput,
        options,
      );
      const mutationDispatchUsable = dispatched.dispatch_usable === true &&
        dispatched.replay_usable === true && dispatched.idempotent === false;
      const recoveryDispatchUsable = dispatched.dispatch_usable === false &&
        dispatched.replay_usable === false && dispatched.idempotent === true &&
        ["PROVIDER_MUTATING", "OUTCOME_UNKNOWN"].includes(
          clean(dispatched.status).toUpperCase(),
        );
      if (value(dispatched, "fence_id", "fenceId").toLowerCase() !==
            ownership.fenceId ||
          value(dispatched, "mutation_plan", "mutationPlan") !==
            "DRIVE_ACL_LEGACY_READER_TO_WRITER_V1" ||
          value(dispatched, "provider_mutation_class", "providerMutationClass") !==
            details.transitionIntent.providerMutationClass ||
          value(dispatched, "target_role", "targetRole") !== "writer" ||
          value(dispatched, "transition_intent_fingerprint",
            "transitionIntentFingerprint") !==
              details.transitionIntent.transitionIntentFingerprint ||
          value(dispatched, "provider_preflight_fingerprint",
            "providerPreflightFingerprint") !==
              details.providerPreflight.providerPreflightFingerprint ||
          (!mutationDispatchUsable && !recoveryDispatchUsable) ||
          !uuid(value(dispatched, "dispatch_id", "dispatchId")) ||
          !integer(dispatched.remaining_dispatch_budget_ms ??
            dispatched.remainingDispatchBudgetMs)) {
        throw receiptError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH_RECEIPT_INVALID",
          "The provider ACL restore dispatch receipt was incomplete.",
        );
      }
      const recordOutcome = aclOutcomeRecorder({
        direction: "RESTORE",
        ownership,
        dispatched,
        details,
      });
      if (mutationDispatchUsable) {
        const databaseDispatchCapability =
          productionGoogleDriveAclDbDispatchChannel.issueReceipt(
            claimClock,
            dispatched,
            recordOutcome,
          );
        return Object.freeze({ ...dispatched, databaseDispatchCapability });
      }
      const databaseRecoveryCapability =
        productionGoogleDriveAclDbDispatchChannel.issueRecoveryReceipt(
          dispatched,
          recordOutcome,
        );
      return Object.freeze({ ...dispatched, databaseRecoveryCapability });
    },
    abortInstall: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const authority = await inspectAuthority(options);
      const expected = persistentProviderAbortBoundary(authority);
      const abortEvidence = providerAbortEvidence(
        details,
        ownership,
        expected,
        authenticatedActor,
      );
      const requestFingerprint = providerRequestFingerprint(
        "production-google-writer-provider-fence-abort-install-v1",
        details.operationRequestFingerprint,
        abortEvidence.restoration_evidence_fingerprint,
      );
      await receiptRpc(
        "abort_production_google_writer_provider_fence_install",
        {
          ...abortEvidence,
          request_fingerprint: requestFingerprint,
        },
        options,
      );
      return receiptRpc("inspect_production_google_writer_provider_fence", {
        ...exactScope(),
        install_request_id: ownership.installRequestId,
        fence_id: ownership.fenceId,
        candidate_deployment_id: ownership.candidate.deploymentId,
        candidate_deployment_commit: ownership.candidate.commit,
      }, options);
    },
    recordSettlement: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const authority = await inspectAuthority(options);
      const expected = persistentProviderReservationBoundary(authority);
      const quiesceEvidenceId = exactUuid(
        details.input.quiesceEvidenceId,
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
      );
      const stage = clean(details.stage).toUpperCase();
      if (!["ACL_READER_CONFIRMED", "SETTLEMENT_READBACK_1"].includes(stage)) {
        throw receiptError(
          "STEP12_GOOGLE_WRITER_PROVIDER_SETTLEMENT_STAGE_INVALID",
          "The provider settlement stage was invalid.",
          {},
          400,
        );
      }
      const observationRequestId = derivedProviderRequestId(
        `production-google-writer-provider-fence-${stage.toLowerCase()}-v1`,
        ownership.installRequestId,
      );
      const requestFingerprint = providerRequestFingerprint(
        `production-google-writer-provider-fence-${stage.toLowerCase()}-v1`,
        details.operationRequestFingerprint,
        observationRequestId,
        details.priorObservationId || "",
        details.providerFingerprint,
        details.canonicalValueFingerprint,
        details.formulaFingerprint,
      );
      return receiptRpc("record_production_google_writer_provider_fence_settlement", {
        ...exactScope(),
        operation: "RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_SETTLEMENT",
        stage,
        observation_request_id: observationRequestId,
        prior_observation_id: details.priorObservationId || null,
        fence_id: ownership.fenceId,
        install_request_id: ownership.installRequestId,
        quiesce_evidence_id: quiesceEvidenceId,
        request_fingerprint: requestFingerprint,
        ...actorFields,
        candidate_deployment_id: ownership.candidate.deploymentId,
        candidate_deployment_commit: ownership.candidate.commit,
        deployment_id: ownership.candidate.deploymentId,
        deployment_commit: ownership.candidate.commit,
        ...expected,
        provider_fingerprint: details.providerFingerprint,
        acl_fingerprint: details.aclFingerprint,
        canonical_value_fingerprint: details.canonicalValueFingerprint,
        formula_fingerprint: details.formulaFingerprint,
        combined_value_fingerprint: details.combinedValueFingerprint,
        permission_inventory_fingerprint: details.permissionInventoryFingerprint,
        structural_canary_fingerprint: details.structuralCanaryFingerprint,
        legacy_role: "reader",
        legacy_can_edit: false,
        legacy_can_share: false,
        legacy_edit_capability_fingerprint:
          details.legacyEditCapabilityFingerprint,
        acl_transition_intent_fingerprint:
          details.transitionIntentFingerprint,
        acl_transition_proof_fingerprint:
          details.transitionProof?.transitionFingerprint,
        acl_transition_proof: details.transitionProof,
        provider_observed_at: details.providerObservedAt,
      }, options);
    },
    finishInstall: async (details) => {
      const ownership = providerOwnership(
        details.controlReceipt,
        details.input,
        details.environment,
        env,
      );
      const authority = await inspectAuthority(options);
      const expected = persistentProviderReservationBoundary(authority);
      const quiesceEvidenceId = exactUuid(
        details.input.quiesceEvidenceId,
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_ID_INVALID",
      );
      const settlementReadback2RequestId = derivedProviderRequestId(
        "production-google-writer-provider-fence-settlement-readback-2-v1",
        ownership.installRequestId,
      );
      const settlementReadback2Fingerprint = providerRequestFingerprint(
        "production-google-writer-provider-fence-settlement-readback-2-v1",
        details.operationRequestFingerprint,
        settlementReadback2RequestId,
        details.settlementReadback1ObservationId,
        details.providerFingerprint,
        details.canonicalValueFingerprint,
        details.formulaFingerprint,
      );
      const closed = await receiptRpc(
        "finish_close_production_google_writer_provider_fence_install",
        {
          ...exactScope(),
          operation:
            "FINISH_AND_CLOSE_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
          expected_authority: "GOOGLE",
          fence_id: ownership.fenceId,
          install_request_id: ownership.installRequestId,
          quiesce_evidence_id: quiesceEvidenceId,
          request_fingerprint: providerRequestFingerprint(
            "production-google-writer-provider-fence-finish-and-close-v2",
            details.operationRequestFingerprint,
            details.providerFingerprint,
            details.canonicalValueFingerprint,
            details.formulaFingerprint,
            details.aclReaderConfirmedObservationId,
            details.settlementReadback1ObservationId,
          ),
          ...actorFields,
          candidate_deployment_id: ownership.candidate.deploymentId,
          candidate_deployment_commit: ownership.candidate.commit,
          deployment_id: ownership.candidate.deploymentId,
          deployment_commit: ownership.candidate.commit,
          ...expected,
          acl_reader_confirmed_observation_id:
            details.aclReaderConfirmedObservationId,
          settlement_readback_1_observation_id:
            details.settlementReadback1ObservationId,
          settlement_readback_2_request_id: settlementReadback2RequestId,
          settlement_readback_2_request_fingerprint:
            settlementReadback2Fingerprint,
          start_source_fingerprint: details.startSourceFingerprint,
          provider_fingerprint: details.providerFingerprint,
          acl_fingerprint: details.aclFingerprint,
          canonical_value_fingerprint: details.canonicalValueFingerprint,
          formula_fingerprint: details.formulaFingerprint,
          combined_value_fingerprint: details.combinedValueFingerprint,
          permission_inventory_fingerprint: details.permissionInventoryFingerprint,
          structural_canary_fingerprint: details.structuralCanaryFingerprint,
          legacy_role: "reader",
          legacy_can_edit: false,
          legacy_can_share: false,
          legacy_edit_capability_fingerprint:
            details.legacyEditCapabilityFingerprint,
          acl_transition_intent_fingerprint:
            details.transitionIntentFingerprint,
          acl_transition_proof_fingerprint:
            details.transitionProof?.transitionFingerprint,
          acl_transition_proof: details.transitionProof,
          provider_observed_at: details.providerObservedAt,
        },
        options,
      );
      if (clean(closed.admission_state).toUpperCase() !== "CLOSING" ||
          clean(closed.provider_fence_status).toUpperCase() !== "INSTALLED" ||
          !uuid(closed.provider_fence_verification_id)) {
        throw receiptError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ATOMIC_CLOSE_RECEIPT_INVALID",
          "The atomic provider-settlement and admission-close receipt was incomplete.",
        );
      }
      const receipt = await receiptRpc(
        "inspect_production_google_writer_provider_fence",
        {
          ...exactScope(),
          install_request_id: ownership.installRequestId,
          fence_id: ownership.fenceId,
          candidate_deployment_id: ownership.candidate.deploymentId,
          candidate_deployment_commit: ownership.candidate.commit,
        },
        options,
      );
      return {
        ...receipt,
        atomic_close_receipt: closed,
        admission_state: closed.admission_state,
        external_fence_evidence_id: closed.external_fence_evidence_id,
        settlement_completed_at: closed.settlement_completed_at,
      };
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
  });
}
