import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import {
  configureProductionNetSkinsV1,
  enqueueProductionNetSkinsV1Recalculation,
  processProductionNetSkinsV1Job,
} from "../../../../lib/production-net-skins-server.js";
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
    error: "The Production Net Skins operation did not complete.",
    code: clean(error?.code || "PRODUCTION_NET_SKINS_OPERATION_FAILED"),
  };
}

/**
 * Director-only operation boundary. It deliberately has no GET and cannot
 * accept caller-selected Production resources, authority epochs, deployments,
 * publication modes, rules, engine versions, or worker identities.
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
  if (!new Set(["configure", "enqueue", "process"]).has(action)) {
    return NextResponse.json({ error: "Unsupported Production Net Skins action." }, {
      status: 400,
      headers: noStore,
    });
  }
  const options = {
    expectedConfigurationRevision: input.expectedConfigurationRevision,
    requestFingerprint: input.requestFingerprint,
  };
  try {
    const scoped = await withDataAuthorityRequestScope({
      label: `production-net-skins-v1-${action}`,
      source: "supabase-production-net-skins-v1",
    }, async () => {
      if (action === "configure") {
        return configureProductionNetSkinsV1({
          ...options,
          ...actor(access.identity),
          // V1 is intentionally fixed to all three approved 2026 rounds.
          eligibleRoundNumbers: [1, 2, 3],
        });
      }
      if (action === "enqueue") {
        return enqueueProductionNetSkinsV1Recalculation({
          ...options,
          roundNumbers: input.roundNumbers,
          reason: input.reason,
          requestedBy: `Production Director · ${actor(access.identity).actorPlayerId}`,
        });
      }
      return processProductionNetSkinsV1Job({
        ...options,
        workerId: "production-net-skins-v1-director-worker",
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
    console.error("Production Net Skins operation failed", {
      action,
      code: clean(error?.code || "PRODUCTION_NET_SKINS_OPERATION_FAILED"),
      status: Number(error?.status || 0),
    });
    return NextResponse.json(safeFailure(error), {
      status: Number(error?.status || 503),
      headers: noStore,
    });
  }
}
