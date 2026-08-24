import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the primary board owns visible team branding while the participant strip owns golfer identity", async () => {
  const source = await read("app/game-center/GameCenter.js");
  const panel = source.slice(source.indexOf("function TeamPanel"), source.indexOf("function winnerName"));
  const board = source.slice(source.indexOf("<div className={styles.scoreboard}"), source.indexOf("<div className={styles.teamGrid}>"));

  assert.doesNotMatch(panel, /<Logo/);
  assert.doesNotMatch(panel, /<h3>/);
  assert.match(panel, /aria-label=\{`\$\{team\.name\} golfers`\}/);
  assert.match(panel, /className=\{styles\.players\} role="list"/);
  assert.match(panel, /role="listitem"/);
  assert.match(panel, /player\.name \|\| "Player TBA"/);
  assert.match(panel, /playerMeta\(player, format\)/);
  assert.match(panel, /format === "SC"/);

  assert.equal((board.match(/<Logo/g) || []).length, 2);
  assert.equal((board.match(/<strong>\{teamNames\[[12]\]\}<\/strong>/g) || []).length, 2);
  assert.match(source, /aria-hidden=\{type === "team" \? "true" : undefined\}/);
  assert.match(source, /alt=\{type === "team" \? "" : `\$\{name\} logo`\}/);
});

test("Best Ball, Scramble, and Singles keep full golfer, handicap, stroke, and pairing contracts", async () => {
  const [source, styles] = await Promise.all([
    read("app/game-center/GameCenter.js"),
    read("app/game-center/game-center.module.css"),
  ]);
  assert.match(source, /players\.map\(\(player, index\) =>/);
  assert.match(source, /HCP \$\{formatHandicap\(player\.playingHcp\)\}/);
  assert.match(source, /format !== "SC" && hasValue\(player\.stroke\)/);
  assert.match(source, /No strokes/);
  assert.match(source, /Team Playing Handicap/);
  assert.match(source, /team stroke/);
  assert.match(styles, /\.teamGrid\{[^}]*grid-template-columns:minmax\(0,1fr\) 20px minmax\(0,1fr\)/);
});

test("reopened live matches preserve Through 18, zero remaining, and Continue Scoring semantics", async () => {
  const [source, display] = await Promise.all([
    read("app/game-center/GameCenter.js"),
    read("lib/game-center-display.js"),
  ]);
  assert.match(source, /const through = Number\(data\.match\.currentHole/);
  assert.match(source, /const progressLabel = liveProgressLabel\(data\.state, through\)/);
  assert.match(source, /data\.state === "live" && data\.userTeamSide/);
  assert.match(source, /data\.stats\.played \? "Continue Scoring" : "Start Scoring"/);
  assert.match(display, /const remaining = 18 - through/);
  assert.match(display, /Through \$\{through\} • \$\{remaining\} Hole\$\{remaining === 1 \? "" : "s"\} Remaining/);
  assert.doesNotMatch(source, /Ready to review|Review & Finalize/);
});

test("Hole Tracker and the approved lower Game Center remain frozen and request-neutral", async () => {
  const [source, styles, page, myMatch] = await Promise.all([
    read("app/game-center/GameCenter.js"),
    read("app/game-center/game-center.module.css"),
    read("app/game-center/[matchId]/page.js"),
    read("app/score/MyMatchDashboard.js"),
  ]);
  assert.match(source, /data\.holes\.map\(\(hole\) =>/);
  assert.match(source, /data-clinching=\{hole\.number === clinchHole/);
  assert.match(styles, /\.holeRail\{[^}]*overflow-x:auto/);
  assert.match(styles, /\.holeRail button\{[^}]*flex:0 0 48px[^}]*min-height:48px/);
  assert.match(source, /<HoleTracker[\s\S]*<HoleDetails[\s\S]*<ResultSegments[\s\S]*<GameCenterScorecard[\s\S]*<MatchStats[\s\S]*<CourseInformation/);
  assert.equal((source.match(/fetch\(/g) || []).length, 2);
  assert.match(source, /setInterval\(refresh, 45_000\)/);
  assert.match(page, /getGameCenterData\(matchId, currentPlayerId, \{ env \}\)/);
  assert.doesNotMatch(source + page, /google/i);
  assert.match(myMatch, /18 holes scored · Ready to review/);
  assert.match(myMatch, /Review & Finalize/);
  assert.equal((myMatch.match(/fetch\(/g) || []).length, 0);
});
