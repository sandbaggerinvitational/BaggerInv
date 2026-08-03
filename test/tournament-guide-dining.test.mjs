import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { diningGroups, diningViewModel } from "../lib/tournament-guide-dining.js";

const records = [
  { Year: 2026, Day: "Saturday", Meal: "Championship Dinner", "Start Time": "7:00 PM", "End Time": "9:30 PM", Location: "The Ocean Room", "Dress Code": "Jacket Requested", "Reservations Required": "TRUE", Notes: "Cocktails at 7.\nDinner at 7:30.", "Sort Order": 3 },
  { Year: 2026, Day: "Friday", Meal: "Breakfast", "Start Time": "6:00 AM", "End Time": "7:00 AM", Location: "Clubhouse", "Dress Code": "Golf Attire", "Reservations Required": "FALSE", Notes: "Coffee and breakfast available.", "Sort Order": 1 },
  { Year: 2026, Day: "Friday", Meal: "Team Dinner", "Start Time": "6:30 PM", Location: "River Room", "Dress Code": "Resort Casual", "Reservations Required": "Yes", Notes: "Meet in the lobby.\nTransportation departs at 6:10.", "Sort Order": 2 },
];

test("Dining groups active records by workbook Day and preserves Sort Order", () => {
  const meals = diningViewModel(records);
  const groups = diningGroups(meals);
  assert.deepEqual([...groups.keys()], ["Friday", "Saturday"]);
  assert.deepEqual(groups.get("Friday").map((meal) => meal.meal), ["Breakfast", "Team Dinner"]);
});

test("Dining normalizes time, dress code, reservations, and multiline Notes", () => {
  const meals = diningViewModel(records);
  assert.equal(meals[0].time, "6:00 AM – 7:00 AM");
  assert.equal(meals[0].dressCode, "Golf Attire");
  assert.equal(meals[0].reservationLabel, "Open Seating");
  assert.equal(meals[1].reservationLabel, "Reservation Required");
  assert.equal(meals[1].notes, "Meet in the lobby.\nTransportation departs at 6:10.");
});

test("Dining uses only the approved workbook fields and renders Notes behind disclosure", async () => {
  const [component, model, detail, normalized, schema, css] = await Promise.all([
    readFile(new URL("../app/tournament-guide/DiningItinerary.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-guide-dining.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/GuideDetailPage.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-guide-content.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/tournament-guide.module.css", import.meta.url), "utf8"),
  ]);
  for (const field of ["Year", "Day", "Meal", "Start Time", "End Time", "Location", "Dress Code", "Reservations Required", "Notes", "Sort Order"]) {
    assert.match(model, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(schema, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(component, /<details/);
  assert.doesNotMatch(component, /<details[^>]* open/);
  assert.match(component, /Reservation Required/);
  assert.match(model, /Open Seating/);
  assert.match(component, /interaction\.target\.closest\("a, button, summary"\)/);
  assert.match(detail, /<DiningItinerary records=\{records\}/);
  assert.match(normalized, /fetchOptionalSheet\("Dining"\)/);
  assert.match(normalized, /recordMatchesTournament\(row, guideTournament\)/);
  assert.match(normalized, /left\["Sort Order"\]/);
  assert.match(css, /white-space:pre-line/);
});
