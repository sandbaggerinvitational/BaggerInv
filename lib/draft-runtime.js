import "server-only";

import { publishedOddsSnapshotsFromView, readPublishedOddsView } from "./published-odds-supabase.js";
import { requireDraftReadSource } from "./draft-read-source.js";
import { loadSecondaryHistoryModel } from "./secondary-history-service.js";
import { refreshHistoricalData } from "./stats.js";
import { readProductionCurrentTournamentRuntime } from "./production-current-tournament-runtime.js";

export async function loadDraftRuntime(options = {}) {
  const env = options.env || process.env;
  const source = requireDraftReadSource(env);
  if (source.resolved === "google") {
    await (options.refreshHistoricalData || refreshHistoricalData)();
    return {
      source,
      draftOptions: { env },
      analysisOptions: {},
      diagnostics: { googleHistoricalRefresh: 1, googleDraftRequests: 2 },
    };
  }
  const currentTournament = String(env.VERCEL_ENV || "").trim().toLowerCase() === "production"
    ? await (options.readCurrentTournamentRuntime || readProductionCurrentTournamentRuntime)({}, { env })
    : null;
  const tournamentId = currentTournament?.tournamentId || "";
  const secondaryLoader = options.loadSecondaryHistoryModel || loadSecondaryHistoryModel;
  const oddsReader = options.readPublishedOddsView || readPublishedOddsView;
  const [secondaryHistory, oddsRead] = await Promise.all([
    secondaryLoader({ env }),
    oddsReader(
      { tournamentId, sourceWorkbookId: env.GOOGLE_SHEETS_ID },
      { env, timeoutMs: options.timeoutMs || 10_000 }
    ),
  ]);
  if (!oddsRead?.payload?.ok || !oddsRead.payload.data) {
    const error = new Error("Published Odds projection required by Draft analytics is unavailable.");
    error.code = oddsRead?.payload?.code || "DRAFT_PUBLISHED_ODDS_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
  const snapshots = publishedOddsSnapshotsFromView(oddsRead.payload.data);
  return {
    source,
    history: secondaryHistory.calculations,
    draftOptions: { env, tournamentId },
    analysisOptions: {
      history: secondaryHistory.calculations,
      readOddsSnapshots: async () => snapshots,
    },
    diagnostics: {
      secondaryHistory: secondaryHistory.diagnostics,
      publishedOddsRequestMs: Number(oddsRead.durationMs || 0),
      googleHistoricalRefresh: 0,
      googleDraftRequests: 0,
      googleOddsRequests: 0,
      fallbackUsed: false,
    },
  };
}
