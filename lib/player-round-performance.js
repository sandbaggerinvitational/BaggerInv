import { homeFormatLabel, normalizedMatchStatus } from "./player-home.js";
import {
  playerPerformanceRows,
  rankPlayerRows,
  roundCompetitionRows,
  teamStandings,
} from "./mobile-leaderboards.js";

const clean = (value) => String(value ?? "").trim();
const numeric = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const formatCode = (value) => ({
  "BEST BALL": "BB",
  BB: "BB",
  SCRAMBLE: "SC",
  SC: "SC",
  SINGLES: "SI",
  SI: "SI",
})[clean(value).toUpperCase()] || clean(value).toUpperCase();

function ordinal(rank) {
  const value = Number(rank);
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
}

export function competitionRankLabel(rank, tied = false) {
  const value = Number(rank);
  if (!Number.isFinite(value) || value < 1) return "";
  return tied ? `T-${value}` : ordinal(value);
}

function includesPlayer(match = {}, playerId = "") {
  const ids = Array.isArray(match.playerIds)
    ? match.playerIds
    : [...(match.team1Players || []), ...(match.team2Players || [])].map((player) => player?.id);
  return ids.map(clean).includes(clean(playerId));
}

function currentMatchForRound(tournamentData = {}, roundNumber, playerId) {
  const lifecycle = tournamentData.currentMatchLifecycle || tournamentData.rounds || [];
  const round = lifecycle.find((item) => Number(item.round ?? item.number) === Number(roundNumber));
  return (round?.matches || []).find((match) => includesPlayer(match, playerId)) || null;
}

function currentRoundPresentation(match) {
  if (!match) return { status: "Pending", thru: null, final: false };
  const status = normalizedMatchStatus(match);
  if (status === "FINAL") return { status: "Final", thru: null, final: true };
  if (status === "LIVE") return { status: "Live", thru: numeric(match.currentHole), final: false };
  if (status === "OPEN") return { status: "Open", thru: null, final: false };
  return { status: "Pending", thru: null, final: false };
}

export function playerRoundPerformance(tournamentData = {}, passportData = {}) {
  const playerId = clean(passportData.player?.id);
  return [...(tournamentData.rounds || [])].sort((left, right) => Number(left.number) - Number(right.number)).map((round) => {
    const competitionRows = roundCompetitionRows(
      tournamentData.scoreLeaderboard || [],
      round.number,
      round.format,
      tournamentData.roundLeaderboards?.[round.number] || [],
      round.matches || []
    );
    const competition = competitionRows.find((row) => clean(row.id) === playerId || (row.playerIds || []).map(clean).includes(playerId));
    const score = competition;
    const holes = numeric(score?.holes) || 0;
    const played = holes > 0 || numeric(score?.gross) > 0 || numeric(score?.net) > 0;
    const lifecycle = currentRoundPresentation(currentMatchForRound(tournamentData, round.number, playerId));
    const gross = played ? numeric(score?.gross) : null;
    const net = played ? numeric(score?.net) : null;
    const roundRank = played && numeric(score?.netToPar) !== null ? numeric(score?.displayRank) : null;
    const tied = roundRank !== null && competitionRows.filter((row) => numeric(row.displayRank) === roundRank).length > 1;
    const code = formatCode(round.format);
    const pairing = code === "SC";
    const individualPoints = pairing
      ? numeric((competition?.playerPoints || []).find((row) => clean(row.playerId) === playerId)?.points)
      : numeric(competition?.points);
    return {
      round: round.number,
      format: homeFormatLabel(round.format),
      status: lifecycle.status,
      thru: lifecycle.thru,
      holes,
      gross,
      grossLabel: pairing ? "Team Gross" : "Gross",
      net,
      netLabel: pairing ? "Team Net" : "Net",
      roundRank,
      roundRankLabel: competitionRankLabel(roundRank, tied),
      points: lifecycle.final ? individualPoints : null,
    };
  });
}

export function playerTournamentSummary(tournamentData = {}, passportData = {}) {
  const playerId = clean(passportData.player?.id);
  const rankedPlayers = rankPlayerRows(
    playerPerformanceRows(tournamentData.leaderboard || [], tournamentData.scoreLeaderboard || [], tournamentData.rounds || []),
    "points"
  );
  const playerStanding = rankedPlayers.find((row) => clean(row.id) === playerId);
  const hasOfficialResult = Number(playerStanding?.matchesPlayed) > 0;
  const teamRows = teamStandings(tournamentData.rounds || [], tournamentData.tournament || {}, "overall");
  const playerTeam = teamRows.find((row) => Number(row.side) === Number(playerStanding?.teamSide)) ||
    teamRows.find((row) => clean(row.name) === clean(passportData.player?.teamName));
  const teamTied = hasOfficialResult && playerTeam && teamRows.filter((row) => numeric(row.points) === numeric(playerTeam.points)).length > 1;
  const snapshot = hasOfficialResult ? {
    record: {
      wins: Number(playerStanding.wins) || 0,
      losses: Number(playerStanding.losses) || 0,
      halves: Number(playerStanding.halves) || 0,
    },
    points: numeric(playerStanding.points) ?? 0,
    standing: numeric(playerStanding.displayRank),
  } : null;
  return {
    snapshot,
    summary: hasOfficialResult ? {
      teamStanding: numeric(playerTeam?.rank),
      teamStandingLabel: competitionRankLabel(playerTeam?.rank, teamTied),
    } : null,
  };
}

export function playerTournamentPerformance(tournamentData = {}, passportData = {}) {
  return {
    ...playerTournamentSummary(tournamentData, passportData),
    rounds: playerRoundPerformance(tournamentData, passportData),
  };
}
