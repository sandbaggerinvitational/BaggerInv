import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { authorizeParticipantEmailOtpEligibility } from "../lib/participant-email-otp-authorization.js";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240014_production_auth_otp_request_fix.sql",
  import.meta.url,
);
const routeUrl = new URL("../app/api/participant/auth/otp/request/route.js", import.meta.url);

test("Production OTP eligibility fix removes the PL/pgSQL contact-name collision", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.authorize_production_auth_candidate_otp_request\(input jsonb\)/);
  assert.match(sql, /participant_identity\.participant_identity_contacts approved_contact/);
  assert.match(sql, /approved_contact\.tournament_id = c\.tournament_id/);
  assert.match(sql, /'email', case when allowed then normalized else null end/);
  assert.doesNotMatch(sql, /declare resolved_contact/);
  assert.doesNotMatch(sql, /declare contact participant_identity\.participant_identity_contacts%rowtype/);
  assert.doesNotMatch(sql, /participant_identity\.participant_identity_contacts contact\b/);
});

test("Production OTP eligibility fix preserves dormant scope, durable limits, and private grants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /production_control\.assert_production_auth_candidate_rpc\(\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*least\('client:' \|\| client_hash, 'email:' \|\| email_hash\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*greatest\('client:' \|\| client_hash, 'email:' \|\| email_hash\)/);
  assert.match(sql, /participant_auth_otp_attempts/);
  assert.match(sql, /status in \('AUTHORIZED', 'SENT'\)[\s\S]*interval '60 seconds'/);
  assert.match(sql, /revoke all on function public\.authorize_production_auth_candidate_otp_request\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.authorize_production_auth_candidate_otp_request\(jsonb\)[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]+to (?:anon|authenticated)/i);
  assert.doesNotMatch(sql, /signInWithOtp|smtp|resend|google/i);
});

test("email OTP route fails closed with valid JSON before any Auth send when identity authorization is unavailable", async () => {
  const route = await readFile(routeUrl, "utf8");
  const authorizationStart = route.indexOf("const eligibility = authority.productionCutoverIdentity");
  const authSend = route.indexOf("requestParticipantEmailOtp(client");
  assert.ok(authorizationStart >= 0 && authSend > authorizationStart);
  const authorizationBlock = route.slice(authorizationStart, authSend);
  assert.match(authorizationBlock, /authorizeParticipantEmailOtpEligibility/);
  assert.match(authorizationBlock, /if \(!eligibility\.ok\)/);
  assert.match(authorizationBlock, /if \(decision\.allowed !== true\) return enumerationSafeRequestResponse/);
  assert.match(authorizationBlock, /category: "EMAIL_UNAVAILABLE"/);
  assert.match(authorizationBlock, /}, 503\)/);
  assert.doesNotMatch(authorizationBlock, /identityDiagnostics|diagnostics\.message|diagnostics\.details/);
});

test("executable eligibility seam keeps provider sends at zero for RPC failure and unknown identifiers", async () => {
  let providerSendCount = 0;
  const sendProvider = () => { providerSendCount += 1; };
  const failed = await authorizeParticipantEmailOtpEligibility({ email: "approved@example.com" }, {
    authorize: async () => {
      const error = new Error("database details remain private");
      error.status = 400;
      error.identityDiagnostics = {
        functionName: "authorize_production_auth_candidate_otp_request",
        code: "42702",
        message: "private database detail",
      };
      throw error;
    },
  });
  if (failed.ok && failed.authorization?.payload?.allowed === true) sendProvider();
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.diagnostics, {
    stage: "IDENTITY_AUTHORIZATION",
    status: 400,
    functionName: "authorize_production_auth_candidate_otp_request",
    databaseCode: "42702",
  });
  assert.equal(providerSendCount, 0);

  const unknown = await authorizeParticipantEmailOtpEligibility({ email: "unknown@example.com" }, {
    authorize: async () => ({ payload: { ok: true, allowed: false, requestId: "request-1" } }),
  });
  if (unknown.ok && unknown.authorization?.payload?.allowed === true) sendProvider();
  assert.equal(unknown.ok, true);
  assert.equal(unknown.authorization.payload.allowed, false);
  assert.equal(providerSendCount, 0);
});
