import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { leaderboardsCoreDataFromSupabaseView, readLeaderboardsCoreView } from "../../../../lib/leaderboards-core-supabase.js";
import { requireLeaderboardsCoreReadSource } from "../../../../lib/leaderboards-core-read-source.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { applicationRequestEnvironment } from "../../../../lib/production-shadow-request-environment.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

export async function GET(request) {
  const startedAt = performance.now();
  try {
    const env = applicationRequestEnvironment(request);
    const source = requireLeaderboardsCoreReadSource(env);
    const identityAuthority = requireParticipantIdentityAuthority(env);
    if (source.resolved !== "supabase" || identityAuthority.resolved !== "supabase") {
      return NextResponse.json({ error: "Leaderboards core Supabase read is not active." }, { status: 404, headers });
    }
    const identityStarted = performance.now();
    const identity = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies(), env });
    const identityMs = performance.now() - identityStarted;
    const serviceStarted = performance.now();
    const read = await readLeaderboardsCoreView(identity.tournamentId, { env });
    const serviceMs = performance.now() - serviceStarted;
    if (!read.payload?.ok) throw Object.assign(new Error("Leaderboards core state is unavailable."), { code: read.payload?.code });
    const data = leaderboardsCoreDataFromSupabaseView(read.payload.data);
    if (!data.slotVerification.pass) {
      throw Object.assign(new Error("Canonical player-slot attribution did not validate."), {
        code: "LEADERBOARDS_PLAYER_SLOT_DIVERGENCE",
        diagnostics: data.slotVerification.issues,
      });
    }
    const player = data.players.find((row) => row.id === identity.playerId) || { id: identity.playerId, name: identity.displayName };
    const totalMs = performance.now() - startedAt;
    const response = NextResponse.json({
      data,
      player,
      readDiagnostics: {
        source: "supabase",
        identityMs,
        postgresQueryMs: data.queryMs,
        supabaseServiceMs: read.durationMs || serviceMs,
        standingsCalculationMs: data.calculationMs,
        fullServerMs: totalMs,
        googleRequests: 0,
        sourceFingerprint: data.sourceFingerprint,
        slotVerification: data.slotVerification,
      },
    }, { headers });
    response.headers.set("X-Leaderboards-Core-Read-Source", "supabase");
    response.headers.set("X-Leaderboards-Core-Google-Requests", "0");
    response.headers.set("X-Leaderboards-Core-Fingerprint", data.sourceFingerprint);
    response.headers.set("X-Participant-Identity-Authority", "supabase");
    response.headers.set("Server-Timing", `identity;dur=${identityMs.toFixed(1)}, postgres;dur=${Number(data.queryMs || 0).toFixed(1)}, supabase;dur=${Number(read.durationMs || serviceMs).toFixed(1)}, calculation;dur=${Number(data.calculationMs || 0).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    const safe = participantIdentityPublicError(error);
    console.error("Leaderboards core Supabase read failed", {
      code: error?.code || "LEADERBOARDS_CORE_READ_UNAVAILABLE",
      message: error?.message || String(error),
      issueCount: Array.isArray(error?.diagnostics) ? error.diagnostics.length : 0,
    });
    return NextResponse.json({
      error: safe.status === 401 ? safe.message : "Core Leaderboards are temporarily unavailable.",
      code: error?.code || safe.code || "LEADERBOARDS_CORE_READ_UNAVAILABLE",
    }, { status: safe.status || 503, headers: { ...headers,
      "X-Leaderboards-Core-Read-Source": "supabase", "X-Leaderboards-Core-Google-Requests": "0" } });
  }
}
