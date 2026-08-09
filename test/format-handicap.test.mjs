import test from "node:test";
import assert from "node:assert/strict";
import {
  formatHandicap,
  formatCalcuttaPoints,
  formatPlayerPoints,
  formatStatusLabel,
  formatTeamPoints,
  parseNumericValue,
} from "../lib/formatters.js";
import {
  formatLiveMatchResult,
  formatOfficialMatchResult,
  formatParticipantMatchResult,
  formatStoredMatchResult,
} from "../lib/match-result.js";

test("formats plus handicaps with parentheses", () => {
  assert.equal(formatHandicap(-2), "(2.0)");
  assert.equal(formatHandicap("-1.5"), "(1.5)");
  assert.equal(formatHandicap(-0.5), "(0.5)");
  assert.equal(formatHandicap("(0.6)"), "(0.6)");
  assert.equal(formatHandicap("−0.7"), "(0.7)");
});

test("normalizes accounting-style handicap values from Google Sheets", () => {
  assert.equal(parseNumericValue("(0.6)"), -0.6);
  assert.equal(parseNumericValue("-1.5"), -1.5);
  assert.equal(parseNumericValue("'12.8"), 12.8);
  assert.equal(parseNumericValue("'-1.5"), -1.5);
  assert.equal(parseNumericValue("0"), 0);
});

test("keeps zero and positive handicaps visible", () => {
  assert.equal(formatHandicap(0), "0.0");
  assert.equal(formatHandicap("4"), "4.0");
  assert.equal(formatHandicap(8.7), "8.7");
});

test("uses a dash only for unavailable handicaps", () => {
  assert.equal(formatHandicap(null), "—");
  assert.equal(formatHandicap(undefined), "—");
  assert.equal(formatHandicap(""), "—");
  assert.equal(formatHandicap("not recorded"), "—");
});

test("formats player points with exactly two decimal places", () => {
  assert.equal(formatPlayerPoints(5.75), "5.75");
  assert.equal(formatPlayerPoints(5.5), "5.50");
  assert.equal(formatPlayerPoints(5), "5.00");
  assert.equal(formatPlayerPoints(3.25), "3.25");
  assert.equal(formatPlayerPoints(null), "—");
});

test("formats team points with exactly one decimal place", () => {
  assert.equal(formatTeamPoints(21.5), "21.5");
  assert.equal(formatTeamPoints(7), "7.0");
  assert.equal(formatTeamPoints(14.5), "14.5");
  assert.equal(formatTeamPoints(null), "—");
});

test("formats Calcutta points with only meaningful decimal precision", () => {
  assert.equal(formatCalcuttaPoints(276), "276");
  assert.equal(formatCalcuttaPoints(88.00), "88");
  assert.equal(formatCalcuttaPoints(76.50), "76.5");
  assert.equal(formatCalcuttaPoints(76.25), "76.25");
  assert.equal(formatCalcuttaPoints(76.125), "76.125");
  assert.equal(formatCalcuttaPoints(null), "—");
});

test("centralizes participant-facing status wording", () => {
  assert.equal(formatStatusLabel("scheduled"), "Upcoming");
  assert.equal(formatStatusLabel("in progress"), "Live");
  assert.equal(formatStatusLabel("completed"), "Final");
  assert.equal(formatStatusLabel("closed"), "Locked");
  assert.equal(formatStatusLabel("live", { current: true }), "Current Match");
  assert.equal(formatStatusLabel("final", { complete: true }), "Final");
});

test("centralizes live, final, and participant match-result wording", () => {
  const teams = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  assert.equal(formatLiveMatchResult([], teams, { includeWinner: false }), "All Square");
  assert.equal(formatLiveMatchResult([
    { "Hole Winner": "Team 1" },
    { "Hole Winner": "Team 1" },
    { "Hole Winner": "Team 2" },
  ], teams, { includeWinner: false }), "1 UP");
  const clinchedThenCompleted = Array.from({ length: 18 }, (_, index) => ({
    "Hole Number": index + 1,
    "Hole Winner": index < 6 ? "Team 1" : index < 12 ? "Halved" : index === 12 ? "Team 1" : "Team 2",
  }));
  assert.equal(formatLiveMatchResult(clinchedThenCompleted, teams), "The Pickles 7 & 5");
  assert.equal(formatLiveMatchResult(clinchedThenCompleted, teams, { includeWinner: false }), "7 & 5");
  assert.equal(formatStoredMatchResult({
    status: "Final",
    finalResult: "The Pickles 3 & 1",
  }, teams), "The Pickles 3 & 1");
  assert.equal(formatParticipantMatchResult({
    team: { name: "The Pickles" },
    opponentTeam: { name: "Lipp It and Rip It" },
    result: { officialResult: "The Pickles 3 & 1" },
  }, 1), "Won 3 & 1");
  assert.equal(formatParticipantMatchResult({
    team: { name: "The Pickles" },
    opponentTeam: { name: "Lipp It and Rip It" },
    result: { officialResult: "Lipp It and Rip It 2 & 1" },
  }, 1), "Lost 2 & 1");
  assert.equal(formatParticipantMatchResult({
    result: { officialResult: "Halved" },
  }, 1), "Halved");
});

test("official match typography spaces numeric ampersands without changing live states or team names", () => {
  for (const [input, expected] of [
    ["4&3", "4 & 3"],
    ["3 &2", "3 & 2"],
    ["5& 4", "5 & 4"],
    ["1&0", "1 & 0"],
    ["Lipp It and Rip It 3&2", "Lipp It and Rip It 3 & 2"],
  ]) assert.equal(formatOfficialMatchResult(input), expected);
  for (const live of ["1 UP", "2 UP", "AS", "Dormie"]) assert.equal(formatOfficialMatchResult(live), live);
});
