import { NextResponse } from "next/server";
import { activatePlayerPassport, readPlayerPassportActivationOptions } from "../../../../lib/google-sheets-write.js";
import { createPlayerPassportSession, playerPassportCookie, previewDirectorPassportCookie, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";
import { initializeParticipantTournament, invalidateParticipantInitialization } from "../../../../lib/participant-initialization.js";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit.js";
import { withProductionGoogleAuthoringWrite } from "../../../../lib/production-google-authoring.js";
import { GOOGLE_AUTHORING_OPERATIONS } from "../../../../lib/google-workbook-mutation-intent.js";

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
  let reference = "";
  try {
    const payload = await request.json();
    reference = payload.reference;
    const { activationCode, deviceLabel } = payload;
    const rate = consumeRateLimit(`passport-activation:${clientAddress(request)}:${String(reference || "").slice(0, 24)}`, { limit: 5, windowMs: 15 * 60_000 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Wait 15 minutes, then generate a new code and try again." }, { status: 429 });
    const activated = await withProductionGoogleAuthoringWrite({
      request,
      operation: GOOGLE_AUTHORING_OPERATIONS.PASSPORT_ROLLBACK,
    }, async () => await activatePlayerPassport({ reference, code: activationCode, deviceLabel }));
    const token = createPlayerPassportSession(activated);
    const session = verifyPlayerPassportSession(token);
    invalidateParticipantInitialization(session);
    let initialized = false;
    try {
      await initializeParticipantTournament(session);
      initialized = true;
    } catch (error) {
      // Activation is already committed. Home continues the same initialization
      // transaction instead of asking the player to reuse a consumed code.
      console.warn("Player Passport activated; tournament initialization is still recovering", {
        tournamentId: session.tournamentId,
        playerId: session.playerId,
        reason: error?.message || String(error),
      });
    }
    const response = NextResponse.json({ activated: true, initialized, player: activated.player });
    response.cookies.set(playerPassportCookie(token));
    if (process.env.VERCEL_ENV === "preview") {
      const director = await inspectTournamentDirectorToken(token);
      if (director.status === "active") response.cookies.set(previewDirectorPassportCookie(token));
    }
    return response;
  } catch (error) {
    const reason = String(error?.code || "PASSPORT_ACTIVATION_INTERNAL_ERROR");
    console.error("Player Passport activation failed", {
      reason,
      referenceSuffix: String(reference || "").slice(-6),
      environment: process.env.VERCEL_ENV || "local",
      detail: reason === "PASSPORT_ACTIVATION_INTERNAL_ERROR"
        ? (error instanceof Error ? error.message : String(error))
        : undefined,
    });
    const credentialFailure = [
      "PASSPORT_REFERENCE_NOT_FOUND",
      "PASSPORT_ACTIVATION_INACTIVE",
      "PASSPORT_ACTIVATION_EXPIRED",
      "PASSPORT_CODE_HASH_MISSING",
      "PASSPORT_CODE_MISMATCH",
      "PASSPORT_PLAYER_NOT_ELIGIBLE",
    ].includes(reason);
    return NextResponse.json(
      {
        error: credentialFailure
          ? "That activation code is not valid. Generate a new code and try again."
          : "Player Passport could not save this device. Please try again.",
      },
      { status: credentialFailure ? 401 : 500 }
    );
  }
}
