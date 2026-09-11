import assert from "node:assert/strict";
import test from "node:test";
import {
  canScoreMatch,
  createScoringSession,
  verifyScoringSession,
} from "../lib/scoring-access.js";

const secret = "this-is-a-long-isolated-test-secret";

test("match sessions can update only their assigned match", () => {
  const token = createScoringSession({ matchId: "2026-R1-M1", scorerName: "Test Scorer" }, secret);
  const session = verifyScoringSession(token, secret);
  assert.equal(session.scorerName, "Test Scorer");
  assert.equal(canScoreMatch(session, "2026-R1-M1"), true);
  assert.equal(canScoreMatch(session, "2026-R1-M2"), false);
});

test("admin sessions can update every match", () => {
  const token = createScoringSession({ scope: "admin", scorerName: "Commissioner" }, secret);
  const session = verifyScoringSession(token, secret);
  assert.equal(canScoreMatch(session, "any-match"), true);
});

test("tampered sessions are rejected", () => {
  const token = createScoringSession({ matchId: "M1" }, secret);
  assert.throws(() => verifyScoringSession(`${token}x`, secret), /Invalid scoring session/);
});
