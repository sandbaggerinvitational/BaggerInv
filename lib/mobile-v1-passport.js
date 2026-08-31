import { leaderboardsCoreDataFromSupabaseView, readLeaderboardsCoreView } from "./leaderboards-core-supabase.js";
import { requireLeaderboardsCoreReadSource } from "./leaderboards-core-read-source.js";
import { MobileApiError, MOBILE_API_VERSION } from "./mobile-api-v1.js";
import { getPlayerDraftHistory } from "./draft-analytics.js";
import { buildPlayerIntelligence } from "./player-intelligence.js";
import { playerProfileFromLeaderboardsCore } from "./player-presentation.js";
import { playerTournamentPerformance } from "./player-round-performance.js";
import { addTournamentRanks } from "./rankings.js";
import { buildCanonicalRecordHolderAuthority } from "./record-holder-authority.js";
import { requireSecondaryHistoryReadSource } from "./secondary-history-read-source.js";
import { requireDraftReadSource } from "./draft-read-source.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

export const MOBILE_PASSPORT_CONTRACT_VERSION = "mobile-passport-v1";
export const MOBILE_PASSPORT_LIMITS = Object.freeze({
  captainSeasons: 64,
  draftHistory: 64,
  formatMatches: 128,
  recordsHeld: 64,
  responseBytes: 131_072,
  topPartners: 8,
  tournamentHistory: 64,
});

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const FORMATS = new Set(["BB", "SC", "SI"]);
const OUTCOMES = new Set(["win", "loss", "half", "unknown"]);
const CAPTAIN_RESULTS = new Map([
  ["CHAMPION", "Champion"],
  ["RUNNER-UP", "Runner-Up"],
  ["COMPLETED", "Completed"],
  ["UPCOMING", "Upcoming"],
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_ASSET_KEY = /^[A-Za-z0-9][A-Za-z0-9._'-]{0,127}$/;
const YEAR_MINIMUM = 2000;
const YEAR_MAXIMUM = 2200;

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

function requireValue(condition) {
  if (!condition) throw unavailable();
}

function successfulRead(read) {
  if (read?.payload?.ok !== true || !read.payload.data) throw unavailable();
  return read.payload.data;
}

function number(value, { nullable = false, minimum = null, maximum = null } = {}) {
  if (nullable && (value === null || value === undefined || clean(value) === "")) return null;
  const result = Number(value);
  requireValue(
    Number.isFinite(result) &&
    (minimum === null || result >= minimum) &&
    (maximum === null || result <= maximum),
  );
  return result;
}

function integer(value, { nullable = false, minimum = null, maximum = null } = {}) {
  const result = number(value, { nullable, minimum, maximum });
  requireValue(result === null || Number.isSafeInteger(result));
  return result;
}

function nullableInteger(value, minimum = null, maximum = null) {
  return integer(value, { nullable: true, minimum, maximum });
}

function nullableNumber(value, { minimum = null, maximum = null } = {}) {
  return number(value, { nullable: true, minimum, maximum });
}

function year(value, { nullable = false } = {}) {
  return integer(value, { nullable, minimum: YEAR_MINIMUM, maximum: YEAR_MAXIMUM });
}

function yearArray(values, maximum) {
  const result = bounded(values, maximum).map((value) => year(value));
  requireValue(new Set(result).size === result.length);
  return result;
}

function bounded(rows, maximum) {
  requireValue(Array.isArray(rows) && rows.length <= maximum);
  return rows;
}

function text(value, maximum, { nullable = false } = {}) {
  const result = clean(value);
  if (!result && nullable) return null;
  requireValue(result && result.length <= maximum);
  return result;
}

function identifier(value, { nullable = false } = {}) {
  const result = clean(value);
  if (!result && nullable) return null;
  requireValue(SAFE_ID.test(result));
  return result;
}

function recordDto(record = {}) {
  const recordedPointMatches = integer(record.recordedPointMatches ?? 0, { minimum: 0 });
  return {
    wins: integer(record.wins ?? 0, { minimum: 0 }),
    losses: integer(record.losses ?? 0, { minimum: 0 }),
    halves: integer(record.halves ?? 0, { minimum: 0 }),
    matches: integer(record.matches ?? 0, { minimum: 0 }),
    points: recordedPointMatches > 0 ? number(record.points ?? 0) : null,
    recordedPointMatches,
  };
}

function segmentRecordDto(record = {}) {
  return {
    won: integer(record.won ?? 0, { minimum: 0 }),
    lost: integer(record.lost ?? 0, { minimum: 0 }),
    halved: integer(record.halved ?? 0, { minimum: 0 }),
  };
}

function playerReferenceDto(player = {}) {
  const playerId = identifier(player.id || player.playerId || player["Player ID"]);
  return {
    playerId,
    displayName: text(player.name || player.displayName || player["Display Name"] || playerId, 160),
  };
}

function teamDto(team = {}, { side = null } = {}) {
  const name = clean(team.name || team.teamName || team["Team Names"]);
  if (!name) return null;
  const sideValue = nullableInteger(side ?? team.sideNumber ?? clean(team.side).replace(/\D/g, ""), 1);
  requireValue(sideValue === null || [1, 2].includes(sideValue));
  return {
    teamId: identifier(team.id || team.teamId || team["Team ID"], { nullable: true }),
    name: text(name, 160),
    side: sideValue,
  };
}

function careerYearsDto(player = {}, stats = {}) {
  const appearanceYears = (stats.appearances || []).map(Number).filter(Number.isSafeInteger);
  const projectedYear = (value, fallback) => {
    if (!clean(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
  };
  const first = year(projectedYear(
    player["First Year"], appearanceYears.length ? Math.min(...appearanceYears) : null,
  ), { nullable: true });
  const last = year(projectedYear(
    player["Last Year"], appearanceYears.length ? Math.max(...appearanceYears) : null,
  ), { nullable: true });
  requireValue(first === null || last === null || first <= last);
  return { firstYear: first, lastYear: last, current: player.active === true };
}

function portraitAssetKey(value) {
  const result = clean(value);
  if (!result) return null;
  requireValue(SAFE_ASSET_KEY.test(result) && !result.includes(".."));
  return result;
}

function formatCode(value) {
  const result = ({
    "BEST BALL": "BB",
    "SCRAMBLE": "SC",
    "SINGLES": "SI",
  })[upper(value)] || upper(value);
  requireValue(FORMATS.has(result));
  return result;
}

function captainResult(value) {
  const result = CAPTAIN_RESULTS.get(upper(value));
  requireValue(result);
  return result;
}

function currentRoundStatus(value) {
  const status = upper(value);
  if (status === "FINAL") return "completed";
  if (["LIVE", "OPEN"].includes(status)) return "inProgress";
  if (status === "PENDING") return "scheduled";
  throw unavailable();
}

function currentTournamentDto(leaders = {}, identity = {}) {
  const canonicalPlayer = (leaders.players || []).find((row) => clean(row.id) === clean(identity.playerId));
  const tournamentId = identifier(leaders.tournament?.id);
  requireValue(canonicalPlayer && tournamentId && tournamentId === clean(identity.tournamentId));
  requireValue([1, 2].includes(Number(canonicalPlayer.teamSide)));
  const passport = playerProfileFromLeaderboardsCore(leaders, identity);
  const performance = playerTournamentPerformance(leaders, passport);
  const tournament = leaders.tournament || {};
  const canonicalTeam = Number(canonicalPlayer.teamSide) === 1 ? tournament.teamOne : tournament.teamTwo;
  const roundDefinitions = new Map((leaders.rounds || []).map((round) => [Number(round.number), round]));
  const rounds = bounded(performance.rounds, 18).map((round) => {
    const definition = roundDefinitions.get(Number(round.round));
    requireValue(definition);
    const rank = nullableInteger(round.roundRank, 1);
    return {
      roundNumber: integer(round.round, { minimum: 1 }),
      format: formatCode(definition.format || round.format),
      status: currentRoundStatus(round.status),
      throughHole: nullableInteger(round.thru, 1, 18),
      holesPlayed: integer(round.holes ?? 0, { minimum: 0, maximum: 18 }),
      scoringEntity: formatCode(definition.format || round.format) === "SC" ? "team" : "player",
      gross: nullableNumber(round.gross),
      net: nullableNumber(round.net),
      rank,
      tied: rank !== null && /^T/i.test(clean(round.roundRankLabel)),
      points: nullableNumber(round.points),
    };
  });
  const snapshot = performance.snapshot;
  return {
    tournamentId,
    name: text(tournament.name || tournamentId, 160),
    year: year(tournament.year, { nullable: true }),
    status: text(tournament.status, 64, { nullable: true }),
    currentRound: clean(tournament.currentRound) && Number.isSafeInteger(Number(tournament.currentRound))
      ? integer(tournament.currentRound, { minimum: 1 })
      : null,
    tournamentHandicap: nullableNumber(passport.player.tournamentHandicap),
    team: teamDto(canonicalTeam, { side: canonicalPlayer.teamSide }),
    record: snapshot ? {
      wins: integer(snapshot.record?.wins ?? 0, { minimum: 0 }),
      losses: integer(snapshot.record?.losses ?? 0, { minimum: 0 }),
      halves: integer(snapshot.record?.halves ?? 0, { minimum: 0 }),
      points: number(snapshot.points ?? 0),
    } : null,
    standing: snapshot ? nullableInteger(snapshot.standing, 1) : null,
    teamStanding: performance.summary ? nullableInteger(performance.summary.teamStanding, 1) : null,
    rounds,
  };
}

function holePerformanceDto(hole = {}) {
  return {
    sample: {
      completeScorecards: integer(hole.sample?.completeScorecards ?? 0, { minimum: 0 }),
      scoringHoles: integer(hole.sample?.scoringHoles ?? 0, { minimum: 0 }),
      matchPlayHoles: integer(hole.sample?.matchPlayHoles ?? 0, { minimum: 0 }),
    },
    totalHolesPlayed: integer(hole.totalHolesPlayed ?? 0, { minimum: 0 }),
    holesWon: integer(hole.holesWon ?? 0, { minimum: 0 }),
    holesLost: integer(hole.holesLost ?? 0, { minimum: 0 }),
    holesHalved: integer(hole.holesHalved ?? 0, { minimum: 0 }),
    holeDifferential: integer(hole.holeDifferential ?? 0),
    frontNineHolesWon: integer(hole.frontNineHolesWon ?? 0, { minimum: 0 }),
    backNineHolesWon: integer(hole.backNineHolesWon ?? 0, { minimum: 0 }),
    closingHolesWon: integer(hole.closingHolesWon ?? 0, { minimum: 0 }),
    birdies: integer(hole.birdies ?? 0, { minimum: 0 }),
    eagles: integer(hole.eagles ?? 0, { minimum: 0 }),
    pars: integer(hole.pars ?? 0, { minimum: 0 }),
    bogeys: integer(hole.bogeys ?? 0, { minimum: 0 }),
    doubleBogeysOrWorse: integer(hole.doubleBogeysOrWorse ?? 0, { minimum: 0 }),
    averageGrossScore: nullableNumber(hole.averageGrossScore),
    averageNetScore: nullableNumber(hole.averageNetScore),
    averagePar3Score: nullableNumber(hole.averagePar3Score),
    averagePar4Score: nullableNumber(hole.averagePar4Score),
    averagePar5Score: nullableNumber(hole.averagePar5Score),
    averageFrontNineScore: nullableNumber(hole.averageFrontNineScore),
    averageBackNineScore: nullableNumber(hole.averageBackNineScore),
    birdieRate: nullableNumber(hole.birdieRate, { minimum: 0, maximum: 100 }),
    parRate: nullableNumber(hole.parRate, { minimum: 0, maximum: 100 }),
    bogeyRate: nullableNumber(hole.bogeyRate, { minimum: 0, maximum: 100 }),
    doubleBogeyOrWorseRate: nullableNumber(hole.doubleBogeyOrWorseRate, { minimum: 0, maximum: 100 }),
  };
}

function progressionDto(value = {}) {
  return {
    matches: integer(value.matches ?? 0, { minimum: 0 }),
    largestLeadHeld: integer(value.largestLeadHeld ?? 0, { minimum: 0 }),
    largestComebackCompleted: integer(value.largestComebackCompleted ?? 0, { minimum: 0 }),
    matchesWonAfterTrailing: integer(value.matchesWonAfterTrailing ?? 0, { minimum: 0 }),
    largestLeadBlown: integer(value.largestLeadBlown ?? 0, { minimum: 0 }),
    mostLeadChangesExperienced: integer(value.mostLeadChangesExperienced ?? 0, { minimum: 0 }),
    totalLeadChangesExperienced: integer(value.totalLeadChangesExperienced ?? 0, { minimum: 0 }),
    mostConsecutiveHolesWon: integer(value.mostConsecutiveHolesWon ?? 0, { minimum: 0 }),
    mostConsecutiveHolesLost: integer(value.mostConsecutiveHolesLost ?? 0, { minimum: 0 }),
    mostClosingHolesWon: integer(value.mostClosingHolesWon ?? 0, { minimum: 0 }),
    totalClosingHolesWon: integer(value.totalClosingHolesWon ?? 0, { minimum: 0 }),
    frontNine: segmentRecordDto(value.frontNine),
    backNine: segmentRecordDto(value.backNine),
    closing: segmentRecordDto(value.closing),
  };
}

function tournamentHistoryDto(rows = [], stats = {}, calculations = {}, captainLegacy = {}) {
  const captainYears = new Set((captainLegacy.seasons || []).map((row) => Number(row.year)));
  return bounded(rows, MOBILE_PASSPORT_LIMITS.tournamentHistory).map((row) => {
    const historyYear = year(row.year);
    const tournament = calculations.getTournament(historyYear) || {};
    const finish = ({
      "CHAMPION": "champion",
      "RUNNER-UP": "runnerUp",
      "COMPLETED": "completed",
      "UPCOMING": "upcoming",
    })[upper(row.finish)];
    requireValue(finish);
    const honors = [
      (stats.championships || []).includes(historyYear) ? "champion" : null,
      (stats.sandbaggerOfYearYears || []).includes(historyYear) ? "sandbaggerOfYear" : null,
      (stats.pointsChampionYears || []).includes(historyYear) ? "pointsChampion" : null,
    ].filter(Boolean);
    const candidateTeams = Array.isArray(tournament.teams) ? tournament.teams : [];
    const canonicalTeam = candidateTeams.find((team) => clean(team.name) === clean(row.teamName));
    return {
      tournamentId: identifier(tournament.id || tournament["Tournament ID"] || historyYear),
      year: historyYear,
      team: row.teamName ? teamDto(canonicalTeam || { name: row.teamName }) : null,
      result: finish,
      record: recordDto(row.record),
      points: row.pointsRecorded === true ? number(row.points ?? 0) : null,
      averageScore: nullableNumber(row.averageScore),
      scorecardSample: integer(row.scorecardSample ?? 0, { minimum: 0 }),
      wasCaptain: captainYears.has(historyYear),
      honors,
    };
  });
}

function historicalTeamDto(team = {}) {
  return teamDto(team, { side: clean(team.side).replace(/\D/g, "") });
}

function formatMatchDto(match = {}) {
  const outcome = clean(match.outcome).toLowerCase();
  const matchId = identifier(match.id);
  requireValue(FORMATS.has(upper(match.format)) && OUTCOMES.has(outcome));
  const winnerSide = nullableInteger(match.winnerSide, 0);
  requireValue(winnerSide === null || [0, 1, 2].includes(winnerSide));
  return {
    matchId,
    year: year(match.year),
    roundNumber: integer(match.round, { minimum: 1 }),
    matchNumber: nullableInteger(match.matchNumber, 1),
    outcome,
    partner: bounded(match.partner || [], 3).map(playerReferenceDto),
    opponents: bounded(match.opponents || [], 4).map(playerReferenceDto),
    team: historicalTeamDto(match.team),
    opposingTeam: historicalTeamDto(match.opposingTeam),
    winner: text(match.winner, 160, { nullable: true }),
    winnerSide,
    course: match.course ? {
      courseId: identifier(match.course.id, { nullable: true }),
      name: text(match.course.name, 160, { nullable: true }) || "",
    } : null,
    segments: bounded(match.segments || [], 3).map((segment) => {
      const side = nullableInteger(segment.side, 0);
      requireValue(side === null || [0, 1, 2].includes(side));
      return {
        label: text(segment.label, 80),
        winner: text(segment.winner, 160, { nullable: true }),
        winnerSide: side,
      };
    }),
  };
}

function formatPerformanceDto(intelligence = {}, histories = {}) {
  const total = Object.values(histories).reduce((sum, value) => sum + (value?.matches?.length || 0), 0);
  requireValue(total <= MOBILE_PASSPORT_LIMITS.formatMatches);
  requireValue(Array.isArray(intelligence.formats) && intelligence.formats.length === 3);
  return intelligence.formats.map((format) => {
    const code = formatCode(format.code);
    const history = histories[code];
    requireValue(history && history.consistent === true);
    return {
      format: code,
      label: text(format.label, 80),
      scoringLabel: text(format.scoringLabel, 80),
      record: recordDto(format.record),
      winPercentage: number(format.winPercentage ?? 0, { minimum: 0, maximum: 100 }),
      scoringAverage: nullableNumber(format.scoringAverage),
      scoringSample: integer(format.scoringSample ?? 0, { minimum: 0 }),
      firstYear: year(history.firstYear, { nullable: true }),
      latestYear: year(history.latestYear, { nullable: true }),
      matches: (history.matches || []).map(formatMatchDto),
    };
  });
}

function captainLegacyDto(value = {}) {
  return {
    record: recordDto(value.record),
    championships: integer(value.championships ?? 0, { minimum: 0 }),
    seasons: bounded(value.seasons || [], MOBILE_PASSPORT_LIMITS.captainSeasons).map((season) => ({
      year: year(season.year),
      team: teamDto({ name: season.teamName }, { side: clean(season.teamSide).replace(/\D/g, "") }),
      result: captainResult(season.result),
    })),
  };
}

function rankDto(value) {
  const label = clean(value);
  const parsed = Number(label.replace(/^T/i, ""));
  requireValue(Number.isSafeInteger(parsed) && parsed > 0);
  return { rank: parsed, tied: /^T/i.test(label) };
}

function topPartnersDto(rows = []) {
  return addTournamentRanks(rows.slice(0, MOBILE_PASSPORT_LIMITS.topPartners), (row) => row.record.points)
    .map((row) => ({ ...rankDto(row.tournamentRank), player: playerReferenceDto(row.player), record: recordDto(row.record) }));
}

function biggestRivalDto(value) {
  return value ? { player: playerReferenceDto(value.player), record: recordDto(value.record) } : null;
}

function draftHistoryDto(rows = []) {
  return bounded(rows, MOBILE_PASSPORT_LIMITS.draftHistory).map((row) => ({
    year: year(row.year),
    pick: integer(row.pick, { minimum: 1 }),
    teamName: text(row.team, 160),
    finish: nullableInteger(row.finish, 1),
    draftValueScore: nullableNumber(row.dvs),
  }));
}

function careerDto({ player, stats, calculations, secondaryHistory, draftHistory, officialRecords, officialLeaderboards }) {
  requireValue(Array.isArray(officialRecords?.all));
  requireValue(Array.isArray(officialLeaderboards));
  const playerNames = Object.fromEntries(officialRecords.all.map((row) => [
    clean(row.player?.["Player ID"]), clean(row.player?.["Display Name"]),
  ]));
  const scorecards = secondaryHistory.scorecardAnalytics?.canonicalCareerScorecards;
  requireValue(Array.isArray(scorecards));
  const recordAuthority = buildCanonicalRecordHolderAuthority({
    officialLeaderboards,
    scorecards,
    playerNames,
    ghostMatchExclusions: secondaryHistory.scorecardAnalytics?.ghostMatchExclusions || new Set(),
  });
  const recordsHeld = recordAuthority.recordsHeldForPlayer(player["Player ID"]);
  requireValue(recordsHeld.length <= MOBILE_PASSPORT_LIMITS.recordsHeld);
  const intelligence = buildPlayerIntelligence({
    playerId: player["Player ID"],
    stats,
    allPlayerStats: officialRecords.all,
    officialRecords,
    scorecards,
    ghostMatchExclusions: secondaryHistory.scorecardAnalytics?.ghostMatchExclusions || new Set(),
    recordsHeld,
  });
  const histories = calculations.getPlayerFormatMatchHistory(player["Player ID"], stats.records);
  const captainLegacy = calculations.getCaptainLegacy(player["Player ID"]);
  requireValue(Array.isArray(intelligence.rankingRows) && intelligence.rankingRows.length === 6);
  return {
    summary: {
      record: recordDto(stats.records.overall),
      winPercentage: number(stats.percentages.overall ?? 0, { minimum: 0, maximum: 100 }),
      appearances: integer(stats.appearances?.length ?? 0, { minimum: 0 }),
      championships: integer(stats.championships?.length ?? 0, { minimum: 0 }),
      runnerUpFinishes: integer(intelligence.official.runnerUps ?? 0, { minimum: 0 }),
      averageHandicap: nullableNumber(stats.averageHandicap),
    },
    honors: {
      championshipYears: yearArray(stats.championships || [], 64),
      sandbaggerOfYearYears: yearArray(stats.sandbaggerOfYearYears || [], 64),
      pointsChampionYears: yearArray(stats.pointsChampionYears || [], 64),
      boardOfGovernors: player.boardOfGovernors === true,
      handicapCommittee: player.handicapCommittee === true,
    },
    rankings: bounded(intelligence.rankingRows || [], 6).map((row) => ({
      metric: clean(row.key),
      rank: nullableInteger(row.rank, 1),
    })),
    holePerformance: holePerformanceDto(intelligence.hole),
    matchProgression: progressionDto(intelligence.progression),
    tournamentHistory: tournamentHistoryDto(intelligence.tournamentHistory, stats, calculations, captainLegacy),
    formatPerformance: formatPerformanceDto(intelligence, histories),
    recordsHeld: recordsHeld.map((record) => ({
      recordId: identifier(record.slug),
      title: text(record.title, 240),
    })),
    captainLegacy: captainLegacyDto(captainLegacy),
    biggestRival: biggestRivalDto(stats.biggestRival),
    draftHistory: draftHistoryDto(draftHistory),
    topPartners: topPartnersDto(stats.partners || []),
  };
}

export function mobilePassportDataFromCanonical({
  identity,
  secondaryHistory,
  leaders,
  drafts = [],
  officialLeaderboards = [],
} = {}) {
  const playerId = identifier(identity?.playerId);
  const tournamentId = identifier(identity?.tournamentId);
  requireValue(secondaryHistory?.source === "supabase" && secondaryHistory?.calculations);
  requireValue(clean(leaders?.tournament?.id) === tournamentId && leaders?.slotVerification?.pass !== false);
  const canonicalTournamentPlayer = (leaders.players || []).find((row) => clean(row.id) === playerId);
  requireValue(canonicalTournamentPlayer && [1, 2].includes(Number(canonicalTournamentPlayer.teamSide)));
  const calculations = secondaryHistory.calculations;
  const player = calculations.getPlayerMap()?.[playerId];
  requireValue(player && clean(player["Player ID"]) === playerId);
  const officialRecords = calculations.getRecords();
  const stats = officialRecords?.all?.find((row) => clean(row.player?.["Player ID"]) === playerId)?.stats;
  requireValue(stats);
  const draftHistory = getPlayerDraftHistory(drafts, playerId, { history: calculations });
  const canonicalTeam = Number(canonicalTournamentPlayer.teamSide) === 1
    ? leaders.tournament?.teamOne : leaders.tournament?.teamTwo;
  const data = {
    contractVersion: MOBILE_PASSPORT_CONTRACT_VERSION,
    player: {
      playerId,
      displayName: text(player["Display Name"] || canonicalTournamentPlayer.name || identity.displayName || playerId, 160),
      active: player.active === true,
      careerYears: careerYearsDto(player, stats),
      portraitAssetKey: portraitAssetKey(player["Photo Filename"] || canonicalTournamentPlayer.photo),
      team: teamDto(canonicalTeam, { side: canonicalTournamentPlayer.teamSide }),
    },
    currentTournament: currentTournamentDto(leaders, identity),
    career: careerDto({
      player,
      stats,
      calculations,
      secondaryHistory,
      draftHistory,
      officialRecords,
      officialLeaderboards,
    }),
  };
  requireValue(data.player.active && Buffer.byteLength(JSON.stringify(data), "utf8") <= MOBILE_PASSPORT_LIMITS.responseBytes);
  return data;
}

export function mobilePassportRepresentationRevision(data = {}) {
  return scoringShadowPayloadHash({ product: MOBILE_PASSPORT_CONTRACT_VERSION, data });
}

function requireSupabase(check) {
  try {
    const state = check();
    if (state?.resolved !== "supabase") throw unavailable();
  } catch {
    throw unavailable();
  }
}

export async function mobilePassportResult(identity, {
  env = process.env,
  now = new Date(),
  dependencies = {},
} = {}) {
  requireSupabase(() => (dependencies.requireSecondaryHistoryReadSource || requireSecondaryHistoryReadSource)(env));
  requireSupabase(() => (dependencies.requireLeaderboardsCoreReadSource || requireLeaderboardsCoreReadSource)(env));
  requireSupabase(() => (dependencies.requireDraftReadSource || requireDraftReadSource)(env));
  try {
    const readLeaders = dependencies.readLeaderboardsCoreView || readLeaderboardsCoreView;
    const leadersReadPromise = readLeaders(identity?.tournamentId, { env });
    const loadCareer = dependencies.loadMobileCareerAuthority ||
      (await import("./mobile-v1-career-authority.js")).loadMobileCareerAuthority;
    const [secondaryHistory, leadersRead] = await Promise.all([
      loadCareer(identity, {
        env,
        dependencies: dependencies.careerAuthorityDependencies,
        leaderboardsRead: leadersReadPromise,
      }),
      leadersReadPromise,
    ]);
    const readDrafts = dependencies.getPlayerDrafts || (await import("./draft.js")).getPlayerDrafts;
    const drafts = await readDrafts(identity?.playerId, { env, history: secondaryHistory.calculations });
    const leaders = (dependencies.leaderboardsCoreDataFromSupabaseView || leaderboardsCoreDataFromSupabaseView)(
      successfulRead(leadersRead), { includeCurrentMatchLifecycle: true },
    );
    const officialRecords = secondaryHistory.calculations.getRecords();
    let officialLeaderboards;
    if (dependencies.officialLeaderboardsFromRecords) {
      officialLeaderboards = dependencies.officialLeaderboardsFromRecords(officialRecords);
    } else {
      const module = await import("./leaderboards.js");
      officialLeaderboards = module.getLeaderboardSlugs().map((slug) =>
        module.getLeaderboardFromRecords(slug, officialRecords));
    }
    const data = mobilePassportDataFromCanonical({
      identity,
      secondaryHistory,
      leaders,
      drafts,
      officialLeaderboards,
    });
    const revision = mobilePassportRepresentationRevision(data);
    const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
    requireValue(Number.isFinite(Date.parse(generatedAt)));
    const body = {
      ok: true,
      apiVersion: MOBILE_API_VERSION,
      data,
      meta: { generatedAt, revision },
    };
    requireValue(Buffer.byteLength(JSON.stringify(body), "utf8") <=
      MOBILE_PASSPORT_LIMITS.responseBytes);
    return {
      status: 200,
      revision,
      body,
    };
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw unavailable();
  }
}
