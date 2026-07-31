import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { grossRankLabel, playerRoundPerformance } from "../lib/player-round-performance.js";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Me leads with the authenticated golfer and trusted tournament performance", async () => {
  const [profile, route, write] = await Promise.all([
    source("app/me/ParticipantProfile.js"),
    source("app/api/player-passport/matches/route.js"),
    source("lib/google-sheets-write.js"),
  ]);

  assert.match(profile, /className=\{styles\.playerHero\}/);
  assert.match(profile, /playerPhoto\(profile\.photo\)/);
  assert.match(profile, /fallback=\{initials\(profile\.name\)\}/);
  assert.match(profile, /profile\.teamName/);
  assert.match(profile, /className=\{logoStyles\.logoPlate\}/);
  assert.match(profile, /data-size="small"/);
  assert.match(profile, /className=\{logoStyles\.logoImage\}/);
  assert.match(profile, /formatHandicap\(profile\.tournamentHandicap\)/);
  assert.match(profile, /formatPlayerPoints\(snapshot\.points\)/);
  assert.match(profile, /Current tournament performance/);
  assert.match(route, /rankPlayerRows/);
  assert.match(route, /data\.snapshot\.standing = standing\.displayRank/);
  assert.match(write, /tournamentHandicap: playerHandicap/);
  assert.match(profile, /\$\{tournament\.year\} Sandbagger/);
  assert.doesNotMatch(profile, /Tournament Player/);
  assert.match(profile, /<small>Position<\/small>/);
  assert.doesNotMatch(profile, /Current Standing/);
});

test("Me gracefully omits unavailable tournament values instead of rendering placeholders", async () => {
  const profile = await source("app/me/ParticipantProfile.js");
  assert.match(profile, /round\.gross !== null/);
  assert.match(profile, /round\.grossRankLabel \?/);
  assert.match(profile, /round\.outcomes\?\.length \?/);
  assert.match(profile, /round\.points !== null \?/);
  assert.match(profile, /Upcoming/);
  assert.doesNotMatch(profile, /Tournament Snapshot/);
  assert.doesNotMatch(profile, /Current Standing[^\n]*[—-]/);
  assert.doesNotMatch(profile, /Tournament Handicap[^\n]*[—-]/);
});

test("profile, history, utilities, notifications, and Passport follow player-first hierarchy", async () => {
  const profile = await source("app/me/ParticipantProfile.js");
  const renderedProfile = profile.slice(profile.indexOf("return <section className={styles.page}"));
  const labels = [
    "playerHero",
    "RoundPerformance rounds",
    "Player Profile",
    "Tournament History",
    "Utilities",
    "Notifications",
    "Player Passport",
  ];
  const order = labels.map((label) => label === "Player Passport"
    ? renderedProfile.lastIndexOf(label)
    : renderedProfile.indexOf(label));
  order.forEach((position) => assert.notEqual(position, -1));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(profile, /NOTIFICATION_CATEGORIES\.map/);
  assert.match(profile, /window\.localStorage\.setItem\(preferenceKey/);
  assert.match(profile, /method: "DELETE"/);
});

test("round performance uses official gross ranks, round points, and match outcomes", () => {
  const tournamentData = {
    rounds: [
      { number: 1, format: "Best Ball", status: "Final" },
      { number: 2, format: "Scramble", status: "Final" },
      { number: 3, format: "Singles", status: "Upcoming" },
    ],
    scoreLeaderboard: [
      { id: "p2", round: 1, entityType: "PLAYER", gross: 70 },
      { id: "p1", round: 1, entityType: "PLAYER", gross: 74 },
      { id: "p3", round: 1, entityType: "PLAYER", gross: 74 },
      { id: "pair", playerIds: ["p1", "p4"], round: 2, entityType: "PAIRING", gross: 65 },
      { id: "other-pair", playerIds: ["p2", "p3"], round: 2, entityType: "PAIRING", gross: 68 },
    ],
    roundLeaderboards: {
      1: [{ id: "p1", points: 1.5 }],
      2: [{ id: "p1", points: 0.75 }],
      3: [{ id: "p1", points: 0 }],
    },
  };
  const passportData = {
    player: { id: "p1" },
    matches: [
      { round: 1, team: { name: "Pickles" }, result: { winner: "Pickles" } },
      { round: 2, team: { name: "Pickles" }, result: { winner: "Halved" } },
    ],
  };
  const rows = playerRoundPerformance(tournamentData, passportData);
  assert.deepEqual(rows[0], {
    round: 1, status: "Complete", gross: 74, grossRank: 2,
    grossRankLabel: "🥈 T-2", outcomes: ["Won"], points: 1.5,
  });
  assert.deepEqual(rows[1], {
    round: 2, status: "Complete", gross: 65, grossRank: 1,
    grossRankLabel: "🥇 1st", outcomes: ["Halved"], points: 0.75,
  });
  assert.equal(rows[2].status, "Upcoming");
  assert.equal(rows[2].gross, null);
  assert.equal(rows[2].points, null);
});

test("gross rank labels preserve competition ties and top-three rewards", () => {
  assert.equal(grossRankLabel(1), "🥇 1st");
  assert.equal(grossRankLabel(2), "🥈 2nd");
  assert.equal(grossRankLabel(3), "🥉 3rd");
  assert.equal(grossRankLabel(6, true), "T-6");
});

test("participant navigation labels Me as Player without changing its route or icon", async () => {
  const navigation = await source("app/ParticipantIdentity.js");
  assert.match(navigation, /href: "\/me", label: "Player", icon: "profile"/);
  assert.doesNotMatch(navigation, /href: "\/me", label: "Me"/);
});

test("Me layout supports compact portrait, player-photo fallback, and landscape", async () => {
  const css = await source("app/me/me.module.css");
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /@media\(orientation:landscape\)/);
  assert.match(css, /\.playerFallback/);
  assert.match(css, /translateY\(1px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});
