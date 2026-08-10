import { createHash, randomUUID } from "node:crypto";
import { calculateLiveMatchStatus, calculateMatchPoints, isScorecardComplete } from "./live-hole-scoring.js";
import { grossScoresFromCell } from "./live-score-values.js";
import { scoringShadowEnvironment } from "./scoring-shadow-gate.js";

export function shouldScheduleScoringShadowObservation({ gate, participantResult, shadow } = {}) {
  return Boolean(gate?.enabled && participantResult?.hole && shadow?.match);
}

const clean = (value) => String(value ?? "").trim();
const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function scoringShadowPayloadHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function percentile(values, percent) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1));
  return sorted[index];
}

export function benchmarkSummary(values = [], { errors = 0, retries = 0, duplicates = 0, lost = 0 } = {}) {
  const samples = values.map(Number).filter(Number.isFinite);
  return {
    count: samples.length,
    min: samples.length ? Math.min(...samples) : null,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples.length ? Math.max(...samples) : null,
    errorCount: errors,
    retryCount: retries,
    duplicateCount: duplicates,
    lostLogicalScoreCount: lost,
  };
}

function publicMatchSnapshot(match = {}, liveStatus = {}, scorecardComplete = false) {
  const status = clean(match["Match Status"] || match.status || "Live");
  const resultWinner = clean(match["Matchup Winner"] || match["18-Hole Winner"] || liveStatus.winner);
  return {
    status,
    current_hole: integer(liveStatus.currentHole ?? match["Current Hole"]),
    holes_remaining: integer(liveStatus.holesRemaining ?? match["Holes Remaining"], 18),
    team_1_holes_won: integer(liveStatus.team1HolesWon ?? match["Team 1 Holes Won"]),
    team_2_holes_won: integer(liveStatus.team2HolesWon ?? match["Team 2 Holes Won"]),
    running_result: clean(liveStatus.statusText || match["Match Status Text"]),
    result_winner: resultWinner,
    clinched: Boolean(liveStatus.complete),
    scorecard_complete: Boolean(scorecardComplete),
    finalized: /^(final|finalized)$/i.test(status),
    finalized_at: clean(match["Finalized At"]),
  };
}

export function buildScoringShadowObservation({
  sourceWorkbookId,
  tournamentId,
  tournamentYear,
  match = {},
  hole = {},
  calculated = null,
  allHoleResults = [],
  mutationKey,
  actorId = "",
  actorName = "",
  verifiedAt = new Date().toISOString(),
} = {}) {
  const format = clean(hole.Format || match.Format || calculated?.format).toUpperCase();
  const holeNumber = integer(hole["Hole Number"] || calculated?.holeNumber);
  const roundNumber = integer(match.Round || match.round);
  const team1Gross = grossScoresFromCell(hole["Team 1 Gross Scores"] ?? calculated?.team1?.grossScores?.map((item) => item.grossScore));
  const team2Gross = grossScoresFromCell(hole["Team 2 Gross Scores"] ?? calculated?.team2?.grossScores?.map((item) => item.grossScore));
  const googleResult = {
    team_1_net_score: Number(hole["Team 1 Net Score"]),
    team_2_net_score: Number(hole["Team 2 Net Score"]),
    hole_winner: clean(hole["Hole Winner"]),
  };
  const shadowResult = calculated ? {
    team_1_net_score: Number(calculated.team1.netScore),
    team_2_net_score: Number(calculated.team2.netScore),
    hole_winner: clean(calculated.winner),
  } : { ...googleResult };
  const comparisonDiagnostics = Object.fromEntries(Object.keys(googleResult)
    .filter((key) => googleResult[key] !== shadowResult[key])
    .map((key) => [key, { google: googleResult[key], shadow: shadowResult[key] }]));
  const canonicalPayload = {
    tournament_id: clean(tournamentId || match["Tournament ID"] || tournamentYear || match.Year),
    tournament_year: integer(tournamentYear || match.Year),
    round_number: roundNumber,
    match_id: clean(match["Match ID"] || match.id),
    hole_number: holeNumber,
    format,
    stroke_index: integer(hole["Stroke Index"] || calculated?.strokeIndex),
    team_1_gross_scores: team1Gross,
    team_2_gross_scores: team2Gross,
    team_1_net_score: googleResult.team_1_net_score,
    team_2_net_score: googleResult.team_2_net_score,
    hole_winner: googleResult.hole_winner,
  };
  const holeResults = allHoleResults.map((item) => ({
    holeNumber: integer(item.holeNumber ?? item["Hole Number"]),
    winner: clean(item.winner ?? item["Hole Winner"]),
  }));
  const liveStatus = calculateLiveMatchStatus(holeResults, format);
  const points = calculateMatchPoints(format, holeResults);
  const scorecardComplete = isScorecardComplete(holeResults);
  const matchSnapshot = publicMatchSnapshot(match, liveStatus, scorecardComplete);

  return {
    authority: "google",
    source_workbook_id: clean(sourceWorkbookId),
    tournament_id: canonicalPayload.tournament_id,
    tournament_year: canonicalPayload.tournament_year,
    round_number: roundNumber,
    match_id: canonicalPayload.match_id,
    hole_number: holeNumber,
    google_hole_score_id: clean(hole["Hole Score ID"]),
    google_revision: integer(hole.Revision),
    google_updated_at: clean(hole["Updated At"]),
    mutation_key: clean(mutationKey || `${canonicalPayload.match_id}:H${holeNumber}:R${integer(hole.Revision)}`),
    payload_hash: scoringShadowPayloadHash(canonicalPayload),
    match_payload_hash: scoringShadowPayloadHash({ ...matchSnapshot, points }),
    canonical_payload: canonicalPayload,
    format,
    stroke_index: canonicalPayload.stroke_index,
    team_1_gross_scores: team1Gross,
    team_2_gross_scores: team2Gross,
    team_1_strokes: calculated?.team1?.grossScores?.map((item) => integer(item.strokes)) || [],
    team_2_strokes: calculated?.team2?.grossScores?.map((item) => integer(item.strokes)) || [],
    team_1_net_score: googleResult.team_1_net_score,
    team_2_net_score: googleResult.team_2_net_score,
    hole_winner: googleResult.hole_winner,
    google_result: googleResult,
    shadow_result: shadowResult,
    comparison_status: Object.keys(comparisonDiagnostics).length ? "DIVERGENCE" : "PASS",
    comparison_diagnostics: comparisonDiagnostics,
    match: matchSnapshot,
    actor_id: clean(actorId),
    actor_name: clean(actorName || hole["Updated By"]),
    google_verified_at: verifiedAt,
  };
}

function supabaseHeaders(secret) {
  return { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" };
}

async function supabaseRequest(path, { method = "GET", body, timeoutMs = 8_000, env = process.env } = {}) {
  const gate = scoringShadowEnvironment(env);
  if (!gate.enabled) return { skipped: true, reason: gate.reason };
  const url = `${String(env.SUPABASE_SCORING_MIRROR_URL).replace(/\/$/, "")}/rest/v1/${path}`;
  const startedAt = Date.now();
  const response = await fetch(url, {
    method,
    headers: { ...supabaseHeaders(env.SUPABASE_SCORING_MIRROR_SECRET_KEY), prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Scoring shadow request failed (${response.status}).`);
    error.status = response.status;
    error.shadowDiagnostics = { path, durationMs: Date.now() - startedAt, code: payload?.code || "" };
    throw error;
  }
  return { ok: true, payload, durationMs: Date.now() - startedAt };
}

export async function deliverScoringShadowObservation(observation, options = {}) {
  const startedAt = Date.now();
  const result = await supabaseRequest("rpc/record_scoring_shadow_observation", {
    method: "POST",
    body: { observation },
    timeoutMs: options.timeoutMs || 8_000,
    env: options.env,
  });
  return { ...result, totalDurationMs: Date.now() - startedAt };
}

export async function rebuildScoringShadow({ sourceWorkbookId, tournamentId, observations, requestedBy }, options = {}) {
  return supabaseRequest("rpc/rebuild_scoring_shadow", {
    method: "POST",
    body: {
      source_workbook: sourceWorkbookId,
      target_tournament: tournamentId,
      observations,
      requested_by_name: requestedBy,
    },
    timeoutMs: options.timeoutMs || 30_000,
    env: options.env,
  });
}

export async function readScoringShadowRows(table, query = "", options = {}) {
  return supabaseRequest(`${table}?${query}`, { env: options.env, timeoutMs: options.timeoutMs });
}

export async function writeScoringShadowRows(table, rows, options = {}) {
  return supabaseRequest(table, { method: "POST", body: rows, env: options.env, timeoutMs: options.timeoutMs });
}

export async function deleteScoringShadowRows(table, sourceWorkbookId, tournamentId, options = {}) {
  const query = `source_workbook_id=eq.${encodeURIComponent(sourceWorkbookId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}`;
  return supabaseRequest(`${table}?${query}`, { method: "DELETE", env: options.env, timeoutMs: options.timeoutMs });
}

export function scoringShadowRunId() {
  return randomUUID();
}
