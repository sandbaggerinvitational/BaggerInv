import { randomUUID } from "node:crypto";
import { compareParticipantIdentityContexts } from "./participant-identity.js";
import {
  isSingleParticipantAuthShadowEnabled,
  readParticipantIdentityContext,
  readParticipantIdentityContextForAuth,
  recordParticipantIdentityShadowObservation,
} from "./participant-identity-supabase.js";

export function comparableParticipantIdentityContext(context = {}) {
  return {
    playerId: context.playerId || "",
    tournamentId: context.tournament?.id || "",
    teamId: context.team?.id || "",
    membershipActive: context.membership?.active === true,
    matchIds: (context.matches || []).map((match) => match.matchId),
    scoringPermissions: Object.fromEntries((context.matches || []).map((match) => [match.matchId, {
      canScore: match.canScore === true,
      permissionRevision: Number(match.permissionRevision || 0),
    }])),
    contextRevision: Number(context.contextRevision || 0),
  };
}

export async function observeParticipantIdentityShadow({ authUserId, tournamentId, passportPlayerId, passportContext } = {}) {
  const scoped = await isSingleParticipantAuthShadowEnabled({ authUserId, tournamentId });
  if (scoped.payload !== true) return { status: "UNAVAILABLE", recorded: false, reason: "single-participant-shadow-not-enabled" };
  const [passportResult, authResult] = await Promise.all([
    passportContext ? Promise.resolve({ payload: { ok: true, data: passportContext } })
      : readParticipantIdentityContext({ tournamentId, playerId: passportPlayerId }),
    readParticipantIdentityContextForAuth({ authUserId, tournamentId }),
  ]);
  if (!passportResult.payload?.ok || !authResult.payload?.ok) {
    return { status: "UNAVAILABLE", recorded: false, reason: "participant-context-unavailable" };
  }
  const passport = comparableParticipantIdentityContext(passportResult.payload.data);
  const auth = comparableParticipantIdentityContext(authResult.payload.data);
  const comparison = compareParticipantIdentityContexts({ passport, auth });
  const recorded = await recordParticipantIdentityShadowObservation({
    request_id: randomUUID(),
    tournament_id: tournamentId,
    auth_user_id: authUserId,
    passport_player_id: passport.playerId,
    linked_player_id: auth.playerId,
    passport_team_id: passport.teamId,
    linked_team_id: auth.teamId,
    passport_membership_active: passport.membershipActive,
    linked_membership_active: auth.membershipActive,
    passport_match_ids: passport.matchIds,
    linked_match_ids: auth.matchIds,
    passport_scoring_permissions: passport.scoringPermissions,
    linked_scoring_permissions: auth.scoringPermissions,
    passport_context_revision: passport.contextRevision,
    linked_context_revision: auth.contextRevision,
    comparison_status: comparison.status,
    comparison_diagnostics: comparison.diagnostics,
  });
  return {
    status: comparison.status,
    diagnostics: comparison.diagnostics,
    recorded: recorded.payload?.created === true,
    observationId: recorded.payload?.observationId || null,
    linkedPlayerId: auth.playerId,
  };
}
