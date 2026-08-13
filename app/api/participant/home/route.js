import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireHomeReadSource } from "../../../../lib/home-read-source.js";
import { participantHomeDataFromSupabaseView, readParticipantHomeView } from "../../../../lib/participant-home-supabase.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { currentCompetitionDerivedState } from "../../../../lib/competition-derived-supabase.js";
import { requireStorylinesReadSource } from "../../../../lib/competition-derived-read-source.js";
import { guideReadEnvironment } from "../../../../lib/guide-read-source.js";
import { readGuideProjection } from "../../../../lib/guide-supabase.js";
import { applyGuideProjectionToHome } from "../../../../lib/guide-participant-adapter.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

export async function GET(request) {
  const startedAt = performance.now();
  try {
    const source = requireHomeReadSource();
    const storylinesSource = requireStorylinesReadSource();
    const guideSource = guideReadEnvironment().guide;
    const authority = requireParticipantIdentityAuthority();
    if (source.resolved !== "supabase" || authority.resolved !== "supabase") {
      return NextResponse.json({ error: "Participant Home Supabase read is not active." }, { status: 404, headers });
    }
    const identityStarted = performance.now();
    const resolved = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies() });
    const identityMs = performance.now() - identityStarted;
    const serviceStarted = performance.now();
    const [read, prepared, guideRead] = await Promise.all([
      readParticipantHomeView({ tournamentId: resolved.tournamentId, playerId: resolved.playerId }),
      storylinesSource.resolved === "supabase"
        ? currentCompetitionDerivedState(resolved.tournamentId, { engineKeys: ["TOURNAMENT_STORYLINES"] }).catch((error) => ({
          storylines: [], moments: [], metadata: { storylines: { stale: true, unavailable: true, code: error?.code || "STORYLINES_UNAVAILABLE" } }, serviceMs: 0,
        }))
        : Promise.resolve(null),
      guideSource.resolved === "supabase"
        ? readGuideProjection({ tournamentId: resolved.tournamentId, surface: "guide" }).catch((error) => ({
          payload: { ok: false, code: error?.code || "GUIDE_PROJECTION_UNAVAILABLE" }, durationMs: 0,
        }))
        : Promise.resolve(null),
    ]);
    const serviceMs = performance.now() - serviceStarted;
    if (!read.payload?.ok) throw Object.assign(new Error("Participant Home is unavailable."), { code: read.payload?.code });
    let data = participantHomeDataFromSupabaseView(read.payload.data);
    if (guideRead?.payload?.ok) {
      data = applyGuideProjectionToHome(data, guideRead, {
        previewDate: process.env.PREVIEW_TIMELINE_DATE,
        previewEnabled: process.env.VERCEL_ENV === "preview",
      });
    }
    if (storylinesSource.resolved === "supabase") {
      data.liveData.preparedStorylines = prepared?.moments || [];
      data.liveData.storylinesSource = "supabase";
      data.liveData.storylinesFreshness = prepared?.metadata?.storylines || { stale: true, unavailable: true };
    }
    const totalMs = performance.now() - startedAt;
    const response = NextResponse.json({
      active: true,
      player: data.player,
      data,
      readDiagnostics: {
        source: "supabase",
        identityMs,
        postgresQueryMs: data.queryMs,
        supabaseServiceMs: read.durationMs || serviceMs,
        fullServerMs: totalMs,
        googleRequests: 0,
        presentation: data.presentation,
        storylines: prepared?.metadata?.storylines || { source: storylinesSource.resolved },
        guide: guideRead?.payload?.ok
          ? { source: "supabase", revision: data.presentation?.guide?.revision || 0,
            fingerprint: data.presentation?.guide?.contentFingerprint || "", googleRequests: 0 }
          : { source: "home-presentation", unavailable: guideSource.resolved === "supabase", googleRequests: 0 },
      },
    }, { headers });
    response.headers.set("X-Home-Read-Source", "supabase");
    response.headers.set("X-Home-Google-Requests", "0");
    response.headers.set("X-Participant-Identity-Authority", "supabase");
    response.headers.set("X-Storylines-Read-Source", storylinesSource.resolved);
    response.headers.set("X-Storylines-Google-Requests", "0");
    response.headers.set("X-Home-Schedule-Source", guideRead?.payload?.ok ? "supabase-guide" : "home-presentation");
    response.headers.set("X-Home-Schedule-Google-Requests", "0");
    response.headers.set("Server-Timing", `identity;dur=${identityMs.toFixed(1)}, postgres;dur=${Number(data.queryMs || 0).toFixed(1)}, supabase;dur=${Number(read.durationMs || serviceMs).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    const safe = participantIdentityPublicError(error);
    console.error("Participant Home Supabase read failed", { code: error?.code || "HOME_READ_UNAVAILABLE", message: error?.message || String(error) });
    return NextResponse.json({ active: safe.status === 401 ? false : null,
      error: safe.status === 401 ? safe.message : "Home is temporarily unavailable.",
      code: error?.code || safe.code || "HOME_READ_UNAVAILABLE" },
    { status: safe.status || 503, headers: { ...headers, "X-Home-Read-Source": "supabase", "X-Home-Google-Requests": "0" } });
  }
}
