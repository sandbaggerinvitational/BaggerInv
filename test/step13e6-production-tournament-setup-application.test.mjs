import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildTournamentSetupMutation,
  canonicalTournamentSetupHoles,
  canonicalTournamentSetupParticipants,
  normalizeProductionTournamentSetupMutation,
  normalizeProductionTournamentSetupPayload,
  productionTournamentFormatParticipantCount,
} from "../lib/production-tournament-setup-contract.js";
import { PRODUCTION_DIRECTOR_SECTIONS } from "../lib/production-director-console.js";

const actor = Object.freeze({
  actorAuthUserId: "11111111-1111-4111-8111-111111111111",
  actorPlayerId: "CB01",
});
const operationRequestId = "22222222-2222-4222-8222-222222222222";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const holes = () => Array.from({ length: 18 }, (_, index) => ({
  number: index + 1,
  par: index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5,
  strokeIndex: 18 - index,
  yardage: 140 + (index * 17),
}));

const pairings = Object.freeze({
  BB: Object.freeze([
    { playerId: "CB01", teamSide: 1, playerSlot: 1 },
    { playerId: "CB02", teamSide: 1, playerSlot: 2 },
    { playerId: "WD01", teamSide: 2, playerSlot: 1 },
    { playerId: "WD02", teamSide: 2, playerSlot: 2 },
  ]),
  SC: Object.freeze([
    { playerId: "CB03", teamSide: 1, playerSlot: 1 },
    { playerId: "CB04", teamSide: 1, playerSlot: 2 },
    { playerId: "WD03", teamSide: 2, playerSlot: 1 },
    { playerId: "WD04", teamSide: 2, playerSlot: 2 },
  ]),
  SI: Object.freeze([
    { playerId: "CB05", teamSide: 1, playerSlot: 1 },
    { playerId: "WD05", teamSide: 2, playerSlot: 1 },
  ]),
});

function setupPayload(overrides = {}) {
  return {
    contract_version: "production-tournament-setup-v1",
    revision: 12,
    actor: { player_id: "CB01", is_owner: true },
    tournament: {
      tournament_id: "2026",
      tournament_year: 2026,
      name: "Sandbagger Invitational",
      destination: "Kiawah Island",
      start_date: "2026-09-24",
      end_date: "2026-09-27",
      time_zone: "America/New_York",
      operational_status: "UPCOMING",
    },
    teams: [
      { team_id: "CB", team_side: 1, name: "The Pickles", captain_player_id: "CB01" },
      { team_id: "WD", team_side: 2, name: "The Mulligans", captain_player_id: "WD01" },
    ],
    roster: [
      { player_id: "WD01", display_name: "Will Driver", membership_status: "ACTIVE", team_id: "WD", team_side: 2, tournament_handicap: "7.4", can_assign_team: false },
      { player_id: "CB01", display_name: "Clay Bunker", membership_status: "ACTIVE", team_id: "CB", team_side: 1, tournament_handicap: "5.2", can_assign_team: true },
    ],
    available_players: [],
    rounds: [
      { round_number: 1, name: "Best Ball", format: "BB", team_size: 2, points_available: "1", handicap_allowance: "0.9", status: "UPCOMING" },
    ],
    courses: [{
      round_number: 1,
      course_id: "KIAWAH-OCEAN",
      course_name: "The Ocean Course",
      tee: "Tournament",
      rating: "73.2",
      slope: 144,
      par: 72,
      holes: holes(),
      complete: true,
      source: "CANONICAL_SUPABASE",
    }],
    available_course_identities: [{
      course_id: "OCGC01",
      canonical_name: "Ocean Course",
      canonical_location: "Kiawah Island, SC",
      requires_tee_configuration: true,
      requires_hole_configuration: true,
    }],
    matches: [{
      match_id: "2026-R1-1",
      round_number: 1,
      match_number: 1,
      format: "BB",
      status: "UPCOMING",
      course_id: "KIAWAH-OCEAN",
      tee: "Tournament",
      tee_time: "08:00",
      starting_hole: 1,
      participant_count: 4,
      participants: pairings.BB,
      snapshot: {
        id: "2026-R1-1-S1",
        revision: 1,
        prepared: true,
        current: true,
        handicap_revision_id: "HANDICAP-7",
      },
      scoring_ready: true,
      scoring_readiness_code: "SCORING_READY",
      scoring_readiness_reasons: [],
    }],
    readiness: {
      state: "NEEDS_ATTENTION",
      complete: false,
      blockers: ["Round 2 needs course details"],
      warnings: ["Two Players need approved handicaps"],
      sections: [
        { id: "tournament", label: "Tournament", state: "COMPLETE", complete: true, blockers: [], warnings: [] },
        { id: "matches", label: "Matches & Pairings", state: "NEEDS_ATTENTION", complete: false, blockers: ["Round 2 Match 1 needs 4 participants"], warnings: [] },
      ],
    },
    capabilities: {
      "update-tournament": { allowed: true },
      replace_pairings: { allowed: true },
    },
    dependencies: {
      odds_published: true,
      net_skins_configured: false,
      calcutta_configured: false,
      draft_pick_count: 24,
    },
    audit: [{
      event_id: "33333333-3333-4333-8333-333333333333",
      action: "PAIRINGS_REPLACED",
      domain: "MATCHES",
      target_id: "2026-R1-1",
      actor_player_id: "CB01",
      result: "CHANGED",
      occurred_at: "2026-08-30T12:00:00Z",
      summary: "Round 1 Match 1 pairings updated",
    }],
    deferred: ["New global course creation requires an established Course-ID lifecycle"],
    ...overrides,
  };
}

async function importTournamentSetupServer() {
  const serverSource = await source("lib/production-tournament-setup-server.js");
  const contractUrl = new URL("../lib/production-tournament-setup-contract.js", import.meta.url).href;
  const transformed = serverSource
    .replace('import "server-only";\n', "")
    .replace(
      /import \{\s*assertProductionCutoverActivation,?\s*\} from "\.\/production-cutover-activation-contract\.js";/,
      'function assertProductionCutoverActivation() { return { state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }; }',
    )
    .replace(
      /import \{\s*PRODUCTION_GOOGLE_WORKBOOK_ID,\s*PRODUCTION_SUPABASE_PROJECT_REF,\s*PRODUCTION_SUPABASE_URL,\s*PRODUCTION_TOURNAMENT_ID,?\s*\} from "\.\/production-foundation-resource-contract\.js";/,
      `const PRODUCTION_GOOGLE_WORKBOOK_ID = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const PRODUCTION_SUPABASE_PROJECT_REF = "ymqhhtxaywtqllynrmxe";
const PRODUCTION_SUPABASE_URL = "https://ymqhhtxaywtqllynrmxe.supabase.co";
const PRODUCTION_TOURNAMENT_ID = "2026";`,
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      "function recordDataAuthorityTransport() {}",
    )
    .replace('from "./production-tournament-setup-contract.js";', `from "${contractUrl}";`);
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

test("BB, Scramble, and Singles preserve the certified participant/slot shapes", () => {
  assert.equal(productionTournamentFormatParticipantCount("BB"), 4);
  assert.equal(productionTournamentFormatParticipantCount("SC"), 4);
  assert.equal(productionTournamentFormatParticipantCount("SI"), 2);

  for (const format of ["BB", "SC", "SI"]) {
    const normalized = canonicalTournamentSetupParticipants(pairings[format], format);
    assert.equal(normalized.length, productionTournamentFormatParticipantCount(format));
    assert.deepEqual(normalized.map(({ teamSide, playerSlot }) => `${teamSide}:${playerSlot}`),
      format === "SI" ? ["1:1", "2:1"] : ["1:1", "1:2", "2:1", "2:2"]);
  }

  assert.throws(() => canonicalTournamentSetupParticipants([
    pairings.BB[0],
    { ...pairings.BB[1], playerId: "CB01" },
    pairings.BB[2],
    pairings.BB[3],
  ], "BB"), (error) => error.code === "TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID");
  assert.throws(() => canonicalTournamentSetupParticipants([
    pairings.BB[0],
    { ...pairings.BB[1], playerSlot: 1 },
    pairings.BB[2],
    pairings.BB[3],
  ], "BB"), (error) => error.code === "TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID");
  assert.throws(() => canonicalTournamentSetupParticipants(pairings.BB.slice(0, 3), "BB"),
    (error) => error.code === "TOURNAMENT_SETUP_PAIRING_COUNT_INVALID");
  assert.throws(() => canonicalTournamentSetupParticipants([
    { ...pairings.SI[0], teamSide: 1 },
    { ...pairings.SI[1], teamSide: 1 },
  ], "SI"), (error) => error.code === "TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID");
});

test("course inputs require exactly 18 holes with unique hole and stroke-index slots", () => {
  const normalized = canonicalTournamentSetupHoles(holes().reverse());
  assert.equal(normalized.length, 18);
  assert.deepEqual(normalized.map((hole) => hole.number), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.deepEqual(new Set(normalized.map((hole) => hole.strokeIndex)).size, 18);
  assert.throws(() => canonicalTournamentSetupHoles(holes().slice(0, 17)),
    (error) => error.code === "TOURNAMENT_SETUP_HOLES_INCOMPLETE");
  const duplicateStrokeIndex = holes();
  duplicateStrokeIndex[17] = { ...duplicateStrokeIndex[17], strokeIndex: duplicateStrokeIndex[0].strokeIndex };
  assert.throws(() => canonicalTournamentSetupHoles(duplicateStrokeIndex),
    (error) => error.code === "TOURNAMENT_SETUP_HOLE_SEQUENCE_INVALID");
});

test("read responses normalize authoritative readiness and preserve bounded dependency warnings", () => {
  const data = normalizeProductionTournamentSetupPayload({ ok: true, data: setupPayload() });
  assert.equal(data.contractVersion, "production-tournament-setup-v1");
  assert.equal(data.revision, 12);
  assert.equal(data.actor.owner, true);
  assert.deepEqual(data.roster.map((player) => player.playerId), ["CB01", "WD01"]);
  assert.equal(data.courses[0].holes.length, 18);
  assert.equal(data.availableCourseIdentities.length, 1);
  assert.deepEqual(data.availableCourseIdentities[0], {
    courseId: "OCGC01",
    name: "Ocean Course",
    location: "Kiawah Island, SC",
    requiresTeeConfiguration: true,
    requiresHoleConfiguration: true,
  });
  assert.equal(data.matches[0].snapshot.prepared, true);
  assert.equal(data.matches[0].scoringReady, true);
  assert.equal(data.matches[0].scoringReadinessCode, "SCORING_READY");
  assert.equal(data.matches[0].tee, "Tournament");
  assert.equal(data.readiness.state, "NEEDS_ATTENTION");
  assert.deepEqual(data.readiness.blockers, ["Round 2 needs course details"]);
  assert.deepEqual(data.readiness.sections[1].blockers, ["Round 2 Match 1 needs 4 participants"]);
  assert.equal(data.dependencies.oddsPublished, true);
  assert.equal(data.dependencies.draftPickCount, 24);
  assert.equal(data.capabilities["update-tournament"].allowed, true);
  assert.equal(data.capabilities["replace-pairings"].allowed, true);
  assert.equal(data.capabilities["prepare-scoring-context"].allowed, false);
  assert.equal(data.audit[0].summary, "Round 1 Match 1 pairings updated");
  assert.deepEqual(data.deferred, ["New global course creation requires an established Course-ID lifecycle"]);
  assert.throws(() => normalizeProductionTournamentSetupPayload({ ...setupPayload(), contract_version: "preview-tournament-setup-v1" }),
    (error) => error.code === "TOURNAMENT_SETUP_RESPONSE_INVALID");
});

test("mutations canonicalize format facts and surface safe authoritative receipts", () => {
  const operation = buildTournamentSetupMutation("replace-pairings", {
    expectedRevision: 12,
    operationRequestId,
    matchId: "2026-r1-1",
    format: "bb",
    participants: pairings.BB,
  });
  assert.equal(operation.operation, "REPLACE_PAIRINGS");
  assert.equal(operation.expected_revision, 12);
  assert.equal(operation.operation_request_id, operationRequestId);
  assert.equal(operation.match_id, "2026-R1-1");
  assert.equal(operation.participants.length, 4);

  const receipt = normalizeProductionTournamentSetupMutation({
    ok: true,
    code: "TOURNAMENT_SETUP_PAIRINGS_REPLACED",
    action: "REPLACE_PAIRINGS",
    revision: 13,
    idempotent: true,
    target_id: "2026-R1-1",
    snapshot_prepared: true,
    readiness: { state: "READY", complete: true, blockers: [], warnings: [], sections: [] },
  });
  assert.equal(receipt.revision, 13);
  assert.equal(receipt.idempotent, true);
  assert.equal(receipt.snapshotPrepared, true);
  assert.equal(receipt.readiness.complete, true);
});

test("existing-match configuration requires a stable Match ID and cannot request creation", () => {
  assert.throws(() => buildTournamentSetupMutation("upsert-match", {
    expectedRevision: 12,
    operationRequestId,
    roundNumber: 1,
    matchNumber: 99,
    courseId: "KIAWAH-OCEAN",
    tee: "Tournament",
    teeTime: "08:05",
    startingHole: 1,
  }), (error) => error.code === "TOURNAMENT_SETUP_EXISTING_MATCH_REQUIRED");
});

test("all eight mutations emit the exact canonical snake_case SQL boundary payload", () => {
  const common = {
    expected_revision: 12,
    operation_request_id: operationRequestId,
  };
  const built = [
    buildTournamentSetupMutation("update-tournament", {
      expectedRevision: 12,
      operationRequestId,
      name: "Sandbagger Invitational",
      destination: "Kiawah Island",
      startDate: "2026-09-24",
      endDate: "2026-09-27",
      timeZone: "America/New_York",
      operationalStatus: "UPCOMING",
    }),
    buildTournamentSetupMutation("update-team", {
      expectedRevision: 12,
      operationRequestId,
      teamId: "cb",
      teamName: "The Pickles",
      captainPlayerId: "cb01",
    }),
    buildTournamentSetupMutation("assign-roster-team", {
      expectedRevision: 12,
      operationRequestId,
      playerId: "cb02",
      teamId: "cb",
    }),
    buildTournamentSetupMutation("update-round", {
      expectedRevision: 12,
      operationRequestId,
      roundNumber: 1,
      roundName: "Best Ball",
      format: "bb",
      teamSize: 2,
      pointsAvailable: "1.5",
      handicapAllowance: "0.9",
    }),
    buildTournamentSetupMutation("upsert-course", {
      expectedRevision: 12,
      operationRequestId,
      roundNumber: 1,
      courseId: "KIAWAH-OCEAN",
      courseName: "The Ocean Course",
      city: "Kiawah Island",
      state: "South Carolina",
      tee: "Tournament",
      rating: "73.2",
      slope: 144,
      par: 72,
      holes: holes(),
    }),
    buildTournamentSetupMutation("upsert-match", {
      expectedRevision: 12,
      operationRequestId,
      matchId: "2026-r1-1",
      roundNumber: 1,
      matchNumber: 1,
      courseId: "KIAWAH-OCEAN",
      tee: "Tournament",
      teeTime: "08:05",
      startingHole: 10,
    }),
    buildTournamentSetupMutation("replace-pairings", {
      expectedRevision: 12,
      operationRequestId,
      matchId: "2026-r1-1",
      format: "bb",
      participants: pairings.BB,
    }),
    buildTournamentSetupMutation("prepare-scoring-context", {
      expectedRevision: 12,
      operationRequestId,
      matchId: "2026-r1-1",
    }),
  ];

  assert.deepEqual(built[0], {
    operation: "UPDATE_TOURNAMENT",
    ...common,
    tournament_name: "Sandbagger Invitational",
    destination: "Kiawah Island",
    start_date: "2026-09-24",
    end_date: "2026-09-27",
    time_zone: "America/New_York",
    operational_status: "UPCOMING",
  });
  assert.deepEqual(built[1], {
    operation: "UPDATE_TEAM",
    ...common,
    team_id: "CB",
    team_name: "The Pickles",
    captain_player_id: "CB01",
  });
  assert.deepEqual(built[2], {
    operation: "ASSIGN_ROSTER_TEAM",
    ...common,
    player_id: "CB02",
    team_id: "CB",
  });
  assert.deepEqual(built[3], {
    operation: "UPDATE_ROUND",
    ...common,
    round_number: 1,
    round_name: "Best Ball",
    format: "BB",
    team_size: 2,
    points_available: "1.5",
    handicap_allowance: "0.9",
  });
  assert.deepEqual(built[4], {
    operation: "UPSERT_COURSE",
    ...common,
    round_number: 1,
    course_id: "KIAWAH-OCEAN",
    course_name: "The Ocean Course",
    city: "Kiawah Island",
    state: "South Carolina",
    tee: "Tournament",
    rating: "73.2",
    slope: 144,
    par: 72,
    holes: holes().map((hole) => ({
      hole_number: hole.number,
      par: hole.par,
      stroke_index: hole.strokeIndex,
      yardage: hole.yardage,
    })),
  });
  assert.deepEqual(built[5], {
    operation: "UPSERT_MATCH",
    ...common,
    match_id: "2026-R1-1",
    round_number: 1,
    match_number: 1,
    course_id: "KIAWAH-OCEAN",
    tee: "Tournament",
    tee_time: "08:05",
    starting_hole: 10,
  });
  assert.deepEqual(built[6], {
    operation: "REPLACE_PAIRINGS",
    ...common,
    match_id: "2026-R1-1",
    format: "BB",
    participants: [
      { player_id: "CB01", team_side: 1, player_slot: 1 },
      { player_id: "CB02", team_side: 1, player_slot: 2 },
      { player_id: "WD01", team_side: 2, player_slot: 1 },
      { player_id: "WD02", team_side: 2, player_slot: 2 },
    ],
  });
  assert.deepEqual(built[7], {
    operation: "PREPARE_SCORING_CONTEXT",
    ...common,
    match_id: "2026-R1-1",
  });
  assert.deepEqual(built.map((payload) => payload.operation), [
    "UPDATE_TOURNAMENT",
    "UPDATE_TEAM",
    "ASSIGN_ROSTER_TEAM",
    "UPDATE_ROUND",
    "UPSERT_COURSE",
    "UPSERT_MATCH",
    "REPLACE_PAIRINGS",
    "PREPARE_SCORING_CONTEXT",
  ]);
});

test("server reads only the allowlisted Production RPC with exact Director/resource scope", async () => {
  const { readProductionTournamentSetup } = await importTournamentSetupServer();
  let observed;
  const data = await readProductionTournamentSetup(actor, {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (name, input) => {
      observed = { name, input };
      return { payload: { ok: true, data: setupPayload() } };
    },
  });
  assert.equal(data.revision, 12);
  assert.equal(observed.name, "read_production_tournament_setup_v1");
  assert.equal(observed.input.contract_version, "production-tournament-setup-v1");
  assert.equal(observed.input.environment, "PRODUCTION");
  assert.equal(observed.input.project_ref, "ymqhhtxaywtqllynrmxe");
  assert.equal(observed.input.project_url, "https://ymqhhtxaywtqllynrmxe.supabase.co");
  assert.equal(observed.input.source_workbook_id, "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4");
  assert.equal(observed.input.tournament_id, "2026");
  assert.deepEqual(observed.input.authorization, {
    tournament_id: "2026",
    auth_user_id: actor.actorAuthUserId,
    player_id: "CB01",
    role: "DIRECTOR",
  });
});

test("server mutations bind idempotency, revision, canonical payload hash, and no scoring-access side effect", async () => {
  const { mutateProductionTournamentSetup } = await importTournamentSetupServer();
  let observed;
  const receipt = await mutateProductionTournamentSetup({
    action: "replace-pairings",
    ...actor,
    expectedRevision: 12,
    operationRequestId,
    matchId: "2026-R1-1",
    format: "BB",
    participants: pairings.BB,
  }, {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (name, input) => {
      observed = { name, input };
      return { payload: {
        ok: true,
        code: "TOURNAMENT_SETUP_PAIRINGS_REPLACED",
        action: input.operation,
        revision: input.expected_revision + 1,
        target: input.match_id,
        snapshot_prepared: true,
      } };
    },
  });
  assert.equal(observed.name, "mutate_production_tournament_setup_v1");
  assert.equal(observed.input.operation, "REPLACE_PAIRINGS");
  assert.equal(observed.input.expected_revision, 12);
  assert.equal(observed.input.operation_request_id, operationRequestId);
  assert.match(observed.input.request_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(observed.input.environment, "PRODUCTION");
  assert.equal(observed.input.project_ref, "ymqhhtxaywtqllynrmxe");
  assert.equal(observed.input.tournament_id, "2026");
  assert.equal(Object.hasOwn(observed.input, "activate_scoring_access"), false);
  assert.equal(Object.hasOwn(observed.input, "can_score"), false);
  assert.equal(receipt.revision, 13);
  assert.equal(receipt.snapshotPrepared, true);
});

test("Director route is Production-only, same-origin, Supabase-only, and fail-closed", async () => {
  const [route, server] = await Promise.all([
    source("app/api/director/tournament-setup/route.js"),
    source("lib/production-tournament-setup-server.js"),
  ]);
  assert.match(route, /VERCEL_ENV\)\.toLowerCase\(\) !== "production"/);
  assert.match(route, /assertProductionCutoverActivation\(\{ requiredPhase: "OBSERVATION" \}\)/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /result\.source !== "production-director-entitlement"/);
  assert.match(route, /readProductionTournamentSetup\(actor\(access\.identity\)\)/);
  assert.match(route, /mutateProductionTournamentSetup\(\{/);
  assert.match(route, /fallbackUsed: false,[\s\S]*googleRequests: 0/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.match(server, /requiredPhase: "OBSERVATION"/);
  assert.match(server, /const RPCS = new Set\(\[[\s\S]*read_production_tournament_setup_v1[\s\S]*mutate_production_tournament_setup_v1/);
  assert.match(server, /PRODUCTION_SUPABASE_PROJECT_REF/);
  assert.match(server, /PRODUCTION_GOOGLE_WORKBOOK_ID/);
  assert.doesNotMatch(route + server, /google-sheets-server-read|readGoogle|writeGoogle|passport|legacy.*password/i);
});

test("guided Tournament Setup UI reviews every mutation and never reuses legacy Google editors", async () => {
  const [panel, consoleSource, consoleModel] = await Promise.all([
    source("app/admin/director/ProductionTournamentSetupPanel.js"),
    source("app/admin/director/ProductionDirectorConsole.js"),
    source("lib/production-director-console.js"),
  ]);
  for (const label of [
    "Tournament", "Teams", "Roster", "Rounds", "Courses", "Matches & Pairings", "Readiness",
  ]) assert.match(panel, new RegExp(`\\[?"[a-z-]+", "${label.replace(/[&]/g, "&")}"\\]?|title="${label.replace("Roster", "Roster → Team Assignment")}"`), label);

  assert.match(panel, /const ENDPOINT = "\/api\/director\/tournament-setup"/);
  assert.match(panel, /buildTournamentSetupMutation\(action,[\s\S]*setReview\(\{ action, values, description, expectedRevision/);
  assert.match(panel, /Review before commit/);
  assert.match(panel, /I reviewed the target, current state, downstream consequences, and immutable audit effect/);
  assert.match(panel, /disabled=\{!confirmed \|\| phase === "submitting"\}[\s\S]*Confirm Production Change/);
  assert.match(panel, /method: "POST",[\s\S]*credentials: "same-origin"/);
  assert.match(panel, /Pairing changes never activate scoring access\. Tournament Day retains the separate certified access operation\./);
  assert.match(panel, /Creating a brand-new global course is deferred/);
  assert.match(panel, /Existing global course/);
  assert.match(panel, /Selecting an identity does not copy or invent a tee, rating, slope, par, or hole facts/);
  assert.match(panel, /Review Match Details/);
  assert.match(panel, /Existing matches only/);
  assert.match(panel, /New match creation is deferred/);
  assert.doesNotMatch(panel, /Create or update Round/);
  assert.doesNotMatch(panel, /Review Match<\/button>/);
  assert.match(panel, /Course ID<\/span><input value=\{draft\.courseId\} disabled/);
  assert.match(panel, /does not infer or fabricate missing setup/);
  assert.doesNotMatch(panel, /fetch\("\/api\/director",/);
  assert.doesNotMatch(panel, /saveMatchManagement|saveRoundPairings|saveCourseTees|updateGoogle|writeGoogle/);

  const setupSection = PRODUCTION_DIRECTOR_SECTIONS.find((section) => section.id === "tournament-setup");
  assert.deepEqual(setupSection, {
    id: "tournament-setup",
    label: "Tournament Setup",
    href: "/admin/director?section=tournament-setup",
  });
  assert.match(consoleSource, /import ProductionTournamentSetupPanel/);
  assert.match(consoleSource, /section === "tournament-setup" \? <ProductionTournamentSetupPanel \/>/);
  assert.match(consoleModel, /id: "tournament-setup", label: "Tournament Setup"/);
});
