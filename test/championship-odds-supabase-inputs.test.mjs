import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildOddsInputProjection, buildSupabaseOddsPublication, compareOddsDeterministicParity, oddsEngineInputsFromBundle } from "../lib/championship-odds-supabase.js";
import { oddsCalculationEnvironment } from "../lib/odds-calculation-source.js";
import { simulateTournamentOdds } from "../lib/tournament-odds.js";

const core = {
  tournament: { tournament_id: "2026", tournament_year: 2026 },
  teams: [{ team_id: "T1", team_side: 1, name: "The Pickles" }, { team_id: "T2", team_side: 2, name: "Lipp it and Rip it" }],
  players: [
    { player_id: "P1", display_name: "Player One", team_side: 1, participation_status: "ACTIVE" },
    { player_id: "P2", display_name: "Player Two", team_side: 2, participation_status: "ACTIVE" },
  ],
  rounds: [1, 2, 3].map((round) => ({ tournament_id: "2026", round_number: round, format: round === 3 ? "SI" : round === 2 ? "SC" : "BB", source_payload: { "Points Available": 3 } })),
  matches: [1, 2, 3].map((round) => ({ match: { match_id: `M${round}`, round_number: round, format: round === 3 ? "SI" : round === 2 ? "SC" : "BB", status: round < 3 ? "FINAL" : "UPCOMING", match_revision: 1 },
    snapshot: { course_id: "C", tee: "T", team_configuration: {} }, presentation: {}, holes: [], scores: [],
    participants: [{ player_id: "P1", team_side: 1, player_slot: 1 }, { player_id: "P2", team_side: 2, player_slot: 1 }] })),
  source_revision: { matches: [{ matchId: "M1", matchRevision: 1 }, { matchId: "M2", matchRevision: 1 }, { matchId: "M3", matchRevision: 1 }], holes: [] },
};
const historical = { P1: { sandbaggerRatings: { OVERALL: { rating: 1510, matches: 10 } } }, P2: { sandbaggerRatings: { OVERALL: { rating: 1490, matches: 10 } } } };

test("Odds input projection is versioned, deterministic, and retains exact ratings/settings", () => {
  const first = buildOddsInputProjection({ tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", settings: [{ Setting: "Z", Value: 1 }, { Setting: "A", Value: 2 }], historical });
  const second = buildOddsInputProjection({ tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", settings: [{ Setting: "A", Value: 2 }, { Setting: "Z", Value: 1 }], historical });
  assert.equal(first.bundle_fingerprint, second.bundle_fingerprint);
  assert.deepEqual(first.historical_ratings, historical);
  assert.match(first.settings_fingerprint, /^[0-9a-f]{64}$/);
  assert.match(first.ratings_fingerprint, /^[0-9a-f]{64}$/);
});

test("canonical adapter reproduces unchanged tournament-odds.js deterministically", () => {
  const projection = buildOddsInputProjection({ tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", settings: [], historical });
  const inputs = oddsEngineInputsFromBundle({ current_state: core, input_configuration: { ...projection, configuration_revision: 1 } });
  const first = simulateTournamentOdds({ ...inputs, phase: "Round 3 Pairings Announced", iterations: 10_000 });
  const second = simulateTournamentOdds({ ...inputs, phase: "Round 3 Pairings Announced", iterations: 10_000 });
  assert.equal(compareOddsDeterministicParity(first, second).pass, true);
  assert.equal(inputs.sheets.projectionMatchSource, "Supabase scoring authority");
  assert.equal(inputs.metadata.settingsFingerprint, projection.settings_fingerprint);
});

test("native publication carries reproducibility metadata without changing engine output", () => {
  const projection = buildOddsInputProjection({ tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", settings: [], historical });
  const inputs = oddsEngineInputsFromBundle({ current_state: core, input_configuration: { ...projection, configuration_revision: 1 } });
  const snapshot = simulateTournamentOdds({ ...inputs, phase: "Round 3 Pairings Announced", iterations: 10_000 });
  const publication = buildSupabaseOddsPublication({ snapshot, tournamentId: "2026", actorId: "DIRECTOR", metadata: inputs.metadata });
  assert.equal(publication.deterministic_seed, "2026|Round 3 Pairings Announced|odds-v2-nassau");
  assert.equal(publication.simulation_metadata.iterations, 10_000);
  assert.deepEqual(publication.published_payload, snapshot);
});

test("Preview flags fail closed in Production", () => {
  const env = { ODDS_CALCULATION_INPUT_SOURCE: "supabase", ODDS_PUBLICATION_AUTHORITY: "supabase", GOOGLE_SHEETS_ID: "preview", PREVIEW_SCORING_SHEET_ID: "preview",
    SUPABASE_SCORING_MIRROR_URL: "https://example.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "secret" };
  assert.deepEqual([oddsCalculationEnvironment({ ...env, VERCEL_ENV: "preview" }).inputSource, oddsCalculationEnvironment({ ...env, VERCEL_ENV: "preview" }).publicationAuthority], ["supabase", "supabase"]);
  assert.deepEqual([oddsCalculationEnvironment({ ...env, VERCEL_ENV: "production" }).inputSource, oddsCalculationEnvironment({ ...env, VERCEL_ENV: "production" }).publicationAuthority], ["google", "google"]);
});

test("migration and route are service/Director-only, idempotent, isolated, and keep the engine unchanged", async () => {
  const [migration, route, engine] = await Promise.all([
    readFile(new URL("../supabase/migrations/202608120038_preview_championship_odds_inputs_publication.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/odds/publish/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-odds.js", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /odds_input_configurations enable row level security/);
  assert.match(migration, /revoke all on function public\.publish_preview_championship_odds/);
  assert.match(migration, /odds_native_publication_idempotency_idx/);
  assert.match(migration, /FINAL_RESULTS_NOT_READY/);
  assert.match(migration, /STALE_ODDS_INPUT_CONFIGURATION/);
  assert.match(route, /inspectTournamentDirectorToken/);
  assert.match(route, /Google reporting mirror delayed/);
  assert.match(engine, /odds-v2-nassau/);
  assert.match(engine, /iterations = 10_000/);
});
