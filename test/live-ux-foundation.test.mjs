import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createRefreshGuard,
  defaultMatchFilter,
  filterEmptyMessage,
  filterMatches,
  matchState,
  relativeUpdatedLabel,
} from "../lib/live-match-ux.js";
import { finalizationReview, hasUnsavedMatchChanges } from "../lib/live-admin-ux.js";

const matches = [
  { id: "scheduled", status: "Scheduled" },
  { id: "live", status: "Live" },
  { id: "final", status: "Final", team1Points: 2, team2Points: 1 },
];

test("match-state filters distinguish scheduled, live, and final matches", () => {
  assert.equal(matchState(matches[0]), "upcoming");
  assert.equal(matchState(matches[1]), "live");
  assert.equal(matchState(matches[2]), "final");
  assert.deepEqual(filterMatches(matches, "live").map((match) => match.id), ["live"]);
  assert.deepEqual(filterMatches(matches, "all").map((match) => match.id), ["scheduled", "live", "final"]);
});

test("default filter favors live, then upcoming, then final", () => {
  assert.equal(defaultMatchFilter(matches), "live");
  assert.equal(defaultMatchFilter([matches[0], matches[2]]), "upcoming");
  assert.equal(defaultMatchFilter([matches[2]]), "final");
  assert.equal(defaultMatchFilter([]), "all");
});

test("empty states and update labels remain useful", () => {
  assert.equal(filterEmptyMessage("live"), "No matches are live right now.");
  assert.equal(filterEmptyMessage("upcoming", { label: "Round 1", matches: [{ teeTime: "7:30 AM" }] }), "Round 1 begins at 7:30 AM.");
  assert.equal(filterEmptyMessage("upcoming", { matches: [] }), "Pairings have not been announced yet.");
  assert.equal(relativeUpdatedLabel(1_000, 12_000), "Updated 11 seconds ago");
});

test("refresh guard prevents overlapping requests and permits a later refresh", async () => {
  let calls = 0;
  let release;
  const guarded = createRefreshGuard(() => { calls += 1; return new Promise((resolve) => { release = resolve; }); });
  const first = guarded();
  const second = guarded();
  assert.equal(first, second);
  assert.equal(calls, 1);
  release("ok");
  await first;
  const third = guarded();
  assert.notEqual(third, first);
  assert.equal(calls, 2);
  release("again");
  await third;
});

test("admin dirty state and finalization review expose critical confirmation details", () => {
  const match = { "Match ID": "2026-R1-1", Notes: "" };
  const draft = {
    Notes: "Ready",
    "Team 1 Player 1": "P1",
    "Team 2 Player 1": "P2",
    "Front 9 Winner": "Team 1",
    "Back 9 Winner": "Halved",
    "18-Hole Winner": "Team 1",
    "Team 1 Points": "2.5",
    "Team 2 Points": ".5",
  };
  assert.equal(hasUnsavedMatchChanges(match, draft, ["Notes"]), true);
  const review = finalizationReview({ match, draft, teamOne: "Pickles", teamTwo: "Crispy Boys", playerNames: { P1: "Alex", P2: "Sam" } });
  assert.equal(review.match, "2026-R1-1");
  assert.equal(review.pairing, "Alex vs Sam");
  assert.equal(review.winner, "Pickles");
  assert.match(review.points, /2\.5/);
});

test("public cards and admin controls expose accessibility-critical states", async () => {
  const [card, center, admin, adminCenter] = await Promise.all([
    readFile(new URL("../app/PublicMatchCard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/MatchCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/live-matches/LiveMatchControl.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminCenter.js", import.meta.url), "utf8"),
  ]);
  assert.match(card, /Pairing announcement coming soon/);
  assert.match(card, /data-match-state/);
  assert.match(card, /Last confirmed/);
  assert.match(center, /aria-label="Filter matches by status"/);
  assert.match(center, /aria-live="polite"/);
  assert.match(admin, /role="dialog"/);
  assert.match(admin, /Unsaved changes/);
  assert.match(admin, /beforeunload/);
  assert.match(adminCenter, /data-live-match-dirty/);
});
