import test from "node:test";
import assert from "node:assert/strict";
import { careerYearDataIssue, formatPlayerCareerYears } from "../lib/player-career.js";

test("active player uses earliest appearance and Present", () => {
  assert.equal(formatPlayerCareerYears({ Active: "TRUE", "First Year": 2020 }, [2019, 2021]), "2019–Present");
});

test("one-year alumnus displays a single year", () => {
  assert.equal(formatPlayerCareerYears({ Active: "FALSE" }, [2020]), "2020");
});

test("alumnus displays first and last appearance", () => {
  assert.equal(formatPlayerCareerYears({ Active: false }, [2017, 2019, 2021]), "2017–2021");
});

test("missing first year never produces a partial range", () => {
  assert.equal(formatPlayerCareerYears({ Active: false, "Last Year": 2021 }, []), null);
  assert.ok(careerYearDataIssue({ "Player ID": "P1", "Last Year": 2021 }, []));
});
