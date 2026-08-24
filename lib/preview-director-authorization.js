import { createHash } from "node:crypto";

import { participantIdentityAuthorityEnvironment, requireParticipantIdentityAuthority } from "./participant-identity-authority.js";
import {
  isPreviewImpersonationSession,
  PREVIEW_DIRECTOR_PASSPORT_COOKIE,
  PREVIEW_IMPERSONATION_TOURNAMENT_ID,
  tournamentDirectorTokenFromCookieStore,
  tournamentDirectorTokenFromRequest,
  verifyPlayerPassportSession,
} from "./player-passport.js";
import { inspectTournamentDirectorToken } from "./player-passport-server.js";
import {
  linkPreviewDirectorEntitlement,
  readProductionDirectorEntitlement,
  readPreviewDirectorEntitlement,
  revokePreviewDirectorEntitlement,
  verifyPreviewIdentityImpersonation,
} from "./participant-identity-supabase.js";
import { verifyParticipantAuthClaims } from "./supabase-auth-server.js";
import { assertProductionShadowCandidateRequest } from "./production-shadow-candidate.js";

const clean = (value) => String(value ?? "").trim();
const TOURNAMENT_ID = PREVIEW_IMPERSONATION_TOURNAMENT_ID;
const PRODUCTION_SHADOW_DIRECTOR_PATHS = new Set([
  "/api/admin/data-authority-certification",
]);
const isSignedImpersonationPointer = (session) => Boolean(
  clean(session?.impersonatedPlayerId) &&
  clean(session?.previewImpersonationLeaseId) &&
  clean(session?.previewDirector?.role).toUpperCase() === "DIRECTOR" &&
  clean(session?.previewDirector?.id) === clean(session?.playerId)
);

export function previewDirectorEntitlementEnabled(env = process.env) {
  if (clean(env.VERCEL_ENV).toLowerCase() !== "preview") return false;
  try { return requireParticipantIdentityAuthority(env).resolved === "supabase"; }
  catch { return false; }
}

export function requestCookieStore(request) {
  return {
    get: (name) => request?.cookies?.get?.(name),
    getAll: () => request?.cookies?.getAll?.() || [],
    set: () => {},
  };
}

function accountSession(entitlement, authUserId, { productionShadowCandidate = false } = {}) {
  const revision = Number(entitlement.revision || 1);
  return {
    type: productionShadowCandidate ? "production-shadow-director-entitlement" : "preview-director-entitlement",
    playerId: clean(entitlement.directorPlayerId),
    tournamentId: clean(entitlement.tournamentId || TOURNAMENT_ID),
    deviceId: `supabase-account-${createHash("sha256").update(clean(authUserId)).digest("hex").slice(0, 16)}`,
    sessionVersion: revision,
    entitlementRevision: revision,
    authUserId: clean(authUserId),
  };
}

function accountIdentity(entitlement, authUserId, details = {}) {
  const id = clean(entitlement.directorPlayerId);
  const session = accountSession(entitlement, authUserId, details);
  return {
    actor: { id, name: "Tournament Director", role: "DIRECTOR" },
    player: { id, name: "Tournament Director", role: "DIRECTOR" },
    session,
    tournamentId: session.tournamentId,
    entitlement: {
      source: details.productionShadowCandidate ? "production-shadow-supabase-account" : "supabase-account",
      revision: Number(entitlement.revision || 1),
      linkedAt: entitlement.linkedAt || null,
    },
    authUserId: clean(authUserId),
    previewMode: details.previewMode === true,
    impersonating: details.previewMode === true,
    impersonation: details.impersonation || null,
  };
}

function bootstrapToken({ request, cookieStore }) {
  const dedicated = request
    ? request.cookies.get(PREVIEW_DIRECTOR_PASSPORT_COOKIE)?.value || ""
    : cookieStore?.get?.(PREVIEW_DIRECTOR_PASSPORT_COOKIE)?.value || "";
  if (dedicated) return dedicated;
  const selected = request
    ? tournamentDirectorTokenFromRequest(request)
    : tournamentDirectorTokenFromCookieStore(cookieStore);
  try {
    return isPreviewImpersonationSession(verifyPlayerPassportSession(selected)) ? "" : selected;
  } catch { return ""; }
}

async function verifiedAccount(cookieStore, env, dependencies, authority) {
  const verifyClaims = dependencies.verifyClaims || verifyParticipantAuthClaims;
  const verified = await verifyClaims(cookieStore, env);
  if (verified.status !== "active" || !verified.claims?.sub) {
    return { status: "inactive", authUserId: "", entitlement: null };
  }
  const authUserId = clean(verified.claims.sub);
  const readEntitlement = dependencies.readEntitlement || (authority.productionShadowCandidate
    ? readProductionDirectorEntitlement
    : readPreviewDirectorEntitlement);
  try {
    const result = await readEntitlement({ authUserId, tournamentId: TOURNAMENT_ID }, dependencies.rpcOptions);
    if (!result.payload?.ok) return { status: "unavailable", authUserId, entitlement: null };
    if (!result.payload.found) return { status: "missing", authUserId, entitlement: result.payload };
    if (result.payload.active !== true) return { status: "revoked", authUserId, entitlement: result.payload };
    if (clean(result.payload.tournamentId) !== TOURNAMENT_ID || !clean(result.payload.directorPlayerId)) {
      return { status: "forbidden", authUserId, entitlement: result.payload };
    }
    return { status: "active", authUserId, entitlement: result.payload };
  } catch {
    return { status: "unavailable", authUserId, entitlement: null };
  }
}

async function validateAccountImpersonation(session, account, dependencies) {
  if (clean(session.tournamentId) !== TOURNAMENT_ID || clean(session.playerId) !== clean(account.entitlement.directorPlayerId)) {
    return { status: "forbidden", identity: null, code: "IMPERSONATION_LEASE_MISMATCH" };
  }
  const verifyLease = dependencies.verifyLease || verifyPreviewIdentityImpersonation;
  let lease;
  try {
    lease = await verifyLease({
      leaseId: session.previewImpersonationLeaseId,
      tournamentId: session.tournamentId,
      directorPlayerId: session.playerId,
      playerId: session.impersonatedPlayerId,
      directorAuthUserId: account.authUserId,
    }, dependencies.rpcOptions);
  } catch {
    return { status: "unavailable", identity: null, code: "IMPERSONATION_LEASE_UNAVAILABLE" };
  }
  const payload = lease.payload || {};
  const context = payload.context || {};
  if (
    payload.ok !== true ||
    clean(payload.directorPlayerId) !== clean(account.entitlement.directorPlayerId) ||
    clean(payload.targetPlayerId) !== clean(session.impersonatedPlayerId) ||
    clean(context.playerId) !== clean(session.impersonatedPlayerId) ||
    clean(context.tournament?.id) !== TOURNAMENT_ID ||
    context.membership?.active !== true ||
    Date.parse(payload.expiresAt) <= Date.now()
  ) {
    return { status: "forbidden", identity: null, code: clean(payload.code) || "IMPERSONATION_LEASE_MISMATCH" };
  }
  return {
    status: "active",
    identity: accountIdentity(account.entitlement, account.authUserId, {
      previewMode: true,
      impersonation: {
        leaseId: clean(payload.leaseId || session.previewImpersonationLeaseId),
        targetPlayerId: clean(payload.targetPlayerId),
        expiresAt: payload.expiresAt,
      },
    }),
  };
}

export async function authorizePreviewDirector({
  request,
  cookieStore = request ? requestCookieStore(request) : null,
  env = process.env,
  allowBootstrap = true,
  dependencies = {},
} = {}) {
  if (!previewDirectorEntitlementEnabled(env)) {
    const token = request
      ? tournamentDirectorTokenFromRequest(request)
      : tournamentDirectorTokenFromCookieStore(cookieStore);
    return (dependencies.inspectPassport || inspectTournamentDirectorToken)(token, dependencies.passportDependencies);
  }

  const authority = participantIdentityAuthorityEnvironment(env);
  if (authority.productionShadowCandidate) {
    try { assertProductionShadowCandidateRequest(request, env, { requireOrigin: false }); }
    catch { return { status: "forbidden", identity: null, code: "PRODUCTION_SHADOW_CANDIDATE_REQUEST_REQUIRED" }; }
    let pathname = "";
    try { pathname = new URL(request?.url || "https://invalid.local/").pathname; }
    catch { pathname = ""; }
    if (!request || !PRODUCTION_SHADOW_DIRECTOR_PATHS.has(pathname)) {
      return { status: "forbidden", identity: null, code: "PRODUCTION_SHADOW_DIRECTOR_READ_ONLY" };
    }
  }

  const account = await verifiedAccount(cookieStore, env, dependencies, authority);
  if (["unavailable", "forbidden"].includes(account.status)) {
    return { status: account.status, identity: null, code: "DIRECTOR_ENTITLEMENT_UNAVAILABLE" };
  }
  if (account.status === "revoked") {
    return { status: "forbidden", identity: null, code: "DIRECTOR_ENTITLEMENT_REVOKED" };
  }
  if (account.status === "inactive") {
    return { status: "inactive", identity: null, code: "AUTH_SESSION_REQUIRED" };
  }

  if (authority.productionShadowCandidate) {
    if (account.status !== "active") {
      return { status: "inactive", identity: null, code: "PRODUCTION_DIRECTOR_ENTITLEMENT_REQUIRED" };
    }
    return {
      status: "active",
      identity: accountIdentity(account.entitlement, account.authUserId, { productionShadowCandidate: true }),
      source: "production-shadow-entitlement",
    };
  }

  const selectedToken = request
    ? tournamentDirectorTokenFromRequest(request)
    : tournamentDirectorTokenFromCookieStore(cookieStore);
  let selectedSession = null;
  try { selectedSession = selectedToken ? verifyPlayerPassportSession(selectedToken, dependencies.passportSecret) : null; }
  catch { selectedSession = null; }

  if (account.status === "active") {
    if (selectedSession && isSignedImpersonationPointer(selectedSession)) {
      return validateAccountImpersonation(selectedSession, account, dependencies);
    }
    return { status: "active", identity: accountIdentity(account.entitlement, account.authUserId), source: "entitlement" };
  }

  if (!allowBootstrap) return { status: "inactive", identity: null, code: "DIRECTOR_ENTITLEMENT_REQUIRED" };
  const token = bootstrapToken({ request, cookieStore });
  if (!token) return { status: "inactive", identity: null, code: "DIRECTOR_ENTITLEMENT_REQUIRED" };
  const inspectPassport = dependencies.inspectPassport || inspectTournamentDirectorToken;
  const passport = await inspectPassport(token, dependencies.passportDependencies);
  if (passport.status !== "active") return passport;
  const directorPlayerId = clean(passport.identity?.actor?.id || passport.identity?.player?.id);
  if (!directorPlayerId) return { status: "forbidden", identity: null, code: "DIRECTOR_BOOTSTRAP_INVALID" };
  const linkEntitlement = dependencies.linkEntitlement || linkPreviewDirectorEntitlement;
  let linked;
  try {
    linked = await linkEntitlement({
      auth_user_id: account.authUserId,
      tournament_id: TOURNAMENT_ID,
      director_player_id: directorPlayerId,
      bootstrap_source: "DIRECTOR_PASSPORT",
    }, dependencies.rpcOptions);
  } catch {
    return { status: "unavailable", identity: null, code: "DIRECTOR_ENTITLEMENT_LINK_UNAVAILABLE" };
  }
  if (!linked.payload?.ok || linked.payload.active !== true) {
    return { status: "forbidden", identity: null, code: clean(linked.payload?.code) || "DIRECTOR_ENTITLEMENT_LINK_DENIED" };
  }
  return {
    status: "active",
    identity: accountIdentity(linked.payload, account.authUserId),
    source: "passport-bootstrap",
    linked: linked.payload.changed === true,
  };
}

export async function revokeCurrentPreviewDirector({ request, cookieStore = requestCookieStore(request), env = process.env, dependencies = {} } = {}) {
  const authorization = await authorizePreviewDirector({ request, cookieStore, env, allowBootstrap: false, dependencies });
  if (authorization.status !== "active" || authorization.identity?.impersonating) return authorization;
  const revokeEntitlement = dependencies.revokeEntitlement || revokePreviewDirectorEntitlement;
  const result = await revokeEntitlement({
    auth_user_id: authorization.identity.authUserId,
    actor_auth_user_id: authorization.identity.authUserId,
    reason: "DIRECTOR_SELF_REVOKED",
  }, dependencies.rpcOptions);
  return result.payload?.ok
    ? { status: "revoked", identity: null, result: result.payload }
    : { status: "unavailable", identity: null, code: clean(result.payload?.code) || "DIRECTOR_ENTITLEMENT_REVOKE_FAILED" };
}
