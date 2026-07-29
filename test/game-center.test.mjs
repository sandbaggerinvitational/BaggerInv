import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  gameCenterHoles,
  gameCenterPoints,
  gameCenterState,
  gameCenterStats,
  liveMatchResult,
  matchPlayNotation,
  officialMatchResult,
} from "../lib/game-center.js";

const componentUrl = new URL("../app/game-center/GameCenter.js", import.meta.url);
const pageUrl = new URL("../app/game-center/[matchId]/page.js", import.meta.url);
const stylesUrl = new URL("../app/game-center/game-center.module.css", import.meta.url);
const dataUrl = new URL("../app/game-center/gameCenterData.js", import.meta.url);
const scoringUrl = new URL("../lib/google-sheets-write.js", import.meta.url);
const tournamentUrl = new URL("../app/live/TournamentDashboard.js", import.meta.url);
const myMatchUrl = new URL("../app/score/MyMatchDashboard.js", import.meta.url);

function completedWinners(teamOne = 10, teamTwo = 8) {
  return Array.from({ length: 18 }, (_, index) => ({
    "Hole Number": index + 1,
    "Hole Winner": index < teamOne ? "Team 1" : index < teamOne + teamTwo ? "Team 2" : "Halved",
  }));
}

test("Game Center uses the exact shared tournament header and a compact match identity", async () => {
  const [page, source] = await Promise.all([readFile(pageUrl, "utf8"), readFile(componentUrl, "utf8")]);
  assert.match(page, /import TournamentIdentityHeader from "\.\.\/\.\.\/TournamentIdentityHeader"/);
  assert.match(page, /<TournamentIdentityHeader/);
  assert.match(page, /year=\{initialData\.tournament\.year\}/);
  assert.match(source, /Round \{data\.match\.round \|\| data\.match\.Round\}/);
  assert.match(source, /Match \$\{matchNumber\}/);
  assert.match(source, /courseLine/);
  assert.doesNotMatch(source, /Invalid Date/);
});

test("Game Center resolves pre-match, live, and final states", () => {
  assert.equal(gameCenterState({ "Match Status": "Scheduled" }, []), "pre");
  assert.equal(gameCenterState({ "Match Status": "Live" }, []), "live");
  assert.equal(gameCenterState({ "Match Status": "Scheduled" }, [{ "Hole Number": 1 }]), "live");
  assert.equal(gameCenterState({ "Match Status": "Final" }, []), "final");
  assert.equal(gameCenterState({ "Finalized At": "2026-07-29T12:00:00Z" }, []), "final");
});

test("Live scoreboard supports All Square, one up, and two up", () => {
  const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  const match = { Format: "BB", "Match Status": "Live" };
  assert.equal(liveMatchResult(match, [
    { "Hole Number": 1, "Hole Winner": "Team 1" },
    { "Hole Number": 2, "Hole Winner": "Team 2" },
  ], names), "All Square");
  assert.equal(liveMatchResult(match, [
    { "Hole Number": 1, "Hole Winner": "Team 1" },
  ], names), "The Pickles 1 Up");
  assert.equal(liveMatchResult(match, [
    { "Hole Number": 1, "Hole Winner": "Team 2" },
    { "Hole Number": 2, "Hole Winner": "Team 2" },
  ], names), "Lipp It and Rip It 2 Up");
});

test("Final result preserves official wording and halved matches", () => {
  const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  assert.equal(officialMatchResult({
    "Match Status": "Final",
    "Match Status Text": "Team 1 WON 4 & 3",
  }, names), "The Pickles WON 4 & 3");
  assert.equal(officialMatchResult({
    "Match Status": "Final",
    "18-Hole Winner": "Halved",
    "Team 1 Points": 1.5,
    "Team 2 Points": 1.5,
  }, names), "HALVED");
});

test("Final match-play notation derives standard early and 18-hole results", () => {
  const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  const result = (team1Holes, team2Holes, halved = 0) => [
    ...Array.from({ length: team1Holes }, () => "Team 1"),
    ...Array.from({ length: team2Holes }, () => "Team 2"),
    ...Array.from({ length: halved }, () => "Halved"),
  ].map((winner, index) => ({ "Hole Number": index + 1, "Hole Winner": winner }));

  assert.equal(matchPlayNotation(result(8, 0, 3), names), "The Pickles 8 & 7");
  assert.equal(matchPlayNotation(result(4, 0, 11), names), "The Pickles 4 & 3");
  assert.equal(matchPlayNotation(result(2, 0, 15), names), "The Pickles 2 & 1");
  const alternating = Array.from({ length: 16 }, (_, index) => index % 2 ? "Team 2" : "Team 1");
  const holes = (winners) => winners.map((winner, index) => ({ "Hole Number": index + 1, "Hole Winner": winner }));
  assert.equal(matchPlayNotation(holes([...alternating, "Team 1", "Team 1"]), names), "The Pickles 2 UP");
  assert.equal(matchPlayNotation(holes([...alternating, "Halved", "Team 1"]), names), "The Pickles 1 UP");
  assert.equal(matchPlayNotation(holes([...alternating, "Team 1", "Team 2"]), names), "HALVED");
});

test("Preview Match 2026-R1-1 finalized sequence resolves to 7 & 6, not 8 & 7", () => {
  const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  const winners = ["Halved", "Team 2", "Halved", "Halved", "Team 2", "Team 2", "Halved", "Team 2", "Team 2", "Team 2", "Halved", "Team 2", "Team 1", "Halved", "Team 2", "Team 2", "Halved", "Halved"];
  const holes = winners.map((winner, index) => ({ "Hole Number": index + 1, "Hole Winner": winner }));
  assert.equal(matchPlayNotation(holes, names), "Lipp It and Rip It 7 & 6");
});

test("Hole tracker preserves won, lost, halved, current, and unplayed data", () => {
  const holes = gameCenterHoles([
    { "Hole Number": 1, "Hole Winner": "Team 1", "Team 1 Gross Scores": "[4,5]", "Team 1 Net Score": 3 },
    { "Hole Number": 2, "Hole Winner": "Team 2" },
    { "Hole Number": 3, "Hole Winner": "Halved" },
  ], [
    { "Hole Number": 1, Par: 4, Yardage: 410, "Stroke Index": 3 },
  ]);
  assert.equal(holes.length, 18);
  assert.deepEqual(holes.slice(0, 4).map((hole) => hole.winner), ["Team 1", "Team 2", "Halved", ""]);
  assert.equal(holes[0].par, 4);
  assert.equal(holes[0].strokeIndex, 3);
  assert.equal(holes[0].team1Gross, "[4,5]");
});

test("Match stats use only confirmed hole outcomes", () => {
  const stats = gameCenterStats(gameCenterHoles([
    { "Hole Number": 1, "Hole Winner": "Team 1" },
    { "Hole Number": 2, "Hole Winner": "Team 1" },
    { "Hole Number": 3, "Hole Winner": "Team 2" },
    { "Hole Number": 4, "Hole Winner": "Halved" },
  ]));
  assert.deepEqual(stats, {
    played: 4,
    team1: 2,
    team2: 1,
    halved: 1,
    biggestLead: 2,
    leadChanges: 0,
    remaining: 14,
  });
});

test("Front, back, overall, and official match points are retained", () => {
  const points = gameCenterPoints({ Format: "BB" }, completedWinners(10, 8));
  assert.equal(points.frontWinner, "Team 1");
  assert.equal(points.backWinner, "Team 2");
  assert.equal(points.overallWinner, "Team 1");
  assert.equal(points.team1Points, 2);
  assert.equal(points.team2Points, 1);

  const official = gameCenterPoints({
    Format: "BB",
    "Front 9 Winner": "Team 2",
    "Back 9 Winner": "Halved",
    "18-Hole Winner": "Team 2",
    "Team 1 Points": "0.5",
    "Team 2 Points": "2.5",
  }, []);
  assert.equal(official.team1Points, 0.5);
  assert.equal(official.team2Points, 2.5);
});

test("Best Ball, Singles, and Scramble handicap treatments remain distinct", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /format !== "SC"/);
  assert.match(source, /HCP \$\{formatHandicap\(player\.playingHcp\)\}/);
  assert.match(source, /No strokes/);
  assert.match(source, /Team Playing Handicap:/);
  assert.match(source, /team stroke/);
  assert.match(source, /format === "SI"/);
});

test("Game Center exposes one state-aware primary action and preserves scoring authorization", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /"Continue Scoring"/);
  assert.match(source, /"Start Scoring"/);
  assert.match(source, /View Final Scorecard/);
  assert.match(source, /Scoring opens before/);
  assert.match(source, /fetch\("\/api\/player-passport\/matches"/);
  assert.match(source, /body: JSON\.stringify\(\{ matchId \}\)/);
  assert.match(source, /window\.location\.assign\(response\.ok \? "\/score"/);
});

test("Game Center refreshes without overlapping requests and pauses while hidden", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /if \(requestActive\.current \|\| document\.visibilityState === "hidden"\) return/);
  assert.match(source, /fetch\(`\/api\/game-center\/\$\{encodeURIComponent\(matchId\)\}`/);
  assert.match(source, /setInterval\(refresh, 45_000\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", start\)/);
  assert.match(source, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(source, /cache: "no-store"/);
});

test("Course details and missing-data fallbacks are compact", async () => {
  const [source, scoring] = await Promise.all([readFile(componentUrl, "utf8"), readFile(scoringUrl, "utf8")]);
  for (const field of ["Yardage", "Par", "Rating", "Slope"]) assert.equal(source.includes(`"${field}"`) || source.includes(`[\"${field}\"`), true);
  assert.match(source, /Detailed course statistics are not published yet/);
  assert.match(source, /Scores will appear after this hole is confirmed/);
  assert.match(scoring, /course: \{/);
  assert.match(scoring, /rating: String\(course\["Course Rating"\] \|\| course\.Rating/);
  assert.match(scoring, /slope: String\(course\["Slope Rating"\] \|\| course\.Slope/);
});

test("Tournament and My Match View Match destinations route to Game Center without visual CSS changes", async () => {
  const [tournament, myMatch] = await Promise.all([readFile(tournamentUrl, "utf8"), readFile(myMatchUrl, "utf8")]);
  assert.match(tournament, /`\/game-center\/\$\{encodeURIComponent\(match\.id\)\}\?from=tournament`/);
  assert.match(myMatch, /`\/game-center\/\$\{encodeURIComponent\(match\.matchId\)\}\?from=my-match`/);
});

test("Game Center layout protects mobile widths and localizes hole interaction", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.match(styles, /\.content\{width:min\(100%,760px\)/);
  assert.match(styles, /\.scoreboard\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(104px,auto\) minmax\(0,1fr\)/);
  assert.match(styles, /\.teamGrid\{[^}]*grid-template-columns:minmax\(0,1fr\) 20px minmax\(0,1fr\)/);
  assert.match(styles, /\.holeGrid\{[^}]*grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(max-width:420px\)/);
  assert.doesNotMatch(styles, /overflow-x:(auto|scroll)/);
});

test("Hole Tracker uses clear single-character outcomes and accessible labels", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /<h2>Hole Tracker<\/h2>/);
  assert.match(source, /"½"/);
  assert.match(source, /teamMarker\(teamNames\[1\]\)/);
  assert.match(source, /teamMarker\(teamNames\[2\]\)/);
  assert.match(source, /won by \$\{winnerName/);
  assert.match(source, /"not played"/);
  assert.match(source, /current hole/);
  assert.doesNotMatch(source, /Hole-by-Hole/);
  assert.doesNotMatch(source, /initials\(teamNames\[[12]\]\)/);
});

test("Result segments avoid repeated headings and updater names", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /"Winner"/);
  assert.match(source, /"Halved"/);
  assert.match(source, /Point\$\{pointValue === 1/);
  assert.doesNotMatch(source, /options\.find\(\(\[key\]\) => key === selected\)/);
  assert.match(source, /<small>\{updatedLabel\}<\/small>/);
  assert.match(source, /Scorecard confirmed/);
  assert.match(source, /by \$\{data\.match\.updatedBy/);
});

test("Frozen Home, My Match, and Tournament remain outside this refinement", async () => {
  const [tournament, myMatch] = await Promise.all([readFile(tournamentUrl, "utf8"), readFile(myMatchUrl, "utf8")]);
  assert.match(tournament, /TournamentIdentityHeader/);
  assert.match(myMatch, /My Match/);
});

test("Game Center data is assembled server-side without exposing access fields", async () => {
  const [source, scoring] = await Promise.all([readFile(dataUrl, "utf8"), readFile(scoringUrl, "utf8")]);
  assert.match(source, /readLiveScoringMatch\(id\)/);
  assert.match(source, /getTournamentData\(\)/);
  assert.match(scoring, /filter\(\(\[key\]\) => !key\.startsWith\("Access "\)\)/);
});
