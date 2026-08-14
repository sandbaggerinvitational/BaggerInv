import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { assertGuideSyncEnvironment } from "../../../../lib/guide-read-source.js";
import { synchronizeGuideContent } from "../../../../lib/guide-sync-service.js";
import { readGuideSyncStatus, readGuideWorkerStatus } from "../../../../lib/guide-supabase.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404, headers });

async function authorize(request) {
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  try { assertGuideSyncEnvironment({ triggerType: "MANUAL" }); }
  catch { return { response: unavailable() }; }
  const authorization = await authorizePreviewDirector({ request, allowBootstrap: true });
  if (authorization.status === "unavailable") {
    return { response: NextResponse.json({ error: "Director verification is temporarily unavailable." }, {
      status: 503,
      headers: { ...headers, "X-Director-Retryable": "identity" },
    }) };
  }
  if (authorization.status !== "active") {
    return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403, headers }) };
  }
  return { identity: authorization.identity };
}

function requireStatus(result, fallbackCode) {
  if (result?.payload?.ok) return result.payload;
  const error = new Error("Guide synchronization status is unavailable.");
  error.code = clean(result?.payload?.code || fallbackCode);
  throw error;
}

function directorActorId(identity = {}) {
  return clean(identity.actor?.id || identity.actor?.playerId || identity.player?.id || "preview-director");
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const [syncRead, workerRead] = await Promise.all([readGuideSyncStatus(), readGuideWorkerStatus()]);
    const sync = requireStatus(syncRead, "GUIDE_STATUS_UNAVAILABLE");
    const worker = requireStatus(workerRead, "GUIDE_WORKER_STATUS_UNAVAILABLE");
    return NextResponse.json({
      ok: true,
      tournamentId: sync.tournament_id,
      state: sync.state,
      current: sync.current || null,
      lastAttempt: sync.last_attempt || null,
      lastSuccess: sync.last_success || null,
      lastKnownGoodAvailable: sync.last_known_good_available === true,
      worker: {
        configured: worker.configured === true,
        enabled: worker.enabled === true,
        endpointHost: clean(worker.endpoint_host),
        schedule: clean(worker.schedule),
        applicationAuthorizationConfigured: worker.application_authorization_configured === true,
        deploymentProtectionConfigured: worker.deployment_protection_configured === true,
        configuredAt: worker.configured_at || null,
        updatedAt: worker.updated_at || null,
        lastRequestedAt: worker.last_requested_at || null,
        lastResponseResult: clean(worker.last_response_result),
        lastResponseStatusCode: Number(worker.last_response_status_code || 0) || null,
        lastResponseAt: worker.last_response_at || null,
        lastCronStatus: clean(worker.last_cron_status),
        lastCronStartedAt: worker.last_cron_started_at || null,
        lastCronCompletedAt: worker.last_cron_completed_at || null,
      },
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Guide synchronization status is temporarily unavailable." }, { status: 503, headers });
  }
}

export async function POST(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  const body = await request.json().catch(() => ({}));
  if (clean(body.action || "refresh").toLowerCase() !== "refresh") {
    return NextResponse.json({ error: "Unsupported Guide operation." }, { status: 400, headers });
  }
  try {
    const result = await synchronizeGuideContent({
      triggerType: "MANUAL",
      requestedBy: directorActorId(access.identity),
    });
    return NextResponse.json({ action: "refresh-guide-content", result }, {
      status: result.ok ? 200 : result.failureCategory === "VALIDATION" ? 422 : 503,
      headers,
    });
  } catch {
    return NextResponse.json({
      error: "Guide synchronization did not complete.",
      code: "GUIDE_SYNC_FAILED",
      lastKnownGoodPreserved: true,
    }, { status: 503, headers });
  }
}
