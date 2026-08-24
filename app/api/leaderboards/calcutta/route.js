import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentCalcuttaOperationalResult } from "../../../../lib/calcutta-supabase.js";
import { requireCalcuttaReadSource } from "../../../../lib/calcutta-read-source.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { applicationRequestEnvironment } from "../../../../lib/production-shadow-request-environment.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request) {
  const startedAt = performance.now();
  try {
    const env = applicationRequestEnvironment(request);
    const source = requireCalcuttaReadSource(env);
    const authority = requireParticipantIdentityAuthority(env);
    if (source.resolved !== "supabase" || authority.resolved !== "supabase") {
      return NextResponse.json({ error: "Calcutta Supabase read is not active." }, { status: 404, headers });
    }
    const identityStartedAt = performance.now();
    const identity = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies(), env });
    const identityMs = performance.now() - identityStartedAt;
    const operational = await currentCalcuttaOperationalResult(identity.tournamentId, {
      recalculatePending: !source.productionShadowCandidate,
      calculatedBy: `participant-read:${identity.playerId}`,
      env,
    });
    if (!operational.calcutta) throw Object.assign(new Error("Calcutta result is unavailable."), { code: "CALCUTTA_RESULT_REQUIRED" });
    const totalMs = performance.now() - startedAt;
    const response = NextResponse.json({
      data: operational.calcutta,
      freshness: {
        stale: operational.stale, snapshot: operational.snapshot, job: operational.job,
        recalculated: Boolean(operational.recalculation),
      },
      player: { id: identity.playerId, name: identity.displayName },
      readDiagnostics: {
        source: "supabase", identityMs, postgresQueryMs: operational.queryMs,
        supabaseServiceMs: operational.serviceMs,
        recalculationInputMs: operational.recalculation?.inputReadMs || 0,
        recalculationEngineMs: operational.recalculation?.calculated?.calculationMs || 0,
        recalculationWriteMs: operational.recalculation?.writeMs || 0,
        fullServerMs: totalMs, googleRequests: 0,
      },
    }, { headers });
    response.headers.set("X-Calcutta-Read-Source", "supabase");
    response.headers.set("X-Calcutta-Google-Requests", "0");
    response.headers.set("X-Participant-Identity-Authority", "supabase");
    response.headers.set("Server-Timing", `identity;dur=${identityMs.toFixed(1)}, postgres;dur=${Number(operational.queryMs || 0).toFixed(1)}, supabase;dur=${Number(operational.serviceMs || 0).toFixed(1)}, calculation;dur=${Number(operational.recalculation?.calculated?.calculationMs || 0).toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
  } catch (error) {
    const safe = participantIdentityPublicError(error);
    console.error("Calcutta Supabase read failed", { code: error?.code || "CALCUTTA_READ_UNAVAILABLE", message: error?.message || String(error) });
    return NextResponse.json({
      error: safe.status === 401 ? safe.message : "Calcutta is temporarily unavailable.",
      code: error?.code || safe.code || "CALCUTTA_READ_UNAVAILABLE",
    }, { status: safe.status || 503, headers: { ...headers, "X-Calcutta-Read-Source": "supabase", "X-Calcutta-Google-Requests": "0" } });
  }
}
