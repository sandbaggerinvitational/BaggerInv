import "server-only";

import {
  COMPLETED_HISTORY_FIRST_YEAR,
  COMPLETED_HISTORY_LAST_YEAR,
  buildCompletedHistoryYearContract,
  completedHistoryImportEnvelope,
  completedHistoryYearCertificationSummary,
  isCompletedHistoryYear,
} from "./completed-history-contract.js";
import { loadCanonicalCompletedHistoryFoundationData } from "./google-sheets-data.js";
import { scoringShadowRpc } from "./scoring-shadow.js";

const PREVIEW_PROJECT_REF = "idgigvjjqkfbqjeredpb";
const clean = (value) => String(value ?? "").trim();

export function completedHistoryEnvironment(env = process.env) {
  const deployment = clean(env.VERCEL_ENV).toLowerCase();
  const projectUrl = clean(env.SUPABASE_SCORING_MIRROR_URL);
  const projectRefMatches = projectUrl.includes(PREVIEW_PROJECT_REF);
  const credentialsConfigured = Boolean(projectUrl && clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const preview = deployment === "preview";
  return {
    allowed: preview && projectRefMatches && credentialsConfigured,
    preview,
    projectRef: projectRefMatches ? PREVIEW_PROJECT_REF : "",
    projectRefMatches,
    credentialsConfigured,
    reason: !preview ? "PREVIEW_ENVIRONMENT_REQUIRED"
      : !projectRefMatches ? "PREVIEW_SUPABASE_PROJECT_REQUIRED"
      : !credentialsConfigured ? "SUPABASE_SERVICE_CREDENTIALS_REQUIRED"
      : "READY",
  };
}

export function assertCompletedHistoryEnvironment(env = process.env) {
  const state = completedHistoryEnvironment(env);
  if (!state.allowed) {
    const error = new Error(`Completed History import is unavailable (${state.reason}).`);
    error.code = state.reason;
    throw error;
  }
  return state;
}

export async function prepareCompletedHistoryYear({ year, requestedBy, source, env = process.env } = {}) {
  assertCompletedHistoryEnvironment(env);
  if (!isCompletedHistoryYear(year)) {
    const error = new Error("A completed History year from 2017 through 2025 is required.");
    error.code = "COMPLETED_HISTORY_YEAR_REQUIRED";
    throw error;
  }
  const sheets = source || await loadCanonicalCompletedHistoryFoundationData();
  return buildCompletedHistoryYearContract({ source: sheets, year, requestedBy });
}

export async function prepareCompletedHistoryYears({ requestedBy, source, env = process.env } = {}) {
  assertCompletedHistoryEnvironment(env);
  const sheets = source || await loadCanonicalCompletedHistoryFoundationData();
  return Array.from(
    { length: COMPLETED_HISTORY_LAST_YEAR - COMPLETED_HISTORY_FIRST_YEAR + 1 },
    (_, index) => buildCompletedHistoryYearContract({
      source: sheets,
      year: COMPLETED_HISTORY_FIRST_YEAR + index,
      requestedBy,
    })
  );
}

export async function importCompletedHistoryYear({ year, requestedBy, source, authorization, correction = null, env = process.env } = {}) {
  const canonical = await prepareCompletedHistoryYear({ year, requestedBy, source, env });
  const input = completedHistoryImportEnvelope(canonical, { authorization, correction });
  const rpc = await scoringShadowRpc("import_preview_completed_history_year", { input }, {
    env,
    timeoutMs: 45_000,
  });
  return { canonical, input, summary: completedHistoryYearCertificationSummary(canonical), rpc };
}

export async function readCompletedHistory(options = {}) {
  const env = options.env || process.env;
  assertCompletedHistoryEnvironment(env);
  const inferredMode = options.year ? "YEAR"
    : options.playerId ? "PLAYER"
    : options.courseId ? "COURSE"
    : options.matchId ? "MATCH"
    : "YEARS";
  const input = {
    environment: "PREVIEW",
    project_ref: PREVIEW_PROJECT_REF,
    source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    mode: clean(options.mode || options.scope || inferredMode).toUpperCase(),
    ...(options.year ? { tournament_year: Number(options.year) } : {}),
    ...(options.playerId ? { player_id: clean(options.playerId) } : {}),
    ...(options.courseId ? { course_id: clean(options.courseId) } : {}),
    ...(options.matchId ? { match_id: clean(options.matchId) } : {}),
  };
  return scoringShadowRpc("read_preview_completed_history", { input }, {
    env,
    timeoutMs: options.timeoutMs || 20_000,
  });
}

export async function inspectCompletedHistory(options = {}) {
  const env = options.env || process.env;
  assertCompletedHistoryEnvironment(env);
  return scoringShadowRpc("inspect_preview_completed_history", {
    input: {
      environment: "PREVIEW",
      project_ref: PREVIEW_PROJECT_REF,
      source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
      ...(options.year ? { tournament_year: Number(options.year) } : {}),
    },
  }, { env, timeoutMs: options.timeoutMs || 15_000 });
}

export async function inspectCompletedHistorySecurity(options = {}) {
  const env = options.env || process.env;
  assertCompletedHistoryEnvironment(env);
  return scoringShadowRpc("inspect_preview_completed_history_security", {}, {
    env,
    timeoutMs: options.timeoutMs || 10_000,
  });
}
