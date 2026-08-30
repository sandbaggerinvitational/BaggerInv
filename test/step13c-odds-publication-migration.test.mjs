import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608290057_production_odds_publication_authority_v1.sql",
  import.meta.url,
);

test("Step 13C migration installs inert and adopts only exact certified evidence", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /odds_publication_authority text not null\s+default 'GOOGLE'/);
  assert.match(sql, /'2026', 'production-odds-publication-v1', 'GOOGLE',\s+'UNPUBLISHED', 'UNPUBLISHED'/);
  assert.match(sql, /adopt_production_odds_publication_authority_v1/);
  assert.match(sql, /65f54c41-2dc3-4b2c-8570-a4d23056649a/);
  assert.match(sql, /6529536209651e61eff2027c3b2c9ef5323dc021699159b1e0565ef39169128f/);
  assert.match(sql, /99d33b84b9c336b130adf3ec18d54b612c6461de697f365fb42662de39448e64/);
  assert.match(sql, /set odds_publication_authority = 'SUPABASE',\s+odds_publication_enabled = true/);
  assert.match(sql, /'adoption_kind', 'LEGACY_GOOGLE_ADOPTED'/);
  assert.doesNotMatch(sql, /insert into scoring_authority\.odds_published_snapshots[\s\S]{0,300}LEGACY_GOOGLE_ADOPTED/,
    "adoption points at exact evidence instead of fabricating a publication");
});

test("Step 13C Production publish is job-bound, Director-bound, CAS-protected, and mirror-free", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const publish = sql.slice(
    sql.indexOf("create or replace function public.publish_production_championship_odds_v1"),
    sql.indexOf("create or replace function public.read_production_odds_publication_v1"),
  );
  assert.match(publish, /assert_production_scoring_actor\(input, true\)/);
  assert.match(publish, /source_calculation_job_id/);
  assert.match(publish, /publication_revision <> expected_revision/);
  assert.match(publish, /current_snapshot_id is distinct from expected_snapshot/);
  assert.match(publish, /job\.publication_status = 'PUBLISHED'/);
  assert.match(publish, /expected_predecessor_revision/);
  assert.match(publish, /PRODUCTION_ODDS_PUBLICATION_PHASE_REGRESSION/);
  assert.match(publish, /set is_current_for_milestone = false/);
  assert.match(publish, /publication_status = 'PUBLISHED'/);
  assert.match(publish, /'mirror_created', false/);
  assert.match(publish, /'google_writes', 0/);
  assert.doesNotMatch(publish, /odds_google_mirror_jobs\s*\(/);
});

test("Step 11 remains isolated and Production Google import retires at Supabase authority", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /when 'STEP11_REHEARSAL'[\s\S]*publication_status = 'REHEARSAL_ONLY'/);
  assert.match(sql, /retained->>'publication_status' in \('READY', 'PUBLISHED'\)|PRODUCTION_ODDS_REHEARSAL_LEGACY_AUTHORITY_REQUIRED/);
  assert.match(sql, /PRODUCTION_ODDS_GOOGLE_PUBLICATION_RETIRED/);
  assert.match(sql, /resource\.odds_publication_authority <> 'GOOGLE'/);
  assert.match(sql, /ODDS_GOOGLE_MIRROR'[\s\S]*enabled or google_writes_allowed/);
});

test("normal releases accept only coherent legacy or migrated Odds tuples", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /transitional legacy: GOOGLE \/ false \/ false/);
  assert.match(sql, /migrated canonical:\s+SUPABASE \/ true \/ false/);
  assert.match(sql, /runtime_odds_publication_authority' = 'GOOGLE'[\s\S]*runtime_supabase_odds_publication_enabled'[\s\S]*'false'::jsonb/);
  assert.match(sql, /runtime_odds_publication_authority' = 'SUPABASE'[\s\S]*runtime_supabase_odds_publication_enabled'[\s\S]*'true'::jsonb/);
  assert.match(sql, /runtime_supabase_odds_google_mirror_enabled' is distinct from\s+'false'::jsonb/);
  assert.match(sql, /resource\.odds_publication_authority/);
});

test("Odds freshness preserves existing explicit-publication semantics", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /later scoring\/input revisions do not silently stale a publication/);
  assert.match(sql, /freshness = 'CURRENT'/);
  assert.match(sql, /publication_revision = next_revision/);
});
