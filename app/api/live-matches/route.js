import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  disableLiveMatchAccess,
  finalizeLiveMatch,
  generateLiveMatchAccess,
  readLiveMatchAdminData,
  reopenLiveMatch,
  updateLiveMatch,
  updateLiveMatchPairing,
} from "../../../lib/google-sheets-write";
import { GOOGLE_SHEETS_CACHE_TAG } from "../../../lib/google-sheets-data";
import { invalidateScorecardAnalyticsCache } from "../../../lib/scorecard-data";
import { directorTransactionError } from "../../../lib/director-transaction-error";

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
    let match;
    let access;
    if (action === "update") match = await updateLiveMatch(matchId, updates, updatedBy);
    else if (action === "pairing") match = await updateLiveMatchPairing(matchId, updates, updatedBy);
    else if (action === "finalize") match = await finalizeLiveMatch(matchId, updates, updatedBy, { includeCalcuttaPublicationTrace: process.env.VERCEL_ENV === "preview" });
    else if (action === "reopen") match = await reopenLiveMatch(matchId, updatedBy);
    else if (action === "access-generate") {
      access = await generateLiveMatchAccess(matchId, updatedBy);
      const accessUrl = `${new URL(request.url).origin}/score/access/${encodeURIComponent(access.token)}`;
      const qrDataUrl = await QRCode.toDataURL(accessUrl, { width: 420, margin: 2, color: { dark: "#0b4938", light: "#fffdf8" } });
      match = Object.fromEntries(Object.entries(access.match).filter(([key]) => !["Access Code Hash", "Access Token Hash"].includes(key)));
      refreshMatchData();
      return NextResponse.json({ match, access: { code: access.code, accessUrl, qrDataUrl, expiresAt: access.expiresAt } });
    }
    else if (action === "access-disable") match = await disableLiveMatchAccess(matchId, updatedBy);
    else throw new Error("Unknown live-match action.");
    refreshMatchData();
    const calcuttaPublication = match?.__calcuttaPublication;
    const safeMatch = Object.fromEntries(Object.entries(match).filter(([key]) => !["Access Code Hash", "Access Token Hash", "__calcuttaPublication"].includes(key)));
    return NextResponse.json({ match: safeMatch, ...(process.env.VERCEL_ENV === "preview" && calcuttaPublication ? { calcuttaPublication } : {}) });
  } catch (error) {
    console.error("Live Match Control action failed", { sheet: "Live Matches / Matches / Match Update Log", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: directorTransactionError(error, "The match update could not be completed. Please try again.") }, { status: 400 });
  }
}
