import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS } from
  "../lib/production-google-writer-fence-quiesce.js";

const migration036Url = new URL(
  "../supabase/production_migrations/202608260036_production_reviewed_post_capture_preview_deployments_v2.sql",
  import.meta.url,
);
const migration037Url = new URL(
  "../supabase/production_migrations/202608260037_production_provider_rpc_name_and_inventory_v3.sql",
  import.meta.url,
);
const sql036 = await readFile(migration036Url, "utf8");
const sql = await readFile(migration037Url, "utf8");
const reviewedMatch = sql036.match(
  /normalized_reviewed\s*:=\s*production_control\.normalized_vercel_origin_inventory\(\s*'(\[[\s\S]*?\])'::jsonb\s*\);/,
);
const reviewedAdditionMatch = sql.match(
  /reviewed_addition\s*:=\s*production_control\.normalized_vercel_origin_inventory\(\s*'(\[[\s\S]*?\])'::jsonb\s*\);/,
);

test("additive migration pins the exact shared reviewed deployment set", () => {
  assert.ok(reviewedMatch, "the reviewed SQL inventory must be statically extractable");
  assert.ok(reviewedAdditionMatch,
    "the additive reviewed SQL inventory must be statically extractable");
  const reviewed = [
    ...JSON.parse(reviewedMatch[1]),
    ...JSON.parse(reviewedAdditionMatch[1]),
  ];
  const normalizedReviewed = [...reviewed].sort((left, right) => {
    const leftKey = `${left[0]}\n${left[2]}`;
    const rightKey = `${right[0]}\n${right[2]}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  assert.deepEqual(normalizedReviewed, [
    ...PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS,
  ]);
  assert.equal(normalizedReviewed.length, 6);
  assert.equal(
    createHash("sha256").update(JSON.stringify(normalizedReviewed)).digest("hex"),
    "2a0f75de0e4f2178c03cb98f8adb264b3f661b28025b51a70b29800aa30b5724",
  );
});

test("v3 assertion and PostgREST-safe inspection RPC are fixed-path and fail-closed", () => {
  assert.match(sql, /^begin;/m);
  assert.match(sql, /commit;\s*$/);
  assert.match(sql,
    /create or replace function public\.inspect_production_vercel_provider_challenge_abandonment\(/);
  assert.ok(
    "inspect_production_vercel_provider_challenge_abandonment".length <= 63,
    "the PostgREST RPC name must survive PostgreSQL identifier storage exactly",
  );
  assert.match(sql,
    /revoke all on function[\s\S]*?inspect_production_vercel_provider_challenge_abandonment\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role;/);
  assert.match(sql,
    /grant execute on function[\s\S]*?inspect_production_vercel_provider_challenge_abandonment\(jsonb\)[\s\S]*?to service_role;/);
  assert.match(sql,
    /create or replace function production_control\.assert_exact_vercel_live_inventory\(/);
  assert.match(sql, /language plpgsql\s+immutable\s+security definer\s+set search_path = pg_catalog/);
  assert.match(sql,
    /revoke all on function production_control\.assert_exact_vercel_live_inventory\([\s\S]*?from public, anon, authenticated, service_role;/);
  assert.match(sql,
    /grant execute on function production_control\.assert_exact_vercel_live_inventory\([\s\S]*?to service_role;/);
  assert.match(sql, /candidate_deployment_id = reviewed_record->>0/);
  assert.match(sql,
    /pg_catalog\.rtrim\(candidate_immutable_origin, '\/'\)[\s\S]*?reviewed_record->>2/);
  assert.match(sql,
    /value->>0 = reviewed_record->>0[\s\S]*?value->>2 = reviewed_record->>2[\s\S]*?value is distinct from reviewed_record/);
  assert.match(sql,
    /jsonb_agg\(\s*value order by \(value->>0\) collate "C",\s*pg_catalog\.lower\(pg_catalog\.rtrim\(value->>2, '\/'\)\)\s*\)/,
    "the delegated inventory must preserve the canonical C-collated order",
  );
  assert.match(sql,
    /perform production_control\.assert_exact_vercel_live_inventory_v2\(/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
});
