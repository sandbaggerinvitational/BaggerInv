import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  approveProductionHandicapRevision,
  readProductionHandicapManagement,
  stageProductionHandicapRevision,
  validateProductionHandicapRevision,
} from "../../../../lib/production-handicap-management-server.js";
import {
  readProductionHandicapSource,
  recordProductionManualHandicapSource,
  retireProductionPlayerGhinIdentity,
  setProductionPlayerGhinIdentity,
  stageProductionHybridHandicapDraft,
} from "../../../../lib/production-handicap-source-server.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const headers = { "Cache-Control": "private, no-store" };
const REVISION_ACTIONS = new Set(["stage", "validate", "approve"]);
const SOURCE_ACTIONS = new Set([
  "set-ghin-identity", "retire-ghin-identity", "save-manual-source", "stage-hybrid-draft",
]);

function unavailable() {
  return NextResponse.json({ error: "Not found." }, { status: 404, headers });
}

async function authorize(request, { mutation = false } = {}) {
  if (clean(process.env.VERCEL_ENV).toLowerCase() !== "production") {
    return { response: unavailable() };
  }
  try {
    assertProductionCutoverActivation({ requiredPhase: "OBSERVATION" });
    if (mutation) {
      assertProductionCutoverRequest(request, process.env, { requireOrigin: true });
    }
  } catch {
    return { response: unavailable() };
  }
  const authorization = await authorizePreviewDirector({
    request,
    env: process.env,
    allowBootstrap: false,
  });
  if (authorization.status === "unavailable") {
    return {
      response: NextResponse.json({
        error: "Director verification is temporarily unavailable.",
        code: "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
      }, { status: 503, headers: { ...headers, "Retry-After": "1" } }),
    };
  }
  if (authorization.status !== "active" ||
      authorization.source !== "production-director-entitlement") {
    return {
      response: NextResponse.json({
        error: "Active Tournament Director access is required.",
        code: "DIRECTOR_AUTHORIZATION_REQUIRED",
      }, { status: 403, headers }),
    };
  }
  return { identity: authorization.identity };
}

function actor(identity = {}) {
  return {
    actorAuthUserId: clean(identity.authUserId),
    actorPlayerId: clean(identity.actor?.id || identity.player?.id),
  };
}

function safeFailure(error) {
  return {
    error: "The Production handicap operation did not complete.",
    code: /^(?:PRODUCTION_)?(?:HANDICAP|GHIN)_[A-Z0-9_]{3,120}$/.test(clean(error?.code))
      ? clean(error.code)
      : "PRODUCTION_HANDICAP_OPERATION_FAILED",
    issues: Array.isArray(error?.diagnostics?.validation?.issues)
      ? error.diagnostics.validation.issues
      : [],
  };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: "production-handicap-revision-read",
      source: "supabase-production-handicap-revision-v1",
    }, async () => {
      const identity = actor(access.identity);
      const [handicaps, sourceEvidence] = await Promise.all([
        readProductionHandicapManagement(identity),
        readProductionHandicapSource(identity),
      ]);
      return { ...handicaps, sourceEvidence };
    });
    return NextResponse.json({ ok: true, data: scoped.result }, {
      headers: { ...headers, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production handicap read failed", {
      code: clean(error?.code || "PRODUCTION_HANDICAP_READ_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers,
    });
  }
}

export async function POST(request) {
  const access = await authorize(request, { mutation: true });
  if (access.response) return access.response;
  let input;
  try { input = await request.json(); }
  catch {
    return NextResponse.json({
      error: "A JSON request body is required.",
      code: "PRODUCTION_HANDICAP_INPUT_REQUIRED",
    }, { status: 400, headers });
  }
  const action = clean(input?.action).toLowerCase();
  if (!REVISION_ACTIONS.has(action) && !SOURCE_ACTIONS.has(action)) {
    return NextResponse.json({
      error: "Unsupported Production handicap action.",
      code: "PRODUCTION_HANDICAP_ACTION_INVALID",
    }, { status: 400, headers });
  }
  const common = {
    ...actor(access.identity),
    revisionId: input.revisionId,
    expectedRevision: input.expectedRevision,
    operationRequestId: input.operationRequestId,
  };
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-handicap-revision-${action}`,
      source: "supabase-production-handicap-revision-v1",
    }, async () => {
      if (action === "set-ghin-identity") {
        return setProductionPlayerGhinIdentity({
          ...actor(access.identity),
          operationRequestId: input.operationRequestId,
          playerId: input.playerId,
          ghinNumber: input.ghinNumber,
          expectedIdentityId: input.expectedIdentityId,
          replaceConfirmed: input.replaceConfirmed,
        });
      }
      if (action === "retire-ghin-identity") {
        return retireProductionPlayerGhinIdentity({
          ...actor(access.identity),
          operationRequestId: input.operationRequestId,
          playerId: input.playerId,
          expectedIdentityId: input.expectedIdentityId,
          retirementConfirmed: input.retirementConfirmed,
        });
      }
      if (action === "save-manual-source") {
        return recordProductionManualHandicapSource({
          ...actor(access.identity),
          operationRequestId: input.operationRequestId,
          playerId: input.playerId,
          expectedIdentityId: input.expectedIdentityId,
          expectedPointerRevision: input.expectedPointerRevision,
          currentIndex: input.currentIndex,
          lowIndex: input.lowIndex,
          lowIndexDate: input.lowIndexDate,
        });
      }
      if (action === "stage-hybrid-draft") {
        return stageProductionHybridHandicapDraft({
          ...actor(access.identity),
          operationRequestId: input.operationRequestId,
          expectedRevision: input.expectedRevision,
          expectedSourceFingerprint: input.expectedSourceFingerprint,
          effectiveDate: input.effectiveDate,
          entries: input.entries,
        });
      }
      if (action === "stage") {
        return stageProductionHandicapRevision({
          ...common,
          effectiveDate: input.effectiveDate,
          entries: input.entries,
        });
      }
      if (action === "validate") {
        return validateProductionHandicapRevision(common);
      }
      return approveProductionHandicapRevision({
        ...common,
        confirmation: input.confirmation,
      });
    });
    return NextResponse.json({
      ok: true,
      action,
      data: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, {
      headers: { ...headers, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production handicap operation failed", {
      action,
      code: clean(error?.code || "PRODUCTION_HANDICAP_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers,
    });
  }
}
