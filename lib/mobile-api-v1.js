import { participantIdentityAuthorityEnvironment } from "./participant-identity-authority.js";

export const MOBILE_API_VERSION = "v1";
export const MOBILE_API_SERVICE = "bagger-mobile-api";

const clean = (value) => String(value ?? "").trim();

function origin(value) {
  try { return new URL(clean(value)).origin.toLowerCase(); }
  catch { return ""; }
}

const ERROR_DEFINITIONS = Object.freeze({
  UNAUTHORIZED: Object.freeze({ status: 401, message: "Authentication required." }),
  INVALID_TOKEN: Object.freeze({ status: 401, message: "The access token is invalid or expired." }),
  PARTICIPANT_NOT_FOUND: Object.freeze({ status: 403, message: "An active Bagger participant identity is required." }),
  MOBILE_API_UNAVAILABLE: Object.freeze({ status: 503, message: "The mobile API is unavailable in this environment." }),
  INTERNAL_ERROR: Object.freeze({ status: 500, message: "The mobile API could not complete the request." }),
});

export const MOBILE_API_ERROR_CODES = Object.freeze(Object.keys(ERROR_DEFINITIONS));

export class MobileApiError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(ERROR_DEFINITIONS, code) ? code : "INTERNAL_ERROR";
    super(ERROR_DEFINITIONS[safeCode].message);
    this.name = "MobileApiError";
    this.code = safeCode;
    this.status = ERROR_DEFINITIONS[safeCode].status;
  }
}

export function mobileApiEnvironment(env = process.env) {
  const runtime = clean(env.VERCEL_ENV).toLowerCase();
  const environment = runtime === "preview" ? "preview"
    : runtime === "production" ? "production"
    : "development";
  const identity = participantIdentityAuthorityEnvironment(env);
  const authOrigin = origin(env.NEXT_PUBLIC_SUPABASE_AUTH_URL);
  const identityOrigin = origin(env.SUPABASE_SCORING_MIRROR_URL);
  const sameSupabaseAuthority = Boolean(authOrigin) && authOrigin === identityOrigin;
  return {
    environment,
    available: environment === "preview" && identity.resolved === "supabase" && sameSupabaseAuthority,
    identityAuthority: identity.resolved,
    sameSupabaseAuthority,
  };
}

export function requireMobileApiAvailable(env = process.env) {
  const state = mobileApiEnvironment(env);
  if (!state.available) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  return state;
}

export function mobileApiErrorResult(error) {
  const code = error instanceof MobileApiError && Object.hasOwn(ERROR_DEFINITIONS, error.code)
    ? error.code
    : "INTERNAL_ERROR";
  const definition = ERROR_DEFINITIONS[code];
  return {
    status: definition.status,
    body: {
      ok: false,
      apiVersion: MOBILE_API_VERSION,
      error: { code, message: definition.message },
    },
  };
}

export function mobileHealthResult(env = process.env) {
  try {
    const state = requireMobileApiAvailable(env);
    return {
      status: 200,
      body: {
        ok: true,
        apiVersion: MOBILE_API_VERSION,
        service: MOBILE_API_SERVICE,
        environment: state.environment,
      },
    };
  } catch (error) {
    return mobileApiErrorResult(error);
  }
}

export function mobileSessionData(identity) {
  const context = identity?.context || {};
  const playerId = clean(identity?.playerId || context.playerId);
  const displayName = clean(identity?.displayName || context.displayName || playerId);
  const tournamentId = clean(identity?.tournamentId || context.tournament?.id);
  if (!playerId || !tournamentId || context.membership?.active !== true) {
    throw new MobileApiError("PARTICIPANT_NOT_FOUND");
  }

  const teamId = clean(context.team?.id);
  const tournamentYearValue = clean(context.tournament?.year);
  const tournamentYear = Number(tournamentYearValue);
  return {
    player: {
      playerId,
      displayName,
      team: teamId ? {
        teamId,
        name: clean(context.team?.name || teamId),
      } : null,
    },
    tournament: {
      tournamentId,
      name: clean(context.tournament?.name || tournamentId),
      year: tournamentYearValue && Number.isInteger(tournamentYear) ? tournamentYear : null,
    },
  };
}

export function mobileSessionResult(identity) {
  return {
    status: 200,
    body: {
      ok: true,
      apiVersion: MOBILE_API_VERSION,
      data: mobileSessionData(identity),
    },
  };
}
