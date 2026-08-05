import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { loadOddsInputs } from "../../../../lib/odds-data";
import { loadPredictionDiagnostics } from "../../../../lib/prediction-data";
import { ODDS_PHASES, simulateTournamentOdds, validateOpeningMatchups, validateRoundThreePairings } from "../../../../lib/tournament-odds";
import { publishOddsSnapshot, readOddsSnapshots, verifyPublishedOddsSnapshot } from "../../../../lib/google-sheets-write";
import { directorTransactionError } from "../../../../lib/director-transaction-error";
import { createPublicationTrace, validateProjectionSnapshot } from "../../../../lib/projection-publication-diagnostics";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const trace = createPublicationTrace();
  const diagnostic = { stepReached: "Authorization", workbookOperation: "None", simulationPhase: "Unknown", worksheet: "None", function: "POST /api/odds/publish" };
  const start = (name, details = {}) => { diagnostic.stepReached = name; Object.assign(diagnostic, details); trace.start(name, details); };
  const pass = (name, details = {}) => trace.pass(name, details);
  try {
    const secret = request.headers.get("x-odds-admin-secret");
    const allowed = [process.env.ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
    const director = !secret || !allowed.includes(secret) ? await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request)) : null;
    if ((!secret || !allowed.includes(secret)) && director?.status !== "active") return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
    const { phase, iterations: requestedIterations = 10_000 } = await request.json();
    diagnostic.simulationPhase = phase;
    if (!ODDS_PHASES.includes(phase)) return NextResponse.json({ error: "Invalid official phase." }, { status: 400 });
    const iterations = Number(requestedIterations);
    if (![10_000, 25_000, 50_000, 100_000].includes(iterations)) return NextResponse.json({ error: "Invalid simulation count." }, { status: 400 });

    start("Workbook validation", { workbookOperation: "Validate projection worksheet discovery and required schemas", function: "loadPredictionDiagnostics" });
    const workbook = await loadPredictionDiagnostics();
    const invalidSheet = Object.values(workbook.sheets).find((sheet) => sheet.required && sheet.status === "error");
    if (invalidSheet) {
      const error = new Error(`${invalidSheet.label} could not be loaded.`);
      error.worksheet = invalidSheet.label; error.workbookOperation = "Validate required projection worksheet"; error.functionName = "loadPredictionDiagnostics";
      throw error;
    }
    pass("Workbook validation", { worksheet: "Required projection worksheets", function: "loadPredictionDiagnostics" });

    start("Input loading", { workbookOperation: "Load normalized projection inputs", worksheet: "Prediction workbook", function: "loadOddsInputs" });
    const inputs = await loadOddsInputs();
    pass("Input loading", { worksheet: inputs.sheets.projectionMatchSource || "Matches", function: "loadOddsInputs" });

    start("Pairing validation", { workbookOperation: "Validate official Round 1 and Round 2 pairings", worksheet: inputs.sheets.projectionMatchSource || "Matches", function: "validateOpeningMatchups" });
    const matchupStatus = validateOpeningMatchups(inputs.sheets);
    if (!matchupStatus.ready) {
      const error = new Error(matchupStatus.firstFailure || "Championship projection pairing prerequisites are incomplete.");
      error.worksheet = matchupStatus.roundReports?.find((report) => !report.ready)?.worksheet || "Unknown";
      error.workbookOperation = "Validate official opening-round pairings"; error.functionName = "validateOpeningMatchups"; error.pairingDiagnostics = matchupStatus;
      throw error;
    }
    if (["Round 3 Pairings Announced", "Final Results"].includes(phase)) {
      const roundThreeStatus = validateRoundThreePairings(inputs.sheets);
      if (!roundThreeStatus.ready) {
        const error = new Error(roundThreeStatus.message);
        error.worksheet = inputs.sheets.projectionMatchSource || "Matches"; error.workbookOperation = "Validate official Singles pairings"; error.functionName = "validateRoundThreePairings";
        throw error;
      }
    }
    pass("Pairing validation", { worksheet: inputs.sheets.projectionMatchSource || "Matches", function: "validateOpeningMatchups", roundReports: matchupStatus.roundReports });

    trace.complete("Simulation start", { function: "simulateTournamentOdds", iterations, phase });
    start("Simulation complete", { workbookOperation: "None", worksheet: "None", function: "simulateTournamentOdds", iterations, phase });
    const preview = simulateTournamentOdds({ ...inputs, phase, iterations });
    pass("Simulation complete", { function: "simulateTournamentOdds", iterations, phase });

    start("Snapshot generation", { workbookOperation: "Build normalized published projection snapshot", worksheet: "None", function: "simulateTournamentOdds" });
    if (!preview || typeof preview !== "object") throw new Error("Simulation did not return a projection snapshot.");
    pass("Snapshot generation", { function: "simulateTournamentOdds", year: preview.year, phase: preview.phase });

    start("Team projections generated", { workbookOperation: "Validate generated team projection collection", worksheet: "Odds Team Results", function: "simulateTournamentOdds" });
    if (!Array.isArray(preview.teams) || !preview.teams.length) throw new Error("Simulation generated no team projections.");
    pass("Team projections generated", { worksheet: "Odds Team Results", rowCount: preview.teams.length, function: "simulateTournamentOdds" });

    start("Player projections generated", { workbookOperation: "Validate generated player projection collection", worksheet: "Odds Player Results", function: "simulateTournamentOdds" });
    if (!Array.isArray(preview.players) || !preview.players.length) throw new Error("Simulation generated no player projections.");
    pass("Player projections generated", { worksheet: "Odds Player Results", rowCount: preview.players.length, function: "simulateTournamentOdds" });

    start("Snapshot validation", { workbookOperation: "Validate snapshot identity, values, and publication lifecycle", worksheet: "Odds Snapshots", function: "validateProjectionSnapshot" });
    validateProjectionSnapshot(preview);
    const existing = (await readOddsSnapshots()).filter((row) => row.year === preview.year);
    if (phase === "Pre-Tournament" && existing.some((row) => row.phase !== "Pre-Tournament")) throw new Error("Pre-Tournament is locked because the tournament has started.");
    pass("Snapshot validation", { worksheet: "Odds Snapshots", function: "validateProjectionSnapshot", existingSnapshots: existing.length });

    start("Batch workbook write", { workbookOperation: "Atomic field-scoped replacement of projection runtime records", worksheet: "Odds Snapshots, Odds Control, Odds Team Results, Odds Player Results", function: "publishOddsSnapshot" });
    const snapshot = await publishOddsSnapshot(preview);
    pass("Batch workbook write", { worksheet: "Odds Snapshots, Odds Control, Odds Team Results, Odds Player Results", function: "publishOddsSnapshot" });

    start("Workbook verification", { workbookOperation: "Read back and verify published projection rows", worksheet: "Odds Snapshots, Odds Control, Odds Team Results, Odds Player Results", function: "verifyPublishedOddsSnapshot" });
    const verification = await verifyPublishedOddsSnapshot(snapshot);
    pass("Workbook verification", { worksheet: "Odds Snapshots, Odds Control, Odds Team Results, Odds Player Results", function: "verifyPublishedOddsSnapshot", verification });

    start("Cache invalidation", { workbookOperation: "Invalidate shared projection API cache", worksheet: "None", function: "revalidatePath" });
    revalidatePath("/api/leaderboards/insights");
    pass("Cache invalidation", { function: "revalidatePath" });

    start("Website refresh", { workbookOperation: "Invalidate Website Championship Projection page", worksheet: "None", function: "revalidatePath" });
    revalidatePath("/odds-center");
    pass("Website refresh", { function: "revalidatePath", path: "/odds-center" });

    start("PWA refresh", { workbookOperation: "Invalidate participant Tournament Intelligence views", worksheet: "None", function: "revalidatePath" });
    for (const path of ["/live", "/home"]) revalidatePath(path);
    pass("PWA refresh", { function: "revalidatePath", paths: ["/live", "/home"] });

    trace.complete("Publication complete", { function: "POST /api/odds/publish" });
    return NextResponse.json({ ok: true, snapshot, ...(process.env.VERCEL_ENV === "preview" ? { diagnostics: trace.snapshot() } : {}) });
  } catch (error) {
    trace.fail(error, {
      workbookOperation: error?.workbookOperation || diagnostic.workbookOperation,
      worksheet: error?.worksheet || diagnostic.worksheet,
      function: error?.functionName || diagnostic.function,
    });
    const details = {
      ...diagnostic,
      workbookOperation: error?.workbookOperation || diagnostic.workbookOperation,
      worksheet: error?.worksheet || diagnostic.worksheet,
      function: error?.functionName || diagnostic.function,
      exception: error?.name || "Error",
      rootCause: error?.cause?.message || error?.message || String(error),
      stack: error?.stack || "Unavailable",
      pairingDiagnostics: error?.pairingDiagnostics || null,
      transactionRollback: diagnostic.stepReached === "Batch workbook write" ? "The atomic Google Sheets batch was rejected without a partial commit." : "No rollback was required for the stage that failed.",
      trace: trace.snapshot(),
    };
    if (process.env.VERCEL_ENV === "preview") console.error("Championship projection publication failed", details);
    else console.error("Championship projection publication failed", { stepReached: details.stepReached, simulationPhase: details.simulationPhase });
    return NextResponse.json({
      error: directorTransactionError(error, "Championship projections could not be published. Please try again.", true),
      ...(process.env.VERCEL_ENV === "preview" ? { diagnostics: details } : {}),
    }, { status: 500 });
  }
}
