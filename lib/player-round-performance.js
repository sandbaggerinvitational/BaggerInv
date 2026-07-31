import { roundScoreRows } from "./mobile-leaderboards.js";

const clean = (value) => String(value ?? "").trim();
const numeric = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function ordinal(rank) {
  const value = Number(rank);
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
}

export function grossRankLabel(rank, tied = false) {
  const value = Number(rank);
  if (!Number.isFinite(value) || value < 1) return "";
  const medal = ({ 1: "🥇", 2: "🥈", 3: "🥉" })[value] || "";
  const label = tied ? `T-${value}` : ordinal(value);
  return [medal, label].filter(Boolean).join(" ");
}

function matchOutcome(match) {
  if (!match?.result) return "";
  if (match.result.winner === "Halved") return "Halved";
  return match.result.winner === match.team?.name ? "Won" : "Lost";
}

export function playerRoundPerformance(tournamentData = {}, passportData = {}) {
  const playerId = clean(passportData.player?.id);
  return (tournamentData.rounds || []).map((round) => {
    const standings = roundScoreRows(
      tournamentData.scoreLeaderboard || [],
      round.number,
      round.format,
      { key: "gross", direction: "asc" }
    );
    const score = standings.find((row) => clean(row.id) === playerId || (row.playerIds || []).map(clean).includes(playerId));
    const gross = numeric(score?.gross);
    const tied = gross !== null && standings.filter((row) => numeric(row.gross) === gross).length > 1;
    const officialPoints = (tournamentData.roundLeaderboards?.[round.number] || [])
      .find((row) => clean(row.id) === playerId);
    const roundMatches = (passportData.matches || []).filter((match) => Number(match.round) === Number(round.number));
    const outcomes = roundMatches.map(matchOutcome).filter(Boolean);
    const played = outcomes.length > 0 || gross !== null;
    return {
      round: round.number,
      format: clean(round.format),
      status: played ? "Complete" : round.status || "Upcoming",
      gross,
      grossRank: gross !== null ? score?.displayRank || null : null,
      grossRankLabel: gross !== null ? grossRankLabel(score?.displayRank, tied) : "",
      outcomes,
      points: outcomes.length ? numeric(officialPoints?.points) : null,
    };
  });
}
