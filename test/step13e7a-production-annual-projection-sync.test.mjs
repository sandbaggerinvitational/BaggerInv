import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PREDICTION_SETTING_SPECS } from "../lib/prediction-settings-contract.js";

const serverModule = new URL(
  "../lib/production-director-projection-synchronization.js",
  import.meta.url,
).href;
const actorAuthUserId = "11111111-1111-4111-8111-111111111111";
const actorPlayerId = "CB01";
const commitSha = "c".repeat(40);
const activeEnv = {
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
  PRODUCTION_SUPABASE_PROJECT_REF: "ymqhhtxaywtqllynrmxe",
  PRODUCTION_SUPABASE_URL: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
  GOOGLE_SHEETS_ID: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SCORING_AUTHORITY: "supabase",
};

function settingsRows({ yearScoped = true } = {}) {
  return PREDICTION_SETTING_SPECS.flatMap((entry) => [2026, 2027].map((year) => ({
    Setting: entry.canonicalKey,
    Value: entry.type === "boolean" ? (entry.defaultValue ? "TRUE" : "FALSE") : String(entry.defaultValue),
    ...(yearScoped ? { Year: String(year) } : {}),
  })));
}

function sheets(options) {
  return {
    "Prediction Settings": {
      headers: ["Setting", "Value", ...(options?.yearScoped === false ? [] : ["Year"])],
      records: settingsRows(options).map((record) => ({ record })),
    },
  };
}

function run(body) {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--input-type=module",
    "--eval",
    `
      import {
        buildProductionDirectorProjectionEnvelope,
        synchronizeProductionDirectorProjection,
      } from ${JSON.stringify(serverModule)};
      const activeEnv = ${JSON.stringify(activeEnv)};
      const actorAuthUserId = ${JSON.stringify(actorAuthUserId)};
      const actorPlayerId = ${JSON.stringify(actorPlayerId)};
      ${body}
    `,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test("future Prediction Settings require and retain explicit annual scope", () => {
  const result = run(`
    const scopedSheets = ${JSON.stringify(sheets())};
    const unscopedSheets = ${JSON.stringify(sheets({ yearScoped: false }))};
    const envelope = buildProductionDirectorProjectionEnvelope({
      domain: "PREDICTION_SETTINGS", sheets: scopedSheets, actorPlayerId,
      targetTournamentId: "2027", targetTournamentYear: 2027,
    });
    let unscopedCode = "";
    try {
      buildProductionDirectorProjectionEnvelope({
        domain: "PREDICTION_SETTINGS", sheets: unscopedSheets, actorPlayerId,
        targetTournamentId: "2027", targetTournamentYear: 2027,
      });
    } catch (error) { unscopedCode = error.code; }
    console.log(JSON.stringify({
      tournamentId: envelope.payload.settings.length && envelope.payload.settings[0].Year,
      rowCount: envelope.payload.settings.length,
      expectedRows: ${PREDICTION_SETTING_SPECS.length},
      unscopedCode,
    }));
  `);
  assert.equal(result.tournamentId, "2027");
  assert.equal(result.rowCount, result.expectedRows);
  assert.equal(result.unscopedCode, "PRODUCTION_FUTURE_PREDICTION_SETTINGS_YEAR_SCOPE_REQUIRED");
});

test("future annual sync uses future RPCs and keeps frozen 2026 provenance separate from target scope", () => {
  const result = run(`
    const sourceSheets = ${JSON.stringify(sheets())};
    const calls = [];
    let stored = null;
    const productionRpc = async (name, input) => {
      calls.push({ name, input });
      if (name === "read_production_future_annual_projection_v1" && !stored) return {
        ok: true, domain: "PREDICTION_SETTINGS", activation_revision: 126,
        setup_revision: 9, runtime_revision: 4,
        current_projection: null, canonical_context: {},
      };
      if (name === "synchronize_production_future_annual_projection_v1") {
        stored = {
          revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          revision_number: 1,
          source_fingerprint: input.source_fingerprint,
          payload_fingerprint: input.payload_fingerprint,
        };
        return { ok: true, changed: true, duplicate: false, ...stored };
      }
      if (name === "read_production_future_annual_projection_v1") return {
        ok: true, domain: "PREDICTION_SETTINGS", activation_revision: 126,
        setup_revision: 10, runtime_revision: 4,
        current_projection: stored, data: stored,
      };
      throw new Error("Unexpected RPC " + name);
    };
    const result = await synchronizeProductionDirectorProjection({
      domain: "PREDICTION_SETTINGS", actorAuthUserId, actorPlayerId,
      targetTournamentId: "2027", targetTournamentYear: 2027, env: activeEnv,
      dependencies: {
        productionRpc,
        withProductionGoogleCredentials: async (_input, execute) => execute(),
        withWorkbookWriteDiagnostics: async (_label, execute) => ({
          result: await execute(), diagnostics: { sheetsApiCalls: 1, httpRequests: 1, workbookWrites: 0 },
        }),
        readWorkbookSheetsByName: async () => sourceSheets,
      },
    });
    console.log(JSON.stringify({ result, calls }));
  `);
  assert.deepEqual(result.calls.map((call) => call.name), [
    "read_production_future_annual_projection_v1",
    "synchronize_production_future_annual_projection_v1",
    "read_production_future_annual_projection_v1",
  ]);
  const mutation = result.calls[1].input;
  assert.equal(mutation.tournament_id, "2026");
  assert.equal(mutation.tournament_year, 2026);
  assert.equal(mutation.target_tournament_id, "2027");
  assert.equal(mutation.target_tournament_year, 2027);
  assert.equal(mutation.expected_setup_revision, 9);
  assert.equal(mutation.expected_runtime_revision, 4);
  assert.equal(mutation.source_revision, 1);
  assert.equal(result.result.readbackParity, true);
  assert.equal(result.result.googleWrite, false);
});

test("annual route accepts target scope without changing source authority", async () => {
  const [route, service] = await Promise.all([
    readFile(new URL("../app/api/admin/production-director-synchronization/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-director-projection-synchronization.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /targetTournamentId:\s*input\.targetTournamentId/);
  assert.match(route, /targetTournamentYear:\s*input\.targetTournamentYear/);
  assert.match(service, /target_tournament_id:\s*selectedTarget\.tournamentId/);
  assert.match(service, /target\.future[\s\S]*synchronize_production_future_annual_projection_v1/);
  assert.match(service, /operation_authority:\s*"GOOGLE_DIRECTOR_SYNC"/);
  assert.doesNotMatch(service, /GOOGLE.*PUBLICATION_AUTHORITY|google.*fallback/i);
});

test("future annual projection SQL preserves promoted structure and safely reopens Ready candidates", async () => {
  const migration = await readFile(new URL(
    "../supabase/production_migrations/202608300066_production_future_runtime_activation_v1.sql",
    import.meta.url,
  ), "utf8");
  assert.match(migration,
    /'runtime_revision', coalesce\(promotion\.promotion_revision, 0\)/);
  assert.match(migration,
    /existing\.certification_status = 'CERTIFIED'[\s\S]*?'duplicate', true[\s\S]*?expected_setup_revision/);
  assert.match(migration,
    /lifecycle = case when value\.lifecycle = 'READY_FOR_ACTIVATION'[\s\S]*?then 'CONFIGURING'/);
  assert.match(migration,
    /lifecycle_revision = case when value\.lifecycle = 'READY_FOR_ACTIVATION'[\s\S]*?value\.lifecycle_revision \+ 1/);
  assert.match(migration,
    /setup_revision = case when promotion\.tournament_id is null[\s\S]*?then value\.setup_revision \+ 1 else value\.setup_revision end/);
  assert.match(migration,
    /readiness_fingerprint = null, readiness_setup_revision = null/);
});
