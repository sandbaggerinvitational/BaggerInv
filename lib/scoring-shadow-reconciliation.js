import { buildScoringShadowMatchObservation, buildScoringShadowObservation, normalizeScoringShadowPayload, readScoringShadowRows, rebuildScoringShadow, scoringShadowPayloadHash, writeScoringShadowRows } from "./scoring-shadow.js";
import { calculateLiveHole } from "./live-hole-scoring.js";
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

function scoringPlayers(match, side) {
  return [1, 2].flatMap((slot) => {
    const id = clean(match[`Team ${side} Player ${slot}`]);
    return id ? [{
      id,
      strokes: number(match[`Team ${side} Player ${slot} Stroke`]),
      playingHcp: number(match[`Team ${side} Player ${slot} Playing HCP`]),
    }] : [];
  });
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
    const calculated = calculateLiveHole({
      format: match.Format || hole.Format,
      holeNumber: number(hole["Hole Number"]),
      strokeIndex: number(hole["Stroke Index"]),
      team1Players: scoringPlayers(match, 1),
      team2Players: scoringPlayers(match, 2),
      team1GrossScores: grossScoresFromCell(hole["Team 1 Gross Scores"]),
      team2GrossScores: grossScoresFromCell(hole["Team 2 Gross Scores"]),
      team1Strokes: number(match["Team 1 Stroke"]),
      team2Strokes: number(match["Team 2 Stroke"]),
    });
    return buildScoringShadowObservation({
      sourceWorkbookId,
      tournamentId: clean(match["Tournament ID"] || match.Year),
      tournamentYear: number(match.Year),
      match,
      hole,
      calculated,
      allHoleResults,
      mutationKey: `rebuild:${clean(hole["Match ID"])}:H${number(hole["Hole Number"])}:R${number(hole.Revision)}`,
      actorName: clean(hole["Updated By"] || "Shadow rebuild"),
      verifiedAt: clean(hole["Updated At"] || new Date().toISOString()),
    });
  });
}

export function scoringShadowMatchObservationsFromWorkbook({ sourceWorkbookId, matches = [], holes = [] } = {}) {
  const holesByMatch = new Map();
  for (const hole of holes) {
    const matchId = clean(hole["Match ID"]);
    if (!holesByMatch.has(matchId)) holesByMatch.set(matchId, []);
    holesByMatch.get(matchId).push(hole);
  }
  return matches.map((match) => buildScoringShadowMatchObservation({
    sourceWorkbookId,
    tournamentId: clean(match["Tournament ID"] || match.Year),
    tournamentYear: number(match.Year),
    match,
    allHoleResults: holesByMatch.get(clean(match["Match ID"])) || [],
  }));
}

export function reconcileScoringShadowRecords(authoritative = [], mirrored = [], events = [], matches = [], mirroredMatches = [], observations = [], matchObservations = []) {
  const matchById = new Map(matches.map((match) => [clean(match["Match ID"] || match.id), match]));
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
    const match = matchById.get(clean(row["Match ID"])) || {};
    const canonical = normalizeScoringShadowPayload({
      tournamentId: row["Tournament ID"],
      tournamentYear: row.Year,
      match,
      hole: row,
    });
    if (current.payload_hash !== scoringShadowPayloadHash(canonical)) payloadDivergence.push(key);
    if (number(current.google_revision) !== number(row.Revision)) revisionMismatch.push(key);
    if (Date.parse(current.mirrored_at || 0) < Date.parse(row["Updated At"] || 0)) stale.push(key);
  }
  const orphan = [...shadowGroups.keys()].filter((key) => !google.has(key));
  const duplicateCurrentRows = [...shadowGroups.values()].reduce((count, rows) => count + Math.max(0, rows.length - 1), 0);
  const calculationDivergence = events.filter((event) => event.comparison_status === "DIVERGENCE").map(logicalKey);
  const replayDeliveries = events.reduce((count, event) => count + Math.max(0, number(event.delivery_count, 1) - 1), 0);
  const googleMatchIds = new Set(matches.map((match) => clean(match["Match ID"])).filter(Boolean));
  const shadowMatchGroups = new Map();
  for (const match of mirroredMatches) {
    const id = clean(match.match_id);
    if (!shadowMatchGroups.has(id)) shadowMatchGroups.set(id, []);
    shadowMatchGroups.get(id).push(match);
  }
  const missingMatches = [...googleMatchIds].filter((id) => !shadowMatchGroups.has(id));
  const orphanMatches = [...shadowMatchGroups.keys()].filter((id) => !googleMatchIds.has(id));
  const duplicateMatches = [...shadowMatchGroups.values()].reduce((count, rows) => count + Math.max(0, rows.length - 1), 0);
  const expectedMatchState = new Map();
  for (const observation of matchObservations.length ? matchObservations : observations) expectedMatchState.set(observation.match_id, observation);
  const matchStateDivergence = [];
  const matchRevisionDivergence = [];
  for (const [matchId, expected] of expectedMatchState) {
    const current = shadowMatchGroups.get(matchId)?.[0];
    if (!current) continue;
    if (current.payload_hash !== expected.match_payload_hash) matchStateDivergence.push(matchId);
    if (number(current.google_revision) !== number(expected.google_revision)) matchRevisionDivergence.push(matchId);
  }
  const duplicates = duplicateCurrentRows + duplicateMatches;
  return {
    googleLogicalMatches: googleMatchIds.size,
    supabaseLogicalMatches: shadowMatchGroups.size,
    googleLogicalHoles: google.size,
    supabaseLogicalHoles: shadowGroups.size,
    missing,
    missingMatches,
    duplicates,
    duplicateCurrentRows,
    duplicateMatches,
    replayDeliveries,
    payloadDivergence,
    revisionMismatch,
    calculationDivergence,
    matchStateDivergence,
    matchRevisionDivergence,
    stale,
    orphan,
    orphanMatches,
    lostLogicalScores: missing.length,
    pass: !missing.length && !missingMatches.length && !duplicates && !payloadDivergence.length && !revisionMismatch.length && !calculationDivergence.length && !matchStateDivergence.length && !matchRevisionDivergence.length && !stale.length && !orphan.length && !orphanMatches.length,
  };
}

export async function rebuildAndReconcileScoringShadow({ sourceWorkbookId, matches, holes, requestedBy, googleReadDurationMs = 0 }, options = {}) {
  const startedAt = Date.now();
  const normalizedAt = Date.now();
  const observations = scoringShadowObservationsFromWorkbook({ sourceWorkbookId, matches, holes });
  const matchObservations = scoringShadowMatchObservationsFromWorkbook({ sourceWorkbookId, matches, holes });
  const normalizationDurationMs = Date.now() - normalizedAt;
  const tournamentId = currentTournamentId(matches);
  const rebuilt = await rebuildScoringShadow({ sourceWorkbookId, tournamentId, observations, matchObservations, requestedBy }, options);
  const reconciliationAt = Date.now();
  const [read, events, mirroredMatches] = await Promise.all([
    readScoringShadowRows("hole_score_mirror", `source_workbook_id=eq.${encodeURIComponent(sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*`, options),
    readScoringShadowRows("score_mirror_events", `source_workbook_id=eq.${encodeURIComponent(sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=match_id,hole_number,delivery_count,comparison_status`, options),
    readScoringShadowRows("live_match_mirror", `source_workbook_id=eq.${encodeURIComponent(sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*`, options),
  ]);
  const authoritative = holes.map((hole) => ({ ...hole, Year: matches.find((match) => clean(match["Match ID"]) === clean(hole["Match ID"]))?.Year, Round: matches.find((match) => clean(match["Match ID"]) === clean(hole["Match ID"]))?.Round, "Tournament ID": tournamentId }));
  const report = reconcileScoringShadowRecords(authoritative, read.payload || [], events.payload || [], matches, mirroredMatches.payload || [], observations, matchObservations);
  const reconciliationDurationMs = Date.now() - reconciliationAt;
  const timings = {
    googleReadDurationMs: number(googleReadDurationMs),
    normalizationDurationMs,
    supabaseRebuildDurationMs: rebuilt.durationMs,
    reconciliationDurationMs,
    totalDurationMs: number(googleReadDurationMs) + (Date.now() - startedAt),
  };
  const persistedReport = { ...report, timings, mirrorEventsWritten: observations.length };
  await recordScoringShadowReconciliation({
    sourceWorkbookId, tournamentId, tournamentYear: number(matches[0]?.Year), report: persistedReport, requestedBy,
    operation: "RECONCILE", durationMs: timings.totalDurationMs,
  }, options);
  return { rebuilt: rebuilt.payload, report: persistedReport, timings };
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
    calculation_divergence_count: report.calculationDivergence?.length || 0,
    stale_count: report.stale.length,
    orphan_count: report.orphan.length,
    duration_ms: durationMs,
    summary: report,
    requested_by: requestedBy,
    completed_at: new Date().toISOString(),
  }], options);
}
