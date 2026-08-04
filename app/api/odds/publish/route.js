import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { loadOddsInputs } from "../../../../lib/odds-data";
import { ODDS_PHASES, simulateTournamentOdds, validateOpeningMatchups, validateRoundThreePairings } from "../../../../lib/tournament-odds";
import { publishOddsSnapshot, readOddsSnapshots } from "../../../../lib/google-sheets-write";

export const dynamic = "force-dynamic";
export async function POST(request) {
  const diagnostic = { stepReached: "Authorization", workbookOperation: "None", simulationPhase: "Unknown", worksheet: "None", function: "POST /api/odds/publish" };
  try {
    const secret = request.headers.get("x-odds-admin-secret");
    const allowed = [process.env.ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
    if (!secret || !allowed.includes(secret)) return NextResponse.json({ error: "Invalid publishing password." }, { status: 401 });
    const { phase, iterations: requestedIterations = 10_000 } = await request.json();
    diagnostic.simulationPhase = phase;
    diagnostic.stepReached = "Request validation";
    if (!ODDS_PHASES.includes(phase)) return NextResponse.json({ error: "Invalid official phase." }, { status: 400 });
    const iterations = Number(requestedIterations);
    if (![10_000, 25_000, 50_000, 100_000].includes(iterations)) return NextResponse.json({ error: "Invalid simulation count." }, { status: 400 });
    diagnostic.stepReached = "Prediction input loading";
    diagnostic.workbookOperation = "Read projection input worksheets by logical name";
    const inputs = await loadOddsInputs();
    diagnostic.stepReached = "Pairing validation";
    const matchupStatus = validateOpeningMatchups(inputs.sheets);
    if (!matchupStatus.ready) return NextResponse.json({ error: matchupStatus.message }, { status: 409 });
    if (["Round 3 Pairings Announced", "Final Results"].includes(phase)) {
      const roundThreeStatus = validateRoundThreePairings(inputs.sheets);
      if (!roundThreeStatus.ready) return NextResponse.json({ error: roundThreeStatus.message }, { status: 409 });
    }
    diagnostic.stepReached = "Monte Carlo simulation";
    diagnostic.workbookOperation = "None";
    diagnostic.function = "simulateTournamentOdds";
    const preview = simulateTournamentOdds({ ...inputs, phase, iterations });
    diagnostic.stepReached = "Existing snapshot read";
    diagnostic.workbookOperation = "Read Odds Snapshots";
    diagnostic.worksheet = "Odds Snapshots";
    const existing = (await readOddsSnapshots()).filter((row) => row.year === preview.year);
    if (phase === "Pre-Tournament" && existing.some((row) => row.phase !== "Pre-Tournament")) return NextResponse.json({ error: "Pre-Tournament is locked because the tournament has started." }, { status: 409 });
    diagnostic.stepReached = "Official snapshot publication";
    diagnostic.workbookOperation = "Atomic field-scoped replacement of projection runtime records";
    diagnostic.worksheet = "Odds Snapshots, Odds Control, Odds Team Results, Odds Player Results";
    diagnostic.function = "publishOddsSnapshot";
    const snapshot = await publishOddsSnapshot(preview);
    diagnostic.stepReached = "Participant cache invalidation";
    diagnostic.workbookOperation = "Completed";
    diagnostic.worksheet = "None";
    for (const path of ["/odds-center", "/live", "/home"]) revalidatePath(path);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    const details = {
      ...diagnostic,
      workbookOperation: error?.workbookOperation || diagnostic.workbookOperation,
      worksheet: error?.worksheet || diagnostic.worksheet,
      function: error?.functionName || diagnostic.function,
      rootCause: error?.cause?.message || error?.message || String(error),
      stack: error?.stack || "Unavailable",
      workbookDiagnostics: error?.workbookDiagnostics || null,
      transactionRollback: "Google values.batchUpdate rejected the complete mutation; no partial projection batch was committed.",
    };
    if (process.env.VERCEL_ENV === "preview") console.error("Championship projection publication failed", details);
    else console.error("Championship projection publication failed", { stepReached: details.stepReached, simulationPhase: details.simulationPhase });
    return NextResponse.json({ error: "Championship projections could not be published. Please try again." }, { status: 500 });
  }
}
