import { buildMatchProgressionAnalytics } from "./match-progression.js";
import { buildScorecardRecordLeaderboards } from "./scorecard-record-leaderboards.js";

const clean = (value) => String(value ?? "").trim();
const canonicalPlayerId = (value) => clean(value).toUpperCase();
const finite = (value) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "" &&
  Number.isFinite(Number(value));

function unique(values) {
  return [...new Set(values.map(canonicalPlayerId).filter(Boolean))];
}

export function recordEntryPlayerIds(entry = {}) {
  return unique([entry.playerId, ...(entry.playerIds || [])]);
}

function officialRecord(record) {
  const primaryColumn = record.columns.find((column) => column.numeric);
  const valueKey = primaryColumn?.key;
  const direction = record.direction === "lowest" ? "lowest" : "highest";
  const entries = valueKey
    ? record.rows
      .map((row) => ({
        entityType: "PLAYER",
        playerId: canonicalPlayerId(row.id),
        playerName: row.name,
        value: finite(row[valueKey]) ? Number(row[valueKey]) : null,
      }))
      .filter((entry) => entry.playerId && entry.value !== null)
    : [];
  const values = entries.map((entry) => entry.value);
  const winningValue = values.length
    ? direction === "lowest"
      ? Math.min(...values)
      : Math.max(...values)
    : null;
  const winners = winningValue === null
    ? []
    : entries.filter((entry) => entry.value === winningValue);

  return {
    slug: record.slug,
    title: record.title,
    source: "official",
    direction,
    playerAddressable: true,
    entries,
    winners,
    winningValue,
    holderPlayerIds: unique(winners.flatMap(recordEntryPlayerIds)),
  };
}

function analyticRecord(record, source) {
  const entries = (record.entries || []).map((entry) => ({
    ...entry,
    canonicalPlayerIds: recordEntryPlayerIds(entry),
  }));
  const winners = (record.winners || []).map((entry) => ({
    ...entry,
    canonicalPlayerIds: recordEntryPlayerIds(entry),
  }));
  const declaredPlayerEntity = ["PLAYER", "TEAM_PERFORMANCE"].includes(record.entityType);
  const playerAddressable = declaredPlayerEntity || entries.some(
    (entry) => entry.canonicalPlayerIds.length > 0
  );

  return {
    slug: record.slug,
    title: record.title,
    source,
    direction: record.direction,
    playerAddressable,
    entries,
    winners,
    winningValue: winners[0]?.value ?? null,
    holderPlayerIds: playerAddressable
      ? unique(winners.flatMap((entry) => entry.canonicalPlayerIds))
      : [],
  };
}

/**
 * Canonical Records owns record-holder membership. The Records product and
 * Career Profile both consume this catalog; Career never re-ranks its own
 * scorecard or historical population to decide who holds a record.
 */
export function buildCanonicalRecordHolderAuthority({
  officialLeaderboards = [],
  scorecards = [],
  playerNames = {},
  ghostMatchExclusions = new Set(),
} = {}) {
  const scorecardCatalog = buildScorecardRecordLeaderboards(scorecards, {
    playerNames,
    ghostMatchExclusions,
  });
  const matchProgression = buildMatchProgressionAnalytics(scorecards, {
    ghostMatchExclusions,
  });
  const records = [
    ...officialLeaderboards.map(officialRecord),
    ...scorecardCatalog.records.map((record) => analyticRecord(record, "scorecard")),
    ...matchProgression.records.map((record) => analyticRecord(record, "match-progression")),
  ];
  const bySlug = Object.fromEntries(records.map((record) => [record.slug, record]));
  const recordsHeldByPlayer = new Map();

  for (const record of records) {
    if (!record.playerAddressable) continue;
    for (const playerId of record.holderPlayerIds) {
      if (!recordsHeldByPlayer.has(playerId)) recordsHeldByPlayer.set(playerId, []);
      recordsHeldByPlayer.get(playerId).push({
        slug: record.slug,
        title: record.title,
      });
    }
  }

  for (const [playerId, held] of recordsHeldByPlayer) {
    recordsHeldByPlayer.set(
      playerId,
      [...new Map(held.map((record) => [record.slug, record])).values()]
        .sort((a, b) => a.title.localeCompare(b.title))
    );
  }

  return {
    records,
    bySlug,
    scorecardCatalog,
    matchProgression,
    recordsHeldForPlayer(playerId) {
      return recordsHeldByPlayer.get(canonicalPlayerId(playerId)) || [];
    },
  };
}
