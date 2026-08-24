import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("My Match distinguishes a complete open scorecard without changing its scoring route", async () => {
  const source = await read("app/score/MyMatchDashboard.js");
  assert.match(source, /Number\(match\.holesRecorded\) >= 18 && Number\(match\.holesRemaining\) === 0/);
  assert.match(source, /18 holes scored · Ready to review/);
  assert.match(source, /Review & Finalize/);
  assert.match(source, /onClick=\{\(\) => onOpen\(match\)\}/);
  assert.equal((source.match(/fetch\(/g) || []).length, 0);
  for (const frozen of ["homeFormatLabel", "TeamBlock", "CompactMatchup", "Completed", "Final Scorecard", "Game Center"]) {
    assert.match(source, new RegExp(frozen));
  }
});

test("Game Center uses a compact accessible 18-hole rail and final clinching-hole default", async () => {
  const [source, styles] = await Promise.all([
    read("app/game-center/GameCenter.js"),
    read("app/game-center/game-center.module.css"),
  ]);
  assert.match(source, /function initialSelectedHole\(data\)/);
  assert.match(source, /clinchingHole\(data\) \|\| Number\(data\.match\.currentHole/);
  assert.match(source, /data\.holes\.map\(\(hole\) =>/);
  assert.match(source, /data-hole=\{hole\.number\}/);
  assert.match(source, /data-clinching=\{hole\.number === clinchHole/);
  assert.match(source, /clinching hole/);
  assert.match(styles, /\.holeRail\{[^}]*overflow-x:auto/);
  assert.match(styles, /\.holeRail button\{[^}]*flex:0 0 48px[^}]*min-height:48px/);
  assert.match(styles, /\.holeRailFrame::after/);
});

test("Game Center secondary hierarchy differs for live and final without changing analytics", async () => {
  const [source, styles, engine] = await Promise.all([
    read("app/game-center/GameCenter.js"),
    read("app/game-center/game-center.module.css"),
    read("lib/game-center.js"),
  ]);
  assert.match(source, /data-state=\{data\.state\}/);
  assert.match(source, /data-segments=\{options\.length\}/);
  assert.match(source, /const showRemaining = data\.state !== "final" \|\| Number\(data\.stats\.remaining\) > 0/);
  assert.match(source, /className=\{styles\.statsPrimary\}/);
  assert.match(source, /className=\{styles\.statsSecondary\}/);
  assert.match(source, /<GameCenterScorecard data=\{data\} \/>/);
  assert.match(source, /<CourseInformation data=\{data\} \/>/);
  assert.match(styles, /\.results\[data-state=final\]/);
  assert.match(styles, /\.stats\[data-state=final\]/);
  assert.match(engine, /remaining: Math\.max\(0, 18 - played\.length\)/);
  assert.match(engine, /return \{ played: played\.length, team1, team2, halved, biggestLead, leadChanges, remaining:/);
});

test("Game Center remains request-neutral and preserves polling, scorecard, and data authority", async () => {
  const [source, page, supabase] = await Promise.all([
    read("app/game-center/GameCenter.js"),
    read("app/game-center/[matchId]/page.js"),
    read("lib/game-center-supabase.js"),
  ]);
  assert.equal((source.match(/fetch\(/g) || []).length, 2);
  assert.match(source, /setInterval\(refresh, 45_000\)/);
  assert.match(source, /fetch\(`\/api\/game-center\//);
  assert.match(source, /fetch\("\/api\/player-passport\/matches"/);
  assert.match(page, /getGameCenterData\(matchId, currentPlayerId, \{ env \}\)/);
  assert.match(supabase, /read_game_center_view/);
  assert.doesNotMatch(source + page, /google/i);
});
