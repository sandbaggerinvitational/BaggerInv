import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gameCenterReadEnvironment, requireGameCenterReadSource } from "../lib/game-center-read-source.js";
import {
  buildGameCenterPresentationImport,
  compareGameCenterParity,
  expectedGameCenterView,
  gameCenterDataFromSupabaseView,
} from "../lib/game-center-supabase.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewEnv = {
  VERCEL_ENV: "preview",
  GAME_CENTER_READ_SOURCE: "supabase",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
};

function sheet(records) {
  return { records: records.map((record) => ({ record })) };
}

function fixture(status = "LIVE", scoreCount = 1) {
  const matchId = status === "FINAL" ? "2026-R3-4" : status === "UPCOMING" ? "2026-R3-12" : "2026-R3-9";
  const holes = Array.from({ length: 18 }, (_, index) => ({ match_id: matchId, hole_number: index + 1,
    snapshot_id: `${matchId}:S1`, stroke_index: index + 1, par: 4, yardage: 400 + index }));
  const scores = Array.from({ length: scoreCount }, (_, index) => ({ match_id: matchId, hole_number: index + 1,
    hole_revision: 1, team_1_gross_scores: [4], team_2_gross_scores: [5], team_1_strokes: [0], team_2_strokes: [0],
    team_1_net_score: 4, team_2_net_score: 5, hole_winner: "Team 1", updated_at: "2026-08-12T00:00:00Z" }));
  const players = [
    { player_id: "CB01", display_name: "Clay Beltran" }, { player_id: "P2", display_name: "Partner" },
    { player_id: "P3", display_name: "Opponent One" }, { player_id: "P4", display_name: "Opponent Two" },
  ];
  const participants = players.map((player, index) => ({ match_id: matchId, player_id: player.player_id,
    team_side: index < 2 ? 1 : 2, player_slot: (index % 2) + 1, playing_handicap: index, final_strokes: index }));
  const scorecardComplete = scoreCount === 18;
  const payload = {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "2026 Sandbagger Invitational" },
    teams: [
      { tournament_id: "2026", team_id: "PICKLES", team_side: 1, name: "The Pickles" },
      { tournament_id: "2026", team_id: "LIPP", team_side: 2, name: "Lipp it and Rip it" },
    ],
    rounds: [{ tournament_id: "2026", round_number: 3, format: "SI", name: "Singles" }],
    players,
    snapshots: [{ snapshot_id: `${matchId}:S1`, tournament_id: "2026", match_id: matchId, format: "SI",
      course_id: "TURTLE", tee: "Gold", rating: 71.9, slope: 136, par: 72,
      team_configuration: {}, participant_configuration: {}, hole_definitions: [] }],
    matches: [{ match_id: matchId, tournament_id: "2026", round_number: 3, format: "SI", scoring_snapshot_id: `${matchId}:S1`,
      status, scoring_locked: status === "FINAL", scored_holes: scoreCount, current_hole: scoreCount,
      holes_remaining: 18 - scoreCount, team_1_holes_won: scoreCount, team_2_holes_won: 0,
      running_result: scoreCount ? `The Pickles ${scoreCount} UP` : "Scheduled", result_winner: scorecardComplete ? "Team 1" : "" }],
    match_participants: participants,
    permissions: participants.map((player) => ({ match_id: matchId, player_id: player.player_id,
      can_score: status !== "FINAL", permission_revision: status === "FINAL" ? 2 : 1 })),
    match_holes: holes,
    hole_scores: scores,
  };
  const presentation = { tournament_id: "2026", rows: [{ match_id: matchId, tournament_id: "2026",
    display_match_number: matchId.split("-").at(-1), match_sort_order: Number(matchId.split("-").at(-1)),
    course_name: "Turtle Point", course_logo: "turtle-point-logo", course_yardage: "6503",
    tee_time: "8:00 AM", starting_hole: "1", team_1_logo: "pickles-logo", team_2_logo: "lippit-logo",
    tournament_location: "Kiawah Island", tournament_logo: "sandbagger-2026", tournament_status: "Live",
    tournament_time_zone: "America/New_York" }] };
  return { payload, presentation, matchId };
}

test("Game Center read source is Preview-only, server-controlled, and fails closed when Preview Supabase config is incomplete", () => {
  assert.equal(gameCenterReadEnvironment(previewEnv).resolved, "supabase");
  assert.equal(gameCenterReadEnvironment({ ...previewEnv, VERCEL_ENV: "production", GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID }).resolved, "google");
  assert.equal(gameCenterReadEnvironment({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }).blocked, true);
  assert.throws(() => requireGameCenterReadSource({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }), /unavailable/);
});

test("presentation import is explicit, complete, and limited to the approved Game Center projection", () => {
  const imported = buildGameCenterPresentationImport({ sourceWorkbookId: "preview-workbook", requestedBy: "Director", sheets: {
    "Live Matches": sheet([{ "Tournament ID": "2026", Year: 2026, "Match ID": "2026-R3-4", Match: 4,
      "Course ID": "TURTLE", "Tee Time": "8:00 AM", "Starting Hole": 1, "Updated At": "2026-08-12T00:00:00Z" }]),
    Tournaments: sheet([{ "Tournament ID": "2026", Year: 2026, Destination: "Kiawah Island", "Tournament Logo Filename": "sandbagger-2026" }]),
    "Team Names": sheet([{ Year: 2026, "Team Side": "Team 1", "Team Logo": "pickles-logo", "Primary Color": "green" },
      { Year: 2026, "Team Side": "Team 2", "Team Logo": "lippit-logo", "Primary Color": "blue" }]),
    Courses: sheet([{ "Course ID": "TURTLE", "Course Name": "Turtle Point", "Course Logo": "turtle-point-logo" }]),
  } });
  assert.equal(imported.environment, "PREVIEW");
  assert.equal(imported.rows.length, 1);
  assert.deepEqual(Object.keys(imported.rows[0]).sort(), ["course_logo", "course_name", "course_yardage", "display_match_number",
    "match_id", "match_sort_order", "source_updated_at", "starting_hole", "team_1_logo", "team_1_primary_color",
    "team_1_secondary_color", "team_2_logo", "team_2_primary_color", "team_2_secondary_color", "tee_time",
    "tournament_id", "tournament_location", "tournament_logo", "tournament_status", "tournament_time_zone"].sort());
});

for (const [label, status, holes] of [["LIVE", "LIVE", 6], ["FINAL", "FINAL", 18], ["zero-hole", "UPCOMING", 0]]) {
  test(`Supabase Game Center adapter preserves ${label} canonical match state`, () => {
    const data = fixture(status, holes);
    const view = expectedGameCenterView(data.payload, data.presentation, data.matchId);
    const rendered = gameCenterDataFromSupabaseView(view, "CB01");
    assert.equal(rendered.match.id, data.matchId);
    assert.equal(rendered.stats.played, holes);
    assert.equal(rendered.match.scoringLocked, status === "FINAL");
    assert.equal(rendered.holes.length, 18);
    assert.equal(rendered.participantSide, 1);
    assert.equal(compareGameCenterParity(rendered, gameCenterDataFromSupabaseView(structuredClone(view), "CB01")).pass, true);
  });
}

test("same canonical data must diverge when any score or navigation field changes", () => {
  const data = fixture("LIVE", 1);
  const expected = gameCenterDataFromSupabaseView(expectedGameCenterView(data.payload, data.presentation, data.matchId));
  const changedView = expectedGameCenterView(data.payload, data.presentation, data.matchId);
  changedView.scores[0].team_1_net_score = 3;
  assert.equal(compareGameCenterParity(expected, gameCenterDataFromSupabaseView(changedView)).pass, false);
});

test("migration keeps Game Center RPC and projection service-only with RLS and no public policies", async () => {
  const migration = await source("supabase/migrations/202608120017_preview_game_center_reads.sql");
  assert.match(migration, /create table scoring_authority\.game_center_presentations/);
  assert.match(migration, /alter table scoring_authority\.game_center_presentations enable row level security/);
  assert.match(migration, /revoke all on function public\.read_game_center_view\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.read_game_center_view\(text\) to service_role/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
});

test("active Supabase Game Center branch has no Google or tournament-model read on its critical path", async () => {
  const data = await source("app/game-center/gameCenterData.js");
  const branch = data.slice(data.indexOf('if (source.resolved === "supabase")'), data.indexOf("const [tournamentData, scoring]"));
  assert.match(branch, /readGameCenterView\(id\)/);
  assert.match(branch, /googleRequests: 0/);
  assert.doesNotMatch(branch, /readLiveScoringMatch|getTournamentData/);
  const page = await source("app/game-center/[matchId]/page.js");
  const route = await source("app/api/game-center/[matchId]/route.js");
  assert.match(`${page}\n${route}`, /verifyPlayerPassportSession/);
  assert.doesNotMatch(`${page}\n${route}`, /resolvePlayerPassportToken|inspectPlayerPassportToken/);
});
