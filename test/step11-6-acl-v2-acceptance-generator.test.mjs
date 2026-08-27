import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  AclV2AcceptanceGenerationError,
  SANITIZED_REHEARSAL_RESULT_SCHEMA,
  generateAclV2AcceptanceArtifact,
} from "../tools/step11-6-operator/generate-acl-v2-acceptance.mjs";
import {
  ACL_V2_ACCEPTANCE_KEYS,
  FIXED,
  computeAclV2AcceptanceFingerprint,
} from "../tools/step11-6-operator/operator.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const GENERATOR = path.join(
  ROOT, "tools/step11-6-operator/generate-acl-v2-acceptance.mjs",
);
const MIGRATION = path.join(
  ROOT,
  "supabase/production_migrations/202608260040_production_provider_inventory_recertification_v4.sql",
);
const migrationSha256 = () => createHash("sha256")
  .update(readFileSync(MIGRATION)).digest("hex");

function sanitizedResult() {
  return {
    schemaVersion: SANITIZED_REHEARSAL_RESULT_SCHEMA,
    acceptance: {
      artifactPath: FIXED.aclAcceptanceArtifact,
      schemaVersion: FIXED.aclAcceptanceSchema,
      acceptedAsPrimaryProof: true,
      unexplainedConcurrencyWindowCount: 0,
      historicalWriterScopeArtifact: FIXED.historicalWriterScopeArtifact,
      historicalWriterScopeEvidenceFingerprint:
        FIXED.historicalWriterScopeEvidenceFingerprint,
      rehearsalCandidateSha: "a".repeat(40),
      rehearsalDeploymentId: "dpl_RehearsalAclV2Candidate123",
      migrationSha256: migrationSha256(),
      productionProjectRef: FIXED.projectRef,
      sourceWorkbookId: FIXED.sourceWorkbookId,
      originInventoryFingerprint: FIXED.originInventoryFingerprint,
      credentialConfinementEvidenceFingerprint:
        FIXED.credentialConfinementEvidenceFingerprint,
      lifecycleMode: "REHEARSAL",
      mechanism: "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2",
      baselineWafMode: FIXED.legacyCompatibleBaselineWafMode,
      criticalWindowWafMode: FIXED.criticalWindowWafMode,
      criticalWindowWafGroupCount: FIXED.criticalWindowWafGroupCount,
      baselineWafFingerprint: "1".repeat(64),
      criticalWindowWafFingerprint: "2".repeat(64),
      restoredWafFingerprint: "1".repeat(64),
      criticalWindowActivatedAt: "2026-08-27T10:00:00Z",
      criticalWindowHeldSeconds: FIXED.criticalWindowWafMinimumHoldSeconds,
      criticalWindowMinimumHoldSeconds: FIXED.criticalWindowWafMinimumHoldSeconds,
      fenceId: "10000000-0000-4000-8000-000000000001",
      installRequestId: "10000000-0000-4000-8000-000000000002",
      quiesceEvidenceId: "10000000-0000-4000-8000-000000000003",
      restoreQuiesceEvidenceId: "10000000-0000-4000-8000-000000000004",
      forwardDispatchId: "10000000-0000-4000-8000-000000000005",
      forwardDispatchResult: "TARGET_CONFIRMED",
      forwardTransitionProofFingerprint: "3".repeat(64),
      aclReaderConfirmedAt: "2026-08-27T10:00:00Z",
      reverseDispatchId: "10000000-0000-4000-8000-000000000006",
      reverseDispatchResult: "TARGET_CONFIRMED",
      reverseTransitionProofFingerprint: "4".repeat(64),
      restoreCriticalWindowActivatedAt: "2026-08-27T10:00:00Z",
      aclWriterRestoredAt: "2026-08-27T10:30:10Z",
      rehearsalRestoredAt: "2026-08-27T10:30:11Z",
      settlementReadback1Id: "10000000-0000-4000-8000-000000000007",
      settlementReadback2Id: "10000000-0000-4000-8000-000000000008",
      legacyRoleBefore: "writer",
      legacyRoleDuring: "reader",
      legacyRoleAfter: "writer",
      legacyCanEditDuring: false,
      legacyCanShareDuring: false,
      legacyPrincipalFingerprint: "5".repeat(64),
      unknownAclDispatchCount: 0,
      wafBaselineRestored: true,
      googleDataMutationCount: 0,
      supabaseCanonicalWriteCount: 0,
      oldDeploymentEnforcementPassed: true,
      staleClientEnforcementPassed: true,
      lowLevelWriterEnforcementPassed: true,
      previewIsolationPassed: true,
      restoredProductionStatePassed: true,
      capturedAt: "2026-08-27T10:30:11Z",
    },
  };
}

function expectCode(code, mutate) {
  const source = sanitizedResult();
  mutate(source);
  assert.throws(
    () => generateAclV2AcceptanceArtifact(source),
    (error) => error instanceof AclV2AcceptanceGenerationError &&
      error.code === code,
  );
}

test("generator emits the operator's exact acceptance schema and fingerprint", () => {
  const artifact = generateAclV2AcceptanceArtifact(sanitizedResult());
  assert.deepEqual(Object.keys(artifact).sort(), [...ACL_V2_ACCEPTANCE_KEYS].sort());
  assert.equal(
    artifact.acceptanceFingerprint,
    computeAclV2AcceptanceFingerprint(artifact),
  );
  assert.equal(artifact.acceptedAsPrimaryProof, true);
  assert.equal(artifact.restoredWafFingerprint, artifact.baselineWafFingerprint);
});

test("generator fails closed on missing and unknown evidence fields", () => {
  expectCode("ACL_V2_ACCEPTANCE_SOURCE_INVALID", (source) => {
    delete source.acceptance.reverseDispatchId;
  });
  expectCode("ACL_V2_ACCEPTANCE_SOURCE_INVALID", (source) => {
    source.acceptance.unreviewedEvidence = true;
  });
  expectCode("ACL_V2_ACCEPTANCE_SOURCE_INVALID", (source) => {
    source.unreviewedEnvelope = true;
  });
});

test("generator rejects unknown dispatches, short holds, and non-restored state", () => {
  expectCode("ACL_V2_ACCEPTANCE_BINDING_DRIFT", (source) => {
    source.acceptance.forwardDispatchResult = "OUTCOME_UNKNOWN";
    source.acceptance.unknownAclDispatchCount = 1;
  });
  expectCode("ACL_V2_ACCEPTANCE_HOLD_TOO_SHORT", (source) => {
    source.acceptance.aclWriterRestoredAt = "2026-08-27T10:30:09Z";
    source.acceptance.criticalWindowHeldSeconds = 1809;
  });
  expectCode("ACL_V2_ACCEPTANCE_NOT_RESTORED", (source) => {
    source.acceptance.restoredWafFingerprint = "6".repeat(64);
  });
  expectCode("ACL_V2_ACCEPTANCE_BINDING_DRIFT", (source) => {
    source.acceptance.legacyRoleAfter = "reader";
  });
  expectCode("ACL_V2_ACCEPTANCE_NOT_PROVED", (source) => {
    source.acceptance.restoredProductionStatePassed = false;
  });
});

test("generator rejects any reported Google or Supabase canonical mutation", () => {
  expectCode("ACL_V2_ACCEPTANCE_MUTATION_OBSERVED", (source) => {
    source.acceptance.googleDataMutationCount = 1;
  });
  expectCode("ACL_V2_ACCEPTANCE_MUTATION_OBSERVED", (source) => {
    source.acceptance.supabaseCanonicalWriteCount = 1;
  });
});

test("CLI writes one immutable local artifact and never calls a provider", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "bagger-acl-v2-acceptance-"));
  try {
    const inputPath = path.join(directory, "sanitized.json");
    const outputPath = path.join(directory, "acceptance.json");
    writeFileSync(inputPath, JSON.stringify(sanitizedResult()));
    const first = spawnSync(process.execPath, [
      GENERATOR, "--input", inputPath, "--output", outputPath,
    ], { cwd: ROOT, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(artifact.acceptanceFingerprint,
      computeAclV2AcceptanceFingerprint(artifact));
    assert.equal(statSync(outputPath).mode & 0o777, 0o644);

    const second = spawnSync(process.execPath, [
      GENERATOR, "--input", inputPath, "--output", outputPath,
    ], { cwd: ROOT, encoding: "utf8" });
    assert.notEqual(second.status, 0);

    const source = readFileSync(GENERATOR, "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /@supabase|createClient|execFile|spawnSync/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
