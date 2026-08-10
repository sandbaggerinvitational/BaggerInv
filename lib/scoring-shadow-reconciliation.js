import { buildScoringShadowObservation, readScoringShadowRows, rebuildScoringShadow, scoringShadowPayloadHash, writeScoringShadowRows } from "./scoring-shadow.js";
import { grossScoresFromCell } from "./live-score-values.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function logicalKey(row) {
  return `${clean(row["Match ID"] || row.match_id)}:${number(row["Hole Number"] ?? row.hole_number)}`;
}

function currentTournamentId(matches = []) {
  const first = matches[0] || {};
  return clean(first["Tournament ID"] || first.Year);
}

export function scoringShadowObservationsFromWorkbook({ sourceWorkbookId, matches = [], holes = [] } = {}) {
  const matchById = new Map(matches.map((match) => [clean(match["Match ID"]), match]));
  const holesByMatch = new Map();
  for (const hole of holes) {
    const matchId = clean(hole["Match ID"]);
    if (!holesByMatch.has(matchId)) holesByMatch.set(matchId, []);
    holesByMatch.get(matchId).push(hole);
  }
  return holes.map((hole) => {
    const match = matchById.get(clean(hole["Match ID"])) || {};
    const allHoleResults = (holesByMatch.get(clean(hole["Match ID"])) || []).map((item) => ({
      holeNumber: number(item["Hole Number"]),
      winner: clean(item["Hole Winner"]),
    }));
    return buildScoringShadowObservation({
      sourceWorkbookId,
      tournamentId: clean(match["Tournament ID"] || match.Year),
      tournamentYear: number(match.Year),
      match,
      hole,
      allHoleResults,
      mutationKey: `rebuild:${clean(hole["Match ID"])}:H${number(hole["Hole Number"])}:R${number(hole.Revision)}`,
      actorName: clean(hole["Updated By"] || "Shadow rebuild"),
      verifiedAt: clean(hole["Updated At"] || new Date().toISOString()),
    });
  });
}

export function reconcileScoringShadowRecords(authoritative = [], mirrored = [], events = []) {
  const google = new Map(authoritative.map((row) => [logicalKey(row), row]));
  const shadowGroups = new Map();
  for (const row of mirrored) {
    const key = logicalKey(row);
    if (!shadowGroups.has(key)) shadowGroups.set(key, []);
    shadowGroups.get(key).push(row);
  }
  const missing = [];
  const payloadDivergence = [];
  const revisionMismatch = [];
  const stale = [];
  for (const [key, row] of google) {
    const group = shadowGroups.get(key) || [];
    if (!group.length) { missing.push(key); continue; }
    const current = group.sort((a, b) => number(b.google_revision) - number(a.google_revision))[0];
    const canonical = {
      tournament_id: clean(row["Tournament ID"] || row.Year),
      tournament_year: number(row.Year),
      round_number: number(row.Round),
      match_id: clean(row["Match ID"]),
      hole_number: number(row["Hole Number"]),
      format: clean(row.Format).toUpperCase(),
      stroke_index: number(row["Stroke Index"]),
      team_1_gross_scores: grossScoresFromCell(row["Team 1 Gross Scores"]),
      team_2_gross_scores: grossScoresFromCell(row["Team 2 Gross Scores"]),
      team_1_net_score: number(row["Team 1 Net Score"]),
      team_2_net_score: number(row["Team 2 Net Score"]),
      hole_winner: clean(row["Hole Winner"]),
    };
    if (current.payload_hash !== scoringShadowPayloadHash(canonical)) payloadDivergence.push(key);
    if (number(current.google_revision) !== number(row.Revision)) revisionMismatch.push(key);
    if (Date.parse(current.mirrored_at || 0) < Date.parse(row["Updated At"] || 0)) stale.push(key);
  }
  const orphan = [...shadowGroups.keys()].filter((key) => !google.has(key));
  const duplicateCurrentRows = [...shadowGroups.values()].reduce((count, rows) => count + Math.max(0, rows.length - 1), 0);
  const duplicateDeliveries = events.reduce((count, event) => count + Math.max(0, number(event.delivery_count, 1) - 1), 0);
  const duplicates = duplicateCurrentRows + duplicateDeliveries;
  return {
    googleLogicalHoles: google.size,
    supabaseLogicalHoles: shadowGroups.size,
    missing,
    duplicates,
    payloadDivergence,
    revisionMismatch,
    stale,
    orphan,
    pass: !missing.length && !duplicates && !payloadDivergence.length && !revisionMismatch.length && !stale.length && !orphan.length,
  };
}

export async function rebuildAndReconcileScoringShadow({ sourceWorkbookId, matches, holes, requestedBy }, options = {}) {
  const observations = scoringShadowObservationsFromWorkbook({ sourceWorkbookId, matches, holes });
  const tournamentId = currentTournamentId(matches);
  const rebuilt = await rebuildScoringShadow({ sourceWorkbookId, tournamentId, observations, requestedBy }, options);
  const [read, events] = await Promise.all([
    readScoringShadowRows("hole_score_mirror", `source_workbook_id=eq.${encodeURIComponent(sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*`, options),
    readScoringShadowRows("score_mirror_events", `source_workbook_id=eq.${encodeURIComponent(sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=delivery_count`, options),
  ]);
  const report = reconcileScoringShadowRecords(holes.map((hole) => ({ ...hole, Year: matches.find((match) => clean(match["Match ID"]) === clean(hole["Match ID"]))?.Year, Round: matches.find((match) => clean(match["Match ID"]) === clean(hole["Match ID"]))?.Round, "Tournament ID": tournamentId })), read.payload || [], events.payload || []);
  return { rebuilt: rebuilt.payload, report };
}

export async function recordScoringShadowReconciliation({ sourceWorkbookId, tournamentId, tournamentYear, report, requestedBy, operation = "RECONCILE", durationMs }, options = {}) {
  return writeScoringShadowRows("mirror_reconciliation_runs", [{
    source_workbook_id: sourceWorkbookId,
    tournament_id: tournamentId,
    tournament_year: tournamentYear,
    operation,
    status: report.pass ? "PASS" : "DIVERGENCE",
    google_logical_holes: report.googleLogicalHoles,
    supabase_logical_holes: report.supabaseLogicalHoles,
    missing_count: report.missing.length,
    duplicate_count: report.duplicates,
    payload_divergence_count: report.payloadDivergence.length,
    calculation_divergence_count: 0,
    stale_count: report.stale.length,
    orphan_count: report.orphan.length,
    duration_ms: durationMs,
    summary: report,
    requested_by: requestedBy,
    completed_at: new Date().toISOString(),
  }], options);
}
