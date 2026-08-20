import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { competitionRankLabel, playerRoundPerformance, playerTournamentPerformance } from "../lib/player-round-performance.js";
import { mergeCanonicalPlayerPresentation } from "../lib/player-presentation.js";
import { roundCompetitionRows } from "../lib/mobile-leaderboards.js";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Me leads with the authenticated golfer and canonical current-tournament performance", async () => {
  const [profile, route, write] = await Promise.all([
    source("app/me/ParticipantProfile.js"),
    source("app/api/player-passport/matches/route.js"),
    source("lib/google-sheets-write.js"),
  ]);

  assert.match(profile, /className=\{styles\.playerHero\}/);
  assert.match(profile, /<PlayerAvatar player=\{profile\}/);
  assert.match(profile, /profile\.teamName/);
  assert.match(profile, /className=\{logoStyles\.logoPlate\}/);
  assert.match(profile, /data-size="small"/);
  assert.match(profile, /className=\{logoStyles\.logoImage\}/);
  assert.match(profile, /formatHandicap\(profile\.tournamentHandicap\)/);
  assert.match(profile, /formatPlayerPoints\(snapshot\.points\)/);
  assert.match(profile, /Current tournament performance/);
  assert.match(route, /readLeaderboardsCoreView/);
  assert.match(route, /leaderboardsCoreDataFromSupabaseView/);
  assert.match(route, /includeCurrentMatchLifecycle: true/);
  assert.match(route, /mergeCanonicalPlayerPresentation/);
  assert.match(route, /playerTournamentPerformance/);
  assert.match(route, /Promise\.all/);
  assert.match(route, /X-Player-Performance-Source/);
  assert.doesNotMatch(profile, /\/api\/leaderboards\/core/);
  assert.match(write, /tournamentHandicap: playerHandicap/);
  assert.match(profile, /\$\{tournament\.year\} Sandbagger/);
  assert.match(profile, /\$\{year\} Tournament/);
  assert.doesNotMatch(profile, /2026 Tournament/);
  assert.match(profile, /<small>Position<\/small>/);
  assert.doesNotMatch(profile, /Tournament Points/);
  assert.doesNotMatch(profile, /Individual Rank/);
  assert.match(profile, /Team Standing/);
});

test("Me omits unavailable scores and renders an honest pending or not-played state", async () => {
  const profile = await source("app/me/ParticipantProfile.js");
  assert.match(profile, /round\.gross !== null/);
  assert.match(profile, /round\.net !== null/);
  assert.match(profile, /round\.roundRankLabel \?/);
  assert.match(profile, /round\.points !== null \?/);
  assert.match(profile, /Not played/);
  assert.match(profile, /Performance will appear when play begins/);
  assert.match(profile, /round\.format \? ` • \$\{round\.format\}`/);
  assert.match(profile, /<small>Round Rank<\/small>/);
  assert.doesNotMatch(profile, /Match Outcome/);
  assert.doesNotMatch(profile, /Tournament Snapshot/);
  assert.doesNotMatch(profile, /Current Standing[^\n]*[—-]/);
  assert.doesNotMatch(profile, /Tournament Handicap[^\n]*[—-]/);
});

test("career, utilities, and account settings follow player-first hierarchy", async () => {
  const profile = await source("app/me/ParticipantProfile.js");
  const renderedProfile = profile.slice(profile.indexOf("return <section className={styles.page}"));
  const labels = [
    "playerHero",
    "RoundPerformance rounds",
    "Profile &amp; Matches",
    "Utilities",
    "Notification Preferences",
    "Account & Session",
  ];
  const order = labels.map((label) => label === "Account & Session"
    ? renderedProfile.lastIndexOf(label)
    : renderedProfile.indexOf(label));
  order.forEach((position) => assert.notEqual(position, -1));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(profile, /NOTIFICATION_CATEGORIES\.map/);
  assert.match(profile, /window\.localStorage\.setItem\(preferenceKey/);
  assert.match(profile, /method: "DELETE"/);
  assert.doesNotMatch(renderedProfile, /<h2>Tournament History<\/h2>/);
  assert.match(renderedProfile, /Career, history, and achievements/);
});

function tournamentFixture() {
  const roundOneMatch = { id: "R1-M1", status: "Final", archiveFinal: true,
    team1Players: [{ id: "p1" }, { id: "p4" }], team2Players: [{ id: "p2" }, { id: "p3" }] };
  const roundTwoMatch = { id: "R2-M1", status: "Final", archiveFinal: true,
    team1Players: [{ id: "p1" }, { id: "p4" }], team2Players: [{ id: "p2" }, { id: "p3" }] };
  return {
    tournament: { teamOne: { name: "Pickles", score: 2 }, teamTwo: { name: "Rippers", score: 1 } },
    rounds: [
      { number: 3, format: "SI", status: "Upcoming", matches: [] },
      { number: 1, format: "BB", status: "Final", matches: [roundOneMatch] },
      { number: 2, format: "SC", status: "Final", matches: [roundTwoMatch] },
    ],
    scoreLeaderboard: [
      { id: "p2", round: 1, entityType: "PLAYER", holes: 18, gross: 70, net: 68, netToPar: -4 },
      { id: "p1", round: 1, entityType: "PLAYER", holes: 18, gross: 74, net: 70, netToPar: -2 },
      { id: "p3", round: 1, entityType: "PLAYER", holes: 18, gross: 74, net: 70, netToPar: -2 },
      { id: "p4", round: 1, entityType: "PLAYER", holes: 18, gross: 74, net: 70, netToPar: -2 },
      { id: "pair", playerIds: ["p1", "p4"], round: 2, entityType: "PAIRING", holes: 18, gross: 65, net: 60, netToPar: -12 },
      { id: "other-pair", playerIds: ["p2", "p3"], round: 2, entityType: "PAIRING", holes: 18, gross: 68, net: 63, netToPar: -9 },
      { id: "p1", round: 3, entityType: "PLAYER", holes: 0, gross: 0, net: 0, netToPar: null },
    ],
    roundLeaderboards: {
      1: [{ id: "p1", points: 1.5 }, { id: "p2", points: 0 }, { id: "p3", points: 0 }, { id: "p4", points: 1.5 }],
      2: [{ id: "p1", points: 0.75 }, { id: "p2", points: 0 }, { id: "p3", points: 0 }, { id: "p4", points: 0.75 }],
      3: [{ id: "p1", points: 0 }],
    },
    leaderboard: [
      { id: "p1", player: "Alex Monteleone", team: "Pickles", teamSide: 1, wins: 1, losses: 0, halves: 1, matchesPlayed: 2, points: 2.25 },
      { id: "p4", player: "Michael Hunnicutt", team: "Pickles", teamSide: 1, wins: 1, losses: 0, halves: 1, matchesPlayed: 2, points: 2.25 },
      { id: "p2", player: "Taylor Lippincott", team: "Rippers", teamSide: 2, wins: 0, losses: 1, halves: 0, matchesPlayed: 1, points: 0 },
    ],
  };
}

test("round performance reuses canonical round standings, official points, and canonical round order", () => {
  const tournamentData = tournamentFixture();
  const passportData = {
    player: { id: "p1", teamName: "Pickles" },
    matches: [
      { round: 1, status: "Final", team: { name: "Pickles" }, result: { winner: "Pickles" } },
      { round: 2, status: "Final", team: { name: "Pickles" }, result: { winner: "Halved" } },
    ],
  };
  const rows = playerRoundPerformance(tournamentData, passportData);
  assert.deepEqual(rows.map((row) => row.round), [1, 2, 3]);
  assert.equal(rows[0].format, "Best Ball");
  assert.equal(rows[0].gross, 74);
  assert.equal(rows[0].net, 70);
  const canonicalRound = roundCompetitionRows(tournamentData.scoreLeaderboard, 1, "BB", tournamentData.roundLeaderboards[1], tournamentData.rounds.find((round) => round.number === 1).matches);
  assert.equal(rows[0].roundRank, canonicalRound.find((row) => row.id === "p1").displayRank);
  assert.equal(rows[0].roundRankLabel, "T-1");
  assert.equal(rows[0].points, 1.5);
  assert.equal(rows[1].grossLabel, "Team Gross");
  assert.equal(rows[1].netLabel, "Team Net");
  assert.equal(rows[1].points, 0.75);
  assert.equal(rows[2].status, "Pending");
  assert.equal(rows[2].format, "Singles");
  assert.equal(rows[2].gross, null);
  assert.equal(rows[2].net, null);
  assert.equal(rows[2].points, null);
});

test("tournament summary reuses canonical overall and team standings with ties", () => {
  const performance = playerTournamentPerformance(tournamentFixture(), {
    player: { id: "p1", teamName: "Pickles" },
    matches: [{ round: 1, status: "Final", result: { winner: "Pickles" }, team: { name: "Pickles" } },
      { round: 2, status: "Final", result: { winner: "Halved" }, team: { name: "Pickles" } }],
  });
  assert.deepEqual(performance.snapshot, { record: { wins: 1, losses: 0, halves: 1 }, points: 2.25, standing: 1 });
  assert.equal(Object.hasOwn(performance.summary, "points"), false);
  assert.equal(Object.hasOwn(performance.summary, "individualRank"), false);
  assert.equal(Object.hasOwn(performance.summary, "individualRankLabel"), false);
  assert.equal(performance.summary.teamStandingLabel, "1st");
  assert.equal(competitionRankLabel(4, true), "T-4");
});

test("round status and Thru use canonical current match lifecycle instead of stale final presentation", () => {
  const tournamentData = tournamentFixture();
  tournamentData.currentMatchLifecycle = [
    { round: 1, matches: [{ id: "R1-M1", status: "Scheduled", scoringEnabled: true,
      scoringLocked: false, currentHole: 18, playerIds: ["p1", "p2", "p3", "p4"] }] },
    { round: 2, matches: [{ id: "R2-M1", status: "Live", scoringEnabled: true,
      scoringLocked: false, currentHole: 7, playerIds: ["p1", "p2", "p3", "p4"] }] },
    { round: 3, matches: [{ id: "R3-M1", status: "Upcoming", scoringEnabled: false,
      scoringLocked: false, currentHole: 0, playerIds: ["p1", "p2"] }] },
  ];
  const rows = playerRoundPerformance(tournamentData, { player: { id: "p1" } });
  assert.equal(rows[0].status, "Open");
  assert.equal(rows[0].points, null);
  assert.equal(rows[1].status, "Live");
  assert.equal(rows[1].thru, 7);
  assert.equal(rows[1].points, null);
  assert.equal(rows[2].status, "Pending");
});

test("Player hero merges the canonical shared player-photo presentation and preserves initials fallback", () => {
  const canonical = [
    { id: "clay", slug: "clay-beltran", photo: "clay-beltran-pic" },
    { id: "other", slug: "other-player", photo: "other-player-pic" },
    { id: "fallback", slug: "fallback-player", photo: "" },
  ];
  assert.equal(mergeCanonicalPlayerPresentation({ id: "clay", name: "Clay Beltran" }, canonical).photo, "clay-beltran-pic");
  assert.equal(mergeCanonicalPlayerPresentation({ id: "other", name: "Other Player" }, canonical).photo, "other-player-pic");
  assert.equal(mergeCanonicalPlayerPresentation({ id: "fallback", name: "Fallback Player" }, canonical).photo, "");
});

test("no-play and partial-play rows never manufacture zero scores", () => {
  const empty = tournamentFixture();
  empty.leaderboard = empty.leaderboard.map((row) => ({ ...row, wins: 0, losses: 0, halves: 0, matchesPlayed: 0, points: 0 }));
  empty.scoreLeaderboard = empty.scoreLeaderboard.map((row) => ({ ...row, holes: 0, gross: 0, net: 0, netToPar: null }));
  empty.rounds = empty.rounds.map((round) => ({ ...round, status: "Upcoming", matches: [] }));
  const noPlay = playerTournamentPerformance(empty, { player: { id: "p1", teamName: "Pickles" }, matches: [] });
  assert.equal(noPlay.snapshot, null);
  assert.equal(noPlay.summary, null);
  assert.ok(noPlay.rounds.every((round) => round.gross === null && round.net === null && round.roundRank === null && round.points === null));

  const partial = tournamentFixture();
  partial.rounds.find((round) => round.number === 2).status = "Live";
  partial.rounds.find((round) => round.number === 2).matches[0].status = "Live";
  partial.rounds.find((round) => round.number === 2).matches[0].currentHole = 7;
  partial.rounds.find((round) => round.number === 2).matches[0].archiveFinal = false;
  partial.scoreLeaderboard.find((row) => row.id === "pair").holes = 7;
  const live = playerRoundPerformance(partial, { player: { id: "p1" }, matches: [{ round: 2, status: "Live" }] });
  assert.equal(live[1].status, "Live");
  assert.equal(live[1].holes, 7);
  assert.equal(live[1].thru, 7);
  assert.equal(live[1].points, null);
});

test("completed Singles uses individual Gross, Net, and the shared round rank", () => {
  const singles = tournamentFixture();
  const round = singles.rounds.find((row) => row.number === 3);
  round.status = "Final";
  round.matches = [{ id: "R3-M1", status: "Final", archiveFinal: true,
    team1Players: [{ id: "p1" }], team2Players: [{ id: "p2" }] }];
  singles.scoreLeaderboard = singles.scoreLeaderboard.filter((row) => row.round !== 3).concat([
    { id: "p1", round: 3, entityType: "PLAYER", holes: 18, gross: 82, net: 75, netToPar: 3 },
    { id: "p2", round: 3, entityType: "PLAYER", holes: 18, gross: 80, net: 75, netToPar: 3 },
  ]);
  singles.roundLeaderboards[3] = [{ id: "p1", points: 1.5 }, { id: "p2", points: 0 }];
  const rows = playerRoundPerformance(singles, { player: { id: "p1" }, matches: [
    { round: 3, status: "Final", result: { winner: "Pickles" }, team: { name: "Pickles" } },
  ] });
  assert.equal(rows[2].format, "Singles");
  assert.equal(rows[2].grossLabel, "Gross");
  assert.equal(rows[2].netLabel, "Net");
  assert.equal(rows[2].gross, 82);
  assert.equal(rows[2].net, 75);
  assert.equal(rows[2].roundRankLabel, "1st");
});

test("participant navigation labels Me as Player without changing its route or icon", async () => {
  const navigation = await source("app/ParticipantIdentity.js");
  assert.match(navigation, /href: "\/me", label: "Player", icon: "profile"/);
  assert.doesNotMatch(navigation, /href: "\/me", label: "Me"/);
});

test("Me layout supports compact portrait, long identity values, player-photo fallback, and landscape", async () => {
  const css = await source("app/me/me.module.css");
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /@media\(orientation:landscape\)/);
  assert.match(css, /\.playerFallback/);
  assert.match(css, /translateY\(1px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /minmax\(0,1fr\)/);
});

test("Player Preview badge uses the existing environment badge with a page-local compact treatment", async () => {
  const [page, badge, css] = await Promise.all([
    source("app/me/page.js"), source("app/PreviewModeBadge.js"), source("app/preview-mode.module.css"),
  ]);
  assert.match(page, /PreviewModeBadge[^\n]*compact/);
  assert.match(badge, /compact = false/);
  assert.match(css, /\.compact[\s\S]*border-radius: 999px/);
  assert.match(css, /font-size: 0\.56rem/);
});
