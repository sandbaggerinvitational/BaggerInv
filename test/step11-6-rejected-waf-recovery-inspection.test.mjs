import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migrationDirectory = new URL(
  "supabase/production_migrations/",
  root,
);
const migrationNames = readdirSync(migrationDirectory)
  .filter((name) => name.startsWith("202608270043"));

assert.equal(
  migrationNames.length,
  1,
  "exactly one additive migration 043 must install rejected-WAF recovery inspection",
);

const migration = readFileSync(
  new URL(migrationNames[0], migrationDirectory),
  "utf8",
);
const runtime = readFileSync(new URL(
  "lib/production-google-writer-fence-receipt-server.js",
  root,
), "utf8");

function inspectorDefinition(source) {
  const match = source.match(
    /create or replace function public\.inspect_production_vercel_writer_critical_waf_epoch\(\s*input jsonb\s*\)[\s\S]*?\n\$\$;/i,
  );
  assert.ok(match, "the bounded public critical-WAF inspector must be replaced");
  return match[0];
}

test("migration 043 exposes one bounded service-role rejected-WAF recovery operation", () => {
  const inspector = inspectorDefinition(migration);

  assert.match(
    inspector,
    /security definer\s+set search_path = pg_catalog/i,
  );
  assert.match(
    inspector,
    /assert_exact_cutover_resource_scope\(input, false\)/i,
  );
  assert.match(
    inspector,
    /RECOVER_PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH/,
  );
  assert.match(
    inspector,
    /STEP11_6_VERCEL_WAF_RECOVERY_NOT_FOUND/,
  );
  assert.match(
    inspector,
    /STEP11_6_VERCEL_WAF_RECOVERY_CONFLICT/,
  );
  assert.match(inspector, /count\(\*\)/i);
  assert.match(inspector, /ACTIVATION_PENDING/);
  assert.match(inspector, /purpose[\s\S]*REHEARSAL/i);
  assert.match(inspector, /transition_mode[\s\S]*REHEARSAL/i);
  assert.match(
    inspector,
    /vercel_project_id[\s\S]*prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU/i,
  );

  assert.match(inspector, /dispatch_step[\s\S]*CRITICAL_RULE_INSERT/i);
  assert.match(inspector, /PROVIDER_REJECTED/);
  assert.match(inspector, /provider_response_observed/i);
  assert.match(
    inspector,
    /provider_response_status[\s\S]*(?:between\s+400\s+and\s+599|>=\s*400)/i,
  );
  assert.match(
    inspector,
    /or dispatch_result\.provider_readback_fingerprint is not null/i,
  );
  assert.match(
    inspector,
    /or dispatch_result\.provider_assigned_rule_id is not null/i,
  );

  assert.match(
    migration,
    /revoke all on function\s+public\.inspect_production_vercel_writer_critical_waf_epoch\(jsonb\)\s+from public, anon, authenticated, service_role;/i,
  );
  assert.match(
    migration,
    /grant execute on function\s+public\.inspect_production_vercel_writer_critical_waf_epoch\(jsonb\)\s+to service_role;/i,
  );
});

test("migration 043 keeps production_control private and does not broaden table access", () => {
  assert.doesNotMatch(
    migration,
    /grant\s+usage\s+on\s+schema\s+production_control/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:select|all)[\s\S]*?on\s+(?:all\s+tables\s+in\s+schema\s+production_control|(?:table\s+)?production_control\.)/i,
  );
  assert.doesNotMatch(
    migration,
    /(?:pgrst\.db_schemas|db-schemas|exposed[_-]schemas)/i,
  );
});

test("runtime recovers through the bounded RPC without a private-schema REST GET", () => {
  assert.match(
    runtime,
    /inspect_production_vercel_writer_critical_waf_epoch[\s\S]*RECOVER_PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH/,
  );
  assert.doesNotMatch(runtime, /RECOVERY_TABLE_SELECTS/);
  assert.doesNotMatch(runtime, /recoveryTableRows/);
  assert.doesNotMatch(
    runtime,
    /accept-profile["']?\s*:\s*["']production_control["']/i,
  );
  assert.doesNotMatch(
    runtime,
    /\/rest\/v1\/(?:vercel_writer_critical_waf_epochs|vercel_writer_critical_waf_dispatches|vercel_writer_critical_waf_dispatch_results)/,
  );
});
