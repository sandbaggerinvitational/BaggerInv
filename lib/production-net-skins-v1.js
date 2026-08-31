import { scoringShadowRpc } from "./scoring-shadow.js";
import { PRODUCTION_TOURNAMENT_ID } from "./production-foundation-resource-contract.js";

export const PRODUCTION_NET_SKINS_V1_CONTRACT = "production-net-skins-v1";
export const PRODUCTION_NET_SKINS_V1_STATES = Object.freeze([
  "NOT_CONFIGURED",
  "CONFIGURED",
  "IN_PROGRESS",
  "OFFICIAL",
  "UNAVAILABLE",
]);

const STATE_SET = new Set(PRODUCTION_NET_SKINS_V1_STATES);
const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function safeState(value) {
  const state = clean(value).toUpperCase();
  return STATE_SET.has(state) ? state : "UNAVAILABLE";
}

function officialSkin(row = {}, round = {}) {
  const winnerPlayerIds = Array.isArray(row.winner_player_ids)
    ? row.winner_player_ids.map(clean).filter(Boolean)
    : [];
  return {
    id: clean(row.skin_id),
    hole: number(row.hole_number),
    match: clean(row.match_id),
    winnerEntryId: clean(row.winner_entry_id),
    winnerPlayerIds,
    winnerPlayerId: winnerPlayerIds[0] || "",
    winnerPlayerId2: winnerPlayerIds[1] || "",
    winningNetScore: number(row.winning_net_score),
    skinValue: number(row.skin_value),
    roundPot: number(round.pot),
    format: clean(round.format).toUpperCase(),
  };
}

function officialLeaderboardRow(row = {}, skins = []) {
  const playerIds = Array.isArray(row.player_ids)
    ? row.player_ids.map(clean).filter(Boolean)
    : [];
  const winningHoles = skins.filter((skin) =>
    clean(skin.winnerEntryId) === clean(row.entry_id) ||
    (!clean(skin.winnerEntryId) && skin.winnerPlayerIds.join("|") === playerIds.join("|")));
  return {
    id: clean(row.entry_id),
    playerIds,
    rank: number(row.rank),
    displayRank: clean(row.display_rank || row.rank),
    skinsWon: number(row.skins_won),
    totalWinnings: number(row.total_winnings),
    winningHoles,
    // V1 deliberately publishes only official winning facts. It does not
    // expose a provisional hole-by-hole field, so the existing sheet stays
    // bounded to the official winning holes supplied by the contract.
    holeResults: winningHoles.map((skin) => ({
      hole: skin.hole,
      gross: null,
      net: skin.winningNetScore,
      par: null,
      wonSkin: true,
      tiedLow: false,
    })),
  };
}

function officialRound(row = {}) {
  const presentation = row.result_payload && typeof row.result_payload === "object"
    ? row.result_payload
    : null;
  const payload = row.official_results && typeof row.official_results === "object"
    ? row.official_results
    : {};
  const metadata = { format: row.format, pot: payload.pot };
  const skins = Array.isArray(payload.skins)
    ? payload.skins.map((skin) => officialSkin(skin, metadata))
    : [];
  return {
    ...(presentation || {}),
    roundId: clean(row.round_id),
    round: number(presentation?.round || row.round_number),
    format: clean(presentation?.format || row.format).toUpperCase(),
    entryType: clean(row.entry_type).toUpperCase(),
    buyInPerEntry: number(row.buy_in_per_entry),
    matches: Array.isArray(presentation?.matches)
      ? presentation.matches
      : Array.isArray(row.match_ids) ? row.match_ids.map(clean).filter(Boolean) : [],
    pot: number(presentation?.pot ?? payload.pot),
    eligibleCount: number(presentation?.eligibleCount ?? payload.eligible_count ?? row.eligible_entry_count),
    completedHoles: number(presentation?.completedHoles ?? payload.completed_holes),
    complete: presentation?.complete === true || payload.complete === true,
    finalized: presentation?.finalized === true || payload.finalized === true,
    skinsAwarded: number(presentation?.skinsAwarded ?? payload.skins_awarded),
    skinValue: number(presentation?.skinValue ?? payload.skin_value),
    skins: Array.isArray(presentation?.skins) ? presentation.skins : skins,
    leaderboard: Array.isArray(presentation?.leaderboard)
      ? presentation.leaderboard
      : Array.isArray(payload.leaderboard)
        ? payload.leaderboard.map((entry) => officialLeaderboardRow(entry, skins))
        : [],
    resultState: "OFFICIAL",
    configurationRevision: number(row.configuration_revision),
    resultRevision: number(row.result_revision),
    configurationFingerprint: clean(row.configuration_fingerprint),
    sourceFingerprint: clean(row.freshness?.source_fingerprint),
    calculatedAt: clean(row.freshness?.calculated_at),
    publishedAt: clean(row.freshness?.published_at),
    stale: row.freshness?.stale === true,
  };
}

function boundedRound(row = {}) {
  const state = safeState(row.state);
  if (state === "OFFICIAL" && (row.result_payload || row.official_results)) return officialRound(row);
  return {
    roundId: clean(row.round_id),
    round: number(row.round_number),
    format: clean(row.format).toUpperCase(),
    entryType: clean(row.entry_type).toUpperCase(),
    buyInPerEntry: number(row.buy_in_per_entry),
    eligibleCount: number(row.eligible_entry_count),
    eligiblePlayerIds: Array.isArray(row.eligible_player_ids)
      ? row.eligible_player_ids.map(clean).filter(Boolean)
      : [],
    entries: Array.isArray(row.entries) ? row.entries.map((entry) => ({
      id: clean(entry.entry_id),
      entryType: clean(entry.entry_type).toUpperCase(),
      matchId: clean(entry.match_id),
      playerIds: Array.isArray(entry.player_ids)
        ? entry.player_ids.map(clean).filter(Boolean)
        : [],
    })) : [],
    resultState: state,
    configurationRevision: number(row.configuration_revision),
    resultRevision: row.result_revision == null ? null : number(row.result_revision),
    configurationFingerprint: clean(row.configuration_fingerprint),
    sourceFingerprint: clean(row.freshness?.source_fingerprint),
    calculatedAt: clean(row.freshness?.calculated_at),
    publishedAt: clean(row.freshness?.published_at),
    stale: row.freshness?.stale === true,
    matches: Array.isArray(row.match_ids) ? row.match_ids.map(clean).filter(Boolean) : [],
    completedHoles: 0,
    complete: false,
    finalized: false,
    skinsAwarded: 0,
    skins: [],
    leaderboard: [],
  };
}

/**
 * Convert the service-only Production contract into the existing presentation
 * model without exposing an unpublished/provisional payout payload.
 */
export function productionNetSkinsV1Data(view = {}, {
  expectedTournamentId = PRODUCTION_TOURNAMENT_ID,
} = {}) {
  const contractVersion = clean(view.contract_version);
  if (contractVersion !== PRODUCTION_NET_SKINS_V1_CONTRACT) {
    const error = new Error("The Production Net Skins read contract is unavailable.");
    error.code = "NET_SKINS_V1_CONTRACT_REQUIRED";
    throw error;
  }
  const state = safeState(view.state);
  const rounds = Array.isArray(view.rounds) ? view.rounds.map(boundedRound) : [];
  const freshness = view.freshness && typeof view.freshness === "object" ? view.freshness : {};
  const publicationPolicy = clean(view.publication_policy).toUpperCase();
  if (publicationPolicy !== "OFFICIAL_ONLY") {
    const error = new Error("The Production Net Skins publication contract is unavailable.");
    error.code = "NET_SKINS_V1_PUBLICATION_POLICY_REQUIRED";
    throw error;
  }
  const tournamentId = clean(view.tournament_id);
  const configurationRevision = number(view.configuration_revision);
  const resultRevision = view.result_revision == null ? null : number(view.result_revision);
  const expectedRevision = `net-skins-v1:${configurationRevision}:${resultRevision ?? 0}:${state}`;
  if (tournamentId !== clean(expectedTournamentId) || clean(view.revision) !== expectedRevision) {
    const error = new Error("The Production Net Skins resource binding is unavailable.");
    error.code = "NET_SKINS_V1_RESOURCE_BINDING_REQUIRED";
    throw error;
  }
  const configured = state !== "NOT_CONFIGURED";
  const published = rounds.some((round) => round.resultState === "OFFICIAL");
  const unavailable = state === "UNAVAILABLE";
  const stateContract = Object.freeze({
    contractVersion,
    tournamentId,
    state,
    publicationPolicy,
    configured,
    published,
    visible: configured,
    available: !unavailable,
    configurationRevision,
    resultRevision,
    configurationFingerprint: clean(view.configuration_fingerprint),
    revision: clean(view.revision),
    stale: freshness.stale === true,
    configuredAt: clean(freshness.configured_at),
    calculatedAt: clean(freshness.calculated_at),
    publishedAt: clean(freshness.published_at),
    sourceFingerprint: clean(freshness.source_fingerprint),
  });
  const officialRounds = rounds.filter((round) => round.resultState === "OFFICIAL");
  return {
    netSkinsState: stateContract,
    netSkins: {
      state,
      rounds,
      results: officialRounds.flatMap((round) => Array.isArray(round.skins) ? round.skins : []),
    },
    jobs: [],
    stale: stateContract.stale,
    queryMs: number(view.query_ms),
    revision: stateContract.revision,
  };
}

export async function readProductionNetSkinsV1({
  playerId = "",
  tournamentId = "",
  env = process.env,
  resolveProductionCurrentReadDispatch,
} = {}) {
  return scoringShadowRpc("read_production_net_skins_v1", {
    input: clean(playerId) ? { player_id: clean(playerId) } : {},
  }, {
    env,
    timeoutMs: 8_000,
    currentTournamentId: clean(tournamentId),
    ...(typeof resolveProductionCurrentReadDispatch === "function"
      ? { resolveProductionCurrentReadDispatch }
      : {}),
  });
}

export async function currentProductionNetSkinsV1(options = {}) {
  const read = await readProductionNetSkinsV1(options);
  if (!read.payload?.ok || !read.payload.data) {
    const error = new Error("Production Net Skins state is unavailable.");
    error.code = clean(read.payload?.code || "NET_SKINS_V1_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  return {
    ...productionNetSkinsV1Data(read.payload.data, {
      expectedTournamentId: clean(options.tournamentId) || PRODUCTION_TOURNAMENT_ID,
    }),
    serviceMs: number(read.durationMs),
    recalculation: null,
  };
}
