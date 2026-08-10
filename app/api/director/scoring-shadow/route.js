import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";
import { readWorkbookSheetsByName } from "../../../../lib/google-sheets-write.js";
import { assertScoringShadowAdministrativeEnvironment } from "../../../../lib/scoring-shadow-gate.js";
import {
  rebuildAndReconcileScoringShadow,
  reconcileScoringShadowRecords,
  recordScoringShadowReconciliation,
} from "../../../../lib/scoring-shadow-reconciliation.js";
import { readScoringShadowRows } from "../../../../lib/scoring-shadow.js";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

async function authorize(request) {
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  const gate = (() => {
    try { return assertScoringShadowAdministrativeEnvironment(); }
    catch { return null; }
  })();
  if (!gate) return { response: unavailable() };
  const authorization = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  if (authorization.status === "unavailable") {
    return { response: NextResponse.json({ error: "Director verification is temporarily unavailable." }, { status: 503 }) };
  }
  if (authorization.status !== "active") {
    return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 }) };
  }
  return { gate, identity: authorization.identity };
}

async function authoritativeRows() {
  const sheets = await readWorkbookSheetsByName(["Live Matches", "Live Hole Scores"]);
  return {
    matches: sheets["Live Matches"].records.map(({ record }) => record),
    holes: sheets["Live Hole Scores"].records.map(({ record }) => record),
  };
}

function scopedRows(rows) {
  const matchIds = new Set(rows.matches.map((match) => String(match["Match ID"] || "").trim()));
  return { ...rows, holes: rows.holes.filter((hole) => matchIds.has(String(hole["Match ID"] || "").trim())) };
}

export async function GET(request) {
  const context = await authorize(request);
  if (context.response) return context.response;
  try {
    const startedAt = Date.now();
    const rows = scopedRows(await authoritativeRows());
    const first = rows.matches[0] || {};
    const tournamentId = String(first["Tournament ID"] || first.Year || "").trim();
    const [mirror, events] = await Promise.all([
      readScoringShadowRows("hole_score_mirror", `source_workbook_id=eq.${encodeURIComponent(context.gate.sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*`),
      readScoringShadowRows("score_mirror_events", `source_workbook_id=eq.${encodeURIComponent(context.gate.sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=delivery_count`),
    ]);
    const authoritative = rows.holes.map((hole) => ({ ...hole, Year: first.Year, "Tournament ID": tournamentId }));
    const report = reconcileScoringShadowRecords(authoritative, mirror.payload || [], events.payload || []);
    await recordScoringShadowReconciliation({
      sourceWorkbookId: context.gate.sourceWorkbookId,
      tournamentId,
      tournamentYear: Number(first.Year),
      report,
      requestedBy: context.identity.actor.name,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("Scoring shadow reconciliation failed", { message: error?.message, status: error?.status || 0 });
    return NextResponse.json({ error: "Scoring shadow reconciliation failed." }, { status: 503 });
  }
}

export async function POST(request) {
  const context = await authorize(request);
  if (context.response) return context.response;
  try {
    const input = await request.json().catch(() => ({}));
    if (input.action !== "rebuild") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    const rows = scopedRows(await authoritativeRows());
    const result = await rebuildAndReconcileScoringShadow({
      sourceWorkbookId: context.gate.sourceWorkbookId,
      ...rows,
      requestedBy: context.identity.actor.name,
    });
    return NextResponse.json({
      ok: true,
      message: "Shadow Rebuild Complete",
      summary: result.report,
      rebuild: result.rebuilt,
    });
  } catch (error) {
    console.error("Scoring shadow rebuild failed", { message: error?.message, status: error?.status || 0 });
    return NextResponse.json({ error: "Scoring shadow rebuild failed." }, { status: 503 });
  }
}
