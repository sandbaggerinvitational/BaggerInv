import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { productionCalcuttaV1ContractData } from "../lib/production-calcutta-v1.js";
import {
  buildProductionDirectorOverview,
  readProductionDirectorOverview,
} from "../lib/production-director-console.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function importPrivateTransport() {
  const transportSource = await source("lib/production-director-private-operations.js");
  const activationStub = `
const PRODUCTION_VERCEL_PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";
function assertProductionCutoverActivation({ env, requiredPhase }) {
  if (requiredPhase !== "OBSERVATION") throw new Error("wrong phase");
  return {
    phase: "OBSERVATION",
    resources: { commitSha: env.VERCEL_GIT_COMMIT_SHA },
    maintenanceDeploymentCapability: {
      allowed: true,
      contract: "production-maintenance-single-deployment-capability-v1",
      ceiling: "OBSERVATION",
    },
  };
}`;
  const teamStub = `
const PRODUCTION_VERCEL_TEAM_ID = "team_kPw5zaib8uaQJALAwj4fWI6R";`;
  const resourceStub = `
const PRODUCTION_GOOGLE_WORKBOOK_ID = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const PRODUCTION_SUPABASE_PROJECT_REF = "ymqhhtxaywtqllynrmxe";
const PRODUCTION_SUPABASE_URL = "https://ymqhhtxaywtqllynrmxe.supabase.co";
const PRODUCTION_TOURNAMENT_ID = "2026";`;
  const dataAuthorityStub = `
export const __transportCalls = [];
function recordDataAuthorityTransport(...args) { __transportCalls.push(args); }`;
  const transformed = transportSource
    .replace('import "server-only";\n', "")
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-cutover-activation-contract\.js";/,
      activationStub,
    )
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-maintenance-precommit-deployment-rebind\.js";/,
      teamStub,
    )
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-foundation-resource-contract\.js";/,
      resourceStub,
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      dataAuthorityStub,
    );
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

function transportEnvironment() {
  return {
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    VERCEL_DEPLOYMENT_ID: "dpl_director_private_059",
    PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH:
      "11111111-1111-4111-8111-111111111111",
    PRODUCTION_SUPABASE_SECRET_KEY:
      "sb_secret_director_private_test_not_a_real_key",
  };
}

function overview(privateOperations) {
  return buildProductionDirectorOverview({
    view: {
      tournament: {
        tournament_id: "2026",
        tournament_year: 2026,
        name: "Sandbagger Invitational",
      },
      players: Array.from({ length: 24 }, (_, index) => ({
        player_id: `P${String(index + 1).padStart(2, "0")}`,
        participation_status: "ACTIVE",
      })),
      matches: [],
    },
    live: {
      tournament: {
        id: "2026",
        year: 2026,
        name: "Sandbagger Invitational",
        status: "UPCOMING",
      },
      rounds: [],
    },
    readState: {
      scoring_authority: "SUPABASE",
      current_tournament_read_authority: "SUPABASE",
      participant_identity_authority: "SUPABASE",
      scoring_ingress_enabled: true,
      workers_enabled: true,
    },
    privateOperations,
  });
}

const privateFixture = {
  contract_version: "production-director-private-operations-v1",
  tournament_id: "2026",
  calcutta: {
    state: "AUCTION_COMPLETE",
    publication_state: "UNPUBLISHED",
    currency_code: "USD",
    configuration_revision: 2,
    auction_revision: 3,
    publication_revision: 4,
    result_revision: 5,
    configuration: {
      revision: 2,
      configured_at: "2026-08-29T12:00:00Z",
      validation_status: "VALIDATED",
      currency_code: "USD",
      point_structure: [{
        place: 1,
        round_1_award: 5,
        round_2_award: 4,
        round_3_award: 3,
      }],
      payout_structure: [{
        place: 1,
        round_1_fraction: "0.125",
        round_2_fraction: "0.125",
        round_3_fraction: "0.25",
        overall_fraction: "0.5",
      }],
      rules: {
        auction_unit: "PLAYER",
        auction_workflow: "MANUAL_FINAL_AUCTION_FACTS",
        pot_rule: "SUM_PURCHASE_PRICES",
        tie_rule: "COMPETITION_RANK_WITH_OCCUPIED_PLACE_AWARD_AVERAGING",
        payout_rounding: "NONE",
        scramble_asset: "PLAYER_PURCHASE_WITH_PAIRING_PERFORMANCE_SPLIT_EQUALLY",
        completion_rule: "ALL_PURCHASED_PLAYERS_HAVE_OFFICIAL_COMPLETED_ROUND_RESULT",
        settlement_tracking: "NOT_MODELED",
      },
    },
    auction: {
      revision: 3,
      recorded_at: "2026-08-29T12:05:00Z",
      currency_code: "USD",
      pot: "1000.005",
      purchase_count: 1,
      owner_count: 1,
      ownership_row_count: 1,
      reconciliation_status: "RECONCILED",
      pot_reconciled: true,
      ownership_complete: true,
      active_players_complete: true,
      purchases: [{
        player: { player_id: "P01", display_name: "Purchased Player" },
        purchase_price: "1000.005",
        owners: [{
          player: { player_id: "P02", display_name: "Owning Player" },
          ownership_fraction: "1.0",
        }],
      }],
    },
    publication: { revision: 4, state: "UNPUBLISHED", published_at: null },
    result: {
      revision: 5,
      state: "PROVISIONAL",
      completed_rounds: [1],
      calculated_at: "2026-08-29T12:10:00Z",
      freshness: "CURRENT",
      recalculation_required: false,
      validation_status: "VALIDATED",
    },
    jobs: [{
      domain: "CALCUTTA",
      status: "FAILED",
      configuration_revision: 2,
      auction_revision: 3,
      result_revision: null,
      requested_at: "2026-08-29T12:09:00Z",
      updated_at: "2026-08-29T12:10:00Z",
      failure_description: "Calcutta recalculation did not complete.",
      retry_eligible: false,
    }],
  },
  net_skins: {
    state: "NOT_CONFIGURED",
    configuration_revision: 1,
    result_revision: null,
    readiness: {
      state: "NEEDS_SETUP",
      can_configure: false,
      total_matches: 24,
      ready_matches: 0,
      issues: [{
        code: "MATCH_PARTICIPANTS",
        label: "Complete pairings",
        affected_matches: 24,
        missing_count: 71,
        summary: "24 matches still need complete pairings (71 participant assignments missing).",
        by_round: [{ round: 1, affected_matches: 8, missing_count: 31 }],
      }],
    },
    jobs: [],
  },
  audit_timeline: [{
    sequence: 1,
    category: "SIDE_GAME",
    action: "REPLACE_CALCUTTA_AUCTION",
    title: "Calcutta Auction Revision 3 recorded",
    summary: "The bounded Production operation completed.",
    status: "SUCCESS",
    actor: { display_name: "Tournament Director" },
    context: {
      tournament_id: "2026",
      round_number: null,
      display_match_number: null,
    },
    occurred_at: "2026-08-29T12:05:00Z",
  }],
};

test("Director-private model exposes unpublished Calcutta review without rounding money", () => {
  const data = overview(privateFixture);
  assert.equal(data.privateOperations.available, true);
  assert.equal(data.privateOperations.calcutta.publicationState, "UNPUBLISHED");
  assert.equal(data.privateOperations.calcutta.auction.pot, "1000.005");
  assert.equal(
    data.privateOperations.calcutta.auction.purchases[0].purchasePrice,
    "1000.005",
  );
  assert.equal(
    data.privateOperations.calcutta.configuration.payoutStructure[0].round1Fraction,
    "0.125",
  );
  assert.equal(data.privateOperations.calcutta.auction.ownershipComplete, true);
  assert.equal(data.privateOperations.calcutta.jobs[0].retryEligible, false);
  assert.equal(data.privateOperations.auditTimeline[0].actorName, "Tournament Director");
});

test("Net Skins readiness is actionable and never fabricates missing setup", () => {
  const data = overview(privateFixture);
  const readiness = data.privateOperations.netSkins.readiness;
  assert.equal(readiness.canConfigure, false);
  assert.equal(readiness.totalMatches, 24);
  assert.equal(readiness.readyMatches, 0);
  assert.deepEqual(readiness.issues[0], {
    code: "MATCH_PARTICIPANTS",
    label: "Complete pairings",
    affectedMatches: 24,
    missingCount: 71,
    summary: "24 matches still need complete pairings (71 participant assignments missing).",
    byRound: [{ round: 1, affectedMatches: 8, missingCount: 31 }],
  });
});

test("NOT_CONFIGURED Calcutta remains an explicit empty Director state", () => {
  const value = structuredClone(privateFixture);
  value.calcutta = {
    state: "NOT_CONFIGURED",
    publication_state: "UNPUBLISHED",
    currency_code: "USD",
    configuration_revision: 1,
    auction_revision: 0,
    publication_revision: 0,
    result_revision: null,
    configuration: null,
    auction: null,
    publication: { revision: 0, state: "UNPUBLISHED", published_at: null },
    result: null,
    jobs: [],
  };
  const data = overview(value);
  assert.equal(data.privateOperations.calcutta.state, "NOT_CONFIGURED");
  assert.equal(data.privateOperations.calcutta.configuration, null);
  assert.equal(data.privateOperations.calcutta.auction, null);
});

test("private read receives the verified actor and remains isolated from core overview availability", async () => {
  const observed = [];
  const dependencies = {
    readTournamentLiveView: async () => ({
      tournament: { tournament_id: "2026", tournament_year: 2026 },
      players: [],
      matches: [],
    }),
    tournamentLiveDataFromSupabaseView: () => ({
      tournament: { id: "2026", year: 2026, status: "UPCOMING" },
      rounds: [],
    }),
    inspectReadState: async () => ({
      scoring_authority: "SUPABASE",
      current_tournament_read_authority: "SUPABASE",
      participant_identity_authority: "SUPABASE",
      scoring_ingress_enabled: true,
      workers_enabled: true,
    }),
    inspectEnrollment: async () => null,
    inspectWorkers: async () => null,
    readOdds: async () => null,
    readNetSkins: async () => null,
    readCalcutta: async () => null,
    readPrivateOperations: async (input) => {
      observed.push(input);
      throw Object.assign(new Error("private unavailable"), {
        code: "PRODUCTION_DIRECTOR_PRIVATE_READ_FAILED",
      });
    },
  };
  const env = { VERCEL_ENV: "production" };
  const data = await readProductionDirectorOverview({
    env,
    actorAuthUserId: "22222222-2222-4222-8222-222222222222",
    actorPlayerId: "CB01",
    dependencies,
  });
  assert.equal(data.tournament.id, "2026");
  assert.equal(data.privateOperations.available, false);
  assert.deepEqual(observed, [{
    actorAuthUserId: "22222222-2222-4222-8222-222222222222",
    actorPlayerId: "CB01",
    env,
  }]);
});

test("participant Calcutta contract still rejects unpublished market and result facts", () => {
  const base = {
    contract_version: "production-calcutta-v1",
    tournament_id: "2026",
    state: "AUCTION_COMPLETE",
    publication_state: "UNPUBLISHED",
    published: false,
    currency_code: "USD",
    configuration_revision: 2,
    auction_revision: 3,
    publication_revision: 4,
    result_revision: null,
    configuration_fingerprint: "a".repeat(64),
    auction_fingerprint: "b".repeat(64),
    revision: "calcutta-v1:2:3:4:0:AUCTION_COMPLETE:UNPUBLISHED",
    freshness: { state: "CURRENT", stale: false },
  };
  assert.throws(
    () => productionCalcuttaV1ContractData({
      ...base,
      market: { purchases: [] },
    }),
    (error) => error?.code === "CALCUTTA_V1_UNPUBLISHED_FACTS_FORBIDDEN",
  );
  const safe = productionCalcuttaV1ContractData({
    ...base,
    market: null,
    result: null,
  });
  assert.equal(safe.market, null);
  assert.equal(safe.result, null);
});

test("additive RPC is fixed-resource, Director-bound, read-only, and service-only", async () => {
  const [migration, transport, route] = await Promise.all([
    source("supabase/production_migrations/202608300059_production_director_private_operations_v1.sql"),
    source("lib/production-director-private-operations.js"),
    source("app/api/director/production-overview/route.js"),
  ]);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /notify pgrst, 'reload schema';\s*commit;\s*$/);
  assert.match(migration, /create or replace function public\.read_production_director_operations_v1/);
  assert.match(migration, /assert_production_service_role\(\)/);
  assert.match(migration, /assert_production_cutover_read_scope\(\s*input, 'OBSERVATION'/);
  assert.match(migration, /assert_production_scoring_actor\(input, true\)/);
  assert.doesNotMatch(migration, /assert_production_scoring_runtime\(input, null\)/);
  assert.match(migration, /'production-director-private-operations-v1'/);
  assert.match(migration, /'ymqhhtxaywtqllynrmxe'/);
  assert.match(migration, /'1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'/);
  assert.match(migration, /limit 8/);
  assert.match(migration, /limit 60/);
  assert.match(migration, /interval '90 days'/);
  assert.match(migration, /'retry_eligible', false/);
  assert.match(migration, /revoke all on function public\.read_production_director_operations_v1\(jsonb\)[\s\S]*grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /\b(?:insert into|update|delete from)\b/i);
  assert.match(transport, /^import "server-only";/);
  assert.equal((transport.match(/read_production_director_operations_v1/g) || []).length, 1);
  assert.match(transport, /PRODUCTION_SUPABASE_SECRET_KEY/);
  assert.match(transport, /FORBIDDEN_RESPONSE_KEY/);
  assert.doesNotMatch(transport, /google-sheets|preview.*supabase/i);
  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /authorization\.source !== "production-director-entitlement"/);
});

test("server transport binds the exact Director actor and keeps the service key out of the request body", async () => {
  const module = await importPrivateTransport();
  const env = transportEnvironment();
  let request = null;
  const data = await module.readProductionDirectorPrivateOperations({
    actorAuthUserId: "22222222-2222-4222-8222-222222222222",
    actorPlayerId: "CB01",
    env,
    dependencies: {
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              contract_version: "production-director-private-operations-v1",
              tournament_id: "2026",
              calcutta: {},
              net_skins: {},
              audit_timeline: [],
            },
          }),
        };
      },
    },
  });
  assert.equal(data.tournament_id, "2026");
  assert.equal(
    request.url,
    "https://ymqhhtxaywtqllynrmxe.supabase.co/rest/v1/rpc/read_production_director_operations_v1",
  );
  const body = JSON.parse(request.options.body).input;
  assert.deepEqual(body.authorization, {
    tournament_id: "2026",
    auth_user_id: "22222222-2222-4222-8222-222222222222",
    player_id: "CB01",
    role: "DIRECTOR",
  });
  assert.equal(body.project_ref, "ymqhhtxaywtqllynrmxe");
  assert.equal(body.source_workbook_id, "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4");
  assert.equal(body.expected_epoch_id, env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH);
  assert.equal(body.cutover_phase, "OBSERVATION");
  assert.doesNotMatch(request.options.body, /sb_secret_/);
  assert.equal(request.options.headers.apikey, env.PRODUCTION_SUPABASE_SECRET_KEY);
  assert.deepEqual(module.__transportCalls, [["supabase", {
    adapter: "production-director-private-operations-v1",
    source: "read_production_director_operations_v1",
  }]]);
});

test("server transport fails closed before or after transport on unsafe bindings", async () => {
  const module = await importPrivateTransport();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          contract_version: "production-director-private-operations-v1",
          tournament_id: "2026",
          calcutta: {},
          net_skins: {},
          audit_timeline: [],
        },
      }),
    };
  };
  const base = {
    actorAuthUserId: "22222222-2222-4222-8222-222222222222",
    actorPlayerId: "CB01",
    env: transportEnvironment(),
    dependencies: { fetchImpl },
  };
  await assert.rejects(
    () => module.readProductionDirectorPrivateOperations({
      ...base,
      actorAuthUserId: "not-a-uuid",
    }),
    (error) => error?.code === "PRODUCTION_DIRECTOR_PRIVATE_AUTHORIZATION_REQUIRED",
  );
  await assert.rejects(
    () => module.readProductionDirectorPrivateOperations({
      ...base,
      env: { ...base.env, PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: "" },
    }),
    (error) => error?.code === "PRODUCTION_DIRECTOR_PRIVATE_AUTHORITY_EPOCH_REQUIRED",
  );
  await assert.rejects(
    () => module.readProductionDirectorPrivateOperations({
      ...base,
      env: { ...base.env, PRODUCTION_SUPABASE_SECRET_KEY: "" },
    }),
    (error) => error?.code === "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
  );
  assert.equal(calls, 0);

  await assert.rejects(
    () => module.readProductionDirectorPrivateOperations({
      ...base,
      dependencies: {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              contract_version: "production-director-private-operations-v1",
              tournament_id: "2026",
              audit_timeline: [{ actor: { email: "forbidden@example.test" } }],
            },
          }),
        }),
      },
    }),
    (error) => error?.code === "PRODUCTION_DIRECTOR_PRIVATE_RESPONSE_UNSAFE",
  );
});

test("Console renders private review, bounded status-only jobs, and sanitized audit filters", async () => {
  const ui = await source("app/admin/director/ProductionDirectorOperations.js");
  assert.match(ui, /Director-private Calcutta review/);
  assert.match(ui, /Rules & payout allocation/);
  assert.match(ui, /Calcutta point awards/);
  assert.match(ui, /Auction & ownership/);
  assert.match(ui, /privateStateAligned/);
  assert.match(ui, /Calcutta changed while this page was loading/);
  assert.match(ui, /Canonical input readiness/);
  assert.match(ui, /Complete Canonical Setup First/);
  assert.match(ui, /function PrivateJobList/);
  const privateJobStart = ui.indexOf("function PrivateJobList");
  const privateJobEnd = ui.indexOf("function decimalMoney", privateJobStart);
  assert.ok(privateJobStart >= 0 && privateJobEnd > privateJobStart);
  assert.doesNotMatch(ui.slice(privateJobStart, privateJobEnd), /Retry|onClick|jsonRequest/);
  assert.doesNotMatch(ui, /job\.last_error|job\.claim|job\.lease|job\.payload|job\.fingerprint/);
  assert.match(ui, /AUDIT_FILTERS/);
  assert.match(ui, /Raw audit payloads, internal identifiers, and infrastructure evidence are never returned/);
  assert.match(ui, /Recent safe match activity remains visible below/);
});
