const pickVariant = (seed, options) => options[Math.abs(seed) % options.length];

export function buildFallbackBriefing({ prediction, teamNames, format, players, optimizer }) {
  if (!prediction) return "Complete the matchup to generate the captain's briefing.";
  const favoredIndex = prediction.teamA >= prediction.teamB ? 0 : 1;
  const favored = teamNames[favoredIndex];
  const underdog = teamNames[1 - favoredIndex];
  const edge = Math.abs(prediction.teamA - prediction.teamB);
  const seed = Math.round(prediction.teamA * 7 + prediction.teamB * 11 + prediction.tie * 13 + players.length * 17);
  const call = pickVariant(seed, [
    `${favored} gets the nod, but this is not a walkover. The model sees a ${edge}-point probability edge in ${format}.`,
    `Lean ${favored}. The numbers create a ${edge}-point edge, with enough volatility to keep ${underdog} live.`,
    `This matchup tilts toward ${favored}. The margin is ${edge} probability points, so the captain should press the advantage without treating it as automatic.`,
  ]);
  const drivers = prediction.factors.slice(0, 3).map((factor) => factor.label.replace(/^No /, "No ")).join("; ");
  const risk = prediction.tie >= 14
    ? `The danger is the ${prediction.tie}% halve probability. A slow start could turn the favorite's statistical edge into a split point.`
    : `${underdog} still owns a real upset path. Match play can flip quickly if the favored side fails to convert its strongest holes.`;
  const best = favoredIndex === 0 ? optimizer?.team1Best?.[0] : optimizer?.team2Best?.[0];
  const move = best
    ? `Captain's move: consider ${favoredIndex === 0 ? best.team1Label : best.team2Label}. In the optimizer's strongest available matchup, that side projects at ${favoredIndex === 0 ? best.prediction.teamA : best.prediction.teamB}%.`
    : `Captain's move: protect the stronger historical profile and avoid sacrificing the handicap edge just to chase partnership familiarity.`;
  return `${call}

Why it leans that way: ${drivers}.

Watch-out: ${risk}

${move}`;
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
