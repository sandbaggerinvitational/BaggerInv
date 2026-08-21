import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistory2026Adapter,
  history2026TeamPageModel,
} from "../lib/history-2026-adapter.js";
import { history2026ReadEnvironment } from "../lib/history-2026-read-source.js";
import {
  cloneHistoryFixture,
  makeGuideProjection,
  makeHistory2026Aggregate,
} from "./fixtures/history-2026.mjs";

const REOPENED_MATCH_IDS = Object.freeze(["2026-R1-4", "2026-R2-5"]);

const previewEnv = Object.freeze({
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only-secret",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
});

function makeCurrentReopenedAggregate() {
  const aggregate = makeHistory2026Aggregate();
  for (const matchId of REOPENED_MATCH_IDS) {
    const record = aggregate.matches.find((candidate) => candidate.match.match_id === matchId);
    const archive = aggregate.finalized_snapshots.find((candidate) => candidate.match_id === matchId);
    assert.ok(record, `${matchId} canonical match fixture exists`);
    assert.ok(archive, `${matchId} prior Final archive fixture exists`);

    record.match.status = "LIVE";
    record.match.lifecycle = "LIVE";
    record.match.scoring_locked = false;
    record.match.scorecard_complete = true;
    record.match.scored_holes = 18;
    record.match.current_hole = 18;
    record.match.holes_remaining = 0;
    record.match.result_winner = "";
    record.match.running_result = "Team 1 leads through 18";
    record.match.team_1_points = 0;
    record.match.team_2_points = 0;
    record.match.finalized_at = null;
    archive.state = "INVALIDATED";
  }
  return aggregate;
}

function refinalize(aggregate, matchId) {
  const record = aggregate.matches.find((candidate) => candidate.match.match_id === matchId);
  const archive = aggregate.finalized_snapshots.find((candidate) => candidate.match_id === matchId);
  const nextRevision = record.match.match_revision + 1;
  record.match.status = "FINAL";
  record.match.lifecycle = "FINAL";
  record.match.scoring_locked = true;
  record.match.result_winner = archive.payload.result.result_winner;
  record.match.running_result = archive.payload.match.running_result;
  record.match.team_1_points = archive.payload.result.team_1_points;
  record.match.team_2_points = archive.payload.result.team_2_points;
  record.match.finalized_at = "2026-08-21T12:00:00.000Z";
  record.match.match_revision = nextRevision;
  archive.state = "CURRENT";
  archive.snapshot_revision += 1;
  archive.match_revision = nextRevision;
  archive.finalized_at = record.match.finalized_at;
  archive.payload.match.match_revision = nextRevision;
  archive.payload.match.finalized_at = record.match.finalized_at;
}

test("Step 5 preserves the canonical 15-Final/9-Live reopened History contract", () => {
  const aggregate = makeCurrentReopenedAggregate();
  const retainedScoringConfigurations = Object.fromEntries(REOPENED_MATCH_IDS.map((matchId) => {
    const record = aggregate.matches.find((candidate) => candidate.match.match_id === matchId);
    return [matchId, cloneHistoryFixture(record.scoring_snapshot.hole_definitions)];
  }));
  const view = buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() });

  assert.equal(view.matches.length, 24);
  assert.equal(view.diagnostics.finalMatches, 15);
  assert.equal(view.diagnostics.liveMatches, 9);
  assert.equal(view.diagnostics.currentFinalizedSnapshots, 15);
  assert.equal(view.diagnostics.logicalScorecards, 40);
  assert.equal(view.diagnostics.grossHoleValues, 720);
  assert.equal(view.tournament.complete, false);
  assert.equal(view.tournament.lifecycle, "IN_PROGRESS");
  assert.equal(view.tournament["Final Score"], "");

  const officialPointTotal = view.matches
    .filter((match) => match.lifecycle === "FINAL")
    .reduce((total, match) => total + match.team1Points + match.team2Points, 0);
  assert.equal(officialPointTotal, 45, "reopened matches contribute none of the 45 official points");

  for (const matchId of REOPENED_MATCH_IDS) {
    const match = view.matches.find((candidate) => candidate.id === matchId);
    const sourceRecord = aggregate.matches.find((candidate) => candidate.match.match_id === matchId);
    assert.equal(match.lifecycle, "LIVE");
    assert.equal(match.status, "LIVE");
    assert.equal(match.finalResult, "");
    assert.equal(match.team1Points, null);
    assert.equal(match.team2Points, null);
    assert.equal(view.analytics.scorecards.some((scorecard) => scorecard.matchId === matchId), false);
    assert.equal(sourceRecord.match.scored_holes, 18);
    assert.deepEqual(sourceRecord.scoring_snapshot.hole_definitions, retainedScoringConfigurations[matchId]);
  }

  const roundOne = view.rounds.find((round) => round.round === 1);
  const roundTwo = view.rounds.find((round) => round.round === 2);
  assert.equal(roundOne.roundWinner, "In Progress");
  assert.equal(roundTwo.roundWinner, "In Progress");
  for (const side of ["PICKLES", "LIPPIT"]) {
    const team = history2026TeamPageModel(view, side);
    assert.equal(team.roundGroups[0].lifecycle, "IN PROGRESS");
    assert.equal(team.roundGroups[1].lifecycle, "IN PROGRESS");
  }
});

test("Step 5 History follows current lifecycle through Final to Reopen to re-Finalize", () => {
  const aggregate = makeCurrentReopenedAggregate();
  const reopened = buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() });
  assert.equal(reopened.matches.find((match) => match.id === "2026-R1-4").status, "LIVE");
  assert.equal(reopened.analytics.scorecards.some((scorecard) => scorecard.matchId === "2026-R1-4"), false);

  refinalize(aggregate, "2026-R1-4");
  const refinalized = buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() });
  const match = refinalized.matches.find((candidate) => candidate.id === "2026-R1-4");
  assert.equal(match.status, "FINAL");
  assert.equal(match.lifecycle, "FINAL");
  assert.notEqual(match.finalResult, "");
  assert.equal(refinalized.analytics.scorecards.filter(
    (scorecard) => scorecard.matchId === "2026-R1-4"
  ).length, 4);
  assert.equal(refinalized.diagnostics.finalMatches, 16);
  assert.equal(refinalized.diagnostics.liveMatches, 8);
  assert.equal(refinalized.diagnostics.currentFinalizedSnapshots, 16);
});

test("Step 5 Google to Supabase rollback is explicit, Preview-only, and year-isolated", () => {
  const sequence = ["google", "supabase", "google", "supabase"].map((source) =>
    history2026ReadEnvironment({ ...previewEnv, HISTORY_2026_READ_SOURCE: source }).resolved
  );
  assert.deepEqual(sequence, ["google", "supabase", "google", "supabase"]);

  const production = history2026ReadEnvironment({
    ...previewEnv,
    VERCEL_ENV: "production",
    HISTORY_2026_READ_SOURCE: "supabase",
  });
  assert.equal(production.resolved, "google");
  assert.equal(production.productionBlocked, true);
});
