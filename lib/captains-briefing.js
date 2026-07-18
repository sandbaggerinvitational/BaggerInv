export function buildFallbackBriefing({ prediction, teamNames, format, players, optimizer }) {
  if (!prediction) return "Complete the matchup to generate the captain's briefing.";
  const favored = prediction.teamA >= prediction.teamB ? teamNames[0] : teamNames[1];
  const underdog = favored === teamNames[0] ? teamNames[1] : teamNames[0];
  const edge = Math.abs(prediction.teamA - prediction.teamB);
  const factorText = prediction.factors.map((factor) => factor.label).join(" ");
  const top = optimizer?.team1Best?.[0];
  const optimizerText = top
    ? `The optimizer's strongest ${teamNames[0]} option is ${top.team1Label} against ${top.team2Label} at ${top.prediction.teamA}%.`
    : "The optimizer will rank alternatives once complete roster and scorecard data are available.";
  return `${favored} holds a ${edge}-point probability edge in this ${format} matchup, with ${prediction.confidence.toLowerCase()} model confidence. ${factorText} ${underdog} still has a viable path because match play remains volatile and the halve probability is ${prediction.tie}%. ${optimizerText}`;
}

export function briefingPayload({ prediction, teamNames, format, courseName, tee, players, optimizer }) {
  return {
    format,
    course: courseName,
    tee,
    teams: teamNames,
    selectedMatchup: {
      players: players.map((player) => ({
        name: player.name,
        tournamentHandicap: player.tournamentHandicap,
        courseHandicap: player.courseHandicap,
      })),
      probabilities: {
        team1: prediction.teamA,
        halve: prediction.tie,
        team2: prediction.teamB,
      },
      confidence: prediction.confidence,
      factors: prediction.factors.map((factor) => factor.label),
      components: prediction.components,
    },
    optimizer: {
      matchupCount: optimizer?.matchupCount || 0,
      team1Best: (optimizer?.team1Best || []).slice(0, 3).map((row) => ({
        team1: row.team1Label,
        team2: row.team2Label,
        winProbability: row.prediction.teamA,
      })),
      team2Best: (optimizer?.team2Best || []).slice(0, 3).map((row) => ({
        team1: row.team1Label,
        team2: row.team2Label,
        winProbability: row.prediction.teamB,
      })),
    },
  };
}
