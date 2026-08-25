import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { participantAuthExperienceConfiguration } from "../lib/participant-sms-auth-feature.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const candidateHostname = "bagger-production-shadow-step11.vercel.app";
const candidateSecret = "step11-production-server-only-secret";
const candidateEnv = Object.freeze({
  VERCEL_ENV: "preview",
  VERCEL_URL: "bagger-production-shadow-step11-deploy.vercel.app",
  VERCEL_BRANCH_URL: candidateHostname,
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  VERCEL_PROJECT_ID: "prj_bagger_inv_production",
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: candidateHostname,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: "a".repeat(40),
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: "prj_bagger_inv_production",
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: candidateSecret,
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
  PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED: "true",
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: candidateSecret,
  TOURNAMENT_READ_SOURCE: "supabase",
  TOURNAMENT_FOUNDATION_READ_SOURCE: "supabase",
  HOMEPAGE_CURRENT_READ_SOURCE: "supabase",
  HOME_READ_SOURCE: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  MY_MATCH_READ_SOURCE: "supabase",
  GAME_CENTER_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  NET_SKINS_READ_SOURCE: "supabase",
  CALCUTTA_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  HISTORY_2026_READ_SOURCE: "supabase",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  HISTORICAL_COURSE_READ_SOURCE: "supabase",
  PUBLISHED_ODDS_READ_SOURCE: "supabase",
  ODDS_CALCULATION_INPUT_SOURCE: "supabase",
  PREDICTION_SETTINGS_READ_SOURCE: "supabase",
  WAR_ROOM_INPUT_SOURCE: "supabase",
  DRAFT_READ_SOURCE: "supabase",
  MOMENTUM_READ_SOURCE: "supabase",
  STORYLINES_READ_SOURCE: "supabase",
  TOURNAMENT_INTELLIGENCE_READ_SOURCE: "supabase",
  PROJECTION_EDITORIAL_READ_SOURCE: "supabase",
  FINAL_RECAP_READ_SOURCE: "supabase",
  ODDS_PUBLICATION_AUTHORITY: "google",
});

async function workerHarness({ fetchImpl = async () => new Response("network", { status: 200 }) } = {}) {
  const listeners = {};
  const deleted = [];
  const opened = [];
  const added = [];
  const put = [];
  const cacheEntries = new Map([
    ["/offline.html", new Response("offline", { status: 200 })],
  ]);
  let skipWaitingCalls = 0;
  let claimCalls = 0;
  const caches = {
    async open(name) {
      opened.push(name);
      return {
        async addAll(paths) { added.push(...paths); },
        async put(request, response) { put.push({ request, response }); },
      };
    },
    async keys() { return ["sbi-shell-v3", "sbi-shell-v4", "sbi-shell-v5", "next-runtime-cache"]; },
    async delete(name) { deleted.push(name); return true; },
    async match(request) {
      const key = typeof request === "string" ? request : new URL(request.url).pathname;
      return cacheEntries.get(key);
    },
  };
  const self = {
    location: { origin: "https://candidate.example" },
    registration: { showNotification: async () => {} },
    clients: {
      async claim() { claimCalls += 1; },
      async matchAll() { return []; },
      async openWindow() {},
    },
    addEventListener(type, handler) { listeners[type] = handler; },
    skipWaiting() { skipWaitingCalls += 1; },
  };
  vm.runInNewContext(await source("public/sw.js"), {
    self,
    caches,
    fetch: fetchImpl,
    URL,
    Response,
    Promise,
  });
  return {
    listeners,
    deleted,
    opened,
    added,
    put,
    get skipWaitingCalls() { return skipWaitingCalls; },
    get claimCalls() { return claimCalls; },
  };
}

function fetchEvent(request) {
  let response;
  return {
    event: {
      request,
      respondWith(value) { response = Promise.resolve(value); },
    },
    response: () => response,
  };
}

test("Step 11 worker installs v5, activates immediately, and evicts only older SBI shells", async () => {
  const harness = await workerHarness();
  let installWork;
  harness.listeners.install({ waitUntil(value) { installWork = value; } });
  await installWork;
  assert.equal(harness.skipWaitingCalls, 1);
  assert.deepEqual(harness.opened, ["sbi-shell-v5"]);
  assert.deepEqual(harness.added, [
    "/offline.html", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png",
    "/apple-touch-icon.png", "/favicon.ico",
  ]);

  let activateWork;
  harness.listeners.activate({ waitUntil(value) { activateWork = value; } });
  await activateWork;
  assert.deepEqual(harness.deleted.sort(), ["sbi-shell-v3", "sbi-shell-v4"]);
  assert.equal(harness.deleted.includes("next-runtime-cache"), false);
  assert.equal(harness.claimCalls, 1);
});

test("Step 11 worker never intercepts Auth, APIs, scoring, admin, Game Center, or Next assets", async () => {
  const harness = await workerHarness();
  const requests = [
    new Request("https://candidate.example/api/participant/auth/session"),
    new Request("https://candidate.example/participant-auth", { method: "GET" }),
    new Request("https://candidate.example/score/2026-R1-M1", { method: "GET" }),
    new Request("https://candidate.example/admin/director", { method: "GET" }),
    new Request("https://candidate.example/activate/token", { method: "GET" }),
    new Request("https://candidate.example/game-center/2026-R1-M1", { method: "GET" }),
    new Request("https://candidate.example/_next/static/chunk.js", { method: "GET" }),
    new Request("https://candidate.example/home", { method: "POST", body: "mutation" }),
  ];
  for (const request of requests) {
    const candidate = fetchEvent(request);
    harness.listeners.fetch(candidate.event);
    assert.equal(candidate.response(), undefined, `${request.method} ${new URL(request.url).pathname}`);
  }
});

test("Step 11 navigations are network-only with a static offline shell and never persist route data", async () => {
  const networkPaths = [];
  const online = await workerHarness({ fetchImpl: async (request) => {
    networkPaths.push(new URL(request.url).pathname);
    return new Response("fresh-route", { status: 200 });
  } });
  const navigation = fetchEvent({ url: "https://candidate.example/home", method: "GET", mode: "navigate" });
  online.listeners.fetch(navigation.event);
  assert.equal(await (await navigation.response()).text(), "fresh-route");
  assert.deepEqual(networkPaths, ["/home"]);
  assert.equal(online.put.length, 0);

  const offline = await workerHarness({ fetchImpl: async () => { throw new TypeError("offline"); } });
  const unavailable = fetchEvent({ url: "https://candidate.example/my-match", method: "GET", mode: "navigate" });
  offline.listeners.fetch(unavailable.event);
  assert.equal(await (await unavailable.response()).text(), "offline");
  assert.equal(offline.put.length, 0);
});

test("first worker install does not reload-loop and an existing controller reloads at most once", async () => {
  const foundation = await source("app/PwaFoundation.js");
  assert.match(foundation, /serviceWorker\.register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
  assert.match(foundation, /const controlledAtStart = Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(foundation, /if \(!controlledAtStart \|\| controllerReloadStarted\) return/);
  assert.match(foundation, /controllerReloadStarted = true;\s*window\.location\.reload\(\)/);
  assert.match(foundation, /registration\.update\(\)\.catch/);
  assert.match(foundation, /registration\.addEventListener\("updatefound"/);
});

test("SMS stays absent from the Production-shadow launch even when Preview phone variables leak in", async () => {
  const inheritedPhoneConfiguration = {
    ...candidateEnv,
    PARTICIPANT_SMS_AUTH_ENABLED: "true",
    PARTICIPANT_SMS_CAPTCHA_REQUIRED: "true",
    PARTICIPANT_SMS_CAPTCHA_CONFIGURED: "true",
    NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY: "inherited-preview-site-key",
    PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET: "p".repeat(40),
  };
  const experience = participantAuthExperienceConfiguration(inheritedPhoneConfiguration);
  assert.equal(experience.smsRequested, false);
  assert.equal(experience.smsEnabled, false);
  assert.equal(experience.defaultMethod, "email");
  assert.equal(experience.candidateSmsCertified, false);

  const [page, client] = await Promise.all([
    source("app/participant-auth/page.js"),
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
  ]);
  assert.match(page, /participantAuthExperienceConfiguration\(env\)/);
  assert.match(client, /if \(!experience\.smsEnabled\) return;/);
  assert.match(client, /\{experience\.smsEnabled\s*\? <div className=\{styles\.switcher\}/);
  assert.match(client, /disabled=\{Boolean\(busy\) \|\| \(method === "email" && !experience\.smsEnabled\)\}/);
});

test("representative candidate Supabase services fail closed with zero Google fallback", async () => {
  const moduleUrls = Object.fromEntries(Object.entries({
    scope: "lib/data-authority-request.js",
    tournament: "lib/tournament-live-supabase.js",
    history: "lib/completed-history-service.js",
    guide: "lib/guide-supabase.js",
    draft: "lib/draft-service.js",
    odds: "lib/published-odds-supabase.js",
    home: "lib/participant-home-supabase.js",
  }).map(([key, path]) => [key, new URL(`../${path}`, import.meta.url).href]));
  const script = `
    const urls = ${JSON.stringify(moduleUrls)};
    const env = ${JSON.stringify(candidateEnv)};
    const [scope, tournament, history, guide, draft, odds, home] = await Promise.all([
      import(urls.scope), import(urls.tournament), import(urls.history), import(urls.guide),
      import(urls.draft), import(urls.odds), import(urls.home),
    ]);
    let unexpectedNetworkCalls = 0;
    globalThis.fetch = async () => { unexpectedNetworkCalls += 1; throw new Error("unexpected transport"); };
    const operations = [
      ["current tournament", () => tournament.readTournamentLiveView("2026", { env })],
      ["completed History", () => history.loadCompletedHistoryView({ env, year: 2023 })],
      ["Guide", () => guide.readGuideProjection({ env, tournamentId: "2026", surface: "guide" })],
      ["Draft", () => draft.loadDraftProjection({ env, scope: "CURRENT" })],
      ["Published Odds", () => odds.readPublishedOddsView({ tournamentId: "2026", sourceWorkbookId: ${JSON.stringify(PRODUCTION_GOOGLE_WORKBOOK_ID)} }, { env })],
      ["participant Home", () => home.readParticipantHomeView({ tournamentId: "2026", playerId: "CB01" }, { env })],
    ];
    const results = [];
    for (const [label, operation] of operations) {
      try {
        await scope.withDataAuthorityRequestScope({ env, label: "step11:" + label, source: "supabase", injectSupabaseOutage: true }, operation);
        results.push({ label, unexpectedlySucceeded: true });
      } catch (error) {
        results.push({ label, code: error?.code || "", diagnostics: error?.dataAuthorityDiagnostics || null });
      }
    }
    process.stdout.write(JSON.stringify({ results, unexpectedNetworkCalls }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const observed = JSON.parse(child.stdout);
  assert.equal(observed.unexpectedNetworkCalls, 0);
  assert.equal(observed.results.length, 6);
  for (const result of observed.results) {
    assert.equal(result.unexpectedlySucceeded, undefined, result.label);
    assert.equal(result.code, "DATA_AUTHORITY_SUPABASE_OUTAGE_INJECTED", result.label);
    assert.equal(result.diagnostics.source, "supabase", result.label);
    assert.equal(result.diagnostics.googleAttempts, 0, result.label);
    assert.equal(result.diagnostics.googleHttpRequests, 0, result.label);
    assert.equal(result.diagnostics.googleWriterOperations, 0, result.label);
    assert.equal(result.diagnostics.fallbackUsed, false, result.label);
    assert.ok(result.diagnostics.blockedSupabaseAttempts >= 1, result.label);
  }
});

test("the request-scoped route covers the Step 11 website/PWA matrix without write adapters", async () => {
  const route = await source("app/api/admin/data-authority-certification/route.js");
  for (const surface of [
    "root", "live", "players", "history", "courses", "draft", "odds-center", "war-room",
    "home", "me", "my-match", "game-center", "leaderboards", "guide",
  ]) assert.match(route, new RegExp(`"${surface}"`), surface);
  assert.match(route, /withDataAuthorityRequestScope/);
  assert.match(route, /injectGoogleOutage: outage === "google"/);
  assert.match(route, /injectSupabaseOutage: outage === "supabase"/);
  assert.match(route, /dataAuthorityResponseHeaders/);
  assert.doesNotMatch(route, /google-sheets-(?:data|write)|markDataAuthorityFallback|historical-data\.json/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
});
