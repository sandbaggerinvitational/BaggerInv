import test from "node:test";
import assert from "node:assert/strict";
import {
  countdownParts,
  tournamentStartTimestamp,
} from "../lib/tournament-countdown.js";

test("countdown uses an explicit tournament date, tee time, and time zone", () => {
  const timestamp = tournamentStartTimestamp({
    startDate: "2026-09-25",
    startTime: "7:30 AM",
    timeZone: "America/Chicago",
  });
  assert.equal(new Date(timestamp).toISOString(), "2026-09-25T12:30:00.000Z");
});

test("countdown can derive the opening date from the public date label", () => {
  const timestamp = tournamentStartTimestamp({
    dates: "September 25 - 26, 2026",
    year: 2026,
    timeZone: "America/Chicago",
  });
  assert.equal(new Date(timestamp).toISOString(), "2026-09-25T05:00:00.000Z");
});

test("countdown parts change precision without returning negative values", () => {
  assert.deepEqual(countdownParts(100_000, 0), {
    total: 100_000,
    days: 0,
    hours: 0,
    minutes: 1,
    seconds: 40,
  });
  assert.equal(countdownParts(0, 100).total, 0);
});
