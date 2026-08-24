import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/production_migrations/202608230009_production_published_odds_import_fix.sql", import.meta.url);

test("Production Published Odds import qualifies milestone columns and remains service-only", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /s\.milestone\s*=\s*item->>'milestone'/);
  assert.match(migration, /s\.tournament_id\s*=\s*'2026'/);
  assert.doesNotMatch(migration, /where tournament_id='2026' and milestone=/);
  assert.match(migration, /'publication_created',false/);
  assert.match(migration, /'mirror_job_created',false/);
  assert.match(migration, /revoke all on function public\.import_production_published_odds\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.import_production_published_odds\(jsonb\) to service_role/);
});

test("Production Published Odds diagnostics expose only bounded database failure classes", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /get stacked diagnostics error_state = returned_sqlstate, error_constraint = constraint_name/);
  assert.match(migration, /'failure_class',case/);
  assert.doesNotMatch(migration, /sqlerrm|message_text|detail|hint/i);
});
