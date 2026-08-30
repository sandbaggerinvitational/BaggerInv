import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  productionDirectorAuthorizationFailure,
  readProductionDirectorOverview,
} from "../../../../lib/production-director-console.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  const authorization = await authorizePreviewDirector({
    request,
    allowBootstrap: false,
  });
  if (authorization.status !== "active" ||
      authorization.source !== "production-director-entitlement") {
    const failure = productionDirectorAuthorizationFailure(authorization);
    return NextResponse.json({ error: failure.message, code: failure.code }, {
      status: failure.status,
      headers: failure.retryable
        ? { ...headers, "Retry-After": "1", "X-Director-Retryable": "identity" }
        : headers,
    });
  }

  try {
    const data = await readProductionDirectorOverview({
      env: process.env,
      actorAuthUserId: authorization.identity?.authUserId,
      actorPlayerId: authorization.identity?.actor?.id || authorization.identity?.player?.id,
    });
    return NextResponse.json({ data }, { headers });
  } catch (error) {
    console.error("Production Director overview read failed", {
      code: error?.causeCode || error?.code || "PRODUCTION_DIRECTOR_READ_FAILED",
    });
    return NextResponse.json({
      error: "Production tournament data is temporarily unavailable. Please try again.",
      code: "DIRECTOR_DATA_UNAVAILABLE",
    }, { status: 503, headers });
  }
}
