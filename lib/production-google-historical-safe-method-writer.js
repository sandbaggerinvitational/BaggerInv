import { createHash } from "node:crypto";
import historicalSafeMethodEvidenceArtifact from
  "../docs/evidence/step11-6-historical-safe-method-google-writer-v2.json" with {
    type: "json",
  };

export const PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_SCHEMA =
  "step11-6-historical-safe-method-google-writer-v2";
export const PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_EVIDENCE_FINGERPRINT =
  "6cb2ac60314de617f8c94d5d0814d710ec14b47eb4c49fdfa9662fdbe46fcd69";
export const PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT = 236;
export const PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT =
  "a8263e02ab7b65df938367fbf39769c70b501a614ebcdfa46800bda2e82de3a2";
export const PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_PATHS_FINGERPRINT =
  "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const exactKeys = (value, keys) => value && typeof value === "object" &&
  !Array.isArray(value) && Object.keys(value).sort().join("\n") ===
  [...keys].sort().join("\n");
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

let cached;

export function productionHistoricalSafeMethodGoogleWriterEvidence() {
  if (cached) return cached;
  const parsed = JSON.parse(JSON.stringify(historicalSafeMethodEvidenceArtifact));
  const base = { ...parsed };
  delete base.evidenceFingerprint;
  const writer = parsed.historicalSafeMethodWriter;
  const exhaustive = parsed.exhaustiveSafeMethodRouteCallgraphAudit;
  const contract = parsed.providerFenceContract;
  const origins = writer?.affectedReadyOrigins;
  const paths = contract?.blockedRequestPaths;
  if (!exactKeys(parsed, [
    "schemaVersion", "originInventorySchemaVersion",
    "originInventoryProviderRecordCount",
    "originInventoryProviderRecordsFingerprint", "auditScope",
    "historicalSafeMethodWriter", "postFixRoute",
    "exhaustiveSafeMethodRouteCallgraphAudit", "providerFenceContract",
    "evidenceFingerprint",
  ]) || parsed.schemaVersion !==
      PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_SCHEMA ||
      parsed.originInventorySchemaVersion !==
        "step11-6-production-origin-inventory-v4" ||
      parsed.originInventoryProviderRecordCount !== 1_292 ||
      parsed.originInventoryProviderRecordsFingerprint !==
        "abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe" ||
      parsed.evidenceFingerprint !==
        PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_EVIDENCE_FINGERPRINT ||
      sha256(JSON.stringify(base)) !== parsed.evidenceFingerprint ||
      writer?.routeBlob !== "1d0ea635f7495aab0e619025fd626553d190953b" ||
      writer?.operationClass !== "MIRROR_ARCHIVE" ||
      writer?.writerIntent !== "MIRROR_ARCHIVE" ||
      JSON.stringify(writer?.explicitMutatingMethods) !== JSON.stringify(["GET"]) ||
      JSON.stringify(writer?.frameworkDispatchedPotentialMutatingMethods) !==
        JSON.stringify(["HEAD"]) || writer?.optionsMutationObserved !== false ||
      writer?.affectedReadyOriginCount !==
        PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT ||
      writer?.affectedReadyDeploymentCount !==
        PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT ||
      !Array.isArray(origins) || origins.length !==
        PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT ||
      new Set(origins).size !== origins.length ||
      JSON.stringify(origins) !== JSON.stringify([...origins].sort(compare)) ||
      origins.some((origin) => !/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(origin)) ||
      sha256(JSON.stringify(origins)) !==
        PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT ||
      writer?.affectedReadyOriginsFingerprint !==
        PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT ||
      exhaustive?.readyAuditedUniqueCommitCount !== 1_093 ||
      exhaustive?.routeBindingCount !== 32_408 ||
      exhaustive?.routeBindingsFingerprint !==
        "1b37ef675770f4656fc562fe8e947d71252611a74803815b9a83551afdc86d30" ||
      exhaustive?.uniqueRouteBlobCount !== 470 ||
      exhaustive?.uniqueRouteBlobsFingerprint !==
        "09a424b5672d3ddabb67e06cb8feb3ad0622e0f7c6f4f63017583d857425e1f9" ||
      exhaustive?.explicitSafeHandlerBindingCount !== 22_669 ||
      exhaustive?.explicitSafeHandlerBindingsFingerprint !==
        "3f3bc87cec27a4007cd41a037a2113cc9fb73f95a0182da8a1cb585d921c5e6b" ||
      exhaustive?.reachableCallgraphNodeCount !== 19_842 ||
      exhaustive?.reachableCallgraphNodesFingerprint !==
        "276ff835921d15fb84eba1079762a7c74159874dfb1e9b78cdec5195fc6772db" ||
      exhaustive?.reachableCallgraphEdgeCount !== 43_541 ||
      exhaustive?.reachableCallgraphEdgesFingerprint !==
        "759c0ea45b85f2891b14ec7f5fe5a299864fc1e6fce881462796ae35d59e5c88" ||
      exhaustive?.safeMethodGoogleWriterBindingCount !== 1_827 ||
      exhaustive?.safeMethodGoogleWriterBindingsFingerprint !==
        "1b980e80d992813e6233a59f660f61518b0a489e34149677bf95e53c0e866d9a" ||
      exhaustive?.safeMethodGoogleWriterUniqueRouteCount !== 26 ||
      exhaustive?.safeMethodGoogleWriterUniqueRoutesFingerprint !==
        "aa409677cfe2b5afc330b88d5a3f5808db4c45ba39198b52b80f062a9c17df69" ||
      exhaustive?.safeMethodGoogleWriterUniqueCommitCount !== 533 ||
      exhaustive?.safeMethodGoogleWriterUniqueCommitsFingerprint !==
        "1c80af1376e96aeeae811f5f0fd638337b8fc16d77a3eefa6bfcd48ffeac7be6" ||
      exhaustive?.unresolvedReachableCallgraphReferenceCount !== 0 ||
      exhaustive?.sourceUnresolvedReferenceCount !== 0 ||
      exhaustive?.enforcementBoundary !==
        "EXACT_LEGACY_DRIVE_PERMISSION_WRITER_TO_READER" ||
      exhaustive?.allDiscoveredBindingsCoveredByPersistentAclFence !== true ||
      !Array.isArray(paths) || paths.length !== 1 ||
      paths[0] !== "/api/cron/round-scorecards-archive" ||
      contract?.blockedRequestPathCount !== paths.length ||
      sha256(JSON.stringify(paths)) !==
        PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_PATHS_FINGERPRINT ||
      contract?.blockedRequestPathsFingerprint !==
        PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_PATHS_FINGERPRINT ||
      contract?.conditionType !== "path" || contract?.conditionOperator !== "inc" ||
      contract?.methodScope !== "ALL_METHODS" ||
      contract?.conditionGroupRelation !== "OR" ||
      contract?.sourceUnresolvedReadyOriginsRemainCoveredByExactHostAllMethodGroup !==
        true) {
    throw new Error("The historical safe-method Google-writer evidence was invalid.");
  }
  cached = deepFreeze(parsed);
  return cached;
}

export function productionHistoricalSafeMethodGoogleWriterFencePaths() {
  const evidence = productionHistoricalSafeMethodGoogleWriterEvidence();
  const contract = evidence.providerFenceContract;
  return Object.freeze({
    paths: contract.blockedRequestPaths,
    count: contract.blockedRequestPathCount,
    fingerprint: contract.blockedRequestPathsFingerprint,
    policy: contract.policy,
  });
}
