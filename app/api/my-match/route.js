import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initializeParticipantTournament } from "../../../lib/participant-initialization.js";
import { participantIdentityAuthorityEnvironment } from "../../../lib/participant-identity-authority.js";
import { observeParticipantIdentityShadow } from "../../../lib/participant-identity-shadow.js";
import { requireMyMatchReadSource } from "../../../lib/my-match-read-source.js";
import { myMatchDataFromSupabaseView, readMyMatchView } from "../../../lib/my-match-supabase.js";
import {
  isPreviewImpersonationSession,
  playerPassportEffectivePlayerId,
  playerPassportTokenFromRequest,
  verifyPlayerPassportSession,
} from "../../../lib/player-passport.js";
import { verifyParticipantAuthClaims } from "../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

function safeError(status = 503) {
  return NextResponse.json({
    active: status === 401 ? false : null,
    initializing: status !== 401,
    error: status === 401 ? "Player Passport is not active." : "My Match is temporarily unavailable.",
  }, { status, headers: privateHeaders });
}

export async function GET(request) {
  const requestStartedAt = performance.now();
  let session;
  try { session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request)); }
  catch { return safeError(401); }
  const sessionValidationMs = performance.now() - requestStartedAt;
  const source = requireMyMatchReadSource();

  try {
    if (source.resolved === "google") {
      const initialized = await initializeParticipantTournament(session);
      const totalMs = performance.now() - requestStartedAt;
      return NextResponse.json({
        active: true,
        previewMode: isPreviewImpersonationSession(session),
        player: initialized.player,
        data: initialized.personalized,
        readDiagnostics: { source: "google", totalServerMs: totalMs },
      }, { headers: { ...privateHeaders, "Server-Timing": `session;dur=${sessionValidationMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}` } });
    }

    const playerId = playerPassportEffectivePlayerId(session);
    const read = await readMyMatchView({ tournamentId: session.tournamentId, playerId });
    if (!read.payload?.ok) {
      const error = new Error("My Match Supabase read failed.");
      error.code = read.payload?.code || "MY_MATCH_SUPABASE_READ_FAILED";
      throw error;
    }
    const personalized = myMatchDataFromSupabaseView(read.payload.data);
    const totalMs = performance.now() - requestStartedAt;

    const identity = participantIdentityAuthorityEnvironment();
    if (identity.authRehearsalEnabled) {
      const cookieStore = await cookies();
      after(async () => {
        try {
          const verified = await verifyParticipantAuthClaims(cookieStore);
          if (verified.status !== "active") return;
          const observed = await observeParticipantIdentityShadow({
            authUserId: verified.claims.sub,
            tournamentId: session.tournamentId,
            passportPlayerId: playerId,
            passportContext: personalized.identityContext,
          });
          console.info("My Match participant identity shadow", {
            playerId,
            status: observed.status,
            recorded: observed.recorded,
            observationId: observed.observationId || null,
          });
        } catch (error) {
          console.error("My Match participant identity shadow unavailable", { playerId, message: error?.message || String(error) });
        }
      });
    }

    return NextResponse.json({
      active: true,
      previewMode: isPreviewImpersonationSession(session),
      player: personalized.player,
      data: { player: personalized.player, tournament: personalized.tournament, matches: personalized.matches, snapshot: personalized.snapshot },
      readDiagnostics: {
        source: "supabase",
        postgresQueryMs: personalized.queryMs,
        supabaseServiceMs: read.durationMs,
        totalServerMs: totalMs,
        googleRequests: 0,
        identityAuthority: identity.resolved,
      },
    }, { headers: { ...privateHeaders,
      "Server-Timing": `session;dur=${sessionValidationMs.toFixed(1)}, postgres;dur=${personalized.queryMs.toFixed(1)}, supabase;dur=${read.durationMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
      "X-My-Match-Read-Source": "supabase",
      "X-My-Match-Google-Requests": "0",
    } });
  } catch (error) {
    console.error("My Match read failed", { source: source.resolved, playerId: playerPassportEffectivePlayerId(session),
      code: error?.code || "", message: error?.message || String(error) });
    return safeError(503);
  }
}
