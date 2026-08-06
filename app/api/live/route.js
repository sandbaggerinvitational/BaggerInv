import { NextResponse } from "next/server";
import { getTournamentData, tournamentLoaderDiagnostics } from "../../live/sheetData";
import { workbookInitializationMessage } from "../../../lib/tournament-workbook-initialization";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../lib/runtime-performance";
import { withNormalizedReadDiagnostics } from "../../../lib/google-sheets-server-read";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = createRuntimeProfile("GET /api/live");
  try {
    const measured = await profile.measure("tournamentModel", () => withNormalizedReadDiagnostics("GET /api/live", getTournamentData));
    const data = measured.result;
    const diagnostics = tournamentLoaderDiagnostics();
    const modelCacheHit = diagnostics.cacheBehavior === "model-cache-hit";
    const timing = profile.finish({
      googleSheetsReadMs: modelCacheHit ? 0 : diagnostics.lastTiming?.googleSheetsReadMs || 0,
      workbookNormalizationMs: modelCacheHit ? 0 : diagnostics.lastTiming?.workbookNormalizationMs || 0,
      cacheLookupMs: 0,
      cache: diagnostics.cacheBehavior,
      workbookAccess: measured.diagnostics,
    });
    return attachRuntimeTiming(NextResponse.json({ data }), timing);
  } catch (error) {
    profile.finish({ failed: true });
    console.error("Public live refresh failed", { reason: error?.message || String(error) });
    return NextResponse.json({ error: workbookInitializationMessage(error, "Unable to refresh live scores.") }, { status: 503 });
  }
}
