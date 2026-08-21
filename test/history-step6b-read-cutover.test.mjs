import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCompletedHistoryPresentation,
  completedHistoryResolvePlayer,
  completedHistoryRoundPageModel,
  completedHistoryTeamPageModel,
  completedHistoryTournamentPageModel,
} from "../lib/completed-history-presentation-adapter.js";
import {
  completedHistoryReadEnvironment,
  isSupabaseCompletedHistoryYear,
  requireCompletedHistoryReadSource,
} from "../lib/completed-history-read-source.js";

const root = new URL("../", import.meta.url);

function yearRead({
  year = 2017,
  scoreAvailable = false,
  score = [null, null],
  team1Id = "SIDE1",
  team1Name = "Side One",
  team2Id = "SIDE2",
  team2Name = "Side Two",
  winner = "Team 1",
  cards = [],
  excludedPlayer = "",
} = {}) {
  const course = {
    appearance_id: `${year}-R1`,
    round_number: 1,
    course_id: `C${year}`,
    source_course_id: `C${year}`,
    display_name: "Archive Course",
    canonical_name: "Archive Course",
    canonical_location: "Test City, TS",
    location: "Test City, TS",
    tee: "Archive",
    rating: 70,
    slope: 120,
    yardage: 6500,
    par: 72,
    hole_definitions: Array.from({ length: 18 }, (_, index) => ({
      hole_number: index + 1,
      yardage: 350,
      par: 4,
      stroke_index: index + 1,
    })),
    source_payload: {
      destination: "Test Destination",
      logo: "course-logo",
      profile_image: "course-profile",
      hole_configuration_state: "COMPLETE",
    },
  };
  const participants = [
    { player_id: "P1", display_name: "Player One", team_id: team1Id, team_side: 1, is_captain: true },
    { player_id: "P2", display_name: "Player Two", team_id: team2Id, team_side: 2, is_captain: true },
  ];
  return {
    revision: { revision_id: `${year}-revision`, tournament_year: year, revision_number: 1 },
    tournament: {
      tournament_id: String(year),
      tournament_year: year,
      name: `${year} Sandbagger Invitational`,
      destination: "Test Destination",
      lifecycle: "FINAL",
      score_availability: scoreAvailable ? "RECORDED" : "UNAVAILABLE",
      official_team_1_points: score[0],
      official_team_2_points: score[1],
      champion_team_side: 1,
      champion_team_id: team1Id,
      source_payload: {
        annual_label: `${year - 2016}th Annual`,
        dates_label: `August 1 - 2, ${year}`,
        hero_image: `${year}-hero`,
        runner_up_team_id: team2Id,
      },
    },
    players: participants.map(({ player_id, display_name }) => ({ player_id, display_name })),
    teams: [
      { team_id: team1Id, team_side: 1, name: team1Name, captain_player_id: "P1", logo_key: "side-one", presentation_identity: { primary_color: "#111111" } },
      { team_id: team2Id, team_side: 2, name: team2Name, captain_player_id: "P2", logo_key: "side-two", presentation_identity: { primary_color: "#222222" } },
    ],
    roster: participants.map((row, index) => ({
      ...row,
      participation_status: "ACTIVE",
      is_governor: null,
      tournament_handicap: index + 4,
      source_roster_key: `${year}:${row.player_id}`,
      source_payload: { roster_order: index + 1 },
    })),
    rounds: [{
      round_number: 1,
      format: "SI",
      name: "Singles",
      team_size: 1,
      points_per_match: scoreAvailable ? score[0] + score[1] : null,
      course_appearance_id: course.appearance_id,
      scoring_semantics: {},
      source_payload: {},
    }],
    courses: [{ course_id: course.course_id, canonical_name: course.canonical_name, canonical_location: course.canonical_location }],
    course_appearances: [course],
    matches: [{
      match_id: `${year}-R1-1`,
      round_number: 1,
      format: "SI",
      course_appearance_id: course.appearance_id,
      lifecycle: "FINAL",
      completion_state: "LEGACY_FINAL",
      scorecard_coverage: cards.length ? "PARTIAL" : "UNAVAILABLE",
      result: winner,
      result_winner: winner,
      team_1_points: score[0],
      team_2_points: score[1],
      points_available: scoreAvailable ? score[0] + score[1] : null,
      points_availability: scoreAvailable ? "RECORDED" : "UNAVAILABLE",
      source_payload: {
        match_number: 1,
        segments: { overall: winner },
        team_handicaps: {},
        source_match_status: excludedPlayer ? "Ghost Match" : "Complete",
      },
    }],
    match_participants: participants.map((row, index) => ({
      match_id: `${year}-R1-1`,
      player_id: row.player_id,
      team_side: index + 1,
      player_slot: 1,
      applied_handicap: index + 4,
      applied_strokes: 0,
      source_payload: {},
    })),
    scorecards: cards.map((card, index) => ({
      scorecard_id: `${year}-R1-1|PLAYER|${card.playerId}`,
      match_id: `${year}-R1-1`,
      entity_kind: "PLAYER",
      player_id: card.playerId,
      team_side: index + 1,
      player_slot: 1,
      coverage_status: card.coverage,
      recorded_holes: card.holes.filter((value) => value !== null).length,
      hole_values: card.holes,
      score_semantics: { score_type: "INDIVIDUAL", course_id: course.course_id, course_appearance_id: course.appearance_id },
      source_payload: {},
    })),
    awards: [],
    record_eligibility: participants.map((row) => ({
      match_id: `${year}-R1-1`,
      player_id: row.player_id,
      is_record_eligible: row.player_id !== excludedPlayer,
      reason_code: row.player_id === excludedPlayer ? "LEGACY_GHOST_MATCH_PARTICIPANT_EXCLUSION" : "CANONICAL_OFFICIAL_MATCH",
    })),
    corrections: [],
  };
}

const previewEnv = {
  VERCEL_ENV: "preview",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "test-secret",
};

test("completed History source gate is reversible, Preview-only, and fails closed", () => {
  const sequence = ["google", "supabase", "google", "supabase"].map((source) =>
    completedHistoryReadEnvironment({ ...previewEnv, COMPLETED_HISTORY_READ_SOURCE: source }).resolved
  );
  assert.deepEqual(sequence, ["google", "supabase", "google", "supabase"]);
  assert.equal(isSupabaseCompletedHistoryYear(2017, previewEnv), true);
  assert.equal(isSupabaseCompletedHistoryYear(2026, previewEnv), false);

  const production = completedHistoryReadEnvironment({ ...previewEnv, VERCEL_ENV: "production" });
  assert.equal(production.productionBlocked, true);
  assert.equal(production.resolved, "google");
  assert.equal(isSupabaseCompletedHistoryYear(2017, { ...previewEnv, VERCEL_ENV: "production" }), false);

  const incomplete = { ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" };
  assert.equal(completedHistoryReadEnvironment(incomplete).blocked, true);
  assert.equal(isSupabaseCompletedHistoryYear(2017, incomplete), true);
  assert.throws(() => requireCompletedHistoryReadSource(incomplete), /credentials-missing/);
});

test("2017/2018 preserve official champion identity without fabricating a final score", () => {
  for (const year of [2017, 2018]) {
    const view = buildCompletedHistoryPresentation(yearRead({ year }));
    assert.equal(view.tournament.championTeam.name, "Side One");
    assert.equal(view.tournament["Final Score"], "");
    assert.equal(view.tournament.scoreAvailability, "UNAVAILABLE");
    assert.equal(view.rounds[0].teamOne.points, null);
    assert.equal(view.rounds[0].teamTwo.points, null);
    assert.equal(view.rounds[0].roundWinner, "Not recorded");
    assert.equal(view.leaderboardRows.every((row) => row.pointsTracked === false), true);
  }
});

test("certified facts drive completed History and known corrected team identity", () => {
  const view = buildCompletedHistoryPresentation(yearRead({
    year: 2019,
    scoreAvailable: true,
    score: [37, 28],
    team1Id: "JJSINGH",
    team1Name: "Jupjay Singh Squad",
    team2Id: "PHBOMBS",
    team2Name: "Phil's Calvity Bombs",
  }));
  assert.equal(view.tournament["Final Score"], "37 - 28");
  assert.equal(view.tournament.championTeam.name, "Jupjay Singh Squad");
  assert.equal(view.rounds[0].roundWinner, "Jupjay Singh Squad");
  assert.equal(view.diagnostics.googleForegroundRequests, 0);
  assert.equal(completedHistoryTournamentPageModel(view).tournamentMatches.length, 1);
  assert.equal(completedHistoryRoundPageModel(view, 1).archive.matches.length, 1);
  assert.equal(completedHistoryTeamPageModel(view, "Team 1").roundGroups.length, 0);
  assert.equal(completedHistoryTeamPageModel(view, "Team 1").canonicalRoundGroups.length, 1);
  assert.equal(completedHistoryResolvePlayer(view, "player-one")?.["Player ID"], "P1");
});

test("scorecard availability remains complete/partial/unavailable and never becomes zero-filled", () => {
  const complete = Array.from({ length: 18 }, () => 4);
  const partial = Array.from({ length: 18 }, (_, index) => index < 6 ? 5 : null);
  const view = buildCompletedHistoryPresentation(yearRead({
    year: 2023,
    scoreAvailable: true,
    score: [2, 1],
    cards: [
      { playerId: "P1", coverage: "COMPLETE", holes: complete },
      { playerId: "P2", coverage: "PARTIAL", holes: partial },
    ],
  }));
  const cards = view.scorecardAnalytics.scorecards;
  assert.equal(cards.find((card) => card.playerId === "P1").status, "COMPLETE");
  assert.equal(cards.find((card) => card.playerId === "P1").completedHoleCount, 18);
  assert.equal(cards.find((card) => card.playerId === "P2").status, "PARTIAL");
  assert.equal(cards.find((card) => card.playerId === "P2").completedHoleCount, 6);
  assert.equal(cards.find((card) => card.playerId === "P2").holes[6].score, null);

  const unavailable = buildCompletedHistoryPresentation(yearRead({
    year: 2025,
    scoreAvailable: true,
    score: [2, 1],
    cards: [{ playerId: "P1", coverage: "UNAVAILABLE", holes: Array(18).fill(null) }],
  })).scorecardAnalytics.scorecards[0];
  assert.equal(unavailable.status, "MISSING");
  assert.equal(unavailable.completedHoleCount, 0);
  assert.equal(unavailable.holes.every((hole) => hole.score === null), true);
});

test("Ghost Match record exclusion does not remove the historical match or participant", () => {
  const view = buildCompletedHistoryPresentation(yearRead({
    year: 2023,
    scoreAvailable: true,
    score: [2, 1],
    excludedPlayer: "P1",
  }));
  assert.equal(view.matches.length, 1);
  assert.equal(view.matches[0].team1Players.some((player) => player.id === "P1"), true);
  assert.equal(view.matches[0].status, "Ghost Match");
  assert.equal(view.leaderboardRows.some((row) => row.id === "P1"), false);
  assert.equal(view.leaderboardRows.some((row) => row.id === "P2"), true);
});

test("migrated routes use the shared service and contain no direct Supabase or hidden fallback path", async () => {
  const service = await readFile(new URL("../lib/completed-history-service.js", import.meta.url), "utf8");
  assert.match(service, /readCompletedHistory/);
  assert.doesNotMatch(service, /refreshHistoricalData|getTournamentData|historical-data\.json/);
  assert.doesNotMatch(service, /from\([^)]*completed_history|\.from\(/);
  assert.match(service, /COMPLETED_HISTORY_SUPABASE_READ_NOT_SELECTED/);

  const routeFiles = [
    "app/history/page.js",
    "app/history/[year]/page.js",
    "app/history/[year]/round/[round]/page.js",
    "app/history/[year]/team/[side]/page.js",
    "app/champions/page.js",
    "app/champions/[year]/page.js",
  ];
  for (const file of routeFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /isSupabaseCompletedHistoryYear/);
    assert.match(source, /loadCompletedHistory/);
    assert.doesNotMatch(source, /supabase\.from|createClient\(/);
  }
  const historyIndex = await readFile(new URL("../app/history/page.js", import.meta.url), "utf8");
  assert.match(historyIndex, /loadHistory2026View/);
  assert.match(historyIndex, /loadCompletedHistoryYears/);
});

test("environment documentation defaults completed History reads to Google", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /^COMPLETED_HISTORY_READ_SOURCE=google$/m);
});
