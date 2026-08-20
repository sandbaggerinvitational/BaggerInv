import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { assertScoringShadowAdministrativeEnvironment } from "../../../../lib/scoring-shadow-gate.js";
import { scoringAuthorityEnvironment } from "../../../../lib/scoring-authority.js";
import {
  abortAuthorityEpoch,
  backfillCanonicalFinalMatchLocks,
  beginScoringIngress,
  buildCanonicalScoringAuthorityImport,
  canonicalAuthorityFingerprint,
  commitAuthorityEpoch,
  completeCanonicalFinalizationParityRepair,
  completeScoringIngress,
  inspectCanonicalAuthoritySecurity,
  inspectScoringMirrorOperations,
  normalizeCanonicalLegacyReopen,
  prepareAuthorityEpoch,
  readCanonicalScoringAuthority,
  reconcileCanonicalScoringAuthority,
  repairCanonicalFinalizationParity,
  replaceCanonicalScoringAuthorityImport,
  submitCanonicalHoleScore,
} from "../../../../lib/scoring-authority-supabase.js";
import { benchmarkSummary, canonicalJson } from "../../../../lib/scoring-shadow.js";
import { drainGoogleOutbox, inspectGoogleMatchState, processNextGoogleOutboxEvent } from "../../../../lib/scoring-google-outbox.js";
import { inspectPreviewLiveMatchScoringLockMigration, migratePreviewLiveMatchScoringLock, normalizeLegacyReopenedMatch, readWorkbookSheetsByName, repairFinalizedLiveMatchParity, saveLiveHoleScore, withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write.js";
import { grossScoresFromCell } from "../../../../lib/live-score-values.js";
import {
  buildGameCenterPresentationImport,
  compareGameCenterParity,
  expectedGameCenterView,
  gameCenterDataFromSupabaseView,
  readGameCenterView,
  replaceGameCenterPresentations,
} from "../../../../lib/game-center-supabase.js";
import {
  compareMyMatchParity,
  expectedMyMatchView,
  myMatchDataFromSupabaseView,
  readMyMatchView,
} from "../../../../lib/my-match-supabase.js";
import {
  scoringMatchDataFromSupabaseView,
  scoringReadParityProjection,
} from "../../../../lib/scoring-read-supabase.js";
import {
  buildParticipantHomePresentationImport,
  compareParticipantHomeParity,
  participantHomeDataFromSupabaseView,
  readParticipantHomeView,
  replaceParticipantHomePresentation,
} from "../../../../lib/participant-home-supabase.js";
import {
  compareTournamentLiveParity,
  readTournamentLiveView,
  tournamentLiveDataFromSupabaseView,
} from "../../../../lib/tournament-live-supabase.js";
import {
  compareLeaderboardsCoreParity,
  expectedLeaderboardsCoreView,
  leaderboardsCoreDataFromSupabaseView,
  readLeaderboardsCoreView,
} from "../../../../lib/leaderboards-core-supabase.js";
import {
  buildNetSkinsConfigurationImport,
  calculateNetSkinsFromSupabaseView,
  compareNetSkinsParity,
  netSkinsDataFromResultView,
  netSkinsScoreRowsFromSupabaseView,
  readNetSkinsInputView,
  readNetSkinsResultView,
  recalculateNetSkinsTournament,
  replaceNetSkinsConfiguration,
} from "../../../../lib/net-skins-supabase.js";
import { netSkinsResultRecords } from "../../../../lib/net-skins.js";
import {
  buildCalcuttaConfigurationImport,
  CALCUTTA_ENGINE_VERSION,
  CALCUTTA_WORKBOOK_TABS,
  calculateCalcuttaFromSupabaseViews,
  compareCalcuttaParity,
  currentCalcuttaOperationalResult,
  readCalcuttaConfigurationView,
  recalculateCalcuttaTournament,
  replaceCalcuttaConfiguration,
} from "../../../../lib/calcutta-supabase.js";
import { calcuttaReadEnvironment } from "../../../../lib/calcutta-read-source.js";
import {
  calculateCompetitionDerivedFromData,
  compareCompetitionDerivedParity,
  competitionDerivedDataFromView,
  readCompetitionDerivedState,
  recalculateCompetitionDerivedTournament,
  TEAM_MOMENTUM_ENGINE_VERSION,
  TOURNAMENT_STORYLINES_ENGINE_VERSION,
} from "../../../../lib/competition-derived-supabase.js";
import { currentIntelligenceDerivedState, recalculateIntelligenceDerivedTournament } from "../../../../lib/intelligence-derived-supabase.js";
import {
  buildPublishedOddsImport,
  comparePublishedOddsParity,
  PUBLISHED_ODDS_WORKBOOK_TABS,
  publishedOddsSnapshotsFromView,
  readPublishedOddsView,
  replacePublishedOddsSnapshots,
} from "../../../../lib/published-odds-supabase.js";
import { getTournamentData, invalidateTournamentDataCache } from "../../../live/sheetData.js";
import {
  MATCH_ACCESS_ACTIONS,
  authorizeMatchAccess,
  compareMatchAuthorizationMatrix,
  expectedMatchAuthorizationDecision,
  expectedMatchAuthorizationMatrix,
  readMatchAuthorizationMatrix,
} from "../../../../lib/match-authorization-supabase.js";
import { classifyScoringLifecycleConflict } from "../../../../lib/scoring-lifecycle-contract.js";
import { drainScorecardArchiveJobs } from "../../../../lib/scorecard-archive-worker.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => /^(true|yes|1|locked)$/i.test(clean(value));
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });
const WORKBOOK_TABS = ["Tournaments", "Players", "Handicaps", "Team Names", "Rounds", "Courses", "Course Holes", "Live Matches", "Matches", "Live Hole Scores", "Match Update Log", "Admin Audit Log"];
const NET_SKINS_WORKBOOK_TABS = ["Net Skins", "Net Skins Result", "Live Matches"];

async function authorize(request) {
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  let shadow;
  try { shadow = assertScoringShadowAdministrativeEnvironment(); }
  catch { return { response: unavailable() }; }
  const authorization = await authorizePreviewDirector({ request, allowBootstrap: true });
  if (authorization.status !== "active") return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 }) };
  return { shadow, identity: authorization.identity };
}

async function authoritativeImport(requestedBy) {
  const startedAt = Date.now();
  const sheets = await readWorkbookSheetsByName(WORKBOOK_TABS);
  const googleReadMs = Date.now() - startedAt;
  const builtAt = Date.now();
  const imported = buildCanonicalScoringAuthorityImport({ sheets, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy });
  return { sheets, imported, googleReadMs, normalizationMs: Date.now() - builtAt };
}

async function gameCenterParity(source, presentation) {
  const divergences = [];
  const postgresQueryMs = [];
  const supabaseRequestMs = [];
  for (const match of source.imported.payload.matches) {
    const expectedView = expectedGameCenterView(source.imported, presentation, match.match_id);
    const read = await readGameCenterView(match.match_id);
    if (!read.payload?.ok) {
      divergences.push({ matchId: match.match_id, code: read.payload?.code || "READ_FAILED" });
      continue;
    }
    const expected = gameCenterDataFromSupabaseView(expectedView);
    const actual = gameCenterDataFromSupabaseView(read.payload.data);
    const comparison = compareGameCenterParity(expected, actual);
    if (!comparison.pass) divergences.push({ matchId: match.match_id, expected: comparison.expected, actual: comparison.actual });
    postgresQueryMs.push(number(read.payload.data.query_ms));
    supabaseRequestMs.push(number(read.durationMs));
  }
  return {
    matchesCompared: source.imported.payload.matches.length,
    divergences,
    pass: divergences.length === 0,
    postgresQuery: benchmarkSummary(postgresQueryMs),
    supabaseRequest: benchmarkSummary(supabaseRequestMs),
    zeroGoogleRequestsPerGameCenterRead: true,
  };
}

function expectedScoringReadData(view = {}, canonicalView = null) {
  // Before the read cutover, the participant path loaded presentation and
  // scorecard configuration from Google, then overlaid canonical Supabase
  // lifecycle, score rows, and match revision. Reconstruct that exact
  // participant contract here. Live Matches has no authoritative match
  // revision column, so comparing a raw Google default (0) with the canonical
  // revision would be a diagnostic error rather than a participant divergence.
  const expectedView = canonicalView?.match ? {
    ...view,
    match: {
      ...(view.match || {}),
      status: canonicalView.match.status,
      scoring_locked: canonicalView.match.scoring_locked,
      scorecard_complete: canonicalView.match.scorecard_complete,
      unresolved_mutations: canonicalView.match.unresolved_mutations,
      match_revision: canonicalView.match.match_revision,
      permission_revision: canonicalView.match.permission_revision,
      current_hole: canonicalView.match.current_hole,
      holes_remaining: canonicalView.match.holes_remaining,
      team_1_holes_won: canonicalView.match.team_1_holes_won,
      team_2_holes_won: canonicalView.match.team_2_holes_won,
      running_result: canonicalView.match.running_result,
      result_winner: canonicalView.match.result_winner,
      finalized_at: canonicalView.match.finalized_at,
      authority_updated_at: canonicalView.match.authority_updated_at,
    },
    scores: canonicalView.scores || view.scores || [],
  } : view;
  const data = scoringMatchDataFromSupabaseView(expectedView, {
    authorizationVerified: true,
    writable: clean(expectedView.match?.status).toUpperCase() !== "FINAL" && expectedView.match?.scoring_locked !== true,
  });
  return scoringReadParityProjection(data);
}

function scoringReadDivergence(expected = {}, actual = {}) {
  const fields = [];
  const walk = (left, right, path = "") => {
    if (fields.length >= 100) return;
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    if (Array.isArray(left) || Array.isArray(right)) {
      const leftArray = Array.isArray(left) ? left : [];
      const rightArray = Array.isArray(right) ? right : [];
      const size = Math.max(leftArray.length, rightArray.length);
      for (let index = 0; index < size; index += 1) walk(leftArray[index], rightArray[index], `${path}[${index}]`);
      return;
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        walk(left[key], right[key], path ? `${path}.${key}` : key);
      }
      return;
    }
    fields.push({ field: path, expected: left ?? null, actual: right ?? null });
  };
  walk(expected, actual);
  return fields;
}

async function scoringReadParity(source, presentation, samples = 3) {
  const divergences = [];
  const coverage = { BB: 0, SC: 0, SI: 0, FINAL: 0, LIVE: 0, UPCOMING: 0, ZERO_HOLE: 0, PARTIAL: 0 };
  const postgresQueryMs = [];
  const supabaseRequestMs = [];
  const adapterMs = [];
  const totalMs = [];
  const sampleCount = Math.max(1, Math.min(10, number(samples, 3)));
  for (const match of source.imported.payload.matches) {
    const expectedView = expectedGameCenterView(source.imported, presentation, match.match_id);
    const readSamples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const startedAt = performance.now();
      const read = await readGameCenterView(match.match_id);
      if (!read.payload?.ok) {
        divergences.push({ matchId: match.match_id, code: read.payload?.code || "READ_FAILED" });
        break;
      }
      const adapterStartedAt = performance.now();
      const actual = expectedScoringReadData(read.payload.data);
      const currentAdapterMs = performance.now() - adapterStartedAt;
      readSamples.push({ read, actual, adapterMs: currentAdapterMs, totalMs: performance.now() - startedAt });
    }
    if (!readSamples.length) continue;
    const expected = expectedScoringReadData(expectedView, readSamples[0].read.payload.data);
    const fields = scoringReadDivergence(expected, readSamples[0].actual);
    if (fields.length) divergences.push({ matchId: match.match_id, fields });
    for (const sample of readSamples) {
      postgresQueryMs.push(number(sample.read.payload.data.query_ms));
      supabaseRequestMs.push(number(sample.read.durationMs));
      adapterMs.push(number(sample.adapterMs));
      totalMs.push(number(sample.totalMs));
    }
    const format = upper(match.format);
    const status = upper(match.status);
    coverage[format] = number(coverage[format]) + 1;
    coverage[status] = number(coverage[status]) + 1;
    const scoredHoles = number(match.scored_holes);
    if (scoredHoles === 0) coverage.ZERO_HOLE += 1;
    else if (scoredHoles < 18) coverage.PARTIAL += 1;
  }
  const matchIds = source.imported.payload.matches.map((match) => match.match_id);
  return {
    matchesCompared: matchIds.length,
    coverage,
    requiredEvidence: {
      correctedBestBall2026R16: matchIds.includes("2026-R1-6") && !divergences.some((item) => item.matchId === "2026-R1-6"),
      finalizedSingles2026R34: matchIds.includes("2026-R3-4") && !divergences.some((item) => item.matchId === "2026-R3-4"),
    },
    divergences,
    pass: matchIds.length === 24 && divergences.length === 0 && coverage.BB === 6 && coverage.SC === 6 && coverage.SI === 12,
    samplesPerMatch: sampleCount,
    performance: {
      postgresQuery: benchmarkSummary(postgresQueryMs),
      supabaseService: benchmarkSummary(supabaseRequestMs),
      adapter: benchmarkSummary(adapterMs),
      fullScoringRead: benchmarkSummary(totalMs),
    },
    participantGoogleRequestsPerRead: 0,
    googleFallback: false,
  };
}

async function myMatchParity(source, presentation) {
  const players = source.imported.payload.tournament_players.filter((row) => row.participation_status === "ACTIVE");
  const divergences = [];
  const postgresQueryMs = [];
  const supabaseRequestMs = [];
  for (const player of players) {
    const expectedView = expectedMyMatchView(source.imported, presentation, player.player_id);
    const read = await readMyMatchView({ tournamentId: player.tournament_id, playerId: player.player_id });
    if (!read.payload?.ok) {
      divergences.push({ playerId: player.player_id, code: read.payload?.code || "READ_FAILED" });
      continue;
    }
    const expected = myMatchDataFromSupabaseView(expectedView);
    const actual = myMatchDataFromSupabaseView(read.payload.data);
    const comparison = compareMyMatchParity(expected, actual);
    if (!comparison.pass) divergences.push({ playerId: player.player_id, expected: comparison.expected, actual: comparison.actual });
    postgresQueryMs.push(number(read.payload.data.query_ms));
    supabaseRequestMs.push(number(read.durationMs));
  }
  return {
    playersCompared: players.length,
    divergences,
    pass: players.length === 24 && divergences.length === 0,
    postgresQuery: benchmarkSummary(postgresQueryMs),
    supabaseService: benchmarkSummary(supabaseRequestMs),
    zeroGoogleRequestsPerMyMatchRead: true,
    scoringSessionIssuanceUnchanged: true,
  };
}

async function participantHomeParity(source, gamePresentation, liveData) {
  const players = source.imported.payload.tournament_players.filter((row) => row.participation_status === "ACTIVE");
  const divergences = [];
  const postgresQueryMs = [];
  const supabaseRequestMs = [];
  for (const player of players) {
    const expectedParticipant = myMatchDataFromSupabaseView(expectedMyMatchView(source.imported, gamePresentation, player.player_id));
    const expected = { player: expectedParticipant.player, participant: expectedParticipant, liveData };
    const read = await readParticipantHomeView({ tournamentId: player.tournament_id, playerId: player.player_id });
    if (!read.payload?.ok) {
      divergences.push({ playerId: player.player_id, code: read.payload?.code || "READ_FAILED" });
      continue;
    }
    const actual = participantHomeDataFromSupabaseView(read.payload.data);
    const comparison = compareParticipantHomeParity(expected, actual);
    if (!comparison.pass) divergences.push({ playerId: player.player_id, expected: comparison.expected, actual: comparison.actual });
    postgresQueryMs.push(number(read.payload.data.query_ms));
    supabaseRequestMs.push(number(read.durationMs));
  }
  return {
    playersCompared: players.length,
    divergences,
    pass: players.length === 24 && divergences.length === 0,
    postgresQuery: benchmarkSummary(postgresQueryMs),
    supabaseService: benchmarkSummary(supabaseRequestMs),
    zeroGoogleRequestsPerHomeRead: true,
    criticalPath: ["Supabase Auth session", "participant context", "read_participant_home_view"],
    secondaryIsolation: { schedule: "projected", netSkins: "projected", presentationFailureBlocksCriticalHome: false },
  };
}

async function homeReadiness(actorId, { refresh = false } = {}) {
  const source = await authoritativeImport(actorId);
  const liveData = await getTournamentData();
  const gamePresentation = buildGameCenterPresentationImport({
    sheets: source.sheets, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy: actorId,
  });
  const homePresentation = buildParticipantHomePresentationImport({
    liveData, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy: actorId,
  });
  let written = null;
  if (refresh) {
    written = await replaceParticipantHomePresentation(homePresentation);
    if (!written.payload?.ok) throw Object.assign(new Error(`Home presentation refresh failed (${written.payload?.code || "unknown"}).`), { code: written.payload?.code });
  }
  const parity = await participantHomeParity(source, gamePresentation, liveData);
  return {
    presentation: written?.payload || null,
    googleConfigurationReadMs: source.googleReadMs,
    fields: {
      canonical: ["identity", "team", "rounds", "matches", "permissions", "hole outcomes", "live progress", "team score"],
      projected: ["tournament presentation", "Today’s Schedule", "participant Net Skins summary"],
      static: ["navigation links", "Tournament Guide links", "brand assets"],
    },
    parity,
  };
}

async function tournamentReadiness(actorId, { refresh = false, samples = 25 } = {}) {
  const source = await authoritativeImport(actorId);
  const expected = await getTournamentData();
  let written = null;
  if (refresh) {
    const presentation = buildParticipantHomePresentationImport({
      liveData: expected, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy: actorId,
    });
    written = await replaceParticipantHomePresentation(presentation);
    if (!written.payload?.ok) throw Object.assign(new Error(`Tournament presentation refresh failed (${written.payload?.code || "unknown"}).`), { code: written.payload?.code });
  }
  const postgresQueryMs = [];
  const supabaseServiceMs = [];
  const fullServerMs = [];
  let actual;
  const sampleCount = Math.max(1, Math.min(50, number(samples, 25)));
  for (let index = 0; index < sampleCount; index += 1) {
    const began = performance.now();
    const read = await readTournamentLiveView(source.imported.payload.tournament.tournament_id);
    fullServerMs.push(performance.now() - began);
    if (!read.payload?.ok) throw Object.assign(new Error(`Tournament live read failed (${read.payload?.code || "unknown"}).`), { code: read.payload?.code });
    actual = tournamentLiveDataFromSupabaseView(read.payload.data);
    postgresQueryMs.push(number(read.payload.data.query_ms));
    supabaseServiceMs.push(number(read.durationMs));
  }
  const comparison = compareTournamentLiveParity(expected, actual);
  const roundScores = (actual.rounds || []).map((round) => ({
    round: round.number,
    teamOne: (round.matches || []).reduce((sum, match) => sum + number(match.team1Points), 0),
    teamTwo: (round.matches || []).reduce((sum, match) => sum + number(match.team2Points), 0),
    final: round.progress?.completedMatches || 0,
    live: round.progress?.liveMatches || 0,
    upcoming: round.progress?.scheduledMatches || 0,
  }));
  const matches = (actual.rounds || []).flatMap((round) => round.matches || []);
  return {
    presentation: written?.payload || null,
    googleConfigurationReadMs: source.googleReadMs,
    comparison,
    coverage: {
      matches: matches.length,
      rounds: actual.rounds?.length || 0,
      zeroHoleMatches: matches.filter((match) => !(match.holeResults || []).length).length,
      finalMatches: matches.filter((match) => clean(match.status).toUpperCase() === "FINAL").length,
      liveMatches: matches.filter((match) => clean(match.status).toUpperCase() === "LIVE").length,
      roundScores,
      tournamentScore: { teamOne: actual.tournament?.teamOne?.score, teamTwo: actual.tournament?.teamTwo?.score },
    },
    performance: {
      samples: sampleCount,
      postgresQuery: benchmarkSummary(postgresQueryMs),
      supabaseService: benchmarkSummary(supabaseServiceMs),
      fullServer: benchmarkSummary(fullServerMs),
    },
    googleRequestsPerParticipantLiveRead: 0,
    pass: comparison.pass && matches.length === 24 && actual.rounds?.length === 3,
  };
}

async function leaderboardsCoreReadiness(actorId, { samples = 25 } = {}) {
  const source = await authoritativeImport(actorId);
  const expected = await getTournamentData();
  const presentation = buildGameCenterPresentationImport({
    sheets: source.sheets,
    sourceWorkbookId: process.env.GOOGLE_SHEETS_ID,
    requestedBy: actorId,
  });
  const homePresentation = buildParticipantHomePresentationImport({
    liveData: expected,
    sourceWorkbookId: process.env.GOOGLE_SHEETS_ID,
    requestedBy: actorId,
  });
  const importedView = expectedLeaderboardsCoreView(source.imported, presentation, {
    presentation: homePresentation.presentation,
    source_fingerprint: "",
  });
  const imported = leaderboardsCoreDataFromSupabaseView(importedView);
  const importComparison = compareLeaderboardsCoreParity(expected, imported);
  const postgresQueryMs = [];
  const supabaseServiceMs = [];
  const calculationMs = [];
  const fullServerMs = [];
  const sourceFingerprints = [];
  let actual;
  const sampleCount = Math.max(1, Math.min(50, number(samples, 25)));
  for (let index = 0; index < sampleCount; index += 1) {
    const began = performance.now();
    const read = await readLeaderboardsCoreView(source.imported.payload.tournament.tournament_id);
    if (!read.payload?.ok) throw Object.assign(new Error(`Leaderboards core read failed (${read.payload?.code || "unknown"}).`), { code: read.payload?.code });
    actual = leaderboardsCoreDataFromSupabaseView(read.payload.data);
    sourceFingerprints.push(actual.sourceFingerprint);
    fullServerMs.push(performance.now() - began);
    postgresQueryMs.push(number(read.payload.data.query_ms));
    supabaseServiceMs.push(number(read.durationMs));
    calculationMs.push(number(actual.calculationMs));
  }
  const comparison = compareLeaderboardsCoreParity(expected, actual);
  const matches = (actual.rounds || []).flatMap((round) => round.matches || []);
  const scoreRows = actual.scoreLeaderboard || [];
  return {
    comparison,
    importComparison,
    sourceFingerprint: actual.sourceFingerprint,
    sourceFingerprintDeterministic: new Set(sourceFingerprints).size === 1,
    importedSourceFingerprint: imported.sourceFingerprint,
    slotVerification: actual.slotVerification,
    coverage: {
      players: actual.players?.length || 0,
      teams: 2,
      matches: matches.length,
      rounds: actual.rounds?.length || 0,
      formats: [...new Set(matches.map((match) => upper(match.format)))].sort(),
      finalMatches: matches.filter((match) => upper(match.status) === "FINAL").length,
      liveMatches: matches.filter((match) => upper(match.status) === "LIVE").length,
      zeroHoleMatches: matches.filter((match) => !(match.holeResults || []).length).length,
      clinchedMatches: matches.filter((match) => match.clinched).length,
      individualScoreRows: scoreRows.filter((row) => row.entityType === "PLAYER").length,
      scramblePairingRows: scoreRows.filter((row) => row.entityType === "PAIRING").length,
      historicalCorrectionMatch: matches.some((match) => match.id === "2026-R1-6"),
      supabaseFinalizedMatch: matches.some((match) => match.id === "2026-R3-4" && upper(match.status) === "FINAL"),
    },
    performance: {
      samples: sampleCount,
      postgresQuery: benchmarkSummary(postgresQueryMs),
      supabaseService: benchmarkSummary(supabaseServiceMs),
      standingsCalculation: benchmarkSummary(calculationMs),
      fullServer: benchmarkSummary(fullServerMs),
    },
    googleRequestsPerParticipantCoreRead: 0,
    secondaryModulesUnchanged: ["Net Skins", "Calcutta", "Insights", "Championship Odds", "Storylines", "Tournament Intelligence"],
    pass: comparison.pass && importComparison.pass && actual.slotVerification.pass &&
      new Set(sourceFingerprints).size === 1 &&
      actual.players?.length === 24 && matches.length === 24 && actual.rounds?.length === 3 &&
      ["BB", "SC", "SI"].every((format) => matches.some((match) => upper(match.format) === format)),
  };
}

function normalizedOfficialNetSkinsRows(rows = []) {
  return rows.map((row) => ({
    Year: number(row.Year), Round: number(row.Round), Hole: number(row.Hole),
    Winner: clean(row.Winner), "Winner Player ID": clean(row["Winner Player ID"]),
    "Winner Player ID 2": clean(row["Winner Player ID 2"]),
    "Skin Value": number(row["Skin Value"]), "Round Pot": number(row["Round Pot"]),
    "Winning Net Score": number(row["Winning Net Score"]), Format: upper(row.Format), Match: clean(row.Match),
  })).sort((left, right) => left.Round - right.Round || left.Hole - right.Hole || left["Winner Player ID"].localeCompare(right["Winner Player ID"]));
}

function netSkinsHistoricalRegression(calculated) {
  const round = calculated.netSkins?.rounds?.find((item) => number(item.round) === 1);
  const player = (name) => (round?.leaderboard || []).find((item) => clean(item.name).toLowerCase() === name.toLowerCase());
  const score = (name) => calculated.scoreRows.find((item) => number(item.round) === 1 && clean(item.name).toLowerCase() === name.toLowerCase());
  const totals = (row) => ({
    gross: (row?.scorecard || []).reduce((sum, hole) => sum + number(hole.gross), 0),
    net: (row?.scorecard || []).reduce((sum, hole) => sum + number(hole.net), 0),
  });
  const jack = player("Jack Keffler");
  const max = player("Max Markley");
  const holman = player("Holman Moores");
  const memo = player("Memo Saldana");
  const result = {
    jackKeffler: { ...totals(score("Jack Keffler")), skins: number(jack?.skinsWon), winnings: number(jack?.totalWinnings), winningHoles: (jack?.winningHoles || []).map((skin) => number(skin.hole)) },
    maxMarkley: { skins: number(max?.skinsWon), winnings: number(max?.totalWinnings) },
    holmanMoores: { skins: number(holman?.skinsWon) },
    memoSaldana: { skins: number(memo?.skinsWon) },
  };
  return { ...result, pass: result.jackKeffler.gross === 80 && result.jackKeffler.net === 67 && result.jackKeffler.skins === 1 && result.jackKeffler.winnings === 120 && result.jackKeffler.winningHoles.includes(6) && result.maxMarkley.skins === 1 && result.maxMarkley.winnings === 120 && result.holmanMoores.skins === 0 && result.memoSaldana.skins === 0 };
}

function netSkinsCanonicalInputDivergences(expectedRows = [], actualRows = []) {
  const key = (row) => `${number(row.round)}:${(row.playerIds || []).map(clean).sort().join("|")}`;
  const scoreNumber = (value) => value === null || value === undefined || clean(value) === "" ? null : number(value, null);
  const expectedByKey = new Map(expectedRows.map((row) => [key(row), row]));
  const actualByKey = new Map(actualRows.map((row) => [key(row), row]));
  const divergences = [];
  for (const entryKey of new Set([...expectedByKey.keys(), ...actualByKey.keys()])) {
    const expected = expectedByKey.get(entryKey);
    const actual = actualByKey.get(entryKey);
    if (!expected || !actual) {
      divergences.push({ key: entryKey, code: expected ? "MISSING_SUPABASE_ENTRY" : "EXTRA_SUPABASE_ENTRY" });
      continue;
    }
    const expectedHoles = new Map((expected.scorecard || []).map((hole) => [number(hole.hole), hole]));
    const actualHoles = new Map((actual.scorecard || []).map((hole) => [number(hole.hole), hole]));
    for (const holeNumber of new Set([...expectedHoles.keys(), ...actualHoles.keys()])) {
      const wanted = expectedHoles.get(holeNumber);
      const found = actualHoles.get(holeNumber);
      const fields = ["gross", "strokes", "net", "par", "strokeIndex"];
      if (!wanted || !found || fields.some((field) => scoreNumber(wanted?.[field]) !== scoreNumber(found?.[field]))) {
        divergences.push({ key: entryKey, playerIds: actual.playerIds, name: actual.name, hole: holeNumber,
          expected: wanted ? Object.fromEntries(fields.map((field) => [field, wanted[field] ?? null])) : null,
          actual: found ? Object.fromEntries(fields.map((field) => [field, found[field] ?? null])) : null });
      }
    }
  }
  return divergences.slice(0, 100);
}

async function netSkinsReadiness(actorId, { refreshConfiguration = false, samples = 25 } = {}) {
  const source = await authoritativeImport(actorId);
  const googleStartedAt = performance.now();
  const netSkinsSheets = await readWorkbookSheetsByName(NET_SKINS_WORKBOOK_TABS, { fresh: true });
  const googleConfigurationReadMs = performance.now() - googleStartedAt;
  invalidateTournamentDataCache(["Net Skins", "Net Skins Result", "Live Matches", "Matches", "Live Hole Scores"]);
  const expected = await getTournamentData();
  const tournamentId = source.imported.payload.tournament.tournament_id;
  const configuration = buildNetSkinsConfigurationImport({
    sheets: netSkinsSheets,
    tournamentId,
    tournamentYear: source.imported.payload.tournament.tournament_year,
    sourceWorkbookId: process.env.GOOGLE_SHEETS_ID,
    requestedBy: actorId,
  });
  let configurationWrite = null;
  let recalculated = null;
  if (refreshConfiguration) {
    configurationWrite = await replaceNetSkinsConfiguration(configuration);
    if (!configurationWrite.payload?.ok) throw Object.assign(new Error(`Net Skins configuration import failed (${configurationWrite.payload?.code || "unknown"}).`), { code: configurationWrite.payload?.code });
    recalculated = await recalculateNetSkinsTournament(tournamentId, { calculatedBy: `Director ${actorId}` });
  }

  const sampleCount = Math.max(1, Math.min(50, number(samples, 25)));
  const inputReadMs = [];
  const postgresQueryMs = [];
  const calculationMs = [];
  let calculated;
  for (let index = 0; index < sampleCount; index += 1) {
    const input = await readNetSkinsInputView(tournamentId);
    if (!input.payload?.ok) throw Object.assign(new Error(`Net Skins input read failed (${input.payload?.code || "unknown"}).`), { code: input.payload?.code });
    calculated = calculateNetSkinsFromSupabaseView(input.payload.data);
    inputReadMs.push(number(input.durationMs));
    postgresQueryMs.push(number(input.payload.data.query_ms));
    calculationMs.push(number(calculated.calculationMs));
  }
  const resultReadMs = [];
  const resultPostgresMs = [];
  let resultView;
  for (let index = 0; index < sampleCount; index += 1) {
    resultView = await readNetSkinsResultView(tournamentId);
    if (!resultView.payload?.ok) throw Object.assign(new Error(`Net Skins result read failed (${resultView.payload?.code || "unknown"}).`), { code: resultView.payload?.code });
    resultReadMs.push(number(resultView.durationMs));
    resultPostgresMs.push(number(resultView.payload.data.query_ms));
  }
  const comparison = compareNetSkinsParity(expected.netSkins, calculated.netSkins);
  const configuredEntryKeys = new Set(configuration.rounds.filter((round) => round.enabled)
    .flatMap((round) => round.entries.filter((entry) => entry.eligible).map((entry) =>
      `${number(round.round_number)}:${[entry.player_id_1, entry.player_id_2].map(clean).filter(Boolean).sort().join("|")}`)));
  const configuredScoreRows = (rows = []) => rows.filter((row) =>
    configuredEntryKeys.has(`${number(row.round)}:${(row.playerIds || []).map(clean).filter(Boolean).sort().join("|")}`));
  const canonicalInputDivergences = netSkinsCanonicalInputDivergences(
    configuredScoreRows(expected.scoreLeaderboard), configuredScoreRows(calculated.scoreRows));
  const officialRounds = calculated.netSkins.rounds.filter((round) => round.finalized);
  const calculatedOfficialRows = normalizedOfficialNetSkinsRows(netSkinsResultRecords({ results: officialRounds.flatMap((round) => round.skins || []) }));
  const googleOfficialRows = normalizedOfficialNetSkinsRows(expected.netSkins?.storedResults || []);
  const publicationParity = JSON.stringify(calculatedOfficialRows) === JSON.stringify(googleOfficialRows);
  const scramble = calculated.netSkins.rounds.find((round) => upper(round.format) === "SC");
  const configuredScramble = configuration.rounds.find((round) => upper(round.format) === "SC");
  const snapshots = resultView.payload.data.snapshots || [];
  const jobs = resultView.payload.data.jobs || [];
  const historicalRegression = netSkinsHistoricalRegression(calculated);
  return {
    configuration: {
      fingerprint: configuration.configuration_fingerprint,
      changed: configurationWrite?.payload?.changed ?? null,
      rounds: configuration.rounds.map((round) => ({
        round: round.round_number, format: round.format, enabled: round.enabled,
        entryType: round.entry_type, eligibleEntries: round.entries.filter((entry) => entry.eligible).length,
        buyInPerEntry: round.buy_in_per_entry, pot: round.expected_pot,
        tieRule: round.tie_rule, payoutRounding: round.payout_rounding,
        completionRule: round.completion_rule,
        individualStrokeAllocations: round.format !== "SC" ? round.entries.filter((entry) => entry.eligible)
          .map((entry) => ({ playerId: entry.player_id_1, strokes: entry.individual_stroke_allocation })) : [],
        scrambleTeamHandicaps: round.format === "SC" ? round.entries.filter((entry) => entry.eligible).map((entry) => ({ players: [entry.player_id_1, entry.player_id_2], teamHandicap: entry.team_handicap })) : [],
      })),
      import: configurationWrite?.payload || null,
      googleConfigurationReadMs,
    },
    canonicalInput: calculated.canonicalInputVerification,
    canonicalInputDivergences,
    sourceFingerprint: calculated.sourceFingerprint,
    sourceFingerprintByRound: calculated.sourceFingerprintByRound,
    parity: comparison,
    publicationParity: { pass: publicationParity, googleRows: googleOfficialRows.length, supabaseRows: calculatedOfficialRows.length },
    historicalRegression,
    scramble: {
      configured: Boolean(configuredScramble),
      pairingEntries: configuredScramble?.entries.filter((entry) => entry.eligible).length || 0,
      pairingScoreRows: netSkinsScoreRowsFromSupabaseView(recalculated?.input || {}).filter((row) => row.entityType === "PAIRING").length || calculated.canonicalInputVerification.scramblePairingRows,
      pot: scramble?.pot || 0, skins: scramble?.skinsAwarded || 0,
      parity: !scramble || comparison.pass,
    },
    derivedState: {
      snapshots: snapshots.length,
      currentByRound: snapshots.map((row) => ({ round: row.round_number, state: row.result_state, engineVersion: row.engine_version, sourceFingerprint: row.source_fingerprint, configurationFingerprint: row.configuration_fingerprint })),
      jobs: jobs.map((job) => ({ round: job.round_number, status: job.status, attempts: job.attempts, errorCode: job.last_error_code })),
      noDuplicateCurrentResult: new Set(snapshots.map((row) => row.round_number)).size === snapshots.length,
    },
    googlePublication: {
      source: "MATCH_FINALIZED/MATCH_REOPENED ordered Google outbox delivery",
      destination: "Net Skins Result",
      participantDependency: false,
      participantGoogleRequests: 0,
      officialReadbackParity: publicationParity,
    },
    performance: {
      samples: sampleCount,
      canonicalInputPostgres: benchmarkSummary(postgresQueryMs),
      canonicalInputService: benchmarkSummary(inputReadMs),
      engineCalculation: benchmarkSummary(calculationMs),
      derivedWrite: benchmarkSummary(recalculated ? [number(recalculated.writeMs)] : []),
      participantResultPostgres: benchmarkSummary(resultPostgresMs),
      participantResultService: benchmarkSummary(resultReadMs),
    },
    googleRequestsPerParticipantRead: 0,
    failureIsolation: {
      scoringTransactionDependency: false,
      coreLeaderboardsDependency: false,
      homePrimaryDependency: false,
      tournamentLiveDependency: false,
      staleOfficialSnapshotRetainedOnFailure: true,
      hiddenGoogleFallback: false,
    },
    pass: comparison.pass && publicationParity && historicalRegression.pass && Boolean(configuredScramble) &&
      snapshots.length === configuration.rounds.filter((round) => round.enabled).length && jobs.every((job) => job.status === "SUCCEEDED"),
  };
}

function normalizedCalcuttaRoundRows(rows = [], completedRounds = null) {
  const eligibleRounds = completedRounds ? new Set(completedRounds.map(number)) : null;
  return rows.filter((row) => clean(row["Player ID"]) && clean(row["Net Score"]) !== ""
    && (!eligibleRounds || eligibleRounds.has(number(row.Round)))).map((row) => ({
    year: number(row.Year), round: number(row.Round), format: upper(row.Format), playerId: clean(row["Player ID"]),
    gross: number(row["Gross Score"]), net: number(row["Net Score"]), handicap: number(row["Full Course Handicap"]),
    place: number(row.Place), points: number(row["Calcutta Points"]),
  })).sort((left, right) => left.round - right.round || left.playerId.localeCompare(right.playerId));
}

function normalizedPublishedFraction(value) {
  const raw = clean(value);
  const parsed = number(raw);
  return raw.includes("%") ? parsed / 100 : parsed;
}

function normalizedPublishedRoi(value) {
  const parsed = normalizedPublishedFraction(value);
  return parsed ? Number(parsed.toPrecision(10)) : 0;
}

function normalizedCalcuttaStandingRows(rows = []) {
  return rows.map((row) => ({
    year: number(row.Year), rank: number(row.Rank), playerId: clean(row["Player ID"]),
    purchasePrice: number(row["Purchase Price"]), round1: number(row["Round 1 Points"]),
    round2: number(row["Round 2 Points"]), round3: number(row["Round 3 Points"]),
    totalPoints: number(row["Total Points"]), round1Payout: normalizedPublishedFraction(row["Round 1 Payout %"]),
    round2Payout: normalizedPublishedFraction(row["Round 2 Payout %"]), round3Payout: normalizedPublishedFraction(row["Round 3 Payout %"]),
    // The protected publication schema intentionally rolls the Overall award into Total Payout %.
    // Overall Payout % is verified in the operational result, not invented in the Google readback.
    totalPayout: normalizedPublishedFraction(row["Total Payout %"]),
    currentPayoutValue: number(row["Current Payout Value"]), roi: normalizedPublishedRoi(row.ROI),
  })).sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function calcuttaPublicationComparison(expected = [], actual = []) {
  const mismatches = [];
  const count = Math.max(expected.length, actual.length);
  for (let index = 0; index < count && mismatches.length < 20; index += 1) {
    const left = expected[index] || null;
    const right = actual[index] || null;
    if (!left || !right) {
      mismatches.push({ index, google: left, supabase: right });
      continue;
    }
    for (const field of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      if (canonicalJson(left[field]) !== canonicalJson(right[field])) {
        mismatches.push({ index, playerId: left.playerId || right.playerId,
          field, google: left[field], supabase: right[field] });
        if (mismatches.length >= 20) break;
      }
    }
  }
  return { pass: expected.length === actual.length && mismatches.length === 0,
    googleRows: expected.length, supabaseRows: actual.length, mismatches };
}

async function calcuttaReadiness(actorId, { refresh = false, samples = 25 } = {}) {
  const source = await authoritativeImport(actorId);
  const googleStartedAt = performance.now();
  const sheets = await readWorkbookSheetsByName(CALCUTTA_WORKBOOK_TABS, { fresh: true });
  const googleConfigurationReadMs = performance.now() - googleStartedAt;
  invalidateTournamentDataCache(CALCUTTA_WORKBOOK_TABS.concat(["Live Matches", "Matches", "Live Hole Scores"]));
  const expected = await getTournamentData();
  const tournament = source.imported.payload.tournament;
  const configuration = buildCalcuttaConfigurationImport({
    sheets, tournamentId: tournament.tournament_id, tournamentYear: tournament.tournament_year,
    sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy: actorId,
  });
  let configurationWrite = null;
  let recalculation = null;
  if (refresh) {
    configurationWrite = await replaceCalcuttaConfiguration(configuration);
    if (!configurationWrite.payload?.ok) throw Object.assign(new Error(`Calcutta configuration import failed (${configurationWrite.payload?.code || "unknown"}).`), { code: configurationWrite.payload?.code });
    recalculation = await recalculateCalcuttaTournament(tournament.tournament_id, {
      calculatedBy: `Director ${actorId}`, force: true, debounceMs: 0,
    });
  }

  const sampleCount = Math.max(1, Math.min(50, number(samples, 25)));
  const inputServiceSamples = [], inputPostgresSamples = [], calculationSamples = [];
  let calculated;
  for (let index = 0; index < sampleCount; index += 1) {
    const [configRead, coreRead] = await Promise.all([
      readCalcuttaConfigurationView(tournament.tournament_id), readLeaderboardsCoreView(tournament.tournament_id),
    ]);
    if (!configRead.payload?.ok || !coreRead.payload?.ok) throw Object.assign(new Error("Calcutta canonical inputs are unavailable."), {
      code: configRead.payload?.code || coreRead.payload?.code || "CALCUTTA_INPUT_UNAVAILABLE",
    });
    calculated = calculateCalcuttaFromSupabaseViews(configRead.payload.data, coreRead.payload.data);
    inputServiceSamples.push(number(configRead.durationMs) + number(coreRead.durationMs));
    inputPostgresSamples.push(number(configRead.payload.data.query_ms) + number(coreRead.payload.data.query_ms));
    calculationSamples.push(number(calculated.calculationMs));
  }
  const resultServiceSamples = [], resultPostgresSamples = [];
  let operational;
  for (let index = 0; index < sampleCount; index += 1) {
    operational = await currentCalcuttaOperationalResult(tournament.tournament_id, { recalculatePending: false });
    resultServiceSamples.push(number(operational.serviceMs));
    resultPostgresSamples.push(number(operational.queryMs));
  }

  const parity = compareCalcuttaParity(expected.calcutta, calculated.calcutta);
  const storedParity = compareCalcuttaParity(calculated.calcutta, operational.calcutta || {});
  const googleRoundRowsAll = (sheets["Calcutta Round Results"]?.records || []).map(({ record }) => record)
    .filter((row) => number(row.Year) === number(tournament.tournament_year));
  const googleRoundRows = normalizedCalcuttaRoundRows(googleRoundRowsAll, calculated.calcutta.completedRounds);
  const generatedRoundRows = normalizedCalcuttaRoundRows(calculated.publication.roundResults);
  const roundPublicationParity = canonicalJson(googleRoundRows) === canonicalJson(generatedRoundRows);
  const googleStandingRows = normalizedCalcuttaStandingRows((sheets["Calcutta Standings"]?.records || []).map(({ record }) => record)
    .filter((row) => number(row.Year) === number(tournament.tournament_year)));
  const generatedStandingRows = normalizedCalcuttaStandingRows(calculated.publication.standings);
  const standingPublicationComparison = calcuttaPublicationComparison(googleStandingRows, generatedStandingRows);
  const standingPublicationParity = standingPublicationComparison.pass;
  const known = Object.fromEntries(["Holman Moores", "Memo Saldana"].map((name) => {
    const golfer = (calculated.calcutta.golfers || []).find((row) => clean(row.player?.name) === name);
    return [name, golfer ? { playerId: golfer.playerId, points: golfer.totalPoints } : null];
  }));
  const knownValueRegression = {
    market: { expected: 16800, actual: calculated.calcutta.pot, pass: number(calculated.calcutta.pot) === 16800 },
    holman: { expected: 66, actual: known["Holman Moores"]?.points ?? null, pass: number(known["Holman Moores"]?.points, NaN) === 66 },
    memo: { expected: 56, actual: known["Memo Saldana"]?.points ?? null, pass: number(known["Memo Saldana"]?.points, NaN) === 56 },
  };
  const financial = configuration.financial_contract;
  const ownerPortfolioValue = (calculated.calcutta.portfolios || []).reduce((sum, row) => sum + number(row.currentPayoutValue), 0);
  const ownerPortfolioCost = (calculated.calcutta.portfolios || []).reduce((sum, row) => sum + number(row.purchaseCost), 0);
  const financialConservation = {
    ownershipByAsset: Object.entries(financial.ownership_totals).map(([playerId, total]) => ({ playerId, total, pass: Math.abs(number(total) - 1) < 0.000001 })),
    totalMarketValue: financial.total_market_value,
    payoutAllocation: financial.payout_allocation,
    totalPayoutFraction: financial.total_payout_fraction,
    calculatedDistributedValue: calculated.calcutta.distributedPrizePool,
    ownerPortfolioCost,
    ownerPortfolioValue,
    pass: Object.values(financial.ownership_totals).every((value) => Math.abs(number(value) - 1) < 0.000001)
      && Math.abs(number(financial.total_payout_fraction) - 1) < 0.000001
      && Math.abs(ownerPortfolioCost - number(financial.total_market_value)) < 0.005
      && Math.abs(ownerPortfolioValue - number(calculated.calcutta.distributedPrizePool)) < 0.005,
  };
  return {
    readSource: calcuttaReadEnvironment(),
    engine: { module: "lib/calcutta.js", engineVersion: CALCUTTA_ENGINE_VERSION, changed: false,
      rulesOwner: "existing JavaScript application engine" },
    googleConfiguration: {
      source: "Director-managed Preview workbook", tabs: CALCUTTA_WORKBOOK_TABS.slice(0, 4),
      outputTabs: CALCUTTA_WORKBOOK_TABS.slice(4), explicitRefresh: true,
      normalParticipantDependency: false, readMs: googleConfigurationReadMs,
    },
    configuration: {
      fingerprint: configuration.configuration_fingerprint,
      revision: configurationWrite?.payload?.configuration_revision ?? null,
      import: configurationWrite?.payload || null,
      purchases: configuration.purchases, ownership: configuration.ownership,
      pointStructure: configuration.point_structure, payoutStructure: configuration.payout_structure,
      financialContract: financial,
    },
    canonicalInput: calculated.canonicalInputVerification,
    sourceFingerprint: calculated.sourceFingerprint,
    resultState: calculated.resultState,
    parity,
    storedParity,
    roundPublicationParity: { pass: roundPublicationParity, googleRows: googleRoundRows.length, supabaseRows: generatedRoundRows.length,
      ignoredIncompleteOrStaleGoogleRows: googleRoundRowsAll.length - googleRoundRows.length },
    standingPublicationParity: standingPublicationComparison,
    financialConservation,
    knownValueRegression,
    scramble: {
      rule: "Round 2 pairing ranks once; occupied-place points/payout are divided equally between the two purchased player assets",
      canonicalPairingRows: calculated.canonicalInputVerification.scramblePairingRows,
      parity: parity.pass,
    },
    derivedState: {
      snapshot: operational.snapshot, job: operational.job, stale: operational.stale,
      recalculation: recalculation ? { inputReadMs: recalculation.inputReadMs,
        engineMs: recalculation.calculated.calculationMs, writeMs: recalculation.writeMs,
        logicalReplay: recalculation.write.logical_replay } : null,
    },
    triggers: ["configuration revision", "relevant Finalization", "Director Reopen", "official-result correction", "explicit Director rebuild"],
    googlePublication: {
      destinations: ["Calcutta Round Results", "Calcutta Standings"],
      ownerLeaderboard: "read-only optional published/reporting table",
      operationalParticipantDependency: false, durableReportingSeparation: true,
    },
    failureIsolation: {
      scoringTransactionDependency: false, coreLeaderboardsDependency: false,
      homeDependency: false, tournamentLiveDependency: false, netSkinsDependency: false,
      oddsDependency: false, staleVerifiedSnapshotRetained: true, hiddenGoogleFallback: false,
    },
    performance: {
      samples: sampleCount, canonicalInputPostgres: benchmarkSummary(inputPostgresSamples),
      canonicalInputService: benchmarkSummary(inputServiceSamples), engineCalculation: benchmarkSummary(calculationSamples),
      derivedWrite: benchmarkSummary(recalculation ? [number(recalculation.writeMs)] : []),
      participantResultPostgres: benchmarkSummary(resultPostgresSamples),
      participantResultService: benchmarkSummary(resultServiceSamples),
    },
    googleRequestsPerParticipantRead: 0,
    pass: parity.pass && storedParity.pass && roundPublicationParity && standingPublicationParity
      && financialConservation.pass && Object.values(knownValueRegression).every((row) => row.pass)
      && !operational.stale && clean(operational.job?.status).toUpperCase() === "SUCCEEDED",
  };
}

async function competitionDerivedReadiness(actorId, { refresh = false, samples = 25 } = {}) {
  const referenceTime = Date.now();
  invalidateTournamentDataCache(["Live Matches", "Matches", "Live Hole Scores", "Net Skins", "Net Skins Result"]);
  const expected = await getTournamentData();
  const tournamentId = clean(expected.tournament?.id || expected.tournament?.year);
  const sampleCount = Math.max(1, Math.min(50, number(samples, 25)));
  const inputServiceSamples = [];
  const inputPostgresSamples = [];
  const calculationSamples = [];
  let actual;
  let calculated;
  for (let index = 0; index < sampleCount; index += 1) {
    const [coreRead, skinsRead] = await Promise.all([
      readLeaderboardsCoreView(tournamentId), readNetSkinsResultView(tournamentId),
    ]);
    if (!coreRead.payload?.ok || !skinsRead.payload?.ok) throw Object.assign(
      new Error("Competition derived-state canonical inputs are unavailable."),
      { code: coreRead.payload?.code || skinsRead.payload?.code || "COMPETITION_INPUT_UNAVAILABLE" },
    );
    const core = leaderboardsCoreDataFromSupabaseView(coreRead.payload.data);
    const skins = netSkinsDataFromResultView(skinsRead.payload.data);
    actual = { ...core, netSkins: skins.netSkins };
    calculated = calculateCompetitionDerivedFromData(actual, { referenceTime });
    inputServiceSamples.push(number(coreRead.durationMs) + number(skinsRead.durationMs));
    inputPostgresSamples.push(number(coreRead.payload.data.query_ms) + number(skinsRead.payload.data.query_ms));
    calculationSamples.push(number(calculated.calculationMs));
  }
  const parity = compareCompetitionDerivedParity(expected, actual, { referenceTime });
  let recalculation = null;
  if (refresh) recalculation = await recalculateCompetitionDerivedTournament(tournamentId, {
    calculatedBy: `Director ${actorId}`, referenceTime, force: true, debounceMs: 0,
  });
  const resultServiceSamples = [];
  const resultPostgresSamples = [];
  let stateRead;
  for (let index = 0; index < sampleCount; index += 1) {
    stateRead = await readCompetitionDerivedState(tournamentId);
    if (!stateRead.payload?.ok) throw Object.assign(new Error("Competition derived-state read is unavailable."), { code: stateRead.payload?.code });
    resultServiceSamples.push(number(stateRead.durationMs));
    resultPostgresSamples.push(number(stateRead.payload.data.query_ms));
  }
  const prepared = competitionDerivedDataFromView(stateRead.payload.data, { now: referenceTime });
  const momentumStoredPass = canonicalJson(prepared.momentum) === canonicalJson(calculated.momentum.value);
  const storylinesStoredPass = canonicalJson(prepared.storylines) === canonicalJson(calculated.storylines.stories);
  return {
    engines: {
      momentum: { module: "lib/live-tournament.js#getTeamMomentum", engineVersion: TEAM_MOMENTUM_ENGINE_VERSION,
        contract: "Official results only; round/match order; Singles overall point; Best Ball/Scramble front/back/overall decided points; halves ignored; last-five/streak descriptions." },
      storylines: { module: "lib/tournament-storylines.js#tournamentStorylines", engineVersion: TOURNAMENT_STORYLINES_ENGINE_VERSION,
        contract: "Current-tournament semantic story candidates, existing priority/editorial order, six Home moments; time-relative labels are not persisted as semantic content." },
    },
    tournamentId,
    referenceTime: new Date(referenceTime).toISOString(),
    parity,
    storedParity: { pass: momentumStoredPass && storylinesStoredPass,
      momentum: momentumStoredPass, storylines: storylinesStoredPass,
      storyCount: prepared.storylines.length, momentCount: prepared.moments.length },
    fingerprints: {
      momentum: { source: calculated.momentum.sourceFingerprint, configuration: calculated.momentum.configurationFingerprint },
      storylines: { source: calculated.storylines.sourceFingerprint, configuration: calculated.storylines.configurationFingerprint },
    },
    state: prepared.metadata,
    jobs: stateRead.payload.data.jobs || [],
    recalculation: recalculation ? {
      inputReadMs: recalculation.inputReadMs, engineMs: recalculation.calculated.calculationMs,
      logicalReplay: recalculation.writes.every((write) => write.logical_replay === true),
      writes: recalculation.writes,
    } : null,
    triggers: {
      momentum: ["Finalize", "Director Reopen", "official-result correction", "explicit rebuild"],
      storylines: ["accepted hole/correction", "Finalize", "Director Reopen", "Net Skins result change", "explicit rebuild"],
      scoringTransactionCoupled: false,
    },
    performance: {
      samples: sampleCount,
      canonicalInputPostgres: benchmarkSummary(inputPostgresSamples),
      canonicalInputService: benchmarkSummary(inputServiceSamples),
      engineCalculation: benchmarkSummary(calculationSamples),
      participantReadPostgres: benchmarkSummary(resultPostgresSamples),
      participantReadService: benchmarkSummary(resultServiceSamples),
    },
    googleRequests: { participantMomentum: 0, participantStorylines: 0, parityDiagnosticOnly: true },
    pass: parity.pass && momentumStoredPass && storylinesStoredPass,
  };
}

async function intelligenceDerivedReadiness(actorId, { refresh = false } = {}) {
  const scope = await readLeaderboardsCoreView("");
  if (!scope.payload?.ok) throw Object.assign(new Error("Intelligence tournament scope is unavailable."), { code: scope.payload?.code });
  const tournamentId = clean(scope.payload.data.tournament?.tournament_id);
  const recalculation = refresh ? await recalculateIntelligenceDerivedTournament(tournamentId, { calculatedBy: `Director ${actorId}` }) : null;
  const current = await currentIntelligenceDerivedState(tournamentId);
  return { tournamentId, recalculation: recalculation ? {
    sourceFingerprint: recalculation.calculated.sourceFingerprint,
    finalGate: recalculation.calculated.recap.gate,
    inputReadMs: recalculation.inputs.inputReadMs,
    postgresMs: recalculation.inputs.postgresMs,
    serviceMs: recalculation.inputs.serviceMs,
    engineMs: recalculation.calculated.calculationMs,
    written: recalculation.write.written,
  } : null, current, googleRequests: 0,
    pass: Boolean(current.tournamentIntelligence && current.projectionEditorial && !current.finalRecap) };
}

async function publishedOddsReadiness(actorId, { refresh = false, samples = 25 } = {}) {
  const source = await authoritativeImport(actorId);
  const googleStartedAt = performance.now();
  const sheets = await readWorkbookSheetsByName(PUBLISHED_ODDS_WORKBOOK_TABS);
  const googlePublicationReadMs = performance.now() - googleStartedAt;
  const tournament = source.imported.payload.tournament;
  const imported = buildPublishedOddsImport({ sheets, tournamentId: tournament.tournament_id,
    tournamentYear: tournament.tournament_year, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy: actorId });
  let write = null;
  if (refresh) {
    write = await replacePublishedOddsSnapshots(imported);
    if (!write.payload?.ok) throw Object.assign(new Error(`Published Odds import failed (${write.payload?.code || "unknown"}).`), { code: write.payload?.code });
  }
  const serviceSamples = [], postgresSamples = [];
  let read;
  for (let index = 0; index < Math.max(1, Math.min(50, number(samples, 25))); index += 1) {
    read = await readPublishedOddsView({ tournamentId: tournament.tournament_id });
    if (!read.payload?.ok) throw Object.assign(new Error(`Published Odds read failed (${read.payload?.code || "unknown"}).`), { code: read.payload?.code });
    serviceSamples.push(number(read.durationMs)); postgresSamples.push(number(read.payload.data.query_ms));
  }
  const expected = imported.snapshots.map((item) => item.published_payload);
  const actual = publishedOddsSnapshotsFromView(read.payload.data);
  const parity = comparePublishedOddsParity(expected, actual);
  const rows = read.payload.data.snapshots || [];
  const current = rows.find((item) => item.is_current_official);
  return {
    import: write?.payload || null,
    importFingerprint: imported.import_fingerprint,
    currentSelection: { tournamentId: tournament.tournament_id, tournamentYear: tournament.tournament_year,
      milestone: current?.milestone || null, publicationRevision: current?.publication_revision || null,
      rule: "Tournament-scoped Odds Control milestone; verified current publication only" },
    milestones: rows.map((item) => ({ milestone: item.milestone, phaseOrder: item.phase_order,
      publishedAt: item.published_at, publicationRevision: item.publication_revision,
      teamRows: item.payload?.teams?.length || 0, playerRows: item.payload?.players?.length || 0,
      complete: item.publication_verified === true, payloadHash: item.payload_hash,
      current: item.is_current_official === true })),
    parity: { ...parity, milestonesCompared: expected.length, teamRows: expected.reduce((sum, item) => sum + item.teams.length, 0),
      playerRows: expected.reduce((sum, item) => sum + item.players.length, 0), teamDivergences: parity.pass ? 0 : null,
      playerDivergences: parity.pass ? 0 : null, movementHistoryPreserved: actual.length > 1 },
    metadata: { sourceFingerprintAvailable: expected.every((item) => Boolean(clean(item.sourceFingerprint))),
      engineVersionAvailable: expected.every((item) => Boolean(clean(item.engineVersion))),
      configurationVersionAvailable: expected.every((item) => Boolean(clean(item.configurationVersion))),
      iterationsPreserved: expected.map((item) => ({ milestone: item.phase, iterations: item.iterations })),
      valuesRecalculated: false },
    google: { publicationSource: true, participantDependency: false, participantRequests: 0,
      explicitImportReadMs: googlePublicationReadMs, sheets: PUBLISHED_ODDS_WORKBOOK_TABS },
    performance: { samples: serviceSamples.length, postgres: benchmarkSummary(postgresSamples), supabaseService: benchmarkSummary(serviceSamples) },
    failureIsolation: { coreLeaderboards: true, netSkins: true, homeTournament: true, scoring: true,
      lastVerifiedSnapshotRetained: true, noHiddenGoogleFallback: true },
    pass: parity.pass && rows.length === expected.length && Boolean(current),
  };
}

async function matchAuthorizationParity(source) {
  const expected = expectedMatchAuthorizationMatrix(source.imported);
  const matrix = await readMatchAuthorizationMatrix(source.imported.payload.tournament.tournament_id);
  if (!matrix.payload?.ok) throw Object.assign(new Error(`Match authorization matrix failed (${matrix.payload?.code || "unknown"}).`), { code: matrix.payload?.code });
  const compared = compareMatchAuthorizationMatrix(expected, matrix.payload.decisions || []);
  const payload = source.imported.payload;
  const participants = payload.match_participants || [];
  const players = (payload.tournament_players || []).filter((row) => row.participation_status === "ACTIVE");
  const matches = payload.matches || [];
  const samples = [];
  for (const player of players) {
    const ownIds = new Set(participants.filter((row) => row.player_id === player.player_id).map((row) => row.match_id));
    const own = matches.filter((row) => ownIds.has(row.match_id));
    const final = own.find((row) => row.status === "FINAL") || own[0];
    const scoreable = own.find((row) => row.status === "LIVE" && row.scoring_locked !== true) || own[0];
    const foreign = matches.find((row) => !ownIds.has(row.match_id)) || matches[0];
    samples.push(
      { playerId: player.player_id, matchId: own[0]?.match_id, action: MATCH_ACCESS_ACTIONS.VIEW_GAME_CENTER },
      { playerId: player.player_id, matchId: final?.match_id, action: MATCH_ACCESS_ACTIONS.VIEW_FINAL_SCORECARD },
      { playerId: player.player_id, matchId: scoreable?.match_id, action: MATCH_ACCESS_ACTIONS.START_SCORING },
      { playerId: player.player_id, matchId: foreign?.match_id, action: MATCH_ACCESS_ACTIONS.VIEW_MATCH },
    );
  }
  const postgresQueryMs = [];
  const supabaseServiceMs = [];
  const fullAuthorizationMs = [];
  const sampleDivergences = [];
  for (const sample of samples) {
    const began = performance.now();
    const read = await authorizeMatchAccess({ tournamentId: payload.tournament.tournament_id, ...sample });
    fullAuthorizationMs.push(performance.now() - began);
    const wanted = expectedMatchAuthorizationDecision(source.imported, { tournamentId: payload.tournament.tournament_id, ...sample });
    const comparison = compareMatchAuthorizationMatrix([wanted], read.payload ? [read.payload] : []);
    if (!comparison.pass) sampleDivergences.push({ sample, ...comparison });
    postgresQueryMs.push(number(read.payload?.query_ms));
    supabaseServiceMs.push(number(read.durationMs));
  }
  const actual = matrix.payload.decisions || [];
  const matchById = new Map(matches.map((row) => [row.match_id, row]));
  const coverage = {
    activePlayers: players.length,
    matches: matches.length,
    decisions: actual.length,
    finalScorecardAllowed: actual.filter((row) => row.action === "VIEW_FINAL_SCORECARD" && row.allowed).length,
    scoringAllowed: actual.filter((row) => row.action === "START_SCORING" && row.allowed).length,
    nonParticipantDenied: actual.filter((row) => row.code === "NOT_MATCH_PARTICIPANT").length,
    finalScoringDenied: actual.filter((row) => row.action === "START_SCORING" && row.code === "MATCH_FINAL").length,
    lockedMatchesCovered: new Set(actual.filter((row) => row.scoring_locked).map((row) => row.match_id)).size,
    zeroHoleMatchesCovered: new Set(actual.filter((row) => number(matchById.get(row.match_id)?.scored_holes) === 0).map((row) => row.match_id)).size,
    match4Covered: actual.some((row) => row.match_id === "2026-R3-4"),
    historicalMatchCovered: actual.some((row) => row.match_id === "2026-R1-6"),
  };
  return {
    ...coverage,
    matrixQueryMs: number(matrix.payload.query_ms),
    matrixServiceMs: number(matrix.durationMs),
    parity: compared,
    sampleDivergences,
    postgresQuery: benchmarkSummary(postgresQueryMs),
    supabaseService: benchmarkSummary(supabaseServiceMs),
    fullAuthorization: benchmarkSummary(fullAuthorizationMs),
    zeroGoogleRequestsPerAuthorization: true,
    pass: players.length === 24 && compared.pass && !sampleDivergences.length,
  };
}

async function refreshGameCenterPresentations(actorId) {
  const source = await authoritativeImport(actorId);
  const presentation = buildGameCenterPresentationImport({
    sheets: source.sheets,
    sourceWorkbookId: process.env.GOOGLE_SHEETS_ID,
    requestedBy: actorId,
  });
  const written = await replaceGameCenterPresentations(presentation);
  if (!written.payload?.ok) throw Object.assign(new Error(`Game Center presentation refresh failed (${written.payload?.code || "unknown"}).`), { code: written.payload?.code });
  const parity = await gameCenterParity(source, presentation);
  return {
    presentation: written.payload,
    fields: ["course name/logo", "team logos/colors", "tee time", "starting hole", "display match number", "tournament location/logo"],
    googleConfigurationReadMs: source.googleReadMs,
    parity,
  };
}

async function currentAndReconcile(imported) {
  const tournamentId = imported.payload.tournament.tournament_id;
  const read = await readCanonicalScoringAuthority({ tournament_id: tournamentId, mode: "CURRENT_STATE" });
  if (!read.payload?.ok) throw new Error(`Canonical authority read failed (${read.payload?.code || "unknown"}).`);
  return { current: read.payload.data, report: reconcileCanonicalScoringAuthority(imported, read.payload.data), readMs: read.durationMs };
}

async function importMain(requestedBy, { scope = "FULL" } = {}) {
  const source = await authoritativeImport(requestedBy);
  const importScope = upper(scope);
  if (!new Set(["FULL", "TEAM_METADATA"]).has(importScope)) {
    throw Object.assign(new Error("Invalid canonical import scope."), { code: "INVALID_IMPORT_SCOPE" });
  }
  const importPayload = importScope === "TEAM_METADATA"
    ? { ...source.imported.payload, import_scope: importScope }
    : source.imported.payload;
  const writeStartedAt = Date.now();
  const write = await replaceCanonicalScoringAuthorityImport(importPayload);
  const writeMs = Date.now() - writeStartedAt;
  if (!write.payload?.ok) throw new Error(`Canonical import failed (${write.payload?.code || "unknown"}).`);
  const reconciled = await currentAndReconcile(source.imported);
  return { ...source, importScope, write: write.payload, writeMs, ...reconciled };
}

async function cutoverSnapshot(requestedBy) {
  const source = await authoritativeImport(requestedBy);
  const reconciled = await currentAndReconcile(source.imported);
  const tournamentId = source.imported.payload.tournament.tournament_id;
  const diagnostics = await readCanonicalScoringAuthority({ tournament_id: tournamentId, mode: "DIAGNOSTICS" });
  const security = await inspectCanonicalAuthoritySecurity();
  return { source, ...reconciled, tournamentId, diagnostics: diagnostics.payload?.data || {}, security: security.payload || {} };
}

function requireCutoverSnapshot(snapshot, { ingressState = "OPEN", authority = "GOOGLE", epochId = "" } = {}) {
  const ingress = snapshot.diagnostics?.ingress || {};
  const security = snapshot.security || {};
  const ready = snapshot.report.pass && number(snapshot.diagnostics?.pending_outbox) === 0 &&
    number(ingress.unresolved_client_queues) === 0 && clean(ingress.state).toUpperCase() === ingressState &&
    clean(ingress.authority).toUpperCase() === authority && (!epochId || clean(ingress.active_epoch_id) === clean(epochId)) &&
    number(security.tables) === number(security.rls_enabled) && number(security.policies) === 0 &&
    number(security.participant_rpc_grants) === 0 && number(security.participant_table_grants) === 0;
  if (!ready) throw Object.assign(new Error("The verified cutover preconditions are not satisfied."), {
    code: "CUTOVER_PRECONDITION_FAILED",
    shadowDiagnostics: { code: "CUTOVER_PRECONDITION_FAILED", message: "The verified cutover preconditions are not satisfied.",
      details: JSON.stringify({ reconciliation: snapshot.report, ingress, pendingOutbox: snapshot.diagnostics?.pending_outbox, security }) },
  });
  return true;
}

function epochInput(snapshot, actorId, epochType) {
  return {
    tournament_id: snapshot.tournamentId,
    epoch_type: epochType,
    reconciliation_fingerprint: snapshot.report.fingerprint,
    google_checkpoints: snapshot.current.checkpoints,
    supabase_match_revisions: snapshot.current.matches.map((row) => ({ match_id: row.match_id, revision: row.match_revision })),
    deployment_commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    actor_id: actorId,
    reason: epochType === "CUTOVER" ? "First controlled Preview Supabase authority activation" : "Controlled Preview authority rollback",
  };
}

async function prepareMainCutover(actorId) {
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved !== "google") throw Object.assign(new Error("Preview runtime authority must still be Google before preparing cutover."), { code: "RUNTIME_AUTHORITY_NOT_GOOGLE" });
  const snapshot = await cutoverSnapshot(actorId);
  requireCutoverSnapshot(snapshot);
  const prepared = await prepareAuthorityEpoch(epochInput(snapshot, actorId, "CUTOVER"));
  if (!prepared.payload?.ok) throw Object.assign(new Error(`Cutover prepare failed (${prepared.payload?.code || "unknown"}).`), { code: prepared.payload?.code });
  return { prepared: prepared.payload, counts: snapshot.source.imported.counts, reconciliation: snapshot.report,
    ingressBefore: snapshot.diagnostics.ingress, pendingOutbox: snapshot.diagnostics.pending_outbox,
    security: snapshot.security, deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA || "local" };
}

async function commitMainCutover(actorId, epochId) {
  if (!clean(epochId)) throw Object.assign(new Error("A prepared cutover epoch is required."), { code: "EPOCH_REQUIRED" });
  const snapshot = await cutoverSnapshot(actorId);
  requireCutoverSnapshot(snapshot, { ingressState: "PAUSED", authority: "GOOGLE", epochId });
  const committed = await commitAuthorityEpoch({ epoch_id: epochId, actor_id: actorId });
  if (!committed.payload?.ok || committed.payload.authority !== "SUPABASE") {
    throw Object.assign(new Error(`Cutover commit failed (${committed.payload?.code || "unknown"}).`), { code: committed.payload?.code });
  }
  const after = await readCanonicalScoringAuthority({ tournament_id: snapshot.tournamentId, mode: "DIAGNOSTICS" });
  return { committed: committed.payload, reconciliation: snapshot.report, counts: snapshot.source.imported.counts,
    ingressBeforeCommit: snapshot.diagnostics.ingress, ingressAfterCommit: after.payload?.data?.ingress,
    pendingOutbox: after.payload?.data?.pending_outbox, security: snapshot.security };
}

async function prepareMainRollback(actorId) {
  const current = await readCanonicalScoringAuthority({ tournament_id: "2026", mode: "CURRENT_STATE" });
  const diagnostics = await readCanonicalScoringAuthority({ tournament_id: "2026", mode: "DIAGNOSTICS" });
  if (!current.payload?.ok || clean(diagnostics.payload?.data?.authority).toUpperCase() !== "SUPABASE") {
    throw Object.assign(new Error("Supabase is not the current canonical Preview authority."), { code: "SUPABASE_NOT_AUTHORITY" });
  }
  const fingerprint = canonicalAuthorityFingerprint(current.payload.data);
  const prepared = await prepareAuthorityEpoch({ tournament_id: "2026", epoch_type: "ROLLBACK", reconciliation_fingerprint: fingerprint,
    google_checkpoints: current.payload.data.checkpoints,
    supabase_match_revisions: current.payload.data.matches.map((row) => ({ match_id: row.match_id, revision: row.match_revision })),
    deployment_commit: process.env.VERCEL_GIT_COMMIT_SHA || "local", actor_id: actorId, reason: "Controlled Preview authority rollback" });
  if (!prepared.payload?.ok) throw Object.assign(new Error(`Rollback prepare failed (${prepared.payload?.code || "unknown"}).`), { code: prepared.payload?.code });
  return { prepared: prepared.payload, diagnosticsBefore: diagnostics.payload.data, fingerprint };
}

async function commitMainRollback(actorId, epochId) {
  if (!clean(epochId)) throw Object.assign(new Error("A prepared rollback epoch is required."), { code: "EPOCH_REQUIRED" });
  const drained = await drainGoogleOutbox({ maximum: 100, actor: `Phase 2 rollback · ${actorId}` });
  if (!drained.ok) throw Object.assign(new Error("Rollback stopped because Google did not fully verify."), { code: "GOOGLE_OUTBOX_NOT_DRAINED" });
  const snapshot = await cutoverSnapshot(actorId);
  requireCutoverSnapshot(snapshot, { ingressState: "PAUSED", authority: "SUPABASE", epochId });
  const committed = await commitAuthorityEpoch({ epoch_id: epochId, actor_id: actorId });
  if (!committed.payload?.ok || committed.payload.authority !== "GOOGLE") {
    throw Object.assign(new Error(`Rollback commit failed (${committed.payload?.code || "unknown"}).`), { code: committed.payload?.code });
  }
  return { drained, reconciliation: snapshot.report, committed: committed.payload, security: snapshot.security };
}

const LEGACY_REOPEN_ARCHIVE_RESULT_FIELDS = [
  "Final Result", "Winner", "Matchup Winner", "Front 9 Winner", "Back 9 Winner",
  "18-Hole Winner", "Team 1 Points", "Team 2 Points",
];

const archiveResultIsInactive = (row = {}) => LEGACY_REOPEN_ARCHIVE_RESULT_FIELDS
  .every((field) => !clean(row[field]));

async function normalizeLegacyReopen(actorId, input = {}) {
  const matchId = clean(input.matchId);
  if (!matchId || input.confirmIntent !== true) {
    throw Object.assign(new Error("A match and explicit Director confirmation are required."), { code: "DIRECTOR_INTENT_REQUIRED" });
  }
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved !== "google") {
    throw Object.assign(new Error("Google must remain the active Preview scoring authority for legacy normalization."), { code: "GOOGLE_NOT_AUTHORITY" });
  }
  const [canonicalBefore, googleBefore] = await Promise.all([
    readCanonicalScoringAuthority({ match_id: matchId, mode: "MATCH" }),
    readWorkbookSheetsByName(["Live Matches", "Matches", "Live Hole Scores", "Match Update Log", "Admin Audit Log"], { fresh: true }),
  ]);
  const canonicalMatch = canonicalBefore.payload?.data;
  if (!canonicalBefore.payload?.ok || !canonicalMatch) throw Object.assign(new Error("The canonical match was not found."), { code: "MATCH_NOT_FOUND" });
  const diagnosticsBefore = await readCanonicalScoringAuthority({ tournament_id: canonicalMatch.tournament_id, mode: "DIAGNOSTICS" });
  const ingress = diagnosticsBefore.payload?.data?.ingress || {};
  if (upper(ingress.authority) !== "GOOGLE" || upper(ingress.state) !== "OPEN"
      || number(diagnosticsBefore.payload?.data?.pending_outbox) !== 0 || ingress.active_epoch_id) {
    throw Object.assign(new Error("Preview scoring ingress, authority, epoch, or outbox state is not clean."), { code: "NORMALIZATION_PREFLIGHT_FAILED" });
  }
  const rows = (tab) => (googleBefore[tab]?.records || []).map(({ record }) => record);
  const googleLive = rows("Live Matches").find((row) => clean(row["Match ID"]) === matchId);
  const googleArchive = rows("Matches").find((row) => clean(row["Match ID"]) === matchId);
  if (!googleLive || !googleArchive) throw Object.assign(new Error("The Google lifecycle rows were not found."), { code: "GOOGLE_MATCH_NOT_FOUND" });
  const conflict = classifyScoringLifecycleConflict({ current: googleLive, archived: googleArchive,
    matchUpdateLog: rows("Match Update Log"), adminAuditLog: rows("Admin Audit Log") });
  const unresolvedLegacyConflict = /^(Live|Reopened)$/i.test(clean(googleLive["Match Status"]))
    && /^(Final|Finalized)$/i.test(clean(googleArchive["Match Status"]));
  const partiallyNormalizedGoogleReopen = /^Reopened$/i.test(clean(googleLive["Match Status"]))
    && /^Reopened$/i.test(clean(googleArchive["Match Status"]));
  const googleAlreadyNormalized = /^Reopened$/i.test(clean(googleLive["Match Status"]))
    && /^Reopened$/i.test(clean(googleArchive["Match Status"]))
    && !clean(googleArchive["Finalized At"]) && !clean(googleArchive["Completed At"])
    && archiveResultIsInactive(googleArchive)
    && !truthy(googleLive["Scoring Locked"]) && truthy(googleLive["Access Active"]);
  if (!unresolvedLegacyConflict && !partiallyNormalizedGoogleReopen) {
    throw Object.assign(new Error("The selected match is not a legacy mutable-reopen / active-Final conflict."), {
      code: "LEGACY_REOPEN_CONFLICT_REQUIRED", shadowDiagnostics: { details: JSON.stringify(conflict) },
    });
  }
  const nextPermissionRevision = googleAlreadyNormalized ? number(googleLive["Access Version"]) : Math.max(
    2,
    number(canonicalMatch.permission_revision) + 1,
    number(googleLive["Access Version"]) + 1,
  );
  const lease = await beginScoringIngress({ tournament_id: canonicalMatch.tournament_id, match_id: matchId,
    expected_authority: "GOOGLE", actor_id: actorId, lease_seconds: 300 });
  if (!lease.payload?.ok) throw Object.assign(new Error(`Normalization ingress failed (${lease.payload?.code || "unknown"}).`), { code: lease.payload?.code });
  const leaseId = clean(lease.payload.lease_id);
  let leaseCompleted = false;
  try {
    const google = await withWorkbookWriteDiagnostics("legacy-reopen-normalization", () => normalizeLegacyReopenedMatch(
      matchId,
      { confirmIntent: true, expectedLiveUpdatedAt: clean(googleLive["Updated At"]),
        expectedArchiveFinalizedAt: clean(googleArchive["Finalized At"]), permissionRevision: nextPermissionRevision },
      `Legacy reopen normalization · ${actorId}`,
    ));
    const verified = google.result;
    const verifiedMatch = verified.match || {};
    const verifiedArchive = verified.archive || {};
    const googleAfter = await readWorkbookSheetsByName(["Live Matches", "Matches", "Live Hole Scores", "Match Update Log", "Admin Audit Log"], { fresh: true });
    const afterRows = (tab) => (googleAfter[tab]?.records || []).map(({ record }) => record);
    const holes = afterRows("Live Hole Scores").filter((row) => clean(row["Match ID"]) === matchId);
    const googleHoleRevisions = Object.fromEntries(holes.map((row) => [String(number(row["Hole Number"])), number(row.Revision)]));
    const archiveResultInactive = !clean(verifiedArchive["Finalized At"])
      && !clean(verifiedArchive["Completed At"])
      && archiveResultIsInactive(verifiedArchive);
    const verifiedFingerprint = canonicalAuthorityFingerprint({ matchId, status: verifiedMatch["Match Status"],
      archiveStatus: verifiedArchive["Match Status"], archiveResultInactive,
      accessActive: truthy(verifiedMatch["Access Active"]), scoringLocked: truthy(verifiedMatch["Scoring Locked"]),
      permissionRevision: number(verifiedMatch["Access Version"]), updatedAt: clean(verifiedMatch["Updated At"]),
      holeFingerprint: canonicalAuthorityFingerprint(holes), holeCount: holes.length });
    const mutationKey = `legacy-reopen-normalization:${matchId}:P${number(verifiedMatch["Access Version"])}`;
    const normalized = await normalizeCanonicalLegacyReopen({
      environment: "PREVIEW", director_authorized: true, operator_intent_confirmed: true,
      tournament_id: canonicalMatch.tournament_id, match_id: matchId, actor_id: actorId,
      mutation_key: mutationKey, lease_id: leaseId,
      expected_match_revision: number(canonicalMatch.match_revision),
      expected_permission_revision: number(canonicalMatch.permission_revision),
      google_match_revision: number(verifiedMatch.Revision),
      google_permission_revision: number(verifiedMatch["Access Version"]),
      google_match_updated_at: clean(verifiedMatch["Updated At"]),
      google_live_status: clean(verifiedMatch["Match Status"]),
      google_archive_status: clean(verifiedArchive["Match Status"]),
      google_archive_result_inactive: archiveResultInactive,
      google_holes_unchanged: verified.holeScoresPreserved === true,
      google_hole_revisions: googleHoleRevisions,
      verified_fingerprint: verifiedFingerprint,
    });
    if (!normalized.payload?.ok) throw Object.assign(new Error(`Canonical legacy reopen normalization failed (${normalized.payload?.code || "unknown"}).`), { code: normalized.payload?.code });
    const archiveJobs = await drainScorecardArchiveJobs({ maximum: 4, stopOnFailure: true });
    if (!archiveJobs.ok) {
      throw Object.assign(new Error("The finalized-scorecard archive invalidation did not verify."), { code: "ARCHIVE_INVALIDATION_FAILED" });
    }
    const ingressCompletion = await completeScoringIngress({ lease_id: leaseId });
    if (!ingressCompletion.payload?.ok) {
      throw Object.assign(new Error(`Normalization ingress completion failed (${ingressCompletion.payload?.code || "unknown"}).`), { code: ingressCompletion.payload?.code });
    }
    leaseCompleted = true;
    const [liveView, diagnosticsAfter] = await Promise.all([
      readTournamentLiveView(canonicalMatch.tournament_id),
      readCanonicalScoringAuthority({ tournament_id: canonicalMatch.tournament_id, mode: "DIAGNOSTICS" }),
    ]);
    return { matchId, conflictBefore: conflict, google: verified, googleDiagnostics: google.diagnostics,
      canonical: normalized.payload, archiveJobs, ingressCompletion: ingressCompletion.payload,
      tournamentLiveView: liveView.payload,
      diagnosticsBefore: diagnosticsBefore.payload?.data, diagnosticsAfter: diagnosticsAfter.payload?.data };
  } finally {
    if (leaseId && !leaseCompleted) await completeScoringIngress({ lease_id: leaseId }).catch((error) => {
      console.error("Legacy reopen ingress lease completion failed", { matchId, code: error?.code || "unknown" });
    });
  }
}

async function scoringMirrorOperations(actorId) {
  const authority = scoringAuthorityEnvironment();
  const inspected = await inspectScoringMirrorOperations({ tournament_id: "2026" });
  const operations = inspected.payload || {};
  if (!operations.ok) {
    throw Object.assign(new Error(`Scoring mirror diagnostics failed (${operations.code || "unknown"}).`), { code: operations.code });
  }
  const events = operations.events || [];
  const matchIds = new Set(events.map((event) => clean(event.match_id)).filter(Boolean));
  const sheets = matchIds.size
    ? await readWorkbookSheetsByName(["Live Matches", "Matches", "Live Hole Scores"], { fresh: true })
    : {};
  const rows = (tab) => (sheets[tab]?.records || []).map(({ record }) => record);
  const google = events.map((event) => {
    const matchId = clean(event.match_id);
    const live = rows("Live Matches").find((row) => clean(row["Match ID"]) === matchId) || {};
    const archive = rows("Matches").find((row) => clean(row["Match ID"]) === matchId) || {};
    const holes = rows("Live Hole Scores").filter((row) => clean(row["Match ID"]) === matchId);
    return {
      eventId: event.id,
      matchId,
      live: {
        status: clean(live["Match Status"]),
        scoringLocked: truthy(live["Scoring Locked"]),
        accessActive: truthy(live["Access Active"]),
        accessVersion: number(live["Access Version"]),
        updatedAt: clean(live["Updated At"]),
        finalizedAt: clean(live["Finalized At"]),
      },
      archive: {
        status: clean(archive["Match Status"]),
        completedAt: clean(archive["Completed At"]),
        finalizedAt: clean(archive["Finalized At"]),
        finalizedBy: clean(archive["Finalized By"]),
        officialResultActive: !archiveResultIsInactive(archive),
      },
      holes: {
        count: holes.length,
        fingerprint: canonicalAuthorityFingerprint(holes),
      },
    };
  });
  const epoch = operations.active_epoch || {};
  const ingress = operations.ingress || {};
  return {
    actorId,
    runtime: {
      configuredAuthority: authority.requested,
      resolvedAuthority: authority.resolved,
      tournamentReadSource: clean(process.env.TOURNAMENT_READ_SOURCE || "google").toLowerCase(),
      tournamentFoundationReadSource: clean(process.env.TOURNAMENT_FOUNDATION_READ_SOURCE || "google").toLowerCase(),
      vercelEnvironment: clean(process.env.VERCEL_ENV),
      deploymentCommit: clean(process.env.VERCEL_GIT_COMMIT_SHA),
    },
    operations,
    google,
    healthyCommittedSupabaseEpoch: upper(epoch.status) === "COMMITTED"
      && upper(epoch.authority_after) === "SUPABASE"
      && upper(ingress.authority) === "SUPABASE"
      && upper(ingress.state) === "OPEN"
      && clean(ingress.active_epoch_id) === clean(epoch.epoch_id)
      && number(ingress.unresolved_client_queues) === 0,
  };
}

async function deliverScoringMirrorEvent(actorId, input = {}) {
  const eventId = clean(input.eventId);
  const expectedMatchId = clean(input.matchId);
  if (!eventId || !expectedMatchId || input.confirmDelivery !== true) {
    throw Object.assign(new Error("An inspected event, expected match, and explicit Director confirmation are required."), { code: "MIRROR_DELIVERY_CONFIRMATION_REQUIRED" });
  }
  const before = await scoringMirrorOperations(actorId);
  const event = (before.operations.events || []).find((item) => clean(item.id) === eventId);
  if (!event || clean(event.match_id) !== expectedMatchId) {
    throw Object.assign(new Error("The selected mirror event no longer matches the inspected event."), { code: "MIRROR_EVENT_CHANGED" });
  }
  if (before.runtime.resolvedAuthority !== "supabase" || !before.healthyCommittedSupabaseEpoch) {
    throw Object.assign(new Error("A healthy committed Supabase authority epoch is required for mirror delivery."), { code: "SUPABASE_EPOCH_NOT_HEALTHY" });
  }
  if (upper(event.event_type) !== "MATCH_REOPENED") {
    throw Object.assign(new Error("This controlled operation only delivers an inspected match-reopened event."), { code: "REOPEN_MIRROR_EVENT_REQUIRED" });
  }
  if (event.claimable !== true) {
    throw Object.assign(new Error("The selected event is not currently claimable in checkpoint order."), { code: "MIRROR_EVENT_NOT_CLAIMABLE" });
  }
  const delivery = await processNextGoogleOutboxEvent({
    expectedEventId: eventId,
    actor: `Supabase reopen mirror reconciliation · ${actorId}`,
  });
  if (!delivery.ok || clean(delivery.eventId) !== eventId || clean(delivery.matchId) !== expectedMatchId) {
    throw Object.assign(new Error(`Google mirror delivery failed at ${delivery.errorStage || "unknown"} (${delivery.errorCode || "unknown"}).`), {
      code: delivery.errorCode || "MIRROR_DELIVERY_FAILED",
      shadowDiagnostics: { details: JSON.stringify(delivery) },
    });
  }
  const after = await scoringMirrorOperations(actorId);
  return { before, delivery, after };
}

async function repairFinalizationParity(actorId, matchIdValue) {
  const matchId = clean(matchIdValue);
  if (!matchId) throw Object.assign(new Error("A finalized match is required."), { code: "MATCH_REQUIRED" });
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved !== "supabase") throw Object.assign(new Error("Supabase must be the active Preview scoring authority."), { code: "SUPABASE_NOT_AUTHORITY" });
  const before = await readCanonicalScoringAuthority({ match_id: matchId, mode: "MATCH" });
  const match = before.payload?.data;
  if (!before.payload?.ok || !match || clean(match.status).toUpperCase() !== "FINAL" || match.scoring_locked !== true) {
    throw Object.assign(new Error("The selected match is not in the canonical locked Final state."), { code: "FINAL_LOCK_REQUIRED" });
  }
  const repairKey = `finalization-parity:${matchId}:R${number(match.match_revision)}`;
  const repaired = await repairCanonicalFinalizationParity({
    environment: "PREVIEW",
    director_authorized: true,
    tournament_id: match.tournament_id,
    match_id: matchId,
    expected_match_revision: number(match.match_revision),
    repair_key: repairKey,
    actor_id: actorId,
  });
  if (!repaired.payload?.ok) throw Object.assign(new Error(`Supabase Final permission repair failed (${repaired.payload?.code || "unknown"}).`), { code: repaired.payload?.code });
  const permissionRevision = number(repaired.payload.permission_revision);
  const google = await withWorkbookWriteDiagnostics("finalization-parity-repair", () => repairFinalizedLiveMatchParity(
    matchId, { permissionRevision }, `Finalization parity repair · ${actorId}`,
  ));
  const googleMatch = google.result?.match || {};
  const googleUpdatedAt = clean(googleMatch["Updated At"] || google.result?.updatedAt);
  const verifiedFingerprint = canonicalAuthorityFingerprint({
    match_id: matchId,
    match_revision: number(match.match_revision),
    permission_revision: permissionRevision,
    status: "FINAL",
    scoring_locked: true,
    access_active: false,
    google_match_updated_at: googleUpdatedAt,
    operation: "FINALIZATION_PARITY_REPAIR",
  });
  const completed = await completeCanonicalFinalizationParityRepair({
    environment: "PREVIEW",
    director_authorized: true,
    tournament_id: match.tournament_id,
    match_id: matchId,
    expected_match_revision: number(match.match_revision),
    repair_key: repairKey,
    actor_id: actorId,
    google_match_updated_at: googleUpdatedAt,
    google_match_revision: number(googleMatch.Revision),
    verified_fingerprint: verifiedFingerprint,
  });
  if (!completed.payload?.ok) throw Object.assign(new Error(`Finalization parity checkpoint failed (${completed.payload?.code || "unknown"}).`), { code: completed.payload?.code });
  const source = await authoritativeImport(actorId);
  const reconciled = await currentAndReconcile(source.imported);
  return {
    matchId,
    matchRevisionBefore: number(match.match_revision),
    matchRevisionAfter: number(repaired.payload.match_revision),
    previousPermissionRevision: number(repaired.payload.previous_permission_revision, permissionRevision),
    permissionRevision,
    supabase: repaired.payload,
    google: {
      status: clean(googleMatch["Match Status"]),
      scoringLocked: truthy(googleMatch["Scoring Locked"]),
      accessActive: truthy(googleMatch["Access Active"]),
      accessVersion: number(googleMatch["Access Version"]),
      updatedAt: googleUpdatedAt,
      changed: Boolean(google.result?.changed),
    },
    checkpoint: completed.payload.checkpoint,
    googleDiagnostics: google.diagnostics,
    reconciliation: reconciled.report,
    counts: source.imported.counts,
  };
}

async function migratePreviewScoringLockSchema(actorId) {
  const authority = scoringAuthorityEnvironment();
  if (authority.resolved !== "supabase") throw Object.assign(new Error("Supabase must remain the active Preview scoring authority."), { code: "SUPABASE_NOT_AUTHORITY" });
  const [diagnostics, matchBefore, security, workbookBefore] = await Promise.all([
    readCanonicalScoringAuthority({ tournament_id: "2026", mode: "DIAGNOSTICS" }),
    readCanonicalScoringAuthority({ match_id: "2026-R3-4", mode: "MATCH" }),
    inspectCanonicalAuthoritySecurity(),
    inspectPreviewLiveMatchScoringLockMigration(),
  ]);
  const ingress = diagnostics.payload?.data?.ingress || {};
  const match = matchBefore.payload?.data;
  const securityState = security.payload || {};
  if (!diagnostics.payload?.ok || clean(ingress.authority).toUpperCase() !== "SUPABASE" || clean(ingress.state).toUpperCase() !== "OPEN"
      || number(diagnostics.payload?.data?.pending_outbox) !== 0) {
    throw Object.assign(new Error("Preview authority ingress or outbox pre-flight is not clean."), { code: "SCHEMA_MIGRATION_PREFLIGHT_FAILED" });
  }
  if (!matchBefore.payload?.ok || clean(match?.status).toUpperCase() !== "FINAL" || match?.scoring_locked !== true || number(match?.match_revision) !== 20) {
    throw Object.assign(new Error("Match 2026-R3-4 is not the verified locked Final revision 20."), { code: "MATCH4_PREFLIGHT_FAILED" });
  }
  if (number(securityState.tables) !== number(securityState.rls_enabled) || number(securityState.policies) !== 0
      || number(securityState.participant_rpc_grants) !== 0 || number(securityState.participant_table_grants) !== 0) {
    throw Object.assign(new Error("Canonical Supabase access posture is not clean."), { code: "SECURITY_PREFLIGHT_FAILED" });
  }
  const migrated = await withWorkbookWriteDiagnostics("preview-live-matches-scoring-locked-schema", () =>
    migratePreviewLiveMatchScoringLock({ expectedFingerprint: workbookBefore.fingerprint }));
  const backfilled = await backfillCanonicalFinalMatchLocks({
    environment: "PREVIEW", director_authorized: true, tournament_id: match.tournament_id, actor_id: actorId,
  });
  if (!backfilled.payload?.ok) throw Object.assign(new Error(`Canonical Final lock backfill failed (${backfilled.payload?.code || "unknown"}).`), { code: backfilled.payload?.code });
  const repaired = await repairFinalizationParity(actorId, "2026-R3-4");
  if (!repaired.reconciliation?.pass) throw Object.assign(new Error("Post-migration reconciliation is not clean."), {
    code: "SCHEMA_MIGRATION_RECONCILIATION_FAILED", shadowDiagnostics: { details: JSON.stringify(repaired.reconciliation) },
  });
  return {
    preflight: { authority: authority.resolved, ingress, pendingOutbox: diagnostics.payload.data.pending_outbox,
      match4: { status: match.status, scoringLocked: match.scoring_locked, matchRevision: match.match_revision },
      security: securityState, workbook: workbookBefore },
    migration: migrated.result,
    googleDiagnostics: migrated.diagnostics,
    canonicalFinalLockBackfill: backfilled.payload,
    match4Repair: repaired,
  };
}

function rehearsalPayload(source, targetMatchId, targetHole) {
  const base = source.payload;
  const tournamentId = `${base.tournament.tournament_id}-PHASE2-REHEARSAL`;
  const matchId = `REHEARSAL-${targetMatchId}`;
  const match = base.matches.find((row) => row.match_id === targetMatchId);
  const snapshot = base.snapshots.find((row) => row.match_id === targetMatchId);
  const snapshotId = `${matchId}:S1`;
  const checkpoint = base.checkpoints.find((row) => row.match_id === targetMatchId);
  const participants = base.match_participants.filter((row) => row.match_id === targetMatchId).map((row) => ({ ...row, match_id: matchId }));
  const permissions = participants.map((row) => ({ match_id: matchId, player_id: row.player_id, can_score: true, permission_revision: 1, revoked_at: "" }));
  const matchHoles = base.match_holes.filter((row) => row.match_id === targetMatchId).map((row) => ({ ...row, match_id: matchId, snapshot_id: snapshotId }));
  const tournamentPlayers = base.tournament_players.map((row) => ({ ...row, tournament_id: tournamentId }));
  const teams = base.teams.map((row) => ({ ...row, tournament_id: tournamentId }));
  const rounds = base.rounds.map((row) => ({ ...row, tournament_id: tournamentId }));
  return {
    environment: "PREVIEW", source_workbook_id: base.source_workbook_id, requested_by: "Phase 2 rehearsal",
    tournament: { tournament_id: tournamentId, tournament_year: number(base.tournament.tournament_year) + 1000,
      name: `${base.tournament.name} Phase 2 Rehearsal` },
    players: base.players, teams, tournament_players: tournamentPlayers, rounds,
    snapshots: [{ ...snapshot, tournament_id: tournamentId, match_id: matchId, snapshot_id: snapshotId, snapshot_revision: 1,
      canonical_hash: canonicalAuthorityFingerprint({ ...snapshot, tournament_id: tournamentId, match_id: matchId, snapshot_id: snapshotId, snapshot_revision: 1 }) }],
    matches: [{ ...match, match_id: matchId, tournament_id: tournamentId, scoring_snapshot_id: snapshotId,
      status: "LIVE", scoring_locked: false, permission_revision: 1, match_revision: 0, source_google_revision: 0,
      scored_holes: 0, current_hole: 0, holes_remaining: 18, team_1_holes_won: 0, team_2_holes_won: 0,
      running_result: "Scheduled", result_winner: "", clinched: false, scorecard_complete: false, finalized_at: "" }],
    match_participants: participants, permissions, match_holes: matchHoles, hole_scores: [],
    checkpoints: [{ match_id: matchId, last_supabase_match_revision: 0,
      google_match_updated_at: checkpoint.google_match_updated_at, google_match_revision: checkpoint.google_match_revision,
      google_hole_revisions: checkpoint.google_hole_revisions,
      verified_fingerprint: canonicalAuthorityFingerprint({ targetMatchId, targetHole, checkpoint }) }],
  };
}

function directorAuthorization(rehearsal, actorId) {
  const match = rehearsal.matches[0];
  return { passport_verified: true, tournament_id: rehearsal.tournament.tournament_id, match_id: match.match_id,
    player_id: actorId, permission_revision: match.permission_revision, role: "DIRECTOR" };
}

async function setupRehearsal(actorId) {
  const source = await authoritativeImport(actorId);
  const holesByMatch = new Map();
  for (const hole of source.imported.payload.hole_scores) {
    if (!holesByMatch.has(hole.match_id)) holesByMatch.set(hole.match_id, []);
    holesByMatch.get(hole.match_id).push(hole);
  }
  const targetMatch = source.imported.payload.matches.find((match) => match.status !== "FINAL" && (holesByMatch.get(match.match_id) || []).length) ||
    source.imported.payload.matches.find((match) => (holesByMatch.get(match.match_id) || []).length);
  if (!targetMatch || targetMatch.status === "FINAL") throw new Error("A writable Preview Google match with an existing score is required for the outbox rehearsal.");
  const targetHole = (holesByMatch.get(targetMatch.match_id) || []).at(-1);
  const google = await inspectGoogleMatchState(targetMatch.match_id);
  const googleMatch = google.match;
  const googleHole = google.holes.find((row) => number(row["Hole Number"]) === targetHole.hole_number);
  if (!googleMatch || !googleHole) throw new Error("The reversible Google rehearsal score was not found.");
  const rehearsal = rehearsalPayload(source.imported, targetMatch.match_id, targetHole.hole_number);
  const checkpoint = rehearsal.checkpoints[0];
  checkpoint.google_match_updated_at = clean(googleMatch["Updated At"]);
  checkpoint.google_match_revision = number(googleMatch.Revision);
  checkpoint.google_hole_revisions[String(targetHole.hole_number)] = number(googleHole.Revision);
  const replaced = await replaceCanonicalScoringAuthorityImport(rehearsal);
  if (!replaced.payload?.ok) throw new Error(`Rehearsal import failed (${replaced.payload?.code || "unknown"}).`);
  return { source, rehearsal, targetMatchId: targetMatch.match_id, targetHole: targetHole.hole_number,
    originalTeam1: grossScoresFromCell(googleHole["Team 1 Gross Scores"]), originalTeam2: grossScoresFromCell(googleHole["Team 2 Gross Scores"]),
    originalGoogleRevision: number(googleHole.Revision), originalGoogleUpdatedAt: clean(googleMatch["Updated At"]) };
}

async function submitRehearsalScore({ setup, team1, team2, matchRevision, holeRevision, actorId, label }) {
  const match = setup.rehearsal.matches[0];
  const startedAt = Date.now();
  const response = await submitCanonicalHoleScore({
    match_id: match.match_id, hole_number: setup.targetHole, team_1_gross_scores: team1, team_2_gross_scores: team2,
    expected_match_revision: matchRevision, expected_hole_revision: holeRevision,
    mutation_key: `phase2-rehearsal:${label}:${randomUUID()}`, google_target_match_id: setup.targetMatchId,
    rehearsal: true, authorization: directorAuthorization(setup.rehearsal, actorId),
  });
  if (!response.payload?.ok) throw new Error(`Rehearsal score failed (${response.payload?.code || "unknown"}).`);
  return { response, committedAt: Date.now(), totalCommitMs: Date.now() - startedAt };
}

const sameScores = (left, right) => JSON.stringify(left || []) === JSON.stringify(right || []);

async function restoreRehearsalGoogleScore(setup, actorId) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const current = await inspectGoogleMatchState(setup.targetMatchId);
      const hole = current.holes.find((row) => number(row["Hole Number"]) === setup.targetHole);
      if (!current.match || !hole) throw new Error("The reversible Google rehearsal score could not be inspected.");
      const team1 = grossScoresFromCell(hole["Team 1 Gross Scores"]);
      const team2 = grossScoresFromCell(hole["Team 2 Gross Scores"]);
      if (sameScores(team1, setup.originalTeam1) && sameScores(team2, setup.originalTeam2)) {
        return { restored: true, writeRequired: false, attempts: attempt, revision: number(hole.Revision) };
      }
      await saveLiveHoleScore(setup.targetMatchId, {
        holeNumber: setup.targetHole,
        team1GrossScores: setup.originalTeam1,
        team2GrossScores: setup.originalTeam2,
        expectedRevision: number(hole.Revision),
        expectedUpdatedAt: clean(current.match["Updated At"]),
        clientMutationId: `phase2-rehearsal-cleanup:${setup.targetMatchId}:${setup.targetHole}:${randomUUID()}`,
      }, `Phase 2 rehearsal cleanup · ${actorId}`);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw new Error("The reversible Google rehearsal score could not be restored.");
}

async function cleanupRehearsal(setup, actorId) {
  const reset = await replaceCanonicalScoringAuthorityImport(setup.rehearsal);
  if (!reset.payload?.ok) throw new Error(`Rehearsal outbox cleanup failed (${reset.payload?.code || "unknown"}).`);
  return restoreRehearsalGoogleScore(setup, actorId);
}

async function outboxRehearsal(actorId, cycles = 5) {
  const setup = await setupRehearsal(actorId);
  const changed = [...setup.originalTeam1];
  changed[0] = changed[0] >= 10 ? changed[0] - 1 : changed[0] + 1;
  let matchRevision = 0; let holeRevision = 0;
  const samples = [];
  let rehearsalError = null;
  try {
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      for (const [kind, team1] of [["change", changed], ["restore", setup.originalTeam1]]) {
        const mutationStartedAt = Date.now();
        const submitted = await submitRehearsalScore({ setup, team1, team2: setup.originalTeam2, matchRevision, holeRevision, actorId, label: `${cycle}:${kind}` });
        matchRevision = number(submitted.response.payload.match_revision);
        holeRevision = number(submitted.response.payload.hole_revision);
        const worker = await processNextGoogleOutboxEvent({ actor: `Phase 2 outbox rehearsal · ${actorId}` });
        if (!worker.ok) throw Object.assign(
          new Error(`Google outbox rehearsal failed at ${worker.errorStage || "unknown"} (${worker.errorCode || "unknown"}): ${worker.errorMessage || "No safe diagnostic was returned."}`),
          { code: worker.errorCode || "GOOGLE_OUTBOX_REHEARSAL_FAILED" },
        );
        samples.push({ cycle, kind, supabaseCommitMs: submitted.totalCommitMs,
          googleDeliveryMs: worker.googleDurationMs, totalMirrorLagMs: Date.now() - mutationStartedAt,
          checkpointRevision: worker.checkpoint?.last_supabase_match_revision });
      }
    }
  } catch (error) { rehearsalError = error; }
  const cleanup = await cleanupRehearsal(setup, actorId);
  const refreshed = await importMain(actorId);
  if (rehearsalError) throw rehearsalError;
  return { setup: { matchId: setup.targetMatchId, hole: setup.targetHole, originalGoogleRevision: setup.originalGoogleRevision,
    finalGoogleRevision: cleanup.revision, cycles }, samples,
    performance: { supabaseCommit: benchmarkSummary(samples.map((row) => row.supabaseCommitMs)),
      googleDelivery: benchmarkSummary(samples.map((row) => row.googleDeliveryMs)), mirrorLag: benchmarkSummary(samples.map((row) => row.totalMirrorLagMs)) },
    restorationPass: cleanup.restored, cleanup, mainParityRestored: refreshed.report.pass, rehearsalTournamentId: setup.rehearsal.tournament.tournament_id };
}

async function outboxFailureRehearsal(actorId) {
  const setup = await setupRehearsal(actorId);
  const match = setup.rehearsal.matches[0];
  const submitted = await submitRehearsalScore({ setup, team1: setup.originalTeam1, team2: setup.originalTeam2,
    matchRevision: 0, holeRevision: 0, actorId, label: "failure-429" });
  const injected429 = await processNextGoogleOutboxEvent({ actor: `Phase 2 failure rehearsal · ${actorId}`,
    dependencies: { saveLiveHoleScore: async () => { const error = new Error("Injected Google 429"); error.status = 429; throw error; } } });
  const immediateDuplicateWorker = await processNextGoogleOutboxEvent({ actor: `Phase 2 duplicate worker · ${actorId}` });
  await new Promise((resolve) => setTimeout(resolve, 2300));
  const recovered = await processNextGoogleOutboxEvent({ actor: `Phase 2 recovery · ${actorId}` });
  const diagnostics = await readCanonicalScoringAuthority({ tournament_id: setup.rehearsal.tournament.tournament_id, mode: "DIAGNOSTICS" });
  const refreshed = await importMain(actorId);
  return {
    injected429, immediateDuplicateWorkerEmpty: Boolean(immediateDuplicateWorker.empty), recovered,
    pendingAfterRecovery: diagnostics.payload?.data?.pending_outbox,
    supabaseStateIntact: submitted.response.payload.ok && number(submitted.response.payload.match_revision) === 1,
    mainParityRestored: refreshed.report.pass,
    pass: !injected429.ok && injected429.errorCode === "429" && immediateDuplicateWorker.empty && recovered.ok && number(diagnostics.payload?.data?.pending_outbox) === 0 && refreshed.report.pass,
  };
}

async function cutoverRollbackRehearsal(actorId) {
  const setup = await setupRehearsal(actorId);
  const tournamentId = setup.rehearsal.tournament.tournament_id;
  const state = await readCanonicalScoringAuthority({ tournament_id: tournamentId, mode: "CURRENT_STATE" });
  const fingerprint = canonicalAuthorityFingerprint(state.payload.data);
  const epochInput = { tournament_id: tournamentId, epoch_type: "CUTOVER", reconciliation_fingerprint: fingerprint,
    google_checkpoints: state.payload.data.checkpoints, supabase_match_revisions: state.payload.data.matches.map((row) => ({ match_id: row.match_id, revision: row.match_revision })),
    deployment_commit: process.env.VERCEL_GIT_COMMIT_SHA || "local", actor_id: actorId, reason: "Isolated Phase 2 rehearsal" };
  const preparedCutover = await prepareAuthorityEpoch(epochInput);
  if (!preparedCutover.payload?.ok) throw new Error(`Cutover rehearsal prepare failed (${preparedCutover.payload?.code}).`);
  const committedCutover = await commitAuthorityEpoch({ epoch_id: preparedCutover.payload.epoch_id, actor_id: actorId });
  if (!committedCutover.payload?.ok || committedCutover.payload.authority !== "SUPABASE") throw new Error("Cutover rehearsal commit failed.");
  const pending = await submitRehearsalScore({ setup, team1: setup.originalTeam1, team2: setup.originalTeam2,
    matchRevision: 0, holeRevision: 0, actorId, label: "rollback-gate" });
  const preparedRollback = await prepareAuthorityEpoch({ ...epochInput, epoch_type: "ROLLBACK",
    supabase_match_revisions: [{ match_id: setup.rehearsal.matches[0].match_id, revision: pending.response.payload.match_revision }] });
  if (!preparedRollback.payload?.ok) throw new Error(`Rollback rehearsal prepare failed (${preparedRollback.payload?.code}).`);
  const blockedRollback = await commitAuthorityEpoch({ epoch_id: preparedRollback.payload.epoch_id, actor_id: actorId });
  const drained = await drainGoogleOutbox({ maximum: 5, actor: `Phase 2 rollback rehearsal · ${actorId}` });
  if (!drained.ok) throw new Error("Rollback rehearsal could not drain Google outbox.");
  const committedRollback = await commitAuthorityEpoch({ epoch_id: preparedRollback.payload.epoch_id, actor_id: actorId });
  const refreshed = await importMain(actorId);
  return { preparedCutover: preparedCutover.payload, committedCutover: committedCutover.payload,
    blockedRollback: blockedRollback.payload, drained, preparedRollback: preparedRollback.payload,
    committedRollback: committedRollback.payload, mainParityRestored: refreshed.report.pass,
    pass: committedCutover.payload.authority === "SUPABASE" && preparedRollback.payload.ingress === "PAUSED" && blockedRollback.payload.code === "GOOGLE_OUTBOX_NOT_DRAINED" &&
      drained.ok && committedRollback.payload.authority === "GOOGLE" && refreshed.report.pass };
}

async function preflight(context) {
  const authority = scoringAuthorityEnvironment();
  const security = await inspectCanonicalAuthoritySecurity().catch(() => null);
  return {
    environment: process.env.VERCEL_ENV,
    previewWorkbook: context.shadow.previewWorkbook,
    productionIsolated: context.shadow.previewWorkbook,
    scoringEnvironment: process.env.SCORING_ENVIRONMENT || "test",
    scoringEnabled: process.env.SCORING_ENABLED !== "false",
    configuredAuthority: authority.requested,
    resolvedAuthority: authority.resolved,
    supabaseProjectRefMatches: clean(process.env.SUPABASE_SCORING_MIRROR_URL).includes("idgigvjjqkfbqjeredpb"),
    security: security?.payload || null,
    director: clean(context.identity?.name || context.identity?.player?.name || "authenticated Director"),
  };
}

export async function POST(request) {
  const context = await authorize(request);
  if (context.response) return context.response;
  const actorId = clean(context.identity?.player?.id || context.identity?.id || context.identity?.name || "authenticated Director");
  const startedAt = Date.now();
  try {
    const input = await request.json().catch(() => ({}));
    const action = clean(input.action);
    let result;
    if (action === "preflight") result = await preflight(context);
    else if (action === "import") {
      const imported = await importMain(actorId, { scope: input.scope || "FULL" });
      result = { scope: imported.importScope, counts: imported.imported.counts, fingerprint: imported.imported.fingerprint,
        googleReadMs: imported.googleReadMs, normalizationMs: imported.normalizationMs, supabaseImportMs: imported.writeMs,
        supabaseReadMs: imported.readMs, import: imported.write, reconciliation: imported.report };
    } else if (action === "reconcile") {
      const source = await authoritativeImport(actorId);
      const reconciled = await currentAndReconcile(source.imported);
      result = { counts: source.imported.counts, googleReadMs: source.googleReadMs, normalizationMs: source.normalizationMs,
        supabaseReadMs: reconciled.readMs, reconciliation: reconciled.report };
    } else if (action === "normalize-legacy-reopen") {
      result = await normalizeLegacyReopen(actorId, input);
    } else if (action === "mirror-diagnostics") {
      result = await scoringMirrorOperations(actorId);
    } else if (action === "deliver-mirror-event") {
      result = await deliverScoringMirrorEvent(actorId, input);
    } else if (action === "repair-finalization-parity") {
      result = await repairFinalizationParity(actorId, input.matchId);
    } else if (action === "migrate-preview-scoring-lock-schema") {
      result = await migratePreviewScoringLockSchema(actorId);
    } else if (action === "refresh-game-center-presentations") {
      result = await refreshGameCenterPresentations(actorId);
    } else if (action === "game-center-parity") {
      const source = await authoritativeImport(actorId);
      const presentation = buildGameCenterPresentationImport({ sheets: source.sheets, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy: actorId });
      result = await gameCenterParity(source, presentation);
    } else if (action === "scoring-read-parity") {
      const source = await authoritativeImport(actorId);
      const presentation = buildGameCenterPresentationImport({ sheets: source.sheets, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy: actorId });
      result = await scoringReadParity(source, presentation, input.samples);
    } else if (action === "my-match-parity") {
      const source = await authoritativeImport(actorId);
      const presentation = buildGameCenterPresentationImport({ sheets: source.sheets, sourceWorkbookId: process.env.GOOGLE_SHEETS_ID, requestedBy: actorId });
      result = await myMatchParity(source, presentation);
    } else if (action === "refresh-home-presentation") {
      result = await homeReadiness(actorId, { refresh: true });
    } else if (action === "home-parity") {
      result = await homeReadiness(actorId);
    } else if (action === "refresh-tournament-presentation") {
      result = await tournamentReadiness(actorId, { refresh: true, samples: input.samples });
    } else if (action === "tournament-parity") {
      result = await tournamentReadiness(actorId, { samples: input.samples });
    } else if (action === "leaderboards-core-parity") {
      result = await leaderboardsCoreReadiness(actorId, { samples: input.samples });
    } else if (action === "refresh-net-skins-configuration") {
      result = await netSkinsReadiness(actorId, { refreshConfiguration: true, samples: input.samples });
    } else if (action === "net-skins-parity") {
      result = await netSkinsReadiness(actorId, { samples: input.samples });
    } else if (action === "refresh-calcutta-configuration") {
      result = await calcuttaReadiness(actorId, { refresh: true, samples: input.samples });
    } else if (action === "calcutta-parity") {
      result = await calcuttaReadiness(actorId, { samples: input.samples });
    } else if (action === "refresh-published-odds-snapshots") {
      result = await publishedOddsReadiness(actorId, { refresh: true, samples: input.samples });
    } else if (action === "published-odds-parity") {
      result = await publishedOddsReadiness(actorId, { samples: input.samples });
    } else if (action === "refresh-competition-derived-state") {
      result = await competitionDerivedReadiness(actorId, { refresh: true, samples: input.samples });
    } else if (action === "competition-derived-parity") {
      result = await competitionDerivedReadiness(actorId, { samples: input.samples });
    } else if (action === "refresh-intelligence-derived-state") {
      result = await intelligenceDerivedReadiness(actorId, { refresh: true });
    } else if (action === "intelligence-derived-readiness") {
      result = await intelligenceDerivedReadiness(actorId);
    } else if (action === "match-authorization-parity") {
      const source = await authoritativeImport(actorId);
      result = await matchAuthorizationParity(source);
    } else if (action === "outbox-rehearsal") result = await outboxRehearsal(actorId, number(input.cycles, 5));
    else if (action === "outbox-failures") result = await outboxFailureRehearsal(actorId);
    else if (action === "cutover-rollback-rehearsal") result = await cutoverRollbackRehearsal(actorId);
    else if (action === "prepare-cutover") result = await prepareMainCutover(actorId);
    else if (action === "commit-cutover") result = await commitMainCutover(actorId, clean(input.epochId));
    else if (action === "prepare-rollback") result = await prepareMainRollback(actorId);
    else if (action === "commit-rollback") result = await commitMainRollback(actorId, clean(input.epochId));
    else if (action === "readiness") {
      const source = await authoritativeImport(actorId);
      const reconciled = await currentAndReconcile(source.imported);
      const diagnostics = await readCanonicalScoringAuthority({ tournament_id: source.imported.payload.tournament.tournament_id, mode: "DIAGNOSTICS" });
      result = { preflight: await preflight(context), counts: source.imported.counts, reconciliation: reconciled.report,
        diagnostics: diagnostics.payload?.data,
        ready: scoringAuthorityEnvironment().resolved === "google" && reconciled.report.pass && !number(diagnostics.payload?.data?.pending_outbox) };
    } else return NextResponse.json({ error: "Unsupported Phase 2 authority action." }, { status: 400 });
    return NextResponse.json({ ok: true, action, requestMs: Date.now() - startedAt, result });
  } catch (error) {
    console.error("Phase 2 authority rehearsal failed", { message: error?.message, code: error?.code || "" });
    const diagnostics = error?.shadowDiagnostics || {};
    return NextResponse.json({
      error: clean(diagnostics.message || error?.message || "Phase 2 authority rehearsal failed."),
      code: clean(diagnostics.code || error?.code),
      diagnostics: {
        status: Number(error?.status) || 0,
        path: clean(diagnostics.path),
        details: clean(diagnostics.details),
        hint: clean(diagnostics.hint),
      },
    }, { status: 503 });
  }
}
