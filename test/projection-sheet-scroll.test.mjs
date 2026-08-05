import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Player Projection uses one unobstructed vertical scroll container", async () => {
  const css = await readFile(new URL("../app/live/leaderboards-insights.module.css", import.meta.url), "utf8");
  assert.match(css, /\.sheetLayer\{[^}]*z-index:160/);
  assert.match(css, /\.sheet\{[^}]*overflow-y:auto/);
  assert.match(css, /\.sheet\{[^}]*-webkit-overflow-scrolling:touch/);
  assert.match(css, /\.sheet\{[^}]*scroll-padding-bottom:/);
  assert.match(css, /\.history\{overflow:clip/);
  assert.doesNotMatch(css, /\.history\{overflow-y:(?:auto|scroll)/);
});

test("Player Projection remains above fixed participant navigation", async () => {
  const navigation = await readFile(new URL("../app/participant-navigation.module.css", import.meta.url), "utf8");
  const navZIndex = Number(navigation.match(/\.mobile\{position:fixed!important;[^}]*z-index:(\d+)/)?.[1]);
  assert.equal(navZIndex, 110);
  assert.ok(160 > navZIndex);
});
