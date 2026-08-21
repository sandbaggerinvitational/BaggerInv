import "server-only";

import { isCompletedHistoryYear } from "./completed-history-contract.js";
import { readCompletedHistory } from "./completed-history-supabase.js";
import {
  buildCompletedHistoryPresentation,
  completedHistoryRoundPageModel,
  completedHistoryTeamPageModel,
  completedHistoryTournamentPageModel,
  completedHistoryResolvePlayer,
} from "./completed-history-presentation-adapter.js";
import {
  isSupabaseCompletedHistoryYear,
  requireCompletedHistoryReadSource,
} from "./completed-history-read-source.js";

const clean = (value) => String(value ?? "").trim();
const currentViewCache = new Map();
const pendingViews = new Map();

function rpcPayload(read, label) {
  const payload = read?.payload || read || {};
  if (payload?.ok !== true || !payload?.data) {
    const error = new Error(`${label} is temporarily unavailable.`);
    error.code = clean(payload?.code || "COMPLETED_HISTORY_READ_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  return payload.data;
}

function cacheKey(data = {}) {
  return `${Number(data?.tournament?.tournament_year)}:${clean(data?.revision?.revision_id)}`;
}

function remember(key, view) {
  currentViewCache.set(key, view);
  for (const existing of currentViewCache.keys()) {
    if (existing.startsWith(`${Number(view.year)}:`) && existing !== key) currentViewCache.delete(existing);
  }
}

/** Strict, bounded YEAR read. No Google or bundled fallback is permitted. */
export async function loadCompletedHistoryView(options = {}) {
  const startedAt = performance.now();
  const env = options.env || process.env;
  const year = Number(options.year);
  if (!isCompletedHistoryYear(year)) {
    const error = new Error("A completed History year from 2017 through 2025 is required.");
    error.code = "COMPLETED_HISTORY_YEAR_REQUIRED";
    error.status = 404;
    throw error;
  }
  const source = requireCompletedHistoryReadSource(env);
  if (source.resolved !== "supabase") {
    const error = new Error("Supabase completed History delivery is not selected in this runtime.");
    error.code = "COMPLETED_HISTORY_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }
  const reader = options.dependencies?.readCompletedHistory || readCompletedHistory;
  const adapter = options.dependencies?.buildCompletedHistoryPresentation || buildCompletedHistoryPresentation;
  const read = await reader({ env, year, mode: "YEAR", timeoutMs: options.timeoutMs || 20_000 });
  const data = rpcPayload(read, `${year} completed History`);
  const key = cacheKey(data);
  let adapterMs = 0;
  let adapterCacheHit = currentViewCache.has(key);
  let view = currentViewCache.get(key);
  if (!view) {
    if (!pendingViews.has(key)) {
      const adapterStartedAt = performance.now();
      pendingViews.set(key, Promise.resolve().then(() => {
        const adapted = adapter(data);
        adapterMs = Math.max(0, performance.now() - adapterStartedAt);
        remember(key, adapted);
        return adapted;
      }));
    } else {
      adapterCacheHit = true;
    }
    try { view = await pendingViews.get(key); }
    finally { pendingViews.delete(key); }
  }
  if (view?.source !== "supabase" || Number(view?.year) !== year || !view?.tournament) {
    const error = new Error(`${year} completed History presentation is incomplete.`);
    error.code = "COMPLETED_HISTORY_PUBLIC_VIEW_INCOMPLETE";
    error.status = 503;
    throw error;
  }
  return {
    ...view,
    diagnostics: {
      ...(view.diagnostics || {}),
      supabaseRequestMs: Number(read?.durationMs) || 0,
      adapterMs,
      adapterCacheHit,
      totalServiceMs: Math.max(0, performance.now() - startedAt),
      googleForegroundRequests: 0,
    },
  };
}

export async function loadCompletedHistoryYears(options = {}) {
  const env = options.env || process.env;
  const source = requireCompletedHistoryReadSource(env);
  if (source.resolved !== "supabase") {
    const error = new Error("Supabase completed History delivery is not selected in this runtime.");
    error.code = "COMPLETED_HISTORY_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }
  const reader = options.dependencies?.readCompletedHistory || readCompletedHistory;
  const yearsRead = await reader({ env, mode: "YEARS", timeoutMs: options.timeoutMs || 20_000 });
  const revisions = rpcPayload(yearsRead, "Completed History index");
  const years = Array.isArray(revisions)
    ? revisions.map((row) => Number(row.tournament_year)).sort((left, right) => left - right)
    : [];
  const expected = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  if (years.length !== expected.length || years.some((year, index) => year !== expected[index])) {
    const error = new Error("The certified completed History year sequence is incomplete.");
    error.code = "COMPLETED_HISTORY_CERTIFIED_SEQUENCE_REQUIRED";
    error.status = 503;
    throw error;
  }
  const views = await Promise.all(expected.map((year) => loadCompletedHistoryView({
    ...options,
    env,
    year,
    dependencies: { ...(options.dependencies || {}), readCompletedHistory: reader },
  })));
  return {
    source: "supabase",
    tournaments: views.map((view) => view.tournament).sort((left, right) => Number(right.year) - Number(left.year)),
    views,
    revisions,
    diagnostics: {
      yearsRequestMs: Number(yearsRead?.durationMs) || 0,
      yearRequestMs: views.reduce((sum, view) => sum + Number(view.diagnostics?.supabaseRequestMs || 0), 0),
      googleForegroundRequests: 0,
    },
  };
}

export {
  completedHistoryRoundPageModel,
  completedHistoryTeamPageModel,
  completedHistoryTournamentPageModel,
  completedHistoryResolvePlayer,
  isSupabaseCompletedHistoryYear,
};
