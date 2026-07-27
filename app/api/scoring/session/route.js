import { NextResponse } from "next/server";
import { authenticateLiveMatchCode } from "../../../../lib/google-sheets-write.js";
import { createScoringSession } from "../../../../lib/scoring-access.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { accessCode, adminSecret, scorerName } = await request.json();
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
    const matchId = await authenticateLiveMatchCode(accessCode);
    return NextResponse.json({
      token: createScoringSession({ scope: "match", matchId, scorerName }),
      scope: "match",
      matchId,
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unable to open scoring." }, { status: 401 });
  }
}
