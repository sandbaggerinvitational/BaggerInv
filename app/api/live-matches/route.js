import { revalidatePath, revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  disableLiveMatchAccess,
  finalizeLiveMatch,
  generateLiveMatchAccess,
  markLiveMatch,
  readLiveMatchAdminData,
  reopenLiveMatch,
  updateLiveMatch,
  updateLiveMatchPairing,
  withWorkbookWriteDiagnostics,
} from "../../../lib/google-sheets-write";
import { GOOGLE_SHEETS_CACHE_TAG } from "../../../lib/google-sheets-data";
import { invalidateScorecardAnalyticsCache } from "../../../lib/scorecard-data";
import { directorTransactionError } from "../../../lib/director-transaction-error";
import { persistDirectorMatchLifecycle } from "../../../lib/scoring-persistence-adapter";
import { drainGoogleOutbox } from "../../../lib/scoring-google-outbox";
import { recalculateCompetitionDerivedTournament } from "../../../lib/competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "../../../lib/intelligence-derived-supabase.js";
import { recalculateCalcuttaAfterCanonicalMutation } from "../../../lib/calcutta-post-commit.js";
import { drainScorecardArchiveJobs } from "../../../lib/scorecard-archive-worker.js";
import { authorizePreviewDirector, productionDirectorEntitlementEnvironment } from "../../../lib/preview-director-authorization.js";
import { requireScoringAuthority } from "../../../lib/scoring-authority.js";
import { assertDirectorMutationAuthority } from "../../../lib/director-mutation-authority.js";
import { withProductionGoogleAuthorityWrite } from "../../../lib/production-cutover-scoring-ingress.js";
import { productionCutoverPhaseAtLeast } from "../../../lib/production-cutover-activation-contract.js";
import { certifyGoogleWorkbookMutationReadback, googleWorkbookMutationOutcome } from "../../../lib/google-workbook-mutation-intent.js";
import { assertScoringMutationAuthorityContractBeforeDispatch, currentScoringMutationAuthorityContract } from "../../../lib/scoring-mutation-authority-server.js";
import { readProductionCurrentTournamentRuntime } from "../../../lib/production-current-tournament-runtime.js";
import { readMatchAuthorizationMatrix } from "../../../lib/match-authorization-supabase.js";
import { productionLiveMatchAdminDataFromSupabaseView, readTournamentLiveView } from "../../../lib/tournament-live-supabase.js";

export const dynamic = "force-dynamic";

function authorizedGoogleRollback(request) {
  const secret = request.headers.get("x-live-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
}

async function authorized(request, authority) {
  const productionDirector = productionDirectorEntitlementEnvironment(process.env);
  if (productionDirector.enabled || productionDirector.failClosed) {
    return authorizePreviewDirector({ request, allowBootstrap: false });
  }
  if (authority.resolved === "google") {
    return authorizedGoogleRollback(request) ? { status: "active", identity: null } : { status: "denied" };
  }
  return authorizePreviewDirector({ request, allowBootstrap: true });
}

function deny() {
  return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
}

function refreshMatchData() {
  revalidateTag(GOOGLE_SHEETS_CACHE_TAG);
  invalidateScorecardAnalyticsCache();
  for (const path of ["/live", "/", "/history", "/players", "/records", "/champions"]) revalidatePath(path);
}

export async function GET(request) {
  let authority;
  try { authority = requireScoringAuthority(); }
  catch (error) { return NextResponse.json({ error: error.message, code: error.code }, { status: Number(error.status || 503) }); }
  const authorization = await authorized(request, authority);
  if (authorization?.status !== "active") return deny();
  try {
    let data;
    if (authority.resolved === "supabase" && process.env.VERCEL_ENV === "production") {
      const runtime = await readProductionCurrentTournamentRuntime({}, { env: process.env });
      if (runtime.tournamentId === "2026") data = await readLiveMatchAdminData();
      else {
        const [current, matchAuthorization] = await Promise.all([
          readTournamentLiveView(runtime.tournamentId, { env: process.env }),
          readMatchAuthorizationMatrix(runtime.tournamentId, { env: process.env }),
        ]);
        if (!current.payload?.ok) throw Object.assign(
          new Error("The current Production match scope is unavailable."),
          { code: current.payload?.code || "CURRENT_LIVE_MATCH_SCOPE_UNAVAILABLE", status: 503 },
        );
        if (!matchAuthorization.payload?.ok) throw Object.assign(
          new Error("The current Production match authorization scope is unavailable."),
          { code: matchAuthorization.payload?.code || "CURRENT_MATCH_AUTHORIZATION_SCOPE_UNAVAILABLE", status: 503 },
        );
        data = productionLiveMatchAdminDataFromSupabaseView(
          current.payload.data,
          matchAuthorization.payload,
        );
      }
    } else data = await readLiveMatchAdminData();
    const scoringAuthorityContract = await currentScoringMutationAuthorityContract({ request });
    return NextResponse.json({ data: {
      ...data,
      scoringAuthorityContract,
      matches: data.matches.map((match) => Object.fromEntries(
        Object.entries(match).filter(([key]) => !["Access Code Hash", "Access Token Hash"].includes(key))
      )),
    } });
  } catch (error) {
    console.error("Live Match Control load failed", { sheet: "Live Matches", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to load live matches." }, { status: 500 });
  }
}

export async function POST(request) {
  let authority;
  try { authority = requireScoringAuthority(); }
  catch (error) { return NextResponse.json({ error: error.message, code: error.code }, { status: Number(error.status || 503) }); }
  const authorization = await authorized(request, authority);
  if (authorization?.status !== "active") return deny();
  try {
    const { action, matchId, updates, updatedBy, operationRequestId, scoringAuthorityContract,
      expectedMatchRevision, expectedPermissionRevision } = await request.json();
    const mutationAuthority = assertDirectorMutationAuthority({ surface: "live-matches", action, authority: authority.resolved });
    await assertScoringMutationAuthorityContractBeforeDispatch(scoringAuthorityContract, { request });
    if (mutationAuthority.resolvedAuthority === "supabase") {
      if (!matchId || !mutationAuthority.canonicalLifecycleAction) {
        const error = new Error("A canonical match control action and Match ID are required.");
        error.code = "DIRECTOR_CANONICAL_LIFECYCLE_INPUT_REQUIRED";
        error.status = 400;
        throw error;
      }
      const lifecycle = await persistDirectorMatchLifecycle({
        action: mutationAuthority.canonicalLifecycleAction,
        matchId,
        updatedBy: authorization.identity?.actor?.name || updatedBy,
        authUserId: authorization.identity?.authUserId,
        playerId: authorization.identity?.actor?.id,
        operationRequestId,
        expectedMatchRevision,
        expectedPermissionRevision,
      });
      if (!lifecycle.delegated) throw Object.assign(
        new Error("The canonical Supabase match-control transaction was not selected."),
        { code: "SUPABASE_CANONICAL_LIFECYCLE_REQUIRED", status: 503 },
      );
      const productionWorkerPhase = process.env.VERCEL_ENV !== "production" ||
        productionCutoverPhaseAtLeast(process.env, "WORKERS");
      const mirror = productionWorkerPhase
        ? await drainGoogleOutbox({ maximum: 4, actor: authorization.identity?.actor?.name || updatedBy })
        : { ok: true, delivered: 0, failed: 0, pending: true };
      if (!mirror.ok) throw Object.assign(
        new Error("The canonical mutation committed, but Google mirror delivery remains pending."),
        { code: "GOOGLE_MIRROR_DELIVERY_PENDING", status: 503 },
      );
      refreshMatchData();
      if (["finalize", "reopen"].includes(mutationAuthority.canonicalLifecycleAction)) after(async () => {
        const [archive, derived, intelligence, calcutta] = await Promise.allSettled([
          productionWorkerPhase
            ? drainScorecardArchiveJobs({ maximum: 4, stopOnFailure: false })
            : Promise.resolve({ ok: true, deliveries: [], pending: true }),
          recalculateCompetitionDerivedTournament("", {
            calculatedBy: `Director lifecycle worker · ${authorization.identity?.actor?.name || updatedBy || "Director"}`,
          }),
          recalculateIntelligenceDerivedTournament("", {
            calculatedBy: `Director lifecycle intelligence worker · ${authorization.identity?.actor?.name || updatedBy || "Director"}`,
          }),
          recalculateCalcuttaAfterCanonicalMutation("", {
            calculatedBy: `Director lifecycle Calcutta worker · ${authorization.identity?.actor?.name || updatedBy || "Director"}`,
            mutationKey: operationRequestId,
            matchId,
          }),
        ]);
        for (const [domain, result] of [["archive", archive], ["competition", derived], ["intelligence", intelligence], ["calcutta", calcutta]]) {
          if (result.status === "rejected") console.error("Director lifecycle follow-up remains pending", {
            action, matchId, domain, code: result.reason?.code || "DIRECTOR_LIFECYCLE_FOLLOW_UP_FAILED",
          });
        }
      });
      return NextResponse.json({
        data: { match: lifecycle.result },
        transaction: { authority: "supabase", mirror: {
          delivered: mirror.delivered, failed: mirror.failed, pending: mirror.pending === true,
        } },
      });
    }
    const measured = await withProductionGoogleAuthorityWrite({
      tournamentId: "2026",
      matchId,
      actorId: updatedBy || "Tournament Director",
      operation: `LIVE_MATCHES:${String(action || "UNKNOWN")}`,
      operationRequestId,
      scoringAuthorityContract,
      request,
    }, () => withWorkbookWriteDiagnostics(`live-matches:${action}`, async () => {
      const beforeData = await readLiveMatchAdminData();
      const beforeMatch = beforeData.matches.find((item) => String(item["Match ID"] || "").trim() === String(matchId || "").trim()) || null;
      let match;
      let access;
      if (action === "update") match = await updateLiveMatch(matchId, updates, updatedBy);
      else if (action === "mark-live") match = await markLiveMatch(matchId, updatedBy);
      else if (action === "pairing") match = await updateLiveMatchPairing(matchId, updates, updatedBy);
      else if (action === "finalize") {
        const lifecycle = await persistDirectorMatchLifecycle({ action: "finalize", matchId, updatedBy, operationRequestId });
        if (!lifecycle.delegated) match = await finalizeLiveMatch(matchId, updates, updatedBy, { includeCalcuttaPublicationTrace: process.env.VERCEL_ENV === "preview" });
        else {
          const drained = await drainGoogleOutbox({ maximum: 4, actor: updatedBy });
          if (!drained.ok) throw new Error("Google mirror delivery must verify before completing this Director action.");
          match = lifecycle.result;
        }
      }
      else if (action === "reopen") {
        const lifecycle = await persistDirectorMatchLifecycle({ action: "reopen", matchId, updatedBy, operationRequestId });
        if (!lifecycle.delegated) match = await reopenLiveMatch(matchId, updatedBy);
        else {
          const drained = await drainGoogleOutbox({ maximum: 4, actor: updatedBy });
          if (!drained.ok) throw new Error("Google mirror delivery must verify before completing this Director action.");
          match = lifecycle.result;
        }
      }
      else if (action === "access-generate") {
        const generated = await generateLiveMatchAccess(matchId, updatedBy);
        const accessUrl = `${new URL(request.url).origin}/score/access/${encodeURIComponent(generated.token)}`;
        const qrDataUrl = await QRCode.toDataURL(accessUrl, { width: 420, margin: 2, color: { dark: "#0b4938", light: "#fffdf8" } });
        match = Object.fromEntries(Object.entries(generated.match).filter(([key]) => !["Access Code Hash", "Access Token Hash"].includes(key)));
        access = { code: generated.code, accessUrl, qrDataUrl, expiresAt: generated.expiresAt };
      }
      else if (action === "access-disable") match = await disableLiveMatchAccess(matchId, updatedBy);
      else throw new Error("Unknown live-match action.");
      if (googleWorkbookMutationOutcome().confirmedWrites > 0) {
        const verifiedData = await readLiveMatchAdminData();
        const verifiedMatch = verifiedData.matches.find((item) => String(item["Match ID"] || "").trim() === String(matchId || "").trim());
        const actionFields = {
          "mark-live": ["Match Status", "Updated At"],
          finalize: ["Match Status", "Scoring Locked", "Access Active", "Access Version", "Finalized At", "Team 1 Points", "Team 2 Points", "Matchup Winner"],
          reopen: ["Match Status", "Scoring Locked", "Access Active", "Access Version", "Finalized At", "Team 1 Points", "Team 2 Points", "Matchup Winner"],
          "access-generate": ["Access Active", "Access Version", "Access Expires At", "Updated At"],
          "access-disable": ["Access Active", "Access Version", "Updated At"],
        }[action] || [];
        const fields = [...new Set(["Match ID", ...actionFields, ...Object.keys(updates || {})])].sort();
        const projection = (record) => Object.fromEntries(fields.map((field) => [
          field,
          String(record?.[field] ?? "").trim(),
        ]));
        const expectedAfter = projection(match);
        const providerReadback = projection(verifiedMatch);
        if (!verifiedMatch || JSON.stringify(expectedAfter) !== JSON.stringify(providerReadback)) {
          const error = new Error("The Production match-control update did not verify from Google.");
          error.code = "PRODUCTION_LIVE_MATCH_GOOGLE_READBACK_MISMATCH";
          error.status = 503;
          throw error;
        }
        certifyGoogleWorkbookMutationReadback({
          proofType: "LIVE_MATCH_CONTROL",
          before: projection(beforeMatch),
          expectedAfter,
          providerReadback,
        });
      }
      return { match, ...(access ? { access } : {}) };
      }));
    const { match, access } = measured.result;
    refreshMatchData();
    console.info("Live Match Control transaction", { action, matchId, ...measured.diagnostics });
    if (process.env.VERCEL_ENV === "preview" && ["finalize", "reopen"].includes(action)) after(async () => {
      try {
        await Promise.all([
          drainScorecardArchiveJobs({ maximum: 4, stopOnFailure: false }),
          recalculateCompetitionDerivedTournament("", { calculatedBy: `Director lifecycle worker · ${updatedBy || "Director"}` }),
          recalculateIntelligenceDerivedTournament("", { calculatedBy: `Director lifecycle intelligence worker · ${updatedBy || "Director"}` }),
          recalculateCalcuttaAfterCanonicalMutation("", {
            calculatedBy: `Director lifecycle Calcutta worker · ${updatedBy || "Director"}`,
            mutationKey: operationRequestId,
            matchId,
          }),
        ]);
      } catch (error) {
        console.error("Competition derived-state Director lifecycle recalculation remains pending", {
          matchId, action, code: error?.code || "DERIVED_STATE_RECALCULATION_FAILED",
        });
      }
    });
    if (access) return NextResponse.json({ match, access });
    const calcuttaPublication = match?.__calcuttaPublication;
    const safeMatch = Object.fromEntries(Object.entries(match).filter(([key]) => !["Access Code Hash", "Access Token Hash", "__calcuttaPublication"].includes(key)));
    return NextResponse.json({ match: safeMatch, ...(process.env.VERCEL_ENV === "preview" && calcuttaPublication ? { calcuttaPublication } : {}) });
  } catch (error) {
    console.error("Live Match Control action failed", { sheet: "Live Matches / Matches / Match Update Log", reason: error?.message || String(error), stack: error?.stack });
    const authorityFailure = error?.code === "OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY" || error?.code === "SCORING_AUTHORITY_UNAVAILABLE";
    return NextResponse.json({
      error: authorityFailure ? error.message : directorTransactionError(error, "The match update could not be completed. Please try again."),
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.authorityDiagnostics ? { authority: error.authorityDiagnostics } : {}),
    }, { status: Number(error?.status || 400) });
  }
}
