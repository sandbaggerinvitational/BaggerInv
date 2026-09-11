import {
  isLiveMatch,
  isOfficialMatchResult,
} from "./live-tournament.js";

const clean = (value) => String(value ?? "").trim();

function matchNumber(match = {}) {
  return clean(match.match) || clean(match.id) || "—";
}

function participantNames(match = {}, side) {
  return (match[`team${side}Players`] || [])
    .map((player) => clean(player?.name))
    .filter(Boolean)
    .join(" + ");
}

function timestampValue(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayEventTime(value, fallback = "") {
  const source = clean(value);
  if (!source) return fallback;
  const parsed = Date.parse(source);
  if (!Number.isFinite(parsed)) return source;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function winnerName(match, tournament) {
  const winner = clean(match.overallWinner || match.matchupWinner).toLowerCase();
  if (["team 1", "team1", "1"].includes(winner)) return tournament.teamOne?.name || "Team 1";
  if (["team 2", "team2", "2"].includes(winner)) return tournament.teamTwo?.name || "Team 2";
  if (["halved", "half", "tie", "tied"].includes(winner)) return "Halved";
  return "";
}

function featuredPriority(match) {
  if (isLiveMatch(match) && !isOfficialMatchResult(match)) return 0;
  if (!isOfficialMatchResult(match)) return 1;
  return 2;
}

export function selectFeaturedMatch({ rounds = [], currentRound } = {}) {
  const allMatches = rounds.flatMap((round) => round.matches || []);
  const activeMatches = allMatches.filter(
    (match) => Number(match.round) === Number(currentRound),
  );
  const pool = activeMatches.length ? activeMatches : allMatches;

  return [...pool].sort((a, b) => {
    const priority = featuredPriority(a) - featuredPriority(b);
    if (priority) return priority;
    if (featuredPriority(a) === 0) {
      const holes = Number(b.currentHole || 0) - Number(a.currentHole || 0);
      if (holes) return holes;
      const updates = timestampValue(b.updatedAt) - timestampValue(a.updatedAt);
      if (updates) return updates;
    }
    return Number(a.match || 0) - Number(b.match || 0);
  })[0] || null;
}

export function featuredMatchModel({ rounds = [], tournament = {} } = {}) {
  const match = selectFeaturedMatch({
    rounds,
    currentRound: tournament.currentRound,
  });
  if (!match) return null;

  const live = isLiveMatch(match) && !isOfficialMatchResult(match);
  const final = isOfficialMatchResult(match);
  const teamOneHoles = Number(match.team1HolesWon) || 0;
  const teamTwoHoles = Number(match.team2HolesWon) || 0;
  const holeEdge = teamOneHoles === teamTwoHoles
    ? "Momentum is even"
    : `${teamOneHoles > teamTwoHoles ? tournament.teamOne?.name : tournament.teamTwo?.name} owns the hole edge`;
  const winner = winnerName(match, tournament);

  return {
    id: match.id,
    label: `Round ${match.round} · Match ${matchNumber(match)}`,
    format: match.formatName || match.format || "",
    course: match.course?.name || "",
    teeTime: clean(match.teeTime),
    teamOneName: tournament.teamOne?.name || "Team 1",
    teamTwoName: tournament.teamTwo?.name || "Team 2",
    teamOnePlayers: participantNames(match, 1),
    teamTwoPlayers: participantNames(match, 2),
    holeLabel: live && Number(match.currentHole) > 0
      ? `Through Hole ${match.currentHole}`
      : final ? "Final" : match.teeTime ? `Tee time ${match.teeTime}` : "Scheduled",
    status: clean(match.liveStatusText) || (final
      ? winner === "Halved" ? "Match halved" : `${winner} wins`
      : live ? "Live" : "Scheduled"),
    momentum: final
      ? winner === "Halved" ? "Finished all square" : `${winner} secured the match`
      : live ? holeEdge : "Awaiting first score",
    isLive: live,
  };
}

export function buildTournamentTimeline({ rounds = [], tournament = {} } = {}) {
  const matches = rounds.flatMap((round) => round.matches || []);
  const events = [];

  for (const match of matches) {
    const label = `Round ${match.round} · Match ${matchNumber(match)}`;
    const players = [participantNames(match, 1), participantNames(match, 2)]
      .filter(Boolean)
      .join(" vs ");

    if (isOfficialMatchResult(match)) {
      const winner = winnerName(match, tournament);
      const score = Number.isFinite(Number(match.team1Points)) && Number.isFinite(Number(match.team2Points))
        ? `${Number(match.team1Points).toFixed(1).replace(".0", "")}–${Number(match.team2Points).toFixed(1).replace(".0", "")}`
        : "";
      events.push({
        id: `final-${match.id}`,
        type: "FINAL",
        time: displayEventTime(match.finalizedAt || match.updatedAt, "Final"),
        sortValue: timestampValue(match.finalizedAt || match.updatedAt) || 300,
        title: `${label} score confirmed`,
        detail: winner === "Halved"
          ? `${players || "The match"} finished halved${score ? `, ${score}` : ""}.`
          : `${winner || "The winning side"} completed the match${score ? `, ${score}` : ""}.`,
      });
      continue;
    }

    if (isLiveMatch(match)) {
      const through = Number(match.currentHole) > 0 ? ` through Hole ${match.currentHole}` : "";
      events.push({
        id: `live-${match.id}`,
        type: "LIVE",
        time: displayEventTime(match.updatedAt, "Live"),
        sortValue: timestampValue(match.updatedAt) || 400,
        title: `${label} updated${through}`,
        detail: clean(match.liveStatusText) || clean(match.notes) || `${players || "The match"} is in progress.`,
      });
      continue;
    }

    if (match.teeTime) {
      events.push({
        id: `tee-${match.id}`,
        type: "TEE_TIME",
        time: match.teeTime,
        sortValue: 100 - Number(match.round || 0) - Number(match.match || 0) / 100,
        title: `${label} tees off`,
        detail: [
          players,
          match.course?.name,
          match.formatName || match.format,
        ].filter(Boolean).join(" · "),
      });
    }
  }

  return events
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 8);
}

export function tournamentProgressModel({ tournament = {}, rounds = [] } = {}) {
  const matches = rounds.flatMap((round) => round.matches || []);
  const completedMatches = matches.filter(isOfficialMatchResult).length;
  const liveMatches = matches.filter(
    (match) => !isOfficialMatchResult(match) && isLiveMatch(match),
  ).length;
  return {
    totalMatches: matches.length,
    completedMatches,
    remainingMatches: Math.max(0, matches.length - completedMatches),
    liveMatches,
    currentRound: tournament.currentRound || 1,
  };
}
