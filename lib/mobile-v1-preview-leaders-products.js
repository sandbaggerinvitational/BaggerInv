import { mobileNativeDevelopmentAuthorityEnvironment } from "./mobile-native-development-authority.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const upper = (value) => clean(value).toUpperCase();

function unavailable() {
  const error = new Error("The isolated Preview participant projection is unavailable.");
  error.code = "MOBILE_API_UNAVAILABLE";
  error.status = 503;
  return error;
}

function requireValue(condition) {
  if (!condition) throw unavailable();
}

function activePreview(env) {
  return mobileNativeDevelopmentAuthorityEnvironment(env).available === true;
}

function playerIds(entry = {}) {
  return [entry.player_id_1, entry.player_id_2].map(clean).filter(Boolean);
}

function samePlayers(left = [], right = []) {
  const one = [...left].map(clean).filter(Boolean).sort();
  const two = [...right].map(clean).filter(Boolean).sort();
  return one.length === two.length && one.every((value, index) => value === two[index]);
}

function canonicalMatchForEntry(entry = {}, roundNumber, matches = []) {
  const expectedPlayers = playerIds(entry);
  const roundMatches = matches.filter((item) => number(item.match?.round_number) === number(roundNumber));
  const containsPlayers = (item) => {
    const participants = (item.participants || []).map((row) => clean(row.player_id));
    return expectedPlayers.every((playerId) => participants.includes(playerId));
  };
  const label = clean(entry.match_number);
  const explicit = roundMatches.filter((item) => containsPlayers(item) && (
    clean(item.match?.match_id) === label || clean(item.presentation?.display_match_number) === label
  ));
  const candidates = explicit.length ? explicit : roundMatches.filter(containsPlayers);
  requireValue(candidates.length === 1 && clean(candidates[0].match?.match_id));
  return candidates[0];
}

function currentNetSkinsSourceFingerprint(input = {}, roundNumber) {
  const matches = (input.source_revision?.matches || [])
    .filter((row) => number(row.round) === number(roundNumber));
  const matchIds = new Set(matches.map((row) => clean(row.matchId)));
  const holes = (input.source_revision?.holes || [])
    .filter((row) => matchIds.has(clean(row.matchId)));
  return scoringShadowPayloadHash({
    tournamentId: clean(input.tournament?.tournament_id), matches, holes,
  });
}

function officialNetSkinsResults(payload = {}, roundId, entries = []) {
  requireValue(payload.complete === true && payload.finalized === true);
  const entryForPlayers = (ids) => entries.find((entry) => samePlayers(entry.player_ids, ids));
  const skins = (payload.skins || []).map((skin) => {
    const winners = [skin.winnerPlayerId, skin.winnerPlayerId2].map(clean).filter(Boolean);
    const winner = entryForPlayers(winners);
    requireValue(winner);
    return {
      skin_id: `${roundId}:H${number(skin.hole)}`,
      hole_number: number(skin.hole),
      match_id: winner.match_id,
      winner_entry_id: winner.entry_id,
      winner_player_ids: winners,
      winning_net_score: number(skin.winningNetScore),
      skin_value: number(skin.skinValue),
    };
  });
  const leaderboard = (payload.leaderboard || []).map((row) => {
    const ids = (row.playerIds || []).map(clean).filter(Boolean);
    const entry = entries.find((candidate) => clean(candidate.entry_id) === clean(row.id)) || entryForPlayers(ids);
    requireValue(entry);
    return {
      rank: number(row.rank),
      display_rank: clean(row.displayRank || row.rank),
      entry_id: entry.entry_id,
      player_ids: ids,
      skins_won: number(row.skinsWon),
      total_winnings: number(row.totalWinnings),
      winning_hole_numbers: (row.winningHoles || []).map((hole) => number(hole.hole ?? hole)),
    };
  });
  return {
    pot: number(payload.pot),
    eligible_count: entries.length,
    completed_holes: number(payload.completedHoles),
    skins_awarded: number(payload.skinsAwarded),
    skin_value: number(payload.skinValue),
    complete: true,
    finalized: true,
    skins,
    leaderboard,
  };
}

function previewNetSkinsRawView(source = {}, identity = {}) {
  const input = source.input || {};
  const result = source.result || {};
  const tournamentId = clean(identity.tournamentId);
  requireValue(tournamentId && clean(input.tournament?.tournament_id) === tournamentId);
  const configured = (input.configurations || [])
    .filter((item) => item.configuration?.enabled !== false)
    .sort((left, right) => number(left.configuration?.round_number) - number(right.configuration?.round_number));
  if (!configured.length) {
    return {
      contract_version: "production-net-skins-v1",
      tournament_id: tournamentId,
      state: "NOT_CONFIGURED",
      publication_policy: "OFFICIAL_ONLY",
      configuration_revision: 0,
      result_revision: null,
      configuration_fingerprint: null,
      revision: "net-skins-v1:0:0:NOT_CONFIGURED",
      freshness: { stale: false, configured_at: null, calculated_at: null,
        published_at: null, source_fingerprint: null },
      rounds: [],
    };
  }
  const configurationRevision = Math.max(1, number(source.configuration_revision));
  const resultRevision = number(source.result_revision) > 0 ? number(source.result_revision) : null;
  const snapshots = new Map((result.snapshots || []).map((row) => [number(row.round_number), row]));
  const jobs = new Map((result.jobs || []).map((row) => [number(row.round_number), row]));
  let calculatedAt = null;
  let publishedAt = null;
  const sourceFingerprints = {};
  const rounds = configured.map((item) => {
    const configuration = item.configuration || {};
    const roundNumber = number(configuration.round_number);
    const roundId = `${tournamentId}:R${roundNumber}`;
    const entries = (item.entries || []).filter((entry) => entry.eligible !== false).map((entry) => {
      const match = canonicalMatchForEntry(entry, roundNumber, input.matches || []);
      return {
        entry_id: clean(entry.entry_id),
        entry_type: upper(configuration.entry_type),
        match_id: clean(match.match?.match_id),
        player_ids: playerIds(entry),
      };
    }).sort((left, right) => left.entry_id.localeCompare(right.entry_id));
    const matchIds = [...new Set(entries.map((entry) => entry.match_id))].sort();
    const eligiblePlayerIds = [...new Set(entries.flatMap((entry) => entry.player_ids))].sort();
    const snapshot = snapshots.get(roundNumber) || null;
    const job = jobs.get(roundNumber) || null;
    const currentSourceFingerprint = currentNetSkinsSourceFingerprint(input, roundNumber);
    sourceFingerprints[roundNumber] = currentSourceFingerprint;
    const exactSnapshot = snapshot &&
      clean(snapshot.configuration_fingerprint) === clean(configuration.configuration_fingerprint) &&
      clean(snapshot.source_fingerprint) === currentSourceFingerprint;
    const official = exactSnapshot && upper(snapshot.result_state) === "OFFICIAL" &&
      Boolean(clean(snapshot.published_at));
    const jobStatus = upper(job?.status);
    const roundMatches = (input.matches || []).filter((row) =>
      number(row.match?.round_number) === roundNumber);
    const hasStarted = roundMatches.some((row) => upper(row.match?.status) !== "UPCOMING" ||
      number(row.match?.scored_holes) > 0);
    const state = official ? "OFFICIAL"
      : jobStatus === "FAILED" ? "UNAVAILABLE"
      : ["PENDING", "RUNNING"].includes(jobStatus) || exactSnapshot || hasStarted ? "IN_PROGRESS"
      : "CONFIGURED";
    if (clean(snapshot?.calculated_at) && (!calculatedAt || clean(snapshot.calculated_at) > calculatedAt)) {
      calculatedAt = clean(snapshot.calculated_at);
    }
    if (official && clean(snapshot?.published_at) && (!publishedAt || clean(snapshot.published_at) > publishedAt)) {
      publishedAt = clean(snapshot.published_at);
    }
    return {
      round_id: roundId,
      round_number: roundNumber,
      format: upper(configuration.format),
      entry_type: upper(configuration.entry_type),
      match_ids: matchIds,
      buy_in_per_entry: number(configuration.buy_in_per_entry),
      eligible_entry_count: entries.length,
      eligible_player_ids: eligiblePlayerIds,
      state,
      configuration_revision: configurationRevision,
      result_revision: snapshot ? resultRevision : null,
      configuration_fingerprint: clean(configuration.configuration_fingerprint),
      freshness: {
        stale: state === "IN_PROGRESS" || state === "UNAVAILABLE",
        configured_at: clean(configuration.approved_at || configuration.imported_at) || null,
        calculated_at: clean(snapshot?.calculated_at) || null,
        published_at: official ? clean(snapshot.published_at) : null,
        source_fingerprint: currentSourceFingerprint,
      },
      entries,
      official_results: official
        ? officialNetSkinsResults(snapshot.result_payload || {}, roundId, entries)
        : null,
    };
  });
  const states = rounds.map((round) => round.state);
  const state = states.includes("UNAVAILABLE") ? "UNAVAILABLE"
    : states.every((value) => value === "OFFICIAL") ? "OFFICIAL"
    : states.some((value) => ["IN_PROGRESS", "OFFICIAL"].includes(value)) ? "IN_PROGRESS"
    : "CONFIGURED";
  const configurationFingerprint = scoringShadowPayloadHash(configured.map((item) => ({
    roundNumber: number(item.configuration?.round_number),
    fingerprint: clean(item.configuration?.configuration_fingerprint),
  })));
  const sourceFingerprint = scoringShadowPayloadHash(sourceFingerprints);
  return {
    contract_version: "production-net-skins-v1",
    tournament_id: tournamentId,
    state,
    publication_policy: "OFFICIAL_ONLY",
    configuration_revision: configurationRevision,
    result_revision: resultRevision,
    configuration_fingerprint: configurationFingerprint,
    revision: `net-skins-v1:${configurationRevision}:${resultRevision ?? 0}:${state}`,
    freshness: {
      stale: states.some((value) => ["IN_PROGRESS", "UNAVAILABLE"].includes(value)),
      configured_at: rounds.map((round) => round.freshness.configured_at).filter(Boolean).sort().at(-1) || null,
      calculated_at: calculatedAt,
      published_at: publishedAt,
      source_fingerprint: sourceFingerprint,
    },
    rounds,
  };
}

function previewCalcuttaRawView(source = {}, identity = {}) {
  const tournamentId = clean(identity.tournamentId);
  requireValue(tournamentId && clean(source.tournament_id) === tournamentId);
  const configuration = source.configuration;
  if (!configuration) {
    return {
      contract_version: "production-calcutta-v1",
      tournament_id: tournamentId,
      state: "NOT_CONFIGURED",
      publication_state: "UNPUBLISHED",
      published: false,
      currency_code: "USD",
      configuration_revision: 1,
      auction_revision: 0,
      publication_revision: 0,
      result_revision: null,
      configuration_fingerprint: null,
      auction_fingerprint: null,
      revision: "calcutta-v1:1:0:0:0:NOT_CONFIGURED:UNPUBLISHED",
      freshness: { stale: false, updating: false, configured_at: null,
        auction_recorded_at: null, published_at: null, calculated_at: null,
        source_fingerprint: null },
      market: null,
      result: null,
    };
  }
  const fingerprint = clean(configuration.configuration_fingerprint);
  const publication = source.publication || {};
  const published = upper(publication.publication_state) === "PUBLISHED" &&
    clean(publication.configuration_fingerprint) === fingerprint;
  const publicationState = published ? "PUBLISHED" : "UNPUBLISHED";
  const publicationRevision = number(publication.publication_revision);
  const snapshot = source.snapshot && clean(source.snapshot.configuration_fingerprint) === fingerprint
    ? source.snapshot : null;
  const jobStatus = upper(source.job?.status);
  const updating = ["PENDING", "RUNNING"].includes(jobStatus);
  const stale = Boolean(source.snapshot) && !snapshot || jobStatus === "FAILED" || updating;
  const resultRevision = snapshot && number(source.result_revision) > 0
    ? number(source.result_revision) : null;
  const completedRounds = snapshot?.result_payload?.completedRounds || [];
  const state = !snapshot && jobStatus === "FAILED" ? "UNAVAILABLE"
    : !snapshot ? "AUCTION_COMPLETE"
    : stale && !updating ? "UNAVAILABLE"
    : upper(snapshot.result_state) === "OFFICIAL" ? "OFFICIAL"
    : completedRounds.length ? "IN_PROGRESS"
    : "AUCTION_COMPLETE";
  const players = new Map((source.players || []).map((player) => [clean(player.player_id), clean(player.display_name)]));
  const person = (playerId) => {
    const resolvedPlayerId = clean(playerId);
    requireValue(resolvedPlayerId && players.has(resolvedPlayerId));
    return { player_id: resolvedPlayerId, display_name: players.get(resolvedPlayerId) };
  };
  const market = published ? {
    pot: configuration.financial_contract?.total_market_value,
    purchases: (configuration.purchases || []).map((purchase) => ({
      player: person(purchase.player_id),
      purchase_price: purchase.purchase_price,
      owners: (configuration.ownership || []).filter((owner) => clean(owner.player_id) === clean(purchase.player_id))
        .map((owner) => ({ player: person(owner.owner_player_id), ownership_fraction: owner.ownership_fraction })),
    })),
  } : null;
  const exposeResult = published && snapshot && state !== "UNAVAILABLE";
  const configurationRevision = Math.max(1, number(configuration.configuration_revision));
  const auctionRevision = configurationRevision;
  const revision = `calcutta-v1:${configurationRevision}:${auctionRevision}:${publicationRevision}:${resultRevision ?? 0}:${state}:${publicationState}`;
  return {
    contract_version: "production-calcutta-v1",
    tournament_id: tournamentId,
    state,
    publication_state: publicationState,
    published,
    currency_code: "USD",
    configuration_revision: configurationRevision,
    auction_revision: auctionRevision,
    publication_revision: publicationRevision,
    result_revision: resultRevision,
    configuration_fingerprint: fingerprint,
    auction_fingerprint: fingerprint,
    revision,
    freshness: {
      stale,
      updating,
      configured_at: clean(configuration.approved_at || configuration.imported_at) || null,
      auction_recorded_at: clean(configuration.imported_at) || null,
      published_at: published ? clean(publication.published_at) || null : null,
      calculated_at: clean(snapshot?.calculated_at) || null,
      source_fingerprint: clean(snapshot?.source_fingerprint) || null,
    },
    market,
    result: exposeResult ? snapshot.result_payload : null,
  };
}

async function previewRpc(name, { tournamentId, playerId } = {}, { env = process.env, dependencies = {} } = {}) {
  requireValue(activePreview(env) && clean(tournamentId) && clean(playerId));
  const rpc = dependencies.scoringShadowRpc || scoringShadowRpc;
  let read;
  try {
    read = await rpc(name, { input: {
      environment: "PREVIEW",
      tournament_id: clean(tournamentId),
      player_id: clean(playerId),
    } }, { env, timeoutMs: 8_000 });
  } catch {
    throw unavailable();
  }
  requireValue(read?.payload?.ok && read.payload.data);
  return read;
}

export async function readMobilePreviewNetSkinsV1(identity = {}, options = {}) {
  const read = await previewRpc("read_preview_mobile_net_skins_v1", identity, options);
  return {
    ...read,
    payload: { ok: true, data: previewNetSkinsRawView(read.payload.data, identity) },
  };
}

export async function readMobilePreviewCalcuttaV1(identity = {}, options = {}) {
  const read = await previewRpc("read_preview_mobile_calcutta_v1", identity, options);
  return {
    ...read,
    payload: { ok: true, data: previewCalcuttaRawView(read.payload.data, identity) },
  };
}

export const previewMobileLeadersProductTestSupport = Object.freeze({
  previewNetSkinsRawView,
  previewCalcuttaRawView,
});
