import { NextResponse } from "next/server";
import { buildOddsInputProjection, compareOddsDeterministicParity, importOddsInputProjection, loadSupabaseOddsInputs } from "../../../../lib/championship-odds-supabase.js";
import { getAllPlayerStats } from "../../../../lib/stats.js";
import { readWorkbookSheetsByName } from "../../../../lib/google-sheets-write.js";
import { simulateTournamentOdds } from "../../../../lib/tournament-odds.js";
import { readPublishedOddsView, publishedOddsSnapshotsFromView } from "../../../../lib/published-odds-supabase.js";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Preview deployment health only. This intentionally returns no configuration
// or tournament payload; it exists so a failed PostgREST schema exposure can be
// distinguished from Director authentication and Google projection failures.
export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const director = await directorFor(request);
    if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
    if (new URL(request.url).searchParams.get("verify") === "current") {
      const inputs = await loadSupabaseOddsInputs(director.identity?.tournamentId || "2026");
      const phase = "Round 3 Pairings Announced";
      const year = inputs.sheets.tournaments?.[0]?.Year;
      const publishedView = await readPublishedOddsView({ tournamentId: String(year), sourceWorkbookId: process.env.GOOGLE_SHEETS_ID });
      const retained = publishedOddsSnapshotsFromView(publishedView.payload?.data || {}).find((row) => row.phase === phase);
      const calculationStartedAt = Date.now();
      const generated = retained ? simulateTournamentOdds({ ...inputs, phase, iterations: Number(retained.iterations) }) : null;
      return NextResponse.json({ ok: true, phase, parity: retained ? compareOddsDeterministicParity(retained, generated) : null,
        metadata: inputs.metadata, timings: { ...inputs.diagnostics, calculationMs: Date.now() - calculationStartedAt,
          iterations: Number(retained?.iterations || 0) } });
    }
    const result = await loadSupabaseOddsInputs(director.identity?.tournamentId || "2026");
    return NextResponse.json({ ok: true, source: "supabase", queryMs: result.diagnostics?.queryMs, serviceMs: result.diagnostics?.serviceMs });
  } catch (error) {
    return NextResponse.json({ ok: false, status: error?.status || 503, code: error?.code || error?.shadowDiagnostics?.code || "ODDS_INPUT_HEALTH_FAILED",
      diagnostics: error?.shadowDiagnostics || null }, { status: 503 });
  }
}

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
      const scope = await readPublishedOddsView({ sourceWorkbookId: process.env.GOOGLE_SHEETS_ID });
      if (!scope.payload?.ok) throw Object.assign(new Error("Published Odds tournament scope is unavailable."), { code: scope.payload?.code });
      const tournament = scope.payload.data.tournament;
      const predictionSettings = await readWorkbookSheetsByName(["Prediction Settings"]);
      const settings = (predictionSettings["Prediction Settings"]?.records || []).map(({ record }) => record);
      if (!settings.length) throw Object.assign(new Error("Prediction Settings are unavailable."), { code: "PREDICTION_SETTINGS_REQUIRED" });
      const year = Number(tournament.tournament_year);
      const historical = Object.fromEntries(getAllPlayerStats().map(({ player, stats }) => [player["Player ID"], { sandbaggerRatings: stats.sandbaggerRatings || {} }]));
      const input = buildOddsInputProjection({ tournamentId: tournament.tournament_id, tournamentYear: year, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID,
        settings, historical, requestedBy: actorId });
      const imported = await importOddsInputProjection(input);
      if (!imported.payload?.ok) throw Object.assign(new Error("Odds input projection failed."), { code: imported.payload?.code });
      return NextResponse.json({ ok: true, action, projection: imported.payload, fingerprints: {
        bundle: input.bundle_fingerprint, settings: input.settings_fingerprint, ratings: input.ratings_fingerprint,
      } });
    }
    if (action !== "verify-current") return NextResponse.json({ error: "Unsupported Odds input action." }, { status: 400 });
    const inputs = await loadSupabaseOddsInputs(director.identity?.tournamentId || "2026");
    const year = inputs.sheets.tournaments?.[0]?.Year;
    const publishedView = await readPublishedOddsView({ tournamentId: String(year), sourceWorkbookId: process.env.GOOGLE_SHEETS_ID });
    if (!publishedView.payload?.ok) throw Object.assign(new Error("Published Odds history is unavailable."), { code: publishedView.payload?.code });
    const retained = publishedOddsSnapshotsFromView(publishedView.payload.data).find((row) => row.phase === phase);
    const calculationStartedAt = Date.now();
    const generated = simulateTournamentOdds({ ...inputs, phase, iterations: Number(retained?.iterations || iterations) });
    if (!retained) return NextResponse.json({ ok: true, action, phase, reproducible: false, reason: "NO_RETAINED_PUBLICATION", generated, metadata: inputs.metadata });
    const parity = compareOddsDeterministicParity(retained, generated);
    return NextResponse.json({ ok: true, action, phase, parity, metadata: inputs.metadata,
      timings: { ...inputs.diagnostics, calculationMs: Date.now() - calculationStartedAt, iterations: Number(retained.iterations) } });
  } catch (error) {
    const diagnostics = error?.shadowDiagnostics || null;
    console.error("Championship Odds input verification failed", { code: error?.code || diagnostics?.code || "ODDS_INPUT_VERIFICATION_FAILED",
      message: error?.message || String(error), diagnostics });
    return NextResponse.json({ error: "Championship Odds inputs could not be verified.",
      code: error?.code || diagnostics?.code || "ODDS_INPUT_VERIFICATION_FAILED",
      ...(process.env.VERCEL_ENV === "preview" ? { diagnostics } : {}) }, { status: 503 });
  }
}
