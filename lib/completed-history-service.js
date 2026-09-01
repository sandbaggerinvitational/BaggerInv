import "server-only";

import { cache } from "react";

import { isCompletedHistoryYear } from "./completed-history-contract.js";
import {
  readCompletedHistory,
  readProductionCutoverCompletedHistory,
} from "./completed-history-supabase.js";
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
const PREVIEW_COMPLETED_HISTORY_WORKBOOK_ID =
  "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
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

function completedHistoryResourceScope(source = {}) {
  const resources = source.productionCutover?.activation?.resources || {};
  const environment = source.productionCutover?.handled
    ? "PRODUCTION"
    : source.preview
      ? "PREVIEW"
      : "";
  const projectRef = clean(resources.projectRef || source.projectRef);
  const workbookId = clean(
    resources.workbookId || (source.preview ? PREVIEW_COMPLETED_HISTORY_WORKBOOK_ID : ""),
  );
  const tournamentId = clean(
    resources.tournamentId || (source.preview ? "COMPLETED_HISTORY_2017_2025" : ""),
  );
  const tournamentYear = resources.tournamentYear === null || resources.tournamentYear === undefined
    ? "MULTI_YEAR"
    : String(resources.tournamentYear);
  if (!environment || !projectRef || !workbookId || !tournamentId) return "";
  return [environment, projectRef, workbookId, tournamentId, tournamentYear].join("|");
}

function revisionCacheKey(revision = {}, resourceScope = "") {
  const year = Number(revision?.tournament_year);
  const revisionId = clean(revision?.revision_id);
  const payloadFingerprint = clean(revision?.payload_fingerprint);
  if (!clean(resourceScope) || !Number.isFinite(year) || !revisionId || !payloadFingerprint) return "";
  return `${resourceScope}|${year}:${revisionId}:${payloadFingerprint}`;
}

function cacheKey(data = {}, resourceScope = "") {
  return revisionCacheKey(data?.revision, resourceScope);
}

function remember(cache, key, view, resourceScope) {
  if (!key) return;
  cache.set(key, view);
  const prefix = `${resourceScope}|${Number(view.year)}:`;
  for (const existing of cache.keys()) {
    if (existing.startsWith(prefix) && existing !== key) cache.delete(existing);
  }
}

function revisionMatches(actual = {}, expected = {}) {
  return Number(actual?.tournament_year) === Number(expected?.tournament_year) &&
    clean(actual?.revision_id) === clean(expected?.revision_id) &&
    clean(actual?.payload_fingerprint) === clean(expected?.payload_fingerprint);
}

export function completedHistoryRevisionCacheKey(revision = {}, source = {}) {
  return revisionCacheKey(revision, completedHistoryResourceScope(source));
}

function completedHistoryReader(source, dependencies = {}) {
  if (source.productionCutover?.handled) {
    return dependencies.readProductionCutoverCompletedHistory ||
      readProductionCutoverCompletedHistory;
  }
  return dependencies.readCompletedHistory || readCompletedHistory;
}

/** Strict, bounded YEAR read. No Google or bundled fallback is permitted. */
async function loadCompletedHistoryViewUncached(options = {}) {
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
  const reader = completedHistoryReader(source, options.dependencies);
  const resourceScope = completedHistoryResourceScope(source);
  const adapter = options.dependencies?.buildCompletedHistoryPresentation || buildCompletedHistoryPresentation;
  const viewCache = options.dependencies
    ? options.dependencies.completedHistoryViewCache || new Map()
    : currentViewCache;
  const viewPromises = options.dependencies
    ? options.dependencies.completedHistoryPendingViews || new Map()
    : pendingViews;
  const read = await reader({ env, year, mode: "YEAR", timeoutMs: options.timeoutMs || 20_000 });
  const data = rpcPayload(read, `${year} completed History`);
  if (options.expectedRevision && !revisionMatches(data?.revision, options.expectedRevision)) {
    const error = new Error(`${year} completed History changed while the certified index was being read.`);
    error.code = "COMPLETED_HISTORY_REVISION_CHANGED";
    error.status = 503;
    throw error;
  }
  const key = cacheKey(data, resourceScope);
  let adapterMs = 0;
  let adapterCacheHit = Boolean(key) && viewCache.has(key);
  let view = key ? viewCache.get(key) : null;
  if (!view) {
    if (!key || !viewPromises.has(key)) {
      const adapterStartedAt = performance.now();
      const pending = Promise.resolve().then(() => {
        const adapted = adapter(data);
        adapterMs = Math.max(0, performance.now() - adapterStartedAt);
        remember(viewCache, key, adapted, resourceScope);
        return adapted;
      });
      if (key) viewPromises.set(key, pending);
      else view = await pending;
    } else {
      adapterCacheHit = true;
    }
    if (key) {
      try { view = await viewPromises.get(key); }
      finally { viewPromises.delete(key); }
    }
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

const loadCachedCompletedHistoryView = cache((
  env,
  year,
  timeoutMs,
  expectedRevisionId,
  expectedPayloadFingerprint,
) =>
  loadCompletedHistoryViewUncached({
    env,
    year,
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(expectedRevisionId ? {
      expectedRevision: {
        tournament_year: year,
        revision_id: expectedRevisionId,
        payload_fingerprint: expectedPayloadFingerprint,
      },
    } : {}),
  })
);

export async function loadCompletedHistoryView(options = {}) {
  if (options.dependencies) return loadCompletedHistoryViewUncached(options);
  return loadCachedCompletedHistoryView(
    options.env || process.env,
    Number(options.year),
    options.timeoutMs || 0,
    clean(options.expectedRevision?.revision_id),
    clean(options.expectedRevision?.payload_fingerprint),
  );
}

async function loadCompletedHistoryYearsUncached(options = {}) {
  const env = options.env || process.env;
  const source = requireCompletedHistoryReadSource(env);
  if (source.resolved !== "supabase") {
    const error = new Error("Supabase completed History delivery is not selected in this runtime.");
    error.code = "COMPLETED_HISTORY_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }
  const reader = completedHistoryReader(source, options.dependencies);
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
  const revisionByYear = new Map(revisions.map((row) => [Number(row.tournament_year), row]));
  const resourceScope = completedHistoryResourceScope(source);
  const viewCache = options.dependencies
    ? options.dependencies.completedHistoryViewCache || new Map()
    : currentViewCache;
  let revisionCacheHits = 0;
  const views = await Promise.all(expected.map((year) => {
    const expectedRevision = revisionByYear.get(year);
    const key = revisionCacheKey(expectedRevision, resourceScope);
    const cached = key ? viewCache.get(key) : null;
    if (cached) {
      revisionCacheHits += 1;
      return {
        ...cached,
        diagnostics: {
          ...(cached.diagnostics || {}),
          supabaseRequestMs: 0,
          adapterMs: 0,
          adapterCacheHit: true,
          revisionCacheHit: true,
          totalServiceMs: 0,
          googleForegroundRequests: 0,
        },
      };
    }
    return loadCompletedHistoryView({
      ...options,
      env,
      year,
      expectedRevision,
      ...(options.dependencies ? {
        dependencies: {
          ...options.dependencies,
          completedHistoryViewCache: viewCache,
          ...(source.productionCutover?.handled
            ? { readProductionCutoverCompletedHistory: reader }
            : { readCompletedHistory: reader }),
        },
      } : {}),
    });
  }));
  return {
    source: "supabase",
    tournaments: views.map((view) => view.tournament).sort((left, right) => Number(right.year) - Number(left.year)),
    views,
    revisions,
    diagnostics: {
      yearsRequestMs: Number(yearsRead?.durationMs) || 0,
      yearRequestMs: views.reduce((sum, view) => sum + Number(view.diagnostics?.supabaseRequestMs || 0), 0),
      revisionCacheHits,
      googleForegroundRequests: 0,
    },
  };
}

const loadCachedCompletedHistoryYears = cache((env, timeoutMs) =>
  loadCompletedHistoryYearsUncached({
    env,
    ...(timeoutMs ? { timeoutMs } : {}),
  })
);

export async function loadCompletedHistoryYears(options = {}) {
  if (options.dependencies) return loadCompletedHistoryYearsUncached(options);
  return loadCachedCompletedHistoryYears(
    options.env || process.env,
    options.timeoutMs || 0,
  );
}

export {
  completedHistoryRoundPageModel,
  completedHistoryTeamPageModel,
  completedHistoryTournamentPageModel,
  completedHistoryResolvePlayer,
  isSupabaseCompletedHistoryYear,
};
