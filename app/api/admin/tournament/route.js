import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { readTournamentAdminData, updateTournamentAdminData } from "../../../../lib/google-sheets-write";
import { GOOGLE_SHEETS_CACHE_TAG } from "../../../../lib/google-sheets-data";
import { invalidateScorecardAnalyticsCache } from "../../../../lib/scorecard-data";
import { directorTransactionError } from "../../../../lib/director-transaction-error";
import { assertDirectorMutationAuthority } from "../../../../lib/director-mutation-authority.js";
import { withProductionGoogleAuthorityWrite } from "../../../../lib/production-cutover-scoring-ingress.js";
import { getTournamentData } from "../../../live/sheetData.js";
import { certifyGoogleWorkbookMutationReadback } from "../../../../lib/google-workbook-mutation-intent.js";
import { currentScoringMutationAuthorityContract } from "../../../../lib/scoring-mutation-authority-server.js";

export const dynamic = "force-dynamic";
function authorized(request) {
  const secret = request.headers.get("x-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
}
const deny = () => NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
const retiredProductionHumanAdmin = () => process.env.VERCEL_ENV === "production"
  ? NextResponse.json({ error: "Not found." }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    })
  : null;

export async function GET(request) {
  const retired = retiredProductionHumanAdmin();
  if (retired) return retired;
  if (!authorized(request)) return deny();
  try { return NextResponse.json({
    ...await readTournamentAdminData(new URL(request.url).searchParams.get("tournament")),
    scoringAuthorityContract: await currentScoringMutationAuthorityContract({ request }),
  }); }
  catch (error) {
    console.error("Tournament admin load failed", { sheet: "Tournaments", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to load tournament settings." }, { status: 400 });
  }
}

export async function POST(request) {
  const retired = retiredProductionHumanAdmin();
  if (retired) return retired;
  if (!authorized(request)) return deny();
  try {
    assertDirectorMutationAuthority({ surface: "director", action: "tournament-admin-update" });
    const { tournament, updates, updatedBy, operationRequestId, scoringAuthorityContract } = await request.json();
    const data = await getTournamentData();
    const representativeMatchId = data.rounds?.flatMap((round) => round.matches || [])[0]?.id || "";
    const result = await withProductionGoogleAuthorityWrite({
      tournamentId: data.tournament?.id,
      matchId: representativeMatchId,
      actorId: updatedBy || "Tournament Director",
      operation: "ADMIN_TOURNAMENT:UPDATE",
      operationRequestId,
      scoringAuthorityContract,
      request,
    }, async () => {
      const before = await readTournamentAdminData(tournament);
      const updated = await updateTournamentAdminData(tournament, updates, updatedBy);
      const verified = await readTournamentAdminData(tournament);
      const fields = Object.keys(updates || {}).sort();
      const projection = (record) => Object.fromEntries(fields.map((field) => [
        field,
        String(record?.[field] ?? "").trim(),
      ]));
      const expectedAfter = projection(updated.record);
      const providerReadback = projection(verified.record);
      if (JSON.stringify(expectedAfter) !== JSON.stringify(providerReadback)) {
        const error = new Error("The Production tournament update did not verify from Google.");
        error.code = "PRODUCTION_TOURNAMENT_GOOGLE_READBACK_MISMATCH";
        error.status = 503;
        throw error;
      }
      certifyGoogleWorkbookMutationReadback({
        proofType: "CURRENT_TOURNAMENT_UPDATE",
        before: projection(before.record),
        expectedAfter,
        providerReadback,
      });
      return updated;
    });
    revalidateTag(GOOGLE_SHEETS_CACHE_TAG);
    invalidateScorecardAnalyticsCache();
    for (const path of ["/", "/admin", "/history", "/tournament-guide", "/live"]) revalidatePath(path);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tournament admin save failed", { sheet: "Tournaments", reason: error?.message || String(error), stack: error?.stack });
    const authorityFailure = error?.code === "OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY" || error?.code === "SCORING_AUTHORITY_UNAVAILABLE";
    return NextResponse.json({ error: authorityFailure ? error.message : directorTransactionError(error),
      ...(error?.code ? { code: error.code } : {}) }, { status: Number(error?.status || 400) });
  }
}
