import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";

import { publicOddsCalculationJob } from "../../../../lib/championship-odds-resilience.js";
import {
  PRODUCTION_ODDS_CALCULATION_MODES,
  PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_HEADER,
  assertProductionOddsStoredJobScope,
  productionOddsCalculationEnvironment,
} from "../../../../lib/production-odds-calculation-contract.js";
import {
  authorizeProductionStep11OddsServiceBridge,
  certifyProductionOddsCalculation,
  inspectProductionStep11OddsControlState,
  processProductionOddsCalculationJob,
  readProductionOddsCalculationJobs,
  requestProductionOddsCalculation,
  setProductionStep11OddsRuntime,
  stageProductionStep11OddsRelease,
} from "../../../../lib/production-odds-calculation-server.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { assertProductionCutoverRequest } from "../../../../lib/production-cutover-activation-contract.js";
import { assertProductionShadowCandidateRequest } from "../../../../lib/production-shadow-candidate.js";
import { ODDS_PHASES, ODDS_SUPPORTED_ITERATION_COUNTS } from "../../../../lib/tournament-odds.js";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const clean = (value) => String(value ?? "").trim();
const sha256 = (value) => createHash("sha256").update(String(value)).digest();

function safeEqual(left, right) {
  const a = sha256(left);
  const b = sha256(right);
  return timingSafeEqual(a, b);
}

function serviceAuthorizationRequestFingerprint(request, state) {
  let path = "";
  try {
    const url = new URL(request.url);
    path = `${url.pathname}${url.search}`;
  } catch {
    path = "/api/admin/production-odds-calculations";
  }
  return createHash("sha256").update([
    "production-step11-odds-service-authorization-v1",
    clean(request.method).toUpperCase(),
    path,
    clean(state.deploymentCommit).toLowerCase(),
    clean(state.candidateHostname).toLowerCase(),
  ].join("\n")).digest("hex");
}

function serviceOperationRequestFingerprint(request, state, input = {}) {
  return createHash("sha256").update([
    serviceAuthorizationRequestFingerprint(request, state),
    clean(input.action).toLowerCase(),
    clean(input.expectedActivationRevision),
    clean(input.expectedRuntimeRevision),
    typeof input.expectedRuntimeEnabled === "boolean"
      ? String(input.expectedRuntimeEnabled)
      : "invalid-runtime-state",
    clean(process.env.PRODUCTION_STEP11_S3_FINGERPRINT).toLowerCase(),
  ].join("\n")).digest("hex");
}

function unavailable(state) {
  const rehearsal = state.mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL ||
    clean(process.env.VERCEL_ENV).toLowerCase() === "preview";
  return NextResponse.json({ error: rehearsal ? "Not found." : "Championship calculation is unavailable." }, {
    status: rehearsal ? 404 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function authorizeRequest(request, state, { requireOrigin }) {
  try {
    if (state.mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL) {
      assertProductionShadowCandidateRequest(request, process.env, { requireOrigin });
      const supplied = clean(request.headers.get("x-step11-rehearsal-token"));
      const expected = clean(process.env.PRODUCTION_STEP11_ODDS_REHEARSAL_SECRET);
      if (supplied.length < 32 || expected.length < 32 || !safeEqual(supplied, expected)) return null;
    } else {
      assertProductionCutoverRequest(request, process.env, { requireOrigin });
    }
  } catch {
    return null;
  }
  if (state.mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL &&
      clean(request.headers.get("x-step11-service-authorization")) ===
        PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_HEADER) {
    try {
      return await authorizeProductionStep11OddsServiceBridge({
        requestFingerprint: serviceAuthorizationRequestFingerprint(request, state),
        env: process.env,
      });
    } catch {
      return null;
    }
  }
  const director = await authorizePreviewDirector({
    request,
    env: process.env,
    allowBootstrap: false,
  });
  return director?.status === "active" ? director : null;
}

async function continueCalculation(jobId, { failureAt = "" } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await processProductionOddsCalculationJob(jobId, {
        failureAt: attempt === 0 ? failureAt : "",
      });
      if (result.completed || result.inProgress) return result;
    } catch (error) {
      lastError = error;
      console.error("Production Championship Odds worker stopped safely", {
        jobId,
        attempt: attempt + 1,
        code: clean(error?.code || "ODDS_CALCULATION_FAILED"),
        checkpointRetained: error?.jobFailure?.marked === true,
      });
    }
  }
  if (lastError) throw lastError;
  return null;
}

function safeJob(job = {}) {
  const safe = publicOddsCalculationJob(job);
  const isolation = assertProductionOddsStoredJobScope(job, process.env);
  const revision = job.source_revision || {};
  safe.publicationEligible = isolation.publicationEligible;
  safe.mirrorEligible = isolation.mirrorEligible;
  if (revision.rehearsal_fixture_contract) {
    safe.rehearsalIsolation = {
      contract: clean(revision.rehearsal_fixture_contract),
      namespace: clean(revision.rehearsal_namespace),
      fixtureFingerprint: clean(revision.rehearsal_fixture_fingerprint),
      canonicalPairingFingerprint: clean(revision.canonical_pairing_fingerprint),
      rehearsalPairingFingerprint: clean(revision.rehearsal_pairing_fingerprint),
      canonicalPairingsMutated: false,
      databasePairingWrites: 0,
      externalGoogleWrites: 0,
      publicationEligible: isolation.publicationEligible,
      mirrorEligible: isolation.mirrorEligible,
    };
  }
  return safe;
}

function safeJobs(payload = {}) {
  return (payload.jobs || []).map(safeJob);
}

export async function GET(request) {
  const state = productionOddsCalculationEnvironment(process.env);
  if (!state.allowed) return unavailable(state);
  const director = await authorizeRequest(request, state, { requireOrigin: false });
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, {
    status: 401,
    headers: { "Cache-Control": "private, no-store" },
  });
  const jobId = clean(new URL(request.url).searchParams.get("job"));
  try {
    const result = await readProductionOddsCalculationJobs(jobId);
    if (!result.payload?.ok) throw Object.assign(new Error("Calculation state is unavailable."), {
      code: result.payload?.code,
    });
    const jobs = safeJobs(result.payload);
    return NextResponse.json({
      ok: true,
      operationMode: state.mode,
      jobs,
      checkpoints: result.payload.checkpoints || [],
      publicationCreated: false,
      mirrorCreated: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: "Championship calculation status is unavailable.",
      code: clean(error?.code || "PRODUCTION_ODDS_CALCULATION_STATUS_FAILED"),
    }, { status: Number(error?.status || 503), headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request) {
  const state = productionOddsCalculationEnvironment(process.env);
  if (!state.allowed) return unavailable(state);
  const director = await authorizeRequest(request, state, { requireOrigin: true });
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, {
    status: 401,
    headers: { "Cache-Control": "private, no-store" },
  });
  try {
    const input = await request.json();
    const action = clean(input.action || "request").toLowerCase();
    const jobId = clean(input.jobId);
    const serviceControlActions = new Set([
      "inspect-rehearsal", "stage-rehearsal", "enable-rehearsal", "disable-rehearsal",
    ]);
    if (serviceControlActions.has(action)) {
      if (state.mode !== PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL ||
          director.source !== "production-step11-odds-service-bridge") {
        return unavailable(state);
      }
      const requestFingerprint = serviceOperationRequestFingerprint(request, state, input);
      if (action === "inspect-rehearsal") {
        const inspected = await inspectProductionStep11OddsControlState({
          requestFingerprint,
          authorizationDiagnostics: director.diagnostics,
        });
        return NextResponse.json(inspected, {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      const expectedActivationRevision = input.expectedActivationRevision;
      const expectedRuntimeRevision = input.expectedRuntimeRevision;
      const expectedRuntimeEnabled = input.expectedRuntimeEnabled;
      const result = action === "stage-rehearsal"
        ? await stageProductionStep11OddsRelease({
          expectedActivationRevision,
          requestFingerprint,
        })
        : await setProductionStep11OddsRuntime({
          enabled: action === "enable-rehearsal",
          expectedActivationRevision,
          expectedRuntimeRevision,
          expectedRuntimeEnabled,
          requestFingerprint,
        });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (action === "certify") {
      if (!/^[0-9a-f]{64}$/.test(jobId)) {
        return NextResponse.json({ error: "A valid calculation job is required." }, { status: 400 });
      }
      const certification = await certifyProductionOddsCalculation(jobId);
      return NextResponse.json({
        ...certification,
        operationMode: state.mode,
        publicationCreated: false,
        mirrorCreated: false,
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (action === "retry") {
      if (!/^[0-9a-f]{64}$/.test(jobId)) {
        return NextResponse.json({ error: "A valid calculation job is required." }, { status: 400 });
      }
      const retained = await readProductionOddsCalculationJobs(jobId);
      if (!retained.payload?.jobs?.length) {
        return NextResponse.json({ error: "Calculation job not found in this rehearsal scope." }, {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      after(() => continueCalculation(jobId).catch(() => null));
      return NextResponse.json({
        ok: true,
        accepted: true,
        jobId,
        publicationCreated: false,
        mirrorCreated: false,
      }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
    }
    if (action !== "request") {
      return NextResponse.json({ error: "Unsupported calculation operation." }, { status: 400 });
    }
    const phase = clean(input.phase);
    const iterations = Number(input.iterations);
    if (!ODDS_PHASES.includes(phase) || !ODDS_SUPPORTED_ITERATION_COUNTS.includes(iterations)) {
      return NextResponse.json({ error: "A supported milestone and iteration count are required." }, { status: 400 });
    }
    const allowedFailures = new Set([
      "", "BEFORE_FIRST_CHUNK", "AFTER_CHECKPOINT", "MID_CALCULATION",
      "AFTER_FINAL_CHECKPOINT", "AFTER_RESULT_COMMIT",
    ]);
    const failureAt = state.mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL
      ? clean(input.failureAt).toUpperCase()
      : "";
    if (!allowedFailures.has(failureAt)) {
      return NextResponse.json({ error: "Unsupported rehearsal failure boundary." }, { status: 400 });
    }
    const actorId = clean(director.identity?.player?.id || director.identity?.actor?.id);
    const requested = await requestProductionOddsCalculation({
      phase,
      iterations,
      requestedBy: actorId,
      outputTimestamp: input.outputTimestamp || new Date().toISOString(),
    });
    const requestedJobId = requested.invocation.job_id;
    after(() => continueCalculation(requestedJobId, { failureAt }).catch(() => null));
    return NextResponse.json({
      ok: true,
      accepted: true,
      duplicate: requested.requested.duplicate === true,
      jobId: requestedJobId,
      job: safeJob(requested.requested.job),
      operationMode: state.mode,
      failureBoundary: failureAt || null,
      calculationCompleted: false,
      publicationCreated: false,
      mirrorCreated: false,
    }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Production Championship Odds request failed", {
      code: clean(error?.code || "PRODUCTION_ODDS_CALCULATION_REQUEST_FAILED"),
    });
    return NextResponse.json({
      error: "Championship calculation could not be requested.",
      code: clean(error?.code || "PRODUCTION_ODDS_CALCULATION_REQUEST_FAILED"),
    }, { status: Number(error?.status || 503), headers: { "Cache-Control": "private, no-store" } });
  }
}
