import { createHash, randomUUID } from "node:crypto";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";
import { productionShadowCandidateEnvironment } from "./production-shadow-candidate.js";

export const PRODUCTION_STEP11_SCORING_REHEARSAL_CONTRACT_VERSION =
  "production-step11-scoring-rehearsal-v1";
export const PRODUCTION_STEP11_SYNTHETIC_PREFIX = "STEP11-";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function productionStep11Fingerprint(value) {
  return sha256(JSON.stringify(stableValue(value)));
}

function exactHostname(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        (url.pathname && url.pathname !== "/") || url.search || url.hash) return "";
    return url.hostname;
  } catch {
    return "";
  }
}

function exactSha(value) {
  return /^[0-9a-f]{40}$/.test(clean(value).toLowerCase());
}

/**
 * A second, narrower gate layered on top of the read-only Production-shadow
 * candidate. It authorizes only an in-process/DB synthetic rehearsal. It never
 * changes the application's scoring authority and never authorizes Google I/O.
 */
export function productionStep11ScoringRehearsalEnvironment(env = process.env) {
  const requested = truthy(env.PRODUCTION_STEP11_SCORING_REHEARSAL_ENABLED);
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const expectedSha = clean(env.PRODUCTION_STEP11_SCORING_REHEARSAL_SHA).toLowerCase();
  const runtimeSha = clean(env.VERCEL_GIT_COMMIT_SHA).toLowerCase();
  const shaApproved = exactSha(expectedSha) && expectedSha === runtimeSha;
  const expectedHostname = exactHostname(env.PRODUCTION_STEP11_SCORING_REHEARSAL_HOSTNAME);
  const runtimeHostname = exactHostname(env.VERCEL_BRANCH_URL || env.VERCEL_URL);
  const hostnameApproved = Boolean(expectedHostname) && expectedHostname === runtimeHostname &&
    expectedHostname.endsWith(".vercel.app") && expectedHostname !== "baggerinv.com";
  const projectApproved = clean(env.PRODUCTION_SUPABASE_PROJECT_REF) === PRODUCTION_SUPABASE_PROJECT_REF &&
    clean(env.PRODUCTION_SUPABASE_URL) === PRODUCTION_SUPABASE_URL;
  const workbookApproved = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID) ===
    PRODUCTION_GOOGLE_WORKBOOK_ID;
  const runSecretConfigured = clean(env.PRODUCTION_STEP11_SCORING_REHEARSAL_SECRET).length >= 32;
  const s3FingerprintApproved = /^[0-9a-f]{64}$/.test(
    clean(env.PRODUCTION_STEP11_S3_FINGERPRINT).toLowerCase(),
  );
  const scoringAuthorityPreserved = clean(env.SCORING_AUTHORITY || "google").toLowerCase() === "google";
  const identityAuthority = clean(env.PARTICIPANT_IDENTITY_AUTHORITY || "passport").toLowerCase();
  const legacyIdentityPreserved = identityAuthority === "passport";
  const supabaseIdentityRequested = identityAuthority === "supabase";
  const shadowCandidate = productionShadowCandidateEnvironment(env);
  // Live Production remains Passport-authoritative. The only Supabase-identity
  // exception is the exact, non-authoritative Production-shadow candidate,
  // whose contract independently proves the candidate/project/workbook tuple
  // and that every authoritative application feature remains disabled.
  const shadowCandidateIdentityApproved = supabaseIdentityRequested && shadowCandidate.allowed &&
    shadowCandidate.noAuthoritativeFeatures && shadowCandidate.safety.liveProductionSelected === false;
  const identityAuthorityApproved = legacyIdentityPreserved || shadowCandidateIdentityApproved;
  const legacyAuthorityPreserved = scoringAuthorityPreserved && legacyIdentityPreserved;
  const authorityBoundaryApproved = scoringAuthorityPreserved && identityAuthorityApproved;
  const liveFeaturesDormant = !truthy(env.PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_WORKERS_ENABLED) &&
    !truthy(env.SUPABASE_SCORING_MIRROR_ENABLED);
  const externalWritesDisabled = !truthy(env.PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED);
  const allowed = requested && previewDeployment && shaApproved && hostnameApproved && projectApproved &&
    workbookApproved && runSecretConfigured && s3FingerprintApproved && authorityBoundaryApproved && liveFeaturesDormant &&
    externalWritesDisabled;
  const reason = allowed ? "production-step11-scoring-rehearsal-ready"
    : !requested ? "rehearsal-disabled"
    : !previewDeployment ? "preview-deployment-required"
    : !shaApproved ? "exact-candidate-sha-required"
    : !hostnameApproved ? "exact-isolated-hostname-required"
    : !projectApproved ? "exact-production-supabase-required"
    : !workbookApproved ? "exact-production-workbook-required"
    : !runSecretConfigured ? "server-run-secret-required"
    : !s3FingerprintApproved ? "certified-s3-fingerprint-required"
    : !scoringAuthorityPreserved ? "live-google-scoring-authority-required"
    : supabaseIdentityRequested && !shadowCandidateIdentityApproved
      ? `exact-production-shadow-candidate-identity-required:${shadowCandidate.reason}`
    : !identityAuthorityApproved ? "live-passport-or-isolated-candidate-supabase-identity-required"
    : !liveFeaturesDormant ? "live-authoritative-features-must-remain-dormant"
    : !externalWritesDisabled ? "external-google-writes-forbidden"
    : "rehearsal-unavailable";
  return {
    contractVersion: PRODUCTION_STEP11_SCORING_REHEARSAL_CONTRACT_VERSION,
    requested,
    allowed,
    reason,
    previewDeployment,
    shaApproved,
    hostnameApproved,
    projectApproved,
    workbookApproved,
    runSecretConfigured,
    s3FingerprintApproved,
    scoringAuthorityPreserved,
    identityAuthority,
    legacyIdentityPreserved,
    supabaseIdentityRequested,
    shadowCandidateIdentityApproved,
    identityAuthorityApproved,
    legacyAuthorityPreserved,
    authorityBoundaryApproved,
    liveFeaturesDormant,
    externalWritesDisabled,
    resources: allowed ? {
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      projectUrl: PRODUCTION_SUPABASE_URL,
      workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
      candidateSha: runtimeSha,
      candidateHostname: runtimeHostname,
    } : {},
  };
}

export function assertProductionStep11ScoringRehearsalEnvironment(env = process.env) {
  const state = productionStep11ScoringRehearsalEnvironment(env);
  if (state.allowed) return state;
  const error = new Error("Production Step 11 scoring rehearsal is unavailable.");
  error.code = "PRODUCTION_STEP11_SCORING_REHEARSAL_UNAVAILABLE";
  error.status = 404;
  error.reason = state.reason;
  throw error;
}

function clone(value) {
  return structuredClone(value);
}

function invariant(condition, code, message = code) {
  if (condition) return;
  const error = new Error(message);
  error.code = code;
  throw error;
}

function iso(value, fallback = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value || fallback);
  invariant(Number.isFinite(parsed.getTime()), "STEP11_INVALID_TIMESTAMP");
  return parsed.toISOString();
}

function sourceFixture(input = {}) {
  const sourceYear = Number(input.sourceTournamentYear ?? input.tournamentYear);
  const sourceTournamentId = clean(input.sourceTournamentId ?? input.tournamentId ?? sourceYear);
  const sourceMatchId = clean(input.sourceMatchId ?? input.matchId);
  invariant(Number.isInteger(sourceYear) && sourceYear >= 2017 && sourceYear <= 2025,
    "STEP11_COMPLETED_PRODUCTION_SOURCE_REQUIRED");
  invariant(sourceTournamentId && sourceTournamentId !== "2026", "STEP11_LIVE_TOURNAMENT_SOURCE_FORBIDDEN");
  invariant(sourceMatchId && upper(input.status || "FINAL") === "FINAL", "STEP11_FINAL_SOURCE_MATCH_REQUIRED");
  const participantIds = Array.isArray(input.participantIds) ? input.participantIds.map(clean).filter(Boolean) : [];
  invariant(participantIds.length >= 2 && new Set(participantIds).size === participantIds.length,
    "STEP11_SOURCE_PARTICIPANTS_REQUIRED");
  const format = upper(input.format || "SI");
  invariant(["BB", "SC", "SI"].includes(format), "STEP11_SOURCE_FORMAT_UNSUPPORTED");
  return {
    sourceTournamentId,
    sourceTournamentYear: sourceYear,
    sourceMatchId,
    format,
    participantIds,
    sourceFingerprint: clean(input.sourceFingerprint) || productionStep11Fingerprint(input),
    courseId: clean(input.courseId),
    tee: clean(input.tee),
    roundNumber: Number(input.roundNumber || 1),
  };
}

function canonicalSnapshot(state) {
  return {
    tournamentId: state.run.syntheticTournamentId,
    match: {
      matchId: state.match.matchId,
      status: state.match.status,
      scoringLocked: state.match.scoringLocked,
      accessActive: state.match.accessActive,
      permissionRevision: state.match.permissionRevision,
      matchRevision: state.match.matchRevision,
      resultWinner: state.match.resultWinner,
      finalizedAt: state.match.finalizedAt,
      sourceMatchId: state.match.sourceMatchId,
    },
    holes: Object.values(state.holes).sort((left, right) => left.holeNumber - right.holeNumber),
  };
}

export function productionStep11CanonicalFingerprint(state) {
  return productionStep11Fingerprint(canonicalSnapshot(state));
}

export function createProductionStep11ScoringRehearsal({
  runId = randomUUID(),
  candidateSha,
  candidateHostname,
  directorPlayerId,
  source,
  current2026Fingerprint,
  s3Fingerprint,
  runTokenFingerprint,
  createdAt = new Date(),
  expiresAt = new Date(new Date(createdAt).getTime() + 2 * 60 * 60 * 1000),
} = {}) {
  const fixture = sourceFixture(source);
  const normalizedRunId = clean(runId);
  invariant(/^[0-9a-f-]{16,}$/i.test(normalizedRunId), "STEP11_RUN_ID_REQUIRED");
  invariant(exactSha(candidateSha), "STEP11_CANDIDATE_SHA_REQUIRED");
  const hostname = exactHostname(candidateHostname);
  invariant(hostname.endsWith(".vercel.app") && hostname !== "baggerinv.com",
    "STEP11_ISOLATED_HOSTNAME_REQUIRED");
  invariant(clean(directorPlayerId), "STEP11_DIRECTOR_REQUIRED");
  invariant(/^[0-9a-f]{64}$/.test(clean(current2026Fingerprint)), "STEP11_CURRENT_2026_FINGERPRINT_REQUIRED");
  invariant(/^[0-9a-f]{64}$/.test(clean(s3Fingerprint)), "STEP11_S3_FINGERPRINT_REQUIRED");
  invariant(/^[0-9a-f]{64}$/.test(clean(runTokenFingerprint)), "STEP11_RUN_TOKEN_FINGERPRINT_REQUIRED");
  const created = new Date(createdAt);
  const expires = new Date(expiresAt);
  invariant(expires > created && expires.getTime() - created.getTime() <= 4 * 60 * 60 * 1000,
    "STEP11_REHEARSAL_EXPIRY_REQUIRED");
  const syntheticTournamentId = `${PRODUCTION_STEP11_SYNTHETIC_PREFIX}${normalizedRunId.toUpperCase()}`;
  const matchId = `${syntheticTournamentId}-M1`;
  const state = {
    contractVersion: PRODUCTION_STEP11_SCORING_REHEARSAL_CONTRACT_VERSION,
    run: {
      runId: normalizedRunId,
      candidateSha: clean(candidateSha).toLowerCase(),
      candidateHostname: hostname,
      directorPlayerId: clean(directorPlayerId),
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      projectUrl: PRODUCTION_SUPABASE_URL,
      workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
      syntheticTournamentId,
      source: fixture,
      current2026FingerprintBefore: clean(current2026Fingerprint),
      s3Fingerprint: clean(s3Fingerprint),
      runTokenFingerprint: clean(runTokenFingerprint),
      createdAt: iso(created),
      expiresAt: iso(expires),
      status: "PREPARED",
      externalGoogleWrites: 0,
      live2026Writes: 0,
    },
    ingress: { authority: "GOOGLE", state: "PAUSED", unresolvedClientQueues: 0, activeEpochId: null },
    epochs: [],
    match: {
      matchId,
      sourceMatchId: fixture.sourceMatchId,
      sourceFingerprint: fixture.sourceFingerprint,
      status: "SCHEDULED",
      scoringLocked: true,
      accessActive: false,
      permissionRevision: 1,
      matchRevision: 0,
      resultWinner: "",
      finalizedAt: null,
      format: fixture.format,
      participantIds: fixture.participantIds,
      courseId: fixture.courseId,
      tee: fixture.tee,
      roundNumber: fixture.roundNumber,
    },
    holes: {},
    mutations: [],
    mutationIndex: {},
    audit: [],
    outbox: [],
    archiveJobs: [],
    virtualGoogle: { deliveries: {}, match: null, holes: {}, archive: null, checkpoints: {} },
    virtualArchive: { deliveries: {}, snapshot: null, checkpoint: null },
    cleanup: null,
  };
  state.run.initialSyntheticFingerprint = productionStep11CanonicalFingerprint(state);
  return state;
}

function requireOpenRun(state, now = new Date()) {
  invariant(state?.contractVersion === PRODUCTION_STEP11_SCORING_REHEARSAL_CONTRACT_VERSION,
    "STEP11_REHEARSAL_CONTRACT_REQUIRED");
  invariant(state.run.syntheticTournamentId.startsWith(PRODUCTION_STEP11_SYNTHETIC_PREFIX) &&
    state.run.syntheticTournamentId !== "2026", "STEP11_SYNTHETIC_TOURNAMENT_REQUIRED");
  invariant(!["CLEANED", "EXPIRED"].includes(state.run.status), "STEP11_REHEARSAL_CLOSED");
  invariant(new Date(state.run.expiresAt).getTime() > new Date(now).getTime(), "STEP11_REHEARSAL_EXPIRED");
  invariant(state.run.externalGoogleWrites === 0 && state.run.live2026Writes === 0,
    "STEP11_REHEARSAL_SAFETY_INVARIANT_FAILED");
}

function audit(state, action, actor, details = {}) {
  state.audit.push({
    sequence: state.audit.length + 1,
    action,
    actor: clean(actor),
    tournamentId: state.run.syntheticTournamentId,
    matchId: state.match.matchId,
    details: clone(details),
  });
}

function requireDirector(state, actor) {
  invariant(clean(actor) === state.run.directorPlayerId, "STEP11_DIRECTOR_AUTHORIZATION_REQUIRED");
}

export function prepareProductionStep11AuthorityEpoch(state, {
  actor,
  reconciliationFingerprint = productionStep11CanonicalFingerprint(state),
  epochId = randomUUID(),
} = {}) {
  requireOpenRun(state);
  requireDirector(state, actor);
  invariant(state.ingress.authority === "GOOGLE", "STEP11_GOOGLE_AUTHORITY_REQUIRED");
  invariant(state.ingress.state === "PAUSED", "STEP11_INGRESS_MUST_BE_PAUSED");
  invariant(state.ingress.unresolvedClientQueues === 0, "STEP11_UNRESOLVED_CLIENT_QUEUES");
  invariant(clean(reconciliationFingerprint) === productionStep11CanonicalFingerprint(state),
    "STEP11_RECONCILIATION_FINGERPRINT_MISMATCH");
  const epoch = {
    epochId: clean(epochId),
    type: "CUTOVER",
    authorityBefore: "GOOGLE",
    authorityAfter: "SUPABASE",
    status: "PREPARED",
    reconciliationFingerprint: clean(reconciliationFingerprint),
    preparedBy: clean(actor),
  };
  state.epochs.push(epoch);
  audit(state, "AUTHORITY_EPOCH_PREPARED", actor, epoch);
  return clone(epoch);
}

export function commitProductionStep11AuthorityEpoch(state, { actor, epochId } = {}) {
  requireOpenRun(state);
  requireDirector(state, actor);
  const epoch = state.epochs.find((item) => item.epochId === clean(epochId));
  invariant(epoch?.status === "PREPARED" && epoch.authorityAfter === "SUPABASE",
    "STEP11_PREPARED_CUTOVER_EPOCH_REQUIRED");
  invariant(state.ingress.state === "PAUSED" && state.ingress.unresolvedClientQueues === 0,
    "STEP11_INGRESS_COMMIT_BLOCKED");
  invariant(epoch.reconciliationFingerprint === productionStep11CanonicalFingerprint(state),
    "STEP11_RECONCILIATION_CHANGED_BEFORE_COMMIT");
  epoch.status = "COMMITTED";
  epoch.committedBy = clean(actor);
  state.ingress = { authority: "SUPABASE", state: "OPEN", unresolvedClientQueues: 0, activeEpochId: epoch.epochId };
  state.run.status = "ACTIVE";
  audit(state, "AUTHORITY_EPOCH_COMMITTED", actor, epoch);
  return clone(epoch);
}

function mutationPayloadHash(action, payload, actor) {
  return productionStep11Fingerprint({ action, payload, actor: clean(actor) });
}

function priorMutation(state, mutationKey, payloadHash) {
  const prior = state.mutationIndex[clean(mutationKey)];
  if (!prior) return null;
  invariant(prior.payloadHash === payloadHash, "STEP11_IDEMPOTENCY_CONFLICT");
  return { ...clone(prior.result), idempotent: true };
}

function requireCanonicalMutation(state, { actor, mutationKey, expectedMatchRevision } = {}) {
  requireOpenRun(state);
  invariant(state.run.status === "ACTIVE" && state.ingress.authority === "SUPABASE" && state.ingress.state === "OPEN",
    "STEP11_SUPABASE_REHEARSAL_INGRESS_REQUIRED");
  invariant(clean(actor), "STEP11_ACTOR_REQUIRED");
  invariant(clean(mutationKey), "STEP11_MUTATION_KEY_REQUIRED");
  invariant(Number(expectedMatchRevision) === state.match.matchRevision, "STEP11_MATCH_REVISION_CONFLICT");
}

function enqueueMirror(state, eventType, mutationKey, afterState) {
  const event = {
    id: randomUUID(),
    eventType,
    mutationKey: clean(mutationKey),
    matchId: state.match.matchId,
    matchRevision: state.match.matchRevision,
    payload: clone(afterState),
    payloadFingerprint: productionStep11Fingerprint(afterState),
    status: "PENDING",
    attempts: 0,
    externalGoogleWrites: 0,
    claimedBy: null,
    checkpointed: false,
  };
  state.outbox.push(event);
  return event;
}

function enqueueArchive(state, eventType, mutationKey) {
  const snapshot = canonicalSnapshot(state);
  const event = {
    id: randomUUID(),
    eventType,
    mutationKey: clean(mutationKey),
    matchId: state.match.matchId,
    matchRevision: state.match.matchRevision,
    snapshot: eventType === "SCORECARD_ARCHIVE_INVALIDATE" ? null : snapshot,
    snapshotFingerprint: productionStep11Fingerprint(snapshot),
    status: "PENDING",
    attempts: 0,
    externalGoogleWrites: 0,
    claimedBy: null,
    checkpointed: false,
  };
  state.archiveJobs.push(event);
  return event;
}

function recordMutation(state, { action, mutationKey, actor, payload, before, eventType, archiveEventType = "" }) {
  const payloadHash = mutationPayloadHash(action, payload, actor);
  const result = {
    ok: true,
    action,
    mutationKey: clean(mutationKey),
    matchRevision: state.match.matchRevision,
    permissionRevision: state.match.permissionRevision,
    status: state.match.status,
    canonicalFingerprint: productionStep11CanonicalFingerprint(state),
    idempotent: false,
  };
  const mutation = {
    action,
    mutationKey: clean(mutationKey),
    payloadHash,
    actor: clean(actor),
    before: clone(before),
    after: canonicalSnapshot(state),
    result: clone(result),
  };
  state.mutations.push(mutation);
  state.mutationIndex[mutation.mutationKey] = mutation;
  enqueueMirror(state, eventType, mutationKey, mutation.after);
  if (archiveEventType) enqueueArchive(state, archiveEventType, mutationKey);
  audit(state, action, actor, { mutationKey: clean(mutationKey), matchRevision: state.match.matchRevision });
  return result;
}

function beginMutation(state, action, input) {
  requireOpenRun(state);
  invariant(state.run.status === "ACTIVE" && state.ingress.authority === "SUPABASE" && state.ingress.state === "OPEN",
    "STEP11_SUPABASE_REHEARSAL_INGRESS_REQUIRED");
  const payload = input.payload || {};
  const payloadHash = mutationPayloadHash(action, payload, input.actor);
  const prior = priorMutation(state, input.mutationKey, payloadHash);
  if (prior) return { prior, payload };
  requireCanonicalMutation(state, input);
  return { prior: null, payload };
}

export function markLiveProductionStep11Match(state, input = {}) {
  const begun = beginMutation(state, "MARK_LIVE", input);
  if (begun.prior) return begun.prior;
  requireDirector(state, input.actor);
  invariant(["SCHEDULED", "REOPENED"].includes(state.match.status), "STEP11_MARK_LIVE_STATUS_INVALID");
  const before = canonicalSnapshot(state);
  state.match.status = "LIVE";
  state.match.scoringLocked = false;
  state.match.accessActive = true;
  state.match.permissionRevision += 1;
  state.match.matchRevision += 1;
  return recordMutation(state, { action: "MARK_LIVE", ...input, payload: begun.payload, before, eventType: "MATCH_MARKED_LIVE" });
}

export function setProductionStep11ScoringLock(state, input = {}) {
  const locked = Boolean(input.payload?.locked);
  const begun = beginMutation(state, locked ? "LOCK_SCORING" : "UNLOCK_SCORING", input);
  if (begun.prior) return begun.prior;
  requireDirector(state, input.actor);
  invariant(["LIVE", "REOPENED"].includes(state.match.status), "STEP11_LOCK_STATUS_INVALID");
  const before = canonicalSnapshot(state);
  state.match.scoringLocked = locked;
  state.match.permissionRevision += 1;
  state.match.matchRevision += 1;
  return recordMutation(state, {
    action: locked ? "LOCK_SCORING" : "UNLOCK_SCORING",
    ...input,
    payload: begun.payload,
    before,
    eventType: locked ? "SCORING_LOCKED" : "SCORING_UNLOCKED",
  });
}

export function setProductionStep11ScoringAccess(state, input = {}) {
  const active = Boolean(input.payload?.active);
  const begun = beginMutation(state, active ? "ACCESS_ENABLED" : "ACCESS_REVOKED", input);
  if (begun.prior) return begun.prior;
  requireDirector(state, input.actor);
  invariant(["LIVE", "REOPENED"].includes(state.match.status), "STEP11_ACCESS_STATUS_INVALID");
  const before = canonicalSnapshot(state);
  state.match.accessActive = active;
  state.match.permissionRevision += 1;
  state.match.matchRevision += 1;
  return recordMutation(state, {
    action: active ? "ACCESS_ENABLED" : "ACCESS_REVOKED",
    ...input,
    payload: begun.payload,
    before,
    eventType: active ? "SCORING_ACCESS_ENABLED" : "SCORING_ACCESS_REVOKED",
  });
}

function scoreWinner(team1, team2) {
  const left = Array.isArray(team1) ? team1.map(Number) : [];
  const right = Array.isArray(team2) ? team2.map(Number) : [];
  invariant(left.length > 0 && right.length > 0 && [...left, ...right].every((value) => Number.isInteger(value) && value >= 1 && value <= 20),
    "STEP11_INVALID_GROSS_SCORES");
  const leftNet = Math.min(...left);
  const rightNet = Math.min(...right);
  return { leftNet, rightNet, winner: leftNet === rightNet ? "Halved" : leftNet < rightNet ? "Team 1" : "Team 2" };
}

export function submitProductionStep11HoleScore(state, input = {}) {
  const begun = beginMutation(state, "HOLE_SCORE", input);
  if (begun.prior) return begun.prior;
  invariant(["LIVE", "REOPENED"].includes(state.match.status), "STEP11_MATCH_NOT_SCOREABLE");
  invariant(!state.match.scoringLocked, "STEP11_SCORING_LOCKED");
  invariant(state.match.accessActive, "STEP11_SCORING_ACCESS_REVOKED");
  invariant(state.match.participantIds.includes(clean(input.actor)) || clean(input.actor) === state.run.directorPlayerId,
    "STEP11_SCORING_UNAUTHORIZED");
  invariant(Number(input.permissionRevision) === state.match.permissionRevision, "STEP11_PERMISSION_STALE");
  const holeNumber = Number(begun.payload.holeNumber);
  invariant(Number.isInteger(holeNumber) && holeNumber >= 1 && holeNumber <= 18, "STEP11_INVALID_HOLE");
  const currentHole = state.holes[String(holeNumber)];
  invariant(Number(input.expectedHoleRevision || 0) === Number(currentHole?.holeRevision || 0),
    "STEP11_HOLE_REVISION_CONFLICT");
  const before = canonicalSnapshot(state);
  const score = scoreWinner(begun.payload.team1GrossScores, begun.payload.team2GrossScores);
  state.holes[String(holeNumber)] = {
    holeNumber,
    holeRevision: Number(currentHole?.holeRevision || 0) + 1,
    team1GrossScores: begun.payload.team1GrossScores.map(Number),
    team2GrossScores: begun.payload.team2GrossScores.map(Number),
    team1NetScore: score.leftNet,
    team2NetScore: score.rightNet,
    winner: score.winner,
    mutationKey: clean(input.mutationKey),
  };
  state.match.matchRevision += 1;
  const result = recordMutation(state, {
    action: "HOLE_SCORE",
    ...input,
    payload: begun.payload,
    before,
    eventType: "HOLE_SCORE_UPSERTED",
  });
  return { ...result, hole: clone(state.holes[String(holeNumber)]) };
}

function currentResult(state) {
  const scores = Object.values(state.holes);
  const team1 = scores.filter((hole) => hole.winner === "Team 1").length;
  const team2 = scores.filter((hole) => hole.winner === "Team 2").length;
  return team1 === team2 ? "Halved" : team1 > team2 ? "Team 1" : "Team 2";
}

export function finalizeProductionStep11Match(state, input = {}) {
  const begun = beginMutation(state, "FINALIZE", input);
  if (begun.prior) return begun.prior;
  requireDirector(state, input.actor);
  invariant(["LIVE", "REOPENED"].includes(state.match.status), "STEP11_FINALIZE_STATUS_INVALID");
  invariant(!state.match.scoringLocked, "STEP11_SCORING_LOCKED");
  invariant(Object.keys(state.holes).length === 18, "STEP11_SCORECARD_INCOMPLETE");
  const before = canonicalSnapshot(state);
  state.match.status = "FINAL";
  state.match.scoringLocked = true;
  state.match.accessActive = false;
  state.match.permissionRevision += 1;
  state.match.matchRevision += 1;
  state.match.resultWinner = currentResult(state);
  state.match.finalizedAt = `rehearsal-revision-${state.match.matchRevision}`;
  return recordMutation(state, {
    action: "FINALIZE",
    ...input,
    payload: begun.payload,
    before,
    eventType: "MATCH_FINALIZED",
    archiveEventType: "SCORECARD_ARCHIVE_UPSERT",
  });
}

export function reopenProductionStep11Match(state, input = {}) {
  const begun = beginMutation(state, "REOPEN", input);
  if (begun.prior) return begun.prior;
  requireDirector(state, input.actor);
  invariant(state.match.status === "FINAL", "STEP11_REOPEN_REQUIRES_FINAL");
  const before = canonicalSnapshot(state);
  state.match.status = "REOPENED";
  state.match.scoringLocked = false;
  state.match.accessActive = true;
  state.match.permissionRevision += 1;
  state.match.matchRevision += 1;
  state.match.resultWinner = "";
  state.match.finalizedAt = null;
  return recordMutation(state, {
    action: "REOPEN",
    ...input,
    payload: begun.payload,
    before,
    eventType: "MATCH_REOPENED",
    archiveEventType: "SCORECARD_ARCHIVE_INVALIDATE",
  });
}

function pendingQueue(state, queue) {
  return queue === "archive" ? state.archiveJobs : state.outbox;
}

function virtualTarget(state, queue) {
  return queue === "archive" ? state.virtualArchive : state.virtualGoogle;
}

function applyVirtualDelivery(state, queue, job) {
  const target = virtualTarget(state, queue);
  if (target.deliveries[job.id]) return { duplicateSuppressed: true };
  if (queue === "archive") {
    target.snapshot = job.eventType === "SCORECARD_ARCHIVE_INVALIDATE" ? null : clone(job.snapshot);
  } else {
    target.match = clone(job.payload.match);
    target.holes = Object.fromEntries(job.payload.holes.map((hole) => [String(hole.holeNumber), clone(hole)]));
  }
  target.deliveries[job.id] = {
    mutationKey: job.mutationKey,
    payloadFingerprint: job.payloadFingerprint || job.snapshotFingerprint,
  };
  return { duplicateSuppressed: false };
}

/**
 * Virtual-only external delivery. Fault stages model the crash windows around
 * claims, external delivery, and checkpoints without invoking Google.
 */
export function processProductionStep11VirtualWorker(state, {
  queue = "mirror",
  workerId = "step11-virtual-worker",
  failAt = "",
} = {}) {
  requireOpenRun(state);
  invariant(["mirror", "archive"].includes(queue), "STEP11_VIRTUAL_QUEUE_INVALID");
  const jobs = pendingQueue(state, queue);
  const job = jobs.find((item) => ["PENDING", "RETRYABLE", "PROCESSING"].includes(item.status));
  if (!job) return { ok: true, empty: true, externalGoogleWrites: 0 };
  if (failAt === "before-claim-completion") {
    return { ok: false, empty: false, stage: "claim", retryable: true, jobId: job.id, externalGoogleWrites: 0 };
  }
  job.status = "PROCESSING";
  job.claimedBy = clean(workerId);
  job.attempts += 1;
  if (failAt === "after-claim") {
    job.status = "RETRYABLE";
    return { ok: false, empty: false, stage: "claimed", retryable: true, jobId: job.id, externalGoogleWrites: 0 };
  }
  const delivery = applyVirtualDelivery(state, queue, job);
  if (failAt === "after-external-delivery-before-checkpoint") {
    job.status = "RETRYABLE";
    return {
      ok: false,
      empty: false,
      stage: "external-delivered",
      retryable: true,
      jobId: job.id,
      duplicateSuppressed: delivery.duplicateSuppressed,
      externalGoogleWrites: 0,
    };
  }
  const target = virtualTarget(state, queue);
  const checkpointFingerprint = productionStep11Fingerprint(queue === "archive" ? target.snapshot : {
    match: target.match,
    holes: Object.values(target.holes).sort((left, right) => left.holeNumber - right.holeNumber),
  });
  target.checkpoint = { jobId: job.id, matchRevision: job.matchRevision, fingerprint: checkpointFingerprint };
  job.checkpointed = true;
  job.status = "DELIVERED";
  if (failAt === "after-checkpoint") {
    return { ok: false, empty: false, stage: "checkpointed", retryable: false, jobId: job.id, externalGoogleWrites: 0 };
  }
  return {
    ok: true,
    empty: false,
    jobId: job.id,
    duplicateSuppressed: delivery.duplicateSuppressed,
    checkpointFingerprint,
    externalGoogleWrites: 0,
  };
}

export function drainProductionStep11VirtualWorkers(state) {
  const reports = { mirror: [], archive: [] };
  for (const queue of ["mirror", "archive"]) {
    for (let index = 0; index < 500; index += 1) {
      const report = processProductionStep11VirtualWorker(state, { queue });
      if (report.empty) break;
      reports[queue].push(report);
      invariant(report.ok || report.stage === "checkpointed", "STEP11_VIRTUAL_WORKER_DRAIN_FAILED");
    }
  }
  return reports;
}

function virtualGoogleFingerprint(state) {
  return productionStep11Fingerprint({
    tournamentId: state.run.syntheticTournamentId,
    match: state.virtualGoogle.match,
    holes: Object.values(state.virtualGoogle.holes).sort((left, right) => left.holeNumber - right.holeNumber),
  });
}

export function rollbackProductionStep11ScoringRehearsal(state, { actor } = {}) {
  requireOpenRun(state);
  requireDirector(state, actor);
  invariant(state.ingress.authority === "SUPABASE", "STEP11_SUPABASE_REHEARSAL_AUTHORITY_REQUIRED");
  state.ingress.state = "PAUSED";
  const alreadyMirrored = state.outbox.filter((event) => event.status === "DELIVERED").length;
  const requiringReconciliation = state.outbox.filter((event) => event.status !== "DELIVERED").length;
  drainProductionStep11VirtualWorkers(state);
  const unresolved = state.outbox.filter((event) => event.status !== "DELIVERED").length +
    state.archiveJobs.filter((event) => event.status !== "DELIVERED").length;
  const duplicateDeliveries = Object.keys(state.virtualGoogle.deliveries).length - new Set(Object.keys(state.virtualGoogle.deliveries)).size;
  const canonicalFingerprint = productionStep11CanonicalFingerprint(state);
  const rollbackTargetFingerprint = virtualGoogleFingerprint(state);
  invariant(unresolved === 0, "STEP11_ROLLBACK_UNRESOLVED_WRITES");
  invariant(duplicateDeliveries === 0, "STEP11_ROLLBACK_DUPLICATE_WRITES");
  invariant(canonicalFingerprint === rollbackTargetFingerprint, "STEP11_ROLLBACK_FINGERPRINT_MISMATCH");
  const epoch = {
    epochId: randomUUID(),
    type: "ROLLBACK",
    authorityBefore: "SUPABASE",
    authorityAfter: "GOOGLE",
    status: "COMMITTED",
    reconciliationFingerprint: canonicalFingerprint,
    committedBy: clean(actor),
  };
  state.epochs.push(epoch);
  state.ingress = { authority: "GOOGLE", state: "PAUSED", unresolvedClientQueues: 0, activeEpochId: epoch.epochId };
  state.run.status = "ROLLED_BACK";
  const evidence = {
    rehearsalAuthorityEpoch: epoch.epochId,
    supabaseAuthoritativeWrites: state.mutations.length,
    alreadyRepresentedInMirror: alreadyMirrored,
    requiringReconciliation,
    successfullyReconciled: requiringReconciliation,
    duplicates: duplicateDeliveries,
    unresolved,
    lost: 0,
    finalSupabaseFingerprint: canonicalFingerprint,
    finalRollbackTargetFingerprint: rollbackTargetFingerprint,
    finalAuthorityState: "GOOGLE",
    externalGoogleWrites: state.run.externalGoogleWrites,
    live2026Writes: state.run.live2026Writes,
  };
  audit(state, "ROLLBACK_RECONCILIATION_COMMITTED", actor, evidence);
  return evidence;
}

export function cleanupProductionStep11ScoringRehearsal(state, {
  actor,
  current2026FingerprintAfter,
  s3FingerprintAfter = state.run.s3Fingerprint,
} = {}) {
  requireOpenRun(state);
  requireDirector(state, actor);
  invariant(state.run.status === "ROLLED_BACK", "STEP11_ROLLBACK_REQUIRED_BEFORE_CLEANUP");
  invariant(state.ingress.authority === "GOOGLE" && state.ingress.state === "PAUSED",
    "STEP11_CLEANUP_GOOGLE_AUTHORITY_REQUIRED");
  invariant(clean(current2026FingerprintAfter) === state.run.current2026FingerprintBefore,
    "STEP11_CURRENT_2026_CHANGED");
  invariant(clean(s3FingerprintAfter) === state.run.s3Fingerprint, "STEP11_S3_CHANGED");
  invariant(state.outbox.every((event) => event.status === "DELIVERED") &&
    state.archiveJobs.every((event) => event.status === "DELIVERED"), "STEP11_CLEANUP_UNRESOLVED_JOBS");
  invariant(state.run.externalGoogleWrites === 0 && state.run.live2026Writes === 0,
    "STEP11_CLEANUP_SAFETY_INVARIANT_FAILED");
  const syntheticFingerprint = productionStep11CanonicalFingerprint(state);
  state.cleanup = {
    certified: true,
    actor: clean(actor),
    syntheticTournamentId: state.run.syntheticTournamentId,
    syntheticFingerprint,
    current2026FingerprintBefore: state.run.current2026FingerprintBefore,
    current2026FingerprintAfter: clean(current2026FingerprintAfter),
    s3FingerprintBefore: state.run.s3Fingerprint,
    s3FingerprintAfter: clean(s3FingerprintAfter),
    externalGoogleWrites: 0,
    live2026Writes: 0,
    unresolved: 0,
  };
  audit(state, "REHEARSAL_CLEANUP_CERTIFIED", actor, state.cleanup);
  state.run.status = "CLEANED";
  state.holes = {};
  state.mutations = [];
  state.mutationIndex = {};
  state.outbox = [];
  state.archiveJobs = [];
  return clone(state.cleanup);
}

export function productionStep11RehearsalSafetyEvidence(state) {
  return {
    contractVersion: state.contractVersion,
    runId: state.run.runId,
    candidateSha: state.run.candidateSha,
    syntheticTournamentId: state.run.syntheticTournamentId,
    sourceTournamentId: state.run.source.sourceTournamentId,
    sourceTournamentYear: state.run.source.sourceTournamentYear,
    liveTournamentId: "2026",
    live2026Writes: state.run.live2026Writes,
    externalGoogleWrites: state.run.externalGoogleWrites,
    ingressAuthority: state.ingress.authority,
    ingressState: state.ingress.state,
    status: state.run.status,
    s3Fingerprint: state.run.s3Fingerprint,
    current2026Fingerprint: state.run.current2026FingerprintBefore,
    cleanupCertified: Boolean(state.cleanup?.certified),
  };
}
