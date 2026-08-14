import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMMON_GOLF_SCORES,
  MAX_GOLF_SCORE,
  MIN_GOLF_SCORE,
  scoreFromKeypad,
} from "../lib/scoring-keypad.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ace and every normal golf score from 1 through 10 are direct keypad actions", async () => {
  const keypad = await source("app/score/ScoringKeypad.js");
  assert.deepEqual(COMMON_GOLF_SCORES, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const score of COMMON_GOLF_SCORES) assert.equal(scoreFromKeypad("", score), score);
  assert.match(keypad, /COMMON_GOLF_SCORES\.slice\(0, 9\)\.map/);
  assert.match(keypad, /onClick=\{\(\) => onScore\(10\)\}/);
  assert.match(keypad, /Scores 1–10 are one tap/);
});

test("plus and minus stay within the frozen scoring range", () => {
  let score = 10;
  while (score < MAX_GOLF_SCORE) score = scoreFromKeypad(score, "increment");
  assert.equal(score, 20);
  assert.equal(scoreFromKeypad(score, "increment"), MAX_GOLF_SCORE);
  while (score > MIN_GOLF_SCORE) score = scoreFromKeypad(score, "decrement");
  assert.equal(score, 1);
  assert.equal(scoreFromKeypad(score, "decrement"), MIN_GOLF_SCORE);
  assert.equal(scoreFromKeypad(12, "clear"), "");
});

test("active scoring uses one selected row and collision-safe metric cells", async () => {
  const [entry, styles] = await Promise.all([
    source("app/score/ScoreEntry.js"),
    source("app/score/score.module.css"),
  ]);
  assert.doesNotMatch(entry, /className=\{styles\.entryFocus\}/);
  assert.match(entry, /className=\{styles\.playerIdentity\}/);
  assert.match(entry, /className=\{styles\.scoreMetrics\}/);
  assert.match(entry, /Correcting score/);
  assert.match(entry, /Entering now/);
  assert.match(styles, /\.scoreMetrics\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.scoreMetric small\{[^}]*white-space:nowrap/);
  assert.match(styles, /\.scoreMetric b\{[^}]*font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(styles, /\.selectedMarker\{position:absolute/);
});

test("Singles, Scramble, and four-row Best Ball share the responsive scoring workspace", async () => {
  const [entry, styles] = await Promise.all([
    source("app/score/ScoreEntry.js"),
    source("app/score/score.module.css"),
  ]);
  assert.match(entry, /data-slot-count=\{scoringSlots\.length\}/);
  assert.match(entry, /data-format=\{format\}/);
  assert.match(entry, /scoringSlots\.map/);
  assert.match(styles, /@media\(max-width:440px\) and \(max-height:960px\)/);
  assert.match(styles, /\.focusShell \.scoringContext,\.holeProgress\{display:none\}/);
  assert.match(styles, /\.focusShell \.holeCardPlayer\{[^}]*min-height:52px/);
  assert.match(styles, /\.keypadGrid button\{[^}]*min-width:56px;min-height:58px/);
});

test("full player and pairing identities receive priority over compact Gross, Strokes, and Net", async () => {
  const styles = await source("app/score/score.module.css");
  assert.match(styles, /\.playerName,\.pairingIdentity\{[^}]*overflow-wrap:anywhere/);
  assert.match(styles, /\.playerName\{[^}]*-webkit-line-clamp:2/);
  assert.match(styles, /grid-template-columns:minmax\(0,1fr\) minmax\(112px,34%\)/);
  assert.match(styles, /\.scoreMetrics\{[^}]*min-width:0;[^}]*overflow:hidden/);
});

test("Clear is secondary, only changes the draft, and saved corrections retain confirmation", async () => {
  const [entry, keypad] = await Promise.all([
    source("app/score/ScoreEntry.js"),
    source("app/score/ScoringKeypad.js"),
  ]);
  assert.doesNotMatch(keypad, />Clear<\/button>/);
  assert.match(entry, /className=\{styles\.clearEntry\}/);
  assert.match(entry, /setScore\(selectedSlot\.sideKey, selectedSlot\.index, ""\)/);
  assert.match(entry, /if \(savedHole && draftDirty\)[\s\S]*setPendingCorrectionSave\(true\)/);
  assert.match(entry, /Save correction to Hole/);
});

test("saved scores use a compact recorded state instead of a large disabled action", async () => {
  const entry = await source("app/score/ScoreEntry.js");
  assert.match(entry, /unchangedSavedScore \? <div className=\{styles\.savedScoreState\}/);
  assert.match(entry, /Score recorded/);
  assert.match(entry, /change its value to correct it/);
});

test("Preview impersonation and app chrome compress only in active scoring", async () => {
  const [shell, navigation, header, globals, badge] = await Promise.all([
    source("app/ParticipantIdentity.js"),
    source("app/participant-navigation.module.css"),
    source("app/participant-app-header.module.css"),
    source("app/globals.css"),
    source("app/PreviewModeBadge.js"),
  ]);
  assert.match(navigation, /body\.participant-scoring-focus-active/);
  assert.match(navigation, /\.impersonation\{min-height:44px/);
  assert.match(shell, /className=\{styles\.actionCompact\}>Change</);
  assert.match(shell, /className=\{styles\.actionCompact\}>Exit</);
  assert.match(navigation, /\.actionFull\{display:none!important\}/);
  assert.match(header, /body\.participant-scoring-focus-active/);
  assert.match(globals, /preview-impersonation-active\.participant-scoring-focus-active/);
  assert.match(globals, /--participant-header-height:48px/);
  assert.match(badge, /data-preview-mode-badge/);
});

test("layout refinement leaves scoring authority and mutation contracts untouched", async () => {
  const [entry, values] = await Promise.all([
    source("app/score/ScoreEntry.js"),
    source("lib/live-score-values.js"),
  ]);
  assert.match(values, /numeric < 1 \|\| numeric > 20/);
  assert.match(entry, /syncQueue\.current\.enqueue\(\{/);
  assert.match(entry, /expectedRevision/);
  assert.match(entry, /expectedMatchRevision/);
  assert.match(entry, /\/api\/scoring\/current/);
  assert.doesNotMatch(entry, /google-sheets|round-scorecards-archive/i);
});
