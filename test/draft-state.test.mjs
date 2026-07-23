import test from "node:test";
import assert from "node:assert/strict";
import { deriveDraftState } from "../lib/draft-state.js";

test("draft stays unscheduled until a date exists", () => {
  assert.equal(deriveDraftState({ draftDate: "", draftedCount: 0, totalDraftPicks: 22 }), "unscheduled");
});

test("dated draft is scheduled before the first selection", () => {
  assert.equal(deriveDraftState({ draftDate: "2026-07-12", draftedCount: 0, totalDraftPicks: 22 }), "scheduled");
});

test("partial selections make the draft live", () => {
  assert.equal(deriveDraftState({ draftDate: "2026-07-12", draftedCount: 9, totalDraftPicks: 22 }), "live");
});

test("all configured selections complete the draft", () => {
  assert.equal(deriveDraftState({ draftDate: "2026-07-12", draftedCount: 22, totalDraftPicks: 22 }), "complete");
});
