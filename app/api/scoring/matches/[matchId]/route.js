import { withOperationalRoute, recordOperationalError, emitOperationalEvent } from "../../../../../lib/operational-telemetry.js";
import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canScoreMatch, scoringTokenFromRequest, verifyScoringSession } from "../../../../../lib/scoring-access.js";
import { clientAddress, consumeRateLimit } from "../../../../../lib/rate-limit.js";
import { normalizeLiveScoringRequest } from "../../../../../lib/live-score-values.js";
import { logScoringFailure, participantScoringError, participantScoringHttpStatus, participantScoringPauseHeaders } from "../../../../../lib/scoring-api-errors.js";
import { persistParticipantScore } from "../../../../../lib/scoring-persistence-adapter.js";
import { validateAuthoritativeParticipantSession } from "../../../../../lib/scoring-participant-authorization.js";
import { recalculateCompetitionDerivedTournament } from "../../../../../lib/competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "../../../../../lib/intelligence-derived-supabase.js";
import { recalculateCalcuttaAfterCanonicalMutation } from "../../../../../lib/calcutta-post-commit.js";
import { readParticipantScoringMatch, scoringReadResponseHeaders } from "../../../../../lib/scoring-read-service.js";
import { productionShadowScoringMutationResponse } from "../../../../../lib/production-shadow-scoring-safety.js";
import { attachScoringMutationAuthorityContract, currentScoringMutationAuthorityContract } from "../../../../../lib/scoring-mutation-authority-server.js";

export const dynamic = "force-dynamic";

function session(request) {
  return verifyScoringSession(scoringTokenFromRequest(request));
}

async function telemetryGET(request, { params }) {
  try {
    const current = session(request);
    const { matchId } = await params;
    if (!canScoreMatch(current, matchId)) throw new Error("This code cannot access that match.");
    const authorization = await validateAuthoritativeParticipantSession(request, current, { cookieStore: await cookies() });
    const scoring = await readParticipantScoringMatch({
      matchId,
      currentPlayerId: current.playerId,
      authorization: {
        verified: current.scope === "admin" || authorization.canonical?.authorization?.verified === true ||
          authorization.authorization?.allowed === true,
        writable: authorization.writable === true,
      },
      canonicalData: authorization.canonical,
    });
    const mutationContract = await currentScoringMutationAuthorityContract({ request });
    return NextResponse.json({ data: attachScoringMutationAuthorityContract(
      { ...scoring.data, readDiagnostics: scoring.diagnostics },
      mutationContract,
    ) },
      { headers: scoringReadResponseHeaders(scoring.diagnostics) });
  } catch (error) {
    recordOperationalError(error);
    return NextResponse.json({ error: error?.message || "Unable to load scoring.", code: error?.code || "" },
      { status: Number(error?.status) || 403, headers: { "Cache-Control": "no-store" } });
  }
}

async function telemetryPOST(request, { params }) {
  const candidateReadOnly = productionShadowScoringMutationResponse(request);
  if (candidateReadOnly) return candidateReadOnly;
  try {
    const authorizationStartedAt = Date.now();
    const current = session(request);
    const { matchId } = await params;
    if (!canScoreMatch(current, matchId)) throw new Error("This code cannot update that match.");
    const verifiedAuthorization = await validateAuthoritativeParticipantSession(request, current,
      { requireWritable: true, cookieStore: await cookies() });
    const authorizationMs = Date.now() - authorizationStartedAt;
    emitOperationalEvent({ event: "PHASE", domain: "AUTHORIZATION", phase: "authorization", latency_ms: authorizationMs, outcome: "NOT_APPLICABLE" });
    const rateLimit = consumeRateLimit(`scoring-write:${clientAddress(request)}:${matchId}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many score updates. Wait a moment and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))) },
        }
      );
    }
    const submitted = await request.json();
    const input = submitted.action === "confirm" ? submitted : normalizeLiveScoringRequest(submitted);
    const measured = await persistParticipantScore({ matchId, input, current,
      updatedBy: current.scorerName || "Authorized scorer",
      authorizationContext: verifiedAuthorization,
      request });
    const result = measured.result;
    const { _shadow, ...participantResult } = result;
    if (measured.authority === "supabase") {
      after(async () => {
        const [derived, intelligence, calcutta] = await Promise.allSettled([
          recalculateCompetitionDerivedTournament(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring derived-state worker · ${current.playerId || "participant"}`,
          }),
          recalculateIntelligenceDerivedTournament(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring intelligence worker · ${current.playerId || "participant"}`,
          }),
          recalculateCalcuttaAfterCanonicalMutation(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring Calcutta worker · ${current.playerId || "participant"}`,
            mutationKey: input.clientMutationId || `scoring:${matchId}`,
            matchId,
          }),
        ]);
        if (derived.status === "rejected") console.error("Competition derived-state recalculation remains pending", {
          matchId, code: derived.reason?.code || "DERIVED_STATE_RECALCULATION_FAILED",
        });
        if (intelligence.status === "rejected") console.error("Intelligence recalculation remains pending", {
          matchId, code: intelligence.reason?.code || "INTELLIGENCE_RECALCULATION_FAILED",
        });
        if (calcutta.status === "rejected") console.error("Calcutta recalculation remains pending", {
          matchId, code: calcutta.reason?.code || "CALCUTTA_RECALCULATION_FAILED",
        });
      });
    }
    return NextResponse.json({ result: participantResult });
  } catch (error) {
    recordOperationalError(error);
    const conflict = Number(error?.status) === 409 || /updated by someone else/i.test(error?.message || "");
    logScoringFailure(error, { route: "/api/scoring/matches/[matchId]", conflict });
    return NextResponse.json(
      {
        error: participantScoringError(error),
        code: error?.code || "",
      },
      { status: conflict ? 409 : participantScoringHttpStatus(error), headers: participantScoringPauseHeaders(error) }
    );
  }
}

export const GET = withOperationalRoute({ route: "/api/scoring/matches/[matchId]", domain: "SCORING" }, telemetryGET);

export const POST = withOperationalRoute({ route: "/api/scoring/matches/[matchId]", domain: "SCORING" }, telemetryPOST);
