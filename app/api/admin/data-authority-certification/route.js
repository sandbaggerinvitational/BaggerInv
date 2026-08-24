import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  dataAuthorityResponseHeaders,
  setDataAuthorityResolvedSource,
  withDataAuthorityRequestScope,
} from "../../../../lib/data-authority-request.js";
import { scoringAuthorityEnvironment } from "../../../../lib/scoring-authority.js";
import { oddsCalculationEnvironment } from "../../../../lib/odds-calculation-source.js";
import { participantIdentityAuthorityEnvironment } from "../../../../lib/participant-identity-authority.js";
import { directorMutationMatrixDiagnostics } from "../../../../lib/director-mutation-authority.js";
import { readHomepageCurrentTournament } from "../../../../lib/homepage-current-tournament.js";
import { readTournamentLiveView } from "../../../../lib/tournament-live-supabase.js";
import { loadSecondaryHistoryModel } from "../../../../lib/secondary-history-service.js";
import { loadCompletedHistoryYears } from "../../../../lib/completed-history-service.js";
import { loadHistory2026View } from "../../../../lib/history-2026-service.js";
import { loadHistoricalCourseArchive } from "../../../../lib/historical-course-service.js";
import { loadDraftProjection } from "../../../../lib/draft-service.js";
import { readPublishedOddsView } from "../../../../lib/published-odds-supabase.js";
import { prepareWarRoomInput } from "../../../../lib/war-room-input-service.js";
import { readParticipantHomeView } from "../../../../lib/participant-home-supabase.js";
import { readParticipantIdentityContext } from "../../../../lib/participant-identity-supabase.js";
import { readMyMatchView } from "../../../../lib/my-match-supabase.js";
import { readGameCenterView } from "../../../../lib/game-center-supabase.js";
import { readLeaderboardsCoreView } from "../../../../lib/leaderboards-core-supabase.js";
import { readGuideProjection } from "../../../../lib/guide-supabase.js";
import { productionShadowCandidateEnvironment } from "../../../../lib/production-shadow-candidate.js";
import { productionShadowCandidateDataEnvironment } from "../../../../lib/production-shadow-candidate-server.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clean = (value) => String(value ?? "").trim();
const TOURNAMENT_ID = "2026";

function payloadSummary(read) {
  const payload = read?.payload || read || {};
  const data = payload?.data || payload;
  return {
    ok: payload?.ok !== false,
    code: clean(payload?.code),
    keys: data && typeof data === "object" ? Object.keys(data).sort().slice(0, 30) : [],
    queryMs: Number(data?.query_ms || read?.durationMs || 0),
  };
}

async function certificationRead(surface, identity, env = process.env) {
  const playerId = clean(identity?.player?.id || identity?.actor?.id);
  if (surface === "root") {
    const [read, completedHistory, currentHistory] = await Promise.all([
      readHomepageCurrentTournament({ env, tournamentId: TOURNAMENT_ID }),
      loadCompletedHistoryYears({ env, timeoutMs: 20_000 }),
      loadHistory2026View({ env, timeoutMs: 20_000 }),
    ]);
    return {
      source: read.diagnostics?.source,
      tournamentId: clean(read.foundation?.tournament?.id || TOURNAMENT_ID),
      historyYears: [
        ...(completedHistory.views || []).map((row) => Number(row.tournament?.year)),
        Number(currentHistory.tournament?.year),
      ].filter(Number.isFinite).sort((left, right) => left - right),
      diagnostics: {
        currentTournament: read.diagnostics,
        completedHistory: completedHistory.diagnostics,
        currentHistory: currentHistory.diagnostics,
      },
    };
  }
  if (surface === "live") return { source: "supabase", ...payloadSummary(await readTournamentLiveView(TOURNAMENT_ID, { env })) };
  if (surface === "players") {
    const model = await loadSecondaryHistoryModel({ env, timeoutMs: 20_000 });
    return { source: model.source, diagnostics: model.diagnostics };
  }
  if (surface === "history") {
    const model = await loadCompletedHistoryYears({ env, timeoutMs: 20_000 });
    return { source: model.source, years: model.views.map((row) => Number(row.tournament?.year)), diagnostics: model.diagnostics };
  }
  if (surface === "courses") {
    const archive = await loadHistoricalCourseArchive({ env, timeoutMs: 20_000 });
    return { source: "supabase", courses: Array.isArray(archive?.courses) ? archive.courses.length : null, keys: Object.keys(archive || {}).sort() };
  }
  if (surface === "draft") {
    const draft = await loadDraftProjection({ env, scope: "CURRENT", timeoutMs: 20_000 });
    return { source: draft.source, years: draft.drafts?.map((row) => row.year) || [], diagnostics: draft.diagnostics };
  }
  if (surface === "odds-center") return { source: "supabase", ...payloadSummary(await readPublishedOddsView({ tournamentId: TOURNAMENT_ID, sourceWorkbookId: env.GOOGLE_SHEETS_ID }, { env })) };
  if (surface === "war-room") {
    const prepared = await prepareWarRoomInput({ scope: "matchup", requestedSource: "supabase", env, timeoutMs: 30_000 });
    return { source: prepared.selection.resolved, contract: prepared.bundle?.metadata?.contractVersion || prepared.bundle?.contractVersion, diagnostics: prepared.diagnostics };
  }
  if (!playerId && ["home", "me", "my-match"].includes(surface)) {
    const error = new Error("The authenticated Director has no canonical player identity for this participant certification.");
    error.code = "CERTIFICATION_PLAYER_ID_REQUIRED";
    error.status = 409;
    throw error;
  }
  if (surface === "home") return { source: "supabase", ...payloadSummary(await readParticipantHomeView({ tournamentId: TOURNAMENT_ID, playerId }, { env })) };
  if (surface === "me") return { source: "supabase", ...payloadSummary(await readParticipantIdentityContext({ tournamentId: TOURNAMENT_ID, playerId }, { env })) };
  if (surface === "my-match") return { source: "supabase", ...payloadSummary(await readMyMatchView({ tournamentId: TOURNAMENT_ID, playerId }, { env })) };
  if (surface === "game-center") return { source: "supabase", ...payloadSummary(await readGameCenterView("2026-R3-4", { env })) };
  if (surface === "leaderboards") return { source: "supabase", ...payloadSummary(await readLeaderboardsCoreView(TOURNAMENT_ID, { env })) };
  if (surface === "guide") return { source: "supabase", ...payloadSummary(await readGuideProjection({ env, tournamentId: TOURNAMENT_ID, surface: "guide" })) };
  if (surface === "authorities") return {
    source: "diagnostic",
    scoring: scoringAuthorityEnvironment(env),
    odds: oddsCalculationEnvironment(env),
    identity: participantIdentityAuthorityEnvironment(env),
    mutations: directorMutationMatrixDiagnostics({ env }),
  };
  const error = new Error("Unknown data-authority certification surface.");
  error.code = "CERTIFICATION_SURFACE_NOT_ALLOWED";
  error.status = 400;
  throw error;
}

const SURFACES = new Set([
  "root", "live", "players", "history", "courses", "draft", "odds-center", "war-room",
  "home", "me", "my-match", "game-center", "leaderboards", "guide", "authorities",
]);

export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const candidate = productionShadowCandidateEnvironment(process.env);
  let env = process.env;
  if (candidate.requested) {
    try {
      env = productionShadowCandidateDataEnvironment(process.env, { request, requireOrigin: false });
    } catch {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }
  // Certification is deliberately read-only. A Director entitlement must
  // already exist; this probe must never bootstrap or mutate identity state.
  const authorization = await authorizePreviewDirector({ request, env, allowBootstrap: false });
  if (authorization?.status !== "active") return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  const url = new URL(request.url);
  const surface = clean(url.searchParams.get("surface") || "authorities").toLowerCase();
  const outage = clean(url.searchParams.get("outage") || "none").toLowerCase();
  if (!SURFACES.has(surface) || !["none", "google", "supabase"].includes(outage)) {
    return NextResponse.json({ error: "Invalid certification request." }, { status: 400 });
  }
  try {
    const measured = await withDataAuthorityRequestScope({
      env,
      label: `step9.1:${surface}`,
      // Every application probe below explicitly selects the certified
      // Supabase adapter; authorities is a metadata-only diagnostic.
      source: surface === "authorities" ? "diagnostic" : "supabase",
      injectGoogleOutage: outage === "google",
      injectSupabaseOutage: outage === "supabase",
    }, async () => {
      const result = await certificationRead(surface, authorization.identity, env);
      setDataAuthorityResolvedSource(result?.source || result?.diagnostics?.resolvedSource || "unknown");
      return result;
    });
    const headers = { "Cache-Control": "private, no-store", ...dataAuthorityResponseHeaders(measured.diagnostics) };
    return NextResponse.json({ ok: true, surface, result: measured.result, diagnostics: measured.diagnostics }, { headers });
  } catch (error) {
    const diagnostics = error?.dataAuthorityDiagnostics || {};
    const headers = { "Cache-Control": "private, no-store", ...dataAuthorityResponseHeaders(diagnostics) };
    return NextResponse.json({
      ok: false,
      surface,
      error: error?.message || "Data-authority certification failed.",
      code: error?.code || "DATA_AUTHORITY_CERTIFICATION_FAILED",
      diagnostics,
    }, { status: Number(error?.status || 503), headers });
  }
}
