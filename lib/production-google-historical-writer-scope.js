import { createHash } from "node:crypto";

import historicalWriterScopeArtifact from
  "../docs/evidence/step11-6-historical-production-google-writer-scope-v1.json" with {
    type: "json",
  };
import { PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES } from
  "./google-workbook-mutation-intent.js";

export const PRODUCTION_GOOGLE_HISTORICAL_WRITER_SCOPE_SCHEMA =
  "step11-6-historical-production-google-writer-scope-v1";
export const PRODUCTION_GOOGLE_HISTORICAL_WRITER_SCOPE_EVIDENCE_FINGERPRINT =
  "2f786886f4b0ec4f070757e8e23f462189304c722a015a260852ccd0888527cd";
export const PRODUCTION_GOOGLE_HISTORICAL_CANONICAL_SHEET_COUNT = 17;
export const PRODUCTION_GOOGLE_HISTORICAL_CANONICAL_SHEETS_FINGERPRINT =
  "cf8e81dc38a72501fa87c2178f9a6fe06487dc8eeb3e3091169037941f2d2cb7";
export const PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGIN_COUNT = 8;
export const PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGINS_FINGERPRINT =
  "62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d";
export const PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGIN_COUNT = 10;
export const PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGINS_FINGERPRINT =
  "1a687f3ea97d9e9d2fe65e6732be2c1d9b80aa563370338d26a71b23a3ffa12f";
export const PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGIN_COUNT = 12;
export const PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGINS_FINGERPRINT =
  "3bbe7725448889d88678eb79501a3908613f7e3949f6a026e7b4855477540521";
export const PRODUCTION_GOOGLE_CURRENT_UNRESOLVED_ALIAS_ORIGIN_COUNT = 1;
export const PRODUCTION_GOOGLE_CURRENT_UNRESOLVED_ALIAS_ORIGINS_FINGERPRINT =
  "7b405a5825ff6abb30c24e48aee1681923df549ca47b044e48e8cb0bc83d1aec";
export const PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGIN_COUNT = 9;
export const PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGINS_FINGERPRINT =
  "0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" &&
  !Array.isArray(value) && Object.keys(value).sort().join("\n") ===
  [...keys].sort().join("\n");
const sortedUniqueStrings = (values) => Array.isArray(values) &&
  values.every((value) => typeof value === "string") &&
  values.length === new Set(values).size &&
  JSON.stringify(values) === JSON.stringify([...values].sort());
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

let cached;

export function productionGoogleHistoricalWriterScopeEvidence() {
  if (cached) return cached;
  const evidence = JSON.parse(JSON.stringify(historicalWriterScopeArtifact));
  const base = { ...evidence };
  delete base.evidenceFingerprint;
  const source = evidence.retainedSourceAudit;
  const sheets = evidence.canonicalWorksheetScope;
  const dedicated = evidence.dedicatedProductionCredentialCandidates;
  const fence = evidence.persistentProviderFence;
  const safeMethod = evidence.historicalRoundScorecardsSafeMethodWriter;
  const quiesce = evidence.quiesceDurationSafety;
  const settlement = evidence.primaryCanonicalProviderSettlement;
  const waf = fence?.permanentWafContract;
  const conclusion = evidence.conclusion;
  const currentSheets = [...PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES].sort();

  if (!exactKeys(evidence, [
    "schemaVersion", "inputs", "retainedSourceAudit", "canonicalWorksheetScope",
    "dedicatedProductionCredentialCandidates", "persistentProviderFence",
    "historicalRoundScorecardsSafeMethodWriter", "quiesceDurationSafety",
    "primaryCanonicalProviderSettlement", "conclusion", "evidenceFingerprint",
  ]) || evidence.schemaVersion !== PRODUCTION_GOOGLE_HISTORICAL_WRITER_SCOPE_SCHEMA ||
      evidence.evidenceFingerprint !==
        PRODUCTION_GOOGLE_HISTORICAL_WRITER_SCOPE_EVIDENCE_FINGERPRINT ||
      sha256(JSON.stringify(base)) !== evidence.evidenceFingerprint ||
      evidence.inputs?.originInventorySchemaVersion !==
        "step11-6-production-origin-inventory-v4" ||
      evidence.inputs?.originInventoryProviderRecordCount !== 1_292 ||
      evidence.inputs?.originInventoryProviderRecordsFingerprint !==
        "abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe" ||
      evidence.inputs?.activeAliasCensusSchemaVersion !==
        "step11-6-production-active-alias-census-v1" ||
      evidence.inputs?.activeAliasRecordCount !== 56 ||
      evidence.inputs?.activeAliasRecordsFingerprint !==
        "c584b50803b59b52e06d8b699afb0cd22b00c980a3f8be0a7b78f7140f98da1a" ||
      source?.retainedDeploymentCount !== 1_292 ||
      source?.retainedUniqueNonNullShaCount !== 1_224 ||
      source?.locallyResolvableRetainedUniqueShaCount !== 1_221 ||
      source?.locallyUnresolvableRetainedUniqueShaCount !== 3 ||
      source?.retainedNullShaDeploymentCount !== 8 ||
      source?.readyNullShaDeploymentCount !== 5 ||
      source?.nonReadyNullShaDeploymentCount !== 3 ||
      JSON.stringify(source?.locallyUnresolvableShaList) !== JSON.stringify([
        "07685fc6f9e6db05c103493eb34e35425023aa42",
        "87d9661818b335a00dfe5f12dbc96531bf005ace",
        "fd3e2d11b19cc15c6120e2990c0b2c3dbcf95785",
      ]) || source?.readyDeploymentCount !== 1_158 ||
      source?.readyUniqueNonNullShaCount !== 1_096 ||
      source?.locallyResolvableReadyUniqueShaCount !== 1_093 ||
      source?.locallyUnresolvableReadyUniqueShaCount !== 3 ||
      source?.sourceUnresolvedReadyDeploymentCount !==
        PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGIN_COUNT ||
      source?.sourceUnresolvedReadyOriginsFingerprint !==
        PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGINS_FINGERPRINT ||
      source?.googleSheetsWritePresentUniqueBlobCount !== 110 ||
      source?.googleSheetsWriteBlobsFingerprint !==
        "1d247abede703c4af1efd9d7efe85e4627cac9eabb0f134a6ffd22b588cdc3cb" ||
      source?.canonicalRouteBlobBindingCount !== 101 ||
      source?.canonicalRouteBlobBindingsFingerprint !==
        "81ca821971a5eeba6cd51e8f7eb7b0b90137bc00424ff50d6bad84b46d0c063f" ||
      JSON.stringify(source?.canonicalMutationMethods) !== JSON.stringify(["POST"]) ||
      JSON.stringify(source?.observedCanonicalRouteExportedMethodUnion) !==
        JSON.stringify(["GET", "POST"]) ||
      JSON.stringify(source?.observedGoogleTransportMutationMethodUnion) !==
        JSON.stringify(["POST", "PUT"]) || source?.reviewedSourceBindingStatus !== "EXACT" ||
      sheets?.currentUnionHistoricalCanonicalSheetCount !==
        PRODUCTION_GOOGLE_HISTORICAL_CANONICAL_SHEET_COUNT ||
      sheets?.currentUnionHistoricalCanonicalSheetsFingerprint !==
        PRODUCTION_GOOGLE_HISTORICAL_CANONICAL_SHEETS_FINGERPRINT ||
      !sortedUniqueStrings(sheets?.currentUnionHistoricalCanonicalSheets) ||
      JSON.stringify(sheets.currentUnionHistoricalCanonicalSheets) !==
        JSON.stringify(currentSheets) || sheets?.currentMinusHistorical?.length !== 0 ||
      sheets?.historicalMinusCurrent?.length !== 0 ||
      sheets?.unresolvedDynamicCanonicalTargetCount !== 0 ||
      dedicated?.historicalMarkerBearingUniqueShaCount !== 10 || dedicated?.count !== 2 ||
      dedicated?.candidates?.length !== 2 ||
      dedicated.candidates.some((candidate) => candidate.deploymentTarget !== "PREVIEW" ||
        candidate.runtimeProductionGate !== "VERCEL_ENV_EXACT_PRODUCTION" ||
        candidate.productionCanonicalCredentialReachableInRetainedPreviewDeployment !== false ||
        candidate.persistentAllMethodHostDenyRequiredAsDefenseInDepth !== true) ||
      fence?.immutableAllMethodDenyOriginCount !==
        PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGIN_COUNT ||
      fence?.immutableAllMethodDenyOriginsFingerprint !==
        PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGINS_FINGERPRINT ||
      !sortedUniqueStrings(fence?.immutableAllMethodDenyOrigins) ||
      fence?.currentAliasAwareAllMethodDenyOriginCount !==
        PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGIN_COUNT ||
      fence?.currentAliasAwareAllMethodDenyOriginsFingerprint !==
        PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGINS_FINGERPRINT ||
      !sortedUniqueStrings(fence?.currentAliasAwareAllMethodDenyOrigins) ||
      fence?.executableAllMethodHostOriginCount !==
        PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGIN_COUNT ||
      fence?.executableAllMethodHostOriginsFingerprint !==
        PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGINS_FINGERPRINT ||
      !sortedUniqueStrings(fence?.executableAllMethodHostOrigins) ||
      sha256(JSON.stringify(fence.executableAllMethodHostOrigins)) !==
        PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGINS_FINGERPRINT ||
      fence?.activeUnsafeAliases?.length !== 2 ||
      fence?.twoConsecutiveProviderAliasRecapturesRequiredBeforeClose !== true ||
      fence?.liveProviderAliasDriftFailsClosed !== true ||
      waf?.canonicalHostname !== "baggerinv.com" || waf?.action !== "DENY" ||
      waf?.active !== true || waf?.projectWide !== true ||
      waf?.earlierActiveBypassRuleCount !== 0 ||
      waf?.noncanonicalCanonicalMutationGroup?.hostnameOperator !==
        "DOES_NOT_EQUAL" ||
      waf?.noncanonicalCanonicalMutationGroup?.requestPathOperator !==
        "DOES_NOT_EQUAL" ||
      waf?.noncanonicalCanonicalMutationGroup?.requestPath !==
        "/api/admin/step11-6-production-google-writer-fence" ||
      waf?.noncanonicalCanonicalMutationGroup?.methodOperator !==
        "IS_NOT_ANY_OF" ||
      JSON.stringify(waf?.noncanonicalCanonicalMutationGroup?.methods) !==
        JSON.stringify(["GET", "HEAD", "OPTIONS"]) ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup?.hostCount !==
        PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGIN_COUNT ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup?.hostsFingerprint !==
        PRODUCTION_GOOGLE_EXECUTABLE_ALL_METHOD_HOST_ORIGINS_FINGERPRINT ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup
        ?.sourceUnresolvedImmutableOriginCount !==
        PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGIN_COUNT ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup
        ?.sourceUnresolvedImmutableOriginsFingerprint !==
        PRODUCTION_GOOGLE_SOURCE_UNRESOLVED_READY_ORIGINS_FINGERPRINT ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup?.exactUnsafeAliasCount !==
        PRODUCTION_GOOGLE_CURRENT_UNRESOLVED_ALIAS_ORIGIN_COUNT ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup?.exactUnsafeAliasesFingerprint !==
        PRODUCTION_GOOGLE_CURRENT_UNRESOLVED_ALIAS_ORIGINS_FINGERPRINT ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup
        ?.exactUnsafeAliasIncludedAsIncomingRequestHostname !== true ||
      waf?.noncanonicalRoundScorecardsAllMethodGroup?.hostnameOperator !==
        "DOES_NOT_EQUAL" ||
      waf?.noncanonicalRoundScorecardsAllMethodGroup?.pathOperator !== "IS_ANY_OF" ||
      JSON.stringify(waf?.noncanonicalRoundScorecardsAllMethodGroup?.paths) !==
        JSON.stringify(["/api/cron/round-scorecards-archive"]) ||
      waf?.noncanonicalRoundScorecardsAllMethodGroup?.methods !== "ALL_METHODS" ||
      waf?.aliasRecapture?.requiredConsecutiveProviderCaptures !== 2 ||
      waf?.aliasRecapture?.providerSignedBeginAndFinalizeCapturesRequired !== true ||
      waf?.aliasRecapture?.browserSuppliedAliasInventoryAllowed !== false ||
      waf?.aliasRecapture?.providerAdminChangeFreezeRequired !== true ||
      waf?.aliasRecapture?.featureAliasMustResolveToBarrierAwareCandidate !== true ||
      waf?.aliasRecapture?.courseHoleAliasMustRemainInDeniedImmutableDeploymentSet !==
        true || waf?.aliasRecapture?.failClosedOnAnyAliasDrift !== true ||
      waf?.historicalEvidenceBindings?.immutableOriginCount !==
        PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGIN_COUNT ||
      waf?.historicalEvidenceBindings?.immutableOriginsFingerprint !==
        PRODUCTION_GOOGLE_PERSISTENT_IMMUTABLE_DENY_ORIGINS_FINGERPRINT ||
      waf?.historicalEvidenceBindings?.aliasAwareOriginCount !==
        PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGIN_COUNT ||
      waf?.historicalEvidenceBindings?.aliasAwareOriginsFingerprint !==
        PRODUCTION_GOOGLE_CURRENT_ALIAS_AWARE_DENY_ORIGINS_FINGERPRINT ||
      safeMethod?.operationClass !== "MIRROR_ARCHIVE" ||
      safeMethod?.requestPath !== "/api/cron/round-scorecards-archive" ||
      JSON.stringify(safeMethod?.explicitMethods) !== JSON.stringify(["GET"]) ||
      JSON.stringify(safeMethod?.implicitFrameworkMethods) !== JSON.stringify(["HEAD"]) ||
      safeMethod?.affectedReadyOriginCount !== 236 ||
      safeMethod?.productionWorkbookExecutionExcludedByNameOnlyEvidence !== false ||
      safeMethod?.requiredControl?.methods !== "ALL_METHODS" ||
      safeMethod?.requiredControl?.canonicalSeventeenSheetFenceExpanded !== false ||
      quiesce?.configuredWafQuiesceSeconds !== 300 ||
      quiesce?.providerObservedCanonicalFunctionTimeoutSeconds !== 300 ||
      quiesce?.historicalReadyProviderFunctionTimeoutsExhaustivelyObserved !== false ||
      quiesce?.anyReadyOriginCouldOutliveConfiguredWafSecondsExcluded !== false ||
      quiesce?.strictlyGreaterThanObservedFunctionTimeout !== false ||
      quiesce?.writerTransportBlobWithExplicitAbortTimeoutCount !== 80 ||
      quiesce?.writerTransportBlobWithoutExplicitAbortTimeoutCount !== 30 ||
      quiesce?.safe !== false ||
      settlement?.status !== "IMPLEMENTED_PENDING_INDEPENDENT_ACCEPTANCE" ||
      settlement?.minimumDatabaseClockSecondsAfterT0ForFirstReadback !== 190 ||
      settlement?.minimumDatabaseClockSecondsBetweenIndependentReadbacks !== 10 ||
      settlement?.minimumTotalDatabaseClockSecondsAfterT0 !== 200 ||
      settlement?.finishAndCloseRpc !==
        "finish_close_production_google_writer_provider_fence_install" ||
      JSON.stringify(settlement?.resumableStages) !== JSON.stringify([
        "AWAITING_PROTECTIONS_INSTALLED", "PROTECTIONS_INSTALLED",
        "SETTLEMENT_READBACK_1", "SETTLEMENT_READBACK_2",
      ]) ||
      settlement?.allowsElapsedWafDurationAloneAsProof !== false ||
      settlement?.acceptedAsPrimaryProof !== false ||
      conclusion?.unexplainedHistoricalCanonicalSheetDifferenceCount !== 0 ||
      conclusion?.unexplainedConcurrencyWindowCount !== 1) {
    throw new Error("The historical Production Google writer-scope evidence was invalid.");
  }
  cached = deepFreeze(evidence);
  return cached;
}

export function productionGoogleHistoricalCanonicalSheetScope() {
  const scope = productionGoogleHistoricalWriterScopeEvidence().canonicalWorksheetScope;
  return Object.freeze({
    sheets: scope.currentUnionHistoricalCanonicalSheets,
    count: scope.currentUnionHistoricalCanonicalSheetCount,
    fingerprint: scope.currentUnionHistoricalCanonicalSheetsFingerprint,
    unresolvedDynamicTargetCount: scope.unresolvedDynamicCanonicalTargetCount,
  });
}

export function productionGoogleHistoricalProviderFenceScope() {
  const evidence = productionGoogleHistoricalWriterScopeEvidence();
  return Object.freeze({
    persistentImmutableOrigins:
      evidence.persistentProviderFence.immutableAllMethodDenyOrigins,
    persistentImmutableOriginCount:
      evidence.persistentProviderFence.immutableAllMethodDenyOriginCount,
    persistentImmutableOriginsFingerprint:
      evidence.persistentProviderFence.immutableAllMethodDenyOriginsFingerprint,
    currentAliasAwareOrigins:
      evidence.persistentProviderFence.currentAliasAwareAllMethodDenyOrigins,
    currentAliasAwareOriginCount:
      evidence.persistentProviderFence.currentAliasAwareAllMethodDenyOriginCount,
    currentAliasAwareOriginsFingerprint:
      evidence.persistentProviderFence.currentAliasAwareAllMethodDenyOriginsFingerprint,
    executableAllMethodHostOrigins:
      evidence.persistentProviderFence.executableAllMethodHostOrigins,
    executableAllMethodHostOriginCount:
      evidence.persistentProviderFence.executableAllMethodHostOriginCount,
    executableAllMethodHostOriginsFingerprint:
      evidence.persistentProviderFence.executableAllMethodHostOriginsFingerprint,
    narrowAllMethodPaths: Object.freeze([
      evidence.historicalRoundScorecardsSafeMethodWriter.requestPath,
    ]),
    permanentWafContract: evidence.persistentProviderFence.permanentWafContract,
  });
}
