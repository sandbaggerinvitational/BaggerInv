import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/202608120009_preview_scoring_authority_no_change_guard.sql", import.meta.url);

test("the authoritative no-change guard preserves idempotency and creates no revision, audit, or outbox work", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /mutation_row\.payload_hash = payload_hash_value/);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /hole_row\.team_1_gross_scores = team_1_gross/);
  assert.match(migration, /hole_row\.team_2_gross_scores = team_2_gross/);
  assert.match(migration, /'code', 'NO_CHANGE'/);
  assert.match(migration, /'semantic_noop', true/);
  assert.match(migration, /'match_revision', match_row\.match_revision/);
  assert.match(migration, /'hole_revision', hole_row\.hole_revision/);
  assert.match(migration, /'audit_created', false/);
  assert.match(migration, /'google_outbox_created', false/);
  assert.match(migration, /return public\.submit_hole_score_authoritative_phase2_inner\(input\)/);
});

test("the no-change guard authenticates and enforces lifecycle before semantic equality", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const authorization = migration.indexOf("'UNAUTHORIZED'");
  const locked = migration.indexOf("'SCORING_LOCKED'");
  const finalMatch = migration.indexOf("'MATCH_FINAL'");
  const equality = migration.indexOf("hole_row.team_1_gross_scores = team_1_gross");
  assert.ok(authorization > 0 && authorization < equality);
  assert.ok(locked > authorization && locked < equality);
  assert.ok(finalMatch > locked && finalMatch < equality);
});

test("score entry no-ops unchanged recorded values and persists Preview diagnostics opt-in", async () => {
  const component = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(component, /unchangedSavedScore/);
  assert.match(component, /Hole \$\{holeNumber\} already has these scores/);
  assert.match(component, /authoritativeHole: savedHole \|\| null/);
  assert.match(component, /Score Already Saved/);
  assert.match(component, /sbi-preview-scoring-diagnostics-enabled/);
  assert.match(component, /localStorage\.setItem\(SCORING_DIAGNOSTICS_OPT_IN, "true"\)/);
  assert.match(component, /if \(!response\.ok\) throw new Error\("Preview scoring diagnostics upload was not accepted\."\)/);
});
