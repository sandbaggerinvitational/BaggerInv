import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { accessCodeMatches, accessTokenMatches, hashAccessCode, hashAccessToken } from "../lib/live-hole-scoring.js";
import { canScoreMatch, createScoringSession, participantSessionMatchesAccess, verifyScoringSession } from "../lib/scoring-access.js";
import manifest from "../app/manifest.js";

const secret = "participant-session-secret-long-enough";
const salt = "participant-access-test-salt";

test("valid participant session unlocks only its assigned active match", () => {
  const token = createScoringSession({ matchId: "M-A", accessVersion: 2, scorerName: "Player" }, secret);
  const session = verifyScoringSession(token, secret);
  const record = { "Match ID": "M-A", "Access Active": "TRUE", "Access Version": 2, "Access Expires At": "2099-01-01T00:00:00Z" };
  assert.equal(participantSessionMatchesAccess(session, record), true);
  assert.equal(canScoreMatch(session, "M-A"), true);
  assert.equal(canScoreMatch(session, "M-B"), false);
});

test("disabled, regenerated, and expired access invalidates the participant session", () => {
  const session = verifyScoringSession(createScoringSession({ matchId: "M-A", accessVersion: 2 }, secret), secret);
  assert.equal(participantSessionMatchesAccess(session, { "Match ID": "M-A", "Access Active": "FALSE", "Access Version": 2 }), false);
  assert.equal(participantSessionMatchesAccess(session, { "Match ID": "M-A", "Access Active": "TRUE", "Access Version": 3 }), false);
  assert.equal(participantSessionMatchesAccess(session, { "Match ID": "M-A", "Access Active": "TRUE", "Access Version": 2, "Access Expires At": "2020-01-01T00:00:00Z" }), false);
});

test("codes and QR tokens are securely matched and invalid values are rejected", () => {
  const codeHash = hashAccessCode("482193", salt);
  const tokenHash = hashAccessToken("secure-random-token", salt);
  assert.equal(accessCodeMatches("482193", codeHash, salt), true);
  assert.equal(accessCodeMatches("000000", codeHash, salt), false);
  assert.equal(accessTokenMatches("secure-random-token", tokenHash, salt), true);
  assert.equal(accessTokenMatches("wrong-token", tokenHash, salt), false);
});

test("participant routes use HTTP-only cookies and server-side current-match authorization", async () => {
  const [session, current, scoreEntry, sheets, adminControl] = await Promise.all([
    readFile(new URL("../app/api/scoring/session/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoring/current/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/live-matches/LiveMatchControl.js", import.meta.url), "utf8"),
  ]);
  assert.match(session, /scoringSessionCookie/);
  assert.match(current, /validateParticipantSession/);
  assert.match(current, /requireWritable/);
  assert.doesNotMatch(scoreEntry, /sessionStorage/);
  assert.match(scoreEntry, /expectedUpdatedAt/);
  assert.match(sheets, /appendDimension/);
  assert.match(sheets, /requiredColumnCount - currentColumnCount/);
  assert.match(adminControl, /key=\{match\["Match ID"\]\}/);
  assert.doesNotMatch(adminControl, /key=\{`\$\{match\["Match ID"\]\}-\$\{match\["Updated At"\]\}/);
});

test("PWA manifest is standalone and uses safe local navigation scope", () => {
  const value = manifest();
  assert.equal(value.display, "standalone");
  assert.equal(value.start_url, "/");
  assert.equal(value.scope, "/");
  assert.ok(value.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(value.icons.some((icon) => icon.sizes === "512x512"));
});
