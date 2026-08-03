import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { itineraryGroups, itineraryViewModel } from "../lib/tournament-guide-schedule.js";

const tournament = { status: "Live", timeZone: "America/New_York" };
const courses = [
  { "Course ID": "TP", Year: 2026, Round: 1, Format: "BB", Course: "Turtle Point", "Tee Played": "Gold", "GPS Link": "https://maps.example/tp" },
  { "Course ID": "CP", Year: 2026, Round: 2, Format: "SC", Course: "Cougar Point", "Tee Played": "Black" },
];
const records = [
  { "Event ID": "breakfast", "Event Date": "2026-09-25", "Day Label": "Friday", "Start Time": "6:00 AM", "End Time": "7:00 AM", "Event Type": "Meal", Title: "Breakfast", Location: "Clubhouse", Status: "Published", "Display Order": 1 },
  { "Event ID": "round-1", "Event Date": "2026-09-25", "Day Label": "Friday", "Start Time": "7:20 AM", "End Time": "12:00 PM", "Event Type": "Golf", Title: "Round 1", Subtitle: "Best Ball", Location: "Wrong legacy location", Details: "Full scoring notes", "Round ID": "1", "Course ID": "TP", Status: "Published", "Display Order": 2 },
  { "Event ID": "round-2", "Event Date": "2026-09-25", "Day Label": "Friday", "Start Time": "2:00 PM", "Event Type": "Golf", Title: "Round 2", "Round ID": "2", "Course ID": "CP", Status: "Published", "Display Order": 3 },
  { "Event ID": "awards", "Event Date": "2026-09-26", "Day Label": "Saturday", "Start Time": "7:30 PM", "Event Type": "Awards", Title: "Awards", Status: "Published", "Display Order": 4 },
];

test("Schedule groups the approved itinerary by workbook day labels", () => {
  const model = itineraryViewModel({ records, tournament, courses, rounds: [], now: new Date("2026-09-25T10:30:00Z") });
  assert.deepEqual([...itineraryGroups(model.events).keys()], ["Friday", "Saturday"]);
});

test("golf itinerary status follows its authoritative round instead of End Time", () => {
  const model = itineraryViewModel({
    records, tournament, courses,
    rounds: [{ number: 1, status: "Final", format: "Best Ball" }, { number: 2, status: "Live", format: "Scramble" }],
    now: new Date("2026-09-25T12:00:00Z"),
  });
  assert.equal(model.events.find((event) => event.id === "round-1").status, "Final");
  assert.equal(model.events.find((event) => event.id === "round-2").status, "Live");
  assert.equal(model.focus.id, "round-2");
});

test("non-golf itinerary status uses tournament-local Start and End Time", () => {
  const during = itineraryViewModel({ records, tournament, courses, now: new Date("2026-09-25T10:30:00Z") });
  const after = itineraryViewModel({ records, tournament, courses, now: new Date("2026-09-25T11:30:00Z") });
  assert.equal(during.events.find((event) => event.id === "breakfast").status, "Live");
  assert.equal(after.events.find((event) => event.id === "breakfast").status, "Completed");
});

test("Up Next prioritizes a live event and otherwise the next future event", () => {
  const live = itineraryViewModel({ records, tournament, courses, now: new Date("2026-09-25T10:30:00Z") });
  assert.equal(live.focus.id, "breakfast");
  const before = itineraryViewModel({ records, tournament: { ...tournament, status: "Upcoming" }, courses, now: new Date("2026-09-25T08:00:00Z") });
  assert.equal(before.focus.id, "breakfast");
});

test("Schedule preserves details behind disclosure and provides safe location actions", () => {
  const model = itineraryViewModel({ records, tournament, courses, rounds: [{ number: 1, status: "Upcoming" }], now: new Date("2026-09-24T12:00:00Z") });
  const golf = model.events.find((event) => event.id === "round-1");
  assert.equal(golf.details, "Full scoring notes");
  assert.equal(golf.location, "Turtle Point");
  assert.equal(golf.courseHref, "/courses/TP");
  assert.equal(golf.mapHref, "https://maps.example/tp");
});

test("Schedule app presentation uses expandable cards, shared badges, and Leave The Bagger confirmation", async () => {
  const [component, detail, external] = await Promise.all([
    readFile(new URL("../app/tournament-guide/ScheduleItinerary.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/GuideDetailPage.js", import.meta.url), "utf8"),
    readFile(new URL("../app/ExternalLinkConfirm.js", import.meta.url), "utf8"),
  ]);
  assert.match(component, /<details/);
  assert.match(component, /<StatusBadge/);
  assert.match(component, /<ExternalLinkConfirm/);
  assert.match(component, /Up Next/);
  assert.match(detail, /<ScheduleItinerary/);
  assert.doesNotMatch(detail, /className=\{styles\.timeline\}/);
  assert.match(external, /Leave The Bagger\?/);
  assert.match(external, /useId/);
});
