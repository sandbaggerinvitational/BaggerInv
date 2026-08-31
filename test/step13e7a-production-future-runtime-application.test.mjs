import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildFutureRuntimeMutation,
  mergeProductionFutureYearAdministrationRuntime,
  normalizeProductionFutureRuntimeMutation,
  normalizeProductionFutureRuntimePayload,
  PRODUCTION_FUTURE_RUNTIME_ACTIONS,
} from "../lib/production-future-year-administration-contract.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const operationRequestId = "11111111-1111-4111-8111-111111111111";
const reason = "Prepare the reviewed future Production runtime";
const common = {
  targetTournamentId: "2027",
  tournamentYear: 2027,
  expectedRevision: 1,
  operationRequestId,
  reason,
};

test("future runtime action builders match the bounded V2 RPC request contract", () => {
  assert.deepEqual(PRODUCTION_FUTURE_RUNTIME_ACTIONS, [
    "grant-future-director",
    "add-global-course", "configure-global-course-context", "assign-future-course",
    "promote-runtime", "stage-handicaps", "approve-handicaps",
    "configure-match", "replace-pairings", "prepare-scoring-context", "mark-ready-v2",
    "activate", "close", "prepare-archive-plan",
  ]);
  const director = buildFutureRuntimeMutation("grant-future-director", {
    ...common, expectedRevision: 0, targetPlayerId: "CB01",
  });
  assert.deepEqual({
    action: director.action,
    target_player_id: director.target_player_id,
    expected_revision: director.expected_revision,
  }, {
    action: "GRANT_FUTURE_DIRECTOR",
    target_player_id: "CB01",
    expected_revision: 0,
  });
  const course = buildFutureRuntimeMutation("add-global-course", {
    ...common, expectedRevision: 4, courseName: "Pinehurst No. 10", location: "Pinehurst, NC",
  });
  assert.equal(course.action, "ADD_GLOBAL_COURSE");
  assert.equal(course.target_tournament_id, "2027");
  assert.equal(course.expected_revision, 4);

  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    par: 4,
    strokeIndex: index + 1,
    yardage: 400 + index,
  }));
  const context = buildFutureRuntimeMutation("configure-global-course-context", {
    ...common,
    expectedRevision: 1,
    courseId: "COURSE-010",
    teeId: "Blue",
    rating: "72.4",
    slope: 133,
    par: 72,
    holes,
  });
  assert.equal(context.action, "CONFIGURE_GLOBAL_COURSE_CONTEXT");
  assert.equal(context.holes.length, 18);
  assert.equal(context.holes[17].stroke_index, 18);
  assert.throws(() => buildFutureRuntimeMutation("configure-global-course-context", {
    ...common,
    courseId: "COURSE-010",
    teeId: "Blue",
    rating: "72.4",
    slope: 133,
    par: 72,
    holes: holes.slice(0, 17),
  }), (error) => error.code === "FUTURE_GLOBAL_COURSE_HOLES_INCOMPLETE");

  const assignment = buildFutureRuntimeMutation("assign-future-course", {
    ...common,
    expectedRevision: 7,
    roundNumber: 1,
    courseId: "COURSE-010",
    teeId: "Blue",
    courseContextRevision: 2,
  });
  assert.equal(assignment.action, "ASSIGN_FUTURE_COURSE");
  assert.equal(assignment.course_context_revision, 2);

  const configured = buildFutureRuntimeMutation("configure-match", {
    ...common, matchId: "2027-R1-1", matchNumber: 1, courseId: "PINEHURST-2",
    teeId: "Blue", teeTime: "08:10", startingHole: 1,
  });
  assert.deepEqual({
    match_id: configured.match_id,
    match_number: configured.match_number,
    course_id: configured.course_id,
    tee_id: configured.tee_id,
    tee_time: configured.tee_time,
    starting_hole: configured.starting_hole,
  }, {
    match_id: "2027-R1-1", match_number: 1, course_id: "PINEHURST-2",
    tee_id: "Blue", tee_time: "08:10", starting_hole: 1,
  });

  const pairings = buildFutureRuntimeMutation("replace-pairings", {
    ...common,
    matchId: "2027-R1-1",
    participants: [
      { playerId: "CB01", teamSide: 1, slotNumber: 1 },
      { playerId: "WD01", teamSide: 2, slotNumber: 1 },
    ],
  });
  assert.deepEqual(pairings.participants, [
    { player_id: "CB01", team_side: 1, player_slot: 1 },
    { player_id: "WD01", team_side: 2, player_slot: 1 },
  ]);
  assert.throws(() => buildFutureRuntimeMutation("replace-pairings", {
    ...common,
    matchId: "2027-R1-1",
    participants: [
      { playerId: "CB01", teamSide: 1, slotNumber: 1 },
      { playerId: "CB02", teamSide: 1, slotNumber: 1 },
    ],
  }), (error) => error.code === "FUTURE_RUNTIME_PAIRINGS_INVALID");

  const activate = buildFutureRuntimeMutation("activate", {
    ...common,
    expectedPointerRevision: 3,
    readinessFingerprint: "a".repeat(64),
  });
  assert.equal(activate.action, "PREPARE_ANNUAL_SCORING_TRANSITION");
  assert.equal(activate.expected_pointer_revision, 3);
  assert.equal(activate.readiness_fingerprint, "a".repeat(64));
  assert.throws(() => buildFutureRuntimeMutation("close", {
    ...common,
    completionFingerprint: "b".repeat(64),
  }), (error) => error.code === "PRODUCTION_ANNUAL_SCORING_TRANSITION_REQUIRED");
});

function runtimePayload(overrides = {}) {
  return {
    ok: true,
    contractVersion: "production-future-runtime-activation-v2",
    currentTournament: { tournamentId: "2026", tournamentYear: 2026, pointerRevision: 1 },
    selectedTournament: {
      tournamentId: "2027", tournamentYear: 2027, name: "Sandbagger Invitational",
      lifecycle: "CONFIGURING", setupRevision: 7, lifecycleRevision: 2,
    },
    runtimePromotion: {
      revision: 1, sourceSetupRevision: 7, fingerprint: "b".repeat(64), status: "PROMOTED",
    },
    handicap: { revisionId: "22222222-2222-4222-8222-222222222222", revisionNumber: 1, status: "APPROVED" },
    handicapDraft: { revisionId: "33333333-3333-4333-8333-333333333333", revisionNumber: 2, status: "DRAFT", coverageCount: 1,
      entries: [{ playerId: "CB01", tournamentHandicap: "+2.25" }] },
    matches: [{
      matchId: "2027-R1-1", round: 1, format: "BB", status: "UPCOMING",
      runtimeState: "PREPARED", runtimeRevision: 4, matchNumber: 1,
      courseId: "PINEHURST-2", teeId: "Blue", teeTime: "08:10", startingHole: 1,
      participants: [{ playerId: "CB01", teamId: "TEAM-1", teamSide: 1, playerSlot: 1 }],
      configurationFingerprint: "c".repeat(64),
    }],
    compatibilityJobs: [{ jobId: "job-1", matchId: "2027-R1-1", status: "CERTIFIED", attempts: 1 }],
    annualProjections: [{ domain: "GUIDE", sourceRevision: 1, bindingRevision: 1, status: "CERTIFIED" }],
    futureDirectorGovernance: {
      revision: 1,
      directors: [{ playerId: "CB01", displayName: "Clay Beltran", status: "ACTIVE", roleActive: true }],
    },
    readiness: { ready: true, fingerprint: "d".repeat(64), blockers: [], counts: { matches: 1 } },
    activation: null,
    archivePlan: null,
    courseAllocatorRevision: 4,
    courseCatalog: [{
      courseId: "COURSE-010", name: "Pinehurst No. 10", status: "ACTIVE",
      source: "DIRECTOR_CREATED", revision: 2,
      teeContexts: [{ teeId: "Blue", rating: "72.4", slope: 133, par: 72,
        contextRevision: 2, holeCount: 18, scoringReady: true }],
    }],
    capabilities: {
      grantFutureDirector: true,
      addGlobalCourse: true, configureGlobalCourseContext: true,
      assignFutureCourse: true, promoteRuntime: true, stageHandicaps: true,
      approveHandicaps: true, configureMatch: true, replacePairings: true,
      prepareScoringContext: true, markReady: true, activateTournament: true,
      closeTournament: true, prepareArchivePlan: true,
    },
    ...overrides,
  };
}

test("future runtime normalization exposes safe preparation state and no privileged evidence", () => {
  const runtime = normalizeProductionFutureRuntimePayload(runtimePayload({
    secret: "must-not-survive",
    auth_user_id: "44444444-4444-4444-8444-444444444444",
  }));
  assert.equal(runtime.selectedTournament.tournamentId, "2027");
  assert.equal(runtime.courseAllocatorRevision, 4);
  assert.equal(runtime.courseCatalog[0].teeContexts[0].scoringReady, true);
  assert.equal(runtime.capabilities.assignFutureCourse, true);
  assert.equal(runtime.capabilities.grantFutureDirector, true);
  assert.deepEqual(runtime.futureDirectorGovernance, {
    revision: 1,
    directors: [{ playerId: "CB01", displayName: "Clay Beltran", status: "ACTIVE", roleActive: true }],
  });
  assert.equal(runtime.handicapDraft.status, "DRAFT");
  assert.deepEqual(runtime.handicapDraft.entries, [{ playerId: "CB01", tournamentHandicap: "+2.25" }]);
  assert.equal(runtime.matches[0].teeId, "Blue");
  assert.equal(runtime.matches[0].participants[0].playerId, "CB01");
  assert.equal(runtime.readiness.readyForActivation, true);
  assert.equal(runtime.capabilities.activateTournament, true);
  assert.doesNotMatch(JSON.stringify(runtime), /must-not-survive|auth_user_id/);
});

test("runtime merge rejects pointer races and receipts preserve idempotent revision evidence", () => {
  const runtime = normalizeProductionFutureRuntimePayload(runtimePayload());
  const administration = {
    currentTournament: { tournamentId: "2026", pointerRevision: 1 },
    selectedTournament: { tournamentId: "2027" },
  };
  assert.equal(mergeProductionFutureYearAdministrationRuntime(administration, runtime).futureRuntime, runtime);
  assert.throws(() => mergeProductionFutureYearAdministrationRuntime({
    ...administration,
    currentTournament: { tournamentId: "2026", pointerRevision: 2 },
  }, runtime), (error) => error.code === "FUTURE_RUNTIME_PREDECESSOR_MISMATCH");

  const receipt = normalizeProductionFutureRuntimeMutation({
    ok: true,
    code: "PRODUCTION_FUTURE_RUNTIME_PROMOTED",
    action: "PROMOTE_RUNTIME_STRUCTURE",
    tournamentId: "2027",
    priorRevision: 0,
    nextRevision: 1,
    idempotent: true,
  });
  assert.deepEqual({
    operation: receipt.operation,
    targetTournamentId: receipt.targetTournamentId,
    revision: receipt.revision,
    idempotent: receipt.idempotent,
  }, {
    operation: "PROMOTE_RUNTIME_STRUCTURE",
    targetTournamentId: "2027",
    revision: 1,
    idempotent: true,
  });
});

test("Director route keeps runtime RPCs server-only, exact scoped, and archive execution unavailable", async () => {
  const [route, server, panel] = await Promise.all([
    source("app/api/director/future-tournaments/route.js"),
    source("lib/production-future-year-administration-server.js"),
    source("app/admin/director/ProductionFutureYearAdministrationPanel.js"),
  ]);
  assert.match(route, /mutateProductionFutureRuntime/);
  assert.match(route, /PRODUCTION_ANNUAL_SCORING_TRANSITION_ACTIONS/);
  for (const action of ["prepare", "close", "drain", "activate", "abort"]) {
    assert.match(server, new RegExp(`${action}_production_annual_scoring_transition_v1`));
  }
  assert.match(route, /expectedCurrentTournamentId: input\.expectedCurrentTournamentId/);
  assert.match(route, /expectedGoogleWriterGenerationId:/);
  assert.match(route, /expectedPredecessorAnnualAdmissionRevision:/);
  assert.match(route, /PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(server, /read_production_future_runtime_v2/);
  assert.match(server, /mutate_production_future_runtime_v2/);
  assert.match(server, /tournament_id: PRODUCTION_TOURNAMENT_ID/);
  assert.doesNotMatch(server, /action:\s*"ACTIVATE_TOURNAMENT"/);
  assert.match(panel, /expectedCurrentTournamentId: runtime\.currentTournament\.tournamentId/);
  assert.match(panel, /keeps the current pointer and scoring admission unchanged/);
  assert.match(panel, /authorized annual-transition operator/);
  assert.match(panel, /This panel never closes admission or commits the current pointer/);
  assert.match(panel, /Close \/ drain \/ activation operator workflow/);
  assert.doesNotMatch(panel, /onStage\("close"/);
  assert.match(panel, /Archive execution unavailable/);
  assert.doesNotMatch(panel, /archive-tournament/);
});

test("future current live projection preserves the existing live-revision DTO", async () => {
  const migration = await source(
    "supabase/production_migrations/202608300066_production_future_runtime_activation_v1.sql",
  );
  assert.match(migration, /surface = 'TOURNAMENT_LIVE'[\s\S]*\{data,live_revision\}[\s\S]*\{data,source_revision\}/);
});
