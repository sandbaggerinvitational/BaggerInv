export const COMPARISON_DIRECTIONS = Object.freeze({
  HIGHER: "HIGHER_IS_BETTER",
  LOWER: "LOWER_IS_BETTER",
  INFORMATIONAL: "INFORMATIONAL",
});

export const COMPARISON_INSIGHT_CONFIG = Object.freeze({
  minimumScoringRounds: 2,
  minimumFormatMatches: 3,
  specialistGap: 10,
  nineHoleGap: 1.5,
  topPercentile: 0.25,
  maximumStrengths: 3,
  maximumTendencies: 2,
});

const available = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

export function compareMetricValues(
  playerAValue,
  playerBValue,
  direction = COMPARISON_DIRECTIONS.HIGHER
) {
  if (direction === COMPARISON_DIRECTIONS.INFORMATIONAL) return "TIE";
  if (!available(playerAValue) && !available(playerBValue)) return "UNAVAILABLE";
  if (!available(playerAValue)) return "PLAYER_B";
  if (!available(playerBValue)) return "PLAYER_A";
  if (Number(playerAValue) === Number(playerBValue)) return "TIE";
  const aWins = direction === COMPARISON_DIRECTIONS.LOWER
    ? Number(playerAValue) < Number(playerBValue)
    : Number(playerAValue) > Number(playerBValue);
  return aWins ? "PLAYER_A" : "PLAYER_B";
}

export function comparisonCategoryEdge(playerA, playerB, category) {
  const scoringAvailableA = playerA.scorecard.sample.completeScorecards > 0;
  const scoringAvailableB = playerB.scorecard.sample.completeScorecards > 0;
  const matchPlayAvailableA = playerA.scorecard.sample.matchPlayHoles > 0;
  const matchPlayAvailableB = playerB.scorecard.sample.matchPlayHoles > 0;
  const definitions = {
    official: [
      [playerA.official.winPercentage, playerB.official.winPercentage, COMPARISON_DIRECTIONS.HIGHER],
      [playerA.official.points, playerB.official.points, COMPARISON_DIRECTIONS.HIGHER],
      [playerA.official.championships, playerB.official.championships, COMPARISON_DIRECTIONS.HIGHER],
    ],
    scoring: [
      [playerA.scorecard.averageGrossScore, playerB.scorecard.averageGrossScore, COMPARISON_DIRECTIONS.LOWER],
      [playerA.scorecard.averageNetScore, playerB.scorecard.averageNetScore, COMPARISON_DIRECTIONS.LOWER],
      [playerA.scorecard.birdieRate, playerB.scorecard.birdieRate, COMPARISON_DIRECTIONS.HIGHER],
    ],
    matchPlay: [
      [matchPlayAvailableA ? playerA.scorecard.holeDifferential : null, matchPlayAvailableB ? playerB.scorecard.holeDifferential : null, COMPARISON_DIRECTIONS.HIGHER],
      [matchPlayAvailableA ? playerA.scorecard.holesWon : null, matchPlayAvailableB ? playerB.scorecard.holesWon : null, COMPARISON_DIRECTIONS.HIGHER],
      [playerA.progression.largestComebackCompleted, playerB.progression.largestComebackCompleted, COMPARISON_DIRECTIONS.HIGHER],
    ],
  };
  if (!scoringAvailableA) {
    definitions.scoring = definitions.scoring.map(([, b, direction]) => [null, b, direction]);
  }
  if (!scoringAvailableB) {
    definitions.scoring = definitions.scoring.map(([a, , direction]) => [a, null, direction]);
  }
  if (["BB", "SC", "SI"].includes(category)) {
    const a = playerA.formats[category];
    const b = playerB.formats[category];
    definitions[category] = [
      [a.winPercentage, b.winPercentage, COMPARISON_DIRECTIONS.HIGHER],
      [a.holeDifferential, b.holeDifferential, COMPARISON_DIRECTIONS.HIGHER],
      [
        category === "SI" ? a.grossAverage : a.netAverage,
        category === "SI" ? b.grossAverage : b.netAverage,
        COMPARISON_DIRECTIONS.LOWER,
      ],
    ];
  }
  const votes = (definitions[category] || [])
    .map(([a, b, direction]) => compareMetricValues(a, b, direction))
    .filter((result) => result === "PLAYER_A" || result === "PLAYER_B");
  const aVotes = votes.filter((result) => result === "PLAYER_A").length;
  const bVotes = votes.filter((result) => result === "PLAYER_B").length;
  if (!votes.length || aVotes === bVotes) return "TIE";
  return aVotes > bVotes ? "PLAYER_A" : "PLAYER_B";
}

export function buildComparisonSummary(playerA, playerB) {
  const official = comparisonCategoryEdge(playerA, playerB, "official");
  const scoring = comparisonCategoryEdge(playerA, playerB, "scoring");
  const matchPlay = comparisonCategoryEdge(playerA, playerB, "matchPlay");
  const sentences = [];
  if (official !== "TIE") {
    sentences.push(`${official === "PLAYER_A" ? playerA.name : playerB.name} owns the stronger official career profile.`);
  } else {
    sentences.push("Their official career profiles are closely matched.");
  }
  if (scoring !== "TIE") {
    sentences.push(`${scoring === "PLAYER_A" ? playerA.name : playerB.name} holds the recorded scoring edge.`);
  }
  const formatDifference = [
    ["BB", "Best Ball"],
    ["SC", "Scramble"],
    ["SI", "Singles"],
  ].map(([code, label]) => ({
    label,
    edge: comparisonCategoryEdge(playerA, playerB, code),
  })).find((item) => item.edge !== "TIE");
  if (formatDifference) {
    sentences.push(`${formatDifference.edge === "PLAYER_A" ? playerA.name : playerB.name} has the clearer ${formatDifference.label} edge in the available record.`);
  }
  if (matchPlay !== "TIE") {
    sentences.push(`${matchPlay === "PLAYER_A" ? playerA.name : playerB.name} has produced the stronger hole-by-hole match-play results.`);
  }
  const limited = [playerA, playerB].filter((player) =>
    player.scorecard.sample.completeScorecards < COMPARISON_INSIGHT_CONFIG.minimumScoringRounds
  );
  if (limited.length) sentences.push("Scorecard conclusions remain limited by the available recorded sample.");
  return sentences.slice(0, 4).join(" ");
}
