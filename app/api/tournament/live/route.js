import { NextResponse } from "next/server";
import { readTournamentLiveView, tournamentLiveDataFromSupabaseView } from "../../../../lib/tournament-live-supabase.js";
import { requireTournamentReadSource } from "../../../../lib/tournament-read-source.js";
import { currentCompetitionDerivedState } from "../../../../lib/competition-derived-supabase.js";
import { requireMomentumReadSource } from "../../../../lib/competition-derived-read-source.js";
import { guideReadEnvironment } from "../../../../lib/guide-read-source.js";
import { readGuideProjection } from "../../../../lib/guide-supabase.js";
import { applyGuideCoursesToTournament, guideParticipantProjection } from "../../../../lib/guide-participant-adapter.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=15" };

export async function GET() {
  const startedAt = performance.now();
  try {
    const source = requireTournamentReadSource();
    const momentumSource = requireMomentumReadSource();
    const guideSource = guideReadEnvironment().course;
    if (source.resolved !== "supabase") {
      return NextResponse.json({ error: "Tournament Supabase read is not active." }, { status: 404, headers });
    }
    const serviceStarted = performance.now();
    const [read, guideRead] = await Promise.all([
      readTournamentLiveView(),
      guideSource.resolved === "supabase"
        ? readGuideProjection({ surface: "course" }).catch((error) => ({
          payload: { ok: false, code: error?.code || "GUIDE_PROJECTION_UNAVAILABLE" }, durationMs: 0,
        }))
        : Promise.resolve(null),
    ]);
    const serviceMs = performance.now() - serviceStarted;
    if (!read.payload?.ok) throw Object.assign(new Error("Tournament live state is unavailable."), { code: read.payload?.code });
    let data = tournamentLiveDataFromSupabaseView(read.payload.data);
    if (guideRead?.payload?.ok) data = applyGuideCoursesToTournament(data, guideRead);
    let prepared = null;
    if (momentumSource.resolved === "supabase") {
      prepared = await currentCompetitionDerivedState(data.tournament.id, { engineKeys: ["TEAM_MOMENTUM"] }).catch((error) => ({
        momentum: null, metadata: { momentum: { stale: true, unavailable: true, code: error?.code || "MOMENTUM_UNAVAILABLE" } }, serviceMs: 0,
      }));
      data.momentum = prepared.momentum;
      data.momentumSource = "supabase";
      data.momentumFreshness = prepared.metadata?.momentum || { stale: true, unavailable: true };
    }
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
        momentum: prepared?.metadata?.momentum || { source: momentumSource.resolved },
        guideCoursePresentation: guideRead?.payload?.ok
          ? { ...guideParticipantProjection(guideRead).metadata, googleRequests: 0 }
          : { source: "tournament-presentation", unavailable: guideSource.resolved === "supabase", googleRequests: 0 },
      },
    }, { headers });
    response.headers.set("X-Tournament-Read-Source", "supabase");
    response.headers.set("X-Tournament-Google-Requests", "0");
    response.headers.set("X-Momentum-Read-Source", momentumSource.resolved);
    response.headers.set("X-Momentum-Google-Requests", "0");
    response.headers.set("X-Course-Presentation-Read-Source", guideRead?.payload?.ok ? "supabase-guide" : "tournament-presentation");
    response.headers.set("X-Course-Presentation-Google-Requests", "0");
    response.headers.set("Server-Timing", `postgres;dur=${Number(data.queryMs || 0).toFixed(1)}, supabase;dur=${Number(read.durationMs || serviceMs).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    console.error("Tournament Supabase live read failed", { code: error?.code || "TOURNAMENT_READ_UNAVAILABLE", message: error?.message || String(error) });
    return NextResponse.json({ error: "Tournament live state is temporarily unavailable.", code: error?.code || "TOURNAMENT_READ_UNAVAILABLE" },
      { status: 503, headers: { ...headers, "X-Tournament-Read-Source": "supabase", "X-Tournament-Google-Requests": "0" } });
  }
}
