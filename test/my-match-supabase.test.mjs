import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { myMatchReadEnvironment, requireMyMatchReadSource } from "../lib/my-match-read-source.js";
import {
  compareMyMatchParity,
  expectedMyMatchView,
  myMatchDataFromSupabaseView,
} from "../lib/my-match-supabase.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewEnv = {
  VERCEL_ENV: "preview",
  MY_MATCH_READ_SOURCE: "supabase",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
};

function fixture({ status = "LIVE", scoreCount = 3, matchId = "2026-R3-4" } = {}) {
  const players = [
    { player_id: "CB01", display_name: "Clay Beltran", source_payload: { Slug: "clay-beltran" } },
    { player_id: "P2", display_name: "Partner" },
    { player_id: "P3", display_name: "Opponent One" },
    { player_id: "P4", display_name: "Opponent Two" },
  ];
  const participants = players.map((player, index) => ({ match_id: matchId, player_id: player.player_id,
    team_side: index < 2 ? 1 : 2, player_slot: (index % 2) + 1, playing_handicap: index, final_strokes: index }));
  const scores = Array.from({ length: scoreCount }, (_, index) => ({ match_id: matchId, hole_number: index + 1,
    hole_revision: 1, team_1_gross_scores: [4], team_2_gross_scores: [5], team_1_strokes: [0], team_2_strokes: [0],
    team_1_net_score: 4, team_2_net_score: 5, hole_winner: "Team 1" }));
  const payload = {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "2026 Sandbagger Invitational" },
    players,
    teams: [{ tournament_id: "2026", team_id: "PICKLES", team_side: 1, name: "The Pickles" },
      { tournament_id: "2026", team_id: "LIPP", team_side: 2, name: "Lipp it and Rip it" }],
    tournament_players: players.map((player, index) => ({ tournament_id: "2026", player_id: player.player_id,
      team_id: index < 2 ? "PICKLES" : "LIPP", team_side: index < 2 ? 1 : 2, participation_status: "ACTIVE", source_payload: {} })),
    rounds: [{ tournament_id: "2026", round_number: 3, format: "SI", name: "Singles" }],
    snapshots: [{ snapshot_id: `${matchId}:S1`, match_id: matchId, course_id: "TURTLE", tee: "Gold" }],
    matches: [{ match_id: matchId, tournament_id: "2026", round_number: 3, format: "SI", scoring_snapshot_id: `${matchId}:S1`,
      status, scoring_locked: status === "FINAL", permission_revision: status === "FINAL" ? 2 : 1, match_revision: scoreCount,
      scored_holes: scoreCount, current_hole: scoreCount, holes_remaining: 18 - scoreCount,
      team_1_holes_won: scoreCount, team_2_holes_won: 0, running_result: scoreCount ? `Team 1 ${scoreCount} UP` : "Scheduled",
      result_winner: status === "FINAL" ? "Team 1" : "", authority_updated_at: "2026-08-12T00:00:00Z" }],
    match_participants: participants,
    permissions: participants.map((player) => ({ match_id: matchId, player_id: player.player_id,
      can_score: status !== "FINAL", permission_revision: status === "FINAL" ? 2 : 1 })),
    hole_scores: scores,
  };
  const presentation = { rows: [{ match_id: matchId, tournament_id: "2026", display_match_number: "4", match_sort_order: 4,
    course_name: "Turtle Point", course_logo: "turtle-point-logo", tee_time: "8:00 AM", starting_hole: "1",
    team_1_logo: "pickles-logo", team_2_logo: "lipp-logo", tournament_logo: "sandbagger-2026",
    tournament_status: "Live", tournament_time_zone: "America/New_York" }] };
  return { payload, presentation };
}

test("My Match read source is Preview-only, server-controlled, and fail-closed", () => {
  assert.equal(myMatchReadEnvironment(previewEnv).resolved, "supabase");
  assert.equal(myMatchReadEnvironment({ ...previewEnv, VERCEL_ENV: "production", GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID }).resolved, "google");
  assert.equal(myMatchReadEnvironment({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }).blocked, true);
  assert.throws(() => requireMyMatchReadSource({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }), /unavailable/);
});

for (const [label, status, holes] of [["LIVE", "LIVE", 3], ["FINAL", "FINAL", 18], ["zero-hole", "UPCOMING", 0]]) {
  test(`participant-scoped adapter preserves ${label} current and completed match behavior`, () => {
    const data = fixture({ status, scoreCount: holes });
    const view = expectedMyMatchView(data.payload, data.presentation, "CB01");
    const rendered = myMatchDataFromSupabaseView(view);
    assert.equal(rendered.player.id, "CB01");
    assert.equal(rendered.matches.length, 1);
    assert.equal(rendered.matches[0].holesRecorded, holes);
    assert.equal(rendered.matches[0].scoringEnabled, status !== "FINAL");
    assert.equal(Boolean(rendered.matches[0].result), status === "FINAL");
    assert.equal(compareMyMatchParity(rendered, myMatchDataFromSupabaseView(structuredClone(view))).pass, true);
  });
}

test("My Match parity detects lifecycle, permission, and participant differences", () => {
  const data = fixture();
  const expected = myMatchDataFromSupabaseView(expectedMyMatchView(data.payload, data.presentation, "CB01"));
  const changed = expectedMyMatchView(data.payload, data.presentation, "CB01");
  changed.matches[0].permission.can_score = false;
  assert.equal(compareMyMatchParity(expected, myMatchDataFromSupabaseView(changed)).pass, false);
});

test("Google My Match parity excludes the Supabase-only match concurrency revision while retaining permission revision", () => {
  const data = fixture();
  const expected = myMatchDataFromSupabaseView(expectedMyMatchView(data.payload, data.presentation, "CB01"));
  const changed = structuredClone(expected);
  changed.matches[0].matchRevision = 99;
  assert.equal(compareMyMatchParity(expected, changed).pass, true);
  changed.matches[0].accessVersion = 99;
  assert.equal(compareMyMatchParity(expected, changed).pass, false);
});

test("My Match RPC is indexed, RLS-compatible service-only, and unavailable to participant roles", async () => {
  const migration = await source("supabase/migrations/202608120019_preview_my_match_reads.sql");
  assert.match(migration, /create index if not exists scoring_authority_match_participants_player_idx/);
  assert.match(migration, /create or replace function public\.read_my_match_view\(target_tournament_id text, target_player_id text\)/);
  assert.match(migration, /revoke all on function public\.read_my_match_view\(text, text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.read_my_match_view\(text, text\) to service_role/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
});

test("active Supabase My Match path removes Google match reads and keeps Passport identity", async () => {
  const route = await source("app/api/my-match/route.js");
  const client = await source("app/score/ScoreEntry.js");
  assert.match(route, /requireMyMatchReadSource/);
  assert.match(route, /verifyPlayerPassportSession/);
  assert.match(route, /playerPassportEffectivePlayerId/);
  assert.match(route, /readMyMatchView/);
  assert.match(route, /googleRequests: 0/);
  assert.match(client, /dashboardOnly \? "\/api\/my-match" : "\/api\/player-passport\/initialize"/);
  const supabaseBranch = route.slice(route.indexOf('if (source.resolved === "google")') + 1);
  assert.doesNotMatch(supabaseBranch, /readPlayerPassportMatches|readLiveScoringMatch|getTournamentData/);
});

test("Start Scoring remains on the existing Passport authorization route and Final/locked cards do not start scoring", async () => {
  const dashboard = await source("app/score/MyMatchDashboard.js");
  const score = await source("app/score/ScoreEntry.js");
  const action = await source("app/api/player-passport/matches/route.js");
  assert.match(score, /fetchWithTransientRetry\("\/api\/player-passport\/matches"/);
  assert.match(action, /authorizePassportMatch/);
  assert.match(dashboard, /\["Live", "Final"\]\.includes\(status\)/);
  assert.match(dashboard, /status === "Live"/);
  assert.match(dashboard, /status === "Locked"/);
});

test("normal My Match handling records non-blocking scoped Auth shadow observations", async () => {
  const route = await source("app/api/my-match/route.js");
  assert.match(route, /identity\.authRehearsalEnabled/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /observeParticipantIdentityShadow/);
  assert.match(route, /passportContext: personalized\.identityContext/);
  assert.match(route, /My Match participant identity shadow unavailable/);
});

test("Director parity compares all 24 active participants and reports independent query/service timings", async () => {
  const route = await source("app/api/director/scoring-authority/route.js");
  const readiness = await source("app/admin/director/game-center-readiness/GameCenterReadinessClient.js");
  assert.match(route, /players\.length === 24/);
  assert.match(route, /action === "my-match-parity"/);
  assert.match(route, /postgresQuery: benchmarkSummary/);
  assert.match(route, /supabaseService: benchmarkSummary/);
  assert.match(readiness, /Verify My Match Parity/);
});
