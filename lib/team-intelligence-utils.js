const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
const clamp = (value, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));

export const TEAM_INTELLIGENCE_CONFIG = Object.freeze({
  minimumPartnershipMatches: 2,
  minimumScoringRounds: 2,
  strengthLimit: 3,
  tendencyLimit: 2,
  chemistryGrades: [
    { minimum: 90, grade: "A+", label: "Exceptional" },
    { minimum: 80, grade: "A", label: "Strong" },
    { minimum: 68, grade: "B", label: "Above Average" },
    { minimum: 50, grade: "C", label: "Neutral" },
    { minimum: 0, grade: "D", label: "Limited History" },
  ],
  pairingWeights: { chemistry: 25, scoring: 25, matchPlay: 20, closing: 15, consistency: 15 },
});

export function chemistryGrade(value) {
  if (!finite(value)) return { grade: "—", label: "Unavailable" };
  return TEAM_INTELLIGENCE_CONFIG.chemistryGrades.find((row) => Number(value) >= row.minimum);
}

export function comparisonEdge(a, b, direction = "higher") {
  if (!finite(a) || !finite(b)) return "UNAVAILABLE";
  if (Number(a) === Number(b)) return "TIE";
  const aLeads = direction === "lower" ? Number(a) < Number(b) : Number(a) > Number(b);
  return aLeads ? "TEAM_A" : "TEAM_B";
}

export function confidenceForPartnership({ matches = 0, scorecards = 0, opponentMatches = 0 } = {}) {
  const score = matches * 2 + scorecards + opponentMatches;
  if (matches >= 4 && scorecards >= 3 && score >= 12) return "HIGH";
  if (matches >= 2 || scorecards >= 2 || score >= 5) return "MODERATE";
  return "LOW";
}

export function pairingScore({
  chemistry,
  scoring,
  matchPlay,
  closing,
  volatility,
  confidence = "LOW",
}) {
  const component = (value, fallback = 50) => finite(value) ? clamp(Number(value)) : fallback;
  const consistency = finite(volatility) ? clamp(100 - Number(volatility) * 5) : 50;
  const values = {
    chemistry: component(chemistry),
    scoring: component(scoring),
    matchPlay: component(matchPlay),
    closing: component(closing),
    consistency,
  };
  const overall = Object.entries(TEAM_INTELLIGENCE_CONFIG.pairingWeights)
    .reduce((sum, [key, weight]) => sum + values[key] * weight / 100, 0);
  return { overall: Math.round(overall), ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.round(value)])), confidence };
}

export function rankPairings(rows, mode = "best") {
  const ranked = [...rows];
  const value = (row, key, fallback = -Infinity) => finite(row[key]) ? Number(row[key]) : fallback;
  ranked.sort((a, b) => {
    if (mode === "safe") return value(b, "worstCaseExpectedPoints") - value(a, "worstCaseExpectedPoints") || value(b, "confidenceScore", 0) - value(a, "confidenceScore", 0);
    if (mode === "upside") return value(b, "bestCaseWinProbability") - value(a, "bestCaseWinProbability") || value(b, "birdieScore", 0) - value(a, "birdieScore", 0);
    if (mode === "chemistry") return value(b, "chemistryScore", 0) - value(a, "chemistryScore", 0);
    if (mode === "closing") return value(b, "closingScore", 0) - value(a, "closingScore", 0);
    if (mode === "sleeper") {
      const sleeperValue = (row) =>
        value(row, "bestCaseWinProbability", 0) +
        value(row, "closingScore", 50) * .2 -
        value(row, "averageWinProbability", 0) * .25;
      return sleeperValue(b) - sleeperValue(a) || value(b, "averageExpectedPoints") - value(a, "averageExpectedPoints");
    }
    return value(b, "averageExpectedPoints") - value(a, "averageExpectedPoints") || value(b, "averageWinProbability") - value(a, "averageWinProbability");
  });
  return ranked;
}

export function buildLineupPlans({
  bestBall = [],
  scramble = [],
  roundIds = { BB: "BB", SC: "SC" },
} = {}) {
  const make = (id, label, indexes) => {
    const slots = [];
    const add = (format, row, index) => {
      if (!row) return;
      slots.push({
        id: `${id}-${format}-${index}`,
        roundId: roundIds[format] || format,
        format,
        playerIds: row.players.map((player) => player.id),
        label: row.label,
        expectedPoints: row.averageExpectedPoints,
        confidence: row.confidence,
      });
    };
    add("BB", bestBall[indexes.BB] || bestBall[0], 0);
    add("SC", scramble[indexes.SC] || scramble[0], 0);
    const validation = validateLineupPlan(slots);
    return {
      id, label, slots, validation,
      projectedPoints: slots.reduce((sum, slot) => sum + (finite(slot.expectedPoints) ? Number(slot.expectedPoints) : 0), 0),
      confidence: slots.some((slot) => slot.confidence === "LOW") ? "LOW" : slots.every((slot) => slot.confidence === "HIGH") ? "HIGH" : "MODERATE",
    };
  };
  return [
    make("overall", "Best Overall", { BB: 0, SC: 0 }),
    make("safe", "Safest", { BB: Math.min(1, Math.max(0, bestBall.length - 1)), SC: Math.min(1, Math.max(0, scramble.length - 1)) }),
    make("upside", "Highest Upside", { BB: Math.min(2, Math.max(0, bestBall.length - 1)), SC: Math.min(2, Math.max(0, scramble.length - 1)) }),
  ].filter((plan) => plan.slots.length && plan.validation.valid);
}

export function validateLineupPlan(slots = []) {
  const conflicts = [];
  const occupied = new Map();
  for (const slot of slots) {
    for (const playerId of slot.playerIds || []) {
      const key = `${slot.roundId || slot.round || "ROUND"}|${playerId}`;
      if (occupied.has(key)) conflicts.push({ playerId, slots: [occupied.get(key), slot.id] });
      else occupied.set(key, slot.id);
    }
  }
  return { valid: conflicts.length === 0, conflicts };
}

export function deterministicPartnershipSummary(partnership) {
  if (!partnership) return "";
  const sentences = [];
  const best = partnership.bestFormat === "BB" ? "Best Ball" : partnership.bestFormat === "SC" ? "Scramble" : null;
  if (best) sentences.push(`This partnership has produced its strongest official results in ${best}.`);
  if (finite(partnership.holeDifferential)) {
    sentences.push(partnership.holeDifferential > 0
      ? "Its recorded hole differential is positive, showing an ability to win more holes than it loses."
      : "Its recorded hole results have not yet produced a positive differential.");
  }
  if (partnership.confidence === "LOW") sentences.push("The historical sample is limited, so the result should be treated as directional.");
  else if (finite(partnership.closingDifferential) && partnership.closingDifferential > 0) sentences.push("Closing-hole performance is a measurable strength.");
  return sentences.slice(0, 4).join(" ");
}

export function deterministicTeamSummary(edges, teamAName, teamBName, coverageNote = "") {
  const labels = {
    scoring: "scoring",
    matchPlay: "match-play",
    chemistry: "chemistry",
    closing: "closing-hole",
  };
  const advantages = Object.entries(edges)
    .filter(([, edge]) => edge === "TEAM_A" || edge === "TEAM_B")
    .map(([key, edge]) => `${edge === "TEAM_A" ? teamAName : teamBName} holds the ${labels[key] || key} edge`);
  const opening = advantages.length ? `${advantages.slice(0, 2).join(", while ")}.` : "The available categories are closely balanced.";
  return `${opening}${coverageNote ? ` ${coverageNote}` : ""} Category edges describe the data profile, not a certain match result.`.trim();
}

export { mean, finite };
