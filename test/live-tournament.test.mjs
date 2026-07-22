import test from "node:test";
import assert from "node:assert/strict";
import {
  clinchingScenariosEligible,
  getEffectiveTournamentState,
  getRoundProgress,
  getTournamentState,
  getTeamMomentum,
  isRoundComplete,
} from "../lib/live-tournament.js";

let nextId = 1;
const finalMatch = (overrides = {}) => ({ id: `M-${nextId++}`, round: 1, expectedRoundMatchCount: 1, status: "Final", pointsAvailable: 3, team1Points: 2, team2Points: 1, matchupWinner: "Team 1", ...overrides });

test("round progress uses final status rather than populated results", () => {
  const progress = getRoundProgress({ matches: [finalMatch(), { status: "Live", pointsAvailable: 3, matchupWinner: "Team 2" }] });
  assert.equal(progress.completedMatches, 1);
  assert.equal(progress.liveMatches, 1);
  assert.equal(progress.decidedPoints, 3);
  assert.equal(progress.remainingPoints, 3);
});

test("72-point tournament calculates a strict-majority clinch target", () => {
  const rounds = [{ matches: Array.from({ length: 24 }, (_, index) => ({
    status: index < 10 ? "Final" : "Scheduled",
    pointsAvailable: 3,
    team1Points: index < 10 ? 2 : null,
    team2Points: index < 10 ? 1 : null,
  })) }];
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
  assert.equal(clinchingScenariosEligible([{ number: 1, matches: [finalMatch({ round: 1 })] }, { number: 2, matches: [finalMatch({ round: 2 })] }]), true);
  assert.equal(clinchingScenariosEligible([{ number: 1, matches: [finalMatch({ round: 1 })] }, { number: 2, matches: [{ id: "R2", round: 2, expectedRoundMatchCount: 1, status: "Live" }] }]), false);
});

test("momentum ignores scheduled matches", () => {
  const momentum = getTeamMomentum([{ number: 1, matches: [finalMatch({ frontWinner: "Team 1", backWinner: "Team 2", overallWinner: "Team 1" }), { status: "Scheduled", overallWinner: "Team 2" }] }]);
  assert.equal(momentum.teamOne, "Won 2 of the last 3 decided points");
});

test("an empty or partially finalized round is never complete", () => {
  assert.equal(isRoundComplete(1, []), false);
  assert.equal(isRoundComplete(1, [
    finalMatch({ round: 1, expectedRoundMatchCount: 2 }),
  ]), false);
  assert.equal(isRoundComplete(1, [
    finalMatch({ round: 1, expectedRoundMatchCount: 2 }),
    { id: "R1-2", round: 1, expectedRoundMatchCount: 2, status: "Complete", pointsAvailable: 3, team1Points: 2, team2Points: 1 },
  ]), false);
});

test("automatic state advances only after each official round is finalized", () => {
  const round = (number, status = "Scheduled") => ({
    id: `R${number}`,
    round: number,
    expectedRoundMatchCount: 1,
    status,
    pointsAvailable: 3,
    team1Points: status === "Final" ? 2 : null,
    team2Points: status === "Final" ? 1 : null,
  });
  assert.deepEqual(getEffectiveTournamentState({ matches: [round(1), round(2), round(3)] }).currentRound, 1);
  assert.equal(getEffectiveTournamentState({ matches: [round(1, "Live"), round(2), round(3)] }).status, "LIVE");
  assert.equal(getEffectiveTournamentState({ matches: [round(1, "Final"), round(2), round(3)] }).currentRound, 2);
  assert.equal(getEffectiveTournamentState({ matches: [round(1, "Final"), round(2, "Final"), round(3)] }).currentRound, 3);
  const complete = getEffectiveTournamentState({ matches: [round(1, "Final"), round(2, "Final"), round(3, "Final")] });
  assert.equal(complete.status, "FINAL");
  assert.equal(complete.currentRound, "FINAL");
});

test("manual override prevents automatic advancement", () => {
  const match = finalMatch({ round: 1 });
  const state = getEffectiveTournamentState({ matches: [match], statusMode: "Manual Override", configuredStatus: "Upcoming", configuredRound: 1 });
  assert.equal(state.status, "UPCOMING");
  assert.equal(state.currentRound, 1);
  assert.equal(state.overrideActive, true);
});
