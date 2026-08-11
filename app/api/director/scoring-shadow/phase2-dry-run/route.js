import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { playerPassportTokenFromRequest } from "../../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../../lib/player-passport-server.js";
import { assertScoringShadowAdministrativeEnvironment } from "../../../../../lib/scoring-shadow-gate.js";
import {
  buildScoringAuthorityDryRunFixture,
  dryRunMutationInput,
  finalizeScoringAuthorityDryRun,
  readScoringAuthorityDryRun,
  recordScoringAuthorityDryRunSample,
  resetScoringAuthorityDryRun,
  resolveScoringAuthorityCourseSnapshot,
  scoringAuthorityDryRunTimeoutProbe,
  scoringDryRunAuthorization,
  submitScoringAuthorityDryRun,
} from "../../../../../lib/scoring-authority-dry-run.js";
import { calculateLiveHole, calculateLiveMatchStatus, calculateMatchPoints, isScorecardComplete } from "../../../../../lib/live-hole-scoring.js";
import { historicalScoringSnapshotForMatch } from "../../../../../lib/scoring-shadow-reconciliation.js";
import { benchmarkSummary } from "../../../../../lib/scoring-shadow.js";
import {
  readWorkbookSheetsByName,
  saveLiveHoleScore,
  withWorkbookWriteDiagnostics,
} from "../../../../../lib/google-sheets-write.js";
import { grossScoresFromCell } from "../../../../../lib/live-score-values.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAIN_SET = "phase2-authority-equivalent-2026";
const ACTOR = "Phase 2 Dry Run";
const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });

async function authorize(request) {
  const startedAt = Date.now();
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  let gate;
  try { gate = assertScoringShadowAdministrativeEnvironment(); }
  catch { return { response: unavailable() }; }
  const authorization = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  if (authorization.status !== "active") {
    return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 }) };
  }
  return { gate, identity: authorization.identity, authorizationMs: Date.now() - startedAt };
}

async function authoritativeFixtures() {
  const sheets = await readWorkbookSheetsByName(["Live Matches", "Matches", "Live Hole Scores", "Course Holes", "Courses", "Rounds"]);
  const matches = sheets["Live Matches"].records.map(({ record }) => record);
  const archived = new Map(sheets.Matches.records.map(({ record }) => [clean(record["Match ID"]), record]));
  const courseHoles = sheets["Course Holes"].records.map(({ record }) => record);
  const courses = sheets.Courses.records.map(({ record }) => record);
  const rounds = sheets.Rounds.records.map(({ record }) => record);
  const holes = sheets["Live Hole Scores"].records.map(({ record }) => record);
  const fixtures = matches.map((current) => {
    const historicalMatch = historicalScoringSnapshotForMatch(current, archived.get(clean(current["Match ID"]))) || current;
    const resolved = resolveScoringAuthorityCourseSnapshot({ historicalMatch, currentMatch: current, courses, courseHoles });
    const match = resolved.match;
    const round = rounds.find((item) => number(item.Year) === number(match.Year) && number(String(item.Round).replace(/\D/g, "")) === number(match.Round)) || {};
    return buildScoringAuthorityDryRunFixture({ match, course: resolved.course, courseHoles: resolved.courseHoles, round, forceWritable: true });
  });
  return { fixtures, matches, holes };
}

function fixtureFromMatchRow(row) {
  return {
    match_id: row.match_id,
    tournament_id: row.tournament_id,
    tournament_year: number(row.tournament_year),
    round_number: number(row.round_number),
    format: row.format,
    permission_revision: number(row.permission_revision, 1),
    scoring_snapshot: row.scoring_snapshot,
  };
}

async function scorecard(fixtureSet, matchId) {
  const response = await readScoringAuthorityDryRun({ fixture_set: fixtureSet, match_id: matchId, mode: "SCORECARD" });
  if (!response.payload?.ok || !response.payload?.data?.match) throw new Error(`Dry-run fixture ${matchId} was not found.`);
  return response.payload.data;
}

function playersFor(snapshot, side) {
  return (snapshot?.participants?.[`team_${side}`] || []).map((player) => ({
    id: player.id,
    strokes: number(player.final_strokes),
    playingHcp: number(player.playing_handicap),
  }));
}

function expectedCalculation(fixture, holeNumber, team1, team2) {
  const hole = fixture.scoring_snapshot.holes.find((item) => number(item.hole_number) === number(holeNumber));
  return calculateLiveHole({
    format: fixture.format,
    holeNumber,
    strokeIndex: hole?.stroke_index,
    team1Players: playersFor(fixture.scoring_snapshot, 1),
    team2Players: playersFor(fixture.scoring_snapshot, 2),
    team1GrossScores: team1,
    team2GrossScores: team2,
    team1Strokes: number(fixture.scoring_snapshot.teams?.team_1_strokes),
    team2Strokes: number(fixture.scoring_snapshot.teams?.team_2_strokes),
  });
}

function expectedMatchState(holeResults, format) {
  const live = calculateLiveMatchStatus(holeResults, format);
  const complete = isScorecardComplete(holeResults);
  const points = calculateMatchPoints(format, holeResults);
  return {
    scored_holes: new Set(holeResults.map((item) => Number(item.holeNumber))).size,
    current_hole: live.currentHole,
    holes_remaining: live.holesRemaining,
    team_1_holes_won: live.team1HolesWon,
    team_2_holes_won: live.team2HolesWon,
    running_result: live.statusText,
    result_winner: clean(format).toUpperCase() === "SI" ? live.winner : complete ? points.overallWinner : "",
    clinched: clean(format).toUpperCase() === "SI" && Boolean(live.complete),
    scorecard_complete: complete,
  };
}

function comparison(result, calculated, holeResults = [calculated], format = calculated.format) {
  const expectedTeam1Strokes = calculated.team1.grossScores.map((item) => item.strokes);
  const expectedTeam2Strokes = calculated.team2.grossScores.map((item) => item.strokes);
  const match = expectedMatchState(holeResults, format);
  return {
    gross: JSON.stringify(result.gross?.team_1) === JSON.stringify(calculated.team1.grossScores.map((item) => item.grossScore)) &&
      JSON.stringify(result.gross?.team_2) === JSON.stringify(calculated.team2.grossScores.map((item) => item.grossScore)),
    strokes: JSON.stringify(result.strokes?.team_1) === JSON.stringify(expectedTeam1Strokes) && JSON.stringify(result.strokes?.team_2) === JSON.stringify(expectedTeam2Strokes),
    net: number(result.net?.team_1) === number(calculated.team1.netScore) && number(result.net?.team_2) === number(calculated.team2.netScore),
    holeWinner: clean(result.hole_winner) === clean(calculated.winner),
    matchProgress: ["scored_holes", "current_hole", "holes_remaining", "team_1_holes_won", "team_2_holes_won", "running_result"]
      .every((key) => clean(result.match?.[key]) === clean(match[key])),
    clinchResult: Boolean(result.match?.clinched) === match.clinched && clean(result.match?.result_winner) === clean(match.result_winner),
    scorecardCompleteness: Boolean(result.match?.scorecard_complete) === match.scorecard_complete,
  };
}

async function recordSample({ fixtureSet, operation, matchId, holeNumber, authorizationMs, response, outcome = "PASS", diagnostics = {} }) {
  const timings = response?.payload?.timings || {};
  const responseStartedAt = Date.now();
  const sample = {
    fixture_set: fixtureSet,
    operation,
    match_id: matchId || "",
    hole_number: holeNumber || "",
    outcome,
    authorization_ms: authorizationMs,
    lock_wait_ms: timings.lock_wait_ms,
    validation_ms: timings.validation_ms,
    calculation_ms: timings.calculation_ms,
    mutation_ms: timings.mutation_ms,
    server_transaction_ms: timings.server_transaction_ms,
    rpc_total_ms: response?.rpcTotalMs,
    commit_response_ms: response?.commitResponseMs,
    response_construction_ms: Math.max(0, Date.now() - responseStartedAt),
    total_server_ms: number(authorizationMs) + number(response?.rpcTotalMs),
    diagnostics,
  };
  await recordScoringAuthorityDryRunSample(sample);
  return sample;
}

async function seed(fixtureSet = MAIN_SET, transform = (fixtures) => fixtures) {
  const source = await authoritativeFixtures();
  const fixtures = transform(source.fixtures);
  const reset = await resetScoringAuthorityDryRun(fixtureSet, fixtures);
  return { ...source, fixtures, reset: reset.payload, fixtureSet };
}

async function baselineSample(index, authorizationMs) {
  const matchId = `2026-R3-${(index % 12) + 1}`;
  const holeNumber = Math.floor(index / 12) + 1;
  const current = await scorecard(MAIN_SET, matchId);
  const fixture = fixtureFromMatchRow(current.match);
  const priorHole = current.holes.find((hole) => number(hole.hole_number) === holeNumber);
  const team1 = [4 + (index % 2)];
  const team2 = [5 + (index % 2)];
  const input = dryRunMutationInput({
    fixtureSet: MAIN_SET, fixture, holeNumber, team1, team2,
    expectedMatchRevision: number(current.match.match_revision),
    expectedHoleRevision: number(priorHole?.hole_revision),
    mutationKey: `phase2-baseline:${index + 1}:${randomUUID()}`,
  });
  const response = await submitScoringAuthorityDryRun(input);
  const calculated = expectedCalculation(fixture, holeNumber, team1, team2);
  const equivalence = comparison(response.payload, calculated);
  const pass = response.payload?.ok && Object.values(equivalence).every(Boolean);
  const sample = await recordSample({ fixtureSet: MAIN_SET, operation: "MUTATION_BASELINE", matchId, holeNumber, authorizationMs, response, outcome: pass ? "PASS" : "DIVERGENCE", diagnostics: equivalence });
  return { index: index + 1, matchId, holeNumber, result: response.payload, equivalence, sample };
}

async function runEquivalence(authorizationMs) {
  const fixtureSet = `phase2-equivalence-${Date.now()}`;
  const seeded = await seed(fixtureSet, (fixtures) => [
    fixtures.find((item) => item.format === "BB"),
    fixtures.find((item) => item.format === "SC"),
    fixtures.find((item) => item.format === "SI"),
  ]);
  const results = [];
  for (const fixture of seeded.fixtures) {
    const slots = fixture.format === "BB" ? 2 : 1;
    const team1 = Array(slots).fill(4);
    const team2 = Array(slots).fill(5);
    const response = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber: 1, team1, team2, mutationKey: `equivalence:${fixture.format}` }));
    const equivalent = comparison(response.payload, expectedCalculation(fixture, 1, team1, team2));
    await recordSample({ fixtureSet, operation: `EQUIVALENCE_${fixture.format}`, matchId: fixture.match_id, holeNumber: 1, authorizationMs, response, outcome: Object.values(equivalent).every(Boolean) ? "PASS" : "DIVERGENCE", diagnostics: equivalent });
    results.push({ format: fixture.format, matchId: fixture.match_id, equivalent, result: response.payload });
  }
  return { fixtureSet, results, pass: results.every((item) => Object.values(item.equivalent).every(Boolean)) };
}

async function runCorrections(authorizationMs) {
  const fixtureSet = `phase2-corrections-${Date.now()}`;
  const seeded = await seed(fixtureSet, (fixtures) => [fixtures.find((item) => item.match_id === "2026-R3-9")]);
  const fixture = seeded.fixtures[0];
  const baseInput = dryRunMutationInput({ fixtureSet, fixture, holeNumber: 7, team1: [5], team2: [5], mutationKey: "correction:base" });
  const base = await submitScoringAuthorityDryRun(baseInput);
  const correction = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber: 7, team1: [4], team2: [5], expectedMatchRevision: 1, expectedHoleRevision: 1, mutationKey: "correction:newest" }));
  const stale = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber: 7, team1: [3], team2: [5], expectedMatchRevision: 1, expectedHoleRevision: 1, mutationKey: "correction:stale" }));
  const replay = await submitScoringAuthorityDryRun(baseInput);
  const mismatchedReplay = await submitScoringAuthorityDryRun({ ...baseInput, team_1_gross_scores: [6] });
  for (const [operation, response] of [["CORRECTION_BASE", base], ["CORRECTION_NEWEST", correction]]) {
    await recordSample({ fixtureSet, operation, matchId: fixture.match_id, holeNumber: 7, authorizationMs, response, outcome: response.payload?.ok ? "PASS" : "FAIL" });
  }
  const current = await scorecard(fixtureSet, fixture.match_id);
  return {
    fixtureSet,
    base: base.payload,
    correction: correction.payload,
    stale: stale.payload,
    replay: replay.payload,
    mismatchedReplay: mismatchedReplay.payload,
    currentHole: current.holes.find((hole) => number(hole.hole_number) === 7),
    pass: base.payload?.ok && correction.payload?.ok && stale.payload?.code === "MATCH_REVISION_CONFLICT" && replay.payload?.idempotent && mismatchedReplay.payload?.code === "IDEMPOTENCY_CONFLICT",
  };
}

async function runConcurrency(authorizationMs) {
  const fixtureSet = `phase2-concurrency-${Date.now()}`;
  const seeded = await seed(fixtureSet, (fixtures) => fixtures.filter((fixture) => fixture.round_number === 3).slice(0, 12));
  const startedAt = Date.now();
  const attempts = await Promise.all(seeded.fixtures.map(async (fixture, index) => {
    const response = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber: 1, team1: [4], team2: [5], mutationKey: `concurrent:${index}` }));
    await recordSample({ fixtureSet, operation: "CONCURRENCY_12", matchId: fixture.match_id, holeNumber: 1, authorizationMs, response, outcome: response.payload?.ok ? "PASS" : response.payload?.code || "FAIL" });
    return response;
  }));
  const diagnostics = await readScoringAuthorityDryRun({ fixture_set: fixtureSet, mode: "DIAGNOSTICS" });
  return {
    fixtureSet,
    concurrentRequests: attempts.length,
    successful: attempts.filter((item) => item.payload?.ok).length,
    errors: attempts.filter((item) => !item.payload?.ok).map((item) => item.payload?.code),
    totalMs: Date.now() - startedAt,
    rpc: benchmarkSummary(attempts.map((item) => item.rpcTotalMs)),
    lockWait: benchmarkSummary(attempts.map((item) => item.payload?.timings?.lock_wait_ms)),
    transaction: benchmarkSummary(attempts.map((item) => item.payload?.timings?.server_transaction_ms)),
    diagnostics: diagnostics.payload?.data,
  };
}

async function runSameMatchConcurrency(authorizationMs) {
  const fixtureSet = `phase2-same-match-${Date.now()}`;
  const seeded = await seed(fixtureSet, (fixtures) => [fixtures.find((fixture) => fixture.match_id === "2026-R3-9")]);
  const fixture = seeded.fixtures[0];
  const differentHoles = await Promise.all([1, 2, 3].map(async (holeNumber) => ({
    holeNumber,
    response: await submitScoringAuthorityDryRun(dryRunMutationInput({
      fixtureSet, fixture, holeNumber, team1: [4], team2: [5], mutationKey: `same-match:different:${holeNumber}`,
    })),
  })));
  const acceptedDifferent = differentHoles.filter((item) => item.response.payload?.ok);
  const conflictedDifferent = differentHoles.filter((item) => item.response.payload?.code === "MATCH_REVISION_CONFLICT");
  let current = await scorecard(fixtureSet, fixture.match_id);
  for (const attempt of differentHoles.filter((item) => !item.response.payload?.ok)) {
    const holeNumber = attempt.holeNumber;
    await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber, team1: [4], team2: [5], expectedMatchRevision: number(current.match.match_revision), expectedHoleRevision: 0, mutationKey: `same-match:retry:${holeNumber}` }));
    current = await scorecard(fixtureSet, fixture.match_id);
  }
  current = await scorecard(fixtureSet, fixture.match_id);
  const sameHoleRevision = number(current.holes.find((hole) => number(hole.hole_number) === 1)?.hole_revision);
  const sameHole = await Promise.all([
    submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber: 1, team1: [3], team2: [5], expectedMatchRevision: number(current.match.match_revision), expectedHoleRevision: sameHoleRevision, mutationKey: "same-hole:a" })),
    submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber: 1, team1: [6], team2: [5], expectedMatchRevision: number(current.match.match_revision), expectedHoleRevision: sameHoleRevision, mutationKey: "same-hole:b" })),
  ]);
  const finalState = await scorecard(fixtureSet, fixture.match_id);
  return {
    fixtureSet,
    differentHoles: { accepted: acceptedDifferent.length, revisionConflicts: conflictedDifferent.length },
    sameHole: { accepted: sameHole.filter((item) => item.payload?.ok).length, conflicts: sameHole.filter((item) => item.payload?.code?.includes("REVISION_CONFLICT")).length },
    finalMatchRevision: finalState.match.match_revision,
    logicalHoles: finalState.holes.length,
    pass: acceptedDifferent.length === 1 && conflictedDifferent.length === 2 && finalState.holes.length === 3 && sameHole.filter((item) => item.payload?.ok).length === 1 && sameHole.filter((item) => item.payload?.code?.includes("REVISION_CONFLICT")).length === 1,
  };
}

async function runPostClinch(authorizationMs) {
  const fixtureSet = `phase2-post-clinch-${Date.now()}`;
  const seeded = await seed(fixtureSet, (fixtures) => [fixtures.find((fixture) => fixture.match_id === "2026-R3-9")]);
  const fixture = seeded.fixtures[0];
  const states = [];
  let matchRevision = 0;
  for (let holeNumber = 1; holeNumber <= 18; holeNumber += 1) {
    const response = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber, team1: [2], team2: [10], expectedMatchRevision: matchRevision, mutationKey: `post-clinch:${holeNumber}` }));
    if (!response.payload?.ok) throw new Error(`Post-clinch hole ${holeNumber} failed: ${response.payload?.code}`);
    matchRevision = number(response.payload.match_revision);
    states.push({ holeNumber, match: response.payload.match, result: response.payload.code });
  }
  const firstClinch = states.find((item) => item.match.clinched);
  return {
    fixtureSet,
    firstClinch,
    remainingAccepted: firstClinch ? states.filter((item) => item.holeNumber > firstClinch.holeNumber).length : 0,
    finalState: states.at(-1),
    pass: Boolean(firstClinch && states.slice(firstClinch.holeNumber).every((item) => item.result === "ACCEPTED" && item.match.result_winner === firstClinch.match.result_winner) && states.at(-1).match.scorecard_complete),
  };
}

async function fillFixture(fixtureSet, fixture, holes = 18) {
  let matchRevision = 0;
  for (let holeNumber = 1; holeNumber <= holes; holeNumber += 1) {
    const response = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber, team1: [4], team2: [5], expectedMatchRevision: matchRevision, mutationKey: `fill:${holeNumber}` }));
    if (!response.payload?.ok) throw new Error(`Fixture fill failed at hole ${holeNumber}: ${response.payload?.code}`);
    matchRevision = number(response.payload.match_revision);
  }
  return matchRevision;
}

async function runFinalization(authorizationMs) {
  const fixtureSet = `phase2-finalization-${Date.now()}`;
  const seeded = await seed(fixtureSet, (fixtures) => {
    const base = fixtures.find((fixture) => fixture.match_id === "2026-R3-9");
    return [base, {
      ...base,
      match_id: `${base.match_id}-PENDING`,
      unresolved_mutations: 1,
      scoring_snapshot: { ...base.scoring_snapshot, match_id: `${base.match_id}-PENDING` },
    }];
  });
  const fixture = seeded.fixtures[0];
  const pendingFixture = seeded.fixtures[1];
  let revision = await fillFixture(fixtureSet, fixture, 17);
  const directorAuth = { passport_verified: true, player_id: "DIRECTOR", role: "DIRECTOR" };
  const incomplete = await finalizeScoringAuthorityDryRun({ fixture_set: fixtureSet, match_id: fixture.match_id, expected_match_revision: revision, mutation_key: "finalize:incomplete", authorization: directorAuth });
  const eighteenth = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber: 18, team1: [4], team2: [5], expectedMatchRevision: revision, mutationKey: "fill:18" }));
  revision = number(eighteenth.payload?.match_revision);
  const stale = await finalizeScoringAuthorityDryRun({ fixture_set: fixtureSet, match_id: fixture.match_id, expected_match_revision: revision - 1, mutation_key: "finalize:stale", authorization: directorAuth });
  const pendingRevision = await fillFixture(fixtureSet, pendingFixture, 18);
  const pending = await finalizeScoringAuthorityDryRun({ fixture_set: fixtureSet, match_id: pendingFixture.match_id, expected_match_revision: pendingRevision, mutation_key: "finalize:pending", authorization: directorAuth });
  const race = await Promise.all([
    finalizeScoringAuthorityDryRun({ fixture_set: fixtureSet, match_id: fixture.match_id, expected_match_revision: revision, mutation_key: "finalize:race", authorization: directorAuth }),
    submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture, holeNumber: 18, team1: [3], team2: [5], expectedMatchRevision: revision, expectedHoleRevision: 1, mutationKey: "finalize:race-score" })),
  ]);
  const current = await scorecard(fixtureSet, fixture.match_id);
  const diagnostics = await readScoringAuthorityDryRun({ fixture_set: fixtureSet, mode: "DIAGNOSTICS" });
  return {
    fixtureSet,
    incomplete: incomplete.payload,
    stale: stale.payload,
    pending: pending.payload,
    race: race.map((item) => item.payload),
    finalStatus: current.match.status,
    diagnostics: diagnostics.payload?.data,
    pass: incomplete.payload?.code === "SCORECARD_INCOMPLETE" && stale.payload?.code === "MATCH_REVISION_CONFLICT" && pending.payload?.code === "UNRESOLVED_MUTATIONS" && race.filter((item) => item.payload?.ok).length === 1 && race.filter((item) => !item.payload?.ok).length === 1,
  };
}

async function runReads() {
  const modes = ["MATCH", "SCORECARD", "TOURNAMENT_SUMMARY", "LEADERBOARD_SUMMARY"];
  const results = {};
  for (const mode of modes) {
    const samples = [];
    for (let index = 0; index < 30; index += 1) {
      const response = await readScoringAuthorityDryRun({ fixture_set: MAIN_SET, match_id: "2026-R3-9", mode });
      samples.push(response.rpcTotalMs);
    }
    results[mode] = benchmarkSummary(samples);
  }
  return results;
}

async function runFailures() {
  const fixtureSet = `phase2-failures-${Date.now()}`;
  const seeded = await seed(fixtureSet, (fixtures) => {
    const base = fixtures.find((fixture) => fixture.match_id === "2026-R3-9");
    return [
      { ...base, match_id: "DRY-RUN-WRITABLE", scoring_snapshot: { ...base.scoring_snapshot, match_id: "DRY-RUN-WRITABLE", participants: { ...base.scoring_snapshot.participants } } },
      { ...base, match_id: "DRY-RUN-LOCKED", scoring_locked: true, scoring_snapshot: { ...base.scoring_snapshot, match_id: "DRY-RUN-LOCKED" } },
      { ...base, match_id: "DRY-RUN-FINAL", status: "FINAL", scoring_snapshot: { ...base.scoring_snapshot, match_id: "DRY-RUN-FINAL" } },
    ];
  });
  const [writable, locked, final] = seeded.fixtures;
  const invalidScorer = await submitScoringAuthorityDryRun({ ...dryRunMutationInput({ fixtureSet, fixture: writable, holeNumber: 1, team1: [4], team2: [5], mutationKey: "failure:scorer" }), authorization: { ...scoringDryRunAuthorization(writable), player_id: "NOT-A-PARTICIPANT" } });
  const invalidHole = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture: writable, holeNumber: 19, team1: [4], team2: [5], mutationKey: "failure:hole" }));
  const lockedResult = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture: locked, holeNumber: 1, team1: [4], team2: [5], mutationKey: "failure:locked" }));
  const finalResult = await submitScoringAuthorityDryRun(dryRunMutationInput({ fixtureSet, fixture: final, holeNumber: 1, team1: [4], team2: [5], mutationKey: "failure:final" }));
  const acceptedInput = dryRunMutationInput({ fixtureSet, fixture: writable, holeNumber: 1, team1: [4], team2: [5], mutationKey: "failure:idempotent" });
  const accepted = await submitScoringAuthorityDryRun(acceptedInput);
  const duplicate = await submitScoringAuthorityDryRun(acceptedInput);
  const mismatched = await submitScoringAuthorityDryRun({ ...acceptedInput, team_1_gross_scores: [6] });
  let timedOut = false;
  try { await scoringAuthorityDryRunTimeoutProbe(500, { timeoutMs: 50 }); } catch { timedOut = true; }
  let connectionInterrupted = false;
  try {
    await scoringAuthorityDryRunTimeoutProbe(1, { env: { ...process.env, SUPABASE_SCORING_MIRROR_URL: "https://127.0.0.1.invalid" }, timeoutMs: 100 });
  } catch { connectionInterrupted = true; }
  return {
    fixtureSet,
    invalidScorer: invalidScorer.payload?.code,
    invalidHole: invalidHole.payload?.code,
    locked: lockedResult.payload?.code,
    final: finalResult.payload?.code,
    accepted: accepted.payload?.code,
    duplicateIdempotent: Boolean(duplicate.payload?.idempotent),
    mismatchedKey: mismatched.payload?.code,
    transactionTimeout: timedOut,
    connectionInterrupted,
    pass: invalidScorer.payload?.code === "UNAUTHORIZED" && invalidHole.payload?.code === "INVALID_HOLE" && lockedResult.payload?.code === "SCORING_LOCKED" && finalResult.payload?.code === "MATCH_FINAL" && duplicate.payload?.idempotent && mismatched.payload?.code === "IDEMPOTENCY_CONFLICT" && timedOut && connectionInterrupted,
  };
}

async function runGoogleTiming(index, authorizationMs, gate) {
  const rows = await authoritativeFixtures();
  const match = rows.matches.find((item) => clean(item["Match ID"]) === "2026-R3-9");
  const holeNumber = 15 + (index % 3);
  const hole = rows.holes.find((item) => clean(item["Match ID"]) === "2026-R3-9" && number(item["Hole Number"]) === holeNumber);
  if (!match || !hole) throw new Error("A reversible Preview Google score is required.");
  const originalTeam1 = grossScoresFromCell(hole["Team 1 Gross Scores"]);
  const originalTeam2 = grossScoresFromCell(hole["Team 2 Gross Scores"]);
  const changedTeam1 = [...originalTeam1]; changedTeam1[0] = changedTeam1[0] >= 10 ? changedTeam1[0] - 1 : changedTeam1[0] + 1;
  const startedAt = Date.now();
  const changed = await withWorkbookWriteDiagnostics("phase-2-google-timing", () => saveLiveHoleScore("2026-R3-9", {
    holeNumber,
    team1GrossScores: changedTeam1,
    team2GrossScores: originalTeam2,
    expectedRevision: number(hole.Revision),
    expectedUpdatedAt: clean(match["Updated At"]),
    clientMutationId: `phase2-google-timing:${index}:${randomUUID()}`,
  }, ACTOR));
  const authoritativeMs = Date.now() - startedAt;
  const restored = await withWorkbookWriteDiagnostics("phase-2-google-timing-restore", () => saveLiveHoleScore("2026-R3-9", {
    holeNumber,
    team1GrossScores: originalTeam1,
    team2GrossScores: originalTeam2,
    expectedRevision: number(changed.result.hole.Revision),
    expectedUpdatedAt: clean(changed.result.updatedAt),
    clientMutationId: `phase2-google-timing:restore:${index}:${randomUUID()}`,
  }, ACTOR));
  return { index, authorizationMs, authoritativeMs, diagnostics: changed.diagnostics, restoredRevision: restored.result.hole.Revision, mirrorConfigured: Boolean(gate.enabled) };
}

async function runDiagnostics() {
  const diagnostics = await readScoringAuthorityDryRun({ fixture_set: MAIN_SET, mode: "DIAGNOSTICS" });
  return diagnostics.payload?.data;
}

export async function POST(request) {
  const context = await authorize(request);
  if (context.response) return context.response;
  const requestStartedAt = Date.now();
  try {
    const input = await request.json().catch(() => ({}));
    const action = clean(input.action);
    let result;
    const baselineMatch = action.match(/^baseline-(\d+)$/);
    const googleTimingMatch = action.match(/^google-timing-(\d+)$/);
    if (action === "seed") {
      const seeded = await seed();
      result = { fixtureSet: seeded.fixtureSet, matches: seeded.fixtures.length, round3: seeded.fixtures.filter((fixture) => fixture.round_number === 3).length, reset: seeded.reset };
    } else if (action === "equivalence") result = await runEquivalence(context.authorizationMs);
    else if (baselineMatch) result = await baselineSample(Number(baselineMatch[1]) - 1, context.authorizationMs);
    else if (action === "corrections") result = await runCorrections(context.authorizationMs);
    else if (action === "concurrency") result = await runConcurrency(context.authorizationMs);
    else if (action === "same-match") result = await runSameMatchConcurrency(context.authorizationMs);
    else if (action === "post-clinch") result = await runPostClinch(context.authorizationMs);
    else if (action === "finalization") result = await runFinalization(context.authorizationMs);
    else if (action === "reads") result = await runReads();
    else if (action === "failures") result = await runFailures();
    else if (googleTimingMatch) result = await runGoogleTiming(Number(googleTimingMatch[1]), context.authorizationMs, context.gate);
    else if (action === "diagnostics") result = await runDiagnostics();
    else return NextResponse.json({ error: "Unsupported dry-run action." }, { status: 400 });
    const responseStartedAt = Date.now();
    const payload = { ok: true, action, authorizationMs: context.authorizationMs, requestMs: Date.now() - requestStartedAt, responseConstructionMs: Date.now() - responseStartedAt, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Phase 2 dry run failed", { message: error?.message, diagnostics: error?.workbookDiagnostics || error?.shadowDiagnostics || {} });
    return NextResponse.json({ error: clean(error?.message || "Dry run failed."), diagnostics: error?.workbookDiagnostics || error?.shadowDiagnostics || {} }, { status: 503 });
  }
}
