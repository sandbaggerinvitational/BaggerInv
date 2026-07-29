import { NextResponse } from "next/server";
import { getGameCenterData } from "../../../game-center/gameCenterData.js";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const { matchId } = await params;
    return NextResponse.json(
      { data: await getGameCenterData(matchId) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = error?.digest === "NEXT_NOT_FOUND" ? 404 : 503;
    return NextResponse.json(
      { error: status === 404 ? "That match could not be found." : "Game Center is temporarily unavailable." },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
