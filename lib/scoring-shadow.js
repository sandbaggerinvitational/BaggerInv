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

export function normalizeScoringShadowPayload({
  tournamentId,
  tournamentYear,
  match = {},
  hole = {},
  calculated = null,
} = {}) {
  const format = clean(hole.Format || match.Format || calculated?.format).toUpperCase();
  return {
    tournament_id: clean(tournamentId || match["Tournament ID"] || tournamentYear || match.Year),
    tournament_year: integer(tournamentYear || match.Year),
    round_number: integer(match.Round || match.round),
    match_id: clean(hole["Match ID"] || match["Match ID"] || match.id),
    hole_number: integer(hole["Hole Number"] || calculated?.holeNumber),
    format,
    stroke_index: integer(hole["Stroke Index"] || calculated?.strokeIndex),
    team_1_gross_scores: grossScoresFromCell(hole["Team 1 Gross Scores"] ?? calculated?.team1?.grossScores?.map((item) => item.grossScore)),
    team_2_gross_scores: grossScoresFromCell(hole["Team 2 Gross Scores"] ?? calculated?.team2?.grossScores?.map((item) => item.grossScore)),
    team_1_net_score: Number(hole["Team 1 Net Score"]),
    team_2_net_score: Number(hole["Team 2 Net Score"]),
    hole_winner: clean(hole["Hole Winner"]),
  };
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

export function buildScoringShadowMatchObservation({
  sourceWorkbookId,
  tournamentId,
  tournamentYear,
  match = {},
  allHoleResults = [],
} = {}) {
  const format = clean(match.Format).toUpperCase();
  const normalizedHoleResults = allHoleResults.map((item) => ({
    holeNumber: integer(item.holeNumber ?? item["Hole Number"]),
    winner: clean(item.winner ?? item["Hole Winner"]),
  }));
  const liveStatus = calculateLiveMatchStatus(normalizedHoleResults, format);
  const scorecardComplete = isScorecardComplete(normalizedHoleResults);
  const status = clean(match["Match Status"] || match.status || "Live");
  const resultWinner = clean(match["Matchup Winner"] || match["18-Hole Winner"] || liveStatus.winner);
  const snapshot = {
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
    scored_holes: new Set(allHoleResults.map((item) => integer(item.holeNumber ?? item["Hole Number"])).filter((hole) => hole >= 1 && hole <= 18)).size,
    scoring_locked: /^(true|yes|1|locked)$/i.test(clean(match["Scoring Locked"] || match.Locked)),
    participants: {
      team_1: [clean(match["Team 1 Player 1"]), clean(match["Team 1 Player 2"])].filter(Boolean),
      team_2: [clean(match["Team 2 Player 1"]), clean(match["Team 2 Player 2"])].filter(Boolean),
    },
    course: {
      course_id: clean(match["Course ID"]),
      course: clean(match.Course || match["Course Name"]),
      tee: clean(match.Tee || match["Tee Played"]),
      starting_hole: clean(match["Starting Hole"]),
      tee_time: clean(match["Tee Time"]),
    },
  };
  const points = calculateMatchPoints(format, normalizedHoleResults);
  return {
    authority: "google",
    source_workbook_id: clean(sourceWorkbookId),
    tournament_id: clean(tournamentId || match["Tournament ID"] || tournamentYear || match.Year),
    tournament_year: integer(tournamentYear || match.Year),
    round_number: integer(match.Round || match.round),
    match_id: clean(match["Match ID"] || match.id),
    format,
    google_revision: integer(match.Revision),
    google_updated_at: clean(match["Updated At"] || match["Finalized At"]),
    match: snapshot,
    match_payload_hash: scoringShadowPayloadHash({ ...snapshot, points }),
  };
}

export function buildScoringShadowObservation({
  sourceWorkbookId,
  tournamentId,
  tournamentYear,
  match = {},
  currentMatch = match,
  hole = {},
  calculated = null,
  allHoleResults = [],
  mutationKey,
  actorId = "",
  actorName = "",
  verifiedAt = new Date().toISOString(),
} = {}) {
  const canonicalPayload = normalizeScoringShadowPayload({ tournamentId, tournamentYear, match, hole, calculated });
  const format = canonicalPayload.format;
  const holeNumber = canonicalPayload.hole_number;
  const roundNumber = canonicalPayload.round_number;
  const team1Gross = canonicalPayload.team_1_gross_scores;
  const team2Gross = canonicalPayload.team_2_gross_scores;
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
  const holeResults = allHoleResults.map((item) => ({
    holeNumber: integer(item.holeNumber ?? item["Hole Number"]),
    winner: clean(item.winner ?? item["Hole Winner"]),
  }));
  const matchObservation = buildScoringShadowMatchObservation({
    sourceWorkbookId, tournamentId, tournamentYear, match: currentMatch, allHoleResults: holeResults,
  });
  const matchSnapshot = matchObservation.match;

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
    match_tournament_id: matchObservation.tournament_id,
    match_tournament_year: matchObservation.tournament_year,
    match_round_number: matchObservation.round_number,
    match_format: matchObservation.format,
    match_google_revision: matchObservation.google_revision,
    match_google_updated_at: matchObservation.google_updated_at,
    mutation_key: clean(mutationKey || `${canonicalPayload.match_id}:H${holeNumber}:R${integer(hole.Revision)}`),
    payload_hash: scoringShadowPayloadHash(canonicalPayload),
    match_payload_hash: matchObservation.match_payload_hash,
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
  const headers = { apikey: secret, "content-type": "application/json" };
  // Supabase's current sb_secret_ keys authenticate through apikey and are not
  // JWTs. Legacy service_role JWTs still require the Bearer header.
  if (!String(secret).startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
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

export async function scoringShadowRpc(functionName, body = {}, options = {}) {
  if (!/^[a-z0-9_]+$/.test(String(functionName || ""))) throw new Error("A valid scoring RPC name is required.");
  return supabaseRequest(`rpc/${functionName}`, {
    method: "POST",
    body,
    timeoutMs: options.timeoutMs || 8_000,
    env: options.env,
  });
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

export async function rebuildScoringShadow({ sourceWorkbookId, tournamentId, observations, matchObservations, requestedBy }, options = {}) {
  return supabaseRequest("rpc/rebuild_scoring_shadow", {
    method: "POST",
    body: {
      source_workbook: sourceWorkbookId,
      target_tournament: tournamentId,
      observations,
      match_observations: matchObservations,
      requested_by_name: requestedBy,
    },
    timeoutMs: options.timeoutMs || 30_000,
    env: options.env,
  });
}

export async function readScoringShadowRows(table, query = "", options = {}) {
  return supabaseRequest(`${table}?${query}`, { env: options.env, timeoutMs: options.timeoutMs });
}

export function observationFromScoringShadowRows({ event, hole, match } = {}) {
  if (!event || !hole || !match) throw new Error("A complete stored shadow observation is required.");
  const sameLogicalScore = event.source_workbook_id === hole.source_workbook_id &&
    event.source_workbook_id === match.source_workbook_id &&
    event.match_id === hole.match_id && event.match_id === match.match_id &&
    Number(event.hole_number) === Number(hole.hole_number) &&
    Number(event.google_revision) === Number(hole.google_revision) &&
    event.mutation_key === hole.mutation_key && event.payload_hash === hole.payload_hash;
  if (!sameLogicalScore || scoringShadowPayloadHash(event.canonical_payload) !== event.payload_hash) {
    throw new Error("Stored shadow observation identity does not match its canonical payload.");
  }
  return {
    authority: "google",
    source_workbook_id: event.source_workbook_id,
    tournament_id: event.tournament_id,
    tournament_year: Number(event.tournament_year),
    round_number: Number(event.round_number),
    match_id: event.match_id,
    hole_number: Number(event.hole_number),
    google_hole_score_id: event.google_hole_score_id || "",
    google_revision: Number(event.google_revision),
    google_updated_at: event.google_updated_at || "",
    match_tournament_id: match.tournament_id,
    match_tournament_year: Number(match.tournament_year),
    match_round_number: Number(match.round_number),
    match_format: match.format,
    match_google_revision: Number(match.google_revision),
    match_google_updated_at: match.google_updated_at || "",
    mutation_key: event.mutation_key,
    payload_hash: event.payload_hash,
    match_payload_hash: match.payload_hash,
    canonical_payload: event.canonical_payload,
    format: hole.format,
    stroke_index: Number(hole.stroke_index),
    team_1_gross_scores: hole.team_1_gross_scores,
    team_2_gross_scores: hole.team_2_gross_scores,
    team_1_strokes: hole.team_1_strokes,
    team_2_strokes: hole.team_2_strokes,
    team_1_net_score: Number(hole.team_1_net_score),
    team_2_net_score: Number(hole.team_2_net_score),
    hole_winner: hole.hole_winner,
    google_result: event.google_result,
    shadow_result: event.shadow_result,
    comparison_status: event.comparison_status,
    comparison_diagnostics: event.comparison_diagnostics || {},
    match: {
      status: match.status,
      current_hole: Number(match.current_hole),
      holes_remaining: Number(match.holes_remaining),
      team_1_holes_won: Number(match.team_1_holes_won),
      team_2_holes_won: Number(match.team_2_holes_won),
      running_result: match.running_result || "",
      result_winner: match.result_winner || "",
      clinched: Boolean(match.clinched),
      scorecard_complete: Boolean(match.scorecard_complete),
      finalized: Boolean(match.finalized),
      finalized_at: match.finalized_at || "",
    },
    actor_id: event.actor_id || "",
    actor_name: event.actor_name || "",
    google_verified_at: event.google_verified_at,
  };
}

export async function inspectScoringShadow({ sourceWorkbookId, matchId = "", holeNumber = 0 } = {}, options = {}) {
  const scope = `source_workbook_id=eq.${encodeURIComponent(sourceWorkbookId)}`;
  const logical = matchId ? `&match_id=eq.${encodeURIComponent(matchId)}` : "";
  const hole = holeNumber ? `&hole_number=eq.${Number(holeNumber)}` : "";
  const [events, holes, matches, runs, selected] = await Promise.all([
    readScoringShadowRows("score_mirror_events", `${scope}&select=id,comparison_status`, options),
    readScoringShadowRows("hole_score_mirror", `${scope}&select=match_id,hole_number`, options),
    readScoringShadowRows("live_match_mirror", `${scope}&select=source_workbook_id,tournament_id,tournament_year,round_number,match_id,format,status,current_hole,holes_remaining,team_1_holes_won,team_2_holes_won,running_result,result_winner,clinched,scorecard_complete,finalized,google_revision,google_updated_at,finalized_at,payload_hash,scored_holes,scoring_locked,participant_snapshot,course_snapshot,mirrored_at`, options),
    readScoringShadowRows("mirror_reconciliation_runs", `${scope}&select=id,status,operation,started_at,completed_at,duration_ms,summary&order=started_at.desc`, options),
    readScoringShadowRows("score_mirror_events", `${scope}${logical}${hole}&select=id,match_id,hole_number,google_revision,mutation_key,payload_hash,comparison_status,comparison_diagnostics,google_result,shadow_result,delivery_count,google_updated_at,observed_at&order=observed_at.desc`, options),
  ]);
  return {
    counts: {
      score_mirror_events: events.payload?.length || 0,
      hole_score_mirror: holes.payload?.length || 0,
      live_match_mirror: matches.payload?.length || 0,
      mirror_reconciliation_runs: runs.payload?.length || 0,
    },
    observation: selected.payload?.[0] || null,
    match: matchId ? (matches.payload || []).find((row) => row.match_id === matchId) || null : null,
    latestRun: runs.payload?.[0] || null,
    recentDivergenceCount: (events.payload || []).filter((row) => row.comparison_status === "DIVERGENCE").length,
  };
}

export async function replayExistingScoringShadowObservation({ sourceWorkbookId, matchId, holeNumber, googleRevision } = {}, options = {}) {
  const scope = `source_workbook_id=eq.${encodeURIComponent(sourceWorkbookId)}&match_id=eq.${encodeURIComponent(matchId)}`;
  const eventQuery = `${scope}&hole_number=eq.${Number(holeNumber)}&google_revision=eq.${Number(googleRevision)}&select=*`;
  const holeQuery = `${scope}&hole_number=eq.${Number(holeNumber)}&select=*`;
  const matchQuery = `${scope}&select=*`;
  const [events, holes, matches] = await Promise.all([
    readScoringShadowRows("score_mirror_events", eventQuery, options),
    readScoringShadowRows("hole_score_mirror", holeQuery, options),
    readScoringShadowRows("live_match_mirror", matchQuery, options),
  ]);
  if (events.payload?.length !== 1 || holes.payload?.length !== 1 || matches.payload?.length !== 1) {
    throw new Error("Exactly one stored shadow observation is required for replay.");
  }
  const observation = observationFromScoringShadowRows({ event: events.payload[0], hole: holes.payload[0], match: matches.payload[0] });
  const replay = await deliverScoringShadowObservation(observation, options);
  return { replay, observation: {
    matchId: observation.match_id,
    holeNumber: observation.hole_number,
    googleRevision: observation.google_revision,
    mutationKey: observation.mutation_key,
    payloadHash: observation.payload_hash,
    comparisonStatus: observation.comparison_status,
  } };
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
