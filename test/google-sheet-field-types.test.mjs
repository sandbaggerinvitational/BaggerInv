import test from "node:test";
import assert from "node:assert/strict";
import { isBooleanSheetField } from "../lib/google-sheet-field-types.js";

test("Captain is boolean only on the Players sheet", () => {
  assert.equal(isBooleanSheetField("Players", "Captain"), true);
  assert.equal(isBooleanSheetField("Team Names", "Captain"), false);
});

test("shared boolean fields remain boolean across sheets", () => {
  assert.equal(isBooleanSheetField("Players", "Rookie"), true);
  assert.equal(isBooleanSheetField("Guide Information", "Sensitive"), true);
});
