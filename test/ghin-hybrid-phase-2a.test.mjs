import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalBulkManualHandicapSourceSaveInput,
  canonicalGhinIdentityInput,
  canonicalGolfHandicap,
  canonicalHybridDraftInput,
  canonicalManualHandicapSourceInput,
  parseBulkManualHandicapSource,
  PRODUCTION_HANDICAP_SOURCE_CONTRACT,
} from "../lib/production-handicap-source-contract.js";
import {
  disabledGhinProvider,
  GHIN_PROVIDER_AUTHORIZATION_STATE,
  normalizeGhinProviderObservation,
} from "../lib/ghin-provider-contract.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("golf notation preserves Bagger signed semantics and rejects missing or ambiguous values", () => {
  assert.equal(PRODUCTION_HANDICAP_SOURCE_CONTRACT, "production-handicap-source-v1");
  assert.equal(canonicalGolfHandicap("12.20"), "12.2");
  assert.equal(canonicalGolfHandicap("+0.8"), "-0.8");
  assert.equal(canonicalGolfHandicap("-0.8"), "-0.8");
  assert.equal(canonicalGolfHandicap("+0.0"), "0");
  assert.throws(() => canonicalGolfHandicap("NH"), /valid golf handicap/i);
  assert.throws(() => canonicalGolfHandicap(""), /valid golf handicap/i);
});

test("identity, manual observation, and Hybrid draft inputs use stable IDs and exact predecessors", () => {
  assert.deepEqual(canonicalGhinIdentityInput({ playerId: "cb01", ghinNumber: "123 4567" }), {
    player_id: "CB01", external_identifier: "1234567", expected_identity_id: null, replace_confirmed: false,
  });
  const observation = canonicalManualHandicapSourceInput({
    playerId: "CB01",
    expectedIdentityId: "10000000-0000-4000-8000-000000000001",
    expectedPointerRevision: 2,
    currentIndex: "+0.8",
    lowIndex: "-1.0",
    lowIndexDate: "2026-09-05",
  });
  assert.equal(observation.current_index, "-0.8");
  assert.equal(observation.low_index, "-1");
  assert.equal(observation.provenance, "DIRECTOR_MANUAL");
  const draft = canonicalHybridDraftInput({
    expectedRevision: 6,
    expectedSourceFingerprint: "a".repeat(64),
    effectiveDate: "2026-09-05",
    entries: [
      { playerId: "CB02", proposedHandicap: "11.50" },
      { playerId: "CB01", proposedHandicap: "+0.0" },
    ],
  });
  assert.deepEqual(draft.entries.map((entry) => entry.player_id), ["CB01", "CB02"]);
  assert.deepEqual(draft.entries.map((entry) => entry.tournament_handicap), ["0", "11.5"]);
});

test("bulk Current/Low parsing supports CSV, tabs, optional dates, plus notation, and negative zero", () => {
  const csv = parseBulkManualHandicapSource([
    "AM01,10.8,9.7,2026-03-05",
    "CB01,+0.8,+1.0,",
    "MS01,-0,0",
  ].join("\n"));
  assert.equal(csv.rowsParsed, 3);
  assert.equal(csv.errors.length, 0);
  assert.deepEqual(csv.entries, [
    { player_id: "AM01", current_index: "10.8", low_index: "9.7", low_index_date: "2026-03-05" },
    { player_id: "CB01", current_index: "-0.8", low_index: "-1", low_index_date: null },
    { player_id: "MS01", current_index: "0", low_index: "0", low_index_date: null },
  ]);
  const tabs = parseBulkManualHandicapSource("AM01\t10.8\t9.7\t2026-03-05");
  assert.equal(tabs.errors.length, 0);
  assert.equal(tabs.entries[0].low_index_date, "2026-03-05");
});

test("bulk Current/Low parsing fails closed on invalid, duplicate, and malformed rows", () => {
  const invalid = parseBulkManualHandicapSource([
    "AM01,NH,9.7,2026-03-05",
    "AM01,10.8,wat,2026-02-30",
    "CB01,12.2,10.8,not-a-date",
    "bad row",
  ].join("\n"));
  assert.equal(invalid.entries.length, 0);
  assert.ok(invalid.rows.every((row) => row.status !== "READY_FOR_SERVER_VALIDATION"));
  assert.ok(invalid.rows.some((row) => row.status === "DUPLICATE_PLAYER"));
  assert.ok(invalid.rows.some((row) => row.status === "INVALID_LOW_HI_DATE"));
  assert.ok(invalid.rows.some((row) => row.status === "INVALID_FORMAT"));
  assert.equal(
    parseBulkManualHandicapSource("AM01,NH,9.7").rows[0].status,
    "INVALID_CURRENT_HI",
  );
  assert.equal(
    parseBulkManualHandicapSource("AM01,10.8,NaN").rows[0].status,
    "INVALID_LOW_HI",
  );
});

test("bulk save input requires the exact preview fingerprint and keeps rows canonical", () => {
  const saved = canonicalBulkManualHandicapSourceSaveInput({
    expectedPreviewFingerprint: "a".repeat(64),
    entries: [
      { playerId: "CB01", currentIndex: "+0.8", lowIndex: "0.6", lowIndexDate: "" },
      { playerId: "AM01", currentIndex: "10.80", lowIndex: "9.70", lowIndexDate: "2026-03-05" },
    ],
  });
  assert.equal(saved.entry_mode, "BULK_IMPORT");
  assert.deepEqual(saved.entries.map((entry) => entry.player_id), ["AM01", "CB01"]);
  assert.deepEqual(saved.entries.map((entry) => entry.current_index), ["10.8", "-0.8"]);
  assert.throws(() => canonicalBulkManualHandicapSourceSaveInput({ entries: saved.entries }), /Preview/);
});

test("the future provider boundary is normalized but live lookup is fail-closed", async () => {
  assert.deepEqual(normalizeGhinProviderObservation({
    ghin_number: "1234567", current_index: "+0.8", low_index: "+1.0", low_index_date: "2026-09-05",
  }), {
    externalIdentifier: "1234567", currentIndex: "-0.8", lowIndex: "-1", lowIndexDate: "2026-09-05", provenance: "GHIN_SYNC",
  });
  assert.equal(disabledGhinProvider.authorizationState, GHIN_PROVIDER_AUTHORIZATION_STATE);
  await assert.rejects(
    () => disabledGhinProvider.lookupByExternalId("1234567"),
    (error) => error.code === "GHIN_PROVIDER_AUTHORIZATION_REQUIRED",
  );
});

test("migration 091 is additive, private, immutable, inert, and stages through the existing revision authority", async () => {
  const sql = await source("supabase/production_migrations/202609050091_production_ghin_hybrid_foundation_v1.sql");
  assert.match(sql, /^-- GHIN[\s\S]*begin;[\s\S]*commit;\s*$/);
  for (const table of [
    "player_external_identities_v1", "handicap_source_observations_v1",
    "handicap_source_current_v1", "handicap_source_operation_receipts_v1",
    "handicap_source_audit_events_v1",
  ]) {
    assert.match(sql, new RegExp(`create table production_control\\.${table}`));
    assert.match(sql, new RegExp(`alter table production_control\\.${table} enable row level security`));
  }
  assert.match(sql, /where status = 'VERIFIED'/);
  assert.match(sql, /generated always as \(pg_catalog\.round\(\(current_index \+ low_index\) \/ 2::numeric, 1\)\) stored/);
  assert.match(sql, /provenance in \('DIRECTOR_MANUAL', 'GHIN_SYNC'\)/);
  assert.match(sql, /source_status in \('CURRENT', 'STALE'\)/);
  assert.match(sql, /handicap_source_observations_immutable_v1/);
  assert.match(sql, /assert_exact_cutover_resource_scope\(input, false\)/);
  assert.match(sql, /assert_production_scoring_actor\(input, true\)/);
  assert.match(sql, /DIRECTOR_HYBRID_HANDICAP_REVIEW/);
  assert.match(sql, /public\.stage_production_handicap_revision_v1\(inner_input\)/);
  assert.match(sql, /'autoApproved',false/);
  assert.match(sql, /manual_tournament_handicap_override/);
  assert.match(sql, /from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /api2\.ghin\.com|http\(|net\.http|pg_net|cron\./i);
  assert.doesNotMatch(sql, /insert into production_control\.player_external_identities_v1[\s\S]*values\s*\(\s*'2026'/i);
});

test("migration 092 installs an inert atomic bulk source contract", async () => {
  const sql = await source("supabase/production_migrations/202609050092_production_handicap_source_bulk_import_v1.sql");
  assert.match(sql, /^-- GHIN[\s\S]*begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /preview_production_bulk_manual_handicap_source_v1/);
  assert.match(sql, /record_production_bulk_manual_handicap_source_v1/);
  assert.match(sql, /RECORD_BULK_MANUAL_OBSERVATIONS/);
  assert.match(sql, /PRODUCTION_HANDICAP_SOURCE_BULK_PREVIEW_STALE/);
  assert.match(sql, /entryMode','BULK_IMPORT'/);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(sql, /DIRECTOR_MANUAL/);
  assert.match(sql, /alter column low_index_date drop not null/);
  assert.doesNotMatch(sql, /api2\.ghin\.com|http\(|net\.http|pg_net|cron\./i);
  assert.doesNotMatch(sql, /insert into production_control\.handicap_source_observations_v1[\s\S]*values\s*\(\s*'2026'/i);
});

test("server and Director UI keep live GHIN disabled and private evidence out of public routes", async () => {
  const [server, route, panel, css] = await Promise.all([
    source("lib/production-handicap-source-server.js"),
    source("app/api/director/handicaps/route.js"),
    source("app/admin/director/WeeklyHandicapPanel.js"),
    source("app/admin/director/WeeklyHandicapPanel.module.css"),
  ]);
  for (const rpc of [
    "read_production_handicap_source_v1", "set_production_player_ghin_identity_v1",
    "retire_production_player_ghin_identity_v1", "record_production_manual_handicap_source_v1",
    "preview_production_bulk_manual_handicap_source_v1", "record_production_bulk_manual_handicap_source_v1",
    "stage_production_handicap_revision_from_hybrid_v1",
  ]) assert.match(server, new RegExp(`"${rpc}"`));
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /authorization\.source !== "production-director-entitlement"/);
  assert.match(panel, /GHIN Auto Refresh — Pending Provider Authorization/);
  assert.match(panel, /disabled aria-disabled="true"/);
  assert.match(panel, /Create Handicap Draft from Hybrid/);
  assert.match(panel, /Record manual source evidence/);
  assert.match(panel, /Bulk Current \/ Low Import/);
  assert.match(panel, /Preview Import/);
  assert.match(panel, /Confirm &amp; append observations|Confirm & append observations/);
  assert.match(panel, /I reviewed every Player, normalized handicap, date, and replacement status/);
  assert.match(panel, /I confirm this verified identity replacement/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /\.bulkSourceWorkspace textarea[\s\S]*font-size: 16px/);
  assert.match(css, /\.bulkSourceTable[\s\S]*overflow-x: auto/);
  assert.match(css, /\.bulkSourceConfirm[\s\S]*min-height: 44px/);
  assert.match(css, /\.bulkSourceActions button \{ width: 100%; \}/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.doesNotMatch(server, /api2\.ghin\.com|GHIN_PASSWORD|GHIN_TOKEN|favorite/i);
  assert.doesNotMatch(route, /app\/api\/(?:public|participant)|mobile|native/i);
});
