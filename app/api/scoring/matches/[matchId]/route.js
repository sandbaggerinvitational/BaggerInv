import { after, NextResponse } from "next/server";
import { canScoreMatch, scoringTokenFromRequest, verifyScoringSession } from "../../../../../lib/scoring-access.js";
import {
  readLiveScoringMatch,
  validateParticipantSession,
} from "../../../../../lib/google-sheets-write.js";
import { clientAddress, consumeRateLimit } from "../../../../../lib/rate-limit.js";
import { normalizeLiveScoringRequest } from "../../../../../lib/live-score-values.js";
import { logScoringFailure, participantScoringError } from "../../../../../lib/scoring-api-errors.js";
import { buildScoringShadowObservation, deliverScoringShadowObservation, shouldScheduleScoringShadowObservation } from "../../../../../lib/scoring-shadow.js";
import { scoringShadowEnvironment } from "../../../../../lib/scoring-shadow-gate.js";
import { persistParticipantScore } from "../../../../../lib/scoring-persistence-adapter.js";
import { drainGoogleOutbox } from "../../../../../lib/scoring-google-outbox.js";

export const dynamic = "force-dynamic";

function session(request) {
  return verifyScoringSession(scoringTokenFromRequest(request));
}

export async function GET(request, { params }) {
  try {
    const current = session(request);
    const { matchId } = await params;
    if (!canScoreMatch(current, matchId)) throw new Error("This code cannot access that match.");
    await validateParticipantSession(current);
    return NextResponse.json({ data: await readLiveScoringMatch(matchId) });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unable to load scoring." }, { status: 403 });
  }
}

export async function POST(request, { params }) {
  try {
    const authorizationStartedAt = Date.now();
    const current = session(request);
    const { matchId } = await params;
    if (!canScoreMatch(current, matchId)) throw new Error("This code cannot update that match.");
    await validateParticipantSession(current, { requireWritable: true });
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
      updatedBy: current.scorerName || "Authorized scorer" });
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
        const drained = await drainGoogleOutbox({ maximum: 8, actor: "Supabase scoring mirror" });
        if (!drained.ok) console.error("Supabase Google outbox remains pending", { matchId, failed: drained.failed });
      });
    }
    return NextResponse.json({ result: participantResult });
  } catch (error) {
    const conflict = Number(error?.status) === 409 || /updated by someone else/i.test(error?.message || "");
    logScoringFailure(error, { route: "/api/scoring/matches/[matchId]", conflict });
    return NextResponse.json(
      {
        error: participantScoringError(error),
      },
      { status: conflict ? 409 : Number(error?.status) === 403 ? 403 : 400 }
    );
  }
}
