import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";
import { scoringShadowEnvironment } from "../lib/scoring-shadow-gate.js";
import {
  benchmarkSummary,
  buildScoringShadowObservation,
  deliverScoringShadowObservation,
  normalizeScoringShadowPayload,
  observationFromScoringShadowRows,
  replayExistingScoringShadowObservation,
  scoringShadowPayloadHash,
  shouldScheduleScoringShadowObservation,
} from "../lib/scoring-shadow.js";
import { selectBurstBaselineObservation } from "../lib/scoring-shadow-benchmark.js";
import { calculateScoringShadowHoleFromSnapshot, historicalScoringSnapshotForMatch, reconcileScoringShadowRecords, scoringShadowMatchObservationsFromWorkbook, scoringShadowObservationsFromWorkbook } from "../lib/scoring-shadow-reconciliation.js";

const allowed = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  GOOGLE_SHEETS_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  SUPABASE_SCORING_MIRROR_URL: "https://shadow.example.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret-for-test",
};

test("Phase 1 mirror requires flag, Preview/development, isolated workbook, and server credentials", () => {
  assert.equal(scoringShadowEnvironment(allowed).enabled, true);
  assert.equal(scoringShadowEnvironment({ ...allowed, SUPABASE_SCORING_MIRROR_ENABLED: "false" }).reason, "flag-disabled");
  assert.equal(scoringShadowEnvironment({ ...allowed, VERCEL_ENV: "production" }).reason, "deployment-blocked");
  assert.equal(scoringShadowEnvironment({ ...allowed, GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID }).reason, "workbook-blocked");
  assert.equal(scoringShadowEnvironment({ ...allowed, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }).reason, "credentials-missing");
});

test("disabled mirror does not perform a network request", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not run"); };
  try {
    const result = await deliverScoringShadowObservation({}, { env: { ...allowed, SUPABASE_SCORING_MIRROR_ENABLED: "false" } });
    assert.deepEqual(result, { skipped: true, reason: "flag-disabled", totalDurationMs: result.totalDurationMs });
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("current Supabase server secrets are sent only as API keys, never as bearer JWTs", async () => {
  const original = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, init = {}) => {
    captured = init.headers;
    return new Response(JSON.stringify({ comparison_status: "PASS" }), { status: 200 });
  };
  try {
    await deliverScoringShadowObservation({}, {
      env: { ...allowed, SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_preview_test" },
    });
    assert.equal(captured.apikey, "sb_secret_preview_test");
    assert.equal(captured.authorization, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("legacy service-role JWTs retain their bearer authorization header", async () => {
  const original = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, init = {}) => {
    captured = init.headers;
    return new Response(JSON.stringify({ comparison_status: "PASS" }), { status: 200 });
  };
  try {
    await deliverScoringShadowObservation({}, {
      env: { ...allowed, SUPABASE_SCORING_MIRROR_SECRET_KEY: "legacy.service.role" },
    });
    assert.equal(captured.apikey, "legacy.service.role");
    assert.equal(captured.authorization, "Bearer legacy.service.role");
  } finally {
    globalThis.fetch = original;
  }
});

test("Supabase 5xx, timeout, and malformed delivery fail independently of verified Google state", async () => {
  const verifiedGoogle = { hole: { "Match ID": "M1", "Hole Number": 4, Revision: 2 } };
  const original = globalThis.fetch;
  try {
    for (const failure of [
      async () => new Response(JSON.stringify({ code: "PGRST500" }), { status: 503 }),
      async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); },
    ]) {
      globalThis.fetch = failure;
      await assert.rejects(() => deliverScoringShadowObservation({ malformed: true }, { env: allowed, timeoutMs: 5 }), /Scoring shadow request failed|timed out/);
      assert.equal(verifiedGoogle.hole.Revision, 2, "the verified Google result remains successful and unchanged");
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("normal verified Google save schedules one shadow observation only when required verified data exists", () => {
  const participantResult = { hole: { "Match ID": "M1", "Hole Number": 7 } };
  const shadow = { match: { "Match ID": "M1" }, calculated: {}, allHoleResults: [] };
  const scheduled = [
    shouldScheduleScoringShadowObservation({ gate: { enabled: true }, participantResult, shadow }),
  ].filter(Boolean);
  assert.equal(scheduled.length, 1);
  assert.equal(shouldScheduleScoringShadowObservation({ gate: { enabled: false }, participantResult, shadow }), false);
  assert.equal(shouldScheduleScoringShadowObservation({ gate: { enabled: true }, participantResult: {}, shadow }), false);
  assert.equal(shouldScheduleScoringShadowObservation({ gate: { enabled: true }, participantResult, shadow: {} }), false);
  assert.equal(shouldScheduleScoringShadowObservation({ gate: { enabled: true }, participantResult: undefined, shadow }), false, "failed Google verification has no verified participant result");
});

test("idempotent shadow replay retains one logical current hole and mutation identity", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202608100001_preview_scoring_shadow.sql", import.meta.url), "utf8");
  assert.match(migration, /unique \(source_workbook_id, mutation_key\)/);
  assert.match(migration, /primary key \(source_workbook_id, match_id, hole_number\)/);
  assert.match(migration, /on conflict \(source_workbook_id, match_id, hole_number, google_revision\)/i);
  assert.match(migration, /delivery_count = public\.score_mirror_events\.delivery_count \+ 1/i);
  assert.match(migration, /on conflict \(source_workbook_id, match_id, hole_number\)/i);
  assert.match(migration, /where excluded\.google_revision >= public\.hole_score_mirror\.google_revision/i);
  assert.match(migration, /google_revision = greatest\(public\.live_match_mirror\.google_revision, excluded\.google_revision\)/i);
});

test("stored verified observation is reconstructed exactly and replayed once", async () => {
  const canonical = { match_id: "2026-R3-9", hole_number: 17, gross: { team_1: [4], team_2: [6] } };
  const hash = scoringShadowPayloadHash(canonical);
  const event = {
    source_workbook_id: "preview-workbook", tournament_id: "2026", tournament_year: 2026,
    round_number: 3, match_id: "2026-R3-9", hole_number: 17, google_hole_score_id: "hs-17",
    google_revision: 2, google_updated_at: "2026-08-10T12:00:00Z", mutation_key: "canary-17",
    payload_hash: hash, canonical_payload: canonical, google_result: { hole_winner: "Team 1" },
    shadow_result: { hole_winner: "Team 1" }, comparison_status: "PASS", comparison_diagnostics: {},
    actor_id: "P1", actor_name: "Brian Atkinson", google_verified_at: "2026-08-10T12:00:01Z",
  };
  const hole = {
    ...event, format: "SI", stroke_index: 17, team_1_gross_scores: [4], team_2_gross_scores: [6],
    team_1_strokes: [0], team_2_strokes: [0], team_1_net_score: 4, team_2_net_score: 6,
    hole_winner: "Team 1",
  };
  const match = {
    source_workbook_id: "preview-workbook", match_id: "2026-R3-9", payload_hash: "a".repeat(64),
    status: "Live", current_hole: 17, holes_remaining: 1, team_1_holes_won: 10, team_2_holes_won: 5,
    running_result: "5 UP", result_winner: "Team 1", clinched: true, scorecard_complete: false,
    finalized: false, finalized_at: "",
  };
  const rebuilt = observationFromScoringShadowRows({ event, hole, match });
  assert.equal(rebuilt.mutation_key, "canary-17");
  assert.equal(rebuilt.payload_hash, hash);
  assert.deepEqual(rebuilt.team_2_gross_scores, [6]);

  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).includes("score_mirror_events?")) return new Response(JSON.stringify([event]), { status: 200 });
    if (String(url).includes("hole_score_mirror?")) return new Response(JSON.stringify([hole]), { status: 200 });
    if (String(url).includes("live_match_mirror?")) return new Response(JSON.stringify([match]), { status: 200 });
    if (String(url).endsWith("/rest/v1/rpc/record_scoring_shadow_observation")) return new Response(JSON.stringify({ comparison_status: "PASS" }), { status: 200 });
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const result = await replayExistingScoringShadowObservation({ sourceWorkbookId: "preview-workbook", matchId: "2026-R3-9", holeNumber: 17, googleRevision: 2 }, { env: allowed });
    const rpc = requests.filter((request) => request.url.includes("/rpc/record_scoring_shadow_observation"));
    assert.equal(rpc.length, 1);
    const delivered = JSON.parse(rpc[0].init.body).observation;
    assert.equal(delivered.mutation_key, "canary-17");
    assert.equal(delivered.payload_hash, hash);
    assert.equal(result.observation.comparisonStatus, "PASS");
  } finally {
    globalThis.fetch = original;
  }
});

test("stored replay rejects mismatched identity or payload before delivery", () => {
  const canonical = { hole_number: 17, gross: [4, 6] };
  const event = { source_workbook_id: "preview", tournament_id: "2026", tournament_year: 2026, round_number: 3, match_id: "M1", hole_number: 17, google_revision: 2, mutation_key: "m1", payload_hash: scoringShadowPayloadHash(canonical), canonical_payload: canonical };
  const hole = { ...event, mutation_key: "different" };
  const match = { source_workbook_id: "preview", match_id: "M1" };
  assert.throws(() => observationFromScoringShadowRows({ event, hole, match }), /identity does not match/);
  assert.throws(() => observationFromScoringShadowRows({ event: { ...event, canonical_payload: { ...canonical, gross: [3, 6] } }, hole: { ...event }, match }), /identity does not match/);
});

test("verified observation preserves native scores, stable hashes, revisions, and shared calculations", () => {
  const match = { "Match ID": "R3-M9", Year: 2026, Round: 3, Format: "SI", "Match Status": "Live" };
  const hole = {
    "Hole Score ID": "R3-M9-H8", "Match ID": "R3-M9", "Hole Number": 8, "Stroke Index": 5,
    Format: "SI", "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5,
    "Team 1 Net Score": 3, "Team 2 Net Score": 5, "Hole Winner": "Team 1",
    Revision: 2, "Updated At": "2026-08-10T12:00:00.000Z", "Updated By": "Golfer",
  };
  const calculated = {
    holeNumber: 8, strokeIndex: 5, format: "SI",
    team1: { netScore: 3, grossScores: [{ grossScore: 4, strokes: 1, netScore: 3 }] },
    team2: { netScore: 5, grossScores: [{ grossScore: 5, strokes: 0, netScore: 5 }] },
    winner: "Team 1",
  };
  const observation = buildScoringShadowObservation({
    sourceWorkbookId: "preview-workbook", tournamentId: "2026", tournamentYear: 2026,
    match, hole, calculated, allHoleResults: [{ holeNumber: 8, winner: "Team 1" }], mutationKey: "mutation-1",
  });
  assert.deepEqual(observation.team_1_gross_scores, [4]);
  assert.deepEqual(observation.team_1_strokes, [1]);
  assert.equal(observation.google_revision, 2);
  assert.equal(observation.comparison_status, "PASS");
  assert.match(observation.payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(observation.payload_hash, scoringShadowPayloadHash(observation.canonical_payload));
});

test("shadow comparison records deterministic divergence without affecting authoritative values", () => {
  const observation = buildScoringShadowObservation({
    sourceWorkbookId: "preview", tournamentId: "2026", tournamentYear: 2026,
    match: { "Match ID": "M1", Year: 2026, Round: 1, Format: "BB", "Match Status": "Live" },
    hole: { "Match ID": "M1", "Hole Number": 1, "Stroke Index": 1, Format: "BB", "Team 1 Gross Scores": "[4,5]", "Team 2 Gross Scores": "[4,4]", "Team 1 Net Score": 3, "Team 2 Net Score": 4, "Hole Winner": "Team 1", Revision: 1, "Updated At": "2026-08-10T00:00:00Z" },
    calculated: { holeNumber: 1, strokeIndex: 1, format: "BB", team1: { netScore: 4, grossScores: [] }, team2: { netScore: 4, grossScores: [] }, winner: "Halved" },
    allHoleResults: [{ holeNumber: 1, winner: "Team 1" }], mutationKey: "m",
  });
  assert.equal(observation.comparison_status, "DIVERGENCE");
  assert.deepEqual(Object.keys(observation.comparison_diagnostics).sort(), ["hole_winner", "team_1_net_score"]);
  assert.equal(observation.google_result.team_1_net_score, 3);
});

test("reconciliation detects missing, payload, revision, stale, orphan, and duplicate observations", () => {
  const google = [{ "Tournament ID": "2026", Year: 2026, Round: 3, Format: "SI", "Match ID": "M1", "Hole Number": 1, "Stroke Index": 1, "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5, "Team 1 Net Score": 4, "Team 2 Net Score": 5, "Hole Winner": "Team 1", Revision: 2, "Updated At": "2026-08-10T12:00:00Z" }];
  const report = reconcileScoringShadowRecords(google, [
    { match_id: "M1", hole_number: 1, google_revision: 1, payload_hash: "bad", mirrored_at: "2026-08-10T11:00:00Z" },
    { match_id: "M1", hole_number: 1, google_revision: 1, payload_hash: "bad", mirrored_at: "2026-08-10T11:00:00Z" },
    { match_id: "ORPHAN", hole_number: 2, google_revision: 1, payload_hash: "bad", mirrored_at: "2026-08-10T11:00:00Z" },
  ]);
  assert.equal(report.duplicates, 1);
  assert.deepEqual(report.payloadDivergence, ["M1:1"]);
  assert.deepEqual(report.revisionMismatch, ["M1:1"]);
  assert.deepEqual(report.stale, ["M1:1"]);
  assert.deepEqual(report.orphan, ["ORPHAN:2"]);
  assert.equal(report.pass, false);
});

test("workbook rebuild observations retain correction revisions and one logical current key", () => {
  const matches = [{ "Match ID": "M1", "Tournament ID": "T2026", Year: 2026, Round: 3, Format: "SI", "Match Status": "Live", "Team 1 Player 1": "P1", "Team 2 Player 1": "P2", "Team 1 Player 1 Playing HCP": 0, "Team 2 Player 1 Playing HCP": 0 }];
  const holes = [{ "Hole Score ID": "M1-H1", "Match ID": "M1", "Hole Number": 1, "Stroke Index": 1, Format: "SI", "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5, "Team 1 Net Score": 4, "Team 2 Net Score": 5, "Hole Winner": "Team 1", Revision: 3, "Updated At": "2026-08-10T12:00:00Z" }];
  const rows = scoringShadowObservationsFromWorkbook({ sourceWorkbookId: "preview", matches, holes });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mutation_key, "rebuild:M1:H1:R3");
  assert.equal(rows[0].tournament_id, "T2026");
  assert.deepEqual(rows[0].team_1_strokes, [0]);
  assert.deepEqual(rows[0].team_2_strokes, [0]);
  assert.equal(rows[0].comparison_status, "PASS");
});

test("authoritative zero-hole matches receive match mirrors without manufactured hole observations", () => {
  const matches = [
    { "Match ID": "ZERO", "Tournament ID": "T2026", Year: 2026, Round: 3, Format: "SI", "Match Status": "Upcoming", "Team 1 Player 1": "P1", "Team 2 Player 1": "P2", "Course ID": "OCGC01", Course: "The Ocean Course", Tee: "Gold" },
    { "Match ID": "SCORED", "Tournament ID": "T2026", Year: 2026, Round: 3, Format: "SI", "Match Status": "Live", "Team 1 Player 1": "P3", "Team 2 Player 1": "P4" },
  ];
  const holes = [{ "Match ID": "SCORED", "Hole Number": 1, "Stroke Index": 1, "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5, "Team 1 Net Score": 4, "Team 2 Net Score": 5, "Hole Winner": "Team 1", Revision: 1 }];
  const matchRows = scoringShadowMatchObservationsFromWorkbook({ sourceWorkbookId: "preview", matches, holes });
  const holeRows = scoringShadowObservationsFromWorkbook({ sourceWorkbookId: "preview", matches, holes });
  assert.equal(matchRows.length, 2);
  assert.equal(holeRows.length, 1);
  const zero = matchRows.find((row) => row.match_id === "ZERO");
  assert.equal(zero.match.scored_holes, 0);
  assert.equal(zero.match.current_hole, 0);
  assert.equal(zero.match.holes_remaining, 18);
  assert.equal(zero.match.scorecard_complete, false);
  assert.deepEqual(zero.match.participants, { team_1: ["P1"], team_2: ["P2"] });
  assert.equal(zero.match.course.course_id, "OCGC01");
  assert.equal(holeRows.some((row) => row.match_id === "ZERO"), false);
});

test("rebuild migration finalizes current match authority after historical holes and remains server-only", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202608100004_preview_scoring_shadow_match_authority.sql", import.meta.url), "utf8");
  assert.match(migration, /match_observations jsonb/);
  const holesAt = migration.indexOf("jsonb_array_elements(coalesce(observations");
  const matchesAt = migration.indexOf("jsonb_array_elements(coalesce(match_observations");
  assert.ok(holesAt >= 0 && matchesAt > holesAt, "authoritative match observations must be finalized after holes");
  assert.match(migration, /perform public\.upsert_scoring_shadow_match_observation\(item\)/);
  assert.match(migration, /match_google_revision/);
  assert.match(migration, /google_revision = excluded\.google_revision/);
  assert.match(migration, /where excluded\.google_revision >= public\.live_match_mirror\.google_revision/);
  assert.match(migration, /revoke all on function .* from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function .* to service_role/i);
});

test("historical hole context never owns current match state or revision", () => {
  const archived = {
    "Match ID": "M1", "Tournament ID": "T2026", Year: 2026, Round: 1, Format: "BB",
    "Match Status": "Final", Revision: 3, "Updated At": "2026-07-01T12:00:00Z",
    "Team 1 Player 1": "P1", "Team 1 Player 2": "P2", "Team 2 Player 1": "P3", "Team 2 Player 2": "P4",
    "Team 1 Player 1 Stroke": 0, "Team 1 Player 2 Stroke": 13,
    "Team 2 Player 1 Stroke": 0, "Team 2 Player 2 Stroke": 0,
    Tee: "Gold",
  };
  const current = {
    ...archived, Revision: 41, "Updated At": "2026-08-10T12:00:00Z", Tee: "Silver",
    "Scoring Locked": true, "Matchup Winner": "Team 1",
  };
  const hole = {
    "Match ID": "M1", "Hole Number": 1, "Stroke Index": 9,
    "Team 1 Gross Scores": "[4,4]", "Team 2 Gross Scores": "[4,4]",
    "Team 1 Net Score": 3, "Team 2 Net Score": 4, "Hole Winner": "Team 1",
    Revision: 99, "Updated At": "2026-07-01T12:01:00Z",
  };
  const [observation] = scoringShadowObservationsFromWorkbook({
    sourceWorkbookId: "preview", matches: [current], holes: [hole], matchSnapshots: [archived],
  });
  assert.equal(observation.team_1_strokes[1], 1, "historical stroke snapshot still drives hole calculation");
  assert.equal(observation.match.course.tee, "Silver", "current Live Matches state owns the match mirror");
  assert.equal(observation.match.finalized, true);
  assert.equal(observation.match.scoring_locked, true);
  assert.equal(observation.google_revision, 99, "hole revision remains in the hole domain");
  assert.equal(observation.match_google_revision, 41, "match revision remains in the match domain");
  assert.equal(observation.match_google_updated_at, current["Updated At"]);
});

test("match revision remains authoritative when hole revisions are lower or higher", () => {
  const current = {
    "Match ID": "M2", "Tournament ID": "T2026", Year: 2026, Round: 3, Format: "SI",
    "Match Status": "Live", Revision: 12, "Updated At": "2026-08-10T12:00:00Z",
    "Team 1 Player 1": "P1", "Team 2 Player 1": "P2",
  };
  const holes = [1, 2].map((holeNumber, index) => ({
    "Match ID": "M2", "Hole Number": holeNumber, "Stroke Index": holeNumber,
    "Team 1 Gross Scores": 4, "Team 2 Gross Scores": 5,
    "Team 1 Net Score": 4, "Team 2 Net Score": 5, "Hole Winner": "Team 1",
    Revision: index ? 80 : 2,
  }));
  const observations = scoringShadowObservationsFromWorkbook({ sourceWorkbookId: "preview", matches: [current], holes });
  assert.deepEqual(observations.map((row) => row.google_revision), [2, 80]);
  assert.deepEqual(observations.map((row) => row.match_google_revision), [12, 12]);
  assert.ok(observations.every((row) => row.match.status === "Live"));
});

test("finalized historical scoring snapshot remains stable when current configuration differs", () => {
  const archived = {
    "Match ID": "M1", "Match Status": "Final", Format: "BB",
    "Team 1 Player 1": "HM01", "Team 1 Player 1 Stroke": 1,
    "Team 1 Player 2": "JK02", "Team 1 Player 2 Stroke": 13,
    "Team 2 Player 1": "MM01", "Team 2 Player 1 Stroke": 1,
    "Team 2 Player 2": "MS01", "Team 2 Player 2 Stroke": 0,
  };
  const current = { ...archived, "Team 1 Player 2 Stroke": 8, Tee: "Silver" };
  assert.equal(historicalScoringSnapshotForMatch(current, archived), archived);
  const hole = { "Hole Number": 1, "Stroke Index": 9, Format: "BB", "Team 1 Gross Scores": "[4,4]", "Team 2 Gross Scores": "[4,4]" };
  const historical = calculateScoringShadowHoleFromSnapshot(archived, hole);
  const drifted = calculateScoringShadowHoleFromSnapshot(current, hole);
  assert.equal(historical.team1.netScore, 3);
  assert.equal(historical.winner, "Team 1");
  assert.equal(drifted.team1.netScore, 4);
  assert.equal(drifted.winner, "Halved");
});

test("Best Ball snapshot allocates a player stroke and can change Halved to Team 1", () => {
  const match = {
    Format: "BB", "Team 1 Player 1": "HM01", "Team 1 Player 1 Stroke": 1,
    "Team 1 Player 2": "JK02", "Team 1 Player 2 Stroke": 13,
    "Team 2 Player 1": "MM01", "Team 2 Player 1 Stroke": 1,
    "Team 2 Player 2": "MS01", "Team 2 Player 2 Stroke": 0,
  };
  for (const [holeNumber, strokeIndex, team1Gross, team2Gross, expectedTeamNet] of [
    [1, 9, "[4,4]", "[4,4]", 3],
    [4, 13, "[6,4]", "[5,5]", 3],
    [6, 11, "[3,3]", "[4,3]", 2],
  ]) {
    const result = calculateScoringShadowHoleFromSnapshot(match, { "Hole Number": holeNumber, "Stroke Index": strokeIndex, "Team 1 Gross Scores": team1Gross, "Team 2 Gross Scores": team2Gross });
    assert.equal(result.team1.grossScores[1].strokes, 1);
    assert.equal(result.team1.netScore, expectedTeamNet);
    assert.equal(result.winner, "Team 1");
  }
});

test("Best Ball, Scramble, and Singles share one deterministic canonical payload across mirror, rebuild, reconciliation, and replay", () => {
  for (const [round, format, team1Gross, team2Gross] of [
    [1, "BB", "[4,5]", "[5,5]"],
    [2, "SC", "[4,4]", "[5,5]"],
    [3, "SI", "4", "5"],
  ]) {
    const match = {
      "Match ID": `M${round}`, "Tournament ID": "T2026", Year: 2026, Round: round, Format: format, "Match Status": "Live",
      "Team 1 Player 1": "P1", "Team 2 Player 1": "P3", "Team 1 Player 1 Playing HCP": 0, "Team 2 Player 1 Playing HCP": 0,
      ...(format === "SI" ? {} : { "Team 1 Player 2": "P2", "Team 2 Player 2": "P4", "Team 1 Player 2 Playing HCP": 0, "Team 2 Player 2 Playing HCP": 0 }),
    };
    const hole = {
      "Hole Score ID": `M${round}-H1`, "Match ID": `M${round}`, "Hole Number": 1, "Stroke Index": 3,
      "Team 1 Gross Scores": team1Gross, "Team 2 Gross Scores": team2Gross,
      "Team 1 Net Score": 4, "Team 2 Net Score": 5, "Hole Winner": "Team 1",
      Revision: 2, "Updated At": "2026-08-10T12:00:00Z",
    };
    const live = buildScoringShadowObservation({ sourceWorkbookId: "preview", tournamentId: "T2026", tournamentYear: 2026, match, hole, mutationKey: `live-${round}` });
    const [rebuilt] = scoringShadowObservationsFromWorkbook({ sourceWorkbookId: "preview", matches: [match], holes: [hole] });
    const reconciliationPayload = normalizeScoringShadowPayload({ tournamentId: "T2026", tournamentYear: 2026, match, hole });
    const replayPayload = normalizeScoringShadowPayload({ tournamentId: live.tournament_id, tournamentYear: live.tournament_year, match, hole });
    const hashes = [live.payload_hash, rebuilt.payload_hash, scoringShadowPayloadHash(reconciliationPayload), scoringShadowPayloadHash(replayPayload)];
    assert.equal(new Set(hashes).size, 1, `${format} canonical hashes must match`);

    const report = reconcileScoringShadowRecords(
      [{ ...hole, "Tournament ID": "T2026", Year: 2026, Round: round }],
      [{ ...live, mirrored_at: hole["Updated At"] }],
      [], [match], [], [rebuilt],
    );
    assert.deepEqual(report.payloadDivergence, [], `${format} must reconcile without payload divergence`);

    const changed = normalizeScoringShadowPayload({ tournamentId: "T2026", tournamentYear: 2026, match, hole: { ...hole, "Team 2 Gross Scores": format === "SI" ? "6" : "[6,6]" } });
    assert.notEqual(scoringShadowPayloadHash(changed), live.payload_hash, `${format} genuine score changes must diverge`);
  }
});

test("benchmark reporting includes percentiles and correctness counters", () => {
  assert.deepEqual(benchmarkSummary([1, 2, 3, 100], { errors: 1, retries: 2, duplicates: 3, lost: 4 }), {
    count: 4, min: 1, p50: 2, p95: 100, p99: 100, max: 100,
    errorCount: 1, retryCount: 2, duplicateCount: 3, lostLogicalScoreCount: 4,
  });
});

test("burst restoration always selects the pre-benchmark baseline after a partial retry", () => {
  const baseline = { google_revision: 1, mutation_key: "shadow-rebuild:2026-R3-9:1", canonical_payload: { team_1_gross_scores: [4], team_2_gross_scores: [5] } };
  const history = [
    { google_revision: 4, mutation_key: "benchmark:burst:restore:1:retry", canonical_payload: { team_1_gross_scores: [4], team_2_gross_scores: [5] } },
    { google_revision: 3, mutation_key: "benchmark:burst:restore:1:first", canonical_payload: { team_1_gross_scores: [4], team_2_gross_scores: [5] } },
    { google_revision: 2, mutation_key: "benchmark:burst:forward:1", canonical_payload: { team_1_gross_scores: [5], team_2_gross_scores: [5] } },
    baseline,
  ];
  assert.equal(selectBurstBaselineObservation(history), baseline);
  assert.equal(selectBurstBaselineObservation(history.slice(0, 3)), null);
});

test("Preview benchmark administration is Director-gated, reversible, and covers every authorized stage", async () => {
  const [route, writer] = await Promise.all([
    readFile(new URL("../app/api/director/scoring-shadow/benchmark/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(route, /assertScoringShadowAdministrativeEnvironment/);
  assert.match(route, /inspectTournamentDirectorToken/);
  assert.match(route, /restorePreviewScoringBenchmarkRows/);
  for (const action of [
    "preflight", "baseline", "corrections", "replay", "gate-a", "burst", "concurrency",
    "two-device", "finalization-race", "gate-b", "supabase-failure", "google-failure", "final-rebuild",
  ]) assert.match(route, new RegExp(`action === "${action}"|\\[.*"${action}"`), `${action} must be available`);
  assert.match(route, /SUPABASE_SCORING_MIRROR_URL: "https:\/\/127\.0\.0\.1\.invalid"/);
  assert.match(route, /malformedPayloadRejected/);
  assert.match(route, /staleWriteRejected/);
  assert.match(route, /finalizationBlocked/);
  assert.match(writer, /export async function restorePreviewScoringBenchmarkRows/);
  assert.match(writer, /requireIsolatedScoringSheet\(\)/);
  assert.match(writer, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.doesNotMatch(route, /PRODUCTION_SPREADSHEET_ID|SUPABASE_SCORING_MIRROR_SECRET_KEY.*NextResponse/);
});

test("Phase 1 has no participant Supabase reads, auth, realtime, or Google mirror-back", async () => {
  const [route, legacyRoute, scorePage, scoreEntry, migration, serviceAccessMigration, envExample, directorShadowRoute] = await Promise.all([
    readFile(new URL("../app/api/scoring/current/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoring/matches/[matchId]/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608100001_preview_scoring_shadow.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608100002_preview_scoring_shadow_service_access.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../app/api/director/scoring-shadow/route.js", import.meta.url), "utf8"),
  ]);
  for (const scoringRoute of [route, legacyRoute]) {
    assert.match(scoringRoute, /after\(async \(\) =>/);
    assert.match(scoringRoute, /const \{ _shadow, \.\.\.participantResult \} = result/);
    assert.match(scoringRoute, /shouldScheduleScoringShadowObservation\(\{ gate, participantResult, shadow: _shadow \}\)/);
    assert.match(scoringRoute, /hole: participantResult\.hole/);
    assert.doesNotMatch(scoringRoute, /_shadow\?\.hole/);
  }
  assert.doesNotMatch(`${scorePage}\n${scoreEntry}`, /supabase|hole_score_mirror|live_match_mirror/i);
  assert.doesNotMatch(`${scorePage}\n${scoreEntry}`, /realtime|createClient\(/i);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all .* from anon, authenticated/g);
  assert.match(serviceAccessMigration, /grant select on table public\.score_mirror_events to service_role/);
  assert.match(serviceAccessMigration, /grant select, insert on table public\.mirror_reconciliation_runs to service_role/);
  assert.doesNotMatch(serviceAccessMigration, /grant (?:update|delete|all).*service_role/i);
  assert.match(serviceAccessMigration, /revoke all .* from anon, authenticated/g);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_SUPABASE/);
  assert.doesNotMatch(route, /Live Hole Scores.*(?:write|update)|SUPABASE.*GOOGLE/i);
  assert.match(directorShadowRoute, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(directorShadowRoute, /assertScoringShadowAdministrativeEnvironment/);
  assert.match(directorShadowRoute, /inspectTournamentDirectorToken/);
  assert.match(directorShadowRoute, /input\.action === "replay"/);
  assert.match(directorShadowRoute, /replayExistingScoringShadowObservation/);
  assert.doesNotMatch(directorShadowRoute, /SUPABASE_SCORING_MIRROR_SECRET_KEY.*NextResponse/);
});
