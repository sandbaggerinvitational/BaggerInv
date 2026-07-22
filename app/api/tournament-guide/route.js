import { NextResponse } from "next/server";
import { deleteTournamentGuideRecord, readTournamentGuideAdminData, saveTournamentGuideRecord } from "../../../lib/google-sheets-write";

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = request.headers.get("x-guide-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
}

function deny() {
  return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
}

export async function GET(request) {
  if (!authorized(request)) return deny();
  try {
    return NextResponse.json({ data: await readTournamentGuideAdminData() });
  } catch (error) {
    console.error("Tournament Guide admin load failed", { sheet: "Guide tabs", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to load Tournament Guide content." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!authorized(request)) return deny();
  try {
    const { type, record } = await request.json();
    return NextResponse.json({ record: await saveTournamentGuideRecord(type, record) });
  } catch (error) {
    console.error("Tournament Guide save failed", { sheet: "Guide tabs", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to save Tournament Guide content." }, { status: 400 });
  }
}

export async function DELETE(request) {
  if (!authorized(request)) return deny();
  try {
    const { type, id } = await request.json();
    return NextResponse.json(await deleteTournamentGuideRecord(type, id));
  } catch (error) {
    console.error("Tournament Guide delete failed", { sheet: "Guide tabs", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to delete Tournament Guide content." }, { status: 400 });
  }
}
