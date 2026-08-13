import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { scoringTokenFromRequest, verifyScoringSession } from "../../../../lib/scoring-access.js";
import { readLiveScoringMatch } from "../../../../lib/google-sheets-write.js";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit.js";
import { normalizeLiveScoringRequest } from "../../../../lib/live-score-values.js";
import { logScoringFailure, participantScoringError } from "../../../../lib/scoring-api-errors.js";
import { buildScoringShadowObservation, deliverScoringShadowObservation, shouldScheduleScoringShadowObservation } from "../../../../lib/scoring-shadow.js";
import { scoringShadowEnvironment } from "../../../../lib/scoring-shadow-gate.js";
import { persistParticipantScore } from "../../../../lib/scoring-persistence-adapter.js";
import { drainGoogleOutbox } from "../../../../lib/scoring-google-outbox.js";
import { scoringAuthorityEnvironment } from "../../../../lib/scoring-authority.js";
import { readPreviewScoringParticipantContext } from "../../../../lib/scoring-authority-supabase.js";
import { mergeParticipantScoringAuthorityState } from "../../../../lib/scoring-participant-authority-state.js";
import { validateAuthoritativeParticipantSession } from "../../../../lib/scoring-participant-authorization.js";
import { recalculateCompetitionDerivedTournament } from "../../../../lib/competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "../../../../lib/intelligence-derived-supabase.js";
import { recalculateCalcuttaTournament } from "../../../../lib/calcutta-supabase.js";

export const dynamic = "force-dynamic";

function session(request) {
  const current = verifyScoringSession(scoringTokenFromRequest(request));
  if (current.scope !== "match") throw new Error("Participant match access is required.");
  return current;
}

export async function GET(request) {
  try {
    const current = session(request);
    const requireWritable = new URL(request.url).searchParams.get("syncRebase") === "1";
    const authorization = await validateAuthoritativeParticipantSession(request, current,
      { requireWritable, cookieStore: await cookies() });
    const googleData = await readLiveScoringMatch(current.matchId);
    const authority = scoringAuthorityEnvironment();
    if (authority.resolved !== "supabase") return NextResponse.json({ data: googleData });
    const canonical = authorization.canonical ? { payload: { ok: true, data: authorization.canonical } }
      : await readPreviewScoringParticipantContext({
      tournament_id: String(current.tournamentId || current.year || "2026"),
      match_id: current.matchId,
      player_id: String(current.playerId || `match-access:${current.matchId}`),
      permission_revision: Number(current.accessVersion || 1),
      passport_verified: true,
      role: current.playerId ? "PLAYER" : "MATCH_ACCESS",
      });
    if (!canonical.payload?.ok || !canonical.payload?.data?.match) {
      if (requireWritable) return NextResponse.json({ error: "Authoritative scoring state is temporarily unavailable." }, { status: 503 });
      return NextResponse.json({ data: googleData });
    }
    return NextResponse.json({
      data: mergeParticipantScoringAuthorityState(googleData, canonical.payload.data, {
        authorizationVerified: canonical.payload.data.authorization?.verified === true,
      }),
    });
  } catch (error) {
    const status = Number(error?.status) || (/temporarily unavailable/i.test(error?.message || "") ? 503 : 403);
    return NextResponse.json({ error: error?.message || "Unable to load scoring." }, { status });
  }
}

export async function POST(request) {
  try {
    const authorizationStartedAt = Date.now();
    const current = session(request);
    await validateAuthoritativeParticipantSession(request, current, { requireWritable: true, cookieStore: await cookies() });
    const authorizationMs = Date.now() - authorizationStartedAt;
    const rate = consumeRateLimit(`scoring-write:${clientAddress(request)}:${current.matchId}`, { limit: 30, windowMs: 60_000 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many score updates. Wait a moment and try again." }, { status: 429 });
    const submitted = await request.json();
    const input = submitted.action === "confirm" ? submitted : normalizeLiveScoringRequest(submitted);
    const persistenceStartedAt = Date.now();
    const measured = await persistParticipantScore({ matchId: current.matchId, input, current,
      updatedBy: current.scorerName || "Authorized participant" });
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
          mutationKey: input.clientMutationId || `finalize:${current.matchId}:${participantResult["Finalized At"] || participantResult["Updated At"]}`,
          actorId: current.playerId,
          actorName: current.scorerName,
        });
        after(async () => {
          try {
            const mirror = await deliverScoringShadowObservation(observation);
            console.info("Scoring shadow delivery", {
              matchId: observation.match_id,
              holeNumber: observation.hole_number,
              googleRevision: observation.google_revision,
              comparisonStatus: observation.comparison_status,
              authorizationMs,
              googleAuthoritativeMs,
              googleDiagnostics,
              mirrorDurationMs: mirror.totalDurationMs,
            });
          } catch (error) {
            console.error("Scoring shadow delivery failed", {
              matchId: observation.match_id,
              holeNumber: observation.hole_number,
              googleRevision: observation.google_revision,
              status: error?.status || 0,
              diagnostics: error?.shadowDiagnostics || {},
            });
          }
        });
    }
    if (measured.authority === "supabase") {
      after(async () => {
        const [drained, derived, calcutta] = await Promise.allSettled([
          drainGoogleOutbox({ maximum: 8, actor: "Supabase scoring mirror" }),
          recalculateCompetitionDerivedTournament(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring derived-state worker · ${current.playerId || "participant"}`,
          }),
          recalculateIntelligenceDerivedTournament(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring intelligence worker · ${current.playerId || "participant"}`,
          }),
          recalculateCalcuttaTournament(String(current.tournamentId || current.year || ""), {
            calculatedBy: `Scoring Calcutta worker · ${current.playerId || "participant"}`,
          }),
        ]);
        const mirror = drained.status === "fulfilled" ? drained.value : { ok: false, failed: 1 };
        if (!mirror.ok) console.error("Supabase Google outbox remains pending", { matchId: current.matchId, failed: mirror.failed });
        if (derived.status === "rejected") console.error("Competition derived-state recalculation remains pending", {
          matchId: current.matchId, code: derived.reason?.code || "DERIVED_STATE_RECALCULATION_FAILED",
        });
        if (calcutta.status === "rejected") console.error("Calcutta recalculation remains pending", {
          matchId: current.matchId, code: calcutta.reason?.code || "CALCUTTA_RECALCULATION_FAILED",
        });
      });
    }
    return NextResponse.json({ result: participantResult });
  } catch (error) {
    const conflict = Number(error?.status) === 409 || /updated by someone else/i.test(error?.message || "");
    const diagnostics = error?.authoritativeDiagnostics || {};
    logScoringFailure(error, { route: "/api/scoring/current", conflict });
    return NextResponse.json({
      error: participantScoringError(error),
      code: error?.code || diagnostics.code || "",
      currentMatchRevision: Number.isFinite(Number(diagnostics.current_match_revision)) ? Number(diagnostics.current_match_revision) : undefined,
    }, { status: conflict ? 409 : Number(error?.status) === 403 ? 403 : 400 });
  }
}
