import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { productionCutoverReadRpcTranslation } from "../lib/production-cutover-read-transport.js";
import { productionShadowCandidateRpcTranslation } from "../lib/production-shadow-read-adapters.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function importRuntime() {
  const moduleSource = await source("lib/production-current-tournament-runtime.js");
  const transformed = moduleSource
    .replace('import "server-only";\n', "")
    .replace(
      /import \{ assertProductionCutoverActivation \} from "\.\/production-cutover-activation-contract\.js";/,
      'function assertProductionCutoverActivation() { return { readCutoverPhase: "OBSERVATION" }; }',
    )
    .replace(
      /import \{\s*PRODUCTION_GOOGLE_WORKBOOK_ID,\s*PRODUCTION_SUPABASE_PROJECT_REF,\s*PRODUCTION_SUPABASE_URL,?\s*\} from "\.\/production-foundation-resource-contract\.js";/,
      `const PRODUCTION_GOOGLE_WORKBOOK_ID = "production-workbook";
const PRODUCTION_SUPABASE_PROJECT_REF = "ymqhhtxaywtqllynrmxe";
const PRODUCTION_SUPABASE_URL = "https://ymqhhtxaywtqllynrmxe.supabase.co";`,
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      "function recordDataAuthorityTransport() {}",
    );
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

const generation = "11111111-1111-4111-8111-111111111111";

test("current runtime accepts frozen 2026 compatibility and strict active annual generations", async () => {
  const { normalizeProductionCurrentTournamentRuntime } = await importRuntime();
  const frozen = normalizeProductionCurrentTournamentRuntime({
    ok: true,
    contractVersion: "production-current-tournament-runtime-v1",
    tournamentId: "2026",
    tournamentYear: 2026,
    lifecycle: "ACTIVE",
    pointerRevision: 1,
    lifecycleRevision: 1,
    runtimeGenerationId: null,
    runtimeRevision: 0,
    authorityGenerationId: null,
    admissionGenerationId: null,
    status: "FROZEN_2026_RUNTIME",
  });
  assert.equal(frozen.tournamentId, "2026");
  assert.equal(frozen.runtimeGenerationId, "");

  const annual = normalizeProductionCurrentTournamentRuntime({
    ok: true,
    contractVersion: "production-current-tournament-runtime-v1",
    tournamentId: "2027",
    tournamentYear: 2027,
    lifecycle: "ACTIVE",
    pointerRevision: 2,
    lifecycleRevision: 4,
    runtimeGenerationId: generation,
    runtimeRevision: 1,
    authorityGenerationId: "22222222-2222-4222-8222-222222222222",
    admissionGenerationId: "33333333-3333-4333-8333-333333333333",
    status: "ACTIVE",
  }, { expectedPointerRevision: 2 });
  assert.equal(annual.tournamentId, "2027");
  assert.equal(annual.pointerRevision, 2);

  assert.throws(() => normalizeProductionCurrentTournamentRuntime({
    ...annual,
    lifecycle: "READY_FOR_ACTIVATION",
  }), (error) => error.code === "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_INVALID");
  assert.throws(() => normalizeProductionCurrentTournamentRuntime({
    ...annual,
    runtimeGenerationId: null,
  }), (error) => error.code === "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_INVALID");
  assert.throws(() => normalizeProductionCurrentTournamentRuntime(annual, {
    expectedPointerRevision: 1,
  }), (error) => error.code === "PRODUCTION_CURRENT_TOURNAMENT_POINTER_STALE");
});

test("server current-runtime reader sends only immutable Production scope", async () => {
  const { readProductionCurrentTournamentRuntime } = await importRuntime();
  let captured;
  const value = await readProductionCurrentTournamentRuntime({}, {
    env: { VERCEL_ENV: "production" },
    getActivation: () => ({ readCutoverPhase: "OBSERVATION" }),
    rpc: async (input) => {
      captured = input;
      return { payload: {
        ok: true,
        contractVersion: "production-current-tournament-runtime-v1",
        tournamentId: "2026",
        tournamentYear: 2026,
        lifecycle: "ACTIVE",
        pointerRevision: 1,
        lifecycleRevision: 1,
        status: "FROZEN_2026_RUNTIME",
      } };
    },
  });
  assert.equal(value.tournamentId, "2026");
  assert.deepEqual(captured, {
    contract_version: "production-current-tournament-runtime-v1",
    environment: "PRODUCTION",
    project_ref: "ymqhhtxaywtqllynrmxe",
    project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
    source_workbook_id: "production-workbook",
  });
  assert.equal(Object.hasOwn(captured, "tournament_id"), false);
  assert.equal(Object.hasOwn(captured, "authorization"), false);
});

test("current cutover translation preserves frozen provenance and forwards only the pointer target", () => {
  const future = productionShadowCandidateRpcTranslation("read_tournament_live_view", {
    target_tournament_id: "2027",
  });
  assert.equal(future.functionName, "read_production_future_current_view_v1");
  assert.equal(future.body.input.tournament_id, "2026");
  assert.equal(future.body.input.target_tournament_id, "2027");
  assert.equal(future.body.input.surface, "TOURNAMENT_LIVE");

  const current = productionShadowCandidateRpcTranslation("read_tournament_live_view", {
    target_tournament_id: "2026",
  });
  assert.equal(current.functionName, "read_production_candidate_current_view");
  assert.equal(current.body.input.tournament_id, "2026");
  assert.equal(current.body.input.target_tournament_id, "2026");

  const history = productionShadowCandidateRpcTranslation("read_preview_2026_historical_view", {
    target_tournament_id: "2027",
  });
  assert.equal(history.body.input.surface, "HISTORY_2026");
  assert.equal(history.functionName, "read_production_candidate_current_view");
  assert.equal(history.body.input.tournament_id, "2026");
  assert.equal(Object.hasOwn(history.body.input, "target_tournament_id"), false);
});

test("active Production keeps the frozen 2026 RPC and selects the isolated future runtime RPC", () => {
  const env = {
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    PRODUCTION_CUTOVER_PHASE: "OBSERVATION",
  };
  const frozen = productionCutoverReadRpcTranslation("read_tournament_live_view", {
    target_tournament_id: "2026",
  }, env);
  assert.equal(frozen.functionName, "read_production_cutover_current_view");
  assert.equal(frozen.body.input.tournament_id, "2026");
  assert.equal(frozen.body.input.target_tournament_id, "2026");

  const annual = productionCutoverReadRpcTranslation("read_tournament_live_view", {
    target_tournament_id: "2027",
  }, env);
  assert.equal(annual.functionName, "read_production_future_current_view_v1");
  assert.equal(annual.body.input.tournament_id, "2026");
  assert.equal(annual.body.input.target_tournament_id, "2027");
  assert.equal(annual.body.input.surface, "TOURNAMENT_LIVE");

  const guide = productionCutoverReadRpcTranslation("read_current_guide_projection", {
    target_tournament_id: "2027",
  }, env);
  assert.equal(guide.functionName, "read_production_future_current_view_v1");
  assert.equal(guide.body.input.surface, "GUIDE_PROJECTION");
  assert.equal(guide.adapter, "GUIDE_PROJECTION");
});

test("current public and participant server paths resolve pointer context without changing DTOs", async () => {
  const [home, foundation, live, participant, mobile, gameCenter, guide, draft, odds] = await Promise.all([
    source("app/page.js"),
    source("app/api/tournament/foundation/route.js"),
    source("app/api/tournament/live/route.js"),
    source("lib/participant-identity-resolver.js"),
    source("lib/mobile-bearer-identity.js"),
    source("app/game-center/gameCenterData.js"),
    source("app/tournament-guide/resolveGuideContent.js"),
    source("lib/draft-runtime.js"),
    source("app/odds-center/page.js"),
  ]);
  for (const text of [home, foundation, live, gameCenter, guide, draft, odds]) {
    assert.match(text, /readProductionCurrentTournamentRuntime/);
  }
  assert.match(participant, /PRODUCTION_CURRENT_TOURNAMENT_IDENTITY_NOT_POINTER_AWARE/);
  assert.match(mobile, /readCurrentTournamentRuntime/);
  assert.doesNotMatch(home, /loadHistory2026View\(\{[^}]*tournamentId/);
  assert.match(draft, /tournamentId/);
  assert.match(odds, /tournamentId:runtime\?\.tournamentId/);
});
