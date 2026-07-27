import { NextResponse } from "next/server";
import { authenticateLiveMatchCode } from "../../../../lib/google-sheets-write.js";
import { createScoringSession } from "../../../../lib/scoring-access.js";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const rateLimit = consumeRateLimit(`scoring-login:${clientAddress(request)}`, {
    limit: 5,
    windowMs: 5 * 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many scoring login attempts. Wait a few minutes and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))) },
      }
    );
  }
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
