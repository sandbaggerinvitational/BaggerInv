import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  gameCenterHoles,
  gameCenterNavigation,
  gameCenterPoints,
  gameCenterState,
  gameCenterStats,
  gameCenterUserTeamSide,
  finalMatchSummary,
  liveMatchResult,
  matchPlayNotation,
  finalizedMatchResult,
  officialMatchResult,
} from "../lib/game-center.js";
import { holeStory, liveProgressLabel, segmentMatchResult } from "../lib/game-center-display.js";

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
  assert.match(page, /status=\{initialData\.tournament\.status\}[\s\S]*compact/);
  assert.match(page, /year=\{initialData\.tournament\.year\}/);
  assert.match(source, /const matchContext = roundPosition\?\.total/);
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
  ], names), "The Pickles 1 UP");
  assert.equal(liveMatchResult(match, [
    { "Hole Number": 1, "Hole Winner": "Team 2" },
    { "Hole Number": 2, "Hole Winner": "Team 2" },
  ], names), "Lipp It and Rip It 2 UP");
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

  assert.equal(matchPlayNotation(result(8, 0, 3), names), "The Pickles 8&7");
  assert.equal(matchPlayNotation(result(4, 0, 11), names), "The Pickles 4&3");
  assert.equal(matchPlayNotation(result(2, 0, 15), names), "The Pickles 2&1");
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
  assert.equal(matchPlayNotation(holes, names), "Lipp It and Rip It 7&6");
});

test("shared final formatter overrides stale stored wording with trusted hole history", () => {
  const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  const winners = ["Halved", "Team 2", "Halved", "Halved", "Team 2", "Team 2", "Halved", "Team 2", "Team 2", "Team 2", "Halved", "Team 2"];
  const holes = winners.map((winner, index) => ({ "Hole Number": index + 1, "Hole Winner": winner }));
  const match = { "Match Status": "Final", "Match Status Text": "Team 2 8 UP through 18" };
  assert.equal(finalizedMatchResult(match, holes, names), "Lipp It and Rip It 7&6");
});

test("Game Center navigation stays within official tournament order and boundaries", () => {
  const rounds = [
    { number: 1, matches: [
      { id: "2026-R1-2", match: 2, teeTime: "8:20 AM" },
      { id: "2026-R1-1", match: 1, teeTime: "7:40 AM" },
    ] },
    { number: 2, matches: [{ id: "2026-R2-1", match: 1, teeTime: "2:40 PM" }] },
  ];
  assert.deepEqual(gameCenterNavigation(rounds, "2026-R1-1"), {
    previous: null,
    next: { id: "2026-R1-2", label: "Round 1, Match 2" },
    position: { round: 1, index: 1, total: 2 },
  });
  assert.deepEqual(gameCenterNavigation(rounds, "2026-R1-2"), {
    previous: { id: "2026-R1-1", label: "Round 1, Match 1" },
    next: { id: "2026-R2-1", label: "Round 2, Match 1" },
    position: { round: 1, index: 2, total: 2 },
  });
  assert.deepEqual(gameCenterNavigation(rounds, "2026-R2-1"), {
    previous: { id: "2026-R1-2", label: "Round 1, Match 2" },
    next: null,
    position: { round: 2, index: 1, total: 1 },
  });
  assert.deepEqual(gameCenterNavigation(rounds, "2025-R3-1"), { previous: null, next: null, position: null });
});

test("Game Center match context uses round-scoped position totals", () => {
  const rounds = [
    { number: 1, matches: [{ id: "R1-1", match: 1 }, { id: "R1-2", match: 2 }, { id: "R1-3", match: 3 }] },
    { number: 2, matches: [{ id: "R2-1", match: 1 }, { id: "R2-2", match: 2 }] },
  ];
  assert.deepEqual(gameCenterNavigation(rounds, "R1-1").position, { round: 1, index: 1, total: 3 });
  assert.deepEqual(gameCenterNavigation(rounds, "R1-2").position, { round: 1, index: 2, total: 3 });
  assert.deepEqual(gameCenterNavigation(rounds, "R1-3").position, { round: 1, index: 3, total: 3 });
  assert.deepEqual(gameCenterNavigation(rounds, "R2-2").position, { round: 2, index: 2, total: 2 });
});

test("live progress is accurate and absent outside genuinely live matches", () => {
  assert.equal(liveProgressLabel("live", 11), "Through 11 • 7 Holes Remaining");
  assert.equal(liveProgressLabel("live", 17), "Through 17 • 1 Hole Remaining");
  assert.equal(liveProgressLabel("live", 0), "Match in progress");
  assert.equal(liveProgressLabel("pre", 0), "");
  assert.equal(liveProgressLabel("final", 12), "");
  assert.doesNotMatch(liveProgressLabel("final", 18), /Through 18/);
});

test("current Player Passport identity resolves only the participating team", () => {
  const match = {
    team1Players: [{ id: "P-1" }, { id: "P-2" }],
    team2Players: [{ id: "P-3" }, { id: "P-4" }],
  };
  assert.equal(gameCenterUserTeamSide(match, "P-1"), 1);
  assert.equal(gameCenterUserTeamSide(match, "P-4"), 2);
  assert.equal(gameCenterUserTeamSide(match, "P-9"), 0);
  assert.equal(gameCenterUserTeamSide(match, ""), 0);
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

test("Home result and details destinations use same-origin Game Center with Home return context", async () => {
  const [home, page, center, scoring] = await Promise.all([
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(componentUrl, "utf8"),
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
  ]);
  assert.match(home, /`\/game-center\/\$\{encodeURIComponent\(match\.matchId\)\}\?from=home`/);
  assert.doesNotMatch(home, /view=matchups/);
  assert.match(page, /\["home", "my-match"\]\.includes\(query\?\.from\)/);
  assert.match(center, /backTo === "home" \? "\/home"/);
  assert.doesNotMatch(scoring, /`\/game-center\/\$\{encodeURIComponent\(matchId\)\}\?from=my-match`/);
  assert.doesNotMatch(scoring, /view=matchups/);
});

test("Game Center layout protects mobile widths and localizes hole interaction", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.match(styles, /:global\(html\):has\(\.page\),:global\(body\):has\(\.page\)\{overflow-x:hidden\}/);
  assert.match(styles, /\.content\{width:min\(100%,760px\)/);
  assert.match(styles, /\.scoreboard\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(104px,auto\) minmax\(0,1fr\)/);
  assert.match(styles, /\.teamGrid\{[^}]*grid-template-columns:minmax\(0,1fr\) 20px minmax\(0,1fr\)/);
  assert.match(styles, /\.holeGrid\{[^}]*grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(max-width:420px\)/);
  assert.doesNotMatch(styles, /overflow-x:(auto|scroll)/);
});

test("Game Center polish balances scoreboard identity and respects reduced motion", async () => {
  const [source, styles, page] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(pageUrl, "utf8"),
  ]);
  assert.match(styles, /\.logo\[data-size=score\]\{width:56px;height:56px\}/);
  assert.match(source, /liveProgressLabel\(data\.state, through\)/);
  assert.match(source, /className=\{styles\.yourTeam\}/);
  assert.match(source, /aria-label=\{`\$\{teamNames\[[12]\]\} is your team`\}/);
  assert.match(source, /Match \$\{roundPosition\.index\} of \$\{roundPosition\.total\}/);
  assert.match(page, /resolvePlayerPassportToken/);
  assert.match(styles, /data-newly-updated=true/);
  assert.match(styles, /animation:holeRecorded \.55s ease-out/);
  assert.match(styles, /transition:background-color \.2s ease/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /animation:none!important/);
  assert.doesNotMatch(source, /setUpdatedHoles\(payload\.data\.holes\.map/);
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
  assert.match(source, /Hole-by-Hole Scorecard/);
  assert.doesNotMatch(source, /initials\(teamNames\[[12]\]\)/);
});

test("Front, Back, and Overall present match-play results instead of points", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /segmentMatchResult\(data\.holes/);
  assert.match(source, /Front • Back • Overall/);
  assert.match(source, /className=\{styles\.segmentCards\}/);
  assert.doesNotMatch(source, /pointValue/);
  assert.doesNotMatch(source, /formatTeamPoints/);
  assert.match(source, /<small>\{updatedLabel\}<\/small>/);
  assert.match(source, /Scorecard confirmed/);
  assert.match(source, /by \$\{data\.match\.updatedBy/);
  assert.doesNotMatch(source, /Final Points/);
});

test("segment match-play results describe front, back, overall, and all-square states", () => {
  const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  const holes = ["Team 1", "Team 1", "Halved", "Team 2", "Team 1", "Team 2", "Team 1", "Halved", "Team 1", "Team 2"]
    .map((winner, index) => ({ number: index + 1, winner }));
  assert.deepEqual(segmentMatchResult(holes, 1, 9, names), { team: "The Pickles", result: "3 UP", recorded: 9 });
  assert.deepEqual(segmentMatchResult(holes, 10, 18, names), { team: "Lipp It and Rip It", result: "1 UP", recorded: 1 });
  assert.equal(segmentMatchResult([{ number: 1, winner: "Team 1" }, { number: 2, winner: "Team 2" }], 1, 9, names).result, "All Square");
  assert.deepEqual(segmentMatchResult([], 10, 18, names), { team: "", result: "Not started", recorded: 0 });
  assert.equal(segmentMatchResult(holes, 1, 18, names, "The Pickles 3&2").result, "3&2");
});

test("selected-hole storytelling explains wins, halves, and lead movement", () => {
  const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  const holes = [
    { number: 1, winner: "Team 1" },
    { number: 2, winner: "Team 1" },
    { number: 3, winner: "Halved" },
    { number: 4, winner: "Team 2" },
  ];
  assert.equal(holeStory(holes, 2, names), "The Pickles won Hole 2. The lead increases to 2 UP.");
  assert.equal(holeStory(holes, 3, names), "Hole 3 was halved. The lead remains 2 UP.");
  assert.equal(holeStory(holes, 4, names), "Lipp It and Rip It won Hole 4. The lead is reduced to 1 UP.");
  assert.equal(holeStory(holes, 5, names), "This hole has not been recorded yet.");
});

test("final match summary is factual and hidden outside reliable final states", () => {
  const final = { "Match Status": "Final" };
  const live = { "Match Status": "Live" };
  const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
  const score = (winners) => winners.map((winner, index) => ({
    "Hole Number": index + 1,
    "Hole Winner": winner,
  }));
  assert.equal(
    finalMatchSummary(final, score([...Array(7).fill("Team 2"), ...Array(5).fill("Halved")]), names),
    "Lipp It and Rip It clinched on Hole 12."
  );
  assert.equal(
    finalMatchSummary(final, score([...Array(4).fill("Team 1"), ...Array(11).fill("Halved")]), names),
    "The Pickles clinched on Hole 15."
  );
  assert.equal(
    finalMatchSummary(final, score(["Team 1", ...Array(17).fill("Halved")]), names),
    "The Pickles won 1 UP after 18 holes."
  );
  assert.equal(
    finalMatchSummary(final, score(Array(18).fill("Halved")), names),
    "Match was halved after 18 holes."
  );
  assert.equal(finalMatchSummary(final, score(Array(5).fill("Halved")), names), "");
  assert.equal(finalMatchSummary(live, score(Array(18).fill("Halved")), names), "");
  assert.equal(finalMatchSummary({}, [], names), "");
});

test("Game Center provides compact previous and next navigation with origin and loading protection", async () => {
  const [source, data] = await Promise.all([readFile(componentUrl, "utf8"), readFile(dataUrl, "utf8")]);
  assert.match(data, /gameCenterNavigation\(tournamentData\.rounds, id\)/);
  assert.match(source, /Previous Match/);
  assert.match(source, /Next Match/);
  assert.match(source, /from=\$\{encodeURIComponent\(backTo\)\}/);
  assert.match(source, /aria-label=\{`Previous match:/);
  assert.match(source, /aria-label=\{`Next match:/);
  assert.match(source, /if \(navigating\)/);
  assert.match(source, /window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
  assert.match(source, /<Link className=\{styles\.backLink\} href=\{backHref\}>/);
  assert.match(source, /className=\{styles\.matchNavigationGroup\}/);
  assert.match(source, /styles\.navigationCompact/);
});

test("navigation and official scorecard use compact balanced mobile presentation", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(styles, /\.matchNavigationGroup\{[^}]*display:flex/);
  assert.match(styles, /\.navigationCompact\{display:none\}/);
  assert.match(styles, /@media\(max-width:420px\)\{\.navigationFull\{display:none\}\.navigationCompact\{display:inline\}/);
  assert.match(source, /<details className=\{styles\.officialScorecard\}>/);
  assert.match(source, /Official Record/);
  assert.match(source, /runningMatchStatusAtHole/);
  assert.match(styles, /\.scorecardRow\{display:grid;grid-template-columns:82px repeat\(9,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.officialScorecard>summary/);
  assert.match(styles, /font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(source, /Final Points/);
  assert.match(source, /data\.state === "final" && data\.finalSummary/);
});

test("Game Center hero and story sections follow the live-match hierarchy", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /className=\{styles\.matchHero\}/);
  assert.match(source, /const resultWinner = \[teamNames\[1\], teamNames\[2\]\]\.find/);
  assert.match(source, /result=\{data\.state === "pre" \? "" : resultText/);
  assert.match(source, /className=\{styles\.holeStory\}/);
  assert.match(source, /The match was already decided on Hole \$\{clinchHole\}/);
  assert.match(source, /<ResultSegments data=\{data\} \/>[\s\S]*<GameCenterScorecard data=\{data\} \/>[\s\S]*<MatchStats data=\{data\} \/>[\s\S]*<CourseInformation data=\{data\} \/>/);
  assert.match(styles, /\.matchHero\{[^}]*border-radius:20px/);
  assert.match(styles, /\.scoreboard\{[^}]*min-height:150px/);
  assert.match(styles, /\.scoreboard \[data-prominent=true\] strong\{font-size:clamp\(1\.28rem,5\.6vw,1\.72rem\);letter-spacing:-\.02em;white-space:normal\}/);
  assert.match(styles, /\.holeGrid button\{min-height:48px/);
  assert.match(styles, /\.courseInfo\{border-color:#ded6c6;box-shadow:0 4px 14px/);
});

test("final Game Center polish emphasizes the result and uses cohesive Match Flow icons", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /function MatchFlowIcon/);
  assert.match(source, /strokeWidth: 1\.8/);
  assert.match(source, /segment === "front"/);
  assert.match(source, /segment === "back"/);
  assert.match(source, /<MatchFlowIcon segment=\{segment\.key\} \/>/);
  assert.match(styles, /\.segmentCards article small svg\{[^}]*width:13px;height:13px;stroke-width:1\.8/);
  assert.match(styles, /\.segmentCards article\{[^}]*justify-items:center/);
});

test("Tournament, My Match, and Home consume shared final result data", async () => {
  const homeAppUrl = new URL("../lib/mobile-tournament-app.js", import.meta.url);
  const sheetUrl = new URL("../app/live/sheetData.js", import.meta.url);
  const [tournament, myMatch, homeApp, sheet] = await Promise.all([
    readFile(tournamentUrl, "utf8"),
    readFile(myMatchUrl, "utf8"),
    readFile(homeAppUrl, "utf8"),
    readFile(sheetUrl, "utf8"),
  ]);
  assert.match(sheet, /finalizedMatchResult\(authoritative, matchHoleScores/);
  assert.match(tournament, /formatStoredMatchResult/);
  assert.match(myMatch, /formatMatchResult/);
  assert.match(homeApp, /formatParticipantMatchResult/);
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
