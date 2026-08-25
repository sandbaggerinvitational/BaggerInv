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
import { recalculateCalcuttaTournament } from "../../../lib/calcutta-supabase.js";
import { drainScorecardArchiveJobs } from "../../../lib/scorecard-archive-worker.js";
import { authorizePreviewDirector, productionDirectorEntitlementEnvironment } from "../../../lib/preview-director-authorization.js";
import { requireScoringAuthority } from "../../../lib/scoring-authority.js";
import { assertDirectorMutationAuthority } from "../../../lib/director-mutation-authority.js";
import {
  beginProductionGoogleAuthorityWrite,
  completeProductionGoogleAuthorityWrite,
} from "../../../lib/production-cutover-scoring-ingress.js";
import { productionCutoverPhaseAtLeast } from "../../../lib/production-cutover-activation-contract.js";

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
    const data = await readLiveMatchAdminData();
    return NextResponse.json({ data: {
      ...data,
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
    const { action, matchId, updates, updatedBy } = await request.json();
    const mutationAuthority = assertDirectorMutationAuthority({ surface: "live-matches", action, authority: authority.resolved });
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
          recalculateCalcuttaTournament("", {
            calculatedBy: `Director lifecycle Calcutta worker · ${authorization.identity?.actor?.name || updatedBy || "Director"}`,
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
    const productionIngressLease = authority.resolved === "google"
      ? await beginProductionGoogleAuthorityWrite({
          tournamentId: "2026",
          matchId,
          actorId: updatedBy || "Tournament Director",
          operation: `LIVE_MATCHES:${String(action || "UNKNOWN")}`,
        })
      : { enabled: false };
    let measured;
    try {
      measured = await withWorkbookWriteDiagnostics(`live-matches:${action}`, async () => {
      let match;
      if (action === "update") match = await updateLiveMatch(matchId, updates, updatedBy);
      else if (action === "mark-live") match = await markLiveMatch(matchId, updatedBy);
      else if (action === "pairing") match = await updateLiveMatchPairing(matchId, updates, updatedBy);
      else if (action === "finalize") {
        const lifecycle = await persistDirectorMatchLifecycle({ action: "finalize", matchId, updatedBy });
        if (!lifecycle.delegated) match = await finalizeLiveMatch(matchId, updates, updatedBy, { includeCalcuttaPublicationTrace: process.env.VERCEL_ENV === "preview" });
        else {
          const drained = await drainGoogleOutbox({ maximum: 4, actor: updatedBy });
          if (!drained.ok) throw new Error("Google mirror delivery must verify before completing this Director action.");
          match = lifecycle.result;
        }
      }
      else if (action === "reopen") {
        const lifecycle = await persistDirectorMatchLifecycle({ action: "reopen", matchId, updatedBy });
        if (!lifecycle.delegated) match = await reopenLiveMatch(matchId, updatedBy);
        else {
          const drained = await drainGoogleOutbox({ maximum: 4, actor: updatedBy });
          if (!drained.ok) throw new Error("Google mirror delivery must verify before completing this Director action.");
          match = lifecycle.result;
        }
      }
      else if (action === "access-generate") {
        const access = await generateLiveMatchAccess(matchId, updatedBy);
        const accessUrl = `${new URL(request.url).origin}/score/access/${encodeURIComponent(access.token)}`;
        const qrDataUrl = await QRCode.toDataURL(accessUrl, { width: 420, margin: 2, color: { dark: "#0b4938", light: "#fffdf8" } });
        match = Object.fromEntries(Object.entries(access.match).filter(([key]) => !["Access Code Hash", "Access Token Hash"].includes(key)));
        return { match, access: { code: access.code, accessUrl, qrDataUrl, expiresAt: access.expiresAt } };
      }
      else if (action === "access-disable") match = await disableLiveMatchAccess(matchId, updatedBy);
      else throw new Error("Unknown live-match action.");
      return { match };
      });
    } finally {
      try { await completeProductionGoogleAuthorityWrite(productionIngressLease); }
      catch (error) {
        console.error("Production Live Matches ingress lease completion remains pending", {
          action,
          code: error?.code || "PRODUCTION_GOOGLE_INGRESS_LEASE_COMPLETION_FAILED",
        });
      }
    }
    const { match, access } = measured.result;
    refreshMatchData();
    console.info("Live Match Control transaction", { action, matchId, ...measured.diagnostics });
    if (process.env.VERCEL_ENV === "preview" && ["finalize", "reopen"].includes(action)) after(async () => {
      try {
        await Promise.all([
          drainScorecardArchiveJobs({ maximum: 4, stopOnFailure: false }),
          recalculateCompetitionDerivedTournament("", { calculatedBy: `Director lifecycle worker · ${updatedBy || "Director"}` }),
          recalculateIntelligenceDerivedTournament("", { calculatedBy: `Director lifecycle intelligence worker · ${updatedBy || "Director"}` }),
          recalculateCalcuttaTournament("", { calculatedBy: `Director lifecycle Calcutta worker · ${updatedBy || "Director"}` }),
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
