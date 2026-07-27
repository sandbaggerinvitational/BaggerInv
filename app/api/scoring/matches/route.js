import { NextResponse } from "next/server";
import { verifyScoringSession } from "../../../../lib/scoring-access.js";
import {
  assertLiveScoringTestEnvironment,
  readLiveMatchAdminData,
} from "../../../../lib/google-sheets-write.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
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
    return NextResponse.json({ error: error?.message || "Unable to load matches." }, { status: 403 });
  }
}
