import { resolvePreviewImpersonationIdentity, validatePlayerPassport } from "./google-sheets-write.js";
import { isPreviewImpersonationSession, verifyPlayerPassportSession } from "./player-passport.js";
import { isTournamentDirectorActor } from "./player-role.js";

export async function inspectPlayerPassportToken(token) {
  if (!token) return { status: "inactive", identity: null };
  let session;
  try {
    session = verifyPlayerPassportSession(token);
  } catch {
    return { status: "inactive", identity: null };
  }
  try {
    if (isPreviewImpersonationSession(session)) {
      return { status: "active", identity: await resolvePreviewImpersonationIdentity(session) };
    }
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

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const DIRECTOR_VERIFICATION_RETRY_DELAYS = [150, 350, 750];

export async function inspectTournamentDirectorToken(token) {
  let result = await inspectPlayerPassportToken(token);
  for (const delay of DIRECTOR_VERIFICATION_RETRY_DELAYS) {
    if (result.status !== "unavailable") break;
    await wait(delay);
    result = await inspectPlayerPassportToken(token);
  }
  if (result.status !== "active") return result;
  return isTournamentDirectorActor(result.identity)
    ? result
    : { status: "forbidden", identity: result.identity };
}
