import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCalcuttaConfigurationImport,
  buildCalcuttaDerivedWrite,
  calculateCalcuttaFromSupabaseViews,
  calcuttaDataFromResultView,
  compareCalcuttaParity,
} from "../lib/calcutta-supabase.js";
import { calcuttaReadEnvironment } from "../lib/calcutta-read-source.js";

const sheet = (headers, records) => ({ headers, records: records.map((record) => ({ record })) });
const year = 2026;

function configurationSheets({ ownership = null, payouts = null, purchases = null } = {}) {
  return {
    "Calcutta Purchases": sheet(["Year", "Golfer Player ID", "Purchase Price"], purchases || [
      { Year: year, "Golfer Player ID": "P1", "Purchase Price": 100 },
      { Year: year, "Golfer Player ID": "P2", "Purchase Price": 200 },
    ]),
    "Calcutta Ownership": sheet(["Year", "Golfer Player ID", "Owner Player ID", "Ownership %"], ownership || [
      { Year: year, "Golfer Player ID": "P1", "Owner Player ID": "P1", "Ownership %": 50 },
      { Year: year, "Golfer Player ID": "P1", "Owner Player ID": "P2", "Ownership %": 50 },
      { Year: year, "Golfer Player ID": "P2", "Owner Player ID": "P2", "Ownership %": 100 },
    ]),
    "Calcutta Point Structure": sheet(["Year", "Place", "Round 1 Award", "Round 2 Award", "Round 3 Award"], [
      { Year: year, Place: 1, "Round 1 Award": 10, "Round 2 Award": 20, "Round 3 Award": 30 },
      { Year: year, Place: 2, "Round 1 Award": 5, "Round 2 Award": 10, "Round 3 Award": 15 },
    ]),
    "Calcutta Payout": sheet(["Year", "Place", "Round 1 Award %", "Round 2 Award %", "Round 3 Award %", "Overall Award %"], payouts || [
      { Year: year, Place: 1, "Round 1 Award %": 10, "Round 2 Award %": 10, "Round 3 Award %": 10, "Overall Award %": 50 },
      { Year: year, Place: 2, "Round 1 Award %": 5, "Round 2 Award %": 5, "Round 3 Award %": 5, "Overall Award %": 5 },
    ]),
  };
}

function imported(sheets = configurationSheets()) {
  return buildCalcuttaConfigurationImport({ sheets, tournamentId: "2026", tournamentYear: year,
    sourceWorkbookId: "preview-workbook", requestedBy: "Director" });
}

function coreData() {
  return {
    tournament: { id: "2026", year },
    players: [{ id: "P1", name: "Player One" }, { id: "P2", name: "Player Two" }],
    rounds: [
      { number: 1, status: "FINAL", matches: [{ id: "2026-R1-1", status: "FINAL" }] },
      { number: 2, status: "FINAL", matches: [{ id: "2026-R2-1", status: "FINAL" }] },
      { number: 3, status: "UPCOMING", matches: [{ id: "2026-R3-1", status: "UPCOMING" }] },
    ],
    scoreLeaderboard: [
      { id: "P1", round: 1, format: "SI", playerIds: ["P1"], gross: 80, net: 70 },
      { id: "P2", round: 1, format: "SI", playerIds: ["P2"], gross: 82, net: 72 },
      { id: "2026-R2-1:team-1", round: 2, format: "SC", playerIds: ["P1", "P2"], gross: 70, net: 68 },
    ],
    sourceRevision: {
      matches: [
        { matchId: "2026-R1-1", matchRevision: 19, status: "FINAL" },
        { matchId: "2026-R2-1", matchRevision: 20, status: "FINAL" },
        { matchId: "2026-R3-1", matchRevision: 0, status: "UPCOMING" },
      ],
      holes: [{ matchId: "2026-R1-1", holeNumber: 1, holeRevision: 1 }, { matchId: "2026-R2-1", holeNumber: 1, holeRevision: 1 }],
    },
  };
}

function configurationView(value = imported()) {
  return { tournament: { tournament_id: "2026", tournament_year: year }, configuration: {
    configuration_fingerprint: value.configuration_fingerprint,
    purchases: value.purchases, ownership: value.ownership,
    point_structure: value.point_structure, payout_structure: value.payout_structure,
  } };
}

test("configuration import makes every financial input explicit and deterministic", () => {
  const first = imported();
  const reorderedSheets = configurationSheets();
  for (const tab of Object.keys(reorderedSheets)) reorderedSheets[tab].records.reverse();
  const reordered = imported(reorderedSheets);
  assert.equal(first.configuration_fingerprint, reordered.configuration_fingerprint);
  assert.equal(first.financial_contract.total_market_value, 300);
  assert.equal(first.financial_contract.total_payout_fraction, 1);
  assert.deepEqual(first.financial_contract.payout_allocation, { round_1: 0.15, round_2: 0.15, round_3: 0.15, overall: 0.55 });
  assert.deepEqual(first.financial_contract.ownership_totals, { P1: 1, P2: 1 });
});

test("configuration import rejects duplicate purchases, invalid ownership, and payout leakage", () => {
  const duplicate = configurationSheets({ purchases: [
    { Year: year, "Golfer Player ID": "P1", "Purchase Price": 100 },
    { Year: year, "Golfer Player ID": "P1", "Purchase Price": 200 },
  ] });
  assert.throws(() => imported(duplicate), (error) => error.code === "DUPLICATE_CALCUTTA_PURCHASE");
  const invalidOwnership = configurationSheets({ ownership: [
    { Year: year, "Golfer Player ID": "P1", "Owner Player ID": "P1", "Ownership %": 90 },
    { Year: year, "Golfer Player ID": "P2", "Owner Player ID": "P2", "Ownership %": 100 },
  ] });
  assert.throws(() => imported(invalidOwnership), (error) => error.code === "CALCUTTA_OWNERSHIP_TOTAL_MISMATCH");
  const invalidPayout = configurationSheets();
  invalidPayout["Calcutta Payout"].records[0].record["Overall Award %"] = 40;
  assert.throws(() => imported(invalidPayout), (error) => error.code === "CALCUTTA_PAYOUT_TOTAL_MISMATCH");
});

test("canonical Supabase adapter reuses the existing engine and preserves Scramble pairing allocation", () => {
  const calculated = calculateCalcuttaFromSupabaseViews(configurationView(), coreData());
  assert.equal(calculated.calcutta.pot, 300);
  assert.deepEqual(calculated.calcutta.completedRounds, [1, 2]);
  assert.equal(calculated.resultState, "PROVISIONAL");
  assert.equal(calculated.canonicalInputVerification.scramblePairingRows, 1);
  const roundTwo = calculated.calcutta.golfers.map((golfer) => golfer.rounds[2]);
  assert.equal(roundTwo[0].place, 1);
  assert.equal(roundTwo[1].place, 1);
  assert.equal(roundTwo[0].teamAward, undefined);
  assert.equal(roundTwo[0].points + roundTwo[1].points, 20);
  assert.equal(roundTwo[0].payoutPercent + roundTwo[1].payoutPercent, 0.1);
});

test("financial result fingerprints and logical payload are deterministic", () => {
  const config = configurationView();
  const calculated = calculateCalcuttaFromSupabaseViews(config, coreData());
  const claim = { claim_started_at: "2026-01-01T00:00:00.000Z" };
  const first = buildCalcuttaDerivedWrite(config, calculated, claim, "test");
  const second = buildCalcuttaDerivedWrite(config, calculated, claim, "test");
  assert.equal(first.configuration_fingerprint, second.configuration_fingerprint);
  assert.equal(first.source_fingerprint, second.source_fingerprint);
  assert.equal(first.payload_hash, second.payload_hash);
  assert.equal(compareCalcuttaParity(calculated.calcutta, first.result_payload).pass, true);
});

test("financial parity is insensitive only to owner and portfolio investment ordering", () => {
  const model = calculateCalcuttaFromSupabaseViews(configurationView(), coreData()).calcutta;
  const reordered = structuredClone(model);
  reordered.golfers.forEach((golfer) => golfer.owners?.reverse());
  reordered.portfolios.forEach((portfolio) => portfolio.investments?.reverse());
  assert.equal(compareCalcuttaParity(model, reordered).pass, true);
});

test("stored financial result exposes explicit provisional/stale state", () => {
  const calculated = calculateCalcuttaFromSupabaseViews(configurationView(), coreData());
  const write = buildCalcuttaDerivedWrite(configurationView(), calculated, { claim_started_at: "2026-01-01T00:00:00.000Z" }, "test");
  const result = calcuttaDataFromResultView({ snapshots: [{ engine_key: "CALCUTTA", engine_version: write.engine_version,
    configuration_fingerprint: write.configuration_fingerprint, source_fingerprint: write.source_fingerprint,
    result_state: "PROVISIONAL", result_payload: write.result_payload, payload_hash: write.payload_hash }],
  jobs: [{ engine_key: "CALCUTTA", status: "FAILED" }], query_ms: 2 });
  assert.equal(result.calcutta.pot, 300);
  assert.equal(result.snapshot.resultState, "PROVISIONAL");
  assert.equal(result.stale, true);
});

test("Preview flag is server-only and Production fails closed to Google", () => {
  const env = { CALCUTTA_READ_SOURCE: "supabase", GOOGLE_SHEETS_ID: "preview", PREVIEW_SCORING_SHEET_ID: "preview",
    SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "server" };
  assert.equal(calcuttaReadEnvironment({ ...env, VERCEL_ENV: "preview" }).resolved, "supabase");
  assert.equal(calcuttaReadEnvironment({ ...env, VERCEL_ENV: "production" }).resolved, "google");
  assert.equal(calcuttaReadEnvironment({ ...env, VERCEL_ENV: "production" }).reason, "production-hard-block");
});

test("migration is versioned, service-only, immutable, and asynchronous from scoring", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202608120037_preview_calcutta_operational_state.sql", import.meta.url), "utf8");
  for (const table of ["calcutta_configuration_import_runs", "calcutta_configurations"]) {
    assert.match(migration, new RegExp(`alter table scoring_authority\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on scoring_authority\\.${table} from public, anon, authenticated`));
  }
  assert.match(migration, /status = 'SUPERSEDED'/);
  assert.match(migration, /priorConfigurationPreserved/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /STALE_CALCUTTA_CONFIGURATION/);
  assert.match(migration, /competition_derived_snapshots/);
  assert.doesNotMatch(migration, /buildCalcuttaModel|calculateCalcutta/);
});

test("participant routes share one Tournament-owned Supabase operational result with zero Google fallback", async () => {
  const [route, tournamentRoute, tournamentDashboard, leaderboardsDashboard, wrapper] = await Promise.all([
    readFile(new URL("../app/api/leaderboards/calcutta/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tournament/secondary/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/TournamentDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/LeaderboardsSupabaseRead.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /X-Calcutta-Google-Requests/);
  assert.doesNotMatch(route, /getTournamentData|google-sheets/);
  assert.match(tournamentRoute, /currentCalcuttaOperationalResult/);
  assert.match(tournamentDashboard, /href="\/live\?view=calcutta"/);
  assert.match(tournamentDashboard, /\?module=calcutta/);
  assert.doesNotMatch(wrapper, /\/api\/leaderboards\/calcutta/);
  assert.doesNotMatch(leaderboardsDashboard, /\["calcutta", "Calcutta"\]/);
});
