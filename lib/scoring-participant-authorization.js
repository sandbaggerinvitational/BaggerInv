import { authorizeMatchAccess, MATCH_ACCESS_ACTIONS } from "./match-authorization-supabase.js";
import { requireParticipantIdentityAuthority } from "./participant-identity-authority.js";
import { ParticipantIdentityResolutionError, resolveSupabaseParticipantIdentity } from "./participant-identity-resolver.js";
import { requireScoringAuthority } from "./scoring-authority.js";
import { readPreviewScoringParticipantContext } from "./scoring-authority-supabase.js";
import { validateParticipantSession as validateGoogleParticipantSession } from "./google-sheets-write.js";
import {
  authorizePreviewDirector,
  productionDirectorEntitlementEnvironment,
} from "./preview-director-authorization.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

function denied(code, message = "Scoring authorization is no longer valid.") {
  const error = new Error(message);
  error.code = code;
  error.status = 403;
  return error;
}

export async function validateAuthoritativeParticipantSession(request, session, {
  requireWritable = false,
  cookieStore,
  dependencies = {},
} = {}) {
  const env = dependencies.env || process.env;
  const identityAuthority = (dependencies.requireIdentityAuthority || requireParticipantIdentityAuthority)(env);
  const scoreAuthority = (dependencies.requireScoreAuthority || requireScoringAuthority)(env);
  if (scoreAuthority.resolved !== "supabase") {
    await (dependencies.validateGoogle || validateGoogleParticipantSession)(session, requireWritable ? { requireWritable: true } : undefined);
    return { identityAuthority: identityAuthority.resolved, scoringAuthority: "google", googleRequests: 1 };
  }

  if (session?.scope === "admin") {
    const productionRevalidationEnabled = clean(env.VERCEL_ENV).toLowerCase() === "production" &&
      truthy(env.PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED);
    if (!productionRevalidationEnabled) {
      return { identityAuthority: "director", scoringAuthority: "supabase", googleRequests: 0, writable: true };
    }
    const productionDirector = productionDirectorEntitlementEnvironment(env);
    if (!productionDirector.enabled) {
      throw denied("CURRENT_DIRECTOR_AUTH_REQUIRED", "A current Production Supabase Director session is required.");
    }
    const authorizeDirector = dependencies.authorizeDirector || authorizePreviewDirector;
    const director = await authorizeDirector({
      request,
      cookieStore,
      env,
      allowBootstrap: false,
      dependencies: dependencies.directorDependencies || {},
    });
    if (director?.status !== "active" || director.identity?.impersonating) {
      throw denied(
        director?.code === "DIRECTOR_ENTITLEMENT_REVOKED" ? "DIRECTOR_ENTITLEMENT_REVOKED" : "CURRENT_DIRECTOR_AUTH_REQUIRED",
        "A current Supabase Director session and entitlement are required for authoritative scoring.",
      );
    }
    const directorTournamentId = clean(director.identity?.tournamentId || director.identity?.session?.tournamentId);
    if (directorTournamentId !== "2026" || (clean(session.tournamentId) && clean(session.tournamentId) !== directorTournamentId)) {
      throw denied("DIRECTOR_TOURNAMENT_SCOPE_MISMATCH");
    }
    return {
      identityAuthority: "director",
      scoringAuthority: "supabase",
      googleRequests: 0,
      writable: true,
      director: {
        authUserId: clean(director.identity?.authUserId),
        playerId: clean(director.identity?.actor?.id),
        tournamentId: directorTournamentId,
        entitlementRevision: Number(director.identity?.session?.entitlementRevision || 0),
      },
    };
  }
  if (session?.scope !== "match" || !clean(session.matchId) || !clean(session.playerId)) throw denied("SCORING_SESSION_INVALID");
  if (identityAuthority.resolved === "supabase" && clean(session.identityAuthority).toLowerCase() !== "supabase") {
    throw denied("IDENTITY_AUTHORITY_BOUNDARY_MISMATCH", "Reopen this scorecard to refresh participant authorization.");
  }

  let identity = null;
  if (identityAuthority.resolved === "supabase") {
    identity = await (dependencies.resolveIdentity || resolveSupabaseParticipantIdentity)({
      request,
      cookieStore,
      env: dependencies.env || process.env,
      dependencies: dependencies.identityDependencies,
    });
    if (clean(identity.playerId) !== clean(session.playerId) || clean(identity.tournamentId) !== clean(session.tournamentId)) {
      throw new ParticipantIdentityResolutionError("ACTIVE_USER_PLAYER_LINK_REQUIRED");
    }
  }

  if (session.readOnly === true) {
    if (requireWritable) throw denied("MATCH_FINAL", "This final scorecard is read-only.");
    const authorized = await (dependencies.authorizeMatch || authorizeMatchAccess)({
      tournamentId: session.tournamentId,
      playerId: session.playerId,
      matchId: session.matchId,
      action: MATCH_ACCESS_ACTIONS.VIEW_FINAL_SCORECARD,
    });
    if (authorized.payload?.allowed !== true) throw denied(authorized.payload?.code || "AUTHORIZATION_UNAVAILABLE");
    return { identityAuthority: identityAuthority.resolved, scoringAuthority: "supabase", googleRequests: 0,
      writable: false, identity, authorization: authorized.payload };
  }

  const canonical = await (dependencies.readScoringContext || readPreviewScoringParticipantContext)({
    tournament_id: clean(session.tournamentId),
    match_id: clean(session.matchId),
    player_id: clean(session.playerId),
    auth_user_id: clean(identity?.authUserId),
    permission_revision: Number(session.accessVersion || 0),
    production_verified: identityAuthority.resolved === "supabase",
    passport_verified: identityAuthority.resolved !== "supabase",
    role: "PLAYER",
  });
  if (!canonical.payload?.ok || !canonical.payload?.data?.authorization?.verified) {
    throw denied(canonical.payload?.code || "SCORING_PERMISSION_REVOKED");
  }
  if (requireWritable && canonical.payload.data.authorization.writable !== true) {
    const match = canonical.payload.data.match || {};
    throw denied(clean(match.status).toUpperCase() === "FINAL" ? "MATCH_FINAL"
      : match.scoring_locked === true ? "MATCH_LOCKED" : "SCORING_PERMISSION_REVOKED");
  }
  return { identityAuthority: identityAuthority.resolved, scoringAuthority: "supabase", googleRequests: 0,
    writable: canonical.payload.data.authorization.writable === true, identity, authorization: canonical.payload.data.authorization,
    canonical: canonical.payload.data };
}
