import { homeFormatLabel } from "./player-home.js";
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
    const roundMatches = (passportData.matches || []).filter((match) => Number(match.round) === Number(round.number));
    const holes = numeric(score?.holes) || 0;
    const played = holes > 0 || numeric(score?.gross) > 0 || numeric(score?.net) > 0;
    const final = competition?.officialFinal === true || roundMatches.some((match) => Boolean(match.result) || /^(final|finalized|complete|completed)$/i.test(clean(match.status)));
    const roundFinal = /^(final|finalized|complete|completed)$/i.test(clean(round.status));
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
      status: !played && (final || roundFinal) ? "Not played" : final ? "Final" : played ? "Live" : "Pending",
      holes,
      gross,
      grossLabel: pairing ? "Team Gross" : "Gross",
      net,
      netLabel: pairing ? "Team Net" : "Net",
      roundRank,
      roundRankLabel: competitionRankLabel(roundRank, tied),
      points: final ? individualPoints : null,
    };
  });
}

export function playerTournamentPerformance(tournamentData = {}, passportData = {}) {
  const playerId = clean(passportData.player?.id);
  const rankedPlayers = rankPlayerRows(
    playerPerformanceRows(tournamentData.leaderboard || [], tournamentData.scoreLeaderboard || [], tournamentData.rounds || []),
    "points"
  );
  const playerStanding = rankedPlayers.find((row) => clean(row.id) === playerId);
  const hasOfficialResult = Number(playerStanding?.matchesPlayed) > 0;
  const pointsTied = hasOfficialResult && rankedPlayers.filter((row) => numeric(row.points) === numeric(playerStanding.points)).length > 1;
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
      points: snapshot.points,
      individualRank: snapshot.standing,
      individualRankLabel: competitionRankLabel(snapshot.standing, pointsTied),
      teamStanding: numeric(playerTeam?.rank),
      teamStandingLabel: competitionRankLabel(playerTeam?.rank, teamTied),
    } : null,
    rounds: playerRoundPerformance(tournamentData, passportData),
  };
}
