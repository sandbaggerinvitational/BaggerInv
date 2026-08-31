import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MOBILE_HISTORY_LIMITS,
  mobileHistoryDetailData,
  mobileHistoryDetailResult,
  mobileHistoryRepresentationRevision,
  mobileHistoryResult,
} from "../lib/mobile-v1-history.js";
import {
  MOBILE_ODDS_LIMITS,
  mobileOddsDataFromView,
  mobileOddsRepresentationRevision,
  mobileOddsResult,
} from "../lib/mobile-v1-odds.js";
import {
  MOBILE_RECORDS_LIMITS,
  mobileRecordsData,
  mobileRecordsRepresentationRevision,
  mobileRecordsResult,
} from "../lib/mobile-v1-records.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const now = new Date("2026-08-30T18:00:00.000Z");
const identity = { tournamentId: "2026", playerId: "P1" };
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function team(side, suffix = side) {
  return { id: `T${suffix}`, name: `Team ${suffix}`, sideNumber: side, roster: [{
    player: { "Player ID": `P${side}`, "Display Name": `Player ${side}` },
    handicap: side,
  }] };
}

function currentHistory() {
  const teams = [team(1), team(2)];
  const match = {
    id: "2026-R1-1", match: 1, round: 1, format: "BB", lifecycle: "LIVE",
    course: { id: "C1", name: "Ocean" },
    team1Players: [{ id: "P1", name: "Player 1" }],
    team2Players: [{ id: "P2", name: "Player 2" }],
    team1Points: null, team2Points: null,
  };
  return {
    source: "supabase", year: 2026, sourceFingerprint: "c".repeat(64),
    tournament: { id: "2026", name: "2026 Bagger", lifecycle: "IN_PROGRESS", complete: false, teams },
    teams,
    rounds: [{ round: 1, format: "BB", course: { "Course ID": "C1", Course: "Ocean" },
      teamOne: { ...teams[0], points: null }, teamTwo: { ...teams[1], points: null }, matches: [match] }],
    matches: [match], leaderboardRows: [], analytics: { scorecards: [] },
  };
}

function archiveRows() {
  return Array.from({ length: 9 }, (_, index) => {
    const year = 2017 + index;
    return {
      tournament_id: String(year), tournament_year: year, revision_id: `revision-${year}`,
      tournament: { name: `${year} Bagger`, lifecycle: "FINAL", destination: "Kiawah",
        official_team_1_points: 8.5, official_team_2_points: 7.5,
        champion_team_side: 1, champion_team_id: `${year}-T1` },
      teams: [
        { team_id: `${year}-T1`, team_side: 1, name: "Pickles" },
        { team_id: `${year}-T2`, team_side: 2, name: "Rippers" },
      ],
    };
  });
}

function oddsView(state = "PUBLISHED") {
  const published = state === "PUBLISHED";
  const payload = {
    year: 2026, phase: "After Round 1", phaseOrder: 1,
    publishedAt: "2026-08-30T12:00:00.000Z", iterations: 10_000,
    totalPointsAvailable: 72,
    teams: [
      { side: 1, name: "Pickles", probability: 60, americanOdds: "-150", expectedPoints: 38.25 },
      { side: 2, name: "Rippers", probability: 40, americanOdds: "+150", expectedPoints: 33.75 },
    ],
    players: [{ id: "P1", name: "Player One", teamSide: 1, probability: 20,
      americanOdds: "+400", expectedPoints: 5.25, expectedRecord: "2-1-0", averageFinish: 3.2 }],
  };
  return {
    scope: "ODDS", tournament_id: "2026",
    publication: published
      ? { state, revision: 4, published_at: payload.publishedAt, current_milestone: payload.phase }
      : { state, revision: 5, published_at: null, current_milestone: null },
    snapshots: published ? [{ milestone: payload.phase, phase_order: 1,
      published_at: payload.publishedAt, payload, is_current_official: true,
      publication_verified: true }] : [],
  };
}

test("History archive is one bounded aggregate plus current year and never fabricates a current champion", async () => {
  let reads = 0;
  const result = await mobileHistoryResult(identity, { now, dependencies: {
    readMobilePreviewParticipantContent: async (scope) => {
      reads += 1;
      assert.equal(scope, "HISTORY_ARCHIVE");
      return { payload: { ok: true, data: { scope, completed_years: archiveRows() } } };
    },
    loadHistory2026View: async () => currentHistory(),
  } });
  assert.equal(reads, 1);
  assert.equal(result.body.data.tournaments.length, 10);
  assert.equal(result.body.data.tournaments[0].year, 2026);
  assert.equal(result.body.data.tournaments[0].status, "inProgress");
  assert.equal(result.body.data.tournaments[0].champion, null);
  assert.equal(result.body.data.tournaments[1].champion.teamId, "2025-T1");
  assert.match(result.revision, /^[0-9a-f]{64}$/);
  assert.equal(result.revision, result.body.meta.revision);
  assert.ok(Buffer.byteLength(JSON.stringify(result.body.data), "utf8") <=
    MOBILE_HISTORY_LIMITS.archiveResponseBytes);
  await assertMobileV1Schema("history", result.body);
});

test("representation ETags are canonical-data hashes, not generated-at hashes", async () => {
  const dependencies = {
    readMobilePreviewParticipantContent: async () => ({ payload: {
      ok: true, data: { completed_years: archiveRows() },
    } }),
    loadHistory2026View: async () => currentHistory(),
  };
  const first = await mobileHistoryResult(identity, {
    now: new Date("2026-08-30T18:00:00.000Z"), dependencies,
  });
  const second = await mobileHistoryResult(identity, {
    now: new Date("2026-08-31T18:00:00.000Z"), dependencies,
  });
  assert.notEqual(first.body.meta.generatedAt, second.body.meta.generatedAt);
  assert.equal(first.revision, second.revision);
  const changed = structuredClone(second.body.data);
  changed.tournaments[1].teams[0].points += 0.5;
  assert.notEqual(mobileHistoryRepresentationRevision(changed), second.revision);
});

test("current History remains in progress and hides stale final-only fields", async () => {
  const current = currentHistory();
  current.tournament.championTeamId = "T1";
  current.tournament.runnerUpTeamId = "T2";
  current.tournament["Final Score"] = "8.5 - 7.5";
  const result = await mobileHistoryResult(identity, { now, dependencies: {
    readMobilePreviewParticipantContent: async () => ({ payload: {
      ok: true, data: { completed_years: archiveRows() },
    } }),
    loadHistory2026View: async () => current,
  } });
  const summary = result.body.data.tournaments[0];
  assert.equal(summary.status, "inProgress");
  assert.equal(summary.champion, null);
  assert.equal(summary.runnerUp, null);
  assert.equal(summary.finalScore, null);
});

test("History rejects schema-invalid dates and participant identifiers", () => {
  const malformedDate = currentHistory();
  malformedDate.tournament.startDate = "Friday";
  assert.throws(() => mobileHistoryDetailData(malformedDate),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const malformedParticipant = currentHistory();
  malformedParticipant.analytics.scorecards = [{
    matchId: "2026-R1-1", scoreType: "TEAM", teamId: "T1", status: "COMPLETE",
    participantPlayerIds: ["bad id"], holes: [],
  }];
  assert.throws(() => mobileHistoryDetailData(malformedParticipant),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("History fails closed for blank, unknown, or contradictory canonical lifecycle", () => {
  for (const lifecycle of ["", "PAUSED", "NOT_A_LIFECYCLE"]) {
    const malformed = currentHistory();
    malformed.tournament.lifecycle = lifecycle;
    assert.throws(() => mobileHistoryDetailData(malformed),
      (error) => error.code === "MOBILE_API_UNAVAILABLE");
  }

  const contradictory = currentHistory();
  contradictory.tournament.lifecycle = "LIVE";
  contradictory.tournament.complete = true;
  assert.throws(() => mobileHistoryDetailData(contradictory),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const blankMatchLifecycle = currentHistory();
  blankMatchLifecycle.matches[0].lifecycle = "";
  blankMatchLifecycle.matches[0].status = "FINAL";
  blankMatchLifecycle.rounds[0].matches[0] = blankMatchLifecycle.matches[0];
  assert.throws(() => mobileHistoryDetailData(blankMatchLifecycle),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("History requires canonical standing ranks and never fabricates array-position rank", () => {
  const ranked = currentHistory();
  ranked.leaderboardRows = [{
    rank: 3,
    player: { id: "P1", name: "Player 1" },
    teamName: "Team 1",
    points: 1.5,
    wins: 1,
    losses: 0,
    halves: 1,
  }];
  assert.equal(mobileHistoryDetailData(ranked).standings[0].rank, 3);

  for (const rank of [undefined, null, "", "third", 0, 129]) {
    const malformed = structuredClone(ranked);
    if (rank === undefined) delete malformed.leaderboardRows[0].rank;
    else malformed.leaderboardRows[0].rank = rank;
    assert.throws(() => mobileHistoryDetailData(malformed),
      (error) => error.code === "MOBILE_API_UNAVAILABLE");
  }
});

test("History rejects malformed nonblank numerics while preserving truly missing optionals", () => {
  const missing = mobileHistoryDetailData(currentHistory());
  assert.equal(missing.teams[0].averageHandicap, null);
  assert.equal(missing.teams[0].roster[0].handicap, 1);
  assert.equal(missing.matches[0].course.par, null);

  for (const malformedValue of ["not-a-number", "12 strokes", true, {}, [], "Infinity"]) {
    const malformed = currentHistory();
    malformed.teams[0].averageHandicap = malformedValue;
    assert.throws(() => mobileHistoryDetailData(malformed),
      (error) => error.code === "MOBILE_API_UNAVAILABLE");
  }

  const malformedHole = currentHistory();
  malformedHole.analytics.scorecards = [{
    matchId: "2026-R1-1", scoreType: "INDIVIDUAL", playerId: "P1", status: "PARTIAL",
    holes: [{ holeNumber: "first", score: 4, par: 4, strokeIndex: 1,
      strokesAllocated: 1, netScore: 3 }],
  }];
  assert.throws(() => mobileHistoryDetailData(malformedHole),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("History rejects unknown scorecard entity types instead of treating them as individual", () => {
  for (const scoreType of [undefined, "", "PLAYER", "PAIR"]) {
    const malformed = currentHistory();
    malformed.analytics.scorecards = [{
      matchId: "2026-R1-1", scoreType, playerId: "P1", status: "COMPLETE", holes: [],
    }];
    assert.throws(() => mobileHistoryDetailData(malformed),
      (error) => error.code === "MOBILE_API_UNAVAILABLE");
  }
});

test("History detail accepts only an exact bounded four-digit year before any reader executes", async () => {
  for (const unsafe of ["2026.0", "02026", "2026junk", " 2026 ", "2027", "2016"]) {
    let reads = 0;
    await assert.rejects(() => mobileHistoryDetailResult(identity, unsafe, { dependencies: {
      loadHistory2026View: async () => { reads += 1; return currentHistory(); },
      loadCompletedHistoryView: async () => { reads += 1; return currentHistory(); },
    } }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
    assert.equal(reads, 0);
  }
});

test("a completed History detail performs exactly one bounded YEAR read", async () => {
  let completedReads = 0;
  let currentReads = 0;
  const completed = currentHistory();
  completed.year = 2025;
  completed.tournament.id = "2025";
  completed.tournament.lifecycle = "FINAL";
  completed.tournament.complete = true;
  const result = await mobileHistoryDetailResult(identity, "2025", { now, dependencies: {
    loadCompletedHistoryView: async ({ year }) => {
      completedReads += 1;
      assert.equal(year, 2025);
      return completed;
    },
    loadHistory2026View: async () => { currentReads += 1; return currentHistory(); },
  } });
  assert.equal(result.status, 200);
  assert.equal(completedReads, 1);
  assert.equal(currentReads, 0);
});

test("History detail is bounded and projects canonical rounds, Matches, awards, and optional scorecards", async () => {
  const view = currentHistory();
  view.tournament.awards = [{ Award: "Captain", Winner: "Player 1", winnerPlayer: { "Player ID": "P1" } }];
  view.analytics.scorecards = [{ matchId: "2026-R1-1", scoreType: "INDIVIDUAL", playerId: "P1",
    status: "PARTIAL", total: null, netTotal: null,
    holes: [{ holeNumber: 1, score: 4, par: 4, strokeIndex: 1, strokesAllocated: 1, netScore: 3 }] }];
  const data = mobileHistoryDetailData(view);
  assert.equal(data.rounds.length, 1);
  assert.equal(data.matches.length, 1);
  assert.equal(data.matches[0].scorecardIds.length, 1);
  assert.equal(data.scorecards[0].holes[0].grossScore, 4);
  assert.equal(data.awards[0].playerId, "P1");
  assert.match(mobileHistoryRepresentationRevision(data), /^[0-9a-f]{64}$/);
  assert.ok(JSON.stringify(data).length < 400_000);
  assert.ok(Buffer.byteLength(JSON.stringify(data), "utf8") <=
    MOBILE_HISTORY_LIMITS.detailResponseBytes);
  const revision = mobileHistoryRepresentationRevision(data);
  await assertMobileV1Schema("history-detail", {
    ok: true,
    apiVersion: "v1",
    data,
    meta: { generatedAt: now.toISOString(), revision },
  });
});

test("History detail rejects array overflows instead of truncating canonical data", () => {
  const tooManyRounds = currentHistory();
  tooManyRounds.rounds = Array.from({ length: 9 }, (_, index) => ({
    ...tooManyRounds.rounds[0], round: index + 1,
  }));
  assert.throws(() => mobileHistoryDetailData(tooManyRounds),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const tooManyHoles = currentHistory();
  tooManyHoles.analytics.scorecards = [{
    matchId: "2026-R1-1", scoreType: "INDIVIDUAL", playerId: "P1", status: "COMPLETE",
    holes: Array.from({ length: 19 }, (_, index) => ({
      holeNumber: Math.min(index + 1, 18), score: 4, par: 4,
      strokeIndex: Math.min(index + 1, 18), strokesAllocated: 0, netScore: 4,
    })),
  }];
  assert.throws(() => mobileHistoryDetailData(tooManyHoles),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("Records preserve canonical holder sets, ties, categories, IDs, and order", async () => {
  const scorecardRecord = { slug: "low-round", group: "individual", unit: "strokes", decimals: 0,
    signed: false, aggregate: false, eligibility: "Verified cards", winners: [] };
  const progressionRecord = { slug: "comeback", winners: [] };
  const authority = {
    records: [
      { slug: "career-points", title: "Career Points", source: "official", direction: "highest",
        winningValue: 12.5, winners: [
          { entityType: "PLAYER", playerId: "P1", playerName: "Long Player One", value: 12.5 },
          { entityType: "PLAYER", playerId: "P2", playerName: "Player Two", value: 12.5 },
        ] },
      { slug: "low-round", title: "Lowest Round", source: "scorecard", direction: "lowest",
        winningValue: 67, winners: [{ entityType: "PLAYER", playerId: "P1", playerName: "Long Player One",
          value: 67, year: 2025, round: 3, matchId: "M1" }] },
      { slug: "comeback", title: "Largest Comeback", source: "match-progression", direction: "highest",
        winningValue: 4, winners: [{ entityType: "TEAM_PERFORMANCE", playerIds: ["P1", "P3"],
          playerNames: ["Long Player One", "Partner"], teamId: "T1", teamName: "Pickles", value: 4 }] },
    ],
    scorecardCatalog: { bySlug: { "low-round": scorecardRecord } },
    matchProgression: { byRecordSlug: { comeback: progressionRecord } },
  };
  const data = mobileRecordsData(authority);
  assert.deepEqual(data.categories.map((row) => row.categoryId), ["ALL_TIME", "INDIVIDUAL", "MATCH_PROGRESSION"]);
  assert.equal(data.categories[0].records[0].tied, true);
  assert.deepEqual(data.categories[0].records[0].holders.map((row) => row.playerIds), [["P1"], ["P2"]]);
  assert.deepEqual(data.categories[2].records[0].holders[0].playerIds, ["P1", "P3"]);
  assert.match(mobileRecordsRepresentationRevision(data), /^[0-9a-f]{64}$/);
  assert.ok(Buffer.byteLength(JSON.stringify(data), "utf8") <= MOBILE_RECORDS_LIMITS.responseBytes);
  const revision = mobileRecordsRepresentationRevision(data);
  await assertMobileV1Schema("records", {
    ok: true,
    apiVersion: "v1",
    data,
    meta: { generatedAt: now.toISOString(), revision },
  });
});

test("Records reject oversized holder sets and malformed canonical IDs", () => {
  const winners = Array.from({ length: 33 }, (_, index) => ({
    entityType: "PLAYER", playerId: `P${index + 1}`, playerName: `Player ${index + 1}`, value: 5,
  }));
  assert.throws(() => mobileRecordsData({ records: [{
    slug: "career-points", title: "Career Points", source: "official",
    direction: "highest", winningValue: 5, winners,
  }] }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
  assert.throws(() => mobileRecordsData({ records: [{
    slug: "career points", title: "Career Points", source: "official",
    direction: "highest", winningValue: 5, winners: winners.slice(0, 1),
  }] }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("Records expose an intentional empty catalog when canonical authority has no records", () => {
  const data = mobileRecordsData({ records: [] });
  assert.deepEqual(data.categories, []);
  assert.equal(data.coverage.firstCompleteMatchYear, 2017);
  assert.equal(data.coverage.scorecardHistoryComplete, false);
});

test("Records require an explicit canonical records array", () => {
  for (const authority of [{}, { records: null }, { records: {} }, { records: "none" }]) {
    assert.throws(() => mobileRecordsData(authority),
      (error) => error.code === "MOBILE_API_UNAVAILABLE");
  }
  assert.deepEqual(mobileRecordsData({ records: [] }).categories, []);
});

test("Records preserve absent nullable numerics but reject malformed numeric values", () => {
  const authority = {
    records: [{
      slug: "career-points", title: "Career Points", source: "official",
      direction: "highest", winningValue: 5, winners: [{
        entityType: "PLAYER", playerId: "P1", playerName: "Player One", value: 5,
      }],
    }],
  };
  const holder = mobileRecordsData(authority).categories[0].records[0].holders[0];
  assert.equal(holder.holeNumber, null);
  assert.equal(holder.year, null);
  assert.equal(holder.roundNumber, null);
  assert.equal(holder.secondaryValue, null);

  for (const [field, value] of [
    ["holeNumber", "not-a-hole"],
    ["year", "unknown"],
    ["round", {}],
    ["secondaryValue", "not-a-number"],
  ]) {
    const malformed = structuredClone(authority);
    malformed.records[0].winners[0][field] = value;
    assert.throws(() => mobileRecordsData(malformed),
      (error) => error.code === "MOBILE_API_UNAVAILABLE");
  }
});

test("Records reject an empty canonical title instead of emitting a schema-invalid row", () => {
  assert.throws(() => mobileRecordsData({ records: [{
    slug: "untitled", title: "", source: "official", direction: "highest",
    winningValue: null, winners: [],
  }] }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("Records reuse the one-bundle career authority and keep canonical-holder dependencies injectable", async () => {
  let careerLoads = 0;
  const result = await mobileRecordsResult(identity, { now, dependencies: {
    loadMobileCareerAuthority: async (receivedIdentity) => {
      careerLoads += 1;
      assert.equal(receivedIdentity, identity);
      return {
        source: "supabase",
        calculations: { getRecords: () => ({ points: [{ player: {
          "Player ID": "P1", "Display Name": "Player One",
        } }] }) },
        scorecardAnalytics: { scorecards: [], ghostMatchExclusions: [] },
      };
    },
    getLeaderboardSlugs: () => ["career-points"],
    getLeaderboardFromRecords: (slug) => ({ slug, winners: [] }),
    buildCanonicalRecordHolderAuthority: ({ officialLeaderboards, playerNames }) => {
      assert.equal(officialLeaderboards[0].slug, "career-points");
      assert.equal(playerNames.P1, "Player One");
      return {
        records: [{
          slug: "career-points", title: "Career Points", source: "official",
          direction: "highest", winningValue: 1, winners: [{
            entityType: "PLAYER", playerId: "P1", playerName: "Player One", value: 1,
          }],
        }],
      };
    },
  } });
  assert.equal(careerLoads, 1);
  assert.equal(result.body.data.categories[0].records[0].holders[0].playerIds[0], "P1");
});

test("Published Odds emits only bounded canonical fields and preserves stored order/rank", async () => {
  const data = mobileOddsDataFromView(oddsView());
  assert.equal(data.publication.state, "PUBLISHED");
  assert.equal(data.snapshots.length, 1);
  assert.equal(data.snapshots[0].players[0].rank, 1);
  assert.equal(data.snapshots[0].teams[1].americanOdds, "+150");
  assert.ok(Buffer.byteLength(JSON.stringify(data), "utf8") <= MOBILE_ODDS_LIMITS.responseBytes);
  const serialized = JSON.stringify(data);
  for (const forbidden of ["rawProbability", "deterministicSeed", "sourceFingerprint", "engineVersion"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  const revision = mobileOddsRepresentationRevision(data);
  await assertMobileV1Schema("odds", {
    ok: true,
    apiVersion: "v1",
    data,
    meta: { generatedAt: now.toISOString(), revision },
  });
});

test("canonical Odds PUBLISHED to UNPUBLISHED revocation removes every snapshot and changes ETag", async () => {
  const published = mobileOddsDataFromView(oddsView("PUBLISHED"));
  const unpublished = mobileOddsDataFromView(oddsView("UNPUBLISHED"));
  assert.equal(unpublished.publication.state, "UNPUBLISHED");
  assert.deepEqual(unpublished.snapshots, []);
  assert.notEqual(mobileOddsRepresentationRevision(published), mobileOddsRepresentationRevision(unpublished));

  const result = await mobileOddsResult(identity, { now, dependencies: {
    readMobilePreviewParticipantContent: async () => ({ payload: { ok: true, data: oddsView("UNPUBLISHED") } }),
  } });
  assert.equal(result.body.data.publication.state, "UNPUBLISHED");
  assert.deepEqual(result.body.data.snapshots, []);
});

test("Odds transient authority errors remain errors rather than fabricated UNPUBLISHED state", async () => {
  await assert.rejects(() => mobileOddsResult(identity, { dependencies: {
    readMobilePreviewParticipantContent: async () => { throw new Error("timeout"); },
  } }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
  assert.throws(() => mobileOddsDataFromView({ publication: { state: "PUBLISHED", revision: 2 }, snapshots: [] }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("Odds rejects malformed odds/records and representation overflows", () => {
  const malformedOdds = oddsView();
  malformedOdds.snapshots[0].payload.players[0].americanOdds = "roughly +400";
  assert.throws(() => mobileOddsDataFromView(malformedOdds),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const malformedRecord = oddsView();
  malformedRecord.snapshots[0].payload.players[0].expectedRecord = "two wins";
  assert.throws(() => mobileOddsDataFromView(malformedRecord),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const tooManyPlayers = oddsView();
  tooManyPlayers.snapshots[0].payload.players = Array.from({ length: 65 }, (_, index) => ({
    ...tooManyPlayers.snapshots[0].payload.players[0], id: `P${index + 1}`,
  }));
  assert.throws(() => mobileOddsDataFromView(tooManyPlayers),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const nonIsoTimestamp = oddsView();
  nonIsoTimestamp.publication.published_at = "August 30, 2026 12:00 UTC";
  assert.throws(() => mobileOddsDataFromView(nonIsoTimestamp),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("Odds rejects absent or blank required numerics instead of fabricating zero", () => {
  const mutations = [
    (view, value) => {
      view.snapshots[0].payload.phaseOrder = value;
      view.snapshots[0].phase_order = value;
    },
    (view, value) => { view.snapshots[0].payload.iterations = value; },
    (view, value) => { view.snapshots[0].payload.totalPointsAvailable = value; },
    (view, value) => { view.snapshots[0].payload.teams[0].side = value; },
    (view, value) => { view.snapshots[0].payload.teams[0].probability = value; },
    (view, value) => { view.snapshots[0].payload.teams[0].expectedPoints = value; },
    (view, value) => { view.snapshots[0].payload.players[0].teamSide = value; },
    (view, value) => { view.snapshots[0].payload.players[0].probability = value; },
    (view, value) => { view.snapshots[0].payload.players[0].expectedPoints = value; },
    (view, value) => { view.snapshots[0].payload.players[0].averageFinish = value; },
  ];
  for (const mutate of mutations) {
    for (const value of [undefined, null, "", "   "]) {
      const malformed = oddsView();
      mutate(malformed, value);
      assert.throws(() => mobileOddsDataFromView(malformed),
        (error) => error.code === "MOBILE_API_UNAVAILABLE");
    }
  }
});

test("Odds enforces bounded expected records and a required valid publication revision", () => {
  const oversizedRecord = oddsView();
  oversizedRecord.snapshots[0].payload.players[0].expectedRecord =
    `${"1".repeat(22)}-${"1".repeat(22)}-${"1".repeat(22)}`;
  assert.ok(oversizedRecord.snapshots[0].payload.players[0].expectedRecord.length > 64);
  assert.throws(() => mobileOddsDataFromView(oversizedRecord),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  for (const revision of [undefined, null, "", "   ", -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const malformed = oddsView();
    malformed.publication.revision = revision;
    assert.throws(() => mobileOddsDataFromView(malformed),
      (error) => error.code === "MOBILE_API_UNAVAILABLE");
  }
});

test("new JSON schemas are strict, bounded, and publication-aware", async () => {
  const [history, detail, records, odds] = await Promise.all([
    source("contracts/mobile/v1/history.schema.json"),
    source("contracts/mobile/v1/history-detail.schema.json"),
    source("contracts/mobile/v1/records.schema.json"),
    source("contracts/mobile/v1/odds.schema.json"),
  ]).then((rows) => rows.map(JSON.parse));
  for (const contract of [history, detail, records, odds]) {
    assert.match(contract.$schema, /2020-12/);
    assert.equal(contract.additionalProperties, false);
    assert.deepEqual(contract.required, ["ok", "apiVersion", "data", "meta"]);
  }
  assert.equal(history.properties.data.properties.tournaments.maxItems, 32);
  assert.equal(detail.properties.data.properties.matches.maxItems, 64);
  assert.equal(detail.properties.data.properties.scorecards.maxItems, 256);
  assert.equal(records.properties.data.properties.categories.maxItems, 10);
  assert.equal(odds.properties.data.properties.snapshots.maxItems, 5);
  assert.match(JSON.stringify(odds.properties.data.allOf), /UNPUBLISHED/);
  assert.match(JSON.stringify([history, detail, records, odds]), /maxLength/);
  assert.match(JSON.stringify([history, detail, records, odds]), /pattern/);
  const oddsConditions = JSON.stringify(odds.properties.data.allOf);
  assert.match(oddsConditions, /publishedAt.*type.*null/);
  assert.match(oddsConditions, /currentPhase.*type.*null/);
});

test("routes share the mobile auth/ETag boundary and adapters contain no client authority or N+1 loop", async () => {
  for (const path of ["history/route.js", "history/[year]/route.js", "records/route.js", "odds/route.js"]) {
    const route = await source(`app/api/mobile/v1/${path}`);
    assert.match(route, /mobileV1ReadResponse/);
    assert.doesNotMatch(route, /searchParams|request\.json|playerId|tournamentId/);
  }
  const [historySource, recordsSource, authoritySource] = await Promise.all([
    source("lib/mobile-v1-history.js"),
    source("lib/mobile-v1-records.js"),
    source("lib/mobile-v1-participant-content-authority.js"),
  ]);
  assert.doesNotMatch(historySource, /loadCompletedHistoryYears/);
  assert.doesNotMatch(recordsSource, /loadCompletedHistoryYears|for \(const .*record.*await/);
  assert.equal((authoritySource.match(/scoringShadowRpc/g) || []).length <= 3, true);
});

test("Preview migration is service-only, participant-bound, bundle-scoped, and has explicit Odds revocation", async () => {
  const sql = await source("supabase/migrations/202608300002_preview_mobile_participant_content_v1.sql");
  assert.match(sql, /read_preview_mobile_participant_content_v1/);
  assert.match(sql, /COMPLETED_HISTORY_BUNDLE/);
  assert.match(sql, /for target_year in 2017\.\.2025 loop/);
  assert.match(sql, /participation_status = 'ACTIVE'/);
  assert.match(sql, /set_preview_mobile_odds_publication/);
  assert.match(sql, /'UNPUBLISHED', 'PUBLISHED'/);
  assert.match(sql, /old\.is_current_official is distinct from true/);
  assert.match(sql, /old\.publication_verified is distinct from true/);
  assert.match(sql, /old\.is_current_official and old\.publication_verified/);
  assert.match(sql, /publication_state = 'UNPUBLISHED'/);
  assert.match(sql, /publication\.current_snapshot_id = old\.id/);
  assert.match(sql, /grant execute on function public\.read_preview_mobile_participant_content_v1\(jsonb\)\s+to service_role/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.match(sql, /revoke all on scoring_authority\.preview_mobile_odds_publications\s+from public, anon, authenticated/);
  assert.doesNotMatch(sql, /PRODUCTION_SUPABASE|production_control|read_production/);
  assert.doesNotMatch(sql, /pg_catalog\.greatest/);
});
