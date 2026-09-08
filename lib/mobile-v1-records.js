import { MOBILE_API_VERSION, MobileApiError } from "./mobile-api-v1.js";
import { buildCanonicalRecordHolderAuthority } from "./record-holder-authority.js";
import { formatRecordValue } from "./scorecard-record-leaderboards.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const MOBILE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const MOBILE_RECORDS_LIMITS = Object.freeze({ responseBytes: 524_288 });

const CATEGORY_ORDER = Object.freeze([
  ["ALL_TIME", "All-Time Leaders"],
  ["INDIVIDUAL", "Individual Scoring Records"],
  ["TEAM", "Team Scoring Records"],
  ["COURSE_HOLE", "Course Hole Records"],
  ["ADVANCED", "Advanced Hole-by-Hole"],
  ["MATCH_PLAY", "Match Play Records"],
  ["MATCH_PROGRESSION", "Match Progression Records"],
]);

const GROUP_CATEGORY = Object.freeze({
  individual: "INDIVIDUAL",
  team: "TEAM",
  "course-hole": "COURSE_HOLE",
  advanced: "ADVANCED",
  "match-play": "MATCH_PLAY",
});

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

function requireValue(condition) {
  if (!condition) throw unavailable();
}

function isAbsent(value) {
  return value === null || value === undefined ||
    (typeof value === "string" && clean(value) === "");
}

function optionalNumeric(value) {
  if (isAbsent(value)) return null;
  requireValue(typeof value === "number" || typeof value === "string");
  const result = Number(value);
  requireValue(Number.isFinite(result));
  return result;
}

function canonicalRecordValue(value) {
  if (isAbsent(value)) return null;
  if (typeof value === "number") {
    requireValue(Number.isFinite(value));
    return value;
  }
  requireValue(typeof value === "string");
  const result = clean(value);
  const number = Number(result);
  return Number.isFinite(number) ? number : result;
}

function boundedList(value, maximum) {
  const result = list(value);
  requireValue(result.length <= maximum);
  return result;
}

function boundedInteger(value, minimum, maximum) {
  const result = optionalNumeric(value);
  if (result === null) return null;
  requireValue(Number.isSafeInteger(result) && result >= minimum && result <= maximum);
  return result;
}

function optionalText(value, maximum) {
  const result = clean(value) || null;
  requireValue(!result || result.length <= maximum);
  return result;
}

function optionalId(value) {
  const result = clean(value) || null;
  requireValue(!result || MOBILE_ID.test(result));
  return result;
}

function timestamp(now) {
  const result = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  requireValue(Number.isFinite(Date.parse(result)));
  return result;
}

function sourceName(record = {}) {
  if (record.source === "official") return "OFFICIAL";
  if (record.source === "scorecard") return "SCORECARD";
  if (record.source === "match-progression") return "MATCH_PROGRESSION";
  throw unavailable();
}

function categoryFor(record, definition) {
  if (record.source === "official") return "ALL_TIME";
  if (record.source === "match-progression") return "MATCH_PROGRESSION";
  return GROUP_CATEGORY[clean(definition?.group)] || "ADVANCED";
}

function recordValueDisplay(value, definition = {}) {
  if (value === null || value === undefined) return null;
  if (typeof definition.formatter === "function") return clean(definition.formatter({ value })) || String(value);
  if (definition.slug) return clean(formatRecordValue(value, definition)) || String(value);
  return String(value);
}

function holderDto(value = {}, definition = {}) {
  const playerIds = boundedList(value.canonicalPlayerIds?.length ? value.canonicalPlayerIds
    : [value.playerId, ...list(value.playerIds)], 4).map(clean).filter(Boolean);
  const participantNames = boundedList(value.playerNames, 4).map(clean).filter(Boolean);
  const entityType = clean(value.entityType || (playerIds.length === 1 ? "PLAYER" : "MATCH_PERFORMANCE")).toUpperCase();
  const canonicalValue = canonicalRecordValue(value.value);
  requireValue(playerIds.every((playerId) => MOBILE_ID.test(playerId)) &&
    new Set(playerIds).size === playerIds.length &&
    participantNames.every((name) => name.length > 0 && name.length <= 160) &&
    ["PLAYER", "TEAM_PERFORMANCE", "COURSE_HOLE", "MATCH_PERFORMANCE"].includes(entityType) &&
    (typeof canonicalValue !== "string" || canonicalValue.length <= 128));
  const displayName = optionalText(
    value.playerName || value.teamName || value.name || participantNames.join(" & "), 200,
  );
  return {
    entityType,
    playerIds,
    displayName,
    participantNames,
    teamId: optionalId(value.teamId),
    teamName: optionalText(value.teamName, 160),
    courseId: optionalId(value.courseId),
    courseName: optionalText(value.courseName, 160),
    holeNumber: boundedInteger(value.holeNumber, 1, 18),
    matchId: optionalId(value.matchId),
    year: boundedInteger(value.year, 2017, 2026),
    roundNumber: boundedInteger(value.round, 1, 8),
    format: optionalText(value.format, 16),
    value: canonicalValue,
    valueDisplay: optionalText(
      clean(value.valueDisplay) || recordValueDisplay(canonicalValue, definition), 160,
    ),
    secondaryValue: optionalNumeric(value.secondaryValue),
  };
}

export function mobileRecordsData(authority = {}) {
  requireValue(Array.isArray(authority.records));
  const scorecardBySlug = authority.scorecardCatalog?.bySlug || {};
  const progressionBySlug = authority.matchProgression?.byRecordSlug || {};
  const categories = new Map(CATEGORY_ORDER.map(([categoryId, title], order) => [categoryId, {
    categoryId,
    title,
    order,
    records: [],
  }]));
  for (const record of boundedList(authority.records, 256)) {
    const definition = record.source === "scorecard" ? scorecardBySlug[record.slug]
      : record.source === "match-progression" ? progressionBySlug[record.slug] : record;
    const categoryId = categoryFor(record, definition);
    const holders = boundedList(record.winners, 32).map((winner) => holderDto(winner, definition));
    const winningValue = canonicalRecordValue(record.winningValue);
    const decimals = Number.isSafeInteger(Number(definition?.decimals)) ? Number(definition.decimals) : 0;
    requireValue(decimals >= 0 && decimals <= 8 &&
      (typeof winningValue !== "string" || winningValue.length <= 128));
    categories.get(categoryId)?.records.push({
      recordId: clean(record.slug),
      title: clean(record.title),
      source: sourceName(record),
      direction: record.direction === "lowest" ? "lowest" : "highest",
      unit: optionalText(definition?.unit, 40),
      decimals,
      signed: definition?.signed === true,
      aggregate: definition?.aggregate === true,
      eligibilityNote: optionalText(definition?.eligibility, 240),
      value: winningValue,
      valueDisplay: optionalText(
        holders[0]?.valueDisplay || recordValueDisplay(winningValue, definition), 160,
      ),
      tied: holders.length > 1,
      holders,
    });
  }
  const result = [...categories.values()].filter((category) => category.records.length);
  requireValue(result.every((category) =>
    category.records.length <= 128 &&
    new Set(category.records.map((record) => record.recordId)).size === category.records.length &&
    category.records.every((record) => MOBILE_ID.test(record.recordId) &&
      record.title.length > 0 && record.title.length <= 200)));
  const data = {
    coverage: {
      firstCompleteMatchYear: 2017,
      scorecardHistoryComplete: false,
      note: "Scorecard records use only available COMPLETE and VERIFIED hole-by-hole scorecards.",
    },
    categories: result,
  };
  requireValue(Buffer.byteLength(JSON.stringify(data), "utf8") <= MOBILE_RECORDS_LIMITS.responseBytes);
  return data;
}

export function mobileRecordsRepresentationRevision(data = {}) {
  return scoringShadowPayloadHash({ product: "mobile-records-v1", data });
}

export async function mobileRecordsResult(identity, { env = process.env, now, dependencies = {} } = {}) {
  const loadCareerAuthority = dependencies.loadMobileCareerAuthority ||
    (await import("./mobile-v1-career-authority.js")).loadMobileCareerAuthority;
  let model;
  try {
    model = await loadCareerAuthority(identity, {
      env,
      dependencies: dependencies.careerAuthorityDependencies || {},
      leaderboardsRead: dependencies.leaderboardsRead || null,
    });
  } catch {
    throw unavailable();
  }
  requireValue(model?.source === "supabase" && model.calculations && model.scorecardAnalytics);
  const records = model.calculations.getRecords();
  let leaderboardSlugs = dependencies.getLeaderboardSlugs;
  let leaderboardFromRecords = dependencies.getLeaderboardFromRecords;
  if (!leaderboardSlugs || !leaderboardFromRecords) {
    const leaderboards = await import("./leaderboards.js");
    leaderboardSlugs ||= leaderboards.getLeaderboardSlugs;
    leaderboardFromRecords ||= leaderboards.getLeaderboardFromRecords;
  }
  const officialLeaderboards = leaderboardSlugs().map((slug) => leaderboardFromRecords(slug, records));
  const playerNames = Object.fromEntries(list(records.points).map(({ player }) => [
    clean(player?.["Player ID"]),
    clean(player?.["Display Name"]),
  ]).filter(([playerId]) => playerId));
  const authority = (dependencies.buildCanonicalRecordHolderAuthority || buildCanonicalRecordHolderAuthority)({
    officialLeaderboards,
    scorecards: model.scorecardAnalytics.scorecards,
    playerNames,
    ghostMatchExclusions: model.scorecardAnalytics.ghostMatchExclusions,
  });
  const data = mobileRecordsData(authority);
  const revision = mobileRecordsRepresentationRevision(data);
  const body = {
    ok: true,
    apiVersion: MOBILE_API_VERSION,
    data,
    meta: { generatedAt: timestamp(now), revision },
  };
  requireValue(Buffer.byteLength(JSON.stringify(body), "utf8") <=
    MOBILE_RECORDS_LIMITS.responseBytes);
  return {
    status: 200,
    revision,
    body,
  };
}

export const mobileRecordsTestSupport = Object.freeze({ holderDto, categoryFor });
