import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("My Match tiers actionable, upcoming, and completed assignments without changing assignment order", async () => {
  const [source, styles] = await Promise.all([
    read("app/score/MyMatchDashboard.js"),
    read("app/score/my-match-dashboard.module.css"),
  ]);

  assert.match(source, /orderPlayerMatches\(matches, tournament\?\.currentRound\)/);
  assert.match(source, /const actionable = ordered\.filter/);
  assert.match(source, /Available to Score/);
  assert.match(source, /availableChoice: actionable\.length > 1/);
  assert.match(source, /current: status === "Live" && !availableChoice/);
  assert.match(source, /Coming Up/);
  assert.match(source, /Completed/);
  assert.match(styles, /\.matchCard\[data-tier=primary\]/);
  assert.match(styles, /\.matchGroup\[data-tier=upcoming\] \.matchList/);
  assert.match(styles, /\.matchGroup\[data-tier=completed\] \.matchList/);
  assert.doesNotMatch(source, /\.sort\(/);
});

test("My Match keeps identity readable and preserves format-specific assignment summaries", async () => {
  const [source, styles] = await Promise.all([
    read("app/score/MyMatchDashboard.js"),
    read("app/score/my-match-dashboard.module.css"),
  ]);

  assert.match(source, /homeFormatLabel\(match\.format\)/);
  assert.match(source, /players\.map/);
  assert.match(source, /players\.join\(" \+ "\)/);
  assert.match(source, /<small>Your side<\/small>/);
  assert.match(source, /<small>Opponents<\/small>/);
  assert.match(styles, /overflow-wrap:anywhere/);
  assert.doesNotMatch(styles, /\.matchHeading[^}]*text-overflow:ellipsis/);
  assert.match(styles, /@media\(max-width:355px\)/);
});

test("My Match exposes one dominant lifecycle action and a secondary Game Center entry", async () => {
  const [dashboard, score] = await Promise.all([
    read("app/score/MyMatchDashboard.js"),
    read("app/score/ScoreEntry.js"),
  ]);

  assert.match(dashboard, /match\.holesRecorded \? "Continue Scoring" : "Start Scoring"/);
  assert.match(dashboard, /status === "Final" \? "Final Scorecard"/);
  assert.match(dashboard, /className=\{styles\.secondaryAction\}[^>]*>Game Center/);
  assert.match(dashboard, /className=\{styles\.primaryAction\}/);
  assert.match(score, /requestedAction:[\s\S]*\? "VIEW_FINAL_SCORECARD" : "START_SCORING"/);
});

test("Game Center puts canonical match identity and live score before detailed participant and analytics content", async () => {
  const [page, source] = await Promise.all([
    read("app/game-center/[matchId]/page.js"),
    read("app/game-center/GameCenter.js"),
  ]);

  assert.doesNotMatch(page, /TournamentIdentityHeader/);
  const identity = source.indexOf("className={styles.matchIdentity}");
  const score = source.indexOf("className={styles.matchHero}");
  const participants = source.indexOf("className={styles.teamGrid}");
  const tracker = source.indexOf("<HoleTracker");
  const analytics = source.indexOf("<MatchStats");
  assert.ok(identity >= 0 && identity < score);
  assert.ok(score < participants && participants < tracker && tracker < analytics);
  assert.match(source, /Round \$\{roundNumber\}/);
  assert.match(source, /liveProgressLabel\(data\.state, through\)/);
  assert.match(source, /data\.state === "final" \? <a href="#scorecard">Final Scorecard<\/a>/);
});

test("Game Center preserves participant detail, scorecard, match flow, stats, and course context", async () => {
  const source = await read("app/game-center/GameCenter.js");

  for (const contract of [
    "TeamPanel",
    "HoleTracker",
    "HoleDetails",
    "ResultSegments",
    "GameCenterScorecard",
    "MatchStats",
    "CourseInformation",
  ]) assert.match(source, new RegExp(`<${contract}`));
  assert.match(source, /Team Playing Handicap/);
  assert.match(source, /Front • Back • Overall/);
});

test("Game Center return context defaults to My Match and preserves explicit safe origins", async () => {
  const [page, source, error] = await Promise.all([
    read("app/game-center/[matchId]/page.js"),
    read("app/game-center/GameCenter.js"),
    read("app/game-center/[matchId]/error.js"),
  ]);

  assert.match(page, /return "my-match"/);
  assert.match(page, /\["home", "my-match", "tournament"\]/);
  assert.match(page, /startsWith\("\/live\?view=leaderboards"\)/);
  assert.match(source, /leaderboardReturn \? backTo : "\/my-match"/);
  assert.match(error, /returnHref="\/my-match"/);
});

test("role polish is request-neutral and leaves scoring and backend ownership untouched", async () => {
  const [myMatch, gameCenter, page, packageJson] = await Promise.all([
    read("app/score/MyMatchDashboard.js"),
    read("app/game-center/GameCenter.js"),
    read("app/game-center/[matchId]/page.js"),
    read("package.json"),
  ]);

  assert.equal((myMatch.match(/fetch\(/g) || []).length, 0);
  assert.equal((gameCenter.match(/fetch\(/g) || []).length, 2);
  assert.match(gameCenter, /fetch\(`\/api\/game-center\//);
  assert.match(gameCenter, /fetch\("\/api\/player-passport\/matches"/);
  assert.doesNotMatch(myMatch + gameCenter + page, /google/i);
  assert.doesNotMatch(packageJson, /my-match-game-center-role-polish/);
});

test("responsive match surfaces preserve 44px actions, stable course logos, and reduced motion", async () => {
  const [matchStyles, centerStyles] = await Promise.all([
    read("app/score/my-match-dashboard.module.css"),
    read("app/game-center/game-center.module.css"),
  ]);

  assert.match(matchStyles, /\.primaryAction,\.secondaryAction\{[^}]*min-height:44px/);
  assert.match(matchStyles, /\.logoPlate\[data-type=course\]\{width:44px;height:44px\}/);
  assert.match(matchStyles, /width:38px;height:38px/);
  assert.match(matchStyles, /@media\(max-width:420px\)/);
  assert.match(matchStyles, /@media\(max-width:355px\)/);
  assert.match(centerStyles, /\.logo\[data-size=identity\]\{width:40px;height:40px\}/);
  assert.match(centerStyles, /@media\(max-width:420px\)/);
  assert.match(centerStyles, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(matchStyles + centerStyles, /overflow-x:(auto|scroll)/);
});
