import "server-only";

import { scoringShadowRpc } from "./scoring-shadow.js";
import { certificationRequested } from "./canonical-resource-registration.js";
import { assertCertificationRuntimeContext, resolveCertificationRuntimeContext } from "./certification-runtime-server.js";
import {
  PREVIEW_HISTORY_2026_TOURNAMENT_ID,
  PREVIEW_HISTORY_2026_TOURNAMENT_YEAR,
  requireHistory2026ReadSource,
} from "./history-2026-read-source.js";

const clean = (value) => String(value ?? "").trim();

/** Resolve selection before reading. An old-year current-read denial is never
 * converted into permission to retry a different authority. */
export async function readHistory2026CertificationBundle(options = {}) {
  const env = options.env || process.env;
  if (!certificationRequested(env)) return null;
  history2026RpcContext(env);
  const dependencies = { ...options.certificationDependencies,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) };
  const context = options.certificationContext
    ? assertCertificationRuntimeContext(options.certificationContext, { env, phase: "READS" }, dependencies)
    : await resolveCertificationRuntimeContext({ env, phase: "READS" }, dependencies);
  if (context.current_tournament_id === PREVIEW_HISTORY_2026_TOURNAMENT_ID) return { context, bundle: null };
  const bundle = await scoringShadowRpc("read_canonical_closed_history_2026_bundle", {
    target_tournament_id: PREVIEW_HISTORY_2026_TOURNAMENT_ID,
    include_tournament_player_metadata: options.includeTournamentPlayerMetadata === true,
  }, { ...options, env, certificationContext: context });
  return { context, bundle };
}

export function history2026RpcContext(env = process.env) {
  const source = requireHistory2026ReadSource(env);
  if (source.resolved !== "supabase") {
    const error = new Error("Supabase 2026 History delivery is not selected in this runtime.");
    error.code = "HISTORY_2026_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }
  return {
    tournamentId: PREVIEW_HISTORY_2026_TOURNAMENT_ID,
    tournamentYear: PREVIEW_HISTORY_2026_TOURNAMENT_YEAR,
    sourceWorkbookId: source.workbookId,
    productionCutover: Boolean(source.productionCutover?.handled),
    productionShadowCandidate: source.productionShadowCandidate === true,
  };
}

/**
 * Service-role-only read of the bounded public-safe input bundle. The RPC is
 * not executable by public/anon/authenticated roles; participant/public routes
 * receive only the sanitized adapter DTO assembled by history-2026-service.
 */
export async function readHistory2026SupabaseView(options = {}) {
  const env = options.env || process.env;
  const context = history2026RpcContext(env);
  const requestedTournament = clean(options.tournamentId || context.tournamentId);
  if (
    requestedTournament !== PREVIEW_HISTORY_2026_TOURNAMENT_ID ||
    Number(options.year ?? context.tournamentYear) !== PREVIEW_HISTORY_2026_TOURNAMENT_YEAR
  ) {
    const error = new Error("The Supabase historical adapter is scoped only to tournament 2026.");
    error.code = "HISTORY_2026_EXPLICIT_TOURNAMENT_REQUIRED";
    error.status = 404;
    throw error;
  }
  // Preserve the admitted diagnostic context without pretending it is a cutover.
  // Both certified read lanes use the existing alias; ordinary isolated reads
  // continue resolving retained import provenance inside PostgreSQL.
  const certifiedReadTransport = context.productionCutover || context.productionShadowCandidate;
  return scoringShadowRpc(certifiedReadTransport
    ? "read_preview_2026_historical_view"
    : "read_canonical_2026_historical_view", {
    target_tournament_id: context.tournamentId,
    ...(certifiedReadTransport ? { target_source_workbook_id: context.sourceWorkbookId } : {}),
  }, {
    ...options,
    env,
    timeoutMs: options.timeoutMs || 12_000,
  });
}

export async function inspectHistory2026SupabaseSecurity(options = {}) {
  const env = options.env || process.env;
  history2026RpcContext(env);
  return scoringShadowRpc("inspect_preview_2026_historical_security", {}, {
    ...options,
    env,
    timeoutMs: options.timeoutMs || 8_000,
  });
}
