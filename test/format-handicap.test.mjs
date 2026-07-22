import test from "node:test";
import assert from "node:assert/strict";
import { formatHandicap, formatPoints, parseNumericValue } from "../lib/formatters.js";

test("formats plus handicaps with parentheses", () => {
  assert.equal(formatHandicap(-2), "(2)");
  assert.equal(formatHandicap("-1.5"), "(1.5)");
  assert.equal(formatHandicap(-0.5), "(0.5)");
  assert.equal(formatHandicap("(0.6)"), "(0.6)");
  assert.equal(formatHandicap("−0.7"), "(0.7)");
});

test("normalizes accounting-style handicap values from Google Sheets", () => {
  assert.equal(parseNumericValue("(0.6)"), -0.6);
  assert.equal(parseNumericValue("-1.5"), -1.5);
  assert.equal(parseNumericValue("0"), 0);
});

test("keeps zero and positive handicaps visible", () => {
  assert.equal(formatHandicap(0), "0");
  assert.equal(formatHandicap("4"), "4");
  assert.equal(formatHandicap(8.7), "8.7");
});

test("uses a dash only for unavailable handicaps", () => {
  assert.equal(formatHandicap(null), "—");
  assert.equal(formatHandicap(undefined), "—");
  assert.equal(formatHandicap(""), "—");
  assert.equal(formatHandicap("not recorded"), "—");
});

test("formats tournament points with up to two decimal places", () => {
  assert.equal(formatPoints(5.75), "5.75");
  assert.equal(formatPoints(5.5), "5.5");
  assert.equal(formatPoints(5), "5");
  assert.equal(formatPoints(3.25), "3.25");
  assert.equal(formatPoints(null), "—");
});
