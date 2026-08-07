import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeWorkbookWriteValue } from "../lib/workbook-protection.js";

test("numeric workbook fields retain native number values at the shared write boundary", () => {
  const cases = [
    ["Calcutta Purchases", "Year", "2026", 2026],
    ["Calcutta Purchases", "Purchase Price", "1000", 1000],
    ["Calcutta Ownership", "Ownership %", "50", 50],
    ["Live Matches", "Round", "2", 2],
    ["Live Matches", "Match", "4", 4],
    ["Matches", "Team 1 Points", "1.5", 1.5],
    ["Calcutta Standings", "Round 1 Payout %", "0.75", 0.75],
    ["Calcutta Standings", "Total Points", "3.25", 3.25],
    ["Handicaps", "Tournament Handicap", "8.4", 8.4],
  ];
  for (const [tab, field, input, expected] of cases) {
    const actual = normalizeWorkbookWriteValue(tab, field, input);
    assert.equal(actual, expected, `${tab}.${field}`);
    assert.equal(typeof actual, "number", `${tab}.${field} should remain numeric`);
  }
});

test("text identifiers remain exact and are never numerically coerced", () => {
  for (const [tab, field, value] of [
    ["Players", "Player ID", "CB01"],
    ["Calcutta Purchases", "Golfer Player ID", "AM01"],
    ["Calcutta Ownership", "Owner Player ID", "001"],
    ["Live Matches", "Course ID", "COURSE-01"],
  ]) assert.equal(normalizeWorkbookWriteValue(tab, field, value), value);
});

test("numeric fields reject apostrophe-prefixed text instead of silently storing it", () => {
  assert.throws(() => normalizeWorkbookWriteValue("Calcutta Purchases", "Year", "'2026"), /apostrophe-prefixed text/);
  assert.throws(() => normalizeWorkbookWriteValue("Calcutta Ownership", "Ownership %", "'50"), /apostrophe-prefixed text/);
});

test("Live Hole Scores accept only native scalar or structured numeric values", () => {
  assert.equal(normalizeWorkbookWriteValue("Live Hole Scores", "Team 1 Gross Scores", 3), 3);
  assert.equal(normalizeWorkbookWriteValue("Live Hole Scores", "Team 1 Gross Scores", [4, 5]), "[4,5]");
  assert.throws(() => normalizeWorkbookWriteValue("Live Hole Scores", "Team 1 Gross Scores", "3"), /native numeric score values/);
});

test("every shared batch-write path applies native value normalization while retaining RAW formula safety", async () => {
  const source = await readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8");
  assert.match(source, /values: \[\[normalizeWorkbookWriteValue\(tab, header, value\)\]\]/);
  assert.match(source, /values: \[\[normalizeWorkbookWriteValue\(tab, field, value\)\]\]/);
  assert.match(source, /values: \[\[normalizeWorkbookWriteValue\(schema\.tab, field, value\)\]\]/);
  assert.match(source, /valueInputOption: "RAW"/);
  assert.doesNotMatch(source, /valueInputOption: "USER_ENTERED"/);
});
