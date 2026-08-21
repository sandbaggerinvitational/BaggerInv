import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  isSupabaseSecondaryHistory,
  secondaryHistoryReadEnvironment,
} from "../lib/secondary-history-read-source.js";
import {
  buildSecondaryHistoryHistoricalData,
} from "../lib/secondary-history-model.js";
import {
  buildPlayerPublicProfileProjection,
  comparePlayerPublicProfileProjection,
} from "../lib/player-public-profile-contract.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const preview = {
  VERCEL_ENV: "preview",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "test-only",
};

function team(year, side, playerId) {
  return {
    id: `${year}-T${side}`,
    side: `Team ${side}`,
    sideNumber: side,
    name: `Team ${side}`,
    captainId: side === 1 ? playerId : "",
    roster: side === 1 ? [{ player: { "Player ID": playerId }, handicap: 10 }] : [],
  };
}

function completedView(year, playerId = "P1") {
  return {
    source: "supabase",
    year,
    tournament: {
      id: String(year),
      "Final Score": "3 - 0",
      championTeam: { id: `${year}-T1`, name: "Team 1", captainId: playerId },
      runnerUpTeam: { id: `${year}-T2`, name: "Team 2" },
      courses: [{ Year: year, Round: "Round 1", "Course ID": `${year}-C1`, Course: "Course", Format: "SI" }],
      awards: [],
    },
    playerDirectory: [{ "Player ID": playerId, "Display Name": "Player One" }],
    teams: [team(year, 1, playerId), team(year, 2, playerId)],
    rawMatches: [{
      Year: year,
      Round: 1,
      Match: 1,
      "Match ID": `${year}-R1-1`,
      Format: "SI",
      "Match Status": "Complete",
      "Course ID": `${year}-C1`,
      "Team 1 Player 1": playerId,
      "Team 2 Player 1": "P2",
      "Matchup Winner": "Team 1",
      "Team 1 Points": 1,
      "Team 2 Points": 0,
    }],
    recordEligibility: year === 2023 ? [{
      matchId: `${year}-R1-1`, playerId, includeOfficialRecord: false, reasonCode: "GHOST_MATCH",
    }] : [],
    analytics: { scorecards: [] },
  };
}

test("secondary History gate is explicit, reversible, Preview-only, and fails closed", () => {
  assert.equal(secondaryHistoryReadEnvironment({ ...preview, SECONDARY_HISTORY_READ_SOURCE: "google" }).resolved, "google");
  assert.equal(secondaryHistoryReadEnvironment(preview).resolved, "supabase");
  assert.equal(isSupabaseSecondaryHistory(preview), true);
  const production = secondaryHistoryReadEnvironment({ ...preview, VERCEL_ENV: "production" });
  assert.equal(production.resolved, "google");
  assert.equal(production.productionBlocked, true);
  const wrongProject = secondaryHistoryReadEnvironment({ ...preview, SUPABASE_SCORING_MIRROR_URL: "https://wrong.supabase.co" });
  assert.equal(wrongProject.resolved, "supabase");
  assert.equal(wrongProject.blocked, true);
});

test("Sheet-authored public profiles project deterministically without becoming identity authority", () => {
  const rows = [
    { "Player ID": "P2", "Display Name": "Player Two", Slug: "Player-Two", Active: "No" },
    { "Player ID": "P1", "Display Name": "Player One", Slug: "Player-One", Active: "Yes", "Board of Governors": true },
  ];
  const projection = buildPlayerPublicProfileProjection(rows, { sourceWorkbookId: "preview-workbook" });
  assert.deepEqual(projection.players.map((row) => row.player_id), ["P1", "P2"]);
  assert.equal(projection.players[0].public_profile.Active, true);
  assert.equal(projection.players[0].public_profile["Board of Governors"], true);
  const parity = comparePlayerPublicProfileProjection(projection, {
    source_fingerprint: projection.source_fingerprint,
    players: projection.players,
  });
  assert.equal(parity.pass, true);
});

test("canonical current lifecycle excludes reopened/live 2026 matches from official career facts", () => {
  const completedViews = Array.from({ length: 9 }, (_, index) => completedView(2017 + index));
  const currentView = {
    source: "supabase",
    year: 2026,
    tournament: { id: "2026", courses: [] },
    players: [{ "Player ID": "P1", "Display Name": "Player One" }, { "Player ID": "P2", "Display Name": "Player Two" }],
    teams: [team(2026, 1, "P1"), team(2026, 2, "P2")],
    rounds: [],
    matches: [
      { id: "2026-R1-1", round: 1, match: 1, format: "SI", lifecycle: "FINAL", matchupWinner: "Team 1", team1Points: 1, team2Points: 0, team1Players: [{ id: "P1" }], team2Players: [{ id: "P2" }] },
      { id: "2026-R1-4", round: 1, match: 4, format: "BB", lifecycle: "LIVE", matchupWinner: "Team 1", team1Points: 3, team2Points: 0, team1Players: [{ id: "P1" }], team2Players: [{ id: "P2" }] },
    ],
    analytics: { scorecards: [] },
  };
  const profiles = buildPlayerPublicProfileProjection([
    { "Player ID": "P1", "Display Name": "Player One", Slug: "player-one", Active: true },
    { "Player ID": "P2", "Display Name": "Player Two", Slug: "player-two", Active: true },
  ], { sourceWorkbookId: "preview-workbook" });
  const result = buildSecondaryHistoryHistoricalData({ completedViews, currentView, playerProjection: profiles });
  assert.equal(result.data.matches.some((row) => row["Match ID"] === "2026-R1-1"), true);
  assert.equal(result.data.matches.some((row) => row["Match ID"] === "2026-R1-4"), false);
  assert.equal(result.data.tournaments.at(-1)["Final Score"], "");
  assert.equal(result.data.tournaments.at(-1)["Winning Team"], "");
  assert.equal(result.data.ghostMatches.length, 1);
});

test("Players and Profiles use the shared service branch without page-level Supabase queries", async () => {
  const [directory, profile, service, migration, envExample] = await Promise.all([
    source("app/players/page.js"),
    source("app/players/[slug]/page.js"),
    source("lib/secondary-history-service.js"),
    source("supabase/migrations/202608210008_preview_secondary_history_player_projection.sql"),
    source(".env.example"),
  ]);
  for (const route of [directory, profile]) {
    assert.match(route, /isSupabaseSecondaryHistory/);
    assert.match(route, /loadSecondaryHistoryModel/);
    assert.doesNotMatch(route, /scoringShadowRpc|read_preview_completed_history|from\(["']scoring_authority/);
  }
  assert.doesNotMatch(service, /refreshHistoricalData|historical-data\.json|readWorkbookSheetsByName/);
  assert.match(service, /googleForegroundRequests:\s*0/);
  assert.match(service, /noFallback:\s*true/);
  assert.match(migration, /update scoring_authority\.players/);
  assert.doesNotMatch(migration, /update scoring_authority\.(matches|hole_scores|tournament_players|scoring_permissions|scoring_authority_epochs)/i);
  assert.match(migration, /revoke all on function public\.read_preview_secondary_history_players\(jsonb\)[\s\S]*to service_role/);
  assert.match(envExample, /^SECONDARY_HISTORY_READ_SOURCE=google$/m);
});
