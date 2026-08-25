import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_HEADER,
  productionStep11OddsRuntimeConfigurationInput,
  productionStep11OddsServiceAuthorizationEnvironment,
  productionStep11OddsServiceAuthorizationInput,
  productionStep11OddsStageReleaseInput,
} from "../lib/production-odds-calculation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";
const SHA = "1".repeat(40);
const S3 = "3".repeat(64);
const REQUEST = "a".repeat(64);
const HOSTNAME = "bagger-production-step11-odds.vercel.app";

const env = Object.freeze({
  VERCEL_ENV: "preview",
  VERCEL_URL: "bagger-production-step11-odds-deploy.vercel.app",
  VERCEL_BRANCH_URL: HOSTNAME,
  VERCEL_GIT_COMMIT_SHA: SHA,
  VERCEL_PROJECT_ID: PROJECT_ID,
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: HOSTNAME,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: SHA,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: PROJECT_ID,
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "production-server-credential-never-serialized",
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
  PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
  ODDS_PUBLICATION_AUTHORITY: "google",
  PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED: "false",
  PRODUCTION_STEP11_ODDS_REHEARSAL_ENABLED: "true",
  PRODUCTION_STEP11_ODDS_REHEARSAL_SECRET: "production-step11-odds-rehearsal-secret-only",
  PRODUCTION_STEP11_ODDS_SERVICE_AUTH_BRIDGE_ENABLED: "true",
  PRODUCTION_STEP11_S3_FINGERPRINT: S3,
});

test("Step 11 Odds service authorization requires the exact dormant candidate and explicit flag", () => {
  const ready = productionStep11OddsServiceAuthorizationEnvironment(env);
  assert.equal(ready.allowed, true);
  assert.equal(ready.calculation.mode, "STEP11_REHEARSAL");
  assert.equal(ready.s3Fingerprint, S3);

  for (const invalid of [
    { PRODUCTION_STEP11_ODDS_SERVICE_AUTH_BRIDGE_ENABLED: "false" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_SHA: "2".repeat(40) },
    { VERCEL_BRANCH_URL: "baggerinv.com" },
    { PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true" },
    { PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED: "true" },
    { PRODUCTION_SUPABASE_WORKERS_ENABLED: "true" },
    { PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "true" },
    { PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "true" },
    { PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED: "true" },
    { PRODUCTION_STEP11_S3_FINGERPRINT: "bad" },
  ]) {
    assert.equal(
      productionStep11OddsServiceAuthorizationEnvironment({ ...env, ...invalid }).allowed,
      false,
      JSON.stringify(invalid),
    );
  }
});

test("service bridge, release stage, and runtime requests bind exact SHA/host/S3/revision", () => {
  const authorization = productionStep11OddsServiceAuthorizationInput({
    requestFingerprint: REQUEST,
    env,
  });
  assert.equal(authorization.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(authorization.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(authorization.deployment_commit, SHA);
  assert.equal(authorization.candidate_hostname, HOSTNAME);
  assert.equal(authorization.source_fingerprint, S3);
  assert.equal(authorization.expected_director_player_id, "CB01");
  assert.equal(authorization.required_role, "DIRECTOR");
  assert.equal(authorization.request_token_verified, true);
  assert.equal(authorization.live_production_authorization, false);
  assert.equal(authorization.publication_created, false);
  assert.equal(authorization.mirror_created, false);
  assert.equal(authorization.external_google_writes, 0);
  assert.equal(JSON.stringify(authorization).includes(env.PRODUCTION_STEP11_ODDS_REHEARSAL_SECRET), false);

  const staged = productionStep11OddsStageReleaseInput({
    expectedActivationRevision: 0,
    requestFingerprint: REQUEST,
    env,
  });
  assert.equal(staged.contract_version, "production-cutover-activation-v1");
  assert.equal(staged.operation, "STAGE_STEP11_ODDS_REHEARSAL_RELEASE");
  assert.equal(staged.expected_activation_revision, 0);
  assert.equal(staged.source_fingerprint, S3);

  const enabled = productionStep11OddsRuntimeConfigurationInput({
    enabled: true,
    expectedActivationRevision: 1,
    expectedRuntimeRevision: 0,
    expectedRuntimeEnabled: false,
    requestFingerprint: REQUEST,
    env,
  });
  assert.equal(enabled.operation, "ENABLE_STEP11_ODDS_REHEARSAL_RUNTIME");
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.expected_activation_revision, 1);
  assert.equal(enabled.expected_runtime_revision, 0);
  assert.equal(enabled.expected_runtime_enabled, false);
  const disabled = productionStep11OddsRuntimeConfigurationInput({
    enabled: false,
    expectedActivationRevision: 1,
    expectedRuntimeRevision: 1,
    expectedRuntimeEnabled: true,
    requestFingerprint: REQUEST,
    env,
  });
  assert.equal(disabled.operation, "DISABLE_STEP11_ODDS_REHEARSAL_RUNTIME");
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.expected_runtime_revision, 1);
  assert.equal(disabled.expected_runtime_enabled, true);

  for (const badRevision of [
    -1, 1.2, "not-a-revision", null, undefined, "", "0", false,
  ]) {
    assert.throws(
      () => productionStep11OddsStageReleaseInput({
        expectedActivationRevision: badRevision,
        requestFingerprint: REQUEST,
        env,
      }),
      { code: "PRODUCTION_STEP11_ODDS_ACTIVATION_REVISION_REQUIRED" },
    );
    assert.throws(
      () => productionStep11OddsRuntimeConfigurationInput({
        enabled: true,
        expectedActivationRevision: badRevision,
        expectedRuntimeRevision: 0,
        expectedRuntimeEnabled: false,
        requestFingerprint: REQUEST,
        env,
      }),
      { code: "PRODUCTION_STEP11_ODDS_ACTIVATION_REVISION_REQUIRED" },
    );
  }
  for (const badRevision of [-1, 1.2, "1", null, undefined, false]) {
    assert.throws(
      () => productionStep11OddsRuntimeConfigurationInput({
        enabled: true,
        expectedActivationRevision: 1,
        expectedRuntimeRevision: badRevision,
        expectedRuntimeEnabled: false,
        requestFingerprint: REQUEST,
        env,
      }),
      { code: "PRODUCTION_STEP11_ODDS_RUNTIME_REVISION_REQUIRED" },
    );
  }
  for (const badState of [null, undefined, 0, 1, "false", "true"]) {
    assert.throws(
      () => productionStep11OddsRuntimeConfigurationInput({
        enabled: true,
        expectedActivationRevision: 1,
        expectedRuntimeRevision: 0,
        expectedRuntimeEnabled: badState,
        requestFingerprint: REQUEST,
        env,
      }),
      { code: "PRODUCTION_STEP11_ODDS_RUNTIME_STATE_REQUIRED" },
    );
  }
});

test("migration 028 proves the one confirmed CB01 Director and remains publication/mirror inert", async () => {
  const [sql, orchestration] = await Promise.all([
    readFile(new URL(
      "../supabase/production_migrations/202608240028_production_step11_odds_service_authorization.sql",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../supabase/production_migrations/202608240023_production_odds_calculation_orchestration.sql",
      import.meta.url,
    ), "utf8"),
  ]);
  assert.match(sql, /create or replace function public\.authorize_production_step11_odds_service_bridge\(\s*input jsonb\s*\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = pg_catalog, production_control, participant_identity,\s*scoring_authority, auth, extensions/i);
  assert.doesNotMatch(sql, /set search_path[^\n]*\bpublic\b|set search_path[^\n]*pg_temp/i);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(sql, /assert_exact_cutover_resource_scope\(input, false\)/i);
  assert.match(sql, /activation\.state not in \('DORMANT', 'STAGED'\)/i);
  const sharedStateGuard = sql.slice(
    sql.indexOf("if resource.current_tournament_read_authority"),
    sql.indexOf("if activation.state = 'DORMANT'"),
  );
  assert.doesNotMatch(sharedStateGuard, /activation\.state\s*<>\s*'STAGED'/i,
    "DORMANT must reach the dedicated dormant-state proof before initial staging");
  const stagedStateProof = sql.slice(
    sql.indexOf("elsif activation.expected_deployment_commit"),
    sql.indexOf("-- All physical identity records"),
  );
  assert.match(stagedStateProof,
    /not runtime\.enabled\s+and runtime\.operation_mode = 'DORMANT'[\s\S]*runtime\.activation_revision is null[\s\S]*not worker_contract\.operation_allowed[\s\S]*and not resource\.workers_enabled/i,
    "service authorization must remain possible immediately after runtime disable");
  assert.match(stagedStateProof,
    /runtime\.enabled\s+and runtime\.operation_mode = 'STEP11_REHEARSAL'[\s\S]*runtime\.activation_revision = activation\.activation_revision[\s\S]*worker_contract\.operation_allowed[\s\S]*worker\.worker_name = 'ODDS_CALCULATION'/i);
  assert.match(sql, /worker_contract production_control\.worker_contracts%rowtype/i);
  assert.match(sql, /worker_contract\.scheduler_installed/i);
  assert.match(sql, /worker_contract\.authoritative_write_allowed/i);
  assert.match(sql, /'runtimeActivationRevision', runtime\.activation_revision/i);
  assert.match(sql, /'workerContractOperationAllowed', worker_contract\.operation_allowed/i);
  assert.match(sql,
    /'workerContractAuthoritativeWriteAllowed',[\s\S]*worker_contract\.authoritative_write_allowed/i);
  assert.match(sql, /candidate\.player_id = 'CB01'/i);
  assert.match(sql, /auth_user\.email_confirmed_at is not null/i);
  assert.match(sql, /player_link\.status = 'ACTIVE'/i);
  assert.match(sql, /identifier\.status = 'VERIFIED'/i);
  assert.match(sql, /entitlement\.role = 'DIRECTOR'/i);
  assert.match(sql, /entitlement\.status = 'ACTIVE'/i);
  assert.match(sql, /tournament_role\.role = 'DIRECTOR'/i);
  assert.match(sql, /tournament_role\.role_active/i);
  assert.match(sql, /identity_matches <> 1/i);
  assert.match(sql, /PRODUCTION_STEP11_ODDS_SINGLE_CONFIRMED_CB01_DIRECTOR_REQUIRED/i);
  assert.match(sql, /PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZED/i);
  assert.match(sql, /insert into production_control\.operation_audit_events/i);
  assert.match(sql, /grant execute on function public\.authorize_production_step11_odds_service_bridge\(jsonb\)\s+to service_role/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
  assert.doesNotMatch(sql, /insert into scoring_authority\.odds_published_snapshots/i);
  assert.doesNotMatch(sql, /insert into scoring_authority\.odds_google_mirror_jobs/i);
  assert.doesNotMatch(sql, /insert into auth\.users|insert into participant_identity\.user_player_links|insert into participant_identity\.tournament_roles/i);
  assert.doesNotMatch(sql, /sheets\.googleapis|docs\.google\.com|pg_net|net\.http_/i);
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);

  const configure = orchestration.slice(
    orchestration.indexOf("create or replace function public.configure_production_odds_calculation_runtime"),
    orchestration.indexOf("create or replace function public.request_production_odds_calculation_job"),
  );
  assert.match(configure,
    /activation\.activation_revision\s*<>\s*coalesce\(\(input->>'expected_activation_revision'\)::bigint, -1\)/i);
  assert.doesNotMatch(configure, /update\s+production_control\.cutover_activation_state/i,
    "ENABLE/DISABLE may not advance or otherwise mutate activation_revision");
});

test("route bypasses browser cookies only for the exact token-gated service bridge and exposes safe rehearsal controls", async () => {
  const [route, server] = await Promise.all([
    readFile(new URL(
      "../app/api/admin/production-odds-calculations/route.js",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../lib/production-odds-calculation-server.js",
      import.meta.url,
    ), "utf8"),
  ]);
  assert.match(route, /x-step11-rehearsal-token/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /x-step11-service-authorization/);
  assert.equal(PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_HEADER,
    "production-step11-odds-director-bridge-v1");
  assert.match(route, /PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_HEADER/);
  assert.ok(
    route.indexOf("return await authorizeProductionStep11OddsServiceBridge") <
      route.indexOf("const director = await authorizePreviewDirector"),
  );
  for (const action of [
    "inspect-rehearsal", "stage-rehearsal", "enable-rehearsal", "disable-rehearsal",
  ]) assert.match(route, new RegExp(action));
  assert.match(route, /director\.source !== "production-step11-odds-service-bridge"/);
  assert.match(route, /PRODUCTION_STEP11_S3_FINGERPRINT/);
  assert.match(route, /expectedActivationRevision = input\.expectedActivationRevision/);
  assert.match(route, /expectedRuntimeRevision = input\.expectedRuntimeRevision/);
  assert.match(route, /expectedRuntimeEnabled = input\.expectedRuntimeEnabled/);
  assert.doesNotMatch(route, /expectedActivationRevision = Number\(input\.expectedActivationRevision\)/);
  assert.match(route, /authorizationDiagnostics: director\.diagnostics/);
  assert.match(server, /authorize_production_step11_odds_service_bridge/);
  assert.match(server, /stage_production_cutover_release/);
  assert.match(server, /inspect_production_cutover_authority/);
  assert.match(server, /configure_production_odds_calculation_runtime/);
  assert.match(server, /inspect_production_odds_calculation_runtime_control/);
  assert.match(server, /publicationCreated:\s*false/);
  assert.match(server, /mirrorCreated:\s*false/);
  assert.match(server, /externalGoogleWrites:\s*0/);
  assert.match(server, /runtimeActivationRevisionMatches:\s*true/);
  assert.match(server, /workerContractAuthoritativeWriteAllowed:\s*false/);
  assert.match(server, /serviceAuthorizationBridgeMustBeDisabled:\s*enabled !== true/);
  assert.match(server, /DISABLE_PRODUCTION_STEP11_ODDS_SERVICE_AUTH_BRIDGE/);
  assert.doesNotMatch(server, /publishSupabaseOddsSnapshot|markOddsCalculationPublished|deliverSupabaseOddsGoogleMirror/);
});
