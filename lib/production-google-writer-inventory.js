import {
  GOOGLE_AUTHORING_OPERATIONS,
  GOOGLE_WORKBOOK_MUTATION_INTENTS,
} from "./google-workbook-mutation-intent.js";

const canonical = GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY;
const authoring = GOOGLE_WORKBOOK_MUTATION_INTENTS.AUTHORING;
const mirror = GOOGLE_WORKBOOK_MUTATION_INTENTS.MIRROR_ARCHIVE;

/**
 * Machine-reviewed inventory for every Production-capable application entry
 * that can reach the sole Google Sheets mutation transport. A static test
 * compares this list to repository call sites; additions fail until they are
 * classified and placed behind the correct boundary.
 */
export const PRODUCTION_GOOGLE_WRITER_ENTRYPOINTS = Object.freeze([
  Object.freeze({ path: "lib/scoring-persistence-adapter.js", intent: canonical,
    boundary: "withProductionGoogleAuthorityWrite", domain: "PARTICIPANT_SCORING" }),
  Object.freeze({ path: "app/api/director/route.js", intent: canonical,
    boundary: "withProductionGoogleAuthorityWrite", domain: "DIRECTOR_CURRENT_AND_LIFECYCLE" }),
  Object.freeze({ path: "app/api/live-matches/route.js", intent: canonical,
    boundary: "withProductionGoogleAuthorityWrite", domain: "COMPATIBILITY_MATCH_LIFECYCLE" }),
  Object.freeze({ path: "app/api/admin/tournament/route.js", intent: canonical,
    boundary: "withProductionGoogleAuthorityWrite", domain: "CURRENT_TOURNAMENT" }),
  Object.freeze({ path: "app/api/admin/cms/route.js", intent: canonical,
    boundary: "withProductionGoogleAuthorityWrite", domain: "CURRENT_FOUNDATION", mixedIntent: true }),

  Object.freeze({ path: "app/api/admin/cms/route.js", intent: authoring,
    boundary: "withProductionGoogleAuthoringWrite", domain: "DRAFT_GUIDE_SETTINGS", mixedIntent: true }),
  Object.freeze({ path: "app/api/tournament-guide/route.js", intent: authoring,
    boundary: "withProductionGoogleAuthoringWrite", domain: "GUIDE" }),
  Object.freeze({ path: "app/api/odds/publish/route.js", intent: authoring,
    boundary: "withProductionGoogleAuthoringWrite", domain: "ODDS_PUBLICATION" }),
  Object.freeze({ path: "app/api/player-passport/activation/route.js", intent: authoring,
    boundary: "withProductionGoogleAuthoringWrite", domain: "PASSPORT_ROLLBACK" }),
  Object.freeze({ path: "app/api/player-passport/admin/route.js", intent: authoring,
    boundary: "withProductionGoogleAuthoringWrite", domain: "PASSPORT_ROLLBACK" }),
  Object.freeze({ path: "app/api/player-passport/readiness/route.js", intent: authoring,
    boundary: "withProductionGoogleAuthoringWrite", domain: "PASSPORT_ROLLBACK" }),
  Object.freeze({ path: "app/api/player-passport/notifications/route.js", intent: authoring,
    boundary: "withProductionGoogleAuthoringWrite", domain: "PASSPORT_ROLLBACK", previewOnly: true }),
  Object.freeze({ path: "app/api/director/notifications/sandbox/route.js", intent: authoring,
    boundary: "withProductionGoogleAuthoringWrite", domain: "PASSPORT_ROLLBACK", previewOnly: true }),

  Object.freeze({ path: "lib/scoring-google-outbox.js", intent: mirror,
    boundary: "withProductionGoogleServiceAccountCredentials", credentialOperation: "SCORING_GOOGLE_OUTBOX",
    domain: "SCORING_MIRROR" }),
  Object.freeze({ path: "lib/scorecard-archive-worker.js", intent: mirror,
    boundary: "withProductionGoogleServiceAccountCredentials", credentialOperation: "ROUND_SCORECARDS_ARCHIVE",
    domain: "SCORECARD_ARCHIVE" }),
  Object.freeze({ path: "lib/championship-odds-google-mirror.js", intent: mirror,
    boundary: "withProductionGoogleServiceAccountCredentials", credentialOperation: "ODDS_GOOGLE_MIRROR",
    domain: "ODDS_MIRROR" }),
]);

export const PREVIEW_ONLY_GOOGLE_WRITER_ENTRYPOINTS = Object.freeze([
  "app/api/director/reset-preview/route.js",
  "app/api/director/scoring-authority/route.js",
  "app/api/director/scoring-shadow/benchmark/route.js",
  "app/api/director/scoring-shadow/phase2-dry-run/route.js",
  "app/api/director/participant-identity/route.js",
]);

export const PRODUCTION_CANONICAL_GOOGLE_WRITERS = Object.freeze([
  "confirmLiveMatchScorecard",
  "disableLiveMatchAccess",
  "enableLiveMatchAccess",
  "finalizeLiveMatch",
  "generateLiveMatchAccess",
  "markLiveMatch",
  "reopenLiveMatch",
  "saveLiveHoleScore",
  "updateDirectorCalcutta",
  "updateDirectorCourseTees",
  "updateDirectorMatchManagement",
  "updateDirectorNetSkins",
  "updateDirectorRoundPairings",
  "updateLiveMatch",
  "updateLiveMatchPairing",
  "updateTournamentAdminData",
  "saveCmsRecord",
  "archiveCmsRecord",
  "deleteCmsRecord",
  "reorderCmsRecord",
]);

export const PRODUCTION_AUTHORING_GOOGLE_WRITERS = Object.freeze([
  "activatePlayerPassport",
  "appendNotificationLog",
  "deleteTournamentGuideRecord",
  "disablePlayerPassportActivation",
  "generateMissingPlayerPassports",
  "generatePlayerPassport",
  "invalidatePushDevice",
  "publishOddsSnapshot",
  "revokePlayerPassportDevices",
  "saveTournamentGuideRecord",
  "updatePlayerReadiness",
]);

export const PRODUCTION_MIRROR_ARCHIVE_GOOGLE_WRITERS = Object.freeze([
  "invalidateRoundScorecardsArchive",
  "mirrorCanonicalLiveMatchControl",
  "publishOddsSnapshot",
  "upsertRoundScorecardsArchive",
]);

export const PREVIEW_ONLY_GOOGLE_WRITERS = Object.freeze([
  "initializePreviewParticipantIdentityConfiguration",
  "migratePreviewLiveMatchScoringLock",
  "normalizeLegacyReopenedMatch",
  "repairFinalizedLiveMatchParity",
  "resetPreviewTournament",
  "restorePreviewScoringBenchmarkRows",
]);

export const PRODUCTION_AUTHORING_OPERATION_BY_DOMAIN = Object.freeze({
  DRAFT: GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_DRAFT,
  GUIDE: GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_GUIDE,
  SETTINGS: GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_PRESENTATION,
  PREDICTION_SETTINGS: GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_PREDICTION_SETTINGS,
  ODDS_PUBLICATION: GOOGLE_AUTHORING_OPERATIONS.ODDS_PUBLICATION,
  PASSPORT_ROLLBACK: GOOGLE_AUTHORING_OPERATIONS.PASSPORT_ROLLBACK,
  TOURNAMENT_GUIDE: GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE,
});

export function productionGoogleWriterInventory() {
  return PRODUCTION_GOOGLE_WRITER_ENTRYPOINTS.map((item) => ({ ...item }));
}
