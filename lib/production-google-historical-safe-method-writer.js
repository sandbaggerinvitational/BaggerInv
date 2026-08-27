import { createHash } from "node:crypto";
import historicalSafeMethodEvidenceArtifact from
  "../docs/evidence/step11-6-historical-safe-method-google-writer.json" with {
    type: "json",
  };

export const PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_SCHEMA =
  "step11-6-historical-safe-method-google-writer-v1";
export const PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_EVIDENCE_FINGERPRINT =
  "6bf411a2e119e8552e6b3ac9ac51d8828e9fc853e5c43069dc40c31a6e794f28";
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
  const contract = parsed.providerFenceContract;
  const origins = writer?.affectedReadyOrigins;
  const paths = contract?.blockedRequestPaths;
  if (!exactKeys(parsed, [
    "schemaVersion", "originInventorySchemaVersion",
    "originInventoryProviderRecordCount",
    "originInventoryProviderRecordsFingerprint", "auditScope",
    "historicalSafeMethodWriter", "postFixRoute", "providerFenceContract",
    "evidenceFingerprint",
  ]) || parsed.schemaVersion !==
      PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_SCHEMA ||
      parsed.originInventorySchemaVersion !==
        "step11-6-production-origin-inventory-v3" ||
      parsed.originInventoryProviderRecordCount !== 1_291 ||
      parsed.originInventoryProviderRecordsFingerprint !==
        "6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692" ||
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
