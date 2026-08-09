import assert from "node:assert/strict";
import test from "node:test";
import {
  compactTournamentLeaders,
  todaysSchedule,
  tournamentDayLabel,
} from "../lib/home-dashboard.js";
import {
  appMatchStatus,
  imageFallbackSources,
} from "../lib/mobile-tournament-app.js";
import { readFile } from "node:fs/promises";

test("today schedule uses tournament local time, orders events, and marks the next event", () => {
  const items = todaysSchedule([
    { id: "lunch", date: "2026-09-25", startTime: "12:00 PM", title: "Lunch", order: 2 },
    { id: "breakfast", date: "2026-09-25", startTime: "7:00 AM", endTime: "8:00 AM", title: "Breakfast", order: 1 },
    { id: "tomorrow", date: "2026-09-26", startTime: "8:00 AM", title: "Round 2" },
  ], {
    now: new Date("2026-09-25T15:30:00.000Z"),
    timeZone: "America/Chicago",
  });
  assert.deepEqual(items.map((item) => item.id), ["breakfast", "lunch"]);
  assert.equal(items[0].state, "complete");
  assert.equal(items[1].state, "upcoming");
  assert.equal(items[1].isNext, true);
  assert.equal(items[1].countdown, "Starts in 1 hr 30 min");
});

test("today schedule retains completed events, highlights the current event, and promotes the next event", () => {
  const items = todaysSchedule([
    { id: "check-in", date: "2026-09-25", startTime: "7:00 AM", endTime: "8:00 AM", title: "Check-In" },
    { id: "golf", date: "2026-09-25", startTime: "8:30 AM", endTime: "12:30 PM", title: "Round 1" },
    { id: "meal", date: "2026-09-25", startTime: "1:00 PM", endTime: "2:00 PM", title: "Lunch" },
  ], { now: new Date("2026-09-25T15:00:00Z"), timeZone: "America/Chicago" });
  assert.deepEqual(items.map(({ id, state, isNext }) => ({ id, state, isNext })), [
    { id: "check-in", state: "complete", isNext: false },
    { id: "golf", state: "live", isNext: false },
    { id: "meal", state: "upcoming", isNext: true },
  ]);
  assert.equal(items[2].countdown, "Starts in 3 hr");
});

test("tournament leaders exclude players without an official completed match", () => {
  const leaders = compactTournamentLeaders([
    { id: "unused", player: "No Result", matchesPlayed: 0, points: 9 },
    { id: "b", player: "Beta", matchesPlayed: 1, points: 2, wins: 1 },
    { id: "a", player: "Alpha", matchesPlayed: 1, points: 3, wins: 1 },
  ]);
  assert.deepEqual(leaders.map((leader) => leader.id), ["a", "b"]);
  assert.deepEqual(leaders.map((leader) => leader.rank), [1, 2]);
});

test("home image sources preserve player, team, tournament fallback order", () => {
  assert.deepEqual(imageFallbackSources({
    playerPhoto: "/player.webp",
    teamLogo: "/team.webp",
    tournamentLogo: "/tournament.png",
  }), ["/player.webp", "/team.webp", "/tournament.png"]);
  assert.deepEqual(imageFallbackSources({ playerPhoto: "", teamLogo: null }), []);
});

test("home match statuses use the compact shared vocabulary", () => {
  assert.equal(appMatchStatus({ status: "In Progress" }), "Live");
  assert.equal(appMatchStatus({ status: "Finalized" }), "Final");
  assert.equal(appMatchStatus({ status: "Scheduled", accessActive: true }), "Upcoming");
  assert.equal(appMatchStatus({ status: "Scheduled" }), "Upcoming");
});

test("Home keeps compact team score context and delegates rankings to Leaderboards", async () => {
  const source = await readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8");
  assert.match(source, /formatTeamPoints\(tournament\.teamOne\?\.score\)/);
  assert.match(source, /formatTeamPoints\(tournament\.teamTwo\?\.score\)/);
  assert.match(source, /href="\/live\?view=leaderboards">View Leaderboards/);
  assert.doesNotMatch(source, /function TournamentLeaders|compactTournamentLeaders|Live Standings/);
  assert.doesNotMatch(source, /StatusBadge/);
  assert.match(source, /\{progress\.liveMatches\} live/);
  assert.doesNotMatch(source, /function score\(/);
});

test("active tournament header reports its day when a start date is available", () => {
  assert.equal(tournamentDayLabel({
    startDate: "2026-09-25",
    roundCount: 3,
    currentRound: 2,
    now: new Date("2026-09-26T12:00:00"),
  }), "Day 2 of 3");
});

test("live mobile Home clips the closed navigation drawer without card overflow", async () => {
  const [page, globals] = await Promise.all([
    readFile(new URL("../app/MobileTournamentHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /className="mobileHomeMain"/);
  assert.match(globals, /\.mobileHomeMain\s*\{[^}]*overflow-x:\s*clip/s);
});

test("participant Home omits the website footer and preserves dashboard order", async () => {
  const [shell, commandCenter, personalized] = await Promise.all([
    readFile(new URL("../app/MobileTournamentHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(shell, /Footer/);
  assert.ok(commandCenter.indexOf("<TournamentSchedule") < commandCenter.indexOf("<PersonalizedPlayerHome"));
  assert.doesNotMatch(commandCenter, /<TournamentLeaders/);
  assert.doesNotMatch(personalized, /tournamentPulse|tournamentMoments/);
});

test("Home polish shares vertical rhythm and distinguishes completed rounds", async () => {
  const [commandCenter, schedule, commandStyles, personalized, personalizedStyles] = await Promise.all([
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentSchedule.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-command-center.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/personalized-player-home.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(commandCenter, /Match\$\{count === 1 \? "" : "es"\} Remaining/);
  assert.match(schedule, /No additional events scheduled today\./);
  assert.match(commandStyles, /--home-section-gap:12px/);
  assert.match(commandStyles, /--home-card-radius:20px/);
  assert.match(commandStyles, /--home-card-shadow:/);
  assert.match(commandStyles, /\.emptyState\{[^}]*text-align:center/);
  assert.match(commandStyles, /\.leaderboardsCta\{[^}]*min-height:44px/);
  assert.match(personalized, /data-complete=\{status === "Final" \? "true" : undefined\}/);
  assert.match(personalizedStyles, /\.roundCard\[data-complete="true"\]/);
  assert.match(personalizedStyles, /margin-top: var\(--home-section-gap, 12px\)/);
});

test("Home match-state hierarchy remains available for no match, upcoming, live, and final", () => {
  assert.equal(appMatchStatus({ status: "Scheduled" }), "Upcoming");
  assert.equal(appMatchStatus({ status: "In Progress", scoringEnabled: true }), "Live");
  assert.equal(appMatchStatus({ status: "Final", result: { officialResult: "2 UP" } }), "Final");
  assert.equal(appMatchStatus({}), "Upcoming");
});
