import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildScoringSlots, buildScoringTeamPresentation } from "../lib/scoring-keypad.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const match = {
  "Team 1 Team ID": "PICKLES",
  "Team 2 Team ID": "LIPPIT",
  "Team 1 Player 1": "MH01",
  "Team 1 Player 2": "AM01",
  "Team 2 Player 1": "PN01",
  "Team 2 Player 2": "BC01",
};
const display = {
  teamNames: { 1: "The Pickles", 2: "Lipp it and Rip it" },
  teams: {
    1: { name: "The Pickles", logo: "pickles-logo" },
    2: { name: "Lipp it and Rip it", logo: "lippit-logo" },
  },
};
const playerNames = {
  MH01: "Michael Hunnicutt",
  AM01: "Alex Monteleone",
  PN01: "Patrick Noonan",
  BC01: "Brenan Cavanaugh",
};

test("team marks map presentation logos through canonical Team IDs", () => {
  assert.deepEqual(buildScoringTeamPresentation({ match, display }), {
    1: { id: "PICKLES", name: "The Pickles", logo: "pickles-logo" },
    2: { id: "LIPPIT", name: "Lipp it and Rip it", logo: "lippit-logo" },
  });
});

test("missing logos retain canonical identity and use the compact visual fallback", async () => {
  const teams = buildScoringTeamPresentation({ match, display: { teamNames: display.teamNames } });
  assert.equal(teams[1].id, "PICKLES");
  assert.equal(teams[1].logo, "");
  const entry = await source("app/score/ScoreEntry.js");
  assert.match(entry, /fallback=\{compactInitials\(team\.name\)\}/);
  assert.match(entry, /aria-label=\{`\$\{team\.name\} team`\}/);
});

test("Singles and Best Ball preserve full canonical player names", () => {
  const singles = buildScoringSlots({ format: "SI", match, teamNames: display.teamNames, playerNames });
  assert.deepEqual(singles.map((slot) => slot.label), ["Michael Hunnicutt", "Patrick Noonan"]);
  const bestBall = buildScoringSlots({ format: "BB", match, teamNames: display.teamNames, playerNames });
  assert.deepEqual(bestBall.map((slot) => slot.label), [
    "Michael Hunnicutt", "Alex Monteleone", "Patrick Noonan", "Brenan Cavanaugh",
  ]);
});

test("Scramble remains exactly two team rows with full two-player pairings", () => {
  const scramble = buildScoringSlots({ format: "SC", match, teamNames: display.teamNames, playerNames });
  assert.equal(scramble.length, 2);
  assert.deepEqual(scramble.map(({ kind, playerId, pairing }) => ({ kind, playerId, pairing })), [
    { kind: "team", playerId: "MH01", pairing: "Michael Hunnicutt + Alex Monteleone" },
    { kind: "team", playerId: "PN01", pairing: "Patrick Noonan + Brenan Cavanaugh" },
  ]);
});

test("identity rows use logos, readable two-line names, and compact stable metrics", async () => {
  const [entry, styles] = await Promise.all([source("app/score/ScoreEntry.js"), source("app/score/score.module.css")]);
  assert.match(entry, /<ScoringTeamLogo team=\{team\}/);
  assert.match(entry, /pairingNames\.map/);
  assert.match(entry, /className=\{styles\.playerName\}/);
  assert.doesNotMatch(entry, /<small>\{slot\.teamName\}<\/small>/);
  assert.match(styles, /\.focusShell \.playerIdentity\{[^}]*grid-template-columns:30px minmax\(0,1fr\)/);
  assert.match(styles, /\.scoringTeamLogo\{[^}]*width:30px;height:30px/);
  assert.match(styles, /\.scoreMetric b\{[^}]*font-size:\.95rem/);
  assert.match(styles, /\.scoreMetric small\{[^}]*font-size:\.46rem/);
});

test("extreme portrait widths reflow metrics before sacrificing identity", async () => {
  const styles = await source("app/score/score.module.css");
  assert.match(styles, /@media\(max-width:410px\)\{\.focusShell \.scoreMetrics/);
  assert.match(styles, /grid-template-areas:"gross net" "strokes strokes"/);
  assert.match(styles, /\.pairingIdentity>span\{display:block\}/);
});

test("keypad targets and numeral typography remain unchanged", async () => {
  const styles = await source("app/score/score.module.css");
  assert.match(styles, /\.keypadGrid button\{[^}]*min-width:56px;min-height:58px/);
  assert.match(styles, /\.keypadGrid button\{[^}]*font-size:1\.22rem/);
});

test("selected and correction states remain row-local without duplicate identity cards", async () => {
  const entry = await source("app/score/ScoreEntry.js");
  assert.match(entry, /savedHole \? "Correcting score" : "Entering now"/);
  assert.doesNotMatch(entry, /className=\{styles\.entryFocus\}/);
});

test("identity refinement leaves scoring authority and mutation contracts frozen", async () => {
  const entry = await source("app/score/ScoreEntry.js");
  assert.match(entry, /syncQueue\.current\.enqueue\(\{/);
  assert.match(entry, /expectedRevision/);
  assert.match(entry, /expectedMatchRevision/);
  assert.match(entry, /\/api\/scoring\/current/);
  assert.doesNotMatch(entry, /google-sheets|round-scorecards-archive/i);
});
