import { NextResponse } from "next/server";

import {
  assertGuideSyncEnvironment,
  guideWorkerAuthorized,
  guideWorkerServerConfiguration,
} from "../../../../lib/guide-read-source.js";
import {
  configureGuideSyncWorker,
  readGuideSyncStatus,
  readGuideWorkerStatus,
} from "../../../../lib/guide-supabase.js";
import { synchronizeGuideContent } from "../../../../lib/guide-sync-service.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const unavailable = () => NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
const privateHeaders = { "Cache-Control": "private, no-store" };

function requireRpc(result, fallbackCode) {
  if (result?.payload?.ok) return result.payload;
  const error = new Error("Guide worker control dependency is unavailable.");
  error.code = String(result?.payload?.code || fallbackCode);
  throw error;
}

function safeWorkerStatus(worker = {}) {
  return {
    configured: worker.configured === true,
    enabled: worker.enabled === true,
    endpointHost: String(worker.endpoint_host || ""),
    schedule: String(worker.schedule || ""),
    applicationAuthorizationConfigured: worker.application_authorization_configured === true,
    deploymentProtectionConfigured: worker.deployment_protection_configured === true,
    configuredAt: worker.configured_at || null,
    updatedAt: worker.updated_at || null,
    lastRequestedAt: worker.last_requested_at || null,
    responseObserved: worker.response_observed === true,
    lastResponseStatusCode: Number(worker.last_response_status_code) || null,
    lastResponseResult: String(worker.last_response_result || ""),
    lastResponseAt: worker.last_response_at || null,
    lastCronStatus: String(worker.last_cron_status || ""),
    lastCronStartedAt: worker.last_cron_started_at || null,
    lastCronCompletedAt: worker.last_cron_completed_at || null,
  };
}

function safeSyncStatus(sync = {}) {
  const current = sync.current || null;
  const attempt = sync.last_attempt || null;
  const success = sync.last_success || null;
  return {
    tournamentId: String(sync.tournament_id || ""),
    state: String(sync.state || ""),
    stale: sync.stale === true,
    staleAfterSeconds: Number(sync.stale_after_seconds) || null,
    lastKnownGoodAvailable: sync.last_known_good_available === true,
    current: current ? {
      projectionRevision: Number(current.projection_revision) || 0,
      publicationSequence: Number(current.publication_sequence) || 0,
      contentFingerprint: String(current.content_fingerprint || ""),
      payloadHash: String(current.payload_hash || ""),
      publishedAt: current.published_at || null,
      lastVerifiedAt: current.last_verified_at || null,
    } : null,
    lastAttempt: attempt ? {
      attemptSequence: Number(attempt.attempt_sequence) || 0,
      triggerType: String(attempt.trigger_type || ""),
      status: String(attempt.status || ""),
      startedAt: attempt.started_at || null,
      completedAt: attempt.completed_at || null,
      changed: typeof attempt.changed === "boolean" ? attempt.changed : null,
      validationStatus: String(attempt.validation_status || ""),
      sourceFingerprint: String(attempt.source_workbook_fingerprint || ""),
      failureCategory: String(attempt.failure_category || ""),
    } : null,
    lastSuccess: success ? {
      attemptSequence: Number(success.attempt_sequence) || 0,
      triggerType: String(success.trigger_type || ""),
      status: String(success.status || ""),
      completedAt: success.completed_at || null,
      changed: typeof success.changed === "boolean" ? success.changed : null,
    } : null,
  };
}

async function configureWorker(enabled) {
  const configuration = guideWorkerServerConfiguration();
  if (!configuration.ready) return unavailable();
  const result = requireRpc(await configureGuideSyncWorker({
    endpointUrl: configuration.endpointUrl,
    workerSecret: configuration.workerSecret,
    enabled,
    actorId: "preview-guide-worker-control",
  }), "GUIDE_WORKER_CONFIGURATION_FAILED");
  return NextResponse.json({
    ok: true,
    action: "configure",
    worker: safeWorkerStatus({
      configured: true,
      enabled: result.enabled,
      endpoint_host: result.endpoint_host,
      schedule: result.schedule,
      application_authorization_configured: result.application_authorization_configured,
      deployment_protection_configured: result.deployment_protection_configured,
    }),
  }, { headers: privateHeaders });
}

async function workerStatus() {
  const [workerRead, syncRead] = await Promise.all([readGuideWorkerStatus(), readGuideSyncStatus()]);
  return NextResponse.json({
    ok: true,
    action: "status",
    worker: safeWorkerStatus(requireRpc(workerRead, "GUIDE_WORKER_STATUS_UNAVAILABLE")),
    sync: safeSyncStatus(requireRpc(syncRead, "GUIDE_SYNC_STATUS_UNAVAILABLE")),
  }, { headers: privateHeaders });
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return unavailable();
  try { assertGuideSyncEnvironment({ triggerType: "SCHEDULED" }); }
  catch { return unavailable(); }
  if (!guideWorkerAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "GUIDE_WORKER_UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "sync").trim().toLowerCase();
    if (action === "configure") return configureWorker(body.enabled !== false);
    if (action === "status") return workerStatus();
    if (action !== "sync") {
      return NextResponse.json({ ok: false, code: "GUIDE_WORKER_ACTION_INVALID" }, {
        status: 400,
        headers: privateHeaders,
      });
    }
    const result = await synchronizeGuideContent({ triggerType: "SCHEDULED", requestedBy: "preview-guide-scheduler" });
    return NextResponse.json(result, {
      status: result.ok ? 200 : result.failureCategory === "VALIDATION" ? 422 : 503,
      headers: privateHeaders,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      code: "GUIDE_SYNC_FAILED",
      message: "Guide synchronization did not complete.",
      lastKnownGoodPreserved: true,
    }, { status: 503, headers: privateHeaders });
  }
}
