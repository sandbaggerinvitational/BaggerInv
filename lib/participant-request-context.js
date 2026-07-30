import { randomUUID } from "node:crypto";
import { getTournamentData, tournamentLoaderDiagnostics } from "../app/live/sheetData.js";
import { inspectPlayerPassportToken } from "./player-passport-server.js";
import { playerPassportTokenFromRequest } from "./player-passport.js";
import { safeWorkbookIdentifier } from "./google-sheets-server-read.js";

export async function loadParticipantRequestContext(request, { route = "unknown" } = {}) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const token = playerPassportTokenFromRequest(request);
  const host = request?.headers?.get?.("host") || "";
  const [tournamentResult, identityResult] = await Promise.allSettled([
    getTournamentData(),
    inspectPlayerPassportToken(token),
  ]);
  const tournamentData = tournamentResult.status === "fulfilled" ? tournamentResult.value : null;
  const identity = identityResult.status === "fulfilled"
    ? identityResult.value
    : { status: "unavailable", identity: null };
  const loader = tournamentLoaderDiagnostics();

  if (process.env.VERCEL_ENV === "preview") {
    console.info("participant-request", {
      route,
      requestId,
      timestamp: new Date().toISOString(),
      previewHostname: host,
      workbook: safeWorkbookIdentifier(),
      normalizedTournamentLoader: tournamentResult.status,
      tournamentStatus: tournamentData?.tournament?.state || "unavailable",
      passportCookiePresent: Boolean(token),
      trustedDeviceLookup: identity.status,
      resolvedPlayerId: identity.identity?.playerId || identity.identity?.player?.id || null,
      googleApiResult: loader.google.lastResult,
      retryCount: loader.google.retries,
      cache: loader.cacheBehavior,
      latencyMs: Date.now() - startedAt,
      timeoutOrErrorCategory: loader.errorCategory || loader.google.lastErrorCategory || "",
    });
  }

  return {
    requestId,
    tournamentData,
    tournamentError: tournamentResult.status === "rejected" ? tournamentResult.reason : null,
    identity,
    diagnostics: loader,
    latencyMs: Date.now() - startedAt,
    passportCookiePresent: Boolean(token),
  };
}
