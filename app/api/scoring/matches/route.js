import { withOperationalRoute, recordOperationalError } from "../../../../lib/operational-telemetry.js";
import { NextResponse } from "next/server";
import { verifyScoringSession } from "../../../../lib/scoring-access.js";
import {
  assertLiveScoringTestEnvironment,
  readLiveMatchAdminData,
} from "../../../../lib/google-sheets-write.js";

export const dynamic = "force-dynamic";

async function telemetryGET(request) {
  try {
    assertLiveScoringTestEnvironment();
    const authorization = request.headers.get("authorization") || "";
    const session = verifyScoringSession(authorization.replace(/^Bearer\s+/i, ""));
    if (session.scope !== "admin") throw new Error("Administrator access is required.");
    const data = await readLiveMatchAdminData();
    return NextResponse.json({
      matches: data.matches.map((match) =>
        Object.fromEntries(Object.entries(match).filter(([key]) => key !== "Access Code Hash"))
      ),
    });
  } catch (error) {
    recordOperationalError(error);
    return NextResponse.json({ error: error?.message || "Unable to load matches." }, { status: 403 });
  }
}

export const GET = withOperationalRoute({ route: "/api/scoring/matches", domain: "SCORING" }, telemetryGET);
