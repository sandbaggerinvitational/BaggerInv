import "server-only";

import { createClient } from "@supabase/supabase-js";
import { dataAuthorityFetch } from "./data-authority-request.js";
import { assertParticipantIdentityAdministrativeEnvironment } from "./participant-identity-authority.js";
import { participantIdentityRpc } from "./participant-identity-supabase.js";
import { productionCutoverParticipantAuthTransport } from "./production-cutover-participant-auth-server.js";

const clean = (value) => String(value ?? "").trim();
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));

export function createProductionParticipantAuthAdminClient(env = process.env) {
  assertParticipantIdentityAdministrativeEnvironment(env, { operation: "PRODUCTION_AUTH_USER_ADMIN" });
  const transport = productionCutoverParticipantAuthTransport(env);
  return createClient(transport.url, transport.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: dataAuthorityFetch("supabase", { adapter: "production-participant-auth-admin" }),
      headers: { "x-application-name": "bagger-inv-production-controlled-first-login" },
    },
  });
}

async function identityRpc(functionName, input, env) {
  return participantIdentityRpc(functionName, { input }, { env });
}

async function safeCleanup({ claimId, authUserId, reason }, { env, rpc = identityRpc }) {
  if (!uuid(claimId)) return;
  await rpc("record_production_participant_first_login_cleanup", {
    claim_id: claimId,
    auth_user_id: uuid(authUserId) ? authUserId : null,
    safe_reason: reason,
  }, env).catch(() => null);
}

/**
 * Executes the only permitted first-login creation path. The database first
 * proves that the normalized identifier belongs to one active, approved
 * Production roster Player. Unknown/colliding identifiers never reach the
 * Auth Admin API and receive the same public response as any other rejection.
 */
export async function authorizeProductionParticipantEmailOtpEligibility(input, {
  env = process.env,
  rpc = identityRpc,
  adminClient = null,
} = {}) {
  let authorization;
  try {
    authorization = await rpc("authorize_production_participant_otp_request", input, env);
  } catch (error) {
    return { ok: false, authorization: null, diagnostics: {
      stage: "PRODUCTION_IDENTITY_AUTHORIZATION",
      status: Number(error?.status) || 0,
      databaseCode: clean(error?.identityDiagnostics?.code || error?.code),
    } };
  }
  let decision = authorization.payload || {};
  if (decision.provisioningRequired !== true) {
    return { ok: true, authorization, diagnostics: null };
  }

  const claimId = clean(decision.claimId);
  const playerId = clean(decision.playerId);
  const normalizedEmail = clean(decision.email).toLowerCase();
  const runtimeTournamentId = clean(
    authorization.productionRuntime?.tournamentId,
  );
  const frozen2026Runtime =
    authorization.productionRuntime?.futureGeneration === false &&
    runtimeTournamentId === "2026";
  const futureRuntime =
    authorization.productionRuntime?.futureGeneration === true &&
    /^\d{4}$/.test(runtimeTournamentId) &&
    Number(runtimeTournamentId) > 2026;
  const decisionTournamentId = clean(decision.tournamentId);
  const tournamentId = decisionTournamentId ||
    (frozen2026Runtime ? "2026" : "");
  if (!uuid(claimId) || !playerId || !normalizedEmail ||
      !/^\d{4}$/.test(tournamentId) || Number(tournamentId) < 2026 ||
      (!frozen2026Runtime && !futureRuntime) ||
      (futureRuntime && tournamentId !== runtimeTournamentId) ||
      (frozen2026Runtime && tournamentId !== "2026")) {
    return { ok: false, authorization: null, diagnostics: {
      stage: "PRODUCTION_IDENTITY_PROVISIONING",
      status: 503,
      databaseCode: "PRODUCTION_PARTICIPANT_ENROLLMENT_CLAIM_INVALID",
    } };
  }

  const client = adminClient || createProductionParticipantAuthAdminClient(env);
  let user = null;
  let created = false;
  const recoveryUserId = clean(decision.recoveryAuthUserId);
  try {
    if (uuid(recoveryUserId)) {
      const lookup = await client.auth.admin.getUserById(recoveryUserId);
      if (lookup.error || !lookup.data?.user) throw lookup.error || new Error("Enrollment recovery user is unavailable.");
      user = lookup.data.user;
    } else {
      const result = await client.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: false,
        app_metadata: {
          provisioning_scope: "production_controlled_first_login",
          player_id: playerId,
          tournament_id: tournamentId,
        },
        user_metadata: { player_id: playerId },
      });
      if (result.error || !result.data?.user) throw result.error || new Error("Approved Production Auth user was not created.");
      user = result.data.user;
      created = true;
    }

    await rpc("complete_production_participant_first_login", {
      claim_id: claimId,
      auth_user_id: user.id,
    }, env);
  } catch (error) {
    if (created && user?.id) {
      const deletion = await client.auth.admin.deleteUser(user.id).catch((deleteError) => ({ error: deleteError }));
      await safeCleanup({
        claimId,
        authUserId: user.id,
        reason: deletion?.error ? "AUTH_USER_DELETE_FAILED" : "AUTH_USER_DELETE_CONFIRMED",
      }, { env, rpc });
    } else {
      await safeCleanup({ claimId, authUserId: user?.id, reason: "AUTH_USER_PROVISIONING_FAILED" }, { env, rpc });
    }
    return { ok: false, authorization: null, diagnostics: {
      stage: "PRODUCTION_IDENTITY_PROVISIONING",
      status: Number(error?.status) || 503,
      databaseCode: clean(error?.code || error?.identityDiagnostics?.code || "PRODUCTION_PARTICIPANT_PROVISIONING_FAILED"),
    } };
  }

  try {
    authorization = await rpc("authorize_production_participant_otp_request", input, env);
    decision = authorization.payload || {};
    if (decision.allowed !== true || decision.provisioningRequired === true) throw new Error("Provisioned identity was not authorized.");
    return { ok: true, authorization, diagnostics: null };
  } catch (error) {
    return { ok: false, authorization: null, diagnostics: {
      stage: "PRODUCTION_IDENTITY_REAUTHORIZATION",
      status: Number(error?.status) || 503,
      databaseCode: clean(error?.code || error?.identityDiagnostics?.code || "PRODUCTION_PARTICIPANT_REAUTHORIZATION_FAILED"),
    } };
  }
}
