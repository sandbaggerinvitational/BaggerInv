import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { projectHistoricalAwards } from "../lib/historical-awards.js";

const fallbackHistoricalData = JSON.parse(
  await readFile(new URL("../lib/historical-data.json", import.meta.url), "utf8"),
);
const playerMap = Object.fromEntries(
  fallbackHistoricalData.players.map((player) => [player["Player ID"], player]),
);
const awardsForYear = (year) => projectHistoricalAwards(
  fallbackHistoricalData.awards,
  year,
  playerMap,
);

test("2025 Honors presents the canonical Caleb Lewis award exactly once", () => {
  assert.deepEqual(awardsForYear(2025).map((award) => ({
    title: award.Award,
    winnerId: award.Winner,
    winner: award.winnerPlayer?.["Display Name"],
  })), [{
    title: "Sandbagger of the Year",
    winnerId: "CL01",
    winner: "Caleb Lewis",
  }]);
});

test("the bundled source remains unchanged while incomplete award rows stay out of presentation", () => {
  const sourceRows = fallbackHistoricalData.awards.filter((award) => Number(award.Year) === 2025);
  assert.equal(sourceRows.length, 2);
  assert.equal(sourceRows.filter((award) => award.Award === "Sandbagger of the Year").length, 2);
  assert.equal(sourceRows.filter((award) => award.Winner === null).length, 1);
  assert.equal(awardsForYear(2025).length, 1);
});

test("2017–2025 Honors has no duplicate presentable award title", () => {
  for (let year = 2017; year <= 2025; year += 1) {
    const awards = awardsForYear(year);
    const titles = awards.map((award) => award.Award);
    assert.equal(new Set(titles).size, titles.length, `${year} duplicate award title`);
    assert.equal(awards.every((award) => String(award.Winner || "").trim()), true, `${year} blank award winner`);
  }
});

test("the legitimate Honors component remains and no CSS hiding is introduced", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/history/[year]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/historical.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<span className=\{styles\.sectionLabel\}>Tournament Honors<\/span>/);
  assert.match(page, /tournament\.awards\.map\(\(award\)/);
  assert.match(page, /award\.winnerPlayer\?\.\["Display Name"\] \|\| award\.Winner/);
  assert.doesNotMatch(styles, /awardCard[^}]*display\s*:\s*none/);
});
