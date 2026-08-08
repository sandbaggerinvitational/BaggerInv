import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rankCalcuttaGolfers, rankCalcuttaPortfolios } from "../lib/calcutta-leaderboards.js";

test("Golfer Market ranks by Calcutta Points then projected value, never ROI", () => {
  const golfers = [
    { playerId: "A", player: { name: "Alpha" }, totalPoints: 20, currentPayoutValue: 800, roi: 9, rank: 8 },
    { playerId: "B", player: { name: "Bravo" }, totalPoints: 30, currentPayoutValue: 600, roi: -0.5, rank: 9 },
    { playerId: "C", player: { name: "Charlie" }, totalPoints: 20, currentPayoutValue: 900, roi: 0, rank: 10 },
  ];
  const ranked = rankCalcuttaGolfers(golfers);
  assert.deepEqual(ranked.map((golfer) => golfer.playerId), ["B", "C", "A"]);
  assert.deepEqual(ranked.map((golfer) => golfer.displayRank), [1, 2, 3]);
  assert.deepEqual(golfers.map((golfer) => golfer.rank), [8, 9, 10]);
});

test("Golfer Market with no official points remains pending and preserves stable order", () => {
  const golfers = [
    { playerId: "B", player: { name: "Bravo" }, totalPoints: 0, currentPayoutValue: 900 },
    { playerId: "A", player: { name: "Alpha" }, totalPoints: 0, currentPayoutValue: 1200 },
  ];
  const ranked = rankCalcuttaGolfers(golfers);
  assert.deepEqual(ranked.map((golfer) => golfer.playerId), ["B", "A"]);
  assert.deepEqual(ranked.map((golfer) => golfer.displayRank), [null, null]);
});

test("Portfolio leaderboard ranks by projected value then Net Profit, never ROI", () => {
  const portfolios = [
    { ownerId: "A", owner: { name: "Alpha" }, currentPayoutValue: 1000, netProfit: 500, roi: 9, rank: 7 },
    { ownerId: "B", owner: { name: "Bravo" }, currentPayoutValue: 1200, netProfit: -400, roi: -0.5, rank: 8 },
    { ownerId: "C", owner: { name: "Charlie" }, currentPayoutValue: 1000, netProfit: 700, roi: 0.1, rank: 9 },
  ];
  const ranked = rankCalcuttaPortfolios(portfolios);
  assert.deepEqual(ranked.map((portfolio) => portfolio.ownerId), ["B", "C", "A"]);
  assert.deepEqual(ranked.map((portfolio) => portfolio.displayRank), [1, 2, 3]);
  assert.deepEqual(portfolios.map((portfolio) => portfolio.rank), [7, 8, 9]);
});

test("participant ranking reuses in-memory model data and leaves publication ranking untouched", async () => {
  const [component, model] = await Promise.all([
    readFile(new URL("../app/live/CalcuttaExperience.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/calcutta.js", import.meta.url), "utf8"),
  ]);
  assert.match(component, /rankCalcuttaGolfers\(model\.golfers\)/);
  assert.match(component, /rankCalcuttaPortfolios\(model\.portfolios\)/);
  assert.match(component, />Calcutta Points</);
  assert.match(component, /formatCalcuttaPoints\(row\.totalPoints\)/);
  assert.match(component, /formatCalcuttaPoints\(golfer\.totalPoints\)/);
  assert.match(component, /formatCalcuttaPoints\(result\.points\)/);
  assert.doesNotMatch(component, /totalPoints\.toFixed|result\.points\.toFixed/);
  assert.doesNotMatch(component, /fetch\(|google|workbook|spreadsheet/i);
  assert.match(model, /Rank: golfer\.rank/);
});
