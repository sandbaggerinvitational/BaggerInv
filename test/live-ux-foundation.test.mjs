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
  resolveMatchFilterEmptyState,
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

test("round empty states explain the tournament lifecycle rather than only the filter", () => {
  const final = { id: "final", status: "Final", team1Points: 2, team2Points: 1 };
  const scheduled = { id: "scheduled", status: "Scheduled", teeTime: "8:10 AM" };
  assert.deepEqual(resolveMatchFilterEmptyState("upcoming", {
    label: "Round 1", status: "Complete", matches: [final],
  }), {
    reason: "round-complete",
    title: "All matches in this round have been completed.",
    detail: "Select Final to review the completed matches.",
  });
  assert.equal(resolveMatchFilterEmptyState("upcoming", {
    label: "Round 2", status: "Live", matches: [{ ...final, id: "one" }],
  }).title, "All matches in this round have been completed.");
  assert.equal(resolveMatchFilterEmptyState("upcoming", {
    label: "Round 2", status: "Live", matches: [{ ...scheduled, status: "Live" }],
  }).title, "No upcoming matches remain in this round.");
  assert.equal(resolveMatchFilterEmptyState("upcoming", {
    label: "Round 3", status: "Upcoming", matches: [scheduled],
  }).title, "Round 3 begins at 8:10 AM.");
});

test("smart empty states distinguish live, final, unconfigured, and generic filter misses", () => {
  assert.equal(resolveMatchFilterEmptyState("live", { status: "Live", matches: [{ status: "Scheduled" }] }).reason, "no-live-matches");
  assert.equal(resolveMatchFilterEmptyState("final", { status: "Upcoming", matches: [{ status: "Scheduled" }] }).reason, "no-final-matches");
  assert.equal(resolveMatchFilterEmptyState("all", { matches: [] }).reason, "no-pairings");
  assert.equal(resolveMatchFilterEmptyState("other", { matches: [{ status: "Scheduled" }] }).reason, "filter-empty");
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
