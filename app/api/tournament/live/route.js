import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readTournamentLiveView, tournamentLiveDataFromSupabaseView } from "../../../../lib/tournament-live-supabase.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { requireTournamentReadSource } from "../../../../lib/tournament-read-source.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

export async function GET(request) {
  const startedAt = performance.now();
  try {
    const source = requireTournamentReadSource();
    if (source.resolved !== "supabase") {
      return NextResponse.json({ error: "Tournament Supabase read is not active." }, { status: 404, headers });
    }
    const identityStarted = performance.now();
    const identity = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies() });
    const identityMs = performance.now() - identityStarted;
    const serviceStarted = performance.now();
    const read = await readTournamentLiveView(identity.tournamentId);
    const serviceMs = performance.now() - serviceStarted;
    if (!read.payload?.ok) throw Object.assign(new Error("Tournament live state is unavailable."), { code: read.payload?.code });
    const data = tournamentLiveDataFromSupabaseView(read.payload.data);
    const totalMs = performance.now() - startedAt;
    const response = NextResponse.json({
      data,
      readDiagnostics: {
        source: "supabase",
        identityMs,
        tournamentId: identity.tournamentId,
        postgresQueryMs: data.queryMs,
        supabaseServiceMs: read.durationMs || serviceMs,
        fullServerMs: totalMs,
        googleRequests: 0,
        presentation: data.presentation,
      },
    }, { headers });
    response.headers.set("X-Tournament-Read-Source", "supabase");
    response.headers.set("X-Tournament-Google-Requests", "0");
    response.headers.set("X-Participant-Identity-Authority", "supabase");
    response.headers.set("Server-Timing", `identity;dur=${identityMs.toFixed(1)}, postgres;dur=${Number(data.queryMs || 0).toFixed(1)}, supabase;dur=${Number(read.durationMs || serviceMs).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    const safe = participantIdentityPublicError(error);
    console.error("Tournament Supabase live read failed", { code: error?.code || "TOURNAMENT_READ_UNAVAILABLE", message: error?.message || String(error) });
    return NextResponse.json({ error: safe.status === 401 ? safe.message : "Tournament live state is temporarily unavailable.",
      code: error?.code || safe.code || "TOURNAMENT_READ_UNAVAILABLE" },
      { status: safe.status || 503, headers: { ...headers, "X-Tournament-Read-Source": "supabase", "X-Tournament-Google-Requests": "0" } });
  }
}
