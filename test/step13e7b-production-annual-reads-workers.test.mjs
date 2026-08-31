import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { productionLiveMatchAdminDataFromSupabaseView } from
  "../lib/tournament-live-supabase.js";

async function source(relative) {
  return readFile(new URL(`../${relative}`, import.meta.url), "utf8");
}

async function importCurrentReadDispatch() {
  const original = await source("lib/production-current-read-dispatch.js");
  const transformed = original
    .replace('import "server-only";\n', "")
    .replace(
      /import \{ PRODUCTION_TOURNAMENT_ID \} from "\.\/production-foundation-resource-contract\.js";/,
      'const PRODUCTION_TOURNAMENT_ID = "2026";',
    )
    .replace(
      /import \{ readProductionCurrentTournamentRuntime \} from "\.\/production-current-tournament-runtime\.js";/,
      "async function readProductionCurrentTournamentRuntime() { throw new Error('inject runtime'); }",
    );
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

const runtime2026 = Object.freeze({
  tournamentId: "2026", tournamentYear: 2026, pointerRevision: 1,
});
const futureRuntime = Object.freeze({
  tournamentId: "2028", tournamentYear: 2028, pointerRevision: 7,
  runtimeGenerationId: "11111111-1111-4111-8111-111111111111",
  authorityGenerationId: "22222222-2222-4222-8222-222222222222",
  admissionGenerationId: "33333333-3333-4333-8333-333333333333",
});

test("current-read dispatch preserves frozen input and makes the pointer authoritative for future", async () => {
  const { resolveProductionCurrentReadDispatch } = await importCurrentReadDispatch();
  const frozenBody = { target_tournament_id: "2026", match_id: "2026-R1-1" };
  const frozen = await resolveProductionCurrentReadDispatch(
    "read_game_center_view", frozenBody,
    { readRuntime: async () => runtime2026 },
  );
  assert.equal(frozen.body, frozenBody);
  assert.equal(frozen.frozen2026, true);

  const annual = await resolveProductionCurrentReadDispatch(
    "read_game_center_view",
    { target_tournament_id: "2026", match_id: "2028-R1-1" },
    { readRuntime: async () => futureRuntime },
  );
  assert.equal(annual.body.target_tournament_id, "2028");
  assert.deepEqual(annual.annualRuntimeInput, {
    expected_current_tournament_id: "2028",
    expected_pointer_revision: 7,
    expected_runtime_generation_id: futureRuntime.runtimeGenerationId,
    expected_annual_authority_generation_id: futureRuntime.authorityGenerationId,
    expected_annual_admission_generation_id: futureRuntime.admissionGenerationId,
  });
  const history = await resolveProductionCurrentReadDispatch(
    "read_production_history_2026", frozenBody,
    { readRuntime: async () => { throw new Error("history must not resolve current"); } },
  );
  assert.equal(history.pointerAware, false);
  assert.equal(history.body, frozenBody);
});

test("future Director live DTO is canonical and tournament scoped", () => {
  const data = productionLiveMatchAdminDataFromSupabaseView({
    tournament: { tournament_id: "2028", tournament_year: 2028, name: "Annual" },
    teams: [
      { tournament_id: "2028", team_id: "A", team_side: 1, name: "Alpha" },
      { tournament_id: "2028", team_id: "B", team_side: 2, name: "Bravo" },
    ],
    players: [
      { player_id: "AA01", display_name: "A One", team_side: 1 },
      { player_id: "BB01", display_name: "B One", team_side: 2 },
    ],
    rounds: [], matches: [],
  });
  assert.equal(data.tournamentId, "2028");
  assert.deepEqual(data.matches, []);
  assert.deepEqual(data.teams.map((row) => row.Year), [2028, 2028]);
  assert.deepEqual(data.rosters.map((row) => row.year), [2028, 2028]);
  assert.deepEqual(data.players.map((row) => row.id), ["AA01", "BB01"]);
});

test("071 fences legacy current reads and exact-binds annual reads, sidegames, Odds, and jobs", async () => {
  const migration = await source(
    "supabase/production_migrations/202608300071_production_annual_reads_workers_v1.sql",
  );
  assert.match(migration, /if[\s\S]*surface[\s\S]*= 'HISTORY_2026'[\s\S]*frozen_2026_v1/);
  assert.match(migration, /pg_advisory_xact_lock_shared\([\s\S]*scoring_admission_lock_key/);
  for (const token of [
    "expected_current_tournament_id", "expected_pointer_revision",
    "expected_runtime_generation_id", "expected_annual_authority_generation_id",
    "expected_annual_admission_generation_id",
  ]) assert.match(migration, new RegExp(token));
  assert.match(migration, /annual_scoring_runtime_authorities_v1[\s\S]*authority_status = 'ACTIVE'/);
  assert.match(migration, /future_google_writer_targets_v2[\s\S]*contract_status = 'CERTIFIED'/);
  assert.match(migration, /read_annual_net_skins_v1\(target\)/);
  assert.match(migration, /read_annual_calcutta_v1\([\s\S]*target/);
  assert.match(migration, /read_published_odds_view\([\s\S]*annual_resource\.source_workbook_id/);
  assert.doesNotMatch(migration, /PRODUCTION_ANNUAL_(?:NET_SKINS|CALCUTTA)_READER_NOT_CONFIGURED/);
  for (const table of [
    "google_outbox_events", "scorecard_archive_jobs",
    "competition_recalculation_jobs", "net_skins_v1_recalculation_jobs",
    "calcutta_v1_recalculation_jobs", "odds_calculation_jobs",
    "odds_google_mirror_jobs",
  ]) assert.match(migration, new RegExp(`alter table scoring_authority\\.${table}[\\s\\S]*runtime_generation_id`));
  assert.doesNotMatch(migration, /environment['"]?\s*[,=]\s*['"]PREVIEW/);
});

test("future Google schema is inert, immutable, leased, readback-bound, and V1 revoked", async () => {
  const migration = await source(
    "supabase/production_migrations/202608300071_production_annual_reads_workers_v1.sql",
  );
  assert.match(migration, /Installation deliberately creates no writer generation or target/);
  assert.doesNotMatch(migration, /insert into production_control\.future_google_writer_generations_v2/);
  assert.doesNotMatch(migration, /insert into production_control\.future_google_writer_targets_v2/);
  assert.match(migration, /future_google_writer_generation_immutable_v2/);
  assert.match(migration, /future_google_writer_target_immutable_v2/);
  assert.match(migration, /status = 'RETRYABLE'[\s\S]*lease_expires_at = null/);
  assert.match(migration, /lease_expires_at < pg_catalog\.clock_timestamp\(\)/);
  assert.match(migration, /readback_checkpoint[\s\S]*runtimeRevision/);
  assert.match(migration, /structural_fingerprint[\s\S]*expected_structural_fingerprint/);
  assert.match(migration, /claim_production_future_match_google_compatibility_v1\(jsonb\)[\s\S]*revoke all/);
  assert.match(migration, /read_production_annual_google_destination_v1\(jsonb\)/);
});

test("future live/guide/archive source paths cannot use a caller-selected year", async () => {
  const [live, guide, archive, outbox] = await Promise.all([
    source("app/api/live-matches/route.js"),
    source("app/api/participant/tournament-guide/route.js"),
    source("lib/scorecard-archive-worker.js"),
    source("lib/scoring-google-outbox.js"),
  ]);
  assert.match(live, /runtime\.tournamentId === "2026"[\s\S]*readLiveMatchAdminData/);
  assert.match(live, /else \{[\s\S]*readTournamentLiveView[\s\S]*productionLiveMatchAdminDataFromSupabaseView/);
  assert.doesNotMatch(guide, /tournamentId:\s*["']2026["']/);
  assert.match(guide, /const tournamentId = clean\([\s\S]*read\.payload\.target_tournament_id/);
  for (const worker of [archive, outbox]) {
    assert.match(worker, /resolveProductionScoringDispatchContext/);
    assert.match(worker, /productionScoringDispatchGoogleResources/);
    assert.match(worker, /scoringDispatchContext/);
  }
});
