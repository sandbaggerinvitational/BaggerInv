import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeTournamentTimeline,
  resolveTimelineNow,
  timelineEventIcon,
  timelineEventStatus,
  tournamentDateTime,
} from "../lib/tournament-timeline.js";
import { todaysSchedule } from "../lib/home-dashboard.js";
import { tournamentDirectorModel } from "../lib/tournament-director.js";

const headers = ["Year", "Tournament Day", "Event Date", "Start Time", "End Time", "Event Type", "Title", "Subtitle", "Location", "Display on Home", "Notification Minutes", "Sort Order", "Status Override"];
const row = [2026, "Friday", "2026-09-25", "7:30 AM", "8:00 AM", "Round", "Round 1 Opens", "Best Ball", "Turtle Point", true, 30, 1, ""];

test("missing, empty, header-only, and invalid Timeline data remain optional", () => {
  assert.equal(normalizeTournamentTimeline({ values: [], activeYear: 2026 }).available, false);
  assert.match(normalizeTournamentTimeline({ values: [headers], activeYear: 2026, sheetState: "empty" }).diagnostic, /no usable events/);
  const invalid = normalizeTournamentTimeline({ values: [["Year", "Title"], [2026, "Dinner"]], activeYear: 2026 });
  assert.equal(invalid.available, false);
  assert.match(invalid.diagnostic, /headers invalid/);
});

test("Timeline filters the active year, ignores incomplete rows, and exposes notification lead time", () => {
  const result = normalizeTournamentTimeline({
    values: [headers, row, [2025, ...row.slice(1)], [2026, "Friday", "", "7:45 AM", "", "Round", "Incomplete"]],
    activeYear: 2026,
    tournamentStatus: "Upcoming",
    timeZone: "America/Chicago",
    now: new Date("2026-09-25T11:00:00Z"),
  });
  assert.equal(result.available, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].notificationMinutes, 30);
  assert.equal(result.notificationEvents.length, 1);
});

test("Timeline status honors override before tournament time and uses tournament timezone", () => {
  const event = { date: "2026-09-25", startTime: "7:30 AM", endTime: "8:30 AM", statusOverride: "Delayed" };
  assert.equal(timelineEventStatus(event, { now: new Date("2026-09-25T13:00:00Z"), timeZone: "America/Chicago" }), "Delayed");
  assert.equal(tournamentDateTime(event.date, event.startTime, "America/Chicago").toISOString(), "2026-09-25T12:30:00.000Z");
  assert.equal(timelineEventStatus({ ...event, statusOverride: "" }, { now: new Date("2026-09-25T13:00:00Z"), timeZone: "America/Chicago" }), "Live");
});

test("Timeline event types use one shared icon vocabulary", () => {
  assert.equal(timelineEventIcon("Golf"), "⛳");
  assert.equal(timelineEventIcon("Meal"), "🍽️");
  assert.equal(timelineEventIcon("Check-In"), "📍");
  assert.equal(timelineEventIcon("Awards"), "🏆");
  assert.equal(timelineEventIcon("Meeting"), "👥");
});

test("Preview Timeline Date preserves tournament-local time on the selected date", () => {
  const actual = new Date("2026-08-01T17:15:30Z");
  const preview = resolveTimelineNow({
    now: actual,
    timeZone: "America/Chicago",
    previewDate: "2026-09-25",
    previewEnabled: true,
  });
  assert.equal(preview.toISOString(), "2026-09-25T17:15:30.000Z");
});

test("Preview Timeline Date is ignored unless Preview is enabled", () => {
  const actual = new Date("2026-08-01T17:15:30Z");
  assert.equal(resolveTimelineNow({ now: actual, timeZone: "America/Chicago", previewDate: "2026-09-25", previewEnabled: false }), actual);
  assert.equal(resolveTimelineNow({ now: actual, timeZone: "America/Chicago", previewDate: "", previewEnabled: true }), actual);
  assert.equal(resolveTimelineNow({ now: actual, timeZone: "America/Chicago", previewDate: "not-a-date", previewEnabled: true }), actual);
});

test("Home, Director, and notification consumers share the Preview Timeline date", () => {
  const previewDate = "2026-09-25";
  const actual = new Date("2026-08-01T12:00:00Z");
  const timeline = normalizeTournamentTimeline({
    values: [headers, row], activeYear: 2026, tournamentStatus: "Upcoming", timeZone: "America/Chicago",
    now: actual, previewDate, previewEnabled: true,
  });
  assert.equal(timeline.previewDateActive, true);
  assert.equal(timeline.effectiveDate, previewDate);
  assert.equal(timeline.notificationEvents[0].notificationMinutes, 30);
  const home = todaysSchedule(timeline.events.filter((event) => event.displayOnHome), {
    now: new Date(timeline.effectiveNow), timeZone: "America/Chicago",
  });
  assert.deepEqual(home.map((event) => event.title), ["Round 1 Opens"]);
  const director = tournamentDirectorModel({ tournament: { year: 2026, status: "Upcoming", timeZone: "America/Chicago", directorAutomation: {} }, rounds: [], timeline }, actual);
  assert.equal(director.nextEvent.title, "Round 1 Opens");
});

test("Preview Timeline Date can select Thursday, Friday, or Saturday without editing events", () => {
  const datedRows = [
    [2026, "Thursday", "2026-09-24", "7:30 AM", "8:00 AM", "Welcome", "Thursday Event", "", "Clubhouse", true, 15, 1, ""],
    row,
    [2026, "Saturday", "2026-09-26", "7:30 AM", "8:00 AM", "Round", "Saturday Event", "Singles", "Ocean Course", true, 15, 3, ""],
  ];
  for (const [previewDate, expectedTitle] of [["2026-09-24", "Thursday Event"], ["2026-09-25", "Round 1 Opens"], ["2026-09-26", "Saturday Event"]]) {
    const timeline = normalizeTournamentTimeline({
      values: [headers, ...datedRows], activeYear: 2026, tournamentStatus: "Upcoming", timeZone: "America/Chicago",
      now: new Date("2026-08-01T11:00:00Z"), previewDate, previewEnabled: true,
    });
    const schedule = todaysSchedule(timeline.events.filter((event) => event.displayOnHome), {
      now: new Date(timeline.effectiveNow), timeZone: "America/Chicago",
    });
    assert.deepEqual(schedule.map((event) => event.title), [expectedTitle]);
  }
});

test("Home schedule displays only Timeline events enabled for Home on the tournament-local day", () => {
  const timeline = normalizeTournamentTimeline({ values: [headers, row, [2026, "Friday", "2026-09-25", "6:30 PM", "8:00 PM", "Meal", "Dinner", "", "Clubhouse", false, "", 2, ""]], activeYear: 2026, timeZone: "America/Chicago", now: new Date("2026-09-25T11:00:00Z") });
  const home = todaysSchedule(timeline.events.filter((event) => event.displayOnHome), { now: new Date("2026-09-25T13:00:00Z"), timeZone: "America/Chicago" });
  assert.deepEqual(home.map((event) => event.title), ["Round 1 Opens"]);
  assert.equal(home[0].startTime, "7:30 AM");
});

test("Director Next Event consumes Timeline and gracefully handles no remaining events", () => {
  const base = { tournament: { year: 2026, status: "Upcoming", timeZone: "America/Chicago", directorAutomation: {} }, rounds: [] };
  const timeline = normalizeTournamentTimeline({ values: [headers, row], activeYear: 2026, timeZone: "America/Chicago", now: new Date("2026-09-25T11:00:00Z") });
  const active = tournamentDirectorModel({ ...base, timeline }, new Date("2026-09-25T11:00:00Z"));
  assert.equal(active.nextEvent.title, "Round 1 Opens");
  assert.equal(active.nextEvent.status, "Upcoming");
  const done = tournamentDirectorModel({ ...base, timeline }, new Date("2026-09-25T15:00:00Z"));
  assert.equal(done.nextEvent, null);
  assert.equal(done.timelineAvailable, true);
});

test("Home and Director hide operational schedule sections when Timeline is unavailable", async () => {
  const [home, schedule, director, loader] = await Promise.all([
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentSchedule.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/director/DirectorDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8"),
  ]);
  assert.match(home, /timelineAvailable \? <TournamentSchedule/);
  assert.match(schedule, /aria-current=\{item\.state === "live"/);
  assert.match(schedule, /✓ Completed/);
  assert.match(schedule, /item\.isNext \? <b className=\{styles\.countdown\}>\{item\.countdown\}/);
  assert.match(schedule, /item\.location \? <small className=\{styles\.scheduleLocation\}>/);
  assert.match(director, /data\.timelineAvailable \? <section className=\{styles\.nextEvent\}/);
  assert.match(director, /data\.nextEvent\.icon/);
  assert.match(director, /data\.nextEvent\.location \?/);
  assert.match(director, /No remaining scheduled events today\./);
  assert.match(loader, /console\.warn\(timeline\.diagnostic\)/);
  assert.match(loader, /schedule: timeline\.events/);
  assert.match(loader, /previewDate: process\.env\.PREVIEW_TIMELINE_DATE \|\| tournamentRow\["Preview Timeline Date"\]/);
  assert.match(loader, /previewEnabled: process\.env\.VERCEL_ENV === "preview"/);
});
