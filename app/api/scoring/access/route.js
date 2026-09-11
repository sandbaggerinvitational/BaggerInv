import { NextResponse } from "next/server";
import { readParticipantMatchOptions } from "../../../../lib/google-sheets-write.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: await readParticipantMatchOptions() });
  } catch (error) {
    console.error("Participant match list failed", { sheet: "Live Matches", reason: error?.message || String(error) });
    return NextResponse.json({ error: "Unable to load active matches." }, { status: 500 });
  }
}
