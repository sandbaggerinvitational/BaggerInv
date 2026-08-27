import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  HISTORICAL_SAFE_METHOD_405_BLOB,
  HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT,
  HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT,
  HISTORICAL_SAFE_METHOD_WRITER_BLOB,
  HISTORICAL_SAFE_METHOD_WRITER_BLOCKED_PATHS_FINGERPRINT,
  HISTORICAL_SAFE_METHOD_WRITER_FILE,
  HISTORICAL_SAFE_METHOD_WRITER_REQUEST_PATH,
  HISTORICAL_SAFE_METHOD_WRITER_SCHEMA,
  verifyHistoricalSafeMethodGoogleWriterEvidence,
} from "../tools/step11-6-operator/generate-historical-safe-method-google-writer-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("historical READY deployments with the safe-method Google writer are exact", () => {
  const evidence = verifyHistoricalSafeMethodGoogleWriterEvidence();
  assert.equal(evidence.schemaVersion, HISTORICAL_SAFE_METHOD_WRITER_SCHEMA);
  assert.equal(evidence.originInventoryProviderRecordCount, 1291);
  assert.equal(evidence.auditScope.deploymentStatus, "READY");
  assert.equal(evidence.auditScope.routeFile, HISTORICAL_SAFE_METHOD_WRITER_FILE);
  assert.equal(evidence.auditScope.readyRecordCount, 1157);
  assert.equal(evidence.auditScope.readyUniqueNonNullCommitCount, 1095);
  assert.equal(evidence.auditScope.readyAuditedUniqueCommitCount, 1092);
  assert.equal(evidence.auditScope.readyUnauditableUniqueCommitCount, 3);
  assert.equal(evidence.auditScope.readyUnauditableRecordCount, 8);
  assert.equal(evidence.auditScope.routePresentRecordCount, 268);
  assert.equal(evidence.auditScope.routeAbsentRecordCount, 881);
  assert.equal(evidence.auditScope.observedRouteBlobCount, 2);
  assert.equal(evidence.auditScope.unexplainedRouteBlobCount, 0);

  const writer = evidence.historicalSafeMethodWriter;
  assert.equal(writer.routeBlob, HISTORICAL_SAFE_METHOD_WRITER_BLOB);
  assert.equal(writer.operationClass, "MIRROR_ARCHIVE");
  assert.equal(writer.writerIntent, "MIRROR_ARCHIVE");
  assert.equal(writer.externalMutationTarget, "GOOGLE_ROUND_SCORECARDS_WORKSHEET");
  assert.deepEqual(writer.explicitMutatingMethods, ["GET"]);
  assert.deepEqual(writer.frameworkDispatchedPotentialMutatingMethods, ["HEAD"]);
  assert.equal(writer.optionsMutationObserved, false);
  assert.equal(writer.affectedReadyDeploymentCount,
    HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT);
  assert.equal(writer.affectedReadyOriginCount,
    HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT);
  assert.equal(writer.affectedReadyOrigins.length,
    HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT);
  assert.equal(sha256(JSON.stringify(writer.affectedReadyOrigins)),
    HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT);
  assert.equal(writer.affectedReadyOriginsFingerprint,
    HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT);
  assert.equal(writer.affectedUniqueCommitCount, 210);
  assert.deepEqual(writer.deploymentTargetSummary, [["PREVIEW", 236]]);
  assert.deepEqual(writer.gitBranchSummary, [
    ["feature/mock-tournament-qa-integration", 235],
    ["fix/step-8b-2a-phone-auth-uuid-mismatch", 1],
  ]);
  assert.deepEqual(writer.providerSourceSummary, [
    ["CLI", 24], ["GIT", 209], ["REDEPLOY", 2], ["UNAVAILABLE", 1],
  ]);
  assert.equal(evidence.postFixRoute.routeBlob, HISTORICAL_SAFE_METHOD_405_BLOB);
  assert.equal(evidence.postFixRoute.safeMethodBehavior, "GET_405_ALLOW_POST");
  assert.equal(evidence.postFixRoute.affectedReadyDeploymentCount, 32);
});

test("the provider contract uses one exact all-method path OR group", () => {
  const contract = verifyHistoricalSafeMethodGoogleWriterEvidence()
    .providerFenceContract;
  assert.deepEqual(contract.blockedRequestPaths,
    [HISTORICAL_SAFE_METHOD_WRITER_REQUEST_PATH]);
  assert.equal(contract.blockedRequestPathCount, 1);
  assert.equal(contract.blockedRequestPathsFingerprint,
    HISTORICAL_SAFE_METHOD_WRITER_BLOCKED_PATHS_FINGERPRINT);
  assert.equal(contract.conditionType, "path");
  assert.equal(contract.conditionOperator, "inc");
  assert.equal(contract.methodScope, "ALL_METHODS");
  assert.equal(contract.conditionGroupRelation, "OR");
  assert.equal(
    contract.sourceUnresolvedReadyOriginsRemainCoveredByExactHostAllMethodGroup,
    true,
  );
  assert.equal(contract.policy,
    "EXACT_HISTORICAL_SAFE_METHOD_GOOGLE_WRITER_PATH_REQUIRES_ALL_METHOD_PROJECT_WIDE_DENY");
});
