import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTournamentTimeline,
  featuredMatchModel,
  selectFeaturedMatch,
  tournamentProgressModel,
} from "../lib/live-command-center.js";

const tournament = {
  currentRound: 2,
  teamOne: { name: "The Pickles" },
  teamTwo: { name: "Lipp it and Rip it" },
};

const finalMatch = {
  id: "R1-M1",
  round: 1,
  match: 1,
  status: "Final",
  finalizedAt: "2026-09-25T12:00:00-05:00",
  overallWinner: "Team 1",
  team1Points: 2,
  team2Points: 1,
  pointsAvailable: 3,
};

const liveMatch = {
  id: "R2-M2",
  round: 2,
  match: 2,
  status: "Live",
  currentHole: 11,
  updatedAt: "2026-09-25T14:15:00-05:00",
  liveStatusText: "The Pickles 2 Up",
  team1HolesWon: 5,
  team2HolesWon: 3,
  team1Players: [{ name: "Clay Beltran" }, { name: "Miles Berger" }],
  team2Players: [{ name: "Taylor Lippincott" }, { name: "Chris Michael" }],
  formatName: "Best Ball",
  course: { name: "Cougar Point Golf Course" },
};

const scheduledMatch = {
  id: "R2-M1",
  round: 2,
  match: 1,
  status: "Scheduled",
  teeTime: "2:00 PM",
  team1Players: [{ name: "Jack Keffler" }],
  team2Players: [{ name: "Memo Saldana" }],
  formatName: "Scramble",
  course: { name: "Turtle Point Golf Course" },
};

const rounds = [
  { number: 1, matches: [finalMatch] },
  { number: 2, matches: [scheduledMatch, liveMatch] },
];

test("featured match prioritizes a live match in the current round", () => {
  assert.equal(selectFeaturedMatch({ rounds, currentRound: 2 })?.id, "R2-M2");
  const featured = featuredMatchModel({ rounds, tournament });
  assert.equal(featured.label, "Round 2 · Match 2");
  assert.equal(featured.holeLabel, "Through Hole 11");
  assert.equal(featured.status, "The Pickles 2 Up");
  assert.equal(featured.teamOnePlayers, "Clay Beltran + Miles Berger");
});

test("tournament progress is calculated from official and live match state", () => {
  assert.deepEqual(tournamentProgressModel({ rounds, tournament }), {
    totalMatches: 3,
    completedMatches: 1,
    remainingMatches: 2,
    liveMatches: 1,
    currentRound: 2,
  });
});

test("timeline uses finalized results, live updates, and recorded tee times", () => {
  const events = buildTournamentTimeline({ rounds, tournament });
  assert.deepEqual(new Set(events.map((event) => event.type)), new Set(["FINAL", "LIVE", "TEE_TIME"]));
  assert.match(events.find((event) => event.type === "FINAL").title, /score confirmed/);
  assert.match(events.find((event) => event.type === "LIVE").detail, /2 Up/);
  assert.match(events.find((event) => event.type === "TEE_TIME").detail, /Turtle Point/);
});
