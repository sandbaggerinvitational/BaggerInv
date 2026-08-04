import { NextResponse } from "next/server";
import { readOddsSnapshots } from "../../../../lib/google-sheets-write";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    return NextResponse.json({ error: "A valid tournament year is required." }, { status: 400 });
  }
  const snapshots = (await readOddsSnapshots())
    .filter((snapshot) => Number(snapshot.year) === year)
    .sort((left, right) => Number(left.phaseOrder || 0) - Number(right.phaseOrder || 0));
  return NextResponse.json({ snapshots }, { headers: { "Cache-Control": "no-store" } });
}
