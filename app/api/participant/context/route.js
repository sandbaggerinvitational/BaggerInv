import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../lib/participant-identity-authority.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../../lib/player-passport-server.js";
import { compareParticipantIdentityContexts } from "../../../../lib/participant-identity.js";
import { isSingleParticipantAuthShadowEnabled, readParticipantIdentityContext, readParticipantIdentityContextForAuth, recordParticipantIdentityShadowObservation } from "../../../../lib/participant-identity-supabase.js";
import { verifyParticipantAuthClaims } from "../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";

function response(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}
function comparable(context = {}) {
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
  };
}

async function passportShadowDiagnostics({ authority, passportContext, tournamentId }) {
  const timings = {};
  if (!authority.authRehearsalEnabled || !authority.publicAuthConfigured) {
    return { supabaseAuth: { sessionPresent: false, linkedPlayerId: null }, shadowComparison: { status: "UNAVAILABLE" }, timings };
  }
  try {
    const sessionStarted = performance.now();
    const verified = await verifyParticipantAuthClaims(await cookies());
    timings.supabaseSessionVerificationMs = Math.round(performance.now() - sessionStarted);
    if (verified.status !== "active") return { supabaseAuth: { sessionPresent: false, linkedPlayerId: null }, shadowComparison: { status: "UNAVAILABLE" }, timings };
    const contextStarted = performance.now();
    const authResult = await readParticipantIdentityContextForAuth({ authUserId: verified.claims.sub, tournamentId });
    timings.supabaseLinkedContextMs = Math.round(performance.now() - contextStarted);
    if (!authResult.payload?.ok) return { supabaseAuth: { sessionPresent: true, linkedPlayerId: null }, shadowComparison: { status: "UNAVAILABLE" }, timings };
    const scoped = await isSingleParticipantAuthShadowEnabled({ authUserId: verified.claims.sub, tournamentId });
    if (scoped.payload !== true) return { supabaseAuth: { sessionPresent: true, linkedPlayerId: authResult.payload.data.playerId }, shadowComparison: { status: "UNAVAILABLE" }, timings };
    const passport = comparable(passportContext);
    const auth = comparable(authResult.payload.data);
    const comparison = compareParticipantIdentityContexts({ passport, auth });
    const recordStarted = performance.now();
    await recordParticipantIdentityShadowObservation({
      request_id: randomUUID(), tournament_id: tournamentId, auth_user_id: verified.claims.sub,
      passport_player_id: passport.playerId, linked_player_id: auth.playerId,
      passport_team_id: passport.teamId, linked_team_id: auth.teamId,
      passport_membership_active: passport.membershipActive, linked_membership_active: auth.membershipActive,
      passport_match_ids: passport.matchIds, linked_match_ids: auth.matchIds,
      passport_scoring_permissions: passport.scoringPermissions, linked_scoring_permissions: auth.scoringPermissions,
      comparison_status: comparison.status, comparison_diagnostics: comparison.diagnostics,
    });
    timings.shadowObservationMs = Math.round(performance.now() - recordStarted);
    return { supabaseAuth: { sessionPresent: true, linkedPlayerId: auth.playerId },
      shadowComparison: { status: comparison.status, diagnostics: comparison.diagnostics }, timings };
  } catch (error) {
    console.error("Participant Auth shadow comparison unavailable", { message: error?.message || String(error) });
    return { supabaseAuth: { sessionPresent: false, linkedPlayerId: null }, shadowComparison: { status: "UNAVAILABLE" }, timings };
  }
}
export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return response({ error: "Not found." }, 404);
  const authority = participantIdentityAuthorityEnvironment();
  try {
    if (authority.resolved === "supabase") {
      const verified = await verifyParticipantAuthClaims(await cookies());
      if (verified.status !== "active") return response({ identityAuthority: "supabase", session: { status: verified.status }, error: "Participant session is not active." }, 401);
      const result = await readParticipantIdentityContextForAuth({ authUserId: verified.claims.sub });
      if (!result.payload?.ok) return response({ identityAuthority: "supabase", session: { status: "active" }, error: result.payload?.code || "Participant context is unavailable." }, 403);
      return response({ identityAuthority: "supabase", session: { status: "active" }, ...result.payload.data });
    }

    const token = playerPassportTokenFromRequest(request);
    let signed;
    try { signed = verifyPlayerPassportSession(token); }
    catch { return response({ identityAuthority: "passport", session: { status: "inactive" }, error: "Player Passport is not active." }, 401); }
    const passportStarted = performance.now();
    const verified = await inspectPlayerPassportToken(token);
    const passportVerificationMs = Math.round(performance.now() - passportStarted);
    if (verified.status === "unavailable") return response({ identityAuthority: "passport", session: { status: "unavailable" }, error: "Participant context is temporarily unavailable." }, 503);
    if (verified.status !== "active") return response({ identityAuthority: "passport", session: { status: "inactive" }, error: "Player Passport is not active." }, 401);
    const playerId = verified.identity?.player?.id || signed.playerId;
    const contextStarted = performance.now();
    const result = await readParticipantIdentityContext({ tournamentId: signed.tournamentId, playerId });
    const passportContextMs = Math.round(performance.now() - contextStarted);
    if (!result.payload?.ok) return response({ identityAuthority: "passport", session: { status: "active" }, error: result.payload?.code || "Participant context is unavailable." }, 404);
    const shadow = await passportShadowDiagnostics({ authority, passportContext: result.payload.data, tournamentId: signed.tournamentId });
    return response({ identityAuthority: "passport", session: { status: "active" }, ...result.payload.data,
      supabaseAuth: shadow.supabaseAuth, shadowComparison: shadow.shadowComparison,
      identityTimings: { passportVerificationMs, passportContextMs, ...shadow.timings } });
  } catch (error) {
    console.error("Participant context foundation failed", { authority: authority.resolved, message: error?.message || String(error) });
    return response({ identityAuthority: authority.resolved, session: { status: "unavailable" }, error: "Participant context is temporarily unavailable." }, 503);
  }
}
