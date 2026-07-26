import { NextResponse } from "next/server";
import { loadPredictionSheets } from "../../../../lib/prediction-data";
import { buildScorecardAnalytics } from "../../../../lib/scorecard-analytics";
import { buildScorecardCalibrationReport } from "../../../../lib/scorecard-calibration-report";
import {
  getAllPlayerStats,
  getHeadToHead,
  getPartnershipStats,
  refreshHistoricalData,
} from "../../../../lib/stats";

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
  if (!authorized(request)) {
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }
  const tournamentId = new URL(request.url).searchParams.get("tournament") || "";
  try {
    const sheets = await loadPredictionSheets();
    const analytics = buildScorecardAnalytics({
      roundScorecards: sheets.roundScorecards,
      matches: sheets.matches,
      courseHoles: sheets.holes,
      courses: sheets.courses,
      teamNames: sheets.teamNames,
      players: sheets.players,
    });
    await refreshHistoricalData();
    const historical = Object.fromEntries(
      getAllPlayerStats().map(({ player, stats }) => [player["Player ID"], stats])
    );
    const partnerships = Object.fromEntries(
      getPartnershipStats().byMatches.map((row) => [
        row.key,
        { record: row.record, byFormat: row.byFormat, percentage: row.percentage },
      ])
    );
    const playerIds = Object.keys(historical);
    const headToHead = {};
    for (let first = 0; first < playerIds.length; first += 1) {
      for (let second = first + 1; second < playerIds.length; second += 1) {
        headToHead[`${playerIds[first]}|${playerIds[second]}`] = getHeadToHead(playerIds[first], playerIds[second]);
      }
    }
    return NextResponse.json({
      data: buildScorecardCalibrationReport({
        sheets,
        scorecards: analytics.usableScorecards,
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
