import { NextResponse } from "next/server";
import { loadOddsInputs } from "../../../../lib/odds-data";
import { ODDS_PHASES, simulateTournamentOdds } from "../../../../lib/tournament-odds";
import { publishOddsSnapshot, readOddsSnapshots } from "../../../../lib/google-sheets-write";

export const dynamic = "force-dynamic";
export async function POST(request) {
  try {
    const secret = request.headers.get("x-odds-admin-secret");
    if (!process.env.ODDS_ADMIN_SECRET || secret !== process.env.ODDS_ADMIN_SECRET) return NextResponse.json({ error: "Invalid publishing password." }, { status: 401 });
    const { phase } = await request.json();
    if (!ODDS_PHASES.includes(phase)) return NextResponse.json({ error: "Invalid official phase." }, { status: 400 });
    const inputs = await loadOddsInputs();
    const preview = simulateTournamentOdds({ ...inputs, phase, iterations: 10_000 });
    const existing = (await readOddsSnapshots()).filter((row) => row.year === preview.year);
    if (phase === "Pre-Tournament" && existing.some((row) => row.phase !== "Pre-Tournament")) return NextResponse.json({ error: "Pre-Tournament is locked because the tournament has started." }, { status: 409 });
    const snapshot = await publishOddsSnapshot(preview);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) { return NextResponse.json({ error: error.message || "Unable to publish odds." }, { status: 500 }); }
}
