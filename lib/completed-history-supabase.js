import "server-only";

import {
  COMPLETED_HISTORY_FIRST_YEAR,
  COMPLETED_HISTORY_LAST_YEAR,
  buildCompletedHistoryYearContract,
  completedHistoryImportEnvelope,
  completedHistoryYearCertificationSummary,
  isCompletedHistoryYear,
} from "./completed-history-contract.js";
import { scoringShadowRpc } from "./scoring-shadow.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadTransportEnvironment } from "./production-cutover-read-transport.js";

const PREVIEW_PROJECT_REF = "idgigvjjqkfbqjeredpb";
const COMPLETED_HISTORY_READ_RPC = "read_preview_completed_history";
const clean = (value) => String(value ?? "").trim();

async function loadCanonicalFoundationSource() {
  const module = await import("./google-sheets-data.js");
  return module.loadCanonicalCompletedHistoryFoundationData();
}

export function completedHistoryEnvironment(env = process.env) {
  const candidate = productionShadowCandidateReadEnvironment(env);
  const deployment = clean(env.VERCEL_ENV).toLowerCase();
  const projectUrl = clean(env.SUPABASE_SCORING_MIRROR_URL);
  const projectRefMatches = projectUrl.includes(PREVIEW_PROJECT_REF);
  const credentialsConfigured = Boolean(projectUrl && clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const preview = deployment === "preview";
  return {
    allowed: candidate.eligible || (preview && projectRefMatches && credentialsConfigured),
    preview,
    projectRef: candidate.eligible ? candidate.projectRef : projectRefMatches ? PREVIEW_PROJECT_REF : "",
    projectRefMatches,
    credentialsConfigured,
    productionShadowCandidate: candidate.eligible,
    reason: candidate.eligible ? "PRODUCTION_SHADOW_CANDIDATE_READ_READY"
      : !preview ? "PREVIEW_ENVIRONMENT_REQUIRED"
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
  const sheets = source || await loadCanonicalFoundationSource();
  return buildCompletedHistoryYearContract({ source: sheets, year, requestedBy });
}

export async function prepareCompletedHistoryYears({ requestedBy, source, env = process.env } = {}) {
  assertCompletedHistoryEnvironment(env);
  const sheets = source || await loadCanonicalFoundationSource();
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

function completedHistoryReadInput(options = {}) {
  const inferredMode = options.year ? "YEAR"
    : options.playerId ? "PLAYER"
    : options.courseId ? "COURSE"
    : options.matchId ? "MATCH"
    : "YEARS";
  return {
    mode: clean(options.mode || options.scope || inferredMode).toUpperCase(),
    ...(options.year ? { tournament_year: Number(options.year) } : {}),
    ...(options.playerId ? { player_id: clean(options.playerId) } : {}),
    ...(options.courseId ? { course_id: clean(options.courseId) } : {}),
    ...(options.matchId ? { match_id: clean(options.matchId) } : {}),
  };
}

export async function readCompletedHistory(options = {}) {
  const env = options.env || process.env;
  assertCompletedHistoryEnvironment(env);
  const input = {
    environment: "PREVIEW",
    project_ref: PREVIEW_PROJECT_REF,
    source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    ...completedHistoryReadInput(options),
  };
  return scoringShadowRpc(COMPLETED_HISTORY_READ_RPC, { input }, {
    env,
    timeoutMs: options.timeoutMs || 20_000,
  });
}

/**
 * Read completed History through the active Production cutover transport.
 * The logical RPC name is translated by scoringShadowRpc, while the explicit
 * preflight prevents this entry point from ever reaching Preview resources.
 */
export async function readProductionCutoverCompletedHistory(options = {}) {
  const env = options.env || process.env;
  const body = { input: completedHistoryReadInput(options) };
  const transport = productionCutoverReadTransportEnvironment(
    env,
    COMPLETED_HISTORY_READ_RPC,
    body,
  );
  if (!transport.allowed) {
    const error = new Error(`Production completed History read transport is unavailable (${transport.reason}).`);
    error.code = "PRODUCTION_CUTOVER_READ_RPC_UNAVAILABLE";
    error.status = 503;
    error.diagnostics = transport;
    throw error;
  }
  return scoringShadowRpc(COMPLETED_HISTORY_READ_RPC, body, {
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
