import { NextResponse, after } from "next/server";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { readCanonicalDirectorOdds, mutateCanonicalDirectorOdds } from "../../../../lib/canonical-director-odds.js";
import { processOddsCalculationJob } from "../../../../lib/championship-odds-resilience.js";
import { withOperationalRoute, recordOperationalError } from "../../../../lib/operational-telemetry.js";
export const dynamic = "force-dynamic";
export const maxDuration = 800;
const headers = { "Cache-Control": "private, no-store" };
async function execute(request, write) {
  if (write) {
    let origin; try { origin = new URL(request.headers.get("origin")).origin; } catch { origin = ""; }
    if (origin !== new URL(request.url).origin) return NextResponse.json({ code: "DIRECTOR_ODDS_ORIGIN_REQUIRED" }, { status: 403, headers });
  }
  try {
    const authorization = await authorizePreviewDirector({ request, allowBootstrap: false });
    if (authorization?.status !== "active") return NextResponse.json({ code: "DIRECTOR_ODDS_AUTHORIZATION_REQUIRED" }, { status: authorization?.status === "unavailable" ? 503 : 403, headers });
    const input = write ? await request.json() : null;
    const result = write ? await mutateCanonicalDirectorOdds({ authorization, input }) :
      await readCanonicalDirectorOdds({ authorization, jobId: new URL(request.url).searchParams.get("job") });
    const resumable = write && result.accepted ? result.jobId : !write ? result.jobs.find(job =>
      ["PENDING", "RETRYABLE"].includes(job.status) || (job.status === "RUNNING" && Date.parse(job.lease_expires_at || "") < Date.now()))?.job_id : null;
    if (resumable) after(() => processOddsCalculationJob(resumable).catch(error => recordOperationalError(error)));
    return NextResponse.json(result, { headers, status: write && result.accepted ? 202 : 200 });
  } catch (error) {
    recordOperationalError(error);
    return NextResponse.json({ code: /^[A-Z_]{3,100}$/.test(error?.code || "") ? error.code : "DIRECTOR_ODDS_UNAVAILABLE",
      error: "The Odds operation could not be confirmed. Refresh or retry the same completed calculation.",
      ...(error?.committed ? { committed: true, jobId: error.jobId, recovery: "RETRY_SAME_CALCULATION" } : {}) },
    { status: [400,403,409].includes(error?.status) ? error.status : 503, headers });
  }
}
export const GET = withOperationalRoute({ route: "/api/director/canonical-odds", domain: "ODDS" }, request => execute(request, false));
export const POST = withOperationalRoute({ route: "/api/director/canonical-odds", domain: "ODDS" }, request => execute(request, true));
