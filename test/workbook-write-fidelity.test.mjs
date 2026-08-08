import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeWorkbookProducerRecord, normalizeWorkbookWriteValue } from "../lib/workbook-protection.js";

test("numeric workbook fields are normalized at the producer boundary", () => {
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
    const actual = normalizeWorkbookProducerRecord(tab, { [field]: input })[field];
    assert.equal(actual, expected, `${tab}.${field}`);
    assert.equal(typeof actual, "number", `${tab}.${field} should remain numeric`);
  }
});

test("the shared RAW writer rejects numeric strings instead of repairing them", () => {
  assert.equal(normalizeWorkbookWriteValue("Odds Player Results", "American Odds", 334), 334);
  assert.throws(() => normalizeWorkbookWriteValue("Odds Player Results", "American Odds", "+334"), /native number/);
  assert.throws(() => normalizeWorkbookWriteValue("Calcutta Purchases", "Year", "2026"), /native number/);
});

test("major workbook producers preserve identifiers and normalize their numeric contract", () => {
  const matrix = [
    ["Live Matches", { Year: "2026", Round: "2", Match: "1", "Course ID": "CP01" }],
    ["Live Hole Scores", { "Hole Number": "3", "Stroke Index": "1", "Team 1 Net Score": "3", "Team 2 Net Score": "4", Revision: "2", "Match ID": "2026-R2-1" }],
    ["Handicaps", { Year: "2026", "Tournament Handicap": "8.4", "Player ID": "AM01" }],
    ["Net Skins Result", { Year: "2026", Round: "2", Hole: "11", "Skin Value": "300", "Round Pot": "1200", Match: "4" }],
    ["Calcutta Round Results", { Year: "2026", Round: "1", "Gross Score": "72", "Net Score": "64.5", "Full Course Handicap": "7.5", Place: "3", "Calcutta Points": "0.75", "Player ID": "CB01" }],
    ["Calcutta Standings", { Year: "2026", Rank: "2", "Purchase Price": "1000", "Total Points": "1.25", "Current Payout Value": "1260", ROI: "26", "Player ID": "CB01" }],
    ["Odds Team Results", { Year: "2026", "Win Probability": "62.5", "American Odds": "-167", "Expected Points": "29.25", Team: "The Pickles" }],
    ["Odds Player Results", { Year: "2026", "Top Player Probability": "23.1", "American Odds": "+334", "Expected Points": "4.25", "Average Finish": "3.2", "Player ID": "CB01" }],
  ];
  for (const [tab, input] of matrix) {
    const output = normalizeWorkbookProducerRecord(tab, input);
    for (const [field, value] of Object.entries(output)) {
      if (typeof input[field] === "string" && /^[-+]?\d+(?:\.\d+)?$/.test(input[field]) && value !== input[field]) assert.equal(typeof value, "number", `${tab}.${field}`);
    }
  }
  assert.equal(normalizeWorkbookProducerRecord("Odds Player Results", { "Player ID": "001" })["Player ID"], "001");
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
