import "server-only";

import {
  buildHistory2026Adapter,
  history2026TeamPageModel,
  history2026SourceFingerprint,
  sanitizeHistory2026PublicView,
} from "./history-2026-adapter.js";
import {
  PREVIEW_HISTORY_2026_TOURNAMENT_ID,
  PREVIEW_HISTORY_2026_TOURNAMENT_YEAR,
  isSupabaseHistory2026,
  requireHistory2026ReadSource,
} from "./history-2026-read-source.js";
import { readHistory2026SupabaseView } from "./history-2026-supabase.js";
import { readGuideProjection } from "./guide-supabase.js";
import { readLeaderboardsCoreView } from "./leaderboards-core-supabase.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const adaptedViewCache = new Map();
const pendingAdaptations = new Map();
const MAX_ADAPTED_REVISIONS = 4;

function cacheKey(aggregate, guideProjection) {
  const guideData = guideProjection?.payload?.data || guideProjection?.data || guideProjection || {};
  const historyFingerprint = clean(aggregate?.source_fingerprint);
  const guideFingerprint = clean(
    guideData?.delivery_fingerprint || guideData?.content_fingerprint || guideData?.payload_hash
  );
  const guideRevision = number(guideData?.projection_revision || guideData?.publication_sequence);
  if (historyFingerprint && (guideFingerprint || guideRevision)) {
    return `${historyFingerprint}:${guideFingerprint || guideRevision}`;
  }
  return history2026SourceFingerprint(aggregate, { guideProjection });
}

function rememberAdaptedView(key, view) {
  adaptedViewCache.delete(key);
  adaptedViewCache.set(key, view);
  while (adaptedViewCache.size > MAX_ADAPTED_REVISIONS) {
    adaptedViewCache.delete(adaptedViewCache.keys().next().value);
  }
}

async function adaptCurrentRevision({ aggregate, guideProjection, adapter, sanitizer }) {
  const key = cacheKey(aggregate, guideProjection);
  if (adaptedViewCache.has(key)) return { view: adaptedViewCache.get(key), cacheHit: true, adapterMs: 0 };
  if (pendingAdaptations.has(key)) {
    return { view: await pendingAdaptations.get(key), cacheHit: true, adapterMs: 0 };
  }
  const startedAt = performance.now();
  const pending = Promise.resolve().then(() => sanitizer(adapter(aggregate, { guideProjection })));
  pendingAdaptations.set(key, pending);
  try {
    const view = await pending;
    rememberAdaptedView(key, view);
    return { view, cacheHit: false, adapterMs: Math.max(0, performance.now() - startedAt) };
  } finally {
    pendingAdaptations.delete(key);
  }
}

function rpcPayload(read, label) {
  const payload = read?.payload || read || {};
  if (!payload?.ok || !payload?.data) {
    const error = new Error(`${label} is temporarily unavailable.`);
    error.code = clean(payload?.code || "HISTORY_2026_READ_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  return payload.data;
}

export function mergeHistoryTournamentPlayerMetadata(aggregate = {}, coreView = {}) {
  const players = new Map((coreView.players || []).map((player) => [clean(player.player_id), player]));
  return {
    ...aggregate,
    players: (aggregate.players || []).map((player) => {
      const canonical = players.get(clean(player.player_id)) || {};
      const tournamentSource = canonical.tournament_source_payload || {};
      const presentation = canonical.presentation || {};
      const playerSource = canonical.source_payload || {};
      const tournamentHandicap = tournamentSource["Tournament Handicap"];
      return {
        ...player,
        tournament_handicap: tournamentHandicap === null || tournamentHandicap === undefined || tournamentHandicap === ""
          ? null
          : Number(tournamentHandicap),
        captain: presentation.captain === true || /^(true|yes|1)$/i.test(clean(playerSource.Captain)),
      };
    }),
  };
}

/**
 * Load and translate the complete public-safe 2026 historical view. This is a
 * strict Supabase path: failures are allowed to reach the route's isolated
 * unavailable state and are never replaced with legacy or bundled 2026 data.
 *
 * Dependencies are injectable only on the server/test side so parity and
 * outage behavior can be proven without mutating official tournament state.
 */
export async function loadHistory2026View(options = {}) {
  const startedAt = performance.now();
  const env = options.env || process.env;
  const year = number(options.year ?? PREVIEW_HISTORY_2026_TOURNAMENT_YEAR);
  const tournamentId = clean(options.tournamentId || PREVIEW_HISTORY_2026_TOURNAMENT_ID);
  if (
    year !== PREVIEW_HISTORY_2026_TOURNAMENT_YEAR ||
    tournamentId !== PREVIEW_HISTORY_2026_TOURNAMENT_ID
  ) {
    const error = new Error("The Supabase historical adapter is scoped only to tournament 2026.");
    error.code = "HISTORY_2026_EXPLICIT_TOURNAMENT_REQUIRED";
    error.status = 404;
    throw error;
  }

  const source = requireHistory2026ReadSource(env);
  if (source.resolved !== "supabase") {
    const error = new Error("Supabase 2026 History delivery is not selected in this runtime.");
    error.code = "HISTORY_2026_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }

  const dependencies = options.dependencies || {};
  const historyReader = dependencies.readHistory2026SupabaseView || readHistory2026SupabaseView;
  const guideReader = dependencies.readGuideProjection || readGuideProjection;
  const tournamentPlayerReader = dependencies.readTournamentPlayerProjection || readLeaderboardsCoreView;
  const adapter = dependencies.buildHistory2026Adapter || buildHistory2026Adapter;
  const sanitizer = dependencies.sanitizeHistory2026PublicView || sanitizeHistory2026PublicView;

  const includeTournamentPlayerMetadata = options.includeTournamentPlayerMetadata === true;
  const [historyRead, guideRead, tournamentPlayerRead] = await Promise.all([
    historyReader({ ...options, env, year, tournamentId }),
    guideReader({ env, tournamentId, surface: "course", timeoutMs: options.timeoutMs || 8_000 }),
    includeTournamentPlayerMetadata
      ? tournamentPlayerReader(tournamentId, { env, timeoutMs: options.timeoutMs || 8_000 })
      : Promise.resolve(null),
  ]);
  const aggregate = includeTournamentPlayerMetadata
    ? mergeHistoryTournamentPlayerMetadata(
      rpcPayload(historyRead, "2026 History"),
      rpcPayload(tournamentPlayerRead, "2026 tournament player metadata")
    )
    : rpcPayload(historyRead, "2026 History");
  // Keep course presentation coupled to the already-published Guide revision.
  // If it is unavailable, fail the isolated History surface rather than
  // manufacturing a course presentation or reaching for a legacy source.
  rpcPayload(guideRead, "2026 course presentation");

  const adapted = await adaptCurrentRevision({
    aggregate,
    guideProjection: guideRead,
    adapter,
    sanitizer,
  });
  const publicView = adapted.view;
  if (
    publicView?.source !== "supabase" ||
    number(publicView?.year) !== PREVIEW_HISTORY_2026_TOURNAMENT_YEAR ||
    !publicView?.tournament || !publicView?.analytics
  ) {
    const error = new Error("The public 2026 historical view is incomplete.");
    error.code = "HISTORY_2026_PUBLIC_VIEW_INCOMPLETE";
    error.status = 503;
    throw error;
  }
  return {
    ...publicView,
    diagnostics: {
      ...(publicView.diagnostics || {}),
      postgresQueryMs: number(aggregate.query_ms),
      supabaseHistoryRequestMs: number(historyRead?.durationMs),
      supabaseGuideRequestMs: number(guideRead?.durationMs),
      adapterMs: adapted.adapterMs,
      adapterCacheHit: adapted.cacheHit,
      totalServiceMs: Math.max(0, performance.now() - startedAt),
      googleForegroundRequests: 0,
    },
  };
}

export function history2026TournamentCard(view = {}) {
  return view?.tournament || null;
}

export function history2026TournamentPageModel(view = {}) {
  return {
    tournament: view?.tournament || null,
    roundPoints: Array.isArray(view?.roundPoints) ? view.roundPoints : [],
    leaderboardRows: Array.isArray(view?.leaderboardRows) ? view.leaderboardRows : [],
    previousYear: view?.previousYear ?? "2025",
    nextYear: view?.nextYear ?? null,
    scorecardAnalytics: view?.scorecardAnalytics || view?.analytics || null,
  };
}

export function history2026RoundPageModel(view = {}, round) {
  const target = number(round, -1);
  const rows = Array.isArray(view?.rounds)
    ? view.rounds
    : Array.isArray(view?.roundArchives) ? view.roundArchives : [];
  const selected = rows.find((item) => number(
    item?.archive?.round ?? item?.round ?? item?.roundNumber ?? item?.number,
    -1
  ) === target);
  return selected ? {
    archive: selected.archive || selected,
    scorecardAnalytics: view?.scorecardAnalytics || view?.analytics || null,
  } : null;
}

export { history2026TeamPageModel, isSupabaseHistory2026 };
