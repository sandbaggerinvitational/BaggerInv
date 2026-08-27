import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration040 = readFileSync(new URL(
  "supabase/production_migrations/202608260040_production_provider_inventory_recertification_v4.sql",
  root,
), "utf8");
const migration042 = readFileSync(new URL(
  "supabase/production_migrations/202608270042_production_dormant_scoring_admission_inspection.sql",
  root,
), "utf8");

function inspectorDefinition(source) {
  const match = source.match(
    /create or replace function public\.inspect_production_scoring_admission\(input jsonb\)[\s\S]*?\n\$\$;/,
  );
  assert.ok(match, "scoring-admission inspector definition must exist");
  return match[0];
}

test("the final inspector preserves v4 behavior while allowing DORMANT inspection", () => {
  const currentV4 = inspectorDefinition(migration040);
  const dormantSafe = inspectorDefinition(migration042);

  assert.equal(
    dormantSafe,
    currentV4.replace(
      "assert_exact_cutover_resource_scope(input, true)",
      "assert_exact_cutover_resource_scope(input, false)",
    ),
  );
  assert.match(
    dormantSafe,
    /assert_exact_cutover_resource_scope\(input, false\)/,
  );
  assert.doesNotMatch(
    dormantSafe,
    /assert_exact_cutover_resource_scope\(input, true\)/,
  );
  assert.match(dormantSafe, /security definer\nset search_path = pg_catalog/);
  assert.match(
    migration042,
    /revoke all on function public\.inspect_production_scoring_admission\(jsonb\)\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration042,
    /grant execute on function public\.inspect_production_scoring_admission\(jsonb\)\s+to service_role;/,
  );
  assert.match(
    migration042,
    /Service-only exact Production scoring-admission snapshot available in DORMANT and active cutover states without changing authority or application data\./,
  );
});
