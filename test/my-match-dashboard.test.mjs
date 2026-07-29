import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../app/score/MyMatchDashboard.js", import.meta.url);
const scoreUrl = new URL("../app/score/ScoreEntry.js", import.meta.url);
const styleUrl = new URL("../app/score/my-match-dashboard.module.css", import.meta.url);
const sheetUrl = new URL("../lib/google-sheets-write.js", import.meta.url);

test("My Match uses a compact tournament header and ordered match cards", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /<h1>My Match<\/h1>/);
  assert.match(source, /tournamentLogo\(filename\)/);
  assert.match(source, /Number\(left\.round \|\| 0\) - Number\(right\.round \|\| 0\)/);
  assert.match(source, /Round \$\{match\.round\} • Match \$\{match\.match\}/);
  assert.match(source, /<strong>{match\.format \|\| "Format TBA"}<\/strong>/);
  assert.doesNotMatch(source, /Welcome, .*Choose one of your tournament matches/);
});

test("My Match presents balanced teams with stacked player names and logo fallbacks", async () => {
  const [source, styles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(styleUrl, "utf8"),
  ]);
  assert.match(source, /players\.map\(\(name\) => <span key=\{name\}>\{name\}<\/span>\)/);
  assert.doesNotMatch(source, /join\(" \+ "\)/);
  assert.match(source, /fallbackSrc=\{type === "tournament" \? undefined : tournamentLogo\(tournamentLogoFilename\)\}/);
  assert.match(styles, /\.matchup\{[^}]*grid-template-columns:minmax\(0,1fr\) 24px minmax\(0,1fr\)/);
  assert.match(styles, /\.teamBlock\{[^}]*justify-items:center/);
  assert.match(styles, /\.teamBlock>div\{[^}]*display:grid/);
  assert.match(styles, /overflow-wrap:anywhere/);
});

test("My Match keeps status, scoring access, and final results distinct", async () => {
  const [source, sheet] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(sheetUrl, "utf8"),
  ]);
  for (const status of ["Live", "Final", "Locked", "Scoring Opens Soon", "Upcoming"]) {
    assert.equal(source.includes(status), true);
  }
  assert.match(source, /status === "Live"/);
  assert.match(source, /onClick=\{\(\) => onOpen\(match\)\}/);
  assert.match(source, /href=\{detailsHref\}/);
  assert.match(source, /"HALVED"/);
  assert.equal(source.includes('"WON"'), true);
  assert.equal(source.includes('"LOST"'), true);
  assert.match(sheet, /statusText: String\(match\["Match Status Text"\]/);
  assert.match(sheet, /match\["18-Hole Winner"\] \|\| match\["Matchup Winner"\]/);
});

test("My Match removes Passport removal and duplicate navigation from its list state", async () => {
  const [dashboard, score] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(scoreUrl, "utf8"),
  ]);
  assert.doesNotMatch(dashboard, /This isn’t me|Remove Player Passport/);
  assert.doesNotMatch(dashboard, /Tournament Coverage|Live Leaderboard|My Profile|My Tournament/);
  const passportBranch = score.match(/if \(!authorized && passportPlayer\)[\s\S]*?if \(!authorized\)/)?.[0] || "";
  assert.match(passportBranch, /<MyMatchDashboard/);
  assert.doesNotMatch(passportBranch, /ParticipantLinks/);
});

test("My Match provides compact special states and mobile-safe card geometry", async () => {
  const [source, styles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(styleUrl, "utf8"),
  ]);
  assert.match(source, /No tournament matches are assigned yet\./);
  assert.match(source, /Players TBA/);
  assert.match(source, /Course TBA/);
  assert.match(source, /Locked by Tournament Director/);
  assert.match(styles, /width:min\(100%,760px\)/);
  assert.match(styles, /minmax\(0,1fr\)/);
  assert.match(styles, /padding:22px 16px calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(styles, /overflow-x:\s*(auto|scroll)/);
  assert.match(styles, /@media\(max-width:420px\)/);
});
