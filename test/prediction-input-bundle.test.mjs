import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPredictionInputBundle,
  championshipOddsInputFromPredictionBundle,
  comparePredictionInputBundles,
  PREDICTION_EVIDENCE_POLICY_VERSION,
  PREDICTION_INPUT_BUNDLE_VERSION,
  predictionInputCompatibilityReport,
  predictionInputFingerprint,
  scopePredictionInputBundle,
  validatePredictionInputBundle,
} from "../lib/prediction-input-bundle-contract.js";
import {
  predictionInputBundleEnvironment,
  requirePredictionInputBundleEnvironment,
} from "../lib/prediction-input-bundle-source.js";
import { oddsEngineInputsFromBundle } from "../lib/championship-odds-supabase.js";
import {
  PREDICTION_SETTINGS_CONTRACT_VERSION,
  PREDICTION_SETTINGS_DEFAULTS,
} from "../lib/prediction-settings-contract.js";
import {
  predictionSettingsProjectionFromView,
  predictionSettingsViewFromOddsConfiguration,
} from "../lib/prediction-settings-supabase.js";
import { compareOddsDeterministicParity } from "../lib/championship-odds-supabase.js";
import { simulateTournamentOdds } from "../lib/tournament-odds.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewEnv = {
  VERCEL_ENV: "preview",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "test-only",
};

function holes(matchId, courseId) {
  return Array.from({ length: 18 }, (_, index) => ({
    match_id: matchId,
    snapshot_id: `${matchId}:S1`,
    course_id: courseId,
    hole_number: index + 1,
    par: index % 5 === 0 ? 5 : index % 4 === 0 ? 3 : 4,
    yardage: 350 + index,
    stroke_index: index + 1,
  }));
}

function scores(matchId, format, count = 18) {
  const teamSize = format === "SI" ? 1 : format === "SC" ? 1 : 2;
  return Array.from({ length: count }, (_, index) => ({
    match_id: matchId,
    hole_number: index + 1,
    hole_revision: 1,
    team_1_gross_scores: Array(teamSize).fill(4),
    team_2_gross_scores: Array(teamSize).fill(5),
    team_1_strokes: Array(teamSize).fill(0),
    team_2_strokes: Array(teamSize).fill(0),
    team_1_net_score: 4,
    team_2_net_score: 5,
    hole_winner: "Team 1",
    updated_at: "2026-08-20T00:00:00Z",
  }));
}

function participant(matchId, playerId, teamId, side, slot, handicap) {
  return {
    match_id: matchId,
    player_id: playerId,
    team_id: teamId,
    team_side: side,
    player_slot: slot,
    handicap_index: handicap,
    course_handicap: handicap,
    playing_handicap: handicap,
    final_strokes: handicap - 5,
  };
}

function matchEntry({ id, round, format, status, players, scoreCount = 0, display }) {
  const courseId = `C${round}`;
  const allHoles = holes(id, courseId);
  const snapshot = {
    snapshot_id: `${id}:S1`,
    course_id: courseId,
    course_name: `Course ${round}`,
    tee: `Tee ${round}`,
    rating: 70 + round / 10,
    slope: 120 + round,
    par: allHoles.reduce((sum, hole) => sum + hole.par, 0),
    format,
    team_configuration: {},
  };
  return {
    match: {
      match_id: id,
      tournament_id: "2026",
      round_number: round,
      format,
      status,
      scoring_snapshot_id: snapshot.snapshot_id,
      scoring_locked: status === "FINAL",
      scorecard_complete: scoreCount === 18,
      current_hole: scoreCount,
      match_revision: status === "LIVE" ? 4 : 2,
      result_winner: scoreCount === 18 ? "Team 1" : "",
    },
    round: { tournament_id: "2026", round_number: round, format, name: `Round ${round}` },
    snapshot,
    presentation: { display_match_number: display, course_name: `Course ${round}` },
    participants: players,
    holes: allHoles,
    scores: scores(id, format, scoreCount),
  };
}

function currentState() {
  const players = [
    { player_id: "P1", display_name: "Player One", team_id: "T1", team_side: 1, participation_status: "ACTIVE", tournament_source_payload: { "Tournament Handicap": 6, "Roster Order": 1 } },
    { player_id: "P2", display_name: "Player Two", team_id: "T1", team_side: 1, participation_status: "ACTIVE", tournament_source_payload: { "Tournament Handicap": 8, "Roster Order": 2 } },
    { player_id: "P3", display_name: "Player Three", team_id: "T2", team_side: 2, participation_status: "ACTIVE", tournament_source_payload: { "Tournament Handicap": 7, "Roster Order": 1 } },
    { player_id: "P4", display_name: "Player Four", team_id: "T2", team_side: 2, participation_status: "ACTIVE", tournament_source_payload: { "Tournament Handicap": 9, "Roster Order": 2 } },
  ];
  const entries = [
    matchEntry({ id: "M1", round: 1, format: "BB", status: "FINAL", display: 1, scoreCount: 18, players: [
      participant("M1", "P1", "T1", 1, 1, 6), participant("M1", "P2", "T1", 1, 2, 8),
      participant("M1", "P3", "T2", 2, 1, 7), participant("M1", "P4", "T2", 2, 2, 9),
    ] }),
    matchEntry({ id: "M2", round: 2, format: "SC", status: "LIVE", display: 1, scoreCount: 18, players: [
      participant("M2", "P1", "T1", 1, 1, 6), participant("M2", "P2", "T1", 1, 2, 8),
      participant("M2", "P3", "T2", 2, 1, 7), participant("M2", "P4", "T2", 2, 2, 9),
    ] }),
    matchEntry({ id: "M3", round: 3, format: "SI", status: "UPCOMING", display: 1, players: [
      participant("M3", "P1", "T1", 1, 1, 6), participant("M3", "P3", "T2", 2, 1, 7),
    ] }),
    matchEntry({ id: "M4", round: 3, format: "SI", status: "UPCOMING", display: 2, players: [
      participant("M4", "P2", "T1", 1, 1, 8), participant("M4", "P4", "T2", 2, 1, 9),
    ] }),
  ];
  return {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "2026 Sandbagger Invitational" },
    teams: [
      { tournament_id: "2026", team_id: "T1", team_side: 1, name: "Pickles", captain_id: "P1" },
      { tournament_id: "2026", team_id: "T2", team_side: 2, name: "Lipp it and Rip it", captain_id: "P3" },
    ],
    players,
    rounds: [
      { tournament_id: "2026", round_id: "R1", round_number: 1, format: "BB", source_payload: { "Points Available": 3 } },
      { tournament_id: "2026", round_id: "R2", round_number: 2, format: "SC", source_payload: { "Points Available": 3 } },
      { tournament_id: "2026", round_id: "R3", round_number: 3, format: "SI", source_payload: { "Points Available": 3 } },
    ],
    matches: entries,
    tournament_presentation: { presentation: { tournament: { status: "Live", configuredStatus: "Live", currentRound: 3, timeZone: "America/Chicago" } } },
    source_revision: {
      matches: entries.map((entry) => ({ matchId: entry.match.match_id, matchRevision: entry.match.match_revision, status: entry.match.status })),
      holes: entries.flatMap((entry) => entry.scores.map((score) => ({ matchId: entry.match.match_id, holeNumber: score.hole_number, holeRevision: score.hole_revision }))),
    },
    query_ms: 7,
  };
}

function historicalCourse(year) {
  const hasHoles = year >= 2023;
  return {
    Year: year,
    Round: "Round 1",
    "Course ID": `H${year}`,
    "Source Course ID": `H${year}`,
    Course: `${year} Course`,
    "Tee Played": hasHoles ? "Blue" : "",
    Rating: hasHoles ? 71 : null,
    Slope: hasHoles ? 125 : null,
    Yardage: hasHoles ? 6500 : null,
    Par: hasHoles ? 72 : null,
    holeDefinitions: hasHoles ? Array.from({ length: 18 }, (_, index) => ({ hole_number: index + 1, par: 4, yardage: 360 + index, stroke_index: index + 1 })) : [],
  };
}

function completedView(year) {
  return {
    source: "supabase",
    year,
    tournament: { id: String(year), courses: [historicalCourse(year)] },
    rawMatches: [{
      Year: year, Round: 1, Format: "SI", "Match ID": `${year}-R1-1`, "Course ID": `H${year}`,
      "Team 1 Player 1": "P1", "Team 2 Player 1": "P3", "Matchup Winner": "Team 1",
      "Team 1 Player 1 Playing HCP": 6, "Team 1 Player 1 Stroke": 0,
      "Team 2 Player 1 Playing HCP": 7, "Team 2 Player 1 Stroke": 1,
      "Team 1 Points": 1, "Team 2 Points": 0,
    }],
    roundPoints: [{ round: 1, format: "SI", course: `${year} Course`, pointsAvailable: 1 }],
    recordEligibility: year === 2023 ? [{ matchId: "2023-R1-1", playerId: "P1", includeOfficialRecord: false, reasonCode: "GHOST_MATCH" }] : [],
    revision: { revision_id: `${year}-revision`, source_fingerprint: `${year}`.repeat(16).slice(0, 64) },
    diagnostics: { adapterFingerprint: predictionInputFingerprint({ year }) },
  };
}

const emptyRecord = () => ({ wins: 0, losses: 0, halves: 0, matches: 0, points: 0 });

function statsFor(id, index) {
  const overall = { wins: 4 - index, losses: index, halves: 1, matches: 5, points: 7 - index };
  return {
    records: { overall, BB: overall, SC: emptyRecord(), SI: overall },
    percentages: { overall: 70 - index * 10, BB: 70 - index * 10, SC: 50, SI: 70 - index * 10 },
    appearances: [2023, 2024, 2025, 2026],
    championships: id === "P1" ? [2024] : [],
    seasons: [{ year: 2025, overall }],
    sandbaggerRatings: {
      OVERALL: { rating: 1515 - index * 10, matches: 5, peak: 1520 },
      BB: { rating: 1510 - index * 10, matches: 3, peak: 1515 },
      SI: { rating: 1505 - index * 10, matches: 2, peak: 1510 },
    },
  };
}

function historicalScorecards() {
  const full = {
    id: "2024:P1", year: 2024, round: 1, matchId: "2024-R1-1", courseId: "H2024", tee: "Blue",
    playerId: "P1", entityType: "PLAYER", status: "COMPLETE",
    holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, score: 4, par: 4, yardage: 360 + index, strokeIndex: index + 1, toPar: 0 })),
  };
  return [full, {
    id: "2025:P3", year: 2025, round: 1, matchId: "2025-R1-1", courseId: "H2025", tee: "Blue",
    playerId: "P3", entityType: "PLAYER", status: "PARTIAL",
    holes: full.holes.slice(0, 9),
  }];
}

function secondaryHistory() {
  const playerIds = ["P1", "P2", "P3", "P4"];
  const byPlayer = Object.fromEntries(playerIds.map((id, index) => [id, statsFor(id, index)]));
  const partnerships = [{ key: "P1|P2", record: { wins: 2, losses: 1, halves: 0, matches: 3, points: 4 }, byFormat: { BB: { wins: 2, losses: 1, halves: 0, matches: 3, points: 4 }, SC: emptyRecord(), SI: emptyRecord() } }];
  return {
    source: "supabase",
    completedViews: Array.from({ length: 9 }, (_, index) => completedView(2017 + index)),
    currentView: { source: "supabase", year: 2026 },
    scorecardAnalytics: { scorecards: historicalScorecards() },
    calculations: {
      data: {
        players: playerIds.map((id) => ({ "Player ID": id, "Display Name": `Player ${id.slice(1)}` })),
        handicaps: playerIds.flatMap((id, index) => [2024, 2025].map((year) => ({ Year: year, "Player ID": id, "Team Side": index < 2 ? "Team 1" : "Team 2", "Tournament Handicap": 6 + index }))),
      },
      getPlayers: () => playerIds.map((id) => ({ "Player ID": id, "Display Name": `Player ${id.slice(1)}` })),
      getAllPlayerStats: () => playerIds.map((id) => ({ player: { "Player ID": id }, stats: byPlayer[id] })),
      getPartnershipStats: () => ({ byMatches: partnerships }),
      getHeadToHead: () => ({ overall: emptyRecord(), byFormat: { BB: emptyRecord(), SC: emptyRecord(), SI: emptyRecord() }, meetings: [] }),
    },
    diagnostics: { contract: "secondary-history-calculation-v1", totalServiceMs: 12 },
  };
}

function settingsProjection(freshness = "UNKNOWN") {
  return {
    tournamentId: "2026",
    revision: 2,
    sourceFingerprint: "a".repeat(64),
    effectiveSettingsFingerprint: predictionInputFingerprint(PREDICTION_SETTINGS_DEFAULTS),
    contractVersion: PREDICTION_SETTINGS_CONTRACT_VERSION,
    effectiveSettings: { ...PREDICTION_SETTINGS_DEFAULTS },
    validationStatus: "VALID",
    projectionStatus: "VALID",
    freshness,
  };
}

function build(options = {}) {
  return buildPredictionInputBundle({
    currentState: currentState(),
    secondaryHistory: secondaryHistory(),
    predictionSettings: settingsProjection(),
    preparedAt: "2026-08-21T00:00:00.000Z",
    ...options,
  });
}

test("one versioned bundle composes canonical tournament, history, settings, evidence, and provenance", () => {
  const bundle = build();
  assert.equal(bundle.metadata.contractVersion, PREDICTION_INPUT_BUNDLE_VERSION);
  assert.equal(bundle.evidence.policyVersion, PREDICTION_EVIDENCE_POLICY_VERSION);
  assert.equal(bundle.metadata.source, "CERTIFIED_SUPABASE_PROJECTIONS_ONLY");
  assert.equal(bundle.metadata.googleForegroundReads, 0);
  assert.equal(bundle.metadata.hiddenFallback, false);
  assert.equal(bundle.teams.length, 2);
  assert.deepEqual(bundle.players.map((row) => row.id), ["P1", "P2", "P3", "P4"]);
  assert.deepEqual(bundle.historicalFacts.years, [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  assert.equal(Object.keys(bundle.predictionSettings.effectiveSettings).length, 30);
  assert.match(bundle.fingerprints.bundle, /^[0-9a-f]{64}$/);
  assert.equal(bundle.provenance.predictionSettings.revision, 2);
  assert.equal(bundle.historicalFacts.rounds.length, 9);
  assert.equal(bundle.historicalFacts.rounds.every((row) => row.scoringSemantics === "CERTIFIED_HISTORICAL_FACT"), true);
  const frozenHistorical = bundle.handicaps.frozenMatchFacts.find((row) => row.matchId === "2024-R1-1" && row.playerId === "P3");
  assert.equal(frozenHistorical.playingHandicap, 7);
  assert.equal(frozenHistorical.appliedStrokes, 1);
  assert.equal(frozenHistorical.authority, "IMMUTABLE_HISTORICAL_MATCH_FACT");
});

test("current canonical lifecycle keeps a populated reopened scorecard unofficial", () => {
  const bundle = build();
  const final = bundle.matches.find((row) => row.id === "M1");
  const reopened = bundle.matches.find((row) => row.id === "M2");
  assert.equal(final.lifecycle, "FINAL");
  assert.equal(final.points.official.teamOne, 3);
  assert.equal(reopened.lifecycle, "LIVE");
  assert.deepEqual(reopened.points.official, { teamOne: null, teamTwo: null });
  assert.equal(reopened.points.current.teamOne, 3);
  assert.equal(bundle.tournament.teamScore.teamOne, 3);
  assert.equal(bundle.tournament.matchCounts.final, 1);
  assert.equal(bundle.tournament.matchCounts.nonFinal, 3);
  assert.equal(bundle.scorecards.filter((row) => row.matchId === "M2").every((row) => row.availability === "COMPLETE" && row.lifecycle === "LIVE"), true);
});

test("scorecard evidence is complete, partial, or unavailable without zero filling", () => {
  const bundle = build();
  const full = bundle.scorecards.find((row) => row.id === "2024:P1");
  const partial = bundle.scorecards.find((row) => row.id === "2025:P3");
  const upcoming = bundle.scorecards.find((row) => row.matchId === "M3");
  assert.equal(full.availability, "COMPLETE");
  assert.equal(full.recordedHoles, 18);
  assert.equal(partial.availability, "PARTIAL");
  assert.equal(partial.recordedHoles, 9);
  assert.equal(upcoming.availability, "UNAVAILABLE");
  assert.deepEqual(upcoming.holes, []);
  assert.equal(bundle.evidence.missingValuesAreNeverZeroFilled, true);
  assert.deepEqual(bundle.evidence.noTrustworthyScorecardYears, [2017, 2018, 2019, 2020, 2021, 2022]);
});

test("historical and current course configurations remain temporally distinct", () => {
  const bundle = build();
  const historical = bundle.courses.find((row) => row.appearanceId === "2024:R1:H2024");
  const current = bundle.courses.find((row) => row.year === 2026 && row.stableCourseId === "C1");
  assert.equal(historical.tee, "Blue");
  assert.equal(historical.holes.length, 18);
  assert.equal(current.tee, "Tee 1");
  assert.equal(current.holes.length, 18);
  assert.notEqual(historical.rating, current.rating);
});

test("bundle fingerprint excludes preparation time and changes with deterministic pairing order", () => {
  const first = build({ preparedAt: "2026-08-21T00:00:00Z" });
  const second = build({ preparedAt: "2026-08-22T00:00:00Z" });
  assert.equal(first.fingerprints.bundle, second.fingerprints.bundle);
  const changedState = currentState();
  changedState.matches = [changedState.matches[0], changedState.matches[1], changedState.matches[3], changedState.matches[2]];
  const changed = buildPredictionInputBundle({ currentState: changedState, secondaryHistory: secondaryHistory(), predictionSettings: settingsProjection(), preparedAt: "2026-08-21T00:00:00Z" });
  assert.notEqual(first.fingerprints.sections.pairings, changed.fingerprints.sections.pairings);
  assert.deepEqual(first.fingerprints.invocationFieldsExcluded, ["phase", "iterations", "engineVersion", "seed", "requestTime", "publicationTime"]);
});

test("championship compatibility derives the unchanged deterministic engine contract", () => {
  const state = currentState();
  const bundle = buildPredictionInputBundle({ currentState: state, secondaryHistory: secondaryHistory(), predictionSettings: settingsProjection(), preparedAt: "2026-08-21T00:00:00Z" });
  const future = championshipOddsInputFromPredictionBundle(bundle);
  const historicalRatings = Object.fromEntries(Object.entries(bundle.playerStatistics.byPlayer).map(([id, stats]) => [id, { sandbaggerRatings: stats.sandbaggerRatings }]));
  const legacy = oddsEngineInputsFromBundle({
    current_state: state,
    input_configuration: {
      configuration_revision: 2,
      settings_fingerprint: bundle.predictionSettings.effectiveFingerprint,
      ratings_fingerprint: predictionInputFingerprint(historicalRatings),
      historical_ratings: historicalRatings,
    },
  });
  assert.deepEqual(future.sheets.matches, legacy.sheets.matches);
  assert.deepEqual(future.sheets.handicaps, legacy.sheets.handicaps);
  assert.deepEqual(future.sheets.tournamentRules, legacy.sheets.tournamentRules);
  const legacyResult = simulateTournamentOdds({ ...legacy, phase: "Round 3 Pairings Announced", iterations: 1_000 });
  const futureResult = simulateTournamentOdds({ ...future, phase: "Round 3 Pairings Announced", iterations: 1_000 });
  assert.equal(compareOddsDeterministicParity(legacyResult, futureResult).pass, true);
});

test("War Room, optimizer, intelligence, calibration, and championship requirements are complete", () => {
  const report = predictionInputCompatibilityReport(build());
  assert.equal(report.pass, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(Object.keys(report.consumers).sort(), [
    "championship", "lineup-optimizer", "match-simulation", "matchup", "scorecard-calibration", "team-intelligence",
  ]);
});

test("structural shadow validation resolves identities and warns only for read-only UNKNOWN freshness", () => {
  const bundle = build();
  const result = validatePredictionInputBundle(bundle);
  assert.equal(result.pass, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.warnings.map((row) => row.code), ["SETTINGS_FRESHNESS_UNKNOWN_READ_ONLY"]);
  assert.equal(result.counts.currentPlayers, 4);
  assert.equal(result.counts.matches, 4);
  assert.equal(result.counts.pairings, 4);
  assert.equal(result.counts.scorecards > 0, true);
});

test("local shadow preparation reports transformation time and serialized diagnostic size separately from engine execution", (context) => {
  const samples = [];
  let bundle;
  for (let index = 0; index < 5; index += 1) {
    const startedAt = performance.now();
    bundle = build({ preparedAt: "2026-08-21T00:00:00Z" });
    samples.push(performance.now() - startedAt);
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const diagnostics = {
    sample: "local-structural-shadow-fixture",
    transformations: samples.length,
    medianTransformMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
    serializedBytes: Buffer.byteLength(JSON.stringify(bundle)),
    monteCarloIterations: 0,
    googleForegroundRequests: 0,
  };
  context.diagnostic(JSON.stringify(diagnostics));
  assert.equal(diagnostics.monteCarloIterations, 0);
  assert.equal(diagnostics.googleForegroundRequests, 0);
  assert.ok(diagnostics.serializedBytes > 0);
});

test("structural validation preserves explicit missing-handicap evidence while failing on malformed canonical facts", () => {
  const bundle = structuredClone(build());
  bundle.players[0].tournamentHandicap = null;
  bundle.evidence.currentHandicaps.availablePlayerIds = bundle.evidence.currentHandicaps.availablePlayerIds.filter((id) => id !== bundle.players[0].id);
  bundle.evidence.currentHandicaps.unavailablePlayerIds.push(bundle.players[0].id);
  bundle.matches[1].participants[0].playerId = "ORPHAN";
  bundle.matches[1].points.official.teamOne = 3;
  const result = validatePredictionInputBundle(bundle);
  assert.equal(result.pass, false);
  assert.deepEqual(new Set(result.errors.map((row) => row.code)), new Set([
    "ORPHAN_MATCH_PARTICIPANT", "NON_FINAL_OFFICIAL_POINTS",
  ]));
  assert.equal(result.warnings.some((row) => row.code === "CURRENT_HANDICAP_UNAVAILABLE"), true);
  const ambiguous = structuredClone(bundle);
  ambiguous.evidence.currentHandicaps.unavailablePlayerIds = [];
  assert.equal(validatePredictionInputBundle(ambiguous).errors.some((row) => row.code === "CURRENT_HANDICAP_EVIDENCE_MISSING"), true);
});

test("Prediction Settings must be valid; UNKNOWN is read-only and CURRENT is cutover eligible", () => {
  const unknown = build();
  assert.equal(unknown.predictionSettings.readOnlyEligible, true);
  assert.equal(unknown.predictionSettings.consumerCutoverEligible, false);
  const current = build({ predictionSettings: settingsProjection("CURRENT") });
  assert.equal(current.predictionSettings.consumerCutoverEligible, true);
  assert.throws(() => build({ predictionSettings: { ...settingsProjection("CURRENT"), projectionStatus: "INVALID" } }), (error) => error.code === "PREDICTION_INPUT_SETTINGS_INVALID");
  assert.throws(() => build({ predictionSettings: settingsProjection("STALE") }), (error) => error.code === "PREDICTION_INPUT_SETTINGS_NOT_CURRENT");
  assert.throws(() => build({ allowUnknownSettingsFreshness: false }), (error) => error.code === "PREDICTION_INPUT_SETTINGS_FRESHNESS_REQUIRED");
});

test("Step 7B shared configuration adapter is reused without a second settings parser", () => {
  const view = predictionSettingsViewFromOddsConfiguration({
    tournament_id: "2026",
    configuration_revision: 2,
    settings_contract_version: PREDICTION_SETTINGS_CONTRACT_VERSION,
    settings: [{ Setting: "Prediction Model", Value: "SBI v1.0" }],
    canonical_settings: PREDICTION_SETTINGS_DEFAULTS,
    effective_settings: PREDICTION_SETTINGS_DEFAULTS,
    validation_status: "VALID",
    source_fingerprint: "a".repeat(64),
    effective_settings_fingerprint: predictionInputFingerprint(PREDICTION_SETTINGS_DEFAULTS),
  });
  const projection = predictionSettingsProjectionFromView(view);
  assert.equal(projection.revision, 2);
  assert.equal(projection.contractVersion, PREDICTION_SETTINGS_CONTRACT_VERSION);
  assert.equal(projection.projectionStatus, "VALID");
  assert.equal(projection.freshness, "UNKNOWN");
  assert.equal(Object.keys(projection.effectiveSettings).length, 30);
});

test("future Google/Supabase diagnostics classify order, configuration, evidence, identity, and revision", () => {
  const expected = build();
  const actual = structuredClone(expected);
  actual.teams.reverse();
  actual.predictionSettings.effectiveSettings["Player Category Weight"] += 1;
  actual.scorecards[0].availability = "PARTIAL";
  actual.matches[0].participants[0].playerId = "DIFFERENT";
  actual.provenance.predictionSettings.revision += 1;
  const result = comparePredictionInputBundles(expected, actual);
  assert.equal(result.pass, false);
  for (const classification of ["ORDER", "CONFIGURATION", "EVIDENCE", "IDENTITY", "REVISION"]) {
    assert.equal(result.counts[classification] > 0, true, classification);
  }
});

test("bounded scopes retain server calculation inputs without creating page-specific contracts", () => {
  const bundle = build();
  const championship = scopePredictionInputBundle(bundle, "championship");
  const lineup = scopePredictionInputBundle(bundle, "lineup");
  const intelligence = scopePredictionInputBundle(bundle, "team-intelligence");
  assert.equal(championship.metadata.contractVersion, PREDICTION_INPUT_BUNDLE_VERSION);
  assert.equal(championship.metadata.scope, "championship");
  assert.equal(Object.hasOwn(championship, "scorecards"), false);
  assert.equal(Object.hasOwn(lineup, "partnerships"), true);
  assert.equal(Object.hasOwn(intelligence, "scorecards"), true);
  assert.equal(championship.fingerprints.bundle, bundle.fingerprints.bundle);
});

test("Preview gate is isolated and Production is hard blocked", () => {
  assert.equal(predictionInputBundleEnvironment(previewEnv).available, true);
  assert.equal(predictionInputBundleEnvironment({ ...previewEnv, SECONDARY_HISTORY_READ_SOURCE: "google" }).available, false);
  const production = predictionInputBundleEnvironment({ ...previewEnv, VERCEL_ENV: "production" });
  assert.equal(production.available, false);
  assert.equal(production.productionHardBlock, true);
  assert.throws(() => requirePredictionInputBundleEnvironment({ ...previewEnv, VERCEL_ENV: "production" }), (error) => error.code === "PREDICTION_INPUT_BUNDLE_PRODUCTION_BLOCKED");
});

test("server service has zero Google imports, no fallback, and no runtime consumer selects it", async () => {
  const [service, contract, settingsService, championship, warRoom, optimizer, intelligence, calibration] = await Promise.all([
    source("lib/prediction-input-bundle-service.js"),
    source("lib/prediction-input-bundle-contract.js"),
    source("lib/prediction-settings-supabase.js"),
    source("app/api/odds/publish/route.js"),
    source("app/war-room/page.js"),
    source("app/war-room/lineup-optimizer/page.js"),
    source("app/war-room/team-intelligence/page.js"),
    source("app/api/admin/scorecard-calibration/route.js"),
  ]);
  for (const implementation of [service, contract]) {
    assert.doesNotMatch(implementation, /loadPredictionSheets|refreshHistoricalData|readWorkbookSheetsByName|historical-data\.json|getTournamentData/);
  }
  assert.match(service, /googleForegroundRequests:\s*0/);
  assert.match(service, /noFallback:\s*true/);
  assert.match(service, /readOddsInputBundle/);
  assert.match(service, /loadSecondaryHistoryModel/);
  assert.match(service, /predictionSettingsViewFromOddsConfiguration/);
  assert.doesNotMatch(settingsService, /loadPredictionSheets/);
  for (const consumer of [championship, warRoom, optimizer, intelligence, calibration]) {
    assert.doesNotMatch(consumer, /preparePredictionInputBundle/);
  }
});
