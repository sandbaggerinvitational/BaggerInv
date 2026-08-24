import { PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF } from "./completed-history-read-source.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";

const clean = (value) => String(value ?? "").trim();

function normalizedSource(value) {
  const source = clean(value || "google").toLowerCase();
  return ["google", "supabase"].includes(source) ? source : "invalid";
}

function approvedProject(env) {
  const value = clean(env.SUPABASE_SCORING_MIRROR_URL);
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === `${PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF}.supabase.co` &&
      !url.username && !url.password && !url.port &&
      (url.pathname === "" || url.pathname === "/") &&
      !url.search && !url.hash;
  } catch {
    return false;
  }
}

/**
 * Independent, reversible delivery gate for public historical course facts.
 * Production always resolves to the approved Google behavior. An explicitly
 * selected but incomplete Preview Supabase path fails closed.
 */
export function historicalCourseReadEnvironment(env = process.env) {
  const requested = normalizedSource(env.HISTORICAL_COURSE_READ_SOURCE);
  const preview = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const candidate = productionShadowCandidateReadEnvironment(env);
  const projectApproved = candidate.eligible || approvedProject(env);
  const credentialsConfigured = Boolean(
    clean(env.SUPABASE_SCORING_MIRROR_URL) &&
    clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY)
  );
  const eligible = candidate.eligible || (preview && projectApproved && credentialsConfigured);
  const productionBlocked = requested === "supabase" && !preview;
  const blocked = requested === "invalid" || (
    requested === "supabase" && preview && !eligible
  );
  const resolved = requested === "supabase" && eligible ? "supabase" : "google";
  const reason = resolved === "supabase" ? (candidate.eligible ? "production-shadow-supabase-historical-course" : "preview-supabase-historical-course")
    : requested === "invalid" ? "invalid-source"
    : requested !== "supabase" ? "google-configured"
    : productionBlocked ? "production-hard-block"
    : !projectApproved ? "preview-project-required"
    : !credentialsConfigured ? "credentials-missing"
    : "google-configured";

  return {
    requested,
    resolved,
    preview,
    blocked,
    productionBlocked,
    projectApproved,
    credentialsConfigured,
    projectRef: candidate.eligible ? candidate.projectRef : projectApproved ? PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF : "",
    productionShadowCandidate: candidate.eligible,
    reason,
  };
}

export function requireHistoricalCourseReadSource(env = process.env) {
  const state = historicalCourseReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Historical course reads are unavailable (${state.reason}).`);
    error.code = "HISTORICAL_COURSE_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}
