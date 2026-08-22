import "server-only";

import { buildScorecardAnalytics } from "./scorecard-analytics.js";
import { loadScorecardAnalytics } from "./scorecard-data.js";
import { SPREADSHEET_ID } from "./google-sheets-data.js";
import { loadPredictionSheets, PREDICTION_SHEETS } from "./prediction-data.js";
import {
  getAllPlayerStats,
  getHeadToHead,
  getLegacyHistoricalSourceDiagnostics,
  getPartnershipStats,
  getPlayers,
  getRecords,
  getTournaments,
  getTournamentMatches,
  refreshHistoricalData,
} from "./stats.js";
import { buildGooglePredictionInputBundle, buildWarRoomConsumerData } from "./war-room-input-contract.js";

function calculationFacade() {
  return {
    getAllPlayerStats,
    getHeadToHead,
    getPartnershipStats,
    getPlayers,
    getRecords,
    getTournaments,
    getTournamentMatches,
  };
}

function inlineScorecards(sheets = {}) {
  return buildScorecardAnalytics({
    roundScorecards: sheets.roundScorecards,
    matches: sheets.matches,
    courseHoles: sheets.holes,
    courses: sheets.courses,
    teamNames: sheets.teamNames,
    players: sheets.players,
  });
}

export async function prepareGoogleWarRoomInput({ scope = "war-room", preparedAt } = {}) {
  const startedAt = performance.now();
  const acquisitionStartedAt = performance.now();
  const needsCanonicalCareerScorecards = ["team-intelligence", "full-diagnostic", "scorecard-calibration"].includes(scope);
  const [sheets, canonicalScorecards] = await Promise.all([
    loadPredictionSheets(),
    needsCanonicalCareerScorecards ? loadScorecardAnalytics() : Promise.resolve(null),
    refreshHistoricalData(),
  ]).then(([loadedSheets, loadedScorecards]) => [loadedSheets, loadedScorecards]);
  const acquisitionMs = Math.max(0, performance.now() - acquisitionStartedAt);
  const scorecardAnalytics = canonicalScorecards || inlineScorecards(sheets);
  const historicalSource = getLegacyHistoricalSourceDiagnostics();
  const calculations = calculationFacade();
  const transformStartedAt = performance.now();
  const bundle = buildGooglePredictionInputBundle({
    sheets,
    calculations,
    scorecardAnalytics,
    workbookId: SPREADSHEET_ID,
    preparedAt,
  });
  const consumerData = buildWarRoomConsumerData({ bundle, calculations, scorecardAnalytics, scope });
  const transformMs = Math.max(0, performance.now() - transformStartedAt);
  return Object.freeze({
    source: "google",
    bundle,
    consumerData,
    diagnostics: Object.freeze({
      adapterContract: "war-room-google-adapter-v1",
      predictionTabs: Object.values(PREDICTION_SHEETS).map((row) => row.label),
      predictionRangeCount: Object.keys(PREDICTION_SHEETS).length,
      worksheetDiscoveryOperations: 1,
      predictionBatchOperations: 2,
      historicalRefreshOperations: 10,
      historicalSource,
      canonicalScorecardLoaderUsed: needsCanonicalCareerScorecards,
      googleForegroundRequests: 13,
      supabaseRequests: 0,
      fallbackUsed: false,
      acquisitionMs,
      transformationMs: transformMs,
      serializationMs: 0,
      serializedBytes: Buffer.byteLength(JSON.stringify({ bundle, consumerData })),
      totalPreparationMs: Math.max(0, performance.now() - startedAt),
      bundleContractVersion: bundle.metadata.contractVersion,
      factualFingerprint: bundle.fingerprints.bundle,
      settingsRevision: null,
      settingsFingerprint: bundle.predictionSettings.effectiveFingerprint,
      orderingFingerprint: bundle.fingerprints.sections.ordering,
      evidencePolicyVersion: bundle.metadata.evidencePolicyVersion,
    }),
  });
}
