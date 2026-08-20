import assert from "node:assert/strict";
import test from "node:test";

import { contentFromSupabase } from "../app/tournament-guide/resolveGuideContent.js";

function liveEntry(roundNumber, status) {
  return {
    round: { round_number: roundNumber, format: roundNumber === 1 ? "BB" : roundNumber === 2 ? "SC" : "SI" },
    match: {
      match_id: `2026-R${roundNumber}-1`, round_number: roundNumber,
      format: roundNumber === 1 ? "BB" : roundNumber === 2 ? "SC" : "SI",
      status, scoring_locked: status === "FINAL", current_hole: status === "FINAL" ? 18 : 1,
      scored_holes: status === "FINAL" ? 18 : 1, holes_remaining: status === "FINAL" ? 0 : 17,
      result_winner: status === "FINAL" ? "Team 1" : "", match_revision: 1,
    },
    snapshot: { course_id: `C${roundNumber}`, tee: "Gold", par: 72, rating: 72, slope: 130, team_configuration: {} },
    presentation: { display_match_number: "1", course_name: `Course ${roundNumber}`, tournament_location: "Kiawah Island" },
    participants: [],
    scores: Array.from({ length: status === "FINAL" ? 18 : 1 }, (_, index) => ({
      hole_number: index + 1, hole_winner: "Team 1",
    })),
  };
}

const liveView = {
  tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
  teams: [{ team_side: 1, team_id: "T1", name: "Team 1" }, { team_side: 2, team_id: "T2", name: "Team 2" }],
  rounds: [1, 2, 3].map((roundNumber) => ({
    tournament_id: "2026", round_number: roundNumber, name: `Round ${roundNumber}`,
    format: roundNumber === 1 ? "BB" : roundNumber === 2 ? "SC" : "SI",
  })),
  tournament_presentation: {
    source_fingerprint: "a".repeat(64),
    presentation: {
      tournament: { status: "LIVE", statusMode: "Automatic", currentRound: 3, timeZone: "America/New_York" },
      timeline: { previewDateActive: true, effectiveNow: "2026-09-26T16:00:00.000Z" },
    },
  },
  live_revision: { totalMatchRevisions: 3 },
  matches: [liveEntry(1, "LIVE"), liveEntry(2, "LIVE"), liveEntry(3, "LIVE")],
};

const guidePayload = {
  ok: true,
  data: {
    projection_revision: 14,
    publication_sequence: 14,
    delivery_fingerprint: "b".repeat(64),
    published_at: "2026-08-19T21:05:02.361599+00:00",
    content: { content: {
      tournament: { id: "2026", year: 2026 },
      tournamentIdentity: { id: "2026", year: 2026, name: "Sandbagger Invitational", timeZone: "America/New_York" },
      schedule: [],
      dining: [
        { Meal: "Breakfast", "Reservations Required": "FALSE" },
        { Meal: "Championship Dinner", "Reservations Required": "TRUE" },
      ],
    } },
    course_context: [],
  },
};

test("website Guide combines the immutable Guide revision with canonical live round lifecycle", () => {
  const content = contentFromSupabase(guidePayload, liveView);
  assert.deepEqual(content.liveRounds.map((round) => round.status), ["Complete", "Complete", "Live"]);
  assert.equal(content.liveTournament.status, "LIVE");
  assert.equal(content.timelineNow, "2026-09-26T16:00:00.000Z");
  assert.equal(content.projection.revision, 14);
  assert.equal(content.projection.googleRequests, 0);
});

test("website Guide uses the shared participant adapter for Dining optional-field parity", () => {
  const content = contentFromSupabase(guidePayload, liveView);
  assert.equal(content.dining[0]["Reservations Required"], "");
  assert.equal(content.dining[1]["Reservations Required"], "TRUE");
});
