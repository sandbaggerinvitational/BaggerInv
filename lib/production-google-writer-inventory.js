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
  Object.freeze({ path: "lib/future-match-google-compatibility-worker.js", intent: mirror,
    boundary: "withProductionGoogleServiceAccountCredentials", credentialOperation: "FUTURE_MATCH_GOOGLE_COMPATIBILITY",
    domain: "FUTURE_MATCH_COMPATIBILITY" }),
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

/**
 * These exported helpers are not independent application entry points. They
 * are invoked only from the admitted Finalize/Reopen implementation while the
 * parent CANONICAL_LEGACY mutation scope and admission capability remain
 * active. Keeping them explicit prevents an apparently harmless future import
 * from creating an unreviewed Production writer path.
 */
export const PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITERS = Object.freeze([
  "publishOfficialCalcutta",
  "synchronizeNetSkinsResults",
]);
export const PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_CLASSIFICATION =
  "INTERNAL_SUBORDINATE_REQUIRES_PARENT_ADMISSION";
export const PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITER_DETAILS = Object.freeze([
  Object.freeze({
    symbol: "publishOfficialCalcutta",
    classification: PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_CLASSIFICATION,
    admittedParents: Object.freeze(["finalizeLiveMatch", "reopenLiveMatch"]),
  }),
  Object.freeze({
    symbol: "synchronizeNetSkinsResults",
    classification: PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_CLASSIFICATION,
    admittedParents: Object.freeze(["finalizeLiveMatch", "reopenLiveMatch"]),
  }),
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
  "provisionFutureMatchGoogleCompatibility",
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

const canonicalRouteEntry = ({
  id,
  route,
  actions,
  functions,
  canonicalTargets,
  authorityCheck,
}) => Object.freeze({
  id,
  method: "POST",
  route,
  actions: Object.freeze([...actions]),
  functions: Object.freeze([...functions]),
  authorityCheck,
  admissionCheck: "withProductionGoogleAuthorityWrite",
  leaseContract: "ADMISSION_V3",
  canonicalTargets: Object.freeze([...canonicalTargets]),
  closedBehavior: "FAIL_CLOSED_BEFORE_GOOGLE_PROVIDER_DISPATCH",
});

/**
 * Current-worktree Production Google-canonical mutation entry matrix. This is
 * deliberately route/method/action oriented: the provider-writer inventory
 * above classifies callable symbols, while this matrix proves which HTTP
 * surfaces can start those symbols. A static test binds every row to the route
 * source and fails if a new route-reachable canonical writer is not added.
 */
export const PRODUCTION_CANONICAL_GOOGLE_MUTATION_ENTRY_MATRIX = Object.freeze([
  canonicalRouteEntry({
    id: "participant-current",
    route: "/api/scoring/current",
    actions: ["score", "confirm"],
    functions: ["persistParticipantScore", "saveLiveHoleScore", "confirmLiveMatchScorecard"],
    canonicalTargets: [
      "Live Hole Scores", "Live Matches", "Matches", "Match Update Log",
      "Admin Audit Log", "Net Skins Result", "Calcutta Round Results", "Calcutta Standings",
    ],
    authorityCheck: "requireScoringAuthority + validateAuthoritativeParticipantSession",
  }),
  canonicalRouteEntry({
    id: "participant-match-compatibility",
    route: "/api/scoring/matches/[matchId]",
    actions: ["score", "confirm"],
    functions: ["persistParticipantScore", "saveLiveHoleScore", "confirmLiveMatchScorecard"],
    canonicalTargets: [
      "Live Hole Scores", "Live Matches", "Matches", "Match Update Log",
      "Admin Audit Log", "Net Skins Result", "Calcutta Round Results", "Calcutta Standings",
    ],
    authorityCheck: "requireScoringAuthority + validateAuthoritativeParticipantSession",
  }),
  canonicalRouteEntry({
    id: "director-current-and-lifecycle",
    route: "/api/director",
    actions: [
      "automation-check", "set-live", "open-round", "unlock-scoring", "lock-scoring",
      "close-round", "reopen-match", "match-unlock-scoring", "match-lock-scoring",
      "match-mark-live", "match-finalize", "match-reopen", "automation",
      "match-management", "round-pairings", "calcutta-management",
      "net-skins-eligibility", "course-tees",
    ],
    functions: [
      "updateTournamentAdminData", "markLiveMatch", "enableLiveMatchAccess",
      "disableLiveMatchAccess", "reopenLiveMatch", "finalizeLiveMatch",
      "updateDirectorMatchManagement", "updateDirectorRoundPairings",
      "updateDirectorCalcutta", "updateDirectorNetSkins", "updateDirectorCourseTees",
    ],
    canonicalTargets: [
      "Tournaments", "Courses", "Live Matches", "Matches", "Match Update Log",
      "Admin Audit Log", "Calcutta Purchases", "Calcutta Ownership",
      "Calcutta Round Results", "Calcutta Standings", "Net Skins", "Net Skins Result",
    ],
    authorityCheck: "assertDirectorMutationAuthority + assertScoringMutationAuthorityContractBeforeDispatch",
  }),
  canonicalRouteEntry({
    id: "live-match-compatibility-control",
    route: "/api/live-matches",
    actions: [
      "update", "mark-live", "pairing", "finalize", "reopen",
      "access-generate", "access-disable",
    ],
    functions: [
      "updateLiveMatch", "markLiveMatch", "updateLiveMatchPairing", "finalizeLiveMatch",
      "reopenLiveMatch", "generateLiveMatchAccess", "disableLiveMatchAccess",
    ],
    canonicalTargets: [
      "Live Matches", "Matches", "Match Update Log", "Admin Audit Log",
      "Net Skins Result", "Calcutta Round Results", "Calcutta Standings",
    ],
    authorityCheck: "assertDirectorMutationAuthority + assertScoringMutationAuthorityContractBeforeDispatch",
  }),
  canonicalRouteEntry({
    id: "tournament-admin",
    route: "/api/admin/tournament",
    actions: ["update"],
    functions: ["updateTournamentAdminData"],
    canonicalTargets: ["Tournaments", "Admin Audit Log", "Calcutta Round Results", "Calcutta Standings"],
    authorityCheck: "assertDirectorMutationAuthority + production admission authority contract",
  }),
  canonicalRouteEntry({
    id: "canonical-admin-cms",
    route: "/api/admin/cms",
    actions: [
      "players:save|archive|delete",
      "teams:save|delete",
      "rosters:save|delete",
      "courses:save|delete",
      "matches:save|delete",
      "awards:save|delete",
    ],
    functions: ["saveCmsRecord", "archiveCmsRecord", "deleteCmsRecord", "reorderCmsRecord"],
    canonicalTargets: [
      "Players", "Team Names", "Handicaps", "Courses", "Matches", "Awards", "Admin Audit Log",
    ],
    authorityCheck: "assertDirectorMutationAuthority + production admission authority contract",
  }),
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
