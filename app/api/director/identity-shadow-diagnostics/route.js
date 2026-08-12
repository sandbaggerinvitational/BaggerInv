import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";
import { assertParticipantIdentityAdministrativeEnvironment } from "../../../../lib/participant-identity-authority.js";
import { readParticipantIdentityShadowDiagnostics } from "../../../../lib/participant-identity-supabase.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  try { assertParticipantIdentityAdministrativeEnvironment(); }
  catch { return NextResponse.json({ error: "Not found." }, { status: 404 }); }
  const authorization = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  if (authorization.status !== "active") return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
  const tournamentId = String(request.nextUrl.searchParams.get("tournamentId") || "2026").trim();
  const diagnostics = await readParticipantIdentityShadowDiagnostics(tournamentId);
  return NextResponse.json(diagnostics.payload, { headers: { "Cache-Control": "private, no-store" } });
}
