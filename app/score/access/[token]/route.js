import { NextResponse } from "next/server";
import { authenticateParticipantMatch } from "../../../../lib/google-sheets-write.js";
import { createScoringSession, scoringSessionCookie } from "../../../../lib/scoring-access.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { token } = await params;
    const access = await authenticateParticipantMatch({ token });
    const session = createScoringSession({ scope: "match", ...access, scorerName: "QR participant" });
    const response = NextResponse.redirect(new URL("/score?authorized=qr", request.url));
    response.cookies.set(scoringSessionCookie(session));
    return response;
  } catch {
    return NextResponse.redirect(new URL("/score?error=invalid-access", request.url));
  }
}
