import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  archiveCmsRecord,
  deleteCmsRecord,
  readAdminAuditLog,
  readAdminDashboard,
  readAdminStandings,
  readCmsResource,
  reorderCmsRecord,
  saveCmsRecord,
  withWorkbookWriteDiagnostics,
} from "../../../../lib/google-sheets-write";
import { GOOGLE_SHEETS_CACHE_TAG } from "../../../../lib/google-sheets-data";
import { invalidateScorecardAnalyticsCache } from "../../../../lib/scorecard-data";
import { assertValidTournamentId } from "../../../../lib/tournament-identifiers";
import { directorTransactionError } from "../../../../lib/director-transaction-error";
import {
  shouldSynchronizeDraftAfterWrite,
  synchronizeDraftProjection,
} from "../../../../lib/draft-synchronization";

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = request.headers.get("x-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
  return Boolean(secret) && allowed.includes(secret);
}

const deny = () => NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
const filtersFrom = (source) => ({ tournament: source.get("tournament") || "", year: source.get("year") || "" });
const saveTransactions = globalThis.__sbiCmsSaveTransactions || new Map();
globalThis.__sbiCmsSaveTransactions = saveTransactions;
const REVALIDATED_PATHS = ["/", "/admin", "/players", "/live", "/history", "/champions", "/courses", "/draft", "/tournament-guide"];
const MATCH_REVALIDATED_PATHS = ["/home", "/admin", "/players", "/live"];

export async function GET(request) {
  if (!authorized(request)) return deny();
  const query = new URL(request.url).searchParams;
  const resource = query.get("resource");
  const filters = filtersFrom(query);
  try {
    if (filters.tournament) assertValidTournamentId(filters.tournament);
    if (resource === "dashboard") return NextResponse.json({ data: await readAdminDashboard(filters) });
    if (resource === "standings") return NextResponse.json({ data: await readAdminStandings(filters) });
    if (resource === "audit") return NextResponse.json({ data: await readAdminAuditLog(query.get("limit")) });
    return NextResponse.json({ data: await readCmsResource(resource, filters) });
  } catch (error) {
    console.error("Admin CMS load failed", { resource, filters, reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to load Admin Center data." }, { status: 400 });
  }
}

export async function POST(request) {
  if (!authorized(request)) return deny();
  let body = {};
  try {
    body = await request.json();
    const { resource, action = "save", key, record, tournament, year, updatedBy, direction } = body;
    const transactionId = String(request.headers.get("x-save-transaction-id") || body.transactionId || "").trim();
    const filters = { tournament: String(tournament || ""), year: String(year || "") };
    if (filters.tournament) assertValidTournamentId(filters.tournament);
    const execute = async () => {
      const measured = await withWorkbookWriteDiagnostics(`cms:${resource}:${action}`, async () => {
        if (action === "save") return saveCmsRecord(resource, record, { key, ...filters, updatedBy });
        if (action === "archive") return archiveCmsRecord(resource, key, updatedBy);
        if (action === "delete") return deleteCmsRecord(resource, key, updatedBy);
        if (action === "reorder") return reorderCmsRecord(resource, key, direction, filters, updatedBy);
        throw new Error("Unknown Admin Center action.");
      });
      const draftProjection = ["draft-settings", "draft-picks"].includes(resource)
        && shouldSynchronizeDraftAfterWrite()
        ? await synchronizeDraftProjection({
            actorId: String(updatedBy || "Tournament Director"),
            correctionReason: String(body.correctionReason || ""),
          })
        : null;
      const revalidatedPaths = resource === "matches" ? MATCH_REVALIDATED_PATHS : REVALIDATED_PATHS;
      revalidateTag(GOOGLE_SHEETS_CACHE_TAG);
      invalidateScorecardAnalyticsCache();
      for (const path of revalidatedPaths) revalidatePath(path);
      return {
        data: measured.result,
        ...(draftProjection ? { draftProjection: {
          changed: draftProjection.changed,
          changedCount: draftProjection.changedCount,
          duplicateCount: draftProjection.duplicateCount,
          revisions: draftProjection.results,
          freshness: draftProjection.freshness,
        } } : {}),
        diagnostics: {
          transactionId,
          incomingHttpRequests: 1,
          ...measured.diagnostics,
          duplicateSubmissions: 0,
          cacheInvalidations: 2 + revalidatedPaths.length,
          downstreamOperations: { scorecardAnalyticsCache: 1, pageRevalidations: revalidatedPaths.length },
        },
      };
    };
    let result;
    const existing = transactionId ? saveTransactions.get(transactionId) : null;
    if (existing) {
      result = await existing;
      result = { ...result, diagnostics: { ...result.diagnostics, duplicateSubmissions: result.diagnostics.duplicateSubmissions + 1 } };
    } else {
      const pending = execute();
      if (transactionId) {
        saveTransactions.set(transactionId, pending);
        setTimeout(() => saveTransactions.delete(transactionId), 30_000).unref?.();
      }
      result = await pending;
    }
    console.info("Admin CMS save transaction", { resource, action, key, ...result.diagnostics });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Admin CMS save failed", {
      resource: body.resource,
      action: body.action,
      key: body.key,
      transactionId: body.transactionId || "",
      ...(error?.workbookDiagnostics || {}),
      reason: error?.message || String(error),
      stack: error?.stack,
    });
    return NextResponse.json({ error: directorTransactionError(error) }, { status: 400 });
  }
}
