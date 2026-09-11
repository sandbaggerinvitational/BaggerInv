import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  countdownParts,
  matchAction,
  selectRelevantPlayerMatches,
} from "../lib/player-home.js";

test("an in-progress player match is prioritized", () => {
  const result = selectRelevantPlayerMatches([
    { matchId: "future", round: 2, status: "Scheduled", teeTimeAt: "2026-09-26T12:00:00-05:00" },
    { matchId: "live", round: 1, status: "Live", currentHole: 8 },
    { matchId: "open", round: 1, status: "Scheduled", scoringEnabled: true },
  ], 1);
  assert.equal(result.primary.matchId, "live");
});

test("an open current-round match is preferred over upcoming matches", () => {
  const result = selectRelevantPlayerMatches([
    { matchId: "future", round: 2, status: "Scheduled" },
    { matchId: "open", round: 1, status: "Scheduled", scoringEnabled: true },
  ], 1);
  assert.equal(result.primary.matchId, "open");
});

test("multiple simultaneously open matches require an explicit choice", () => {
  const result = selectRelevantPlayerMatches([
    { matchId: "a", round: 1, scoringEnabled: true },
    { matchId: "b", round: 1, scoringEnabled: true },
  ], 1);
  assert.equal(result.primary, null);
  assert.deepEqual(result.choices.map((match) => match.matchId), ["a", "b"]);
});

test("final and locked matches use safe non-editing actions", () => {
  assert.deepEqual(matchAction({ status: "Final" }), {
    label: "View Match Result", enabled: true, kind: "result",
  });
  assert.deepEqual(matchAction({ status: "Locked", accessActive: false }), {
    label: "Scoring Locked", enabled: false, kind: "locked",
  });
});

test("countdown never returns a negative duration", () => {
  assert.equal(countdownParts("2026-09-25T07:40:00-05:00", Date.parse("2026-09-25T08:00:00-05:00")), null);
  assert.equal(
    countdownParts("2026-09-25T07:40:00-05:00", Date.parse("2026-09-25T06:58:00-05:00")).label,
    "Tee time in 42 minutes",
  );
});

test("personalized home keeps Passport authorization server-side", async () => {
  const [component, route, commandCenter] = await Promise.all([
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/matches/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
  ]);
  assert.match(commandCenter, /PersonalizedPlayerHome/);
  assert.match(component, /api\/player-passport\/matches/);
  assert.match(component, /This isn’t me/);
  assert.match(component, /My Schedule/);
  assert.match(route, /authorizePassportMatch/);
  assert.match(route, /verifyPlayerPassportSession/);
});

test("the public Tournament Command Center remains when no Passport exists", async () => {
  const component = await readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8");
  assert.ok(component.includes('if (state === "public") return null'));
});
