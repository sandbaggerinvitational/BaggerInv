import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  playerPerformanceRows,
  rankPlayerRows,
  roundScoreRows,
  searchPlayerRows,
  teamLeaderInsight,
  teamStandings,
  tournamentInsights,
} from "../lib/mobile-leaderboards.js";

const componentUrl = new URL("../app/live/LeaderboardsDashboard.js", import.meta.url);
const stylesUrl = new URL("../app/live/leaderboards-dashboard.module.css", import.meta.url);
const matchCenterUrl = new URL("../app/live/MatchCenter.js", import.meta.url);
const homeUrl = new URL("../app/PersonalizedPlayerHome.js", import.meta.url);
const tournamentUrl = new URL("../app/live/TournamentDashboard.js", import.meta.url);
const gameCenterUrl = new URL("../app/game-center/GameCenter.js", import.meta.url);
const myMatchUrl = new URL("../app/score/MyMatchDashboard.js", import.meta.url);

const players = [
  { id: "p1", player: "Jason Powell", wins: 3, losses: 0, halves: 0, points: 4.5, matchesPlayed: 3, team: "The Pickles", teamSide: 1 },
  { id: "p2", player: "Clay Beltran", wins: 2, losses: 1, halves: 0, points: 3, matchesPlayed: 3, team: "Lipp It and Rip It", teamSide: 2 },
  { id: "p3", player: "Alex Monteleone", wins: 2, losses: 0, halves: 1, points: 3, matchesPlayed: 3, team: "The Pickles", teamSide: 1 },
];

test("official player standings preserve points, records, ties, and alternate metrics", () => {
  const scores = [
    { id: "p1", entityType: "PLAYER", holes: 18, gross: 72, net: 68 },
    { id: "p1", entityType: "PLAYER", holes: 9, gross: 34, net: 31 },
    { id: "p2", entityType: "PLAYER", holes: 18, gross: 74, net: 70 },
    { id: "pair", entityType: "PAIRING", holes: 18, gross: 65, net: 62 },
  ];
  const rows = playerPerformanceRows(players, scores);
  assert.equal(rows[0].record, "3-0-0");
  assert.equal(rows[0].grossAvg, 72);
  assert.equal(rows[0].winPct, 100);
  assert.equal(rows[1].netAvg, 70);
  assert.equal(rankPlayerRows(rows, "points")[0].id, "p1");
  assert.equal(rankPlayerRows(rows, "grossAvg")[0].id, "p1");
  assert.equal(rankPlayerRows(rows, "points").find((row) => row.id === "p3").displayRank, 2);
  assert.equal(searchPlayerRows(rows, "clay")[0].id, "p2");
  assert.equal(searchPlayerRows(rankPlayerRows(rows, "points"), "clay")[0].displayRank, 2);
  assert.deepEqual(searchPlayerRows(rows, "missing"), []);
});

test("round standings keep Scramble pairings singular and individual formats separate", () => {
  const rows = [
    { id: "pair-a", round: 2, entityType: "PAIRING", name: "Clay / Alex", holes: 18, gross: 65, net: 62, netToPar: -10 },
    { id: "p1", round: 2, entityType: "PLAYER", name: "Clay", holes: 18, gross: 65, net: 62, netToPar: -10 },
    { id: "p1", round: 1, entityType: "PLAYER", name: "Clay", holes: 18, gross: 72, net: 68, netToPar: -4 },
  ];
  assert.deepEqual(roundScoreRows(rows, 2, "SC").map((row) => row.id), ["pair-a"]);
  assert.deepEqual(roundScoreRows(rows, 1, "BB").map((row) => row.id), ["p1"]);
  assert.equal(roundScoreRows(rows, 1, "BB")[0].displayRank, 1);
});

test("team standings use official overall points and round-scoped finalized records", () => {
  const tournament = {
    teamOne: { name: "The Pickles", score: 12.5 },
    teamTwo: { name: "Lipp It and Rip It", score: 10.5 },
  };
  const rounds = [{ number: 1, matches: [
    { status: "Final", matchupWinner: "Team 1", team1Points: 1, team2Points: 0 },
    { status: "Final", matchupWinner: "Halved", team1Points: 0.5, team2Points: 0.5 },
    { status: "Upcoming" },
  ] }];
  const overall = teamStandings(rounds, tournament, "overall");
  assert.equal(overall[0].points, 12.5);
  assert.equal(overall[0].record, "1-0-1");
  assert.equal(overall[0].remaining, 1);
  const round = teamStandings(rounds, tournament, "1");
  assert.equal(round[0].points, 1.5);
  assert.equal(round[1].points, 0.5);
});

test("insights publish only supported trusted metrics", () => {
  const performance = playerPerformanceRows(players, [
    { id: "p1", entityType: "PLAYER", holes: 18, gross: 72, net: 68 },
    { id: "p2", entityType: "PLAYER", holes: 18, gross: 74, net: 70 },
  ]);
  const insights = tournamentInsights(performance, [{ name: "The Pickles", points: 12.5 }]);
  assert.equal(insights.pointsLeader.id, "p1");
  assert.deepEqual(insights.undefeated.map((row) => row.id), ["p1", "p3"]);
  assert.equal(insights.lowestGross.id, "p1");
  assert.equal(insights.leadingTeam.name, "The Pickles");
});

test("team leader insight distinguishes sole leaders from official points ties", () => {
  const sole = teamLeaderInsight([
    { side: 1, name: "The Pickles", points: 4 },
    { side: 2, name: "Lipp It and Rip It", points: 3 },
  ]);
  assert.equal(sole.label, "Team Leader");
  assert.equal(sole.tied, false);
  assert.equal(sole.pointsLabel, "4 points");

  const tied = teamLeaderInsight([
    { side: 1, name: "The Pickles", points: 3 },
    { side: 2, name: "Lipp It and Rip It", points: 3 },
  ]);
  assert.equal(tied.label, "Team Leaders");
  assert.equal(tied.tied, true);
  assert.equal(tied.namesLabel, "The Pickles and Lipp It and Rip It");
  assert.equal(tied.pointsLabel, "3 points each");
  assert.equal(tied.accessibleLabel, "Team leaders tied at 3 points: The Pickles and Lipp It and Rip It");
});

test("team leader insight supports multiple ties, singular points, and official tie-break resolution", () => {
  const teams = [
    { side: 1, name: "A Very Long First Team Name", points: 1 },
    { side: 2, name: "A Very Long Second Team Name", points: 1 },
    { side: 3, name: "A Very Long Third Team Name", points: 1 },
  ];
  const tied = teamLeaderInsight(teams);
  assert.equal(tied.leaders.length, 3);
  assert.equal(tied.pointsLabel, "1 point each");
  assert.match(tied.namesLabel, /First Team Name, A Very Long Second Team Name, and A Very Long Third Team Name/);

  const resolved = teamLeaderInsight(teams, { state: { complete: true, championSide: 2 } });
  assert.equal(resolved.tied, false);
  assert.equal(resolved.label, "Team Leader");
  assert.equal(resolved.leaders[0].side, 2);
});

test("Insights renders published Championship Odds without invoking the odds engine", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /\/api\/leaderboards\/insights\?year=/);
  assert.match(source, /publishedOddsInsights\(presentedSnapshots\)/);
  assert.match(source, /🏆 Championship Odds/);
  assert.match(source, /Tournament Favorite/);
  assert.match(source, /Full Odds Board/);
  assert.doesNotMatch(source, /simulateTournamentOdds|calculateAmericanOdds/);
});

test("Insights uses compact responsive odds presentation without overflow-prone names", async () => {
  const [source, insightStyles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../app/live/leaderboards-insights.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /aria-label="Biggest Movers"/);
  assert.match(source, /aria-label="Full Odds Board"/);
  assert.match(source, /Tournament projections will publish after official pairings are finalized\./);
  assert.match(insightStyles, /grid-template-columns:34px minmax\(0,1fr\) 76px 58px 64px/);
  assert.match(insightStyles, /text-overflow:ellipsis/);
  assert.match(insightStyles, /@media\(max-width:390px\)/);
});

test("Championship Odds promotes the favorite and supplied Top 10 without changing odds data", async () => {
  const [source, insightStyles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../app/live/leaderboards-insights.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /🥇 Tournament Favorite/);
  assert.match(source, /playerPhotos/);
  assert.match(source, /insights\.players\.slice\(0, 10\)/);
  assert.match(source, /insights\.players\.slice\(10\)/);
  assert.match(source, /First Projection/);
  assert.match(source, /Movement tracking begins after the next published Championship Projection\./);
  assert.match(source, /Current Projection Favorite/);
  assert.match(source, /rankMark/);
  assert.match(source, /data-medal=\{player\.rank <= 3 \|\| undefined\}/);
  assert.match(insightStyles, /favoritePortrait/);
  assert.match(insightStyles, /favoriteProbability/);
  assert.match(insightStyles, /topPlayers/);
  assert.match(insightStyles, /min-height:250px/);
  assert.match(insightStyles, /moversEmpty/);
  assert.match(insightStyles, /text-overflow:ellipsis/);
});

test("Championship Projections opens in-place player details from every published field", async () => {
  const [source, insightStyles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../app/live/leaderboards-insights.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /selectedPlayerId/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /Current Championship Projection/);
  assert.match(source, /Projection History/);
  assert.match(source, /This is the first published Championship Projection\./);
  assert.match(source, /\(snapshot\.players \|\| \[\]\)\.find/);
  assert.match(source, /setSelectedPlayerId\(String\(player\.id\)\)/);
  assert.doesNotMatch(source, /router\.push\([^\n]*projection/);
  assert.match(insightStyles, /sheetLayer\{position:fixed/);
  assert.match(insightStyles, /data-podium="1"/);
  assert.match(insightStyles, /data-podium="2"/);
  assert.match(insightStyles, /data-podium="3"/);
});

test("Leaderboards use shared tournament identity, URL tabs, search, expansion, and Passport highlighting", async () => {
  const [source, matchCenter] = await Promise.all([readFile(componentUrl, "utf8"), readFile(matchCenterUrl, "utf8")]);
  assert.match(matchCenter, /searchParams\.get\("view"\) === "leaderboards"/);
  assert.match(matchCenter, /<LeaderboardsDashboard/);
  assert.match(source, /import TournamentIdentityHeader/);
  assert.match(source, /<TournamentIdentityHeader/);
  assert.match(source, /\[\["players", "Players"\], \["teams", "Teams"\], \["skins", "Net Skins"\], \["insights", "Insights"\]\]/);
  assert.match(source, /params\.set\("view", "leaderboards"\)/);
  assert.match(source, /placeholder="Search players"/);
  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /fetch\("\/api\/player-passport\/session"/);
  assert.match(source, />YOU<\/em>/);
  assert.match(source, />YOUR TEAM<\/em>/);
});

test("Leaderboards remain compact without horizontal page scrolling", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.match(styles, /:global\(body\):has\(\.page\)\{overflow-x:hidden\}/);
  assert.match(styles, /\.overallRow\{[^}]*grid-template-columns:10% minmax\(0,50%\) 20% 20%/);
  assert.match(styles, /\.roundRow\{[^}]*grid-template-columns:34px minmax\(92px,1\.55fr\)/);
  assert.match(styles, /\.roundSelector\{display:flex;overflow-x:auto/);
  assert.match(styles, /@media\(max-width:420px\)/);
});

test("frozen Home, My Match, Tournament, and Game Center remain outside Leaderboards styling", async () => {
  const [home, myMatch, tournament, gameCenter, source] = await Promise.all([
    readFile(homeUrl, "utf8"),
    readFile(myMatchUrl, "utf8"),
    readFile(tournamentUrl, "utf8"),
    readFile(gameCenterUrl, "utf8"),
    readFile(componentUrl, "utf8"),
  ]);
  assert.match(home, /PersonalizedPlayerHome/);
  assert.match(myMatch, /MyMatchDashboard/);
  assert.match(tournament, /TournamentDashboard/);
  assert.match(gameCenter, /Game Center match navigation/);
  assert.doesNotMatch(source, /TournamentDashboard|GameCenter|MyMatchDashboard|HomeDashboard/);
});
