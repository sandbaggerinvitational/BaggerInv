import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertProductionFoundationResources,
  exactProductionSupabaseUrl,
  productionFoundationOperationNames,
  productionFoundationResourceEnvironment,
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { oddsCalculationEnvironment } from "../lib/odds-calculation-source.js";
import { participantIdentityAuthorityEnvironment } from "../lib/participant-identity-authority.js";
import { scoringAuthorityEnvironment } from "../lib/scoring-authority.js";
import { resolveWarRoomInputSource } from "../lib/war-room-input-source.js";

const productionFoundation = {
  VERCEL_ENV: "production",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "server-only-secret",
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_FOUNDATION_TOURNAMENT_ID: "2026",
  PRODUCTION_FOUNDATION_TOURNAMENT_YEAR: "2026",
};

test("Production foundation accepts only the certified exact resource tuple", () => {
  const state = assertProductionFoundationResources({
    env: productionFoundation,
    operation: "SHADOW_IMPORT",
  });
  assert.equal(state.allowed, true);
  assert.equal(state.reason, "production-foundation-shadow-ready");
  assert.deepEqual(state.resources, {
    supabaseProjectRef: "ymqhhtxaywtqllynrmxe",
    supabaseHost: "ymqhhtxaywtqllynrmxe.supabase.co",
    sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournamentId: "2026",
    tournamentYear: 2026,
  });
  assert.deepEqual(state.policy, {
    googleRead: true,
    supabaseRead: true,
    supabaseWrite: true,
    googleWrite: false,
    scoringIngress: false,
    publicRead: false,
    oddsPublication: false,
    authUserCreation: false,
    authoritative: false,
  });
  assert.doesNotMatch(JSON.stringify(state), /server-only-secret/);
});

test("Production foundation fails closed unless explicitly enabled", () => {
  const state = productionFoundationResourceEnvironment({
    env: { ...productionFoundation, PRODUCTION_FOUNDATION_ENABLED: "" },
    operation: "CATALOG_INSPECT",
  });
  assert.equal(state.allowed, false);
  assert.equal(state.reason, "foundation-disabled");
  assert.throws(
    () => assertProductionFoundationResources({
      env: { ...productionFoundation, PRODUCTION_FOUNDATION_ENABLED: "" },
      operation: "CATALOG_INSPECT",
    }),
    (error) => error.code === "PRODUCTION_FOUNDATION_RESOURCE_MISMATCH" && error.status === 503,
  );
});

test("Production foundation rejects Preview, resource aliases, and substring host matches", () => {
  const cases = [
    [{ ...productionFoundation, VERCEL_ENV: "preview" }, "production-environment-required"],
    [{ ...productionFoundation, VERCEL_ENV: "Production" }, "production-environment-required"],
    [{ ...productionFoundation, PRODUCTION_SUPABASE_PROJECT_REF: `x${PRODUCTION_SUPABASE_PROJECT_REF}` }, "production-project-ref-required"],
    [{ ...productionFoundation, PRODUCTION_SUPABASE_URL: `${PRODUCTION_SUPABASE_URL}.attacker.example` }, "production-project-url-required"],
    [{ ...productionFoundation, PRODUCTION_SUPABASE_URL: `${PRODUCTION_SUPABASE_URL}/rest/v1` }, "production-project-url-required"],
    [{ ...productionFoundation, PRODUCTION_SUPABASE_URL: `${PRODUCTION_SUPABASE_URL}?ref=${PRODUCTION_SUPABASE_PROJECT_REF}` }, "production-project-url-required"],
    [{ ...productionFoundation, GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts" }, "production-workbook-required"],
    [{ ...productionFoundation, PRODUCTION_FOUNDATION_TOURNAMENT_ID: "SBI-2026" }, "production-tournament-id-required"],
    [{ ...productionFoundation, PRODUCTION_FOUNDATION_TOURNAMENT_YEAR: "2025" }, "production-tournament-year-required"],
  ];
  for (const [env, reason] of cases) {
    assert.equal(productionFoundationResourceEnvironment({ env, operation: "SHADOW_IMPORT" }).reason, reason);
  }
  assert.equal(exactProductionSupabaseUrl(PRODUCTION_SUPABASE_URL), true);
  assert.equal(exactProductionSupabaseUrl(`${PRODUCTION_SUPABASE_URL}.attacker.example`), false);
});

test("Production foundation allows only dormant shadow operations", () => {
  assert.deepEqual(productionFoundationOperationNames(), [
    "CATALOG_INSPECT",
    "SCHEMA_APPLY",
    "SHADOW_IMPORT",
    "PROJECTION_SYNC",
    "SHADOW_PARITY",
  ]);
  for (const operation of ["SCORING_INGRESS", "GOOGLE_MIRROR", "PUBLISH_ODDS", "CREATE_AUTH_USER", "AUTHORITATIVE_WRITE"]) {
    const state = productionFoundationResourceEnvironment({ env: productionFoundation, operation });
    assert.equal(state.allowed, false);
    assert.equal(state.reason, "foundation-operation-not-allowed");
  }
});

test("Production foundation blocks non-legacy authority and authoritative feature flags", () => {
  for (const env of [
    { ...productionFoundation, SCORING_AUTHORITY: "supabase" },
    { ...productionFoundation, PARTICIPANT_IDENTITY_AUTHORITY: "supabase" },
  ]) {
    const state = productionFoundationResourceEnvironment({ env, operation: "SHADOW_IMPORT" });
    assert.equal(state.allowed, false);
    assert.equal(state.reason, "legacy-production-authorities-required");
  }
  for (const field of [
    "PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED",
    "PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED",
    "PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED",
    "PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED",
    "PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED",
  ]) {
    const state = productionFoundationResourceEnvironment({
      env: { ...productionFoundation, [field]: "true" },
      operation: "SHADOW_IMPORT",
    });
    assert.equal(state.allowed, false, field);
    assert.equal(state.reason, "authoritative-feature-flag-forbidden", field);
  }
});

test("live Production source selectors remain Google and Passport", () => {
  const odds = oddsCalculationEnvironment(productionFoundation);
  assert.equal(odds.inputSource, "google");
  assert.equal(odds.publicationAuthority, "google");
  assert.equal(scoringAuthorityEnvironment(productionFoundation).resolved, "google");
  assert.equal(participantIdentityAuthorityEnvironment(productionFoundation).resolved, "passport");
  assert.equal(resolveWarRoomInputSource(productionFoundation).resolved, "google");
});

test("Production foundation transport is server-only and never selected by a route", async () => {
  const source = await readFile(new URL("../lib/production-foundation-transport.js", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.match(source, /mode: "DORMANT_SHADOW"/);
  assert.match(source, /googleMirrorDeliveryEnabled: false/);
  assert.match(source, /authUserCreationEnabled: false/);
  const routeSources = await Promise.all([
    "../app/api/live-matches/route.js",
    "../app/api/odds/publish/route.js",
    "../app/api/scoring/current/route.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const route of routeSources) assert.doesNotMatch(route, /productionFoundationTransport/);
});
