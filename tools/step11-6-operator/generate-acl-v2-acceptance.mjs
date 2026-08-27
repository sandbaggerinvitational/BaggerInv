#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ACL_V2_ACCEPTANCE_KEYS,
  FIXED,
  assertNoSecrets,
  canonicalJson,
  computeAclV2AcceptanceFingerprint,
  validateAclV2Acceptance,
} from "./operator.mjs";

export const SANITIZED_REHEARSAL_RESULT_SCHEMA =
  "step11-6-production-google-drive-acl-v2-sanitized-rehearsal-result-v1";

const DEFAULT_OUTPUT_URL = new URL(
  "../../docs/evidence/step11-6-production-google-drive-acl-v2-acceptance-v1.json",
  import.meta.url,
);
const MIGRATION_URL = new URL(
  "../../supabase/production_migrations/202608260040_production_provider_inventory_recertification_v4.sql",
  import.meta.url,
);
const SOURCE_ACCEPTANCE_KEYS = Object.freeze(
  ACL_V2_ACCEPTANCE_KEYS.filter((key) => key !== "acceptanceFingerprint"),
);
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;
const RFC3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;

export class AclV2AcceptanceGenerationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AclV2AcceptanceGenerationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AclV2AcceptanceGenerationError(code, message);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  return plain(value) &&
    Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function requireExact(value, expected, field) {
  if (value !== expected) {
    fail("ACL_V2_ACCEPTANCE_BINDING_DRIFT", `${field} is not the exact certified value.`);
  }
}

function requirePattern(value, pattern, field) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail("ACL_V2_ACCEPTANCE_EVIDENCE_INVALID", `${field} is missing or invalid.`);
  }
}

function requireTimestamp(value, field) {
  requirePattern(value, RFC3339, field);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    fail("ACL_V2_ACCEPTANCE_EVIDENCE_INVALID", `${field} is not a valid timestamp.`);
  }
  return timestamp;
}

function requireZero(value, field) {
  if (value !== 0) {
    fail("ACL_V2_ACCEPTANCE_MUTATION_OBSERVED", `${field} must be exactly zero.`);
  }
}

function requireTrue(value, field) {
  if (value !== true) {
    fail("ACL_V2_ACCEPTANCE_NOT_PROVED", `${field} must be explicitly true.`);
  }
}

function currentMigrationSha256() {
  return createHash("sha256").update(readFileSync(MIGRATION_URL)).digest("hex");
}

function validatePrimaryProof(acceptance) {
  requireTrue(acceptance.acceptedAsPrimaryProof, "acceptedAsPrimaryProof");
  requireZero(acceptance.unexplainedConcurrencyWindowCount,
    "unexplainedConcurrencyWindowCount");

  for (const [field, expected] of [
    ["artifactPath", FIXED.aclAcceptanceArtifact],
    ["schemaVersion", FIXED.aclAcceptanceSchema],
    ["historicalWriterScopeArtifact", FIXED.historicalWriterScopeArtifact],
    ["historicalWriterScopeEvidenceFingerprint",
      FIXED.historicalWriterScopeEvidenceFingerprint],
    ["migrationSha256", currentMigrationSha256()],
    ["productionProjectRef", FIXED.projectRef],
    ["sourceWorkbookId", FIXED.sourceWorkbookId],
    ["originInventoryFingerprint", FIXED.originInventoryFingerprint],
    ["credentialConfinementEvidenceFingerprint",
      FIXED.credentialConfinementEvidenceFingerprint],
    ["lifecycleMode", "REHEARSAL"],
    ["mechanism", "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2"],
    ["baselineWafMode", FIXED.legacyCompatibleBaselineWafMode],
    ["criticalWindowWafMode", FIXED.criticalWindowWafMode],
    ["criticalWindowWafGroupCount", FIXED.criticalWindowWafGroupCount],
    ["criticalWindowMinimumHoldSeconds", FIXED.criticalWindowWafMinimumHoldSeconds],
    ["forwardDispatchResult", FIXED.aclTransitionResultTarget],
    ["reverseDispatchResult", FIXED.aclTransitionResultTarget],
    ["legacyRoleBefore", FIXED.legacyDriveRoleOpen],
    ["legacyRoleDuring", FIXED.legacyDriveRoleClosed],
    ["legacyRoleAfter", FIXED.legacyDriveRoleOpen],
    ["legacyCanEditDuring", false],
    ["legacyCanShareDuring", false],
    ["wafBaselineRestored", true],
  ]) requireExact(acceptance[field], expected, field);

  for (const field of [
    "oldDeploymentEnforcementPassed", "staleClientEnforcementPassed",
    "lowLevelWriterEnforcementPassed", "previewIsolationPassed",
    "restoredProductionStatePassed",
  ]) requireTrue(acceptance[field], field);

  for (const field of [
    "unknownAclDispatchCount", "googleDataMutationCount",
    "supabaseCanonicalWriteCount",
  ]) requireZero(acceptance[field], field);

  for (const field of [
    "migrationSha256", "historicalWriterScopeEvidenceFingerprint",
    "originInventoryFingerprint", "credentialConfinementEvidenceFingerprint",
    "baselineWafFingerprint", "criticalWindowWafFingerprint",
    "restoredWafFingerprint", "forwardTransitionProofFingerprint",
    "reverseTransitionProofFingerprint", "legacyPrincipalFingerprint",
  ]) requirePattern(acceptance[field], HEX64, field);
  requirePattern(acceptance.rehearsalCandidateSha, HEX40, "rehearsalCandidateSha");
  requirePattern(acceptance.rehearsalDeploymentId, DEPLOYMENT_ID,
    "rehearsalDeploymentId");
  for (const field of [
    "fenceId", "installRequestId", "quiesceEvidenceId",
    "restoreQuiesceEvidenceId", "forwardDispatchId", "reverseDispatchId",
    "settlementReadback1Id", "settlementReadback2Id",
  ]) requirePattern(acceptance[field], UUID, field);

  if (acceptance.restoredWafFingerprint !== acceptance.baselineWafFingerprint) {
    fail("ACL_V2_ACCEPTANCE_NOT_RESTORED",
      "The restored WAF fingerprint does not equal the captured baseline.");
  }
  if (acceptance.criticalWindowWafFingerprint === acceptance.baselineWafFingerprint) {
    fail("ACL_V2_ACCEPTANCE_FENCE_NOT_PROVED",
      "The critical-window WAF fingerprint did not differ from baseline.");
  }

  const criticalActivatedAt = requireTimestamp(
    acceptance.criticalWindowActivatedAt, "criticalWindowActivatedAt");
  const readerConfirmedAt = requireTimestamp(
    acceptance.aclReaderConfirmedAt, "aclReaderConfirmedAt");
  const restoreCriticalActivatedAt = requireTimestamp(
    acceptance.restoreCriticalWindowActivatedAt,
    "restoreCriticalWindowActivatedAt");
  const writerRestoredAt = requireTimestamp(
    acceptance.aclWriterRestoredAt, "aclWriterRestoredAt");
  const rehearsalRestoredAt = requireTimestamp(
    acceptance.rehearsalRestoredAt, "rehearsalRestoredAt");
  const capturedAt = requireTimestamp(acceptance.capturedAt, "capturedAt");
  if (!(criticalActivatedAt <= readerConfirmedAt &&
      readerConfirmedAt <= restoreCriticalActivatedAt &&
      restoreCriticalActivatedAt <= writerRestoredAt &&
      writerRestoredAt <= rehearsalRestoredAt &&
      rehearsalRestoredAt <= capturedAt)) {
    fail("ACL_V2_ACCEPTANCE_CHRONOLOGY_INVALID",
      "The physical rehearsal chronology is not monotonic.");
  }
  const heldSeconds = Math.floor((writerRestoredAt - restoreCriticalActivatedAt) / 1000);
  if (heldSeconds < FIXED.criticalWindowWafMinimumHoldSeconds ||
      acceptance.criticalWindowHeldSeconds !== heldSeconds) {
    fail("ACL_V2_ACCEPTANCE_HOLD_TOO_SHORT",
      "The DB-recorded critical window is short or does not match its timestamps.");
  }
}

export function generateAclV2AcceptanceArtifact(sanitizedResult) {
  if (!exactKeys(sanitizedResult, ["schemaVersion", "acceptance"])) {
    fail("ACL_V2_ACCEPTANCE_SOURCE_INVALID",
      "The sanitized result must contain only schemaVersion and acceptance.");
  }
  requireExact(sanitizedResult.schemaVersion, SANITIZED_REHEARSAL_RESULT_SCHEMA,
    "sanitizedResult.schemaVersion");
  if (!exactKeys(sanitizedResult.acceptance, SOURCE_ACCEPTANCE_KEYS)) {
    fail("ACL_V2_ACCEPTANCE_SOURCE_INVALID",
      "The sanitized acceptance source has missing or unknown fields.");
  }
  assertNoSecrets(sanitizedResult, "sanitizedRehearsalResult");
  const serialized = canonicalJson(sanitizedResult).toLowerCase();
  for (const previewResource of [
    FIXED.previewProjectRef, FIXED.previewProjectUrl, FIXED.previewWorkbookId,
  ]) {
    if (serialized.includes(previewResource.toLowerCase())) {
      fail("ACL_V2_ACCEPTANCE_PREVIEW_FORBIDDEN",
        "The sanitized result contains a Preview resource.");
    }
  }

  const acceptance = structuredClone(sanitizedResult.acceptance);
  validatePrimaryProof(acceptance);
  acceptance.acceptanceFingerprint = computeAclV2AcceptanceFingerprint(acceptance);
  validateAclV2Acceptance({ aclV2Acceptance: acceptance });
  return acceptance;
}

export function writeAclV2AcceptanceArtifact({ inputPath, outputPath } = {}) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    fail("ACL_V2_ACCEPTANCE_INPUT_REQUIRED", "--input <sanitized-result.json> is required.");
  }
  const source = JSON.parse(readFileSync(path.resolve(inputPath), "utf8"));
  const acceptance = generateAclV2AcceptanceArtifact(source);
  const target = outputPath ? path.resolve(outputPath) : DEFAULT_OUTPUT_URL;
  writeFileSync(target, `${JSON.stringify(acceptance, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o644,
  });
  return Object.freeze({
    artifactPath: outputPath ? path.resolve(outputPath) : FIXED.aclAcceptanceArtifact,
    acceptanceFingerprint: acceptance.acceptanceFingerprint,
  });
}

function cliValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function main() {
  const allowed = new Set(["--input", "--output"]);
  for (let index = 2; index < process.argv.length; index += 2) {
    if (!allowed.has(process.argv[index]) || index + 1 >= process.argv.length) {
      fail("ACL_V2_ACCEPTANCE_ARGUMENT_INVALID",
        "Usage: generate-acl-v2-acceptance.mjs --input <sanitized-result.json> [--output <path>]");
    }
  }
  const result = writeAclV2AcceptanceArtifact({
    inputPath: cliValue("--input"),
    outputPath: cliValue("--output"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error.code || "ACL_V2_ACCEPTANCE_GENERATION_FAILED"}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
