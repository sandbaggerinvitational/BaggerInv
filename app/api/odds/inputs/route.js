import { NextResponse } from "next/server";
import { buildOddsInputProjection, compareOddsDeterministicParity, importOddsInputProjection, loadSupabaseOddsInputs } from "../../../../lib/championship-odds-supabase.js";
import { loadPredictionSheets } from "../../../../lib/prediction-data.js";
import { refreshHistoricalData, getAllPlayerStats } from "../../../../lib/stats.js";
import { currentTournamentYear } from "../../../../lib/tournament-context.js";
import { simulateTournamentOdds } from "../../../../lib/tournament-odds.js";
import { readPublishedOddsView, publishedOddsSnapshotsFromView } from "../../../../lib/published-odds-supabase.js";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function directorFor(request) {
  const result = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  return result?.status === "active" ? result : null;
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  try {
    const { action = "verify-current", phase = "Round 3 Pairings Announced", iterations = 10_000 } = await request.json();
    const actorId = director.identity?.player?.id || "Director";
    if (action === "refresh") {
      const sheets = await loadPredictionSheets();
      const year = currentTournamentYear(sheets);
      await refreshHistoricalData();
      const historical = Object.fromEntries(getAllPlayerStats().map(({ player, stats }) => [player["Player ID"], { sandbaggerRatings: stats.sandbaggerRatings || {} }]));
      const input = buildOddsInputProjection({ tournamentId: String(year), tournamentYear: year, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID,
        settings: sheets.settings || [], historical, requestedBy: actorId });
      const imported = await importOddsInputProjection(input);
      if (!imported.payload?.ok) throw Object.assign(new Error("Odds input projection failed."), { code: imported.payload?.code });
      return NextResponse.json({ ok: true, action, projection: imported.payload, fingerprints: {
        bundle: input.bundle_fingerprint, settings: input.settings_fingerprint, ratings: input.ratings_fingerprint,
      } });
    }
    if (action !== "verify-current") return NextResponse.json({ error: "Unsupported Odds input action." }, { status: 400 });
    const inputs = await loadSupabaseOddsInputs(director.identity?.tournamentId || "2026");
    const generated = simulateTournamentOdds({ ...inputs, phase, iterations: Number(iterations) });
    const publishedView = await readPublishedOddsView({ tournamentId: String(generated.year), sourceWorkbookId: process.env.GOOGLE_SHEETS_ID });
    if (!publishedView.payload?.ok) throw Object.assign(new Error("Published Odds history is unavailable."), { code: publishedView.payload?.code });
    const retained = publishedOddsSnapshotsFromView(publishedView.payload.data).find((row) => row.phase === phase);
    if (!retained) return NextResponse.json({ ok: true, action, phase, reproducible: false, reason: "NO_RETAINED_PUBLICATION", generated, metadata: inputs.metadata });
    const parity = compareOddsDeterministicParity(retained, generated);
    return NextResponse.json({ ok: true, action, phase, parity, metadata: inputs.metadata, timings: inputs.diagnostics });
  } catch (error) {
    const diagnostics = error?.shadowDiagnostics || null;
    console.error("Championship Odds input verification failed", { code: error?.code || diagnostics?.code || "ODDS_INPUT_VERIFICATION_FAILED",
      message: error?.message || String(error), diagnostics });
    return NextResponse.json({ error: "Championship Odds inputs could not be verified.",
      code: error?.code || diagnostics?.code || "ODDS_INPUT_VERIFICATION_FAILED",
      ...(process.env.VERCEL_ENV === "preview" ? { diagnostics } : {}) }, { status: 503 });
  }
}
