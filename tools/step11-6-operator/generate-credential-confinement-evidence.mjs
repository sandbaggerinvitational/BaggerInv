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

function assertGitCommits(shas) {
  const output = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    input: Buffer.from(`${shas.join("\n")}\n`),
  }).toString("utf8").trim().split("\n");
  if (output.length !== shas.length || output.some((row) => !/^[0-9a-f]{40} commit$/.test(row))) {
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

export function buildCredentialConfinementEvidence() {
  const inventory = JSON.parse(readFileSync(INVENTORY_URL, "utf8"));
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
