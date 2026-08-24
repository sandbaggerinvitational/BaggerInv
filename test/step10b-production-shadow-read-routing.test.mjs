import assert from "node:assert/strict";
import test from "node:test";

import { calcuttaReadEnvironment } from "../lib/calcutta-read-source.js";
import { momentumReadEnvironment, storylinesReadEnvironment } from "../lib/competition-derived-read-source.js";
import { completedHistoryReadEnvironment } from "../lib/completed-history-read-source.js";
import { draftReadEnvironment } from "../lib/draft-read-source.js";
import { gameCenterReadEnvironment } from "../lib/game-center-read-source.js";
import { guideReadEnvironment, guideSyncEnvironment } from "../lib/guide-read-source.js";
import { historicalCourseReadEnvironment } from "../lib/historical-course-read-source.js";
import { history2026ReadEnvironment } from "../lib/history-2026-read-source.js";
import { homeReadEnvironment } from "../lib/home-read-source.js";
import {
  finalRecapReadEnvironment,
  projectionEditorialReadEnvironment,
  tournamentIntelligenceReadEnvironment,
} from "../lib/intelligence-derived-read-source.js";
import { leaderboardsCoreReadEnvironment } from "../lib/leaderboards-core-read-source.js";
import { matchAuthorizationEnvironment } from "../lib/match-authorization-source.js";
import { myMatchReadEnvironment } from "../lib/my-match-read-source.js";
import { netSkinsReadEnvironment } from "../lib/net-skins-read-source.js";
import { oddsCalculationEnvironment } from "../lib/odds-calculation-source.js";
import { predictionInputBundleEnvironment } from "../lib/prediction-input-bundle-source.js";
import { predictionSettingsEnvironment } from "../lib/prediction-settings-source.js";
import {
  productionShadowCandidateReadEnvironment,
} from "../lib/production-shadow-candidate.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { publishedOddsReadEnvironment } from "../lib/published-odds-read-source.js";
import { scoringReadEnvironment } from "../lib/scoring-read-source.js";
import {
  PRODUCTION_SHADOW_CANDIDATE_READ_RPCS,
  scoringShadowRpc,
} from "../lib/scoring-shadow.js";
import { secondaryHistoryReadEnvironment } from "../lib/secondary-history-read-source.js";
import {
  homepageCurrentReadEnvironment,
  tournamentFoundationReadEnvironment,
  tournamentReadEnvironment,
} from "../lib/tournament-read-source.js";
import { resolveWarRoomInputSource } from "../lib/war-room-input-source.js";

const hostname = "bagger-production-shadow-example.vercel.app";
const secret = "production-server-secret-never-serialized";
const candidateBase = {
  VERCEL_ENV: "preview",
  VERCEL_URL: "bagger-production-shadow-deploy.vercel.app",
  VERCEL_BRANCH_URL: hostname,
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  VERCEL_PROJECT_ID: "prj_bagger_inv_production",
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: hostname,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: "a".repeat(40),
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: "prj_bagger_inv_production",
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: secret,
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "production-browser-publishable-key",
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "production-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "production-auth-rate-limit-only-secret",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "false",
  PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
};

const candidateReadEnv = {
  ...candidateBase,
  PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED: "true",
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: secret,
  TOURNAMENT_READ_SOURCE: "supabase",
  TOURNAMENT_FOUNDATION_READ_SOURCE: "supabase",
  HOMEPAGE_CURRENT_READ_SOURCE: "supabase",
  HOME_READ_SOURCE: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MY_MATCH_READ_SOURCE: "supabase",
  GAME_CENTER_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  NET_SKINS_READ_SOURCE: "supabase",
  CALCUTTA_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  HISTORY_2026_READ_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  HISTORICAL_COURSE_READ_SOURCE: "supabase",
  DRAFT_READ_SOURCE: "supabase",
  PUBLISHED_ODDS_READ_SOURCE: "supabase",
  PREDICTION_SETTINGS_READ_SOURCE: "supabase",
  WAR_ROOM_INPUT_SOURCE: "supabase",
  ODDS_CALCULATION_INPUT_SOURCE: "supabase",
  ODDS_PUBLICATION_AUTHORITY: "google",
  MOMENTUM_READ_SOURCE: "supabase",
  STORYLINES_READ_SOURCE: "supabase",
  TOURNAMENT_INTELLIGENCE_READ_SOURCE: "supabase",
  PROJECTION_EDITORIAL_READ_SOURCE: "supabase",
  FINAL_RECAP_READ_SOURCE: "supabase",
};

function assertCandidateSupabase(state, label) {
  assert.equal(state.resolved || state.source, "supabase", label);
  assert.equal(state.blocked, false, label);
  assert.equal(state.productionShadowCandidate, true, label);
}

test("Production-shadow reads require the asserted exact Production server transport", () => {
  const raw = productionShadowCandidateReadEnvironment(candidateBase);
  assert.equal(raw.eligible, false);
  assert.equal(raw.reason, "candidate-request-transport-required");

  const exact = productionShadowCandidateReadEnvironment(candidateReadEnv);
  assert.equal(exact.eligible, true);
  assert.equal(exact.projectRef, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(exact.workbookId, PRODUCTION_GOOGLE_WORKBOOK_ID);

  assert.equal(productionShadowCandidateReadEnvironment({
    ...candidateReadEnv,
    SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  }).reason, "production-read-project-required");
  assert.equal(productionShadowCandidateReadEnvironment({
    ...candidateReadEnv,
    SUPABASE_SCORING_MIRROR_SECRET_KEY: "another-server-secret-never-serialized",
  }).reason, "production-read-secret-required");
});

test("all migrated candidate selectors resolve only certified Production shadow reads", () => {
  const selectors = [
    [tournamentReadEnvironment, "tournament"],
    [tournamentFoundationReadEnvironment, "tournament foundation"],
    [homepageCurrentReadEnvironment, "homepage"],
    [homeReadEnvironment, "participant home"],
    [scoringReadEnvironment, "scoring read"],
    [myMatchReadEnvironment, "my match"],
    [gameCenterReadEnvironment, "game center"],
    [matchAuthorizationEnvironment, "match authorization"],
    [leaderboardsCoreReadEnvironment, "leaderboards"],
    [netSkinsReadEnvironment, "net skins"],
    [calcuttaReadEnvironment, "calcutta"],
    [(env) => guideReadEnvironment(env).guide, "guide"],
    [(env) => guideReadEnvironment(env).course, "course presentation"],
    [completedHistoryReadEnvironment, "completed history"],
    [history2026ReadEnvironment, "2026 history"],
    [secondaryHistoryReadEnvironment, "secondary history"],
    [historicalCourseReadEnvironment, "historical course"],
    [draftReadEnvironment, "draft"],
    [publishedOddsReadEnvironment, "published odds"],
    [predictionSettingsEnvironment, "prediction settings"],
    [momentumReadEnvironment, "momentum"],
    [storylinesReadEnvironment, "storylines"],
    [tournamentIntelligenceReadEnvironment, "tournament intelligence"],
    [projectionEditorialReadEnvironment, "projection editorial"],
    [finalRecapReadEnvironment, "final recap"],
  ];
  for (const [selector, label] of selectors) assertCandidateSupabase(selector(candidateReadEnv), label);

  const bundle = predictionInputBundleEnvironment(candidateReadEnv);
  assert.equal(bundle.available, true);
  assert.equal(bundle.productionShadowCandidate, true);
  assert.equal(bundle.projectRef, PRODUCTION_SUPABASE_PROJECT_REF);

  const warRoom = resolveWarRoomInputSource(candidateReadEnv);
  assert.equal(warRoom.resolved, "supabase");
  assert.equal(warRoom.productionHardResolvedToGoogle, false);
  assert.equal(warRoom.productionShadowCandidate, true);

  const odds = oddsCalculationEnvironment(candidateReadEnv);
  assert.equal(odds.inputSource, "supabase");
  assert.equal(odds.publicationAuthority, "google");
  assert.equal(odds.productionShadowCandidate, true);

  const guideSync = guideSyncEnvironment({ ...candidateReadEnv, GUIDE_AUTO_SYNC_ENABLED: "true" });
  assert.equal(guideSync.administrativeEligible, false);
  assert.equal(guideSync.autoSyncEnabled, false);
});

test("missing candidate transport fails closed without a Google fallback", () => {
  const incomplete = { ...candidateReadEnv };
  delete incomplete.PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED;
  const selectors = [
    tournamentReadEnvironment,
    homeReadEnvironment,
    scoringReadEnvironment,
    myMatchReadEnvironment,
    gameCenterReadEnvironment,
    leaderboardsCoreReadEnvironment,
    netSkinsReadEnvironment,
    calcuttaReadEnvironment,
    completedHistoryReadEnvironment,
    history2026ReadEnvironment,
    secondaryHistoryReadEnvironment,
    historicalCourseReadEnvironment,
    draftReadEnvironment,
    publishedOddsReadEnvironment,
    predictionSettingsEnvironment,
  ];
  for (const selector of selectors) {
    const state = selector(incomplete);
    assert.equal(state.blocked, true, selector.name);
    assert.equal(state.productionShadowCandidate || false, false, selector.name);
  }
  assert.equal(predictionInputBundleEnvironment(incomplete).available, false);
  assert.throws(
    () => resolveWarRoomInputSource(incomplete),
    (error) => error.code === "PRODUCTION_SHADOW_WAR_ROOM_CONFIGURATION_REQUIRED",
  );
});

test("live Production remains Google/Passport and rejects injected candidate read selection", () => {
  const live = {
    ...candidateReadEnv,
    VERCEL_ENV: "production",
    VERCEL_URL: "baggerinv.com",
    VERCEL_BRANCH_URL: "baggerinv.com",
    PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: "baggerinv.com",
  };
  const googleSelectors = [
    tournamentReadEnvironment,
    homeReadEnvironment,
    scoringReadEnvironment,
    myMatchReadEnvironment,
    gameCenterReadEnvironment,
    matchAuthorizationEnvironment,
    leaderboardsCoreReadEnvironment,
    netSkinsReadEnvironment,
    calcuttaReadEnvironment,
    completedHistoryReadEnvironment,
    history2026ReadEnvironment,
    secondaryHistoryReadEnvironment,
    historicalCourseReadEnvironment,
    draftReadEnvironment,
    publishedOddsReadEnvironment,
    predictionSettingsEnvironment,
  ];
  for (const selector of googleSelectors) {
    const state = selector(live);
    assert.equal(state.resolved || state.source, "google", selector.name);
    assert.equal(state.productionShadowCandidate || false, false, selector.name);
  }
  assert.equal(resolveWarRoomInputSource(live).resolved, "google");
  const odds = oddsCalculationEnvironment(live);
  assert.equal(odds.inputSource, "google");
  assert.equal(odds.publicationAuthority, "google");
  assert.equal(predictionInputBundleEnvironment(live).available, false);
});

test("candidate can never acquire Odds publication authority", () => {
  const state = oddsCalculationEnvironment({
    ...candidateReadEnv,
    ODDS_PUBLICATION_AUTHORITY: "supabase",
  });
  assert.equal(state.inputSource, "supabase");
  assert.equal(state.publicationAuthority, "unavailable");
  assert.equal(state.publicationBlocked, true);
  assert.equal(state.publicationFailureCode, "ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE");
});

test("candidate War Room cannot select the Google rollback adapter", () => {
  assert.throws(
    () => resolveWarRoomInputSource({ ...candidateReadEnv, WAR_ROOM_INPUT_SOURCE: "google" }),
    (error) => error.code === "PRODUCTION_SHADOW_WAR_ROOM_SUPABASE_REQUIRED",
  );
  assert.throws(
    () => resolveWarRoomInputSource(candidateReadEnv, "google"),
    (error) => error.code === "PRODUCTION_SHADOW_WAR_ROOM_SUPABASE_REQUIRED",
  );
});

test("candidate transport bypasses the legacy Preview gate for allowlisted reads only", async () => {
  assert.ok(PRODUCTION_SHADOW_CANDIDATE_READ_RPCS.includes("read_production_current_tournament_shadow"));
  assert.equal(PRODUCTION_SHADOW_CANDIDATE_READ_RPCS.some((name) =>
    /^(?:replace|write|publish|claim|complete|fail|request|submit|finalize|reopen|import|sync|configure|begin|commit|abort|reset|mark)_/.test(name)
  ), false);

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify([{ ok: true }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const read = await scoringShadowRpc("read_production_current_tournament_shadow", {
      input: { tournament_id: "2026" },
    }, { env: candidateReadEnv });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url,
      `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_current_tournament_shadow`);

    await assert.rejects(
      scoringShadowRpc("replace_preview_scoring_authority_import", { payload: {} }, {
        env: candidateReadEnv,
      }),
      (error) => error.code === "PRODUCTION_SHADOW_CANDIDATE_RPC_FORBIDDEN" &&
        error.status === 403,
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
