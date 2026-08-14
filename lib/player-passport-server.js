import { resolvePreviewImpersonationIdentity, validatePlayerPassport } from "./google-sheets-write.js";
import {
  hasPreviewImpersonationLease,
  isPreviewImpersonationSession,
  PREVIEW_IMPERSONATION_TOURNAMENT_ID,
  verifyPlayerPassportSession,
} from "./player-passport.js";
import { verifyPreviewIdentityImpersonation } from "./participant-identity-supabase.js";
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
const clean = (value) => String(value ?? "").trim();

function directorPassportSession(session) {
  const {
    impersonatedPlayerId: _impersonatedPlayerId,
    previewImpersonationLeaseId: _previewImpersonationLeaseId,
    previewDirector: _previewDirector,
    ...directorSession
  } = session || {};
  return directorSession;
}

function deniedPreviewImpersonation(code = "IMPERSONATION_LEASE_NOT_FOUND") {
  return { status: "forbidden", identity: null, code };
}

export async function inspectPreviewImpersonationDirectorSession(session, dependencies = {}) {
  const env = dependencies.env || process.env;
  if (clean(env.VERCEL_ENV).toLowerCase() !== "preview" || !isPreviewImpersonationSession(session)) {
    return deniedPreviewImpersonation("PREVIEW_IMPERSONATION_UNAVAILABLE");
  }
  if (!hasPreviewImpersonationLease(session)) {
    return deniedPreviewImpersonation("IMPERSONATION_LEASE_NOT_FOUND");
  }
  if (clean(session.tournamentId) !== PREVIEW_IMPERSONATION_TOURNAMENT_ID) {
    return deniedPreviewImpersonation("WRONG_TOURNAMENT");
  }

  const verifyLease = dependencies.verifyLease || verifyPreviewIdentityImpersonation;
  let lease;
  try {
    lease = await verifyLease({
      leaseId: session.previewImpersonationLeaseId,
      tournamentId: session.tournamentId,
      directorPlayerId: session.playerId,
      playerId: session.impersonatedPlayerId,
    }, dependencies.rpcOptions);
  } catch {
    return { status: "unavailable", identity: null, code: "IMPERSONATION_LEASE_UNAVAILABLE" };
  }
  if (!lease.payload?.ok) {
    return deniedPreviewImpersonation(clean(lease.payload?.code) || "IMPERSONATION_LEASE_NOT_FOUND");
  }
  const leaseExpiresAt = Date.parse(lease.payload.expiresAt);
  const leaseContext = lease.payload.context || {};
  if (
    clean(lease.payload.leaseId) !== clean(session.previewImpersonationLeaseId) ||
    clean(lease.payload.directorPlayerId) !== clean(session.playerId) ||
    clean(lease.payload.targetPlayerId) !== clean(session.impersonatedPlayerId) ||
    !Number.isFinite(leaseExpiresAt) ||
    leaseExpiresAt <= Date.now() ||
    clean(leaseContext.playerId) !== clean(session.impersonatedPlayerId) ||
    clean(leaseContext.tournament?.id) !== clean(session.tournamentId) ||
    leaseContext.membership?.active !== true ||
    Number(leaseContext.contextRevision || 0) <= 0
  ) {
    return deniedPreviewImpersonation("IMPERSONATION_LEASE_MISMATCH");
  }

  const validateDirector = dependencies.validateDirector || validatePlayerPassport;
  let directorIdentity;
  try {
    directorIdentity = await validateDirector(directorPassportSession(session));
  } catch (error) {
    return error instanceof Error && error.message === "Player Passport is no longer active."
      ? { status: "inactive", identity: null, code: "DIRECTOR_SESSION_INACTIVE" }
      : { status: "unavailable", identity: null, code: "DIRECTOR_SESSION_UNAVAILABLE" };
  }
  if (
    !isTournamentDirectorActor(directorIdentity) ||
    clean(directorIdentity.actor?.id || directorIdentity.player?.id) !== clean(session.playerId) ||
    clean(session.previewDirector?.id) !== clean(session.playerId)
  ) {
    return deniedPreviewImpersonation("DIRECTOR_SESSION_MISMATCH");
  }
  return {
    status: "active",
    identity: {
      ...directorIdentity,
      session,
      actor: directorIdentity.actor,
      impersonating: true,
      previewMode: true,
      impersonation: {
        leaseId: clean(lease.payload.leaseId || session.previewImpersonationLeaseId),
        targetPlayerId: clean(lease.payload.targetPlayerId),
        expiresAt: lease.payload.expiresAt,
      },
    },
  };
}

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

export async function inspectTournamentDirectorToken(token, dependencies = {}) {
  let session;
  try {
    session = (dependencies.verifySession || verifyPlayerPassportSession)(token, dependencies.passportSecret);
  } catch {
    return { status: "inactive", identity: null };
  }
  if (isPreviewImpersonationSession(session)) {
    return inspectPreviewImpersonationDirectorSession(session, dependencies);
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
