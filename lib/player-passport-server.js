import { resolvePreviewImpersonationIdentity, validatePlayerPassport } from "./google-sheets-write.js";
import { isPreviewImpersonationSession, verifyPlayerPassportSession } from "./player-passport.js";
import { isTournamentDirectorActor } from "./player-role.js";
import { createHash } from "node:crypto";

const DIRECTOR_IDENTITY_TTL_MS = 5 * 60 * 1000;
const PLAYER_IDENTITY_TTL_MS = 15 * 1000;
const PLAYER_VERIFICATION_RETRY_DELAYS = [150, 350, 750];
const directorIdentityCache = new Map();
const pendingDirectorInspections = new Map();
const playerIdentityCache = new Map();
const pendingPlayerInspections = new Map();
const directorIdentityMetrics = { workbookVerifications: 0, cacheHits: 0, dedupeHits: 0, retries: 0 };
const directorTokenKey = (token) => createHash("sha256").update(String(token || "")).digest("base64url");
const playerIdentityMetrics = { workbookVerifications: 0, cacheHits: 0, dedupeHits: 0, retries: 0 };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function inspectVerifiedPlayerSession(session) {
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

export async function inspectPlayerPassportToken(token) {
  if (!token) return { status: "inactive", identity: null };
  let session;
  try { session = verifyPlayerPassportSession(token); }
  catch { return { status: "inactive", identity: null }; }
  const key = directorTokenKey(token);
  const cached = playerIdentityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    playerIdentityMetrics.cacheHits += 1;
    return cached.result;
  }
  if (pendingPlayerInspections.has(key)) {
    playerIdentityMetrics.dedupeHits += 1;
    return pendingPlayerInspections.get(key);
  }
  const inspection = (async () => {
    playerIdentityMetrics.workbookVerifications += 1;
    let result = await inspectVerifiedPlayerSession(session);
    for (const delay of PLAYER_VERIFICATION_RETRY_DELAYS) {
      if (result.status !== "unavailable") break;
      playerIdentityMetrics.retries += 1;
      await wait(delay);
      result = await inspectVerifiedPlayerSession(session);
    }
    if (result.status === "active") playerIdentityCache.set(key, { result, expiresAt: Date.now() + PLAYER_IDENTITY_TTL_MS });
    else playerIdentityCache.delete(key);
    return result;
  })().finally(() => pendingPlayerInspections.delete(key));
  pendingPlayerInspections.set(key, inspection);
  return inspection;
}

export async function resolvePlayerPassportToken(token) {
  const result = await inspectPlayerPassportToken(token);
  return result.status === "active" ? result.identity : null;
}

const DIRECTOR_VERIFICATION_RETRY_DELAYS = [150, 350, 750];

export async function inspectTournamentDirectorToken(token) {
  let session;
  try {
    session = verifyPlayerPassportSession(token);
  } catch {
    return { status: "inactive", identity: null };
  }
  // A Preview impersonation passport can only be minted after a workbook-verified
  // Director authorized the impersonation request. Its embedded actor is signed by
  // the same server secret, so later Director-only Preview diagnostics do not need
  // another Google freshness read merely to recover that already-verified actor.
  if (isPreviewImpersonationSession(session)) {
    return {
      status: "active",
      identity: {
        session,
        player: { id: session.playerId, name: session.previewDirector.name, role: "DIRECTOR" },
        actor: session.previewDirector,
        impersonating: true,
        previewMode: true,
      },
    };
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

export function playerPassportIdentityDiagnostics() {
  return { ...playerIdentityMetrics, activeSessions: playerIdentityCache.size, pendingVerifications: pendingPlayerInspections.size, cacheTtlMs: PLAYER_IDENTITY_TTL_MS };
}
