import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getTournamentData, tournamentLoaderDiagnostics } from "../../live/sheetData.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../lib/player-passport-server.js";
import { directorAutomationDue, tournamentDirectorModel } from "../../../lib/tournament-director.js";
import { currentPushDevice, disableLiveMatchAccess, enableLiveMatchAccess, readNotificationLog, readOddsSnapshots, readTournamentReadiness, reopenLiveMatch, updateLiveMatch, updateTournamentAdminData, withWorkbookWriteDiagnostics } from "../../../lib/google-sheets-write.js";
import { withNormalizedReadDiagnostics } from "../../../lib/google-sheets-server-read.js";
import { GOOGLE_SHEETS_CACHE_TAG } from "../../../lib/google-sheets-data.js";
import { previewPushConfiguration } from "../../../lib/web-push-notifications.js";
import { notificationPreviewContextForPlayer, previewNotificationTemplateOptions } from "../../../lib/notification-templates.js";
import { directorTransactionError } from "../../../lib/director-transaction-error.js";
import { loadPredictionSheets } from "../../../lib/prediction-data.js";
import { bindOfficialProjectionMatches } from "../../../lib/odds-pairing-source.js";
import { currentTournamentYear } from "../../../lib/tournament-context.js";
import { validateOpeningMatchups, validateRoundThreePairings } from "../../../lib/tournament-odds.js";
import { championshipProjectionMissionStatus } from "../../../lib/projection-mission-control.js";

export const dynamic = "force-dynamic";

async function authorize(request) {
  return inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
}

function authorizationFailure(result) {
  if (result.status === "unavailable") {
    return NextResponse.json({ error: "Tournament Director identity could not be verified right now. Retry." }, { status: 503, headers: { "Retry-After": "1" } });
  }
  return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
}

function refresh() {
  revalidateTag(GOOGLE_SHEETS_CACHE_TAG);
  for (const path of ["/admin/director", "/home", "/live", "/my-match"]) revalidatePath(path);
}

async function setMatchesLiveAndOpenScoring(matches, updatedBy) {
  await Promise.all(matches.filter((match) => match.status !== "Final").map(async (match) => {
    await updateLiveMatch(match.id, { "Match Status": "Live" }, updatedBy);
    await enableLiveMatchAccess(match.id, updatedBy);
  }));
}

export async function GET(request) {
  const authorization = await authorize(request);
  if (authorization.status !== "active") return authorizationFailure(authorization);
  const identity = authorization.identity;
  try {
    const preview = previewPushConfiguration();
    const session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
    const measured = await withWorkbookWriteDiagnostics("director-dashboard", () => withNormalizedReadDiagnostics("GET /api/director", () => Promise.all([
      getTournamentData(), readTournamentReadiness(), preview.preview ? currentPushDevice(session) : null,
      preview.preview ? readNotificationLog() : [], loadPredictionSheets().catch(() => null), readOddsSnapshots().catch(() => []),
    ])));
    const [tournamentData, readiness, device, notificationLog, projectionSheets, projectionSnapshots] = measured.result.result;
    console.info("Director workbook access", { normalized: measured.result.diagnostics, authenticated: measured.diagnostics });
    const directorModel = tournamentDirectorModel({ ...tournamentData, readiness, diagnostics: tournamentLoaderDiagnostics() });
    const projectionYear = projectionSheets ? currentTournamentYear(projectionSheets) : directorModel.tournament.year;
    const boundProjectionSheets = projectionSheets ? bindOfficialProjectionMatches(projectionSheets, projectionYear) : null;
    const championshipProjections = championshipProjectionMissionStatus({
      snapshots: projectionSnapshots.filter((snapshot) => Number(snapshot.year) === Number(projectionYear)),
      rounds: directorModel.rounds,
      tournament: directorModel.tournament,
      openingStatus: boundProjectionSheets ? validateOpeningMatchups(boundProjectionSheets, projectionYear) : { ready: false, message: "Projection readiness is temporarily unavailable." },
      roundThreeStatus: boundProjectionSheets ? validateRoundThreePairings(boundProjectionSheets, projectionYear) : { ready: false, message: "Projection readiness is temporarily unavailable." },
    });
    const pwaInstalled = ["true", "yes", "1"].includes(String(device?.row?.record?.["PWA Installed"] || "").trim().toLowerCase());
    const permissionGranted = String(device?.row?.record?.["Notification Permission"] || "").trim().toLowerCase() === "granted";
    const pushSubscription = Boolean(device?.subscription);
    const readyToSend = preview.configured && pwaInstalled && permissionGranted && pushSubscription;
    return NextResponse.json({ data: {
      ...directorModel,
      championshipProjections,
      notificationSandbox: preview.preview ? {
        configured: preview.configured, currentDeviceReady: readyToSend,
        health: { pwaInstalled, permissionGranted, pushSubscription, readyToSend },
        templates: previewNotificationTemplateOptions(notificationPreviewContextForPlayer(tournamentData, identity.player)),
        log: notificationLog,
      } : null,
      qaTools: preview.preview ? {
        players: tournamentData.players || [],
        impersonating: Boolean(identity.impersonating),
        selectedPlayer: identity.impersonating ? identity.player : null,
      } : null,
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Director dashboard is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request) {
  const authorization = await authorize(request);
  if (authorization.status !== "active") return authorizationFailure(authorization);
  const identity = authorization.identity;
  try {
    const input = await request.json();
    const data = await getTournamentData();
    const round = Number(input.round || data.tournament.currentRound);
    const matches = data.rounds.find((item) => Number(item.number) === round)?.matches || [];
    const updatedBy = identity.actor.name;
    if (input.action === "automation-check") {
      const dueRound = directorAutomationDue(tournamentDirectorModel(data));
      if (!dueRound) return NextResponse.json({ ok: true, changed: false });
      const dueMatches = data.rounds.find((item) => Number(item.number) === dueRound)?.matches || [];
      await updateTournamentAdminData(data.tournament.id, { "Status Mode": "Manual Override", "Tournament Status": "Live", "Current Round": String(dueRound) }, "Tournament Director automation");
      if (data.tournament.directorAutomation?.autoSetMatchesLive) await setMatchesLiveAndOpenScoring(dueMatches, "Tournament Director automation");
    } else if (input.action === "set-live") {
      await setMatchesLiveAndOpenScoring(matches, updatedBy);
    } else if (input.action === "open-round") {
      await updateTournamentAdminData(data.tournament.id, { "Status Mode": "Manual Override", "Tournament Status": "Live", "Current Round": String(round) }, updatedBy);
      if (data.tournament.directorAutomation?.autoSetMatchesLive) await setMatchesLiveAndOpenScoring(matches, updatedBy);
    } else if (input.action === "unlock-scoring") {
      await Promise.all(matches.filter((match) => match.status !== "Final").map((match) => enableLiveMatchAccess(match.id, updatedBy)));
    } else if (input.action === "lock-scoring") {
      await Promise.all(matches.filter((match) => match.status !== "Final").map((match) => disableLiveMatchAccess(match.id, updatedBy)));
    } else if (input.action === "close-round") {
      if (matches.some((match) => match.status !== "Final")) throw new Error("Every match must be Final before the round can close.");
      const next = data.rounds.find((item) => Number(item.number) > round)?.number;
      await updateTournamentAdminData(data.tournament.id, { "Status Mode": "Manual Override", "Tournament Status": next ? "Live" : "Final", "Current Round": next ? String(next) : "Final" }, updatedBy);
    } else if (input.action === "reopen-match") {
      if (!input.matchId || !matches.some((match) => match.id === input.matchId && match.status === "Final")) throw new Error("Select a finalized match from the active round.");
      await reopenLiveMatch(input.matchId, updatedBy);
    } else if (input.action === "automation") {
      await updateTournamentAdminData(data.tournament.id, {
        "Director Automation Enabled": input.enabled,
        "Auto Open Round": input.autoOpenRound,
        "Auto Set Matches Live": input.autoSetMatchesLive,
      }, updatedBy);
    } else throw new Error("Unknown Director action.");
    refresh();
    return NextResponse.json({ ok: true, changed: input.action === "automation-check" });
  } catch (error) {
    return NextResponse.json({ error: directorTransactionError(error) }, { status: 400 });
  }
}
