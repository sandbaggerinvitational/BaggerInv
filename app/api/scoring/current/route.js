import { withOperationalRoute, recordOperationalError, emitOperationalEvent } from "../../../../lib/operational-telemetry.js";
import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { scoringTokenFromRequest, verifyScoringSession } from "../../../../lib/scoring-access.js";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit.js";
import { normalizeLiveScoringRequest } from "../../../../lib/live-score-values.js";
import { logScoringFailure, participantScoringError, participantScoringHttpStatus, participantScoringPauseHeaders } from "../../../../lib/scoring-api-errors.js";
import { persistParticipantScore } from "../../../../lib/scoring-persistence-adapter.js";
import { validateAuthoritativeParticipantSession } from "../../../../lib/scoring-participant-authorization.js";
import { readParticipantScoringMatch, scoringReadResponseHeaders } from "../../../../lib/scoring-read-service.js";
import { readScoringMatchView } from "../../../../lib/scoring-read-supabase.js";
import { recalculateCompetitionDerivedTournament } from "../../../../lib/competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "../../../../lib/intelligence-derived-supabase.js";
import { recalculateCalcuttaAfterCanonicalMutation } from "../../../../lib/calcutta-post-commit.js";
import { productionShadowScoringMutationResponse } from "../../../../lib/production-shadow-scoring-safety.js";
import { attachScoringMutationAuthorityContract, currentScoringMutationAuthorityContract } from "../../../../lib/scoring-mutation-authority-server.js";

export const dynamic = "force-dynamic";

function session(request) {
  const current = verifyScoringSession(scoringTokenFromRequest(request));
  if (current.scope !== "match") throw new Error("Participant match access is required.");
  return current;
}

async function telemetryGET(request) {
  try {
    const current = session(request);
    const requireWritable = new URL(request.url).searchParams.get("syncRebase") === "1";
    const authorization = await validateAuthoritativeParticipantSession(request, current,
      { requireWritable, cookieStore: await cookies() });
    const scoring = await readParticipantScoringMatch({
      matchId: current.matchId,
      currentPlayerId: current.playerId,
      authorization: {
        verified: current.scope === "admin" || authorization.canonical?.authorization?.verified === true ||
          authorization.authorization?.allowed === true,
        writable: authorization.writable === true,
      },
      canonicalData: authorization.canonical,
    });
    const mutationContract = await currentScoringMutationAuthorityContract({ request });
    return NextResponse.json({
      data: attachScoringMutationAuthorityContract(
        { ...scoring.data, readDiagnostics: scoring.diagnostics },
        mutationContract,
      ),
    }, { headers: scoringReadResponseHeaders(scoring.diagnostics) });
  } catch (error) {
    recordOperationalError(error);
    const status = Number(error?.status) || (/temporarily unavailable/i.test(error?.message || "") ? 503 : 403);
    return NextResponse.json({ error: error?.message || "Unable to load scoring.", code: error?.code || "" },
      { status, headers: { "Cache-Control": "no-store" } });
  }
}

async function telemetryPOST(request) {
  const candidateReadOnly = productionShadowScoringMutationResponse(request);
  if (candidateReadOnly) return candidateReadOnly;
  try {
    const authorizationStartedAt = Date.now();
    const current = session(request);
    const verifiedAuthorization = await validateAuthoritativeParticipantSession(request, current,
      { requireWritable: true, cookieStore: await cookies() });
    const authorizationMs = Date.now() - authorizationStartedAt;
    emitOperationalEvent({ event: "PHASE", domain: "AUTHORIZATION", phase: "authorization", latency_ms: authorizationMs, outcome: "NOT_APPLICABLE" });
    const rate = consumeRateLimit(`scoring-write:${clientAddress(request)}:${current.matchId}`, { limit: 30, windowMs: 60_000 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many score updates. Wait a moment and try again." }, { status: 429 });
    const submitted = await request.json();
    const input = submitted.action === "confirm" ? submitted : normalizeLiveScoringRequest(submitted);
    const measured = await persistParticipantScore({ matchId: current.matchId, input, current,
      updatedBy: current.scorerName || "Authorized participant",
      authorizationContext: verifiedAuthorization,
      request });
    const result = measured.result;
    const { _shadow, ...participantResult } = result;
    let authoritativeFinal = null;
    if (measured.authority === "supabase" && input.action === "confirm") {
      try {
        authoritativeFinal = await readScoringMatchView(current.matchId, {
          currentPlayerId: current.playerId,
          authorizationVerified: true,
          writable: false,
        });
      } catch (error) {
    recordOperationalError(error);
        // The Finalization transaction already committed. A follow-up read can
        // recover on the next scorecard open and must not reverse success.
        console.error("Supabase Finalization confirmation read remains pending", {
          matchId: current.matchId,
          code: error?.code || "SCORING_FINAL_READ_UNAVAILABLE",
        });
      }
    }
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
            mutationKey: input.clientMutationId || `scoring:${current.matchId}`,
            matchId: current.matchId,
          }),
        ]);
        if (derived.status === "rejected") console.error("Competition derived-state recalculation remains pending", {
          matchId: current.matchId, code: derived.reason?.code || "DERIVED_STATE_RECALCULATION_FAILED",
        });
        if (intelligence.status === "rejected") console.error("Intelligence recalculation remains pending", {
          matchId: current.matchId, code: intelligence.reason?.code || "INTELLIGENCE_RECALCULATION_FAILED",
        });
        if (calcutta.status === "rejected") console.error("Calcutta recalculation remains pending", {
          matchId: current.matchId, code: calcutta.reason?.code || "CALCUTTA_RECALCULATION_FAILED",
        });
      });
    }
    return NextResponse.json({
      result: participantResult,
      ...(authoritativeFinal ? {
        authoritativeData: { ...authoritativeFinal.data, readDiagnostics: authoritativeFinal.diagnostics },
      } : {}),
    }, { headers: authoritativeFinal ? scoringReadResponseHeaders(authoritativeFinal.diagnostics) : { "Cache-Control": "no-store" } });
  } catch (error) {
    recordOperationalError(error);
    const conflict = Number(error?.status) === 409 || /updated by someone else/i.test(error?.message || "");
    const diagnostics = error?.authoritativeDiagnostics || {};
    logScoringFailure(error, { route: "/api/scoring/current", conflict });
    return NextResponse.json({
      error: participantScoringError(error),
      code: error?.code || diagnostics.code || "",
      currentMatchRevision: Number.isFinite(Number(diagnostics.current_match_revision)) ? Number(diagnostics.current_match_revision) : undefined,
    }, { status: conflict ? 409 : participantScoringHttpStatus(error), headers: participantScoringPauseHeaders(error) });
  }
}

export const GET = withOperationalRoute({ route: "/api/scoring/current", domain: "SCORING" }, telemetryGET);

export const POST = withOperationalRoute({ route: "/api/scoring/current", domain: "SCORING" }, telemetryPOST);
