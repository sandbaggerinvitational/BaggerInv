import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMatchupScorecardIntelligence,
  buildPartnershipScoring,
  buildRecordedScoringProfile,
  HOLE_YARDAGE_BANDS,
  SCORECARD_PREDICTION_INFLUENCE_ENABLED,
  scorecardConfidence,
} from "../lib/scorecard-intelligence.js";

function card({ playerId, matchId = "M1", format = "SI", team = false, partners = [], scores = Array(18).fill(4) }) {
  const holes = scores.map((score, index) => ({
    holeNumber: index + 1,
    score,
    par: index % 6 === 0 ? 5 : index % 3 === 0 ? 3 : 4,
    yardage: index % 6 === 0 ? 540 : index % 3 === 0 ? 180 : 410,
    strokeIndex: index + 1,
    toPar: score - (index % 6 === 0 ? 5 : index % 3 === 0 ? 3 : 4),
  }));
  return {
    playerId: team ? undefined : playerId,
    playerName: playerId,
    matchId,
    year: 2025,
    format,
    scoreType: team ? "TEAM" : "INDIVIDUAL",
    participantPlayerIds: team ? partners : [playerId],
    courseId: "C1",
    tee: "Black",
    holes,
    total: scores.reduce((sum, value) => sum + value, 0),
    totalToPar: holes.reduce((sum, hole) => sum + hole.toPar, 0),
    frontNine: scores.slice(0, 9).reduce((sum, value) => sum + value, 0),
    backNine: scores.slice(9).reduce((sum, value) => sum + value, 0),
  };
}

test("confidence thresholds and yardage configuration are centralized", () => {
  assert.equal(scorecardConfidence({ holes: 5 }), "Insufficient");
  assert.equal(scorecardConfidence({ holes: 6 }), "Limited");
  assert.equal(scorecardConfidence({ holes: 18 }), "Moderate");
  assert.equal(scorecardConfidence({ holes: 36 }), "Strong");
  assert.equal(HOLE_YARDAGE_BANDS[4][1].min, 390);
});

test("individual profile never includes team-only scramble scorecards", () => {
  const profile = buildRecordedScoringProfile([
    card({ playerId: "P1" }),
    card({ team: true, format: "SC", partners: ["P1", "P2"], scores: Array(18).fill(3) }),
  ]);
  assert.equal(profile.rounds, 1);
  assert.equal(profile.holes, 18);
});

test("partnership scoring uses only actual shared matches", () => {
  const scorecards = [
    card({ playerId: "P1", matchId: "TOGETHER", format: "BB" }),
    card({ playerId: "P2", matchId: "TOGETHER", format: "BB" }),
    card({ playerId: "P1", matchId: "OTHER", format: "BB" }),
    card({ playerId: "P3", matchId: "OTHER", format: "BB" }),
  ];
  const partnership = buildPartnershipScoring(scorecards, ["P1", "P2"], "BB");
  assert.equal(partnership.scorecards, 2);
  assert.equal(partnership.holes, 36);
});

test("matchup intelligence remains isolated from prediction", () => {
  const intelligence = buildMatchupScorecardIntelligence({
    scorecards: [card({ playerId: "P1" }), card({ playerId: "P2", matchId: "M2" })],
    playerIds: ["P1", "P2"],
    sideSize: 1,
    format: "SI",
    selectedHoles: card({ playerId: "X" }).holes,
    courseId: "C1",
    tee: "Black",
  });
  assert.equal(SCORECARD_PREDICTION_INFLUENCE_ENABLED, false);
  assert.equal(intelligence.predictionInfluenceEnabled, false);
  assert.equal(intelligence.available, true);
});
