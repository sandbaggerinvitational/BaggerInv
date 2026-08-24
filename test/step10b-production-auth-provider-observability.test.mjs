import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240017_production_auth_provider_rate_limit_observability.sql",
  import.meta.url,
);

test("Production email delivery audit persists provider and unknown-source rate limits", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /participant_auth_otp_attempts_production_safe_reason_check/);
  assert.match(sql, /AUTH_SMTP_PROVIDER_RATE_LIMITED/);
  assert.match(sql, /AUTH_EMAIL_RATE_LIMITED_UNKNOWN_SOURCE/);
  assert.match(sql, /requested_reason not in/);
  assert.match(sql, /set search_path = pg_catalog, participant_identity, pg_temp/);
  assert.match(sql, /revoke all on function public\.record_production_auth_candidate_otp_delivery\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.record_production_auth_candidate_otp_delivery\(jsonb\)[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]+to (?:anon|authenticated)/i);
  assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, "migration dollar quotes must balance");
});
