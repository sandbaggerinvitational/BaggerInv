import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCanonicalRecordHolderAuthority } from "../lib/record-holder-authority.js";
import { buildPlayerIntelligence } from "../lib/player-intelligence.js";
import { createHistoricalStatsModel } from "../lib/stats.js";
import {
  buildScorecardRecordLeaderboard,
  buildScorecardRecordLeaderboards,
  SCORECARD_RECORD_SLUGS,
} from "../lib/scorecard-record-leaderboards.js";
import {
  filterScorecards,
} from "../lib/scorecard-analytics.js";
import { indexScorecardsByMatch } from "../lib/scorecard-index.js";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const completedHistoryServiceModule = new URL("../lib/completed-history-service.js", import.meta.url).href;

const pars = Array.from({ length: 18 }, (_, index) =>
  index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5
);
const holes = (adjustment = 0) => pars.map((par, index) => ({
  holeNumber: index + 1,
  par,
  score: par + adjustment,
  toPar: adjustment,
  netScore: par + adjustment,
}));

function individual({ playerId, side, adjustment = 0, matchId = "BB-1", format = "BB" }) {
  const scoringHoles = holes(adjustment);
  return {
    matchId,
    year: 2025,
    round: format === "SI" ? 3 : 1,
    format,
    courseId: "C1",
    courseName: "Test Course",
    status: "COMPLETE",
    completedHoleCount: 18,
    scoreType: "INDIVIDUAL",
    playerId,
    playerName: `Player ${playerId}`,
    playerSlug: `player-${playerId.toLowerCase()}`,
    participantPlayerIds: [playerId],
    participantNames: [`Player ${playerId}`],
    side,
    sideTeamId: side === 1 ? "T1" : "T2",
    holes: scoringHoles,
    total: scoringHoles.reduce((sum, hole) => sum + hole.score, 0),
    totalToPar: adjustment * 18,
    frontNine: scoringHoles.slice(0, 9).reduce((sum, hole) => sum + hole.score, 0),
    backNine: scoringHoles.slice(9).reduce((sum, hole) => sum + hole.score, 0),
    netTotals: {
      total: scoringHoles.reduce((sum, hole) => sum + hole.netScore, 0),
    },
  };
}

function scramble(teamId, playerIds, adjustment = 0) {
  const scoringHoles = holes(adjustment);
  return {
    matchId: `SC-${teamId}`,
    year: 2025,
    round: 2,
    format: "SC",
    courseId: "C2",
    courseName: "Scramble Course",
    status: "VERIFIED",
    completedHoleCount: 18,
    scoreType: "TEAM",
    teamId,
    teamName: `Team ${teamId}`,
    participantPlayerIds: playerIds,
    participantNames: playerIds.map((id) => `Player ${id}`),
    holes: scoringHoles,
    total: scoringHoles.reduce((sum, hole) => sum + hole.score, 0),
    totalToPar: adjustment * 18,
    frontNine: scoringHoles.slice(0, 9).reduce((sum, hole) => sum + hole.score, 0),
    backNine: scoringHoles.slice(9).reduce((sum, hole) => sum + hole.score, 0),
  };
}

function scorecards() {
  const cards = [
    individual({ playerId: "P1", side: 1 }),
    individual({ playerId: "P2", side: 1 }),
    individual({ playerId: "P3", side: 2, adjustment: 1 }),
    individual({ playerId: "P4", side: 2, adjustment: 1 }),
    individual({ playerId: "P1", side: 1, adjustment: -1, matchId: "SI-1", format: "SI" }),
    individual({ playerId: "P3", side: 2, matchId: "SI-1", format: "SI" }),
    scramble("T1", ["P1", "P2"], -1),
    scramble("T2", ["P3", "P4"], 0),
  ];
  const matchNetScoring = {
    available: true,
    rows: [
      { side: 1, type: "BEST_BALL_NET", teamId: "T1", name: "Team T1", available: true, holes: holes(), netTotals: { total: 72, toPar: 0, frontNine: 36, backNine: 36 } },
      { side: 2, type: "BEST_BALL_NET", teamId: "T2", name: "Team T2", available: true, holes: holes(1), netTotals: { total: 90, toPar: 18, frontNine: 45, backNine: 45 } },
    ],
    holeWinners: Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      winnerSide: index < 10 ? "A" : index < 16 ? "B" : undefined,
      winnerType: index >= 16 ? "HALVED" : "PLAYER",
    })),
  };
  cards.filter((card) => card.matchId === "BB-1" || card.matchId === "SI-1")
    .forEach((card) => { card.matchNetScoring = matchNetScoring; });
  return cards;
}

test("scorecard match indexing is one-pass and output-equivalent to repeated filtering", () => {
  const cards = scorecards();
  const ids = new Set(cards.map((card) => card.matchId));
  const indexed = indexScorecardsByMatch(cards, { matchIds: ids });

  for (const matchId of ids) {
    assert.deepEqual(indexed.get(matchId), filterScorecards(cards, { matchId }));
  }
  assert.deepEqual([...indexed.keys()], [...ids]);
});

test("targeted record details are canonical-catalog equivalent for every scorecard record", () => {
  const cards = scorecards();
  const options = {
    playerNames: { P1: "Player P1", P2: "Player P2", P3: "Player P3", P4: "Player P4" },
    ghostMatchExclusions: new Set(),
  };
  const catalog = buildScorecardRecordLeaderboards(cards, options);

  assert.deepEqual(new Set(SCORECARD_RECORD_SLUGS), new Set(Object.keys(catalog.bySlug)));
  for (const slug of SCORECARD_RECORD_SLUGS) {
    assert.deepEqual(
      buildScorecardRecordLeaderboard(slug, cards, options),
      catalog.bySlug[slug],
      slug
    );
  }
});

function emptyRecord() {
  return { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 };
}

test("player intelligence reuses canonical hole/progression derivations without changing output", () => {
  const cards = scorecards();
  const stats = {
    records: { overall: emptyRecord(), BB: emptyRecord(), SC: emptyRecord(), SI: emptyRecord() },
    percentages: { overall: 0, BB: 0, SC: 0, SI: 0 },
    appearances: [2025],
    championships: [],
    careerTimeline: [{ year: 2025, attended: true, result: "Completed" }],
    seasons: [{ year: 2025, overall: emptyRecord(), teamResolved: false }],
  };
  const players = ["P1", "P2", "P3", "P4"].map((id) => ({
    player: { "Player ID": id, "Display Name": `Player ${id}` },
    stats,
  }));
  const officialRecords = {
    all: players,
    points: players,
    wins: players,
    percentage: [],
  };
  const authority = buildCanonicalRecordHolderAuthority({
    scorecards: cards,
    playerNames: Object.fromEntries(players.map(({ player }) => [player["Player ID"], player["Display Name"]])),
  });
  const input = {
    playerId: "P1",
    stats,
    allPlayerStats: players,
    officialRecords,
    scorecards: cards,
    recordsHeld: authority.recordsHeldForPlayer("P1"),
  };

  assert.deepEqual(
    buildPlayerIntelligence({
      ...input,
      holePlayers: authority.scorecardCatalog.playerAnalytics,
      matchProgression: authority.matchProgression,
    }),
    buildPlayerIntelligence(input)
  );

  const canonicalCareerCards = cards.map((card) => card.playerId === "P1"
    ? { ...card, holes: holes(4) }
    : card);
  const canonicalCareer = buildPlayerIntelligence({
    ...input,
    scorecards: canonicalCareerCards,
  });
  const crossPopulationReuse = buildPlayerIntelligence({
    ...input,
    scorecards: canonicalCareerCards,
    holePlayers: authority.scorecardCatalog.playerAnalytics,
    matchProgression: authority.matchProgression,
  });
  assert.notDeepEqual(crossPopulationReuse.hole, canonicalCareer.hole);
});

test("request-local statistics memoization freezes reused outputs and shared head-to-head inputs", () => {
  const model = createHistoricalStatsModel({
    players: [],
    tournaments: [{ Year: 2025, "Tournament ID": "T2025" }],
    teamNames: [],
    matches: [],
    rounds: [],
    rules: [],
    awards: [],
    courses: [],
    handicaps: [],
    ghostMatches: [],
  });
  const records = model.getRecords();
  assert.equal(model.getRecords(), records);
  assert.equal(Object.isFrozen(records), true);
  assert.equal(Object.isFrozen(records.all), true);
  assert.throws(() => records.all.push({}), TypeError);
  assert.deepEqual(model.getHeadToHead("P1", "P2"), model.getHeadToHead("P1", "P2"));
});

const completedHistoryEnv = Object.freeze({
  VERCEL_ENV: "preview",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "test-service-key",
});

test("completed-year aggregate reads reuse exact revision/fingerprint views and refetch only changes", async () => {
  const script = `
    import { loadCompletedHistoryYears } from ${JSON.stringify(completedHistoryServiceModule)};
    const env = ${JSON.stringify(completedHistoryEnv)};
    const revisions = new Map(Array.from({ length: 9 }, (_, index) => {
      const year = 2017 + index;
      return [year, { tournament_year: year, revision_id: year + '-r1', payload_fingerprint: year + '-f1' }];
    }));
    const viewCache = new Map();
    const calls = [];
    const reader = async ({ mode, year }) => {
      calls.push({ mode, year });
      if (mode === 'YEARS') return { payload: { ok: true, data: [...revisions.values()] }, durationMs: 1 };
      const revision = revisions.get(Number(year));
      return { payload: { ok: true, data: { revision, tournament: { tournament_year: Number(year), tournament_id: String(year) } } }, durationMs: 2 };
    };
    const dependencies = {
      readCompletedHistory: reader,
      completedHistoryViewCache: viewCache,
      buildCompletedHistoryPresentation: (data) => ({
        source: 'supabase', year: Number(data.revision.tournament_year),
        tournament: { year: Number(data.revision.tournament_year) },
        diagnostics: { revisionId: data.revision.revision_id },
      }),
    };
    const first = await loadCompletedHistoryYears({ env, dependencies });
    const firstCalls = calls.length;
    const second = await loadCompletedHistoryYears({ env, dependencies });
    const secondCalls = calls.length;
    revisions.set(2025, { tournament_year: 2025, revision_id: '2025-r2', payload_fingerprint: '2025-f2' });
    const corrected = await loadCompletedHistoryYears({ env, dependencies });
    console.log(JSON.stringify({
      firstCalls, secondCalls, finalCalls: calls.length,
      firstHits: first.diagnostics.revisionCacheHits,
      secondHits: second.diagnostics.revisionCacheHits,
      correctedHits: corrected.diagnostics.revisionCacheHits,
      firstYears: first.views.map((view) => view.year),
      secondYears: second.views.map((view) => view.year),
      correctedRevision: corrected.views.at(-1).diagnostics.revisionId,
    }));
  `;
  const child = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout.trim());
  assert.equal(result.firstCalls, 10);
  assert.equal(result.firstHits, 0);
  assert.equal(result.secondCalls, 11);
  assert.equal(result.secondHits, 9);
  assert.deepEqual(result.secondYears, result.firstYears);
  assert.equal(result.finalCalls, 13);
  assert.equal(result.correctedHits, 8);
  assert.equal(result.correctedRevision, "2025-r2");
});

test("completed-year cache is resource-scoped, fingerprint-bound, and rejects index/YEAR races", async () => {
  const script = `
    import {
      completedHistoryRevisionCacheKey,
      loadCompletedHistoryYears,
    } from ${JSON.stringify(completedHistoryServiceModule)};
    const env = ${JSON.stringify(completedHistoryEnv)};
    const revision = { tournament_year: 2025, revision_id: 'r2', payload_fingerprint: 'f2' };
    const previewSource = {
      preview: true,
      projectRef: 'preview-project',
    };
    const productionSource = {
      productionCutover: {
        handled: true,
        activation: { resources: {
          projectRef: 'production-project', workbookId: 'production-workbook',
          tournamentId: 'T2026', tournamentYear: 2026,
        } },
      },
    };
    const previewKey = completedHistoryRevisionCacheKey(revision, previewSource);
    const productionKey = completedHistoryRevisionCacheKey(revision, productionSource);
    const noFingerprintKey = completedHistoryRevisionCacheKey({ ...revision, payload_fingerprint: '' }, previewSource);

    const revisions = Array.from({ length: 9 }, (_, index) => {
      const year = 2017 + index;
      return { tournament_year: year, revision_id: year + '-r2', payload_fingerprint: year + '-f2' };
    });
    const cache = new Map();
    let coherent = false;
    const reader = async ({ mode, year }) => {
      if (mode === 'YEARS') return { payload: { ok: true, data: revisions }, durationMs: 1 };
      const expected = revisions.find((row) => row.tournament_year === Number(year));
      const returned = Number(year) === 2025 && !coherent
        ? { ...expected, revision_id: '2025-r1', payload_fingerprint: '2025-f1' }
        : expected;
      return { payload: { ok: true, data: {
        revision: returned,
        tournament: { tournament_year: Number(year), tournament_id: String(year) },
      } }, durationMs: 1 };
    };
    const dependencies = {
      readCompletedHistory: reader,
      completedHistoryViewCache: cache,
      buildCompletedHistoryPresentation: (data) => ({
        source: 'supabase', year: Number(data.revision.tournament_year),
        tournament: { year: Number(data.revision.tournament_year) },
      }),
    };
    let mismatchCode = '';
    try { await loadCompletedHistoryYears({ env, dependencies }); }
    catch (error) { mismatchCode = error.code; }
    const cacheAfterMismatch = cache.size;
    coherent = true;
    const recovered = await loadCompletedHistoryYears({ env, dependencies });
    console.log(JSON.stringify({
      previewKey, productionKey, noFingerprintKey,
      mismatchCode, cacheAfterMismatch,
      recoveredRevision: recovered.revisions.at(-1).revision_id,
    }));
  `;
  const child = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout.trim());
  assert.notEqual(result.previewKey, result.productionKey);
  assert.equal(result.noFingerprintKey, "");
  assert.equal(result.mismatchCode, "COMPLETED_HISTORY_REVISION_CHANGED");
  assert.equal(result.cacheAfterMismatch, 8);
  assert.equal(result.recoveredRevision, "2025-r2");
});

test("priority route source contains deterministic read/derivation/payload budgets", async () => {
  const [player, round, record, team, lineupRuntime, tournamentLeaderboard, completed, secondary, dispatch] = await Promise.all([
    source("app/players/[slug]/page.js"),
    source("app/history/[year]/round/[round]/page.js"),
    source("app/records/[slug]/page.js"),
    source("app/war-room/team-intelligence/TeamIntelligence.js"),
    source("lib/team-intelligence-lineup-runtime.js"),
    source("app/TournamentLeaderboard.js"),
    source("lib/completed-history-service.js"),
    source("lib/secondary-history-service.js"),
    source("lib/production-current-read-dispatch.js"),
  ]);

  assert.equal((player.match(/readSupabaseRecords\(\)/g) || []).length, 1);
  assert.match(player, /\.\.\.\(useSupabase \? \{[\s\S]*holePlayers: recordAuthority\.scorecardCatalog\.playerAnalytics[\s\S]*matchProgression: recordAuthority\.matchProgression/);
  assert.match(player, /scorecardPresentationData/);
  assert.match(round, /indexScorecardsByMatch\(presentationScorecards\)/);
  assert.doesNotMatch(round, /filterScorecards\(presentationScorecards, \{ matchId \}\)/);
  assert.match(record, /buildScorecardRecordLeaderboard\(slug/);
  assert.doesNotMatch(record, /buildCanonicalRecordHolderAuthority/);
  assert.match(team, /buildTeamIntelligenceLineupRuntime/);
  assert.doesNotMatch(team, /optimizeLineups\(\{/);
  assert.match(lineupRuntime, /\["BB", "SC"\]/);
  assert.doesNotMatch(tournamentLeaderboard, /^"use client";/);
  assert.match(completed, /revisionCacheHits/);
  assert.match(secondary, /cache\(\(env, timeoutMs\)/);
  assert.match(dispatch, /readCachedProductionCurrentTournamentRuntime/);
});
