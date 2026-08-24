import "server-only";
import { createClient } from "@supabase/supabase-js";
import { assertParticipantIdentityAdministrativeEnvironment } from "./participant-identity-authority.js";
import { dataAuthorityFetch } from "./data-authority-request.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";
import { productionAuthPreprovisionEvidence } from "./production-auth-preprovision-contract.js";
import { productionShadowCandidateServerTransport } from "./production-shadow-candidate-server.js";

const enabled = (value) => /^(?:1|true|yes|on|enabled)$/i.test(String(value ?? "").trim());

export function createParticipantAuthAdminClient(env = process.env) {
  assertParticipantIdentityAdministrativeEnvironment(env);
  const url = String(env.SUPABASE_SCORING_MIRROR_URL || "").trim();
  const secret = String(env.SUPABASE_SCORING_MIRROR_SECRET_KEY || "").trim();
  if (!url || !secret) throw new Error("Participant Auth administration is not configured.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: dataAuthorityFetch("supabase", { adapter: "supabase-auth-admin" }), headers: { "x-application-name": "bagger-inv-preview-participant-auth" } },
  });
}

export function createProductionCandidateAuthAdminClient(env = process.env) {
  assertParticipantIdentityAdministrativeEnvironment(env, { operation: "PRODUCTION_AUTH_USER_ADMIN" });
  if (!enabled(env.PRODUCTION_SHADOW_CANDIDATE_AUTH_PROVISIONING_ENABLED)) {
    const error = new Error("Production-shadow Auth provisioning is disabled.");
    error.code = "PRODUCTION_SHADOW_AUTH_PROVISIONING_DISABLED";
    throw error;
  }
  const transport = productionShadowCandidateServerTransport(env);
  return createClient(transport.url, transport.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: dataAuthorityFetch("supabase", { adapter: "production-shadow-auth-admin" }),
      headers: { "x-application-name": "bagger-inv-production-shadow-auth" },
    },
  });
}

export function createParticipantAuthOtpClient(env = process.env) {
  assertParticipantIdentityAdministrativeEnvironment(env);
  const url = String(env.NEXT_PUBLIC_SUPABASE_AUTH_URL || "").trim();
  const publishableKey = String(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY || "").trim();
  if (!url || !publishableKey) throw new Error("Participant phone OTP is not configured.");
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: dataAuthorityFetch("supabase", { adapter: "supabase-auth-otp" }), headers: { "x-application-name": "bagger-inv-preview-director-phone-otp" } },
  });
}

export async function listAllAuthUsers(client, { maxPages = 100 } = {}) {
  const users = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const pageUsers = data?.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < 100) return users;
  }
  const error = new Error("Production Auth user inventory exceeded the bounded collision check.");
  error.code = "PRODUCTION_AUTH_USER_INVENTORY_UNBOUNDED";
  throw error;
}

export async function findAuthUserByEmail(client, email) {
  const normalized = String(email || "").trim().toLowerCase();
  const users = await listAllAuthUsers(client);
  return users.find((entry) => String(entry.email || "").trim().toLowerCase() === normalized) || null;
}

export async function provisionApprovedAuthUser({ email, playerId, tournamentId }, { client = createParticipantAuthAdminClient() } = {}) {
  const existing = await findAuthUserByEmail(client, email);
  if (existing) return { user: existing, created: false };
  const { data, error } = await client.auth.admin.createUser({
    email,
    // The Director-approved Player ID/email mapping establishes account ownership.
    // Authentication still requires the participant's emailed one-time code.
    email_confirm: true,
    app_metadata: { provisioning_scope: "preview_phase_a_single_player", player_id: playerId, tournament_id: tournamentId },
    user_metadata: { player_id: playerId },
  });
  if (error || !data?.user) throw error || new Error("Supabase Auth user provisioning did not return a user.");
  return { user: data.user, created: true };
}

export async function provisionProductionCandidateAuthUser(
  { email, playerId, tournamentId, sourceFingerprint, identitySourceFingerprint },
  { client = createProductionCandidateAuthAdminClient() } = {},
) {
  const normalized = String(email || "").trim().toLowerCase();
  const evidence = productionAuthPreprovisionEvidence({
    email: normalized,
    playerId,
    tournamentId,
    sourceFingerprint,
    identitySourceFingerprint,
  });
  const claimResult = await productionAuthAdminRpc(
    client,
    "claim_production_auth_candidate_preprovision",
    evidence.claimInput,
  );
  const claimId = String(claimResult?.claimId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(claimId)) {
    const error = new Error("Production Auth preprovisioning did not return a bounded claim.");
    error.code = "PRODUCTION_AUTH_PREPROVISION_CLAIM_REQUIRED";
    throw error;
  }

  const existingUsers = await listAllAuthUsers(client);
  if (existingUsers.length > 1) throw productionAuthCollisionError();
  let user = existingUsers[0] || null;
  let created = false;
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email: normalized,
      email_confirm: false,
      app_metadata: {
        provisioning_scope: "production_shadow_director_certification",
        player_id: playerId,
        tournament_id: tournamentId,
      },
      user_metadata: { player_id: playerId },
    });
    if (error || !data?.user) {
      await productionAuthAdminRpc(client, "record_production_auth_candidate_preprovision_cleanup", {
        claim_id: claimId,
        auth_user_id: null,
        cleanup_succeeded: true,
        safe_reason: "AUTH_USER_CREATION_FAILED",
      }).catch(() => null);
      throw error || new Error("Production-shadow Auth provisioning did not return a user.");
    }
    user = data.user;
    created = true;
  }

  try {
    user = assertProductionCandidateAuthUser({ user, email: normalized, playerId, tournamentId });
    const prepared = await productionAuthAdminRpc(client, "prepare_production_auth_candidate", {
      claim_id: claimId,
      auth_user_id: user.id,
      tournament_id: tournamentId,
      project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
      project_url: PRODUCTION_SUPABASE_URL,
      source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    });
    return { user, created, claimId, prepared };
  } catch (error) {
    if (!created) throw error;
    const { error: deleteError } = await client.auth.admin.deleteUser(user.id);
    const cleanupSucceeded = !deleteError;
    await productionAuthAdminRpc(client, "record_production_auth_candidate_preprovision_cleanup", {
      claim_id: claimId,
      auth_user_id: user.id,
      cleanup_succeeded: cleanupSucceeded,
      safe_reason: cleanupSucceeded ? "AUTH_USER_DELETE_CONFIRMED" : "AUTH_USER_DELETE_FAILED",
    }).catch(() => null);
    if (deleteError) {
      error.code = "PRODUCTION_AUTH_PREPROVISION_CLEANUP_REQUIRED";
      error.cleanupRequired = true;
    }
    throw error;
  }
}

function productionAuthCollisionError() {
  const error = new Error("Production Auth already contains a different user; provisioning is blocked.");
  error.code = "PRODUCTION_AUTH_USER_COLLISION";
  return error;
}

async function productionAuthAdminRpc(client, functionName, input) {
  const { data, error } = await client.rpc(functionName, { input });
  if (error) throw error;
  if (data?.ok !== true) {
    const failure = new Error("Production Auth preprovisioning failed closed.");
    failure.code = data?.code || "PRODUCTION_AUTH_PREPROVISION_FAILED";
    throw failure;
  }
  return data;
}

export function assertProductionCandidateAuthUser({ user, email, playerId, tournamentId }) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!user?.id || String(user.email || "").trim().toLowerCase() !== normalized ||
      user.app_metadata?.provisioning_scope !== "production_shadow_director_certification" ||
      String(user.app_metadata?.player_id || "") !== String(playerId || "") ||
      String(user.app_metadata?.tournament_id || "") !== String(tournamentId || "")) {
    const error = new Error("Production Auth user does not match the approved certification identity.");
    error.code = "PRODUCTION_AUTH_USER_SCOPE_MISMATCH";
    throw error;
  }
  return user;
}

export function safeParticipantAuthUserState(user) {
  return {
    exists: Boolean(user?.id),
    emailConfirmed: Boolean(user?.email_confirmed_at),
    emailConfirmedAt: user?.email_confirmed_at || null,
    lastSignInAt: user?.last_sign_in_at || null,
  };
}

export function assertApprovedParticipantAuthUser({ user, candidate, tournamentId }) {
  const normalized = String(user?.email || "").trim().toLowerCase();
  if (!user?.id || normalized !== String(candidate?.emailNormalized || "").trim().toLowerCase()) {
    throw new Error("The provisioned Auth user does not match the approved participant email.");
  }
  if (user.app_metadata?.provisioning_scope !== "preview_phase_a_single_player" ||
      String(user.app_metadata?.player_id || "") !== String(candidate?.playerId || "") ||
      String(user.app_metadata?.tournament_id || "") !== String(tournamentId || "")) {
    throw new Error("The provisioned Auth user is outside the approved single-player rehearsal scope.");
  }
  return user;
}
