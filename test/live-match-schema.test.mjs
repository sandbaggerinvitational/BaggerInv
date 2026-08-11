import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_MATCH_CORE_SCORE_HEADERS,
  LIVE_MATCH_SCORING_LOCK_SCHEMA,
  existingLiveMatchProgressUpdates,
  liveMatchScoringLockColumnIndex,
} from "../lib/live-match-schema.js";

test("Scoring Locked has one canonical lifecycle placement in the 46-column schema", () => {
  const headers = Array.from({ length: 45 }, (_, index) => `Field ${index + 1}`);
  headers[4] = "Match Status";
  headers[5] = "Notes";
  assert.equal(liveMatchScoringLockColumnIndex(headers), 5);
  headers.splice(5, 0, "Scoring Locked");
  assert.equal(headers.length, 46);
  assert.equal(liveMatchScoringLockColumnIndex(headers), 5);
  assert.deepEqual(LIVE_MATCH_SCORING_LOCK_SCHEMA, {
    header: "Scoring Locked", after: "Match Status", before: "Notes",
    sourceColumnCount: 45, targetColumnCount: 46,
  });
});

test("live scoring supports the established Live Matches schema without derived progress columns", () => {
  const headers = [
    "Match ID", "Match Status", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner",
    "Team 1 Points", "Team 2 Points", "Updated At", "Updated By", "Finalized At", "Finalized By",
  ];
  const updates = existingLiveMatchProgressUpdates(headers, {
    "Match Status": "Live",
    "Current Hole": 4,
    "Team 1 Holes Won": 2,
    "Team 2 Holes Won": 1,
    "Holes Remaining": 14,
    "Match Status Text": "Team 1 1 UP",
    "Updated At": "2026-09-25T14:00:00.000Z",
    "Updated By": "Player",
  });
  assert.deepEqual(updates, {
    "Match Status": "Live",
    "Updated At": "2026-09-25T14:00:00.000Z",
    "Updated By": "Player",
  });
  assert.deepEqual(LIVE_MATCH_CORE_SCORE_HEADERS, ["Match ID", "Match Status", "Updated At", "Updated By"]);
});

test("live scoring persists derived progress when the workbook explicitly provides those fields", () => {
  const headers = ["Match ID", "Match Status", "Current Hole", "Holes Remaining", "Updated At", "Updated By"];
  assert.deepEqual(existingLiveMatchProgressUpdates(headers, {
    "Match Status": "Live",
    "Current Hole": 7,
    "Holes Remaining": 11,
  }), {
    "Match Status": "Live",
    "Current Hole": 7,
    "Holes Remaining": 11,
  });
});

test("unknown non-progress writes are not silently discarded", () => {
  assert.deepEqual(existingLiveMatchProgressUpdates(["Match Status"], {
    "Match Status": "Live",
    "Unexpected Field": "unsafe",
  }), {
    "Match Status": "Live",
    "Unexpected Field": "unsafe",
  });
});
