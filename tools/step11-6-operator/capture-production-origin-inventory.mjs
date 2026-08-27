#!/usr/bin/env node

import { execFile as execFileCallback, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCallback);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ARTIFACT_URL = new URL(
  "../../docs/evidence/step11-6-production-origin-inventory-v4.json",
  import.meta.url,
);

export const INVENTORY_SCHEMA = "step11-6-production-origin-inventory-v4";
export const VERCEL_PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";
export const VERCEL_TEAM_ID = "team_kPw5zaib8uaQJALAwj4fWI6R";
export const PROVIDER_RECORD_TUPLE = Object.freeze([
  "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
  "gitBranch", "providerSource", "deploymentStatus", "createdAt", "shaResolution",
]);
export const PROJECTED_RECORD_TUPLE = Object.freeze([
  "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
  "providerMetadataFingerprint",
]);
export const SCOPE_CLASSES = Object.freeze({
  PRODUCTION_TARGET: Object.freeze({
    deploymentTarget: "PRODUCTION",
    deploymentEnvironment: "PRODUCTION",
    credentialCapabilities: Object.freeze([
      "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
      "PRODUCTION_WORKBOOK_SELECTOR",
    ]),
  }),
  PROJECT_PREVIEW: Object.freeze({
    deploymentTarget: "PREVIEW",
    deploymentEnvironment: "PREVIEW",
    credentialCapabilities: Object.freeze([
      "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
      "POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
      "POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR",
    ]),
  }),
});
export const STATUS_SEMANTICS = Object.freeze({
  READY: Object.freeze({ publiclyReachable: true, writerCapable: true }),
  ERROR: Object.freeze({ publiclyReachable: false, writerCapable: false }),
  BLOCKED: Object.freeze({ publiclyReachable: false, writerCapable: false }),
});
export const REQUIRED_DEPLOYMENTS = Object.freeze({
  priorLive: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
  frozenStep11: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
  step11_6CandidateV1: "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
  step11_6CandidateV2: "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
});

const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const ALLOWED_PROVIDER_SOURCES = new Set([
  "CLI", "GIT", "IMPORT", "REDEPLOY", "UNAVAILABLE",
]);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const clean = (value) => String(value ?? "").trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fail(message) {
  throw new Error(message);
}

function exactOrigin(value) {
  try {
    const raw = clean(value);
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        !["", "/"].includes(parsed.pathname) || parsed.search || parsed.hash ||
        !parsed.hostname.toLowerCase().endsWith(".vercel.app")) return "";
    return `https://${parsed.hostname.toLowerCase()}`;
  } catch {
    return "";
  }
}

function exactDeploymentId(value) {
  const candidates = [value?.uid, value?.id].map(clean).filter(Boolean);
  if (new Set(candidates).size !== 1 || !DEPLOYMENT_ID.test(candidates[0])) {
    fail("A Vercel deployment did not have one exact deployment ID.");
  }
  return candidates[0];
}

function exactProviderCommitSha(value, deploymentId) {
  const candidates = [
    value?.meta?.githubCommitSha,
    value?.gitSource?.sha,
    value?.gitSource?.ref?.sha,
  ].map((item) => clean(item).toLowerCase()).filter(Boolean);
  if (new Set(candidates).size > 1 ||
      (candidates.length === 1 && !/^[0-9a-f]{7,40}$/.test(candidates[0]))) {
    fail(`Vercel deployment ${deploymentId} exposed conflicting or invalid Git SHAs.`);
  }
  return candidates[0] || null;
}

function resolveSha(providerCommitSha) {
  if (providerCommitSha === null) {
    return { sha: null, shaResolution: "UNAVAILABLE" };
  }
  if (HEX40.test(providerCommitSha)) {
    return { sha: providerCommitSha, shaResolution: "EXACT_PROVIDER" };
  }
  try {
    const sha = execFileSync("git", ["rev-parse", `${providerCommitSha}^{commit}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024,
    }).trim().toLowerCase();
    if (HEX40.test(sha) && sha.startsWith(providerCommitSha)) {
      return { sha, shaResolution: "LOCAL_GIT_ABBREVIATION" };
    }
  } catch {
    // An unresolved abbreviation remains an explicitly unknown writer rather
    // than being widened to a guessed commit.
  }
  return { sha: null, shaResolution: "UNRESOLVED_PROVIDER_ABBREVIATION" };
}

function exactBranch(value, deploymentId) {
  const candidates = [value?.meta?.githubCommitRef, value?.gitSource?.ref]
    .filter((item) => typeof item === "string")
    .map(clean).filter(Boolean);
  if (new Set(candidates).size > 1 || candidates.some((item) => item.length > 240)) {
    fail(`Vercel deployment ${deploymentId} exposed conflicting or invalid Git branches.`);
  }
  return candidates[0] || null;
}

function exactTarget(value) {
  if (!Object.prototype.hasOwnProperty.call(value || {}, "target")) {
    fail("A Vercel deployment omitted its target field.");
  }
  if (value.target === null) return "PREVIEW";
  if (clean(value.target).toLowerCase() === "production") return "PRODUCTION";
  fail("A Vercel deployment exposed an unsupported target.");
}

function normalizedStatus(value) {
  const normalize = (item) => {
    const selected = clean(item).toUpperCase();
    if (selected === "READY") return "READY";
    if (selected === "ERROR") return "ERROR";
    if (["BLOCKED", "CANCELED", "CANCELLED"].includes(selected)) return "BLOCKED";
    return "";
  };
  const candidates = [value?.readyState, value?.state]
    .map(normalize).filter(Boolean);
  if (new Set(candidates).size !== 1) {
    fail("A Vercel deployment exposed conflicting or unsupported status metadata.");
  }
  return candidates[0];
}

function exactProviderSource(value) {
  const selected = clean(value?.source).toUpperCase() || "UNAVAILABLE";
  if (!ALLOWED_PROVIDER_SOURCES.has(selected)) {
    fail(`A Vercel deployment exposed an unsupported provider source: ${selected}`);
  }
  return selected;
}

function exactCreatedAt(value) {
  const candidates = [value?.createdAt, value?.created]
    .filter((item) => item !== null && item !== undefined && item !== "")
    .map((item) => Number(item));
  if (candidates.length === 0 || candidates.some((item) =>
      !Number.isSafeInteger(item) || item <= 0) || new Set(candidates).size !== 1) {
    fail("A Vercel deployment exposed conflicting or invalid creation times.");
  }
  return new Date(candidates[0]).toISOString();
}

function normalizeProviderRecord(value) {
  const deploymentId = exactDeploymentId(value);
  const providerCommitSha = exactProviderCommitSha(value, deploymentId);
  const { sha, shaResolution } = resolveSha(providerCommitSha);
  const origin = exactOrigin(value?.url);
  const deploymentTarget = exactTarget(value);
  const gitBranch = exactBranch(value, deploymentId);
  const providerSource = exactProviderSource(value);
  const deploymentStatus = normalizedStatus(value);
  const createdAt = exactCreatedAt(value);
  if (!origin) fail("A Vercel deployment exposed an invalid immutable origin.");
  if (providerCommitSha === null && (gitBranch !== null || providerSource !== "CLI")) {
    fail("A provider-SHA-unavailable deployment was not an exact branchless CLI deployment.");
  }
  if (sha !== null && gitBranch === null && providerSource === "GIT") {
    fail("A Git deployment with an exact SHA omitted its branch.");
  }
  return [deploymentId, sha, providerCommitSha, origin, deploymentTarget, gitBranch,
    providerSource, deploymentStatus, createdAt, shaResolution];
}

function metadataFingerprint(providerRecord) {
  return sha256(JSON.stringify([
    providerRecord[2], providerRecord[4], providerRecord[5], providerRecord[6],
    providerRecord[8], providerRecord[9],
  ]));
}

function projectRecord(providerRecord) {
  return [
    providerRecord[0], providerRecord[1], providerRecord[3],
    providerRecord[4] === "PRODUCTION" ? "PRODUCTION_TARGET" : "PROJECT_PREVIEW",
    providerRecord[7], metadataFingerprint(providerRecord),
  ];
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    compare(left, right)));
}

function branchCounts(records) {
  const counts = new Map();
  for (const record of records) {
    const branch = record[5] ?? "__UNAVAILABLE__";
    counts.set(branch, (counts.get(branch) || 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => compare(left, right));
}

function pagePath(cursor = null) {
  const query = new URLSearchParams({
    projectId: VERCEL_PROJECT_ID,
    teamId: VERCEL_TEAM_ID,
    limit: "100",
  });
  if (cursor !== null) query.set("until", cursor);
  return `/v6/deployments?${query}`;
}

function normalizePage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Array.isArray(value.deployments) || !value.pagination ||
      typeof value.pagination !== "object" ||
      !Object.prototype.hasOwnProperty.call(value.pagination, "next")) {
    fail("A Vercel deployment page did not expose an explicit pagination boundary.");
  }
  const next = value.pagination.next === null || value.pagination.next === undefined ||
    value.pagination.next === 0 || value.pagination.next === ""
    ? null : clean(value.pagination.next);
  if (next !== null && !/^\d{1,20}$/.test(next)) {
    fail("A Vercel deployment page exposed an invalid continuation cursor.");
  }
  return { deployments: value.deployments, next };
}

export async function collectProviderInventory(readApi) {
  const raw = [];
  const pages = [];
  const seen = new Set();
  let cursor = null;
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = normalizePage(await readApi(pagePath(cursor)));
    raw.push(...page.deployments);
    pages.push([pageIndex, cursor, page.deployments.length, page.next]);
    if (page.next === null) break;
    if (seen.has(page.next)) fail("Vercel deployment pagination repeated a cursor.");
    seen.add(page.next);
    cursor = page.next;
  }
  if (pages.length === 0 || pages.at(-1)[3] !== null) {
    fail("Vercel deployment pagination did not terminate.");
  }
  const providerRecords = raw.map(normalizeProviderRecord).sort((left, right) =>
    compare(`${left[0]}\n${left[3]}`, `${right[0]}\n${right[3]}`));
  const ids = providerRecords.map((record) => record[0]);
  const origins = providerRecords.map((record) => record[3]);
  if (providerRecords.length === 0 || new Set(ids).size !== providerRecords.length ||
      new Set(origins).size !== providerRecords.length) {
    fail("The complete Vercel deployment inventory was empty or duplicated.");
  }
  return Object.freeze({
    providerRecords,
    recordsFingerprint: sha256(JSON.stringify(providerRecords)),
    pageCount: pages.length,
    pageRecordsFingerprint: sha256(JSON.stringify(pages)),
  });
}

export function buildInventoryArtifact(first, second, capturedAt = new Date().toISOString()) {
  if (first.recordsFingerprint !== second.recordsFingerprint ||
      JSON.stringify(first.providerRecords) !== JSON.stringify(second.providerRecords)) {
    fail("Two exhaustive Vercel deployment passes did not produce the same inventory.");
  }
  const providerRecords = first.providerRecords;
  const records = providerRecords.map(projectRecord);
  const required = new Set(Object.values(REQUIRED_DEPLOYMENTS));
  if ([...required].some((id) => !providerRecords.some((record) => record[0] === id))) {
    fail("The complete inventory omitted a mandatory rollback/certification deployment.");
  }
  const targetCounts = countBy(providerRecords.map((record) => record[4]));
  const nullShaRecords = providerRecords.filter((record) => record[1] === null);
  const base = {
    schemaVersion: INVENTORY_SCHEMA,
    vercelProjectId: VERCEL_PROJECT_ID,
    vercelTeamId: VERCEL_TEAM_ID,
    capturedAt: new Date(capturedAt).toISOString(),
    providerRecordTuple: [...PROVIDER_RECORD_TUPLE],
    recordTuple: [...PROJECTED_RECORD_TUPLE],
    scopeClasses: SCOPE_CLASSES,
    statusSemantics: STATUS_SEMANTICS,
    paginationEvidence: {
      queryScope: "ALL_PROJECT_DEPLOYMENTS_NO_TARGET_OR_BRANCH_FILTER",
      pageLimit: 100,
      firstPass: {
        pageCount: first.pageCount,
        recordCount: providerRecords.length,
        pageRecordsFingerprint: first.pageRecordsFingerprint,
      },
      secondPass: {
        pageCount: second.pageCount,
        recordCount: providerRecords.length,
        pageRecordsFingerprint: second.pageRecordsFingerprint,
      },
      exactPassMatch: true,
      remainingCursor: null,
    },
    coverageSummary: {
      targetCounts,
      statusCounts: countBy(providerRecords.map((record) => record[7])),
      providerSourceCounts: countBy(providerRecords.map((record) => record[6])),
      shaResolutionCounts: countBy(providerRecords.map((record) => record[9])),
      branchCounts: branchCounts(providerRecords),
      nullShaRecordCount: nullShaRecords.length,
      nullShaReadyRecordCount: nullShaRecords.filter((record) =>
        record[7] === "READY").length,
      providerCommitShaUnavailableCount: providerRecords.filter((record) =>
        record[2] === null).length,
      nullBranchRecordCount: providerRecords.filter((record) =>
        record[5] === null).length,
    },
    providerRecordCount: providerRecords.length,
    recordCount: providerRecords.length,
    providerRecordsFingerprint: sha256(JSON.stringify(providerRecords)),
    recordsFingerprint: sha256(JSON.stringify(records)),
    requiredDeployments: REQUIRED_DEPLOYMENTS,
    providerRecords,
    records,
  };
  if (targetCounts.PRODUCTION !== 458 || targetCounts.PREVIEW !== 834 ||
      base.coverageSummary.nullShaRecordCount !== 8 ||
      base.coverageSummary.nullBranchRecordCount !== 8) {
    fail("The expected reviewed all-project census changed during capture.");
  }
  return base;
}

export function createVercelCliReadApi({ vercelBinary = "vercel" } = {}) {
  return async (apiPath) => {
    const { stdout } = await execFileAsync(vercelBinary, ["api", apiPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return JSON.parse(stdout);
  };
}

export async function captureInventory({ vercelBinary, write = false } = {}) {
  const readApi = createVercelCliReadApi({ vercelBinary });
  const first = await collectProviderInventory(readApi);
  const second = await collectProviderInventory(readApi);
  const artifact = buildInventoryArtifact(first, second);
  if (write) {
    writeFileSync(ARTIFACT_URL, `${JSON.stringify(artifact, null, 2)}\n`, {
      mode: 0o644,
    });
  }
  return artifact;
}

function parseArgs(argv) {
  let write = false;
  let vercelBinary = "vercel";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--write") write = true;
    else if (argv[index] === "--vercel-bin" && argv[index + 1]) {
      vercelBinary = argv[index + 1];
      index += 1;
    } else fail("Expected only --write and/or --vercel-bin <path>.");
  }
  return { write, vercelBinary };
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const options = parseArgs(process.argv.slice(2));
  captureInventory(options).then((artifact) => {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: artifact.schemaVersion,
      capturedAt: artifact.capturedAt,
      recordCount: artifact.recordCount,
      providerRecordsFingerprint: artifact.providerRecordsFingerprint,
      recordsFingerprint: artifact.recordsFingerprint,
      coverageSummary: artifact.coverageSummary,
      written: options.write,
    }, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
