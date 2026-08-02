import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getTournamentData, tournamentLoaderDiagnostics } from "../../live/sheetData.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../lib/player-passport-server.js";
import { isTournamentDirectorActor } from "../../../lib/player-role.js";
import { directorAutomationDue, tournamentDirectorModel } from "../../../lib/tournament-director.js";
import { currentPushDevice, disableLiveMatchAccess, enableLiveMatchAccess, readNotificationLog, readTournamentReadiness, reopenLiveMatch, updateLiveMatch, updateTournamentAdminData } from "../../../lib/google-sheets-write.js";
import { GOOGLE_SHEETS_CACHE_TAG } from "../../../lib/google-sheets-data.js";
import { previewPushConfiguration } from "../../../lib/web-push-notifications.js";
import { NOTIFICATION_TEMPLATE_OPTIONS } from "../../../lib/notification-templates.js";

export const dynamic = "force-dynamic";

async function authorize(request) {
  const result = await inspectPlayerPassportToken(playerPassportTokenFromRequest(request));
  return result.status === "active" && isTournamentDirectorActor(result.identity) ? result.identity : null;
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
  const identity = await authorize(request);
  if (!identity) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
  try {
    const preview = previewPushConfiguration();
    const session = verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
    const [tournamentData, readiness, device, notificationLog] = await Promise.all([
      getTournamentData(), readTournamentReadiness(), preview.preview ? currentPushDevice(session) : null,
      preview.preview ? readNotificationLog() : [],
    ]);
    const pwaInstalled = ["true", "yes", "1"].includes(String(device?.row?.record?.["PWA Installed"] || "").trim().toLowerCase());
    const permissionGranted = String(device?.row?.record?.["Notification Permission"] || "").trim().toLowerCase() === "granted";
    const pushSubscription = Boolean(device?.subscription);
    const readyToSend = preview.configured && pwaInstalled && permissionGranted && pushSubscription;
    return NextResponse.json({ data: {
      ...tournamentDirectorModel({ ...tournamentData, readiness, diagnostics: tournamentLoaderDiagnostics() }),
      notificationSandbox: preview.preview ? {
        configured: preview.configured, currentDeviceReady: readyToSend,
        health: { pwaInstalled, permissionGranted, pushSubscription, readyToSend }, templates: NOTIFICATION_TEMPLATE_OPTIONS, log: notificationLog,
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
  const identity = await authorize(request);
  if (!identity) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
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
    return NextResponse.json({ error: error?.message || "Director action failed." }, { status: 400 });
  }
}
