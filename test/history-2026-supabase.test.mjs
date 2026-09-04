import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHistory2026Adapter,
  history2026TeamPageModel,
  history2026SourceFingerprint,
  sanitizeHistory2026PublicView,
  selectCurrentFinalizedSnapshots,
} from "../lib/history-2026-adapter.js";
import {
  history2026ReadEnvironment,
  isSupabaseHistory2026,
  requireHistory2026ReadSource,
} from "../lib/history-2026-read-source.js";
import {
  HOLMAN_2026_R3_4_GROSS,
  JACK_KEFFLER_2026_R1_6_GROSS,
  MEMO_2026_R3_4_GROSS,
  cloneHistoryFixture,
  makeGuideProjection,
  makeHistory2026Aggregate,
  makeHistoryMatch,
} from "./fixtures/history-2026.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewEnv = {
  VERCEL_ENV: "preview",
  HISTORY_2026_READ_SOURCE: "supabase",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only-secret",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
};

const matchId = (record) => record?.match?.match_id || record?.match_id;
const scorecardsFor = (view, id) => view.analytics.scorecards.filter((scorecard) => scorecard.matchId === id);
const TURTLE_POINT_GOLD_HOLES = Object.freeze([
  [1, 4, 9, 372], [2, 5, 5, 501], [3, 4, 15, 369], [4, 3, 13, 189],
  [5, 5, 7, 510], [6, 4, 11, 375], [7, 3, 17, 158], [8, 4, 1, 444],
  [9, 4, 3, 376], [10, 5, 12, 512], [11, 4, 6, 362], [12, 4, 4, 422],
  [13, 5, 10, 503], [14, 3, 16, 160], [15, 4, 8, 342], [16, 3, 14, 164],
  [17, 4, 18, 348], [18, 4, 2, 403],
].map(([hole_number, par, stroke_index, yardage]) => Object.freeze({
  hole_number, par, stroke_index, yardage,
})));

test("2026 History source is explicitly Preview-only, year-bound, and Production-hard-blocked", () => {
  const preview = history2026ReadEnvironment(previewEnv);
  assert.equal(preview.resolved, "supabase");
  assert.equal(preview.previewDeployment, true);
  assert.equal(preview.productionBlocked, false);
  assert.equal(requireHistory2026ReadSource(previewEnv).resolved, "supabase");
  assert.equal(isSupabaseHistory2026("2026", previewEnv), true);
  assert.equal(isSupabaseHistory2026(2025, previewEnv), false);

  const production = history2026ReadEnvironment({ ...previewEnv, VERCEL_ENV: "production" });
  assert.equal(production.resolved, "google");
  assert.equal(production.productionBlocked, true);
  assert.equal(isSupabaseHistory2026(2026, { ...previewEnv, VERCEL_ENV: "production" }), false);

  const fixtureYear = history2026ReadEnvironment({ ...previewEnv, HISTORY_2026_TOURNAMENT_ID: "3026" });
  assert.notEqual(fixtureYear.resolved, "supabase");
  assert.equal(isSupabaseHistory2026(2026, { ...previewEnv, HISTORY_2026_TOURNAMENT_ID: "3026" }), true,
    "an invalid cutover must stay on the isolated 2026 branch and fail closed");
  assert.equal(isSupabaseHistory2026(3026, previewEnv), false);
  assert.throws(
    () => requireHistory2026ReadSource({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }),
    /unavailable|credentials|blocked/i
  );
  assert.throws(
    () => requireHistory2026ReadSource({ ...previewEnv, SUPABASE_SCORING_MIRROR_ENABLED: "false" }),
    /unavailable|disabled|blocked/i
  );
  assert.throws(
    () => requireHistory2026ReadSource({ ...previewEnv, SUPABASE_SCORING_MIRROR_URL: "https://wrong.supabase.co" }),
    /unavailable|project|blocked/i
  );
  for (const hostileUrl of [
    "https://idgigvjjqkfbqjeredpb.evil.example",
    "https://idgigvjjqkfbqjeredpb.supabase.co.evil.example",
    "http://idgigvjjqkfbqjeredpb.supabase.co",
    "ftp://idgigvjjqkfbqjeredpb.supabase.co",
    "https://user:password@idgigvjjqkfbqjeredpb.supabase.co",
    "https://idgigvjjqkfbqjeredpb.supabase.co/rest",
  ]) {
    assert.throws(
      () => requireHistory2026ReadSource({ ...previewEnv, SUPABASE_SCORING_MIRROR_URL: hostileUrl }),
      /unavailable|project|blocked/i,
      `unapproved Supabase origin must fail closed: ${hostileUrl}`
    );
  }
  assert.equal(isSupabaseHistory2026(2026, { ...previewEnv, HISTORY_2026_READ_SOURCE: "invalid" }), true,
    "an invalid source token must not silently enter legacy Google");
});

test("current finalized-snapshot selection is coherent, unique, and excludes audit revisions", () => {
  const aggregate = makeHistory2026Aggregate();
  const selected = selectCurrentFinalizedSnapshots(aggregate.matches, aggregate.finalized_snapshots);
  assert.equal(selected.size, 17);
  assert.deepEqual([...selected.keys()].sort(), aggregate.finalized_snapshots.map(matchId).sort());

  const withAuditHistory = cloneHistoryFixture(aggregate.finalized_snapshots);
  const current = withAuditHistory.find((snapshot) => snapshot.match_id === "2026-R1-6");
  withAuditHistory.push({
    ...cloneHistoryFixture(current),
    snapshot_id: "2026-R1-6:FINAL:0",
    snapshot_revision: 0,
    match_revision: current.match_revision - 1,
    state: "SUPERSEDED",
  });
  const selectedWithAudit = selectCurrentFinalizedSnapshots(aggregate.matches, withAuditHistory);
  assert.equal(selectedWithAudit.get("2026-R1-6").snapshot_revision, 1);

  for (const state of ["INVALIDATED", "SUPERSEDED"]) {
    const missingCurrent = cloneHistoryFixture(aggregate.finalized_snapshots);
    missingCurrent.find((snapshot) => snapshot.match_id === "2026-R3-4").state = state;
    assert.throws(
      () => selectCurrentFinalizedSnapshots(aggregate.matches, missingCurrent),
      /current|finalized|snapshot/i
    );
  }

  const duplicate = cloneHistoryFixture(aggregate.finalized_snapshots);
  duplicate.push({
    ...cloneHistoryFixture(duplicate.find((snapshot) => snapshot.match_id === "2026-R3-4")),
    snapshot_id: "2026-R3-4:FINAL:DUPLICATE",
    snapshot_revision: 99,
  });
  assert.throws(
    () => selectCurrentFinalizedSnapshots(aggregate.matches, duplicate),
    /duplicate|multiple|current/i
  );

  const incoherent = cloneHistoryFixture(aggregate.finalized_snapshots);
  incoherent.find((snapshot) => snapshot.match_id === "2026-R3-4").match_revision += 1;
  assert.throws(
    () => selectCurrentFinalizedSnapshots(aggregate.matches, incoherent),
    /revision|coherent|snapshot/i
  );
});

test("LIVE matches cannot carry a current finalized snapshot", () => {
  const aggregate = makeHistory2026Aggregate();
  const live = aggregate.matches.find((record) => record.match.status === "LIVE");
  const finalizedFixture = makeHistoryMatch({ roundNumber: 3, matchNumber: 6, status: "FINAL" }).snapshot;
  finalizedFixture.match_revision = live.match.match_revision;
  finalizedFixture.payload.match.match_revision = live.match.match_revision;
  assert.throws(
    () => selectCurrentFinalizedSnapshots(aggregate.matches, [...aggregate.finalized_snapshots, finalizedFixture]),
    /live|non-final|current|snapshot/i
  );
});

test("finalized snapshots fail closed on noncanonical identities and scoring context", () => {
  const cases = [
    {
      label: "player",
      mutate: (snapshot) => { snapshot.payload.participants[0].player_id = "WRONG01"; },
      pattern: /participant|identity|configuration/i,
    },
    {
      label: "team",
      mutate: (snapshot) => { snapshot.payload.teams[0].team_id = "WRONGTEAM"; },
      pattern: /team id|mapping|incoherent/i,
    },
    {
      label: "course",
      mutate: (snapshot) => { snapshot.payload.course.course_id = "WRONGCOURSE"; },
      pattern: /course|scoring|configuration/i,
    },
    {
      label: "tee",
      mutate: (snapshot) => { snapshot.payload.course.tee = "Wrong Tee"; },
      pattern: /course|scoring|configuration/i,
    },
    {
      label: "configuration fingerprint",
      mutate: (snapshot) => { snapshot.payload.course.configuration_fingerprint = "f".repeat(64); },
      pattern: /course|scoring|configuration/i,
    },
    {
      label: "hole configuration",
      mutate: (snapshot) => { snapshot.payload.holes[0].par += 1; },
      pattern: /hole|configuration/i,
    },
  ];
  for (const item of cases) {
    const aggregate = makeHistory2026Aggregate();
    const snapshot = aggregate.finalized_snapshots.find((row) => row.match_id === "2026-R3-4");
    // Fixtures intentionally share canonical participant objects; copy the
    // persisted payload so this simulates database drift in the snapshot only.
    snapshot.payload = cloneHistoryFixture(snapshot.payload);
    item.mutate(snapshot);
    assert.throws(
      () => buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() }),
      item.pattern,
      `${item.label} drift must fail closed`
    );
  }
});

test("strictly unstarted empty match-hole context does not compete with the canonical course definition", () => {
  const aggregate = makeHistory2026Aggregate();
  const record = aggregate.matches.find((entry) => entry.match.match_id === "2026-R1-1");
  const authoritative = aggregate.matches.find((entry) => entry.match.match_id === "2026-R1-2").scoring_snapshot;
  Object.assign(record.match, {
    status: "UPCOMING",
    lifecycle: "UPCOMING",
    scorecard_complete: false,
    scored_holes: 0,
    result_winner: "",
    running_result: "Scheduled",
    team_1_points: 0,
    team_2_points: 0,
    finalized_at: null,
  });
  record.participants = [];
  record.scores = [];
  record.scoring_snapshot.hole_definitions = [];
  aggregate.finalized_snapshots = aggregate.finalized_snapshots.filter((entry) => entry.match_id !== "2026-R1-1");

  const view = buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() });
  const turtlePoint = view.rounds.find((round) => round.round === 1).course;
  assert.equal(view.matches.find((match) => match.id === "2026-R1-1").status, "UPCOMING");
  assert.equal(turtlePoint.Par, authoritative.par);
  assert.equal(
    turtlePoint.Yardage,
    authoritative.hole_definitions.reduce((total, hole) => total + hole.yardage, 0)
  );
  assert.equal(view.analytics.missingScorecards.length, 0);
  assert.equal(view.analytics.warnings.length, 0);
});

test("the current TPGC01 Gold definition survives one cleared unstarted match context", () => {
  const aggregate = makeHistory2026Aggregate();
  for (const record of aggregate.matches.filter((entry) => entry.match.round_number === 1)) {
    Object.assign(record.match, {
      status: "UPCOMING",
      lifecycle: "UPCOMING",
      scorecard_complete: false,
      scored_holes: 0,
      result_winner: "",
      running_result: "Scheduled",
      team_1_points: 0,
      team_2_points: 0,
      finalized_at: null,
    });
    Object.assign(record.scoring_snapshot, {
      course_id: "TPGC01",
      tee: "Gold",
      rating: 71.9,
      slope: 136,
      par: 72,
      hole_definitions: cloneHistoryFixture(TURTLE_POINT_GOLD_HOLES),
    });
    record.participants = [];
    record.scores = [];
  }
  aggregate.matches.find((entry) => entry.match.match_id === "2026-R1-1")
    .scoring_snapshot.hole_definitions = [];
  aggregate.finalized_snapshots = aggregate.finalized_snapshots.filter((entry) => entry.payload.round.round_number !== 1);

  const view = buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() });
  const course = view.rounds.find((round) => round.round === 1).course;
  assert.equal(course["Course ID"], "TPGC01");
  assert.equal(course["Tee Played"], "Gold");
  assert.equal(course.Rating, 71.9);
  assert.equal(course.Slope, 136);
  assert.equal(course.Par, 72);
  assert.equal(course.Yardage, 6510);
});

test("actual competing canonical course-hole definitions still fail closed", () => {
  const aggregate = makeHistory2026Aggregate();
  const record = aggregate.matches.find((entry) => entry.match.match_id === "2026-R1-2");
  Object.assign(record.match, {
    status: "LIVE",
    lifecycle: "LIVE",
    scorecard_complete: false,
    finalized_at: null,
  });
  aggregate.finalized_snapshots = aggregate.finalized_snapshots.filter((entry) => entry.match_id !== "2026-R1-2");
  record.scoring_snapshot.hole_definitions = cloneHistoryFixture(record.scoring_snapshot.hole_definitions);
  record.scoring_snapshot.hole_definitions[0].stroke_index = 18;

  assert.throws(
    () => buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() }),
    /incompatible historical hole configurations/i
  );
});

test("empty or partial course context with scoring evidence remains fail-closed", () => {
  for (const definitionCount of [0, 17]) {
    const aggregate = makeHistory2026Aggregate();
    const record = aggregate.matches.find((entry) => entry.match.match_id === "2026-R1-2");
    Object.assign(record.match, {
      status: "UPCOMING",
      lifecycle: "UPCOMING",
      scorecard_complete: false,
      scored_holes: 1,
      finalized_at: null,
    });
    aggregate.finalized_snapshots = aggregate.finalized_snapshots.filter((entry) => entry.match_id !== "2026-R1-2");
    record.scoring_snapshot.hole_definitions = record.scoring_snapshot.hole_definitions.slice(0, definitionCount);

    assert.throws(
      () => buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() }),
      /does not contain 18 holes/i
    );
  }
});

test("a course with only empty unstarted contexts still fails closed", () => {
  const aggregate = makeHistory2026Aggregate();
  for (const record of aggregate.matches.filter((entry) => entry.match.round_number === 1)) {
    Object.assign(record.match, {
      status: "UPCOMING",
      lifecycle: "UPCOMING",
      scorecard_complete: false,
      scored_holes: 0,
      result_winner: "",
      team_1_points: 0,
      team_2_points: 0,
      finalized_at: null,
    });
    record.scores = [];
    record.scoring_snapshot.hole_definitions = [];
  }
  aggregate.finalized_snapshots = aggregate.finalized_snapshots.filter((entry) => entry.payload.round.round_number !== 1);

  assert.throws(
    () => buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() }),
    /does not contain 18 holes/i
  );
});

test("correction and re-Finalization select only the newest coherent current revision", () => {
  const aggregate = makeHistory2026Aggregate();
  const match = aggregate.matches.find((record) => record.match.match_id === "2026-R1-6");
  const original = aggregate.finalized_snapshots.find((snapshot) => snapshot.match_id === "2026-R1-6");
  const superseded = { ...cloneHistoryFixture(original), state: "SUPERSEDED" };
  const invalidated = {
    ...cloneHistoryFixture(original), snapshot_id: "2026-R1-6:FINAL:2", snapshot_revision: 2,
    match_revision: original.match_revision + 1, state: "INVALIDATED",
  };
  const corrected = {
    ...cloneHistoryFixture(original), snapshot_id: "2026-R1-6:FINAL:3", snapshot_revision: 3,
    match_revision: original.match_revision + 2, state: "CURRENT",
  };
  corrected.payload.match.match_revision = corrected.match_revision;
  match.match.match_revision = corrected.match_revision;
  const snapshots = aggregate.finalized_snapshots.filter((snapshot) => snapshot.match_id !== "2026-R1-6");
  const selected = selectCurrentFinalizedSnapshots(aggregate.matches, [...snapshots, superseded, invalidated, corrected]);
  assert.equal(selected.get("2026-R1-6").snapshot_revision, 3);
  assert.equal(selected.get("2026-R1-6").state, "CURRENT");
});

test("adapter represents the complete current 24/17/46/828 lifecycle boundary", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  assert.equal(view.source, "supabase");
  assert.equal(view.year, 2026);
  assert.equal(view.matches.length, 24);
  assert.equal(view.diagnostics.totalMatches, 24);
  assert.equal(view.diagnostics.finalMatches, 17);
  assert.equal(view.diagnostics.liveMatches, 7);
  assert.equal(view.diagnostics.logicalScorecards, 46);
  assert.equal(view.diagnostics.grossHoleValues, 828);
  assert.equal(view.analytics.scorecards.length, 46);
  assert.equal(view.analytics.scorecards.reduce(
    (count, scorecard) => count + scorecard.holes.filter((hole) => hole.score !== null).length,
    0
  ), 828);
  assert.equal(scorecardsFor(view, "2026-R3-6").length, 0, "LIVE Round 3 matches cannot acquire historical scorecards");
});

test("Best Ball, Singles, and Scramble use stable canonical logical identities", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  const bestBall = scorecardsFor(view, "2026-R1-1");
  const scramble = scorecardsFor(view, "2026-R2-1");
  const singles = scorecardsFor(view, "2026-R3-4");

  assert.equal(bestBall.length, 4);
  assert.ok(bestBall.every((scorecard) => scorecard.scoreType === "INDIVIDUAL" && scorecard.playerId));
  assert.equal(new Set(bestBall.map((scorecard) => `${scorecard.matchId}:PLAYER:${scorecard.playerId}`)).size, 4);

  assert.equal(singles.length, 2);
  assert.ok(singles.every((scorecard) => scorecard.scoreType === "INDIVIDUAL" && scorecard.playerId));
  assert.deepEqual(singles.map((scorecard) => scorecard.teamId).sort(), ["LIPPIT", "PICKLES"]);

  assert.equal(scramble.length, 2);
  assert.ok(scramble.every((scorecard) => scorecard.scoreType === "TEAM"));
  assert.ok(scramble.every((scorecard) => scorecard.playerId === undefined));
  assert.deepEqual(scramble.map((scorecard) => scorecard.teamId).sort(), ["LIPPIT", "PICKLES"]);
  assert.ok(scramble.every((scorecard) => scorecard.participantPlayerIds.length === 2));
  assert.equal(new Set(scramble.map((scorecard) => `${scorecard.matchId}:TEAM:${scorecard.teamId}`)).size, 2);
});

test("2026 team history summarizes canonical rounds without duplicating match scorecards", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  const pickles = history2026TeamPageModel(view, "PICKLES");
  assert.equal(pickles.id, "PICKLES");
  assert.equal(pickles.roundGroups.length, 3);
  assert.equal(pickles.roundGroups.reduce((count, group) => count + group.matchCount, 0), 24);
  assert.equal(pickles.roundGroups[0].opponent.id, "LIPPIT");
  assert.equal(pickles.roundGroups[0].format, "BB");
  assert.equal(pickles.roundGroups[1].format, "SC");
  assert.equal(pickles.roundGroups[2].format, "SI");
  assert.equal(pickles.roundGroups[2].lifecycle, "IN PROGRESS");
  assert.ok(pickles.roundGroups.every((group) => !("matches" in group)));
  assert.ok(!("scorecardAnalytics" in pickles));
  assert.ok(pickles.roster.every((row) => Number.isFinite(row.handicap)));
});

test("2026-R3-4 Singles preserves official identities and all authoritative gross values", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  const cards = scorecardsFor(view, "2026-R3-4");
  const holman = cards.find((scorecard) => scorecard.playerId === "HM01");
  const memo = cards.find((scorecard) => scorecard.playerId === "MS01");
  assert.equal(holman.teamId, "PICKLES");
  assert.equal(memo.teamId, "LIPPIT");
  assert.deepEqual(holman.holes.map((hole) => hole.score), HOLMAN_2026_R3_4_GROSS);
  assert.deepEqual(memo.holes.map((hole) => hole.score), MEMO_2026_R3_4_GROSS);
  assert.equal(holman.completedHoleCount, 18);
  assert.equal(memo.completedHoleCount, 18);
  assert.equal(holman.courseId, "OCGC01");
  assert.equal(holman.tee, "Gold");
});

test("2026-R2-1 Scramble creates two team scorecards and resolves both golfer pairings", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  const cards = scorecardsFor(view, "2026-R2-1");
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((scorecard) => scorecard.teamId).sort(), ["LIPPIT", "PICKLES"]);
  assert.ok(cards.every((scorecard) => !scorecard.playerId));
  assert.ok(cards.every((scorecard) => scorecard.holes.length === 18));
  assert.ok(cards.every((scorecard) => scorecard.holes.every((hole) => Number.isInteger(hole.score))));
  assert.ok(cards.every((scorecard) => scorecard.participantPlayerIds.length === 2));
  assert.ok(cards.every((scorecard) => scorecard.participantNames.length === 2));
});

test("all six finalized Scramble matches preserve the two-team historical contract", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  const scrambleMatches = view.matches.filter((record) =>
    (record.match?.format || record.format) === "SC" &&
    (record.match?.status || record.status) === "FINAL"
  );
  assert.equal(scrambleMatches.length, 6);
  for (const match of scrambleMatches) {
    const cards = scorecardsFor(view, matchId(match));
    assert.equal(cards.length, 2, `${matchId(match)} must have exactly two team scorecards`);
    assert.deepEqual(cards.map((scorecard) => scorecard.teamId).sort(), ["LIPPIT", "PICKLES"]);
    assert.ok(cards.every((scorecard) => !scorecard.playerId));
    assert.ok(cards.every((scorecard) => scorecard.participantPlayerIds.length === 2));
    assert.equal(new Set(cards.map((scorecard) => scorecard.teamId)).size, 2);
  }
});

test("2026-R1-6 exposes Jack Keffler's corrected current Best Ball scorecard", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  const cards = scorecardsFor(view, "2026-R1-6");
  const jack = cards.find((scorecard) => scorecard.playerId === "JK02");
  assert.equal(cards.length, 4);
  assert.ok(jack, "JK02—not JK01—must resolve Jack Keffler");
  assert.equal(jack.playerName, "Jack Keffler");
  assert.equal(jack.teamId, "PICKLES");
  assert.deepEqual(jack.holes.map((hole) => hole.score), JACK_KEFFLER_2026_R1_6_GROSS);
  assert.equal(jack.total, 80);
  assert.equal(jack.strokesReceived, 13);
  assert.equal(jack.netTotals.total, 67);
});

test("history source fingerprint is order-insensitive and correction-sensitive", () => {
  const aggregate = makeHistory2026Aggregate();
  const baseline = history2026SourceFingerprint(aggregate, { guideProjection: makeGuideProjection() });
  const reordered = cloneHistoryFixture(aggregate);
  for (const key of ["rounds", "teams", "players", "matches", "finalized_snapshots"]) reordered[key].reverse();
  reordered.matches.forEach((record) => record.participants.reverse());
  assert.equal(history2026SourceFingerprint(reordered, { guideProjection: makeGuideProjection() }), baseline);

  const corrected = cloneHistoryFixture(aggregate);
  const snapshot = corrected.finalized_snapshots.find((record) => record.match_id === "2026-R1-6");
  snapshot.snapshot_revision += 1;
  snapshot.source_fingerprint = "e".repeat(64);
  assert.notEqual(history2026SourceFingerprint(corrected, { guideProjection: makeGuideProjection() }), baseline);

  const presentationChanged = cloneHistoryFixture(aggregate);
  presentationChanged.matches.find((record) => record.match.match_id === "2026-R3-4")
    .presentation.tee_time = "12:34 PM";
  assert.notEqual(
    history2026SourceFingerprint(presentationChanged, { guideProjection: makeGuideProjection() }),
    baseline,
    "participant-visible Game Center presentation must invalidate the History adapter cache"
  );
});

test("public History DTO redacts snapshot, archive, mutation, and service administration", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  const publicView = sanitizeHistory2026PublicView({
    ...view,
    finalized_snapshots: [{ snapshot_id: "private", payload_hash: "private" }],
    archive_jobs: [{ claim_token: "private" }],
    archive_checkpoints: [{ google_readback_hash: "private" }],
    actor_id: "private",
    service_role: "private",
    mutation_key: "private",
  });
  const serialized = JSON.stringify(publicView);
  for (const forbidden of [
    "finalized_snapshots", "snapshot_id", "payload_hash", "archive_jobs", "archive_checkpoints",
    "claim_token", "actor_id", "service_role", "mutation_key", "google_readback_hash",
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  assert.equal(publicView.source, "supabase");
  assert.equal(publicView.year, 2026);
  assert.equal(publicView.analytics.scorecards.length, 46);
});

test("migrated 2026 routes use the Supabase service branch and fail locally without a legacy fallback", async () => {
  const routePaths = [
    "app/history/page.js",
    "app/history/[year]/page.js",
    "app/history/[year]/round/[round]/page.js",
    "app/history/[year]/team/[side]/page.js",
  ];
  const routes = await Promise.all(routePaths.map(source));
  for (const route of routes) {
    assert.match(route, /isSupabaseHistory2026/);
    assert.match(route, /loadHistory2026View/);
    assert.match(route, /HistoryUnavailable/);
  }
  assert.match(routes[0], /after\s*\(\s*async\s*\(\)\s*=>\s*\{\s*await\s+refreshHistoricalData\s*\(/,
    "older legacy cards may refresh only after the participant response");
  assert.match(routes[3], /PublicMatchCard/);
  assert.match(routes[3], /roundGroups/);
  const [service, supabase] = await Promise.all([
    source("lib/history-2026-service.js"),
    source("lib/history-2026-supabase.js"),
  ]);
  for (const moduleSource of [service, supabase]) {
    assert.doesNotMatch(moduleSource, /google-sheets-data|historical-data\.json|loadScorecardSheets|refreshHistoricalData/);
  }
  assert.doesNotMatch(service, /catch[\s\S]{0,400}(google|historical-data)/i);
});

test("historical RPC is service-only, 2026-scoped, and rejects Production/3026 context", async () => {
  const migrationNames = await readdir(new URL("../supabase/migrations/", import.meta.url));
  const migrationName = migrationNames.find((name) => /2026_historical_reads\.sql$/.test(name));
  assert.ok(migrationName, "the bounded 2026 historical-read migration must exist");
  const migration = await source(`supabase/migrations/${migrationName}`);
  assert.match(migration, /create or replace function public\.read_preview_2026_historical_view/);
  assert.match(migration, /target_tournament\s*<>\s*'2026'/);
  assert.match(migration, /production_workbook/);
  assert.match(migration, /finalized_scorecard_snapshots/);
  assert.match(migration, /state\s*=\s*'CURRENT'/);
  assert.match(migration, /presentation_payload_hash[\s\S]{0,100}gp\.source_payload_hash/i);
  assert.match(migration, /revoke all on function public\.read_preview_2026_historical_view\(text, text\)[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.read_preview_2026_historical_view\(text, text\)[\s\S]*?to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.read_preview_2026_historical_view[\s\S]{0,160}\bto\s+(anon|authenticated|public)\b/i);
  assert.doesNotMatch(migration, /scorecard_archive_jobs[\s\S]{0,100}jsonb_agg|scorecard_archive_checkpoints[\s\S]{0,100}jsonb_agg/i);
});
