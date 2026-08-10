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
import { inspectScoringShadow, readScoringShadowRows, replayExistingScoringShadowObservation } from "../../../../lib/scoring-shadow.js";

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
    const url = new URL(request.url);
    if (url.searchParams.get("action") === "historical-match-audit") {
      const matchId = String(url.searchParams.get("matchId") || "").trim();
      if (!/^2026-R[1-3]-\d{1,2}$/.test(matchId)) return NextResponse.json({ error: "Select one valid 2026 Preview match." }, { status: 400 });
      const sheets = await readWorkbookSheetsByName([
        "Live Matches", "Matches", "Live Hole Scores", "Players", "Handicaps",
        "Live Round Handicaps", "Courses", "Course Holes", "Match Update Log", "Admin Audit Log",
      ]);
      const records = (tab) => sheets[tab].records.map(({ record }) => record);
      const liveMatch = records("Live Matches").find((row) => String(row["Match ID"] || "").trim() === matchId) || null;
      const archivedMatch = records("Matches").find((row) => String(row["Match ID"] || "").trim() === matchId) || null;
      const match = archivedMatch || liveMatch || {};
      const playerIds = [1, 2].flatMap((side) => [1, 2].map((slot) => String(match[`Team ${side} Player ${slot}`] || liveMatch?.[`Team ${side} Player ${slot}`] || "").trim())).filter(Boolean);
      const courseIds = new Set([match["Course ID"], liveMatch?.["Course ID"]].map((value) => String(value || "").trim()).filter(Boolean));
      const mentionsMatch = (row) => String(row["Match ID"] || row["Record ID"] || "").trim() === matchId || JSON.stringify(row).includes(matchId);
      return NextResponse.json({
        ok: true,
        audit: {
          matchId,
          liveMatch,
          archivedMatch,
          holes: records("Live Hole Scores").filter((row) => String(row["Match ID"] || "").trim() === matchId),
          players: records("Players").filter((row) => playerIds.includes(String(row["Player ID"] || "").trim())),
          handicaps: records("Handicaps").filter((row) => Number(row.Year) === 2026 && playerIds.includes(String(row["Player ID"] || "").trim())),
          liveRoundHandicaps: records("Live Round Handicaps").filter((row) => Number(row.Year) === 2026 && Number(row.Round) === 1 && playerIds.includes(String(row["Player ID"] || "").trim())),
          courses: records("Courses").filter((row) => Number(row.Year) === 2026 && courseIds.has(String(row["Course ID"] || "").trim())),
          courseHoles: records("Course Holes").filter((row) => courseIds.has(String(row["Course ID"] || "").trim())),
          matchUpdateLog: records("Match Update Log").filter(mentionsMatch),
          adminAuditLog: records("Admin Audit Log").filter(mentionsMatch),
        },
      });
    }
    if (url.searchParams.get("action") === "inspect") {
      const matchId = String(url.searchParams.get("matchId") || "").trim();
      const holeNumber = Number(url.searchParams.get("holeNumber") || 0);
      const inspection = await inspectScoringShadow({ sourceWorkbookId: context.gate.sourceWorkbookId, matchId, holeNumber });
      return NextResponse.json({ ok: true, inspection });
    }
    const startedAt = Date.now();
    const rows = scopedRows(await authoritativeRows());
    const first = rows.matches[0] || {};
    const tournamentId = String(first["Tournament ID"] || first.Year || "").trim();
    const [mirror, events] = await Promise.all([
      readScoringShadowRows("hole_score_mirror", `source_workbook_id=eq.${encodeURIComponent(context.gate.sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*`),
      readScoringShadowRows("score_mirror_events", `source_workbook_id=eq.${encodeURIComponent(context.gate.sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=delivery_count`),
    ]);
    const matchById = new Map(rows.matches.map((match) => [String(match["Match ID"] || "").trim(), match]));
    const authoritative = rows.holes.map((hole) => {
      const match = matchById.get(String(hole["Match ID"] || "").trim()) || first;
      return { ...hole, Year: match.Year, Round: match.Round, "Tournament ID": tournamentId };
    });
    const report = reconcileScoringShadowRecords(authoritative, mirror.payload || [], events.payload || [], rows.matches);
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
  let operation = "rebuild";
  try {
    const input = await request.json().catch(() => ({}));
    if (input.action === "replay") {
      operation = "replay";
      const matchId = String(input.matchId || "").trim();
      const holeNumber = Number(input.holeNumber || 0);
      const googleRevision = Number(input.googleRevision || 0);
      if (!matchId || !Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18 || !Number.isInteger(googleRevision) || googleRevision < 0) {
        return NextResponse.json({ error: "Select one valid stored shadow observation." }, { status: 400 });
      }
      const before = await inspectScoringShadow({ sourceWorkbookId: context.gate.sourceWorkbookId, matchId, holeNumber });
      const replay = await replayExistingScoringShadowObservation({ sourceWorkbookId: context.gate.sourceWorkbookId, matchId, holeNumber, googleRevision });
      const after = await inspectScoringShadow({ sourceWorkbookId: context.gate.sourceWorkbookId, matchId, holeNumber });
      console.info("Scoring shadow idempotent replay", {
        matchId, holeNumber, googleRevision, comparisonStatus: replay.observation.comparisonStatus,
        durationMs: replay.replay.totalDurationMs, before: before.counts, after: after.counts,
        requestedBy: context.identity.actor.name,
      });
      return NextResponse.json({ ok: true, before, replay: replay.observation, replayDurationMs: replay.replay.totalDurationMs, after });
    }
    if (input.action !== "rebuild") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    const startedAt = Date.now();
    const googleReadAt = Date.now();
    const rows = scopedRows(await authoritativeRows());
    const googleReadDurationMs = Date.now() - googleReadAt;
    const result = await rebuildAndReconcileScoringShadow({
      sourceWorkbookId: context.gate.sourceWorkbookId,
      ...rows,
      requestedBy: context.identity.actor.name,
      googleReadDurationMs,
    });
    return NextResponse.json({
      ok: true,
      message: "Shadow Rebuild Complete",
      summary: result.report,
      rebuild: result.rebuilt,
      timings: { ...result.timings, totalRequestDurationMs: Date.now() - startedAt },
    });
  } catch (error) {
    console.error(`Scoring shadow ${operation} failed`, { message: error?.message, status: error?.status || 0 });
    return NextResponse.json({ error: `Scoring shadow ${operation} failed.` }, { status: 503 });
  }
}
