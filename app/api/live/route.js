import { NextResponse } from "next/server";
import { getTournamentData, tournamentLoaderDiagnostics } from "../../live/sheetData";
import { workbookInitializationMessage } from "../../../lib/tournament-workbook-initialization";
import { attachRuntimeTiming, createRuntimeProfile } from "../../../lib/runtime-performance";
import { withNormalizedReadDiagnostics } from "../../../lib/google-sheets-server-read";
import { tournamentReadEnvironment } from "../../../lib/tournament-read-source";
import { leaderboardsCoreReadEnvironment } from "../../../lib/leaderboards-core-read-source";
import { netSkinsReadEnvironment } from "../../../lib/net-skins-read-source";
import { applicationRequestEnvironment } from "../../../lib/production-shadow-request-environment.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const profile = createRuntimeProfile("GET /api/live");
  try {
    const env = applicationRequestEnvironment(request);
    const tournamentSource = tournamentReadEnvironment(env);
    const leaderboardsSource = leaderboardsCoreReadEnvironment(env);
    const netSkinsSource = netSkinsReadEnvironment(env);
    const selectedGoogleConsumers = [
      ["tournament", tournamentSource],
      ["leaderboards-core", leaderboardsSource],
      ["net-skins", netSkinsSource],
    ].filter(([, source]) => source.resolved === "google" && (
      !source.previewDeployment || source.requested === "google"
    )).map(([consumer]) => consumer);
    if (!selectedGoogleConsumers.length) {
      profile.finish({ blocked: true, source: "supabase" });
      return NextResponse.json({
        error: "The legacy Google live endpoint is not selected in this environment.",
        code: "LEGACY_GOOGLE_LIVE_READ_NOT_SELECTED",
        replacement: "/api/tournament/live",
      }, {
        status: 409,
        headers: {
          "X-Tournament-Read-Source": tournamentSource.resolved,
          "X-Leaderboards-Core-Read-Source": leaderboardsSource.resolved,
          "X-Net-Skins-Read-Source": netSkinsSource.resolved,
          "X-Google-Fallback-Used": "false",
        },
      });
    }
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
