import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canScoreMatch, scoringTokenFromRequest, verifyScoringSession } from "../../../../../lib/scoring-access.js";
import { clientAddress, consumeRateLimit } from "../../../../../lib/rate-limit.js";
import { normalizeLiveScoringRequest } from "../../../../../lib/live-score-values.js";
import { logScoringFailure, participantScoringError, participantScoringHttpStatus, participantScoringPauseHeaders } from "../../../../../lib/scoring-api-errors.js";
import { buildScoringShadowObservation, deliverScoringShadowObservation, shouldScheduleScoringShadowObservation } from "../../../../../lib/scoring-shadow.js";
import { scoringShadowEnvironment } from "../../../../../lib/scoring-shadow-gate.js";
import { persistParticipantScore } from "../../../../../lib/scoring-persistence-adapter.js";
import { drainGoogleOutbox } from "../../../../../lib/scoring-google-outbox.js";
import { validateAuthoritativeParticipantSession } from "../../../../../lib/scoring-participant-authorization.js";
import { recalculateCompetitionDerivedTournament } from "../../../../../lib/competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "../../../../../lib/intelligence-derived-supabase.js";
import { recalculateCalcuttaAfterCanonicalMutation } from "../../../../../lib/calcutta-post-commit.js";
import { drainScorecardArchiveJobs } from "../../../../../lib/scorecard-archive-worker.js";
import { readParticipantScoringMatch, scoringReadResponseHeaders } from "../../../../../lib/scoring-read-service.js";
import { productionShadowScoringMutationResponse } from "../../../../../lib/production-shadow-scoring-safety.js";
import { productionCutoverPhaseAtLeast } from "../../../../../lib/production-cutover-activation-contract.js";
import { attachScoringMutationAuthorityContract, currentScoringMutationAuthorityContract } from "../../../../../lib/scoring-mutation-authority-server.js";

export const dynamic = "force-dynamic";

function session(request) {
  return verifyScoringSession(scoringTokenFromRequest(request));
}

export async function GET(request, { params }) {
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
    return NextResponse.json({ error: error?.message || "Unable to load scoring.", code: error?.code || "" },
      { status: Number(error?.status) || 403, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request, { params }) {
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
    const persistenceStartedAt = Date.now();
    const measured = await persistParticipantScore({ matchId, input, current,
      updatedBy: current.scorerName || "Authorized scorer",
      authorizationContext: verifiedAuthorization,
      request });
    const result = measured.result;
    const googleDiagnostics = measured.diagnostics;
    const googleAuthoritativeMs = measured.authority === "google" ? Date.now() - persistenceStartedAt : 0;
    const { _shadow, ...participantResult } = result;
    const gate = scoringShadowEnvironment();
    if (measured.authority === "google" && shouldScheduleScoringShadowObservation({ gate, participantResult, shadow: _shadow })) {
      const observation = buildScoringShadowObservation({
        sourceWorkbookId: gate.sourceWorkbookId,
        tournamentId: _shadow.match?.["Tournament ID"] || _shadow.match?.Year,
        tournamentYear: _shadow.match?.Year,
        match: _shadow.match,
        hole: participantResult.hole,
        calculated: _shadow.calculated,
        allHoleResults: _shadow.allHoleResults,
        mutationKey: input.clientMutationId || `finalize:${matchId}:${participantResult["Finalized At"] || participantResult["Updated At"]}`,
        actorId: current.playerId,
        actorName: current.scorerName,
      });
      after(async () => {
        try {
          const mirror = await deliverScoringShadowObservation(observation);
          console.info("Scoring shadow delivery", {
            matchId, holeNumber: observation.hole_number, googleRevision: observation.google_revision,
            comparisonStatus: observation.comparison_status, authorizationMs, googleAuthoritativeMs,
            googleDiagnostics,
            mirrorDurationMs: mirror.totalDurationMs,
          });
        } catch (error) {
          console.error("Scoring shadow delivery failed", {
            matchId, holeNumber: observation.hole_number, googleRevision: observation.google_revision,
            status: error?.status || 0, diagnostics: error?.shadowDiagnostics || {},
          });
        }
      });
    }
    if (measured.authority === "supabase") {
      after(async () => {
        const productionWorkersAvailable = process.env.VERCEL_ENV !== "production" ||
          productionCutoverPhaseAtLeast(process.env, "WORKERS");
        const [drained, archive, derived, intelligence, calcutta] = await Promise.allSettled([
          productionWorkersAvailable
            ? drainGoogleOutbox({ maximum: 8, actor: "Supabase scoring mirror" })
            : Promise.resolve({ ok: true, delivered: 0, failed: 0, pending: true }),
          productionWorkersAvailable
            ? drainScorecardArchiveJobs({ maximum: 4, stopOnFailure: false })
            : Promise.resolve({ ok: true, deliveries: [], pending: true }),
          recalculateCompetitionDerivedTournament(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring derived-state worker · ${current.playerId || "participant"}`,
          }),
          recalculateIntelligenceDerivedTournament(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring intelligence worker · ${current.playerId || "participant"}`,
          }),
          recalculateCalcuttaAfterCanonicalMutation(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring Calcutta worker · ${current.playerId || "participant"}`,
            mutationKey: input.clientMutationId || `scoring:${matchId}`,
          }),
        ]);
        const mirror = drained.status === "fulfilled" ? drained.value : { ok: false, failed: 1 };
        if (!mirror.ok) console.error("Supabase Google outbox remains pending", { matchId, failed: mirror.failed });
        if (archive.status === "rejected" || !archive.value?.ok) console.error("Round Scorecards archive remains pending", {
          matchId, code: archive.reason?.code || archive.value?.deliveries?.find((item) => !item.ok)?.errorCode || "ARCHIVE_PENDING",
        });
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
