import { validatePlayerPassport } from "./google-sheets-write.js";
import { verifyPlayerPassportSession } from "./player-passport.js";

export async function inspectPlayerPassportToken(token) {
  if (!token) return { status: "inactive", identity: null };
  let session;
  try {
    session = verifyPlayerPassportSession(token);
  } catch {
    return { status: "inactive", identity: null };
  }
  try {
    return { status: "active", identity: await validatePlayerPassport(session) };
  } catch (error) {
    if (error instanceof Error && error.message === "Player Passport is no longer active.") {
      return { status: "inactive", identity: null };
    }
    console.error("Player Passport validation temporarily unavailable", {
      tournamentId: session.tournamentId,
      playerId: session.playerId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { status: "unavailable", identity: null };
  }
}

export async function resolvePlayerPassportToken(token) {
  const result = await inspectPlayerPassportToken(token);
  return result.status === "active" ? result.identity : null;
}
