import { isFinalizedMatch, isLiveMatch } from "./live-tournament.js";

const clean = (value) => String(value ?? "").trim();
const numeric = (value) => {
  if (!clean(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function winnerSide(value) {
  const winner = clean(value).toLowerCase();
  if (["team 1", "team1", "1"].includes(winner)) return 1;
  if (["team 2", "team2", "2"].includes(winner)) return 2;
  if (["halved", "half", "tie", "tied"].includes(winner)) return 0;
  return null;
}

function segmentPoints(winner, side) {
  const winnerValue = winnerSide(winner);
  if (winnerValue === null) return null;
  if (winnerValue === 0) return 0.5;
  return winnerValue === Number(side) ? 1 : 0;
}

function sidePlayers(match, side) {
  return (Number(side) === 1 ? match.team1Players : match.team2Players) || [];
}

function matchPoints(match, side) {
  return numeric(Number(side) === 1 ? match.team1Points : match.team2Points);
}

function officialGroup(match, side) {
  const winner = winnerSide(match.matchupWinner || match.overallWinner);
  if (winner === 0) return "ties";
  if (winner === Number(side)) return "wins";
  if (winner === 1 || winner === 2) return "losses";
  return "inProgress";
}

export function teamRoundRecap(round = {}, side) {
  const singles = ["SI", "SINGLES"].includes(clean(round.format).toUpperCase());
  const matches = round.matches || [];
  const started = matches.some((match) => isFinalizedMatch(match) || isLiveMatch(match));
  const groups = { wins: [], ties: [], losses: [], inProgress: [] };

  if (started) {
    for (const match of matches) {
      const final = isFinalizedMatch(match);
      const live = isLiveMatch(match);
      if (!final && !live && !started) continue;
      const totalPoints = matchPoints(match, side);
      const segments = singles
        ? [{ label: "Overall", points: totalPoints }]
        : [
          { label: "Front 9", points: segmentPoints(match.frontWinner, side) },
          { label: "Back 9", points: segmentPoints(match.backWinner, side) },
          { label: "Overall", points: segmentPoints(match.overallWinner || match.matchupWinner, side) },
        ];
      const entry = {
        id: match.id || `${round.number}-${match.match || groups.inProgress.length + 1}`,
        players: sidePlayers(match, side).map((player) => ({ id: player.id, name: player.name || player.player || player.id })),
        totalPoints,
        segments,
        final,
      };
      groups[final ? officialGroup(match, side) : "inProgress"].push(entry);
    }
  }

  const officialPoints = [...groups.wins, ...groups.ties, ...groups.losses]
    .reduce((total, match) => total + (match.totalPoints ?? 0), 0);
  return { singles, started, groups, officialPoints };
}

export function teamRoundPointsReconcile(recap, roundPoints) {
  const expected = numeric(roundPoints);
  return expected !== null && Math.abs(recap.officialPoints - expected) < 0.000001;
}
