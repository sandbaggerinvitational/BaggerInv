import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIXED,
  OperatorRefusalError,
  buildOperationEnvelope,
  computeExecutionBundleMaterialFingerprint,
  evaluateReadiness,
  validateManifest,
} from "./operator.mjs";

const template = JSON.parse(readFileSync(
  new URL("./manifest.template.json", import.meta.url),
  "utf8",
));

const U = Object.freeze({
  authority: "11111111-1111-4111-8111-111111111111",
  admission: "22222222-2222-4222-8222-222222222222",
  evidence: "33333333-3333-4333-8333-333333333333",
  closure: "44444444-4444-4444-8444-444444444444",
  epoch: "55555555-5555-4555-8555-555555555555",
});

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function certifiedManifest() {
  const manifest = copy(template);
  Object.assign(manifest.release, {
    candidateSha: "a".repeat(40),
    frozenSha: "a".repeat(40),
    deploymentId: "dpl_AbCdEf123456",
    certificationFingerprint: "b".repeat(64),
    environmentDeltaFingerprintV2: "c".repeat(64),
    executionBundleFingerprintV2: "d".repeat(64),
    migrationSha256: "e".repeat(64),
  });
  Object.assign(manifest.certification, {
    migrationInstalledDormant: true,
    focusedTestsPassed: true,
    criticalTestsPassed: true,
    productionBuildPassed: true,
    nonAuthoritativeCandidateReady: true,
    previewIsolationPassed: true,
    oldHostEnforcementPassed: true,
    unexplainedConcurrencyWindows: 0,
    clientSecretExposures: 0,
  });
  Object.assign(manifest.providerFenceProof, {
    status: "VERIFIED",
    evidenceId: U.evidence,
    capturedAt: "2026-08-26T12:00:00Z",
    expiresAt: "2026-08-26T12:30:00Z",
    exactOldHostProviderFence: true,
    allProductionCapableOriginsControlled: true,
    legacyDeploymentsFenced: true,
    googleCredentialsFenced: true,
    manualGoogleScoringFenced: true,
    previewResourcesAbsent: true,
    providerEvidenceFingerprint: "1".repeat(64),
    deploymentScopeFingerprint: "2".repeat(64),
    googleCredentialScopeFingerprint: "3".repeat(64),
    writerCoverageFingerprint: "4".repeat(64),
    legacyLeaseSetFingerprint: "5".repeat(64),
    legacyLeaseCount: 0,
    boundImmutableScope: {
      providerEvidenceFingerprint: "1".repeat(64),
      deploymentScopeFingerprint: "2".repeat(64),
      googleCredentialScopeFingerprint: "3".repeat(64),
      writerCoverageFingerprint: "4".repeat(64),
    },
    originMatrix: [
      {
        origin: "https://baggerinv.com",
        productionCredentialsAvailable: true,
        admissionEnforced: true,
        providerWriterFenced: true,
        canWriteAfterClosed: false
      },
      {
        origin: "https://old-immutable.example.invalid",
        productionCredentialsAvailable: true,
        admissionEnforced: false,
        providerWriterFenced: true,
        canWriteAfterClosed: false
      }
    ],
  });
  Object.assign(manifest.state, {
    admissionRevision: 7,
    admissionGeneration: U.admission,
    authorityGeneration: U.authority,
  });
  Object.assign(manifest.evidence, {
    startSourceFingerprint: "6".repeat(64),
    finalGoogleFingerprint: "7".repeat(64),
    reconciliationFingerprint: "8".repeat(64),
    closureBoundaryFingerprint: "9".repeat(64),
    supabaseShadowFingerprint: "a".repeat(64),
    boundaryCapturedAt: "2026-08-26T12:05:00Z",
    stableReadbackCount: 2,
    rollbackStartSourceFingerprint: "b".repeat(64),
    rollbackFinalCanonicalFingerprint: "c".repeat(64),
    rollbackReconciliationFingerprint: "d".repeat(64),
    rollbackClosureBoundaryFingerprint: "e".repeat(64),
    rollbackBoundaryCapturedAt: "2026-08-26T12:10:00Z",
    rollbackStableReadbackCount: 2,
  });
  let index = 16;
  for (const key of Object.keys(manifest.stableRequestIds)) {
    const suffix = index.toString(16).padStart(12, "0");
    manifest.stableRequestIds[key] = `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`;
    index += 1;
  }
  return manifest;
}

function closingManifest() {
  const manifest = certifiedManifest();
  Object.assign(manifest.state, {
    cutoverPhase: "SCORING_PREPARE",
    activationState: "GOOGLE_LEASE_ARMED",
    admissionProtocolEnforced: true,
    admissionState: "CLOSING",
    admissionDeploymentId: manifest.release.deploymentId,
    activeClosureId: U.closure,
    activeClosureKind: "LEGACY_ADMISSION",
    activeClosureStatus: "CLOSING",
    externalFenceEvidenceId: U.evidence,
  });
  return manifest;
}

function closedManifest() {
  const manifest = closingManifest();
  Object.assign(manifest.state, {
    admissionState: "CLOSED",
    activeClosureStatus: "CLOSED",
    finalGoogleAuthoritySnapshotSafe: true,
    supabaseAuthorityPrepareSafe: true,
    supabaseShadowParityExact: true,
  });
  return manifest;
}

function supabaseCommittedManifest() {
  const manifest = closedManifest();
  Object.assign(manifest.state, {
    activationState: "SCORING_COMMITTED",
    scoringAuthority: "SUPABASE",
    gateExecutionState: "OPEN",
    scoringIngressEnabled: true,
    activeClosureKind: "LEGACY_ADMISSION",
    activeClosureStatus: "CONSUMED",
    firstSupabaseCanonicalWritePossible: true,
    firstSupabaseCanonicalWriteObserved: false,
    rollbackClassification: "POST-COMMIT / NO WRITE",
  });
  return manifest;
}

function supabaseIngressPausedManifest() {
  const manifest = supabaseCommittedManifest();
  Object.assign(manifest.state, {
    gateExecutionState: "PAUSED",
    activeClosureKind: "SUPABASE_INGRESS",
    activeClosureStatus: "CLOSING",
  });
  return manifest;
}

function supabaseIngressClosedManifest() {
  const manifest = supabaseIngressPausedManifest();
  manifest.state.activeClosureStatus = "CLOSED";
  return manifest;
}

function expectRefusal(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof OperatorRefusalError);
    assert.equal(error.code, code);
    return true;
  });
}

test("template is structurally valid, inert, and not execution-ready", () => {
  assert.equal(validateManifest(template).ok, true);
  const readiness = evaluateReadiness(template);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.some((value) => value.includes("candidateSha")));
  assert.ok(readiness.blockers.some((value) => value.includes("originMatrix")));
});

test("claimed readiness is ignored; exact evidence derives readiness", () => {
  const manifest = certifiedManifest();
  manifest.executionReadiness.ready = false;
  assert.deepEqual(evaluateReadiness(manifest), { ready: true, blockers: [] });
  manifest.executionReadiness.ready = true;
  manifest.providerFenceProof.exactOldHostProviderFence = false;
  const result = evaluateReadiness(manifest);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("providerFenceProof.exactOldHostProviderFence is not true"));
});

test("readiness rejects one unfenced immutable Production origin", () => {
  const manifest = certifiedManifest();
  manifest.providerFenceProof.originMatrix[1].providerWriterFenced = false;
  assert.equal(evaluateReadiness(manifest).ready, false);
});

test("manifest refuses any executable/network/provider/credential capability", () => {
  for (const key of ["enabled", "networkAllowed", "providerSdkAllowed", "credentialReaderAllowed", "sqlExecutionAllowed"]) {
    const manifest = certifiedManifest();
    manifest.execution[key] = true;
    expectRefusal("INERT_EXECUTION_REQUIRED", () => validateManifest(manifest));
  }
});

test("Preview resources and secret-bearing operation input fail closed", () => {
  const preview = certifiedManifest();
  preview.operationInputs["stage-release"].source_matrix_fingerprint = FIXED.previewProjectRef;
  expectRefusal("PREVIEW_RESOURCE_FORBIDDEN", () => validateManifest(preview));

  const secret = certifiedManifest();
  secret.operationInputs["stage-release"].private_key = "not-even-a-real-key";
  expectRefusal("SECRET_INPUT_FORBIDDEN", () => validateManifest(secret));
});

test("DORMANT read-only inspection is exact-scope and does not need release placeholders", () => {
  const envelope = buildOperationEnvelope(template, "inspect");
  assert.equal(envelope.executable, false);
  assert.equal(envelope.rpc, "inspect_production_cutover_authority");
  assert.equal(envelope.payload.project_ref, FIXED.projectRef);
  assert.equal(envelope.payload.source_workbook_id, FIXED.sourceWorkbookId);
  assert.equal(envelope.stableRequestId, null);
  assert.match(envelope.sqlEnvelope, /^select public\.inspect_production_cutover_authority\(/);
});

test("stage payload binds exact frozen SHA and deterministic stable request identity", () => {
  const manifest = certifiedManifest();
  const first = buildOperationEnvelope(manifest, "stage-release");
  const retry = buildOperationEnvelope(manifest, "stage-release");
  assert.deepEqual(first, retry);
  assert.equal(first.payload.deployment_commit, manifest.release.frozenSha);
  assert.equal(first.payload.vercel_project_id, FIXED.vercelProjectId);
  assert.equal(first.stableRequestId, manifest.stableRequestIds["stage-release"]);
  assert.match(first.requestFingerprint, /^[0-9a-f]{64}$/);
});

test("phase skipping and stale optimistic revisions are refused", () => {
  const skipped = certifiedManifest();
  skipped.state.cutoverPhase = "READ_CUTOVER";
  expectRefusal("PHASE_SKIP_FORBIDDEN", () => buildOperationEnvelope(skipped, "stage-release"));

  const stale = closingManifest();
  stale.state.admissionRevision = "__STALE__";
  expectRefusal("STALE_ADMISSION_REVISION", () => buildOperationEnvelope(stale, "drain-legacy-admission"));
});

test("close requires barrier-aware state plus exact old-host provider fence", () => {
  const manifest = certifiedManifest();
  Object.assign(manifest.state, {
    cutoverPhase: "SCORING_PREPARE",
    activationState: "GOOGLE_LEASE_ARMED",
    admissionProtocolEnforced: true,
    admissionDeploymentId: manifest.release.deploymentId,
    gateExecutionState: "OPEN",
  });
  manifest.providerFenceProof.exactOldHostProviderFence = false;
  expectRefusal("PROVIDER_FENCE_REQUIRED", () => buildOperationEnvelope(manifest, "close-legacy-admission"));
  manifest.providerFenceProof.exactOldHostProviderFence = true;
  const envelope = buildOperationEnvelope(manifest, "close-legacy-admission");
  assert.equal(envelope.payload.expected_authority, "GOOGLE");
  assert.equal(envelope.payload.external_fence_evidence_id, U.evidence);
  assert.match(envelope.sqlEnvelope, /close_production_scoring_admission/);
});

test("provider-fence refresh preserves immutable scope and advances only bound evidence", () => {
  const manifest = closingManifest();
  const envelope = buildOperationEnvelope(manifest, "refresh-provider-fence");
  assert.equal(envelope.rpc, "refresh_production_scoring_external_fence_evidence");
  assert.equal(envelope.payload.prior_external_fence_evidence_id, U.evidence);
  assert.equal(envelope.payload.closure_id, U.closure);
  assert.equal(envelope.payload.provider_evidence_fingerprint,
    manifest.providerFenceProof.boundImmutableScope.providerEvidenceFingerprint);

  manifest.providerFenceProof.boundImmutableScope.writerCoverageFingerprint = "f".repeat(64);
  expectRefusal("PROVIDER_FENCE_REFRESH_SCOPE_DRIFT", () =>
    buildOperationEnvelope(manifest, "refresh-provider-fence"));
});

test("drain can inspect blockers, but fingerprint/finalize refuse potential writers", () => {
  const manifest = closingManifest();
  manifest.state.activeLegacyWriters = 1;
  assert.equal(buildOperationEnvelope(manifest, "drain-legacy-admission").rpc,
    "drain_production_scoring_admission");
  expectRefusal("LEGACY_WRITERS_NOT_DRAINED", () =>
    buildOperationEnvelope(manifest, "capture-final-google-fingerprint"));
  expectRefusal("LEGACY_WRITERS_NOT_DRAINED", () =>
    buildOperationEnvelope(manifest, "finalize-legacy-closed"));
});

test("final Google evidence is separate from CLOSED finalization", () => {
  const manifest = closingManifest();
  const capture = buildOperationEnvelope(manifest, "capture-final-google-fingerprint");
  assert.equal(capture.kind, "evidence-payload");
  assert.equal(capture.sqlEnvelope, null);
  assert.equal(capture.payload.stable_readback_count, 2);

  const finalize = buildOperationEnvelope(manifest, "finalize-legacy-closed");
  assert.equal(finalize.payload.final_source_fingerprint, manifest.evidence.finalGoogleFingerprint);
  assert.equal(finalize.payload.lease_set_fingerprint, manifest.evidence.closureBoundaryFingerprint);
});

test("prepare requires CLOSED and all machine-checkable safety predicates", () => {
  const unsafe = closedManifest();
  unsafe.state.supabaseAuthorityPrepareSafe = false;
  expectRefusal("SUPABASE_PREPARE_UNSAFE", () => buildOperationEnvelope(unsafe, "prepare-authority"));

  const envelope = buildOperationEnvelope(closedManifest(), "prepare-authority");
  assert.equal(envelope.payload.epoch_type, "CUTOVER");
  assert.equal(envelope.payload.closure_id, U.closure);
  assert.match(envelope.sqlEnvelope, /prepare_production_authority_epoch/);
});

test("commit preserves possible versus observed and rejects pre-existing writes", () => {
  const manifest = closedManifest();
  Object.assign(manifest.state, {
    activationState: "CUTOVER_PREPARED",
    preparedEpochId: U.epoch,
    supabaseAuthorityCommitSafe: true,
  });
  const envelope = buildOperationEnvelope(manifest, "commit-authority");
  assert.equal(envelope.payload.epoch_id, U.epoch);
  assert.equal(manifest.state.firstSupabaseCanonicalWritePossible, false);
  assert.equal(manifest.state.firstSupabaseCanonicalWriteObserved, false);

  manifest.state.firstSupabaseCanonicalWriteObserved = true;
  expectRefusal("FIRST_WRITE_OBSERVED_MISMATCH", () => buildOperationEnvelope(manifest, "commit-authority"));
});

test("reopen is impossible under Supabase authority or while a prepared epoch exists", () => {
  const manifest = closedManifest();
  manifest.state.legacyGoogleReopenSafe = true;
  manifest.state.scoringAuthority = "SUPABASE";
  expectRefusal("REOPEN_AUTHORITY_UNSAFE", () => buildOperationEnvelope(manifest, "reopen-legacy-admission"));

  manifest.state.scoringAuthority = "GOOGLE";
  manifest.state.preparedEpochId = U.epoch;
  expectRefusal("PREPARED_EPOCH_BLOCKS_REOPEN", () => buildOperationEnvelope(manifest, "reopen-legacy-admission"));
});

test("precommit abort is available only after explicit reopen and read/identity rollback", () => {
  const manifest = certifiedManifest();
  Object.assign(manifest.state, {
    cutoverPhase: "STATIC_BACKEND",
    activationState: "GOOGLE_LEASE_ARMED",
    admissionProtocolEnforced: true,
    admissionDeploymentId: manifest.release.deploymentId,
    gateExecutionState: "OPEN",
  });
  const envelope = buildOperationEnvelope(manifest, "abort-precommit-release");
  assert.equal(envelope.payload.operation, "ABORT_PRODUCTION_PRECOMMIT_RELEASE");
  assert.match(envelope.sqlEnvelope, /abort_production_precommit_release/);

  manifest.state.admissionState = "CLOSED";
  manifest.state.activeClosureId = U.closure;
  expectRefusal("ROLLBACK_ORDER_INVALID", () => buildOperationEnvelope(manifest, "abort-precommit-release"));
});

test("Supabase rollback begins with an exact atomic ingress-pause closure", () => {
  const manifest = supabaseCommittedManifest();
  const envelope = buildOperationEnvelope(manifest, "pause-supabase-ingress");
  assert.equal(envelope.rpc, "close_production_scoring_admission");
  assert.equal(envelope.payload.expected_authority, "SUPABASE");
  assert.equal(envelope.payload.start_source_fingerprint,
    manifest.evidence.rollbackStartSourceFingerprint);
  assert.equal(manifest.state.scoringIngressEnabled, true,
    "the activation authority flag remains true before rollback commit");

  manifest.state.gateExecutionState = "PAUSED";
  expectRefusal("GATE_STATE_MISMATCH", () =>
    buildOperationEnvelope(manifest, "pause-supabase-ingress"));
});

test("Supabase ingress drain allows inspection but closure waits for every writer", () => {
  const manifest = supabaseIngressPausedManifest();
  manifest.state.activeLegacyWriters = 1;
  const drain = buildOperationEnvelope(manifest, "drain-supabase-ingress");
  assert.equal(drain.rpc, "drain_production_scoring_admission");
  assert.equal(drain.payload.closure_id, U.closure);
  expectRefusal("LEGACY_WRITERS_NOT_DRAINED", () =>
    buildOperationEnvelope(manifest, "finalize-supabase-ingress-closed"));

  manifest.state.activeLegacyWriters = 0;
  const finalize = buildOperationEnvelope(manifest, "finalize-supabase-ingress-closed");
  assert.equal(finalize.rpc, "finalize_production_scoring_admission");
  assert.equal(finalize.payload.final_source_fingerprint,
    manifest.evidence.rollbackFinalCanonicalFingerprint);
  assert.equal(finalize.payload.reconciliation_fingerprint,
    manifest.evidence.rollbackReconciliationFingerprint);
  assert.equal(manifest.state.scoringIngressEnabled, true,
    "activation scoringIngressEnabled is distinct from the PAUSED gate");
});

test("rollback prepare and commit require a CLOSED SUPABASE_INGRESS closure with gate PAUSED", () => {
  const open = supabaseCommittedManifest();
  expectRefusal("GATE_STATE_MISMATCH", () => buildOperationEnvelope(open, "prepare-rollback"));

  const closing = supabaseIngressPausedManifest();
  expectRefusal("CLOSURE_STATUS_MISMATCH", () =>
    buildOperationEnvelope(closing, "prepare-rollback"));

  const preparedInput = supabaseIngressClosedManifest();
  const prepare = buildOperationEnvelope(preparedInput, "prepare-rollback");
  assert.equal(prepare.rpc, "prepare_production_authority_epoch");
  assert.equal(prepare.payload.epoch_type, "ROLLBACK");

  Object.assign(preparedInput.state, {
    activationState: "ROLLBACK_PREPARED",
    preparedEpochId: U.epoch,
  });
  const commit = buildOperationEnvelope(preparedInput, "commit-rollback");
  assert.equal(commit.rpc, "commit_production_authority_epoch");
  assert.equal(commit.payload.epoch_id, U.epoch);

  preparedInput.state.activeClosureKind = "LEGACY_ADMISSION";
  expectRefusal("CLOSURE_KIND_MISMATCH", () =>
    buildOperationEnvelope(preparedInput, "commit-rollback"));
});

test("rollback closure finalization, prepare, and commit fail fast on durable queue backlog", () => {
  const finalizing = supabaseIngressPausedManifest();
  finalizing.state.unresolvedOutbox = 1;
  expectRefusal("DURABLE_QUEUE_NOT_DRAINED", () =>
    buildOperationEnvelope(finalizing, "finalize-supabase-ingress-closed"));

  const preparing = supabaseIngressClosedManifest();
  preparing.state.unresolvedArchive = 1;
  expectRefusal("DURABLE_QUEUE_NOT_DRAINED", () =>
    buildOperationEnvelope(preparing, "prepare-rollback"));

  const committing = supabaseIngressClosedManifest();
  Object.assign(committing.state, {
    activationState: "ROLLBACK_PREPARED",
    preparedEpochId: U.epoch,
    unresolvedOutbox: 1,
  });
  expectRefusal("DURABLE_QUEUE_NOT_DRAINED", () =>
    buildOperationEnvelope(committing, "commit-rollback"));
});

test("queue diagnostics are typed and rendered with closure kind/status", () => {
  const invalid = certifiedManifest();
  invalid.state.unresolvedArchive = "0";
  expectRefusal("STATE_INVALID", () => validateManifest(invalid));

  const manifest = supabaseIngressPausedManifest();
  const envelope = buildOperationEnvelope(manifest, "drain-supabase-ingress");
  assert.deepEqual({
    activeClosureKind: envelope.diagnosticStateGuard.activeClosureKind,
    activeClosureStatus: envelope.diagnosticStateGuard.activeClosureStatus,
    unresolvedOutbox: envelope.diagnosticStateGuard.unresolvedOutbox,
    unresolvedArchive: envelope.diagnosticStateGuard.unresolvedArchive,
  }, {
    activeClosureKind: "SUPABASE_INGRESS",
    activeClosureStatus: "CLOSING",
    unresolvedOutbox: 0,
    unresolvedArchive: 0,
  });
});

test("operationInputs can repeat computed authority bindings only when exactly equal", () => {
  const manifest = closedManifest();
  Object.assign(manifest.operationInputs["prepare-authority"], {
    closure_id: U.closure,
    expected_activation_revision: manifest.state.activationRevision,
    source_fingerprint: manifest.evidence.finalGoogleFingerprint,
    external_fence_evidence_id: U.evidence,
  });
  const envelope = buildOperationEnvelope(manifest, "prepare-authority");
  assert.equal(envelope.payload.closure_id, U.closure);

  manifest.operationInputs["prepare-authority"].closure_id =
    "66666666-6666-4666-8666-666666666666";
  expectRefusal("AUTHORITY_BINDING_OVERRIDE_FORBIDDEN", () =>
    buildOperationEnvelope(manifest, "prepare-authority"));

  manifest.operationInputs["prepare-authority"].closure_id = U.closure;
  manifest.operationInputs["prepare-authority"].expected_activation_revision += 1;
  expectRefusal("AUTHORITY_BINDING_OVERRIDE_FORBIDDEN", () =>
    buildOperationEnvelope(manifest, "prepare-authority"));
});

test("post-write rollback requires enumeration with zero lost, duplicate, and unresolved writes", () => {
  const manifest = supabaseIngressClosedManifest();
  Object.assign(manifest.state, {
    activationState: "SCORING_COMMITTED",
    scoringAuthority: "SUPABASE",
    scoringIngressEnabled: true,
    gateExecutionState: "PAUSED",
    activeClosureKind: "SUPABASE_INGRESS",
    firstSupabaseCanonicalWritePossible: true,
    firstSupabaseCanonicalWriteObserved: true,
    rollbackClassification: "POST-WRITE",
  });
  manifest.state.preparedEpochId = null;
  manifest.evidence.allSupabaseWindowWritesEnumerated = false;
  expectRefusal("POST_WRITE_RECONCILIATION_REQUIRED", () =>
    buildOperationEnvelope(manifest, "prepare-rollback"));

  manifest.evidence.allSupabaseWindowWritesEnumerated = true;
  manifest.evidence.rollbackUnresolvedWrites = 1;
  expectRefusal("POST_WRITE_RECONCILIATION_REQUIRED", () =>
    buildOperationEnvelope(manifest, "prepare-rollback"));

  manifest.evidence.rollbackUnresolvedWrites = 0;
  const envelope = buildOperationEnvelope(manifest, "prepare-rollback");
  assert.equal(envelope.payload.epoch_type, "ROLLBACK");
});

test("post-commit/no-write rollback has an independent classification", () => {
  const manifest = supabaseIngressClosedManifest();
  Object.assign(manifest.state, {
    activationState: "SCORING_COMMITTED",
    scoringAuthority: "SUPABASE",
    scoringIngressEnabled: true,
    gateExecutionState: "PAUSED",
    activeClosureKind: "SUPABASE_INGRESS",
    firstSupabaseCanonicalWritePossible: true,
    firstSupabaseCanonicalWriteObserved: false,
    rollbackClassification: "POST-COMMIT / NO WRITE",
  });
  assert.equal(buildOperationEnvelope(manifest, "prepare-rollback").payload.epoch_type, "ROLLBACK");
  manifest.state.rollbackClassification = "PRE-WRITE";
  expectRefusal("ROLLBACK_CLASSIFICATION_MISMATCH", () =>
    buildOperationEnvelope(manifest, "prepare-rollback"));
});

test("worker and Odds payloads cannot change canonical or Odds publication authority", () => {
  const manifest = closedManifest();
  Object.assign(manifest.state, {
    activationState: "SCORING_COMMITTED",
    scoringAuthority: "SUPABASE",
    scoringIngressEnabled: true,
    gateExecutionState: "OPEN",
    activeClosureKind: "LEGACY_ADMISSION",
    firstSupabaseCanonicalWritePossible: true,
  });
  Object.assign(manifest.operationInputs.workers, {
    worker_name: "SCORING_GOOGLE_OUTBOX",
    enabled: true,
    google_service_account_email: "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
  });
  const worker = buildOperationEnvelope(manifest, "workers");
  assert.equal(worker.payload.worker_name, "SCORING_GOOGLE_OUTBOX");

  Object.assign(manifest.operationInputs["odds-runtime"], {
    enabled: true,
    expected_runtime_enabled: false,
    expected_runtime_revision: 3,
    operation_mode: "CUTOVER",
    cutover_phase: "ODDS_WAR_ROOM",
    operation: "ENABLE_PRODUCTION_ODDS_RUNTIME",
  });
  const odds = buildOperationEnvelope(manifest, "odds-runtime");
  assert.equal(odds.payload.worker_name, "ODDS_CALCULATION");
  assert.equal(manifest.resources.oddsPublicationAuthority, "GOOGLE");
});

test("output is sanitized and executable material contains no Preview identifiers", () => {
  const envelope = buildOperationEnvelope(certifiedManifest(), "stage-release");
  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes(FIXED.previewProjectRef), false);
  assert.equal(serialized.includes(FIXED.previewWorkbookId), false);
  assert.equal(serialized.includes("PRIVATE KEY"), false);
  assert.equal(envelope.networkCalls, 0);
  assert.equal(envelope.providerSdkCalls, 0);
  assert.equal(envelope.credentialReads, 0);
  assert.equal(envelope.sqlExecutions, 0);
});

test("execution bundle material fingerprint is deterministic and excludes claimed readiness", () => {
  const manifest = certifiedManifest();
  const first = computeExecutionBundleMaterialFingerprint(manifest);
  manifest.executionReadiness.ready = true;
  manifest.executionReadiness.note = "untrusted claim";
  const second = computeExecutionBundleMaterialFingerprint(manifest);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("operator implementation has no network, provider SDK, shell, or environment credential surface", () => {
  const source = readFileSync(new URL("./operator.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:(?:http|https|net|tls|dns|child_process|worker_threads)["']/);
  assert.doesNotMatch(source, /@supabase|@vercel|googleapis|fetch\s*\(|process\.env/);
});
