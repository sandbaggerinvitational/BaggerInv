import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calcuttaReadEnvironment } from "../lib/calcutta-read-source.js";
import { momentumReadEnvironment, storylinesReadEnvironment } from "../lib/competition-derived-read-source.js";
import { completedHistoryReadEnvironment } from "../lib/completed-history-read-source.js";
import { draftReadEnvironment } from "../lib/draft-read-source.js";
import { gameCenterReadEnvironment } from "../lib/game-center-read-source.js";
import { guideReadEnvironment } from "../lib/guide-read-source.js";
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
  PRODUCTION_CUTOVER_READ_RPCS,
  adaptProductionCutoverReadPayload,
  productionCutoverReadRpcTranslation,
  productionCutoverReadTransportEnvironment,
} from "../lib/production-cutover-read-transport.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { publishedOddsReadEnvironment } from "../lib/published-odds-read-source.js";
import { scoringReadEnvironment } from "../lib/scoring-read-source.js";
import { scoringShadowRpc } from "../lib/scoring-shadow.js";
import { secondaryHistoryReadEnvironment } from "../lib/secondary-history-read-source.js";
import {
  homepageCurrentReadEnvironment,
  tournamentFoundationReadEnvironment,
  tournamentReadEnvironment,
} from "../lib/tournament-read-source.js";
import { resolveWarRoomInputSource } from "../lib/war-room-input-source.js";

const commitSha = "a".repeat(40);
const secret = "sb_secret_" + "x".repeat(32);
const activeBase = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: commitSha,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commitSha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: secret,
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: secret,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "passport",
});

const readSelectors = [
  ["COMPLETED_HISTORY_READ_SOURCE", completedHistoryReadEnvironment, (state) => state.resolved],
  ["SECONDARY_HISTORY_READ_SOURCE", secondaryHistoryReadEnvironment, (state) => state.resolved],
  ["HISTORICAL_COURSE_READ_SOURCE", historicalCourseReadEnvironment, (state) => state.resolved],
  ["DRAFT_READ_SOURCE", draftReadEnvironment, (state) => state.resolved],
  ["PUBLISHED_ODDS_READ_SOURCE", publishedOddsReadEnvironment, (state) => state.resolved],
  ["GUIDE_READ_SOURCE", (env) => guideReadEnvironment(env).guide, (state) => state.resolved],
  ["COURSE_PRESENTATION_READ_SOURCE", (env) => guideReadEnvironment(env).course, (state) => state.resolved],
];

const currentSelectors = [
  ["TOURNAMENT_READ_SOURCE", tournamentReadEnvironment],
  ["TOURNAMENT_FOUNDATION_READ_SOURCE", tournamentFoundationReadEnvironment],
  ["HOMEPAGE_CURRENT_READ_SOURCE", homepageCurrentReadEnvironment],
  ["HOME_READ_SOURCE", homeReadEnvironment],
  ["HISTORY_2026_READ_SOURCE", history2026ReadEnvironment],
  ["SCORING_READ_SOURCE", scoringReadEnvironment],
  ["MATCH_AUTHORIZATION_SOURCE", matchAuthorizationEnvironment],
  ["MY_MATCH_READ_SOURCE", myMatchReadEnvironment],
  ["GAME_CENTER_READ_SOURCE", gameCenterReadEnvironment],
  ["LEADERBOARDS_CORE_READ_SOURCE", leaderboardsCoreReadEnvironment],
  ["MOMENTUM_READ_SOURCE", momentumReadEnvironment],
  ["STORYLINES_READ_SOURCE", storylinesReadEnvironment],
  ["TOURNAMENT_INTELLIGENCE_READ_SOURCE", tournamentIntelligenceReadEnvironment],
  ["PROJECTION_EDITORIAL_READ_SOURCE", projectionEditorialReadEnvironment],
  ["FINAL_RECAP_READ_SOURCE", finalRecapReadEnvironment],
];

test("READ_CUTOVER sources resolve only at their exact active Production phase", () => {
  for (const [variable, selector, resolved] of readSelectors) {
    const state = selector({ ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER", [variable]: "supabase" });
    assert.equal(resolved(state), "supabase", variable);
    assert.equal(state.blocked, false, variable);
    assert.equal(state.productionCutover.phaseReached, true, variable);
    assert.equal(state.fallbackUsed, false, variable);
  }
});

test("CURRENT_READS sources fail closed before phase and resolve after phase", () => {
  for (const [variable, selector] of currentSelectors) {
    const early = selector({ ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER", [variable]: "supabase" });
    assert.equal(early.resolved, "unavailable", `${variable}:early`);
    assert.equal(early.blocked, true, `${variable}:early`);
    assert.equal(early.fallbackUsed, false, `${variable}:early`);
    const active = selector({ ...activeBase, PRODUCTION_CUTOVER_PHASE: "CURRENT_READS", [variable]: "supabase" });
    assert.equal(active.resolved, "supabase", `${variable}:active`);
    assert.equal(active.blocked, false, `${variable}:active`);
  }
});

test("ODDS_WAR_ROOM inputs require their later phase and publication remains Google", () => {
  const earlyEnv = {
    ...activeBase,
    PRODUCTION_CUTOVER_PHASE: "CURRENT_READS",
    WAR_ROOM_INPUT_SOURCE: "supabase",
    PREDICTION_SETTINGS_READ_SOURCE: "supabase",
    ODDS_CALCULATION_INPUT_SOURCE: "supabase",
    ODDS_PUBLICATION_AUTHORITY: "supabase",
  };
  assert.throws(() => resolveWarRoomInputSource(earlyEnv), {
    code: "PRODUCTION_CUTOVER_READ_SOURCE_UNAVAILABLE",
  });
  assert.equal(predictionSettingsEnvironment(earlyEnv).blocked, true);
  assert.equal(oddsCalculationEnvironment(earlyEnv).inputBlocked, true);
  assert.equal(oddsCalculationEnvironment(earlyEnv).publicationAuthority, "google");

  const activeEnv = { ...earlyEnv, PRODUCTION_CUTOVER_PHASE: "ODDS_WAR_ROOM" };
  assert.equal(resolveWarRoomInputSource(activeEnv).resolved, "supabase");
  assert.equal(predictionSettingsEnvironment(activeEnv).source, "supabase");
  assert.equal(predictionInputBundleEnvironment(activeEnv).available, true);
  const odds = oddsCalculationEnvironment(activeEnv);
  assert.equal(odds.inputSource, "supabase");
  assert.equal(odds.publicationAuthority, "google");
  assert.equal(odds.fallbackUsed, false);
});

test("invalid, incomplete, and malformed active Production requests never resolve to Google", () => {
  const cases = [
    [{ ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER", COMPLETED_HISTORY_READ_SOURCE: "wat" }, "invalid-source"],
    [{ ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER", COMPLETED_HISTORY_READ_SOURCE: "supabase", PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "false" }, "production-public-supabase-reads-required"],
    [{ ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER", COMPLETED_HISTORY_READ_SOURCE: "supabase", PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb" }, "production-project-ref-required"],
    [{ ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER", COMPLETED_HISTORY_READ_SOURCE: "supabase", PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "maybe" }, "invalid-production-cutover-activation-token"],
  ];
  for (const [env, reason] of cases) {
    const state = completedHistoryReadEnvironment(env);
    assert.equal(state.resolved, "unavailable", reason);
    assert.equal(state.blocked, true, reason);
    assert.equal(state.reason, reason);
    assert.equal(state.fallbackUsed, false, reason);
  }
});

test("activation disabled preserves certified live Production legacy resolution", () => {
  const legacy = {
    ...activeBase,
    PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "false",
    PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND",
    COMPLETED_HISTORY_READ_SOURCE: "supabase",
    TOURNAMENT_READ_SOURCE: "supabase",
    WAR_ROOM_INPUT_SOURCE: "supabase",
    ODDS_CALCULATION_INPUT_SOURCE: "supabase",
  };
  assert.equal(completedHistoryReadEnvironment(legacy).resolved, "google");
  assert.equal(tournamentReadEnvironment(legacy).resolved, "google");
  assert.equal(resolveWarRoomInputSource(legacy).resolved, "google");
  assert.equal(oddsCalculationEnvironment(legacy).inputSource, "google");
  assert.equal(oddsCalculationEnvironment(legacy).publicationAuthority, "google");
});

test("Net Skins and Calcutta cannot acquire a Production source without real configuration", () => {
  for (const [variable, selector, configuredFlag] of [
    ["NET_SKINS_READ_SOURCE", netSkinsReadEnvironment, "PRODUCTION_NET_SKINS_CONFIGURED"],
    ["CALCUTTA_READ_SOURCE", calcuttaReadEnvironment, "PRODUCTION_CALCUTTA_CONFIGURED"],
  ]) {
    const missing = selector({ ...activeBase, PRODUCTION_CUTOVER_PHASE: "CURRENT_READS", [variable]: "google" });
    assert.equal(missing.resolved, "unavailable", variable);
    assert.equal(missing.blocked, true, variable);
    const enabled = selector({
      ...activeBase,
      PRODUCTION_CUTOVER_PHASE: "CURRENT_READS",
      [variable]: "supabase",
      [configuredFlag]: "true",
    });
    assert.equal(enabled.resolved, "supabase", variable);
    assert.equal(enabled.blocked, false, variable);
  }
});

test("active read transport is bounded, exact-resource, and cannot be caller-overridden", () => {
  assert.ok(PRODUCTION_CUTOVER_READ_RPCS.includes("read_preview_completed_history"));
  assert.ok(PRODUCTION_CUTOVER_READ_RPCS.includes("read_preview_scoring_authority"));
  assert.equal(PRODUCTION_CUTOVER_READ_RPCS.some((name) =>
    /^(?:replace|write|publish|claim|complete|fail|request|submit|finalize|reopen|import|sync|configure|begin|commit|abort|reset|mark)_/.test(name)
  ), false);

  const env = { ...activeBase, PRODUCTION_CUTOVER_PHASE: "CURRENT_READS" };
  const state = productionCutoverReadTransportEnvironment(env, "read_game_center_view", {
    target_match_id: "2026-R1-1",
  });
  assert.equal(state.allowed, true);
  const translated = productionCutoverReadRpcTranslation("read_game_center_view", {
    target_match_id: "2026-R1-1",
    input: { project_ref: "idgigvjjqkfbqjeredpb", environment: "PREVIEW" },
  }, env);
  assert.equal(translated.functionName, "read_production_cutover_current_view");
  assert.equal(translated.body.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(translated.body.input.environment, "PRODUCTION");
  assert.equal(translated.body.input.match_id, "2026-R1-1");
  assert.equal(translated.body.input.cutover_phase, "CURRENT_READS");

  const scoring = productionCutoverReadRpcTranslation("read_preview_scoring_authority", {
    input: { mode: "MATCH", match_id: "2026-R1-1" },
  }, env);
  assert.equal(scoring.functionName, "read_production_cutover_scoring_authority");
  assert.equal(scoring.body.input.mode, "MATCH");
  assert.equal(scoring.body.input.match_id, "2026-R1-1");
});

test("maintenance reads send the exact bound OBSERVATION ceiling while database phase remains authoritative", () => {
  const env = {
    ...activeBase,
    VERCEL_DEPLOYMENT_ID: "dpl_SingleDeploymentCapability051",
    PRODUCTION_CUTOVER_PHASE: "SCORING_COMMIT",
    PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CONTRACT:
      "production-maintenance-single-deployment-capability-v1",
    PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING: "OBSERVATION",
    TOURNAMENT_READ_SOURCE: "supabase",
    WAR_ROOM_INPUT_SOURCE: "supabase",
  };
  assert.equal(tournamentReadEnvironment(env).resolved, "supabase");
  assert.equal(resolveWarRoomInputSource(env).resolved, "supabase");
  const state = productionCutoverReadTransportEnvironment(
    env,
    "read_game_center_view",
  );
  assert.equal(state.allowed, true);
  const translated = productionCutoverReadRpcTranslation(
    "read_game_center_view",
    { target_match_id: "2026-R1-1" },
    env,
  );
  assert.equal(translated.body.input.cutover_phase, "OBSERVATION");
  assert.equal(
    translated.body.input.deployment_capability_contract,
    "production-maintenance-single-deployment-capability-v1",
  );
  assert.equal(
    translated.body.input.deployment_capability_ceiling,
    "OBSERVATION",
  );
  assert.equal(
    translated.body.input.deployment_id,
    "dpl_SingleDeploymentCapability051",
  );
});

test("Guide course context is readable in READ_CUTOVER without opening general current reads", () => {
  const env = { ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER" };
  const body = { production_cutover_surface: "GUIDE_COURSE_CONTEXT" };
  const guide = productionCutoverReadTransportEnvironment(env, "read_tournament_live_view", body);
  const general = productionCutoverReadTransportEnvironment(env, "read_tournament_live_view", {});
  assert.equal(guide.allowed, true);
  assert.equal(guide.requiredPhase, "READ_CUTOVER");
  assert.equal(general.allowed, false);
  const translated = productionCutoverReadRpcTranslation("read_tournament_live_view", body, env);
  assert.equal(translated.body.input.surface, "GUIDE_COURSE_CONTEXT");
});

test("active response metadata is top-level and never rewrites nested domain objects", () => {
  const state = productionCutoverReadTransportEnvironment(
    { ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER" },
    "read_preview_completed_history",
  );
  const payload = adaptProductionCutoverReadPayload({ ok: true, data: { row: { value: 1 } } },
    { adapter: "IDENTITY" }, state);
  assert.equal(payload.authoritative, true);
  assert.equal(payload.shadow_only, false);
  assert.equal(payload.fallback_used, false);
  assert.equal(payload.production_cutover.phase, "READ_CUTOVER");
  assert.deepEqual(payload.data, { row: { value: 1 } });
});

test("scoring transport uses the active wrapper and rejects incomplete activation before fetch", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, data: { matches: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const env = { ...activeBase, PRODUCTION_CUTOVER_PHASE: "CURRENT_READS" };
    const read = await scoringShadowRpc("read_preview_scoring_authority", {
      input: { mode: "CURRENT_STATE" },
    }, { env });
    assert.equal(read.payload.authoritative, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rpc\/read_production_cutover_scoring_authority$/);
    assert.equal(calls[0].body.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);

    await assert.rejects(
      scoringShadowRpc("read_preview_scoring_authority", { input: { mode: "CURRENT_STATE" } }, {
        env: { ...env, SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co" },
      }),
      (error) => error.code === "PRODUCTION_CUTOVER_READ_RPC_UNAVAILABLE",
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("server-only read control binds activate and inspect calls to the exact frozen release", () => {
  const moduleUrl = new URL("../lib/production-cutover-read-control.js", import.meta.url).href;
  const env = { ...activeBase, PRODUCTION_CUTOVER_PHASE: "READ_CUTOVER" };
  const script = `
    import { setProductionCutoverReadPhase, inspectProductionCutoverReadState } from ${JSON.stringify(moduleUrl)};
    const env = ${JSON.stringify(env)};
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await setProductionCutoverReadPhase({
      mode: "ACTIVATE", expectedPriorPhase: "STATIC_BACKEND", targetPhase: "READ_CUTOVER",
      expectedActivationRevision: 3, sourceFingerprint: "b".repeat(64), actorId: "CB01",
    }, { env, fetchImpl });
    await inspectProductionCutoverReadState({ env, fetchImpl });
    process.stdout.write(JSON.stringify(calls));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const calls = JSON.parse(child.stdout);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/rpc\/set_production_cutover_read_state$/);
  assert.match(calls[1].url, /\/rpc\/inspect_production_cutover_read_state$/);
  const input = calls[0].body.input;
  assert.equal(input.environment, "PRODUCTION");
  assert.equal(input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(input.project_url, PRODUCTION_SUPABASE_URL);
  assert.equal(input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(input.deployment_commit, commitSha);
  assert.equal(input.expected_prior_phase, "STATIC_BACKEND");
  assert.equal(input.target_phase, "READ_CUTOVER");
  assert.match(input.request_fingerprint, /^[0-9a-f]{64}$/);
});

test("read activation migration is inert, audited, phase-bound, reversible, and service-role only", async () => {
  const sql = await readFile(new URL(
    "../supabase/production_migrations/202608240022_production_cutover_read_sources.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /^--[\s\S]*\nbegin;\n/i);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\n$/);
  assert.equal((sql.match(/\$\$/g) || []).length % 2, 0);
  assert.equal((sql.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) || []).length, 1);
  assert.doesNotMatch(sql.slice(0, sql.indexOf("create or replace function public.set_production_cutover_read_state")),
    /update\s+production_control\.resource_scope/i);
  assert.match(sql, /function public\.set_production_cutover_read_state\(input jsonb\)/i);
  assert.match(sql, /lookup_cutover_receipt\('SET_READ_STATE'/);
  assert.match(sql, /store_cutover_receipt\('SET_READ_STATE'/);
  assert.match(sql, /target_rank <> prior_rank \+ 1/);
  assert.match(sql, /PRODUCTION_READ_ROLLBACK_REQUIRES_DEPENDENT_AUTHORITY_ROLLBACK/);
  assert.match(sql, /scoring_authority_unchanged/);
  assert.match(sql, /participant_identity_authority_unchanged/);
  assert.match(sql, /first_supabase_write_observed_at is distinct from first_write_before/);
  assert.match(sql, /GOOGLE_DIRECTOR_SYNC/);
  assert.match(sql, /PRODUCTION_PROJECTION_CANONICAL_EVIDENCE_MISMATCH/);
  assert.match(sql, /PRODUCTION_PUBLISHED_ODDS_SNAPSHOT_HASH_MISMATCH/);
  for (const importer of [
    "guide_projection", "player_editorial", "prediction_settings", "draft_projection",
    "net_skins_configuration", "calcutta_configuration", "published_odds",
  ]) {
    assert.match(sql, new RegExp(`rename to import_production_${importer}_dormant_internal`, "i"));
    assert.match(sql, new RegExp(`function public\\.import_production_${importer}\\(input jsonb\\)`, "i"));
  }
  assert.match(sql, /mark_projection_operation_response[\s\S]*mark_cutover_read_response/i);
  for (const rpc of [
    "set_production_cutover_read_state",
    "read_production_cutover_current_view",
    "read_production_cutover_completed_history",
    "read_production_cutover_scoring_authority",
    "read_production_cutover_scoring_participant_context",
    "inspect_production_cutover_read_state",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}\\(jsonb\\)[\\s\\S]*?from public, anon, authenticated, service_role`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\(jsonb\\) to service_role`, "i"));
  }
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
  assert.doesNotMatch(sql, /historical-data\.json|docs\.google\.com|sheets\.googleapis|net\.http_|cron\./i);
});
