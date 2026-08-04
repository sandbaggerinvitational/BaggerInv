import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getTournamentData } from "../../../live/sheetData.js";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";
import { GOOGLE_SHEETS_CACHE_TAG } from "../../../../lib/google-sheets-data.js";
import { resetPreviewTournament } from "../../../../lib/google-sheets-write.js";

export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return unavailable();
  const authorization = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  if (authorization.status === "unavailable") {
    return NextResponse.json({ error: "Tournament Director identity could not be verified right now. Retry." }, { status: 503, headers: { "Retry-After": "1" } });
  }
  if (authorization.status !== "active") {
    return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
  }
  try {
    const data = await getTournamentData();
    const result = await resetPreviewTournament(data.tournament.id, authorization.identity.actor.name);
    revalidateTag(GOOGLE_SHEETS_CACHE_TAG);
    for (const path of ["/admin/director", "/home", "/live", "/my-match", "/leaderboards"]) revalidatePath(path);
    return NextResponse.json({
      ok: true,
      message: "Preview Tournament Reset Complete",
      detail: "Ready for Dress Rehearsal.",
      result,
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Preview tournament reset failed." }, { status: 400 });
  }
}
