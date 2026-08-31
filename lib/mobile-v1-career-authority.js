import { buildCompletedHistoryPresentation } from "./completed-history-presentation-adapter.js";
import { loadHistory2026View } from "./history-2026-service.js";
import { MobileApiError } from "./mobile-api-v1.js";
import { readMobilePreviewParticipantContent } from "./mobile-v1-participant-content-authority.js";
import { readPreviewSecondaryHistoryPlayers } from "./player-public-profile-projection.js";
import { requireSecondaryHistoryReadSource } from "./secondary-history-read-source.js";
import { buildSecondaryHistoryModel } from "./secondary-history-model.js";
import { createHistoricalStatsModel } from "./stats.js";

const clean = (value) => String(value ?? "").trim();

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

function payloadData(read) {
  const payload = read?.payload || read || {};
  if (payload.ok !== true || !payload.data) throw unavailable();
  return payload.data;
}

/**
 * Builds the existing canonical career model from one bounded completed-year
 * bundle, the current-year historical projection, and the canonical public
 * Player directory. It does not replace any career calculation authority; it
 * only removes the previous one-network-read-per-year delivery topology.
 */
export async function loadMobileCareerAuthority(
  identity = {},
  { env = process.env, dependencies = {}, leaderboardsRead = null } = {},
) {
  const playerId = clean(identity.playerId);
  const tournamentId = clean(identity.tournamentId);
  if (!playerId || !tournamentId || identity.context?.membership?.active === false) {
    throw unavailable();
  }

  try {
    const source = (dependencies.requireSecondaryHistoryReadSource ||
      requireSecondaryHistoryReadSource)(env);
    if (source.resolved !== "supabase") throw unavailable();

    const bundleReader = dependencies.readMobilePreviewParticipantContent ||
      readMobilePreviewParticipantContent;
    const currentLoader = dependencies.loadHistory2026View || loadHistory2026View;
    const playerReader = dependencies.readPreviewSecondaryHistoryPlayers ||
      readPreviewSecondaryHistoryPlayers;
    const completedAdapter = dependencies.buildCompletedHistoryPresentation ||
      buildCompletedHistoryPresentation;
    const modelBuilder = dependencies.buildSecondaryHistoryModel ||
      buildSecondaryHistoryModel;
    const calculationsBuilder = dependencies.createHistoricalStatsModel ||
      createHistoricalStatsModel;

    const [bundleRead, currentView, playerRead] = await Promise.all([
      bundleReader("COMPLETED_HISTORY_BUNDLE", identity, { env }),
      currentLoader({
        env,
        tournamentId,
        includeTournamentPlayerMetadata: true,
        timeoutMs: 20_000,
        dependencies: {
          ...(dependencies.currentHistoryDependencies || {}),
          ...(leaderboardsRead
            ? { readTournamentPlayerProjection: async () => leaderboardsRead }
            : {}),
        },
      }),
      playerReader({ env, timeoutMs: 10_000 }),
    ]);

    const bundle = payloadData(bundleRead);
    const rows = Array.isArray(bundle.completed_years)
      ? bundle.completed_years
      : bundle.completedYears;
    if (!Array.isArray(rows) || rows.length !== 9) throw unavailable();
    const completedViews = rows.map((row) => completedAdapter(row))
      .sort((left, right) => Number(left.year) - Number(right.year));
    const expectedYears = Array.from({ length: 9 }, (_, index) => 2017 + index);
    if (completedViews.some((view, index) =>
      Number(view.year) !== expectedYears[index] || view.source !== "supabase")) {
      throw unavailable();
    }

    const playerProjection = payloadData(playerRead);
    const model = modelBuilder({ completedViews, currentView, playerProjection }, {
      createCalculations: calculationsBuilder,
    });
    if (model?.source !== "supabase" || !model.calculations ||
        !Array.isArray(model.scorecardAnalytics?.canonicalCareerScorecards)) {
      throw unavailable();
    }
    return model;
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw unavailable();
  }
}
