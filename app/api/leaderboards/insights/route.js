import { NextResponse } from "next/server";
import { readOddsSnapshots, withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../../lib/runtime-performance";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const profile = createRuntimeProfile("GET /api/leaderboards/insights");
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    return NextResponse.json({ error: "A valid tournament year is required." }, { status: 400 });
  }
  const measured = await profile.measure("googleSheetsRead", () => withWorkbookWriteDiagnostics("GET /api/leaderboards/insights", readOddsSnapshots));
  const loadedSnapshots = measured.result;
  console.info("Leaderboard Insights workbook access", measured.diagnostics);
  const assemblyStartedAt = performance.now();
  const snapshots = loadedSnapshots
    .filter((snapshot) => Number(snapshot.year) === year)
    .sort((left, right) => Number(left.phaseOrder || 0) - Number(right.phaseOrder || 0));
  profile.mark("renderingPreparation", performance.now() - assemblyStartedAt);
  return attachRuntimeTiming(NextResponse.json({ snapshots }, { headers: { "Cache-Control": "no-store" } }), profile.finish());
}
