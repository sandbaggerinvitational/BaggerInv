import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(profile, /Current Position/);
  assert.doesNotMatch(profile, /Current Standing/);
});

test("Me gracefully omits unavailable tournament values instead of rendering placeholders", async () => {
  const profile = await source("app/me/ParticipantProfile.js");
  assert.match(profile, /snapshotItems = \[/);
  assert.match(profile, /\.filter\(Boolean\)/);
  assert.match(profile, /snapshotItems\.length \?/);
  assert.doesNotMatch(profile, /Current Standing[^\n]*[—-]/);
  assert.doesNotMatch(profile, /Tournament Handicap[^\n]*[—-]/);
});

test("profile, history, utilities, notifications, and Passport follow player-first hierarchy", async () => {
  const profile = await source("app/me/ParticipantProfile.js");
  const renderedProfile = profile.slice(profile.indexOf("return <section className={styles.page}"));
  const labels = [
    "playerHero",
    "Tournament Snapshot",
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

test("Me layout supports compact portrait, player-photo fallback, and landscape", async () => {
  const css = await source("app/me/me.module.css");
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /@media\(orientation:landscape\)/);
  assert.match(css, /\.playerFallback/);
  assert.match(css, /translateY\(1px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});
