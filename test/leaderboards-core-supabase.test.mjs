import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { leaderboardsCoreReadEnvironment, requireLeaderboardsCoreReadSource } from "../lib/leaderboards-core-read-source.js";
import {
  compareLeaderboardsCoreParity,
  leaderboardsCoreDataFromSupabaseView,
  leaderboardsCoreParityProjection,
  validateLeaderboardsCoreAttribution,
} from "../lib/leaderboards-core-supabase.js";
import { clearLeaderboardsCoreCache, leaderboardsCoreCacheVersion, readLeaderboardsCoreCache, writeLeaderboardsCoreCache } from "../lib/leaderboards-core-cache.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
};

const players = Array.from({ length: 8 }, (_, index) => ({
  player_id: `P${index + 1}`,
  display_name: `Player ${index + 1}`,
  source_payload: { Slug: `player-${index + 1}` },
  presentation: { photo: `player-${index + 1}-pic` },
  team_id: index % 4 < 2 ? "T1" : "T2",
  team_side: index % 4 < 2 ? 1 : 2,
  participation_status: "ACTIVE",
}));

function participants(matchId, ids, format) {
  return ids.map((id, index) => ({
    match_id: matchId,
    player_id: id,
    display_name: players.find((player) => player.player_id === id)?.display_name,
    source_payload: players.find((player) => player.player_id === id)?.source_payload || {},
    team_side: index < ids.length / 2 ? 1 : 2,
    player_slot: format === "SI" ? 1 : (index % 2) + 1,
    playing_handicap: index,
    final_strokes: index,
  }));
}

function scores(matchId, format, count, winner = "Team 1") {
  const individualCount = format === "SI" ? 1 : 2;
  const values = format === "SC" ? 1 : individualCount;
  return Array.from({ length: count }, (_, index) => {
    const hole = index + 1;
    const team1Gross = Array.from({ length: values }, (_, slot) => 4 + slot);
    const team2Gross = Array.from({ length: values }, () => 5);
    const team1Strokes = format === "SC" ? [hole === 1 ? 1 : 0]
      : format === "SI" ? [0]
      : [0, hole === 1 ? 1 : 0];
    const team2Strokes = format === "SC" ? [0]
      : format === "SI" ? [hole === 1 ? 1 : 0]
      : [hole <= 2 ? 1 : 0, hole <= 3 ? 1 : 0];
    return {
      hole_number: hole,
      hole_revision: 1,
      team_1_gross_scores: team1Gross,
      team_2_gross_scores: team2Gross,
      team_1_strokes: team1Strokes,
      team_2_strokes: team2Strokes,
      team_1_net_score: Math.min(...team1Gross.map((gross, slot) => gross - team1Strokes[slot])),
      team_2_net_score: Math.min(...team2Gross.map((gross, slot) => gross - team2Strokes[slot])),
      hole_winner: winner,
      updated_at: `2026-08-12T00:${String(index).padStart(2, "0")}:00Z`,
      match_id: matchId,
    };
  });
}

function entry({ matchId, round, format, ids, status, count, clinched = false }) {
  return {
    match: {
      match_id: matchId, tournament_id: "2026", round_number: round, format,
      scoring_snapshot_id: `${matchId}:S1`, status, scoring_locked: status === "FINAL",
      match_revision: count, scored_holes: count, current_hole: count, holes_remaining: 18 - count,
      team_1_holes_won: count, team_2_holes_won: 0, running_result: count ? `Team 1 ${count} UP` : "Scheduled",
      result_winner: status === "FINAL" ? "Team 1" : "", clinched, scorecard_complete: count === 18,
      finalized_at: status === "FINAL" ? "2026-08-12T12:00:00Z" : null,
    },
    round: { tournament_id: "2026", round_number: round, format, name: `Round ${round}` },
    snapshot: {
      snapshot_id: `${matchId}:S1`, snapshot_revision: 1, canonical_hash: "a".repeat(64),
      course_id: `C${round}`, tee: "Tournament", par: 72, rating: 72, slope: 130, format,
      team_configuration: { team_1_playing_handicap: 1, team_2_playing_handicap: 0, team_1_strokes: 1, team_2_strokes: 0 },
      participant_configuration: {},
    },
    presentation: {
      display_match_number: matchId.split("-").at(-1), match_sort_order: Number(matchId.split("-").at(-1)),
      course_name: `Course ${round}`, course_logo: `course-${round}.png`,
      team_1_logo: "team-1.png", team_2_logo: "team-2.png", tournament_logo: "sandbagger-2026.png",
      tournament_location: "Kiawah Island", tournament_status: "Live", tournament_time_zone: "America/New_York",
    },
    participants: participants(matchId, ids, format),
    holes: Array.from({ length: 18 }, (_, index) => ({ hole_number: index + 1, stroke_index: index + 1, par: 4, yardage: 400 })),
    scores: scores(matchId, format, count),
  };
}

function fixture() {
  const matches = [
    entry({ matchId: "2026-R1-6", round: 1, format: "BB", ids: ["P1", "P2", "P3", "P4"], status: "FINAL", count: 18 }),
    entry({ matchId: "2026-R2-1", round: 2, format: "SC", ids: ["P5", "P6", "P7", "P8"], status: "LIVE", count: 7, clinched: true }),
    entry({ matchId: "2026-R3-4", round: 3, format: "SI", ids: ["P1", "P3"], status: "FINAL", count: 18 }),
    entry({ matchId: "2026-R3-9", round: 3, format: "SI", ids: ["P2", "P4"], status: "UPCOMING", count: 0 }),
  ];
  return {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
    teams: [{ tournament_id: "2026", team_id: "T1", team_side: 1, name: "The Pickles" },
      { tournament_id: "2026", team_id: "T2", team_side: 2, name: "Lipp it and Rip it" }],
    players,
    rounds: [1, 2, 3].map((round) => ({ tournament_id: "2026", round_number: round,
      format: ["BB", "SC", "SI"][round - 1], name: `Round ${round}`, status: round < 3 ? "FINAL" : "LIVE" })),
    matches,
    tournament_presentation: { source_fingerprint: "b".repeat(64), presentation: { tournament: {
      location: "Kiawah Island", logo: "sandbagger-2026.png", status: "Live", currentRound: 3,
      statusMode: "Automatic", timeZone: "America/New_York",
    } } },
    source_revision: {
      tournamentId: "2026",
      matches: matches.map((entryValue) => ({ matchId: entryValue.match.match_id,
        matchRevision: entryValue.match.match_revision, status: entryValue.match.status,
        scoringLocked: entryValue.match.scoring_locked, scorecardComplete: entryValue.match.scorecard_complete,
        finalizedAt: entryValue.match.finalized_at })).sort((left, right) => left.matchId.localeCompare(right.matchId)),
      holes: matches.flatMap((entryValue) => entryValue.scores.map((score) => ({ matchId: entryValue.match.match_id,
        holeNumber: score.hole_number, holeRevision: score.hole_revision }))).sort((left, right) =>
          left.matchId.localeCompare(right.matchId) || left.holeNumber - right.holeNumber),
    },
    query_ms: 3.2,
  };
}

test("Leaderboards core source is Preview-only and Production fails closed", () => {
  assert.equal(leaderboardsCoreReadEnvironment(preview).resolved, "supabase");
  assert.equal(leaderboardsCoreReadEnvironment({ ...preview, VERCEL_ENV: "production",
    GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID }).resolved, "google");
  assert.equal(leaderboardsCoreReadEnvironment({ ...preview, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }).blocked, true);
  assert.throws(() => requireLeaderboardsCoreReadSource({ ...preview, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }), /unavailable/);
});

test("service-only RPC returns canonical inputs without recreating standings in SQL", async () => {
  const migration = await source("supabase/migrations/202608120027_preview_leaderboards_core_reads.sql");
  assert.match(migration, /create or replace function public\.read_leaderboards_core_view/);
  assert.match(migration, /from scoring_authority\.matches m/);
  assert.match(migration, /from scoring_authority\.hole_scores hs/);
  assert.match(migration, /team_1_gross_scores/);
  assert.match(migration, /team_1_strokes/);
  assert.match(migration, /holeRevision/);
  assert.match(migration, /revoke all on function public\.read_leaderboards_core_view\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.read_leaderboards_core_view\(text\) to service_role/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)|dense_rank|row_number|calculateMatchPoints/i);
});

test("existing JavaScript engines preserve BB, Scramble pairing, Singles, Live, Final, clinched, and zero-hole behavior", () => {
  const data = leaderboardsCoreDataFromSupabaseView(fixture());
  assert.equal(data.slotVerification.pass, true, JSON.stringify(data.slotVerification.issues));
  assert.deepEqual(data.slotVerification.formats, ["BB", "SC", "SI"]);
  assert.equal(data.scoreLeaderboard.filter((row) => row.entityType === "PAIRING").length, 2);
  assert.equal(data.scoreLeaderboard.filter((row) => row.entityType === "PLAYER").length, 6);
  assert.equal(data.rounds.flatMap((round) => round.matches).find((match) => match.id === "2026-R3-9").currentHole, 0);
  assert.equal(data.rounds.flatMap((round) => round.matches).find((match) => match.id === "2026-R2-1").archiveFinal, false);
  assert.equal(compareLeaderboardsCoreParity(data, structuredClone(data)).pass, true);
  assert.equal(leaderboardsCoreParityProjection(data).roundPlayers.length, 3);
});

test("source fingerprint is deterministic and changes for a hole revision", () => {
  const first = leaderboardsCoreDataFromSupabaseView(fixture());
  const second = leaderboardsCoreDataFromSupabaseView(structuredClone(fixture()));
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  const changed = fixture();
  changed.source_revision.holes[0].holeRevision += 1;
  assert.notEqual(first.sourceFingerprint, leaderboardsCoreDataFromSupabaseView(changed).sourceFingerprint);
});

test("slot validation rejects array/participant mismatches instead of misattributing a score", () => {
  const view = fixture();
  const data = leaderboardsCoreDataFromSupabaseView(view);
  const broken = structuredClone(view);
  broken.matches[0].scores[0].team_1_gross_scores = [4];
  const result = validateLeaderboardsCoreAttribution(broken, data.scoreLeaderboard);
  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "SCORE_SLOT_COUNT"));
});

test("Preview page and API use Supabase core with no Google fallback or Passport-named identity request", async () => {
  const [page, route, dashboard, loader, director] = await Promise.all([
    source("app/live/page.js"), source("app/api/leaderboards/core/route.js"),
    source("app/live/LeaderboardsDashboard.js"), source("app/live/LeaderboardsSupabaseRead.js"),
    source("app/api/director/scoring-authority/route.js"),
  ]);
  assert.match(page, /supabaseLeaderboards/);
  assert.match(page, /<LeaderboardsSupabaseRead/);
  assert.match(route, /resolveSupabaseParticipantIdentity/);
  assert.match(route, /readLeaderboardsCoreView/);
  assert.match(route, /X-Leaderboards-Core-Google-Requests/);
  assert.doesNotMatch(route, /getTournamentData|google-sheets|\/api\/live/);
  assert.match(loader, /\/api\/leaderboards\/core/);
  assert.match(dashboard, /coreReadSource/);
  assert.match(dashboard, /secondaryReadUrl/);
  assert.match(dashboard, /tab === "skins"/);
  assert.match(dashboard, /if \(!supabaseCore\) \{\s*fetch\("\/api\/player-passport\/session"/);
  assert.match(director, /leaderboards-core-parity/);
});

test("revisioned display cache is participant-scoped and cannot authorize scoring", () => {
  const previousWindow = globalThis.window;
  const session = new Map();
  const local = new Map([["sbi-participant-shell", JSON.stringify({ id: "P1" })]]);
  const storage = (map) => ({ getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) });
  globalThis.window = { sessionStorage: storage(session), localStorage: storage(local) };
  try {
    const data = leaderboardsCoreDataFromSupabaseView(fixture());
    const payload = { player: { id: "P1" }, data };
    writeLeaderboardsCoreCache(payload);
    assert.equal(JSON.parse(session.get("sbi-leaderboards-core")).version, leaderboardsCoreCacheVersion);
    assert.deepEqual(readLeaderboardsCoreCache(), payload);
    assert.equal(Object.hasOwn(readLeaderboardsCoreCache(), "authorization"), false);
    local.set("sbi-participant-shell", JSON.stringify({ id: "P2" }));
    assert.equal(readLeaderboardsCoreCache(), null);
    clearLeaderboardsCoreCache();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("Google-backed secondary failures are isolated from the core route", async () => {
  const [route, dashboard] = await Promise.all([
    source("app/api/leaderboards/core/route.js"), source("app/live/LeaderboardsDashboard.js"),
  ]);
  assert.doesNotMatch(route, /Net Skins|Calcutta|Odds|Storylines|Tournament Intelligence/);
  assert.match(dashboard, /Core team and player standings remain available/);
  assert.match(dashboard, /secondaryState === "error"/);
  assert.match(dashboard, /setOddsSnapshots\(\[\]\)/);
});
