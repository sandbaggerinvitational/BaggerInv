import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getTournamentData, invalidateTournamentDataCache } from "../../../live/sheetData.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { GOOGLE_SHEETS_CACHE_TAG } from "../../../../lib/google-sheets-data.js";
import { resetPreviewTournament } from "../../../../lib/google-sheets-write.js";
import { initializeParticipantTournament, invalidateParticipantInitialization } from "../../../../lib/participant-initialization.js";
import { directorTransactionError } from "../../../../lib/director-transaction-error.js";

export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404 });

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return unavailable();
  const authorization = await authorizePreviewDirector({ request, allowBootstrap: true });
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
    invalidateTournamentDataCache();
    const session = authorization.identity.session;
    invalidateParticipantInitialization(session.type === "player-passport" ? session : null);
    if (session.type === "player-passport") await initializeParticipantTournament(session);
    return NextResponse.json({
      ok: true,
      message: "Preview Tournament Reset Complete",
      detail: "Ready for Dress Rehearsal.",
      result,
    });
  } catch (error) {
    return NextResponse.json({ error: directorTransactionError(error, "Preview tournament reset could not be completed. Please try again.") }, { status: 400 });
  }
}
