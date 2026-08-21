import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  buildCompletedHistoryYearContract,
  COMPLETED_HISTORY_CORRECTIONS,
  COMPLETED_HISTORY_CORRECTION_SET_FINGERPRINT,
  completedHistoryImportEnvelope,
  completedHistoryYearCertificationSummary,
} from "../lib/completed-history-contract.js";
import {
  buildCompletedHistoryDerivedShadow,
  compareCompletedHistoryDerivedShadows,
  completedHistoryYearReadToShadowPayload,
} from "../lib/completed-history-shadow.js";

const formats = [
  { id: "BB", name: "Best Ball", teamSize: 2 },
  { id: "SC", name: "Scramble", teamSize: 2 },
  { id: "SI", name: "Singles", teamSize: 1 },
];

function fixture({ year, rosterSize, roundFormats, roundMatches, roundPoints, finalScore = "", team1Id = "SIDE1", team1Name = "Side One", team2Id = "SIDE2", team2Name = "Side Two", award = false } = {}) {
  const perSide = rosterSize / 2;
  const sideOne = Array.from({ length: perSide }, (_, index) => `A${String(index + 1).padStart(2, "0")}`);
  const sideTwo = Array.from({ length: perSide }, (_, index) => `B${String(index + 1).padStart(2, "0")}`);
  const playerIds = [...sideOne, ...sideTwo];
  const players = playerIds.map((id) => ({ "Player ID": id, "Display Name": `Player ${id}`, First: "Player", Last: id, Slug: `player-${id.toLowerCase()}` }));
  const handicaps = playerIds.map((id, index) => ({ Year: year, "Player ID": id, "Team Side": index < perSide ? "Team 1" : "Team 2", "Tournament Handicap": index / 2, "Handicap Method": "Current Index" }));
  const matches = [];
  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const format = roundFormats[roundIndex];
    for (let matchIndex = 0; matchIndex < roundMatches[roundIndex]; matchIndex += 1) {
      const pairIndex = (matchIndex * 2) % perSide;
      const values = roundPoints?.[roundIndex]?.[matchIndex] || [null, null];
      const row = {
        "Match ID": `${year}-R${roundIndex + 1}-${matchIndex + 1}`,
        Year: year,
        Round: roundIndex + 1,
        Format: format,
        Match: matchIndex + 1,
        "Team 1 Player 1": sideOne[format === "SI" ? matchIndex % perSide : pairIndex],
        "Team 1 Player 2": format === "SI" ? "465" : sideOne[(pairIndex + 1) % perSide],
        "Team 2 Player 1": sideTwo[format === "SI" ? matchIndex % perSide : pairIndex],
        "Team 2 Player 2": format === "SI" ? "465" : sideTwo[(pairIndex + 1) % perSide],
        "Matchup Winner": values[0] === values[1] ? "Halved" : values[0] === null || values[0] > values[1] ? "Team 1" : "Team 2",
        "18-Hole Winner": values[0] === values[1] ? "Halved" : values[0] === null || values[0] > values[1] ? "Team 1" : "Team 2",
        "Team 1 Points": values[0],
        "Team 2 Points": values[1],
      };
      matches.push(row);
    }
  }
  const pointsAvailable = roundPoints
    ? roundPoints.map((rows) => rows[0][0] + rows[0][1])
    : [null, null, null];
  return {
    players,
    tournaments: [{
      Year: year,
      Annual: `${year} Sandbagger Invitational`,
      Dates: `August 11 - 12, ${year}`,
      Destination: "Test Destination",
      "Winning Team": team1Name,
      "Runner-Up Team": team2Name,
      "Final Score": finalScore,
      "Team Size": rosterSize,
    }],
    teamNames: [
      { Year: year, "Team Side": "Team 1", "Team ID": team1Id, "Team Names": team1Name, Captain: sideOne[0] },
      { Year: year, "Team Side": "Team 2", "Team ID": team2Id, "Team Names": team2Name, Captain: sideTwo[0] },
    ],
    matches,
    rounds: formats.map((format) => ({ "Format ID": format.id, Name: format.name, "Team Size": format.teamSize })),
    rules: roundFormats.map((format, index) => ({
      Year: year,
      Round: `Round ${index + 1}`,
      Format: format,
      "Team Size": format === "SI" ? 1 : 2,
      "Points Available": pointsAvailable[index],
      "Front 9 Used": pointsAvailable[index] !== null,
      "Back 9 Used": pointsAvailable[index] !== null,
      "Overall Used": pointsAvailable[index] !== null,
      "Front 9 Points": pointsAvailable[index] === null ? null : 1,
      "Back 9 Points": pointsAvailable[index] === null ? null : 1,
      "Overall Points": pointsAvailable[index] === null ? null : pointsAvailable[index] - 2,
    })),
    awards: award ? [{ Year: year, Award: "Sandbagger of the Year", Winner: sideOne[0] }] : [],
    courses: roundFormats.map((format, index) => ({
      "Course ID": `C${year}${index + 1}`,
      Year: year,
      Round: `Round ${index + 1}`,
      Format: format,
      Course: `Course ${index + 1}`,
      City: "Test City",
      State: "TS",
      Destination: "Test Destination",
      "Tee Played": "Archive",
      Slope: 120,
      Rating: 70,
      Yardage: 6500,
      Par: 72,
    })),
    handicaps,
    ghostMatches: [],
    roundScorecards: [],
    courseHoles: [],
  };
}

test("2017 result-only import preserves unavailable points and scorecards", () => {
  const source = fixture({ year: 2017, rosterSize: 16, roundFormats: ["BB", "SC", "SI"], roundMatches: [4, 4, 8] });
  const payload = buildCompletedHistoryYearContract({ source, year: 2017, requestedBy: "director-one" });
  assert.equal(payload.tournament.result.availability, "UNAVAILABLE");
  assert.equal(payload.tournament.result.team_1_points, null);
  assert.equal(payload.tournament.result.team_2_points, null);
  assert.equal(payload.counts.matches, 16);
  assert.equal(payload.counts.point_allocated_matches, 0);
  assert.equal(payload.counts.scorecards, 0);
  assert.equal(payload.counts.unavailable_match_scorecards, 16);
  assert.equal(payload.match_participants.length, 48);
  assert.equal(payload.match_participants.some((participant) => participant.player_id === "465"), false);
  assert.equal(payload.record_eligibility.length, 48);
  assert.equal(payload.record_eligibility.every((row) => row.include_official_record), true);
  assert.equal(completedHistoryYearCertificationSummary(payload).finalScore, "UNAVAILABLE");
});

test("2019 source facts reconcile exact points and reject the stale bundled final", () => {
  const source = fixture({
    year: 2019,
    rosterSize: 20,
    roundFormats: ["BB", "SC", "SI"],
    roundMatches: [5, 5, 10],
    roundPoints: [
      [[4, 0], [4, 0], [2, 2], [2, 2], [0, 4]],
      [[3, 0], [3, 0], [1.5, 1.5], [1.5, 1.5], [0, 3]],
      [[3, 0], [3, 0], [3, 0], [3, 0], [3, 0], [1, 2], [0, 3], [0, 3], [0, 3], [0, 3]],
    ],
    finalScore: "37-28",
    team1Id: "JJSINGH",
    team1Name: "Jupjay Singh Squad",
    team2Id: "PHBOMBS",
    team2Name: "Phil's Calvity Bombs",
    award: true,
  });
  const payload = buildCompletedHistoryYearContract({ source, year: 2019 });
  assert.deepEqual(
    [payload.tournament.result.team_1_points, payload.tournament.result.team_2_points],
    [37, 28]
  );
  assert.equal(payload.tournament.result.awarded_points, 65);
  assert.equal(payload.tournament.result.configured_points, 65);
  assert.equal(payload.tournament.result.champion_team_id, "JJSINGH");
  assert.ok(payload.corrections.some((correction) => correction.id === "2019-production-points-and-team-identity"));

  source.tournaments[0]["Final Score"] = "228.5-170.5";
  assert.throws(() => buildCompletedHistoryYearContract({ source, year: 2019 }), /stored Final does not reconcile/);
});

test("canonical payload fingerprint is independent of the operational actor", () => {
  const source = fixture({ year: 2017, rosterSize: 16, roundFormats: ["BB", "SC", "SI"], roundMatches: [4, 4, 8] });
  const one = buildCompletedHistoryYearContract({ source, year: 2017, requestedBy: "director-one" });
  const two = buildCompletedHistoryYearContract({ source, year: 2017, requestedBy: "director-two" });
  assert.equal(one.source_fingerprint, two.source_fingerprint);
  assert.equal(one.payload_fingerprint, two.payload_fingerprint);
  assert.notEqual(one.requested_by, two.requested_by);
});

test("present blank stroke cells remain recorded zero while missing fields remain unavailable", () => {
  const source = fixture({ year: 2017, rosterSize: 16, roundFormats: ["BB", "SC", "SI"], roundMatches: [4, 4, 8] });
  source.matches[0]["Team 1 Player 1 Stroke"] = "";
  const payload = buildCompletedHistoryYearContract({ source, year: 2017 });
  const recordedZero = payload.match_participants.find((row) =>
    row.match_id === "2017-R1-1" && row.team_side === 1 && row.player_slot === 1
  );
  const unavailable = payload.match_participants.find((row) =>
    row.match_id === "2017-R1-1" && row.team_side === 2 && row.player_slot === 1
  );
  assert.equal(recordedZero.applied_strokes, 0);
  assert.equal(recordedZero.applied_strokes_state, "RECORDED");
  assert.equal(unavailable.applied_strokes, null);
  assert.equal(unavailable.applied_strokes_state, "UNAVAILABLE");
});

test("scorecard course context and complete hole ranges fail closed", () => {
  const source = fixture({ year: 2017, rosterSize: 16, roundFormats: ["BB", "SC", "SI"], roundMatches: [4, 4, 8] });
  source.roundScorecards.push({
    Year: 2017,
    "Match ID": "2017-R1-1",
    Round: 1,
    Format: "BB",
    "Score Type": "INDIVIDUAL",
    "Player ID": "A01",
    "Course ID": "WRONG",
  });
  assert.throws(() => buildCompletedHistoryYearContract({ source, year: 2017 }), /does not match its canonical round course/);

  source.roundScorecards = [];
  source.courseHoles = Array.from({ length: 18 }, (_, index) => ({
    "Course ID": "C20171",
    Tee: "Archive",
    "Hole Number": index,
    Yardage: 350,
    Par: 4,
    "Stroke Index": index + 1,
  }));
  assert.throws(() => buildCompletedHistoryYearContract({ source, year: 2017 }), /incomplete or ambiguous Course Holes configuration/);
});

test("derived shadow is deterministic and detects record/ratings drift", () => {
  const source = fixture({ year: 2017, rosterSize: 16, roundFormats: ["BB", "SC", "SI"], roundMatches: [4, 4, 8] });
  const payload = buildCompletedHistoryYearContract({ source, year: 2017 });
  const expected = buildCompletedHistoryDerivedShadow([payload]);
  const actual = buildCompletedHistoryDerivedShadow([structuredClone(payload)]);
  assert.equal(compareCompletedHistoryDerivedShadows(expected, actual).pass, true);
  assert.equal(expected.totals.tournaments, 1);
  assert.equal(expected.totals.players, 16);
  assert.equal(expected.totals.appearances, 16);
  assert.equal(expected.totals.matches, 16);
  assert.equal(expected.totals.participantMatchFacts, 48);
  assert.equal(expected.totals.recordExclusions, 0);
  assert.ok(expected.totals.partnerships > 0);
  assert.ok(expected.totals.rivalries > 0);
  actual.players.A01.record.wins += 1;
  assert.deepEqual(compareCompletedHistoryDerivedShadows(expected, actual).differences, ["players"]);
});

test("derived shadow consumes the normalized Supabase YEAR read contract", () => {
  const source = fixture({ year: 2017, rosterSize: 16, roundFormats: ["BB", "SC", "SI"], roundMatches: [4, 4, 8] });
  const payload = buildCompletedHistoryYearContract({ source, year: 2017 });
  const envelope = completedHistoryImportEnvelope(payload, {
    authorization: {
      authorized: true,
      scope: "COMPLETED_HISTORY_IMPORT",
      actor_id: payload.requested_by,
      authorization_id: "test-only",
      authorized_at: "2026-08-21T00:00:00.000Z",
    },
  }).payload;
  const yearRead = {
    revision: { tournament_year: 2017 },
    tournament: envelope.tournament,
    players: envelope.players.map(({ player_id, display_name }) => ({ player_id, display_name })),
    teams: envelope.teams,
    roster: envelope.roster,
    matches: envelope.matches,
    match_participants: envelope.match_participants,
    awards: envelope.awards,
    record_eligibility: envelope.record_eligibility,
  };
  const sourceShadow = buildCompletedHistoryDerivedShadow([payload]);
  const storedShadow = buildCompletedHistoryDerivedShadow([
    completedHistoryYearReadToShadowPayload(yearRead),
  ]);
  assert.deepEqual(compareCompletedHistoryDerivedShadows(sourceShadow, storedShadow).differences, []);
  assert.deepEqual(storedShadow.teams[2017].team1Record, sourceShadow.teams[2017].team1Record);
});

test("correction registry is versioned, fingerprinted, and has no match-specific runtime hack", () => {
  assert.match(COMPLETED_HISTORY_CORRECTION_SET_FINGERPRINT, /^[0-9a-f]{64}$/);
  assert.ok(COMPLETED_HISTORY_CORRECTIONS.some((row) => row.id === "2023-r3-7-production-result"));
  assert.ok(COMPLETED_HISTORY_CORRECTIONS.some((row) => row.id === "2023-pete-dye-course-appearance-alias"));
  assert.ok(COMPLETED_HISTORY_CORRECTIONS.some((row) => row.id === "2024-round-2-match-4-stroke-semantics"));
  assert.ok(COMPLETED_HISTORY_CORRECTIONS.some((row) => row.id === "2024-course-tee-complete-hole-resolution"));
  assert.ok(COMPLETED_HISTORY_CORRECTIONS.some((row) => row.id === "legacy-singles-player-two-placeholder"));
});

test("Step 6A source loader is fail-closed to one production workbook and no bundled fallback", async () => {
  const source = await readFile(new URL("../lib/google-sheets-data.js", import.meta.url), "utf8");
  const boundary = source.slice(source.indexOf("loadCanonicalCompletedHistoryFoundationData"), source.indexOf("// Completed legacy History"));
  assert.match(boundary, /loadHistoricalDataFromSpreadsheet\(PRODUCTION_SPREADSHEET_ID\)/);
  assert.match(boundary, /roundScorecards[\s\S]*PRODUCTION_SPREADSHEET_ID/);
  assert.match(boundary, /courseHoles[\s\S]*PRODUCTION_SPREADSHEET_ID/);
  assert.doesNotMatch(boundary, /fallbackHistoricalData|preserveCanonicalMatchesOnFallback/);
});

test("Step 6A route remains protected and does not alter public History source gates", async () => {
  const route = await readFile(new URL("../app/api/director/completed-history/route.js", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/admin/director/completed-history/page.js", import.meta.url), "utf8");
  const client = await readFile(new URL("../app/admin/director/completed-history/CompletedHistoryClient.js", import.meta.url), "utf8");
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /process\.env\.VERCEL_ENV\s*!==\s*"preview"/);
  assert.match(route, /allowBootstrap:\s*false/);
  assert.match(route, /sameOriginMutation\(request\)/);
  assert.match(route, /A same-origin Director request is required/);
  assert.match(route, /error\?\.shadowDiagnostics/);
  assert.match(route, /durationMs: Number\(error\.shadowDiagnostics\.durationMs/);
  assert.match(route, /expected_source_fingerprint/);
  assert.match(route, /HISTORICAL_RECONCILIATION_REQUIRED/);
  assert.match(route, /action === "shadow"/);
  assert.doesNotMatch(route, /HISTORY_.*READ_SOURCE|TOURNAMENT_READ_SOURCE|PUBLISHED_ODDS_READ_SOURCE/);
  assert.match(page, /allowBootstrap: false/);
  assert.match(page, /process\.env\.VERCEL_ENV\s*!==\s*"preview"/);
  assert.match(page, /notFound\(\)/);
  assert.match(client, /directorFetch\("\/api\/director\/completed-history"/);
  assert.match(client, /idempotent re-import did not report an unchanged duplicate/);

  const files = await readdir(new URL("../supabase/migrations/", import.meta.url));
  assert.ok(files.some((name) => name === "202608210005_preview_completed_history_foundation.sql"));
  assert.ok(files.some((name) => name === "202608210006_preview_completed_history_round_name_precedence.sql"));
  assert.ok(files.some((name) => name === "202608210007_preview_completed_history_roster_provenance.sql"));
});

test("completed History importer round-name fallback is patched deterministically", async () => {
  const sql = await readFile(new URL(
    "../supabase/migrations/202608210006_preview_completed_history_round_name_precedence.sql",
    import.meta.url
  ), "utf8");
  assert.match(sql, /pg_get_functiondef\(function_signature\)/);
  assert.match(sql, /unsafe_occurrences <> 2/);
  assert.match(sql, /'Round '' \|\| \(item->>''round_number''\)'/);
  assert.match(sql, /COMPLETED_HISTORY_ROUND_NAME_PATCH_VERIFICATION_FAILED/);
});

test("completed History revision roster preserves its canonical source key", async () => {
  const sql = await readFile(new URL(
    "../supabase/migrations/202608210007_preview_completed_history_roster_provenance.sql",
    import.meta.url
  ), "utf8");
  assert.match(sql, /add column source_roster_key text/);
  assert.doesNotMatch(sql, /update scoring_authority\.completed_history_roster_facts/);
  assert.match(sql, /completed_history_roster_source_key_nonempty[\s\S]*?not valid/);
  assert.match(sql, /item->>''source_roster_key''/);
  assert.match(sql, /COMPLETED_HISTORY_ROSTER_PROVENANCE_PATCH_VERIFICATION_FAILED/);
  assert.match(sql, /canonical_roster\.tournament_id = roster\.tournament_id/);
  assert.match(sql, /canonical_roster\.player_id = roster\.player_id/);
  assert.match(sql, /COMPLETED_HISTORY_ROSTER_READ_PATCH_VERIFICATION_FAILED/);
});

test("completed History SQL is append-only, sequential, scoped, and service-role-only", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608210005_preview_completed_history_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /check \(project_ref = 'idgigvjjqkfbqjeredpb'\)/);
  assert.match(sql, /source_workbook_id text not null[\s\S]*?1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4/);
  assert.match(sql, /create or replace function public\.import_preview_completed_history_year\(input jsonb\)/);
  assert.match(sql, /DIRECTOR_HISTORY_IMPORT_AUTHORIZATION_REQUIRED/);
  assert.match(sql, /PRIOR_HISTORY_YEAR_NOT_CERTIFIED/);
  assert.match(sql, /HISTORICAL_RECONCILIATION_REQUIRED/);
  assert.match(sql, /HISTORICAL_MATCH_POINT_RECONCILIATION_FAILED/);
  assert.match(sql, /current_revision\.source_fingerprint = source_fingerprint_value[\s\S]*?current_revision\.payload_fingerprint = payload_fingerprint_value/);
  assert.match(sql, /guard_completed_history_append_only/);
  assert.match(sql, /COMPLETED_HISTORY_IS_IMMUTABLE/);
  assert.match(sql, /guard_completed_history_course_identity/);
  assert.match(sql, /alter table scoring_authority\.%I enable row level security/);
  assert.match(sql, /revoke all on function public\.import_preview_completed_history_year\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.import_preview_completed_history_year\(jsonb\)[\s\S]*?to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.import_preview_completed_history_year\(jsonb\)[\s\S]{0,120}\bto\s+(anon|authenticated|public)\b/i);
  assert.doesNotMatch(sql, /alter table scoring_authority\.matches[\s\S]{0,180}scoring_snapshot_id\s+drop not null/i);
});

test("multi-year read contract is bounded by year, player, course, and match", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608210005_preview_completed_history_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.read_preview_completed_history\(input jsonb\)/);
  for (const mode of ["YEARS", "YEAR", "PLAYER", "COURSE", "MATCH"]) {
    assert.match(sql, new RegExp(`mode_value = '${mode}'`));
  }
  assert.match(sql, /HISTORICAL_YEAR_NOT_CERTIFIED/);
  assert.match(sql, /HISTORICAL_PLAYER_NOT_FOUND/);
  assert.match(sql, /HISTORICAL_COURSE_NOT_FOUND/);
  assert.match(sql, /HISTORICAL_MATCH_NOT_FOUND/);
  assert.match(sql, /revoke all on function public\.read_preview_completed_history\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.read_preview_completed_history\(jsonb\) to service_role/);
  assert.match(sql, /'players', coalesce/);
  assert.match(sql, /'courses', coalesce/);

  const service = await readFile(new URL("../lib/completed-history-supabase.js", import.meta.url), "utf8");
  assert.match(service, /options\.matchId \? \{ match_id: clean\(options\.matchId\) \}/);
  assert.match(service, /: "YEARS";/);
});

test("historical evidence schema distinguishes missing facts from zero", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608210005_preview_completed_history_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /score_availability in \('RECORDED', 'UNAVAILABLE'\)/);
  assert.match(sql, /points_availability in \('RECORDED', 'UNAVAILABLE'\)/);
  assert.match(sql, /scorecard_coverage in \('COMPLETE', 'PARTIAL', 'UNAVAILABLE'\)/);
  assert.match(sql, /coverage_status in \('COMPLETE', 'PARTIAL', 'UNAVAILABLE'\)/);
  assert.match(sql, /UNAVAILABLE_SCORE_MUST_REMAIN_NULL/);
  assert.match(sql, /recorded_holes integer not null check \(recorded_holes between 0 and 18\)/);
  assert.match(sql, /is_record_eligible boolean not null/);
  assert.match(sql, /completed_history_awards/);
  assert.match(sql, /completed_history_course_identities/);
  assert.match(sql, /completed_history_course_appearances/);
});
