import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  configureProductionCalcuttaV1,
  enqueueProductionCalcuttaV1Recalculation,
  processProductionCalcuttaV1Job,
  publishProductionCalcuttaV1,
  replaceProductionCalcuttaV1AuctionFacts,
  unpublishProductionCalcuttaV1,
} from "../../../../lib/production-calcutta-server.js";
import {
  dataAuthorityResponseHeaders,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const noStore = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Not found." }, {
  status: 404,
  headers: noStore,
});

async function authorize(request) {
  if (clean(process.env.VERCEL_ENV).toLowerCase() !== "production") {
    return { response: unavailable() };
  }
  try {
    assertProductionCutoverActivation({ requiredPhase: "OBSERVATION" });
    assertProductionCutoverRequest(request, process.env, { requireOrigin: true });
  } catch {
    return { response: unavailable() };
  }
  const director = await authorizePreviewDirector({
    request,
    env: process.env,
    allowBootstrap: false,
  });
  if (director.status === "unavailable") {
    return {
      response: NextResponse.json({
        error: "Director verification is temporarily unavailable.",
      }, { status: 503, headers: noStore }),
    };
  }
  if (director.status !== "active") {
    return {
      response: NextResponse.json({
        error: "Tournament Director access is required.",
      }, { status: 403, headers: noStore }),
    };
  }
  return { identity: director.identity };
}

function actor(identity = {}) {
  return {
    actorAuthUserId: clean(identity.authUserId),
    actorPlayerId: clean(identity.actor?.id || identity.player?.id),
  };
}

function safeFailure(error) {
  return {
    error: "The Production Calcutta operation did not complete.",
    code: clean(error?.code || "PRODUCTION_CALCUTTA_OPERATION_FAILED"),
  };
}

/**
 * Director-only V1 operation boundary. Resources, authority, publication
 * policy, engine version, worker identity, and runtime scope are server-fixed.
 */
export async function POST(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  let input;
  try { input = await request.json(); }
  catch {
    return NextResponse.json({ error: "A JSON request body is required." }, {
      status: 400,
      headers: noStore,
    });
  }
  const action = clean(input?.action).toLowerCase();
  if (!new Set([
    "configure",
    "replace-auction",
    "publish",
    "unpublish",
    "enqueue",
    "process",
  ]).has(action)) {
    return NextResponse.json({ error: "Unsupported Production Calcutta action." }, {
      status: 400,
      headers: noStore,
    });
  }
  const revisions = {
    expectedConfigurationRevision: input.expectedConfigurationRevision,
    expectedConfigurationFingerprint: input.expectedConfigurationFingerprint,
    expectedAuctionRevision: input.expectedAuctionRevision,
    expectedAuctionFingerprint: input.expectedAuctionFingerprint,
    expectedPublicationRevision: input.expectedPublicationRevision,
    requestFingerprint: input.requestFingerprint,
  };
  const director = actor(access.identity);
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-calcutta-v1-${action}`,
      source: "supabase-production-calcutta-v1",
    }, async () => {
      if (action === "configure") {
        return configureProductionCalcuttaV1({
          ...revisions,
          ...director,
          pointStructure: input.pointStructure,
          payoutStructure: input.payoutStructure,
        });
      }
      if (action === "replace-auction") {
        return replaceProductionCalcuttaV1AuctionFacts({
          ...revisions,
          ...director,
          purchases: input.purchases,
          ownership: input.ownership,
        });
      }
      if (action === "publish") {
        return publishProductionCalcuttaV1({ ...revisions, ...director });
      }
      if (action === "unpublish") {
        return unpublishProductionCalcuttaV1({ ...revisions, ...director });
      }
      if (action === "enqueue") {
        return enqueueProductionCalcuttaV1Recalculation({
          ...revisions,
          reason: input.reason,
          requestedBy: `Production Director · ${director.actorPlayerId}`,
        });
      }
      return processProductionCalcuttaV1Job({
        ...revisions,
        workerId: "production-calcutta-v1-director-worker",
      });
    });
    return NextResponse.json({
      ok: true,
      action,
      result: scoped.result,
      fallbackUsed: false,
      googleRequests: 0,
    }, {
      headers: { ...noStore, ...dataAuthorityResponseHeaders(scoped.diagnostics) },
    });
  } catch (error) {
    console.error("Production Calcutta operation failed", {
      action,
      code: clean(error?.code || "PRODUCTION_CALCUTTA_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: noStore,
    });
  }
}
