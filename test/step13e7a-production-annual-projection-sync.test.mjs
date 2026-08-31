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

test("future Google Prediction Settings synchronization is retired before annual scope or dependencies", () => {
  const result = run(`
    let envelopeCode = "";
    let synchronizationCode = "";
    let dependencyCalls = 0;
    try {
      buildProductionDirectorProjectionEnvelope({
        domain: "PREDICTION_SETTINGS",
        sheets: ${JSON.stringify(sheets())},
        actorPlayerId,
        targetTournamentId: "2027",
        targetTournamentYear: 2027,
      });
    } catch (error) { envelopeCode = error.code; }
    try {
      await synchronizeProductionDirectorProjection({
        domain: "PREDICTION_SETTINGS",
        actorAuthUserId,
        actorPlayerId,
        targetTournamentId: "2027",
        targetTournamentYear: 2027,
        env: activeEnv,
        dependencies: {
          productionRpc: async () => { dependencyCalls += 1; },
          withProductionGoogleCredentials: async () => { dependencyCalls += 1; },
          withWorkbookWriteDiagnostics: async () => { dependencyCalls += 1; },
          readWorkbookSheetsByName: async () => { dependencyCalls += 1; },
        },
      });
    } catch (error) { synchronizationCode = error.code; }
    console.log(JSON.stringify({ envelopeCode, synchronizationCode, dependencyCalls }));
  `);
  assert.equal(result.envelopeCode, "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED");
  assert.equal(result.synchronizationCode, "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED");
  assert.equal(result.dependencyCalls, 0);
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
