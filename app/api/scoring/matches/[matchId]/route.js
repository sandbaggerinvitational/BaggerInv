import { NextResponse } from "next/server";
import { canScoreMatch, scoringTokenFromRequest, verifyScoringSession } from "../../../../../lib/scoring-access.js";
import {
  confirmLiveMatchScorecard,
  readLiveScoringMatch,
  saveLiveHoleScore,
  validateParticipantSession,
} from "../../../../../lib/google-sheets-write.js";
import { clientAddress, consumeRateLimit } from "../../../../../lib/rate-limit.js";

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
    const current = session(request);
    const { matchId } = await params;
    if (!canScoreMatch(current, matchId)) throw new Error("This code cannot update that match.");
    await validateParticipantSession(current, { requireWritable: true });
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
    const input = await request.json();
    const result = input.action === "confirm"
      ? await confirmLiveMatchScorecard(matchId, current.scorerName || "Authorized scorer")
      : await saveLiveHoleScore(matchId, input, current.scorerName || "Authorized scorer");
    return NextResponse.json({ result });
  } catch (error) {
    const conflict = /updated by someone else/i.test(error?.message || "");
    return NextResponse.json(
      { error: error?.message || "Unable to save the hole." },
      { status: conflict ? 409 : 400 }
    );
  }
}
