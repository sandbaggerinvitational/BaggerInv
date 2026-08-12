import { NextResponse } from "next/server";
import { readTournamentLiveView, tournamentLiveDataFromSupabaseView } from "../../../../lib/tournament-live-supabase.js";
import { requireTournamentReadSource } from "../../../../lib/tournament-read-source.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=15" };

export async function GET() {
  const startedAt = performance.now();
  try {
    const source = requireTournamentReadSource();
    if (source.resolved !== "supabase") {
      return NextResponse.json({ error: "Tournament Supabase read is not active." }, { status: 404, headers });
    }
    const serviceStarted = performance.now();
    const read = await readTournamentLiveView();
    const serviceMs = performance.now() - serviceStarted;
    if (!read.payload?.ok) throw Object.assign(new Error("Tournament live state is unavailable."), { code: read.payload?.code });
    const data = tournamentLiveDataFromSupabaseView(read.payload.data);
    const totalMs = performance.now() - startedAt;
    const response = NextResponse.json({
      data,
      readDiagnostics: {
        source: "supabase",
        postgresQueryMs: data.queryMs,
        supabaseServiceMs: read.durationMs || serviceMs,
        fullServerMs: totalMs,
        googleRequests: 0,
        presentation: data.presentation,
      },
    }, { headers });
    response.headers.set("X-Tournament-Read-Source", "supabase");
    response.headers.set("X-Tournament-Google-Requests", "0");
    response.headers.set("Server-Timing", `postgres;dur=${Number(data.queryMs || 0).toFixed(1)}, supabase;dur=${Number(read.durationMs || serviceMs).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    console.error("Tournament Supabase live read failed", { code: error?.code || "TOURNAMENT_READ_UNAVAILABLE", message: error?.message || String(error) });
    return NextResponse.json({ error: "Tournament live state is temporarily unavailable.", code: error?.code || "TOURNAMENT_READ_UNAVAILABLE" },
      { status: 503, headers: { ...headers, "X-Tournament-Read-Source": "supabase", "X-Tournament-Google-Requests": "0" } });
  }
}
