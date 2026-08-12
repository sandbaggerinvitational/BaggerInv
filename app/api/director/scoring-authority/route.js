import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";
import { assertScoringShadowAdministrativeEnvironment } from "../../../../lib/scoring-shadow-gate.js";
import { scoringAuthorityEnvironment } from "../../../../lib/scoring-authority.js";
import {
  abortAuthorityEpoch,
  backfillCanonicalFinalMatchLocks,
  buildCanonicalScoringAuthorityImport,
  canonicalAuthorityFingerprint,
  commitAuthorityEpoch,
  completeCanonicalFinalizationParityRepair,
  inspectCanonicalAuthoritySecurity,
  prepareAuthorityEpoch,
  readCanonicalScoringAuthority,
  reconcileCanonicalScoringAuthority,
  repairCanonicalFinalizationParity,
  replaceCanonicalScoringAuthorityImport,
  submitCanonicalHoleScore,
} from "../../../../lib/scoring-authority-supabase.js";
import { benchmarkSummary } from "../../../../lib/scoring-shadow.js";
import { drainGoogleOutbox, inspectGoogleMatchState, processNextGoogleOutboxEvent } from "../../../../lib/scoring-google-outbox.js";
import { inspectPreviewLiveMatchScoringLockMigration, migratePreviewLiveMatchScoringLock, readWorkbookSheetsByName, repairFinalizedLiveMatchParity, saveLiveHoleScore, withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write.js";
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
  netSkinsScoreRowsFromSupabaseView,
  readNetSkinsInputView,
  readNetSkinsResultView,
  recalculateNetSkinsTournament,
  replaceNetSkinsConfiguration,
} from "../../../../lib/net-skins-supabase.js";
import { netSkinsResultRecords } from "../../../../lib/net-skins.js";
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

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => /^(true|yes|1|locked)$/i.test(clean(value));
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });
const WORKBOOK_TABS = ["Tournaments", "Players", "Handicaps", "Team Names", "Rounds", "Courses", "Course Holes", "Live Matches", "Matches", "Live Hole Scores"];
const NET_SKINS_WORKBOOK_TABS = ["Net Skins", "Net Skins Result", "Live Matches"];

async function authorize(request) {
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  let shadow;
  try { shadow = assertScoringShadowAdministrativeEnvironment(); }
  catch { return { response: unavailable() }; }
  const authorization = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
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

async function importMain(requestedBy) {
  const source = await authoritativeImport(requestedBy);
  const writeStartedAt = Date.now();
  const write = await replaceCanonicalScoringAuthorityImport(source.imported.payload);
  const writeMs = Date.now() - writeStartedAt;
  if (!write.payload?.ok) throw new Error(`Canonical import failed (${write.payload?.code || "unknown"}).`);
  const reconciled = await currentAndReconcile(source.imported);
  return { ...source, write: write.payload, writeMs, ...reconciled };
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
      const imported = await importMain(actorId);
      result = { counts: imported.imported.counts, fingerprint: imported.imported.fingerprint,
        googleReadMs: imported.googleReadMs, normalizationMs: imported.normalizationMs, supabaseImportMs: imported.writeMs,
        supabaseReadMs: imported.readMs, import: imported.write, reconciliation: imported.report };
    } else if (action === "reconcile") {
      const source = await authoritativeImport(actorId);
      const reconciled = await currentAndReconcile(source.imported);
      result = { counts: source.imported.counts, googleReadMs: source.googleReadMs, normalizationMs: source.normalizationMs,
        supabaseReadMs: reconciled.readMs, reconciliation: reconciled.report };
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
    } else if (action === "refresh-published-odds-snapshots") {
      result = await publishedOddsReadiness(actorId, { refresh: true, samples: input.samples });
    } else if (action === "published-odds-parity") {
      result = await publishedOddsReadiness(actorId, { samples: input.samples });
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
