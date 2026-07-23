import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  finalizeLiveMatch,
  readLiveMatchAdminData,
  reopenLiveMatch,
  updateLiveMatch,
  updateLiveMatchPairing,
} from "../../../lib/google-sheets-write";

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
  for (const path of ["/live", "/", "/history", "/players", "/records", "/champions"]) revalidatePath(path);
}

export async function GET(request) {
  if (!authorized(request)) return deny();
  try {
    return NextResponse.json({ data: await readLiveMatchAdminData() });
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
    if (action === "update") match = await updateLiveMatch(matchId, updates, updatedBy);
    else if (action === "pairing") match = await updateLiveMatchPairing(matchId, updates, updatedBy);
    else if (action === "finalize") match = await finalizeLiveMatch(matchId, updates, updatedBy);
    else if (action === "reopen") match = await reopenLiveMatch(matchId, updatedBy);
    else throw new Error("Unknown live-match action.");
    refreshMatchData();
    return NextResponse.json({ match });
  } catch (error) {
    console.error("Live Match Control action failed", { sheet: "Live Matches / Matches / Match Update Log", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to update the match." }, { status: 400 });
  }
}
