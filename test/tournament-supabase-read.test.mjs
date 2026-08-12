import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildParticipantHomePresentationImport } from "../lib/participant-home-supabase.js";
import { tournamentReadEnvironment } from "../lib/tournament-read-source.js";
import { compareTournamentLiveParity, tournamentLiveDataFromSupabaseView } from "../lib/tournament-live-supabase.js";
import { readTournamentLiveCache, tournamentLiveCacheVersion, writeTournamentLiveCache } from "../lib/tournament-live-cache.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  TOURNAMENT_READ_SOURCE: "supabase",
};

test("Tournament Supabase source is Preview-only and Production fails closed", () => {
  assert.equal(tournamentReadEnvironment(preview).resolved, "supabase");
  assert.equal(tournamentReadEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "google");
  assert.equal(tournamentReadEnvironment({ ...preview, GOOGLE_SHEETS_ID: "production-workbook" }).blocked, true);
  assert.equal(tournamentReadEnvironment({ VERCEL_ENV: "preview" }).resolved, "google");
});

test("Tournament RPC is compact, service-only, and uses canonical score authority", async () => {
  const migration = await source("supabase/migrations/202608120025_preview_tournament_live_reads.sql");
  assert.match(migration, /create or replace function public\.read_tournament_live_view/);
  assert.match(migration, /from scoring_authority\.matches m/);
  assert.match(migration, /from scoring_authority\.hole_scores hs/);
  assert.match(migration, /left join scoring_authority\.game_center_presentations/);
  assert.match(migration, /participant_home_presentations/);
  assert.match(migration, /revoke all on function public\.read_tournament_live_view\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.read_tournament_live_view\(text\) to service_role/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
});

test("Tournament primary request and default Preview page are Google-free under the server flag", async () => {
  const [route, page, wrapper, dashboard] = await Promise.all([
    source("app/api/tournament/live/route.js"), source("app/live/page.js"),
    source("app/live/TournamentSupabaseRead.js"), source("app/live/TournamentDashboard.js"),
  ]);
  assert.match(page, /requireTournamentReadSource/);
  assert.match(page, /source\.resolved === "supabase"/);
  assert.match(page, /<TournamentSupabaseRead/);
  assert.match(route, /readTournamentLiveView/);
  assert.match(route, /X-Tournament-Google-Requests/);
  assert.doesNotMatch(route, /getTournamentData|google-sheets|\/api\/live/);
  assert.match(wrapper, /\/api\/tournament\/live/);
  assert.match(wrapper, /router\.prefetch\("\/my-match"\)/);
  assert.match(wrapper, /game-center/);
  assert.match(dashboard, /secondaryReadUrl/);
  assert.match(dashboard, /\?module=calcutta/);
});

test("Director-published Calcutta is imported as a lazy display projection", () => {
  const imported = buildParticipantHomePresentationImport({ sourceWorkbookId: "preview-workbook", requestedBy: "Director", liveData: {
    tournament: { id: "2026", year: 2026, name: "Sandbagger Invitational" },
    players: [], netSkins: { rounds: [] }, timeline: { events: [] },
    calcutta: { available: true, standings: [{ team: "The Pickles", points: 10 }] },
  } });
  assert.deepEqual(imported.presentation.tournamentSecondary.calcutta, {
    available: true, standings: [{ team: "The Pickles", points: 10 }],
  });
});

test("canonical Supabase live state produces deterministic points, progress, and momentum", () => {
  const view = {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
    teams: [{ team_side: 1, team_id: "T1", name: "The Pickles" }, { team_side: 2, team_id: "T2", name: "Lipp it and Rip it" }],
    rounds: [{ tournament_id: "2026", round_number: 1, name: "Round 1", format: "BB" }],
    tournament_presentation: { source_fingerprint: "a".repeat(64), presentation: { tournament: { status: "Live", currentRound: 1, location: "Kiawah Island" } } },
    live_revision: { totalMatchRevisions: 2 }, query_ms: 2.5,
    matches: [1, 2].map((numberValue) => ({
      round: { round_number: 1, format: "BB" },
      match: { match_id: `2026-R1-${numberValue}`, round_number: 1, format: "BB", status: "FINAL", scoring_locked: true,
        current_hole: 18, scored_holes: 18, holes_remaining: 0, result_winner: numberValue === 1 ? "Team 1" : "Team 2", match_revision: 1 },
      snapshot: { course_id: "TPG", tee: "Gold", par: 72, rating: 71.9, slope: 136, team_configuration: {} },
      presentation: { display_match_number: String(numberValue), course_name: "Turtle Point", tournament_location: "Kiawah Island",
        team_1_logo: "pickles.png", team_2_logo: "lippit.png" },
      participants: [
        { player_id: `P${numberValue}`, display_name: `Player ${numberValue}`, team_side: 1, player_slot: 1, playing_handicap: 1, final_strokes: 0 },
        { player_id: `O${numberValue}`, display_name: `Opponent ${numberValue}`, team_side: 2, player_slot: 1, playing_handicap: 2, final_strokes: 1 },
      ],
      scores: Array.from({ length: 18 }, (_, index) => ({ hole_number: index + 1,
        hole_winner: numberValue === 1 ? (index < 9 ? "Team 1" : "Halved") : (index < 9 ? "Team 2" : "Halved") })),
    })),
  };
  const data = tournamentLiveDataFromSupabaseView(view);
  assert.equal(data.rounds.length, 1);
  assert.equal(data.rounds[0].progress.completedMatches, 2);
  assert.equal(data.tournament.teamOne.score + data.tournament.teamTwo.score, 6);
  assert.equal(data.tournament.state.remainingMatches, 0);
  assert.equal(compareTournamentLiveParity(data, structuredClone(data)).pass, true);

  const unstartedView = structuredClone(view);
  unstartedView.matches = [{
    ...unstartedView.matches[0],
    match: { ...unstartedView.matches[0].match, status: "LIVE", scoring_locked: false,
      current_hole: 0, scored_holes: 0, holes_remaining: 18, result_winner: "" },
    scores: [],
  }];
  const unstarted = tournamentLiveDataFromSupabaseView(unstartedView).rounds[0].matches[0];
  assert.equal(unstarted.currentHole, 0);
  assert.equal(unstarted.team1Points, null);
  assert.equal(unstarted.team2Points, null);
});

test("Tournament display cache is revisioned and cannot authorize scoring", () => {
  const previousWindow = globalThis.window;
  const session = new Map();
  globalThis.window = { sessionStorage: {
    getItem: (key) => session.get(key) || null,
    setItem: (key, value) => session.set(key, String(value)),
    removeItem: (key) => session.delete(key),
  } };
  try {
    const payload = { tournament: { id: "2026" }, rounds: [], revision: "abc" };
    writeTournamentLiveCache(payload);
    assert.equal(JSON.parse(session.get("sbi-tournament-live")).version, tournamentLiveCacheVersion);
    assert.deepEqual(readTournamentLiveCache(), payload);
    assert.equal(Object.hasOwn(readTournamentLiveCache(), "authorization"), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("secondary failures remain isolated from the canonical Tournament live route", async () => {
  const [primary, secondary, dashboard] = await Promise.all([
    source("app/api/tournament/live/route.js"), source("app/api/tournament/secondary/route.js"), source("app/live/TournamentDashboard.js"),
  ]);
  assert.doesNotMatch(primary, /readTournamentSecondaryView|calcutta/);
  assert.match(secondary, /This Tournament section is temporarily unavailable/);
  assert.match(dashboard, /The live Tournament remains available/);
  assert.match(dashboard, /no-store/);
});
