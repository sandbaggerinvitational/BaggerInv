import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initializeParticipantTournament } from "../../../lib/participant-initialization.js";
import { requireParticipantIdentityAuthority } from "../../../lib/participant-identity-authority.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../lib/participant-identity-resolver.js";
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
import { guideReadEnvironment } from "../../../lib/guide-read-source.js";
import { readGuideProjection } from "../../../lib/guide-supabase.js";
import { applyGuideCoursesToMyMatch, guideParticipantProjection } from "../../../lib/guide-participant-adapter.js";
import { applicationRequestEnvironment } from "../../../lib/production-shadow-request-environment.js";

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
  let resolvedIdentity;
  let identity;
  let env;
  try {
    env = applicationRequestEnvironment(request);
    identity = requireParticipantIdentityAuthority(env);
    if (identity.resolved === "supabase") {
      resolvedIdentity = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies(), env });
    } else {
      session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
    }
  } catch (error) {
    if (identity?.resolved === "supabase") {
      const safe = participantIdentityPublicError(error);
      return NextResponse.json({ active: safe.status === 401 ? false : null, initializing: safe.status !== 401,
        error: safe.message, code: safe.code }, { status: safe.status, headers: privateHeaders });
    }
    return safeError(401);
  }
  const sessionValidationMs = performance.now() - requestStartedAt;
  const source = requireMyMatchReadSource(env);
  const guideSource = guideReadEnvironment(env).course;

  try {
    if (source.resolved === "google") {
      if (identity.resolved === "supabase") throw Object.assign(new Error("Supabase identity cannot use the Google My Match foreground adapter."), { code: "MY_MATCH_SOURCE_MISMATCH" });
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

    const playerId = identity.resolved === "supabase" ? resolvedIdentity.playerId : playerPassportEffectivePlayerId(session);
    const tournamentId = identity.resolved === "supabase" ? resolvedIdentity.tournamentId : session.tournamentId;
    const [read, guideRead] = await Promise.all([
      readMyMatchView({ tournamentId, playerId }, { env }),
      guideSource.resolved === "supabase"
        ? readGuideProjection({ tournamentId, surface: "course", env }).catch((error) => ({
          payload: { ok: false, code: error?.code || "GUIDE_PROJECTION_UNAVAILABLE" }, durationMs: 0,
        }))
        : Promise.resolve(null),
    ]);
    if (!read.payload?.ok) {
      const error = new Error("My Match Supabase read failed.");
      error.code = read.payload?.code || "MY_MATCH_SUPABASE_READ_FAILED";
      throw error;
    }
    let personalized = myMatchDataFromSupabaseView(read.payload.data);
    if (guideRead?.payload?.ok) personalized = applyGuideCoursesToMyMatch(personalized, guideRead);
    const totalMs = performance.now() - requestStartedAt;

    if (identity.authRehearsalEnabled) {
      const cookieStore = await cookies();
      after(async () => {
        try {
          const verified = await verifyParticipantAuthClaims(cookieStore);
          if (verified.status !== "active") return;
          const observed = await observeParticipantIdentityShadow({
            authUserId: verified.claims.sub,
            tournamentId,
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
      previewMode: identity.resolved === "supabase" ? resolvedIdentity.previewMode : isPreviewImpersonationSession(session),
      player: personalized.player,
      data: { player: personalized.player, tournament: personalized.tournament, matches: personalized.matches, snapshot: personalized.snapshot },
      readDiagnostics: {
        source: "supabase",
        postgresQueryMs: personalized.queryMs,
        supabaseServiceMs: read.durationMs,
        totalServerMs: totalMs,
        googleRequests: 0,
        identityAuthority: identity.resolved,
        identityTimings: identity.resolved === "supabase" ? resolvedIdentity.timings : { passportSignedSessionMs: sessionValidationMs },
        guideCoursePresentation: guideRead?.payload?.ok
          ? { ...guideParticipantProjection(guideRead).metadata, googleRequests: 0 }
          : { source: "my-match-presentation", unavailable: guideSource.resolved === "supabase", googleRequests: 0 },
      },
    }, { headers: { ...privateHeaders,
      "Server-Timing": `session;dur=${sessionValidationMs.toFixed(1)}, postgres;dur=${personalized.queryMs.toFixed(1)}, supabase;dur=${read.durationMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
      "X-My-Match-Read-Source": "supabase",
      "X-My-Match-Google-Requests": "0",
      "X-Course-Presentation-Read-Source": guideRead?.payload?.ok ? "supabase-guide" : "my-match-presentation",
      "X-Course-Presentation-Google-Requests": "0",
    } });
  } catch (error) {
    console.error("My Match read failed", { source: source.resolved, playerId: resolvedIdentity?.playerId || playerPassportEffectivePlayerId(session),
      code: error?.code || "", message: error?.message || String(error) });
    return safeError(503);
  }
}
