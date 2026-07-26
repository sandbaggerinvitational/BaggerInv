import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaConsumers = [
  "../lib/captains-briefing.js",
  "../lib/tournament-context.js",
  "../lib/prediction-engine.js",
  "../app/war-room/MatchAnalyst.js",
  "../app/war-room/WarRoom.js",
  "../app/data-health/page.js",
];

test("Course Holes consumers use Hole Number as the single column name", async () => {
  for (const path of schemaConsumers) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /Hole Number/, `${path} should reference Hole Number`);
    assert.doesNotMatch(
      source,
      /hole\.Hole\b|pick\([^\n]*"Hole"(?:\s*,|\))/,
      `${path} should not retain the legacy Hole column`
    );
  }
});
