import { productionCutoverReadTransportEnvironment } from "./production-cutover-read-transport.js";
import { mobileNativeDevelopmentAuthorityEnvironment } from "./mobile-native-development-authority.js";
import { MOBILE_API_VERSION, MobileApiError } from "./mobile-api-v1.js";
import { readMobilePreviewNetSkinsV1 } from "./mobile-v1-preview-leaders-products.js";
import { readProductionNetSkinsV1 as readCanonicalProductionNetSkinsV1 } from "./production-net-skins-v1.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

export const MOBILE_NET_SKINS_CONTRACT_VERSION = "production-net-skins-v1";
export const MOBILE_NET_SKINS_STATES = Object.freeze([
  "NOT_CONFIGURED",
  "CONFIGURED",
  "IN_PROGRESS",
  "OFFICIAL",
  "UNAVAILABLE",
]);

export function mobileNetSkinsRepresentationRevision(data = {}) {
  return scoringShadowPayloadHash({
    product: "mobile-net-skins-v1",
    data,
  });
}

const STATE_SET = new Set(MOBILE_NET_SKINS_STATES);
const ROUND_STATE_SET = new Set(["CONFIGURED", "IN_PROGRESS", "OFFICIAL", "UNAVAILABLE"]);
const FORMAT_SET = new Set(["BB", "SC", "SI"]);
const ENTRY_TYPE_SET = new Set(["INDIVIDUAL", "PAIRING"]);
const FINGERPRINT = /^[0-9a-f]{64}$/;
const clean = (value) => String(value ?? "").trim();

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

function requireValue(condition) {
  if (!condition) throw unavailable();
}

function safeInteger(value, { nullable = false, minimum = 0 } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  const result = Number(value);
  requireValue(Number.isSafeInteger(result) && result >= minimum);
  return result;
}

function finiteNumber(value, { minimum = 0 } = {}) {
  const result = Number(value);
  requireValue(Number.isFinite(result) && result >= minimum);
  return result;
}

function signedNumber(value) {
  const result = Number(value);
  requireValue(Number.isFinite(result));
  return result;
}

function nullableFingerprint(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const result = clean(value).toLowerCase();
  requireValue(FINGERPRINT.test(result));
  return result;
}

function nullableTimestamp(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const result = clean(value);
  requireValue(Number.isFinite(Date.parse(result)));
  return result;
}

function stableStrings(value) {
  requireValue(Array.isArray(value));
  const result = value.map(clean);
  requireValue(result.every(Boolean) && new Set(result).size === result.length);
  return result;
}

function freshnessDto(value = {}) {
  requireValue(value && typeof value === "object" && !Array.isArray(value));
  requireValue(typeof value.stale === "boolean");
  return {
    stale: value.stale === true,
    configuredAt: nullableTimestamp(value.configured_at),
    calculatedAt: nullableTimestamp(value.calculated_at),
    publishedAt: nullableTimestamp(value.published_at),
    sourceFingerprint: nullableFingerprint(value.source_fingerprint),
  };
}

function entryDto(value = {}, round = {}) {
  const entryId = clean(value.entry_id);
  const entryType = clean(value.entry_type).toUpperCase();
  const matchId = clean(value.match_id);
  const playerIds = stableStrings(value.player_ids);
  requireValue(entryId && matchId && ENTRY_TYPE_SET.has(entryType));
  requireValue(entryType === round.entryType);
  requireValue(entryType === "PAIRING" ? playerIds.length === 2 : playerIds.length === 1);
  requireValue(round.matchIds.includes(matchId));
  return { entryId, entryType, matchId, playerIds };
}

function officialResultsDto(value, round) {
  requireValue(value && typeof value === "object" && !Array.isArray(value));
  requireValue(value.complete === true && value.finalized === true);
  const entryIds = new Set(round.entries.map((entry) => entry.entryId));
  const matchIds = new Set(round.matchIds);
  const entries = new Map(round.entries.map((entry) => [entry.entryId, entry]));
  const skins = Array.isArray(value.skins) ? value.skins.map((skin) => {
    const skinId = clean(skin.skin_id);
    const matchId = clean(skin.match_id);
    const winnerEntryId = clean(skin.winner_entry_id);
    const winnerPlayerIds = stableStrings(skin.winner_player_ids);
    const winnerEntry = entries.get(winnerEntryId);
    requireValue(skinId && winnerEntry && matchId);
    if (matchIds.size) requireValue(matchIds.has(matchId));
    requireValue(winnerPlayerIds.length === winnerEntry.playerIds.length &&
      winnerPlayerIds.every((playerId) => winnerEntry.playerIds.includes(playerId)));
    return {
      skinId,
      holeNumber: safeInteger(skin.hole_number, { minimum: 1 }),
      matchId,
      winnerEntryId,
      winnerPlayerIds,
      winningNetScore: signedNumber(skin.winning_net_score),
      skinValue: finiteNumber(skin.skin_value),
    };
  }) : null;
  const leaderboard = Array.isArray(value.leaderboard) ? value.leaderboard.map((row) => {
    const entryId = clean(row.entry_id);
    const playerIds = stableStrings(row.player_ids);
    const entry = entries.get(entryId);
    requireValue(entryIds.has(entryId) && entry && playerIds.length === entry.playerIds.length &&
      playerIds.every((playerId) => entry.playerIds.includes(playerId)));
    const winningHoleNumbers = Array.isArray(row.winning_hole_numbers)
      ? row.winning_hole_numbers.map((hole) => safeInteger(hole, { minimum: 1 })) : null;
    requireValue(winningHoleNumbers && winningHoleNumbers.every((hole) => hole <= 18));
    return {
      rank: safeInteger(row.rank, { minimum: 1 }),
      displayRank: clean(row.display_rank),
      entryId,
      playerIds,
      skinsWon: safeInteger(row.skins_won),
      totalWinnings: finiteNumber(row.total_winnings),
      winningHoleNumbers,
    };
  }) : null;
  requireValue(skins && leaderboard);
  const result = {
    pot: finiteNumber(value.pot),
    eligibleCount: safeInteger(value.eligible_count),
    completedHoles: safeInteger(value.completed_holes),
    skinsAwarded: safeInteger(value.skins_awarded),
    skinValue: finiteNumber(value.skin_value),
    complete: true,
    finalized: true,
    skins,
    leaderboard,
  };
  requireValue(result.eligibleCount === round.eligibleEntryCount && result.completedHoles === 18 &&
    result.skinsAwarded === result.skins.length && result.leaderboard.length === round.entries.length &&
    new Set(result.skins.map((skin) => skin.skinId)).size === result.skins.length &&
    new Set(result.leaderboard.map((row) => row.entryId)).size === result.leaderboard.length &&
    result.skins.every((skin) => skin.skinId === `${round.roundId}:H${skin.holeNumber}`));
  return result;
}

function roundDto(value = {}, tournamentId) {
  const roundNumber = safeInteger(value.round_number, { minimum: 1 });
  const roundId = clean(value.round_id);
  const format = clean(value.format).toUpperCase();
  const entryType = clean(value.entry_type).toUpperCase();
  const state = clean(value.state).toUpperCase();
  requireValue(roundId === `${tournamentId}:R${roundNumber}` && FORMAT_SET.has(format) &&
    ENTRY_TYPE_SET.has(entryType) && ROUND_STATE_SET.has(state));
  const round = {
    roundId,
    roundNumber,
    format,
    entryType,
    matchIds: stableStrings(value.match_ids),
    buyInPerEntry: finiteNumber(value.buy_in_per_entry),
    eligibleEntryCount: safeInteger(value.eligible_entry_count),
    eligiblePlayerIds: stableStrings(value.eligible_player_ids),
    state,
    configurationRevision: safeInteger(value.configuration_revision),
    resultRevision: safeInteger(value.result_revision, { nullable: true }),
    configurationFingerprint: nullableFingerprint(value.configuration_fingerprint),
    freshness: freshnessDto(value.freshness),
    entries: [],
    officialResults: null,
  };
  requireValue(Array.isArray(value.entries));
  round.entries = value.entries.map((entry) => entryDto(entry, round));
  requireValue(round.eligibleEntryCount === round.entries.length &&
    new Set(round.entries.map((entry) => entry.entryId)).size === round.entries.length &&
    round.configurationFingerprint !== null);
  const configuredPlayers = [...new Set(round.entries.flatMap((entry) => entry.playerIds))];
  requireValue(round.eligiblePlayerIds.length === configuredPlayers.length &&
    round.eligiblePlayerIds.every((playerId) => configuredPlayers.includes(playerId)));
  if (state === "OFFICIAL") {
    requireValue(round.resultRevision !== null && round.freshness.publishedAt !== null);
    round.officialResults = officialResultsDto(value.official_results, round);
  }
  else requireValue(value.official_results === null || value.official_results === undefined);
  return round;
}

export function mobileNetSkinsDataFromProductionView(view = {}, identity = {}) {
  const contractVersion = clean(view.contract_version);
  const tournamentId = clean(view.tournament_id);
  const state = clean(view.state).toUpperCase();
  const publicationPolicy = clean(view.publication_policy).toUpperCase();
  const configurationRevision = safeInteger(view.configuration_revision);
  const resultRevision = safeInteger(view.result_revision, { nullable: true });
  const revision = clean(view.revision);
  const expectedRevision = `net-skins-v1:${configurationRevision}:${resultRevision ?? 0}:${state}`;
  requireValue(contractVersion === MOBILE_NET_SKINS_CONTRACT_VERSION &&
    tournamentId === clean(identity.tournamentId) &&
    STATE_SET.has(state) && publicationPolicy === "OFFICIAL_ONLY" && revision === expectedRevision);
  requireValue(Array.isArray(view.rounds));
  const rounds = view.rounds.map((round) => roundDto(round, tournamentId));
  requireValue(state !== "NOT_CONFIGURED" || rounds.length === 0);
  requireValue(!["CONFIGURED", "IN_PROGRESS", "OFFICIAL"].includes(state) || rounds.length > 0);
  if (state === "OFFICIAL") requireValue(rounds.every((round) => round.state === "OFFICIAL"));
  requireValue(rounds.every((round) => round.configurationRevision === configurationRevision));
  const playerId = clean(identity.playerId);
  requireValue(playerId);
  const playerEntries = rounds.flatMap((round) => round.entries
    .filter((entry) => entry.playerIds.includes(playerId))
    .map((entry) => ({ roundId: round.roundId, entryId: entry.entryId })));
  requireValue(new Set(playerEntries.map((entry) => entry.roundId)).size === playerEntries.length);
  const configurationFingerprint = nullableFingerprint(view.configuration_fingerprint);
  if (["CONFIGURED", "IN_PROGRESS", "OFFICIAL"].includes(state)) {
    requireValue(configurationFingerprint !== null);
  }
  return {
    contractVersion,
    tournamentId,
    state,
    publicationPolicy,
    published: rounds.some((round) => round.state === "OFFICIAL"),
    configurationRevision,
    resultRevision,
    configurationFingerprint,
    revision,
    freshness: freshnessDto(view.freshness),
    rounds,
    player: {
      playerId,
      eligibleRoundIds: playerEntries.map((entry) => entry.roundId),
      entryIds: playerEntries.map((entry) => entry.entryId),
    },
  };
}

export async function readMobileProductionNetSkinsV1({ tournamentId, playerId } = {}, {
  env = process.env,
  dependencies = {},
} = {}) {
  const resolvedTournamentId = clean(tournamentId);
  const resolvedPlayerId = clean(playerId);
  if (!/^\d{4}$/.test(resolvedTournamentId) || !resolvedPlayerId) throw unavailable();
  const readState = (dependencies.productionReadTransportEnvironment || productionCutoverReadTransportEnvironment)(
    env,
    "read_production_net_skins_v1",
    { input: { player_id: resolvedPlayerId } },
  );
  if (!readState?.allowed) throw unavailable();
  try {
    return await (dependencies.readCanonicalProductionNetSkinsV1 || readCanonicalProductionNetSkinsV1)({
      playerId: resolvedPlayerId,
      ...(resolvedTournamentId === "2026"
        ? {} : { tournamentId: resolvedTournamentId }),
      env,
    });
  } catch {
    throw unavailable();
  }
}

export async function mobileNetSkinsResult(identity, {
  env = process.env,
  now = new Date(),
  dependencies = {},
} = {}) {
  let read;
  try {
    const authority = mobileNativeDevelopmentAuthorityEnvironment(env);
    if (authority.runtime === "preview" && !authority.available) throw unavailable();
    const reader = dependencies.readNetSkinsV1 || (authority.available
      ? dependencies.readPreviewNetSkinsV1 || readMobilePreviewNetSkinsV1
      : dependencies.readProductionNetSkinsV1 || readMobileProductionNetSkinsV1);
    read = await reader({
      tournamentId: identity?.tournamentId,
      playerId: identity?.playerId,
    }, { env, dependencies });
  } catch {
    throw unavailable();
  }
  const data = mobileNetSkinsDataFromProductionView(read?.payload?.data, identity);
  const representationRevision = mobileNetSkinsRepresentationRevision(data);
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  requireValue(Number.isFinite(Date.parse(generatedAt)));
  return {
    status: 200,
    revision: representationRevision,
    body: {
      ok: true,
      apiVersion: MOBILE_API_VERSION,
      data,
      meta: { generatedAt, revision: representationRevision },
    },
  };
}
