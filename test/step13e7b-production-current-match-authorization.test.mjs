import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { authorizeMatchAccess } from
  "../lib/match-authorization-supabase.js";
import {
  PRODUCTION_CUTOVER_READ_RPCS,
  adaptProductionCutoverReadPayload,
  productionCutoverReadRpcTranslation,
} from "../lib/production-cutover-read-transport.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const source = (relative) => readFile(
  new URL(`../${relative}`, import.meta.url), "utf8",
);

const secret = `sb_secret_${"x".repeat(32)}`;
const commit = "a".repeat(40);
const productionEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: commit,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID:
    "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_CUTOVER_PHASE: "CURRENT_READS",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: secret,
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: secret,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
});

const frozenRuntime = Object.freeze({
  tournamentId: "2026",
  tournamentYear: 2026,
  pointerRevision: 1,
});
const futureRuntime = Object.freeze({
  tournamentId: "2027",
  tournamentYear: 2027,
  pointerRevision: 2,
  runtimeGenerationId: "11111111-1111-4111-8111-111111111111",
  authorityGenerationId: "22222222-2222-4222-8222-222222222222",
  admissionGenerationId: "33333333-3333-4333-8333-333333333333",
});

const decision = Object.freeze({
  allowed: true,
  code: "AUTHORIZED",
  action: "VIEW_MATCH",
  tournament_id: "2026",
  player_id: "CB01",
  player_display_name: "Clay",
  match_id: "2026-R1-1",
  membership_active: true,
  participant_membership: true,
  match_status: "LIVE",
  scoring_locked: false,
  can_score: true,
  permission_revision: 3,
  match_permission_revision: 3,
  match_revision: 8,
  context_revision: 4,
  read_only: true,
  query_ms: 0.25,
});

test("Production Match authorization translates to the pointer RPC and preserves the native decision", async () => {
  assert.ok(PRODUCTION_CUTOVER_READ_RPCS.includes("authorize_match_access"));
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify(decision), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await authorizeMatchAccess({
      tournamentId: "2099",
      playerId: "CB01",
      matchId: "2026-R1-1",
      action: "view_match",
    }, {
      env: productionEnv,
      resolveProductionCurrentReadDispatch: async (_name, body) => ({
        pointerAware: true,
        frozen2026: true,
        body,
        annualRuntimeInput: null,
        runtime: frozenRuntime,
      }),
    });
    assert.deepEqual(result.payload, decision);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url,
      `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/authorize_production_current_match_access_v1`);
    assert.equal(calls[0].body.input.target_tournament_id, "2026");
    assert.equal(calls[0].body.input.expected_current_tournament_id, "2026");
    assert.equal(calls[0].body.input.expected_pointer_revision, 1);
    assert.equal(calls[0].body.input.target_player_id, "CB01");
    assert.equal(calls[0].body.input.target_match_id, "2026-R1-1");
    assert.equal(calls[0].body.input.requested_action, "VIEW_MATCH");
    assert.doesNotMatch(JSON.stringify(calls[0].body), /2099/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("future-current translation overwrites every caller runtime token", () => {
  const annualRuntimeInput = {
    expected_current_tournament_id: futureRuntime.tournamentId,
    expected_pointer_revision: futureRuntime.pointerRevision,
    expected_runtime_generation_id: futureRuntime.runtimeGenerationId,
    expected_annual_authority_generation_id: futureRuntime.authorityGenerationId,
    expected_annual_admission_generation_id: futureRuntime.admissionGenerationId,
  };
  const translated = productionCutoverReadRpcTranslation(
    "authorize_match_access",
    {
      target_tournament_id: "2099",
      target_player_id: "CB01",
      target_match_id: "2027-R1-1",
      requested_action: "start_scoring",
      input: {
        expected_pointer_revision: 999,
        expected_runtime_generation_id:
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    },
    productionEnv,
    { annualRuntimeInput, currentRuntime: futureRuntime },
  );
  assert.equal(translated.functionName,
    "authorize_production_current_match_access_v1");
  assert.deepEqual({
    target: translated.body.input.target_tournament_id,
    expectedTarget: translated.body.input.expected_current_tournament_id,
    pointer: translated.body.input.expected_pointer_revision,
    runtime: translated.body.input.expected_runtime_generation_id,
    authority: translated.body.input.expected_annual_authority_generation_id,
    admission: translated.body.input.expected_annual_admission_generation_id,
  }, {
    target: "2027",
    expectedTarget: "2027",
    pointer: 2,
    runtime: futureRuntime.runtimeGenerationId,
    authority: futureRuntime.authorityGenerationId,
    admission: futureRuntime.admissionGenerationId,
  });
  assert.equal(translated.body.input.requested_action, "START_SCORING");
  assert.equal("input" in translated.body.input, false);
  assert.doesNotMatch(JSON.stringify(translated.body),
    /2099|999|aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.throws(() => productionCutoverReadRpcTranslation(
    "authorize_match_access",
    { target_tournament_id: "2099" },
    productionEnv,
  ), (error) =>
    error.code === "PRODUCTION_CURRENT_MATCH_AUTHORIZATION_RUNTIME_REQUIRED");

  const native = { ...decision, tournament_id: "2027" };
  assert.equal(adaptProductionCutoverReadPayload(
    native,
    translated,
    { activation: { contractVersion: "unused" } },
  ), native);
});

test("ordinary Preview retains the direct authorize_match_access request", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), body: JSON.parse(options.body) };
    return new Response(JSON.stringify(decision), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await authorizeMatchAccess({
      tournamentId: "2026", playerId: "CB01",
      matchId: "2026-R1-1", action: "VIEW_MATCH",
    }, { env: {
      VERCEL_ENV: "preview",
      SUPABASE_SCORING_MIRROR_ENABLED: "true",
      GOOGLE_SHEETS_ID: "preview-workbook",
      SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
      SUPABASE_SCORING_MIRROR_SECRET_KEY: "preview-secret",
    } });
    assert.deepEqual(result.payload, decision);
    assert.equal(request.url,
      "https://preview.supabase.co/rest/v1/rpc/authorize_match_access");
    assert.deepEqual(request.body, {
      target_tournament_id: "2026",
      target_player_id: "CB01",
      target_match_id: "2026-R1-1",
      requested_action: "VIEW_MATCH",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Passport, final-scorecard revalidation, and mobile scoring retain the shared contract", async () => {
  const [passport, revalidation, mobile, dispatcher, migration] =
    await Promise.all([
      source("app/api/player-passport/matches/route.js"),
      source("lib/scoring-participant-authorization.js"),
      source("lib/mobile-v1-scoring.js"),
      source("lib/production-current-read-dispatch.js"),
      source("supabase/production_migrations/202608300079_production_current_match_authorization_v1.sql"),
    ]);
  assert.match(passport,
    /authorizeMatchAccess\(\{ tournamentId: identity\.tournamentId, playerId, matchId, action \}\)/);
  assert.match(revalidation,
    /session\.readOnly[\s\S]*authorizeMatchAccess[\s\S]*VIEW_FINAL_SCORECARD/);
  assert.match(mobile,
    /authorizeMatchAccess[\s\S]*VIEW_MATCH[\s\S]*authorizeMatchAccess[\s\S]*START_SCORING/);
  assert.match(dispatcher,
    /PRODUCTION_POINTER_CURRENT_READ_RPCS[\s\S]*"authorize_match_access"/);
  assert.match(migration,
    /pg_advisory_xact_lock_shared\([\s\S]*scoring_admission_lock_key/);
  assert.match(migration,
    /assert_frozen_2026_current_read_v1\(\)/);
  assert.match(migration,
    /assert_annual_current_read_v1\(input\)/);
  assert.match(migration,
    /return scoring_authority\.match_access_decision\(/);
  assert.match(migration,
    /grant execute on function[\s\S]*authorize_production_current_match_access_v1\(jsonb\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration,
    /grant execute on function[\s\S]*public\.authorize_match_access\(/);
});
