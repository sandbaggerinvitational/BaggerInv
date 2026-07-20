import test from "node:test";
import assert from "node:assert/strict";
import { allocateStrokes, courseHandicap, formatCode, playingHandicaps, predict, teamVibesForPlayers, teamVibesTier } from "../lib/prediction-engine.js";

test("normalizes supported match formats", () => {
  assert.equal(formatCode("Best Ball"), "BB");
  assert.equal(formatCode("2-man scramble"), "SC");
  assert.equal(formatCode("Singles"), "SI");
});

test("calculates course and singles handicaps", () => {
  assert.equal(courseHandicap(10, 72, 113, 72), 10);
  assert.deepEqual(playingHandicaps("Singles", [7, 11]).playerStrokes, [0, 4]);
});

test("allocates strokes in stroke-index order", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({ Hole: index + 1, "Stroke Index": 18 - index }));
  const result = allocateStrokes(2, holes);
  assert.equal(result[17], 1);
  assert.equal(result[16], 1);
  assert.equal(result.reduce((sum, value) => sum + value, 0), 2);
});

test("predictions remain bounded and total 100", () => {
  const players = [{ id: "a" }, { id: "b" }];
  const historical = {
    a: { records: { overall: { matches: 10, wins: 7, halves: 1, points: 7.5 }, SI: { matches: 5, wins: 4, halves: 0 } }, appearances: [1, 2] },
    b: { records: { overall: { matches: 10, wins: 3, halves: 1, points: 3.5 }, SI: { matches: 5, wins: 1, halves: 0 } }, appearances: [1, 2] },
  };
  const result = predict({
    format: "Singles", players, historical, partnership: {}, headToHead: {},
    handicap: { strokesA: 0, strokesB: 2 }, settings: {}, teamNames: ["Blue", "Red"],
  });
  assert.equal(result.teamA + result.teamB + result.tie, 100);
  assert.ok([result.teamA, result.teamB, result.tie].every((value) => value >= 0 && value <= 100));
});

test("format-specific SBR provides the baseline player-strength edge", () => {
  const historical = {
    a: { records:{overall:{matches:8}}, appearances:[1], sandbaggerRatings:{OVERALL:{rating:1600,matches:8},SI:{rating:1700,matches:8}} },
    b: { records:{overall:{matches:8}}, appearances:[1], sandbaggerRatings:{OVERALL:{rating:1500,matches:8},SI:{rating:1450,matches:8}} },
  };
  const result=predict({format:"SI",players:[{id:"a"},{id:"b"}],historical,partnership:{},headToHead:{},handicap:{strokesA:0,strokesB:0},settings:{},teamNames:["A","B"]});
  assert.ok(result.components.player[0] > result.components.player[1]);
  assert.ok(result.teamA > result.teamB);
});

test("Team Vibes weights same-format and overall partnership history", () => {
  const partnership = {
    "a|b": {
      record: { matches: 10, wins: 6, halves: 0, points: 6 },
      byFormat: { BB: { matches: 4, wins: 3, halves: 0, points: 3 } },
    },
  };
  const vibes = teamVibesForPlayers("BB", ["b", "a"], partnership);
  assert.equal(vibes.score, 69.75);
  assert.equal(vibes.known, true);
  assert.deepEqual(teamVibesTier(vibes), { label: "Good", icon: "🙂" });
});

test("Team Vibes marks pairs without history as unknown", () => {
  const vibes = teamVibesForPlayers("BB", ["a", "b"], {});
  assert.equal(vibes.known, false);
  assert.deepEqual(teamVibesTier(vibes), { label: "Unknown", icon: "🤔" });
});

test("Tournament Experience favors veterans over rookies", () => {
  const players = [{ id: "veteran" }, { id: "rookie" }];
  const historical = {
    veteran: { records: { overall: { matches: 0 } }, appearances: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] },
    rookie: { records: { overall: { matches: 0 } }, appearances: [] },
  };
  const result = predict({
    format: "Singles", players, historical, partnership: {}, headToHead: {},
    handicap: { strokesA: 0, strokesB: 0 }, settings: {}, teamNames: ["Veterans", "Rookies"],
  });
  const experience = result.contributions.find((item) => item.id === "tournament");
  assert.equal(Number(experience.teamA.toFixed(2)), 83.33);
  assert.equal(Number(experience.teamB.toFixed(2)), 16.67);
  assert.equal(experience.advantage, "Veterans");
});
