import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

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
import {
  assertProductionCutoverRequest,
  assertProductionWriterFenceCandidateControlRequest,
  productionCutoverActivationEnvironment,
  productionCutoverPhaseAtLeast,
} from "./production-cutover-activation-contract.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOURNAMENT_ID = PREVIEW_IMPERSONATION_TOURNAMENT_ID;
const productionWriterFenceDirectorAuthorizations = new WeakMap();
const PRODUCTION_SHADOW_DIRECTOR_PATHS = new Set([
  "/api/admin/data-authority-certification",
  "/api/admin/production-odds-calculations",
  "/api/admin/step11-production-google-certificate",
  "/api/admin/step11-production-google-metadata",
  "/api/admin/step11-6-production-google-writer-fence",
  "/admin/step11-6-production-google-writer-fence",
  "/admin/step12-production-google-writer-provider-fence",
]);
const isSignedImpersonationPointer = (session) => Boolean(
  clean(session?.impersonatedPlayerId) &&
  clean(session?.previewImpersonationLeaseId) &&
  clean(session?.previewDirector?.role).toUpperCase() === "DIRECTOR" &&
  clean(session?.previewDirector?.id) === clean(session?.playerId)
);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function productionWriterFenceAuthorization(result, requestState) {
  const actorId = clean(result?.identity?.actor?.id);
  const tournamentId = clean(result?.identity?.tournamentId);
  const authUserId = clean(result?.identity?.authUserId).toLowerCase();
  const branded = deepFreeze(result);
  productionWriterFenceDirectorAuthorizations.set(branded, Object.freeze({
    actorId,
    authUserId,
    deploymentId: clean(requestState?.deploymentId),
    runtimeMode: clean(requestState?.runtimeMode),
    source: clean(result?.source),
    tournamentId,
  }));
  return branded;
}

/**
 * Converts only the exact object returned by the authoritative Director
 * authorization path into the redacted actor binding consumed by the writer
 * fence control plane. Spreads, structured clones, and caller-created actor
 * records are deliberately not accepted.
 */
export function assertProductionWriterFenceDirectorAuthorization(value) {
  const authorization = value && typeof value === "object"
    ? productionWriterFenceDirectorAuthorizations.get(value) : null;
  const actorId = clean(value?.identity?.actor?.id || value?.identity?.player?.id);
  const tournamentId = clean(value?.identity?.tournamentId ||
    value?.identity?.session?.tournamentId);
  const authUserId = clean(value?.identity?.authUserId).toLowerCase();
  if (!authorization ||
      value?.status !== "active" ||
      clean(value?.source) !== "production-shadow-entitlement" ||
      value?.identity?.impersonating === true || actorId !== "CB01" ||
      tournamentId !== TOURNAMENT_ID ||
      actorId !== authorization.actorId ||
      authUserId !== authorization.authUserId ||
      tournamentId !== authorization.tournamentId ||
      clean(value?.source) !== authorization.source ||
      authorization.runtimeMode !== "PROJECT_PREVIEW_CANDIDATE" ||
      !/^dpl_[A-Za-z0-9]{8,64}$/.test(authorization.deploymentId) ||
      !Object.isFrozen(value) || !Object.isFrozen(value.identity) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        authUserId,
      )) {
    const error = new Error(
      "An authoritative Production Director authorization was required.",
    );
    error.code = "STEP11_6_WRITER_FENCE_AUTHORIZATION_CAPABILITY_INVALID";
    error.status = 403;
    throw error;
  }
  return Object.freeze({
    actorId,
    authenticatedActorFingerprint: createHash("sha256").update(
      `production-google-writer-fence-authenticated-actor-v1\n${authUserId}`,
    ).digest("hex"),
  });
}

export function previewDirectorEntitlementEnabled(env = process.env) {
  if (clean(env.VERCEL_ENV).toLowerCase() !== "preview") return false;
  try { return requireParticipantIdentityAuthority(env).resolved === "supabase"; }
  catch { return false; }
}

export function productionDirectorEntitlementEnvironment(env = process.env) {
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const requested = truthy(env.PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED);
  const activation = productionCutoverActivationEnvironment(env);
  const phaseApproved = productionCutoverPhaseAtLeast(env, "IDENTITY");
  const participantIdentity = participantIdentityAuthorityEnvironment(env);
  const scoringSupabaseRequested = clean(env.SCORING_AUTHORITY).toLowerCase() === "supabase";
  const identitySupabaseRequested = clean(env.PARTICIPANT_IDENTITY_AUTHORITY).toLowerCase() === "supabase";
  const authorityTransitionRequested = scoringSupabaseRequested || identitySupabaseRequested;
  const enabled = production && requested && activation.allowed && phaseApproved &&
    participantIdentity.productionCutoverIdentity;
  const failClosed = production && requested && !enabled;
  return {
    production,
    requested,
    enabled,
    failClosed,
    phaseApproved,
    authorityTransitionRequested,
    participantIdentityReady: participantIdentity.productionCutoverIdentity,
    activation,
    reason: enabled ? "production-director-entitlement-ready"
      : !production ? "production-environment-required"
      : !requested ? (authorityTransitionRequested ? "production-director-auth-required" : "production-director-auth-disabled")
      : !activation.allowed ? activation.reason
      : !phaseApproved ? "identity-phase-required"
      : !participantIdentity.productionCutoverIdentity ? participantIdentity.reason
      : "production-director-entitlement-unavailable",
  };
}

export function requestCookieStore(request) {
  return {
    get: (name) => request?.cookies?.get?.(name),
    getAll: () => request?.cookies?.getAll?.() || [],
    set: () => {},
  };
}

function accountSession(entitlement, authUserId, { productionShadowCandidate = false, productionDirector = false } = {}) {
  const revision = Number(entitlement.revision || 1);
  return {
    type: productionDirector ? "production-director-entitlement"
      : productionShadowCandidate ? "production-shadow-director-entitlement"
      : "preview-director-entitlement",
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
      source: details.productionDirector ? "production-supabase-account"
        : details.productionShadowCandidate ? "production-shadow-supabase-account"
        : "supabase-account",
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
  const readEntitlement = dependencies.readEntitlement || (authority.productionShadowCandidate || authority.productionDirector
    ? readProductionDirectorEntitlement
    : readPreviewDirectorEntitlement);
  const tournamentId = authority.productionDirector
    ? clean(authority.tournamentId)
    : TOURNAMENT_ID;
  if (!tournamentId) {
    return { status: "unavailable", authUserId, entitlement: null };
  }
  try {
    const result = await readEntitlement({ authUserId, tournamentId }, dependencies.rpcOptions);
    if (!result.payload?.ok) return { status: "unavailable", authUserId, entitlement: null };
    if (!result.payload.found) return { status: "missing", authUserId, entitlement: result.payload };
    if (result.payload.active !== true) return { status: "revoked", authUserId, entitlement: result.payload };
    if (clean(result.payload.tournamentId) !== tournamentId || !clean(result.payload.directorPlayerId)) {
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

async function authorizePreviewDirectorInternal({
  request,
  cookieStore = request ? requestCookieStore(request) : null,
  env = process.env,
  allowBootstrap = true,
  dependencies = {},
} = {}) {
  const productionDirector = productionDirectorEntitlementEnvironment(env);
  if (productionDirector.failClosed) {
    return {
      status: "forbidden",
      identity: null,
      code: "PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED",
      diagnostics: { reason: productionDirector.reason },
    };
  }
  if (productionDirector.enabled) {
    if (request) {
      try { assertProductionCutoverRequest(request, env); }
      catch (error) {
        return { status: "forbidden", identity: null, code: error.code || "PRODUCTION_CUTOVER_REQUEST_UNAVAILABLE" };
      }
    }
    let currentTournament;
    try {
      const readCurrentTournamentRuntime = dependencies.readCurrentTournamentRuntime ||
        (await import("./production-current-tournament-runtime.js"))
          .readProductionCurrentTournamentRuntime;
      const runtime = await readCurrentTournamentRuntime({}, { env });
      currentTournament = clean(runtime?.tournamentId);
      const futureGenerationIds = [
        clean(runtime?.runtimeGenerationId),
        clean(runtime?.authorityGenerationId),
        clean(runtime?.admissionGenerationId),
      ];
      const frozen2026 = currentTournament === "2026" &&
        Number(runtime?.tournamentYear) === 2026 &&
        runtime?.status === "FROZEN_2026_RUNTIME";
      const certifiedFuture = Number(runtime?.tournamentYear) > 2026 &&
        runtime?.status === "ACTIVE" &&
        Number.isSafeInteger(Number(runtime?.pointerRevision)) &&
        Number(runtime.pointerRevision) > 1 &&
        futureGenerationIds.every((value) => UUID.test(value)) &&
        new Set(futureGenerationIds).size === futureGenerationIds.length;
      if (!/^\d{4}$/.test(currentTournament) ||
          Number(runtime?.tournamentYear) !== Number(currentTournament) ||
          runtime?.lifecycle !== "ACTIVE" || (!frozen2026 && !certifiedFuture)) {
        throw new Error("The current Production tournament runtime was invalid.");
      }
    } catch {
      return {
        status: "unavailable",
        identity: null,
        code: "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_UNAVAILABLE",
      };
    }
    const account = await verifiedAccount(cookieStore, env, dependencies, {
      productionDirector: true,
      productionShadowCandidate: false,
      tournamentId: currentTournament,
    });
    if (account.status === "unavailable" || account.status === "forbidden") {
      return { status: account.status, identity: null, code: "DIRECTOR_ENTITLEMENT_UNAVAILABLE" };
    }
    if (account.status === "revoked") {
      return { status: "forbidden", identity: null, code: "DIRECTOR_ENTITLEMENT_REVOKED" };
    }
    if (account.status !== "active") {
      return { status: "inactive", identity: null, code: "PRODUCTION_DIRECTOR_ENTITLEMENT_REQUIRED" };
    }
    return {
      status: "active",
      identity: accountIdentity(account.entitlement, account.authUserId, { productionDirector: true }),
      source: "production-director-entitlement",
    };
  }
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

export async function authorizePreviewDirector(options = {}) {
  return authorizePreviewDirectorInternal(options);
}

function candidateControlDependencies(optionsInput) {
  const options = optionsInput == null ? {} : optionsInput;
  let prototype;
  let descriptors;
  try {
    if ((typeof options !== "object" && typeof options !== "function") ||
        options === null || nodeTypes.isProxy(options)) throw new TypeError();
    prototype = Object.getPrototypeOf(options);
    descriptors = Object.getOwnPropertyDescriptors(options);
  } catch {
    const error = new Error("The candidate-control authorization dependencies were invalid.");
    error.code = "STEP11_6_WRITER_FENCE_AUTHORIZATION_DEPENDENCY_INJECTION_FORBIDDEN";
    error.status = 500;
    throw error;
  }
  const keys = Reflect.ownKeys(descriptors);
  const allowedKeys = new Set(["inspectPassport", "readEntitlement", "verifyClaims"]);
  const plain = prototype === Object.prototype || prototype === null;
  const invalid = !plain || keys.some((key) =>
    typeof key !== "string" || !allowedKeys.has(key) ||
    typeof descriptors[key]?.get === "function" ||
    typeof descriptors[key]?.set === "function");
  const testOverridesAllowed = clean(process.env.NODE_TEST_CONTEXT) === "child-v8";
  if (invalid || (!testOverridesAllowed && keys.length > 0) ||
      keys.some((key) => typeof descriptors[key]?.value !== "function")) {
    const error = new Error("The candidate-control authorization dependencies were forbidden.");
    error.code = "STEP11_6_WRITER_FENCE_AUTHORIZATION_DEPENDENCY_INJECTION_FORBIDDEN";
    error.status = 500;
    throw error;
  }
  return Object.freeze({
    // inspectPassport is accepted in tests solely so the boundary can prove it
    // remains unused. There is intentionally no Passport path below.
    inspectPassport: descriptors.inspectPassport?.value,
    readEntitlement: descriptors.readEntitlement?.value ||
      readProductionDirectorEntitlement,
    verifyClaims: descriptors.verifyClaims?.value || verifyParticipantAuthClaims,
  });
}

/**
 * Route-specific authorization for the exact two WAF-exempt Project Preview
 * control origins. This path is deliberately independent of the live
 * participant identity authority: Production may remain DORMANT / GOOGLE /
 * PASSPORT while the candidate proves a current Supabase Auth claim and the
 * exact active Production Director entitlement. Passport and bootstrap are
 * absent from this function.
 */
export async function authorizeProductionWriterFenceDirectorCandidateControl(
  request,
  optionsInput = {},
) {
  let requestState;
  try {
    // This must precede dependency selection and every Auth/RPC operation.
    requestState = assertProductionWriterFenceCandidateControlRequest(
      request,
      process.env,
    );
  } catch (error) {
    return {
      status: "forbidden",
      identity: null,
      code: error.code || "PRODUCTION_WRITER_FENCE_CANDIDATE_CONTROL_UNAVAILABLE",
    };
  }
  const dependencies = candidateControlDependencies(optionsInput);
  const cookieStore = requestCookieStore(request);
  let verified;
  try {
    verified = await dependencies.verifyClaims(cookieStore, process.env);
  } catch {
    return {
      status: "unavailable",
      identity: null,
      code: "PRODUCTION_DIRECTOR_AUTH_CLAIMS_UNAVAILABLE",
    };
  }
  const authUserId = clean(verified?.claims?.sub).toLowerCase();
  if (verified?.status !== "active" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        authUserId,
      )) {
    return {
      status: "inactive",
      identity: null,
      code: "PRODUCTION_DIRECTOR_AUTH_SESSION_REQUIRED",
    };
  }
  let entitlement;
  try {
    entitlement = await dependencies.readEntitlement({
      authUserId,
      tournamentId: TOURNAMENT_ID,
    });
  } catch {
    return {
      status: "unavailable",
      identity: null,
      code: "PRODUCTION_DIRECTOR_ENTITLEMENT_UNAVAILABLE",
    };
  }
  const payload = entitlement?.payload || {};
  if (payload.ok !== true) {
    return {
      status: "unavailable",
      identity: null,
      code: "PRODUCTION_DIRECTOR_ENTITLEMENT_UNAVAILABLE",
    };
  }
  if (payload.found !== true || payload.active !== true ||
      clean(payload.status).toUpperCase() !== "ACTIVE" ||
      clean(payload.role).toUpperCase() !== "DIRECTOR" ||
      clean(payload.directorPlayerId) !== "CB01" ||
      clean(payload.tournamentId) !== TOURNAMENT_ID ||
      !Number.isSafeInteger(Number(payload.revision)) ||
      Number(payload.revision) < 1) {
    return {
      status: "forbidden",
      identity: null,
      code: "PRODUCTION_DIRECTOR_ENTITLEMENT_REQUIRED",
    };
  }
  return productionWriterFenceAuthorization({
    status: "active",
    identity: accountIdentity(payload, authUserId, {
      productionShadowCandidate: true,
    }),
    source: "production-shadow-entitlement",
  }, requestState);
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
