import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { readTournamentAdminData, updateTournamentAdminData } from "../../../../lib/google-sheets-write";

export const dynamic = "force-dynamic";
function authorized(request) {
  const secret = request.headers.get("x-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
}
const deny = () => NextResponse.json({ error: "Invalid admin password." }, { status: 401 });

export async function GET(request) {
  if (!authorized(request)) return deny();
  try { return NextResponse.json(await readTournamentAdminData(new URL(request.url).searchParams.get("tournament"))); }
  catch (error) {
    console.error("Tournament admin load failed", { sheet: "Tournaments", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to load tournament settings." }, { status: 400 });
  }
}

export async function POST(request) {
  if (!authorized(request)) return deny();
  try {
    const { tournament, updates, updatedBy } = await request.json();
    const result = await updateTournamentAdminData(tournament, updates, updatedBy);
    for (const path of ["/", "/admin", "/history", "/tournament-guide", "/live"]) revalidatePath(path);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tournament admin save failed", { sheet: "Tournaments", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to save tournament settings." }, { status: 400 });
  }
}
