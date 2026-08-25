import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PREDICTION_SETTING_SPECS,
  PREDICTION_SETTINGS_SOURCE_TAB,
} from "../lib/prediction-settings-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const actorAuthUserId = "11111111-1111-4111-8111-111111111111";
const actorPlayerId = "CB01";
const commitSha = "b".repeat(40);
const activeEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: commitSha,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "ODDS_WAR_ROOM",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commitSha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SCORING_AUTHORITY: "supabase",
});

function settingsRows(overrides = {}) {
  return PREDICTION_SETTING_SPECS.map((entry) => ({
    Setting: entry.canonicalKey,
    Value: Object.hasOwn(overrides, entry.canonicalKey)
      ? String(overrides[entry.canonicalKey])
      : entry.type === "boolean"
        ? (entry.defaultValue ? "TRUE" : "FALSE")
        : String(entry.defaultValue),
    Description: entry.category,
  }));
}

function predictionSheets(overrides = {}) {
  return {
    [PREDICTION_SETTINGS_SOURCE_TAB]: {
      headers: ["Setting", "Value", "Description"],
      records: settingsRows(overrides).map((record) => ({ record })),
    },
  };
}

const serverModule = new URL("../lib/production-director-projection-synchronization.js", import.meta.url).href;

function runServerModule(body) {
  const prelude = `
    import {
      buildProductionDirectorProjectionEnvelope,
      inspectProductionDirectorProjectionSynchronization,
      productionDirectorProjectionFreshness,
      synchronizeProductionDirectorProjection,
    } from ${JSON.stringify(serverModule)};
    const activeEnv = ${JSON.stringify(activeEnv)};
    const actorAuthUserId = ${JSON.stringify(actorAuthUserId)};
    const actorPlayerId = ${JSON.stringify(actorPlayerId)};
    const googleDependencies = (sheets, productionRpc) => ({
      productionRpc,
      withProductionGoogleCredentials: async (_input, run) => run(),
      withWorkbookWriteDiagnostics: async (_label, run) => ({
        result: await run(),
        diagnostics: { sheetsApiCalls: 1, httpRequests: 1, workbookWrites: 0 },
      }),
      readWorkbookSheetsByName: async () => sheets,
    });
  `;
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--input-type=module",
    "--eval",
    `${prelude}\n${body}`,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test("Production Director projection freshness is explicit and never implies fallback", () => {
  const result = runServerModule(`
    const unavailable = productionDirectorProjectionFreshness({ stored: null, source: {} });
    const current = productionDirectorProjectionFreshness({
      stored: { source_fingerprint: "a".repeat(64) },
      source: { source_fingerprint: "a".repeat(64) },
    });
    const stale = productionDirectorProjectionFreshness({
      stored: { source_fingerprint: "a".repeat(64) },
      source: { source_fingerprint: "b".repeat(64) },
    });
    console.log(JSON.stringify({ unavailable, current, stale }));
  `);
  assert.deepEqual(result.unavailable, { status: "UNAVAILABLE", reason: "NO_CERTIFIED_PROJECTION" });
  assert.deepEqual(result.current, { status: "CURRENT", reason: "SOURCE_FINGERPRINT_MATCH" });
  assert.equal(result.stale.status, "STALE");
  assert.equal(result.stale.reason, "NEWER_OR_DIFFERENT_GOOGLE_SOURCE");
});

test("inspection fails closed while Production cutover activation is disabled", () => {
  const result = runServerModule(`
    let databaseReached = false;
    let code = "";
    try {
      await inspectProductionDirectorProjectionSynchronization({
        domain: "PREDICTION_SETTINGS", actorAuthUserId, actorPlayerId,
        env: { ...activeEnv, PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "false" },
        dependencies: googleDependencies({}, async () => { databaseReached = true; }),
      });
    } catch (error) { code = error?.code || ""; }
    console.log(JSON.stringify({ code, databaseReached }));
  `);
  assert.equal(result.code, "PRODUCTION_CUTOVER_RESOURCE_MISMATCH");
  assert.equal(result.databaseReached, false);
});

test("unchanged source is a no-op; changed source creates a revision with exact readback", () => {
  const initialSheets = predictionSheets();
  const changedSheets = predictionSheets({ "Handicap Category Weight": 0.123456 });
  const result = runServerModule(`
    const initialSheets = ${JSON.stringify(initialSheets)};
    const changedSheets = ${JSON.stringify(changedSheets)};
    const oldEnvelope = buildProductionDirectorProjectionEnvelope({
      domain: "PREDICTION_SETTINGS", sheets: initialSheets, actorPlayerId,
    });
    const newEnvelope = buildProductionDirectorProjectionEnvelope({
      domain: "PREDICTION_SETTINGS", sheets: changedSheets, actorPlayerId,
    });
    const noOpCalls = [];
    const noOpRpc = async (functionName, input) => {
      noOpCalls.push({ functionName, input });
      if (functionName === "read_production_director_sync_context") return {
        ok: true, domain: "PREDICTION_SETTINGS", activation_revision: 12,
        current_projection: {
          revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision_number: 1,
          source_fingerprint: oldEnvelope.source_fingerprint,
          payload_fingerprint: oldEnvelope.payload_fingerprint,
        }, canonical_context: {},
      };
      if (functionName === "synchronize_production_director_projection") return {
        ok: true, changed: false, duplicate: true,
        revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision_number: 1,
      };
      if (functionName === "read_production_prediction_settings") return {
        ok: true, data: {
          revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision_number: 1,
          source_fingerprint: oldEnvelope.source_fingerprint,
          payload_fingerprint: oldEnvelope.payload_fingerprint,
        },
      };
      throw new Error("unexpected RPC " + functionName);
    };
    const noOp = await synchronizeProductionDirectorProjection({
      domain: "PREDICTION_SETTINGS", actorAuthUserId, actorPlayerId, env: activeEnv,
      dependencies: googleDependencies(initialSheets, noOpRpc),
    });
    let changedInput;
    const changedRpc = async (functionName, input) => {
      if (functionName === "read_production_director_sync_context") return {
        ok: true, domain: "PREDICTION_SETTINGS", activation_revision: 19,
        current_projection: {
          revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision_number: 1,
          source_fingerprint: oldEnvelope.source_fingerprint,
          payload_fingerprint: oldEnvelope.payload_fingerprint,
        }, canonical_context: {},
      };
      if (functionName === "synchronize_production_director_projection") {
        changedInput = input;
        return { ok: true, changed: true, duplicate: false,
          revision_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", revision_number: 2 };
      }
      if (functionName === "read_production_prediction_settings") return {
        ok: true, data: {
          revision_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", revision_number: 2,
          source_fingerprint: newEnvelope.source_fingerprint,
          payload_fingerprint: newEnvelope.payload_fingerprint,
        },
      };
      throw new Error("unexpected RPC " + functionName);
    };
    const inspected = await inspectProductionDirectorProjectionSynchronization({
      domain: "PREDICTION_SETTINGS", actorAuthUserId, actorPlayerId, env: activeEnv,
      dependencies: googleDependencies(changedSheets, changedRpc),
    });
    const changed = await synchronizeProductionDirectorProjection({
      domain: "PREDICTION_SETTINGS", actorAuthUserId, actorPlayerId, env: activeEnv,
      dependencies: googleDependencies(changedSheets, changedRpc),
    });
    console.log(JSON.stringify({
      noOp, changed, inspectedFreshness: inspected.freshness,
      noOpFunctions: noOpCalls.map((entry) => entry.functionName),
      noOpMutation: noOpCalls[1].input,
      changedInput,
      sourceChanged: oldEnvelope.source_fingerprint !== newEnvelope.source_fingerprint,
    }));
  `);
  assert.equal(result.noOp.changed, false);
  assert.equal(result.noOp.duplicate, true);
  assert.equal(result.noOp.readbackParity, true);
  assert.equal(result.noOp.fallbackUsed, false);
  assert.equal(result.noOp.googleWrite, false);
  assert.deepEqual(result.noOpFunctions, [
    "read_production_director_sync_context",
    "synchronize_production_director_projection",
    "read_production_prediction_settings",
  ]);
  assert.equal(result.noOpMutation.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(result.noOpMutation.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(result.noOpMutation.deployment_commit, commitSha);
  assert.equal(result.noOpMutation.expected_activation_revision, 12);
  assert.equal(result.noOpMutation.operation_authority, "GOOGLE_DIRECTOR_SYNC");
  assert.equal(result.noOpMutation.actor_auth_user_id, actorAuthUserId);
  assert.equal(result.noOpMutation.actor_player_id, actorPlayerId);
  assert.equal(result.inspectedFreshness.status, "STALE");
  assert.equal(result.sourceChanged, true);
  assert.equal(result.changed.changed, true);
  assert.equal(result.changed.duplicate, false);
  assert.equal(result.changed.revisionNumber, 2);
  assert.equal(result.changed.readbackParity, true);
  assert.equal(result.changedInput.source_fingerprint, result.changed.sourceFingerprint);
});

test("migration and POST route expose only the retained post-cutover authoring domains", async () => {
  const [migration, route, server] = await Promise.all([
    readFile(new URL("../supabase/production_migrations/202608240025_production_director_projection_synchronization.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/production-director-synchronization/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-director-projection-synchronization.js", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /assert_active_production_director_sync_actor/);
  assert.match(migration, /expected_activation_revision/);
  assert.match(migration, /input \|\| jsonb_build_object\(\s*'expected_activation_revision', activation\.activation_revision/);
  assert.match(migration, /director_entitlements/);
  assert.match(migration, /user_player_links/);
  assert.match(migration, /tournament_roles/);
  assert.match(migration, /email_confirmed_at is not null/);
  assert.match(migration, /grant execute on function public\.synchronize_production_director_projection\(jsonb\)\s+to service_role/i);
  assert.match(migration, /revoke all on function public\.synchronize_production_director_projection\(jsonb\)\s+from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(migration, /import_production_(?:net_skins|calcutta|published_odds)/i);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(route, /requireOrigin:\s*true/);
  assert.match(route, /allowBootstrap:\s*false/);
  assert.match(server, /withProductionGoogleServiceAccountCredentials/);
  assert.match(server, /sheetsReader\(\[\.\.\.spec\.sourceTabs\], \{ fresh: true \}\)/);
  assert.match(server, /PRODUCTION_DIRECTOR_SYNC_GOOGLE_WRITE_DETECTED/);
  assert.match(server, /fallbackUsed:\s*false/);
});
