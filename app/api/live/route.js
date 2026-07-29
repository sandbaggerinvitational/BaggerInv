import { NextResponse } from "next/server";
import { getTournamentData } from "../../live/sheetData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: await getTournamentData() });
  } catch (error) {
    console.error("Public live refresh failed", { reason: error?.message || String(error) });
    return NextResponse.json({ error: "Unable to refresh live scores." }, { status: 503 });
  }
}
