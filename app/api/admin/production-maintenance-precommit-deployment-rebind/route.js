import { NextResponse } from "next/server";

import { authorizePreviewDirector } from
  "../../../../lib/preview-director-authorization.js";
import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
} from "../../../../lib/production-cutover-activation-contract.js";
import { rebindProductionMaintenancePrecommitDeployment } from
  "../../../../lib/production-maintenance-precommit-deployment-rebind.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clean = (value) => String(value ?? "").trim();
const noStore = { "Cache-Control": "private, no-store" };

function unavailable() {
  return NextResponse.json({ error: "Not found." }, {
    status: 404,
    headers: noStore,
  });
}

async function authorize(request) {
  if (clean(process.env.VERCEL_ENV).toLowerCase() !== "production") {
    return { response: unavailable() };
  }
  try {
    const activation = assertProductionCutoverActivation({
      requiredPhase: "SCORING_COMMIT",
    });
    if (activation.phase !== "SCORING_COMMIT") throw new Error("phase");
    assertProductionCutoverRequest(request, process.env, {
      requireOrigin: true,
    });
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

export async function POST(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON request body is required." }, {
      status: 400,
      headers: noStore,
    });
  }
  const actorId = clean(
    access.identity?.actor?.id ||
    access.identity?.player?.id ||
    access.identity?.authUserId,
  );
  try {
    const result = await rebindProductionMaintenancePrecommitDeployment({
      input,
      actorId,
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    console.error("Production maintenance precommit deployment rebind failed", {
      code: clean(error?.code),
      status: Number(error?.status || 0),
    });
    return NextResponse.json({
      error: "Production maintenance precommit deployment rebind failed.",
      code: clean(error?.code) ||
        "PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_FAILED",
    }, {
      status: Number(error?.status || 503),
      headers: noStore,
    });
  }
}
