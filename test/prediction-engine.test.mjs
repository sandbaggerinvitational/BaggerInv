import test from "node:test";
import assert from "node:assert/strict";
import { PREDICTION_SETTING_DEFAULTS, allocateStrokes, courseHandicap, formatCode, playingHandicaps, predict, settingsMap, teamVibesForPlayers, teamVibesTier } from "../lib/prediction-engine.js";

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

test("recalibrated prediction defaults match the approved category weights", () => {
  assert.deepEqual({
    handicap: PREDICTION_SETTING_DEFAULTS["Handicap Category Weight"],
    player: PREDICTION_SETTING_DEFAULTS["Player Category Weight"],
    team: PREDICTION_SETTING_DEFAULTS["Team Category Weight"],
    opponent: PREDICTION_SETTING_DEFAULTS["Opponent Category Weight"],
    tournament: PREDICTION_SETTING_DEFAULTS["Tournament Category Weight"],
  }, { handicap: 12, player: 42, team: 28, opponent: 13, tournament: 5 });
  assert.deepEqual({
    format: PREDICTION_SETTING_DEFAULTS["Format Win Percentage"],
    overall: PREDICTION_SETTING_DEFAULTS["Overall Win Percentage"],
    recent: PREDICTION_SETTING_DEFAULTS["Recent Form"],
    averagePoints: PREDICTION_SETTING_DEFAULTS["Average Points Per Match"],
    careerPoints: PREDICTION_SETTING_DEFAULTS["Career Points"],
    experience: PREDICTION_SETTING_DEFAULTS["Tournament Experience"],
    rating: PREDICTION_SETTING_DEFAULTS["Sandbagger Rating"],
  }, { format: 28, overall: 22, recent: 15, averagePoints: 10, careerPoints: 5, experience: 5, rating: 15 });
});

test("legacy Prediction Settings rows migrate to the recalibrated profile", () => {
  const rows = [
    ["Handicap Category Weight", 15],
    ["Player Category Weight", 35],
    ["Team Category Weight", 30],
    ["Opponent Category Weight", 15],
    ["Tournament Category Weight", 5],
    ["Better Player Handicap Difference", 2],
    ["Lesser Player Handicap Difference", 2],
    ["Player - Format Win Percentage Weight", 25],
    ["Handicap - Net Stroke Advantage Weight", 25],
  ].map(([Setting, Value]) => ({ Setting, Value }));
  const settings = settingsMap(rows);
  assert.equal(settings["Prediction Calibration Profile"], "Recalibrated v2");
  assert.equal(settings["Handicap Category Weight"], 12);
  assert.equal(settings["Player Category Weight"], 42);
  assert.equal(settings["Format Win Percentage"], 28);
  assert.equal(settings["Net Stroke Advantage"], 20);
  assert.equal(settings["Better Player Handicap Difference"], 5);
  assert.equal(settings["Lesser Player Handicap Difference"], 1);
});

test("underlying skill calibration keeps lower-handicap golfers competitive across representative gaps", () => {
  const historical = {
    low: { records: { overall: { matches: 8, wins: 4, halves: 0, points: 4 }, SI: { matches: 4, wins: 2, halves: 0, points: 2 } }, appearances: [2024, 2025], sandbaggerRatings: { OVERALL: { rating: 1500, matches: 8 }, SI: { rating: 1500, matches: 4 } } },
    high: { records: { overall: { matches: 8, wins: 4, halves: 0, points: 4 }, SI: { matches: 4, wins: 2, halves: 0, points: 2 } }, appearances: [2024, 2025], sandbaggerRatings: { OVERALL: { rating: 1500, matches: 8 }, SI: { rating: 1500, matches: 4 } } },
  };
  const run = (higherHandicap) => predict({
    format: "Singles",
    players: [{ id: "low" }, { id: "high" }],
    historical,
    partnership: {},
    headToHead: {},
    handicap: playingHandicaps("Singles", [2, higherHandicap]),
    settings: {},
    teamNames: ["2 Handicap", `${higherHandicap} Handicap`],
  });
  const small = run(4);
  const medium = run(10);
  const large = run(16);

  assert.equal(small.calibration.underlyingSkillAdjustment, 1);
  assert.equal(medium.calibration.underlyingSkillAdjustment, 4);
  assert.equal(large.calibration.underlyingSkillAdjustment, 7);
  assert.ok(small.teamA >= 40 && small.teamA <= 60);
  assert.ok(medium.teamA >= 40 && medium.teamA <= 60);
  assert.ok(large.teamA >= 43 && large.teamA <= 57);
  assert.equal(
    Number((large.calibration.probabilityBeforeSkillAdjustment + large.calibration.underlyingSkillAdjustment).toFixed(6)),
    Number(large.calibration.probabilityAfterSkillAdjustment.toFixed(6))
  );
});

test("underlying skill adjustment caps at eight percentage points", () => {
  const result = predict({
    format: "Singles",
    players: [{ id: "low" }, { id: "high" }],
    historical: {},
    partnership: {},
    headToHead: {},
    handicap: playingHandicaps("Singles", [0, 30]),
    settings: {},
  });
  assert.equal(result.calibration.underlyingSkillAdjustment, 8);
});
