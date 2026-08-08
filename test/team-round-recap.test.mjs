import assert from "node:assert/strict";
import test from "node:test";
import { teamRoundPointsReconcile, teamRoundRecap } from "../lib/team-round-recap.js";

const player = (id, name) => ({ id, name });
const final = (overrides = {}) => ({
  status: "Final",
  team1Players: [player("a", "Clay Beltran"), player("b", "Holman Moores")],
  team2Players: [player("x", "Opponent One"), player("y", "Opponent Two")],
  ...overrides,
});

test("team round recap groups official wins, ties, and losses and reconciles points", () => {
  const round = { number: 1, format: "BB", matches: [
    final({ id: "win", matchupWinner: "Team 1", frontWinner: "Team 1", backWinner: "Team 1", overallWinner: "Team 1", team1Points: 3, team2Points: 0 }),
    final({ id: "tie", matchupWinner: "Halved", frontWinner: "Team 1", backWinner: "Team 2", overallWinner: "Halved", team1Points: 1.5, team2Points: 1.5 }),
    final({ id: "loss", matchupWinner: "Team 2", frontWinner: "Team 2", backWinner: "Halved", overallWinner: "Team 2", team1Points: 0.5, team2Points: 2.5 }),
  ] };
  const recap = teamRoundRecap(round, 1);
  assert.deepEqual([recap.groups.wins.length, recap.groups.ties.length, recap.groups.losses.length], [1, 1, 1]);
  assert.deepEqual(recap.groups.wins[0].segments.map((segment) => segment.points), [1, 1, 1]);
  assert.deepEqual(recap.groups.ties[0].segments.map((segment) => segment.points), [1, 0, 0.5]);
  assert.equal(recap.officialPoints, 5);
  assert.equal(teamRoundPointsReconcile(recap, 5), true);
  assert.equal(teamRoundPointsReconcile(recap, 4.5), false);
  assert.equal(JSON.stringify(recap).includes("Opponent"), false);
});

test("Scramble recap uses the selected side's golfers and official segment points", () => {
  const recap = teamRoundRecap({ number: 2, format: "SC", matches: [final({
    id: "scramble",
    matchupWinner: "Team 2",
    frontWinner: "Team 2",
    backWinner: "Halved",
    overallWinner: "Team 2",
    team1Points: 0.5,
    team2Points: 2.5,
  })] }, 2);
  assert.deepEqual(recap.groups.wins[0].players.map((entry) => entry.name), ["Opponent One", "Opponent Two"]);
  assert.deepEqual(recap.groups.wins[0].segments.map((segment) => segment.points), [1, 0.5, 1]);
  assert.equal(recap.groups.wins[0].totalPoints, 2.5);
  assert.equal(teamRoundPointsReconcile(recap, 2.5), true);
});

test("Singles recap exposes Overall only and keeps unfinished matches in progress", () => {
  const upcoming = teamRoundRecap({ number: 3, format: "SI", matches: [{ status: "Scheduled" }] }, 1);
  assert.equal(upcoming.started, false);
  assert.deepEqual(upcoming.groups, { wins: [], ties: [], losses: [], inProgress: [] });

  const live = teamRoundRecap({ number: 3, format: "SI", matches: [
    final({ id: "single-win", team1Players: [player("a", "Clay Beltran")], team2Players: [player("x", "Opponent One")], matchupWinner: "Team 1", overallWinner: "Team 1", team1Points: 1, team2Points: 0 }),
    { id: "single-live", status: "Live", team1Players: [player("b", "Matthew Smith")], team2Players: [player("y", "Opponent Two")], overallWinner: "", team1Points: null, team2Points: null },
  ] }, 1);
  assert.equal(live.singles, true);
  assert.deepEqual(live.groups.wins[0].segments, [{ label: "Overall", points: 1 }]);
  assert.deepEqual(live.groups.inProgress[0].segments, [{ label: "Overall", points: null }]);
  assert.equal(teamRoundPointsReconcile(live, 1), true);
});

test("long participant names and round labels remain intact for natural UI wrapping", () => {
  const names = [
    "Brian Atkinson", "Matthew Smith", "Chase Patterson", "Chris Micheal",
    "Alex Monteleone", "Miles Berger", "Lipp it and Rip it",
  ];
  const recap = teamRoundRecap({ number: 1, label: "Round 1", format: "Best Ball", matches: [final({
    id: "long-names",
    matchupWinner: "Team 1",
    frontWinner: "Team 1",
    backWinner: "Team 2",
    overallWinner: "Team 1",
    team1Points: 2,
    team2Points: 1,
    team1Players: [player("long-1", names[0]), player("long-2", names[1])],
  })] }, 1);
  assert.equal(recap.groups.wins[0].players.map((entry) => entry.name).join(" & "), "Brian Atkinson & Matthew Smith");
  for (const value of names) assert.equal(value.includes(" "), true);
  for (const label of ["Round 1 • Best Ball", "Round 2 • Scramble", "Round 3 • Singles"]) assert.equal(label.includes(" • "), true);
});
