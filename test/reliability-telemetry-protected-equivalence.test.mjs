// Proof layer: INTEGRATION (simulated provider/authority dependencies; actual Release 139 and Phase 1 implementations).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const RELEASE_139 = "b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const telemetryURL = pathToFileURL(path.join(repositoryRoot, "lib/operational-telemetry.js")).href;
let importSequence = 0;

function baseSource(relativePath) {
  return execFileSync("git", ["show", `${RELEASE_139}:${relativePath}`], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

async function currentSource(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

function importSource(source, label) {
  const encoded = Buffer.from(`${source}\n//# sourceURL=${label}-${++importSequence}.mjs\n`).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function requestShape(call) {
  return {
    url: call.url,
    method: call.options.method,
    headers: call.options.headers,
    body: call.options.body,
    cache: call.options.cache,
    hasAbortSignal: call.options.signal instanceof AbortSignal,
  };
}

function currentRuntimeModule(source, label) {
  const activationStub = `
function assertProductionCutoverActivation() {
  throw new Error("test must supply the already-validated activation");
}`;
  const foundationStub = `
const PRODUCTION_GOOGLE_WORKBOOK_ID = ${JSON.stringify(PRODUCTION_GOOGLE_WORKBOOK_ID)};
const PRODUCTION_SUPABASE_PROJECT_REF = ${JSON.stringify(PRODUCTION_SUPABASE_PROJECT_REF)};
const PRODUCTION_SUPABASE_URL = ${JSON.stringify(PRODUCTION_SUPABASE_URL)};`;
  const authorityStub = "function recordDataAuthorityTransport() {}";
  const transformed = source
    .replace('import "server-only";\n', "")
    .replace(
      /import \{ observedJsonRpc \} from "\.\/operational-telemetry\.js";\n/,
      `import { observedJsonRpc } from ${JSON.stringify(telemetryURL)};\n`,
    )
    .replace(
      /import \{ assertProductionCutoverActivation \} from "\.\/production-cutover-activation-contract\.js";/,
      activationStub,
    )
    .replace(
      /import \{[^;]*\} from "\.\/production-foundation-resource-contract\.js";/,
      foundationStub,
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      authorityStub,
    );
  return importSource(transformed, label);
}

function scoringOperationsModule(source, label) {
  const activationStub = `
const PRODUCTION_VERCEL_PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";
function assertProductionCutoverActivation({ env, requiredPhase }) {
  return {
    phase: requiredPhase,
    resources: { commitSha: String(env.VERCEL_GIT_COMMIT_SHA || "") },
    maintenanceDeploymentCapability: { allowed: false, contract: "", ceiling: "" },
  };
}`;
  const foundationStub = `
const PRODUCTION_GOOGLE_WORKBOOK_ID = ${JSON.stringify(PRODUCTION_GOOGLE_WORKBOOK_ID)};
const PRODUCTION_SUPABASE_PROJECT_REF = ${JSON.stringify(PRODUCTION_SUPABASE_PROJECT_REF)};
const PRODUCTION_SUPABASE_URL = ${JSON.stringify(PRODUCTION_SUPABASE_URL)};
const PRODUCTION_TOURNAMENT_ID = "2026";`;
  const transformed = source
    .replace('import "server-only";\n', "")
    .replace(/import \{ observedJsonRpc \} from "\.\/operational-telemetry\.js";\n/, "")
    .replace(
      /import \{[^;]*\} from "\.\/production-cutover-activation-contract\.js";/,
      activationStub,
    )
    .replace(
      /import \{[^;]*\} from "\.\/production-foundation-resource-contract\.js";/,
      foundationStub,
    )
    .replace(
      /import \{ readProductionCurrentTournamentRuntime \} from "\.\/production-current-tournament-runtime\.js";/,
      'async function readProductionCurrentTournamentRuntime() { throw new Error("test must inject current runtime"); }',
    )
    .replace(
      /import \{[^;]*\} from "\.\/production-shadow-candidate\.js";/,
      'const PRODUCTION_CANONICAL_HOSTNAME = "baggerinv.com"; const PRODUCTION_VERCEL_PROJECT_NAME = "bagger-inv";',
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      "function recordDataAuthorityTransport() {}",
    );
  return importSource(
    `import { observedJsonRpc } from ${JSON.stringify(telemetryURL)};\n${transformed}`,
    label,
  );
}

function postCommitModule(source, label) {
  const transformed = source.replace(/^import .*;\n/gm, "");
  const defaults = `
const unavailable = async () => { throw new Error("test must inject every post-commit dependency"); };
const recalculateCalcuttaAfterCanonicalMutation = unavailable;
const recalculateCompetitionDerivedTournament = unavailable;
const recalculateIntelligenceDerivedTournament = unavailable;
const drainScorecardArchiveJobs = unavailable;
const drainGoogleOutbox = unavailable;`;
  return importSource(
    `import { operationalPhase } from ${JSON.stringify(telemetryURL)};\n${defaults}\n${transformed}`,
    label,
  );
}

function scoringRouteModule(source, label) {
  const transformed = source.replace(/^import .*;\n/gm, "");
  const harness = `
import { withOperationalRoute, recordOperationalError } from ${JSON.stringify(telemetryURL)};
export const __calls = [];
const scheduled = [];
function after(operation) { __calls.push("after"); scheduled.push(operation); }
async function readMobileScoringJson() { __calls.push("read-input"); return { matchId: "FIXTURE-M1" }; }
async function mobileScoringHoleResult(identity, input) { __calls.push("mutation"); return { ok: true, kind: "hole", input }; }
async function mobileScoringFinalizeResult(identity, input) { __calls.push("mutation"); return { ok: true, kind: "finalize", input }; }
async function runMobileScoringPostCommit(value) { __calls.push("post-commit"); return value; }
async function mobileV1ScoringResponse(request, loader) {
  __calls.push("authority");
  const result = await loader({ playerId: "FIXTURE-P1" });
  __calls.push("response");
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}
function productionShadowScoringMutationResponse() { __calls.push("shadow"); return null; }
export async function __runScheduled() { for (const operation of scheduled) await operation(); }
`;
  return importSource(`${harness}\n${transformed}`, label);
}

test("Phase 1 telemetry preserves current-tournament RPC authority input, transport, payload, and error result from Release 139", async () => {
  const [baseline, candidate] = await Promise.all([
    currentRuntimeModule(baseSource("lib/production-current-tournament-runtime.js"), "release139-current-runtime"),
    currentRuntimeModule(await currentSource("lib/production-current-tournament-runtime.js"), "phase1-current-runtime"),
  ]);
  const activation = Object.freeze({ revision: 162 });
  const env = { PRODUCTION_SUPABASE_SECRET_KEY: `sb_secret_${"x".repeat(32)}` };
  const input = { contract_version: "production-current-tournament-runtime-v1", environment: "PRODUCTION" };
  const payload = { ok: true, pointer_revision: 48, deploymentCommit: "a".repeat(40) };

  async function exercise(module, responsePayload = payload, status = 200) {
    const calls = [];
    const result = await module.productionCurrentTournamentRuntimeRpc(input, {
      env,
      activation,
      timeoutMs: 3210,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify(responsePayload), {
          status,
          headers: { "content-type": "application/json" },
        });
      },
    });
    return { result, call: requestShape(calls[0]) };
  }

  assert.deepEqual(await exercise(candidate), await exercise(baseline));

  async function rejected(module) {
    try {
      await exercise(module, { code: "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_UNAVAILABLE" }, 503);
      assert.fail("expected the RPC to reject");
    } catch (error) {
      return { code: error.code, status: error.status };
    }
  }
  assert.deepEqual(await rejected(candidate), await rejected(baseline));
});

test("Phase 1 telemetry preserves scoring dispatch order, bounded request body, transport, and acknowledgement from Release 139", async () => {
  const [baseline, candidate] = await Promise.all([
    scoringOperationsModule(baseSource("lib/production-scoring-operations-server.js"), "release139-scoring-operations"),
    scoringOperationsModule(await currentSource("lib/production-scoring-operations-server.js"), "phase1-scoring-operations"),
  ]);
  const commit = "a".repeat(40);
  const epochId = "11111111-1111-4111-8111-111111111111";
  const env = {
    VERCEL_GIT_COMMIT_SHA: commit,
    VERCEL_DEPLOYMENT_ID: "dpl_reliability_phase1",
    PRODUCTION_SUPABASE_SECRET_KEY: `sb_secret_${"x".repeat(32)}`,
    PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: epochId,
  };
  const runtime = {
    contractVersion: "production-current-tournament-runtime-v1",
    status: "FROZEN_2026_RUNTIME",
    tournamentId: "2026",
    tournamentYear: 2026,
    lifecycle: "ACTIVE",
    pointerRevision: 1,
    lifecycleRevision: 1,
    runtimeGenerationId: "",
    authorityGenerationId: "",
    admissionGenerationId: "",
  };
  const certification = {
    contractVersion: "production-annual-scoring-platform-certification-v1",
    platformTournamentId: "2026",
    resourceFingerprint: "6".repeat(64),
    certificationFingerprint: "7".repeat(64),
    platformAuthorityGenerationId: "33333333-3333-4333-8333-333333333333",
    platformAdmissionGenerationId: "44444444-4444-4444-8444-444444444444",
  };
  const input = {
    match_id: "2026-R1-1",
    hole_number: 7,
    authorization: { tournament_id: "2026", player_id: "FIXTURE-P1" },
  };
  const payload = { ok: true, code: "HOLE_SCORE_RECORDED", revision: 19, idempotent: true };

  async function exercise(module) {
    const order = [];
    let call;
    const result = await module.productionScoringOperationsRpc("submit_production_hole_score", input, {
      env,
      readCurrentTournamentRuntime: async () => { order.push("runtime"); return runtime; },
      readScoringPlatformCertification: async () => { order.push("certification"); return certification; },
      fetchImpl: async (url, options) => {
        order.push("fetch");
        call = { url, options };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    return { order, call: requestShape(call), ok: result.ok, payload: result.payload };
  }

  assert.deepEqual(await exercise(candidate), await exercise(baseline));
});

test("Phase 1 telemetry preserves post-commit fan-out order, arguments, and settled results from Release 139", async () => {
  const [baseline, candidate] = await Promise.all([
    postCommitModule(baseSource("lib/mobile-v1-scoring-post-commit.js"), "release139-post-commit"),
    postCommitModule(await currentSource("lib/mobile-v1-scoring-post-commit.js"), "phase1-post-commit"),
  ]);

  async function exercise(module) {
    const calls = [];
    const worker = (name, rejects = false) => async (...args) => {
      calls.push({ name, args });
      if (rejects) throw new Error("synthetic archive delay");
      return { name, ok: true };
    };
    const settled = await module.runMobileScoringPostCommit({
      tournamentId: "FIXTURE-2026",
      matchId: "FIXTURE-M1",
    }, {
      drainGoogleOutbox: worker("outbox"),
      drainScorecardArchiveJobs: worker("archive", true),
      recalculateCompetitionDerivedTournament: worker("competition"),
      recalculateIntelligenceDerivedTournament: worker("intelligence"),
      recalculateCalcuttaTournament: worker("calcutta"),
    });
    return {
      calls,
      settled: settled.map((entry) => entry.status === "fulfilled"
        ? { status: entry.status, value: entry.value }
        : { status: entry.status, reason: entry.reason.message }),
    };
  }

  assert.deepEqual(await exercise(candidate), await exercise(baseline));
});

for (const route of ["hole", "finalize"]) {
  test(`Phase 1 telemetry preserves ${route} route authority and mutation order plus response semantics from Release 139`, async () => {
    const relativePath = `app/api/mobile/v1/scoring/${route}/route.js`;
    const [baseline, candidate] = await Promise.all([
      scoringRouteModule(baseSource(relativePath), `release139-${route}-route`),
      scoringRouteModule(await currentSource(relativePath), `phase1-${route}-route`),
    ]);
    const previousTelemetry = process.env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED;
    process.env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED = "false";
    try {
      async function exercise(module) {
        const response = await module.POST(new Request(`https://baggerinv.com/api/mobile/v1/scoring/${route}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }));
        const result = {
          status: response.status,
          cacheControl: response.headers.get("cache-control"),
          body: await response.json(),
        };
        await module.__runScheduled();
        return { result, calls: module.__calls, requestId: response.headers.get("x-request-id") };
      }
      const currentResult = await exercise(candidate);
      const baseResult = await exercise(baseline);
      assert.deepEqual(currentResult.result, baseResult.result);
      assert.deepEqual(currentResult.calls, baseResult.calls);
      assert.deepEqual(currentResult.calls, ["shadow", "authority", "read-input", "mutation", "after", "response", "post-commit"]);
      assert.equal(baseResult.requestId, null);
      assert.match(currentResult.requestId, /^[0-9a-f-]{36}$/);
    } finally {
      if (previousTelemetry === undefined) delete process.env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED;
      else process.env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED = previousTelemetry;
    }
  });
}
