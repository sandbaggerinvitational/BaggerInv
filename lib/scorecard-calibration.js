import { setting } from "./prediction-engine.js";

const CONFIDENCE_ORDER = Object.freeze({
  Insufficient: 0,
  Limited: 1,
  Moderate: 2,
  Strong: 3,
});

const number = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[%,$]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value, places = 2) => Number(value.toFixed(places));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export const SCORECARD_CALIBRATION_DEFAULTS = Object.freeze({
  enabled: false,
  categoryWeight: 10,
  maximumAdjustment: 6,
  minimumConfidence: "Moderate",
  minimumRecordedRounds: 2,
  minimumRecordedHoles: 36,
});

export function scorecardCalibrationSettings(settings = {}) {
  const enabledValue = setting(settings, "Scorecard Influence Enabled", SCORECARD_CALIBRATION_DEFAULTS.enabled);
  return {
    enabled: enabledValue === true || ["TRUE", "YES", "ON", "1"].includes(String(enabledValue).toUpperCase()),
    categoryWeight: Math.max(0, number(setting(settings, "Scorecard Category Weight", SCORECARD_CALIBRATION_DEFAULTS.categoryWeight), 10)),
    maximumAdjustment: Math.max(0, number(setting(settings, "Maximum Scorecard Adjustment", SCORECARD_CALIBRATION_DEFAULTS.maximumAdjustment), 6)),
    minimumConfidence: String(setting(settings, "Minimum Scorecard Confidence", SCORECARD_CALIBRATION_DEFAULTS.minimumConfidence)),
    minimumRecordedRounds: Math.max(0, Math.round(number(setting(settings, "Minimum Scorecard Recorded Rounds", SCORECARD_CALIBRATION_DEFAULTS.minimumRecordedRounds), 2))),
    minimumRecordedHoles: Math.max(0, Math.round(number(setting(settings, "Minimum Scorecard Recorded Holes", SCORECARD_CALIBRATION_DEFAULTS.minimumRecordedHoles), 36))),
  };
}

function sideCourseFit(profiles = []) {
  const usable = profiles.filter((item) => Number.isFinite(item?.courseFit?.score));
  const scores = usable.map((item) => item.courseFit.score);
  const holes = usable.reduce((sum, item) => sum + (item.profile?.holes || 0), 0);
  const rounds = usable.reduce((sum, item) => sum + (item.profile?.rounds || 0), 0);
  const confidence = usable.reduce(
    (lowest, item) => Math.min(lowest, CONFIDENCE_ORDER[item.courseFit?.confidence] ?? 0),
    usable.length ? 3 : 0
  );
  return {
    score: mean(scores),
    holes,
    rounds,
    confidence: Object.keys(CONFIDENCE_ORDER).find((key) => CONFIDENCE_ORDER[key] === confidence) || "Insufficient",
    profiles: usable,
  };
}

/**
 * Shadow-only calibration. It never mutates the supplied prediction and never
 * changes public prediction output. Callers must explicitly display `adjusted`.
 */
export function calculateScorecardCalibration({
  prediction,
  intelligence,
  sideSize = 1,
  settings = {},
} = {}) {
  const config = scorecardCalibrationSettings(settings);
  const profiles = intelligence?.profiles || [];
  const sideA = sideCourseFit(profiles.slice(0, sideSize));
  const sideB = sideCourseFit(profiles.slice(sideSize));
  const requiredConfidence = CONFIDENCE_ORDER[config.minimumConfidence] ?? CONFIDENCE_ORDER.Moderate;
  const reasons = [];
  const samplesPass = [sideA, sideB].every((side) =>
    side.holes >= config.minimumRecordedHoles &&
    side.rounds >= config.minimumRecordedRounds &&
    (CONFIDENCE_ORDER[side.confidence] ?? 0) >= requiredConfidence &&
    Number.isFinite(side.score)
  );

  if (!Number.isFinite(sideA.score) || !Number.isFinite(sideB.score)) {
    reasons.push("Both sides need a recorded course-fit score.");
  }
  if (sideA.holes < config.minimumRecordedHoles || sideB.holes < config.minimumRecordedHoles) {
    reasons.push(`Minimum ${config.minimumRecordedHoles} recorded holes per side not met.`);
  }
  if (sideA.rounds < config.minimumRecordedRounds || sideB.rounds < config.minimumRecordedRounds) {
    reasons.push(`Minimum ${config.minimumRecordedRounds} recorded rounds per side not met.`);
  }
  if ((CONFIDENCE_ORDER[sideA.confidence] ?? 0) < requiredConfidence || (CONFIDENCE_ORDER[sideB.confidence] ?? 0) < requiredConfidence) {
    reasons.push(`Minimum ${config.minimumConfidence} scorecard confidence not met.`);
  }

  const scoreDifference = samplesPass ? sideA.score - sideB.score : 0;
  // Course-fit scores use a -100..100 scale. A full configured category weight
  // therefore converts the difference into percentage points before the cap.
  const uncappedAdjustment = scoreDifference * (config.categoryWeight / 100);
  const adjustment = samplesPass
    ? clamp(uncappedAdjustment, -config.maximumAdjustment, config.maximumAdjustment)
    : 0;
  const existingA = number(prediction?.teamA, 50);
  const existingTie = clamp(number(prediction?.tie, 0), 0, 100);
  const decisivePool = 100 - existingTie;
  const adjustedA = clamp(existingA + adjustment, 0, decisivePool);
  const adjustedB = decisivePool - adjustedA;

  const factors = [
    ...sideA.profiles.flatMap((item) => item.courseFit?.reasons || []).map((detail) => ({ side: "A", detail })),
    ...sideB.profiles.flatMap((item) => item.courseFit?.reasons || []).map((detail) => ({ side: "B", detail })),
  ];

  return {
    mode: "SHADOW",
    publicPredictionChanged: false,
    eligible: samplesPass,
    configuredEnabled: config.enabled,
    existing: { teamA: existingA, teamB: number(prediction?.teamB, decisivePool - existingA), tie: existingTie },
    adjustment: round(adjustment),
    uncappedAdjustment: round(uncappedAdjustment),
    adjusted: { teamA: round(adjustedA), teamB: round(adjustedB), tie: existingTie },
    confidence: samplesPass
      ? (sideA.confidence === "Strong" && sideB.confidence === "Strong" ? "Strong" : "Moderate")
      : "Insufficient",
    sideA,
    sideB,
    factors,
    reasons,
    config,
  };
}

export function predictionOutcomeProbability(prediction, outcome) {
  if (outcome === "A") return number(prediction?.teamA, 0) / 100;
  if (outcome === "B") return number(prediction?.teamB, 0) / 100;
  if (outcome === "TIE") return number(prediction?.tie, 0) / 100;
  return null;
}

export function summarizeCalibrationBacktest(rows = []) {
  const evaluated = rows.filter((row) => row.outcome && row.calibration?.eligible);
  const accuracy = (key) => evaluated.length
    ? evaluated.filter((row) => {
        const prediction = row[key];
        const favorite = prediction.teamA > prediction.teamB ? "A" : prediction.teamB > prediction.teamA ? "B" : "TIE";
        return favorite === row.outcome;
      }).length / evaluated.length
    : null;
  const brier = (key) => evaluated.length
    ? mean(evaluated.map((row) => {
        const probability = predictionOutcomeProbability(row[key], row.outcome);
        return (1 - probability) ** 2;
      }))
    : null;
  const currentAccuracy = accuracy("existing");
  const adjustedAccuracy = accuracy("adjusted");
  const currentBrier = brier("existing");
  const adjustedBrier = brier("adjusted");
  return {
    matches: evaluated.length,
    currentAccuracy: currentAccuracy === null ? null : round(currentAccuracy * 100, 1),
    adjustedAccuracy: adjustedAccuracy === null ? null : round(adjustedAccuracy * 100, 1),
    accuracyChange: currentAccuracy === null ? null : round((adjustedAccuracy - currentAccuracy) * 100, 1),
    currentBrier: currentBrier === null ? null : round(currentBrier, 4),
    adjustedBrier: adjustedBrier === null ? null : round(adjustedBrier, 4),
    brierChange: currentBrier === null ? null : round(adjustedBrier - currentBrier, 4),
  };
}
