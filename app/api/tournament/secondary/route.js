import { NextResponse } from "next/server";
import { readTournamentSecondaryView } from "../../../../lib/tournament-live-supabase.js";
import { requireTournamentReadSource } from "../../../../lib/tournament-read-source.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" };

export async function GET(request) {
  try {
    const source = requireTournamentReadSource();
    if (source.resolved !== "supabase") return NextResponse.json({ error: "Not found." }, { status: 404, headers });
    const module = new URL(request.url).searchParams.get("module") || "";
    if (module !== "calcutta") return NextResponse.json({ error: "Tournament module is not available." }, { status: 400, headers });
    const read = await readTournamentSecondaryView({ module });
    if (!read.payload?.ok) throw Object.assign(new Error("Tournament module is unavailable."), { code: read.payload?.code });
    const response = NextResponse.json({ data: read.payload.data, module, presentation: {
      fingerprint: read.payload.source_fingerprint, importedAt: read.payload.imported_at,
    } }, { headers });
    response.headers.set("X-Tournament-Read-Source", "supabase-projection");
    response.headers.set("X-Tournament-Google-Requests", "0");
    response.headers.set("Server-Timing", `postgres;dur=${Number(read.payload.query_ms || 0).toFixed(1)}, supabase;dur=${Number(read.durationMs || 0).toFixed(1)}`);
    return response;
  } catch (error) {
    console.error("Tournament secondary projection read failed", { code: error?.code || "TOURNAMENT_SECONDARY_UNAVAILABLE", message: error?.message || String(error) });
    return NextResponse.json({ error: "This Tournament section is temporarily unavailable.", code: error?.code || "TOURNAMENT_SECONDARY_UNAVAILABLE" },
      { status: 503, headers: { ...headers, "X-Tournament-Google-Requests": "0" } });
  }
}
