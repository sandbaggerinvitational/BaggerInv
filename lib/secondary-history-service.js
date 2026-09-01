import "server-only";

import { cache } from "react";

import { loadCompletedHistoryYears } from "./completed-history-service.js";
import { loadHistory2026View } from "./history-2026-service.js";
import { readPreviewSecondaryHistoryPlayers } from "./player-public-profile-projection.js";
import { buildSecondaryHistoryModel } from "./secondary-history-model.js";
import { requireSecondaryHistoryReadSource } from "./secondary-history-read-source.js";
import { createHistoricalStatsModel } from "./stats.js";

const clean = (value) => String(value ?? "").trim();

function rpcData(read, label) {
  const payload = read?.payload || read || {};
  if (payload?.ok !== true || !payload?.data) {
    const error = new Error(`${label} is temporarily unavailable.`);
    error.code = clean(payload?.code || "SECONDARY_HISTORY_READ_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  return payload.data;
}

async function loadUncached(options = {}) {
  const startedAt = performance.now();
  const env = options.env || process.env;
  const source = requireSecondaryHistoryReadSource(env);
  if (source.resolved !== "supabase") {
    const error = new Error("Supabase secondary History delivery is not selected in this runtime.");
    error.code = "SECONDARY_HISTORY_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }
  const dependencies = options.dependencies || {};
  const completedLoader = dependencies.loadCompletedHistoryYears || loadCompletedHistoryYears;
  const currentLoader = dependencies.loadHistory2026View || loadHistory2026View;
  const playerReader = dependencies.readPreviewSecondaryHistoryPlayers || readPreviewSecondaryHistoryPlayers;
  const builder = dependencies.buildSecondaryHistoryModel || buildSecondaryHistoryModel;
  const [completed, currentView, playerRead] = await Promise.all([
    completedLoader({ env, timeoutMs: options.timeoutMs || 20_000 }),
    currentLoader({ env, includeTournamentPlayerMetadata: true, timeoutMs: options.timeoutMs || 20_000 }),
    playerReader({ env, timeoutMs: options.timeoutMs || 10_000 }),
  ]);
  const playerProjection = rpcData(playerRead, "Player public-profile projection");
  const model = builder({
    completedViews: completed.views,
    currentView,
    playerProjection,
  }, { createCalculations: dependencies.createHistoricalStatsModel || createHistoricalStatsModel });
  if (model?.source !== "supabase" || !model?.calculations || model?.diagnostics?.playerCount < 1) {
    const error = new Error("The shared secondary History presentation contract is incomplete.");
    error.code = "SECONDARY_HISTORY_PRESENTATION_INCOMPLETE";
    error.status = 503;
    throw error;
  }
  return Object.freeze({
    ...model,
    diagnostics: {
      ...model.diagnostics,
      completedHistoryMs: Number(completed.diagnostics?.yearsRequestMs || 0) + Number(completed.diagnostics?.yearRequestMs || 0),
      currentHistoryMs: Number(currentView.diagnostics?.totalServiceMs || 0),
      playerProjectionMs: Number(playerRead?.durationMs || 0),
      totalServiceMs: Math.max(0, performance.now() - startedAt),
      googleForegroundRequests: 0,
      noFallback: true,
    },
  });
}

const loadCachedSecondaryHistoryModel = cache((env, timeoutMs) =>
  loadUncached({ env, ...(timeoutMs ? { timeoutMs } : {}) })
);

/** Strict shared Supabase calculation model; never reaches Google on failure. */
export async function loadSecondaryHistoryModel(options = {}) {
  if (options.dependencies) return loadUncached(options);
  return loadCachedSecondaryHistoryModel(
    options.env || process.env,
    options.timeoutMs || 0,
  );
}
