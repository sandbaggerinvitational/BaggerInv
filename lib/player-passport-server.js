import { resolvePreviewImpersonationIdentity, validatePlayerPassport } from "./google-sheets-write.js";
import { isPreviewImpersonationSession, verifyPlayerPassportSession } from "./player-passport.js";
import { isTournamentDirectorActor } from "./player-role.js";
import { createHash } from "node:crypto";

const DIRECTOR_IDENTITY_TTL_MS = 5 * 60 * 1000;
const directorIdentityCache = new Map();
const pendingDirectorInspections = new Map();
const directorIdentityMetrics = { workbookVerifications: 0, cacheHits: 0, dedupeHits: 0, retries: 0 };
const directorTokenKey = (token) => createHash("sha256").update(String(token || "")).digest("base64url");

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
  try {
    verifyPlayerPassportSession(token);
  } catch {
    return { status: "inactive", identity: null };
  }
  const key = directorTokenKey(token);
  const cached = directorIdentityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    directorIdentityMetrics.cacheHits += 1;
    return cached.result;
  }
  if (pendingDirectorInspections.has(key)) {
    directorIdentityMetrics.dedupeHits += 1;
    return pendingDirectorInspections.get(key);
  }
  const inspection = (async () => {
    directorIdentityMetrics.workbookVerifications += 1;
    let result = await inspectPlayerPassportToken(token);
    for (const delay of DIRECTOR_VERIFICATION_RETRY_DELAYS) {
      if (result.status !== "unavailable") break;
      directorIdentityMetrics.retries += 1;
      await wait(delay);
      result = await inspectPlayerPassportToken(token);
    }
    const authorized = result.status !== "active" ? result : isTournamentDirectorActor(result.identity)
      ? result
      : { status: "forbidden", identity: result.identity };
    if (authorized.status === "active") directorIdentityCache.set(key, { result: authorized, expiresAt: Date.now() + DIRECTOR_IDENTITY_TTL_MS });
    else directorIdentityCache.delete(key);
    return authorized;
  })().finally(() => pendingDirectorInspections.delete(key));
  pendingDirectorInspections.set(key, inspection);
  return inspection;
}

export function tournamentDirectorIdentityDiagnostics() {
  return { ...directorIdentityMetrics, activeSessions: directorIdentityCache.size, pendingVerifications: pendingDirectorInspections.size, cacheTtlMs: DIRECTOR_IDENTITY_TTL_MS };
}
