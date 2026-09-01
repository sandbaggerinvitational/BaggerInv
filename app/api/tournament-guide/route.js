import { NextResponse } from "next/server";
import { directorTransactionError } from "../../../lib/director-transaction-error";
import { withProductionGoogleAuthoringWrite } from "../../../lib/production-google-authoring.js";
import { GOOGLE_AUTHORING_OPERATIONS } from "../../../lib/google-workbook-mutation-intent.js";

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = request.headers.get("x-guide-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
}

function deny() {
  return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
}

function retiredProductionGuide() {
  if (String(process.env.VERCEL_ENV || "").trim().toLowerCase() !== "production") return null;
  return NextResponse.json({
    error: "Production Tournament Guide content is managed in the Director Console.",
    code: "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED",
  }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}

async function legacyPreviewGuideRuntime() {
  return import("../../../lib/google-sheets-write");
}

export async function GET(request) {
  const retired = retiredProductionGuide();
  if (retired) return retired;
  if (!authorized(request)) return deny();
  try {
    const { readTournamentGuideAdminData } = await legacyPreviewGuideRuntime();
    return NextResponse.json({ data: await readTournamentGuideAdminData() });
  } catch (error) {
    console.error("Tournament Guide admin load failed", { sheet: "Guide tabs", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to load Tournament Guide content." }, { status: 500 });
  }
}

export async function POST(request) {
  const retired = retiredProductionGuide();
  if (retired) return retired;
  if (!authorized(request)) return deny();
  try {
    const { saveTournamentGuideRecord } = await legacyPreviewGuideRuntime();
    const { type, record, updatedBy } = await request.json();
    const saved = await withProductionGoogleAuthoringWrite({
      request,
      operation: GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE,
    }, () => saveTournamentGuideRecord(type, record, updatedBy));
    return NextResponse.json({ record: saved });
  } catch (error) {
    console.error("Tournament Guide save failed", { sheet: "Guide tabs", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: directorTransactionError(error) }, { status: 400 });
  }
}

export async function DELETE(request) {
  const retired = retiredProductionGuide();
  if (retired) return retired;
  if (!authorized(request)) return deny();
  try {
    const { deleteTournamentGuideRecord } = await legacyPreviewGuideRuntime();
    const { type, id, updatedBy } = await request.json();
    return NextResponse.json(await withProductionGoogleAuthoringWrite({
      request,
      operation: GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE,
    }, () => deleteTournamentGuideRecord(type, id, updatedBy)));
  } catch (error) {
    console.error("Tournament Guide delete failed", { sheet: "Guide tabs", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: directorTransactionError(error) }, { status: 400 });
  }
}
