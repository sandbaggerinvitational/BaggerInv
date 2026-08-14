import { requireParticipantIdentityAuthority } from "./participant-identity-authority.js";
import {
  hasPreviewImpersonationLease,
  isPreviewImpersonationSession,
  playerPassportTokenFromRequest,
  PREVIEW_IMPERSONATION_TOURNAMENT_ID,
  verifyPlayerPassportSession,
} from "./player-passport.js";
import {
  readParticipantIdentityContextForAuth,
  verifyPreviewIdentityImpersonation,
} from "./participant-identity-supabase.js";
import { verifyParticipantAuthClaims } from "./supabase-auth-server.js";

const clean = (value) => String(value ?? "").trim();

const STATUS_BY_CODE = Object.freeze({
  AUTH_SESSION_REQUIRED: 401,
  AUTH_SESSION_EXPIRED: 401,
  ACTIVE_USER_PLAYER_LINK_REQUIRED: 403,
  USER_PLAYER_LINK_SUSPENDED: 403,
  USER_PLAYER_LINK_REVOKED: 403,
  TOURNAMENT_MEMBERSHIP_INACTIVE: 403,
  APPROVED_TOURNAMENT_CONTEXT_REQUIRED: 403,
  WRONG_TOURNAMENT: 403,
  IMPERSONATION_LEASE_NOT_FOUND: 403,
  IMPERSONATION_LEASE_REVOKED: 403,
  IMPERSONATION_LEASE_EXPIRED: 403,
  IMPERSONATION_LEASE_MISMATCH: 403,
  IMPERSONATION_TARGET_INACTIVE: 403,
  IDENTITY_AUTHORITY_UNAVAILABLE: 503,
  PARTICIPANT_CONTEXT_UNAVAILABLE: 503,
});

export class ParticipantIdentityResolutionError extends Error {
  constructor(code, message = "Participant identity is unavailable.") {
    super(message);
    this.name = "ParticipantIdentityResolutionError";
    this.code = clean(code) || "PARTICIPANT_CONTEXT_UNAVAILABLE";
    this.status = STATUS_BY_CODE[this.code] || 503;
  }
}

export function participantIdentityPublicError(error) {
  const code = clean(error?.code) || "PARTICIPANT_CONTEXT_UNAVAILABLE";
  const status = Number(error?.status) || STATUS_BY_CODE[code] || 503;
  const message = status === 401 ? "Sign in to continue."
    : status === 403 ? "This participant account cannot access the tournament."
    : "Participant identity is temporarily unavailable.";
  return { code, status, message };
}

function passportToken(request, cookieStore) {
  if (request) return playerPassportTokenFromRequest(request);
  return cookieStore?.get?.("sbi-player-passport")?.value || "";
}

function contextResult(data, details = {}) {
  if (!data?.playerId || !data?.tournament?.id || data?.membership?.active !== true) {
    throw new ParticipantIdentityResolutionError("TOURNAMENT_MEMBERSHIP_INACTIVE");
  }
  return {
    identityAuthority: "supabase",
    playerId: clean(data.playerId),
    tournamentId: clean(data.tournament.id),
    displayName: clean(data.displayName || data.playerId),
    context: data,
    previewMode: details.previewMode === true,
    impersonation: details.impersonation || null,
    authUserId: details.authUserId || null,
    sessionStatus: details.previewMode ? "director-impersonation" : "active",
    googleRequests: 0,
    timings: details.timings || {},
  };
}

export async function resolveSupabaseParticipantIdentity({
  request,
  cookieStore,
  tournamentId,
  env = process.env,
  dependencies = {},
} = {}) {
  let authority;
  try { authority = requireParticipantIdentityAuthority(env); }
  catch (error) { throw new ParticipantIdentityResolutionError(error?.code || "IDENTITY_AUTHORITY_UNAVAILABLE"); }
  if (authority.resolved !== "supabase") {
    throw new ParticipantIdentityResolutionError("IDENTITY_AUTHORITY_UNAVAILABLE");
  }

  const verifyClaims = dependencies.verifyClaims || verifyParticipantAuthClaims;
  const readForAuth = dependencies.readForAuth || readParticipantIdentityContextForAuth;
  const verifyImpersonation = dependencies.verifyImpersonation || verifyPreviewIdentityImpersonation;
  const token = passportToken(request, cookieStore);
  if (token) {
    try {
      const signed = verifyPlayerPassportSession(token, dependencies.passportSecret);
      if (isPreviewImpersonationSession(signed)) {
        if (!hasPreviewImpersonationLease(signed)) {
          throw new ParticipantIdentityResolutionError("IMPERSONATION_LEASE_NOT_FOUND");
        }
        if (clean(signed.tournamentId) !== PREVIEW_IMPERSONATION_TOURNAMENT_ID) {
          throw new ParticipantIdentityResolutionError("WRONG_TOURNAMENT");
        }
        const verifiedDirectorAccount = await verifyClaims(cookieStore, env);
        if (verifiedDirectorAccount.status !== "active" || !verifiedDirectorAccount.claims?.sub) {
          throw new ParticipantIdentityResolutionError("AUTH_SESSION_REQUIRED");
        }
        const started = performance.now();
        const lease = await verifyImpersonation({
          leaseId: signed.previewImpersonationLeaseId,
          tournamentId: signed.tournamentId,
          directorPlayerId: signed.playerId,
          playerId: signed.impersonatedPlayerId,
          directorAuthUserId: verifiedDirectorAccount.claims.sub,
        }, dependencies.rpcOptions);
        const durationMs = performance.now() - started;
        if (!lease.payload?.ok) throw new ParticipantIdentityResolutionError(lease.payload?.code || "IMPERSONATION_LEASE_NOT_FOUND");
        return contextResult(lease.payload.context, {
          previewMode: true,
          authUserId: verifiedDirectorAccount.claims.sub,
          impersonation: {
            leaseId: clean(lease.payload.leaseId),
            expiresAt: lease.payload.expiresAt,
            targetPlayerId: clean(lease.payload.targetPlayerId),
            director: signed.previewDirector || { id: signed.playerId, role: "DIRECTOR" },
          },
          timings: { impersonationLeaseMs: durationMs, participantContextMs: durationMs },
        });
      }
    } catch (error) {
      if (error instanceof ParticipantIdentityResolutionError) throw error;
      // A normal or expired Passport cookie is never a participant-identity fallback.
    }
  }

  const sessionStarted = performance.now();
  const verified = await verifyClaims(cookieStore, env);
  const sessionVerificationMs = performance.now() - sessionStarted;
  if (verified.status !== "active" || !verified.claims?.sub) {
    throw new ParticipantIdentityResolutionError(
      /expired/i.test(clean(verified.error)) ? "AUTH_SESSION_EXPIRED" : "AUTH_SESSION_REQUIRED"
    );
  }
  const contextStarted = performance.now();
  const result = await readForAuth({ authUserId: verified.claims.sub, tournamentId }, dependencies.rpcOptions);
  const participantContextMs = performance.now() - contextStarted;
  if (!result.payload?.ok) {
    throw new ParticipantIdentityResolutionError(result.payload?.code || "PARTICIPANT_CONTEXT_UNAVAILABLE");
  }
  return contextResult(result.payload.data, {
    authUserId: verified.claims.sub,
    timings: {
      sessionVerificationMs,
      participantContextMs,
      totalIdentityMs: performance.now() - sessionStarted,
    },
  });
}
