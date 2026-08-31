import { buildCompletedHistoryPresentation } from "./completed-history-presentation-adapter.js";
import { MOBILE_API_VERSION, MobileApiError } from "./mobile-api-v1.js";
import { readMobilePreviewParticipantContent } from "./mobile-v1-participant-content-authority.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

const FIRST_YEAR = 2017;
const CURRENT_YEAR = 2026;
const clean = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const MOBILE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DECIMAL_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
export const MOBILE_HISTORY_LIMITS = Object.freeze({
  archiveResponseBytes: 262_144,
  detailResponseBytes: 1_048_576,
});

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

function requireValue(condition) {
  if (!condition) throw unavailable();
}

function number(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && clean(value) === "") return null;
  requireValue(typeof value === "number" || typeof value === "string");
  if (typeof value === "string") requireValue(DECIMAL_NUMBER.test(clean(value)));
  const result = Number(value);
  requireValue(Number.isFinite(result));
  return result;
}

function boundedList(value, maximum, minimum = 0) {
  const result = list(value);
  requireValue(result.length >= minimum && result.length <= maximum);
  return result;
}

function boundedInteger(value, minimum, maximum) {
  const result = number(value);
  if (result === null) return null;
  requireValue(Number.isSafeInteger(result) && result >= minimum && result <= maximum);
  return result;
}

function timestamp(now) {
  const result = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  requireValue(Number.isFinite(Date.parse(result)));
  return result;
}

function optionalDate(value) {
  const result = clean(value);
  if (!result) return null;
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(result));
  const parsed = new Date(`${result}T00:00:00.000Z`);
  requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result);
  return result;
}

function supportedYear(value) {
  const raw = String(value ?? "");
  requireValue(/^\d{4}$/.test(raw));
  const result = Number(raw);
  requireValue(Number.isSafeInteger(result) && result >= FIRST_YEAR && result <= CURRENT_YEAR);
  return result;
}

function status(value, complete = false) {
  const normalized = clean(value).toUpperCase();
  const result = ["FINAL", "COMPLETE", "COMPLETED"].includes(normalized) ? "final"
    : ["UPCOMING", "SCHEDULED"].includes(normalized) ? "upcoming"
      : ["LIVE", "IN_PROGRESS", "IN PROGRESS", "INPROGRESS"].includes(normalized)
        ? "inProgress" : null;
  requireValue(result !== null && (!complete || result === "final"));
  return result;
}

function requireText(value, maximum, { nullable = false } = {}) {
  if (value === null && nullable) return;
  requireValue(typeof value === "string" && (nullable || value.length > 0) && value.length <= maximum);
}

function requireSummaryContract(value) {
  requireValue(MOBILE_ID.test(value.tournamentId));
  requireText(value.name, 200);
  requireText(value.editionTitle, 200, { nullable: true });
  requireText(value.destination, 240, { nullable: true });
  requireText(value.revision, 128);
  if (value.finalScore) requireText(value.finalScore.label, 160);
  return value;
}

function teamRef(value = {}, fallbackSide = null) {
  const side = number(value.sideNumber ?? value.teamSide ?? value.team_side ?? value.side ?? fallbackSide);
  const teamId = clean(value.id ?? value.teamId ?? value.team_id);
  const name = clean(value.name ?? value.teamName ?? teamId);
  requireValue(MOBILE_ID.test(teamId) && name && name.length <= 160 && [1, 2].includes(side));
  return { teamId, name, side, points: number(value.points) };
}

function archiveSummary(row = {}) {
  const tournament = row.tournament || {};
  const year = supportedYear(row.tournament_year);
  const teams = boundedList(row.teams, 2, 2).map((team) => teamRef(team)).sort((left, right) => left.side - right.side);
  requireValue(teams.length === 2 && new Set(teams.map((team) => team.teamId)).size === 2);
  teams[0].points = number(tournament.official_team_1_points);
  teams[1].points = number(tournament.official_team_2_points);
  const championSide = number(tournament.champion_team_side);
  const championId = clean(tournament.champion_team_id);
  const champion = teams.find((team) => team.teamId === championId || team.side === championSide) || null;
  const runnerUp = champion ? teams.find((team) => team.teamId !== champion.teamId) || null : null;
  return requireSummaryContract({
    tournamentId: clean(row.tournament_id || year),
    year,
    name: clean(tournament.name || `${year} Bagger Invitational`),
    editionTitle: null,
    destination: clean(tournament.destination) || null,
    startDate: optionalDate(tournament.start_date),
    endDate: optionalDate(tournament.end_date),
    status: status(tournament.lifecycle, true),
    teams,
    champion,
    runnerUp,
    finalScore: teams.every((team) => team.points !== null) ? {
      teamOnePoints: teams[0].points,
      teamTwoPoints: teams[1].points,
      label: `${teams[0].points} - ${teams[1].points}`,
    } : null,
    detailAvailable: true,
    revision: clean(row.revision_id),
  });
}

function roundsFor(view = {}) {
  return boundedList(view.rounds, 8).map((value) => value?.archive || value);
}

function viewTeams(view = {}) {
  return boundedList(view.teams?.length ? view.teams : view.tournament?.teams, 2, 2)
    .map((team) => teamRef(team))
    .sort((left, right) => left.side - right.side);
}

function overallPoints(view, side) {
  const values = roundsFor(view).map((round) => number(side === 1 ? round.teamOne?.points : round.teamTwo?.points));
  return values.length && values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + value, 0) : null;
}

function summaryFromView(view = {}) {
  const tournament = view.tournament || {};
  const year = supportedYear(view.year ?? tournament.year ?? tournament.Year);
  const teams = viewTeams(view);
  requireValue(teams.length === 2 && new Set(teams.map((team) => team.teamId)).size === 2);
  teams[0].points = overallPoints(view, 1);
  teams[1].points = overallPoints(view, 2);
  const lifecycle = status(tournament.lifecycle, tournament.complete === true);
  const championId = clean(tournament.championTeamId || tournament.championTeam?.id);
  const champion = lifecycle === "final"
    ? teams.find((team) => team.teamId === championId) || null : null;
  const runnerUpId = clean(tournament.runnerUpTeamId || tournament.runnerUpTeam?.id);
  const runnerUp = lifecycle === "final" ? teams.find((team) => team.teamId === runnerUpId) ||
    (champion ? teams.find((team) => team.teamId !== champion.teamId) : null) || null : null;
  const scoreLabel = clean(tournament["Final Score"] || tournament.finalScore);
  return requireSummaryContract({
    tournamentId: clean(tournament.id || tournament["Tournament ID"] || year),
    year,
    name: clean(tournament["Tournament Name"] || tournament.name || tournament.Tournament || `${year} Bagger Invitational`),
    editionTitle: clean(tournament.editionTitle || tournament.Annual) || null,
    destination: clean(tournament.Destination || tournament.destination) || null,
    startDate: optionalDate(tournament.startDate),
    endDate: optionalDate(tournament.endDate),
    status: lifecycle,
    teams,
    champion,
    runnerUp,
    finalScore: lifecycle === "final" && (scoreLabel || teams.every((team) => team.points !== null)) ? {
      teamOnePoints: teams[0].points,
      teamTwoPoints: teams[1].points,
      label: scoreLabel || `${teams[0].points} - ${teams[1].points}`,
    } : null,
    detailAvailable: true,
    revision: clean(tournament.revisionId || view.revision?.revision_id || view.sourceFingerprint),
  });
}

function playerRef(player = {}) {
  const playerId = clean(player.id || player.playerId || player["Player ID"]);
  const displayName = clean(player.name || player.displayName || player["Display Name"] || playerId);
  requireValue(MOBILE_ID.test(playerId) && displayName && displayName.length <= 160);
  return { playerId, displayName };
}

function courseDto(value = {}) {
  const courseId = clean(value.id || value.courseId || value["Course ID"]);
  const name = clean(value.name || value.Course || value.displayName || courseId);
  if (!courseId && !name) return null;
  requireValue((!courseId || MOBILE_ID.test(courseId)) && (!name || name.length <= 160));
  return {
    courseId: courseId || null,
    name: name || null,
    location: clean(value.location || [value.City, value.State].filter(Boolean).join(", ")) || null,
    tee: clean(value.tee || value["Tee Played"]) || null,
    par: number(value.par ?? value.Par),
    yardage: number(value.yardage ?? value.Yardage),
  };
}

function matchStatus(value = {}) {
  const lifecycle = value.lifecycle === null || value.lifecycle === undefined
    ? value.status : value.lifecycle;
  return status(lifecycle, false);
}

function matchDto(value = {}, scorecards = []) {
  const matchId = clean(value.id || value.matchId || value.match_id);
  requireValue(MOBILE_ID.test(matchId));
  const participants = (side) => boundedList(
    side === 1 ? value.team1Players : value.team2Players, 4,
  ).map(playerRef);
  const teamOnePlayers = participants(1);
  const teamTwoPlayers = participants(2);
  const winner = clean(value.winner || value.matchupWinner || value.overallWinner) || null;
  return {
    matchId,
    matchNumber: boundedInteger(value.matchNumber ?? value.match, 1, 32),
    status: matchStatus(value),
    format: clean(value.format) || null,
    course: courseDto(value.course || {}),
    sides: [
      { side: 1, participants: teamOnePlayers },
      { side: 2, participants: teamTwoPlayers },
    ],
    result: matchStatus(value) === "final" ? {
      summary: clean(value.finalResult) || null,
      winner,
      teamOnePoints: number(value.team1Points),
      teamTwoPoints: number(value.team2Points),
    } : null,
    scorecardIds: boundedList(
      scorecards.filter((card) => card.matchId === matchId), 8,
    ).map((card) => card.scorecardId),
  };
}

function scorecardDto(value = {}, index) {
  const matchId = clean(value.matchId);
  const scoreType = clean(value.scoreType).toUpperCase();
  requireValue(["INDIVIDUAL", "TEAM"].includes(scoreType));
  const playerId = clean(value.playerId) || null;
  const teamId = clean(value.teamId) || null;
  requireValue(MOBILE_ID.test(matchId) && (playerId || teamId) &&
    (!playerId || MOBILE_ID.test(playerId)) && (!teamId || MOBILE_ID.test(teamId)));
  const scorecardId = clean(value.scorecardId) || `${matchId}:${scoreType}:${playerId || teamId}:${index + 1}`;
  return {
    scorecardId,
    matchId,
    entityType: scoreType,
    playerId,
    teamId,
    participantPlayerIds: boundedList(value.participantPlayerIds, 4).map(clean).filter(Boolean),
    status: clean(value.status).toUpperCase() || "MISSING",
    grossTotal: number(value.total),
    netTotal: number(value.netTotal),
    holes: boundedList(value.holes, 18).map((hole) => ({
      holeNumber: boundedInteger(hole.holeNumber, 1, 18),
      grossScore: boundedInteger(hole.score, 1, 20),
      par: boundedInteger(hole.par, 3, 6),
      strokeIndex: boundedInteger(hole.strokeIndex, 1, 18),
      strokesReceived: boundedInteger(hole.strokesAllocated, 0, 6),
      netScore: boundedInteger(hole.netScore, -5, 20),
    })),
  };
}

function teamDetail(value = {}) {
  const base = teamRef(value);
  const roster = boundedList(value.roster, 64).map((row) => {
    const player = playerRef(row.player || row);
    return {
      ...player,
      handicap: number(row.handicap ?? row.tournamentHandicap),
      isCaptain: player.playerId === clean(value.captainId),
    };
  });
  return {
    ...base,
    captain: value.captain ? playerRef(value.captain) : null,
    averageHandicap: number(value.averageHandicap),
    roster,
  };
}

function standingDto(value = {}) {
  const player = playerRef(value.player || value);
  const rank = boundedInteger(value.rank, 1, 128);
  requireValue(rank !== null);
  return {
    rank,
    ...player,
    teamName: clean(value.teamName) || null,
    points: number(value.points),
    wins: number(value.wins),
    losses: number(value.losses),
    ties: number(value.halves ?? value.ties),
  };
}

function requireCourseContract(course) {
  if (!course) return;
  requireText(course.name, 160, { nullable: true });
  requireText(course.location, 240, { nullable: true });
  requireText(course.tee, 80, { nullable: true });
}

function requireDetailContract(data) {
  for (const round of data.rounds) {
    requireText(round.name, 120);
    requireText(round.format, 16, { nullable: true });
    requireCourseContract(round.course);
    requireValue(new Set(round.matchIds).size === round.matchIds.length);
  }
  for (const match of data.matches) {
    requireText(match.format, 16, { nullable: true });
    requireCourseContract(match.course);
    requireValue(new Set(match.scorecardIds).size === match.scorecardIds.length);
    if (match.result) {
      requireText(match.result.summary, 240, { nullable: true });
      requireText(match.result.winner, 160, { nullable: true });
    }
  }
  for (const standing of data.standings) requireText(standing.teamName, 160, { nullable: true });
  for (const award of data.awards) {
    requireText(award.awardId, 160);
    requireText(award.title, 160);
    requireText(award.recipient, 160, { nullable: true });
    requireValue(!award.playerId || MOBILE_ID.test(award.playerId));
  }
  for (const scorecard of data.scorecards) {
    requireText(scorecard.scorecardId, 256);
    requireText(scorecard.status, 32);
    requireValue(new Set(scorecard.participantPlayerIds).size ===
      scorecard.participantPlayerIds.length);
    requireValue(scorecard.participantPlayerIds.every((playerId) => MOBILE_ID.test(playerId)));
  }
  return data;
}

export function mobileHistoryDetailData(view = {}) {
  const tournament = summaryFromView(view);
  const rawScorecards = boundedList(
    view.scorecardAnalytics?.scorecards || view.analytics?.scorecards, 256,
  );
  const scorecards = rawScorecards.map(scorecardDto);
  const matches = boundedList(view.matches, 64).map((match) => matchDto(match, scorecards));
  const matchesById = new Map(matches.map((match) => [match.matchId, match]));
  const rounds = roundsFor(view).map((round) => {
    const roundNumber = boundedInteger(round.round ?? round.roundNumber ?? round.number, 1, 8);
    requireValue(roundNumber !== null);
    const roundMatches = boundedList(round.matches, 32)
      .map((match) => clean(match.id || match.matchId)).filter((id) => matchesById.has(id));
    return {
      roundNumber,
      name: clean(round.name || round.label || `Round ${roundNumber}`),
      status: roundMatches.length && roundMatches.every((id) => matchesById.get(id).status === "final")
        ? "final" : roundMatches.some((id) => matchesById.get(id).status !== "upcoming") ? "inProgress" : "upcoming",
      format: clean(round.format) || null,
      course: courseDto(round.course || {}),
      teamStandings: [
        { ...teamRef(round.teamOne || tournament.teams[0], 1), points: number(round.teamOne?.points) },
        { ...teamRef(round.teamTwo || tournament.teams[1], 2), points: number(round.teamTwo?.points) },
      ],
      matchIds: roundMatches,
    };
  });
  const teams = boundedList(view.teams, 2, 2).map(teamDetail).sort((left, right) => left.side - right.side);
  const standings = boundedList(view.leaderboardRows, 128).map(standingDto);
  const awards = boundedList(view.tournament?.awards, 64).map((award, index) => ({
    awardId: clean(award.awardId || award.Award || `award-${index + 1}`),
    title: clean(award.title || award.Award),
    recipient: clean(award.recipient || award.Winner || award.winnerPlayer?.["Display Name"]) || null,
    playerId: clean(award.winnerPlayer?.["Player ID"]) || null,
  })).filter((award) => award.title);
  return requireDetailContract({ tournament, teams, rounds, matches, standings, awards, scorecards });
}

export function mobileHistoryRepresentationRevision(data = {}) {
  return scoringShadowPayloadHash({ product: "mobile-history-v1", data });
}

function result(data, now, maximumBytes) {
  const revision = mobileHistoryRepresentationRevision(data);
  const body = {
    ok: true,
    apiVersion: MOBILE_API_VERSION,
    data,
    meta: { generatedAt: timestamp(now), revision },
  };
  requireValue(Buffer.byteLength(JSON.stringify(body), "utf8") <= maximumBytes);
  return {
    status: 200,
    revision,
    body,
  };
}

export async function mobileHistoryResult(identity, { env = process.env, now, dependencies = {} } = {}) {
  const readArchive = dependencies.readMobilePreviewParticipantContent || readMobilePreviewParticipantContent;
  const loadCurrent = dependencies.loadHistory2026View ||
    (await import("./history-2026-service.js")).loadHistory2026View;
  let archiveRead;
  let current;
  try {
    [archiveRead, current] = await Promise.all([
      readArchive("HISTORY_ARCHIVE", identity, { env, dependencies }),
      loadCurrent({ env, year: CURRENT_YEAR, tournamentId: identity.tournamentId,
        dependencies: dependencies.currentHistoryDependencies }),
    ]);
  } catch {
    throw unavailable();
  }
  const completed = list(archiveRead?.payload?.data?.completed_years).map(archiveSummary);
  requireValue(completed.length === 9);
  const tournaments = [...completed, summaryFromView(current)]
    .sort((left, right) => right.year - left.year);
  return result({ tournaments }, now, MOBILE_HISTORY_LIMITS.archiveResponseBytes);
}

export async function mobileHistoryDetailResult(identity, yearValue, {
  env = process.env, now, dependencies = {},
} = {}) {
  const year = supportedYear(yearValue);
  const loadCompleted = dependencies.loadCompletedHistoryView || (year === CURRENT_YEAR ? null :
    (await import("./completed-history-service.js")).loadCompletedHistoryView);
  const loadCurrent = dependencies.loadHistory2026View || (year === CURRENT_YEAR ?
    (await import("./history-2026-service.js")).loadHistory2026View : null);
  let view;
  try {
    view = year === CURRENT_YEAR
      ? await loadCurrent({ env, year, tournamentId: identity.tournamentId,
        dependencies: dependencies.currentHistoryDependencies })
      : await loadCompleted({ env, year, dependencies: dependencies.completedHistoryDependencies });
  } catch {
    throw unavailable();
  }
  requireValue(Number(view?.year) === year);
  return result(mobileHistoryDetailData(view), now, MOBILE_HISTORY_LIMITS.detailResponseBytes);
}

export const mobileHistoryTestSupport = Object.freeze({
  archiveSummary,
  summaryFromView,
  scorecardDto,
});
