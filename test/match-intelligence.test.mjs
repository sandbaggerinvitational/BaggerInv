import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildMatchIntelligence } from "../lib/match-intelligence.js";

const prediction = {
  teamA: 62,
  teamB: 27,
  tie: 11,
  confidence: "High",
  components: {
    handicap: [58, 42],
    player: [61, 39],
    opponent: [48, 52],
    team: [70, 30],
    tournament: [55, 45],
  },
  contributions: [
    { id: "handicap", label: "Handicap Edge", impact: 1, side: "A" },
    { id: "player", label: "Player Strength", impact: 4.6, side: "A" },
    { id: "team", label: "Team Vibes", impact: 5.6, side: "A" },
    { id: "opponent", label: "Head-to-Head", impact: -0.5, side: "B" },
    { id: "tournament", label: "Tournament Experience", impact: 0.3, side: "A" },
  ],
  teamVibes: {
    teamA: { score: 70, known: true, matches: 4 },
    teamB: { score: 45, known: true, matches: 2 },
  },
  calibration: { underlyingSkillAdjustment: 2 },
};

const players = [
  { id: "A1", name: "Alpha One" },
  { id: "A2", name: "Alpha Two" },
  { id: "B1", name: "Bravo One" },
  { id: "B2", name: "Bravo Two" },
];

const historical = Object.fromEntries(players.map((player) => [player.id, {
  records: { BB: { matches: 5 } },
  seasons: [{ year: 2025, overall: { matches: 3, wins: player.id.startsWith("A") ? 2 : 1, halves: 0 } }],
}]));

const scoringIntelligence = {
  profiles: players.map((player) => ({
    playerId: player.id,
    profile: {
      rounds: 3,
      birdieOrBetterPercent: player.id.startsWith("A") ? 18 : 10,
      grossScoringAverage: player.id.startsWith("A") ? 76 : 81,
      averageRoundToPar: player.id.startsWith("A") ? 4 : 9,
      closing: { averageToPar: player.id.startsWith("A") ? 0.1 : 0.5 },
    },
    courseFit: { score: player.id.startsWith("A") ? 12 : -4 },
  })),
};

test("Match Intelligence explains the existing prediction without mutating it", () => {
  const before = structuredClone(prediction);
  const result = buildMatchIntelligence({
    prediction,
    teamNames: ["The Pickles", "Lipp it and Rip it"],
    players,
    historical,
    partnerships: {},
    headToHead: {},
    format: "BB",
    scoringIntelligence,
    pointsAvailable: 3,
  });

  assert.deepEqual(prediction, before);
  assert.equal(result.overview.favorite, "The Pickles");
  assert.equal(result.overview.confidence, "HIGH");
  assert.equal(result.overview.upsetPotential, "LOW");
  assert.ok(Math.abs(result.overview.expectedPoints[0] - 2.025) < 0.000001);
  assert.ok(result.categories.some((row) => row.id === "birdies" && row.edge === "TEAM_A"));
  assert.ok(result.advantages[0].length <= 5);
  assert.ok(result.swingFactors.length <= 5);
  assert.match(result.analysis, /projected favorite/i);
  assert.match(result.captainsNotes, /final three holes/i);
  assert.ok(result.keysToVictory.every((side) => side.length <= 3));
});

test("limited evidence raises upset potential and unavailable categories stay neutral", () => {
  const sparseHistorical = Object.fromEntries(players.map((player) => [player.id, {
    records: { BB: { matches: 0 } },
    seasons: [],
  }]));
  const result = buildMatchIntelligence({
    prediction: { ...prediction, teamA: 54, teamB: 35, tie: 11, teamVibes: {
      teamA: { score: 50, known: false, matches: 0 },
      teamB: { score: 50, known: false, matches: 0 },
    } },
    teamNames: ["A", "B"],
    players,
    historical: sparseHistorical,
    format: "BB",
    scoringIntelligence: { profiles: [] },
  });
  assert.equal(result.overview.confidence, "LOW");
  assert.equal(result.overview.upsetPotential, "HIGH");
  assert.equal(result.categories.find((row) => row.id === "chemistry").edge, "UNAVAILABLE");
  assert.equal(result.categories.find((row) => row.id === "gross").edge, "UNAVAILABLE");
  assert.ok(result.risks[0].some((row) => row.id === "sample"));
});

test("Match Intelligence UI is deterministic and contains no external AI action", () => {
  const source = fs.readFileSync(new URL("../app/war-room/MatchAnalyst.js", import.meta.url), "utf8");
  const warRoom = fs.readFileSync(new URL("../app/war-room/WarRoom.js", import.meta.url), "utf8");
  assert.match(source, /Official SBI Match Analyst/);
  assert.match(source, /Captain&apos;s Notes/);
  assert.match(source, /How We Got Here/);
  assert.doesNotMatch(source, /OpenAI|ChatGPT|fetch\(/i);
  assert.doesNotMatch(warRoom, /captains-briefing|OPENAI_API_KEY|generateAiBriefing/);
});
