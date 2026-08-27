import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGIN_COUNT,
  PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGINS_FINGERPRINT,
  PRODUCTION_GOOGLE_CURRENT_UNRESOLVED_ALIAS_ORIGIN_COUNT,
  PRODUCTION_GOOGLE_CURRENT_UNRESOLVED_ALIAS_ORIGINS_FINGERPRINT,
  PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGIN_COUNT,
  PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGINS_FINGERPRINT,
  PRODUCTION_GOOGLE_HISTORICAL_CANONICAL_SHEET_COUNT,
  PRODUCTION_GOOGLE_HISTORICAL_CANONICAL_SHEETS_FINGERPRINT,
  PRODUCTION_GOOGLE_HISTORICAL_WRITER_SCOPE_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGIN_COUNT,
  PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGINS_FINGERPRINT,
  PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGIN_COUNT,
  productionGoogleHistoricalCanonicalSheetScope,
  productionGoogleHistoricalProviderFenceScope,
  productionGoogleHistoricalWriterScopeEvidence,
} from "../lib/production-google-historical-writer-scope.js";
import {
  buildHistoricalProductionGoogleWriterScopeEvidence,
  HISTORICAL_PRODUCTION_CANONICAL_MUTATION_METHODS,
  HISTORICAL_PRODUCTION_CANONICAL_MUTATION_ROUTES,
  HISTORICAL_PRODUCTION_CANONICAL_SHEETS,
  HISTORICAL_PRODUCTION_DEDICATED_CANONICAL_CANDIDATES,
  HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_ALIAS_AWARE_DENY_FINGERPRINT,
  HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_IMMUTABLE_DENY_FINGERPRINT,
  HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_SCHEMA,
  HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_UNRESOLVED_ORIGINS_FINGERPRINT,
  verifyHistoricalProductionGoogleWriterScopeEvidence,
} from "../tools/step11-6-operator/generate-historical-production-google-writer-scope-evidence.mjs";

const aliasCensusPath = new URL(
  "../docs/evidence/step11-6-production-active-alias-census-v1.json",
  import.meta.url,
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));

test("historical writer-scope evidence is generated from exact retained inputs", () => {
  const evidence = verifyHistoricalProductionGoogleWriterScopeEvidence();
  assert.equal(evidence.schemaVersion,
    HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_SCHEMA);
  assert.equal(evidence.evidenceFingerprint,
    PRODUCTION_GOOGLE_HISTORICAL_WRITER_SCOPE_EVIDENCE_FINGERPRINT);
  assert.equal(evidence.retainedSourceAudit.retainedDeploymentCount, 1292);
  assert.equal(evidence.retainedSourceAudit.retainedUniqueNonNullShaCount, 1224);
  assert.equal(evidence.retainedSourceAudit.locallyResolvableRetainedUniqueShaCount, 1221);
  assert.equal(evidence.retainedSourceAudit.locallyUnresolvableRetainedUniqueShaCount, 3);
  assert.equal(evidence.retainedSourceAudit.retainedNullShaDeploymentCount, 8);
  assert.equal(evidence.retainedSourceAudit.readyNullShaDeploymentCount, 5);
  assert.equal(evidence.retainedSourceAudit.nonReadyNullShaDeploymentCount, 3);
  assert.equal(evidence.retainedSourceAudit.readyDeploymentCount, 1158);
  assert.equal(evidence.retainedSourceAudit.readyUniqueNonNullShaCount, 1096);
  assert.equal(evidence.retainedSourceAudit.locallyResolvableReadyUniqueShaCount, 1093);
  assert.equal(evidence.retainedSourceAudit.locallyUnresolvableReadyUniqueShaCount, 3);
  assert.equal(evidence.retainedSourceAudit.sourceUnresolvedReadyDeploymentCount,
    PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGIN_COUNT);
  assert.equal(evidence.retainedSourceAudit.sourceUnresolvedReadyOriginsFingerprint,
    HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_UNRESOLVED_ORIGINS_FINGERPRINT);
  assert.equal(evidence.retainedSourceAudit.googleSheetsWritePresentUniqueBlobCount, 110);
  assert.equal(evidence.retainedSourceAudit.canonicalRouteBlobBindingCount, 101);
  assert.deepEqual(evidence.retainedSourceAudit.canonicalMutationMethods, ["POST"]);
  assert.deepEqual(evidence.retainedSourceAudit.observedCanonicalRouteExportedMethodUnion,
    ["GET", "POST"]);
  assert.deepEqual(evidence.retainedSourceAudit.observedGoogleTransportMutationMethodUnion,
    ["POST", "PUT"]);
});

test("current union historical canonical sheets is exactly seventeen with empty diffs", () => {
  const scope = productionGoogleHistoricalCanonicalSheetScope();
  assert.equal(scope.count, PRODUCTION_GOOGLE_HISTORICAL_CANONICAL_SHEET_COUNT);
  assert.equal(scope.fingerprint,
    PRODUCTION_GOOGLE_HISTORICAL_CANONICAL_SHEETS_FINGERPRINT);
  assert.deepEqual(scope.sheets, [...HISTORICAL_PRODUCTION_CANONICAL_SHEETS]);
  assert.equal(scope.unresolvedDynamicTargetCount, 0);
  const evidence = productionGoogleHistoricalWriterScopeEvidence();
  assert.deepEqual(evidence.canonicalWorksheetScope.currentMinusHistorical, []);
  assert.deepEqual(evidence.canonicalWorksheetScope.historicalMinusCurrent, []);
  assert.equal(evidence.canonicalWorksheetScope
    .noncanonicalMutationSheetsExcludedFromCanonicalRangeFence.includes("Round Scorecards"), true);
});

test("eight unresolved plus two current dedicated candidates form exact alias-aware deny sets", () => {
  const scope = productionGoogleHistoricalProviderFenceScope();
  assert.equal(scope.persistentImmutableOriginCount,
    PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGIN_COUNT);
  assert.equal(scope.persistentImmutableOriginsFingerprint,
    PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGINS_FINGERPRINT);
  assert.equal(scope.persistentImmutableOriginsFingerprint,
    HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_IMMUTABLE_DENY_FINGERPRINT);
  assert.equal(scope.currentAliasAwareOriginCount,
    PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGIN_COUNT);
  assert.equal(scope.currentAliasAwareOriginsFingerprint,
    PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGINS_FINGERPRINT);
  assert.equal(scope.currentAliasAwareOriginsFingerprint,
    HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_ALIAS_AWARE_DENY_FINGERPRINT);
  assert.deepEqual(scope.narrowAllMethodPaths,
    ["/api/cron/round-scorecards-archive"]);
  const waf = scope.permanentWafContract;
  assert.equal(waf.canonicalHostname, "baggerinv.com");
  assert.equal(waf.earlierActiveBypassRuleCount, 0);
  assert.deepEqual(waf.noncanonicalCanonicalMutationGroup.methods,
    ["GET", "HEAD", "OPTIONS"]);
  assert.equal(waf.sourceUnresolvedAndUnsafeAliasAllMethodGroup.hostCount,
    PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGIN_COUNT);
  assert.equal(waf.sourceUnresolvedAndUnsafeAliasAllMethodGroup.hostsFingerprint,
    PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGINS_FINGERPRINT);
  assert.equal(waf.sourceUnresolvedAndUnsafeAliasAllMethodGroup
    .sourceUnresolvedImmutableOriginCount,
  PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGIN_COUNT);
  assert.equal(waf.sourceUnresolvedAndUnsafeAliasAllMethodGroup.exactUnsafeAliasCount,
    PRODUCTION_GOOGLE_CURRENT_UNRESOLVED_ALIAS_ORIGIN_COUNT);
  assert.equal(waf.sourceUnresolvedAndUnsafeAliasAllMethodGroup
    .exactUnsafeAliasesFingerprint,
    PRODUCTION_GOOGLE_CURRENT_UNRESOLVED_ALIAS_ORIGINS_FINGERPRINT);
  assert.equal(waf.aliasRecapture.requiredConsecutiveProviderCaptures, 2);
  assert.equal(waf.aliasRecapture.providerSignedBeginAndFinalizeCapturesRequired, true);
  assert.equal(waf.aliasRecapture.browserSuppliedAliasInventoryAllowed, false);
  assert.equal(waf.aliasRecapture.providerAdminChangeFreezeRequired, true);
  assert.equal(waf.historicalEvidenceBindings.immutableOriginCount, 10);
  assert.equal(waf.historicalEvidenceBindings.aliasAwareOriginCount, 12);
});

test("Round Scorecards GET/HEAD remains mirror/archive and requires a narrow path fence", () => {
  const evidence = productionGoogleHistoricalWriterScopeEvidence();
  const writer = evidence.historicalRoundScorecardsSafeMethodWriter;
  assert.equal(writer.operationClass, "MIRROR_ARCHIVE");
  assert.deepEqual(writer.explicitMethods, ["GET"]);
  assert.deepEqual(writer.implicitFrameworkMethods, ["HEAD"]);
  assert.equal(writer.affectedReadyOriginCount, 236);
  assert.equal(writer.historicalBuildTimeWorkbookValuesProvenPreviewOnly, false);
  assert.equal(writer.productionWorkbookExecutionExcludedByNameOnlyEvidence, false);
  assert.equal(writer.requiredControl.type, "PERSISTENT_PROJECT_WIDE_PATH_DENY");
  assert.equal(writer.requiredControl.methods, "ALL_METHODS");
  assert.equal(writer.requiredControl.canonicalSeventeenSheetFenceExpanded, false);
});

test("the 300-second WAF duration is retained as unsafe root-cause evidence", () => {
  const evidence = productionGoogleHistoricalWriterScopeEvidence();
  const duration = evidence.quiesceDurationSafety;
  assert.equal(duration.configuredWafQuiesceSeconds, 300);
  assert.equal(duration.providerObservedCanonicalFunctionTimeoutSeconds, 300);
  assert.equal(duration.historicalReadyProviderFunctionTimeoutsExhaustivelyObserved, false);
  assert.equal(duration.anyReadyOriginCouldOutliveConfiguredWafSecondsExcluded, false);
  assert.equal(duration.strictlyGreaterThanObservedFunctionTimeout, false);
  assert.equal(duration.writerTransportBlobWithExplicitAbortTimeoutCount, 80);
  assert.equal(duration.writerTransportBlobWithoutExplicitAbortTimeoutCount, 30);
  assert.equal(duration.ambiguousDispatchedGoogleRequestCanBeExcludedByElapsedTimeAlone,
    false);
  assert.equal(duration.safe, false);
  const settlement = evidence.primaryCanonicalProviderSettlement;
  assert.equal(settlement.minimumDatabaseClockSecondsAfterT0ForFirstReadback, 190);
  assert.equal(settlement.minimumDatabaseClockSecondsBetweenIndependentReadbacks, 10);
  assert.equal(settlement.minimumTotalDatabaseClockSecondsAfterT0, 200);
  assert.equal(settlement.finishAndCloseRpc,
    "finish_close_production_google_writer_provider_fence_install");
  assert.deepEqual(settlement.resumableStages, [
    "AWAITING_PROTECTIONS_INSTALLED", "PROTECTIONS_INSTALLED",
    "SETTLEMENT_READBACK_1", "SETTLEMENT_READBACK_2",
  ]);
  assert.equal(settlement.acceptedAsPrimaryProof, false);
});

test("runtime evidence is immutable", () => {
  const evidence = productionGoogleHistoricalWriterScopeEvidence();
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.persistentProviderFence), true);
  assert.equal(Object.isFrozen(
    evidence.persistentProviderFence.currentAliasAwareAllMethodDenyOrigins), true);
});

test("generator fails closed on canonical target drift", () => {
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    reviewedHistoricalCanonicalSheets: [
      ...HISTORICAL_PRODUCTION_CANONICAL_SHEETS,
      "Unexpected Canonical Sheet",
    ],
  }), /sheet scope drifted/);
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    unresolvedDynamicCanonicalTargetCount: 1,
  }), /dynamic canonical targets drifted/);
});

test("generator fails closed on canonical route and method drift", () => {
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    reviewedCanonicalRoutes: [
      ...HISTORICAL_PRODUCTION_CANONICAL_MUTATION_ROUTES,
      "app/api/unknown-writer/route.js",
    ],
  }), /route scope drifted/);
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    reviewedCanonicalMethods: [
      ...HISTORICAL_PRODUCTION_CANONICAL_MUTATION_METHODS,
      "GET",
    ],
  }), /HTTP method scope drifted/);
});

test("generator fails closed on active alias drift even with a self-consistent hash", () => {
  const census = JSON.parse(readFileSync(aliasCensusPath, "utf8"));
  const changed = clone(census);
  changed.records[0][1] = "dpl_CHANGED_ALIAS_TARGET";
  changed.recordsFingerprint = sha256(JSON.stringify(changed.records));
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    aliasCensus: changed,
  }), /alias census was invalid or stale/);
});

test("generator fails closed on dedicated marker review drift", () => {
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    reviewedDedicatedCandidates: [
      ...HISTORICAL_PRODUCTION_DEDICATED_CANONICAL_CANDIDATES,
      { deploymentId: "dpl_unreviewed", sha: "0".repeat(40), origin: "https://unsafe.invalid" },
    ],
  }), /Dedicated markers or dynamic canonical targets drifted/);
});

test("generator fails closed on WAF method, hostname, path, and settlement-RPC drift", () => {
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    reviewedPermanentWafCanonicalHostname: "www.baggerinv.com",
  }), /permanent WAF or settlement contract drifted/);
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    reviewedPermanentWafSafeMethods: ["GET", "HEAD", "OPTIONS", "POST"],
  }), /permanent WAF or settlement contract drifted/);
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    reviewedPermanentWafRoundScorecardsPath: "/api/cron/other",
  }), /permanent WAF or settlement contract drifted/);
  assert.throws(() => buildHistoricalProductionGoogleWriterScopeEvidence({
    reviewedSettlementFinishAndCloseRpc:
      "finish_production_google_writer_provider_fence_install",
  }), /permanent WAF or settlement contract drifted/);
});
