import { NextResponse } from "next/server";
import { scoringTokenFromRequest, verifyScoringSession } from "../../../../lib/scoring-access.js";
import { confirmLiveMatchScorecard, readLiveScoringMatch, saveLiveHoleScore, validateParticipantSession } from "../../../../lib/google-sheets-write.js";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit.js";
import { normalizeLiveScoringRequest } from "../../../../lib/live-score-values.js";
import { logScoringFailure, participantScoringError } from "../../../../lib/scoring-api-errors.js";

export const dynamic = "force-dynamic";

function session(request) {
  const current = verifyScoringSession(scoringTokenFromRequest(request));
  if (current.scope !== "match") throw new Error("Participant match access is required.");
  return current;
}

export async function GET(request) {
  try {
    const current = session(request);
    await validateParticipantSession(current);
    return NextResponse.json({ data: await readLiveScoringMatch(current.matchId) });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unable to load scoring." }, { status: 403 });
  }
}

export async function POST(request) {
  try {
    const current = session(request);
    await validateParticipantSession(current, { requireWritable: true });
    const rate = consumeRateLimit(`scoring-write:${clientAddress(request)}:${current.matchId}`, { limit: 30, windowMs: 60_000 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many score updates. Wait a moment and try again." }, { status: 429 });
    const submitted = await request.json();
    const input = submitted.action === "confirm" ? submitted : normalizeLiveScoringRequest(submitted);
    const result = input.action === "confirm"
      ? await confirmLiveMatchScorecard(current.matchId, current.scorerName || "Authorized participant")
      : await saveLiveHoleScore(current.matchId, input, current.scorerName || "Authorized participant");
    return NextResponse.json({ result });
  } catch (error) {
    const conflict = /updated by someone else/i.test(error?.message || "");
    logScoringFailure(error, { route: "/api/scoring/current", conflict });
    return NextResponse.json({
      error: participantScoringError(error),
    }, { status: conflict ? 409 : 400 });
  }
}
