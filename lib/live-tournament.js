const clean = (value) => String(value ?? "").trim();

export function normalizeMatchStatus(match = {}) {
  return clean(match.status ?? match["Match Status"]).toLowerCase();
}

export function isFinalizedMatch(match = {}) {
  const status = normalizeMatchStatus(match);
  return ["final", "finalized"].includes(status) || Boolean(
    clean(match.finalizedAt ?? match["Finalized At"])
  );
}

export function isLiveMatch(match = {}) {
  return ["live", "in progress", "in-progress", "reopened"].includes(
    normalizeMatchStatus(match)
  );
}

export function matchPointsAvailable(match = {}) {
  const configuredValue = match.pointsAvailable ?? match["Points Available"];
  const configured = Number(configuredValue);
  if (clean(configuredValue) && Number.isFinite(configured) && configured >= 0) return configured;

  const oneValue = match.team1Points ?? match["Team 1 Points"];
  const twoValue = match.team2Points ?? match["Team 2 Points"];
  const one = Number(oneValue);
  const two = Number(twoValue);
  if (isFinalizedMatch(match) && clean(oneValue) && clean(twoValue) && Number.isFinite(one) && Number.isFinite(two)) {
    return one + two;
  }

  // SBI Best Ball, Scramble, and Singles matches are currently worth three
  // points. The sheet-driven value above remains authoritative for future formats.
  return 3;
}

export function hasValidFinalPoints(match = {}) {
  const oneValue = match.team1Points ?? match["Team 1 Points"];
  const twoValue = match.team2Points ?? match["Team 2 Points"];
  if (!clean(oneValue) || !clean(twoValue)) return false;
  const one = Number(oneValue);
  const two = Number(twoValue);
  if (!Number.isFinite(one) || !Number.isFinite(two) || one < 0 || two < 0) return false;
  return Math.abs(one + two - matchPointsAvailable(match)) < 0.000001;
}

export function isOfficialMatchResult(match = {}) {
  return isFinalizedMatch(match) && hasValidFinalPoints(match);
}

export function isRoundComplete(roundId, matches = []) {
  const roundMatches = matches.filter((match) => Number(match.round ?? match.Round) === Number(roundId));
  if (!roundMatches.length) return false;
  const expected = Math.max(...roundMatches.map((match) => Number(match.expectedRoundMatchCount) || 0));
  if (!expected || roundMatches.length !== expected) return false;
  const ids = roundMatches.map((match) => clean(match.id ?? match["Match ID"])).filter(Boolean);
  if (ids.length !== roundMatches.length || new Set(ids).size !== ids.length) return false;
  return roundMatches.every(isOfficialMatchResult);
}

function normalizedConfiguredStatus(value) {
  const status = clean(value).toLowerCase();
  if (["final", "complete", "completed"].includes(status)) return "FINAL";
  if (["live", "in progress", "in-progress", "underway"].includes(status)) return "LIVE";
  return "UPCOMING";
}

function manualMode(value) {
  return ["manual", "manual override", "override"].includes(clean(value).toLowerCase());
}

export function getEffectiveTournamentState({
  matches = [], configuredStatus = "AUTO", configuredRound = 1, statusMode = "Automatic",
} = {}) {
  const round1Complete = isRoundComplete(1, matches);
  const round2Complete = isRoundComplete(2, matches);
  const round3Complete = isRoundComplete(3, matches);
  const official = matches.filter(isOfficialMatchResult);
  const liveMatchCount = matches.filter((match) => !isOfficialMatchResult(match) && isLiveMatch(match)).length;
  const remaining = matches.filter((match) => !isOfficialMatchResult(match));
  const base = {
    round1Complete,
    round2Complete,
    round3Complete,
    liveMatchCount,
    remainingMatchCount: remaining.length,
    remainingPoints: remaining.reduce((sum, match) => sum + matchPointsAvailable(match), 0),
    officialMatchCount: official.length,
    overrideActive: manualMode(statusMode),
  };

  if (base.overrideActive) {
    const status = normalizedConfiguredStatus(configuredStatus);
    const roundValue = clean(configuredRound).toLowerCase();
    const parsedRound = Number(roundValue);
    const currentRound = status === "FINAL" || roundValue === "final"
      ? "FINAL"
      : ([1, 2, 3].includes(parsedRound) ? parsedRound : 1);
    return { ...base, status, currentRound };
  }

  if (round1Complete && round2Complete && round3Complete) {
    return { ...base, status: "FINAL", currentRound: "FINAL" };
  }
  if (round1Complete && round2Complete) return { ...base, status: "LIVE", currentRound: 3 };
  if (round1Complete) return { ...base, status: "LIVE", currentRound: 2 };
  if (liveMatchCount || official.length) return { ...base, status: "LIVE", currentRound: 1 };
  return { ...base, status: "UPCOMING", currentRound: 1 };
}

export function roundStatus(round = {}, tournamentStatus = "", activeRound = null) {
  const matches = round.matches || [];
  if (isRoundComplete(round.number, matches)) return "Complete";
  if (matches.some(isLiveMatch)) return "Live";
  const status = clean(tournamentStatus).toLowerCase();
  if (["live", "in progress", "in-progress"].includes(status) && Number(round.number) === Number(activeRound)) {
    return "Live";
  }
  return "Upcoming";
}

export function getRoundProgress(round = {}) {
  const matches = round.matches || [];
  const completedMatches = matches.filter(isOfficialMatchResult);
  const liveMatches = matches.filter((match) => !isOfficialMatchResult(match) && isLiveMatch(match));
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
  const remainingMatches = matches.filter((match) => !isOfficialMatchResult(match));
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
  const complete = ["complete", "completed", "final"].includes(status) && matches.length > 0;
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
  const matches = rounds.flatMap((round) => round.matches || []);
  return isRoundComplete(1, matches) && isRoundComplete(2, matches);
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
      if (!isOfficialMatchResult(match)) continue;
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
      matches: (round.matches || []).filter((match) => !isOfficialMatchResult(match)).length,
      points: (round.matches || [])
        .filter((match) => !isOfficialMatchResult(match))
        .reduce((sum, match) => sum + matchPointsAvailable(match), 0),
    }))
    .filter((round) => round.matches > 0);
}
