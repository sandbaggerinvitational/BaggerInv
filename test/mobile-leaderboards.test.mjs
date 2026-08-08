import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  playerPerformanceRows,
  rankPlayerRows,
  roundCompetitionRows,
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
    { id: "p1", round: 1, entityType: "PLAYER", holes: 18, gross: 72, net: 68 },
    { id: "p1", round: 1, entityType: "PLAYER", holes: 9, gross: 34, net: 31 },
    { id: "p2", round: 1, entityType: "PLAYER", holes: 18, gross: 74, net: 70 },
    { id: "pair", round: 2, entityType: "PAIRING", holes: 18, gross: 65, net: 62 },
  ];
  const rounds = [{ number: 1, format: "Best Ball", matches: [{ status: "Final", team1Points: 1.5, team2Points: 1.5, team1Players: [{ id: "p1" }], team2Players: [{ id: "p2" }] }] }];
  const rows = playerPerformanceRows(players, scores, rounds);
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

test("competition round standings rank by official points, then net, then stable order", () => {
  const scores = [
    { id: "p1", playerIds: ["p1"], round: 1, entityType: "PLAYER", name: "Alpha", net: 70, netToPar: -2 },
    { id: "p2", playerIds: ["p2"], round: 1, entityType: "PLAYER", name: "Bravo", net: 62, netToPar: -10 },
    { id: "p3", playerIds: ["p3"], round: 1, entityType: "PLAYER", name: "Charlie", net: 64, netToPar: -8 },
    { id: "p4", playerIds: ["p4"], round: 1, entityType: "PLAYER", name: "Delta", net: 64, netToPar: -8 },
  ];
  const official = [
    { id: "p1", points: 1.5 }, { id: "p2", points: 1 },
    { id: "p3", points: 1 }, { id: "p4", points: 1 },
  ];
  const matches = scores.map((row) => ({ status: "Final", team1Players: [{ id: row.id }], team2Players: [] }));
  const ranked = roundCompetitionRows(scores, 1, "BB", official, matches);
  assert.deepEqual(ranked.map((row) => row.id), ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(ranked.map((row) => row.displayRank), [1, 2, 3, 3]);
  assert.deepEqual(ranked.map((row) => row.points), [1.5, 1, 1, 1]);
});

test("Scramble standings rank by summed team points and retain each partner's official credit", () => {
  const scores = [{ id: "match-1:team-1", playerIds: ["p1", "p2"], round: 2, entityType: "PAIRING", name: "Alpha / Bravo", net: 62 }];
  const official = [{ id: "p1", points: 1.25 }, { id: "p2", points: 1.25 }];
  const matches = [{ status: "Final", team1Players: [{ id: "p1" }, { id: "p2" }], team2Players: [] }];
  const [pairing] = roundCompetitionRows(scores, 2, "SC", official, matches);
  assert.equal(pairing.points, 2.5);
  assert.deepEqual(pairing.playerPoints, [{ playerId: "p1", points: 1.25 }, { playerId: "p2", points: 1.25 }]);
  assert.equal(pairing.playerPoints.reduce((sum, player) => sum + player.points, 0), pairing.points);
});

test("Scramble pairing rank uses team points before net score", () => {
  const scores = [
    { id: "m1:team-1", playerIds: ["p1", "p2"], round: 2, entityType: "PAIRING", name: "Alpha", net: 70 },
    { id: "m2:team-1", playerIds: ["p3", "p4"], round: 2, entityType: "PAIRING", name: "Bravo", net: 62 },
    { id: "m3:team-1", playerIds: ["p5", "p6"], round: 2, entityType: "PAIRING", name: "Charlie", net: 64 },
  ];
  const official = [
    { id: "p1", points: 1.5 }, { id: "p2", points: 1.5 },
    { id: "p3", points: 1 }, { id: "p4", points: 1 },
    { id: "p5", points: 1 }, { id: "p6", points: 1 },
  ];
  const matches = scores.map((row) => ({ status: "Final", team1Players: row.playerIds.map((id) => ({ id })), team2Players: [] }));
  const ranked = roundCompetitionRows(scores, 2, "Scramble", official, matches);
  assert.deepEqual(ranked.map((row) => row.id), ["m1:team-1", "m2:team-1", "m3:team-1"]);
  assert.deepEqual(ranked.map((row) => row.points), [3, 2, 2]);
  assert.deepEqual(ranked.map((row) => row.displayRank), [1, 2, 3]);
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

test("Teams reuse published team odds and one shared detail-sheet experience", async () => {
  const source = await readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/live/teams-leaderboard.module.css", import.meta.url), "utf8");
  assert.match(source, /function TeamDetailSheet/);
  assert.match(source, /title="Team Summary"/);
  assert.match(source, /Championship Odds/);
  assert.match(source, /latestTeamSnapshot/);
  assert.match(source, /snapshot\.teams/);
  assert.match(source, /formatChampionshipOdds\(odds\)/);
  assert.match(source, /odds === null \? "Pending"/);
  assert.match(source, /Round Breakdown/);
  assert.match(source, /Official team results/);
  assert.match(source, /setSelectedSide\(String\(team\.side\)\)/);
  assert.match(source, /YOUR TEAM/);
  assert.match(css, /grid-template-columns: 8% minmax\(0, 44%\) 16% 16% 16%/);
  assert.doesNotMatch(css, /overflow-x:\s*(?:auto|scroll)/);
});

test("round-origin Team taps render an in-memory recap while Overall stays tournament-focused", async () => {
  const source = await readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8");
  assert.match(source, /selectedRound !== "overall"/);
  assert.match(source, /<TeamRoundDetailSheet team=\{team\}/);
  assert.match(source, /teamRoundRecap\(round, team\.side\)/);
  assert.match(source, /\[\["wins", "Wins"\], \["ties", "Ties"\], \["losses", "Losses"\], \["inProgress", "In Progress"\]\]/);
  assert.match(source, /Match results will appear once play begins\./);
  assert.match(source, /match\.players\.map\(\(player\) => player\.name\)\.join\(" & "\)/);
  assert.equal((source.match(/fetchWithTransientRetry\("\/api\/live"/g) || []).length, 1);
});

test("Teams show Pending until a round has an official result", async () => {
  const source = await readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8");
  assert.match(source, /if \(!official\.length\) return "upcoming"/);
  assert.match(source, /pending \? <span className=\{teamStyles\.teamPending\}>Pending<\/span>/);
  assert.match(source, /pending \? "—" : team\.rank/);
  assert.match(source, /StatusBadge status=\{state\}/);
});

test("Teams and Insights share one retained odds request without tab-switch duplication", async () => {
  const source = await readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8");
  assert.match(source, /const \[oddsSnapshots, setOddsSnapshots\] = useState\(null\)/);
  assert.match(source, /oddsSnapshots !== null/);
  assert.match(source, /!\["teams", "insights"\]\.includes\(tab\)/);
  assert.match(source, /<Teams[^>]*snapshots=\{oddsSnapshots\}/);
  assert.match(source, /<Insights[^>]*snapshots=\{oddsSnapshots\}/);
  assert.equal((source.match(/fetch\(`\/api\/leaderboards\/insights/g) || []).length, 1);
});

test("insights publish only supported trusted metrics", () => {
  const performance = playerPerformanceRows(players, [
    { id: "p1", round: 1, entityType: "PLAYER", holes: 18, gross: 72, net: 68 },
    { id: "p2", round: 1, entityType: "PLAYER", holes: 18, gross: 74, net: 70 },
  ], [{ number: 1, format: "BB", matches: [{ status: "Final", team1Points: 1.5, team2Points: 1.5, team1Players: [{ id: "p1" }], team2Players: [{ id: "p2" }] }] }]);
  const insights = tournamentInsights(performance, [{ name: "The Pickles", points: 12.5 }]);
  assert.equal(insights.pointsLeader.id, "p1");
  assert.deepEqual(insights.unbeaten.map((row) => row.id), ["p1", "p3"]);
  assert.equal(insights.unbeaten.find((row) => row.id === "p3").record, "2-0-1");
  assert.equal(insights.lowestGross.id, "p1");
  assert.equal(insights.leadingTeam.name, "The Pickles");
});

test("individual averages use only official Best Ball and Singles scores", () => {
  const playerRows = [{ id: "p1", player: "Player One", wins: 0, losses: 0, halves: 0 }];
  const scores = [
    { id: "p1", round: 1, format: "BB", entityType: "PLAYER", holes: 18, gross: 69, net: 65 },
    { id: "pair-1", playerIds: ["p1", "p2"], round: 2, format: "SC", entityType: "PAIRING", holes: 18, gross: 62, net: 60 },
    { id: "p1", round: 3, format: "SI", entityType: "PLAYER", holes: 18, gross: 75, net: 71 },
  ];
  const finalMatch = (round) => ({ id: `m${round}`, status: "Final", team1Points: 3, team2Points: 0, team1Players: [{ id: "p1" }], team2Players: [{ id: "opponent" }] });
  const round1Only = [
    { number: 1, format: "Best Ball", matches: [finalMatch(1)] },
    { number: 2, format: "Scramble", matches: [finalMatch(2)] },
    { number: 3, format: "Singles", matches: [{ status: "Scheduled", team1Players: [{ id: "p1" }] }] },
  ];
  assert.deepEqual(
    (({ grossAvg, netAvg }) => ({ grossAvg, netAvg }))(playerPerformanceRows(playerRows, scores, round1Only)[0]),
    { grossAvg: 69, netAvg: 65 }
  );
  const throughRound3 = round1Only.map((round) => round.number === 3 ? { ...round, matches: [finalMatch(3)] } : round);
  assert.deepEqual(
    (({ grossAvg, netAvg }) => ({ grossAvg, netAvg }))(playerPerformanceRows(playerRows, scores, throughRound3)[0]),
    { grossAvg: 72, netAvg: 68 }
  );
});

test("pending, incomplete, and missing individual rounds never become fake zeroes", () => {
  const playerRows = [{ id: "p1", player: "Player One" }];
  const rounds = [{ number: 1, format: "BB", matches: [{ status: "Final", team1Points: 3, team2Points: 0, team1Players: [{ id: "p1" }], team2Players: [] }] }];
  assert.equal(playerPerformanceRows(playerRows, [], rounds)[0].grossAvg, null);
  assert.equal(playerPerformanceRows(playerRows, [{ id: "p1", round: 1, entityType: "PLAYER", holes: 17, gross: 68, net: 64 }], rounds)[0].netAvg, null);
  assert.equal(playerPerformanceRows(playerRows, [{ id: "p1", round: 1, entityType: "PLAYER", holes: 18, gross: 0, net: 0 }], [{ number: 1, format: "SC", matches: rounds[0].matches }])[0].grossAvg, null);
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
  assert.match(source, /🏆 Tournament Favorite/);
  assert.match(source, /playerPhotos/);
  assert.match(source, /insights\.players\.slice\(0, 10\)/);
  assert.match(source, /insights\.players\.slice\(10\)/);
  assert.match(source, /First Projection/);
  assert.match(source, /Movement tracking begins after the next published Championship Projection\./);
  assert.doesNotMatch(source, /Current Projection Favorite|Projected Tournament Champion/);
  assert.match(source, /rankMark/);
  assert.match(source, /data-medal=\{player\.rank <= 3 \|\| undefined\}/);
  assert.match(insightStyles, /favoritePortrait/);
  assert.match(insightStyles, /favoriteProbability/);
  assert.match(insightStyles, /topPlayers/);
  assert.match(insightStyles, /min-height:250px/);
  assert.match(insightStyles, /moversEmpty/);
  assert.match(insightStyles, /text-overflow:ellipsis/);
});

test("Championship Projections follows headline, story, favorite, movers, and projections order", async () => {
  const source = await readFile(componentUrl, "utf8");
  const hero = source.indexOf("🏆 Championship Odds");
  const story = source.indexOf('aria-label="Projection Story"');
  const favorite = source.indexOf('aria-label="Tournament Favorite"');
  const movers = source.indexOf('aria-label="Biggest Movers"');
  const board = source.indexOf('aria-label="Full Odds Board"');
  assert.ok(hero < story && story < favorite && favorite < movers && movers < board);
  assert.match(source, /<span>Projection Story<\/span>/);
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
  assert.match(source, /publishedPlayerHistory\(presentedSnapshots, selectedPlayerId\)/);
  assert.match(source, /setSelectedPlayerId\(String\(player\.id\)\)/);
  assert.doesNotMatch(source, /router\.push\([^\n]*projection/);
  assert.match(insightStyles, /sheetLayer\{position:fixed/);
  assert.match(insightStyles, /height:100dvh;overflow:clip/);
  assert.match(insightStyles, /overflow-y:auto;scroll-padding-bottom:[^;]+;overscroll-behavior-y:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch/);
  assert.match(insightStyles, /sheet>header\{position:sticky/);
  assert.match(insightStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(insightStyles, /data-podium="1"/);
  assert.match(insightStyles, /data-podium="2"/);
  assert.match(insightStyles, /data-podium="3"/);
});

test("Leaderboards use shared tournament identity, URL tabs, search, detail sheets, and Passport highlighting", async () => {
  const [source, matchCenter, sharedRow] = await Promise.all([readFile(componentUrl, "utf8"), readFile(matchCenterUrl, "utf8"), readFile(new URL("../app/live/LeaderboardRow.js", import.meta.url), "utf8")]);
  assert.match(matchCenter, /searchParams\.get\("view"\) === "leaderboards"/);
  assert.match(matchCenter, /<LeaderboardsDashboard/);
  assert.match(source, /import TournamentIdentityHeader/);
  assert.match(source, /<TournamentIdentityHeader/);
  assert.match(source, /\[\["players", "Players"\], \["teams", "Teams"\], \["skins", "Net Skins"\], \["insights", "Insights"\]\]/);
  assert.match(source, /params\.set\("view", "leaderboards"\)/);
  assert.match(source, /placeholder="Search players"/);
  assert.match(source, /<OverallPlayerSheet row=\{selected\}/);
  assert.match(source, /onClick=\{\(\) => setSelectedId\(row\.id\)\}/);
  assert.match(sharedRow, /aria-expanded=\{expanded\}/);
  assert.match(source, /fetch\("\/api\/player-passport\/session"/);
  assert.match(sharedRow, />YOU<\/em>/);
  assert.match(source, /function TeamNameWithBadge/);
  assert.match(source, /function TeamSheetName/);
  assert.match(source, /<TeamNameWithBadge name=\{team\.name\} current=\{currentTeam\}/);
  assert.match(source, /<TeamSheetName name=\{team\.name\} current=\{current\}/);
});

test("Teams delegate global status to the hero and keep round status in the board header", async () => {
  const [source, teamStyles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(new URL("../app/live/teams-leaderboard.module.css", import.meta.url), "utf8")]);
  assert.match(source, /<TournamentIdentityHeader[^>]*status=\{tournament\.status\}/);
  assert.match(source, /\{overall \? null : <StatusBadge status=\{state\} \/>\}/);
  assert.match(teamStyles, /\.teamNameLine \{[^}]*display: flex !important;[^}]*flex-wrap: wrap;[^}]*gap: 4px 7px;/s);
  assert.match(teamStyles, /\.teamNameLine em \{[^}]*border-radius: 999px;[^}]*white-space: nowrap;/s);
});

test("Team Summary owns responsive round rows without duplicating global status", async () => {
  const [source, teamStyles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(new URL("../app/live/teams-leaderboard.module.css", import.meta.url), "utf8")]);
  const detailStart = source.indexOf("function TeamDetailSheet");
  const detailEnd = source.indexOf("function Teams", detailStart);
  const detail = source.slice(detailStart, detailEnd);
  assert.doesNotMatch(detail, /<LeaderboardDetailSheet[^>]*status=/);
  assert.match(detail, /className=\{teamStyles\.teamRoundCard\}/);
  assert.match(detail, /className=\{teamStyles\.teamRoundHeader\}/);
  assert.match(detail, /className=\{teamStyles\.teamRoundMetrics\}/);
  assert.match(detail, /className=\{teamStyles\.teamRoundPending\}>Pending/);
  assert.match(teamStyles, /\.teamRoundHeader \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;[^}]*min-width: 0;/s);
  assert.match(teamStyles, /\.teamRoundMetrics \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/s);
  assert.match(teamStyles, /\.teamRoundBreakdown \.teamRoundCard \{[^}]*display: flex !important;[^}]*flex-direction: column !important;[^}]*width: 100%;/s);
  assert.match(teamStyles, /@media \(max-width: 340px\) \{[\s\S]*\.teamRoundHeader \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test("Overall Players delegates global status to the shared Tournament Hero", async () => {
  const source = await readFile(componentUrl, "utf8");
  const overallStart = source.indexOf("function OverallPlayers");
  const roundStart = source.indexOf("function RoundPlayers", overallStart);
  const overall = source.slice(overallStart, roundStart);
  assert.match(overall, /<small>Overall<\/small><h2>Player Leaderboard<\/h2>/);
  assert.doesNotMatch(overall, /<small>Overall<\/small><h2>Player Leaderboard<\/h2><\/span><StatusBadge/);
  assert.match(source, /<TournamentIdentityHeader[^>]*status=\{tournament\.status\}/);
  assert.match(source.slice(roundStart), /<StatusBadge status=\{complete \? "Final" : "Live"\}/);
});

test("Team result groups use section-level hierarchy above unchanged match cards", async () => {
  const teamStyles = await readFile(new URL("../app/live/teams-leaderboard.module.css", import.meta.url), "utf8");
  assert.match(teamStyles, /\.teamResultGroup \{[^}]*gap: 10px;[^}]*padding-top: 5px;/s);
  assert.match(teamStyles, /\.teamResultGroup h3 \{[^}]*font: 900 \.72rem\/1\.2 Arial, sans-serif;[^}]*letter-spacing: \.11em;/s);
  assert.match(teamStyles, /\.teamResultGroup \+ \.teamResultGroup \{ margin-top: 5px; \}/);
});

test("Team sheet names own the center track independently from YOUR TEAM", async () => {
  const [source, teamStyles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(new URL("../app/live/teams-leaderboard.module.css", import.meta.url), "utf8")]);
  assert.match(source, /function TeamSheetName/);
  assert.match(source, /<TeamSheetName name=\{team\.name\} current=\{current\}/);
  assert.match(teamStyles, /\.teamSheetName \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);[^}]*width: 100%;/s);
  assert.match(teamStyles, /\.teamSheetName strong \{[^}]*grid-column: 2;[^}]*text-align: center;/s);
  assert.match(teamStyles, /\.teamSheetName em \{[^}]*grid-column: 3;[^}]*justify-self: start;/s);
  assert.match(teamStyles, /@media \(max-width: 340px\) \{[\s\S]*\.teamSheetName \{ grid-template-columns: minmax\(0, 1fr\); justify-items: center;/);
});

test("Team sheet identities keep full-width natural wrapping above independent metrics", async () => {
  const [source, teamStyles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(new URL("../app/live/teams-leaderboard.module.css", import.meta.url), "utf8")]);
  assert.match(source, /className=\{teamStyles\.teamMatchIdentity\}><small>\{recap\.singles \? "Golfer" : "Pairing"\}<\/small><strong>\{match\.players/);
  assert.match(source, /className=\{teamStyles\.teamMatchTotal\}><small>Total Points<\/small><b>\{pointsLabel\(match\.totalPoints\)\}<\/b>/);
  assert.match(source, /className=\{teamStyles\.teamSegmentPoints\}><small>Segment Points<\/small><div>/);
  assert.match(teamStyles, /\.teamMatchCard \{[^}]*display: flex !important;[^}]*flex-direction: column !important;[^}]*width: 100%;/s);
  assert.match(teamStyles, /\.teamMatchIdentity \{[^}]*flex-direction: column !important;[^}]*width: 100% !important;/s);
  assert.match(teamStyles, /\.teamMatchIdentity strong \{[^}]*width: 100%;[^}]*overflow-wrap: normal;[^}]*word-break: normal;[^}]*hyphens: none;/s);
  assert.match(teamStyles, /\.teamSegmentPoints > div \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important;[^}]*width: 100%;/s);
  assert.doesNotMatch(teamStyles, /word-break:\s*break-all/);
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
