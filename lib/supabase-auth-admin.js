import "server-only";
import { createClient } from "@supabase/supabase-js";
import { assertParticipantIdentityAdministrativeEnvironment } from "./participant-identity-authority.js";

export function createParticipantAuthAdminClient(env = process.env) {
  assertParticipantIdentityAdministrativeEnvironment(env);
  const url = String(env.SUPABASE_SCORING_MIRROR_URL || "").trim();
  const secret = String(env.SUPABASE_SCORING_MIRROR_SECRET_KEY || "").trim();
  if (!url || !secret) throw new Error("Participant Auth administration is not configured.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "bagger-inv-preview-participant-auth" } },
  });
}

export async function findAuthUserByEmail(client, email) {
  const normalized = String(email || "").trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = (data?.users || []).find((entry) => String(entry.email || "").trim().toLowerCase() === normalized);
    if (user) return user;
    if ((data?.users || []).length < 100) break;
  }
  return null;
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
