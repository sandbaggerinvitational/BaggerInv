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

test("upcoming tournaments tell the next supported story without inventing results", () => {
  const moments = tournamentMoments({
    tournament: { ...tournament, status: "Upcoming" },
    rounds: [{ number: 1, label: "Round 1", matches: [{ teeTime: "7:30 AM" }, { teeTime: "7:40 AM" }] }],
  });
  assert.equal(moments[0].id, "pairings-released");
  assert.equal(moments[0].headline, "Round 1 is set.");
  assert.match(moments[0].detail, /2 matches begin at 7:30 AM/);
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
  assert.match(stories.find((item) => item.id === "team-race").headline, /narrow tournament lead/);
  assert.equal(stories.find((item) => item.id === "points-leader").label, "Hot Player");
  assert.equal(stories.find((item) => item.id === "points-leader").detail, "3.00 points through 2 completed matches.");
  assert.match(stories.find((item) => item.id === "undefeated").headline, /remains undefeated/);
  assert.doesNotMatch(stories.find((item) => item.id === "undefeated").detail, /Clay Beltran, Jason Powell/);
  assert.match(stories.find((item) => item.id === "lowest-gross").detail, /^72\.0 is the lowest eligible gross average/);
  assert.equal(stories.some((item) => /comeback|straight holes|fastest/i.test(item.headline)), false);
});

test("closest live match becomes a pressure storyline from trusted live status", () => {
  const stories = tournamentStorylines({ tournament, rounds: [{ number: 2, matches: [
    { round: 2, match: 3, status: "Live", currentHole: 15, liveStatusText: "All Square through 15" },
    { round: 2, match: 4, status: "Live", currentHole: 14, liveStatusText: "Team 1 2 UP through 14" },
  ] }] });
  const closest = stories.find((item) => item.id === "closest-match");
  assert.equal(closest.headline, "Round 2 · Match 3 is All Square through 15.");
  assert.match(closest.detail, /tournament pressure/);
});

test("the first official result becomes a live tournament headline", () => {
  const stories = tournamentStorylines({ tournament, rounds: [{ number: 1, matches: [
    { round: 1, match: 1, status: "Final", matchupWinner: "Team 1", team1Points: 1, team2Points: 0, pointsAvailable: 1 },
    { round: 1, match: 2, status: "Upcoming" },
  ] }] });
  assert.equal(stories.find((item) => item.id === "first-final").headline, "The Pickles put the first result on the board.");
});

test("Singles turns a close team lead into a championship-race headline", () => {
  const stories = tournamentStorylines({ tournament: { ...tournament, currentRound: 3 }, rounds: [] });
  assert.match(stories.find((item) => item.id === "team-race").headline, /championship race/);
});

test("officially tied teams produce a tightest-race story", () => {
  const stories = tournamentStorylines({ tournament: {
    ...tournament,
    teamOne: { name: "The Pickles", score: 3 },
    teamTwo: { name: "Lipp It and Rip It", score: 3 },
  } });
  const race = stories.find((item) => item.id === "team-race");
  assert.equal(race.label, "Tightest Race");
  assert.match(race.headline, /deadlocked/);
});

test("unsupported live data produces no synthetic story", () => {
  assert.deepEqual(tournamentStorylines({ tournament: { status: "Live" }, rounds: [] }), []);
});

test("Home rotation caps a large supported story pool at six prioritized moments", () => {
  const moments = tournamentMoments({
    tournament,
    leaderboard,
    scoreLeaderboard: [
      { id: "clay", entityType: "PLAYER", holes: 18, gross: 72, net: 68 },
      { id: "jason", entityType: "PLAYER", holes: 18, gross: 75, net: 71 },
    ],
    rounds: [
      { number: 1, matches: [{ round: 1, match: 1, status: "Final", team1Points: 1, team2Points: 0, pointsAvailable: 1 }] },
      { number: 2, matches: [{ round: 2, match: 1, status: "Final", team1Points: 1, team2Points: 0, pointsAvailable: 1 }] },
      { number: 3, matches: [{ round: 3, match: 1, status: "Live", currentHole: 16, liveStatusText: "All Square through 16" }] },
    ],
  });
  assert.equal(moments.length, 6);
  assert.equal(moments[0].id, "round-1");
  assert.ok(moments.some((item) => item.id === "closest-match"));
});

test("completed rounds celebrate only fully finalized official results", () => {
  const complete = tournamentStorylines({
    tournament,
    rounds: [{ number: 2, label: "Round 2", matches: [
      { status: "Final", team1Points: 1, team2Points: 0, pointsAvailable: 1 },
      { status: "Final", team1Points: 0.5, team2Points: 0.5, pointsAvailable: 1 },
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
  assert.equal(champion[0].label, "Tournament Champion");
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
  assert.match(source, /Around the Tournament/);
  assert.match(source, /Tournament Headlines/);
  assert.match(source, /No storylines yet\./);
  assert.match(source, /item\.accessibleLabel/);
});
