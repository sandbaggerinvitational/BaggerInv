import "server-only";

import { cache } from "react";

import { loadCompletedHistoryYears } from "./completed-history-service.js";
import { loadHistory2026View } from "./history-2026-service.js";
import {
  buildHistoricalCourseModel,
  historicalCourseArchiveContent,
  historicalCourseHoleInput,
  historicalCourseProfileInput,
} from "./historical-course-model.js";
import { requireHistoricalCourseReadSource } from "./historical-course-read-source.js";

async function loadUncached(options = {}) {
  const startedAt = performance.now();
  const env = options.env || process.env;
  const source = requireHistoricalCourseReadSource(env);
  if (source.resolved !== "supabase") {
    const error = new Error("Supabase historical course delivery is not selected in this runtime.");
    error.code = "HISTORICAL_COURSE_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }
  const dependencies = options.dependencies || {};
  const completedLoader = dependencies.loadCompletedHistoryYears || loadCompletedHistoryYears;
  const currentLoader = dependencies.loadHistory2026View || loadHistory2026View;
  const builder = dependencies.buildHistoricalCourseModel || buildHistoricalCourseModel;
  const [completed, currentView] = await Promise.all([
    completedLoader({ env, timeoutMs: options.timeoutMs || 20_000 }),
    currentLoader({ env, timeoutMs: options.timeoutMs || 20_000 }),
  ]);
  const model = builder({ completedViews: completed.views, currentView });
  if (model?.source !== "supabase" || model?.diagnostics?.completedAppearances !== 27) {
    const error = new Error("The shared historical course presentation contract is incomplete.");
    error.code = "HISTORICAL_COURSE_PRESENTATION_INCOMPLETE";
    error.status = 503;
    throw error;
  }
  return Object.freeze({
    ...model,
    diagnostics: Object.freeze({
      ...model.diagnostics,
      completedHistoryMs: Number(completed.diagnostics?.yearsRequestMs || 0) + Number(completed.diagnostics?.yearRequestMs || 0),
      currentHistoryMs: Number(currentView.diagnostics?.totalServiceMs || 0),
      totalServiceMs: Math.max(0, performance.now() - startedAt),
      googleForegroundRequests: 0,
      noFallback: true,
    }),
  });
}

const loadCachedHistoricalCourseModel = cache(() => loadUncached());

/** Strict shared Supabase course model; errors never reach for Google. */
export async function loadHistoricalCourseModel(options = {}) {
  return options.env || options.dependencies || options.timeoutMs
    ? loadUncached(options)
    : loadCachedHistoricalCourseModel();
}

export async function loadHistoricalCourseArchive(options = {}) {
  return historicalCourseArchiveContent(await loadHistoricalCourseModel(options));
}

export async function loadHistoricalCourseProfile(input = {}, options = {}) {
  return historicalCourseProfileInput(await loadHistoricalCourseModel(options), input);
}

export async function loadHistoricalCourseHole(input = {}, options = {}) {
  return historicalCourseHoleInput(await loadHistoricalCourseModel(options), input);
}
