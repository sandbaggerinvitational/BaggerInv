import { createHash } from "node:crypto";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_CONTRACT =
  "production-director-identity-bootstrap-v1";
export const PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_ACTOR =
  "step10b-production-auth-bootstrap";
export const PRODUCTION_DIRECTOR_IDENTITY_EVIDENCE_KIND =
  "PRODUCTION_OWNER_APPROVED_DIRECTOR_IDENTITY";

const EMAIL = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYER_ID = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

const clean = (value) => String(value ?? "").trim();
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function productionDirectorIdentityCanonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function productionDirectorIdentityFingerprint(value, { serialized = false } = {}) {
  return sha256(serialized ? String(value) : productionDirectorIdentityCanonicalJson(value));
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function exactTimestamp(value) {
  const input = clean(value);
  const milliseconds = Date.parse(input);
  if (!input || !Number.isFinite(milliseconds)) {
    fail("PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_REQUIRED", "A valid Production owner-approval timestamp is required.");
  }
  const normalized = new Date(milliseconds).toISOString();
  if (milliseconds > Date.now() + 60_000) {
    fail("PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_REQUIRED", "Production owner approval cannot be future-dated.");
  }
  return normalized;
}

function boundedText(value, { code, label, maximum = 160 }) {
  const normalized = clean(value);
  if (!normalized || normalized.length > maximum || /[\r\n]/.test(normalized)) {
    fail(code, `${label} is required and must be a bounded single-line value.`);
  }
  return normalized;
}

/**
 * Convert one owner-private, Production-approved identity record into exact,
 * deterministic evidence for the service-role-only bootstrap RPCs.
 *
 * This is deliberately not a roster importer. It can authorize only one
 * Director-certification candidate and never creates an Auth user itself.
 */
export function buildProductionDirectorIdentityBootstrap(evidence = {}) {
  if (Array.isArray(evidence.contacts) || Array.isArray(evidence.players) || Array.isArray(evidence.identities)) {
    fail(
      "PRODUCTION_DIRECTOR_IDENTITY_SINGLE_CANDIDATE_REQUIRED",
      "Production Director certification accepts exactly one approved identity, never a roster payload.",
    );
  }
  const environment = clean(evidence.environment).toUpperCase();
  const projectRef = clean(evidence.project_ref || evidence.projectRef);
  const projectUrl = clean(evidence.project_url || evidence.projectUrl);
  const workbookId = clean(evidence.source_workbook_id || evidence.sourceWorkbookId);
  const tournamentId = clean(evidence.tournament_id || evidence.tournamentId);
  const tournamentYear = Number(evidence.tournament_year ?? evidence.tournamentYear);
  const playerId = clean(evidence.player_id || evidence.playerId).toUpperCase();
  const email = clean(evidence.email).toLowerCase();
  const currentShadowSourceFingerprint = clean(
    evidence.current_shadow_source_fingerprint || evidence.currentShadowSourceFingerprint,
  ).toLowerCase();
  const approvalKind = clean(evidence.approval?.kind).toUpperCase();
  const approvedBy = boundedText(evidence.approval?.approved_by || evidence.approval?.approvedBy, {
    code: "PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_REQUIRED",
    label: "Production owner identity",
  });
  const approvedAt = exactTimestamp(evidence.approval?.approved_at || evidence.approval?.approvedAt);
  const evidenceReference = boundedText(
    evidence.approval?.evidence_reference || evidence.approval?.evidenceReference,
    {
      code: "PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_REQUIRED",
      label: "Production owner-approval evidence reference",
      maximum: 240,
    },
  );

  if (environment !== "PRODUCTION" || projectRef !== PRODUCTION_SUPABASE_PROJECT_REF ||
      projectUrl !== PRODUCTION_SUPABASE_URL || workbookId !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      tournamentId !== PRODUCTION_TOURNAMENT_ID || tournamentYear !== PRODUCTION_TOURNAMENT_YEAR) {
    fail(
      "PRODUCTION_DIRECTOR_IDENTITY_EXACT_RESOURCE_REQUIRED",
      "Director identity bootstrap evidence must name the exact dormant Production resources.",
    );
  }
  if (!PLAYER_ID.test(playerId)) {
    fail("PRODUCTION_DIRECTOR_IDENTITY_PLAYER_REQUIRED", "A stable Production Player ID is required.");
  }
  if (!EMAIL.test(email)) {
    fail("PRODUCTION_DIRECTOR_IDENTITY_EMAIL_REQUIRED", "A valid approved Production email is required.");
  }
  if (!SHA256.test(currentShadowSourceFingerprint)) {
    fail(
      "PRODUCTION_DIRECTOR_IDENTITY_CURRENT_SHADOW_REQUIRED",
      "The exact current Production shadow source fingerprint is required.",
    );
  }
  if (approvalKind !== PRODUCTION_DIRECTOR_IDENTITY_EVIDENCE_KIND) {
    fail(
      "PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_REQUIRED",
      "The bounded Production owner-approved identity evidence kind is required.",
    );
  }

  const emailIdentityHash = sha256(email);
  const evidenceReferenceHash = sha256(evidenceReference);
  // Keep the approval digest independently reproducible inside PostgreSQL.
  // Newline-separated bounded fields avoid JSON serializer/runtime variance.
  const approvalEvidenceFingerprint = sha256([
    approvedAt,
    approvedBy,
    evidenceReferenceHash,
    playerId,
  ].join("\n"));
  const source = {
    approval: {
      approved_at: approvedAt,
      approved_by: approvedBy,
      evidence_kind: PRODUCTION_DIRECTOR_IDENTITY_EVIDENCE_KIND,
      evidence_reference: evidenceReference,
    },
    contact: {
      email_normalized: email,
      identity_active: true,
      player_id: playerId,
    },
    current_shadow_source_fingerprint: currentShadowSourceFingerprint,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
  };
  const payload = {
    approval: {
      approved_at: approvedAt,
      approved_by: approvedBy,
      evidence_fingerprint: approvalEvidenceFingerprint,
      evidence_kind: PRODUCTION_DIRECTOR_IDENTITY_EVIDENCE_KIND,
      evidence_reference_hash: evidenceReferenceHash,
    },
    contact: {
      email,
      email_identity_hash: emailIdentityHash,
      email_normalized: email,
      identity_active: true,
      player_id: playerId,
    },
    current_shadow_source_fingerprint: currentShadowSourceFingerprint,
  };
  const sourceCanonicalJson = productionDirectorIdentityCanonicalJson(source);
  const payloadCanonicalJson = productionDirectorIdentityCanonicalJson(payload);
  const sourceFingerprint = productionDirectorIdentityFingerprint(sourceCanonicalJson, { serialized: true });
  const payloadFingerprint = productionDirectorIdentityFingerprint(payloadCanonicalJson, { serialized: true });
  const request = {
    actor_id: PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_ACTOR,
    contract_version: PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_CONTRACT,
    current_shadow_source_fingerprint: currentShadowSourceFingerprint,
    email_identity_hash: emailIdentityHash,
    environment: "PRODUCTION",
    operation: "PRODUCTION_DIRECTOR_IDENTITY_IMPORT",
    payload_fingerprint: payloadFingerprint,
    player_id: playerId,
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_fingerprint: sourceFingerprint,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
  };
  const requestCanonicalJson = productionDirectorIdentityCanonicalJson(request);
  const requestFingerprint = productionDirectorIdentityFingerprint(requestCanonicalJson, { serialized: true });

  return Object.freeze({
    contractVersion: PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_CONTRACT,
    playerId,
    email,
    emailIdentityHash,
    currentShadowSourceFingerprint,
    identitySourceFingerprint: sourceFingerprint,
    payloadFingerprint,
    requestFingerprint,
    approvedBy,
    approvedAt,
    evidenceReferenceHash,
    approvalEvidenceFingerprint,
    importInput: Object.freeze({
      ...request,
      request_canonical_json: requestCanonicalJson,
      request_fingerprint: requestFingerprint,
      source_canonical_json: sourceCanonicalJson,
      payload_canonical_json: payloadCanonicalJson,
      payload,
    }),
  });
}

export function productionDirectorIdentityApprovalInput(bootstrap, { runId } = {}) {
  const targetRunId = clean(runId);
  if (!bootstrap?.importInput || !UUID.test(targetRunId)) {
    fail(
      "PRODUCTION_DIRECTOR_IDENTITY_RUN_REQUIRED",
      "The exact Production identity import run is required for approval.",
    );
  }
  const request = {
    actor_id: PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_ACTOR,
    approval_evidence_fingerprint: bootstrap.approvalEvidenceFingerprint,
    contract_version: PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_CONTRACT,
    current_shadow_source_fingerprint: bootstrap.currentShadowSourceFingerprint,
    email_identity_hash: bootstrap.emailIdentityHash,
    environment: "PRODUCTION",
    identity_source_fingerprint: bootstrap.identitySourceFingerprint,
    operation: "PRODUCTION_DIRECTOR_IDENTITY_APPROVAL",
    player_id: bootstrap.playerId,
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    run_id: targetRunId,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
  };
  const requestCanonicalJson = productionDirectorIdentityCanonicalJson(request);
  return Object.freeze({
    ...request,
    request_canonical_json: requestCanonicalJson,
    request_fingerprint: productionDirectorIdentityFingerprint(requestCanonicalJson, { serialized: true }),
  });
}

export function safeProductionDirectorIdentityBootstrap(bootstrap = {}) {
  return Object.freeze({
    contractVersion: bootstrap.contractVersion || "",
    playerId: bootstrap.playerId || "",
    emailIdentityHash: bootstrap.emailIdentityHash || "",
    currentShadowSourceFingerprint: bootstrap.currentShadowSourceFingerprint || "",
    identitySourceFingerprint: bootstrap.identitySourceFingerprint || "",
    payloadFingerprint: bootstrap.payloadFingerprint || "",
    requestFingerprint: bootstrap.requestFingerprint || "",
    approvedBy: bootstrap.approvedBy || "",
    approvedAt: bootstrap.approvedAt || "",
    evidenceReferenceHash: bootstrap.evidenceReferenceHash || "",
    approvalEvidenceFingerprint: bootstrap.approvalEvidenceFingerprint || "",
    rawEmailExposed: false,
  });
}
