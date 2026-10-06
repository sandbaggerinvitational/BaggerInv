import { withOperationalRoute, recordOperationalError } from "../../../../lib/operational-telemetry.js";
import { readProductionNetSkinsV1 } from "../../../../lib/production-net-skins-v1.js";
import { mobileNetSkinsDataFromProductionView } from "../../../../lib/mobile-v1-net-skins.js";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { currentNetSkinsOperationalResult } from "../../../../lib/net-skins-supabase.js";
import { requireNetSkinsReadSource } from "../../../../lib/net-skins-read-source.js";
import { currentProductionNetSkinsV1 } from "../../../../lib/production-net-skins-v1.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { recalculateCompetitionDerivedTournament } from "../../../../lib/competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "../../../../lib/intelligence-derived-supabase.js";
import { applicationRequestEnvironment } from "../../../../lib/production-shadow-request-environment.js";
import { certificationParticipantNetSkinsData } from "../../../../lib/certification-net-skins-participant.js";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

async function telemetryGET(request) {
  const startedAt = performance.now();
  try {
    const env = applicationRequestEnvironment(request);
    const source = requireNetSkinsReadSource(env);
    const authority = requireParticipantIdentityAuthority(env);
    if (source.resolved !== "supabase" || authority.resolved !== "supabase") {
      return NextResponse.json({ error: "Net Skins Supabase read is not active." }, { status: 404, headers: responseHeaders });
    }
    const identityStarted = performance.now();
    const identity = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies(), env });
    const identityMs = performance.now() - identityStarted;
    // Registered Certification exercises the same read-only result contract.
    // A participant GET never authorizes legacy recalculation in that resource.
    const certificationV1 = source.certificationResource === true;
    const productionV1 = source.productionCutover?.handled === true || certificationV1;
    // Reuse the shipping native participant DTO with the existing web identity.
    // This explicit representation never falls back to a provisional read/worker.
    if (new URL(request.url).searchParams.get("presentation") === "participant") {
      if (!productionV1) return NextResponse.json({ code: "PARTICIPANT_PRESENTATION_UNAVAILABLE" }, { status: 503, headers: responseHeaders });
      const read = await readProductionNetSkinsV1({ playerId: identity.playerId, tournamentId: identity.tournamentId, env });
      if (!read.payload?.ok || !read.payload.data) throw new Error("PARTICIPANT_PRESENTATION_UNAVAILABLE");
      const data = mobileNetSkinsDataFromProductionView(read.payload.data, identity);
      return NextResponse.json({ data: certificationV1 ? certificationParticipantNetSkinsData(data) : data }, { headers: responseHeaders });
    }
    const operational = productionV1
      ? await currentProductionNetSkinsV1({
        playerId: identity.playerId,
        tournamentId: identity.tournamentId,
        env,
      })
      : await currentNetSkinsOperationalResult(identity.tournamentId, {
        recalculatePending: !source.productionShadowCandidate,
        calculatedBy: `participant-read:${identity.playerId}`,
        env,
      });
    const totalMs = performance.now() - startedAt;
    if (operational.recalculation) after(async () => {
      try {
        await recalculateCompetitionDerivedTournament(identity.tournamentId, {
          calculatedBy: `Net Skins dependency worker · ${identity.playerId}`,
        });
        await recalculateIntelligenceDerivedTournament(identity.tournamentId, {
          calculatedBy: `Net Skins intelligence worker · ${identity.playerId}`,
        });
      } catch (error) {
    recordOperationalError(error);
        console.error("Storyline recalculation after Net Skins remains pending", { code: error?.code || "STORYLINES_RECALCULATION_FAILED" });
      }
    });
    const data = {
        netSkins: operational.netSkins,
        netSkinsState: operational.netSkinsState || null,
        freshness: {
          stale: operational.stale,
          jobs: operational.jobs,
          recalculated: Boolean(operational.recalculation),
          revision: operational.revision || "",
        },
      };
    const response = NextResponse.json({
      data: certificationV1 ? certificationParticipantNetSkinsData(data) : data,
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
    if (operational.netSkinsState?.state) response.headers.set("X-Net-Skins-State", operational.netSkinsState.state);
    response.headers.set("X-Participant-Identity-Authority", "supabase");
    response.headers.set("Server-Timing", `identity;dur=${identityMs.toFixed(1)}, postgres;dur=${Number(operational.queryMs || 0).toFixed(1)}, supabase;dur=${Number(operational.serviceMs || 0).toFixed(1)}, calculation;dur=${Number(operational.recalculation?.calculated?.calculationMs || 0).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    recordOperationalError(error);
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

export const GET = withOperationalRoute({ route: "/api/leaderboards/net-skins", domain: "NET_SKINS" }, telemetryGET);
