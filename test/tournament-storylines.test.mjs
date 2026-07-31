import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { tournamentMoments, tournamentStorylines } from "../lib/tournament-storylines.js";

const tournament = {
  status: "Live",
  teamOne: { name: "The Pickles", score: 3 },
  teamTwo: { name: "Lipp It and Rip It", score: 2 },
};

const leaderboard = [
  { id: "clay", player: "Clay Beltran", wins: 2, losses: 0, halves: 0, points: 3, matchesPlayed: 2 },
  { id: "jason", player: "Jason Powell", wins: 1, losses: 1, halves: 0, points: 2.5, matchesPlayed: 2 },
];

test("upcoming tournaments intentionally have no moments", () => {
  assert.deepEqual(tournamentMoments({ tournament: { ...tournament, status: "Upcoming" }, leaderboard }), []);
});

test("live moments turn official standings into concise narratives", () => {
  const stories = tournamentStorylines({
    tournament,
    leaderboard,
    scoreLeaderboard: [
      { id: "clay", entityType: "PLAYER", holes: 18, gross: 72, net: 68 },
      { id: "jason", entityType: "PLAYER", holes: 18, gross: 75, net: 71 },
    ],
    rounds: [],
  });
  assert.match(stories.find((item) => item.id === "team-race").headline, /lead the tournament/);
  assert.equal(stories.find((item) => item.id === "points-leader").detail, "3.00 individual points from an official 2-0-0 record.");
  assert.match(stories.find((item) => item.id === "undefeated").headline, /remains undefeated/);
  assert.match(stories.find((item) => item.id === "lowest-gross").detail, /^72\.0/);
  assert.equal(stories.some((item) => /comeback|straight holes|fastest/i.test(item.headline)), false);
});

test("completed rounds celebrate only fully finalized official results", () => {
  const complete = tournamentStorylines({
    tournament,
    rounds: [{ number: 2, label: "Round 2", matches: [
      { status: "Final", team1Points: 1, team2Points: 0 },
      { status: "Final", team1Points: 0.5, team2Points: 0.5 },
    ] }],
  });
  assert.equal(complete.find((item) => item.id === "round-2").headline, "The Pickles clinched Round 2.");
  assert.equal(complete[0].id, "round-2");

  const incomplete = tournamentStorylines({
    tournament,
    rounds: [{ number: 2, matches: [{ status: "Final" }, { status: "Live" }] }],
  });
  assert.equal(incomplete.some((item) => item.id === "round-2"), false);
});

test("completed tournament celebrates champion or official tie", () => {
  const champion = tournamentStorylines({ tournament: { ...tournament, status: "Final" } });
  assert.match(champion[0].headline, /win the Sandbagger Invitational/);
  const tied = tournamentStorylines({ tournament: {
    ...tournament, status: "Final", teamOne: { name: "The Pickles", score: 3 }, teamTwo: { name: "Lipp It and Rip It", score: 3 },
  } });
  assert.equal(tied[0].headline, "The tournament finishes tied.");
});

test("Tournament Moments are manual swipeable cards, never a scrolling ticker", async () => {
  const source = await readFile(new URL("../app/TournamentMoments.js", import.meta.url), "utf8");
  assert.match(source, /Previous tournament moment/);
  assert.match(source, /Next tournament moment/);
  assert.match(source, /onTouchStart/);
  assert.match(source, /onTouchEnd/);
  assert.doesNotMatch(source, /setInterval|marquee/);
  assert.match(source, /No moments yet\./);
});

test("Home places Tournament Moments immediately beneath Tournament Pulse", async () => {
  const [home, commandCenter] = await Promise.all([
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
  ]);
  assert.match(commandCenter, /tournamentMoments\(liveData\)/);
  assert.match(commandCenter, /<TournamentMoments moments=\{moments\}/);
  assert.ok(home.indexOf("{tournamentPulse}") < home.indexOf("{tournamentMoments}"));
  assert.ok(home.indexOf("{tournamentMoments}") < home.indexOf("<MyRounds"));
});

test("Insights consume the same shared storyline model and explain why data matters", async () => {
  const source = await readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8");
  assert.match(source, /tournamentStorylines\(data\)/);
  assert.match(source, /Why this tournament matters/);
  assert.match(source, /No storylines yet\./);
  assert.match(source, /hasTeamRace = Number\(insights\.teamLeader\?\.points\) > 0/);
});
