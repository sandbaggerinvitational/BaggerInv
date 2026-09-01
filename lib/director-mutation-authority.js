import { scoringAuthorityEnvironment } from "./scoring-authority.js";
import { productionCutoverPhaseAtLeast } from "./production-cutover-activation-contract.js";

const clean = (value) => String(value ?? "").trim().toLowerCase();

export const DIRECTOR_MUTATION_SURFACES = Object.freeze({
  DIRECTOR: "director",
  LIVE_MATCHES: "live-matches",
  ADMIN_CMS: "admin-cms",
});

export const DIRECTOR_MUTATION_ERROR_CODES = Object.freeze({
  AUTHORITY_UNAVAILABLE: "SCORING_AUTHORITY_UNAVAILABLE",
  NOT_SUPPORTED_UNDER_SUPABASE: "OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY",
  UNKNOWN_OPERATION: "DIRECTOR_MUTATION_NOT_RECOGNIZED",
  PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED: "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED",
  PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED: "PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED",
  PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED: "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED",
  // Compatibility alias for the first retired Google authoring domain.
  PRODUCTION_GOOGLE_AUTHORING_RETIRED: "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED",
});

const googleDirect = (domain, googleWriters, description) => Object.freeze({
  domain,
  execution: "GOOGLE_DIRECT",
  googleWriters: Object.freeze([...googleWriters]),
  supabaseAllowed: false,
  productionSupabaseAction: "",
  canonicalLifecycleAction: "",
  description,
});

const canonicalLifecycle = (domain, action, googleWriters, description) => Object.freeze({
  domain,
  execution: "AUTHORITY_AWARE_CANONICAL_LIFECYCLE",
  googleWriters: Object.freeze([...googleWriters]),
  supabaseAllowed: true,
  productionSupabaseAction: "",
  canonicalLifecycleAction: action,
  description,
});

const googleDirectorAuthoring = (domain, googleWriters, description) => Object.freeze({
  domain,
  execution: "GOOGLE_DIRECTOR_AUTHORING",
  googleWriters: Object.freeze([...googleWriters]),
  supabaseAllowed: true,
  productionSupabaseAction: "",
  canonicalLifecycleAction: "",
  description,
});

const retiredProductionGoogleAuthoring = (domain, googleWriters, description, {
  code = DIRECTOR_MUTATION_ERROR_CODES.PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED,
  message = "Production Prediction Settings are managed in the Director Console.",
} = {}) => Object.freeze({
  ...googleDirectorAuthoring(domain, googleWriters, description),
  productionGoogleAuthoringRetired: true,
  productionGoogleAuthoringRetiredCode: code,
  productionGoogleAuthoringRetiredMessage: message,
});

const productionCanonicalLifecycle = (domain, action, googleWriters, description) => Object.freeze({
  domain,
  execution: "AUTHORITY_AWARE_CANONICAL_LIFECYCLE",
  googleWriters: Object.freeze([...googleWriters]),
  supabaseAllowed: false,
  canonicalLifecycleAction: "",
  productionSupabaseAction: action,
  description,
});

const directorPolicy = Object.freeze({
  "automation-check": googleDirect(
    "TOURNAMENT_AND_MATCH_LIFECYCLE",
    ["updateTournamentAdminData", "markLiveMatch", "enableLiveMatchAccess"],
    "Advances a due round and may open its matches for scoring.",
  ),
  "set-live": googleDirect(
    "MATCH_LIFECYCLE_AND_SCORING_PERMISSION",
    ["markLiveMatch", "enableLiveMatchAccess"],
    "Marks the selected round's matches Live and enables legacy match access.",
  ),
  "open-round": googleDirect(
    "TOURNAMENT_AND_MATCH_LIFECYCLE",
    ["updateTournamentAdminData", "markLiveMatch", "enableLiveMatchAccess"],
    "Opens a tournament round and may open its matches for scoring.",
  ),
  "unlock-scoring": googleDirect(
    "SCORING_PERMISSION",
    ["enableLiveMatchAccess"],
    "Enables legacy scoring access for every non-Final match in a round.",
  ),
  "lock-scoring": googleDirect(
    "SCORING_PERMISSION",
    ["disableLiveMatchAccess"],
    "Disables legacy scoring access for every non-Final match in a round.",
  ),
  "close-round": googleDirect(
    "TOURNAMENT_LIFECYCLE",
    ["updateTournamentAdminData"],
    "Advances the current round or closes the tournament.",
  ),
  "reopen-match": canonicalLifecycle(
    "MATCH_LIFECYCLE",
    "reopen",
    ["reopenLiveMatch"],
    "Reopens a Final match through the selected scoring authority.",
  ),
  "match-unlock-scoring": productionCanonicalLifecycle(
    "SCORING_PERMISSION",
    "scoring-unlock",
    ["enableLiveMatchAccess"],
    "Enables legacy scoring access for one match.",
  ),
  "match-lock-scoring": productionCanonicalLifecycle(
    "SCORING_PERMISSION",
    "scoring-lock",
    ["disableLiveMatchAccess"],
    "Disables legacy scoring access for one match.",
  ),
  "match-mark-live": productionCanonicalLifecycle(
    "MATCH_LIFECYCLE",
    "mark-live",
    ["markLiveMatch"],
    "Marks one match Live in the legacy workbook.",
  ),
  "match-finalize": canonicalLifecycle(
    "MATCH_LIFECYCLE",
    "finalize",
    ["finalizeLiveMatch"],
    "Finalizes a match through the selected scoring authority.",
  ),
  "match-reopen": canonicalLifecycle(
    "MATCH_LIFECYCLE",
    "reopen",
    ["reopenLiveMatch"],
    "Reopens a Final match through the selected scoring authority.",
  ),
  automation: googleDirect(
    "AUTOMATION_CONFIGURATION",
    ["updateTournamentAdminData"],
    "Updates Director automation configuration in the legacy workbook.",
  ),
  "match-management": googleDirect(
    "MATCH_CONFIGURATION",
    ["updateDirectorMatchManagement"],
    "Updates match metadata, course assignment, tee time, starting hole, or pairings.",
  ),
  "round-pairings": googleDirect(
    "MATCH_PAIRINGS",
    ["updateDirectorRoundPairings"],
    "Updates a round's pairings in the legacy workbook.",
  ),
  "calcutta-management": googleDirect(
    "CALCUTTA_CONFIGURATION",
    ["updateDirectorCalcutta"],
    "Updates Google-authored Calcutta configuration before its Supabase projection is synchronized.",
  ),
  "net-skins-eligibility": googleDirect(
    "NET_SKINS_CONFIGURATION",
    ["updateDirectorNetSkins"],
    "Updates Google-authored Net Skins eligibility before its Supabase projection is synchronized.",
  ),
  "course-tees": googleDirect(
    "COURSE_CONFIGURATION",
    ["updateDirectorCourseTees"],
    "Updates current course tee configuration in the legacy workbook.",
  ),
  "reset-preview": googleDirect(
    "PREVIEW_TOURNAMENT_RESET",
    ["resetPreviewTournament"],
    "Resets Preview tournament, scoring, result, and operational workbook state.",
  ),
  "tournament-admin-update": googleDirect(
    "TOURNAMENT_CONFIGURATION_AND_LIFECYCLE",
    ["updateTournamentAdminData"],
    "Updates legacy tournament configuration and lifecycle fields.",
  ),
});

const liveMatchesPolicy = Object.freeze({
  update: googleDirect(
    "OFFICIAL_MATCH_RESULT",
    ["updateLiveMatch"],
    "Updates legacy official result, points, or match notes.",
  ),
  "mark-live": productionCanonicalLifecycle(
    "MATCH_LIFECYCLE",
    "mark-live",
    ["markLiveMatch"],
    "Marks one match Live in the legacy workbook.",
  ),
  pairing: googleDirect(
    "MATCH_PAIRINGS",
    ["updateLiveMatchPairing"],
    "Updates one match pairing in the legacy workbook.",
  ),
  finalize: canonicalLifecycle(
    "MATCH_LIFECYCLE",
    "finalize",
    ["finalizeLiveMatch"],
    "Finalizes a match through the selected scoring authority.",
  ),
  reopen: canonicalLifecycle(
    "MATCH_LIFECYCLE",
    "reopen",
    ["reopenLiveMatch"],
    "Reopens a Final match through the selected scoring authority.",
  ),
  "access-generate": productionCanonicalLifecycle(
    "LEGACY_MATCH_ACCESS",
    "access-activate",
    ["generateLiveMatchAccess"],
    "Generates legacy match-code credentials and advances their workbook version.",
  ),
  "access-disable": productionCanonicalLifecycle(
    "LEGACY_MATCH_ACCESS",
    "access-revoke",
    ["disableLiveMatchAccess"],
    "Disables legacy match-code credentials and advances their workbook version.",
  ),
});

const adminCmsPolicy = Object.freeze({
  players: googleDirect("CANONICAL_PLAYER_IDENTITY", ["saveCmsRecord"], "Edits canonical player identity facts in the legacy workbook."),
  teams: googleDirect("CANONICAL_TEAM_IDENTITY", ["saveCmsRecord"], "Edits canonical tournament team facts in the legacy workbook."),
  rosters: googleDirect("CANONICAL_ROSTER_AND_HANDICAP", ["saveCmsRecord"], "Edits canonical roster and tournament-handicap facts in the legacy workbook."),
  courses: googleDirect("CANONICAL_COURSE_CONFIGURATION", ["saveCmsRecord"], "Edits canonical current course configuration in the legacy workbook."),
  matches: googleDirect("CANONICAL_MATCH_CONFIGURATION", ["saveCmsRecord"], "Edits canonical match pairings and frozen configuration in the legacy workbook."),
  awards: googleDirect("CANONICAL_COMPLETED_HISTORY", ["saveCmsRecord"], "Edits completed-history awards in the legacy workbook."),
  "draft-settings": retiredProductionGoogleAuthoring(
    "DRAFT_CONFIGURATION_AUTHORING",
    ["saveCmsRecord", "synchronizeDraftProjection"],
    "Production authoring is Supabase-native; the isolated Preview editor remains available.",
    {
      code: DIRECTOR_MUTATION_ERROR_CODES.PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED,
      message: "Production Draft authoring is managed in the Director Console.",
    },
  ),
  "draft-picks": retiredProductionGoogleAuthoring(
    "DRAFT_PICK_AUTHORING",
    ["saveCmsRecord", "synchronizeDraftProjection"],
    "Production authoring is Supabase-native; the isolated Preview editor remains available.",
    {
      code: DIRECTOR_MUTATION_ERROR_CODES.PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED,
      message: "Production Draft authoring is managed in the Director Console.",
    },
  ),
  schedule: retiredProductionGoogleAuthoring(
    "GUIDE_SCHEDULE_AUTHORING",
    ["saveCmsRecord"],
    "Production authoring is Supabase-native; the isolated Preview editor remains available.",
    {
      code: DIRECTOR_MUTATION_ERROR_CODES.PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED,
      message: "Production Tournament Guide content is managed in the Director Console.",
    },
  ),
  media: googleDirectorAuthoring("STATIC_MEDIA_AUTHORING", ["saveCmsRecord"], "Media metadata remains Director-authored presentation content."),
  settings: googleDirectorAuthoring("SITE_PRESENTATION_AUTHORING", ["saveCmsRecord"], "Site settings remain Director-authored presentation content."),
  "prediction-settings": retiredProductionGoogleAuthoring("PREDICTION_CONFIGURATION_AUTHORING", ["saveCmsRecord"], "Production authoring is Supabase-native; the isolated Preview editor remains available."),
});

export const DIRECTOR_MUTATION_POLICY = Object.freeze({
  [DIRECTOR_MUTATION_SURFACES.DIRECTOR]: directorPolicy,
  [DIRECTOR_MUTATION_SURFACES.LIVE_MATCHES]: liveMatchesPolicy,
  [DIRECTOR_MUTATION_SURFACES.ADMIN_CMS]: adminCmsPolicy,
});

const surfaceAliases = Object.freeze({
  director: DIRECTOR_MUTATION_SURFACES.DIRECTOR,
  "/api/director": DIRECTOR_MUTATION_SURFACES.DIRECTOR,
  "api/director": DIRECTOR_MUTATION_SURFACES.DIRECTOR,
  "live-matches": DIRECTOR_MUTATION_SURFACES.LIVE_MATCHES,
  live_matches: DIRECTOR_MUTATION_SURFACES.LIVE_MATCHES,
  "/api/live-matches": DIRECTOR_MUTATION_SURFACES.LIVE_MATCHES,
  "api/live-matches": DIRECTOR_MUTATION_SURFACES.LIVE_MATCHES,
  "admin-cms": DIRECTOR_MUTATION_SURFACES.ADMIN_CMS,
  admin_cms: DIRECTOR_MUTATION_SURFACES.ADMIN_CMS,
  "/api/admin/cms": DIRECTOR_MUTATION_SURFACES.ADMIN_CMS,
  "api/admin/cms": DIRECTOR_MUTATION_SURFACES.ADMIN_CMS,
});

function normalizedSurface(value) {
  return surfaceAliases[clean(value)] || clean(value);
}

export function directorMutationPolicy(surfaceValue, actionValue) {
  const surface = normalizedSurface(surfaceValue);
  const action = clean(actionValue);
  return DIRECTOR_MUTATION_POLICY[surface]?.[action] || null;
}

function authorityState({ authority, env }) {
  if (authority) {
    const resolved = clean(authority);
    return {
      configuredValue: resolved,
      requested: resolved,
      resolved,
      reason: "explicit-authority",
      blocked: !["google", "supabase"].includes(resolved),
      failureCode: !["google", "supabase"].includes(resolved)
        ? DIRECTOR_MUTATION_ERROR_CODES.AUTHORITY_UNAVAILABLE
        : "",
    };
  }
  return scoringAuthorityEnvironment(env || process.env);
}

export function directorMutationAuthorityDiagnostics({
  surface: surfaceValue,
  action: actionValue,
  authority = "",
  env = process.env,
} = {}) {
  const surface = normalizedSurface(surfaceValue);
  const action = clean(actionValue);
  const policy = directorMutationPolicy(surface, action);
  const state = authorityState({ authority, env });
  const googleAuthority = state.resolved === "google";
  const supabaseAuthority = state.resolved === "supabase";
  const productionSupabaseAllowed = Boolean(policy?.productionSupabaseAction) &&
    productionCutoverPhaseAtLeast(env, "SCORING_COMMIT");
  const productionGoogleAuthoringRetired = Boolean(policy?.productionGoogleAuthoringRetired) &&
    clean(env?.VERCEL_ENV) === "production";
  const allowed = !productionGoogleAuthoringRetired && Boolean(policy) && (googleAuthority || (supabaseAuthority &&
    (policy.supabaseAllowed === true || productionSupabaseAllowed)));
  const code = allowed ? ""
    : !policy ? DIRECTOR_MUTATION_ERROR_CODES.UNKNOWN_OPERATION
    : productionGoogleAuthoringRetired
      ? policy.productionGoogleAuthoringRetiredCode ||
        DIRECTOR_MUTATION_ERROR_CODES.PRODUCTION_GOOGLE_AUTHORING_RETIRED
    : supabaseAuthority ? DIRECTOR_MUTATION_ERROR_CODES.NOT_SUPPORTED_UNDER_SUPABASE
    : DIRECTOR_MUTATION_ERROR_CODES.AUTHORITY_UNAVAILABLE;

  return {
    surface,
    action,
    knownSurface: Boolean(DIRECTOR_MUTATION_POLICY[surface]),
    knownAction: Boolean(policy),
    domain: policy?.domain || "UNKNOWN",
    execution: policy?.execution || "UNKNOWN",
    canonicalLifecycleAction: policy?.canonicalLifecycleAction ||
      (productionSupabaseAllowed ? policy?.productionSupabaseAction : ""),
    googleWriters: policy?.googleWriters || Object.freeze([]),
    configuredAuthority: state.configuredValue || "",
    requestedAuthority: state.requested || "",
    resolvedAuthority: state.resolved || "unavailable",
    authorityReason: state.reason || "",
    allowed,
    fallbackAllowed: false,
    productionGoogleAuthoringRetired,
    productionGoogleAuthoringRetiredMessage: productionGoogleAuthoringRetired
      ? policy?.productionGoogleAuthoringRetiredMessage || ""
      : "",
    code,
  };
}

export class DirectorMutationAuthorityError extends Error {
  constructor(diagnostics) {
    const unavailable = diagnostics.code === DIRECTOR_MUTATION_ERROR_CODES.AUTHORITY_UNAVAILABLE;
    const unknown = diagnostics.code === DIRECTOR_MUTATION_ERROR_CODES.UNKNOWN_OPERATION;
    const retired = diagnostics.productionGoogleAuthoringRetired === true;
    super(retired
      ? diagnostics.productionGoogleAuthoringRetiredMessage ||
        "Production Google authoring is managed in the Director Console."
      : unknown
      ? "This Director mutation is not recognized."
      : unavailable
      ? "Director mutation authority is unavailable in this runtime."
      : "This Director operation is not supported while Supabase is the scoring authority.");
    this.name = "DirectorMutationAuthorityError";
    this.code = diagnostics.code;
    this.status = unavailable ? 503 : unknown ? 400 : retired ? 410 : 409;
    this.authorityDiagnostics = diagnostics;
  }
}

export function assertDirectorMutationAuthority(input = {}) {
  const diagnostics = directorMutationAuthorityDiagnostics(input);
  if (!diagnostics.allowed) throw new DirectorMutationAuthorityError(diagnostics);
  return diagnostics;
}

export const requireDirectorMutationAuthority = assertDirectorMutationAuthority;

export function directorMutationPolicyMatrix() {
  return Object.fromEntries(Object.entries(DIRECTOR_MUTATION_POLICY).map(([surface, actions]) => [
    surface,
    Object.fromEntries(Object.entries(actions).map(([action, policy]) => [action, {
      domain: policy.domain,
      execution: policy.execution,
      googleWriters: [...policy.googleWriters],
      supabaseAllowed: policy.supabaseAllowed,
      canonicalLifecycleAction: policy.canonicalLifecycleAction,
      description: policy.description,
      productionGoogleAuthoringRetired: Boolean(policy.productionGoogleAuthoringRetired),
      productionGoogleAuthoringRetiredCode: policy.productionGoogleAuthoringRetiredCode || "",
    }])),
  ]));
}

export function directorMutationMatrixDiagnostics({ authority = "", env = process.env } = {}) {
  return Object.fromEntries(Object.entries(DIRECTOR_MUTATION_POLICY).map(([surface, actions]) => [
    surface,
    Object.fromEntries(Object.keys(actions).map((action) => [
      action,
      directorMutationAuthorityDiagnostics({ surface, action, authority, env }),
    ])),
  ]));
}
