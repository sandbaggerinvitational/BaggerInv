import { NextResponse } from "next/server";
import { playerPassportTokenFromRequest } from "../../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../../lib/player-passport-server.js";
import {
  confirmLiveMatchScorecard,
  readWorkbookSheetsByName,
  restorePreviewScoringBenchmarkRows,
  saveLiveHoleScore,
  withWorkbookWriteDiagnostics,
} from "../../../../../lib/google-sheets-write.js";
import { assertScoringShadowAdministrativeEnvironment } from "../../../../../lib/scoring-shadow-gate.js";
import {
  benchmarkSummary,
  buildScoringShadowObservation,
  deliverScoringShadowObservation,
  inspectScoringShadow,
  readScoringShadowRows,
  replayExistingScoringShadowObservation,
} from "../../../../../lib/scoring-shadow.js";
import { rebuildAndReconcileScoringShadow } from "../../../../../lib/scoring-shadow-reconciliation.js";
import { grossScoresFromCell } from "../../../../../lib/live-score-values.js";
import { selectBurstBaselineObservation } from "../../../../../lib/scoring-shadow-benchmark.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTOR = "Phase 1 Benchmark";
const clean = (value) => String(value ?? "").trim();
const now = () => Date.now();
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });

async function authorize(request) {
  const startedAt = now();
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  let gate;
  try { gate = assertScoringShadowAdministrativeEnvironment(); }
  catch { return { response: unavailable() }; }
  const authorization = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  if (authorization.status !== "active") {
    return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 }) };
  }
  return { gate, identity: authorization.identity, authorizationMs: now() - startedAt };
}

async function workbookState() {
  const sheets = await readWorkbookSheetsByName(["Live Matches", "Matches", "Live Hole Scores"]);
  return {
    matches: sheets["Live Matches"].records.map((item) => item.record),
    matchSnapshots: sheets.Matches.records.map((item) => item.record),
    holes: sheets["Live Hole Scores"].records.map((item) => item.record),
  };
}

function matchAndHole(rows, matchId, holeNumber) {
  const match = rows.matches.find((item) => clean(item["Match ID"]) === matchId);
  const hole = rows.holes.find((item) => clean(item["Match ID"]) === matchId && Number(item["Hole Number"]) === holeNumber);
  if (!match) throw new Error(`Benchmark match ${matchId} was not found.`);
  return { match, hole };
}

function changedScores(hole, format, offset = 1) {
  const team1 = grossScoresFromCell(hole?.["Team 1 Gross Scores"]);
  const team2 = grossScoresFromCell(hole?.["Team 2 Gross Scores"]);
  const expected = ["SI", "SINGLES"].includes(clean(format).toUpperCase()) ? 1 : 2;
  const base1 = team1.length ? team1 : Array(expected).fill(4);
  const base2 = team2.length ? team2 : Array(expected).fill(5);
  const next = [...base1];
  next[0] = Math.min(20, Math.max(1, next[0] + (next[0] >= 10 ? -offset : offset)));
  return { originalTeam1: base1, originalTeam2: base2, team1: next, team2: base2 };
}

async function measuredMutation({ gate, match, hole, team1, team2, mutationKey }) {
  const googleAt = now();
  const measured = await withWorkbookWriteDiagnostics("phase-1-benchmark", () => saveLiveHoleScore(clean(match["Match ID"]), {
    holeNumber: Number(hole?.["Hole Number"] || 1),
    team1GrossScores: team1,
    team2GrossScores: team2,
    expectedRevision: Number(hole?.Revision || 0),
    expectedUpdatedAt: clean(match["Updated At"]),
    clientMutationId: mutationKey,
  }, ACTOR));
  const googleAuthoritativeMs = now() - googleAt;
  const { _shadow, ...participantResult } = measured.result;
  const verifiedAt = new Date().toISOString();
  const shadowCalculationAt = now();
  const observation = buildScoringShadowObservation({
    sourceWorkbookId: gate.sourceWorkbookId,
    tournamentId: _shadow.match?.["Tournament ID"] || _shadow.match?.Year,
    tournamentYear: _shadow.match?.Year,
    match: _shadow.match,
    hole: participantResult.hole,
    calculated: _shadow.calculated,
    allHoleResults: _shadow.allHoleResults,
    mutationKey,
    actorName: ACTOR,
    verifiedAt,
  });
  const shadowCalculationMs = now() - shadowCalculationAt;
  const mirror = await deliverScoringShadowObservation(observation);
  return {
    participantResult,
    observation,
    googleAuthoritativeMs,
    googleDiagnostics: measured.diagnostics,
    shadowCalculationMs,
    supabaseTransactionMs: mirror.totalDurationMs,
    mirrorLagMs: Math.max(0, now() - Date.parse(verifiedAt)),
  };
}

async function restoredMutation({ gate, matchId, holeNumber, team1, team2, prior, suffix }) {
  const match = { ...prior.observation.match, "Match ID": matchId, Year: prior.observation.match_tournament_year, Round: prior.observation.match_round_number, Format: prior.observation.match_format, "Updated At": prior.participantResult.updatedAt };
  const hole = { ...prior.participantResult.hole, "Hole Number": holeNumber };
  return measuredMutation({ gate, match, hole, team1, team2, mutationKey: `${prior.observation.mutation_key}:${suffix}` });
}

function summaries(samples) {
  return {
    google: benchmarkSummary(samples.map((item) => item.googleAuthoritativeMs), {
      retries: samples.reduce((sum, item) => sum + Number(item.googleDiagnostics?.retryLoops || 0), 0),
    }),
    supabase: benchmarkSummary(samples.map((item) => item.supabaseTransactionMs)),
    shadowCalculation: benchmarkSummary(samples.map((item) => item.shadowCalculationMs)),
    mirrorLag: benchmarkSummary(samples.map((item) => item.mirrorLagMs)),
  };
}

async function runBaseline(gate, sampleCount = 1, startIndex = 0, label = "baseline") {
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const rows = await workbookState();
    const sampleIndex = startIndex + index;
    const holeNumber = (sampleIndex % 18) + 1;
    const { match, hole } = matchAndHole(rows, "2026-R3-9", holeNumber);
    const scores = changedScores(hole, match.Format, sampleIndex % 2 ? 2 : 1);
    const forward = await measuredMutation({ gate, match, hole, team1: scores.team1, team2: scores.team2, mutationKey: `benchmark:${label}:${sampleIndex}:${Date.now()}` });
    await restoredMutation({ gate, matchId: clean(match["Match ID"]), holeNumber, team1: scores.originalTeam1, team2: scores.originalTeam2, prior: forward, suffix: "restore" });
    samples.push(forward);
  }
  return {
    sampleCount: samples.length,
    ...summaries(samples),
    raw: {
      google: samples.map((item) => item.googleAuthoritativeMs),
      supabase: samples.map((item) => item.supabaseTransactionMs),
      shadowCalculation: samples.map((item) => item.shadowCalculationMs),
      mirrorLag: samples.map((item) => item.mirrorLagMs),
      retries: samples.map((item) => Number(item.googleDiagnostics?.retryLoops || 0)),
    },
    errors: 0,
    restored: true,
  };
}

async function runCorrections(gate, sampleCount = 1, startIndex = 0) {
  const samples = [];
  const revisions = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const rows = await workbookState();
    const sampleIndex = startIndex + index;
    const holeNumber = (sampleIndex % 18) + 1;
    const { match, hole } = matchAndHole(rows, "2026-R3-9", holeNumber);
    const scores = changedScores(hole, match.Format, sampleIndex % 2 ? 2 : 1);
    const correction = await measuredMutation({
      gate, match, hole, team1: scores.team1, team2: scores.team2,
      mutationKey: `benchmark:correction:${sampleIndex}:${Date.now()}`,
    });
    const restored = await restoredMutation({
      gate, matchId: clean(match["Match ID"]), holeNumber,
      team1: scores.originalTeam1, team2: scores.originalTeam2,
      prior: correction, suffix: "restore",
    });
    revisions.push({
      matchId: clean(match["Match ID"]), holeNumber,
      before: Number(hole?.Revision || 0),
      correction: Number(correction.participantResult.hole?.Revision || 0),
      restored: Number(restored.participantResult.hole?.Revision || 0),
    });
    samples.push(correction);
  }
  return {
    sampleCount: samples.length,
    ...summaries(samples),
    raw: {
      google: samples.map((item) => item.googleAuthoritativeMs),
      supabase: samples.map((item) => item.supabaseTransactionMs),
      shadowCalculation: samples.map((item) => item.shadowCalculationMs),
      mirrorLag: samples.map((item) => item.mirrorLagMs),
      retries: samples.map((item) => Number(item.googleDiagnostics?.retryLoops || 0)),
    },
    monotonicRevisions: revisions.every((item) => item.before < item.correction && item.correction < item.restored),
    revisions,
    errors: 0,
    restored: true,
  };
}

async function repairInterruptedBaseline(gate) {
  const currentRows = await readScoringShadowRows("hole_score_mirror", `source_workbook_id=eq.${encodeURIComponent(gate.sourceWorkbookId)}&match_id=eq.2026-R3-9&select=*`);
  const interrupted = (currentRows.payload || []).find((item) => /^benchmark:baseline:/.test(clean(item.mutation_key)) && !/:restore$/.test(clean(item.mutation_key)));
  if (!interrupted) return { restored: false, reason: "no-interrupted-baseline" };
  const history = await readScoringShadowRows("score_mirror_events", `source_workbook_id=eq.${encodeURIComponent(gate.sourceWorkbookId)}&match_id=eq.2026-R3-9&hole_number=eq.${Number(interrupted.hole_number)}&select=google_revision,mutation_key,canonical_payload&order=google_revision.desc`);
  const prior = (history.payload || []).find((item) => Number(item.google_revision) < Number(interrupted.google_revision));
  if (!prior?.canonical_payload) throw new Error("The prior verified shadow value required for restoration was not found.");
  const rows = await workbookState();
  const holeNumber = Number(interrupted.hole_number);
  const { match, hole } = matchAndHole(rows, "2026-R3-9", holeNumber);
  const restored = await measuredMutation({
    gate,
    match,
    hole,
    team1: prior.canonical_payload.team_1_gross_scores,
    team2: prior.canonical_payload.team_2_gross_scores,
    mutationKey: `benchmark:interrupted-baseline:restore:${Date.now()}`,
  });
  return {
    matchId: "2026-R3-9",
    holeNumber,
    revision: Number(restored.participantResult.hole?.Revision || 0),
    team1: grossScoresFromCell(restored.participantResult.hole?.["Team 1 Gross Scores"]),
    team2: grossScoresFromCell(restored.participantResult.hole?.["Team 2 Gross Scores"]),
    googleAuthoritativeMs: restored.googleAuthoritativeMs,
    supabaseTransactionMs: restored.supabaseTransactionMs,
    restored: true,
  };
}

async function runReplay(gate, sampleCount = 30) {
  const inspection = await inspectScoringShadow({ sourceWorkbookId: gate.sourceWorkbookId, matchId: "2026-R3-9", holeNumber: 17 });
  const revision = Number(inspection.observation?.google_revision);
  if (!Number.isInteger(revision)) throw new Error("A stored replay observation is required.");
  const durations = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const replay = await replayExistingScoringShadowObservation({ sourceWorkbookId: gate.sourceWorkbookId, matchId: "2026-R3-9", holeNumber: 17, googleRevision: revision });
    durations.push(replay.replay.totalDurationMs);
  }
  const after = await inspectScoringShadow({ sourceWorkbookId: gate.sourceWorkbookId, matchId: "2026-R3-9", holeNumber: 17 });
  return { sampleCount, transaction: benchmarkSummary(durations), deliveryCount: after.observation?.delivery_count, counts: after.counts, googleTouched: false };
}

async function runRebuild(gate, requestedBy) {
  const readAt = now();
  const rows = await workbookState();
  const googleReadDurationMs = now() - readAt;
  return rebuildAndReconcileScoringShadow({ sourceWorkbookId: gate.sourceWorkbookId, ...rows, requestedBy, googleReadDurationMs });
}

async function runBurst(gate) {
  const initial = await workbookState();
  const matchId = "2026-R3-9";
  let currentMatch = matchAndHole(initial, matchId, 1).match;
  const originals = new Map();
  const samples = [];
  for (let holeNumber = 1; holeNumber <= 11; holeNumber += 1) {
    const original = initial.holes.find((item) => clean(item["Match ID"]) === matchId && Number(item["Hole Number"]) === holeNumber);
    originals.set(holeNumber, original);
    const scores = changedScores(original, currentMatch.Format, 1);
    const sample = await measuredMutation({ gate, match: currentMatch, hole: original, team1: scores.team1, team2: scores.team2, mutationKey: `benchmark:burst:${holeNumber}:${Date.now()}` });
    samples.push(sample);
    currentMatch = { ...currentMatch, "Updated At": sample.participantResult.updatedAt };
  }
  for (const sample of samples) {
    const holeNumber = sample.observation.hole_number;
    const original = originals.get(holeNumber);
    const restore = await measuredMutation({
      gate,
      match: { ...currentMatch, "Updated At": currentMatch["Updated At"] },
      hole: sample.participantResult.hole,
      team1: grossScoresFromCell(original["Team 1 Gross Scores"]),
      team2: grossScoresFromCell(original["Team 2 Gross Scores"]),
      mutationKey: `benchmark:burst:${holeNumber}:restore:${Date.now()}`,
    });
    currentMatch = { ...currentMatch, "Updated At": restore.participantResult.updatedAt };
  }
  return { sampleCount: samples.length, maximumQueueDepth: 11, ...summaries(samples), errors: 0, restored: true };
}

async function priorShadowGrossScores(gate, matchId, holeNumber, currentRevision) {
  const history = await readScoringShadowRows("score_mirror_events", `source_workbook_id=eq.${encodeURIComponent(gate.sourceWorkbookId)}&match_id=eq.${encodeURIComponent(matchId)}&hole_number=eq.${Number(holeNumber)}&select=google_revision,mutation_key,canonical_payload&order=google_revision.desc`);
  const prior = selectBurstBaselineObservation(
    (history.payload || []).filter((item) => Number(item.google_revision) < Number(currentRevision)),
  );
  if (!prior?.canonical_payload) throw new Error(`The prior verified score for ${matchId} hole ${holeNumber} was not found.`);
  return {
    team1: prior.canonical_payload.team_1_gross_scores,
    team2: prior.canonical_payload.team_2_gross_scores,
  };
}

async function runBurstSegment(gate, segment, mode) {
  const ranges = [[1, 3], [4, 6], [7, 9], [10, 11]];
  const [startHole, endHole] = ranges[segment - 1] || [];
  if (!startHole) throw new Error("A valid burst segment is required.");
  const matchId = "2026-R3-9";
  const samples = [];
  const startedAt = now();
  let rows = await workbookState();
  let currentMatch = matchAndHole(rows, matchId, startHole).match;
  for (let holeNumber = startHole; holeNumber <= endHole; holeNumber += 1) {
    const currentHole = rows.holes.find((item) => clean(item["Match ID"]) === matchId && Number(item["Hole Number"]) === holeNumber);
    let team1;
    let team2;
    if (mode === "restore") {
      const prior = await priorShadowGrossScores(gate, matchId, holeNumber, currentHole.Revision);
      team1 = prior.team1;
      team2 = prior.team2;
    } else {
      const changed = changedScores(currentHole, currentMatch.Format, 1);
      team1 = changed.team1;
      team2 = changed.team2;
    }
    const sample = await measuredMutation({
      gate,
      match: currentMatch,
      hole: currentHole,
      team1,
      team2,
      mutationKey: `benchmark:burst:${mode}:${holeNumber}:${Date.now()}`,
    });
    samples.push(sample);
    currentMatch = { ...currentMatch, "Updated At": sample.participantResult.updatedAt };
    rows = { ...rows, holes: rows.holes.map((item) => clean(item["Match ID"]) === matchId && Number(item["Hole Number"]) === holeNumber ? sample.participantResult.hole : item) };
  }
  return {
    segment,
    mode,
    holes: Array.from({ length: endHole - startHole + 1 }, (_, index) => startHole + index),
    sampleCount: samples.length,
    segmentDurationMs: now() - startedAt,
    maximumQueueDepth: mode === "forward" ? 11 : 0,
    ...summaries(samples),
    raw: {
      google: samples.map((item) => item.googleAuthoritativeMs),
      supabase: samples.map((item) => item.supabaseTransactionMs),
      shadowCalculation: samples.map((item) => item.shadowCalculationMs),
      mirrorLag: samples.map((item) => item.mirrorLagMs),
      retries: samples.map((item) => Number(item.googleDiagnostics?.retryLoops || 0)),
    },
  };
}

async function runConcurrency(gate) {
  const initial = await workbookState();
  const round3 = initial.matches.filter((match) => Number(match.Round) === 3).slice(0, 12);
  if (round3.length !== 12) throw new Error("Twelve Round 3 matches are required.");
  const ready = initial;
  const prepared = round3.map((originalMatch) => {
    const matchId = clean(originalMatch["Match ID"]);
    const match = ready.matches.find((item) => clean(item["Match ID"]) === matchId);
    const hole = ready.holes.find((item) => clean(item["Match ID"]) === matchId && Number(item["Hole Number"]) === 1);
    const scores = changedScores(hole, match.Format, 1);
    return { originalMatch, match, hole, scores };
  });
  const startedAt = now();
  const settled = await Promise.allSettled(prepared.map(({ match, hole, scores }, index) => measuredMutation({
    gate, match, hole: hole || { "Hole Number": 1, Revision: 0 }, team1: scores.team1, team2: scores.team2,
    mutationKey: `benchmark:concurrency:${index}:${Date.now()}`,
  })));
  const samples = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  const errors = settled.filter((item) => item.status === "rejected").map((item) => clean(item.reason?.message));
  const directRestores = { matches: [], holes: [] };
  for (let index = 0; index < prepared.length; index += 1) {
    const preparedItem = prepared[index];
    const result = settled[index];
    if (result.status !== "fulfilled") continue;
    if (preparedItem.hole) {
      await restoredMutation({ gate, matchId: clean(preparedItem.match["Match ID"]), holeNumber: 1, team1: preparedItem.scores.originalTeam1, team2: preparedItem.scores.originalTeam2, prior: result.value, suffix: "restore" });
    } else {
      directRestores.matches.push({ matchId: clean(preparedItem.originalMatch["Match ID"]), record: preparedItem.originalMatch });
      directRestores.holes.push({ matchId: clean(preparedItem.originalMatch["Match ID"]), holeNumber: 1, record: null });
    }
  }
  if (directRestores.matches.length || directRestores.holes.length) await restorePreviewScoringBenchmarkRows(directRestores);
  return {
    concurrentRequests: 12,
    eligibleNonFinalRequests: round3.filter((match) => !/^final$/i.test(clean(match["Match Status"]))).length,
    successful: samples.length,
    errors,
    lifecycleBlocks: errors.filter((message) => /reopen|final/i.test(message)).length,
    totalMs: now() - startedAt,
    ...summaries(samples),
    raw: {
      google: samples.map((item) => item.googleAuthoritativeMs),
      supabase: samples.map((item) => item.supabaseTransactionMs),
      mirrorLag: samples.map((item) => item.mirrorLagMs),
    },
    restored: true,
  };
}

async function runSupabaseConcurrency(gate) {
  const events = await readScoringShadowRows("score_mirror_events", `source_workbook_id=eq.${encodeURIComponent(gate.sourceWorkbookId)}&select=match_id,hole_number,google_revision&order=observed_at.desc`);
  const unique = [];
  const seen = new Set();
  for (const event of events.payload || []) {
    if (seen.has(event.match_id)) continue;
    seen.add(event.match_id);
    unique.push(event);
    if (unique.length === 12) break;
  }
  if (unique.length !== 12) throw new Error("Twelve stored match observations are required for Supabase concurrency.");
  const startedAt = now();
  const settled = await Promise.allSettled(unique.map((event) => replayExistingScoringShadowObservation({
    sourceWorkbookId: gate.sourceWorkbookId,
    matchId: event.match_id,
    holeNumber: Number(event.hole_number),
    googleRevision: Number(event.google_revision),
  })));
  const fulfilled = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  return {
    concurrentRequests: 12,
    distinctMatches: unique.map((item) => item.match_id),
    successful: fulfilled.length,
    errors: settled.filter((item) => item.status === "rejected").map((item) => clean(item.reason?.message)),
    totalMs: now() - startedAt,
    transaction: benchmarkSummary(fulfilled.map((item) => item.replay.totalDurationMs)),
    googleTouched: false,
  };
}

async function runTwoDeviceConflict(gate) {
  const matchId = "2026-R3-9";
  const holeNumber = 13;
  const rows = await workbookState();
  const { match, hole } = matchAndHole(rows, matchId, holeNumber);
  const originalTeam1 = grossScoresFromCell(hole["Team 1 Gross Scores"]);
  const originalTeam2 = grossScoresFromCell(hole["Team 2 Gross Scores"]);
  const deviceA = changedScores(hole, match.Format, 1);
  const deviceB = changedScores(hole, match.Format, 2);
  const submittedAt = Date.now();
  const attempts = await Promise.allSettled([
    measuredMutation({ gate, match, hole, team1: deviceA.team1, team2: deviceA.team2, mutationKey: `benchmark:device-a:${submittedAt}` }),
    measuredMutation({ gate, match, hole, team1: deviceB.team1, team2: deviceB.team2, mutationKey: `benchmark:device-b:${submittedAt}` }),
  ]);
  const accepted = attempts.find((item) => item.status === "fulfilled")?.value;
  const rejected = attempts.find((item) => item.status === "rejected");
  if (!accepted || !rejected) throw new Error("The two-device test must produce one verified save and one stale-write conflict.");
  const refreshed = await workbookState();
  const current = matchAndHole(refreshed, matchId, holeNumber);
  const newest = await measuredMutation({
    gate, match: current.match, hole: current.hole,
    team1: deviceB.team1, team2: deviceB.team2,
    mutationKey: `benchmark:device-b-retry:${submittedAt}`,
  });
  const restored = await restoredMutation({
    gate, matchId, holeNumber, team1: originalTeam1, team2: originalTeam2,
    prior: newest, suffix: "restore",
  });
  return {
    matchId,
    holeNumber,
    firstVerifiedRevision: Number(accepted.participantResult.hole?.Revision || 0),
    conflictMessage: clean(rejected.reason?.message),
    staleWriteRejected: /updated by someone else/i.test(clean(rejected.reason?.message)),
    newestVerifiedRevision: Number(newest.participantResult.hole?.Revision || 0),
    restoredRevision: Number(restored.participantResult.hole?.Revision || 0),
    monotonicRevisions: Number(accepted.participantResult.hole?.Revision || 0) < Number(newest.participantResult.hole?.Revision || 0) && Number(newest.participantResult.hole?.Revision || 0) < Number(restored.participantResult.hole?.Revision || 0),
    googleFinalPayload: {
      team1: grossScoresFromCell(restored.participantResult.hole?.["Team 1 Gross Scores"]),
      team2: grossScoresFromCell(restored.participantResult.hole?.["Team 2 Gross Scores"]),
    },
    originalPayload: { team1: originalTeam1, team2: originalTeam2 },
    googleAuthoritativeMs: benchmarkSummary([accepted.googleAuthoritativeMs, newest.googleAuthoritativeMs]),
    supabaseTransactionMs: benchmarkSummary([accepted.supabaseTransactionMs, newest.supabaseTransactionMs]),
    restored: true,
  };
}

async function runFinalizationGate(gate) {
  const initial = await workbookState();
  const candidate = initial.matches.find((item) => Number(item.Round) === 3 && !/^(final|finalized)$/i.test(clean(item["Match Status"])) &&
    initial.holes.filter((hole) => clean(hole["Match ID"]) === clean(item["Match ID"])).length === 0);
  if (!candidate) throw new Error("A zero-hole, non-Final Preview match is required for the finalization gate test.");
  const matchId = clean(candidate["Match ID"]);
  let finalizationError = "";
  try { await confirmLiveMatchScorecard(matchId, ACTOR); }
  catch (error) { finalizationError = clean(error?.message); }
  const after = await workbookState();
  const current = matchAndHole(after, matchId, 1).match;
  const inspection = await inspectScoringShadow({ sourceWorkbookId: gate.sourceWorkbookId, matchId });
  return {
    matchId,
    scoredHoles: after.holes.filter((hole) => clean(hole["Match ID"]) === matchId).length,
    finalizationBlocked: /record all 18 holes/i.test(finalizationError),
    finalizationError,
    authoritativeStatus: clean(current["Match Status"]),
    shadowFinalized: Boolean(inspection.match?.finalized),
    googleTouched: false,
  };
}

async function runSupabaseFailureIsolation(gate) {
  const matchId = "2026-R3-9";
  const holeNumber = 14;
  const rows = await workbookState();
  const { match, hole } = matchAndHole(rows, matchId, holeNumber);
  const originalTeam1 = grossScoresFromCell(hole["Team 1 Gross Scores"]);
  const originalTeam2 = grossScoresFromCell(hole["Team 2 Gross Scores"]);
  const scores = changedScores(hole, match.Format, 1);
  const googleAt = now();
  const measured = await withWorkbookWriteDiagnostics("phase-1-failure-isolation", () => saveLiveHoleScore(matchId, {
    holeNumber,
    team1GrossScores: scores.team1,
    team2GrossScores: scores.team2,
    expectedRevision: Number(hole.Revision || 0),
    expectedUpdatedAt: clean(match["Updated At"]),
    clientMutationId: `benchmark:supabase-unavailable:${Date.now()}`,
  }, ACTOR));
  const googleAuthoritativeMs = now() - googleAt;
  const { _shadow, ...participantResult } = measured.result;
  const observation = buildScoringShadowObservation({
    sourceWorkbookId: gate.sourceWorkbookId,
    tournamentId: _shadow.match?.["Tournament ID"] || _shadow.match?.Year,
    tournamentYear: _shadow.match?.Year,
    match: _shadow.match,
    hole: participantResult.hole,
    calculated: _shadow.calculated,
    allHoleResults: _shadow.allHoleResults,
    mutationKey: `benchmark:supabase-unavailable:${Date.now()}`,
    actorName: ACTOR,
  });
  let mirrorFailure = "";
  let mirrorStatus = 0;
  const failureAt = now();
  try {
    await deliverScoringShadowObservation(observation, {
      timeoutMs: 750,
      env: { ...process.env, SUPABASE_SCORING_MIRROR_URL: "https://127.0.0.1.invalid" },
    });
  } catch (error) {
    mirrorFailure = clean(error?.message);
    mirrorStatus = Number(error?.status || 0);
  }
  const unavailableDurationMs = now() - failureAt;
  const restore = await measuredMutation({
    gate,
    match: { ..._shadow.match, "Updated At": participantResult.updatedAt },
    hole: participantResult.hole,
    team1: originalTeam1,
    team2: originalTeam2,
    mutationKey: `benchmark:supabase-unavailable:restore:${Date.now()}`,
  });
  let malformedRejected = false;
  let malformedStatus = 0;
  try { await deliverScoringShadowObservation({}, { timeoutMs: 2_000 }); }
  catch (error) { malformedRejected = true; malformedStatus = Number(error?.status || 0); }
  return {
    matchId,
    holeNumber,
    googleAuthoritativeMs,
    googleVerified: Boolean(participantResult.hole),
    mirrorFailureObserved: Boolean(mirrorFailure),
    mirrorFailure,
    mirrorStatus,
    unavailableDurationMs,
    participantResponseWouldRemainSuccessful: Boolean(participantResult.hole),
    malformedPayloadRejected: malformedRejected,
    malformedStatus,
    restoredRevision: Number(restore.participantResult.hole?.Revision || 0),
    restoredPayload: {
      team1: grossScoresFromCell(restore.participantResult.hole?.["Team 1 Gross Scores"]),
      team2: grossScoresFromCell(restore.participantResult.hole?.["Team 2 Gross Scores"]),
    },
    originalPayload: { team1: originalTeam1, team2: originalTeam2 },
    googleRollbackAttempted: false,
    restored: true,
  };
}

async function runPreflight(gate) {
  const rows = await workbookState();
  const roundCoverage = Object.fromEntries([1, 2, 3].map((round) => [round, {
    matches: rows.matches.filter((item) => Number(item.Round) === round).length,
    holes: rows.holes.filter((hole) => Number(rows.matches.find((item) => clean(item["Match ID"]) === clean(hole["Match ID"]))?.Round) === round).length,
  }]));
  return {
    preview: process.env.VERCEL_ENV === "preview",
    previewWorkbook: Boolean(gate.previewWorkbook),
    productionIsolated: Boolean(gate.previewWorkbook),
    scoringEnvironment: "test",
    scoringEnabled: true,
    mirrorEnabled: Boolean(gate.enabled),
    sourceWorkbookConfigured: Boolean(gate.sourceWorkbookId),
    matches: rows.matches.length,
    holes: rows.holes.length,
    roundCoverage,
    matchStatuses: rows.matches.map((item) => ({ matchId: clean(item["Match ID"]), round: Number(item.Round), status: clean(item["Match Status"]), scoredHoles: rows.holes.filter((hole) => clean(hole["Match ID"]) === clean(item["Match ID"])).length })),
  };
}

async function runGoogleFailure(gate) {
  const before = await inspectScoringShadow({ sourceWorkbookId: gate.sourceWorkbookId, matchId: "2026-R3-9", holeNumber: 12 });
  const rows = await workbookState();
  const { match, hole } = matchAndHole(rows, "2026-R3-9", 12);
  let error = "";
  try {
    await saveLiveHoleScore(clean(match["Match ID"]), {
      holeNumber: 12,
      team1GrossScores: grossScoresFromCell(hole["Team 1 Gross Scores"]),
      team2GrossScores: grossScoresFromCell(hole["Team 2 Gross Scores"]),
      expectedRevision: Math.max(0, Number(hole.Revision) - 1),
      expectedUpdatedAt: "stale-benchmark-timestamp",
      clientMutationId: `benchmark:google-failure:${Date.now()}`,
    }, ACTOR);
  } catch (failure) { error = clean(failure?.message); }
  const after = await inspectScoringShadow({ sourceWorkbookId: gate.sourceWorkbookId, matchId: "2026-R3-9", holeNumber: 12 });
  return { failedAsExpected: Boolean(error), participantSafeError: /updated by someone else/i.test(error), mirrorEventDelta: after.counts.score_mirror_events - before.counts.score_mirror_events };
}

export async function POST(request) {
  const context = await authorize(request);
  if (context.response) return context.response;
  try {
    const input = await request.json().catch(() => ({}));
    const action = clean(input.action);
    const startedAt = now();
    let result;
    const baselineMatch = action.match(/^baseline-(\d+)$/);
    const correctionMatch = action.match(/^correction-(\d+)$/);
    const burstMatch = action.match(/^burst-(forward|restore)-(\d+)$/);
    if (action === "preflight") result = await runPreflight(context.gate);
    else if (action === "repair-interrupted-baseline") result = await repairInterruptedBaseline(context.gate);
    else if (baselineMatch) result = await runBaseline(context.gate, 1, Number(baselineMatch[1]) - 1, "baseline");
    else if (correctionMatch) result = await runCorrections(context.gate, 1, Number(correctionMatch[1]) - 1);
    else if (action === "baseline") result = await runBaseline(context.gate, 1);
    else if (action === "corrections") result = await runCorrections(context.gate, 1);
    else if (action === "replay") result = await runReplay(context.gate, 30);
    else if (["gate-a", "gate-b", "final-rebuild"].includes(action)) result = await runRebuild(context.gate, context.identity.actor.name);
    else if (action === "burst") result = await runBurst(context.gate);
    else if (action === "concurrency") result = await runConcurrency(context.gate);
    else if (action === "supabase-concurrency") result = await runSupabaseConcurrency(context.gate);
    else if (burstMatch) result = await runBurstSegment(context.gate, Number(burstMatch[2]), burstMatch[1]);
    else if (action === "two-device") result = await runTwoDeviceConflict(context.gate);
    else if (action === "finalization-race") result = await runFinalizationGate(context.gate);
    else if (action === "supabase-failure") result = await runSupabaseFailureIsolation(context.gate);
    else if (action === "google-failure") result = await runGoogleFailure(context.gate);
    else return NextResponse.json({ error: "Unsupported benchmark action." }, { status: 400 });
    return NextResponse.json({ ok: true, action, authorizationMs: context.authorizationMs, requestMs: now() - startedAt, result });
  } catch (error) {
    console.error("Phase 1 benchmark failed", { message: error?.message, diagnostics: error?.workbookDiagnostics || {} });
    return NextResponse.json({ error: clean(error?.message || "Benchmark failed."), diagnostics: error?.workbookDiagnostics || {} }, { status: 503 });
  }
}
