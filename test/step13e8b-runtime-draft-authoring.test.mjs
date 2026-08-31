import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeProductionDraftAuthoring,
  PRODUCTION_DRAFT_CONFIGURATION_FIELDS,
  PRODUCTION_DRAFT_PICK_FIELDS,
  PRODUCTION_DRAFT_STATUS_MODES,
} from "../lib/production-draft-authoring-contract.js";
import {
  adaptProductionShadowCandidatePayload,
  productionShadowCandidateRpcTranslation,
} from "../lib/production-shadow-read-adapters.js";
import {
  assertDirectorMutationAuthority,
  directorMutationAuthorityDiagnostics,
} from "../lib/director-mutation-authority.js";

const configuration = () => ({
  year: 2027,
  name: "2027 Sandbagger Draft",
  date: "7/12/2027",
  time: "7:00 PM",
  time_zone: "CST",
  location: "Online",
  status_mode: "Complete",
  format: "Snake",
  total_picks: 4,
  team_1_id: "PICKLES",
  team_2_id: "LIPPIT",
  team_1_captain_player_id: "CP01",
  team_2_captain_player_id: "JP01",
  first_pick_team_id: "PICKLES",
  notes: "",
});

const picks = () => [
  { pick_number: 1, team_id: "PICKLES", player_id: "P1", selected_at: "", selected_by: "", notes: "" },
  { pick_number: 2, team_id: "LIPPIT", player_id: "P2", selected_at: "", selected_by: "", notes: "" },
  // Explicit selecting-team overrides remain authoritative; JS does not
  // invent or enforce a replacement order algorithm.
  { pick_number: 3, team_id: "PICKLES", player_id: "P3", selected_at: "", selected_by: "", notes: "Trade" },
  { pick_number: 4, team_id: "LIPPIT", player_id: "P4", selected_at: "", selected_by: "", notes: "" },
];

test("Draft authoring normalizes the exact bounded setup/board contract without changing lossless scheduling values", () => {
  assert.equal(PRODUCTION_DRAFT_CONFIGURATION_FIELDS.length, 15);
  assert.equal(PRODUCTION_DRAFT_PICK_FIELDS.length, 6);
  assert.deepEqual(PRODUCTION_DRAFT_STATUS_MODES,
    ["Automatic", "Unscheduled", "Scheduled", "Live", "Complete"]);
  const normalized = normalizeProductionDraftAuthoring({ configuration: configuration(), picks: picks() });
  assert.equal(normalized.configuration.date, "7/12/2027");
  assert.equal(normalized.configuration.time, "7:00 PM");
  assert.equal(normalized.configuration.time_zone, "CST");
  assert.equal(normalized.picks[2].team_id, "PICKLES");
  assert.match(normalized.configurationFingerprint, /^[0-9a-f]{64}$/);
  assert.match(normalized.picksFingerprint, /^[0-9a-f]{64}$/);
  assert.match(normalized.payloadFingerprint, /^[0-9a-f]{64}$/);
});

test("Draft authoring rejects conflicting identities and incomplete completed boards", () => {
  assert.throws(() => normalizeProductionDraftAuthoring({
    configuration: configuration(),
    picks: picks().map((pick) => pick.pick_number === 4 ? { ...pick, player_id: "P1" } : pick),
  }), (error) => error.code === "DRAFT_PLAYER_DUPLICATE");
  assert.throws(() => normalizeProductionDraftAuthoring({
    configuration: configuration(),
    picks: picks().map((pick) => pick.pick_number === 1 ? { ...pick, player_id: "CP01" } : pick),
  }), (error) => error.code === "DRAFT_CAPTAIN_PICK_PROHIBITED");
  assert.throws(() => normalizeProductionDraftAuthoring({
    configuration: configuration(),
    picks: picks().map((pick) => pick.pick_number === 4 ? { ...pick, player_id: "" } : pick),
  }), (error) => error.code === "DRAFT_COMPLETED_PICK_MISSING");
  assert.throws(() => normalizeProductionDraftAuthoring({
    configuration: { ...configuration(), status_mode: "Invented" }, picks: picks(),
  }), (error) => error.code === "DRAFT_STATUS_INVALID");
  assert.throws(() => normalizeProductionDraftAuthoring({
    configuration: { ...configuration(), date: "2/30/2027" }, picks: picks(),
  }), (error) => error.code === "DRAFT_DATE_INVALID");
  assert.throws(() => normalizeProductionDraftAuthoring({
    configuration: { ...configuration(), time: "25:61" }, picks: picks(),
  }), (error) => error.code === "DRAFT_TIME_INVALID");
  assert.throws(() => normalizeProductionDraftAuthoring({
    configuration: { ...configuration(), time_zone: "Not/A-Time-Zone" }, picks: picks(),
  }), (error) => error.code === "DRAFT_TIME_ZONE_INVALID");
});

test("server operations bind Production scope, canonical hashes, and only the stage/validate/commit/copy lifecycle", () => {
  const script = `
    import {
      stageProductionDraftRevision,
      validateProductionDraftRevision,
      commitProductionDraftRevision,
      copyProductionDraftSetup,
    } from "./lib/production-draft-authoring-server.js";
    const configuration = ${JSON.stringify(configuration())};
    const picks = ${JSON.stringify(picks())};
    const calls = [];
    const options = {
      env: {},
      getActivation: () => ({ phase: "OBSERVATION", resources: {} }),
      rpc: async (name, input) => {
        calls.push({ name, input });
        return { payload: { ok: true } };
      },
    };
    const actor = {
      actorAuthUserId: "10000000-0000-4000-8000-000000000001",
      actorPlayerId: "CB01", actorTournamentId: "2026",
    };
    await stageProductionDraftRevision({ ...actor,
      targetTournamentId: "2027", expectedRevision: 0,
      operationRequestId: "20000000-0000-4000-8000-000000000002",
      configuration, picks, reason: "Director reviewed future Draft" }, options);
    await validateProductionDraftRevision({ ...actor,
      targetTournamentId: "2027", expectedRevision: 0,
      operationRequestId: "30000000-0000-4000-8000-000000000003",
      draftId: "40000000-0000-4000-8000-000000000004" }, options);
    await commitProductionDraftRevision({ ...actor,
      targetTournamentId: "2027", expectedRevision: 0,
      operationRequestId: "50000000-0000-4000-8000-000000000005",
      draftId: "60000000-0000-4000-8000-000000000006",
      confirmation: "SAVE DRAFT REVISION" }, options);
    await copyProductionDraftSetup({ ...actor,
      targetTournamentId: "2027", sourceTournamentId: "2026", expectedRevision: 0,
      operationRequestId: "70000000-0000-4000-8000-000000000007",
      reason: "Copy prior Draft Setup for Director review" }, options);
    process.stdout.write(JSON.stringify(calls));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const calls = JSON.parse(child.stdout);
  assert.deepEqual(calls.map((call) => call.name), [
    "stage_production_draft_revision_v1",
    "validate_production_draft_revision_v1",
    "commit_production_draft_revision_v1",
    "copy_production_draft_setup_v1",
  ]);
  for (const { input } of calls) {
    assert.equal(input.environment, "PRODUCTION");
    assert.equal(input.tournament_id, "2026");
    assert.equal(input.authorization.player_id, "CB01");
    assert.match(input.request_payload_hash, /^[0-9a-f]{64}$/);
  }
  assert.equal(calls[0].input.target_tournament_id, "2027");
  assert.equal(calls[0].input.target_tournament_year, 2027);
  assert.equal(calls[3].input.source_tournament_id, "2026");
});

test("server read and commit DTOs expose consistent pick-count and target names", () => {
  const script = `
    import {
      readProductionDraftAuthoring,
      commitProductionDraftRevision,
    } from "./lib/production-draft-authoring-server.js";
    const common = {
      actorAuthUserId: "10000000-0000-4000-8000-000000000001",
      actorPlayerId: "CB01", actorTournamentId: "2026",
    };
    const options = {
      env: {},
      getActivation: () => ({ phase: "OBSERVATION", resources: {} }),
      rpc: async (name) => name === "read_production_draft_authoring_v1"
        ? { payload: { ok: true, data: {
          tournamentId: "2027", tournamentYear: 2027,
          currentTournamentId: "2027",
          targets: [{ tournamentId: "2027", current: true }, { tournamentId: "2028", current: false }],
          history: [{ revision: 2, selectedPickCount: 4 }],
        } } }
        : { payload: { ok: true, revision: 3, selectedPickCount: 4 } },
    };
    const read = await readProductionDraftAuthoring({
      ...common, actorTournamentId: "2027",
    }, options);
    const committed = await commitProductionDraftRevision({
      ...common, targetTournamentId: "2027", expectedRevision: 2,
      operationRequestId: "20000000-0000-4000-8000-000000000002",
      draftId: "30000000-0000-4000-8000-000000000003",
      confirmation: "SAVE DRAFT REVISION",
    }, options);
    process.stdout.write(JSON.stringify({ read, committed }));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.read.targetTournamentId, "2027");
  assert.equal(result.read.currentTournamentId, "2027");
  assert.equal(result.read.targets.length, 2);
  assert.equal(result.read.history[0].pickCount, 4);
  assert.equal(result.committed.pickCount, 4);
});

test("all Production Draft scopes use the canonical per-year read RPC and preserve row revisions", () => {
  for (const [scope, values] of [
    ["CURRENT", { target_tournament_id: "2026" }],
    ["YEAR", { target_year: 2025 }],
    ["YEARS", {}],
    ["PLAYER", { target_player_id: "P1" }],
  ]) {
    const translated = productionShadowCandidateRpcTranslation("read_preview_draft_view", {
      target_scope: scope,
      ...values,
    });
    assert.equal(translated.functionName, "read_production_draft_view_v1");
    assert.equal(translated.body.input.target_scope, scope);
  }
  const payload = adaptProductionShadowCandidatePayload({
    ok: true,
    data: {
      contract_version: "draft-projection-v1",
      validation_status: "VALID",
      drafts: [{
        tournament_year: 2026,
        revision_id: "year-revision",
        revision_number: 2,
        picks: [{ player_id: "P1" }],
      }],
    },
  }, { adapter: "DRAFT_PROJECTION", request: { scope: "CURRENT" } });
  assert.equal(payload.data.drafts[0].revision_id, "year-revision");
  assert.equal(payload.data.drafts[0].revision_number, 2);
});

test("CURRENT Draft dispatch follows the annual pointer while explicit history remains year addressed", () => {
  const script = `
    import { resolveProductionCurrentReadDispatch } from "./lib/production-current-read-dispatch.js";
    let reads = 0;
    const readRuntime = async () => { reads += 1; return {
      tournamentId: "2027", pointerRevision: 3,
      runtimeGenerationId: "runtime", authorityGenerationId: "authority",
      admissionGenerationId: "admission",
    }; };
    const current = await resolveProductionCurrentReadDispatch("read_preview_draft_view",
      { target_scope: "CURRENT" }, { readRuntime });
    const year = await resolveProductionCurrentReadDispatch("read_preview_draft_view",
      { target_scope: "YEAR", target_year: 2025 }, { readRuntime });
    process.stdout.write(JSON.stringify({ current, year, reads }));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.current.pointerAware, true);
  assert.equal(result.current.body.target_tournament_id, "2027");
  assert.equal(result.year.pointerAware, false);
  assert.equal(result.reads, 1);
});

test("Production Google Draft authoring is retired while Preview intent and Guide credentials remain", async () => {
  const [cms, syncRoute, syncService, credential, intent, inventory, api] = await Promise.all([
    readFile(new URL("../app/api/admin/cms/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/production-director-synchronization/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-director-projection-synchronization.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-service-account-credential-context.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-workbook-mutation-intent.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-google-writer-inventory.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/director/draft/route.js", import.meta.url), "utf8"),
  ]);
  for (const source of [cms, syncRoute, syncService]) {
    assert.match(source, /PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED/);
  }
  assert.doesNotMatch(credential, /^\s*DRAFT_SYNCHRONIZATION:\s*Object\.freeze/m);
  assert.match(credential, /^\s*GUIDE_SYNCHRONIZATION:\s*Object\.freeze/m);
  assert.match(intent, /\[GOOGLE_AUTHORING_OPERATIONS\.ADMIN_CMS_DRAFT\]:\s*sheetSet\(/,
    "the isolated Preview Draft editor retains its bounded workbook intent");
  assert.doesNotMatch(inventory, /^\s*DRAFT:\s*GOOGLE_AUTHORING_OPERATIONS/m);
  assert.match(inventory, /^\s*GUIDE:\s*GOOGLE_AUTHORING_OPERATIONS/m);
  assert.match(api, /new Set\(\["stage", "validate", "commit", "copy-previous"\]\)/);
  assert.doesNotMatch(api, /record-pick|reset-picks/);
});

test("Draft retirement diagnostics are domain-specific and do not retire Preview", () => {
  const productionDraft = directorMutationAuthorityDiagnostics({
    surface: "admin-cms",
    action: "draft-settings",
    authority: "supabase",
    env: { VERCEL_ENV: "production" },
  });
  assert.equal(productionDraft.allowed, false);
  assert.equal(productionDraft.code, "PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED");
  assert.throws(() => assertDirectorMutationAuthority({
    surface: "admin-cms",
    action: "draft-picks",
    authority: "supabase",
    env: { VERCEL_ENV: "production" },
  }), (error) => error.status === 410 &&
    error.message === "Production Draft authoring is managed in the Director Console.");

  const productionPrediction = directorMutationAuthorityDiagnostics({
    surface: "admin-cms",
    action: "prediction-settings",
    authority: "supabase",
    env: { VERCEL_ENV: "production" },
  });
  assert.equal(productionPrediction.code,
    "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED");

  const previewDraft = directorMutationAuthorityDiagnostics({
    surface: "admin-cms",
    action: "draft-settings",
    authority: "supabase",
    env: { VERCEL_ENV: "preview" },
  });
  assert.equal(previewDraft.allowed, true);
  assert.equal(previewDraft.productionGoogleAuthoringRetired, false);
});
