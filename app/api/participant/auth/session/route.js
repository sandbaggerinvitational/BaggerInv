import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../../lib/participant-identity-authority.js";
import { readParticipantIdentityContextForAuth, recordSingleParticipantAuthLogout } from "../../../../../lib/participant-identity-supabase.js";
import { createParticipantAuthServerClient, verifyParticipantAuthClaims } from "../../../../../lib/supabase-auth-server.js";
import { playerPassportEffectivePlayerId, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../../lib/player-passport.js";
import { observeParticipantIdentityShadow } from "../../../../../lib/participant-identity-shadow.js";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request) {
  const authority = participantIdentityAuthorityEnvironment();
  if (!authority.authRehearsalEnabled) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const started = performance.now();
  const verified = await verifyParticipantAuthClaims(await cookies());
  if (verified.status !== "active") return NextResponse.json({ session: "inactive", identityAuthority: "passport" }, { headers });
  const context = await readParticipantIdentityContextForAuth({ authUserId: verified.claims.sub });
  if (!context.payload?.ok) return NextResponse.json({ session: "inactive", identityAuthority: "passport" }, { headers });
  let shadow = { status: "UNAVAILABLE", recorded: false };
  try {
    const passport = verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
    shadow = await observeParticipantIdentityShadow({
      authUserId: verified.claims.sub,
      tournamentId: context.payload.data.tournament.id,
      passportPlayerId: playerPassportEffectivePlayerId(passport),
    });
  } catch (error) {
    console.error("Single-participant Auth shadow observation unavailable", { message: error?.message || String(error) });
  }
  return NextResponse.json({ session: "active", identityAuthority: "passport", linkedPlayerId: context.payload.data.playerId,
    displayName: context.payload.data.displayName, shadowComparison: { status: shadow.status, recorded: shadow.recorded },
    verificationMs: Math.round(performance.now() - started) }, { headers });
}
export async function DELETE() {
  const authority = participantIdentityAuthorityEnvironment();
  if (!authority.authRehearsalEnabled) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const cookieStore = await cookies();
  const verified = await verifyParticipantAuthClaims(cookieStore);
  const client = createParticipantAuthServerClient(cookieStore);
  await client.auth.signOut({ scope: "global" });
  if (verified.status === "active") {
    const context = await readParticipantIdentityContextForAuth({ authUserId: verified.claims.sub }).catch(() => null);
    if (context?.payload?.ok) await recordSingleParticipantAuthLogout({ authUserId: verified.claims.sub, tournamentId: context.payload.data.tournament.id }).catch(() => null);
  }
  return NextResponse.json({ ok: true, session: "inactive", identityAuthority: "passport" }, { headers });
}
