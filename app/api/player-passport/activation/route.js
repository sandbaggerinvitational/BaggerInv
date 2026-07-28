import { NextResponse } from "next/server";
import { activatePlayerPassport, readPlayerPassportActivationOptions } from "../../../../lib/google-sheets-write.js";
import { createPlayerPassportSession, playerPassportCookie } from "../../../../lib/player-passport.js";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const reference = new URL(request.url).searchParams.get("player") || "";
    return NextResponse.json({ data: await readPlayerPassportActivationOptions(reference) });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load Player Passport activation." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { reference, activationCode, deviceLabel } = await request.json();
    const rate = consumeRateLimit(`passport-activation:${clientAddress(request)}:${String(reference || "").slice(0, 24)}`, { limit: 5, windowMs: 15 * 60_000 });
    if (!rate.allowed) return NextResponse.json({ error: "Unable to activate Player Passport." }, { status: 429 });
    const activated = await activatePlayerPassport({ reference, code: activationCode, deviceLabel });
    const token = createPlayerPassportSession(activated);
    const response = NextResponse.json({ activated: true, player: activated.player });
    response.cookies.set(playerPassportCookie(token));
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to activate Player Passport." }, { status: 401 });
  }
}
