import { currentCompetitionDerivedState } from "./competition-derived-supabase.js";
import { requireStorylinesReadSource } from "./competition-derived-read-source.js";
import { applyGuideProjectionToHome } from "./guide-participant-adapter.js";
import { guideReadEnvironment } from "./guide-read-source.js";
import { readGuideProjection } from "./guide-supabase.js";
import { currentNetSkinsOperationalResult } from "./net-skins-supabase.js";
import { requireNetSkinsReadSource } from "./net-skins-read-source.js";
import {
  applyTournamentFoundationToLiveData,
  tournamentFoundationFromGoogle,
  tournamentFoundationFromHistorical,
  tournamentFoundationFromSupabaseView,
} from "./tournament-foundation.js";
import { requireHomepageCurrentReadSource } from "./tournament-read-source.js";
import { readTournamentLiveView, tournamentLiveDataFromSupabaseView } from "./tournament-live-supabase.js";

const clean = (value) => String(value ?? "").trim();
const CURRENT_TOURNAMENT_ID = "2026";

function elapsed(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

function unavailable(code) {
  return { stale: true, unavailable: true, code: clean(code || "UNAVAILABLE") };
}

async function googleHomepageCurrentTournament(options, source, startedAt) {
  const reader = options.dependencies?.readGoogleTournamentData ||
    (async () => (await import("../app/live/sheetData.js")).getTournamentData());
  let liveData = null;
  let loadError = null;
  try {
    liveData = await reader();
  } catch (error) {
    loadError = error;
    console.error("Homepage live tournament details could not be loaded.", error);
  }
  const foundation = liveData
    ? tournamentFoundationFromGoogle(liveData)
    : tournamentFoundationFromHistorical(options.googleFallbackTournament || {});
  return {
    liveData: applyTournamentFoundationToLiveData(liveData, foundation),
    foundation,
    diagnostics: {
      source: "google",
      configuredBy: source.configuredBy,
      googleLiveModelReads: 1,
      googleLiveWorkbookRanges: 30,
      googleLiveWorkbookBatchRequests: liveData ? "0-2 (cache dependent)" : "attempted",
      googleLiveLoadFailed: Boolean(loadError),
      totalMs: elapsed(startedAt),
    },
  };
}

function requireSupabaseGuide(env) {
  const state = guideReadEnvironment(env).guide;
  if (state.resolved === "supabase") return state;
  const error = new Error("Supabase Homepage Guide presentation is not active.");
  error.code = state.blocked ? "HOMEPAGE_GUIDE_SUPABASE_CONFIGURATION_REQUIRED" : "HOMEPAGE_GUIDE_SUPABASE_REQUIRED";
  error.status = 503;
  throw error;
}

async function supabaseHomepageCurrentTournament(options, source, startedAt) {
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const tournamentId = clean(options.tournamentId || env.HOMEPAGE_CURRENT_TOURNAMENT_ID || CURRENT_TOURNAMENT_ID);
  const storylinesSource = requireStorylinesReadSource(env);
  const netSkinsSource = requireNetSkinsReadSource(env);
  requireSupabaseGuide(env);

  const liveReader = dependencies.readTournamentLiveView || readTournamentLiveView;
  const guideReader = dependencies.readGuideProjection || readGuideProjection;
  const storylinesReader = dependencies.currentCompetitionDerivedState || currentCompetitionDerivedState;
  const netSkinsReader = dependencies.currentNetSkinsOperationalResult || currentNetSkinsOperationalResult;
  const [liveRead, guideRead, prepared, netSkins] = await Promise.all([
    liveReader(tournamentId, { env }),
    guideReader({ env, surface: "guide" }),
    storylinesSource.resolved === "supabase"
      ? storylinesReader(tournamentId, { engineKeys: ["TOURNAMENT_STORYLINES"] }).catch((error) => ({
        storylines: [], moments: [], metadata: { storylines: unavailable(error?.code || "STORYLINES_UNAVAILABLE") }, serviceMs: 0,
      }))
      : Promise.resolve(null),
    netSkinsSource.resolved === "supabase"
      ? netSkinsReader(tournamentId, { recalculatePending: false }).catch((error) => ({
        netSkins: null, stale: true, unavailable: true, code: error?.code || "NET_SKINS_UNAVAILABLE", serviceMs: 0,
      }))
      : Promise.resolve(null),
  ]);

  if (!liveRead?.payload?.ok || !liveRead.payload.data) {
    const error = new Error("Homepage current tournament state is temporarily unavailable.");
    error.code = liveRead?.payload?.code || "HOMEPAGE_CURRENT_TOURNAMENT_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
  if (!guideRead?.payload?.ok || !guideRead.payload.data) {
    const error = new Error("Homepage current tournament presentation is temporarily unavailable.");
    error.code = guideRead?.payload?.code || "HOMEPAGE_GUIDE_PROJECTION_UNAVAILABLE";
    error.status = 503;
    throw error;
  }

  let liveData = tournamentLiveDataFromSupabaseView(liveRead.payload.data);
  const home = applyGuideProjectionToHome({ liveData, participant: {}, presentation: {} }, guideRead, {
    previewDate: env.PREVIEW_TIMELINE_DATE,
    previewEnabled: clean(env.VERCEL_ENV).toLowerCase() === "preview",
  });
  liveData = home.liveData;
  if (netSkins?.netSkins) liveData.netSkins = netSkins.netSkins;
  if (storylinesSource.resolved === "supabase") {
    liveData.preparedStorylines = prepared?.moments || [];
    liveData.storylinesSource = "supabase";
    liveData.storylinesFreshness = prepared?.metadata?.storylines || unavailable("STORYLINES_UNAVAILABLE");
  }
  const foundation = tournamentFoundationFromSupabaseView(liveRead.payload.data, guideRead);
  liveData = applyTournamentFoundationToLiveData(liveData, foundation);
  return {
    liveData,
    foundation,
    diagnostics: {
      source: "supabase",
      configuredBy: source.configuredBy,
      googleLiveModelReads: 0,
      googleLiveWorkbookRanges: 0,
      googleLiveWorkbookBatchRequests: 0,
      postgresQueryMs: Number(liveData.queryMs || 0),
      supabaseLiveServiceMs: Number(liveRead.durationMs || 0),
      guideServiceMs: Number(guideRead.durationMs || 0),
      storylinesServiceMs: Number(prepared?.serviceMs || 0),
      netSkinsServiceMs: Number(netSkins?.serviceMs || 0),
      storylines: prepared?.metadata?.storylines || { source: storylinesSource.resolved },
      netSkins: netSkinsSource.resolved === "supabase"
        ? { source: "supabase", stale: Boolean(netSkins?.stale), unavailable: Boolean(netSkins?.unavailable) }
        : { source: netSkinsSource.resolved, unavailable: true },
      guide: home.presentation?.guide || { source: "supabase" },
      totalMs: elapsed(startedAt),
    },
  };
}

export async function readHomepageCurrentTournament(options = {}) {
  const env = options.env || process.env;
  const source = options.source || requireHomepageCurrentReadSource(env);
  const startedAt = Date.now();
  if (source.resolved === "google") return googleHomepageCurrentTournament(options, source, startedAt);
  return supabaseHomepageCurrentTournament(options, source, startedAt);
}
