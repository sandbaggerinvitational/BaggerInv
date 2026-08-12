import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { currentNetSkinsOperationalResult } from "../../../../lib/net-skins-supabase.js";
import { requireNetSkinsReadSource } from "../../../../lib/net-skins-read-source.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { recalculateCompetitionDerivedTournament } from "../../../../lib/competition-derived-supabase.js";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request) {
  const startedAt = performance.now();
  try {
    const source = requireNetSkinsReadSource();
    const authority = requireParticipantIdentityAuthority();
    if (source.resolved !== "supabase" || authority.resolved !== "supabase") {
      return NextResponse.json({ error: "Net Skins Supabase read is not active." }, { status: 404, headers: responseHeaders });
    }
    const identityStarted = performance.now();
    const identity = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies() });
    const identityMs = performance.now() - identityStarted;
    const operational = await currentNetSkinsOperationalResult(identity.tournamentId, {
      recalculatePending: true,
      calculatedBy: `participant-read:${identity.playerId}`,
    });
    const totalMs = performance.now() - startedAt;
    if (operational.recalculation) after(async () => {
      try {
        await recalculateCompetitionDerivedTournament(identity.tournamentId, {
          calculatedBy: `Net Skins dependency worker · ${identity.playerId}`,
        });
      } catch (error) {
        console.error("Storyline recalculation after Net Skins remains pending", { code: error?.code || "STORYLINES_RECALCULATION_FAILED" });
      }
    });
    const response = NextResponse.json({
      data: {
        netSkins: operational.netSkins,
        freshness: {
          stale: operational.stale,
          jobs: operational.jobs,
          recalculated: Boolean(operational.recalculation),
        },
      },
      player: { id: identity.playerId, name: identity.displayName },
      readDiagnostics: {
        source: "supabase",
        identityMs,
        postgresQueryMs: operational.queryMs,
        supabaseServiceMs: operational.serviceMs,
        recalculationInputMs: operational.recalculation?.inputReadMs || 0,
        recalculationEngineMs: operational.recalculation?.calculated?.calculationMs || 0,
        recalculationWriteMs: operational.recalculation?.writeMs || 0,
        fullServerMs: totalMs,
        googleRequests: 0,
      },
    }, { headers: responseHeaders });
    response.headers.set("X-Net-Skins-Read-Source", "supabase");
    response.headers.set("X-Net-Skins-Google-Requests", "0");
    response.headers.set("X-Participant-Identity-Authority", "supabase");
    response.headers.set("Server-Timing", `identity;dur=${identityMs.toFixed(1)}, postgres;dur=${Number(operational.queryMs || 0).toFixed(1)}, supabase;dur=${Number(operational.serviceMs || 0).toFixed(1)}, calculation;dur=${Number(operational.recalculation?.calculated?.calculationMs || 0).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    const safe = participantIdentityPublicError(error);
    console.error("Net Skins Supabase read failed", {
      code: error?.code || "NET_SKINS_READ_UNAVAILABLE",
      message: error?.message || String(error),
    });
    return NextResponse.json({
      error: safe.status === 401 ? safe.message : "Net Skins are temporarily unavailable.",
      code: error?.code || safe.code || "NET_SKINS_READ_UNAVAILABLE",
    }, {
      status: safe.status || 503,
      headers: { ...responseHeaders, "X-Net-Skins-Read-Source": "supabase", "X-Net-Skins-Google-Requests": "0" },
    });
  }
}
