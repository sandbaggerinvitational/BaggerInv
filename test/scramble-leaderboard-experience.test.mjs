import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Round 2 uses one shared Scramble team presentation across Tournament, Leaderboards, and Net Skins", async () => {
  const [tournament, leaderboards, board, identity] = await Promise.all([
    readFile(new URL("../app/live/TournamentDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/ScrambleLeaderboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/ScrambleTeamIdentity.js", import.meta.url), "utf8"),
  ]);
  assert.match(tournament, /<ScrambleLeaderboard/);
  assert.match(leaderboards, /<ScrambleLeaderboard/);
  assert.match(leaderboards, /<ScrambleTeamIdentity[^>]+playerIds=\{row\.playerIds\}/);
  assert.match(board, /<ScrambleTeamIdentity/);
  assert.match(identity, /<PlayerAvatar player=\{player\}/);
  assert.doesNotMatch(identity, /playerPhoto|AssetImage/);
});

test("Scramble rows prioritize team identity and retain every official competition metric", async () => {
  const source = await readFile(new URL("../app/live/ScrambleLeaderboard.js", import.meta.url), "utf8");
  for (const label of ["Rank", "THRU", "Gross", "Net", "Net +/-"]) assert.match(source, new RegExp(label.replace(/[+]/g, "\\+")));
  assert.match(source, /data-state=\{final \? "final" : "live"\}/);
  assert.match(source, /roundScoreRows\(rows, round, "SC", sort\)/);
  assert.match(source, /Number\(row\.holes\) >= 18/);
});

test("Scramble pairing details use existing scorecard data and add no workbook access", async () => {
  const source = await readFile(new URL("../app/live/ScrambleLeaderboard.js", import.meta.url), "utf8");
  for (const label of ["Team Members", "Current Rank", "Gross Score", "Net Score", "Hole-by-Hole Scoring"]) assert.match(source, new RegExp(label));
  assert.match(source, /row\.scorecard \|\| \[\]/);
  assert.doesNotMatch(source, /fetch\(|google|workbook|spreadsheet/i);
});

test("Scramble leaderboard remains mobile stacked without horizontal scrolling", async () => {
  const css = await readFile(new URL("../app/live/scramble-leaderboard.module.css", import.meta.url), "utf8");
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /grid-column:2/);
  assert.match(css, /max-height:calc\(90dvh - env\(safe-area-inset-top\)\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(css, /overflow-x\s*:\s*(auto|scroll)/);
});
