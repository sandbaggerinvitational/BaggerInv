import "server-only";

import { assertProductionCutoverActivation } from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import {
  normalizeProductionGuideAuthoring,
  productionGuideAuthoringPayloadHash,
  productionGuideCanonicalReferenceFingerprint,
  productionGuideReferenceSummary,
  PRODUCTION_GUIDE_AUTHORING_CONTRACT,
  PRODUCTION_GUIDE_AUTHORING_DOMAINS,
  PRODUCTION_GUIDE_ITEM_STATUSES,
  PRODUCTION_GUIDE_TIMELINE_STATUSES,
} from "./production-guide-authoring-contract.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const YEAR = /^20\d{2}$/;

const RPC_ALLOWLIST = new Set([
  "read_production_guide_authoring_v1",
  "create_production_guide_draft_v1",
  "update_production_guide_draft_v1",
  "validate_production_guide_draft_v1",
  "preview_production_guide_draft_v1",
  "publish_production_guide_draft_v1",
  "discard_production_guide_draft_v1",
  "copy_previous_production_guide_as_draft_v1",
]);

function guideError(code, message, status = 503, diagnostics = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (diagnostics !== undefined) error.diagnostics = diagnostics;
  return error;
}

function exactUuid(value, code = "GUIDE_OPERATION_REQUEST_ID_REQUIRED") {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) throw guideError(code, "A secure Guide operation identity is required.", 400);
  return result;
}

function optionalUuid(value, code) {
  const result = clean(value).toLowerCase();
  if (!result) return "";
  if (!UUID.test(result)) throw guideError(code, "The exact current Guide revision identity is required.", 400);
  return result;
}

function exactPlayerId(value) {
  const result = clean(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(result)) {
    throw guideError("GUIDE_DIRECTOR_AUTHORIZATION_REQUIRED", "Active Tournament Director access is required.", 403);
  }
  return result;
}

function exactTournament(value, fallback = "") {
  const result = clean(value || fallback);
  if (!YEAR.test(result)) {
    throw guideError("GUIDE_TOURNAMENT_REQUIRED", "Select a certified Production tournament.", 400);
  }
  return result;
}

function exactRevision(value, code = "GUIDE_PREDECESSOR_REVISION_REQUIRED") {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw guideError(code, "The exact current Guide revision is required.", 400);
  }
  return revision;
}

function exactDraftVersion(value, { required = true } = {}) {
  if (!required && (value === undefined || value === null || value === "")) return 0;
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw guideError("GUIDE_DRAFT_VERSION_REQUIRED", "The exact stored Guide draft version is required.", 400);
  }
  return version;
}

function exactFingerprint(value, code = "GUIDE_CONTENT_FINGERPRINT_REQUIRED") {
  const result = clean(value).toLowerCase();
  if (!HASH.test(result)) throw guideError(code, "The exact validated Guide content fingerprint is required.", 400);
  return result;
}

function safeReason(value, fallback) {
  const result = clean(value || fallback);
  if (!result || result.length > 500 || /[\u0000-\u001f\u007f]|<[^>]*>/.test(result)) {
    throw guideError("GUIDE_REASON_INVALID", "Provide a short plain-text reason for this Guide change.", 422);
  }
  return result;
}

function fixedScope(input, {
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
} = {}) {
  const currentTournamentId = exactTournament(actorTournamentId);
  const authUserId = exactUuid(actorAuthUserId, "GUIDE_DIRECTOR_AUTHORIZATION_REQUIRED");
  const playerId = exactPlayerId(actorPlayerId);
  return {
    ...(input || {}),
    contract_version: PRODUCTION_GUIDE_AUTHORING_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    // This remains immutable resource-scope evidence. New Guide revisions use
    // the separate SUPABASE_DIRECTOR provenance below and never impersonate a
    // historical Google import.
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: currentTournamentId,
    tournament_year: Number(currentTournamentId),
    domain: "GUIDE",
    operation_authority: "SUPABASE_DIRECTOR_GUIDE_AUTHORING",
    actor_auth_user_id: authUserId,
    actor_player_id: playerId,
    authorization: {
      tournament_id: currentTournamentId,
      auth_user_id: authUserId,
      player_id: playerId,
      role: "DIRECTOR",
    },
  };
}

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) result.authorization = `Bearer ${secret}`;
  return result;
}

function safeCode(payload) {
  for (const candidate of [payload?.code, payload?.message, payload?.error?.code]) {
    const value = clean(candidate).toUpperCase();
    if (/^(?:PRODUCTION_)?GUIDE_[A-Z0-9_]{3,120}$/.test(value)) return value;
  }
  return "GUIDE_RPC_FAILED";
}

function statusFor(code, fallback = 409) {
  if (/(?:RPC_FAILED|UNAVAILABLE|RESPONSE_INVALID)$/.test(code)) return 503;
  if (/(?:AUTHORIZATION|DIRECTOR|SCOPE|RESOURCE)_REQUIRED$|FORBIDDEN$/.test(code)) return 403;
  if (/NOT_FOUND$/.test(code)) return 404;
  if (/TOO_LARGE$/.test(code)) return 413;
  if (/(?:INPUT_INVALID|INVALID|REQUIRED|UNKNOWN_FIELD|NOT_ALLOWED)$/.test(code)) return 422;
  return fallback;
}

export async function productionGuideAuthoringRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) {
    throw guideError("GUIDE_RPC_FORBIDDEN", "The Guide operation is not allowlisted.", 403);
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({ env, requiredPhase: "OBSERVATION" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw guideError("PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED", "Guide authoring is temporarily unavailable.");
  }
  recordDataAuthorityTransport("supabase", {
    adapter: PRODUCTION_GUIDE_AUTHORING_CONTRACT,
    source: name,
  });
  const startedAt = Date.now();
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = safeCode(payload);
    throw guideError(code, "The Guide operation did not complete.", statusFor(code, response.status));
  }
  if (!payload || payload.ok !== true) {
    const code = safeCode(payload);
    throw guideError(
      code,
      "The Guide operation did not complete.",
      statusFor(code),
      {
        issues: [
          ...(Array.isArray(payload?.issues) ? payload.issues : []),
          ...(Array.isArray(payload?.errors) ? payload.errors : []),
        ],
      },
    );
  }
  return { payload, activation, durationMs: Date.now() - startedAt };
}

function actorScope(values = {}) {
  return {
    actorAuthUserId: values.actorAuthUserId,
    actorPlayerId: values.actorPlayerId,
    actorTournamentId: values.actorTournamentId,
  };
}

async function invoke(name, input, values, options) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const rpc = options.rpc || productionGuideAuthoringRpc;
  const result = await rpc(name, fixedScope(input, actorScope(values)), {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return result.payload;
}

function first(value, ...keys) {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null) return value[key];
  }
  return undefined;
}

function canonicalContext(data = {}) {
  const nested = first(data, "canonicalContext", "canonical_context") || {};
  return {
    courses: first(data, "canonicalCourseContext", "canonical_course_context") ||
      first(nested, "canonicalCourseContext", "canonical_course_context", "courses") || [],
    rounds: first(data, "canonicalRounds", "canonical_rounds") ||
      first(nested, "canonicalRounds", "canonical_rounds", "rounds") || [],
  };
}

function normalizeOpenDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const diagnostics = first(value, "validationDiagnostics", "validation_diagnostics") || {};
  return {
    ...value,
    draftId: clean(first(value, "draftId", "draft_id")),
    draftVersion: Number(first(value, "draftVersion", "draft_version") || 0),
    status: clean(value.status || value.state || "DRAFT").toUpperCase(),
    authoringContent: first(value, "authoringContent", "authoring_content", "content") || null,
    preview: first(value, "preview", "projectionPayload", "projection_payload") || null,
    contentFingerprint: clean(first(value, "contentFingerprint", "content_fingerprint")),
    authoringContentFingerprint: clean(first(value, "authoringContentFingerprint", "authoring_content_fingerprint")),
    projectionPayloadHash: clean(first(value, "projectionPayloadHash", "projection_payload_hash")),
    canonicalReferenceFingerprint: clean(first(value, "canonicalReferenceFingerprint", "canonical_reference_fingerprint")),
    validatedContentFingerprint: clean(first(value, "validatedContentFingerprint", "validated_content_fingerprint")),
    validatedCanonicalReferenceFingerprint: clean(first(value,
      "validatedCanonicalReferenceFingerprint", "validated_canonical_reference_fingerprint")),
    requiresReview: Boolean(first(value, "requiresReview", "requires_review") ??
      first(diagnostics, "requiresReview", "requires_review")),
    validationIssues: Array.isArray(first(value, "validationIssues", "validation_issues"))
      ? first(value, "validationIssues", "validation_issues")
      : Array.isArray(diagnostics.issues) ? diagnostics.issues : [],
  };
}

function normalizeRevision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return {
    ...value,
    revisionId: clean(first(value, "revisionId", "revision_id")),
    revisionNumber: Number(first(value, "revisionNumber", "revision_number", "revision") || 0),
    status: clean(value.status || value.validationStatus || value.validation_status),
  };
}

async function readRawGuideAuthoring(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId, values.actorTournamentId);
  return invoke(
    "read_production_guide_authoring_v1",
    {
      operation: "READ_PRODUCTION_GUIDE_AUTHORING_V1",
      target_tournament_id: targetTournamentId,
      target_tournament_year: Number(targetTournamentId),
      history_limit: 30,
    },
    values,
    options,
  );
}

export async function readProductionGuideAuthoring(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId, values.actorTournamentId);
  const payload = await readRawGuideAuthoring({ ...values, targetTournamentId }, options);
  const data = payload.data || {};
  const context = canonicalContext(data);
  return {
    ...data,
    // Canonical scoring snapshots and hole definitions remain server-only.
    canonicalContext: undefined,
    canonical_context: undefined,
    canonicalCourseContext: undefined,
    canonical_course_context: undefined,
    canonicalRounds: undefined,
    canonical_rounds: undefined,
    canonicalReferenceFingerprint: undefined,
    targetTournamentId: clean(first(data, "targetTournamentId", "target_tournament_id", "tournamentId", "tournament_id") || targetTournamentId),
    tournamentId: clean(first(data, "tournamentId", "tournament_id", "targetTournamentId", "target_tournament_id") || targetTournamentId),
    tournamentYear: Number(first(data, "tournamentYear", "tournament_year") || targetTournamentId),
    currentTournamentId: clean(first(data, "currentTournamentId", "current_tournament_id") || values.actorTournamentId || PRODUCTION_TOURNAMENT_ID),
    current: normalizeRevision(data.current),
    history: Array.isArray(data.history) ? data.history.map(normalizeRevision) : [],
    openDraft: normalizeOpenDraft(first(data, "openDraft", "open_draft", "draft")),
    targets: Array.isArray(data.targets) ? data.targets : [],
    references: productionGuideReferenceSummary(context.courses, context.rounds),
    specifications: {
      contractVersion: PRODUCTION_GUIDE_AUTHORING_CONTRACT,
      domains: PRODUCTION_GUIDE_AUTHORING_DOMAINS,
      itemStatuses: PRODUCTION_GUIDE_ITEM_STATUSES,
      timelineStatuses: PRODUCTION_GUIDE_TIMELINE_STATUSES,
      publishConfirmation: "PUBLISH TOURNAMENT GUIDE",
      previewLabel: "DRAFT PREVIEW",
      projectionSchemaVersion: "guide-projection-v1",
    },
  };
}

async function trustedCanonicalContext(values, options) {
  if (options.canonicalContext && typeof options.canonicalContext === "object") {
    return {
      courses: options.canonicalContext.courses || options.canonicalContext.canonicalCourseContext || [],
      rounds: options.canonicalContext.rounds || options.canonicalContext.canonicalRounds || [],
    };
  }
  const payload = await readRawGuideAuthoring(values, options);
  const context = canonicalContext(payload.data || {});
  if (!Array.isArray(context.courses) || !context.courses.length) {
    throw guideError("GUIDE_CANONICAL_CONTEXT_REQUIRED", "Canonical Guide course context is unavailable.", 422);
  }
  return context;
}

function canonicalReferenceFingerprint(context = {}) {
  return productionGuideCanonicalReferenceFingerprint({
    canonicalRounds: Array.isArray(context.rounds) ? context.rounds : [],
    canonicalCourseContext: Array.isArray(context.courses) ? context.courses : [],
  });
}

async function freshStoredDraftProjection(values, options, { requireValidated = false } = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const expectedDraftId = exactUuid(values.draftId, "GUIDE_DRAFT_ID_REQUIRED");
  const expectedDraftVersion = exactDraftVersion(values.expectedDraftVersion);
  const payload = await readRawGuideAuthoring({ ...values, targetTournamentId }, options);
  const data = payload.data || {};
  const context = canonicalContext(data);
  if (!Array.isArray(context.courses) || !context.courses.length) {
    throw guideError("GUIDE_CANONICAL_CONTEXT_REQUIRED", "Canonical Guide course context is unavailable.", 422);
  }
  const draft = normalizeOpenDraft(first(data, "openDraft", "open_draft", "draft"));
  if (!draft || draft.draftId !== expectedDraftId) {
    throw guideError("GUIDE_DRAFT_NOT_FOUND", "The selected Tournament Guide draft no longer exists.", 404);
  }
  if (draft.draftVersion !== expectedDraftVersion) {
    throw guideError("GUIDE_DRAFT_VERSION_STALE", "The Tournament Guide draft changed since this page loaded.", 409);
  }
  if (!draft.authoringContent || typeof draft.authoringContent !== "object") {
    throw guideError("GUIDE_DRAFT_CONTENT_UNAVAILABLE", "Stored Tournament Guide authoring content is unavailable.", 503);
  }
  const normalized = normalizeProductionGuideAuthoring({
    content: draft.authoringContent,
    targetTournamentId,
    targetTournamentYear: Number(targetTournamentId),
    canonicalCourseContext: context.courses,
    canonicalRounds: context.rounds,
  });
  if (!HASH.test(draft.authoringContentFingerprint) ||
      draft.authoringContentFingerprint.toLowerCase() !== normalized.authoringContentFingerprint) {
    throw guideError(
      "GUIDE_DRAFT_FINGERPRINT_MISMATCH",
      "Stored Tournament Guide draft content did not match its immutable fingerprint.",
      409,
    );
  }
  const referenceFingerprint = canonicalReferenceFingerprint(context);
  if (requireValidated) {
    if (draft.status !== "VALIDATED") {
      throw guideError("GUIDE_DRAFT_NOT_VALIDATED", "Validate the stored Guide draft before publishing it.", 409);
    }
    if (!HASH.test(draft.validatedContentFingerprint) ||
        draft.validatedContentFingerprint.toLowerCase() !== normalized.contentFingerprint ||
        !HASH.test(draft.validatedCanonicalReferenceFingerprint) ||
        draft.validatedCanonicalReferenceFingerprint.toLowerCase() !== referenceFingerprint) {
      throw guideError(
        "GUIDE_VALIDATION_STALE",
        "Tournament setup or Guide content changed after validation. Validate the draft again.",
        409,
      );
    }
  }
  return { data, draft, context, normalized, referenceFingerprint };
}

export async function stageProductionGuideDraft(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const expectedPublishedRevision = exactRevision(
    values.expectedPublishedRevision ?? values.expectedRevision,
  );
  const draftId = optionalUuid(values.draftId, "GUIDE_DRAFT_ID_REQUIRED");
  const expectedDraftVersion = exactDraftVersion(values.expectedDraftVersion, { required: Boolean(draftId) });
  const context = await trustedCanonicalContext({ ...values, targetTournamentId }, options);
  const normalized = normalizeProductionGuideAuthoring({
    content: values.content,
    targetTournamentId,
    targetTournamentYear: Number(targetTournamentId),
    canonicalCourseContext: context.courses,
    canonicalRounds: context.rounds,
  });
  const referenceFingerprint = canonicalReferenceFingerprint(context);
  const reason = safeReason(values.reason, draftId ? "Update Tournament Guide draft" : "Create Tournament Guide draft");
  const operation = draftId ? "UPDATE" : "CREATE";
  const requestPayloadHash = productionGuideAuthoringPayloadHash({
    operation,
    targetTournamentId,
    expectedPublishedRevision,
    expectedPublishedRevisionId: clean(values.expectedPublishedRevisionId || values.expectedRevisionId),
    draftId,
    expectedDraftVersion,
    authoringContentFingerprint: normalized.authoringContentFingerprint,
    contentFingerprint: normalized.contentFingerprint,
    projectionPayloadHash: normalized.projectionPayloadHash,
    canonicalReferenceFingerprint: referenceFingerprint,
    reason,
  });
  return invoke(
    draftId ? "update_production_guide_draft_v1" : "create_production_guide_draft_v1",
    {
      operation: draftId ? "UPDATE_PRODUCTION_GUIDE_DRAFT_V1" : "CREATE_PRODUCTION_GUIDE_DRAFT_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      target_tournament_year: Number(targetTournamentId),
      expected_published_revision: expectedPublishedRevision,
      expected_published_revision_id: optionalUuid(
        values.expectedPublishedRevisionId || values.expectedRevisionId,
        "GUIDE_PREDECESSOR_REVISION_ID_INVALID",
      ) || null,
      expected_draft_version: expectedDraftVersion,
      draft_id: draftId || null,
      authoring_content: normalized.authoringContent,
      authoring_content_fingerprint: normalized.authoringContentFingerprint,
      authoring_canonical_json: normalized.authoringCanonicalJson,
      projection_payload: normalized.projectionPayload,
      projection_payload_hash: normalized.projectionPayloadHash,
      projection_payload_canonical_json: normalized.projectionPayloadCanonicalJson,
      content_fingerprint: normalized.contentFingerprint,
      content_canonical_json: normalized.contentCanonicalJson,
      canonical_reference_fingerprint: referenceFingerprint,
      validation_status: "VALID",
      validation_diagnostics: normalized.validation,
      provenance: "SUPABASE_DIRECTOR",
      reason,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

function storedDraftOperation(values, {
  operation,
  expectedPublished = false,
  fingerprint = false,
  confirmation = false,
  reason = false,
} = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const draftId = exactUuid(values.draftId, "GUIDE_DRAFT_ID_REQUIRED");
  const expectedDraftVersion = exactDraftVersion(values.expectedDraftVersion);
  const expectedPublishedRevision = expectedPublished
    ? exactRevision(values.expectedPublishedRevision ?? values.expectedRevision)
    : undefined;
  const expectedPublishedRevisionId = expectedPublished
    ? optionalUuid(values.expectedPublishedRevisionId || values.expectedRevisionId, "GUIDE_PREDECESSOR_REVISION_ID_INVALID")
    : "";
  const contentFingerprint = fingerprint
    ? exactFingerprint(values.contentFingerprint)
    : "";
  const confirmationValue = confirmation ? clean(values.confirmation) : "";
  if (confirmation && confirmationValue !== "PUBLISH TOURNAMENT GUIDE") {
    throw guideError("GUIDE_PUBLISH_CONFIRMATION_REQUIRED", "Confirm this exact Guide publication before publishing.", 400);
  }
  const reasonValue = reason ? safeReason(values.reason, `${operation} Tournament Guide draft`) : "";
  return {
    targetTournamentId,
    draftId,
    expectedDraftVersion,
    expectedPublishedRevision,
    expectedPublishedRevisionId,
    contentFingerprint,
    confirmation: confirmationValue,
    reason: reasonValue,
  };
}

export async function validateProductionGuideDraft(values = {}, options = {}) {
  const operation = storedDraftOperation(values, { operation: "Validate" });
  const fresh = await freshStoredDraftProjection(values, options);
  const requestPayloadHash = productionGuideAuthoringPayloadHash({
    operation: "VALIDATE",
    ...operation,
    authoringContentFingerprint: fresh.normalized.authoringContentFingerprint,
    contentFingerprint: fresh.normalized.contentFingerprint,
    projectionPayloadHash: fresh.normalized.projectionPayloadHash,
    canonicalReferenceFingerprint: fresh.referenceFingerprint,
  });
  return invoke(
    "validate_production_guide_draft_v1",
    {
      operation: "VALIDATE_PRODUCTION_GUIDE_DRAFT_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: operation.targetTournamentId,
      target_tournament_year: Number(operation.targetTournamentId),
      draft_id: operation.draftId,
      expected_draft_version: operation.expectedDraftVersion,
      authoring_content: fresh.normalized.authoringContent,
      authoring_content_fingerprint: fresh.normalized.authoringContentFingerprint,
      projection_payload: fresh.normalized.projectionPayload,
      projection_payload_hash: fresh.normalized.projectionPayloadHash,
      projection_payload_canonical_json: fresh.normalized.projectionPayloadCanonicalJson,
      content_fingerprint: fresh.normalized.contentFingerprint,
      content_canonical_json: fresh.normalized.contentCanonicalJson,
      canonical_reference_fingerprint: fresh.referenceFingerprint,
      validation_status: "VALID",
      validation_diagnostics: fresh.normalized.validation,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export async function previewProductionGuideDraft(values = {}, options = {}) {
  const operation = storedDraftOperation(values, { operation: "Preview" });
  const fresh = await freshStoredDraftProjection(values, options, { requireValidated: true });
  const requestPayloadHash = productionGuideAuthoringPayloadHash({
    operation: "PREVIEW",
    ...operation,
    authoringContentFingerprint: fresh.normalized.authoringContentFingerprint,
    contentFingerprint: fresh.normalized.contentFingerprint,
    projectionPayloadHash: fresh.normalized.projectionPayloadHash,
    canonicalReferenceFingerprint: fresh.referenceFingerprint,
  });
  const payload = await invoke(
    "preview_production_guide_draft_v1",
    {
      operation: "PREVIEW_PRODUCTION_GUIDE_DRAFT_V1",
      target_tournament_id: operation.targetTournamentId,
      target_tournament_year: Number(operation.targetTournamentId),
      draft_id: operation.draftId,
      expected_draft_version: operation.expectedDraftVersion,
      authoring_content: fresh.normalized.authoringContent,
      authoring_content_fingerprint: fresh.normalized.authoringContentFingerprint,
      projection_payload: fresh.normalized.projectionPayload,
      projection_payload_hash: fresh.normalized.projectionPayloadHash,
      content_fingerprint: fresh.normalized.contentFingerprint,
      canonical_reference_fingerprint: fresh.referenceFingerprint,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
  return {
    ...payload,
    projectionPayload: fresh.normalized.projectionPayload,
    contentFingerprint: fresh.normalized.contentFingerprint,
    validation: fresh.normalized.validation,
    previewLabel: "DRAFT PREVIEW",
    public: false,
    participantVisible: false,
    currentPointerChanged: false,
  };
}

export async function publishProductionGuideDraft(values = {}, options = {}) {
  const operation = storedDraftOperation(values, {
    operation: "Publish",
    expectedPublished: true,
    fingerprint: true,
    confirmation: true,
    reason: true,
  });
  const fresh = await freshStoredDraftProjection(values, options, { requireValidated: true });
  if (operation.contentFingerprint !== fresh.normalized.contentFingerprint) {
    throw guideError(
      "GUIDE_CONTENT_FINGERPRINT_STALE",
      "Guide content changed after the publication review. Validate the draft again.",
      409,
    );
  }
  const requestPayloadHash = productionGuideAuthoringPayloadHash({
    operation: "PUBLISH",
    ...operation,
    authoringContentFingerprint: fresh.normalized.authoringContentFingerprint,
    projectionPayloadHash: fresh.normalized.projectionPayloadHash,
    canonicalReferenceFingerprint: fresh.referenceFingerprint,
  });
  return invoke(
    "publish_production_guide_draft_v1",
    {
      operation: "PUBLISH_PRODUCTION_GUIDE_DRAFT_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: operation.targetTournamentId,
      target_tournament_year: Number(operation.targetTournamentId),
      draft_id: operation.draftId,
      expected_draft_version: operation.expectedDraftVersion,
      expected_published_revision: operation.expectedPublishedRevision,
      expected_published_revision_id: operation.expectedPublishedRevisionId || null,
      expected_content_fingerprint: operation.contentFingerprint,
      authoring_content: fresh.normalized.authoringContent,
      authoring_content_fingerprint: fresh.normalized.authoringContentFingerprint,
      projection_payload: fresh.normalized.projectionPayload,
      projection_payload_hash: fresh.normalized.projectionPayloadHash,
      projection_payload_canonical_json: fresh.normalized.projectionPayloadCanonicalJson,
      content_fingerprint: fresh.normalized.contentFingerprint,
      content_canonical_json: fresh.normalized.contentCanonicalJson,
      canonical_reference_fingerprint: fresh.referenceFingerprint,
      validation_status: "VALIDATED",
      validation_diagnostics: fresh.normalized.validation,
      confirmation: operation.confirmation,
      reason: operation.reason,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export async function discardProductionGuideDraft(values = {}, options = {}) {
  const operation = storedDraftOperation(values, { operation: "Discard", reason: true });
  const requestPayloadHash = productionGuideAuthoringPayloadHash({ operation: "DISCARD", ...operation });
  return invoke(
    "discard_production_guide_draft_v1",
    {
      operation: "DISCARD_PRODUCTION_GUIDE_DRAFT_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: operation.targetTournamentId,
      target_tournament_year: Number(operation.targetTournamentId),
      draft_id: operation.draftId,
      expected_draft_version: operation.expectedDraftVersion,
      reason: operation.reason,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export async function copyPreviousProductionGuideAsDraft(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const sourceTournamentId = exactTournament(values.sourceTournamentId);
  if (Number(sourceTournamentId) + 1 !== Number(targetTournamentId)) {
    throw guideError("GUIDE_COPY_SOURCE_INVALID", "Copy only from the immediately previous tournament into a future Guide draft.", 422);
  }
  const expectedPublishedRevision = exactRevision(values.expectedPublishedRevision ?? values.expectedRevision);
  const expectedPublishedRevisionId = optionalUuid(
    values.expectedPublishedRevisionId || values.expectedRevisionId,
    "GUIDE_PREDECESSOR_REVISION_ID_INVALID",
  );
  const reason = safeReason(values.reason, "Copy previous Tournament Guide for Director review");
  const requestPayloadHash = productionGuideAuthoringPayloadHash({
    operation: "COPY_PREVIOUS",
    targetTournamentId,
    sourceTournamentId,
    expectedPublishedRevision,
    expectedPublishedRevisionId,
    reason,
  });
  return invoke(
    "copy_previous_production_guide_as_draft_v1",
    {
      operation: "COPY_PREVIOUS_PRODUCTION_GUIDE_AS_DRAFT_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      target_tournament_year: Number(targetTournamentId),
      source_tournament_id: sourceTournamentId,
      source_tournament_year: Number(sourceTournamentId),
      expected_published_revision: expectedPublishedRevision,
      expected_published_revision_id: expectedPublishedRevisionId || null,
      provenance: "SUPABASE_DIRECTOR_COPY",
      requires_review: true,
      reset_publication_state: true,
      reason,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export const PRODUCTION_GUIDE_AUTHORING_PLATFORM = Object.freeze({
  tournamentId: PRODUCTION_TOURNAMENT_ID,
  tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
});
