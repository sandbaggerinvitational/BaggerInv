import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readHomepageCurrentTournament } from "../lib/homepage-current-tournament.js";
import { homepageCurrentReadEnvironment } from "../lib/tournament-read-source.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  TOURNAMENT_READ_SOURCE: "supabase",
  TOURNAMENT_FOUNDATION_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  STORYLINES_READ_SOURCE: "supabase",
  NET_SKINS_READ_SOURCE: "supabase",
  GUIDE_SYNC_TOURNAMENT_ID: "2026",
  PREVIEW_TIMELINE_DATE: "2026-08-13",
};

const teams = [
  { tournament_id: "2026", team_id: "PICKLES", team_side: 1, name: "The Pickles", source_payload: { Captain: "CL01" } },
  { tournament_id: "2026", team_id: "LIR", team_side: 2, name: "Lipp it and Rip it", source_payload: { Captain: "JS01" } },
];

function match(id, round, number, status, winner) {
  const teamOne = round === 1 ? ["CL01", "CB01"] : ["CB01", "MS02"];
  const teamTwo = round === 1 ? ["JS01", "PN01"] : ["PN01", "RM01"];
  const participants = [
    ...teamOne.map((playerId, index) => ({ player_id: playerId, display_name: playerId,
      team_side: 1, player_slot: index + 1, playing_handicap: 1, final_strokes: 0 })),
    ...teamTwo.map((playerId, index) => ({ player_id: playerId, display_name: playerId,
      team_side: 2, player_slot: index + 1, playing_handicap: 2, final_strokes: 1 })),
  ];
  return {
    round: { tournament_id: "2026", round_number: round, name: `Round ${round}`, format: round === 1 ? "BB" : "SC" },
    match: { match_id: id, round_number: round, format: round === 1 ? "BB" : "SC", status,
      scoring_locked: status === "FINAL", current_hole: 18, scored_holes: 18, holes_remaining: 0,
      result_winner: status === "FINAL" ? winner : "", match_revision: 7 },
    snapshot: { course_id: `C${round}`, tee: "Gold", par: 72, rating: 72, slope: 130, team_configuration: {} },
    presentation: { display_match_number: String(number), course_name: `Course ${round}`,
      tournament_location: "Kiawah Island", team_1_logo: "pickles-logo.webp", team_2_logo: "lippit-logo.webp" },
    participants,
    scores: Array.from({ length: 18 }, (_, index) => ({ hole_number: index + 1,
      hole_winner: index < 10 ? winner : "Halved", score_revision: 7 })),
  };
}

const supabaseView = {
  tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
  teams,
  rounds: [
    { tournament_id: "2026", round_number: 1, name: "Round 1", format: "BB" },
    { tournament_id: "2026", round_number: 2, name: "Round 2", format: "SC" },
  ],
  matches: [
    match("2026-R1-1", 1, 1, "FINAL", "Team 1"),
    match("2026-R1-4", 1, 4, "LIVE", "Team 1"),
    match("2026-R2-1", 2, 1, "FINAL", "Team 2"),
    match("2026-R2-5", 2, 5, "LIVE", "Team 1"),
  ],
  tournament_presentation: {
    source_fingerprint: "a".repeat(64), imported_at: "2026-08-20T00:00:00Z",
    presentation: {
      tournament: { edition: "2026 Tournament", dates: "August 12–15, 2026", location: "Kiawah Island",
        timeZone: "America/New_York", configuredStatus: "Live", status: "Live", statusMode: "Automatic",
        currentRound: 2, logo: "sandbagger-2026.png" },
      leaderboardsPlayers: Object.fromEntries(["CL01", "CB01", "JS01", "PN01", "MS02", "RM01"]
        .map((id) => [id, { slug: id.toLowerCase(), photo: `${id}.jpg` }])),
      tournamentMatchDisplay: {
        "2026-R1-4": { archiveFinal: true },
        "2026-R2-5": { archiveFinal: true },
      },
    },
  },
  live_revision: { totalMatchRevisions: 28 },
  query_ms: 4.5,
};

const guideRead = { payload: { ok: true, data: {
  projection_revision: 9, publication_sequence: 12, content_fingerprint: "guide-fingerprint",
  published_at: "2026-08-20T00:00:00Z",
  course_context: [1, 2].map((round) => ({ course_id: `C${round}`, tee: "Gold", rating: 72, slope: 130, par: 72,
    rounds: [{ round_number: round, format: round === 1 ? "BB" : "SC", name: `Round ${round}` }], holes: [] })),
  content: { schemaVersion: "guide-projection-v1", content: {
    courses: [1, 2].map((round) => ({ "Course ID": `C${round}`, Round: String(round), Course: `Course ${round}`,
      "Course Logo": `course-${round}.png` })),
    timelineRows: [{ Year: "2026", "Tournament Day": "Thursday", "Event Date": "2026-08-13",
      "Start Time": "08:00", "End Time": "09:00", "Event Type": "Breakfast", Title: "Breakfast",
      Location: "Course 2", "Display on Home": "TRUE", "Sort Order": "1", "Status Override": "" }],
  } },
} }, durationMs: 6 };

function dependencies(counters = {}) {
  return {
    readTournamentLiveView: async () => { counters.live = (counters.live || 0) + 1;
      return { payload: { ok: true, data: structuredClone(supabaseView) }, durationMs: 12 }; },
    readGuideProjection: async () => { counters.guide = (counters.guide || 0) + 1; return structuredClone(guideRead); },
    currentCompetitionDerivedState: async () => { counters.storylines = (counters.storylines || 0) + 1;
      return { moments: [{ id: "closest", headline: "Closest Match" }], metadata: { storylines: { stale: false } }, serviceMs: 5 }; },
    currentNetSkinsOperationalResult: async () => { counters.netSkins = (counters.netSkins || 0) + 1;
      return { netSkins: { rounds: [{ round: 1, leaderboard: [] }] }, stale: false, serviceMs: 4 }; },
    readGoogleTournamentData: async () => { counters.google = (counters.google || 0) + 1; throw new Error("unexpected Google read"); },
  };
}

const projection = (read) => ({
  source: read.diagnostics.source,
  tournament: {
    id: read.liveData?.tournament?.id,
    status: read.liveData?.tournament?.status,
    currentRound: read.liveData?.tournament?.currentRound,
    teamOne: read.liveData?.tournament?.teamOne?.score,
    teamTwo: read.liveData?.tournament?.teamTwo?.score,
  },
  matches: (read.liveData?.rounds || []).flatMap((round) => round.matches || []).map((row) => ({
    id: row.id, status: row.status, holes: row.holeResults?.length,
  })),
  schedule: (read.liveData?.schedule || []).map((row) => row.title),
});

test("Homepage current source inherits the certified Tournament flag, supports an isolated override, and protects Production", () => {
  assert.deepEqual(
    { resolved: homepageCurrentReadEnvironment(preview).resolved, configuredBy: homepageCurrentReadEnvironment(preview).configuredBy },
    { resolved: "supabase", configuredBy: "tournament-read-source" },
  );
  assert.equal(homepageCurrentReadEnvironment({ ...preview, HOMEPAGE_CURRENT_READ_SOURCE: "google" }).resolved, "google");
  assert.equal(homepageCurrentReadEnvironment({ ...preview, HOMEPAGE_CURRENT_READ_SOURCE: "supabase" }).configuredBy, "homepage-override");
  assert.equal(homepageCurrentReadEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "google");
  assert.equal(homepageCurrentReadEnvironment({ ...preview, GOOGLE_SHEETS_ID: "production-workbook" }).blocked, true);
  assert.equal(homepageCurrentReadEnvironment({ ...preview, HOMEPAGE_CURRENT_READ_SOURCE: "automatic" }).blocked, true);
});

test("Homepage composes canonical live, Guide, storylines, Net Skins, and foundation contracts with zero Google live reads", async () => {
  const counters = {};
  const read = await readHomepageCurrentTournament({ env: preview, dependencies: dependencies(counters) });
  assert.equal(read.diagnostics.source, "supabase");
  assert.equal(read.diagnostics.googleLiveModelReads, 0);
  assert.equal(read.diagnostics.googleLiveWorkbookRanges, 0);
  assert.equal(read.diagnostics.googleLiveWorkbookBatchRequests, 0);
  assert.deepEqual(counters, { live: 1, guide: 1, storylines: 1, netSkins: 1 });
  assert.equal(read.liveData.tournament.teamOne.score, 3);
  assert.equal(read.liveData.tournament.teamTwo.score, 3);
  assert.equal(read.liveData.tournament.state.totalMatches - read.liveData.tournament.state.remainingMatches, 2);
  assert.equal(read.liveData.tournament.state.liveMatches, 2);
  assert.equal(read.liveData.tournament.state.remainingMatches, 2);
  for (const id of ["2026-R1-4", "2026-R2-5"]) {
    const reopened = read.liveData.rounds.flatMap((round) => round.matches).find((row) => row.id === id);
    assert.equal(reopened.status.toUpperCase(), "LIVE");
    assert.equal(reopened.holeResults.length, 18);
    assert.equal(reopened.archiveFinal, false);
  }
  assert.deepEqual(read.liveData.schedule.map((row) => row.title), ["Breakfast"]);
  assert.deepEqual(read.liveData.preparedStorylines, [{ id: "closest", headline: "Closest Match" }]);
  assert.equal(read.liveData.storylinesSource, "supabase");
  assert.equal(read.liveData.netSkins.rounds.length, 1);
  assert.equal(read.foundation.source, "supabase");
});

test("Selected Supabase Homepage source fails closed without a hidden Google fallback", async () => {
  const counters = {};
  const deps = dependencies(counters);
  deps.readTournamentLiveView = async () => ({ payload: { ok: false, code: "SUPABASE_UNAVAILABLE" } });
  await assert.rejects(
    () => readHomepageCurrentTournament({ env: preview, dependencies: deps }),
    (error) => error.code === "SUPABASE_UNAVAILABLE",
  );
  assert.equal(counters.google || 0, 0);
});

test("Google to Supabase to Google to Supabase rollback preserves the consumer presentation contract", async () => {
  const supabaseRead = await readHomepageCurrentTournament({ env: preview, dependencies: dependencies({}) });
  const googleData = structuredClone(supabaseRead.liveData);
  googleData.players = supabaseRead.foundation.roster.map((player) => ({ id: player.id, name: player.name,
    slug: player.slug, photo: player.photo }));
  const sequence = ["google", "supabase", "google", "supabase"];
  const reads = [];
  for (const selected of sequence) {
    reads.push(await readHomepageCurrentTournament({
      env: { ...preview, HOMEPAGE_CURRENT_READ_SOURCE: selected },
      dependencies: { ...dependencies({}), readGoogleTournamentData: async () => structuredClone(googleData) },
    }));
  }
  assert.deepEqual(reads.map((read) => read.diagnostics.source), sequence);
  const normalized = reads.map((read) => ({ ...projection(read), source: undefined }));
  for (const value of normalized.slice(1)) assert.deepEqual(value, normalized[0]);
});

test("Public Homepage keeps Google history isolated while its Supabase branch contains no live loader", async () => {
  const [page, service] = await Promise.all([source("app/page.js"), source("lib/homepage-current-tournament.js")]);
  assert.match(page, /refreshHistoricalData/);
  assert.match(page, /getTournaments/);
  assert.match(page, /readHomepageCurrentTournament/);
  assert.doesNotMatch(page, /getTournamentData|sheetData|readWorkbookSheetsByName|GViz/);
  const supabaseBranch = service.slice(service.indexOf("async function supabaseHomepageCurrentTournament"), service.indexOf("export async function readHomepageCurrentTournament"));
  assert.match(supabaseBranch, /readTournamentLiveView/);
  assert.match(supabaseBranch, /applyGuideProjectionToHome/);
  assert.match(supabaseBranch, /tournamentFoundationFromSupabaseView/);
  assert.doesNotMatch(supabaseBranch, /getTournamentData|sheetData|readWorkbookSheetsByName|GViz|googleHomepageCurrentTournament/);
  assert.doesNotMatch(`${page}\n${service}`, /SCORING_AUTHORITY\s*=|SCORING_READ_SOURCE\s*=/);
});
