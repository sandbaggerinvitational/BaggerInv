import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../app/score/MyMatchDashboard.js", import.meta.url);
const scoreUrl = new URL("../app/score/ScoreEntry.js", import.meta.url);
const styleUrl = new URL("../app/score/my-match-dashboard.module.css", import.meta.url);
const sheetUrl = new URL("../lib/google-sheets-write.js", import.meta.url);

test("My Match uses a compact tournament header and tiered assignment groups", async () => {
  const [source, sheet] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(sheetUrl, "utf8"),
  ]);
  assert.match(source, /<h1 className=\{headerStyles\.heroTitle\}>My Matches<\/h1>/);
  assert.match(source, /tournamentLogo\(filename\)/);
  assert.match(sheet, /`sandbagger-\$\{context\.year\}`/);
  assert.match(source, /orderPlayerMatches\(matches, tournament\?\.currentRound\)/);
  assert.match(source, /Available to Score/);
  assert.match(source, /Current Match/);
  assert.match(source, /Next Match/);
  assert.match(source, /Coming Up/);
  assert.match(source, /Completed/);
  assert.match(source, /`Round \$\{match\.round\} · Match \$\{match\.match\}`/);
  assert.match(source, /homeFormatLabel\(match\.format\)/);
  assert.match(source, /data-tier=\{group\.tier\}/);
  assert.doesNotMatch(source, /Welcome, .*Choose one of your tournament matches/);
});

test("My Match presents full names in detailed and compact matchup summaries", async () => {
  const [source, styles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(styleUrl, "utf8"),
  ]);
  assert.match(source, /players\.map\(\(name\) => <span key=\{name\}>\{name\}<\/span>\)/);
  assert.match(source, /players\.join\(" \+ "\)/);
  assert.match(source, /<small>Your side<\/small>/);
  assert.match(source, /<small>Opponents<\/small>/);
  assert.match(source, /fallbackSrc=\{type === "tournament" \? undefined : tournamentLogo\(tournamentLogoFilename\)\}/);
  assert.match(styles, /\.matchup\{[^}]*grid-template-columns:minmax\(0,1fr\) 22px minmax\(0,1fr\)/);
  assert.match(styles, /\.teamBlock\{[^}]*justify-items:center/);
  assert.match(styles, /\.teamBlock>div\{[^}]*display:grid/);
  assert.match(styles, /overflow-wrap:anywhere/);
});

test("My Match keeps status, scoring access, Game Center, and final results distinct", async () => {
  const [source, sheet] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(sheetUrl, "utf8"),
  ]);
  assert.match(source, /appMatchStatus\(match\)/);
  assert.match(source, /formatStatusLabel\(status/);
  assert.match(source, /status === "Live"/);
  assert.match(source, /onClick=\{\(\) => onOpen\(match\)\}/);
  assert.match(source, /href=\{detailsHref\}/);
  assert.match(source, /className=\{styles\.primaryAction\}/);
  assert.match(source, /className=\{styles\.secondaryAction\}/);
  assert.match(source, /className=\{styles\.actionRow\}/);
  assert.match(source, /status === "Locked" \? <i aria-hidden="true">🔒<\/i>/);
  assert.doesNotMatch(source, /<footer>/);
  assert.match(source, /Start Scoring/);
  assert.match(source, /Continue Scoring/);
  assert.match(source, /Final Scorecard/);
  assert.match(source, /Game Center/);
  assert.match(source, /if \(!scorecardAction\)/);
  assert.match(source, /formatMatchResult\(match, match\.team\?\.side\)/);
  assert.doesNotMatch(source, /function participantResult/);
  assert.match(sheet, /statusText: String\(match\["Match Status Text"\]/);
  assert.match(sheet, /match\["18-Hole Winner"\] \|\| match\["Matchup Winner"\]/);
});

test("My Match formats tees, promotes actionable matches, and uses one dominant action", async () => {
  const [source, styles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(styleUrl, "utf8"),
  ]);
  assert.match(source, /return \/\\btees\?\$\/i\.test\(tee\) \? tee : `\$\{tee\} Tees`/);
  assert.match(source, /\.join\(" • "\)/);
  assert.match(source, /const actionable = ordered\.filter/);
  assert.match(source, /const promotedIds = new Set/);
  assert.match(source, /tier=\{group\.tier\}/);
  assert.match(source, /const displayStatus = primary \? formatStatusLabel\(status,/);
  assert.match(source, /<MatchStatusBlock status=\{displayStatus\} result=\{result\}/);
  assert.equal((source.match(/<MatchStatusBlock/g) || []).length, 1);
  assert.match(styles, /\.matchCard\[data-tier=primary\]\{[^}]*border:1\.5px solid #bd963b/);
  assert.match(styles, /\.primaryAction,\.secondaryAction\{[^}]*min-height:44px/);
  assert.match(styles, /\.primaryAction\{[^}]*background:#0b4938/);
  assert.match(styles, /\.secondaryAction\{[^}]*background:transparent/);
  assert.match(styles, /\.supportText\{[^}]*display:inline-flex/);
  assert.match(styles, /\.cardState\{[^}]*justify-items:end/);
  assert.doesNotMatch(styles, /\.matchCard footer/);
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
  assert.match(styles, /padding:18px 16px calc\(var\(--participant-nav-total\) \+ 20px\)/);
  assert.match(styles, /\.matchGroups,\.matchGroup,\.matchList\{display:grid\}/);
  assert.match(styles, /\.matchGroup\[data-tier=upcoming\] \.matchList,\.matchGroup\[data-tier=completed\] \.matchList\{[^}]*overflow:hidden/);
  assert.match(styles, /\.matchCard\{[^}]*padding:11px 12px/);
  assert.match(styles, /\.logoPlate\[data-type=course\]\{width:44px;height:44px\}/);
  assert.match(styles, /\.courseLine\{[^}]*border-bottom:1px solid #eee7da/);
  assert.match(styles, /\.courseLine strong\{[^}]*font-size:.82rem/);
  assert.match(styles, /\.compactMatchup strong\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(styles, /overflow-x:\s*(auto|scroll)/);
  assert.match(styles, /@media\(max-width:420px\)/);
});
