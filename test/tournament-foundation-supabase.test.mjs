import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyTournamentFoundationToLiveData,
  compareTournamentFoundationParity,
  readTournamentFoundation,
  tournamentFoundationFromGoogle,
  tournamentFoundationFromSupabaseView,
} from "../lib/tournament-foundation.js";
import {
  tournamentFoundationReadEnvironment,
  tournamentReadEnvironment,
} from "../lib/tournament-read-source.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  TOURNAMENT_FOUNDATION_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  GUIDE_SYNC_TOURNAMENT_ID: "2026",
};

const players = [
  { id: "P1", name: "Player One", slug: "player-one", photo: "p1" },
  { id: "P2", name: "Player Two", slug: "player-two", photo: "p2" },
  { id: "P3", name: "Player Three", slug: "player-three", photo: "p3" },
  { id: "P4", name: "Player Four", slug: "player-four", photo: "p4" },
];

function googleMatch(round, format, course, teamOne, teamTwo) {
  return {
    id: `2026-R${round}-1`, round, match: "1", format,
    formatName: ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[format],
    status: "Scheduled", course,
    team1Players: teamOne.map((id) => players.find((player) => player.id === id)),
    team2Players: teamTwo.map((id) => players.find((player) => player.id === id)),
  };
}

const courseRows = [
  { id: "C1", name: "Course One", logo: "course-one", tee: "Gold" },
  { id: "C2", name: "Course Two", logo: "course-two", tee: "Black" },
  { id: "C3", name: "Course Three", logo: "course-three", tee: "Gold" },
];

const googleData = {
  tournament: {
    id: "2026", year: 2026, name: "Sandbagger Invitational", edition: "10th Annual Sandbagger Invitational",
    dates: "September 25 - 26, 2026", location: "Kiawah Island", timeZone: "America/New_York",
    configuredStatus: "Live", statusMode: "Manual Override", currentRound: 3, logo: "sandbagger-2026",
    teamOne: { id: "T1", name: "Team One", logo: "team-one", captainId: "P1", score: 20.5 },
    teamTwo: { id: "T2", name: "Team Two", logo: "team-two", captainId: "P3", score: 24.5 },
  },
  players,
  rounds: [
    { number: 1, label: "Round 1", format: "Best Ball", course: courseRows[0], matches: [googleMatch(1, "BB", courseRows[0], ["P1", "P2"], ["P3", "P4"])] },
    { number: 2, label: "Round 2", format: "Scramble", course: courseRows[1], matches: [googleMatch(2, "SC", courseRows[1], ["P1", "P2"], ["P3", "P4"])] },
    { number: 3, label: "Round 3", format: "Singles", course: courseRows[2], matches: [googleMatch(3, "SI", courseRows[2], ["P1"], ["P3"])] },
  ],
};

function supabaseMatch(round, format, course, teamOne, teamTwo) {
  const participants = [
    ...teamOne.map((id, index) => ({ player_id: id, display_name: players.find((player) => player.id === id).name,
      team_side: 1, player_slot: index + 1, playing_handicap: 1, final_strokes: 0 })),
    ...teamTwo.map((id, index) => ({ player_id: id, display_name: players.find((player) => player.id === id).name,
      team_side: 2, player_slot: index + 1, playing_handicap: 2, final_strokes: 1 })),
  ];
  return {
    round: { tournament_id: "2026", round_number: round, name: `Round ${round}`, format },
    match: { match_id: `2026-R${round}-1`, round_number: round, format, status: "UPCOMING", scoring_locked: false,
      current_hole: 0, scored_holes: 0, holes_remaining: 18, result_winner: "", match_revision: 1 },
    snapshot: { course_id: course.id, tee: course.tee, par: 72, rating: 72, slope: 130, team_configuration: {} },
    presentation: { display_match_number: "1", course_name: course.name, team_1_logo: "team-one", team_2_logo: "team-two" },
    participants, scores: [],
  };
}

const supabaseView = {
  tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
  teams: [
    { tournament_id: "2026", team_id: "T1", team_side: 1, name: "Team One", source_payload: { Captain: "P1" } },
    { tournament_id: "2026", team_id: "T2", team_side: 2, name: "Team Two", source_payload: { Captain: "P3" } },
  ],
  rounds: [
    { tournament_id: "2026", round_number: 1, name: "Round 1", format: "BB" },
    { tournament_id: "2026", round_number: 2, name: "Round 2", format: "SC" },
    { tournament_id: "2026", round_number: 3, name: "Round 3", format: "SI" },
  ],
  matches: [
    supabaseMatch(1, "BB", courseRows[0], ["P1", "P2"], ["P3", "P4"]),
    supabaseMatch(2, "SC", courseRows[1], ["P1", "P2"], ["P3", "P4"]),
    supabaseMatch(3, "SI", courseRows[2], ["P1"], ["P3"]),
  ],
  tournament_presentation: {
    source_fingerprint: "a".repeat(64), imported_at: "2026-08-20T00:00:00Z",
    presentation: {
      tournament: { edition: "10th Annual Sandbagger Invitational", dates: "September 25 - 26, 2026",
        location: "Kiawah Island", timeZone: "America/New_York", configuredStatus: "Live",
        status: "Live", statusMode: "Manual Override", currentRound: 3, logo: "sandbagger-2026" },
      leaderboardsPlayers: Object.fromEntries(players.map((player) => [player.id, { slug: player.slug, photo: player.photo }])),
    },
  },
  live_revision: { totalMatchRevisions: 3 },
};

const guideProjection = { payload: { ok: true, data: { content: { content: { courses: courseRows.map((course, index) => ({
  "Course ID": course.id, Round: index + 1, Course: course.name, "Course Logo": course.logo,
})) } }, course_context: [] } } };

test("Tournament foundation source is independently Preview-gated and cannot move live scoring", () => {
  assert.equal(tournamentFoundationReadEnvironment(preview).resolved, "supabase");
  assert.equal(tournamentFoundationReadEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "google");
  assert.equal(tournamentFoundationReadEnvironment({ ...preview, GOOGLE_SHEETS_ID: "production-workbook" }).blocked, true);
  assert.equal(tournamentFoundationReadEnvironment({ ...preview, TOURNAMENT_FOUNDATION_READ_SOURCE: "automatic" }).blocked, true);
  assert.equal(tournamentFoundationReadEnvironment({ VERCEL_ENV: "preview" }).resolved, "google");
  assert.equal(tournamentReadEnvironment(preview).resolved, "google");
});

test("Google and Supabase foundation adapters preserve tournament, team, roster, round, and course parity", () => {
  const google = tournamentFoundationFromGoogle(googleData);
  const supabase = tournamentFoundationFromSupabaseView(supabaseView, guideProjection);
  const comparison = compareTournamentFoundationParity(google, supabase);
  assert.equal(comparison.pass, true, JSON.stringify(comparison, null, 2));
  assert.deepEqual(supabase.roster.map((player) => player.id), ["P1", "P2", "P3", "P4"]);
  assert.deepEqual(supabase.teams.map((team) => team.captainId), ["P1", "P3"]);
  assert.deepEqual(supabase.rounds.map((round) => round.teamSize), [2, 2, 1]);
  assert.deepEqual(supabase.rounds.map((round) => round.course.id), ["C1", "C2", "C3"]);
});

test("Homepage foundation overlay cannot replace scores, match lifecycle, or derived tournament state", () => {
  const foundation = tournamentFoundationFromSupabaseView(supabaseView, guideProjection);
  const live = structuredClone(googleData);
  live.tournament.status = "LIVE";
  live.tournament.currentRound = 3;
  live.tournament.state = { liveMatches: 7, remainingPoints: 21 };
  live.rounds[0].status = "Complete";
  const merged = applyTournamentFoundationToLiveData(live, foundation);
  assert.equal(merged.tournament.teamOne.score, 20.5);
  assert.equal(merged.tournament.teamTwo.score, 24.5);
  assert.equal(merged.tournament.status, "LIVE");
  assert.equal(merged.tournament.currentRound, 3);
  assert.deepEqual(merged.tournament.state, { liveMatches: 7, remainingPoints: 21 });
  assert.equal(merged.rounds[0].status, "Complete");
  assert.equal(merged.rounds[0].matches[0].status, "Scheduled");
});

test("Selected Supabase foundation fails closed without invoking the Google reader", async () => {
  let googleReads = 0;
  await assert.rejects(() => readTournamentFoundation({ env: preview, dependencies: {
    readTournamentLiveView: async () => ({ payload: { ok: false, code: "SUPABASE_UNAVAILABLE" } }),
    readGuideProjection: async () => guideProjection,
    readGoogleTournamentData: async () => { googleReads += 1; return googleData; },
  } }), (error) => error.code === "SUPABASE_UNAVAILABLE");
  assert.equal(googleReads, 0);
});

test("Homepage composition and public API use the shared foundation boundary while history and scoring gates remain isolated", async () => {
  const [page, homepageService, route, livePage] = await Promise.all([
    source("app/page.js"), source("lib/homepage-current-tournament.js"),
    source("app/api/tournament/foundation/route.js"), source("app/live/page.js"),
  ]);
  assert.match(page, /readHomepageCurrentTournament/);
  assert.match(homepageService, /tournamentFoundationFromSupabaseView/);
  assert.match(homepageService, /applyTournamentFoundationToLiveData/);
  assert.match(page, /refreshHistoricalData/);
  assert.match(page, /getTournaments/);
  assert.doesNotMatch(page, /getTournamentData|sheetData/);
  assert.match(route, /X-Tournament-Foundation-Read-Source/);
  assert.match(route, /X-Tournament-Foundation-Google-Requests/);
  assert.doesNotMatch(route, /getTournamentData|sheetData|google-sheets|GViz/i);
  assert.match(livePage, /requireTournamentReadSource/);
  assert.doesNotMatch(livePage, /TournamentFoundation/);
});
