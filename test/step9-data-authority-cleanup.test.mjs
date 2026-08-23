import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { requireCalcuttaReadSource } from "../lib/calcutta-read-source.js";
import { requireMomentumReadSource } from "../lib/competition-derived-read-source.js";
import { requireDraftReadSource } from "../lib/draft-read-source.js";
import { requireGameCenterReadSource } from "../lib/game-center-read-source.js";
import { requireHomeReadSource } from "../lib/home-read-source.js";
import { requireIntelligenceDerivedReadSources } from "../lib/intelligence-derived-read-source.js";
import { requireLeaderboardsCoreReadSource } from "../lib/leaderboards-core-read-source.js";
import { requireMatchAuthorizationSource } from "../lib/match-authorization-source.js";
import { requireMyMatchReadSource } from "../lib/my-match-read-source.js";
import { requireNetSkinsReadSource } from "../lib/net-skins-read-source.js";
import { requirePublishedOddsReadSource } from "../lib/published-odds-read-source.js";
import { requireScoringReadSource } from "../lib/scoring-read-source.js";
import { requireSecondaryHistoryReadSource } from "../lib/secondary-history-read-source.js";
import { requireTournamentReadSource } from "../lib/tournament-read-source.js";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "secret",
};

test("migrated Preview source boundaries reject unknown tokens instead of reaching Google/application", () => {
  const checks = [
    [requireTournamentReadSource, "TOURNAMENT_READ_SOURCE"],
    [requireHomeReadSource, "HOME_READ_SOURCE"],
    [requireGameCenterReadSource, "GAME_CENTER_READ_SOURCE"],
    [requireLeaderboardsCoreReadSource, "LEADERBOARDS_CORE_READ_SOURCE"],
    [requireMatchAuthorizationSource, "MATCH_AUTHORIZATION_SOURCE"],
    [requireMyMatchReadSource, "MY_MATCH_READ_SOURCE"],
    [requireNetSkinsReadSource, "NET_SKINS_READ_SOURCE"],
    [requireCalcuttaReadSource, "CALCUTTA_READ_SOURCE"],
    [requirePublishedOddsReadSource, "PUBLISHED_ODDS_READ_SOURCE"],
    [requireScoringReadSource, "SCORING_READ_SOURCE"],
    [requireSecondaryHistoryReadSource, "SECONDARY_HISTORY_READ_SOURCE"],
    [requireDraftReadSource, "DRAFT_READ_SOURCE"],
  ];
  for (const [requireSource, variable] of checks) {
    assert.throws(
      () => requireSource({ ...preview, [variable]: "typo" }),
      /invalid-source/,
      variable,
    );
  }
  assert.throws(
    () => requireMomentumReadSource({ ...preview, MOMENTUM_READ_SOURCE: "typo" }),
    /invalid-source/,
  );
  assert.throws(
    () => requireIntelligenceDerivedReadSources({ ...preview, FINAL_RECAP_READ_SOURCE: "typo" }),
    /invalid-source/,
  );
});

test("Production retains its approved legacy resolution when Supabase is requested", () => {
  const production = { ...preview, VERCEL_ENV: "production" };
  for (const [requireSource, variable] of [
    [requireTournamentReadSource, "TOURNAMENT_READ_SOURCE"],
    [requireHomeReadSource, "HOME_READ_SOURCE"],
    [requireGameCenterReadSource, "GAME_CENTER_READ_SOURCE"],
    [requirePublishedOddsReadSource, "PUBLISHED_ODDS_READ_SOURCE"],
    [requireScoringReadSource, "SCORING_READ_SOURCE"],
    [requireDraftReadSource, "DRAFT_READ_SOURCE"],
  ]) {
    const state = requireSource({ ...production, [variable]: "supabase" });
    assert.equal(state.resolved, "google", variable);
    assert.equal(state.blocked, false, variable);
  }
});

test("legacy /api/live is explicit rollback/Production only and cannot be a Supabase fallback", async () => {
  const [route, livePage, participantHome] = await Promise.all([
    source("app/api/live/route.js"),
    source("app/live/page.js"),
    source("app/home/page.js"),
  ]);
  assert.match(route, /tournamentReadEnvironment/);
  assert.match(route, /leaderboardsCoreReadEnvironment/);
  assert.match(route, /netSkinsReadEnvironment/);
  assert.match(route, /LEGACY_GOOGLE_LIVE_READ_NOT_SELECTED/);
  assert.match(route, /X-Google-Fallback-Used["']:\s*["']false/);
  const handler = route.slice(route.indexOf("export async function GET"));
  assert.ok(handler.indexOf("tournamentReadEnvironment()") < handler.indexOf("getTournamentData"));
  assert.match(route, /selectedGoogleConsumers/);
  assert.match(route, /source\.requested === "google"/);
  assert.match(livePage, /source\.resolved === "supabase" && \["points", "scores"\]\.includes\(view\)/);
  assert.match(livePage, /source\.resolved === "supabase" && view && !\["leaderboards", "calcutta"\]\.includes\(view\)/);
  assert.match(livePage, /requireNetSkinsReadSource/);
  assert.match(participantHome, /requireNetSkinsReadSource/);
});

test("secondary-history route selection cannot turn an invalid token into a Google refresh", async () => {
  const { isSupabaseSecondaryHistory } = await import("../lib/secondary-history-read-source.js");
  assert.throws(
    () => isSupabaseSecondaryHistory({ ...preview, SECONDARY_HISTORY_READ_SOURCE: "typo" }),
    /invalid-source/,
  );
});

test("required sync, mirror, rollback, and Production adapters remain present", async () => {
  const [guideSync, draftSync, outbox, archive, oddsMirror, googleHistory, googlePrediction] = await Promise.all([
    source("lib/guide-sync-service.js"),
    source("lib/draft-synchronization.js"),
    source("lib/scoring-google-outbox.js"),
    source("lib/scorecard-archive-worker.js"),
    source("lib/championship-odds-google-mirror.js"),
    source("lib/google-sheets-data.js"),
    source("lib/war-room-input-google.js"),
  ]);
  assert.match(guideSync, /readWorkbookSheetsByName/);
  assert.match(draftSync, /Draft Settings|DRAFT_SETTINGS/);
  assert.match(outbox, /claimGoogleOutbox/);
  assert.match(archive, /Round Scorecards/);
  assert.match(oddsMirror, /PUBLISHED_ODDS_WORKBOOK_TABS/);
  assert.match(googleHistory, /historical-data\.json/);
  assert.match(googlePrediction, /loadPredictionSheets/);
});

test("environment example lists every active source boundary and omits the retired standalone settings flag", async () => {
  const example = await source(".env.example");
  for (const variable of [
    "TOURNAMENT_READ_SOURCE", "TOURNAMENT_FOUNDATION_READ_SOURCE", "HOMEPAGE_CURRENT_READ_SOURCE",
    "HOME_READ_SOURCE", "GAME_CENTER_READ_SOURCE", "LEADERBOARDS_CORE_READ_SOURCE", "MY_MATCH_READ_SOURCE",
    "MATCH_AUTHORIZATION_SOURCE", "SCORING_READ_SOURCE", "NET_SKINS_READ_SOURCE", "CALCUTTA_READ_SOURCE",
    "GUIDE_READ_SOURCE", "COURSE_PRESENTATION_READ_SOURCE", "HISTORY_2026_READ_SOURCE",
    "COMPLETED_HISTORY_READ_SOURCE", "SECONDARY_HISTORY_READ_SOURCE", "HISTORICAL_COURSE_READ_SOURCE",
    "PUBLISHED_ODDS_READ_SOURCE", "ODDS_CALCULATION_INPUT_SOURCE", "ODDS_PUBLICATION_AUTHORITY",
    "WAR_ROOM_INPUT_SOURCE", "DRAFT_READ_SOURCE", "SCORING_AUTHORITY", "PARTICIPANT_IDENTITY_AUTHORITY",
  ]) assert.match(example, new RegExp(`^${variable}=`, "m"), variable);
  assert.doesNotMatch(example, /^PREDICTION_SETTINGS_READ_SOURCE=/m);
});
