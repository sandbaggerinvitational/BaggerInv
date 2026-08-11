import { NextResponse } from "next/server";
import { scoringTokenFromRequest, verifyScoringSession } from "../../../../lib/scoring-access.js";
import { validateParticipantSession } from "../../../../lib/google-sheets-write.js";
import { scoringAuthorityEnvironment } from "../../../../lib/scoring-authority.js";
import { recordPreviewScoringClientDiagnostic } from "../../../../lib/scoring-authority-supabase.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const number = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });

function safeMetrics(input = {}) {
  return Object.fromEntries([
    "validationMs", "indexedDbCommitMs", "queueEnqueueMs", "tapToStateAdvanceMs",
    "tapToVisualAdvanceMs", "nextHoleUsableMs", "authoritativeConfirmationMs", "queueClearMs",
  ].flatMap((key) => number(input[key]) == null ? [] : [[key, number(input[key])]]));
}

export async function POST(request) {
  const authority = scoringAuthorityEnvironment();
  if (!authority.previewDeployment || !authority.previewWorkbook || authority.resolved !== "supabase") return unavailable();
  try {
    const current = verifyScoringSession(scoringTokenFromRequest(request));
    if (current.scope !== "match") return unavailable();
    await validateParticipantSession(current);
    const submitted = await request.json();
    const matchId = clean(submitted.matchId);
    const mutationKey = clean(submitted.clientMutationId);
    const holeNumber = Number(submitted.holeNumber);
    if (matchId !== current.matchId || !mutationKey || !Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      return NextResponse.json({ error: "Invalid scoring diagnostics." }, { status: 400 });
    }
    const recorded = await recordPreviewScoringClientDiagnostic({
      environment: "PREVIEW",
      tournament_id: clean(current.tournamentId || current.year || "2026"),
      match_id: matchId,
      hole_number: holeNumber,
      mutation_key: mutationKey,
      player_id: clean(current.playerId || `match-access:${matchId}`),
      metrics: safeMetrics(submitted),
      local_measured_at: clean(submitted.measuredAt),
      authoritative_confirmed_at: clean(submitted.authoritativeConfirmedAt),
      queue_cleared_at: clean(submitted.queueClearedAt),
    });
    if (!recorded.payload?.ok) throw new Error("Preview scoring diagnostics could not be recorded.");
    return NextResponse.json({ recorded: true });
  } catch {
    return NextResponse.json({ error: "Preview scoring diagnostics could not be recorded." }, { status: 400 });
  }
}
