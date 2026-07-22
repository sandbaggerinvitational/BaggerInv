const clean = (value) => String(value ?? "").trim();

export function normalizeMatchStatus(match = {}) {
  return clean(match.status ?? match["Match Status"]).toLowerCase();
}

export function isFinalizedMatch(match = {}) {
  const status = normalizeMatchStatus(match);
  return ["final", "finalized", "complete", "completed"].includes(status) || Boolean(
    clean(match.finalizedAt ?? match["Finalized At"])
  );
}

export function isLiveMatch(match = {}) {
  return ["live", "in progress", "in-progress", "reopened"].includes(
    normalizeMatchStatus(match)
  );
}

export function matchPointsAvailable(match = {}) {
  const configured = Number(match.pointsAvailable ?? match["Points Available"]);
  if (Number.isFinite(configured) && configured >= 0) return configured;

  const one = Number(match.team1Points ?? match["Team 1 Points"]);
  const two = Number(match.team2Points ?? match["Team 2 Points"]);
  if (isFinalizedMatch(match) && Number.isFinite(one) && Number.isFinite(two)) {
    return one + two;
  }

  // SBI Best Ball, Scramble, and Singles matches are currently worth three
  // points. The sheet-driven value above remains authoritative for future formats.
  return 3;
}

export function roundStatus(round = {}, tournamentStatus = "", activeRound = null) {
  const matches = round.matches || [];
  if (matches.length && matches.every(isFinalizedMatch)) return "Complete";
  if (matches.some(isLiveMatch)) return "Live";
  const status = clean(tournamentStatus).toLowerCase();
  if (["live", "in progress", "in-progress"].includes(status) && Number(round.number) === Number(activeRound)) {
    return "Live";
  }
  return "Upcoming";
}

export function getRoundProgress(round = {}) {
  const matches = round.matches || [];
  const completedMatches = matches.filter(isFinalizedMatch);
  const liveMatches = matches.filter((match) => !isFinalizedMatch(match) && isLiveMatch(match));
  const scheduledMatches = matches.length - completedMatches.length - liveMatches.length;
  const totalPoints = matches.reduce((sum, match) => sum + matchPointsAvailable(match), 0);
  const decidedPoints = completedMatches.reduce((sum, match) => sum + matchPointsAvailable(match), 0);
  return {
    totalMatches: matches.length,
    completedMatches: completedMatches.length,
    liveMatches: liveMatches.length,
    scheduledMatches,
    totalPoints,
    decidedPoints,
    remainingPoints: Math.max(0, totalPoints - decidedPoints),
    percent: matches.length ? (completedMatches.length / matches.length) * 100 : 0,
  };
}

export function getTournamentState({ tournament = {}, rounds = [] } = {}) {
  const matches = rounds.flatMap((round) => round.matches || []);
  const remainingMatches = matches.filter((match) => !isFinalizedMatch(match));
  const totalPoints = matches.reduce((sum, match) => sum + matchPointsAvailable(match), 0);
  const remainingPoints = remainingMatches.reduce(
    (sum, match) => sum + matchPointsAvailable(match),
    0
  );
  const teamOneScore = Number(tournament.teamOne?.score) || 0;
  const teamTwoScore = Number(tournament.teamTwo?.score) || 0;
  const tieAdvantageSide = Number(tournament.tieAdvantageSide) || null;
  const pointIncrement = Number(tournament.pointIncrement) || 0.5;

  const tieTarget = totalPoints / 2;
  const clinchTarget = (side) =>
    tieAdvantageSide === side ? tieTarget : tieTarget + pointIncrement;
  const pointsToTie = (score) => Math.max(0, tieTarget - score);
  const pointsToClinch = (side, score) => Math.max(0, clinchTarget(side) - score);
  const teamOneClinched =
    teamOneScore > teamTwoScore + remainingPoints ||
    (teamOneScore === teamTwoScore + remainingPoints && tieAdvantageSide === 1);
  const teamTwoClinched =
    teamTwoScore > teamOneScore + remainingPoints ||
    (teamTwoScore === teamOneScore + remainingPoints && tieAdvantageSide === 2);
  const status = clean(tournament.status).toLowerCase();
  const complete = ["complete", "completed", "final"].includes(status) || remainingMatches.length === 0;
  let championSide = teamOneClinched ? 1 : teamTwoClinched ? 2 : null;
  if (complete && !championSide) {
    if (teamOneScore > teamTwoScore) championSide = 1;
    else if (teamTwoScore > teamOneScore) championSide = 2;
    else championSide = tieAdvantageSide;
  }

  return {
    totalMatches: matches.length,
    remainingMatches: remainingMatches.length,
    totalPoints,
    remainingPoints,
    liveMatches: remainingMatches.filter(isLiveMatch).length,
    teamOne: {
      score: teamOneScore,
      pointsToTie: pointsToTie(teamOneScore),
      pointsToClinch: pointsToClinch(1, teamOneScore),
    },
    teamTwo: {
      score: teamTwoScore,
      pointsToTie: pointsToTie(teamTwoScore),
      pointsToClinch: pointsToClinch(2, teamTwoScore),
    },
    tieAdvantageSide,
    championSide,
    clinched: Boolean(championSide),
    complete,
  };
}

export function clinchingScenariosEligible(rounds = []) {
  return [1, 2].every((number) => {
    const round = rounds.find((item) => Number(item.number) === number);
    return Boolean(round?.matches?.length) && round.matches.every(isFinalizedMatch);
  });
}

function winnerSide(value) {
  const normalized = clean(value).toLowerCase();
  if (["team 1", "team1", "1"].includes(normalized)) return 1;
  if (["team 2", "team2", "2"].includes(normalized)) return 2;
  return null;
}

export function getTeamMomentum(rounds = []) {
  const events = [];
  for (const round of [...rounds].sort((a, b) => Number(a.number) - Number(b.number))) {
    for (const match of [...(round.matches || [])].sort((a, b) => Number(a.match) - Number(b.match))) {
      if (!isFinalizedMatch(match)) continue;
      const segmentWinners = match.format === "SI"
        ? [match.overallWinner || match.matchupWinner]
        : [match.frontWinner, match.backWinner, match.overallWinner || match.matchupWinner];
      for (const winner of segmentWinners) {
        const side = winnerSide(winner);
        if (side) events.push(side);
      }
    }
  }
  if (events.length < 2) return null;

  const description = (side) => {
    let streak = 0;
    for (let index = events.length - 1; index >= 0 && events[index] === side; index -= 1) streak += 1;
    if (streak >= 2) return `Won the last ${streak} decided points`;
    const recent = events.slice(-5);
    const wins = recent.filter((winner) => winner === side).length;
    return `Won ${wins} of the last ${recent.length} decided points`;
  };

  return { teamOne: description(1), teamTwo: description(2), eventCount: events.length };
}

export function remainingByRound(rounds = []) {
  return rounds
    .map((round) => ({
      number: round.number,
      label: round.label || `Round ${round.number}`,
      matches: (round.matches || []).filter((match) => !isFinalizedMatch(match)).length,
      points: (round.matches || [])
        .filter((match) => !isFinalizedMatch(match))
        .reduce((sum, match) => sum + matchPointsAvailable(match), 0),
    }))
    .filter((round) => round.matches > 0);
}
