import assert from "node:assert/strict";
import test from "node:test";
import { formatRuleSummary } from "../lib/rules-format-summary.js";

test("Best Ball summary derives official points, allocation, and Nassau format", () => {
  const summary = formatRuleSummary("BB", [
    { Body: "Fourball uses 90% handicap allocation." },
    { Body: "Fourball and Scramble use Nassau scoring." },
  ], 3);
  assert.deepEqual(summary, ["3 Points", "90% Handicap Allocation", "Nassau Match Play"]);
});

test("Scramble summary normalizes the official two-player allocation", () => {
  const summary = formatRuleSummary("SC", [
    { Body: "Scramble team handicap is calculated using 35% of the low handicap and 15% of the high handicap." },
    { Body: "Fourball and Scramble use Nassau scoring." },
  ], 3);
  assert.deepEqual(summary, ["3 Points", "35% / 15% Team Handicap", "Nassau Match Play"]);
});

test("Singles summary derives full allocation and 18-hole match play", () => {
  const summary = formatRuleSummary("SI", [
    { Body: "Singles uses 100% handicap allocation." },
    { Body: "Singles is one 18-hole match worth three points." },
  ], 3);
  assert.deepEqual(summary, ["3 Points", "100% Handicap Allocation", "18-Hole Match Play"]);
});

test("explicit workbook summary fields take precedence and missing values stay hidden", () => {
  assert.deepEqual(formatRuleSummary("BB", [{ "Handicap Allocation": "85% Allocation", "Scoring Format": "Modified Match Play" }], ""), ["85% Allocation", "Modified Match Play"]);
  assert.deepEqual(formatRuleSummary("BB", [], null), []);
});
