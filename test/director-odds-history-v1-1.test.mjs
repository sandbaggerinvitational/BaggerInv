import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProductionDirectorOverview,
  productionDirectorOddsPublicationRevision,
} from "../lib/production-director-console.js";

const legacySnapshotId = "65f54c41-2dc3-4b2c-8570-a4d23056649a";
const publishedAt = "2026-07-20T02:54:17.133+00:00";
const withdrawnAt = "2026-09-05T12:00:00.000+00:00";

function legacySnapshot(overrides = {}) {
  return {
    snapshot_id: legacySnapshotId,
    milestone: "Opening Championship Projection",
    publication_state_revision: null,
    publication_revision: 1,
    authority_contract_version: "legacy-google-published-odds-v1",
    origin_authority: "GOOGLE",
    is_current_official: false,
    publication_lifecycle: "WITHDRAWN",
    published_at: publishedAt,
    withdrawal: {
      reason_code: "TOURNAMENT_SETUP_CHANGED",
      withdrawn_at: withdrawnAt,
    },
    ...overrides,
  };
}

function legacyWithdrawnPublication(overrides = {}) {
  return {
    authority: "SUPABASE",
    state: "WITHDRAWN",
    snapshot_id: null,
    publication_revision: 1,
    current_publication_revision: null,
    publication_pointer_revision: 2,
    predecessor_snapshot_id: legacySnapshotId,
    freshness: "CURRENT",
    adoption_kind: "LEGACY_GOOGLE_ADOPTED",
    snapshots: [legacySnapshot()],
    withdrawal_history: [{
      publication_revision: 1,
      reason_code: "TOURNAMENT_SETUP_CHANGED",
      withdrawn_at: withdrawnAt,
    }],
    ...overrides,
  };
}

function directorOdds(publication) {
  return buildProductionDirectorOverview({ oddsPublication: publication })
    .publications.odds;
}

test("Production legacy withdrawn revision 1 remains Director history but never current", () => {
  const publication = legacyWithdrawnPublication();
  const model = directorOdds(publication);

  assert.equal(model.state, "WITHDRAWN");
  assert.equal(model.label, "No current publication");
  assert.equal(model.snapshotId, "");
  assert.equal(model.pointerRevision, 2);
  assert.equal(model.revision, 1);
  assert.equal(model.history.length, 1);
  assert.deepEqual(model.history[0], {
    revision: 1,
    milestone: "Opening Championship Projection",
    publishedAt,
    provenance: "GOOGLE",
    lifecycle: "WITHDRAWN",
    withdrawnAt,
    withdrawalReason: "TOURNAMENT_SETUP_CHANGED",
  });
});

test("legacy fallback is provenance and snapshot-contract bounded exactly like migration 088", () => {
  const snapshot = legacySnapshot();
  assert.equal(productionDirectorOddsPublicationRevision(
    snapshot, legacyWithdrawnPublication(),
  ), 1);
  assert.equal(productionDirectorOddsPublicationRevision(
    { ...snapshot, authority_contract_version: "production-odds-publication-v1" },
    legacyWithdrawnPublication(),
  ), 0);
  assert.equal(productionDirectorOddsPublicationRevision(
    snapshot,
    legacyWithdrawnPublication({ adoption_kind: "SUPABASE_CALCULATED" }),
  ), 0);
  assert.equal(productionDirectorOddsPublicationRevision(
    { ...snapshot, publication_state_revision: "" },
    legacyWithdrawnPublication(),
  ), 0);
});

test("modern explicit revisions render newest-first without using or duplicating legacy history", () => {
  const modernPublication = {
    authority: "SUPABASE",
    state: "PUBLISHED",
    snapshot_id: "00000000-0000-4000-8000-000000000002",
    publication_revision: 2,
    publication_pointer_revision: 3,
    freshness: "CURRENT",
    snapshots: [
      {
        publication_state_revision: 1,
        publication_revision: 1,
        authority_contract_version: "production-odds-publication-v1",
        milestone: "Opening",
        publication_lifecycle: "WITHDRAWN",
        published_at: publishedAt,
        withdrawal: { withdrawn_at: withdrawnAt, reason_code: "TOURNAMENT_SETUP_CHANGED" },
      },
      {
        publication_state_revision: 2,
        publication_revision: 2,
        authority_contract_version: "production-odds-publication-v1",
        milestone: "Matchups Set",
        publication_lifecycle: "PUBLISHED",
        is_current_official: true,
        published_at: "2026-09-10T12:00:00.000+00:00",
      },
      {
        publication_state_revision: 1,
        publication_revision: 1,
        authority_contract_version: "production-odds-publication-v1",
        milestone: "Opening duplicate",
        publication_lifecycle: "HISTORICAL",
        published_at: "2026-07-19T12:00:00.000+00:00",
      },
    ],
  };
  const model = directorOdds(modernPublication);
  assert.deepEqual(model.history.map((item) => item.revision), [2, 1]);
  assert.equal(model.history.filter((item) => item.revision === 1).length, 1);
  assert.equal(model.state, "PUBLISHED");
  assert.equal(model.snapshotId, modernPublication.snapshot_id);
});

test("a tournament with no publication history retains the established empty state", () => {
  const model = directorOdds({
    authority: "SUPABASE",
    state: "UNPUBLISHED",
    snapshot_id: null,
    publication_revision: 0,
    publication_pointer_revision: 0,
    snapshots: [],
  });
  assert.equal(model.state, "UNPUBLISHED");
  assert.equal(model.label, "Not published");
  assert.equal(model.history, undefined);
});

test("Director history remains presentation-only and public Odds waiting state is unchanged", async () => {
  const [director, styles, publicPage] = await Promise.all([
    readFile(new URL("../app/admin/director/ProductionDirectorOperations.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/director/production-director.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/odds-center/page.js", import.meta.url), "utf8"),
  ]);
  assert.match(director, /Historical publications/);
  assert.match(director, /Publication revision \{item\.revision\}/);
  assert.match(director, /Withdrawn \{timestamp\(item\.withdrawnAt\)\}/);
  assert.match(director, /<details className=\{styles\.disclosure\}/);
  assert.match(director, /<summary>Historical publications/);
  assert.match(styles, /\.disclosure\{overflow:hidden/);
  assert.match(styles, /\.disclosure>summary\{min-height:44px/);
  assert.match(styles, /\.disclosure>summary:focus-visible\{outline:/);
  assert.match(styles, /\.jobList article\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(publicPage,
    /Updated championship projections will be available after the tournament matchups are set\./);
});
