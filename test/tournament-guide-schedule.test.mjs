import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { composeItineraryDetailSections, itineraryGroups, itineraryViewModel, structureItineraryDetails } from "../lib/tournament-guide-schedule.js";

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
  assert.equal(model.events[0].dayHeading, "Friday");
});

test("Schedule consolidates granular day labels into one calendar-day section", () => {
  const model = itineraryViewModel({ records: [records[0], { ...records[1], "Day Label": "Friday Night" }], tournament, now: new Date("2026-09-24T12:00:00Z") });
  assert.deepEqual([...itineraryGroups(model.events).keys()], ["Friday"]);
});

test("Schedule normalizes Google Sheets Date values before grouping and display", () => {
  const model = itineraryViewModel({ records: [{ ...records[0], "Event Date": "Date(2026,8,25)" }], tournament, now: new Date("2026-09-24T12:00:00Z") });
  assert.equal(model.events[0].date, "2026-09-25");
  assert.equal(model.events[0].dateLabel, "September 25");
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

test("itinerary emphasis prioritizes a live event and otherwise the next future event", () => {
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
  assert.equal("mapHref" in golf, false);
});

test("golf events compose canonical current Round, Course, Format, and Tee while preserving editorial timing and notes", () => {
  const model = itineraryViewModel({
    records: [{ ...records[1], Subtitle: "Stale format", Details: "Green Tees. Old scoring. 80% handicap allocation. $25 net skins. Pay caddies in cash." }],
    tournament,
    courses,
    rounds: [{ number: 1, status: "Upcoming", format: "BB" }],
    tournamentRules: [{ Round: "1", Format: "BB", "Scoring Format": "Nassau — front, back, overall", "Handicap Allocation": "100% allowance" }],
    formatRules: [{ "Format ID": "BB", Name: "Best Ball" }],
    now: new Date("2026-09-24T12:00:00Z"),
  });
  const [golf] = model.events;
  assert.equal(golf.title, "Round 1");
  assert.equal(golf.startTime, "7:20 AM");
  assert.equal(golf.location, "Turtle Point");
  assert.equal(golf.subtitle, "Best Ball");
  assert.equal(golf.editorialSubtitle, "Stale format");
  assert.equal(golf.format, "BB");
  assert.equal(golf.tee, "Gold");
  assert.deepEqual(composeItineraryDetailSections(golf), [
    { label: "Scoring", text: "Nassau — front, back, overall" },
    { label: "Handicap", text: "100% allowance" },
    { label: "Net Skins", text: "$25 net skins." },
    { label: "Caddies", text: "Pay caddies in cash." },
  ]);
});

test("non-golf events remain editorial and do not acquire scoring context", () => {
  const model = itineraryViewModel({
    records: [{ ...records[3], Subtitle: "Clubhouse ceremony", Location: "Ballroom", Details: "Jackets requested." }],
    tournament,
    courses,
    rounds: [{ number: 3, status: "Upcoming", format: "SI" }],
    tournamentRules: [{ Round: "3", Format: "SI", "Scoring Format": "Singles" }],
    formatRules: [{ "Format ID": "SI", Name: "Singles" }],
    now: new Date("2026-09-24T12:00:00Z"),
  });
  const [event] = model.events;
  assert.equal(event.subtitle, "Clubhouse ceremony");
  assert.equal(event.location, "Ballroom");
  assert.equal(event.roundNumber, null);
  assert.equal(event.format, "");
  assert.equal(event.tee, "");
  assert.deepEqual(composeItineraryDetailSections(event), [{ label: "Additional Details", text: "Jackets requested." }]);
});

test("long workbook notes are structured into readable itinerary sections", () => {
  const sections = structureItineraryDetails("Green Tees. Nassau scoring: 1 point per segment. 90% handicap allocation. $25 net skins. Walking caddies are available.");
  assert.deepEqual(sections.map((section) => section.label), ["Tee Information", "Scoring", "Handicap", "Net Skins", "Caddies"]);
  assert.match(sections.find((section) => section.label === "Handicap").text, /90%/);
});

test("current tournament-local day is marked for the Schedule header", () => {
  const model = itineraryViewModel({ records, tournament, courses, now: new Date("2026-09-25T16:00:00Z") });
  assert.equal(model.events.find((event) => event.id === "breakfast").isToday, true);
  assert.equal(model.events.find((event) => event.id === "awards").isToday, false);
});

test("Schedule app presentation uses tappable disclosures and shared badges without map actions", async () => {
  const [component, detail] = await Promise.all([
    readFile(new URL("../app/tournament-guide/ScheduleItinerary.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/GuideDetailPage.js", import.meta.url), "utf8"),
  ]);
  assert.match(component, /<details/);
  assert.match(component, /<StatusBadge/);
  assert.match(component, /interaction\.target\.closest\("a, button, summary"\)/);
  assert.doesNotMatch(component, /View Map|ExternalLinkConfirm|maps\.apple/);
  assert.match(component, /View Course/);
  assert.match(component, /Today/);
  assert.doesNotMatch(component, /Up Next|up-next-title|Tournament Complete/);
  assert.match(detail, /<ScheduleItinerary/);
  assert.doesNotMatch(detail, /className=\{styles\.timeline\}/);
});
