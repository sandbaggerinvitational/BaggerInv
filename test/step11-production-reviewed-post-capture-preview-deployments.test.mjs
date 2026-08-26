import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS } from
  "../lib/production-google-writer-fence-quiesce.js";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608260035_production_reviewed_post_capture_preview_deployments.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");
const reviewedMatch = sql.match(
  /normalized_reviewed\s*:=\s*production_control\.normalized_vercel_origin_inventory\(\s*'(\[[\s\S]*?\])'::jsonb\s*\);/,
);

test("additive migration pins the exact shared reviewed deployment set", () => {
  assert.ok(reviewedMatch, "the reviewed SQL inventory must be statically extractable");
  const reviewed = JSON.parse(reviewedMatch[1]);
  assert.deepEqual(reviewed, [
    ...PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS,
  ]);
  assert.equal(reviewed.length, 3);
  assert.equal(
    createHash("sha256").update(JSON.stringify(reviewed)).digest("hex"),
    "7f0f1e6c3267f92de77e49c341ee58ed4975361f91c8b2af2fa32e3928a3d8a5",
  );
});

test("replacement assertion is fixed-path, internal, required-set, and fail-closed", () => {
  assert.match(sql, /^begin;/m);
  assert.match(sql, /commit;\s*$/);
  assert.match(sql,
    /create or replace function production_control\.assert_exact_vercel_live_inventory\(/);
  assert.match(sql, /language plpgsql\s+immutable\s+security definer\s+set search_path = pg_catalog/);
  assert.match(sql,
    /revoke all on function production_control\.assert_exact_vercel_live_inventory\([\s\S]*?from public, anon, authenticated;/);
  assert.match(sql,
    /grant execute on function production_control\.assert_exact_vercel_live_inventory\([\s\S]*?to service_role;/);
  assert.match(sql,
    /jsonb_array_elements\(normalized_reviewed\)[\s\S]*?except[\s\S]*?jsonb_array_elements\(normalized_live\)/);
  assert.match(sql,
    /jsonb_array_elements\([\s\S]*?normalized_retained \|\| normalized_reviewed[\s\S]*?required\.record->>0 = candidate_deployment_id[\s\S]*?required\.record->>2 = pg_catalog\.lower/);
  assert.match(sql,
    /live\.record->>1 <> pg_catalog\.lower\(candidate_deployment_commit\)/);
  assert.match(sql,
    /candidate_deployment_target = 'PREVIEW'[\s\S]*?live\.record->>3 <> 'FEATURE_PREVIEW'/);
  assert.match(sql,
    /candidate_deployment_target = 'PRODUCTION'[\s\S]*?'FEATURE_PREVIEW', 'CUTOVER_PRODUCTION_CANDIDATE'/);
  assert.match(sql,
    /live\.record->>0 = reviewed\.record->>0[\s\S]*?live\.record->>2 = reviewed\.record->>2[\s\S]*?live\.record is distinct from reviewed\.record/);
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
});
