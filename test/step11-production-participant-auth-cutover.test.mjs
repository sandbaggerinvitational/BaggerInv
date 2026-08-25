import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { participantIdentityAuthorityEnvironment } from "../lib/participant-identity-authority.js";
import {
  PRODUCTION_VERCEL_PROJECT_ID,
} from "../lib/production-cutover-activation-contract.js";
import {
  participantAuthCaptchaConfigured,
  participantAuthExperienceConfiguration,
} from "../lib/participant-sms-auth-feature.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const sha = "a".repeat(40);
const productionIdentityEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_GIT_COMMIT_SHA: sha,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "IDENTITY",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: sha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "production-publishable-key",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "production-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "r".repeat(32),
});

test("dormant live Production fails closed when Supabase identity was explicitly selected", () => {
  const dormant = {
    ...productionIdentityEnv,
    PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "false",
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  };
  const authority = participantIdentityAuthorityEnvironment(dormant);
  const experience = participantAuthExperienceConfiguration(dormant);
  assert.equal(authority.resolved, "unavailable");
  assert.equal(authority.blocked, true);
  assert.equal(authority.participantAuthEnabled, false);
  assert.equal(authority.productionCutoverIdentity, false);
  assert.equal(authority.reason, "activation-disabled");
  assert.equal(experience.productionBlocked, true);
  assert.equal(experience.captchaRequired, false);
  assert.equal(experience.smsEnabled, false);

  for (const legacyEnv of [
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: "production", PARTICIPANT_IDENTITY_AUTHORITY: "passport" },
  ]) {
    const legacy = participantIdentityAuthorityEnvironment(legacyEnv);
    assert.equal(legacy.resolved, "passport");
    assert.equal(legacy.blocked, false);
  }
});

test("the exact Production IDENTITY phase selects Supabase and requires ready Turnstile", () => {
  const authority = participantIdentityAuthorityEnvironment(productionIdentityEnv);
  const experience = participantAuthExperienceConfiguration(productionIdentityEnv);
  assert.equal(authority.resolved, "supabase");
  assert.equal(authority.productionCutoverIdentity, true);
  assert.equal(authority.participantAuthEnabled, true);
  assert.equal(authority.reason, "production-cutover-supabase-identity");
  assert.equal(participantAuthCaptchaConfigured(productionIdentityEnv), true);
  assert.equal(experience.captchaRequired, true);
  assert.equal(experience.captchaReady, true);
  assert.equal(experience.captchaSiteKey, "production-turnstile-site-key");
  assert.equal(experience.defaultMethod, "email");
  assert.equal(experience.smsEnabled, false);
});

test("malformed or incomplete Production identity activation fails closed", () => {
  const cases = [
    { PRODUCTION_CUTOVER_ACTIVATION_ENABLED: undefined },
    { PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "" },
    { PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "false" },
    { PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "maybe" },
    { PARTICIPANT_IDENTITY_AUTHORITY: "mystery" },
    { NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://idgigvjjqkfbqjeredpb.supabase.co" },
    { NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "" },
    { PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "false" },
    { PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "short" },
    { PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false" },
    { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) },
  ];
  for (const patch of cases) {
    const authority = participantIdentityAuthorityEnvironment({ ...productionIdentityEnv, ...patch });
    assert.equal(authority.resolved, "unavailable", JSON.stringify(patch));
    assert.equal(authority.blocked, true, JSON.stringify(patch));
    assert.equal(authority.participantAuthEnabled, false, JSON.stringify(patch));
  }
});

test("Preview identity behavior remains separate from Production activation", () => {
  const preview = {
    VERCEL_ENV: "preview",
    GOOGLE_SHEETS_ID: "preview-workbook",
    PREVIEW_SCORING_SHEET_ID: "preview-workbook",
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
    NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.example.supabase.co",
    NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "preview-publishable",
    SUPABASE_SCORING_MIRROR_URL: "https://preview.example.supabase.co",
    SUPABASE_SCORING_MIRROR_SECRET_KEY: "preview-server-secret",
    PARTICIPANT_SMS_CAPTCHA_REQUIRED: "true",
    PARTICIPANT_SMS_CAPTCHA_CONFIGURED: "true",
    NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY: "preview-turnstile",
  };
  const authority = participantIdentityAuthorityEnvironment(preview);
  assert.equal(authority.resolved, "supabase");
  assert.equal(authority.productionCutoverIdentity, false);
  assert.equal(authority.previewWorkbook, true);
  assert.equal(participantAuthCaptchaConfigured(preview), true);
});

test("Production participant routes require exact cutover requests and OTP verification types", async () => {
  const [requestRoute, verifyRoute, sessionRoute, page, feature] = await Promise.all([
    readFile(new URL("../app/api/participant/auth/otp/request/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/participant/auth/otp/verify/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/participant/auth/session/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/participant-auth/page.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/participant-sms-auth-feature.js", import.meta.url), "utf8"),
  ]);
  assert.match(requestRoute, /authority\.productionCutoverIdentity/);
  assert.match(requestRoute, /assertProductionCutoverRequest\(request/);
  assert.match(requestRoute, /authorizeProductionParticipantEmailOtpEligibility/);
  assert.match(requestRoute, /productionShadowCandidate \|\| authority\.productionCutoverIdentity/);
  assert.match(verifyRoute, /assertProductionCutoverRequest\(request/);
  assert.match(sessionRoute, /assertProductionCutoverRequest\(request/);
  assert.match(page, /participantAuthExperienceConfiguration\(env\)/);
  assert.match(feature, /const smsRequested = preview/);
  assert.doesNotMatch(feature, /productionCutoverIdentity[^;]+smsEnabled\s*=\s*true/);
});

test("unknown/colliding identifiers cannot invoke Auth Admin user creation", () => {
  const moduleUrl = new URL("../lib/production-participant-auth-enrollment.js", import.meta.url).href;
  const script = `
    const { authorizeProductionParticipantEmailOtpEligibility } = await import(${JSON.stringify(moduleUrl)});
    let createCalls = 0;
    const adminClient = { auth: { admin: {
      createUser: async () => { createCalls += 1; throw new Error("must-not-run"); },
      deleteUser: async () => ({ error: null }),
      getUserById: async () => ({ data: { user: null }, error: null }),
    } } };
    const rpc = async () => ({ payload: { ok: true, allowed: false,
      provisioningRequired: false, requestId: "11111111-1111-4111-8111-111111111111" } });
    const result = await authorizeProductionParticipantEmailOtpEligibility({
      email: "unknown@example.com", client_request_hash: "a".repeat(64),
    }, { env: {}, rpc, adminClient });
    process.stdout.write(JSON.stringify({ result, createCalls }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.createCalls, 0);
  assert.equal(result.result.ok, true);
  assert.equal(result.result.authorization.payload.allowed, false);
});

test("approved first login creates once, binds the stable Player ID, then reauthorizes idempotently", () => {
  const moduleUrl = new URL("../lib/production-participant-auth-enrollment.js", import.meta.url).href;
  const script = `
    const { authorizeProductionParticipantEmailOtpEligibility } = await import(${JSON.stringify(moduleUrl)});
    const calls = [];
    const decisions = [
      { ok: true, allowed: false, provisioningRequired: true,
        claimId: "11111111-1111-4111-8111-111111111111", playerId: "P100",
        email: "approved@example.com", recoveryAuthUserId: null },
      { ok: true, allowed: true, provisioningRequired: false,
        requestId: "22222222-2222-4222-8222-222222222222", playerId: "P100",
        authUserId: "33333333-3333-4333-8333-333333333333", email: "approved@example.com",
        verificationType: "signup" },
    ];
    const rpc = async (name, input) => {
      calls.push({ kind: "rpc", name, input });
      if (name === "authorize_production_participant_otp_request") return { payload: decisions.shift() };
      if (name === "complete_production_participant_first_login") return { payload: { ok: true } };
      throw new Error("unexpected-rpc:" + name);
    };
    const adminClient = { auth: { admin: {
      createUser: async (input) => { calls.push({ kind: "create", input }); return { data: { user: {
        id: "33333333-3333-4333-8333-333333333333", email: input.email,
      } }, error: null }; },
      deleteUser: async () => ({ error: null }),
      getUserById: async () => ({ data: { user: null }, error: null }),
    } } };
    const result = await authorizeProductionParticipantEmailOtpEligibility({
      email: "approved@example.com", client_request_hash: "a".repeat(64),
    }, { env: {}, rpc, adminClient });
    process.stdout.write(JSON.stringify({ result, calls }));
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.result.ok, true);
  assert.equal(result.result.authorization.payload.allowed, true);
  assert.equal(result.result.authorization.payload.playerId, "P100");
  assert.equal(result.calls.filter((entry) => entry.kind === "create").length, 1);
  const created = result.calls.find((entry) => entry.kind === "create").input;
  assert.equal(created.email_confirm, false);
  assert.equal(created.app_metadata.player_id, "P100");
  assert.equal(created.app_metadata.provisioning_scope, "production_controlled_first_login");
  assert.deepEqual(result.calls.filter((entry) => entry.kind === "rpc").map((entry) => entry.name), [
    "authorize_production_participant_otp_request",
    "complete_production_participant_first_login",
    "authorize_production_participant_otp_request",
  ]);
});

test("Production migration is dormant, service-only, full-roster gated, collision-safe, and auditable", async () => {
  const sql = await readFile(new URL("../supabase/production_migrations/202608240020_production_participant_identity_cutover.sql", import.meta.url), "utf8");
  const identityRpcSource = await readFile(new URL("../lib/participant-identity-supabase.js", import.meta.url), "utf8");
  const activationSql = await readFile(new URL("../supabase/production_migrations/202608240019_production_cutover_activation.sql", import.meta.url), "utf8");
  assert.match(sql, /Applying this migration creates no Auth users and changes no authority/);
  assert.match(sql, /participant_identity_authority = 'SUPABASE', auth_user_creation_enabled = true/);
  assert.match(sql, /approved_contact_count <> active_roster_count/);
  assert.match(sql, /distinct_email_count <> active_roster_count/);
  assert.match(sql, /example\\\.\(com\|net\|org\)\|invalid\|test\|localhost/);
  assert.match(sql, /PRODUCTION_IDENTITY_COMPLETE_APPROVED_ROSTER_REQUIRED/);
  assert.match(sql, /production_participant_one_open_email_claim_idx/);
  assert.match(sql, /user_player_links_auth_user_id_key|user_player_links/);
  assert.match(sql, /participant_auth_identifier_current_email_unique_idx|PRODUCTION_PARTICIPANT_IDENTITY_COLLISION/);
  assert.match(sql, /where email_identity_hash = email_hash and status = 'PENDING'/);
  assert.match(sql, /PRODUCTION_PARTICIPANT_FIRST_LOGIN_CLAIMED/);
  assert.match(sql, /rawIdentifierStoredInAudit', false/);
  assert.match(sql, /grant execute on function %s to service_role/);
  assert.match(sql, /revoke all on function %s from public, anon, authenticated, service_role/);
  assert.match(sql, /read_production_cutover_director_entitlement/);
  assert.match(sql, /assert_production_participant_identity_cutover\(\)/);
  assert.match(identityRpcSource, /read_production_director_entitlement:\s*"read_production_cutover_director_entitlement"/);
  assert.equal((sql.match(/lookup_cutover_receipt\('ACTIVATE_PARTICIPANT_IDENTITY'/g) || []).length, 2);
  assert.equal((sql.match(/lookup_cutover_receipt\('ROLLBACK_PARTICIPANT_IDENTITY'/g) || []).length, 2);
  assert.match(sql, /store_cutover_receipt\(\s*'ACTIVATE_PARTICIPANT_IDENTITY'/);
  assert.match(sql, /store_cutover_receipt\(\s*'ROLLBACK_PARTICIPANT_IDENTITY'/);
  assert.match(sql, /activation\.activation_revision <> expected_revision/);
  assert.match(sql, /activation_revision = activation_revision \+ 1/);
  assert.match(activationSql, /fingerprint !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(activationSql, /PRODUCTION_IDEMPOTENCY_CONFLICT/);
  assert.doesNotMatch(sql, /auth\.admin|createUser|signInWithOtp|preview_/i);
});
