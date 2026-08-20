import { createClient } from "@supabase/supabase-js";
import { readParticipantIdentityContextForAuth } from "./participant-identity-supabase.js";
import { participantAuthServerConfiguration } from "./supabase-auth-server.js";
import { MobileApiError, requireMobileApiAvailable } from "./mobile-api-v1.js";

const clean = (value) => String(value ?? "").trim();
const MAX_BEARER_TOKEN_LENGTH = 8_192;
const PARTICIPANT_DENIAL_CODES = new Set([
  "ACTIVE_USER_PLAYER_LINK_REQUIRED",
  "USER_PLAYER_LINK_SUSPENDED",
  "USER_PLAYER_LINK_REVOKED",
  "TOURNAMENT_MEMBERSHIP_INACTIVE",
  "APPROVED_TOURNAMENT_CONTEXT_REQUIRED",
  "WRONG_TOURNAMENT",
  "PARTICIPANT_CONTEXT_NOT_FOUND",
]);

export function mobileBearerTokenFromRequest(request) {
  const authorization = request?.headers?.get?.("authorization");
  if (!authorization) throw new MobileApiError("UNAUTHORIZED");
  const match = /^Bearer[\t ]+([^\s,]+)$/i.exec(authorization);
  const token = clean(match?.[1]);
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH) {
    throw new MobileApiError("UNAUTHORIZED");
  }
  return token;
}

export function createMobileSupabaseAuthClient(env = process.env) {
  const config = participantAuthServerConfiguration(env);
  if (!config.configured) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { "x-application-name": "bagger-mobile-api-v1" } },
  });
}

function unavailableAuthError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  return !status || status === 429 || status >= 500 || error?.name === "AuthRetryableFetchError";
}

export async function verifyMobileSupabaseAccessToken(token, {
  env = process.env,
  client,
} = {}) {
  try {
    const authClient = client || createMobileSupabaseAuthClient(env);
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user?.id) {
      return { status: unavailableAuthError(error) ? "unavailable" : "invalid", authUserId: null };
    }
    return { status: "active", authUserId: clean(data.user.id) };
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    return { status: "unavailable", authUserId: null };
  }
}

export async function resolveMobileBearerIdentity({
  request,
  tournamentId,
  env = process.env,
  dependencies = {},
} = {}) {
  requireMobileApiAvailable(env);
  const token = mobileBearerTokenFromRequest(request);
  const verifyAccessToken = dependencies.verifyAccessToken || verifyMobileSupabaseAccessToken;
  let verification;
  try {
    verification = await verifyAccessToken(token, { env, client: dependencies.authClient });
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  if (verification?.status === "unavailable") throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  const authUserId = clean(verification?.authUserId);
  if (verification?.status !== "active" || !authUserId) throw new MobileApiError("INVALID_TOKEN");

  const readForAuth = dependencies.readForAuth || readParticipantIdentityContextForAuth;
  let result;
  try {
    result = await readForAuth({ authUserId, tournamentId }, dependencies.rpcOptions);
  } catch {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  if (!result?.payload?.ok) {
    const code = clean(result?.payload?.code);
    throw new MobileApiError(PARTICIPANT_DENIAL_CODES.has(code) ? "PARTICIPANT_NOT_FOUND" : "MOBILE_API_UNAVAILABLE");
  }

  const context = result.payload.data || {};
  const returnedAuthUserId = clean(context.authUserId);
  const playerId = clean(context.playerId);
  const resolvedTournamentId = clean(context.tournament?.id);
  if (returnedAuthUserId !== authUserId || !playerId || !resolvedTournamentId || context.membership?.active !== true) {
    throw new MobileApiError(returnedAuthUserId !== authUserId
      ? "MOBILE_API_UNAVAILABLE"
      : "PARTICIPANT_NOT_FOUND");
  }

  return {
    authUserId,
    playerId,
    tournamentId: resolvedTournamentId,
    displayName: clean(context.displayName || playerId),
    context,
  };
}
