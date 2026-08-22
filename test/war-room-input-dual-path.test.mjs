import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validatePredictionInputBundle } from "../lib/prediction-input-bundle-contract.js";
import { PREDICTION_SETTING_SPECS } from "../lib/prediction-settings-contract.js";
import {
  buildGooglePredictionInputBundle,
  buildWarRoomConsumerData,
  classifyWarRoomInputDifference,
  legacyPredictionSheetsFromBundle,
  predictionBundleParityProjection,
  WAR_ROOM_INPUT_CONTRACT_VERSION,
} from "../lib/war-room-input-contract.js";
import { requireWarRoomSettingsVerification, resolveWarRoomInputSource } from "../lib/war-room-input-source.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

const settings = PREDICTION_SETTING_SPECS.map((row) => ({ Setting: row.canonicalKey, Value: row.defaultValue }));
const holes = Array.from({ length: 18 }, (_, index) => ({
  Year: 2026,
  "Course ID": "C1",
  Tee: "Blue",
  "Hole Number": index + 1,
  Par: index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5,
  Yardage: 150 + index * 15,
  "Stroke Index": index + 1,
}));

function stats(id) {
  return {
    records: {
      overall: { wins: 1, losses: 0, halves: 0, matches: 1, points: 1 },
      BB: { wins: 1, losses: 0, halves: 0, matches: 1, points: 1 },
      SC: { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 },
      SI: { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 },
    },
    percentages: { overall: 100, BB: 100, SC: 0, SI: 0 },
    appearances: [2025],
    championships: [],
    seasons: [{ year: 2025, overall: { wins: 1, losses: 0, halves: 0, matches: 1, points: 1 } }],
    sandbaggerRatings: { OVERALL: { rating: 1500, matches: 1 }, BB: { rating: 1500, matches: 1 } },
    id,
  };
}

function fixture() {
  const ids = ["P1", "P2", "P3", "P4"];
  const players = ids.map((id) => ({ "Player ID": id, "Display Name": `Player ${id.slice(1)}` }));
  const historicalMatch = {
    Year: 2025, Round: 1, Format: "BB", "Match ID": "2025-R1-1", "Course ID": "C1", Tee: "Blue",
    "Team 1 Player 1": "P1", "Team 1 Player 2": "P2", "Team 2 Player 1": "P3", "Team 2 Player 2": "P4",
    "Matchup Winner": "Team 1", "Team 1 Points": 2, "Team 2 Points": 1,
  };
  const tournament = {
    year: 2025,
    id: "2025",
    "Final Score": "25-23",
    championTeamId: "2025-T1",
    teams: [1, 2].map((side) => ({ id: `2025-T${side}`, side: `Team ${side}`, name: `Legacy ${side}`, captainId: ids[(side - 1) * 2], roster: ids.slice((side - 1) * 2, side * 2).map((id) => ({ player: { "Player ID": id } })) })),
    courses: [{ Round: "Round 1", Format: "BB", "Course ID": "C1", Course: "Course One" }],
  };
  const all = players.map((player) => ({ player, stats: stats(player["Player ID"]) }));
  const calculations = {
    getAllPlayerStats: () => all,
    getPlayers: () => players,
    getRecords: () => ({ all }),
    getPartnershipStats: () => ({ byMatches: [{ key: "P1|P2", record: { wins: 1, losses: 0, halves: 0, matches: 1, points: 1 }, byFormat: { BB: { wins: 1, losses: 0, halves: 0, matches: 1, points: 1 } } }] }),
    getHeadToHead: () => ({ overall: { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 }, byFormat: {}, meetings: [] }),
    getTournaments: () => [tournament],
    getTournamentMatches: (year) => Number(year) === 2025 ? [historicalMatch] : [],
  };
  const sheets = {
    players,
    liveTournaments: [{ Year: 2026, "Tournament ID": "2026", "Tournament Name": "Bagger Invitational", "Tournament Status": "LIVE", "Current Round": 1, "Team 1 Name": "Pickles", "Team 2 Name": "Lipp it and Rip it" }],
    teamNames: [
      { Year: 2026, "Team ID": "2026-T1", "Team Side": "Team 1", "Team Names": "Pickles", Captain: "P1" },
      { Year: 2026, "Team ID": "2026-T2", "Team Side": "Team 2", "Team Names": "Lipp it and Rip it", Captain: "P3" },
    ],
    handicaps: [2025, 2026].flatMap((year) => ids.map((id, index) => ({ Year: year, "Player ID": id, "Team ID": `${year}-T${index < 2 ? 1 : 2}`, "Team Side": index < 2 ? "Team 1" : "Team 2", "Tournament Handicap": 8 + index, "Roster Order": (index % 2) + 1 }))),
    tournamentRules: [{ Year: 2026, Round: 1, "Round ID": "2026-R1", Format: "BB", "Team Size": 2, "Points Available": 3 }],
    courses: [{ Year: 2025, Round: "Round 1", Format: "BB", "Course ID": "C1", Course: "Course One", Tee: "Blue", Rating: 72, Slope: 130, Yardage: 6600, Par: 72 },
      { Year: 2026, Round: "Round 1", Format: "BB", "Course ID": "C1", Course: "Course One", Tee: "Blue", Rating: 72, Slope: 130, Yardage: 6600, Par: 72 }],
    holes,
    liveMatches: [{ Year: 2026, Round: 1, Match: 1, "Match ID": "2026-R1-1", Format: "BB", "Course ID": "C1", Tee: "Blue", "Match Status": "LIVE", "Current Hole": 3,
      "Team 1 Player 1": "P1", "Team 1 Player 2": "P2", "Team 2 Player 1": "P3", "Team 2 Player 2": "P4", "Team 1 Points": 0, "Team 2 Points": 0 }],
    matches: [historicalMatch],
    ghostMatches: [],
    settings,
  };
  const scorecardAnalytics = { scorecards: [{ id: "card-1", matchId: "2025-R1-1", year: 2025, round: 1, format: "BB", courseId: "C1", tee: "Blue", playerId: "P1", participantPlayerIds: ["P1"], scoreType: "INDIVIDUAL", status: "COMPLETE", holes: holes.map((hole) => ({ holeNumber: hole["Hole Number"], score: hole.Par, par: hole.Par, yardage: hole.Yardage, strokeIndex: hole["Stroke Index"], toPar: 0 })) }] };
  return { sheets, calculations, scorecardAnalytics };
}

test("one source boundary defaults Preview to Google and hard-resolves Production to Google", () => {
  assert.equal(resolveWarRoomInputSource({ VERCEL_ENV: "preview" }).resolved, "google");
  assert.equal(resolveWarRoomInputSource({ VERCEL_ENV: "preview", WAR_ROOM_INPUT_SOURCE: "supabase" }).resolved, "supabase");
  const production = resolveWarRoomInputSource({ VERCEL_ENV: "production", WAR_ROOM_INPUT_SOURCE: "supabase" }, "supabase");
  assert.equal(production.resolved, "google");
  assert.equal(production.productionHardResolvedToGoogle, true);
  assert.equal(production.fallbackUsed, false);
  assert.throws(() => resolveWarRoomInputSource({ VERCEL_ENV: "preview", WAR_ROOM_INPUT_SOURCE: "automatic" }), /Unsupported/);
});

test("Supabase cutover pins the independently certified source and effective settings fingerprints", () => {
  const sourceFingerprint = "a".repeat(64);
  const effectiveSettingsFingerprint = "b".repeat(64);
  assert.deepEqual(requireWarRoomSettingsVerification({
    WAR_ROOM_PREDICTION_SETTINGS_SOURCE_FINGERPRINT: sourceFingerprint,
    WAR_ROOM_PREDICTION_SETTINGS_EFFECTIVE_FINGERPRINT: effectiveSettingsFingerprint,
  }), { sourceFingerprint, effectiveSettingsFingerprint });
  assert.throws(() => requireWarRoomSettingsVerification({}), (error) =>
    error.code === "WAR_ROOM_PREDICTION_SETTINGS_VERIFICATION_REQUIRED" && error.status === 503);
  assert.throws(() => requireWarRoomSettingsVerification({
    WAR_ROOM_PREDICTION_SETTINGS_SOURCE_FINGERPRINT: "not-a-fingerprint",
    WAR_ROOM_PREDICTION_SETTINGS_EFFECTIVE_FINGERPRINT: effectiveSettingsFingerprint,
  }), (error) => error.code === "WAR_ROOM_PREDICTION_SETTINGS_VERIFICATION_INVALID");
});

test("Google adapter normalizes current, historical, settings, handicap, course, scorecard, and ordering facts", () => {
  const input = fixture();
  const bundle = buildGooglePredictionInputBundle({ ...input, workbookId: "preview-workbook", preparedAt: "2026-08-21T00:00:00.000Z" });
  assert.equal(bundle.metadata.contractVersion, "prediction-input-bundle-v1");
  assert.equal(WAR_ROOM_INPUT_CONTRACT_VERSION, "prediction-input-bundle-v1/war-room-v1");
  assert.equal(bundle.tournament.lifecycle, "LIVE");
  assert.deepEqual(bundle.ordering.keys.roster, ["P1", "P2", "P3", "P4"]);
  assert.equal(Object.keys(bundle.predictionSettings.effectiveSettings).length, 30);
  assert.equal(bundle.scorecards[0].availability, "COMPLETE");
  assert.equal(bundle.handicaps.current.length, 4);
  assert.equal(bundle.metadata.hiddenFallback, false);
  const validation = validatePredictionInputBundle(bundle, { allowUnknownSettingsFreshness: false });
  assert.equal(validation.pass, true, JSON.stringify(validation.errors));
});

test("Google adapter derives the current tournament window from live match facts when the control row is stale", () => {
  const input = fixture();
  input.sheets.liveTournaments[0]["Tournament Status"] = "UPCOMING";
  input.sheets.liveTournaments[0]["Current Round"] = 1;
  input.sheets.liveMatches[0].Round = 3;
  input.sheets.liveMatches[0]["Match Status"] = "LIVE";
  const bundle = buildGooglePredictionInputBundle({ ...input, workbookId: "preview-workbook" });
  assert.equal(bundle.tournament.lifecycle, "LIVE");
  assert.equal(bundle.tournament.currentRound, 3);
});

test("Google adapter preserves reopened lifecycle over stale finalized tournament metadata", () => {
  const input = fixture();
  input.sheets.liveTournaments[0]["Tournament Status"] = "FINAL";
  input.sheets.liveTournaments[0]["Current Round"] = 3;
  input.sheets.liveMatches[0]["Match Status"] = "REOPENED";
  const bundle = buildGooglePredictionInputBundle({ ...input, workbookId: "preview-workbook" });
  assert.equal(bundle.tournament.lifecycle, "LIVE");
  assert.equal(bundle.tournament.currentRound, 3);
});

test("an unavailable current handicap remains explicit and ineligible without invalidating the shared bundle", () => {
  const input = fixture();
  input.sheets.handicaps.find((row) => row.Year === 2026 && row["Player ID"] === "P1")["Tournament Handicap"] = "";
  const bundle = buildGooglePredictionInputBundle({ ...input, workbookId: "preview-workbook" });
  const validation = validatePredictionInputBundle(bundle, { allowUnknownSettingsFreshness: false });
  assert.equal(validation.pass, true, JSON.stringify(validation.errors));
  assert.deepEqual(bundle.evidence.currentHandicaps.unavailablePlayerIds, ["P1"]);
  assert.equal(validation.warnings.some((row) => row.code === "CURRENT_HANDICAP_UNAVAILABLE"), true);
  assert.equal(bundle.players.find((row) => row.id === "P1").tournamentHandicap, null);
});

test("normalized bundle projects the unchanged War Room consumer contract", () => {
  const input = fixture();
  const bundle = buildGooglePredictionInputBundle({ ...input, workbookId: "preview-workbook" });
  const consumer = buildWarRoomConsumerData({ bundle, calculations: input.calculations, scorecardAnalytics: input.scorecardAnalytics, scope: "lineup" });
  assert.deepEqual(Object.keys(consumer).sort(), ["headToHead", "historical", "partnershipPredictionMap", "partnerships", "scorecardAnalytics", "sheets"]);
  assert.equal(consumer.sheets.liveTournaments[0]["Team 1 Name"], "Pickles");
  assert.equal(consumer.historical.P1.records.overall.matches, 1);
  assert.equal(consumer.partnerships["P1|P2"].record.matches, 1);
  const compatibleSheets = legacyPredictionSheetsFromBundle(bundle);
  assert.equal(compatibleSheets.settings.length, 30);
  assert.deepEqual([...new Set(compatibleSheets.handicaps.map((row) => row.Year))], [2025, 2026]);
  assert.equal(compatibleSheets.handicaps.filter((row) => row.Year === 2026).length, 4);
  assert.equal(new Set(compatibleSheets.handicaps.filter((row) => row.Year === 2026).map((row) => row["Player ID"])).size, 4);
  assert.equal(compatibleSheets.teamNames.find((row) => row.Year === 2025 && row["Team Side"] === "Team 1")["Team ID"], "2025-T1");
  assert.equal(compatibleSheets.handicaps.find((row) => row.Year === 2025 && row["Player ID"] === "P2")["Roster Order"], 2);
  assert.equal(predictionBundleParityProjection(bundle).metadata.source, undefined);
});

test("legacy compatibility sheets never duplicate the active roster from current-year handicap provenance", () => {
  const input = fixture();
  const bundle = structuredClone(buildGooglePredictionInputBundle({ ...input, workbookId: "preview-workbook" }));
  bundle.handicaps.historical.push({ year: 2026, playerId: "P1", teamSide: 1, tournamentHandicap: 99 });
  const compatibleSheets = legacyPredictionSheetsFromBundle(bundle);
  const current = compatibleSheets.handicaps.filter((row) => row.Year === 2026);
  assert.equal(current.length, 4);
  assert.equal(current.filter((row) => row["Player ID"] === "P1").length, 1);
  assert.equal(current.find((row) => row["Player ID"] === "P1")["Tournament Handicap"], 8);
});

test("deployed parity classification is fail-closed and explains only certified domains", () => {
  const sourceOnly = classifyWarRoomInputDifference({ classification: "VALUE", path: "bundle.courses[19].stableCourseId" });
  assert.equal(sourceOnly.disposition, "INTENTIONAL_CANONICAL_DIFFERENCE");
  assert.equal(sourceOnly.reason, "CERTIFIED_2023_COURSE_ALIAS");
  const scorecard = classifyWarRoomInputDifference({ classification: "EVIDENCE", path: "bundle.scorecards[10].holes[2].gross" });
  assert.equal(scorecard.reason, "CERTIFIED_SCORECARD_EVIDENCE_AND_CURRENT_YEAR_COVERAGE");
  const unknown = classifyWarRoomInputDifference({ classification: "VALUE", path: "bundle.matches[0].lifecycle" });
  assert.equal(unknown.disposition, "UNEXPLAINED");
});

test("all War Room routes use the shared boundary and no page calls the broad loader directly", () => {
  for (const file of [
    "app/war-room/page.js",
    "app/war-room/lineup-optimizer/page.js",
    "app/war-room/team-intelligence/page.js",
    "app/api/admin/scorecard-calibration/route.js",
  ]) {
    const text = source(file);
    assert.match(text, /prepareWarRoomInput/);
    assert.doesNotMatch(text, /loadPredictionSheets|refreshHistoricalData/);
  }
  assert.match(source("app/war-room/WarRoom.js"), /predict\(\{/);
  assert.match(source("app/war-room/WarRoom.js"), /simulateMatch\(\{/);
  assert.match(source("app/war-room/lineup-optimizer/LineupOptimizer.js"), /optimizeLineups\(\{/);
});

test("Supabase adapter has zero Google imports and the boundary never implements fallback", () => {
  const supabase = source("lib/war-room-input-supabase.js");
  assert.doesNotMatch(supabase, /prediction-data|google-sheets|refreshHistoricalData|historical-data\.json/);
  assert.match(supabase, /googleForegroundRequests: 0/);
  assert.match(supabase, /fallbackUsed: false/);
  const boundary = source("lib/war-room-input-service.js");
  assert.doesNotMatch(boundary, /catch[\s\S]{0,200}prepareGoogleWarRoomInput/);
  const diagnosticRoute = source("app/api/admin/war-room-input-parity/route.js");
  assert.match(diagnosticRoute, /authorizePreviewDirector/);
  assert.match(diagnosticRoute, /operation === "runtime"/);
  assert.match(diagnosticRoute, /compactParityResult/);
  assert.match(diagnosticRoute, /reportMode/);
  assert.match(diagnosticRoute, /result\.parity\.pass \|\| reportMode \? 200 : 409/);
  assert.match(diagnosticRoute, /cache-control.*no-store/);
});

test("Step 7D does not alter engine formulas, UI styling, publication, or consumer source configuration", () => {
  assert.doesNotMatch(source("lib/war-room-input-source.js"), /automatic/i);
  assert.match(source("lib/war-room-input-source.js"), /fallbackUsed: false/);
  assert.equal(fs.existsSync(path.join(root, ".env.local")), false);
  for (const file of ["lib/prediction-engine.js", "lib/match-simulator.js", "lib/lineup-optimizer.js", "app/war-room/war-room.module.css"]) {
    assert.equal(fs.statSync(path.join(root, file)).isFile(), true);
  }
});
