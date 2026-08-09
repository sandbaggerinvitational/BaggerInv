import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  countdownParts,
  matchAction,
  orderPlayerMatches,
  selectRelevantPlayerMatches,
} from "../lib/player-home.js";
import {
  formatHomeTime,
  todaysSchedule,
} from "../lib/home-dashboard.js";

test("My Matches puts the actionable current round before finals and orders finals newest first", () => {
  const ordered = orderPlayerMatches([
    { matchId: "r1", round: 1, match: 4, status: "Final" },
    { matchId: "r2", round: 2, match: 5, status: "Final" },
    { matchId: "r3", round: 3, match: 2, status: "Scheduled", accessActive: false },
  ], 3);
  assert.deepEqual(ordered.map((match) => match.matchId), ["r3", "r2", "r1"]);
});

test("My Matches prioritizes live, ready, current locked, future, then completed", () => {
  const ordered = orderPlayerMatches([
    { matchId: "final", round: 2, status: "Final" },
    { matchId: "future", round: 4, status: "Scheduled", accessActive: true },
    { matchId: "locked", round: 3, status: "Locked", accessActive: false },
    { matchId: "ready", round: 3, scoringEnabled: true },
    { matchId: "live", round: 3, status: "Live" },
  ], 3);
  assert.deepEqual(ordered.map((match) => match.matchId), ["live", "ready", "locked", "future", "final"]);
});

test("an in-progress player match is prioritized", () => {
  const result = selectRelevantPlayerMatches([
    { matchId: "future", round: 2, status: "Scheduled", teeTimeAt: "2026-09-26T12:00:00-05:00" },
    { matchId: "live", round: 1, status: "Live", currentHole: 8 },
    { matchId: "open", round: 1, status: "Scheduled", scoringEnabled: true },
  ], 1);
  assert.equal(result.primary.matchId, "live");
});

test("an open current-round match is preferred over upcoming matches", () => {
  const result = selectRelevantPlayerMatches([
    { matchId: "future", round: 2, status: "Scheduled" },
    { matchId: "open", round: 1, status: "Scheduled", scoringEnabled: true },
  ], 1);
  assert.equal(result.primary.matchId, "open");
});

test("multiple simultaneously open matches require an explicit choice", () => {
  const result = selectRelevantPlayerMatches([
    { matchId: "a", round: 1, scoringEnabled: true },
    { matchId: "b", round: 1, scoringEnabled: true },
  ], 1);
  assert.equal(result.primary, null);
  assert.deepEqual(result.choices.map((match) => match.matchId), ["a", "b"]);
});

test("final and locked matches use safe non-editing actions", () => {
  assert.deepEqual(matchAction({ status: "Final" }), {
    label: "View Match Result", enabled: true, kind: "result",
  });
  assert.deepEqual(matchAction({ status: "Locked", accessActive: false }), {
    label: "Scoring Locked", enabled: false, kind: "locked",
  });
});

test("countdown never returns a negative duration", () => {
  assert.equal(countdownParts("2026-09-25T07:40:00-05:00", Date.parse("2026-09-25T08:00:00-05:00")), null);
  assert.equal(
    countdownParts("2026-09-25T07:40:00-05:00", Date.parse("2026-09-25T06:58:00-05:00")).label,
    "Tee time in 42 minutes",
  );
});

test("Home times consistently include AM or PM without duplicate suffixes", () => {
  assert.equal(formatHomeTime("8:10"), "8:10 AM");
  assert.equal(formatHomeTime("14:40"), "2:40 PM");
  assert.equal(formatHomeTime("8:10 am"), "8:10 AM");
  assert.equal(formatHomeTime("2:40", {
    scheduledAt: "2026-09-25T14:40:00-05:00",
    timeZone: "America/Chicago",
  }), "2:40 PM");
  assert.equal(formatHomeTime("10:50", {
    scheduledAt: "2026-09-27T10:50:00-05:00",
    timeZone: "America/Chicago",
  }), "10:50 AM");
  assert.equal(formatHomeTime("12:00"), "12:00 PM");
  assert.equal(formatHomeTime("00:00"), "12:00 AM");
});

test("Today’s Schedule uses the shared Home time display", () => {
  const [event] = todaysSchedule([
    { id: "dinner", date: "2026-09-25", startTime: "18:30", title: "Dinner" },
  ], { now: new Date("2026-09-25T12:00:00") });
  assert.equal(event.startTime, "6:30 PM");
});

test("personalized home keeps Passport authorization server-side", async () => {
  const [component, route, commandCenter, sheetsWrite] = await Promise.all([
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/matches/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
  ]);
  assert.match(commandCenter, /PersonalizedPlayerHome/);
  assert.match(component, /api\/player-passport\/matches/);
  assert.doesNotMatch(component, /This isn’t me/);
  assert.match(component, /My Rounds/);
  assert.doesNotMatch(component, /My Schedule/);
  assert.doesNotMatch(component, /Welcome back/);
  assert.doesNotMatch(component, /Partner:/);
  assert.match(component, /participantNames/);
  assert.match(component, /opponentNames/);
  assert.match(component, /teeLabel\(match\.tee\)/);
  assert.match(component, /courseLogo\(match\.courseLogo\)/);
  assert.match(component, /roundMatchMeta\(match\)/);
  assert.match(component, /join\(" • "\)/);
  assert.doesNotMatch(component, /Match \$\{match\.match\}.*·/);
  assert.match(component, /scheduledAt:\s*match\?\.teeTimeAt/);
  assert.match(component, /timeZone/);
  assert.match(component, /aria-label="versus"/);
  assert.match(component, /`\/game-center\/\$\{encodeURIComponent\(match\.matchId\)\}\?from=home`/);
  assert.doesNotMatch(component, /view=matchups/);
  assert.match(route, /authorizePassportMatch/);
  assert.match(route, /verifyPlayerPassportSession/);
  assert.match(sheetsWrite, /tee: String\(match\["Tee Played"\]/);
});

test("the public Tournament Command Center offers Passport activation without exposing scoring", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/personalized-player-home.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /Activate Player Passport/);
  assert.match(component, /href="\/activate"/);
  assert.match(styles, /\.empty a\.primaryAction\s*\{\s*color:\s*#fff/);
});

test("Home refinement keeps tournament identity and itinerary distinct from player rounds", async () => {
  const [component, commandCenter, schedule, identityHeader] = await Promise.all([
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentSchedule.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentIdentityHeader.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(component, /playerPhoto|identityImage|Player Passport<\/span>/);
  assert.match(commandCenter, /<TournamentIdentityHeader/);
  assert.match(identityHeader, /tournamentLogo\(`sandbagger-\$\{year\}`\)/);
  assert.match(schedule, /View Tournament Guide/);
  assert.match(schedule, /No additional events scheduled today/);
  assert.match(commandCenter, /liveData\?\.timeline\?\.events/);
  assert.match(commandCenter, /event\.displayOnHome/);
  assert.match(commandCenter, /\{pulse\}[\s\S]*<TournamentMoments moments=\{moments\}/);
  assert.ok(commandCenter.indexOf("<TournamentSchedule events") < commandCenter.indexOf("<PersonalizedPlayerHome"));
  assert.doesNotMatch(component, /join\(" \+ "\)/);
});

test("Home match layout keeps format, logos, teams, and players in separate layers", async () => {
  const [component, styles, commandStyles] = await Promise.all([
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/personalized-player-home.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-command-center.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /className=\{compact \? styles\.compactMatchHeading : styles\.matchHeading\}/);
  assert.match(component, /match\?\.format \? <strong>/);
  assert.match(styles, /\.matchHeading > strong[\s\S]*white-space:\s*nowrap/);
  assert.match(styles, /\.matchHeading > span,[\s\S]*color:\s*#285246/);
  assert.match(styles, /\.matchHeading > span,[\s\S]*font-weight:\s*750/);
  assert.match(styles, /\.people > div[\s\S]*grid-template-rows:\s*34px/);
  assert.match(styles, /\.teamLogo,[\s\S]*justify-self:\s*center/);
  assert.match(styles, /\.roundMatchup > div[\s\S]*justify-items:\s*center/);
  assert.match(styles, /\.roundMatchup em[\s\S]*text-align:\s*center|\.roundMatchup > div[\s\S]*text-align:\s*center/);
  assert.match(styles, /\.roundMatchup[\s\S]*column-gap:\s*6px/);
  assert.match(styles, /\.roundMatchup > div[\s\S]*gap:\s*2px/);
  assert.match(styles, /\.roundMatchup \.playerLines\s*\{[\s\S]*gap:\s*2px/);
  assert.doesNotMatch(component, /aria-label="Current player"/);
  assert.doesNotMatch(component, />YOU</);
  assert.match(commandStyles, /--home-eyebrow-color:#b58a25/);
  assert.match(commandStyles, /\.homeHeader p,\.sectionHeader p,\.pulseHeader p[\s\S]*line-height:1\.2/);
  assert.match(commandStyles, /\.scoreboard strong\{font-size:3\.1rem/);
  assert.match(commandStyles, /font-variant-numeric:tabular-nums/);
  assert.match(commandStyles, /font-size:2\.7rem/);
});
