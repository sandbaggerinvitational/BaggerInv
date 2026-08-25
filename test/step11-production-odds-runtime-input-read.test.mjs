import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240032_production_odds_runtime_input_read.sql",
  import.meta.url,
);
const lockMigrationUrl = new URL(
  "../supabase/production_migrations/202608240031_production_staged_release_abort.sql",
  import.meta.url,
);
const serverUrl = new URL(
  "../lib/production-odds-calculation-server.js",
  import.meta.url,
);

const [sql, lockSql, server] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(lockMigrationUrl, "utf8"),
  readFile(serverUrl, "utf8"),
]);

const functionBody = sql.slice(
  sql.indexOf("create or replace function public.read_production_odds_calculation_inputs"),
  sql.indexOf("revoke all on function public.read_production_odds_calculation_inputs"),
);

test("Production Odds runtime input read is installation-inert and service-role only", () => {
  const installation = sql.slice(0, sql.indexOf("create or replace function"));
  assert.doesNotMatch(installation, /\b(?:insert|update|delete|truncate)\b/i);
  assert.match(functionBody, /language plpgsql[\s\S]*volatile[\s\S]*security definer/i);
  assert.match(functionBody,
    /set search_path = pg_catalog, production_control, scoring_authority/i);
  assert.doesNotMatch(
    functionBody.match(/set search_path = ([\s\S]*?)\nas \$\$/i)?.[1] ?? "",
    /\bpublic\b|pg_temp/i,
  );
  assert.match(sql,
    /revoke all on function public\.read_production_odds_calculation_inputs\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql,
    /grant execute on function public\.read_production_odds_calculation_inputs\(jsonb\)[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
});

test("Production Odds runtime input read takes the enabled lock-preserving scope before reading", () => {
  const scopeIndex = functionBody.indexOf(
    "production_control.assert_production_odds_calculation_scope",
  );
  const readIndex = functionBody.indexOf("public.read_championship_odds_inputs('2026')");
  assert.ok(scopeIndex >= 0);
  assert.ok(readIndex > scopeIndex);
  assert.match(functionBody,
    /assert_production_odds_calculation_scope\([\s\S]*?input,[\s\S]*?true[\s\S]*?\)/i);
  assert.match(lockSql,
    /if require_enabled then[\s\S]*pg_catalog\.pg_advisory_xact_lock_shared\(731102026031::bigint\)[\s\S]*end if;/i);
  assert.match(lockSql,
    /public\.abort_production_staged_release[\s\S]*pg_advisory_xact_lock\(731102026031::bigint\)/i);
});

test("Production Odds runtime input read has no authority, publication, mirror, or external side effect", () => {
  assert.doesNotMatch(functionBody,
    /\b(?:insert|update|delete|truncate)\b|net\.http_|pg_net|cron\.|fetch\s*\(|sheets\.googleapis|docs\.google\.com/i);
  assert.doesNotMatch(functionBody,
    /odds_published_snapshots|odds_google_mirror_jobs|google_outbox_events|scorecard_archive_jobs/i);
  assert.doesNotMatch(sql,
    /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/i);
});

test("Production Odds server uses the scoped runtime RPC without weakening candidate reads", () => {
  assert.match(server,
    /RPC_ALLOWLIST[\s\S]*"read_production_odds_calculation_inputs"/i);
  assert.match(server,
    /loadProductionOddsCalculationInputs[\s\S]*productionOddsCalculationRpc\([\s\S]*"read_production_odds_calculation_inputs"/i);
  assert.doesNotMatch(server,
    /import[\s\S]*readOddsInputBundle[\s\S]*from "\.\/championship-odds-supabase\.js"/i);
  assert.doesNotMatch(server,
    /read_production_candidate_current_view|PRODUCTION_SHADOW_CANDIDATE_READ_RPCS/i);
});

test("Production Odds input loader retains explicit tournament validation and test injection", () => {
  assert.match(server,
    /clean\(tournamentId\) !== PRODUCTION_TOURNAMENT_ID[\s\S]*PRODUCTION_ODDS_TOURNAMENT_SCOPE_REQUIRED/i);
  assert.match(server,
    /const result = readInputs[\s\S]*await readInputs\(PRODUCTION_TOURNAMENT_ID, \{ env \}\)[\s\S]*productionOddsCalculationRpc/i);
  assert.match(server,
    /!result\.payload\?\.ok \|\| !result\.payload\?\.data\?\.input_configuration/i);
  assert.match(server, /oddsEngineInputsFromBundle\(result\.payload\.data\)/i);
});

test("Production Odds runtime input migration is one balanced transaction", () => {
  assert.match(sql, /^--[\s\S]*\nbegin;\n/i);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\n$/);
  assert.equal((sql.match(/\$\$/g) ?? []).length, 2);
  assert.equal((sql.match(/\bbegin;/gi) ?? []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) ?? []).length, 1);
});
