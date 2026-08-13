import { NextResponse } from "next/server";

import { assertGuideSyncEnvironment, guideWorkerAuthorized } from "../../../../../lib/guide-read-source.js";
import { readGuideSourceContext } from "../../../../../lib/guide-supabase.js";
import { buildGuideProjection, GUIDE_PROJECTION_SHEETS } from "../../../../../lib/tournament-guide-projection.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const unavailable = () => NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function canonicalSource(payload = {}) {
  const data = payload.data || payload;
  const tournament = data.tournament || {};
  return {
    tournament: {
      id: clean(tournament.tournament_id || tournament.id),
      year: number(tournament.tournament_year || tournament.year),
      name: clean(tournament.name),
      dates: clean(tournament.dates),
      location: clean(tournament.location),
      timeZone: clean(tournament.time_zone || tournament.timeZone),
      logoFileName: clean(tournament.logo_filename || tournament.logoFileName),
    },
    courses: (data.course_context || data.courses || []).map((context) => ({
      courseId: clean(context.course_id || context.courseId),
      round: number(context.round_number || context.round),
      format: clean(context.format),
      tee: clean(context.tee),
      rating: context.rating ?? "",
      slope: context.slope ?? "",
      par: context.par ?? "",
      yardage: context.yardage ?? "",
      configurationConsistent: context.configuration_consistent !== false,
      rounds: context.rounds || [],
      holes: context.holes || [],
    })),
  };
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return unavailable();
  try { assertGuideSyncEnvironment({ triggerType: "SCHEDULED" }); }
  catch { return unavailable(); }
  if (!guideWorkerAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "GUIDE_WORKER_UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const [{ readWorkbookSheetsByName }, contextRead] = await Promise.all([
      import("../../../../../lib/google-sheets-write.js"),
      readGuideSourceContext(),
    ]);
    if (!contextRead?.payload?.ok) throw new Error("GUIDE_SOURCE_CONTEXT_UNAVAILABLE");
    const google = await readWorkbookSheetsByName(GUIDE_PROJECTION_SHEETS, { fresh: true });
    const sheets = Object.fromEntries(GUIDE_PROJECTION_SHEETS.map((name) => [
      name,
      (google?.[name]?.records || []).map((row) => row?.record || row).filter(Boolean),
    ]));
    const canonical = canonicalSource(contextRead.payload);
    try {
      const projection = buildGuideProjection({
        sheets,
        tournament: canonical.tournament,
        approvedTournamentId: "2026",
        canonicalCourseContext: canonical.courses,
      });
      return NextResponse.json({ ok: true, validationIssueCount: 0, sourceCounts: projection.sourceCounts }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        code: "GUIDE_PROJECTION_INVALID",
        validationIssueCount: Array.isArray(error?.issues) ? error.issues.length : 0,
        validationIssues: Array.isArray(error?.issues) ? error.issues : [],
      }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
    }
  } catch {
    return NextResponse.json({ ok: false, code: "GUIDE_DIAGNOSTICS_UNAVAILABLE" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
