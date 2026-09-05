import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { publishedOddsFreshness } from "../lib/published-odds-supabase.js";

const migration =
  "supabase/production_migrations/202609050088_production_odds_legacy_projection_compatibility_v1.sql";
const source = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

function productionLegacyView({ current = true } = {}) {
  return {
    history_count: 1,
    publication: {
      authority: "SUPABASE",
      state: "PUBLISHED",
      snapshot_id: "65f54c41-2dc3-4b2c-8570-a4d23056649a",
      publication_revision: 1,
      publication_pointer_revision: 1,
      freshness: "CURRENT",
      adoption_kind: "LEGACY_GOOGLE_ADOPTED",
    },
    snapshots: [{
      milestone: "Pre-Tournament",
      phase_order: 0,
      publication_state_revision: null,
      publication_revision: 1,
      authority_contract_version: "legacy-google-published-odds-v1",
      origin_authority: "GOOGLE",
      is_current_official: current,
      publication_verified: true,
      published_at: "2026-07-20T02:54:17.133+00:00",
      payload_hash: "6529536209651e61eff2027c3b2c9ef5323dc021699159b1e0565ef39169128f",
      payload: {
        year: 2026,
        phase: "Pre-Tournament",
        phaseOrder: 0,
        publishedAt: "2026-07-20T02:54:17.133Z",
      },
    }],
  };
}

test("088 adds a provenance-bounded legacy revision fallback without data writes", async () => {
  const sql = await source(migration);
  assert.match(sql,
    /create function production_control\.odds_publication_effective_revision_v1/);
  assert.match(sql, /publication_state_revision/);
  assert.match(sql, /publication_revision/);
  assert.match(sql, /LEGACY_GOOGLE_ADOPTED/);
  assert.match(sql, /legacy-google-published-odds-v1/);
  assert.match(sql,
    /pointer\.publication_state = 'PUBLISHED'[\s\S]*is_current_official/);
  assert.match(sql, /PRODUCTION_ODDS_PUBLIC_POINTER_DIVERGED/);
  assert.match(sql, /PRODUCTION_ODDS_WITHDRAWAL_IDENTITY_SOURCE_CHANGED/);
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
  assert.doesNotMatch(sql,
    /(?:insert\s+into|update|delete\s+from)\s+(?:scoring_authority|production_control)\./i);
});

test("the exact Production-shaped public model resolves revision 1 only after projection marks it current", () => {
  const before = publishedOddsFreshness(productionLegacyView({ current: false }));
  assert.equal(before.status, "UNAVAILABLE");
  assert.deepEqual(before.reasons, ["CURRENT_OFFICIAL_SNAPSHOT_MISSING"]);

  const after = publishedOddsFreshness(productionLegacyView());
  assert.equal(after.status, "CURRENT_OFFICIAL");
  assert.equal(after.current, true);
  assert.equal(after.official, true);
  assert.equal(after.publicationRevision, 1);
  assert.equal(after.publishedSnapshotId,
    "65f54c41-2dc3-4b2c-8570-a4d23056649a");
  assert.deepEqual(after.reasons, []);
});
