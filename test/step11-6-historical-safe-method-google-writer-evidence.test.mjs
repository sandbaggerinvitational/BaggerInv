import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_EVIDENCE_FINGERPRINT,
  PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_SCHEMA,
  productionHistoricalSafeMethodGoogleWriterEvidence,
} from "../lib/production-google-historical-safe-method-writer.js";
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
  assert.equal(evidence.originInventoryProviderRecordCount, 1292);
  assert.equal(evidence.auditScope.deploymentStatus, "READY");
  assert.equal(evidence.auditScope.routeFile, HISTORICAL_SAFE_METHOD_WRITER_FILE);
  assert.equal(evidence.auditScope.readyRecordCount, 1158);
  assert.equal(evidence.auditScope.readyUniqueNonNullCommitCount, 1096);
  assert.equal(evidence.auditScope.readyAuditedUniqueCommitCount, 1093);
  assert.equal(evidence.auditScope.readyUnauditableUniqueCommitCount, 3);
  assert.equal(evidence.auditScope.readyUnauditableRecordCount, 8);
  assert.equal(evidence.auditScope.routePresentRecordCount, 269);
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
  assert.equal(evidence.postFixRoute.affectedReadyDeploymentCount, 33);

  const exhaustive = evidence.exhaustiveSafeMethodRouteCallgraphAudit;
  assert.equal(exhaustive.readyAuditedUniqueCommitCount, 1093);
  assert.equal(exhaustive.routeBindingCount, 32408);
  assert.equal(exhaustive.uniqueRouteBlobCount, 470);
  assert.equal(exhaustive.explicitSafeHandlerBindingCount, 22669);
  assert.equal(exhaustive.reachableCallgraphNodeCount, 19842);
  assert.equal(exhaustive.reachableCallgraphEdgeCount, 43541);
  assert.equal(exhaustive.safeMethodGoogleWriterBindingCount, 1827);
  assert.equal(exhaustive.safeMethodGoogleWriterUniqueRouteCount, 26);
  assert.equal(exhaustive.safeMethodGoogleWriterUniqueCommitCount, 533);
  assert.equal(exhaustive.unresolvedReachableCallgraphReferenceCount, 0);
  assert.equal(exhaustive.sourceUnresolvedReferenceCount, 0);
  assert.equal(exhaustive.enforcementBoundary,
    "EXACT_LEGACY_DRIVE_PERMISSION_WRITER_TO_READER");
  assert.equal(exhaustive.allDiscoveredBindingsCoveredByPersistentAclFence, true);
  assert.deepEqual(exhaustive.safeMethodGoogleWriterPathSummary, [
    ["app/api/admin/cms/route.js", 306],
    ["app/api/admin/tournament/route.js", 306],
    ["app/api/cron/round-scorecards-archive/route.js", 210],
    ["app/api/director/route.js", 74],
    ["app/api/player-passport/activation/route.js", 173],
    ["app/api/player-passport/admin/route.js", 173],
    ["app/api/player-passport/notifications/route.js", 72],
    ["app/api/scoring/access/route.js", 178],
    ["app/api/scoring/matches/[matchId]/route.js", 12],
    ["app/api/tournament-guide/route.js", 323],
  ]);
});

test("runtime loader binds and freezes the versioned historical safe-method evidence", () => {
  const evidence = productionHistoricalSafeMethodGoogleWriterEvidence();
  assert.equal(evidence.schemaVersion,
    PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_SCHEMA);
  assert.equal(evidence.evidenceFingerprint,
    PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_EVIDENCE_FINGERPRINT);
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.historicalSafeMethodWriter), true);
  assert.equal(Object.isFrozen(evidence.historicalSafeMethodWriter.affectedReadyOrigins), true);
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
