import { authorizeMatchAccess, MATCH_ACCESS_ACTIONS } from "./match-authorization-supabase.js";
import { requireParticipantIdentityAuthority } from "./participant-identity-authority.js";
import { ParticipantIdentityResolutionError, resolveSupabaseParticipantIdentity } from "./participant-identity-resolver.js";
import { scoringAuthorityEnvironment } from "./scoring-authority.js";
import { readPreviewScoringParticipantContext } from "./scoring-authority-supabase.js";
import { validateParticipantSession as validateGoogleParticipantSession } from "./google-sheets-write.js";

const clean = (value) => String(value ?? "").trim();

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
  const identityAuthority = requireParticipantIdentityAuthority(dependencies.env || process.env);
  const scoreAuthority = scoringAuthorityEnvironment(dependencies.env || process.env);
  if (scoreAuthority.resolved !== "supabase") {
    await (dependencies.validateGoogle || validateGoogleParticipantSession)(session, requireWritable ? { requireWritable: true } : undefined);
    return { identityAuthority: identityAuthority.resolved, scoringAuthority: "google", googleRequests: 1 };
  }

  if (session?.scope === "admin") {
    return { identityAuthority: "director", scoringAuthority: "supabase", googleRequests: 0, writable: true };
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
    permission_revision: Number(session.accessVersion || 0),
    passport_verified: true,
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
