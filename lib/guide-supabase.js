import { scoringShadowRpc } from "./scoring-shadow.js";
import {
  PREVIEW_GUIDE_SUPABASE_PROJECT_REF,
  PREVIEW_GUIDE_TOURNAMENT_ID,
  PREVIEW_GUIDE_TOURNAMENT_YEAR,
  requireGuideReadSource,
  guideSyncEnvironment,
} from "./guide-read-source.js";

const clean = (value) => String(value ?? "").trim();

export function guideRpcContext(env = process.env) {
  const state = guideSyncEnvironment(env);
  return {
    environment: "PREVIEW",
    project_ref: PREVIEW_GUIDE_SUPABASE_PROJECT_REF,
    tournament_id: PREVIEW_GUIDE_TOURNAMENT_ID,
    tournament_year: PREVIEW_GUIDE_TOURNAMENT_YEAR,
    source_workbook_id: state.workbookId,
  };
}

export async function readGuideProjection(options = {}) {
  const env = options.env || process.env;
  const source = requireGuideReadSource(env, options.surface === "course" ? "course" : "guide");
  if (source.source.resolved !== "supabase") {
    const error = new Error("Supabase Guide delivery is not selected in this runtime.");
    error.code = "GUIDE_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }
  const context = guideRpcContext(env);
  return scoringShadowRpc("read_current_guide_projection", {
    target_tournament_id: clean(options.tournamentId || context.tournament_id),
    target_source_workbook_id: context.source_workbook_id,
  }, { ...options, env, timeoutMs: options.timeoutMs || 8_000 });
}

export const readGuideSourceContext = (options = {}) => {
  const env = options.env || process.env;
  return scoringShadowRpc("read_preview_guide_source_context", {
    input: guideRpcContext(env),
  }, { ...options, env, timeoutMs: options.timeoutMs || 8_000 });
};

export const claimGuideSync = (input = {}, options = {}) => {
  const env = options.env || process.env;
  return scoringShadowRpc("claim_preview_guide_sync", {
    input: { ...guideRpcContext(env), trigger_type: clean(input.triggerType).toUpperCase(), requested_by: clean(input.requestedBy) },
  }, { ...options, env, timeoutMs: options.timeoutMs || 8_000 });
};

export const publishGuideProjection = (input = {}, options = {}) => {
  const env = options.env || process.env;
  return scoringShadowRpc("publish_preview_guide_projection", {
    input: {
      ...guideRpcContext(env),
      claim_token: clean(input.claimToken),
      validation_status: "VALID",
      content_fingerprint: clean(input.contentFingerprint),
      source_workbook_fingerprint: clean(input.sourceFingerprint),
      payload_hash: clean(input.payloadHash),
      content_payload: input.contentPayload,
      source_canonical_json: clean(input.sourceCanonicalJson),
      content_canonical_json: clean(input.contentCanonicalJson),
      payload_canonical_json: clean(input.payloadCanonicalJson),
      source_metadata: input.sourceMetadata || {},
    },
  }, { ...options, env, timeoutMs: options.timeoutMs || 15_000 });
};

export const failGuideSync = (input = {}, options = {}) => {
  const env = options.env || process.env;
  return scoringShadowRpc("mark_preview_guide_sync_failed", {
    input: {
      ...guideRpcContext(env),
      claim_token: clean(input.claimToken),
      validation_status: input.validationStatus === "INVALID" ? "INVALID" : "NOT_RUN",
      failure_category: clean(input.failureCategory || "GUIDE_SYNC_FAILED"),
      failure_safe: clean(input.failureSafe || "Guide synchronization did not complete."),
      ...(clean(input.sourceFingerprint) ? { source_workbook_fingerprint: clean(input.sourceFingerprint) } : {}),
      ...(typeof input.changed === "boolean" ? { changed: input.changed } : {}),
      audit_metadata: input.auditMetadata || {},
    },
  }, { ...options, env, timeoutMs: options.timeoutMs || 8_000 });
};

export const readGuideSyncStatus = (options = {}) => {
  const env = options.env || process.env;
  return scoringShadowRpc("read_preview_guide_sync_status", { input: guideRpcContext(env) }, {
    ...options, env, timeoutMs: options.timeoutMs || 8_000,
  });
};

export const configureGuideSyncWorker = (input = {}, options = {}) => {
  const env = options.env || process.env;
  return scoringShadowRpc("configure_preview_guide_sync_worker", {
    input: {
      ...guideRpcContext(env),
      endpoint_url: clean(input.endpointUrl),
      worker_secret: clean(input.workerSecret),
      enabled: input.enabled === true,
      actor_id: clean(input.actorId),
    },
  }, { ...options, env, timeoutMs: options.timeoutMs || 10_000 });
};

export const requestGuideSyncWorker = (input = {}, options = {}) => {
  const env = options.env || process.env;
  return scoringShadowRpc("request_preview_guide_sync_worker", {
    input: { ...guideRpcContext(env), actor_id: clean(input.actorId) },
  }, { ...options, env, timeoutMs: options.timeoutMs || 8_000 });
};

export const readGuideWorkerStatus = (options = {}) => {
  const env = options.env || process.env;
  return scoringShadowRpc("read_preview_guide_worker_status", { input: guideRpcContext(env) }, {
    ...options, env, timeoutMs: options.timeoutMs || 8_000,
  });
};
