import { after, NextResponse } from "next/server";

import {
  certifyOddsCalculationReference,
  processOddsCalculationJob,
  publicOddsCalculationJob,
  readOddsCalculationJobs,
  readPublishableOddsCalculation,
  requestCanonicalOddsCalculation,
} from "../../../../lib/championship-odds-resilience.js";
import { oddsCalculationEnvironment } from "../../../../lib/odds-calculation-source.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { ODDS_PHASES, ODDS_SUPPORTED_ITERATION_COUNTS } from "../../../../lib/tournament-odds.js";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const clean = (value) => String(value ?? "").trim();

async function directorFor(request) {
  const director = await authorizePreviewDirector({ request, allowBootstrap: true });
  return director?.status === "active" ? director : null;
}

function previewGate() {
  const source = oddsCalculationEnvironment();
  return process.env.VERCEL_ENV === "preview" && source.inputSource === "supabase" ? source : null;
}

async function continueCalculation(jobId, { failureAt = "" } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await processOddsCalculationJob(jobId, { failureAt: attempt === 0 ? failureAt : "" });
      if (result.completed || result.inProgress) return result;
    } catch (error) {
      lastError = error;
      console.error("Championship Odds durable worker attempt stopped safely", {
        jobId,
        attempt: attempt + 1,
        code: error?.code || "ODDS_CALCULATION_FAILED",
        checkpoint: error?.jobFailure || null,
      });
    }
  }
  if (lastError) throw lastError;
  return null;
}

export async function GET(request) {
  const source = previewGate();
  if (!source) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  const url = new URL(request.url);
  const jobId = clean(url.searchParams.get("job"));
  const tournamentId = clean(url.searchParams.get("tournament")) || clean(director.identity?.tournamentId) || "2026";
  try {
    const state = await readOddsCalculationJobs(tournamentId, jobId || null);
    if (!state.payload?.ok) throw Object.assign(new Error("Calculation state is unavailable."), { code: state.payload?.code });
    let jobs = state.payload.jobs || [];
    if (jobId && jobs[0]?.status === "SUCCEEDED" && jobs[0]?.publication_status !== "PUBLISHED") {
      try { await readPublishableOddsCalculation({ tournamentId, jobId }); }
      catch (error) { if (error?.code !== "ODDS_CALCULATION_STALE") throw error; }
      const refreshed = await readOddsCalculationJobs(tournamentId, jobId);
      jobs = refreshed.payload?.jobs || jobs;
    }
    const leaseExpired = jobs[0]?.status === "RUNNING" && Date.parse(jobs[0]?.lease_expires_at || "") <= Date.now();
    if (jobId && (["PENDING", "RETRYABLE"].includes(jobs[0]?.status) || leaseExpired)) after(() => continueCalculation(jobId).catch(() => null));
    return NextResponse.json({ ok: true, source: { requested: source.requestedInputs, resolved: source.inputSource },
      jobs: jobs.map(publicOddsCalculationJob), checkpoints: state.payload.checkpoints || [] });
  } catch (error) {
    return NextResponse.json({ error: "Championship calculation status is unavailable.", code: error?.code || "ODDS_CALCULATION_STATUS_FAILED" }, { status: 503 });
  }
}

export async function POST(request) {
  const source = previewGate();
  if (!source) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  try {
    const input = await request.json();
    const action = clean(input.action || "request").toLowerCase();
    const tournamentId = clean(director.identity?.tournamentId) || "2026";
    if (action === "certify") {
      const jobId = clean(input.jobId);
      if (!/^[0-9a-f]{64}$/.test(jobId)) return NextResponse.json({ error: "A valid calculation job is required." }, { status: 400 });
      const certification = await certifyOddsCalculationReference({ tournamentId, jobId });
      return NextResponse.json({ ...certification, source: { requested: source.requestedInputs, resolved: source.inputSource }, publicationCreated: false });
    }
    if (action === "retry") {
      const jobId = clean(input.jobId);
      if (!/^[0-9a-f]{64}$/.test(jobId)) return NextResponse.json({ error: "A valid calculation job is required." }, { status: 400 });
      after(() => continueCalculation(jobId).catch(() => null));
      return NextResponse.json({ ok: true, accepted: true, jobId }, { status: 202 });
    }
    if (action !== "request") return NextResponse.json({ error: "Unsupported calculation operation." }, { status: 400 });
    const phase = clean(input.phase);
    const iterations = Number(input.iterations);
    const rehearsalFailure = input.rehearsal === true ? clean(input.failureAt).toUpperCase() : "";
    const allowedFailures = ["", "BEFORE_FIRST_CHUNK", "AFTER_CHECKPOINT", "MID_CALCULATION", "AFTER_FINAL_CHECKPOINT", "AFTER_RESULT_COMMIT"];
    if (!allowedFailures.includes(rehearsalFailure)) return NextResponse.json({ error: "Unsupported rehearsal failure boundary." }, { status: 400 });
    if (!ODDS_PHASES.includes(phase) || !ODDS_SUPPORTED_ITERATION_COUNTS.includes(iterations)) {
      return NextResponse.json({ error: "A supported milestone and iteration count are required." }, { status: 400 });
    }
    const actorId = clean(director.identity?.player?.id) || "Tournament Director";
    const requested = await requestCanonicalOddsCalculation({ tournamentId, phase, iterations, requestedBy: actorId });
    const jobId = requested.invocation.job_id;
    after(() => continueCalculation(jobId, { failureAt: rehearsalFailure }).catch(() => null));
    return NextResponse.json({ ok: true, accepted: true, duplicate: requested.requested.duplicate === true,
      jobId, job: publicOddsCalculationJob(requested.requested.job),
      source: { requested: source.requestedInputs, resolved: source.inputSource },
      rehearsal: Boolean(rehearsalFailure), failureBoundary: rehearsalFailure || null,
    }, { status: 202 });
  } catch (error) {
    console.error("Championship Odds calculation request failed", { code: error?.code || "ODDS_CALCULATION_REQUEST_FAILED", message: error?.message || String(error) });
    return NextResponse.json({ error: "Championship calculation could not be requested.", code: error?.code || "ODDS_CALCULATION_REQUEST_FAILED" }, { status: 503 });
  }
}
