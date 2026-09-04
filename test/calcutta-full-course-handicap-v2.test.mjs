import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202609040085_production_calcutta_full_course_handicap_v2.sql",
  import.meta.url,
);

test("Calcutta v2 migration is additive, versioned, inert, and keeps privileged completion bounded", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /begin;/);
  assert.match(migration, /commit;/);
  assert.match(migration, /calcutta-js-v1', 'calcutta-js-v2/);
  assert.match(migration, /calculation_policy', 'calcutta-bb-si-full-course-handicap-v1/);
  assert.match(migration, /'handicap_revision_id', participant\.handicap_revision_id/);
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /occurrences <> 2/);
  assert.match(migration, /revoke all on function public\.future_production_complete_calcutta_recalculation_v1/);
  assert.doesNotMatch(migration, /insert into scoring_authority\.calcutta_v1_(?:configuration|auction|publication|result|recalculation)/);
  assert.doesNotMatch(migration, /update scoring_authority\.calcutta_v1_current/);
});

test("Calcutta v2 implementation is server-derived and does not alter shared match or Net Skins allocation", async () => {
  const [calcutta, adapter, shared, skins] = await Promise.all([
    readFile(new URL("../lib/calcutta.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/calcutta-supabase.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/scorecard-net.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/net-skins-supabase.js", import.meta.url), "utf8"),
  ]);
  assert.match(calcutta, /calcuttaRoundResultsFromFrozenScoringContext/);
  assert.match(calcutta, /getCalcuttaSignedStrokesOnHole/);
  assert.match(calcutta, /roundCalcuttaCourseHandicap/);
  assert.match(adapter, /CALCUTTA_ENGINE_VERSION = "calcutta-js-v2"/);
  assert.match(adapter, /frozen Supabase full Course Handicap for BB\/SI/);
  assert.match(shared, /total <= 0/);
  assert.match(skins, /getStrokesOnHole/);
  assert.doesNotMatch(skins, /getCalcuttaSignedStrokesOnHole/);
});
