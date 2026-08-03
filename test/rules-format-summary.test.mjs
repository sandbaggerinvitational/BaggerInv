import assert from "node:assert/strict";
import test from "node:test";
import { formatRuleHeading, formatRuleSummary } from "../lib/rules-format-summary.js";

test("Best Ball summary derives official points, allocation, and Nassau format", () => {
  const summary = formatRuleSummary("BB", [
    { Body: "Fourball uses 90% handicap allocation." },
    { Body: "Fourball and Scramble use Nassau scoring." },
  ], 3);
  assert.deepEqual(summary, ["Points: 3", "Handicap: 90%", "Scoring: Nassau Match Play"]);
});

test("Scramble summary normalizes the official two-player allocation", () => {
  const summary = formatRuleSummary("SC", [
    { Body: "Scramble team handicap is calculated using 35% of the low handicap and 15% of the high handicap." },
    { Body: "Fourball and Scramble use Nassau scoring." },
  ], 3);
  assert.deepEqual(summary, ["Points: 3", "Handicap: 35% / 15% Team Handicap", "Scoring: Nassau Match Play"]);
});

test("Singles summary derives full allocation and 18-hole match play", () => {
  const summary = formatRuleSummary("SI", [
    { Body: "Singles uses 100% handicap allocation." },
    { Body: "Fourball and Scramble use Nassau scoring. Singles is one 18-hole match worth three points." },
  ], 3);
  assert.deepEqual(summary, ["Points: 3", "Handicap: 100%", "Scoring: 18-Hole Match Play"]);
});

test("explicit workbook summary fields take precedence while every card keeps three bullets", () => {
  assert.deepEqual(formatRuleSummary("BB", [{ "Handicap Allocation": "85% Allocation", "Scoring Format": "Modified Match Play" }], ""), ["Points: 3", "Handicap: 85% Allocation", "Scoring: Modified Match Play"]);
  assert.deepEqual(formatRuleSummary("BB", [], null), ["Points: 3", "Handicap: 90%", "Scoring: Nassau Match Play"]);
});

test("format rule headings remove redundant format names without changing rule bodies", () => {
  assert.equal(formatRuleHeading("Fourball Handicap Allocation"), "Handicap");
  assert.equal(formatRuleHeading("Tournament Scoring"), "Scoring");
  assert.equal(formatRuleHeading("Fourball Mulligans"), "Mulligans");
  assert.equal(formatRuleHeading("Scramble Ball Placement"), "Ball Placement");
  assert.equal(formatRuleHeading("Scramble Handicap Allocation"), "Handicap");
  assert.equal(formatRuleHeading("Scramble Mulligans"), "Mulligans");
  assert.equal(formatRuleHeading("Singles Handicap Allocation"), "Handicap");
  assert.equal(formatRuleHeading("Singles Mulligans"), "Mulligans");
});
