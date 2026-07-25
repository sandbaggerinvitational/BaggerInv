import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL(
  "../app/players/[slug]/PlayerFormatMatchHistory.js",
  import.meta.url
);
const statsPath = new URL("../lib/stats.js", import.meta.url);
const matchCardPath = new URL("../app/PublicMatchCard.js", import.meta.url);

test("player format history uses accessible nested accordions and compact match details", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-controls=\{accordionId\}/);
  assert.match(source, /aria-expanded=\{yearOpen\}/);
  assert.match(source, /history\.latestYear/);
  assert.match(source, /Represented \{match\.team\.name\}/);
  assert.match(source, /View Match →/);
});

test("format history joins matches by stable player IDs and exposes reconciliation state", async () => {
  const source = await readFile(statsPath, "utf8");

  assert.match(source, /export function getPlayerFormatMatchHistory\(playerId/);
  assert.match(source, /const side = playerSide\(match, playerId\)/);
  assert.match(source, /playersForSide\(match, side\)/);
  assert.match(source, /consistent: expected \? sameRecord\(record, expected\) : true/);
});

test("historical match cards expose stable anchors for player profile links", async () => {
  const source = await readFile(matchCardPath, "utf8");

  assert.match(source, /id=\{match\.id \? `match-\$\{match\.id\}` : undefined\}/);
});
