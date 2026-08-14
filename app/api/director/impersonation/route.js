import { NextResponse } from "next/server";
import {
  createPlayerPassportSession,
  playerPassportCookie,
} from "../../../../lib/player-passport.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { getTournamentData } from "../../../live/sheetData.js";
import { beginPreviewIdentityImpersonation, endPreviewIdentityImpersonation } from "../../../../lib/participant-identity-supabase.js";

export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });

async function directorSession(request) {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const identity = await authorizePreviewDirector({ request, allowBootstrap: true });
  if (identity.status !== "active") return null;
  return { session: identity.identity.session, identity: identity.identity };
}

function remainingSessionSeconds(session) {
  return session.exp ? Math.max(0, Number(session.exp) - Math.floor(Date.now() / 1000)) : 4 * 60 * 60;
}

function sessionToken(session, impersonatedPlayerId = "", previewDirector = null, previewImpersonationLeaseId = "", maxAge = remainingSessionSeconds(session)) {
  return createPlayerPassportSession({
    playerId: session.playerId,
    tournamentId: session.tournamentId,
    deviceId: session.deviceId,
    sessionVersion: session.sessionVersion,
    impersonatedPlayerId,
    previewImpersonationLeaseId,
    previewDirector,
    expiresInSeconds: Math.min(remainingSessionSeconds(session), Math.max(0, Number(maxAge) || 0)),
  });
}

export async function POST(request) {
  const authorized = await directorSession(request);
  if (!authorized) return unavailable();
  const input = await request.json().catch(() => ({}));
  const playerId = String(input.playerId || "").trim();
  const data = await getTournamentData();
  const player = data.players?.find((item) => item.id === playerId);
  if (!player) return NextResponse.json({ error: "Select an active tournament player." }, { status: 400 });
  const lease = await beginPreviewIdentityImpersonation({
    tournament_id: authorized.session.tournamentId,
    director_player_id: authorized.session.playerId,
    director_auth_user_id: authorized.identity.authUserId,
    director_name: authorized.identity.actor?.name || "Tournament Director",
    target_player_id: player.id,
    lease_seconds: 4 * 60 * 60,
  });
  if (!lease.payload?.ok) return NextResponse.json({ error: "Preview impersonation is temporarily unavailable." }, { status: 503 });
  const leaseMaxAge = Math.max(0, Math.floor((Date.parse(lease.payload.expiresAt) - Date.now()) / 1000));
  if (!leaseMaxAge) return NextResponse.json({ error: "Preview impersonation is temporarily unavailable." }, { status: 503 });
  const response = NextResponse.json({ ok: true, player });
  response.cookies.set(playerPassportCookie(
    sessionToken(authorized.session, player.id, authorized.identity.actor, lease.payload.leaseId, leaseMaxAge),
    leaseMaxAge,
  ));
  return response;
}

export async function DELETE(request) {
  const authorized = await directorSession(request);
  if (!authorized) return unavailable();
  if (authorized.identity.impersonation?.leaseId) {
    await endPreviewIdentityImpersonation({
      lease_id: authorized.identity.impersonation.leaseId,
      revoked_by: authorized.session.playerId,
      reason: "DIRECTOR_ENDED",
    });
  }
  const response = NextResponse.json({ ok: true, player: authorized.identity.actor });
  response.cookies.set(playerPassportCookie("", 0));
  return response;
}
