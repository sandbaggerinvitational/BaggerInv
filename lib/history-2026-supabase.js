import "server-only";

import { scoringShadowRpc } from "./scoring-shadow.js";
import {
  PREVIEW_HISTORY_2026_TOURNAMENT_ID,
  PREVIEW_HISTORY_2026_TOURNAMENT_YEAR,
  requireHistory2026ReadSource,
} from "./history-2026-read-source.js";

const clean = (value) => String(value ?? "").trim();

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
  return scoringShadowRpc("read_preview_2026_historical_view", {
    target_tournament_id: context.tournamentId,
    target_source_workbook_id: context.sourceWorkbookId,
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
