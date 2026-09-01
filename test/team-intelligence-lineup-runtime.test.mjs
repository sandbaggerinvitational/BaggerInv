import assert from "node:assert/strict";
import test from "node:test";

import { optimizeLineups } from "../lib/lineup-optimizer.js";
import { pick, settingsMap } from "../lib/prediction-engine.js";
import { buildTeamIntelligenceLineupRuntime } from "../lib/team-intelligence-lineup-runtime.js";
import {
  getCourseOptions,
  getFormatCourse,
  scorecardForTee,
} from "../lib/tournament-context.js";

const clean = (value) => String(value ?? "").trim();

function record(wins, losses, halves, points) {
  return { wins, losses, halves, matches: wins + losses + halves, points };
}

function fixture() {
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: `P${index + 1}`,
    name: `Player ${index + 1}`,
    tournamentHandicap: 6 + index,
  }));
  const historical = Object.fromEntries(players.map((player, index) => [player.id, {
    appearances: [2024, 2025],
    records: {
      overall: record(3 + index, 2, 1, 4.5 + index),
      BB: record(2 + index, 1, 0, 2 + index),
      SC: record(1, 1 + index, 1, 1.5),
    },
    seasons: [{ year: 2025, overall: record(2, 1, 0, 2) }],
    sandbaggerRatings: {
      OVERALL: { rating: 1490 + index * 10, matches: 8 },
      BB: { rating: 1500 + index * 10, matches: 4 },
      SC: { rating: 1480 + index * 10, matches: 3 },
    },
  }]));
  return {
    year: 2026,
    sheets: {
      courses: [
        { Year: 2026, Format: "BB", "Course ID": "C-BB", Course: "Best Ball Course", Tee: "Blue" },
        { Year: 2026, Format: "SC", "Course ID": "C-SC", Course: "Scramble Course", Tee: "Gold" },
      ],
      scorecards: [
        { "Course ID": "C-BB", Course: "Best Ball Course", Tee: "Blue", "Course Rating": 72.1, "Slope Rating": 128, Par: 72 },
        { "Course ID": "C-SC", Course: "Scramble Course", Tee: "Gold", "Course Rating": 70.4, "Slope Rating": 121, Par: 71 },
      ],
      settings: [],
    },
    teams: {
      team1: { name: "Team One", players: players.slice(0, 3) },
      team2: { name: "Team Two", players: players.slice(3) },
    },
    historical,
    partnershipPredictionMap: {},
    headToHead: {},
  };
}

function priorSelectedOptimizer(input, format) {
  const course = getFormatCourse(input.sheets, input.year, format);
  const cards = getCourseOptions(input.sheets, course);
  const assigned = clean(pick(course, "Tee", "Tee Name"));
  const card = scorecardForTee(cards, assigned);
  return optimizeLineups({
    format,
    team1: input.teams.team1,
    team2: input.teams.team2,
    scorecard: {
      rating: pick(card, "Course Rating", "Rating"),
      slope: pick(card, "Slope Rating", "Slope"),
      par: pick(card, "Par"),
    },
    historical: input.historical,
    partnerships: input.partnershipPredictionMap,
    headToHead: input.headToHead,
    settings: settingsMap(input.sheets.settings),
  });
}

test("Lineup Lab runtime computes BB and SC once and preserves selected-format math exactly", () => {
  const input = fixture();
  const calls = [];
  const runtime = buildTeamIntelligenceLineupRuntime({
    ...input,
    optimizer(args) {
      calls.push(args.format);
      return optimizeLineups(args);
    },
  });

  assert.deepEqual(calls, ["BB", "SC"]);
  for (const format of ["BB", "SC"]) {
    assert.equal(runtime.isReady(format), true);
    assert.deepEqual(runtime.optimizerFor(format), priorSelectedOptimizer(input, format));
    assert.equal(runtime.optimizerFor(format), runtime.optimizersByFormat[format]);
  }

  runtime.optimizerFor("Best Ball");
  runtime.optimizerFor("Scramble");
  assert.deepEqual(calls, ["BB", "SC"], "selection must not rerun either optimizer");
});
