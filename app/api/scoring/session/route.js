import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticateParticipantMatch } from "../../../../lib/google-sheets-write.js";
import { createScoringSession, scoringSessionCookie, scoringTokenFromRequest, verifyScoringSession, SCORING_SESSION_COOKIE } from "../../../../lib/scoring-access.js";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit.js";
import { validateAuthoritativeParticipantSession } from "../../../../lib/scoring-participant-authorization.js";
import { requireScoringAuthority } from "../../../../lib/scoring-authority.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = verifyScoringSession(scoringTokenFromRequest(request));
    await validateAuthoritativeParticipantSession(request, session, { cookieStore: await cookies() });
    return NextResponse.json({
      scope: session.scope,
      scorerName: session.scorerName,
      matchId: session.matchId,
      tournamentId: session.tournamentId,
      readOnly: session.readOnly === true,
      authorized: true,
    });
  } catch {
    return NextResponse.json({ authorized: false }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ cleared: true });
  response.cookies.set({ ...scoringSessionCookie("", 0), name: SCORING_SESSION_COOKIE });
  return response;
}

export async function POST(request) {
  try {
    const authority = requireScoringAuthority();
    if (authority.resolved === "supabase") {
      return NextResponse.json({
        error: "Legacy match-code and admin-secret scoring sessions are unavailable under Supabase authority.",
        code: "LEGACY_SCORING_SESSION_DISABLED_UNDER_SUPABASE_AUTHORITY",
      }, { status: 409 });
    }
    const { selector, accessCode, adminSecret, scorerName } = await request.json();
    if (!String(scorerName || "").trim()) throw new Error("Enter your name.");
    const allowedAdmins = [
      process.env.ADMIN_SECRET,
      process.env.LIVE_ADMIN_SECRET,
    ].filter(Boolean);
    if (adminSecret && allowedAdmins.includes(adminSecret)) {
      return NextResponse.json({
        token: createScoringSession({ scope: "admin", scorerName }),
        scope: "admin",
      });
    }
    const rate = consumeRateLimit(`participant-access:${clientAddress(request)}:${String(selector || "").slice(0, 32)}`, { limit: 5, windowMs: 10 * 60_000 });
    if (!rate.allowed) return NextResponse.json({ error: "Unable to authorize this match." }, { status: 429 });
    const access = await authenticateParticipantMatch({ selector, code: accessCode });
    const token = createScoringSession({ scope: "match", ...access, scorerName });
    const response = NextResponse.json({
      scope: "match",
      authorized: true,
    });
    response.cookies.set(scoringSessionCookie(token));
    return response;
  } catch (error) {
    if (error?.code === "SCORING_AUTHORITY_UNAVAILABLE") {
      return NextResponse.json({ error: error.message, code: error.code }, { status: Number(error.status || 503) });
    }
    return NextResponse.json({ error: "Unable to authorize this match." }, { status: 401 });
  }
}
