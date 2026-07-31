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
  assert.equal(items[1].state, "next");
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
