import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildFutureYearAdministrationMutation,
  canonicalFutureTournamentScope,
  normalizeProductionFutureYearAdministrationMutation,
  normalizeProductionFutureYearAdministrationPayload,
  PRODUCTION_FUTURE_YEAR_ADMINISTRATION_ACTIONS,
} from "../lib/production-future-year-administration-contract.js";

const actor = Object.freeze({
  actorAuthUserId: "11111111-1111-4111-8111-111111111111",
  actorPlayerId: "CB01",
});
const operationRequestId = "22222222-2222-4222-8222-222222222222";
const reason = "Prepare the reviewed 2027 tournament structure";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function readPayload(overrides = {}) {
  return {
    contract_version: "production-future-year-administration-v1",
    current_tournament: {
      tournament_id: "2026",
      tournament_year: 2026,
      lifecycle: "ACTIVE",
      pointer_revision: 1,
      current: true,
    },
    selected_tournament: {
      tournament_id: "2027",
      tournament_year: 2027,
      name: "2027 Sandbagger Invitational",
      lifecycle: "CONFIGURING",
      setup_revision: 6,
      destination: "Pinehurst",
      start_date: "2027-09-23",
      end_date: "2027-09-26",
      time_zone: "America/New_York",
    },
    catalog: [
      { tournament_id: "2027", tournament_year: 2027, name: "2027 Sandbagger Invitational", lifecycle: "CONFIGURING", setup_revision: 6 },
      { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational", lifecycle: "ACTIVE", current: true },
    ],
    player_catalog: [
      { player_id: "WD01", display_name: "Will Driver", global_status: "ACTIVE", email: "must-not-survive@example.com", auth_user_id: "33333333-3333-4333-8333-333333333333" },
      { player_id: "CB01", display_name: "Clay Bunker", global_status: "ACTIVE" },
    ],
    course_library: [
      { course_id: "PINEHURST-2", name: "Pinehurst No. 2", location: "Pinehurst, NC", tees: ["Blue", "Blue", "White"], source_payload: { secret: "not exposed" } },
    ],
    teams: [{ team_id: "CB", team_side: 1, name: "The Pickles", captain_player_id: "CB01", active: true }],
    roster: [{ player_id: "CB01", display_name: "Clay Bunker", team_id: "CB", team_side: 1, participation_status: "ACTIVE" }],
    rounds: [{ round_number: 1, name: "Best Ball", format: "BB", team_size: 2, points_available: "1", handicap_allowance: "0.9" }],
    course_assignments: [{ round_number: 1, course_id: "PINEHURST-2", course_name: "Pinehurst No. 2", tee: "Blue", complete: true }],
    match_definitions: [{ match_id: "2027-R1-1", round_number: 1, match_number: 1, lifecycle: "UPCOMING" }],
    compatibility_jobs: [{ job_id: "job-1", match_id: "2027-R1-1", status: "PENDING", required_for_activation: false, safe_error: "" }],
    readiness: {
      ready_for_activation: false,
      fingerprint: "a".repeat(64),
      blockers: [{ code: "HANDICAPS_REQUIRED", section: "ROSTER", message: "Two roster Players need approved handicaps.", target_id: "2027" }],
      counts: { roster: 24, matches: 18 },
    },
    activation_plan: {
      status: "BLOCKED",
      executable: false,
      code: "FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED",
      blockers: [],
    },
    capabilities: {
      create_tournament: true,
      clone_structure: true,
      edit_tournament: true,
      configure_teams: true,
      replace_roster: true,
      configure_rounds: true,
      assign_existing_course: true,
      generate_match_structure: true,
      mark_ready: false,
      activate_tournament: true,
      google_compatibility_writer: true,
    },
    audit: [{
      event_id: "44444444-4444-4444-8444-444444444444",
      action: "TEAM_CONFIGURED",
      target_id: "CB",
      actor_player_id: "CB01",
      result: "CHANGED",
      occurred_at: "2026-08-30T15:00:00Z",
      summary: "Configured the future tournament team",
      payload: { shouldNotSurvive: true },
    }],
    ...overrides,
  };
}

async function importFutureYearServer() {
  const serverSource = await source("lib/production-future-year-administration-server.js");
  const contractUrl = new URL("../lib/production-future-year-administration-contract.js", import.meta.url).href;
  const transformed = serverSource
    .replace('import "server-only";\n', "")
    .replace(
      /import \{ assertProductionCutoverActivation \} from "\.\/production-cutover-activation-contract\.js";/,
      'function assertProductionCutoverActivation() { return { state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }; }',
    )
    .replace(
      /import \{\s*PRODUCTION_GOOGLE_WORKBOOK_ID,\s*PRODUCTION_SUPABASE_PROJECT_REF,\s*PRODUCTION_SUPABASE_URL,\s*PRODUCTION_TOURNAMENT_ID,\s*PRODUCTION_TOURNAMENT_YEAR,?\s*\} from "\.\/production-foundation-resource-contract\.js";/,
      `const PRODUCTION_GOOGLE_WORKBOOK_ID = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const PRODUCTION_SUPABASE_PROJECT_REF = "ymqhhtxaywtqllynrmxe";
const PRODUCTION_SUPABASE_URL = "https://ymqhhtxaywtqllynrmxe.supabase.co";
const PRODUCTION_TOURNAMENT_ID = "2026";
const PRODUCTION_TOURNAMENT_YEAR = 2026;`,
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      "function recordDataAuthorityTransport() {}",
    )
    .replace('from "./production-future-year-administration-contract.js";', `from "${contractUrl}";`);
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

test("future target scope is separate from and cannot alias the certified 2026 provenance", () => {
  assert.deepEqual(canonicalFutureTournamentScope("2027", 2027), {
    tournamentId: "2027",
    tournamentYear: 2027,
  });
  assert.throws(() => canonicalFutureTournamentScope("2026", 2026),
    (error) => error.code === "FUTURE_YEAR_TARGET_TOURNAMENT_INVALID");
  assert.throws(() => canonicalFutureTournamentScope("TOUR-2027", 2027),
    (error) => error.code === "FUTURE_YEAR_TARGET_TOURNAMENT_INVALID");
  assert.throws(() => canonicalFutureTournamentScope("2027", 2028),
    (error) => error.code === "FUTURE_YEAR_TARGET_TOURNAMENT_INVALID");
});

test("all eight actions emit bounded snake_case annual-administration payloads", () => {
  const metadata = {
    targetTournamentId: "2027",
    tournamentYear: 2027,
    expectedRevision: 0,
    operationRequestId,
    reason,
    name: "2027 Sandbagger Invitational",
    startDate: "2027-09-23",
    endDate: "2027-09-26",
    timeZone: "America/New_York",
    destination: "Pinehurst",
  };
  const operations = [
    buildFutureYearAdministrationMutation("create", { ...metadata, creationMode: "clone_structure", cloneSourceTournamentId: "2026" }),
    buildFutureYearAdministrationMutation("update", { ...metadata, expectedRevision: 1 }),
    buildFutureYearAdministrationMutation("configure-team", {
      ...metadata, expectedRevision: 2, teamId: "cb", teamSide: 1, teamName: "The Pickles", captainPlayerId: "cb01", active: true,
    }),
    buildFutureYearAdministrationMutation("replace-roster", {
      ...metadata, expectedRevision: 3, roster: [
        { playerId: "wd01", teamId: "wd", teamSide: 2, participationStatus: "active" },
        { playerId: "cb01", teamId: "cb", teamSide: 1, participationStatus: "active" },
      ],
    }),
    buildFutureYearAdministrationMutation("configure-round", {
      ...metadata, expectedRevision: 4, roundNumber: 1, roundName: "Best Ball", format: "bb",
      teamSize: 2, pointsAvailable: "1.5", handicapAllowance: "0.9",
    }),
    buildFutureYearAdministrationMutation("assign-course", {
      ...metadata, expectedRevision: 5, roundNumber: 1, courseId: "pinehurst-2", tee: "Blue",
      sourceTournamentId: "2026", sourceRoundNumber: 1,
    }),
    buildFutureYearAdministrationMutation("generate-match-structure", {
      ...metadata, expectedRevision: 6, roundNumber: 1, matchCount: 6,
    }),
    buildFutureYearAdministrationMutation("mark-ready", { ...metadata, expectedRevision: 7 }),
  ];

  assert.deepEqual(PRODUCTION_FUTURE_YEAR_ADMINISTRATION_ACTIONS, [
    "create", "update", "configure-team", "replace-roster", "configure-round",
    "assign-course", "generate-match-structure", "mark-ready",
  ]);
  assert.deepEqual(operations.map((item) => item.operation), [
    "CREATE_TOURNAMENT", "UPDATE_TOURNAMENT", "CONFIGURE_TEAM", "REPLACE_ROSTER",
    "CONFIGURE_ROUND", "ASSIGN_COURSE", "GENERATE_MATCH_STRUCTURE", "MARK_READY",
  ]);
  assert.equal(operations[0].creation_mode, "CLONE_STRUCTURE");
  assert.equal(operations[0].clone_source_tournament_id, "2026");
  assert.equal(operations[0].target_tournament_id, "2027");
  assert.equal(operations[1].target_tournament_id, "2027");
  assert.equal(operations[3].roster[0].player_id, "CB01");
  assert.deepEqual(operations[4], {
    operation: "CONFIGURE_ROUND",
    expected_revision: 4,
    operation_request_id: operationRequestId,
    reason,
    target_tournament_id: "2027",
    round_number: 1,
    round_name: "Best Ball",
    format: "BB",
    team_size: 2,
    points_available: "1.5",
    handicap_allowance: "0.9",
  });
  assert.equal(operations[5].source_tournament_id, "2026");
  assert.equal(operations[6].match_count, 6);
  assert.equal(Object.hasOwn(operations[7], "activate"), false);
});

test("clone, roster, round, and reason validation fail closed without importing forbidden facts", () => {
  const common = {
    targetTournamentId: "2027", tournamentYear: 2027, expectedRevision: 0,
    operationRequestId, reason, name: "2027 Sandbagger Invitational",
    startDate: "2027-09-23", endDate: "2027-09-26", timeZone: "America/New_York", destination: "Pinehurst",
  };
  assert.throws(() => buildFutureYearAdministrationMutation("create", {
    ...common, creationMode: "clone_structure", cloneSourceTournamentId: "2025",
  }), (error) => error.code === "FUTURE_YEAR_CLONE_SOURCE_INVALID");
  assert.throws(() => buildFutureYearAdministrationMutation("replace-roster", {
    ...common, expectedRevision: 1, roster: [
      { playerId: "CB01", teamId: "CB", teamSide: 1 },
      { playerId: "CB01", teamId: "CB", teamSide: 1 },
    ],
  }), (error) => error.code === "FUTURE_YEAR_ROSTER_DUPLICATE_PLAYER");
  assert.throws(() => buildFutureYearAdministrationMutation("configure-round", {
    ...common, expectedRevision: 1, roundNumber: 1, roundName: "Singles", format: "SI",
    teamSize: 2, pointsAvailable: "1", handicapAllowance: "1",
  }), (error) => error.code === "FUTURE_YEAR_FORMAT_TEAM_SIZE_INVALID");
  assert.throws(() => buildFutureYearAdministrationMutation("mark-ready", {
    ...common, expectedRevision: 1, reason: "token=do-not-log-this",
  }), (error) => error.code === "FUTURE_YEAR_REASON_REQUIRED");
  const roster = buildFutureYearAdministrationMutation("replace-roster", {
    ...common, expectedRevision: 1, roster: [{
      playerId: "CB01", teamId: "CB", teamSide: 1, participationStatus: "ACTIVE",
      email: "ignored@example.com", authUserId: "33333333-3333-4333-8333-333333333333", handicap: "4.2",
    }],
  });
  assert.deepEqual(roster.roster[0], {
    player_id: "CB01", team_id: "CB", team_side: 1, participation_status: "ACTIVE",
  });
});

test("read normalization exposes selectors/readiness but suppresses PII and uninstalled capabilities", () => {
  const data = normalizeProductionFutureYearAdministrationPayload({ ok: true, data: readPayload() });
  assert.equal(data.contractVersion, "production-future-year-administration-v1");
  assert.equal(data.currentTournament.tournamentId, "2026");
  assert.equal(data.currentTournament.pointerRevision, 1);
  assert.equal(data.selectedTournament.tournamentId, "2027");
  assert.deepEqual(data.catalog.map((item) => item.tournamentId), ["2026", "2027"]);
  assert.deepEqual(data.playerCatalog[0], { playerId: "CB01", displayName: "Clay Bunker", status: "ACTIVE" });
  assert.deepEqual(data.courseLibrary[0], { courseId: "PINEHURST-2", name: "Pinehurst No. 2", location: "Pinehurst, NC", tees: ["Blue", "White"] });
  assert.equal(data.readiness.fingerprint, "a".repeat(64));
  assert.equal(data.readiness.blockers[0].message, "Two roster Players need approved handicaps.");
  assert.equal(data.activationPlan.executable, false);
  assert.equal(data.capabilities.createTournament, true);
  assert.equal(data.capabilities.activateTournament, false);
  assert.equal(data.capabilities.createGlobalCourse, false);
  assert.equal(data.capabilities.googleCompatibilityWriter, false);
  assert.deepEqual(data.audit[0], {
    id: "44444444-4444-4444-8444-444444444444",
    action: "TEAM_CONFIGURED",
    target: "CB",
    actor: "CB01",
    result: "CHANGED",
    timestamp: "2026-08-30T15:00:00Z",
    summary: "Configured the future tournament team",
  });
  assert.doesNotMatch(JSON.stringify(data), /must-not-survive|auth_user_id|shouldNotSurvive|source_payload/);
  assert.throws(() => normalizeProductionFutureYearAdministrationPayload({
    ...readPayload(), contract_version: "preview-future-year-administration-v1",
  }), (error) => error.code === "FUTURE_YEAR_RESPONSE_INVALID");
});

test("mutation receipts preserve exact retry and readiness evidence", () => {
  const result = normalizeProductionFutureYearAdministrationMutation({
    ok: true,
    code: "PRODUCTION_FUTURE_YEAR_MARK_READY_COMPLETED",
    operation: "MARK_READY",
    idempotent: true,
    target_tournament_id: "2027",
    revision: 8,
    lifecycle: "READY_FOR_ACTIVATION",
    receipt_id: "55555555-5555-4555-8555-555555555555",
    readiness: { ready_for_activation: true, fingerprint: "b".repeat(64), blockers: [], counts: { matches: 18 } },
  });
  assert.equal(result.idempotent, true);
  assert.equal(result.targetTournamentId, "2027");
  assert.equal(result.revision, 8);
  assert.equal(result.lifecycle, "READY_FOR_ACTIVATION");
  assert.equal(result.readiness.readyForActivation, true);
});

test("server read keeps fixed 2026 provenance and a separately validated future target", async () => {
  const { readProductionFutureYearAdministration } = await importFutureYearServer();
  let observed;
  const data = await readProductionFutureYearAdministration({
    ...actor,
    targetTournamentId: "2027",
  }, {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (name, input) => {
      observed = { name, input };
      return { payload: { ok: true, data: readPayload() } };
    },
  });
  assert.equal(data.selectedTournament.tournamentId, "2027");
  assert.equal(observed.name, "read_production_future_year_administration_v1");
  assert.equal(observed.input.contract_version, "production-future-year-administration-v1");
  assert.equal(observed.input.environment, "PRODUCTION");
  assert.equal(observed.input.project_ref, "ymqhhtxaywtqllynrmxe");
  assert.equal(observed.input.project_url, "https://ymqhhtxaywtqllynrmxe.supabase.co");
  assert.equal(observed.input.source_workbook_id, "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4");
  assert.equal(observed.input.tournament_id, "2026");
  assert.equal(observed.input.tournament_year, 2026);
  assert.equal(observed.input.target_tournament_id, "2027");
  assert.deepEqual(observed.input.authorization, {
    tournament_id: "2026",
    auth_user_id: actor.actorAuthUserId,
    player_id: "CB01",
    role: "DIRECTOR",
  });
});

test("server mutations bind revision, idempotency and hash without trusting Owner/browser resource claims", async () => {
  const { mutateProductionFutureYearAdministration } = await importFutureYearServer();
  let observed;
  const receipt = await mutateProductionFutureYearAdministration({
    action: "generate-match-structure",
    ...actor,
    targetTournamentId: "2027",
    tournamentYear: 2027,
    expectedRevision: 6,
    operationRequestId,
    reason,
    roundNumber: 1,
    matchCount: 6,
    owner: true,
    projectRef: "preview-project",
    tournamentId: "attacker-selected",
  }, {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (name, input) => {
      observed = { name, input };
      return { payload: {
        ok: true,
        code: "PRODUCTION_FUTURE_YEAR_GENERATE_MATCH_STRUCTURE_COMPLETED",
        operation: input.operation,
        target_tournament_id: input.target_tournament_id,
        revision: input.expected_revision + 1,
        lifecycle: "CONFIGURING",
        receipt_id: "66666666-6666-4666-8666-666666666666",
        readiness: { ready_for_activation: false, blockers: [], counts: {} },
      } };
    },
  });
  assert.equal(observed.name, "mutate_production_future_year_administration_v1");
  assert.equal(observed.input.operation, "GENERATE_MATCH_STRUCTURE");
  assert.equal(observed.input.tournament_id, "2026");
  assert.equal(observed.input.target_tournament_id, "2027");
  assert.equal(observed.input.expected_revision, 6);
  assert.equal(observed.input.operation_request_id, operationRequestId);
  assert.match(observed.input.request_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(observed.input, "owner"), false);
  assert.equal(Object.hasOwn(observed.input, "projectRef"), false);
  assert.equal(Object.hasOwn(observed.input, "activate_tournament"), false);
  assert.equal(receipt.revision, 7);
});

test("transport allowlists only the two Supabase RPCs and always disables caching", async () => {
  const { productionFutureYearAdministrationRpc } = await importFutureYearServer();
  await assert.rejects(
    productionFutureYearAdministrationRpc("activate_production_future_tournament", {}, {
      env: { PRODUCTION_SUPABASE_SECRET_KEY: "x".repeat(40) },
      activation: {},
      fetchImpl: async () => { throw new Error("must not fetch"); },
    }),
    (error) => error.code === "FUTURE_YEAR_RPC_FORBIDDEN" && error.status === 403,
  );
  let request;
  await productionFutureYearAdministrationRpc("read_production_future_year_administration_v1", {}, {
    env: { PRODUCTION_SUPABASE_SECRET_KEY: "x".repeat(40) },
    activation: {},
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.match(request.url, /ymqhhtxaywtqllynrmxe\.supabase\.co\/rest\/v1\/rpc\/read_production_future_year_administration_v1$/);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers.apikey, "x".repeat(40));
});

test("bounded future setup domain errors remain typed for Director recovery", async () => {
  const serverSource = await source("lib/production-future-year-administration-server.js");
  const route = await source("app/api/director/future-tournaments/route.js");
  for (const domain of ["TEAM", "ROSTER", "ROUND", "COURSE", "MATCH"]) {
    assert.match(serverSource, new RegExp(`FUTURE_\\(\\?:YEAR\\|TOURNAMENT[^\\n]+${domain}`));
  }
  assert.match(route, /FUTURE_TEAM_CAPTAIN_OR_INPUT_INVALID/);
  assert.match(route, /FUTURE_ROUND_MATCH_STRUCTURE_LOCKED/);
  assert.match(route, /FUTURE_EXISTING_COURSE_TEE_REQUIRED/);
  assert.match(route, /FUTURE_MATCH_STRUCTURE_ALREADY_GENERATED/);
});

test("Director route is Production-only, same-origin, Supabase-only and leaves Owner checks server-side", async () => {
  const [route, server] = await Promise.all([
    source("app/api/director/future-tournaments/route.js"),
    source("lib/production-future-year-administration-server.js"),
  ]);
  assert.match(route, /VERCEL_ENV\)\.toLowerCase\(\) !== "production"/);
  assert.match(route, /assertProductionCutoverActivation\(\{ requiredPhase: "OBSERVATION" \}\)/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /result\.source !== "production-director-entitlement"/);
  assert.match(route, /searchParams\.get\("targetTournamentId"\)/);
  assert.match(route, /readProductionFutureYearAdministration\(\{/);
  assert.match(route, /mutateProductionFutureYearAdministration\(\{/);
  assert.match(route, /fallbackUsed: false,[\s\S]*googleRequests: 0/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.match(server, /const RPCS = new Set\(\[[\s\S]*read_production_future_year_administration_v1[\s\S]*mutate_production_future_year_administration_v1/);
  assert.match(server, /tournament_id: PRODUCTION_TOURNAMENT_ID,[\s\S]*target_tournament_id/);
  assert.match(server, /requiredPhase: "OBSERVATION"/);
  assert.doesNotMatch(route + server, /google-sheets|readGoogle|writeGoogle|passport|legacy.*password|auth\.admin|createUser\(/i);
  assert.doesNotMatch(route, /identity\.(?:owner|isOwner)|role:\s*"OWNER"|authorizeOwner/);
});
