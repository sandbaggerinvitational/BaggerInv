const finite = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const clean = (value) => String(value ?? "").trim();
const mean = (values) => {
  const usable = values.filter(finite).map(Number);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
};
const formatName = (format) =>
  ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[format] || format;
const sideId = (index) => index === 0 ? "TEAM_A" : "TEAM_B";
const oppositeSide = (side) => side === "TEAM_A" ? "TEAM_B" : "TEAM_A";

export const MATCH_INTELLIGENCE_CONFIG = Object.freeze({
  categoryTieThreshold: 2,
  advantageLimit: 5,
  riskLimit: 4,
  swingFactorLimit: 5,
  confidence: Object.freeze({
    high: Object.freeze({ minimumHistory: 16, minimumScorecardPlayers: 2, minimumChemistryMatches: 3 }),
    moderate: Object.freeze({ minimumHistory: 7, minimumScorecardPlayers: 1 }),
  }),
  upset: Object.freeze({ highMargin: 9, moderateMargin: 18 }),
});

function category({
  id,
  label,
  teamA,
  teamB,
  direction = "higher",
  source = "Historical data",
  available = true,
  modelImpact = null,
}) {
  if (!available || !finite(teamA) || !finite(teamB)) {
    return { id, label, edge: "UNAVAILABLE", teamA: null, teamB: null, strength: 0, source, modelImpact };
  }
  const a = Number(teamA);
  const b = Number(teamB);
  const rawDifference = direction === "lower" ? b - a : a - b;
  const strength = Math.abs(rawDifference);
  const edge = strength < MATCH_INTELLIGENCE_CONFIG.categoryTieThreshold
    ? "TIE"
    : rawDifference > 0 ? "TEAM_A" : "TEAM_B";
  return { id, label, edge, teamA: a, teamB: b, strength, source, modelImpact };
}

function sideProfiles(scoringIntelligence, sideSize) {
  const profiles = scoringIntelligence?.profiles || [];
  return [profiles.slice(0, sideSize), profiles.slice(sideSize)];
}

function profileMean(rows, getter) {
  return mean(rows.map((row) => getter(row.profile, row.courseFit)));
}

function recentForm(playerIds, historical) {
  return mean(playerIds.map((playerId) => {
    const seasons = (historical[playerId]?.seasons || [])
      .filter((season) => season?.overall?.matches)
      .sort((a, b) => Number(b.year) - Number(a.year))
      .slice(0, 2);
    const record = seasons.reduce((total, season) => ({
      matches: total.matches + Number(season.overall.matches || 0),
      wins: total.wins + Number(season.overall.wins || 0),
      halves: total.halves + Number(season.overall.halves || 0),
    }), { matches: 0, wins: 0, halves: 0 });
    return record.matches ? ((record.wins + record.halves * 0.5) / record.matches) * 100 : null;
  }));
}

function confidenceLevel({ players, historical, scoringIntelligence, format }) {
  const history = players.reduce((sum, player) =>
    sum + Number(historical[player.id]?.records?.[format]?.matches || 0), 0);
  const scorecardPlayers = (scoringIntelligence?.profiles || [])
    .filter((row) => row.profile?.rounds > 0).length;
  const chemistryMatches = format === "SI"
    ? 0
    : Number(prediction.teamVibes?.teamA?.matches || 0) +
      Number(prediction.teamVibes?.teamB?.matches || 0);
  const high = MATCH_INTELLIGENCE_CONFIG.confidence.high;
  if (
    history >= high.minimumHistory &&
    scorecardPlayers >= high.minimumScorecardPlayers &&
    (format === "SI" || chemistryMatches >= high.minimumChemistryMatches)
  ) return "HIGH";
  const moderate = MATCH_INTELLIGENCE_CONFIG.confidence.moderate;
  if (history >= moderate.minimumHistory || scorecardPlayers >= moderate.minimumScorecardPlayers) {
    return "MODERATE";
  }
  return "LOW";
}

function historicalContext({ players, historical, partnerships, headToHead, format, matches }) {
  const sideSize = format === "SI" ? 1 : 2;
  const sides = [players.slice(0, sideSize), players.slice(sideSize)];
  const pairKeys = sides.map((side) => side.map((player) => player.id).sort().join("|"));
  const partnershipRows = format === "SI"
    ? []
    : pairKeys.map((key) => partnerships[key]).filter(Boolean);
  const opponentRows = [];
  for (const one of sides[0]) {
    for (const two of sides[1]) {
      const row = headToHead[[one.id, two.id].sort().join("|")];
      if (row) opponentRows.push(row);
    }
  }
  const ids = new Set(players.map((player) => clean(player.id)));
  const relevantMatches = (matches || []).filter((match) => {
    const matchPlayers = [
      match["Team 1 Player 1"], match["Team 1 Player 2"],
      match["Team 2 Player 1"], match["Team 2 Player 2"],
    ].map(clean).filter(Boolean);
    return clean(match.Format).toUpperCase() === format &&
      matchPlayers.some((id) => ids.has(id));
  }).sort((a, b) => Number(b.Year) - Number(a.Year) || Number(b["Round Number"] || b.Round) - Number(a["Round Number"] || a.Round));
  const last = relevantMatches[0];
  const directMatches = opponentRows.reduce((sum, row) => sum + Number(row.overall?.matches || 0), 0);
  return {
    headToHeadMatches: directMatches,
    partnershipRecords: partnershipRows.map((row) => row.record).filter(Boolean),
    lastMeeting: last ? {
      year: last.Year,
      round: last["Round Number"] || last.Round,
      result: last["Overall Result"] || last.Result || last["Match Result"] || "Recorded match",
      matchId: last["Match ID"],
    } : null,
    similarMatch: last ? {
      year: last.Year,
      round: last["Round Number"] || last.Round,
      format: formatName(format),
      winner: last["Overall Winner"] || last["Winning Team"] || "See official result",
      margin: last["Overall Result"] || last.Result || "Recorded result",
      prediction: "Not historically recorded",
      actualResult: last["Overall Result"] || last.Result || "Recorded result",
    } : null,
  };
}

function strengthText(item, teamNames) {
  if (item.edge === "TIE") return `${item.label} is effectively even.`;
  if (item.edge === "UNAVAILABLE") return "";
  return `${teamNames[item.edge === "TEAM_A" ? 0 : 1]} hold the ${item.label.toLowerCase()} edge.`;
}

function keyForCategory(item) {
  const map = {
    handicap: "Convert the available stroke holes",
    player: "Let the stronger player profile set the pace",
    format: `Lean into ${item.label.replace(" History", "")}`,
    chemistry: "Turn partnership chemistry into early pressure",
    birdies: "Create birdie chances without adding double-bogey risk",
    gross: "Keep the gross scoring baseline steady",
    net: "Win the net-scoring opportunities",
    closing: "Own Holes 16–18",
    currentForm: "Carry recent form into the opening holes",
    opponent: "Exploit the direct matchup history",
    courseFit: "Use the favorable course profile",
  };
  return map[item.id] || `Press the ${item.label.toLowerCase()} advantage`;
}

export function buildMatchIntelligence({
  prediction,
  teamNames = ["Team A", "Team B"],
  players = [],
  historical = {},
  partnerships = {},
  headToHead = {},
  format = "BB",
  scoringIntelligence = null,
  pointsAvailable = 1,
  matches = [],
} = {}) {
  if (!prediction || players.length < (format === "SI" ? 2 : 4)) return null;
  const sideSize = format === "SI" ? 1 : 2;
  const playerSides = [players.slice(0, sideSize), players.slice(sideSize)];
  const scoringSides = sideProfiles(scoringIntelligence, sideSize);
  const contribution = Object.fromEntries((prediction.contributions || []).map((row) => [row.id, row]));
  const categories = [
    category({ id: "handicap", label: "Handicap", teamA: prediction.components.handicap[0], teamB: prediction.components.handicap[1], source: "Official playing handicaps", modelImpact: contribution.handicap?.impact }),
    category({ id: "player", label: "Player Quality", teamA: prediction.components.player[0], teamB: prediction.components.player[1], source: "Ratings and player history", modelImpact: contribution.player?.impact }),
    category({ id: "opponent", label: "Historical Results", teamA: prediction.components.opponent[0], teamB: prediction.components.opponent[1], source: "Head-to-head results", modelImpact: contribution.opponent?.impact }),
    category({ id: "format", label: `${formatName(format)} History`, teamA: prediction.components.player[0], teamB: prediction.components.player[1], source: "Relevant format history", modelImpact: contribution.player?.impact }),
    category({ id: "chemistry", label: "Team Chemistry", teamA: prediction.teamVibes?.teamA?.score, teamB: prediction.teamVibes?.teamB?.score, source: "Team Vibes", available: format !== "SI" && (prediction.teamVibes?.teamA?.known || prediction.teamVibes?.teamB?.known), modelImpact: contribution.team?.impact }),
    category({ id: "birdies", label: "Birdie Production", teamA: profileMean(scoringSides[0], (profile) => profile.birdieOrBetterPercent), teamB: profileMean(scoringSides[1], (profile) => profile.birdieOrBetterPercent), source: "Complete and verified scorecards" }),
    category({ id: "gross", label: "Gross Scoring", teamA: profileMean(scoringSides[0], (profile) => profile.grossScoringAverage), teamB: profileMean(scoringSides[1], (profile) => profile.grossScoringAverage), direction: "lower", source: "Complete and verified scorecards" }),
    category({ id: "net", label: "Net Scoring", teamA: profileMean(scoringSides[0], (profile) => profile.averageRoundToPar), teamB: profileMean(scoringSides[1], (profile) => profile.averageRoundToPar), direction: "lower", source: "Recorded score-to-par profile" }),
    category({ id: "closing", label: "Closing Holes", teamA: profileMean(scoringSides[0], (profile) => profile.closing.averageToPar), teamB: profileMean(scoringSides[1], (profile) => profile.closing.averageToPar), direction: "lower", source: "Recorded Holes 15–18" }),
    category({ id: "courseFit", label: "Course Fit", teamA: profileMean(scoringSides[0], (_, fit) => fit.score), teamB: profileMean(scoringSides[1], (_, fit) => fit.score), source: "Recorded course profile" }),
    category({ id: "currentForm", label: "Current Form", teamA: recentForm(playerSides[0].map((player) => player.id), historical), teamB: recentForm(playerSides[1].map((player) => player.id), historical), source: "Two most recent appearances" }),
  ];
  const confidence = confidenceLevel({ players, historical, scoringIntelligence, format });
  const favoriteIndex = prediction.teamA >= prediction.teamB ? 0 : 1;
  const favoriteSide = sideId(favoriteIndex);
  const underdogSide = oppositeSide(favoriteSide);
  const probabilities = [prediction.teamA, prediction.teamB];
  const probabilityMargin = Math.abs(prediction.teamA - prediction.teamB);
  const expectedPoints = [
    ((prediction.teamA + prediction.tie * 0.5) / 100) * pointsAvailable,
    ((prediction.teamB + prediction.tie * 0.5) / 100) * pointsAvailable,
  ];
  const ranked = categories
    .filter((item) => item.edge !== "UNAVAILABLE")
    .sort((a, b) => (Math.abs(b.modelImpact || 0) + b.strength / 10) - (Math.abs(a.modelImpact || 0) + a.strength / 10));
  const advantages = [0, 1].map((index) => ranked
    .filter((item) => item.edge === sideId(index))
    .slice(0, MATCH_INTELLIGENCE_CONFIG.advantageLimit)
    .map((item) => ({ id: item.id, text: strengthText(item, teamNames), category: item.label })));
  const risks = [0, 1].map((index) => {
    const rows = ranked
      .filter((item) => item.edge === sideId(1 - index))
      .slice(0, MATCH_INTELLIGENCE_CONFIG.riskLimit)
      .map((item) => ({ id: item.id, text: `${teamNames[1 - index]} own the ${item.label.toLowerCase()} edge.`, category: item.label }));
    if (confidence === "LOW") rows.push({ id: "sample", text: "The relevant historical sample is limited.", category: "Sample Size" });
    return rows.slice(0, MATCH_INTELLIGENCE_CONFIG.riskLimit);
  });
  const swingFactors = ranked.slice(0, MATCH_INTELLIGENCE_CONFIG.swingFactorLimit)
    .map((item, index) => ({ ...item, rank: index + 1, impact: Number(Math.max(Math.abs(item.modelImpact || 0), item.strength / 10).toFixed(1)) }));
  const upsetPotential = probabilityMargin <= MATCH_INTELLIGENCE_CONFIG.upset.highMargin || confidence === "LOW"
    ? "HIGH"
    : probabilityMargin <= MATCH_INTELLIGENCE_CONFIG.upset.moderateMargin || confidence === "MODERATE"
      ? "MODERATE" : "LOW";
  const birdie = categories.find((item) => item.id === "birdies");
  const closing = categories.find((item) => item.id === "closing");
  const chemistry = categories.find((item) => item.id === "chemistry");
  const matchupStyle = birdie?.strength >= 5 ? "Birdie Shootout"
    : closing?.strength >= 0.2 ? "Closing Battle"
      : chemistry?.strength >= 10 ? "Chemistry Battle"
        : upsetPotential === "HIGH" ? "High Variance" : "Balanced Match";
  const history = historicalContext({ players, historical, partnerships, headToHead, format, matches });
  const favoriteStrengths = advantages[favoriteIndex].map((item) => item.category.toLowerCase());
  const favoriteRisk = risks[favoriteIndex][0]?.category.toLowerCase();
  const analysis = `${teamNames[favoriteIndex]} enter as the projected favorite at ${probabilities[favoriteIndex]}%, led by ${
    favoriteStrengths.slice(0, 2).join(" and ") || "the stronger combined profile"
  }. ${favoriteRisk ? `${teamNames[1 - favoriteIndex]} can counter through ${favoriteRisk}.` : "No single opposing category creates a decisive counter-edge."} ${
    confidence === "LOW" ? "Confidence is low because the relevant sample remains limited." : `Confidence is ${confidence.toLowerCase()} across the available matchup evidence.`
  } The upset path is to keep the match close enough for ${swingFactors[0]?.label.toLowerCase() || "the largest swing factor"} to decide the closing holes.`;
  const keysToVictory = [0, 1].map((index) => {
    const own = ranked.filter((item) => item.edge === sideId(index)).slice(0, 2).map(keyForCategory);
    const counter = ranked.find((item) => item.edge === sideId(1 - index));
    if (counter) own.push(`Limit the opponent's ${counter.label.toLowerCase()} edge`);
    return [...new Set(own)].slice(0, 3);
  });
  const captainsNotes = `${teamNames[favoriteIndex]} should build the match plan around ${
    favoriteStrengths[0] || "its strongest measured category"
  } and try to create separation before the final three holes. ${teamNames[1 - favoriteIndex]}'s best response is to pressure ${
    favoriteRisk || "the favorite's least secure advantage"
  } and keep the match inside one hole entering 16. ${
    closing?.edge === favoriteSide
      ? `If the match remains close late, the recorded closing profile favors ${teamNames[favoriteIndex]}.`
      : closing?.edge === underdogSide
        ? `The closing profile gives ${teamNames[1 - favoriteIndex]} a credible late-match upset route.`
        : "The closing-hole evidence does not clearly separate the sides."
  }`;
  const explainPrediction = (prediction.contributions || []).map((item) => ({
    id: item.id,
    label: item.label,
    value: Number(item.impact.toFixed(1)),
    side: item.side === "A" ? "TEAM_A" : item.side === "B" ? "TEAM_B" : "TIE",
  }));
  if (finite(prediction.calibration?.underlyingSkillAdjustment) && Math.abs(prediction.calibration.underlyingSkillAdjustment) >= 0.05) {
    explainPrediction.push({
      id: "underlyingSkill",
      label: "Underlying Skill",
      value: Number(prediction.calibration.underlyingSkillAdjustment.toFixed(1)),
      side: prediction.calibration.underlyingSkillAdjustment > 0 ? "TEAM_A" : "TEAM_B",
    });
  }
  return {
    overview: {
      favorite: teamNames[favoriteIndex],
      favoriteIndex,
      probabilities,
      halveProbability: prediction.tie,
      expectedPoints,
      confidence,
      predictionTier: probabilityMargin < 6 ? "TOSS-UP" : probabilityMargin < 14 ? "LEAN" : probabilityMargin < 24 ? "EDGE" : "STRONG EDGE",
      upsetPotential,
      matchupStyle,
    },
    categories,
    advantages,
    risks,
    swingFactors,
    history,
    analysis,
    keysToVictory,
    captainsNotes,
    explainPrediction,
    finalProbability: prediction.teamA,
  };
}
