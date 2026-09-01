import { NextResponse } from "next/server";
import { buildScorecardCalibrationReport } from "../../../../lib/scorecard-calibration-report";
import { prepareWarRoomInput } from "../../../../lib/war-room-input-service";

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = request.headers.get("x-admin-secret");
  const allowed = [
    process.env.ADMIN_SECRET,
    process.env.GUIDE_ADMIN_SECRET,
    process.env.ODDS_ADMIN_SECRET,
    process.env.LIVE_ADMIN_SECRET,
  ].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
}

export async function GET(request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }
  const tournamentId = new URL(request.url).searchParams.get("tournament") || "";
  try {
    const input = await prepareWarRoomInput({ scope: "scorecard-calibration" });
    const { sheets, historical, partnerships, headToHead, scorecardAnalytics } = input.consumerData;
    return NextResponse.json({
      data: buildScorecardCalibrationReport({
        sheets,
        scorecards: scorecardAnalytics.scorecards,
        historical,
        partnerships,
        headToHead,
        tournamentId,
      }),
    });
  } catch (error) {
    console.error("Scorecard calibration report failed", {
      tournamentId,
      reason: error?.message || String(error),
      stack: error?.stack,
    });
    return NextResponse.json(
      { error: error?.message || "Unable to build scorecard calibration report." },
      { status: 400 }
    );
  }
}
