import { mobileNativeDevelopmentAuthorityEnvironment } from "./mobile-native-development-authority.js";

export const MOBILE_API_VERSION = "v1";
export const MOBILE_API_SERVICE = "bagger-mobile-api";

const clean = (value) => String(value ?? "").trim();

const ERROR_DEFINITIONS = Object.freeze({
  UNAUTHORIZED: Object.freeze({ status: 401, message: "Authentication required." }),
  INVALID_TOKEN: Object.freeze({ status: 401, message: "The access token is invalid or expired." }),
  PARTICIPANT_NOT_FOUND: Object.freeze({ status: 403, message: "An active Bagger participant identity is required." }),
  INVALID_AUTH_REQUEST: Object.freeze({ status: 400, message: "The authentication request is invalid." }),
  AUTH_METHOD_UNAVAILABLE: Object.freeze({ status: 409, message: "This authentication method is unavailable." }),
  AUTH_CERTIFICATION_FAILED: Object.freeze({ status: 403, message: "Authentication certification failed." }),
  MOBILE_API_UNAVAILABLE: Object.freeze({ status: 503, message: "The mobile API is unavailable in this environment." }),
  SCORING_UNAVAILABLE: Object.freeze({ status: 503, message: "Authoritative scoring is temporarily unavailable." }),
  MATCH_NOT_FOUND: Object.freeze({ status: 404, message: "The scoring match was not found." }),
  SCORING_NOT_AUTHORIZED: Object.freeze({ status: 403, message: "The authenticated Player is not authorized to score this match." }),
  SCORING_READ_ONLY: Object.freeze({ status: 409, message: "This match is currently read-only for scoring." }),
  INVALID_SCORE_INPUT: Object.freeze({ status: 400, message: "The score request is invalid." }),
  REVISION_CONFLICT: Object.freeze({ status: 409, message: "Official scoring state has changed." }),
  IDEMPOTENCY_CONFLICT: Object.freeze({ status: 409, message: "The mutation ID was already used for different scoring intent." }),
  FINALIZATION_NOT_READY: Object.freeze({ status: 409, message: "This match is not ready for finalization." }),
  MATCH_ALREADY_FINALIZED: Object.freeze({ status: 409, message: "This match is already finalized." }),
  INTERNAL_ERROR: Object.freeze({ status: 500, message: "The mobile API could not complete the request." }),
});

export const MOBILE_API_ERROR_CODES = Object.freeze(Object.keys(ERROR_DEFINITIONS));

export class MobileApiError extends Error {
  constructor(code, data = null) {
    const safeCode = Object.hasOwn(ERROR_DEFINITIONS, code) ? code : "INTERNAL_ERROR";
    super(ERROR_DEFINITIONS[safeCode].message);
    this.name = "MobileApiError";
    this.code = safeCode;
    this.status = ERROR_DEFINITIONS[safeCode].status;
    this.data = data && typeof data === "object" ? data : null;
  }
}

export function mobileApiEnvironment(env = process.env) {
  const authority = mobileNativeDevelopmentAuthorityEnvironment(env);
  return {
    environment: authority.environment,
    available: authority.available,
    identityAuthority: authority.identityAuthority,
    sameSupabaseAuthority: authority.sameSupabaseAuthority,
    authority: authority.authority,
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
  const data = error instanceof MobileApiError ? error.data : null;
  return {
    status: definition.status,
    body: {
      ok: false,
      apiVersion: MOBILE_API_VERSION,
      error: { code, message: definition.message },
      ...(data ? { data } : {}),
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
        authority: state.authority,
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
