#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ROOT = new URL("../../", import.meta.url);
const INVENTORY_URL = new URL(
  "../../docs/evidence/step11-6-production-origin-inventory.json",
  import.meta.url,
);
const EVIDENCE_URL = new URL(
  "../../docs/evidence/step11-6-production-google-credential-confinement.json",
  import.meta.url,
);

export const CREDENTIAL_CONFINEMENT_SCHEMA =
  "step11-6-production-google-credential-confinement-v1";
export const CREDENTIAL_CONFINEMENT_SCHEMA_V2 =
  "step11-6-production-google-credential-confinement-v2";
export const ORIGIN_INVENTORY_SCHEMA_V3 =
  "step11-6-production-origin-inventory-v3";
export const CREDENTIAL_CONFINEMENT_MARKERS = Object.freeze([
  "PRODUCTION_GOOGLE_PRIVATE_KEY",
  "withProductionGoogleServiceAccountCredentials",
  "CANONICAL_LEGACY_V2",
]);
export const CREDENTIAL_CONFINEMENT_CANONICAL_MUTATION_ROUTES = Object.freeze([
  "app/api/scoring/current/route.js",
  "app/api/scoring/matches/[matchId]/route.js",
  "app/api/director/route.js",
  "app/api/live-matches/route.js",
  "app/api/admin/tournament/route.js",
  "app/api/admin/cms/route.js",
]);
export const CREDENTIAL_CONFINEMENT_REVIEWED_GIT_OBJECT_UNAVAILABLE_SHAS =
  Object.freeze([
    "07685fc6f9e6db05c103493eb34e35425023aa42",
    "87d9661818b335a00dfe5f12dbc96531bf005ace",
    "fd3e2d11b19cc15c6120e2990c0b2c3dbcf95785",
  ]);
const NON_EXECUTABLE_BLOCKED_DEPLOYMENT = Object.freeze({
  deploymentId: "dpl_J4BFkTk2pqPeWxdUFxwQdRZJ9xCR",
  origin: "https://bagger-lkm1vp1fg-sandbagger-invitational.vercel.app",
  deploymentStatus: "BLOCKED",
  buildsCount: 0,
  functionsCount: 0,
  aliasCount: 0,
});
const CLASSIFICATION = Object.freeze({
  LEGACY: "LEGACY_PRINCIPAL_ONLY",
  PRODUCTION_ONLY: "DEDICATED_PREVIEW_DENIED_BY_PRODUCTION_ENV",
  METADATA_ONLY: "DEDICATED_PREVIEW_METADATA_READ_ONLY",
  NON_EXECUTABLE: "NON_EXECUTABLE_PROVIDER_BLOCKED",
});
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const HEX64 = /^[0-9a-f]{64}$/;

const PROVIDER_RECORD_TUPLE_V3 = Object.freeze([
  "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
  "gitBranch", "providerSource", "deploymentStatus", "createdAt",
  "shaResolution",
]);
const PROJECTION_RECORD_TUPLE_V3 = Object.freeze([
  "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
  "providerMetadataFingerprint",
]);

const V2_CLASSIFICATION = Object.freeze({
  LEGACY: "LEGACY_PRINCIPAL_ONLY",
  PRODUCTION_ONLY: "DEDICATED_PREVIEW_DENIED_BY_PRODUCTION_ENV",
  METADATA_ONLY: "DEDICATED_PREVIEW_METADATA_READ_ONLY",
  NULL_SHA_WRITER: "NULL_SHA_LEGACY_PRINCIPAL_WRITER_CAPABLE",
  GIT_OBJECT_UNAVAILABLE_WRITER:
    "GIT_OBJECT_UNAVAILABLE_LEGACY_PRINCIPAL_WRITER_CAPABLE",
  NON_EXECUTABLE: "NON_EXECUTABLE_PROVIDER_BLOCKED",
});

function git(args, { input, maxBuffer = 32 * 1024 * 1024 } = {}) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    input,
    encoding: input === undefined ? "utf8" : undefined,
    maxBuffer,
  });
  if (result.status !== 0) {
    const error = result.stderr?.toString?.() || "git command failed";
    throw new Error(error.trim());
  }
  return result.stdout;
}

function gitGrepPaths(sha) {
  const result = spawnSync("git", [
    "grep", "-I", "-l", "-E", CREDENTIAL_CONFINEMENT_MARKERS.join("|"),
    sha, "--", "*.js", "*.mjs",
  ], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (![0, 1].includes(result.status)) throw new Error(result.stderr.trim());
  if (result.status === 1) return [];
  return result.stdout.trim().split("\n").filter(Boolean)
    .map((line) => line.slice(line.indexOf(":") + 1)).sort(compare);
}

function gitCommitAvailability(shas) {
  if (shas.length === 0) return { available: [], missing: [] };
  const output = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    input: Buffer.from(`${shas.join("\n")}\n`),
  }).toString("utf8").trim().split("\n");
  if (output.length !== shas.length) {
    throw new Error("The Git object availability response was incomplete.");
  }
  const available = [];
  const missing = [];
  for (let index = 0; index < shas.length; index += 1) {
    if (/^[0-9a-f]{40} commit$/.test(output[index])) available.push(shas[index]);
    else if (output[index] === `${shas[index]} missing`) missing.push(shas[index]);
    else throw new Error("A retained SHA resolved to an unexpected Git object type.");
  }
  return { available, missing };
}

function assertGitCommits(shas) {
  if (gitCommitAvailability(shas).missing.length > 0) {
    throw new Error("Every retained non-null SHA must resolve to an exact local Git commit.");
  }
}

function catFileBatch(specs) {
  const output = git(["cat-file", "--batch"], {
    input: Buffer.from(`${specs.join("\n")}\n`),
    maxBuffer: 256 * 1024 * 1024,
  });
  const result = [];
  let offset = 0;
  for (const spec of specs) {
    const newline = output.indexOf(10, offset);
    if (newline < 0) throw new Error("Git batch output ended before its header.");
    const header = output.subarray(offset, newline).toString("utf8");
    offset = newline + 1;
    if (header.endsWith(" missing")) {
      result.push({ spec, body: null });
      continue;
    }
    const match = header.match(/^[0-9a-f]{40} blob (\d+)$/);
    if (!match) throw new Error(`Unexpected Git batch header: ${header}`);
    const length = Number(match[1]);
    const body = output.subarray(offset, offset + length).toString("utf8");
    offset += length + 1;
    result.push({ spec, body });
  }
  return result;
}

function productionCredentialGuardClass(sha) {
  const helper = git([
    "show", `${sha}:lib/google-service-account-credential-context.js`,
  ]).toString("utf8");
  const productionRequired = /VERCEL_ENV/.test(helper) &&
    /production/.test(helper) && /deploymentApproved/.test(helper);
  if (!productionRequired) {
    throw new Error(`Dedicated credential helper at ${sha} lacked a Production environment gate.`);
  }
  const metadataOnly = /candidateMetadataReadApproved/.test(helper) &&
    /PRODUCTION_WORKBOOK_METADATA_READ/.test(helper) &&
    /deploymentApproved[\s\S]{0,320}candidateMetadataReadApproved/.test(helper);
  return metadataOnly ? CLASSIFICATION.METADATA_ONLY : CLASSIFICATION.PRODUCTION_ONLY;
}

function fingerprintShaSet(values) {
  return sha256(JSON.stringify([...new Set(values)].sort(compare)));
}

function markerPathSummary(entries) {
  const counts = new Map();
  for (const { paths } of entries) {
    for (const path of paths) counts.set(path, (counts.get(path) || 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => compare(left, right))
    .map(([path, shaCount]) => [path, shaCount]);
}

function exactArray(value, expected) {
  return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
}

function providerTargetClass(value) {
  if (value === "PREVIEW") return "PREVIEW";
  if (value === "PRODUCTION") return "PRODUCTION";
  return "";
}

function providerMetadataFingerprint(providerRecord) {
  return sha256(JSON.stringify([
    providerRecord[2], providerRecord[4], providerRecord[5], providerRecord[6],
    providerRecord[8], providerRecord[9],
  ]));
}

function normalizedV3Inventory(inventory) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory) ||
      inventory.schemaVersion !== ORIGIN_INVENTORY_SCHEMA_V3 ||
      !exactArray(inventory.providerRecordTuple, PROVIDER_RECORD_TUPLE_V3) ||
      !exactArray(inventory.recordTuple, PROJECTION_RECORD_TUPLE_V3) ||
      !Array.isArray(inventory.providerRecords) || !Array.isArray(inventory.records) ||
      inventory.providerRecordCount !== inventory.providerRecords.length ||
      inventory.recordCount !== inventory.records.length ||
      inventory.recordCount !== inventory.providerRecords.length ||
      !HEX64.test(String(inventory.providerRecordsFingerprint || "")) ||
      !HEX64.test(String(inventory.recordsFingerprint || "")) ||
      sha256(JSON.stringify(inventory.providerRecords)) !==
        inventory.providerRecordsFingerprint ||
      sha256(JSON.stringify(inventory.records)) !== inventory.recordsFingerprint) {
    throw new Error("The v3 Production origin inventory header or fingerprints were invalid.");
  }

  const projectionByKey = new Map();
  const projectionDeploymentIds = new Set();
  const projectionOrigins = new Set();
  for (const record of inventory.records) {
    if (!Array.isArray(record) || record.length !== PROJECTION_RECORD_TUPLE_V3.length) {
      throw new Error("A v3 Production origin projection tuple was invalid.");
    }
    const [deploymentId, sha, origin, scopeClass, deploymentStatus,
      providerMetadataFingerprint] = record;
    const key = `${deploymentId}\n${origin}`;
    if (!/^dpl_[A-Za-z0-9]{8,64}$/.test(String(deploymentId)) ||
        !(sha === null || /^[0-9a-f]{40}$/.test(String(sha))) ||
        !/^https:\/\/[a-z0-9.-]+$/.test(String(origin)) ||
        !["PRODUCTION_TARGET", "PROJECT_PREVIEW"].includes(scopeClass) ||
        !["READY", "ERROR", "BLOCKED"].includes(deploymentStatus) ||
        !HEX64.test(String(providerMetadataFingerprint)) ||
        projectionByKey.has(key) || projectionDeploymentIds.has(deploymentId) ||
        projectionOrigins.has(origin)) {
      throw new Error("A v3 Production origin projection tuple was outside exact scope.");
    }
    projectionByKey.set(key, record);
    projectionDeploymentIds.add(deploymentId);
    projectionOrigins.add(origin);
  }

  const entries = [];
  const providerKeys = [];
  for (const providerRecord of inventory.providerRecords) {
    if (!Array.isArray(providerRecord) ||
        providerRecord.length !== PROVIDER_RECORD_TUPLE_V3.length) {
      throw new Error("A v3 Production provider tuple was invalid.");
    }
    const [deploymentId, sha, providerCommitSha, origin, deploymentTarget,
      gitBranch, providerSource, deploymentStatus, createdAt, shaResolution] =
      providerRecord;
    const key = `${deploymentId}\n${origin}`;
    const targetClass = providerTargetClass(deploymentTarget);
    const projection = projectionByKey.get(key);
    const expectedScopeClass = targetClass === "PRODUCTION"
      ? "PRODUCTION_TARGET" : "PROJECT_PREVIEW";
    if (!/^dpl_[A-Za-z0-9]{8,64}$/.test(String(deploymentId)) ||
        !(sha === null || /^[0-9a-f]{40}$/.test(String(sha))) ||
        !(providerCommitSha === null ||
          /^[0-9a-f]{7,40}$/.test(String(providerCommitSha))) ||
        !/^https:\/\/[a-z0-9.-]+$/.test(String(origin)) || !targetClass ||
        !(gitBranch === null || typeof gitBranch === "string") ||
        !["CLI", "GIT", "IMPORT", "REDEPLOY", "UNAVAILABLE"]
          .includes(providerSource) ||
        !["READY", "ERROR", "BLOCKED"].includes(deploymentStatus) ||
        typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt)) ||
        !["EXACT_PROVIDER", "LOCAL_GIT_ABBREVIATION", "UNAVAILABLE"]
          .includes(shaResolution) ||
        (sha === null) !== (shaResolution === "UNAVAILABLE") ||
        (shaResolution === "UNAVAILABLE" && providerCommitSha !== null) ||
        (shaResolution === "UNAVAILABLE" &&
          (gitBranch !== null || providerSource !== "CLI")) ||
        (shaResolution === "EXACT_PROVIDER" && providerCommitSha !== sha) ||
        (shaResolution === "LOCAL_GIT_ABBREVIATION" &&
          (providerCommitSha === null || providerCommitSha.length >= 40 ||
            !sha.startsWith(providerCommitSha))) ||
        (sha !== null && providerSource === "GIT" && gitBranch === null) ||
        !projection || projection[1] !== sha ||
        projection[3] !== expectedScopeClass ||
        projection[4] !== deploymentStatus ||
        projection[5] !== providerMetadataFingerprint(providerRecord)) {
      throw new Error("A v3 Production provider tuple did not match its exact projection.");
    }
    providerKeys.push(key);
    entries.push(Object.freeze({
      deploymentId, sha, providerCommitSha, origin, deploymentTarget,
      targetClass, gitBranch, providerSource, deploymentStatus, createdAt,
      shaResolution,
      scopeClass: projection[3], providerMetadataFingerprint: projection[5],
    }));
  }
  const sortedKeys = [...providerKeys].sort(compare);
  if (new Set(providerKeys).size !== providerKeys.length ||
      JSON.stringify(providerKeys) !== JSON.stringify(sortedKeys) ||
      projectionByKey.size !== providerKeys.length ||
      providerKeys.some((key) => !projectionByKey.has(key))) {
    throw new Error("The v3 Production provider/projection tuple sets were not one-to-one.");
  }
  return Object.freeze(entries);
}

function buildCredentialConfinementEvidenceV1(inventory) {
  const retainedShas = [...new Set(inventory.records.map((record) => record[1])
    .filter(Boolean))].sort(compare);
  assertGitCommits(retainedShas);

  const mainRecords = inventory.records.filter((record) => record[3] === "MAIN_PRODUCTION");
  const featureRecords = inventory.records.filter((record) => record[3] === "FEATURE_PREVIEW");
  const mainShas = [...new Set(mainRecords.map((record) => record[1]).filter(Boolean))]
    .sort(compare);
  const featureShas = [...new Set(featureRecords.map((record) => record[1]).filter(Boolean))]
    .sort(compare);
  const mainMarkerEntries = mainShas.map((sha) => ({ sha, paths: gitGrepPaths(sha) }));
  if (mainMarkerEntries.some((entry) => entry.paths.length > 0)) {
    throw new Error("A retained MAIN_PRODUCTION commit contains a dedicated credential marker.");
  }
  const featureMarkerEntries = featureShas.map((sha) => ({ sha, paths: gitGrepPaths(sha) }));
  const markerBearing = featureMarkerEntries.filter((entry) => entry.paths.length > 0);
  const productionOnlyShas = [];
  const metadataOnlyShas = [];
  for (const { sha } of markerBearing) {
    const selected = productionCredentialGuardClass(sha);
    (selected === CLASSIFICATION.METADATA_ONLY
      ? metadataOnlyShas : productionOnlyShas).push(sha);
  }
  productionOnlyShas.sort(compare);
  metadataOnlyShas.sort(compare);
  const markerBearingSet = new Set([...productionOnlyShas, ...metadataOnlyShas]);

  const classificationRecords = inventory.records.map((record) => {
    let classification = CLASSIFICATION.LEGACY;
    if (record[0] === NON_EXECUTABLE_BLOCKED_DEPLOYMENT.deploymentId) {
      if (record[1] !== null || record[2] !== NON_EXECUTABLE_BLOCKED_DEPLOYMENT.origin ||
          record[4] !== "BLOCKED") {
        throw new Error("The provider-proven non-executable deployment tuple drifted.");
      }
      classification = CLASSIFICATION.NON_EXECUTABLE;
    } else if (productionOnlyShas.includes(record[1])) {
      classification = CLASSIFICATION.PRODUCTION_ONLY;
    } else if (metadataOnlyShas.includes(record[1])) {
      classification = CLASSIFICATION.METADATA_ONLY;
    } else if (record[1] === null || markerBearingSet.has(record[1])) {
      throw new Error("A retained deployment lacked an exact credential classification.");
    }
    return [record[0], record[1], record[2], classification];
  }).sort((left, right) => compare(`${left[0]}\n${left[2]}`, `${right[0]}\n${right[2]}`));

  const deploymentShaRecords = inventory.records.filter((record) => record[1] !== null);
  const routeSpecs = deploymentShaRecords.flatMap((record) =>
    CREDENTIAL_CONFINEMENT_CANONICAL_MUTATION_ROUTES.map((path) => `${record[1]}:${path}`));
  const uniqueRouteSpecs = retainedShas.flatMap((sha) =>
    CREDENTIAL_CONFINEMENT_CANONICAL_MUTATION_ROUTES.map((path) => `${sha}:${path}`));
  const routeAudit = catFileBatch(routeSpecs);
  const uniqueRouteAudit = catFileBatch(uniqueRouteSpecs);
  const routeMarker = new RegExp(CREDENTIAL_CONFINEMENT_MARKERS.join("|"));
  if (routeAudit.some((record) => record.body !== null && routeMarker.test(record.body))) {
    throw new Error("A canonical mutation route version contains a dedicated writer marker.");
  }

  const base = {
    schemaVersion: CREDENTIAL_CONFINEMENT_SCHEMA,
    originInventorySchemaVersion: inventory.schemaVersion,
    originInventoryRecordCount: inventory.recordCount,
    originInventoryFingerprint: inventory.recordsFingerprint,
    classificationRecordTuple: ["deploymentId", "sha", "origin", "classification"],
    classificationRecordCount: classificationRecords.length,
    classificationRecordsFingerprint: sha256(JSON.stringify(classificationRecords)),
    markerPatterns: [...CREDENTIAL_CONFINEMENT_MARKERS],
    gitObjectAudit: {
      retainedNonNullRecordCount: deploymentShaRecords.length,
      retainedUniqueCommitCount: retainedShas.length,
      missingCommitCount: 0,
    },
    classifications: {
      mainProductionLegacyOnly: {
        recordCount: mainRecords.length,
        uniqueCommitCount: mainShas.length,
        commitSetFingerprint: fingerprintShaSet(mainShas),
        markerBearingCommitCount: 0,
      },
      featurePreviewLegacyOnly: {
        recordCount: featureRecords.filter((record) => record[1] !== null &&
          !markerBearingSet.has(record[1])).length,
        uniqueCommitCount: featureShas.filter((sha) => !markerBearingSet.has(sha)).length,
        commitSetFingerprint: fingerprintShaSet(
          featureShas.filter((sha) => !markerBearingSet.has(sha)),
        ),
      },
      featurePreviewDedicatedProductionEnvironmentDenied: {
        recordCount: featureRecords.filter((record) =>
          productionOnlyShas.includes(record[1])).length,
        uniqueCommitCount: productionOnlyShas.length,
        commitSetFingerprint: fingerprintShaSet(productionOnlyShas),
        commits: productionOnlyShas,
      },
      featurePreviewDedicatedMetadataReadOnly: {
        recordCount: featureRecords.filter((record) =>
          metadataOnlyShas.includes(record[1])).length,
        uniqueCommitCount: metadataOnlyShas.length,
        commitSetFingerprint: fingerprintShaSet(metadataOnlyShas),
        commits: metadataOnlyShas,
        onlyPreviewDedicatedOperation: "PRODUCTION_WORKBOOK_METADATA_READ",
      },
      providerBlockedNonExecutable: {
        recordCount: 1,
        deployments: [{ ...NON_EXECUTABLE_BLOCKED_DEPLOYMENT }],
      },
    },
    markerBearingPreviewPathSummary: markerPathSummary(markerBearing),
    canonicalMutationRouteAudit: {
      paths: [...CREDENTIAL_CONFINEMENT_CANONICAL_MUTATION_ROUTES],
      deploymentFileRequestCount: routeSpecs.length,
      deploymentFileVersionCount: routeAudit.filter((record) => record.body !== null).length,
      uniqueCommitFileRequestCount: uniqueRouteSpecs.length,
      uniqueCommitFileVersionCount:
        uniqueRouteAudit.filter((record) => record.body !== null).length,
      dedicatedWriterMarkerMatchCount: 0,
    },
    environmentScopeContract: {
      broadLegacyNames: ["GOOGLE_PRIVATE_KEY", "GOOGLE_SERVICE_ACCOUNT_EMAIL"],
      broadLegacyTargets: ["preview", "production"],
      dedicatedAndProductionResourcePreviewScope:
        "EXACT_FEATURE_BRANCH_REQUIRED",
      productionScope: "PRODUCTION_TARGET_WITH_NULL_BRANCH",
      duplicateUnscopedDedicatedPreviewRecordAllowed: false,
    },
    dynamicCandidateContract: {
      candidateShaBinding: "SIGNED_PROVIDER_ATTESTATION_AND_RELEASE_SHA",
      candidateBranch: "feature/mock-tournament-qa-integration",
      rehearsalTarget: "PREVIEW",
      cutoverTarget: "PRODUCTION",
      permittedAdditionScopeClasses: [
        "FEATURE_PREVIEW", "CUTOVER_PRODUCTION_CANDIDATE",
      ],
      arbitraryMainProductionAdditionAllowed: false,
      differentShaAdditionAllowed: false,
      databaseAdmissionRequiredForProductionCanonicalLegacyWrite: true,
    },
  };
  return {
    ...base,
    evidenceFingerprint: sha256(JSON.stringify(base)),
  };
}

export function buildCredentialConfinementEvidenceV2(inventory) {
  const entries = normalizedV3Inventory(inventory);
  const nonNullEntries = entries.filter((entry) => entry.sha !== null);
  const retainedShas = [...new Set(nonNullEntries.map((entry) => entry.sha))]
    .sort(compare);
  const localGitAvailability = gitCommitAvailability(retainedShas);
  const retainedShaSet = new Set(retainedShas);
  const reviewedUnavailableSet = new Set(
    CREDENTIAL_CONFINEMENT_REVIEWED_GIT_OBJECT_UNAVAILABLE_SHAS
      .filter((sha) => retainedShaSet.has(sha)),
  );
  const unavailableSet = new Set([
    ...localGitAvailability.missing,
    ...reviewedUnavailableSet,
  ]);
  const gitAvailability = {
    available: localGitAvailability.available.filter((sha) => !unavailableSet.has(sha)),
    missing: [...unavailableSet].sort(compare),
  };
  const auditableShaSet = new Set(gitAvailability.available);
  const missingShaSet = new Set(gitAvailability.missing);
  const auditableEntries = nonNullEntries.filter((entry) =>
    auditableShaSet.has(entry.sha));
  const gitObjectUnavailableEntries = nonNullEntries.filter((entry) =>
    missingShaSet.has(entry.sha));

  const productionEntries = auditableEntries.filter((entry) =>
    entry.targetClass === "PRODUCTION");
  const previewEntries = auditableEntries.filter((entry) =>
    entry.targetClass === "PREVIEW");
  const productionShas = [...new Set(productionEntries.map((entry) => entry.sha))]
    .sort(compare);
  const previewShas = [...new Set(previewEntries.map((entry) => entry.sha))]
    .sort(compare);
  const markerEntries = gitAvailability.available.map((sha) => ({
    sha,
    paths: gitGrepPaths(sha),
  }));
  const markerBySha = new Map(markerEntries.map((entry) => [entry.sha, entry.paths]));
  const productionMarkerEntries = productionShas.map((sha) => ({
    sha, paths: markerBySha.get(sha) || [],
  })).filter((entry) => entry.paths.length > 0);
  if (productionMarkerEntries.length > 0) {
    throw new Error(
      "A retained Production-target commit contains a dedicated credential marker.",
    );
  }
  const previewMarkerEntries = previewShas.map((sha) => ({
    sha, paths: markerBySha.get(sha) || [],
  })).filter((entry) => entry.paths.length > 0);
  const productionOnlyShas = [];
  const metadataOnlyShas = [];
  for (const { sha } of previewMarkerEntries) {
    const selected = productionCredentialGuardClass(sha);
    (selected === CLASSIFICATION.METADATA_ONLY
      ? metadataOnlyShas : productionOnlyShas).push(sha);
  }
  productionOnlyShas.sort(compare);
  metadataOnlyShas.sort(compare);
  const markerBearingPreviewSet = new Set([
    ...productionOnlyShas, ...metadataOnlyShas,
  ]);

  const nullShaWriterEntries = entries.filter((entry) =>
    entry.sha === null && entry.deploymentStatus !== "BLOCKED");
  const nullShaBlockedEntries = entries.filter((entry) =>
    entry.sha === null && entry.deploymentStatus === "BLOCKED");
  const productionLegacyEntries = productionEntries;
  const previewLegacyEntries = previewEntries.filter((entry) =>
    !markerBearingPreviewSet.has(entry.sha));
  const previewProductionOnlyEntries = previewEntries.filter((entry) =>
    productionOnlyShas.includes(entry.sha));
  const previewMetadataOnlyEntries = previewEntries.filter((entry) =>
    metadataOnlyShas.includes(entry.sha));

  const classificationRecords = entries.map((entry) => {
    let classification;
    if (entry.sha === null) {
      classification = entry.deploymentStatus === "BLOCKED"
        ? V2_CLASSIFICATION.NON_EXECUTABLE
        : V2_CLASSIFICATION.NULL_SHA_WRITER;
    } else if (missingShaSet.has(entry.sha)) {
      classification = V2_CLASSIFICATION.GIT_OBJECT_UNAVAILABLE_WRITER;
    } else if (entry.targetClass === "PRODUCTION") {
      classification = V2_CLASSIFICATION.LEGACY;
    } else if (productionOnlyShas.includes(entry.sha)) {
      classification = V2_CLASSIFICATION.PRODUCTION_ONLY;
    } else if (metadataOnlyShas.includes(entry.sha)) {
      classification = V2_CLASSIFICATION.METADATA_ONLY;
    } else {
      classification = V2_CLASSIFICATION.LEGACY;
    }
    return [
      entry.deploymentId, entry.sha, entry.origin, entry.deploymentStatus,
      classification,
    ];
  }).sort((left, right) => compare(
    `${left[0]}\n${left[2]}`, `${right[0]}\n${right[2]}`,
  ));

  const routeSpecs = auditableEntries.flatMap((entry) =>
    CREDENTIAL_CONFINEMENT_CANONICAL_MUTATION_ROUTES.map((path) =>
      `${entry.sha}:${path}`));
  const uniqueRouteSpecs = gitAvailability.available.flatMap((sha) =>
    CREDENTIAL_CONFINEMENT_CANONICAL_MUTATION_ROUTES.map((path) => `${sha}:${path}`));
  const routeAudit = catFileBatch(routeSpecs);
  const uniqueRouteAudit = catFileBatch(uniqueRouteSpecs);
  const routeMarker = new RegExp(CREDENTIAL_CONFINEMENT_MARKERS.join("|"));
  if (routeAudit.some((record) => record.body !== null && routeMarker.test(record.body))) {
    throw new Error("A canonical mutation route version contains a dedicated writer marker.");
  }

  const nullShaEvidence = (entry) => ({
    deploymentId: entry.deploymentId,
    origin: entry.origin,
    deploymentTarget: entry.deploymentTarget,
    gitBranch: entry.gitBranch,
    providerSource: entry.providerSource,
    deploymentStatus: entry.deploymentStatus,
    shaResolution: entry.shaResolution,
    providerMetadataFingerprint: entry.providerMetadataFingerprint,
  });
  const gitObjectUnavailableEvidence = (entry) => ({
    deploymentId: entry.deploymentId,
    sha: entry.sha,
    origin: entry.origin,
    deploymentTarget: entry.deploymentTarget,
    gitBranch: entry.gitBranch,
    providerSource: entry.providerSource,
    deploymentStatus: entry.deploymentStatus,
    shaResolution: entry.shaResolution,
    providerMetadataFingerprint: entry.providerMetadataFingerprint,
  });
  const allMethodFenceRequiredHosts = [...new Set([
    ...nullShaWriterEntries.filter((entry) => entry.deploymentStatus === "READY")
      .map((entry) => entry.origin),
    ...gitObjectUnavailableEntries.filter((entry) =>
      entry.deploymentStatus === "READY").map((entry) => entry.origin),
  ])].sort(compare);
  const base = {
    schemaVersion: CREDENTIAL_CONFINEMENT_SCHEMA_V2,
    originInventorySchemaVersion: inventory.schemaVersion,
    originInventoryRecordTuple: [...PROJECTION_RECORD_TUPLE_V3],
    originInventoryRecordCount: inventory.recordCount,
    originInventoryFingerprint: inventory.recordsFingerprint,
    originInventoryProviderRecordTuple: [...PROVIDER_RECORD_TUPLE_V3],
    originInventoryProviderRecordCount: inventory.providerRecordCount,
    originInventoryProviderRecordsFingerprint:
      inventory.providerRecordsFingerprint,
    classificationRecordTuple: [
      "deploymentId", "sha", "origin", "deploymentStatus", "classification",
    ],
    classificationRecordCount: classificationRecords.length,
    classificationRecordsFingerprint: sha256(JSON.stringify(classificationRecords)),
    markerPatterns: [...CREDENTIAL_CONFINEMENT_MARKERS],
    gitObjectAudit: {
      retainedNonNullRecordCount: nonNullEntries.length,
      retainedUniqueCommitCount: retainedShas.length,
      auditedUniqueCommitCount: gitAvailability.available.length,
      missingCommitCount: gitAvailability.missing.length,
      missingCommits: gitAvailability.missing,
      nullShaRecordCount: nullShaWriterEntries.length + nullShaBlockedEntries.length,
      nullShaWriterCapableRecordCount: nullShaWriterEntries.length,
      nullShaProviderBlockedRecordCount: nullShaBlockedEntries.length,
    },
    classifications: {
      productionTargetLegacyOnly: {
        recordCount: productionLegacyEntries.length,
        uniqueCommitCount: productionShas.length,
        commitSetFingerprint: fingerprintShaSet(productionShas),
        markerBearingCommitCount: 0,
      },
      projectPreviewLegacyOnly: {
        recordCount: previewLegacyEntries.length,
        uniqueCommitCount: new Set(previewLegacyEntries.map((entry) => entry.sha)).size,
        commitSetFingerprint: fingerprintShaSet(
          previewLegacyEntries.map((entry) => entry.sha),
        ),
      },
      projectPreviewDedicatedProductionEnvironmentDenied: {
        recordCount: previewProductionOnlyEntries.length,
        uniqueCommitCount: productionOnlyShas.length,
        commitSetFingerprint: fingerprintShaSet(productionOnlyShas),
        commits: productionOnlyShas,
      },
      projectPreviewDedicatedMetadataReadOnly: {
        recordCount: previewMetadataOnlyEntries.length,
        uniqueCommitCount: metadataOnlyShas.length,
        commitSetFingerprint: fingerprintShaSet(metadataOnlyShas),
        commits: metadataOnlyShas,
        onlyPreviewDedicatedOperation: "PRODUCTION_WORKBOOK_METADATA_READ",
      },
      nullShaLegacyWriterCapable: {
        recordCount: nullShaWriterEntries.length,
        policy: "LEGACY_PRINCIPAL_WRITER_CAPABLE_UNLESS_PROVIDER_BLOCKED",
        deployments: nullShaWriterEntries.map(nullShaEvidence),
      },
      gitObjectUnavailableLegacyWriterCapable: {
        recordCount: gitObjectUnavailableEntries.length,
        uniqueCommitCount: gitAvailability.missing.length,
        commitSetFingerprint: fingerprintShaSet(gitAvailability.missing),
        policy: "LEGACY_PRINCIPAL_WRITER_CAPABLE_UNLESS_GIT_OBJECT_AUDITED",
        deployments: gitObjectUnavailableEntries.map(gitObjectUnavailableEvidence),
      },
      providerBlockedNonExecutable: {
        recordCount: nullShaBlockedEntries.length,
        deployments: nullShaBlockedEntries.map(nullShaEvidence),
      },
    },
    markerBearingPreviewPathSummary: markerPathSummary(previewMarkerEntries),
    canonicalMutationRouteAudit: {
      paths: [...CREDENTIAL_CONFINEMENT_CANONICAL_MUTATION_ROUTES],
      deploymentFileRequestCount: routeSpecs.length,
      deploymentFileVersionCount: routeAudit.filter((record) => record.body !== null).length,
      uniqueCommitFileRequestCount: uniqueRouteSpecs.length,
      uniqueCommitFileVersionCount:
        uniqueRouteAudit.filter((record) => record.body !== null).length,
      nullShaRoutesUnauditableRecordCount:
        nullShaWriterEntries.length + nullShaBlockedEntries.length,
      gitObjectUnavailableRoutesUnauditableRecordCount:
        gitObjectUnavailableEntries.length,
      dedicatedWriterMarkerMatchCount: 0,
    },
    allMethodFenceRequiredHosts: {
      origins: allMethodFenceRequiredHosts,
      count: allMethodFenceRequiredHosts.length,
      fingerprint: sha256(JSON.stringify(allMethodFenceRequiredHosts)),
      policy:
        "READY_NULL_SHA_OR_GIT_OBJECT_UNAVAILABLE_REQUIRES_ALL_METHOD_PROVIDER_FENCE",
    },
    providerInventoryContract: {
      providerRecordCount: entries.length,
      providerRecordsFingerprint: inventory.providerRecordsFingerprint,
      projectionRecordCount: inventory.recordCount,
      projectionRecordsFingerprint: inventory.recordsFingerprint,
      oneToOneProjection: true,
      nullShaNonBlockedPolicy: "LEGACY_PRINCIPAL_WRITER_CAPABLE",
      nullShaBlockedPolicy: "NON_EXECUTABLE_PROVIDER_BLOCKED",
    },
    environmentScopeContract: {
      broadLegacyNames: ["GOOGLE_PRIVATE_KEY", "GOOGLE_SERVICE_ACCOUNT_EMAIL"],
      broadLegacyTargets: ["preview", "production"],
      dedicatedAndProductionResourcePreviewScope:
        "EXACT_FEATURE_BRANCH_REQUIRED",
      productionScope: "PRODUCTION_TARGET_WITH_NULL_BRANCH",
      duplicateUnscopedDedicatedPreviewRecordAllowed: false,
    },
    dynamicCandidateContract: {
      candidateShaBinding: "SIGNED_PROVIDER_ATTESTATION_AND_RELEASE_SHA",
      candidateBranch: "feature/mock-tournament-qa-integration",
      rehearsalTarget: "PREVIEW",
      cutoverTarget: "PRODUCTION",
      permittedAdditionScopeClasses: ["PROJECT_PREVIEW", "PRODUCTION_TARGET"],
      arbitraryProductionTargetAdditionAllowed: false,
      differentShaAdditionAllowed: false,
      databaseAdmissionRequiredForProductionCanonicalLegacyWrite: true,
    },
  };
  const classificationTotal = Object.values(base.classifications)
    .reduce((total, value) => total + value.recordCount, 0);
  if (classificationTotal !== entries.length) {
    throw new Error("The v2 credential classifications were not exhaustive and exclusive.");
  }
  return {
    ...base,
    evidenceFingerprint: sha256(JSON.stringify(base)),
  };
}

export function buildCredentialConfinementEvidence() {
  const inventory = JSON.parse(readFileSync(INVENTORY_URL, "utf8"));
  return inventory.schemaVersion === ORIGIN_INVENTORY_SCHEMA_V3
    ? buildCredentialConfinementEvidenceV2(inventory)
    : buildCredentialConfinementEvidenceV1(inventory);
}

export function verifyCredentialConfinementEvidence() {
  const expected = buildCredentialConfinementEvidence();
  const actual = JSON.parse(readFileSync(EVIDENCE_URL, "utf8"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("The committed credential-confinement evidence is stale or invalid.");
  }
  return actual;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  if (process.argv.includes("--write")) {
    writeFileSync(EVIDENCE_URL, `${JSON.stringify(buildCredentialConfinementEvidence(), null, 2)}\n`, {
      mode: 0o644,
    });
  } else {
    verifyCredentialConfinementEvidence();
  }
}
