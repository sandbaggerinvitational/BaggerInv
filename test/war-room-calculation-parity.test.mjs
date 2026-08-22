import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PREDICTION_SETTING_SPECS } from "../lib/prediction-settings-contract.js";
import {
  WAR_ROOM_FLOATING_POINT_POLICY,
  calculationInvocationFingerprint,
  compareCalculationValues,
  compareCalibrationParity,
  compareChampionshipParity,
  compareLineupParity,
  compareMatchupParity,
  compareSimulationParity,
  compareTeamIntelligenceParity,
  runCalibrationParitySource,
  runChampionshipParitySource,
  runLineupParitySource,
  runMatchupParitySource,
  runSimulationParitySource,
  runTeamIntelligenceParitySource,
} from "../lib/war-room-calculation-parity.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function record(wins, losses, halves, points) {
  return { wins, losses, halves, matches: wins + losses + halves, points };
}

function playerStats(id, offset = 0) {
  return {
    id,
    records: {
      overall: record(3 + offset, 2, 1, 4.5 + offset),
      BB: record(2 + offset, 1, 0, 2.5 + offset),
      SC: record(1, 1, 1, 1.5),
      SI: record(1, 1, 0, 1),
    },
    appearances: [2024, 2025],
    seasons: [{ year: 2025, overall: record(2, 1, 0, 2) }],
    sandbaggerRatings: {
      OVERALL: { rating: 1500 + offset * 10, matches: 6 + offset },
      BB: { rating: 1510 + offset * 10, matches: 3 + offset },
      SC: { rating: 1490 + offset * 10, matches: 3 },
      SI: { rating: 1505 + offset * 10, matches: 2 },
    },
  };
}

function fixturePrepared(sourceName = "google") {
  const ids = ["P1", "P2", "P3", "P4"];
  const players = ids.map((id, index) => ({ "Player ID": id, "Display Name": `Player ${index + 1}` }));
  const settings = PREDICTION_SETTING_SPECS.map((row) => ({ Setting: row.canonicalKey, Value: row.defaultValue }));
  const courseRows = [
    { format: "BB", id: "C-BB" },
    { format: "SC", id: "C-SC" },
    { format: "SI", id: "C-SI" },
  ];
  const courses = courseRows.map((row, index) => ({ Year: 2026, Round: index + 1, Format: row.format, "Course ID": row.id, Course: `${row.format} Course`, Tee: "Blue", Rating: 72, Slope: 126, Par: 72 }));
  const scorecards = courses.map((row) => ({ ...row, "Course Rating": row.Rating, "Slope Rating": row.Slope }));
  const holes = courseRows.flatMap((course) => Array.from({ length: 18 }, (_, index) => ({
    Year: 2026,
    "Course ID": course.id,
    Tee: "Blue",
    "Hole Number": index + 1,
    Par: [4, 4, 3, 5][index % 4],
    Yardage: 145 + index * 17,
    "Stroke Index": index + 1,
  })));
  const handicaps = ids.map((id, index) => ({ Year: 2026, "Player ID": id, "Team Side": index < 2 ? "Team 1" : "Team 2", "Tournament Handicap": 7 + index }));
  const matches = [
    { Year: 2026, Round: 1, Format: "BB", "Match ID": "2026-R1-1", "Course ID": "C-BB", Tee: "Blue", "Team 1 Player 1": "P1", "Team 1 Player 2": "P2", "Team 2 Player 1": "P3", "Team 2 Player 2": "P4", "Team 1 Points": 2, "Team 2 Points": 1, "Matchup Winner": "Team 1" },
    { Year: 2026, Round: 2, Format: "SC", "Match ID": "2026-R2-1", "Course ID": "C-SC", Tee: "Blue", "Team 1 Player 1": "P1", "Team 1 Player 2": "P2", "Team 2 Player 1": "P3", "Team 2 Player 2": "P4", "Team 1 Points": 1, "Team 2 Points": 2, "Matchup Winner": "Team 2" },
    { Year: 2026, Round: 3, Format: "SI", "Match ID": "2026-R3-1", "Course ID": "C-SI", Tee: "Blue", "Team 1 Player 1": "P1", "Team 2 Player 1": "P3", "Team 1 Points": 0, "Team 2 Points": 0 },
    { Year: 2026, Round: 3, Format: "SI", "Match ID": "2026-R3-2", "Course ID": "C-SI", Tee: "Blue", "Team 1 Player 1": "P2", "Team 2 Player 1": "P4", "Team 1 Points": 0, "Team 2 Points": 0 },
  ];
  const historical = Object.fromEntries(ids.map((id, index) => [id, playerStats(id, index)]));
  const partnershipPredictionMap = {
    "P1|P2": { record: record(2, 1, 0, 2.5), byFormat: { BB: record(2, 0, 0, 2), SC: record(0, 1, 0, .5) } },
    "P3|P4": { record: record(1, 2, 0, 1.5), byFormat: { BB: record(0, 2, 0, 0), SC: record(1, 0, 0, 1) } },
  };
  const headToHead = Object.fromEntries(["P1|P3", "P1|P4", "P2|P3", "P2|P4"].map((key) => [key, { overall: record(1, 1, 0, 1), byFormat: { BB: record(1, 0, 0, 1), SC: record(0, 1, 0, 0), SI: record(0, 0, 1, .5) } }]));
  const historicalCardHoles = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, score: [4, 4, 3, 5][index % 4], gross: [4, 4, 3, 5][index % 4], net: [4, 4, 3, 5][index % 4], par: [4, 4, 3, 5][index % 4], yardage: 145 + index * 17, strokeIndex: index + 1, toPar: 0 }));
  const historicalScorecards = ids.map((id, index) => ({ id: `card-${id}`, matchId: "2025-R1-1", year: 2025, round: 1, format: "BB", courseId: "C-BB", tee: "Blue", playerId: id, playerName: `Player ${index + 1}`, participantPlayerIds: [id], scoreType: "INDIVIDUAL", status: "COMPLETE", total: 72, frontNine: 36, backNine: 36, totalToPar: 0, holes: historicalCardHoles }));
  const intelligencePlayers = ids.map((id, index) => ({ id, name: `Player ${index + 1}`, handicap: 7 + index, rating: 1500 + index * 10, official: { points: 4 + index, championships: index === 0 ? 1 : 0, appearances: 2, winPercentage: 50 + index }, scorecard: { sample: { completeScorecards: 1 }, holeDifferential: index, birdies: index, averageGrossScore: 72 + index, averageNetScore: 70 + index, birdieRate: 10, parRate: 50, bogeyRate: 30, doubleBogeyOrWorseRate: 10, averagePar3Score: 3, averagePar4Score: 4, averagePar5Score: 5, averageFrontNineScore: 36, averageBackNineScore: 36 }, progression: { largestLeadHeld: 1, largestComebackCompleted: 0, closing: { won: 1 } } }));
  const partnershipRows = Object.entries(partnershipPredictionMap).map(([key, value]) => {
    const [one, two] = key.split("|");
    return { key, playerOne: intelligencePlayers.find((row) => row.id === one), playerTwo: intelligencePlayers.find((row) => row.id === two), record: value.record, formats: ["BB", "SC"].map((format) => ({ format, record: value.byFormat[format], winPercentage: 50 })), winPercentage: 50, yearsPlayedTogether: 2, recordedTeamRounds: 1, holeDifferential: 0, closingDifferential: 0, strengths: [], tendencies: [], timeline: [], confidence: "MODERATE", summary: `${key} deterministic summary` };
  });
  const sheets = {
    players,
    liveTournaments: [{ Year: 2026, "Tournament ID": "2026", "Tournament Status": "LIVE", "Current Round": 3, "Team 1 Name": "Pickles", "Team 2 Name": "Lipp" }],
    teamNames: [{ Year: 2026, "Team Side": "Team 1", "Team Names": "Pickles" }, { Year: 2026, "Team Side": "Team 2", "Team Names": "Lipp" }],
    handicaps,
    tournamentRules: courseRows.map((row, index) => ({ Year: 2026, Round: index + 1, Format: row.format, "Points Available": 3 })),
    courses,
    scorecards,
    holes,
    matches,
    settings,
  };
  const bundle = {
    tournament: { id: "2026", year: 2026, lifecycle: "LIVE", currentRound: 3 },
    fingerprints: { bundle: `${sourceName}-bundle`, sections: { ordering: "order", pairings: "pairings", statistics: `${sourceName}-stats`, scorecards: `${sourceName}-cards`, courses: "courses" } },
    predictionSettings: { contractVersion: "prediction-settings-v1", effectiveFingerprint: "settings", freshness: "CURRENT", revision: sourceName === "supabase" ? 2 : null },
    ordering: { keys: { roster: ids, pairings: matches.map((row) => row["Match ID"]) } },
  };
  return {
    source: sourceName,
    bundle,
    consumerData: {
      sheets,
      historical,
      partnershipPredictionMap,
      headToHead,
      scorecardAnalytics: { scorecards: historicalScorecards },
      players: intelligencePlayers,
      partnerships: partnershipRows,
      seasons: [{ year: 2026, teams: [{ id: "T1", name: "Pickles", rosterSize: 2 }, { id: "T2", name: "Lipp", rosterSize: 2 }] }],
    },
  };
}

test("invocation fingerprints are stable and exclude timing", () => {
  const input = { bundleFingerprint: "bundle", engineVersion: "engine", calculationType: "matchup", iterations: 10_000, seed: "seed", selectedPlayers: ["P1", "P2"], settingsFingerprint: "settings" };
  assert.equal(calculationInvocationFingerprint(input), calculationInvocationFingerprint({ ...input, requestTimestamp: new Date().toISOString() }));
  assert.notEqual(calculationInvocationFingerprint(input), calculationInvocationFingerprint({ ...input, seed: "different" }));
});

test("floating-point parity is exact and does not hide numeric differences", () => {
  assert.equal(WAR_ROOM_FLOATING_POINT_POLICY.numericTolerance, 0);
  assert.equal(compareCalculationValues({ probability: 50 }, { probability: 50 }).pass, true);
  const compared = compareCalculationValues({ probability: 50 }, { probability: 50.0000001 });
  assert.equal(compared.pass, false);
  assert.equal(compared.counts.FLOAT_OR_NUMBER, 1);
});

test("championship output is deterministic and exact for equivalent adapters", () => {
  const google = runChampionshipParitySource(fixturePrepared("google"), { iterations: 200, repeat: 2 });
  const supabase = runChampionshipParitySource(fixturePrepared("supabase"), { iterations: 200, repeat: 2 });
  assert.equal(google.repeatability.pass, true);
  assert.equal(supabase.repeatability.pass, true);
  assert.equal(compareChampionshipParity(google, supabase).pass, true);
});

test("exhaustive matchup parity attributes a certified statistics change", () => {
  const googlePrepared = fixturePrepared("google");
  const supabasePrepared = fixturePrepared("supabase");
  supabasePrepared.consumerData.historical.P1.records.overall.wins += 1;
  supabasePrepared.consumerData.historical.P1.records.overall.matches += 1;
  const google = runMatchupParitySource(googlePrepared, { repeat: 2 });
  const supabase = runMatchupParitySource(supabasePrepared, { repeat: 2 });
  const compared = compareMatchupParity(google, supabase);
  assert.equal(compared.comparisonsExecuted, 6);
  assert.equal(compared.unexplainedDifferences, 0);
  assert.ok(compared.intentionalCanonicalDifferences > 0);
  assert.ok(compared.attributionCounts.PLAYER_STATS > 0);
});

test("match simulations are deterministic and differences inherit causal inputs", () => {
  const googlePrepared = fixturePrepared("google");
  const supabasePrepared = fixturePrepared("supabase");
  supabasePrepared.consumerData.historical.P1.sandbaggerRatings.OVERALL.rating += 25;
  const google = runSimulationParitySource(googlePrepared, { iterations: 500, repeat: 2 });
  const supabase = runSimulationParitySource(supabasePrepared, { iterations: 500, repeat: 2, scenarioIds: google.rows.map((row) => row.id) });
  const compared = compareSimulationParity(google, supabase);
  assert.equal(compared.pass, true);
  assert.equal(compared.unexplainedDifferences, 0);
  assert.ok(google.rows.every((row) => row.repeatability.pass));
});

test("lineup rankings compare completely without changing optimizer logic", () => {
  const google = runLineupParitySource(fixturePrepared("google"), { repeat: 2 });
  const supabase = runLineupParitySource(fixturePrepared("supabase"), { repeat: 2 });
  const compared = compareLineupParity(google, supabase);
  assert.equal(compared.pass, true);
  assert.equal(compared.formats.BB.matchupCount.google, 1);
  assert.equal(compared.formats.SI.matchupCount.google, 4);
  assert.equal(compared.formats.BB.firstRankingDivergence, null);
});

test("Team Intelligence separates factual and editorial deterministic output", () => {
  const google = runTeamIntelligenceParitySource(fixturePrepared("google"), { repeat: 2 });
  const supabase = runTeamIntelligenceParitySource(fixturePrepared("supabase"), { repeat: 2 });
  const compared = compareTeamIntelligenceParity(google, supabase);
  assert.equal(compared.pass, true);
  assert.equal(compared.factual.exact, true);
  assert.equal(compared.editorial.exact, true);
});

test("scorecard calibration stays shadow-only and disabled", () => {
  const google = runCalibrationParitySource(fixturePrepared("google"), { repeat: 2 });
  const supabase = runCalibrationParitySource(fixturePrepared("supabase"), { repeat: 2 });
  const compared = compareCalibrationParity(google, supabase);
  assert.equal(compared.pass, true);
  assert.equal(google.certification.configuredEnabled, false);
  assert.equal(google.certification.publicPredictionChanged, false);
  assert.equal(supabase.certification.publicPredictionChanged, false);
});

test("protected Step 7E route remains Preview-only and does not change War Room source", () => {
  const route = source("app/api/admin/war-room-calculation-parity/route.js");
  const service = source("lib/war-room-calculation-parity-service.js");
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(service, /selected\.resolved !== "google"/);
  assert.match(service, /zeroGoogleSupabaseShadow/);
  assert.doesNotMatch(`${route}\n${service}`, /WAR_ROOM_INPUT_SOURCE\s*=/);
  assert.doesNotMatch(`${route}\n${service}`, /Math\.random/);
  assert.doesNotMatch(service, /catch\s*\([^)]*\)\s*\{[^}]*prepareWarRoomInput/s);
});
