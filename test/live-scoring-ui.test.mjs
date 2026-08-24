import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile scorer supports participant match selection, every format, and revisions", async () => {
  const source = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(source, /Match code/);
  assert.match(source, /My Match/);
  assert.match(source, /selectedMatch/);
  assert.match(source, /format === "BB" \? 2 : 1/);
  assert.match(source, /gross score/);
  assert.match(source, /Finalize Match/);
  assert.match(source, /strokeDots/);
  assert.match(source, /formatLiveMatchResult/);
  assert.doesNotMatch(source, /function namedMatchStatus/);
  assert.match(source, /holeNavigator/);
  assert.match(source, /scorecardRow/);
  assert.doesNotMatch(source, /Gross &amp; net|Player points|Tournament Coverage|Live Leaderboard|My Profile/);
  assert.match(source, /expectedRevision/);
  assert.match(source, /Revision: result\.matchRevision \?\?/);
  assert.match(source, /matchRevision: result\.matchRevision \?\?/);
  assert.doesNotMatch(source, /sessionStorage/);
  assert.match(source, /\/api\/scoring\/current/);
  assert.match(source, /Please wait while your Player Passport and match are refreshed/);
  assert.match(source, /finalizedMatchResult\(match, data\?\.holeScores \|\| \[\], teamNames\)/);
  assert.match(source, /Return to My Match/);
  assert.match(source, /href="\/my-match"/);
  assert.doesNotMatch(source, /View Match Result/);
  assert.doesNotMatch(source, /isFinal \? "Match finalized"/);
  assert.doesNotMatch(source, /view=matchups/);
});

test("active scoring keeps hole, match status, progress, and next action visible", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/score.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /className=\{styles\.scoringContext\}/);
  assert.match(source, /<small>Match<\/small><strong>\{currentMatchStatus\}/);
  assert.match(source, /Hole \{holeNumber\} of 18/);
  assert.match(source, /progress\.remaining/);
  assert.match(source, /Save & Continue/);
  assert.match(source, /Save Hole & Review/);
  assert.match(styles, /\.scoringContext\{/);
  assert.match(styles, /\.scoringDock\{[^}]*position:sticky/);
});

test("final scorecard is a read-only official record with running match status", async () => {
  const source = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(source, /data-scorecard-state=\{isFinal \? "final" : scoringReadOnly \? "production-shadow-read-only" : "review"\}/);
  assert.match(source, /Official Tournament Scorecard/);
  assert.doesNotMatch(source, /Official Match Scorecard/);
  assert.match(source, /OFFICIAL TOURNAMENT RECORD/);
  assert.match(source, /className=\{styles\.officialCourse\}/);
  assert.match(source, /className=\{styles\.finalMatchSummary\}/);
  assert.match(source, /finalResultText/);
  assert.match(source, /Match Number/);
  assert.match(source, /Tee Time/);
  assert.doesNotMatch(source, /Starting Hole/);
  assert.match(source, /role="table"/);
  assert.match(source, /data-running="true"/);
  assert.match(source, /runningMatchStatusAtHole/);
  assert.match(source, /if \(readOnly\) return <span/);
  assert.match(source, /Scorecard confirmed/);
  assert.match(source, /Return to My Match/);
  assert.doesNotMatch(source, /<small>Team \{side\}<\/small>/);
});

test("review and active scoring stay focused without invoking the mobile number keyboard", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/score.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /CORRECTING HOLE \$\{holeNumber\}/);
  assert.match(source, /data-scoring-mode=\{savedHole \? "correction" : "new"\}/);
  assert.match(source, /<ScoringKeypad/);
  assert.doesNotMatch(source, /type="number"[^>]*gross score/);
  assert.doesNotMatch(source, /ParticipantLinks|leaderboardLinks/);
  assert.match(styles, /\.scoringDock\{[^}]*position:sticky/);
  assert.match(styles, /\.keypadGrid button\{[^}]*min-width:56px/);
});

test("scoring uses compact tournament identity and unique status context", async () => {
  const source = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(source, /import TournamentIdentityHeader/);
  assert.match(source, /<TournamentIdentityHeader/);
  assert.match(source, /compact/);
  assert.match(source, /showStatus=\{false\}/);
  assert.match(source, /Round \$\{match\.Round/);
  assert.match(source, /Match \$\{match\.Match/);
  assert.match(source, /currentMatchStatus/);
  assert.match(source, /Hole result/);
  assert.doesNotMatch(source, /`\$\{teamNames\[side\].*\} scramble`/);
});

test("final scorecard is the primary My Match record with secondary Game Center access", async () => {
  const source = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(source, /viewFinalScorecard/);
  assert.match(source, /View Game Center →/);
  assert.match(source, /Final match summary/);
  assert.match(source, /finalResultSummary/);
  assert.match(source, /Official Tournament Scorecard/);
});

test("final scorecard uses compact aligned hole winners and a non-redundant summary", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/score.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /function compactTeamName/);
  assert.match(source, /split\(\/\\s\+and\\s\+\/i\)\[0\]/);
  assert.match(source, /compactHoleWinnerMark\(score, teamNames\)/);
  assert.match(source, /function finalResultSummary/);
  assert.match(source, /`Won \$\{notation\}`/);
  assert.doesNotMatch(source, /<small>Winning Team<\/small>/);
  assert.doesNotMatch(source, /Starting Hole/);
  assert.match(styles, /\.scorecardRow\[data-winner=true\]>button[^}]*white-space:nowrap/);
  assert.match(styles, /\.finalCourse\{[^}]*grid-column:1\/-1/);
});

test("scramble scorecard team rows omit redundant gross terminology", async () => {
  const source = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(source, /format === "SC" \? teamNames\[side\] \|\| `Team \$\{side\}`/);
  assert.doesNotMatch(source, /`\$\{teamNames\[side\].*\} gross`/);
  assert.match(source, /format === "SC" \? "SCRAMBLE"/);
});

test("public Match Center refreshes while visible and stops its timer cleanly", async () => {
  const source = await readFile(new URL("../app/live/MatchCenter.js", import.meta.url), "utf8");
  assert.match(source, /setInterval\(poll, 30_000\)/);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /clearInterval\(timer\)/);
  assert.match(source, /fetch\("\/api\/live"/);
  assert.match(source, /refreshPromise\.current/);
  assert.match(source, /Unable to refresh/);
});

test("new scoring writes require a separate test spreadsheet", async () => {
  const [source, environment] = await Promise.all([
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/spreadsheet-environment.js", import.meta.url), "utf8"),
  ]);
  assert.match(environment, /SCORING_ENVIRONMENT !== "test"/);
  assert.match(environment, /requires a separate test GOOGLE_SHEETS_ID/);
  assert.match(environment, /Preview data access is blocked from the production spreadsheet/);
  assert.match(source, /assertLiveScoringWriteEnvironment/);
  assert.match(source, /expectedRevision/);
  assert.match(source, /matchComplete/);
  assert.match(source, /confirmLiveMatchScorecard/);
});

test("scoring login remains retryable while writes are rate limited", async () => {
  const [session, match] = await Promise.all([
    readFile(new URL("../app/api/scoring/session/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoring/matches/[matchId]/route.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(session, /scoring-login:/);
  assert.doesNotMatch(session, /Too many scoring login attempts/);
  assert.match(match, /scoring-write:/);
  assert.match(match, /limit:\s*30/);
});

test("hole scoring batches Google Sheet reads and updates locally after save", async () => {
  const [sheetSource, scorerSource] = await Promise.all([
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
  ]);
  assert.match(sheetSource, /\/values:batchGet/);
  assert.match(sheetSource, /readSheets\(\["Live Matches", "Live Hole Scores", "Course Holes"\]\)/);
  assert.match(scorerSource, /setData\(nextData\)/);
  assert.doesNotMatch(
    scorerSource.match(/const save = async \(\) => \{[\s\S]*?const confirmScorecard/)?.[0] || "",
    /await loadMatch/
  );
});
