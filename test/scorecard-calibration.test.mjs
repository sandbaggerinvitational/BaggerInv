import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateScorecardCalibration,
  scorecardCalibrationSettings,
  summarizeCalibrationBacktest,
} from "../lib/scorecard-calibration.js";

function profile(score, confidence = "Strong", holes = 72, rounds = 4) {
  return {
    profile: { holes, rounds },
    courseFit: { score, confidence, reasons: [`Course-fit score ${score}`] },
  };
}

test("calibration remains shadow-only while producing an adjusted prediction", () => {
  const prediction = { teamA: 52, teamB: 36, tie: 12 };
  const result = calculateScorecardCalibration({
    prediction,
    intelligence: { profiles: [profile(30), profile(-20)] },
    sideSize: 1,
    settings: {
      "Scorecard Influence Enabled": "TRUE",
      "Scorecard Category Weight": 10,
      "Maximum Scorecard Adjustment": 4,
      "Minimum Scorecard Confidence": "Moderate",
      "Minimum Scorecard Recorded Rounds": 2,
      "Minimum Scorecard Recorded Holes": 36,
    },
  });
  assert.equal(result.mode, "SHADOW");
  assert.equal(result.publicPredictionChanged, false);
  assert.deepEqual(result.existing, prediction);
  assert.equal(result.adjustment, 4);
  assert.deepEqual(result.adjusted, { teamA: 56, teamB: 32, tie: 12 });
});

test("insufficient scorecard samples are held at zero adjustment", () => {
  const result = calculateScorecardCalibration({
    prediction: { teamA: 50, teamB: 40, tie: 10 },
    intelligence: { profiles: [profile(40, "Limited", 12, 1), profile(-40)] },
    sideSize: 1,
  });
  assert.equal(result.eligible, false);
  assert.equal(result.adjustment, 0);
  assert.equal(result.confidence, "Insufficient");
  assert.ok(result.reasons.length);
});

test("calibration settings expose safe production defaults", () => {
  assert.deepEqual(scorecardCalibrationSettings({}), {
    enabled: false,
    categoryWeight: 10,
    maximumAdjustment: 6,
    minimumConfidence: "Moderate",
    minimumRecordedRounds: 2,
    minimumRecordedHoles: 36,
  });
});

test("backtest compares accuracy and probability quality", () => {
  const backtest = summarizeCalibrationBacktest([
    {
      outcome: "A",
      existing: { teamA: 45, teamB: 45, tie: 10 },
      adjusted: { teamA: 55, teamB: 35, tie: 10 },
      calibration: { eligible: true },
    },
    {
      outcome: "B",
      existing: { teamA: 60, teamB: 30, tie: 10 },
      adjusted: { teamA: 48, teamB: 42, tie: 10 },
      calibration: { eligible: true },
    },
  ]);
  assert.equal(backtest.matches, 2);
  assert.equal(backtest.adjustedAccuracy, 50);
  assert.ok(backtest.adjustedBrier < backtest.currentBrier);
});
