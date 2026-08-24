import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  productionFoundationResourceEnvironment,
  productionFoundationShadowImportOperationNames,
} from "../lib/production-foundation-resource-contract.js";

const foundationEnv = {
  VERCEL_ENV: "production",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "not-a-real-key",
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "passport",
};

test("Production foundation resolves every completed-history year without weakening current scope", () => {
  assert.deepEqual(productionFoundationShadowImportOperationNames(), [
    "COMPLETED_HISTORY_IMPORT",
    "COMPLETED_HISTORY_READBACK",
    "CURRENT_TOURNAMENT_SHADOW_IMPORT",
    "CURRENT_SCORING_SHADOW_IMPORT",
    "PRODUCTION_PRESENTATION_SHADOW_IMPORT",
    "CURRENT_SHADOW_READBACK",
  ]);
  for (let year = 2017; year <= 2025; year += 1) {
    const state = productionFoundationResourceEnvironment({
      env: foundationEnv,
      operation: "COMPLETED_HISTORY_IMPORT",
      tournamentId: String(year),
      tournamentYear: year,
    });
    assert.equal(state.allowed, true, String(year));
    assert.equal(state.tournamentScopeKind, "COMPLETED_HISTORY");
    assert.equal(state.resources.tournamentId, String(year));
    assert.equal(state.resources.tournamentYear, year);
    assert.equal(state.policy.googleWrite, false);
    assert.equal(state.policy.scoringIngress, false);
  }
  for (const year of [2016, 2026, 2030]) {
    const state = productionFoundationResourceEnvironment({
      env: foundationEnv,
      operation: "COMPLETED_HISTORY_IMPORT",
      tournamentId: String(year),
      tournamentYear: year,
    });
    assert.equal(state.allowed, false, String(year));
  }
  const current = productionFoundationResourceEnvironment({
    env: foundationEnv,
    operation: "CURRENT_SCORING_SHADOW_IMPORT",
    tournamentId: "2026",
    tournamentYear: 2026,
  });
  assert.equal(current.allowed, true);
  assert.equal(current.tournamentScopeKind, "CURRENT_TOURNAMENT");
  assert.equal(current.policy.authoritative, false);
});

test("history/current operations fail closed on cross-environment resources and unsafe authorities", () => {
  for (const operation of ["COMPLETED_HISTORY_IMPORT", "CURRENT_TOURNAMENT_SHADOW_IMPORT", "CURRENT_SCORING_SHADOW_IMPORT"]) {
    const tournamentYear = operation === "COMPLETED_HISTORY_IMPORT" ? 2025 : 2026;
    const tournamentId = String(tournamentYear);
    for (const [env, reason] of [
      [{ ...foundationEnv, VERCEL_ENV: "preview" }, "production-environment-required"],
      [{ ...foundationEnv, PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb" }, "production-project-ref-required"],
      [{ ...foundationEnv, GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts" }, "production-workbook-required"],
      [{ ...foundationEnv, SCORING_AUTHORITY: "supabase" }, "legacy-production-authorities-required"],
      [{ ...foundationEnv, PARTICIPANT_IDENTITY_AUTHORITY: "supabase" }, "legacy-production-authorities-required"],
      [{ ...foundationEnv, PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "true" }, "authoritative-feature-flag-forbidden"],
      [{ ...foundationEnv, PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true" }, "authoritative-feature-flag-forbidden"],
    ]) {
      const state = productionFoundationResourceEnvironment({ env, operation, tournamentId, tournamentYear });
      assert.equal(state.allowed, false, `${operation}:${reason}`);
      assert.equal(state.reason, reason, operation);
    }
  }
});

test("Production migration exposes only service-role shadow import/readback RPCs", async () => {
  const sql = await readFile(new URL(
    "../supabase/production_migrations/202608230003_production_history_current_shadow_import.sql",
    import.meta.url,
  ), "utf8");
  const rpcNames = [
    "import_production_completed_history_year",
    "read_production_completed_history_shadow",
    "import_production_current_tournament_shadow",
    "read_production_current_tournament_shadow",
    "inspect_production_shadow_import_security",
  ];
  for (const rpc of rpcNames) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\(`, "i"));
    assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}\\([^;]*from public, anon, authenticated, service_role`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\([^;]*to service_role`, "i"));
  }
  assert.doesNotMatch(sql, /grant execute[\s\S]{0,160}\bto\s+(?:anon|authenticated|public)\b/i);
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts|\bPREVIEW\b/i);
  assert.match(sql, /set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp/);
});

test("completed-history import preserves certified validation, corrections, revisions, and provenance", async () => {
  const sql = await readFile(new URL(
    "../supabase/production_migrations/202608230003_production_history_current_shadow_import.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /validate_completed_history_payload\(input\)/);
  assert.match(sql, /completed_history_correction_applications/);
  assert.match(sql, /completed_history_record_eligibility/);
  assert.match(sql, /completed_history_scorecards/);
  assert.match(sql, /completed_history_course_appearances/);
  assert.match(sql, /source_roster_key/);
  assert.match(sql, /correction_set_version/);
  assert.match(sql, /PRIOR_HISTORY_YEAR_NOT_CERTIFIED/);
  assert.match(sql, /HISTORICAL_RECONCILIATION_REQUIRED/);
  assert.match(sql, /production_control\.import_runs[\s\S]*?'COMPLETED_HISTORY'/);
  assert.match(sql, /database_payload_fingerprint_value/);
  assert.match(sql, /'Round ' \|\| \(item->>'round_number'\)/);
});

test("current shadow import is atomic/idempotent and remains one-way Google to Supabase", async () => {
  const sql = await readFile(new URL(
    "../supabase/production_migrations/202608230003_production_history_current_shadow_import.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /^begin;/m);
  assert.match(sql, /commit;\s*$/);
  assert.match(sql, /PRODUCTION_CURRENT_SHADOW_DRIFT_DETECTED/);
  assert.match(sql, /'changed', false, 'duplicate', true/);
  assert.match(sql, /'CURRENT_TOURNAMENT'/);
  assert.match(sql, /'CURRENT_SCORING_SHADOW'/);
  assert.match(sql, /current_tournament_shadow_projection/);
  assert.match(sql, /database_fingerprint_value/);
  assert.match(sql, /values \(target_tournament, 'PAUSED', 'GOOGLE'/);
  assert.match(sql, /PRODUCTION_CURRENT_SHADOW_HAS_AUTHORITATIVE_ACTIVITY/);
  assert.match(sql, /PRODUCTION_OPERATIONAL_TRIGGER_MUST_REMAIN_DISABLED/);
  assert.match(sql, /select count\(\*\) into enabled_operational_trigger_count[\s\S]*?pg_catalog\.pg_trigger/);
  assert.match(sql, /authorization_payload jsonb := input->'director_authorization'/);
  assert.doesNotMatch(sql, /\bauthorization jsonb :=/);
  assert.match(sql, /PRODUCTION_SHADOW_IMPORT_CREATED_OUTBOX/);
  assert.doesNotMatch(sql, /insert into\s+scoring_authority\.google_outbox_events/i);
  assert.doesNotMatch(sql, /insert into\s+auth\.users/i);
  assert.doesNotMatch(sql, /delete from\s+scoring_authority\.tournaments/i);
});

test("shadow readback proves counts, fingerprints, authority, ingress, and no fallback surface", async () => {
  const [sql, transport] = await Promise.all([
    readFile(new URL("../supabase/production_migrations/202608230003_production_history_current_shadow_import.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-foundation-transport.js", import.meta.url), "utf8"),
  ]);
  assert.match(sql, /'parity', parity/);
  assert.match(sql, /'expected_database_fingerprint'/);
  assert.match(sql, /'actual_database_fingerprint'/);
  assert.match(sql, /'outbox_count'/);
  assert.match(sql, /'authority', 'GOOGLE'/);
  assert.match(sql, /'auth_users'/);
  assert.match(transport, /PRODUCTION_SHADOW_IMPORT_RPCS/);
  assert.match(transport, /import_production_completed_history_year/);
  assert.match(transport, /import_production_current_tournament_shadow/);
  assert.match(transport, /mode: "DORMANT_SHADOW"/);
  assert.doesNotMatch(transport, /fetch\s*\(|scoringShadowRpc\s*\(/);
});
