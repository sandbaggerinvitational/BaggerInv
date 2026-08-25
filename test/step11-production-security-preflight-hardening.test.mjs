import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240024_production_security_preflight_hardening.sql",
  import.meta.url,
);

test("Production security hardening removes browser execution and fixes helper search paths", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /revoke all on function public\.rls_auto_enable\(\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /alter function scoring_authority\.strokes_on_hole\(integer, integer\)\s+set search_path = pg_catalog/i,
  );
  assert.match(
    sql,
    /alter function scoring_authority\.valid_gross_scores\(jsonb, integer\)\s+set search_path = pg_catalog/i,
  );
  assert.match(sql, /PRODUCTION_RLS_AUTO_ENABLE_BROWSER_EXECUTE_REMAINS/);
  assert.match(sql, /PRODUCTION_SCORING_HELPER_SEARCH_PATH_NOT_FIXED/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*?(?:anon|authenticated)/i);
});
