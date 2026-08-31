import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  inspectProductionDirectorProjectionSynchronization,
  synchronizeProductionDirectorProjection,
} from "../../../../lib/production-director-projection-synchronization.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const noStore = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });

function publicError(error) {
  return {
    error: "Production Director synchronization did not complete.",
    code: clean(error?.code || "PRODUCTION_DIRECTOR_SYNC_FAILED"),
  };
}

async function authorize(request) {
  if (clean(process.env.VERCEL_ENV).toLowerCase() !== "production") return { response: unavailable() };
  try {
    assertProductionCutoverActivation({ requiredPhase: "IDENTITY" });
    assertProductionCutoverRequest(request, process.env, { requireOrigin: true });
  } catch {
    return { response: unavailable() };
  }
  const director = await authorizePreviewDirector({ request, allowBootstrap: false });
  if (director.status === "unavailable") {
    return { response: NextResponse.json({ error: "Director verification is temporarily unavailable." }, { status: 503, headers: noStore }) };
  }
  if (director.status !== "active") {
    return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403, headers: noStore }) };
  }
  return { identity: director.identity };
}

function resultPayload(action, result, diagnostics) {
  const current = result.context?.current_projection || null;
  return {
    ok: true,
    action,
    domain: result.domain,
    requiredPhase: result.requiredPhase || undefined,
    freshness: result.freshness,
    changed: result.changed,
    duplicate: result.duplicate,
    revisionId: result.revisionId,
    revisionNumber: result.revisionNumber,
    sourceFingerprint: result.sourceFingerprint || result.source?.source_fingerprint,
    payloadFingerprint: result.payloadFingerprint || result.source?.payload_fingerprint,
    readbackParity: result.readbackParity,
    current: current ? {
      revisionId: current.revision_id,
      revisionNumber: current.revision_number,
      validationStatus: current.validation_status,
      synchronizedAt: current.imported_at,
    } : null,
    googleRead: result.googleRead,
    fallbackUsed: false,
    requestDiagnostics: diagnostics,
  };
}

// POST-only by design: even source freshness verification requires an active
// Director, exact canonical same-origin request, and an explicit operation.
export async function POST(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  let input;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "A JSON request body is required." }, { status: 400, headers: noStore }); }
  const action = clean(input?.action).toLowerCase();
  if (!new Set(["diagnose", "synchronize"]).has(action)) {
    return NextResponse.json({ error: "Unsupported Production synchronization action." }, { status: 400, headers: noStore });
  }
  if (clean(input?.domain).toUpperCase() === "PREDICTION_SETTINGS") {
    return NextResponse.json({
      error: "Production Prediction Settings are managed in the Director Console.",
      code: "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED",
    }, { status: 410, headers: noStore });
  }
  if (clean(input?.domain).toUpperCase() === "DRAFT") {
    return NextResponse.json({
      error: "Production Drafts are managed in the Director Console.",
      code: "PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED",
    }, { status: 410, headers: noStore });
  }
  const correctionReason = clean(input?.correctionReason);
  if (correctionReason && correctionReason.length < 10) {
    return NextResponse.json({ error: "A historical Draft correction reason must contain at least 10 characters." }, { status: 400, headers: noStore });
  }
  const actorAuthUserId = clean(access.identity?.authUserId);
  const actorPlayerId = clean(access.identity?.actor?.id || access.identity?.player?.id);
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-director-${action}-${clean(input?.domain).toLowerCase()}`,
      source: "google-director-authoring-to-supabase-projection",
    }, () => action === "synchronize"
      ? synchronizeProductionDirectorProjection({
          domain: input.domain,
          actorAuthUserId,
          actorPlayerId,
          correctionReason,
          targetTournamentId: input.targetTournamentId,
          targetTournamentYear: input.targetTournamentYear,
        })
      : inspectProductionDirectorProjectionSynchronization({
          domain: input.domain,
          actorAuthUserId,
          actorPlayerId,
          correctionReason,
          targetTournamentId: input.targetTournamentId,
          targetTournamentYear: input.targetTournamentYear,
        }));
    return NextResponse.json(resultPayload(action, scoped.result, scoped.diagnostics), {
      headers: { ...noStore, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production Director projection synchronization failed", {
      code: clean(error?.code),
      status: Number(error?.status || 0),
      domain: clean(input?.domain).toUpperCase(),
      action,
    });
    return NextResponse.json(publicError(error), {
      status: Number(error?.status || 503),
      headers: noStore,
    });
  }
}
