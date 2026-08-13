import { revalidatePath, revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  disableLiveMatchAccess,
  finalizeLiveMatch,
  generateLiveMatchAccess,
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

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = request.headers.get("x-live-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
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
  if (!authorized(request)) return deny();
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
  if (!authorized(request)) return deny();
  try {
    const { action, matchId, updates, updatedBy } = await request.json();
    const measured = await withWorkbookWriteDiagnostics(`live-matches:${action}`, async () => {
      let match;
      if (action === "update") match = await updateLiveMatch(matchId, updates, updatedBy);
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
    const { match, access } = measured.result;
    refreshMatchData();
    console.info("Live Match Control transaction", { action, matchId, ...measured.diagnostics });
    if (process.env.VERCEL_ENV === "preview" && ["finalize", "reopen"].includes(action)) after(async () => {
      try {
        await Promise.all([
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
    return NextResponse.json({ error: directorTransactionError(error, "The match update could not be completed. Please try again.") }, { status: 400 });
  }
}
