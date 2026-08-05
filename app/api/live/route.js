import { NextResponse } from "next/server";
import { getTournamentData, tournamentLoaderDiagnostics } from "../../live/sheetData";
import { workbookInitializationMessage } from "../../../lib/tournament-workbook-initialization";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../lib/runtime-performance";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = createRuntimeProfile("GET /api/live");
  try {
    const data = await profile.measure("tournamentModel", () => getTournamentData());
    const diagnostics = tournamentLoaderDiagnostics();
    const modelCacheHit = diagnostics.cacheBehavior === "model-cache-hit";
    const timing = profile.finish({
      googleSheetsReadMs: modelCacheHit ? 0 : diagnostics.lastTiming?.googleSheetsReadMs || 0,
      workbookNormalizationMs: modelCacheHit ? 0 : diagnostics.lastTiming?.workbookNormalizationMs || 0,
      cacheLookupMs: 0,
      cache: diagnostics.cacheBehavior,
    });
    return attachRuntimeTiming(NextResponse.json({ data }), timing);
  } catch (error) {
    profile.finish({ failed: true });
    console.error("Public live refresh failed", { reason: error?.message || String(error) });
    return NextResponse.json({ error: workbookInitializationMessage(error, "Unable to refresh live scores.") }, { status: 503 });
  }
}
