import test from "node:test";
import assert from "node:assert/strict";
import {
  clinchingScenariosEligible,
  getRoundProgress,
  getTournamentState,
  getTeamMomentum,
} from "../lib/live-tournament.js";

const finalMatch = (overrides = {}) => ({ status: "Final", pointsAvailable: 3, matchupWinner: "Team 1", ...overrides });

test("round progress uses final status rather than populated results", () => {
  const progress = getRoundProgress({ matches: [finalMatch(), { status: "Live", pointsAvailable: 3, matchupWinner: "Team 2" }] });
  assert.equal(progress.completedMatches, 1);
  assert.equal(progress.liveMatches, 1);
  assert.equal(progress.decidedPoints, 3);
  assert.equal(progress.remainingPoints, 3);
});

test("72-point tournament calculates a strict-majority clinch target", () => {
  const rounds = [{ matches: Array.from({ length: 24 }, (_, index) => ({ status: index < 10 ? "Final" : "Scheduled", pointsAvailable: 3 })) }];
  const state = getTournamentState({ tournament: { teamOne: { score: 33 }, teamTwo: { score: 27 } }, rounds });
  assert.equal(state.totalPoints, 72);
  assert.equal(state.remainingPoints, 42);
  assert.equal(state.teamOne.pointsToClinch, 3.5);
  assert.equal(state.teamOne.pointsToTie, 3);
});

test("tie holder clinches when opponent can only draw level", () => {
  const rounds = [{ matches: [finalMatch(), { status: "Scheduled", pointsAvailable: 3 }] }];
  const state = getTournamentState({ tournament: { teamOne: { score: 3 }, teamTwo: { score: 0 }, tieAdvantageSide: 1 }, rounds });
  assert.equal(state.championSide, 1);
});

test("clinching scenarios require rounds one and two to be complete", () => {
  assert.equal(clinchingScenariosEligible([{ number: 1, matches: [finalMatch()] }, { number: 2, matches: [finalMatch()] }]), true);
  assert.equal(clinchingScenariosEligible([{ number: 1, matches: [finalMatch()] }, { number: 2, matches: [{ status: "Live" }] }]), false);
});

test("momentum ignores scheduled matches", () => {
  const momentum = getTeamMomentum([{ number: 1, matches: [finalMatch({ frontWinner: "Team 1", backWinner: "Team 2", overallWinner: "Team 1" }), { status: "Scheduled", overallWinner: "Team 2" }] }]);
  assert.equal(momentum.teamOne, "Won 2 of the last 3 decided points");
});
