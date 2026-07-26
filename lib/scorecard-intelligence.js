const clean = (value) => String(value ?? "").trim();
const same = (a, b) => clean(a).toUpperCase() === clean(b).toUpperCase();
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const deviation = (values) => {
  if (values.length < 2) return null;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};
const percent = (count, total) => total ? (count / total) * 100 : null;
const round = (value, places = 2) => value === null ? null : Number(value.toFixed(places));

export const SCORECARD_PREDICTION_INFLUENCE_ENABLED = false;

export const SCORECARD_CONFIDENCE_THRESHOLDS = Object.freeze({
  holes: Object.freeze({ limited: 6, moderate: 18, strong: 36 }),
  rounds: Object.freeze({ limited: 1, moderate: 3, strong: 6 }),
});

export const HOLE_YARDAGE_BANDS = Object.freeze({
  3: Object.freeze([
    { key: "short", label: "Short Par 3", min: 0, max: 164 },
    { key: "medium", label: "Medium Par 3", min: 165, max: 199 },
    { key: "long", label: "Long Par 3", min: 200, max: Infinity },
  ]),
  4: Object.freeze([
    { key: "short", label: "Short Par 4", min: 0, max: 389 },
    { key: "medium", label: "Medium Par 4", min: 390, max: 439 },
    { key: "long", label: "Long Par 4", min: 440, max: Infinity },
  ]),
  5: Object.freeze([
    { key: "short", label: "Short Par 5", min: 0, max: 524 },
    { key: "medium", label: "Medium Par 5", min: 525, max: 559 },
    { key: "long", label: "Long Par 5", min: 560, max: Infinity },
  ]),
});

export function scorecardConfidence({ holes = 0, rounds = 0, type = "holes" } = {}) {
  const value = type === "rounds" ? rounds : holes;
  const limits = SCORECARD_CONFIDENCE_THRESHOLDS[type];
  if (value < limits.limited) return "Insufficient";
  if (value < limits.moderate) return "Limited";
  if (value < limits.strong) return "Moderate";
  return "Strong";
}

function normalizedHoles(scorecards) {
  return scorecards.flatMap((scorecard) =>
    scorecard.holes
      .filter((hole) => hole.score !== null)
      .map((hole) => ({ ...hole, year: scorecard.year, courseId: scorecard.courseId, tee: scorecard.tee }))
  );
}

function holeSummary(holes) {
  const toPar = holes.map((hole) => hole.toPar).filter(Number.isFinite);
  const scores = holes.map((hole) => hole.score).filter(Number.isFinite);
  return {
    holes: holes.length,
    average: round(mean(scores)),
    averageToPar: round(mean(toPar)),
    birdieOrBetterPercent: round(percent(toPar.filter((value) => value <= -1).length, toPar.length), 1),
    parPercent: round(percent(toPar.filter((value) => value === 0).length, toPar.length), 1),
    bogeyPercent: round(percent(toPar.filter((value) => value === 1).length, toPar.length), 1),
    doubleOrWorsePercent: round(percent(toPar.filter((value) => value >= 2).length, toPar.length), 1),
    volatility: round(deviation(toPar)),
    confidence: scorecardConfidence({ holes: holes.length }),
  };
}

function bandForHole(hole) {
  return (HOLE_YARDAGE_BANDS[hole.par] || []).find((band) =>
    Number.isFinite(hole.yardage) && hole.yardage >= band.min && hole.yardage <= band.max
  );
}

export function buildRecordedScoringProfile(scorecards = []) {
  const cards = scorecards.filter((card) => card.scoreType === "INDIVIDUAL");
  const holes = normalizedHoles(cards);
  const complete = cards.filter((card) => card.total !== null);
  const nines = cards.flatMap((card) => [card.frontNine, card.backNine]).filter(Number.isFinite);
  const category = (predicate) => holeSummary(holes.filter(predicate));
  const yardage = {};
  for (const par of [3, 4, 5]) {
    for (const band of HOLE_YARDAGE_BANDS[par]) {
      yardage[`${par}-${band.key}`] = { label: band.label, ...category((hole) => hole.par === par && bandForHole(hole)?.key === band.key) };
    }
  }
  const overall = holeSummary(holes);
  const years = [...new Set(cards.map((card) => card.year).filter(Boolean))].sort();
  return {
    ...overall,
    rounds: complete.length,
    scorecards: cards.length,
    years,
    yearsLabel: years.length ? `${years[0]}${years.length > 1 ? `–${years.at(-1)}` : ""}` : "None",
    grossScoringAverage: round(mean(complete.map((card) => card.total))),
    averageRoundToPar: round(mean(complete.map((card) => card.totalToPar).filter(Number.isFinite))),
    frontNineAverage: round(mean(cards.map((card) => card.frontNine).filter(Number.isFinite))),
    backNineAverage: round(mean(cards.map((card) => card.backNine).filter(Number.isFinite))),
    closingAverage: category((hole) => hole.holeNumber >= 15).average,
    bestRound: complete.length ? Math.min(...complete.map((card) => card.total)) : null,
    bestNine: nines.length ? Math.min(...nines) : null,
    par3: category((hole) => hole.par === 3),
    par4: category((hole) => hole.par === 4),
    par5: category((hole) => hole.par === 5),
    front: category((hole) => hole.holeNumber <= 9),
    back: category((hole) => hole.holeNumber >= 10),
    closing: category((hole) => hole.holeNumber >= 15),
    difficult: category((hole) => Number.isFinite(hole.strokeIndex) && hole.strokeIndex <= 6),
    easier: category((hole) => Number.isFinite(hole.strokeIndex) && hole.strokeIndex >= 13),
    yardage,
    roundConfidence: scorecardConfidence({ rounds: complete.length, type: "rounds" }),
    consistencyLabel: overall.volatility === null ? "Unknown" : overall.volatility <= .8 ? "More Consistent" : overall.volatility >= 1.15 ? "Higher Variance" : "Balanced",
    birdieUpside: overall.birdieOrBetterPercent === null ? "Unknown" : overall.birdieOrBetterPercent >= 18 ? "High" : overall.birdieOrBetterPercent >= 10 ? "Moderate" : "Limited",
    bogeyAvoidance: overall.bogeyPercent === null || overall.doubleOrWorsePercent === null ? null : round(100 - overall.bogeyPercent - overall.doubleOrWorsePercent, 1),
    doubleBogeyRisk: overall.doubleOrWorsePercent === null ? "Unknown" : overall.doubleOrWorsePercent >= 12 ? "Elevated" : overall.doubleOrWorsePercent >= 6 ? "Moderate" : "Low",
  };
}

export function buildScrambleTeamPerformance(scorecards = [], playerIds = []) {
  const ids = playerIds.map(clean).filter(Boolean);
  const cards = scorecards.filter((card) =>
    card.scoreType === "TEAM" && ids.every((id) => card.participantPlayerIds?.some((candidate) => same(candidate, id)))
  );
  const profile = buildTeamProfile(cards);
  return { ...profile, playerIds: ids };
}

function buildTeamProfile(cards) {
  const holes = normalizedHoles(cards);
  const complete = cards.filter((card) => card.total !== null);
  const summary = holeSummary(holes);
  return {
    ...summary,
    rounds: complete.length,
    scorecards: cards.length,
    averageRound: round(mean(complete.map((card) => card.total))),
    averageRoundToPar: round(mean(complete.map((card) => card.totalToPar).filter(Number.isFinite))),
    bestRound: complete.length ? Math.min(...complete.map((card) => card.total)) : null,
    bogeyAvoidancePercent: summary.bogeyPercent === null || summary.doubleOrWorsePercent === null
      ? null : round(100 - summary.bogeyPercent - summary.doubleOrWorsePercent, 1),
    closingAverage: holeSummary(holes.filter((hole) => hole.holeNumber >= 15)).average,
    years: [...new Set(cards.map((card) => card.year).filter(Boolean))].sort(),
  };
}

export function buildPartnershipScoring(scorecards = [], playerIds = [], format = "") {
  const ids = playerIds.map(clean).filter(Boolean);
  if (ids.length !== 2) return buildTeamProfile([]);
  let cards;
  if (format === "SC") {
    cards = scorecards.filter((card) =>
      card.scoreType === "TEAM" &&
      card.format === "SC" &&
      ids.every((id) => card.participantPlayerIds?.some((candidate) => same(candidate, id)))
    );
  } else {
    const sharedMatches = [...new Set(scorecards
      .filter((card) => card.format === format && card.scoreType === "INDIVIDUAL" && ids.some((id) => same(card.playerId, id)))
      .map((card) => card.matchId))]
      .filter((matchId) => ids.every((id) => scorecards.some((card) =>
        card.matchId === matchId && card.scoreType === "INDIVIDUAL" && same(card.playerId, id)
      )));
    // Best Ball has individual rows. Retain the valid shared-round sample without
    // fabricating a team gross score from two unrelated player totals.
    cards = scorecards.filter((card) =>
      sharedMatches.includes(card.matchId) && card.scoreType === "INDIVIDUAL" && ids.some((id) => same(card.playerId, id))
    );
  }
  return { ...buildTeamProfile(cards), playerIds: ids, format };
}

function fieldSummary(scorecards, predicate = () => true) {
  return holeSummary(normalizedHoles(scorecards.filter((card) => card.scoreType === "INDIVIDUAL")).filter(predicate));
}

export function buildCourseFit(profile, selectedHoles = [], playerScorecards = [], fieldScorecards = [], courseId = "", tee = "") {
  if (!profile?.holes || !selectedHoles.length) {
    return { signal: "Insufficient Data", score: null, reasons: [], confidence: "Insufficient", holes: profile?.holes || 0 };
  }
  const courseCounts = selectedHoles.reduce((counts, hole) => {
    const par = Number(hole.Par ?? hole.par);
    const yardage = Number(hole.Yardage ?? hole.yardage);
    const strokeIndex = Number(hole["Stroke Index"] ?? hole.strokeIndex);
    counts[`par${par}`] = (counts[`par${par}`] || 0) + 1;
    const band = bandForHole({ par, yardage });
    if (band) counts[`${par}-${band.key}`] = (counts[`${par}-${band.key}`] || 0) + 1;
    if (strokeIndex <= 6) counts.difficult = (counts.difficult || 0) + 1;
    return counts;
  }, {});
  const components = [
    ["Par-3 performance", profile.par3, courseCounts.par3 || 0],
    ["Par-4 performance", profile.par4, courseCounts.par4 || 0],
    ["Par-5 performance", profile.par5, courseCounts.par5 || 0],
    ["Closing stretch", profile.closing, 4],
    ["Difficult-hole performance", profile.difficult, courseCounts.difficult || 0],
  ].filter(([, metric, exposure]) => exposure && metric?.holes >= 6);
  const weighted = components.map(([, metric, exposure]) => (metric.averageToPar || 0) * exposure);
  const score = weighted.length ? Math.max(-100, Math.min(100, round(-mean(weighted) * 18, 0))) : null;
  const signal = score === null ? "Insufficient Data" : score >= 12 ? "Favorable" : score <= -12 ? "Challenging" : "Neutral";
  const courseHistory = playerScorecards.filter((card) => same(card.courseId, courseId));
  const teeHistory = courseHistory.filter((card) => same(card.tee, tee));
  const comparableField = fieldScorecards.filter((card) => same(card.courseId, courseId) && same(card.tee, tee));
  const fieldBaseline = comparableField.length ? fieldSummary(comparableField) : null;
  const reasons = components
    .sort((a, b) => b[2] - a[2])
    .slice(0, 3)
    .map(([label, metric]) => `${label}: ${metric.averageToPar >= 0 ? "+" : ""}${metric.averageToPar?.toFixed(2)} per recorded hole (${metric.holes} holes)`);
  return {
    signal,
    score,
    reasons,
    holes: profile.holes,
    rounds: profile.rounds,
    confidence: scorecardConfidence({ holes: Math.min(profile.holes, components.reduce((sum, [, metric]) => sum + metric.holes, 0)) }),
    courseRounds: courseHistory.filter((card) => card.total !== null).length,
    courseTeeRounds: teeHistory.filter((card) => card.total !== null).length,
    fieldBaseline,
    versusRecordedField: !Number.isFinite(fieldBaseline?.averageToPar) || !Number.isFinite(profile.averageToPar)
      ? null
      : round(profile.averageToPar - fieldBaseline.averageToPar),
  };
}

export function buildMatchupScorecardIntelligence({
  scorecards = [], playerIds = [], sideSize = 1, format = "", selectedHoles = [], courseId = "", tee = "",
} = {}) {
  const profiles = playerIds.map((playerId) => {
    const cards = scorecards.filter((card) => card.scoreType === "INDIVIDUAL" && same(card.playerId, playerId));
    const profile = buildRecordedScoringProfile(cards);
    return { playerId, profile, courseFit: buildCourseFit(profile, selectedHoles, cards, scorecards, courseId, tee) };
  });
  const sides = [playerIds.slice(0, sideSize), playerIds.slice(sideSize)];
  const partnerships = format === "SI" ? [] : sides.map((ids) => buildPartnershipScoring(scorecards, ids, format));
  const availableProfiles = profiles.filter((item) => item.profile.holes);
  const insights = [];
  for (const item of availableProfiles) {
    const name = scorecards.find((card) => same(card.playerId, item.playerId))?.playerName || item.playerId;
    if (item.profile.par5.holes >= 6 && item.profile.par5.birdieOrBetterPercent >= 15) {
      insights.push({ title: "Birdie Upside", body: `${name} has made birdie or better on ${item.profile.par5.birdieOrBetterPercent.toFixed(1)}% of ${item.profile.par5.holes} recorded Par-5 holes.`, confidence: item.profile.par5.confidence });
    }
    if (item.profile.closing.holes >= 6 && item.profile.closing.averageToPar > .35) {
      insights.push({ title: "Closing-Hole Watch", body: `${name} has averaged +${item.profile.closing.averageToPar.toFixed(2)} per recorded hole from 15–18. Treat this as a ${item.profile.closing.confidence.toLowerCase()}-sample signal.`, confidence: item.profile.closing.confidence });
    }
    if (item.courseFit.signal !== "Insufficient Data" && item.courseFit.confidence !== "Insufficient") {
      insights.push({ title: "Course Profile", body: `${name} carries a ${item.courseFit.signal.toLowerCase()} recorded course-fit signal for this hole profile. This is descriptive and does not affect the displayed win probability.`, confidence: item.courseFit.confidence });
    }
  }
  return {
    predictionInfluenceEnabled: SCORECARD_PREDICTION_INFLUENCE_ENABLED,
    profiles,
    partnerships,
    insights: insights.slice(0, 3),
    available: availableProfiles.length > 0 || partnerships.some((item) => item.holes),
    incompleteComparison: availableProfiles.length > 0 && availableProfiles.length < playerIds.length,
  };
}

export function evaluateScorecardIntelligenceHealth(intelligence, { selectedHoles = [], courseId = "", tee = "" } = {}) {
  const issues = [];
  if (courseId && !selectedHoles.length) issues.push({ code: "Course Fit requested without Course Holes mapping", details: `${courseId}${tee ? ` / ${tee}` : ""}` });
  for (const item of intelligence?.profiles || []) {
    if (item.profile.holes && !item.profile.confidence) issues.push({ code: "War Room scorecard metric missing sample size", details: item.playerId });
  }
  for (const insight of intelligence?.insights || []) {
    if (insight.confidence === "Insufficient") issues.push({ code: "Scorecard insight generated below minimum threshold", details: insight.title });
  }
  return issues;
}
