import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readOddsSnapshots, withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../../lib/runtime-performance";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { readPublishedOddsView, publishedOddsSnapshotsFromView } from "../../../../lib/published-odds-supabase.js";
import { requirePublishedOddsReadSource } from "../../../../lib/published-odds-read-source.js";
import { currentIntelligenceDerivedState } from "../../../../lib/intelligence-derived-supabase.js";
import { requireIntelligenceDerivedReadSources } from "../../../../lib/intelligence-derived-read-source.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const profile = createRuntimeProfile("GET /api/leaderboards/insights");
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    return NextResponse.json({ error: "A valid tournament year is required." }, { status: 400 });
  }
  const source = requirePublishedOddsReadSource();
  const intelligenceSources = requireIntelligenceDerivedReadSources();
  if (source.resolved === "google") {
    const measured = await profile.measure("googleSheetsRead", () => withWorkbookWriteDiagnostics("GET /api/leaderboards/insights", readOddsSnapshots));
    const loadedSnapshots = measured.result;
    console.info("Leaderboard Insights workbook access", measured.diagnostics);
    const assemblyStartedAt = performance.now();
    const snapshots = loadedSnapshots.filter((snapshot) => Number(snapshot.year) === year)
      .sort((left, right) => Number(left.phaseOrder || 0) - Number(right.phaseOrder || 0));
    profile.mark("renderingPreparation", performance.now() - assemblyStartedAt);
    return attachRuntimeTiming(NextResponse.json({ snapshots }, { headers: { "Cache-Control": "no-store", "X-Published-Odds-Read-Source": "google" } }), profile.finish());
  }
  const startedAt = performance.now();
  try {
    const identity = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies() });
    const [read, derived] = await Promise.all([
      readPublishedOddsView({ tournamentId: identity.tournamentId }),
      Object.values(intelligenceSources).some((state) => state.resolved === "supabase")
        ? currentIntelligenceDerivedState(identity.tournamentId).catch((error) => ({ unavailable: true, code: error?.code || "INTELLIGENCE_DERIVED_UNAVAILABLE" }))
        : Promise.resolve(null),
    ]);
    if (!read.payload?.ok) throw Object.assign(new Error("Published Odds state is unavailable."), { code: read.payload?.code });
    const tournamentYear = Number(read.payload.data.tournament?.tournament_year);
    if (tournamentYear !== year) return NextResponse.json({ error: "The requested tournament is unavailable.", code: "WRONG_TOURNAMENT" }, { status: 403 });
    const snapshots = publishedOddsSnapshotsFromView(read.payload.data);
    const totalMs = performance.now() - startedAt;
    const response = NextResponse.json({ snapshots, derived, publication: {
      currentMilestone: (read.payload.data.snapshots || []).find((item) => item.is_current_official)?.milestone || null,
      historyCount: read.payload.data.history_count, stale: false,
    } }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
    response.headers.set("X-Published-Odds-Read-Source", "supabase");
    response.headers.set("X-Published-Odds-Google-Requests", "0");
    response.headers.set("X-Intelligence-Google-Requests", "0");
    response.headers.set("X-Tournament-Intelligence-Read-Source", intelligenceSources.tournamentIntelligence.resolved);
    response.headers.set("X-Projection-Editorial-Read-Source", intelligenceSources.projectionEditorial.resolved);
    response.headers.set("X-Final-Recap-Read-Source", intelligenceSources.finalRecap.resolved);
    response.headers.set("X-Published-Odds-Fingerprint", (read.payload.data.snapshots || []).find((item) => item.is_current_official)?.payload_hash || "");
    response.headers.set("Server-Timing", `postgres;dur=${Number(read.payload.data.query_ms || 0).toFixed(1)}, supabase;dur=${Number(read.durationMs || 0).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    const safe = participantIdentityPublicError(error);
    console.error("Published Odds Supabase read failed", { code: error?.code || "PUBLISHED_ODDS_READ_UNAVAILABLE", message: error?.message || String(error) });
    return NextResponse.json({ error: safe.status === 401 ? safe.message : "Published Championship Odds are temporarily unavailable.",
      code: error?.code || "PUBLISHED_ODDS_READ_UNAVAILABLE" }, { status: safe.status || 503,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Published-Odds-Read-Source": "supabase", "X-Published-Odds-Google-Requests": "0" } });
  }
}
