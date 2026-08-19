import { createHash } from "node:crypto";
import { deserialize, serialize } from "node:v8";
import { gzipSync, gunzipSync } from "node:zlib";

import { COMPLETED_CAREER_HISTORY_YEARS } from "./career-history-authority.js";
import { attachScorecardAnalyticsSelectors } from "./scorecard-analytics.js";

export const HISTORICAL_ANALYTICS_PRODUCT = "sbi-completed-scorecard-analytics";
// The implementation suffix is bound to this file by regression test. The
// runtime suffix prevents V8 payloads crossing incompatible Node/V8 majors.
const HISTORICAL_ANALYTICS_CODEC_IMPLEMENTATION = "9ac3c61a063f6920";
export const HISTORICAL_ANALYTICS_CODEC_VERSION = [
  "v8-gzip-v1",
  `node${process.versions.node.split(".")[0]}`,
  `v8-${process.versions.v8.split(".")[0]}`,
  HISTORICAL_ANALYTICS_CODEC_IMPLEMENTATION,
].join("-");
// This version is intentionally explicit. The Step 5B regression test binds it
// to the canonical scorecard implementation digest so semantic code changes
// cannot silently reuse an incompatible durable product.
export const HISTORICAL_ANALYTICS_VERSION = "scorecard-domain-v1-0ef4c5ba687ce51b";
export const HISTORICAL_ANALYTICS_CACHE_TAG = "sbi-completed-history-analytics";
export const NEXT_DATA_CACHE_ENTRY_LIMIT_BYTES = 2 * 1024 * 1024;

const analyticsFields = [
  "roundScorecards",
  "matches",
  "courseHoles",
  "courses",
  "teamNames",
  "players",
];
const playerAnalyticsFields = [
  "Player ID",
  "ID",
  "Display Name",
  "Player Name",
  "Name",
  "First",
  "First Name",
  "Last",
  "Last Name",
  "Slug",
  "Player Slug",
];

const clean = (value) => String(value ?? "").trim();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const rowYear = (row) => {
  const raw = row?.Year ?? row?.year;
  if (clean(raw) === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
};

function completedYearSet(completedYears) {
  return new Set(completedYears.map(Number).filter(Number.isInteger));
}

function completedRows(rows, completedYears) {
  const completed = completedYearSet(completedYears);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const year = rowYear(row);
    // Year-scoped evidence with no canonical year is not safe to persist as
    // completed History. Players are projected separately below.
    return year !== null && completed.has(year);
  });
}

function rowId(row, fields) {
  for (const field of fields) {
    const value = clean(row?.[field]);
    if (value) return value;
  }
  return "";
}

function currentRows(rows, completedYears) {
  const completed = completedYearSet(completedYears);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const year = rowYear(row);
    return year !== null && !completed.has(year);
  });
}

function analyticsPlayer(player = {}) {
  return Object.fromEntries(
    playerAnalyticsFields
      .filter((field) => Object.hasOwn(player, field))
      .map((field) => [field, player[field]])
  );
}

/**
 * The durable boundary contains completed evidence only. Mutable tournament
 * rows remain available to their existing request-local/current-year paths.
 */
export function frozenScorecardAnalyticsInput(
  sheets = {},
  completedYears = COMPLETED_CAREER_HISTORY_YEARS
) {
  const completed = completedYearSet(completedYears);
  const matches = completedRows(sheets.matches, completedYears);
  const completedMatchIds = new Set(matches.map((row) =>
    rowId(row, ["Match ID", "matchId"])
  ).filter(Boolean));
  const roundScorecards = (Array.isArray(sheets.roundScorecards)
    ? sheets.roundScorecards
    : []).filter((row) => {
    const year = rowYear(row);
    return year === null
      ? completedMatchIds.has(rowId(row, ["Match ID", "matchId"]))
      : completed.has(year);
  });
  const courses = completedRows(sheets.courses, completedYears);
  const completedCourseIds = new Set([
    ...matches,
    ...courses,
    ...roundScorecards,
  ].map((row) => rowId(row, ["Course ID", "courseId"])).filter(Boolean));
  const courseHoles = (Array.isArray(sheets.courseHoles) ? sheets.courseHoles : []).filter((row) => {
    const year = rowYear(row);
    return year === null
      ? completedCourseIds.has(rowId(row, ["Course ID", "courseId"]))
      : completed.has(year);
  });
  return {
    roundScorecards,
    matches,
    courseHoles,
    courses,
    teamNames: completedRows(sheets.teamNames, completedYears),
    players: (Array.isArray(sheets.players) ? sheets.players : []).map(analyticsPlayer),
  };
}

export function mutableScorecardAnalyticsInput(
  sheets = {},
  completedYears = COMPLETED_CAREER_HISTORY_YEARS
) {
  return {
    roundScorecards: currentRows(sheets.roundScorecards, completedYears),
    matches: currentRows(sheets.matches, completedYears),
    courseHoles: currentRows(sheets.courseHoles, completedYears),
    courses: currentRows(sheets.courses, completedYears),
    teamNames: currentRows(sheets.teamNames, completedYears),
    players: (Array.isArray(sheets.players) ? sheets.players : []).map(analyticsPlayer),
  };
}

function fingerprintGraph(input = {}) {
  return Object.fromEntries(analyticsFields.map((field) => [
    field,
    (Array.isArray(input[field]) ? input[field] : []).map((row) => ({
      ...row,
      ...(row?.__sheetName ? { __sheetName: row.__sheetName } : {}),
      ...(row?.__sheetRow ? { __sheetRow: row.__sheetRow } : {}),
    })),
  ]));
}

export function historicalAnalyticsInputFingerprint(input) {
  return digest(serialize(fingerprintGraph(input)));
}

export function historicalAnalyticsSourceNamespace({
  env = process.env,
  sourceIdentities = [],
} = {}) {
  const environment = clean(env.VERCEL_ENV || env.VERCEL_TARGET_ENV || "development").toLowerCase();
  const sourceDigest = digest(serialize(sourceIdentities.map(clean))).slice(0, 20);
  return `${environment || "development"}:${sourceDigest}`;
}

export function historicalAnalyticsDescriptor({
  input,
  completedYears = COMPLETED_CAREER_HISTORY_YEARS,
  analyticsVersion = HISTORICAL_ANALYTICS_VERSION,
  sourceNamespace,
  sourceMode = "canonical",
} = {}) {
  const years = [...completedYearSet(completedYears)].sort((a, b) => a - b);
  const inputFingerprint = historicalAnalyticsInputFingerprint(input);
  const namespace = clean(sourceNamespace || "development:unconfigured");
  const key = [
    HISTORICAL_ANALYTICS_PRODUCT,
    HISTORICAL_ANALYTICS_CODEC_VERSION,
    analyticsVersion,
    years.join("-"),
    namespace,
    clean(sourceMode || "canonical"),
    inputFingerprint,
  ].join(":");
  return Object.freeze({
    product: HISTORICAL_ANALYTICS_PRODUCT,
    codecVersion: HISTORICAL_ANALYTICS_CODEC_VERSION,
    analyticsVersion,
    completedYears: Object.freeze(years),
    sourceNamespace: namespace,
    sourceMode: clean(sourceMode || "canonical"),
    inputFingerprint,
    key,
  });
}

function persistentAnalyticsGraph(analytics = {}) {
  const {
    playerSummary: _playerSummary,
    teamSummary: _teamSummary,
    courseSummary: _courseSummary,
    usableScorecards: _usableScorecards,
    individualScorecards: _individualScorecards,
    teamScorecards: _teamScorecards,
    ...persistent
  } = analytics;
  return persistent;
}

function cacheEnvelopeSize(envelope) {
  return Buffer.byteLength(JSON.stringify({
    kind: "FETCH",
    data: { headers: {}, body: JSON.stringify(envelope), status: 200, url: "" },
  }), "utf8");
}

export function encodeHistoricalAnalytics(analytics, descriptor) {
  const serialized = serialize(persistentAnalyticsGraph(analytics));
  const compressed = gzipSync(serialized, { level: 6 });
  const payload = compressed.toString("base64");
  const envelope = {
    product: descriptor.product,
    codecVersion: descriptor.codecVersion,
    analyticsVersion: descriptor.analyticsVersion,
    completedYears: descriptor.completedYears,
    sourceNamespace: descriptor.sourceNamespace,
    sourceMode: descriptor.sourceMode,
    inputFingerprint: descriptor.inputFingerprint,
    checksum: digest(payload),
    payload,
  };
  const cacheBytes = cacheEnvelopeSize(envelope);
  if (cacheBytes > NEXT_DATA_CACHE_ENTRY_LIMIT_BYTES) {
    throw new Error(`Historical analytics cache product is too large (${cacheBytes} bytes).`);
  }
  return Object.freeze({ ...envelope, cacheBytes });
}

function assertEnvelope(envelope, descriptor) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Historical analytics cache entry is unavailable.");
  }
  for (const field of [
    "product",
    "codecVersion",
    "analyticsVersion",
    "sourceNamespace",
    "sourceMode",
    "inputFingerprint",
  ]) {
    if (envelope[field] !== descriptor[field]) {
      throw new Error(`Historical analytics cache ${field} mismatch.`);
    }
  }
  if (digest(envelope.payload || "") !== envelope.checksum) {
    throw new Error("Historical analytics cache checksum mismatch.");
  }
}

function readOnlySet(values) {
  const set = new Set(values || []);
  const immutable = () => {
    throw new TypeError("Historical analytics sets are read-only.");
  };
  Object.defineProperties(set, {
    add: { value: immutable },
    clear: { value: immutable },
    delete: { value: immutable },
  });
  return Object.freeze(set);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return value;
  seen.add(value);
  if (value instanceof Set) {
    for (const item of value) deepFreeze(item, seen);
  } else if (value instanceof Map) {
    for (const [key, item] of value) {
      deepFreeze(key, seen);
      deepFreeze(item, seen);
    }
  } else {
    for (const item of Object.values(value)) deepFreeze(item, seen);
  }
  return Object.freeze(value);
}

export function decodeHistoricalAnalytics(envelope, descriptor) {
  assertEnvelope(envelope, descriptor);
  const graph = deserialize(gunzipSync(Buffer.from(envelope.payload, "base64")));
  if (graph.ghostMatchExclusions instanceof Set) {
    graph.ghostMatchExclusions = readOnlySet(graph.ghostMatchExclusions);
  }
  return deepFreeze(attachScorecardAnalyticsSelectors(graph));
}

export function historicalAnalyticsSourceHealth(sheets = {}) {
  const source = sheets.__scorecardSourceHealth;
  return Object.freeze({
    reusable: source?.complete !== false,
    sourceMode: clean(source?.historicalMode || "canonical"),
    failedSheets: Object.freeze([...(source?.failedSheets || [])]),
  });
}

export function createSingleFlightCoordinator() {
  const pending = new Map();
  return {
    async run(key, operation) {
      if (pending.has(key)) return pending.get(key);
      const promise = Promise.resolve().then(operation);
      pending.set(key, promise);
      try {
        return await promise;
      } finally {
        if (pending.get(key) === promise) pending.delete(key);
      }
    },
    pendingCount() {
      return pending.size;
    },
  };
}

/**
 * Pure orchestration seam. Production supplies Next Data Cache as readThrough;
 * tests use a Map to prove versioning, failure, and single-flight behavior.
 */
export function createVersionedHistoricalAnalyticsLoader({ readThrough }) {
  const singleFlight = createSingleFlightCoordinator();
  const repairRequired = new Set();
  return async function loadVersionedHistoricalAnalytics({
    descriptor,
    sourceReusable = true,
    build,
  }) {
    const buildEnvelope = async () => encodeHistoricalAnalytics(await build(), descriptor);
    if (!sourceReusable) {
      return decodeHistoricalAnalytics(await buildEnvelope(), descriptor);
    }

    const readSlot = async (cacheSlot) => singleFlight.run(
      `${descriptor.key}:${cacheSlot}`,
      () => readThrough({ descriptor, buildEnvelope, cacheSlot })
    );
    const preferredSlot = repairRequired.has(descriptor.key) ? "repair-v1" : "primary";
    const envelope = await readSlot(preferredSlot);
    try {
      return decodeHistoricalAnalytics(envelope, descriptor);
    } catch (primaryError) {
      if (preferredSlot !== "primary") throw primaryError;
      // A corrupt primary entry is never served. Quarantine it for this
      // instance and build/read a deterministic repair slot that other
      // instances can reuse without waiting for a timer or source change.
      repairRequired.add(descriptor.key);
      const repaired = await readSlot("repair-v1");
      return decodeHistoricalAnalytics(repaired, descriptor);
    }
  };
}
