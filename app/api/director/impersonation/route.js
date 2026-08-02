import { NextResponse } from "next/server";
import { createPlayerPassportSession, playerPassportCookie, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../../lib/player-passport-server.js";
import { isTournamentDirectorActor } from "../../../../lib/player-role.js";
import { getTournamentData } from "../../../live/sheetData.js";

export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });

async function directorSession(request) {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const token = playerPassportTokenFromRequest(request);
  const identity = await inspectPlayerPassportToken(token);
  if (identity.status !== "active" || !isTournamentDirectorActor(identity.identity)) return null;
  return { session: verifyPlayerPassportSession(token), identity: identity.identity };
}

function sessionToken(session, impersonatedPlayerId = "") {
  return createPlayerPassportSession({
    playerId: session.playerId,
    tournamentId: session.tournamentId,
    deviceId: session.deviceId,
    sessionVersion: session.sessionVersion,
    impersonatedPlayerId,
    expiresInSeconds: Math.max(3600, Number(session.exp || 0) - Math.floor(Date.now() / 1000)),
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
  const response = NextResponse.json({ ok: true, player });
  response.cookies.set(playerPassportCookie(sessionToken(authorized.session, player.id)));
  return response;
}

export async function DELETE(request) {
  const authorized = await directorSession(request);
  if (!authorized) return unavailable();
  const response = NextResponse.json({ ok: true, player: authorized.identity.actor });
  response.cookies.set(playerPassportCookie(sessionToken(authorized.session)));
  return response;
}
