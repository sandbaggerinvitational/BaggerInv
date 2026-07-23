import test from "node:test";
import assert from "node:assert/strict";
import {
  MINIMUM_DRAFTS_FOR_ADP,
  MINIMUM_DRAFTS_FOR_TRENDS,
} from "../lib/draft-analytics-config.js";

test("historical draft analytics requires repeat participation for ADP", () => {
  assert.equal(MINIMUM_DRAFTS_FOR_ADP, 2);
});

test("historical trends wait for three completed tournament outcomes", () => {
  assert.equal(MINIMUM_DRAFTS_FOR_TRENDS, 3);
});
