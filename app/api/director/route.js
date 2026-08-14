import { revalidatePath, revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { getTournamentData, invalidateTournamentDataCache, tournamentLoaderDiagnostics } from "../../live/sheetData.js";
import { authorizePreviewDirector } from "../../../lib/preview-director-authorization.js";
import { directorAutomationDue, tournamentDirectorModel } from "../../../lib/tournament-director.js";
import { currentPushDevice, disableLiveMatchAccess, enableLiveMatchAccess, finalizeLiveMatch, readDirectorOperationsData, readNotificationLog, readOddsSnapshots, readTournamentReadiness, reopenLiveMatch, updateDirectorCalcutta, updateDirectorCourseTees, updateDirectorMatchManagement, updateDirectorNetSkins, updateDirectorRoundPairings, updateLiveMatch, updateTournamentAdminData, withWorkbookWriteDiagnostics } from "../../../lib/google-sheets-write.js";
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
import { verifyDirectorReadBack } from "../../../lib/director-readback-verification.js";
import { persistDirectorMatchLifecycle } from "../../../lib/scoring-persistence-adapter.js";
import { drainGoogleOutbox } from "../../../lib/scoring-google-outbox.js";
import { recalculateCompetitionDerivedTournament } from "../../../lib/competition-derived-supabase.js";
import { recalculateCalcuttaTournament } from "../../../lib/calcutta-supabase.js";
import { drainScorecardArchiveJobs } from "../../../lib/scorecard-archive-worker.js";

export const dynamic = "force-dynamic";

async function authorize(request) {
  return authorizePreviewDirector({ request, allowBootstrap: true });
}

function authorizationFailure(result) {
  if (result.status === "unavailable") {
    return NextResponse.json({ error: "Director verification expired. Reconnecting automatically…" }, { status: 503, headers: { "Retry-After": "1", "X-Director-Retryable": "identity" } });
  }
  return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
}

function transactionTrace(action) {
  const startedAt = Date.now();
  const stages = [];
  return {
    stage(name, result = "PASS", detail = "") { stages.push({ name, result, detail, elapsedMs: Date.now() - startedAt }); },
    report(extra = {}) { return { action, elapsedMs: Date.now() - startedAt, stages, ...extra }; },
  };
}

function verifyActionReadBack(action, input, data, round) {
  if (["match-unlock-scoring", "match-lock-scoring", "match-mark-live", "match-finalize", "match-reopen"].includes(action)) {
    const match = data.operations?.matches.find((item) => item.id === input.matchId);
    if (!match) return false;
    if (action === "match-unlock-scoring") return match.scoringUnlocked === true;
    if (action === "match-lock-scoring") return match.scoringUnlocked === false;
    if (action === "match-mark-live") return /^Live$/i.test(match.status);
    if (action === "match-finalize") return /^Final$/i.test(match.status);
    return /^Reopened$/i.test(match.status);
  }
  if (action === "match-management") {
    const match = data.operations?.matches.find((item) => item.id === input.matchId);
    return Boolean(match) && Object.entries(input.updates || {}).every(([field, value]) => ({
      Round: match.round, Match: match.match, "Course ID": match.courseId, "Tee Time": match.teeTime, "Starting Hole": match.startingHole,
      "Team 1 Player 1": match.players.find((player) => player.side === 1 && player.slot === 1)?.id || "",
      "Team 1 Player 2": match.players.find((player) => player.side === 1 && player.slot === 2)?.id || "",
      "Team 2 Player 1": match.players.find((player) => player.side === 2 && player.slot === 1)?.id || "",
      "Team 2 Player 2": match.players.find((player) => player.side === 2 && player.slot === 2)?.id || "",
    })[field] === String(value ?? "").trim());
  }
  if (action === "round-pairings") {
    return (input.updates || []).every((update) => {
      const match = data.operations?.matches.find((item) => item.id === update.matchId);
      if (!match) return false;
      return Object.entries(update.updates || {}).every(([field, value]) => ({
        "Team 1 Player 1": match.players.find((player) => player.side === 1 && player.slot === 1)?.id || "",
        "Team 1 Player 2": match.players.find((player) => player.side === 1 && player.slot === 2)?.id || "",
        "Team 2 Player 1": match.players.find((player) => player.side === 2 && player.slot === 1)?.id || "",
        "Team 2 Player 2": match.players.find((player) => player.side === 2 && player.slot === 2)?.id || "",
      })[field] === String(value ?? "").trim());
    });
  }
  if (action === "calcutta-management") {
    const calcutta = data.operations?.calcutta;
    if (input.operation === "calcutta-session") {
      const purchaseVerified = calcutta?.purchases.some((item) => item.golferPlayerId === input.golferPlayerId && Number(item.purchasePrice) === Number(input.purchasePrice));
      const actual = (calcutta?.ownership || []).filter((item) => item.golferPlayerId === input.golferPlayerId).map((item) => `${item.ownerPlayerId}:${Number(item.ownershipPercentage)}`).sort();
      const expected = (input.owners || []).map((item) => `${item.ownerPlayerId}:${Number(item.ownershipPercentage)}`).sort();
      return Boolean(purchaseVerified) && actual.length === expected.length && actual.every((item, index) => item === expected[index]);
    }
    if (input.operation === "purchase") return calcutta?.purchases.some((item) => item.golferPlayerId === input.golferPlayerId && Number(item.purchasePrice) === Number(input.purchasePrice));
    if (input.operation === "owner-group") {
      const actual = (calcutta?.ownership || []).filter((item) => item.golferPlayerId === input.golferPlayerId).map((item) => `${item.ownerPlayerId}:${Number(item.ownershipPercentage)}`).sort();
      const expected = (input.owners || []).map((item) => `${item.ownerPlayerId}:${Number(item.ownershipPercentage)}`).sort();
      return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
    }
    if (input.operation === "owner-remove") return !calcutta?.ownership.some((item) => item.golferPlayerId === input.golferPlayerId && item.ownerPlayerId === input.ownerPlayerId);
    return calcutta?.ownership.some((item) => item.golferPlayerId === input.golferPlayerId && item.ownerPlayerId === input.ownerPlayerId && Number(item.ownershipPercentage) === Number(input.ownershipPercentage));
  }
  if (action === "net-skins-eligibility") {
    const updates = Array.isArray(input.updates) ? input.updates : [{ round: input.round, eligible: input.eligible }];
    return updates.length > 0 && updates.every((update) => { const entries = data.operations?.netSkins.filter((item) => item.playerIds.includes(input.playerId) && Number(item.round) === Number(update.round)) || []; return Boolean(entries.length) && entries.every((item) => item.eligible === Boolean(update.eligible)); });
  }
  if (action === "course-tees") {
    const courses = data.operations?.courseTees?.courses || [];
    return (input.updates || []).every((update) => courses.some((course) => course.id === update.courseId && String(course.currentTee).toLowerCase() === String(update.tee).toLowerCase() && course.handicapVerified));
  }
  const matches = data.rounds.find((item) => Number(item.number) === Number(round))?.matches || [];
  if (action === "open-round") return Number(data.tournament.currentRound) === Number(round) && String(data.tournament.status).toLowerCase() === "live";
  if (action === "set-live") return matches.filter((match) => match.status !== "Final").every((match) => /^(Live|Reopened)$/i.test(match.status) && match.scoringEnabled !== false);
  if (action === "unlock-scoring") return matches.filter((match) => match.status !== "Final").every((match) => match.scoringEnabled !== false);
  if (action === "lock-scoring") return matches.filter((match) => match.status !== "Final").every((match) => match.scoringEnabled === false);
  if (action === "reopen-match") return matches.some((match) => match.id === input.matchId && /^Reopened$/i.test(match.status));
  if (action === "automation") return Boolean(data.tournament.directorAutomation?.enabled) === Boolean(input.enabled);
  if (action === "close-round") return Number(data.tournament.currentRound) !== Number(round) || /^(Final|Complete)$/i.test(String(data.tournament.status));
  if (action === "automation-check") return true;
  return false;
}

function verificationValues(action, input, data, round) {
  if (data.operations) return { action, operations: data.operations };
  const matches = data.rounds.find((item) => Number(item.number) === Number(round))?.matches || [];
  return {
    action,
    requestedRound: Number(round),
    tournamentStatus: data.tournament.status,
    currentRound: data.tournament.currentRound,
    automationEnabled: Boolean(data.tournament.directorAutomation?.enabled),
    matchId: input.matchId || "",
    matches: matches.map((match) => ({
      id: match.id,
      status: match.status,
      scoringEnabled: match.scoringEnabled !== false,
    })),
  };
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
  const trace = transactionTrace("dashboard-load");
  const authorization = await authorize(request);
  trace.stage("Identity verification", authorization.status === "active" ? "PASS" : "FAIL", authorization.status);
  if (authorization.status !== "active") return authorizationFailure(authorization);
  const identity = authorization.identity;
  try {
    const preview = previewPushConfiguration();
    const session = authorization.identity.session;
    const measured = await withWorkbookWriteDiagnostics("director-dashboard", () => withNormalizedReadDiagnostics("GET /api/director", () => Promise.all([
      getTournamentData(), readTournamentReadiness(), preview.preview && session.type === "player-passport" ? currentPushDevice(session) : null,
      preview.preview ? readNotificationLog() : [], loadPredictionSheets().catch(() => null), readOddsSnapshots().catch(() => []),
    ])));
    const [tournamentData, readiness, device, notificationLog, projectionSheets, projectionSnapshots] = measured.result.result;
    const operations = await readDirectorOperationsData(tournamentData.tournament.year);
    trace.stage("Workbook verification", "PASS");
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
    trace.stage("Dashboard assembly", "PASS");
    console.info("Director dashboard transaction", trace.report({ workbook: measured.result.diagnostics, authorization: measured.diagnostics }));
    return NextResponse.json({ data: {
      ...directorModel,
      operations,
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
    trace.stage("Dashboard assembly", "FAIL", error instanceof Error ? error.message : String(error));
    console.error("Director dashboard transaction", trace.report());
    return NextResponse.json({ error: error?.message || "Director dashboard is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request) {
  const trace = transactionTrace("director-action");
  const directorVerificationStartedAt = Date.now();
  const authorization = await authorize(request);
  trace.stage("Identity verification", authorization.status === "active" ? "PASS" : "FAIL", JSON.stringify({
    status: authorization.status,
    startedAt: directorVerificationStartedAt,
    completedAt: Date.now(),
  }));
  if (authorization.status !== "active") return authorizationFailure(authorization);
  const identity = authorization.identity;
  try {
    const input = await request.json();
    trace.stage("Action authorization", "PASS", String(input.action || "unknown"));
    const data = await getTournamentData();
    trace.stage("Workbook verification", "PASS");
    const round = Number(input.round || data.tournament.currentRound);
    const matches = data.rounds.find((item) => Number(item.number) === round)?.matches || [];
    const selectedMatch = data.rounds.flatMap((item) => item.matches || []).find((match) => match.id === input.matchId);
    const updatedBy = identity.actor.name;
    const workbookWriteStartedAt = Date.now();
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
      const lifecycle = await persistDirectorMatchLifecycle({ action: "reopen", matchId: input.matchId, updatedBy });
      if (!lifecycle.delegated) await reopenLiveMatch(input.matchId, updatedBy);
      else if (!(await drainGoogleOutbox({ maximum: 4, actor: updatedBy })).ok) throw new Error("Google mirror delivery must verify before completing this Director action.");
    } else if (input.action === "match-unlock-scoring") {
      if (!selectedMatch || selectedMatch.status === "Final") throw new Error("Reopen this Final match before unlocking scoring.");
      await enableLiveMatchAccess(input.matchId, updatedBy);
    } else if (input.action === "match-lock-scoring") {
      if (!selectedMatch) throw new Error("The selected match could not be found.");
      await disableLiveMatchAccess(input.matchId, updatedBy);
    } else if (input.action === "match-mark-live") {
      if (!selectedMatch || selectedMatch.status === "Final") throw new Error("Reopen this Final match before marking it Live.");
      await updateLiveMatch(input.matchId, { "Match Status": "Live" }, updatedBy);
    } else if (input.action === "match-finalize") {
      if (!selectedMatch) throw new Error("The selected match could not be found.");
      if (selectedMatch.status === "Final") throw new Error("This match is already Final.");
      const lifecycle = await persistDirectorMatchLifecycle({ action: "finalize", matchId: input.matchId, updatedBy });
      if (!lifecycle.delegated) await finalizeLiveMatch(input.matchId, {}, updatedBy);
      else if (!(await drainGoogleOutbox({ maximum: 4, actor: updatedBy })).ok) throw new Error("Google mirror delivery must verify before completing this Director action.");
    } else if (input.action === "match-reopen") {
      if (!selectedMatch || selectedMatch.status !== "Final") throw new Error("Only a Final match can be reopened.");
      const lifecycle = await persistDirectorMatchLifecycle({ action: "reopen", matchId: input.matchId, updatedBy });
      if (!lifecycle.delegated) await reopenLiveMatch(input.matchId, updatedBy);
      else if (!(await drainGoogleOutbox({ maximum: 4, actor: updatedBy })).ok) throw new Error("Google mirror delivery must verify before completing this Director action.");
    } else if (input.action === "automation") {
      await updateTournamentAdminData(data.tournament.id, {
        "Director Automation Enabled": input.enabled,
        "Auto Open Round": input.autoOpenRound,
        "Auto Set Matches Live": input.autoSetMatchesLive,
      }, updatedBy);
    } else if (input.action === "match-management") {
      await updateDirectorMatchManagement(input.matchId, input.updates, updatedBy);
    } else if (input.action === "round-pairings") {
      await updateDirectorRoundPairings({ ...input, year: data.tournament.year, round }, updatedBy);
    } else if (input.action === "calcutta-management") {
      await updateDirectorCalcutta({ ...input, year: data.tournament.year }, updatedBy);
    } else if (input.action === "net-skins-eligibility") {
      await updateDirectorNetSkins({ ...input, year: data.tournament.year }, updatedBy);
    } else if (input.action === "course-tees") {
      await updateDirectorCourseTees({ ...input, year: data.tournament.year }, updatedBy);
    } else throw new Error("Unknown Director action.");
    const googleWriteCompletedAt = Date.now();
    trace.stage("Action execution", "PASS");
    trace.stage("Workbook write", "PASS", JSON.stringify({
      startedAt: workbookWriteStartedAt,
      googleWriteCompletedAt,
      elapsedMs: googleWriteCompletedAt - workbookWriteStartedAt,
    }));
    refresh();
    if (process.env.VERCEL_ENV === "preview" && ["reopen-match", "match-finalize", "match-reopen"].includes(input.action)) after(async () => {
      try {
        await Promise.all([
          drainScorecardArchiveJobs({ maximum: 4, stopOnFailure: false }),
          recalculateCompetitionDerivedTournament("", { calculatedBy: `Director lifecycle worker · ${updatedBy || "Director"}` }),
          recalculateCalcuttaTournament("", { calculatedBy: `Director lifecycle Calcutta worker · ${updatedBy || "Director"}` }),
        ]);
      } catch (error) {
        console.error("Competition derived-state Director lifecycle recalculation remains pending", {
          action: input.action, code: error?.code || "DERIVED_STATE_RECALCULATION_FAILED",
        });
      }
    });
    const operationsAction = ["match-management", "round-pairings", "calcutta-management", "net-skins-eligibility", "course-tees", "match-unlock-scoring", "match-lock-scoring", "match-mark-live", "match-finalize", "match-reopen"].includes(input.action);
    const verification = await verifyDirectorReadBack({
      invalidate: () => invalidateTournamentDataCache(["Live Matches", "Matches", "Tournaments", "Courses", "Course Scorecards", "Course Holes", "Live Round Handicaps", "Match Update Log", "Admin Audit Log", "Calcutta Purchases", "Calcutta Ownership", "Calcutta Standings", "Net Skins", "Net Skins Result"]),
      read: operationsAction
        ? async () => ({ operations: await readDirectorOperationsData(data.tournament.year) })
        : getTournamentData,
      verify: (verifiedData) => verifyActionReadBack(input.action, input, verifiedData, round),
      summarize: (verifiedData) => verificationValues(input.action, input, verifiedData, round),
      onAttempt: (attempt) => {
        trace.stage(`Cache invalidation attempt ${attempt.attempt}`, "PASS", JSON.stringify({
          startedAt: attempt.invalidationStartedAt,
          completedAt: attempt.invalidationCompletedAt,
          elapsedMs: attempt.invalidationCompletedAt - attempt.invalidationStartedAt,
        }));
        trace.stage(`Verification read attempt ${attempt.attempt}`, attempt.success ? "PASS" : "RETRY", JSON.stringify({
          startedAt: attempt.readStartedAt,
          completedAt: attempt.readCompletedAt,
          elapsedMs: attempt.readCompletedAt - attempt.readStartedAt,
          values: attempt.values,
          error: attempt.error,
        }));
      },
    });
    trace.stage("Read-back verification", verification.success ? "PASS" : "FAIL", JSON.stringify({
      attempts: verification.attempts.length,
      googleWriteCompletedAt,
      verificationStartedAt: verification.attempts[0]?.readStartedAt,
      verificationCompletedAt: verification.attempts.at(-1)?.readCompletedAt,
    }));
    if (!verification.success) throw Object.assign(
      new Error("The workbook update could not be verified after it completed."),
      { verificationAttempts: verification.attempts },
    );
    trace.stage("Success", "PASS");
    console.info("Director action transaction", trace.report({ round, updatedBy }));
    return NextResponse.json({ ok: true, changed: input.action === "automation-check" });
  } catch (error) {
    trace.stage("Failure", "FAIL", error instanceof Error ? error.message : String(error));
    console.error("Director action transaction", trace.report());
    return NextResponse.json({ error: directorTransactionError(error) }, { status: 400 });
  }
}
