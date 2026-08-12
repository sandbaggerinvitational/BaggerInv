import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildNetSkinsConfigurationImport,
  buildNetSkinsDerivedWrite,
  calculateNetSkinsFromSupabaseView,
  compareNetSkinsParity,
  netSkinsDataFromResultView,
  netSkinsScoreRowsFromSupabaseView,
} from "../lib/net-skins-supabase.js";
import { netSkinsReadEnvironment } from "../lib/net-skins-read-source.js";

const sheet = (records) => ({ records: records.map((record) => ({ record })) });

function configurationRows() {
  return [
    { Year: 2026, Round: 1, Format: "Singles", Match: 1, "Player ID 1": "P1", "Buy-In": 25, Eligible: true },
    { Year: 2026, Round: 1, Format: "SI", Match: 1, "Player ID 1": "P2", "Buy-In": 25, Eligible: true },
    { Year: 2026, Round: 2, Format: "Scramble", Match: 1, "Player ID 1": "P1", "Player ID 2": "P2", "Team Handicap": 1, "Buy-In": 50, Eligible: true },
    { Year: 2026, Round: 2, Format: "SC", Match: 2, "Player ID 1": "P3", "Player ID 2": "P4", "Team Handicap": 0, "Buy-In": 50, Eligible: true },
  ];
}

function singlesView() {
  const holes = Array.from({ length: 18 }, (_, index) => ({ hole_number: index + 1, stroke_index: index + 1, par: 4 }));
  const scores = holes.map((hole) => ({
    hole_number: hole.hole_number,
    hole_revision: 1,
    team_1_gross_scores: [5], team_2_gross_scores: [hole.hole_number <= 5 ? 4 : 5],
    team_1_strokes: [hole.hole_number === 6 ? 1 : 0], team_2_strokes: [0],
    team_1_net_score: hole.hole_number === 6 ? 4 : 5, team_2_net_score: hole.hole_number <= 5 ? 4 : 5,
  }));
  return {
    tournament: { tournament_id: "2026", tournament_year: 2026 },
    configurations: [{
      configuration: { round_number: 1, configuration_fingerprint: "a".repeat(64) },
      entries: [
        { entry_id: "P1-entry", round_number: 1, match_number: "1", format: "SI", player_id_1: "P1", player_id_2: null, team_handicap: null, buy_in: 25, eligible: true },
        { entry_id: "P2-entry", round_number: 1, match_number: "1", format: "SI", player_id_1: "P2", player_id_2: null, team_handicap: null, buy_in: 25, eligible: true },
      ],
    }],
    matches: [{
      match: { match_id: "2026-R1-1", round_number: 1, format: "SI", status: "FINAL", scorecard_complete: true, result_winner: "Team 1" },
      presentation: { display_match_number: "1" },
      participants: [
        { player_id: "P1", display_name: "Player One", team_side: 1, player_slot: 1, playing_handicap: 6, final_strokes: 6 },
        { player_id: "P2", display_name: "Player Two", team_side: 2, player_slot: 1, playing_handicap: 0, final_strokes: 0 },
      ],
      holes, scores,
    }],
    source_revision: {
      matches: [{ matchId: "2026-R1-1", round: 1, matchRevision: 18, status: "FINAL" }],
      holes: holes.map((hole) => ({ matchId: "2026-R1-1", hole: hole.hole_number, revision: 1 })),
    },
    query_ms: 2.5,
  };
}

test("configuration import makes existing financial rules explicit and deterministic", () => {
  const first = buildNetSkinsConfigurationImport({ sheets: { "Net Skins": sheet(configurationRows()) }, tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", requestedBy: "Director" });
  const reordered = buildNetSkinsConfigurationImport({ sheets: { "Net Skins": sheet([...configurationRows()].reverse()) }, tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", requestedBy: "Director" });
  assert.equal(first.configuration_fingerprint, reordered.configuration_fingerprint);
  assert.deepEqual(first.rounds.map((round) => [round.round_number, round.entry_type, round.buy_in_per_entry, round.expected_pot, round.tie_rule, round.payout_rounding]), [
    [1, "INDIVIDUAL", 25, 50, "NO_SKIN_NO_CARRY", "NONE"],
    [2, "PAIRING", 50, 100, "NO_SKIN_NO_CARRY", "NONE"],
  ]);
});

test("configuration import rejects a financial reinterpretation", () => {
  const rows = configurationRows();
  rows[0]["Buy-In"] = 30;
  assert.throws(() => buildNetSkinsConfigurationImport({ sheets: { "Net Skins": sheet(rows) }, tournamentId: "2026", tournamentYear: 2026 }), (error) => error.code === "NET_SKINS_BUY_IN_CONTRACT_MISMATCH");
});

test("canonical adapter uses stored gross and immutable full-round stroke allocation", () => {
  const view = singlesView();
  view.matches[0].scores[5].team_1_strokes = [0];
  view.matches[0].scores[5].team_1_net_score = 5;
  const rows = netSkinsScoreRowsFromSupabaseView(view);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].scorecard.find((hole) => hole.hole === 6), { hole: 6, match: "1", gross: 5, strokes: 1, net: 4, strokeIndex: 6, par: 4 });
});

test("canonical adapter does not synthesize empty rows for unscored matches", () => {
  const view = singlesView();
  view.matches[0].scores = [];
  assert.deepEqual(netSkinsScoreRowsFromSupabaseView(view), []);
});

test("unchanged engine produces one no-carry skin and an official deterministic snapshot", () => {
  const calculated = calculateNetSkinsFromSupabaseView(singlesView());
  const round = calculated.netSkins.rounds[0];
  assert.equal(round.finalized, true);
  assert.equal(round.resultState, "OFFICIAL");
  assert.equal(round.complete, true);
  assert.equal(round.skinsAwarded, 1);
  assert.equal(round.skinValue, 50);
  assert.equal(round.skins[0].hole, 6);
  const first = buildNetSkinsDerivedWrite(singlesView(), calculated, "test");
  const second = buildNetSkinsDerivedWrite(singlesView(), calculated, "test");
  assert.equal(first.rounds[0].source_fingerprint, second.rounds[0].source_fingerprint);
  assert.equal(first.rounds[0].payload_hash, second.rounds[0].payload_hash);
});

test("result view preserves provisional/official state and reports stale jobs", () => {
  const payload = netSkinsDataFromResultView({
    snapshots: [{ round_number: 1, result_state: "OFFICIAL", result_payload: { round: 1, skins: [] }, configuration_fingerprint: "a", source_fingerprint: "b", payload_hash: "c" }],
    jobs: [{ round_number: 1, status: "SUCCEEDED" }, { round_number: 2, status: "FAILED" }],
    query_ms: 1,
  });
  assert.equal(payload.netSkins.rounds[0].resultState, "OFFICIAL");
  assert.equal(payload.stale, true);
});

test("parity comparison ignores internal entry identity but not payouts", () => {
  const calculated = calculateNetSkinsFromSupabaseView(singlesView()).netSkins;
  const equivalent = structuredClone(calculated);
  equivalent.rounds[0].leaderboard[0].id = "legacy-google-row-id";
  assert.equal(compareNetSkinsParity(calculated, equivalent).pass, true);
  equivalent.rounds[0].skinValue = 49;
  assert.equal(compareNetSkinsParity(calculated, equivalent).pass, false);
});

test("source flag is Preview-only, server-controlled, and Production fail-closed", () => {
  const common = { NET_SKINS_READ_SOURCE: "supabase", GOOGLE_SHEETS_ID: "preview-sheet", PREVIEW_SCORING_SHEET_ID: "preview-sheet", SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only" };
  assert.equal(netSkinsReadEnvironment({ ...common, VERCEL_ENV: "preview" }).resolved, "supabase");
  assert.equal(netSkinsReadEnvironment({ ...common, VERCEL_ENV: "production" }).resolved, "google");
  assert.equal(netSkinsReadEnvironment({ ...common, VERCEL_ENV: "production" }).reason, "production-hard-block");
});

test("migrations are service-only, versioned, event-invalidated, and never calculate inside scoring", async () => {
  const [migration, disabledStateMigration, allocationMigration] = await Promise.all([
    readFile(new URL("../supabase/migrations/202608120029_preview_net_skins_derived_state.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608120030_preview_net_skins_disabled_round_state.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608120031_preview_net_skins_full_handicap_input.sql", import.meta.url), "utf8"),
  ]);
  for (const table of ["net_skins_configurations", "net_skins_configuration_entries", "competition_derived_snapshots", "competition_recalculation_jobs"]) assert.match(migration, new RegExp(`alter table scoring_authority\\.${table} enable row level security`));
  assert.match(migration, /revoke all on function public\.read_net_skins_result_view\(text\) from public, anon, authenticated/);
  assert.match(migration, /after insert or update or delete on scoring_authority\.hole_scores/);
  assert.match(migration, /status = 'PENDING'/);
  assert.doesNotMatch(migration, /calculateNetSkins/);
  assert.match(disabledStateMigration, /not c\.enabled/);
  assert.match(disabledStateMigration, /revoke all on function public\.clear_disabled_net_skins_operational_state\(text\) from public, anon, authenticated/);
  assert.match(allocationMigration, /'playing_handicap', mp\.playing_handicap, 'final_strokes', mp\.final_strokes/);
  assert.match(allocationMigration, /revoke all on function public\.read_net_skins_input_view\(text\) from public, anon, authenticated/);
});

test("participant module has zero Google fallback and remains isolated from core standings", async () => {
  const [route, dashboard, wrapper, home] = await Promise.all([
    readFile(new URL("../app/api/leaderboards/net-skins/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/LeaderboardsSupabaseRead.js", import.meta.url), "utf8"),
    readFile(new URL("../app/ParticipantSupabaseHome.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /X-Net-Skins-Google-Requests/);
  assert.doesNotMatch(route, /getTournamentData|google-sheets/);
  assert.match(wrapper, /\/api\/leaderboards\/net-skins/);
  assert.match(dashboard, /Core team and player standings remain available/);
  assert.match(home, /HOME_NET_SKINS_READY/);
});
