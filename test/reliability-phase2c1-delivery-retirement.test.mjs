import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { buildProductionDirectorOverview } from "../lib/production-director-console.js";
import { productionLiveMatchAdminDataFromSupabaseView } from "../lib/tournament-live-supabase.js";

// Proof layer: API for route bodies with injected transports; UNIT for health
// and post-commit selection. These do not prove hosted routing or SQL execution.
// Imported transport bindings fail closed unless explicitly supplied. No server,
// credentials, developer env fallback or external network is used by this suite.
async function isolatedModule(path, dependencies = {}) {
  const key = `phase2c1-${randomUUID()}`;
  globalThis[key] = new Proxy(dependencies, {
    get(target, name) {
      if (Object.hasOwn(target, name)) return target[name];
      return () => { throw new Error(`Unexpected dependency invocation: ${String(name)}`); };
    },
  });
  const source = (await readFile(new URL(`../${path}`, import.meta.url), "utf8"))
    .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,
      (_, bindings) => `const {${bindings.replace(/\bas\b/g, ":")}} = globalThis[${JSON.stringify(key)}];\n`);
  assert.doesNotMatch(source, /^import\s/m, "all imported transports must be injected");
  const localConsole = "const console = { info() {}, warn() {}, error() {} };\n";
  try { return await import(`data:text/javascript;base64,${Buffer.from(localConsole + source).toString("base64")}#${key}`); }
  finally { delete globalThis[key]; }
}

function routeDependencies(overrides = {}) {
  const calls = [];
  const scheduled = [];
  const invoke = (name, value) => async (...args) => { calls.push({ name, args }); return value; };
  const identity = { tournamentId: "2026", authUserId: "SYNTHETIC-AUTH", actor: { id: "SYNTHETIC-DIRECTOR", name: "Synthetic Director" } };
  return {
    calls, scheduled,
    NextResponse: Response,
    withOperationalRoute: (_, handler) => handler,
    recordOperationalError: () => {}, emitOperationalEvent: () => {},
    operationalPhase: (_, operation) => operation(),
    after: (operation) => scheduled.push(operation),
    revalidateTag: () => {}, revalidatePath: () => {}, invalidateScorecardAnalyticsCache: () => {},
    cookies: async () => ({}),
    authorizePreviewDirector: invoke("authorization", { status: "active", identity }),
    productionDirectorEntitlementEnvironment: () => ({ enabled: true }),
    requireScoringAuthority: () => ({ resolved: "supabase" }),
    assertDirectorMutationAuthority: () => ({ resolvedAuthority: "supabase", canonicalLifecycleAction: "finalize" }),
    assertScoringMutationAuthorityContractBeforeDispatch: invoke("mutation-authority", undefined),
    currentScoringMutationAuthorityContract: invoke("contract", { version: "synthetic-contract" }),
    persistDirectorMatchLifecycle: invoke("canonical-lifecycle", { delegated: true, result: { match_id: "2026-R1-1", status: "FINAL", mutation_key: "synthetic-operation" } }),
    recalculateCompetitionDerivedTournament: invoke("competition", { ok: true }),
    recalculateIntelligenceDerivedTournament: invoke("intelligence", { ok: true }),
    recalculateCalcuttaAfterCanonicalMutation: invoke("calcutta", { ok: true }),
    directorTransactionError: (error) => error.message,
    scoringTokenFromRequest: () => "synthetic-token",
    verifyScoringSession: () => ({ scope: "match", matchId: "2026-R1-1", tournamentId: "2026", playerId: "SYNTHETIC-P1" }),
    validateAuthoritativeParticipantSession: invoke("participant-authorization", { writable: true }),
    canScoreMatch: () => true,
    clientAddress: () => "synthetic-address", consumeRateLimit: () => ({ allowed: true }),
    normalizeLiveScoringRequest: (input) => input,
    persistParticipantScore: invoke("canonical-score", { authority: "supabase", result: { hole: { "Hole Number": 1 }, matchRevision: 2 }, diagnostics: {} }),
    scoringShadowEnvironment: () => ({}),
    productionShadowScoringMutationResponse: () => null,
    ...overrides,
  };
}
const request = () => new Request("http://localhost.invalid/api/synthetic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finalize", matchId: "2026-R1-1", operationRequestId: "synthetic-operation", clientMutationId: "synthetic-mutation", holeNumber: 1, team1GrossScores: [4, 5], team2GrossScores: [5, 5] }) });

for (const path of ["scoring-google-outbox", "round-scorecards-archive", "future-match-google-compatibility"]) {
  test(`API: retired ${path} rejects GET/POST before credentials, body, queue or adapter`, async () => {
    const module = await isolatedModule(`app/api/cron/${path}/route.js`, { NextResponse: Response });
    for (const method of ["GET", "POST"]) {
      const response = await module[method]({ get headers() { throw new Error("credential access forbidden"); }, json() { throw new Error("body access forbidden"); } });
      assert.equal(response.status, 410);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const value = await response.json();
      assert.equal(value.retired, true);
      assert.match(value.code, /RETIRED$/);
    }
    if (module.futureMatchGoogleCompatibilityWorkerEnabled) assert.equal(module.futureMatchGoogleCompatibilityWorkerEnabled({ PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true" }), false);
  });
}

test("UNIT: mobile post-commit ignores unavailable retired transports and retains three internal families", async () => {
  const deps = routeDependencies();
  const module = await isolatedModule("lib/mobile-v1-scoring-post-commit.js", deps);
  const unavailable = () => { assert.fail("Google must not be invoked"); };
  const settled = await module.runMobileScoringPostCommit({ tournamentId: "2026", matchId: "2026-R1-1" }, {
    ...deps, drainGoogleOutbox: unavailable, drainScorecardArchiveJobs: unavailable,
  });
  assert.deepEqual(deps.calls.map(({ name }) => name), ["competition", "intelligence", "calcutta"]);
  assert.equal(settled.length, 3);
  assert.ok(settled.every(({ status }) => status === "fulfilled"));
  assert.equal(deps.calls[2].args[1].matchId, "2026-R1-1");
});

test("UNIT: managed post-commit failure remains settled and does not invoke a retired fallback", async () => {
  const deps = routeDependencies({ recalculateCompetitionDerivedTournament: async () => { throw new Error("synthetic derived outage"); } });
  const module = await isolatedModule("lib/mobile-v1-scoring-post-commit.js", deps);
  const settled = await module.runMobileScoringPostCommit({ tournamentId: "2026" }, deps);
  assert.deepEqual(settled.map(({ status }) => status), ["rejected", "fulfilled", "fulfilled"]);
});

for (const path of ["app/api/scoring/current/route.js", "app/api/scoring/matches/[matchId]/route.js"]) {
  test(`API: ${path} retains score acknowledgement and only internal post-commit families`, async () => {
    const deps = routeDependencies();
    const module = await isolatedModule(path, deps);
    const response = await module.POST(request(), { params: Promise.resolve({ matchId: "2026-R1-1" }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: { hole: { "Hole Number": 1 }, matchRevision: 2 } });
    await Promise.all(deps.scheduled.map((operation) => operation()));
    assert.deepEqual(deps.calls.map(({ name }) => name), ["participant-authorization", "canonical-score", "competition", "intelligence", "calcutta"]);
  });
}

for (const path of ["app/api/director/route.js", "app/api/live-matches/route.js"]) {
  test(`API: ${path} successful canonical lifecycle never awaits retired delivery`, async () => {
    const deps = routeDependencies();
    const module = await isolatedModule(path, deps);
    const response = await module.POST(request());
    assert.equal(response.status, 200);
    const body = await response.json();
    const mirror = body.mirror || body.transaction.mirror;
    assert.deepEqual(mirror, { delivered: 0, failed: 0, pending: false, retired: true });
    assert.equal((body.receipt || body.data.match).mutation_key, "synthetic-operation");
    assert.deepEqual(deps.calls.map(({ name }) => name), ["authorization", "mutation-authority", "canonical-lifecycle"]);
    await Promise.all(deps.scheduled.map((operation) => operation()));
    assert.ok(deps.calls.some(({ name }) => name === "competition"));
    assert.ok(deps.calls.some(({ name }) => name === "calcutta"));
  });
  test(`API: ${path} preserves rejected authorization`, async () => {
    const module = await isolatedModule(path, routeDependencies({ authorizePreviewDirector: async () => ({ status: "forbidden" }) }));
    assert.ok([401, 403].includes((await module.POST(request())).status));
  });
}

test("API: legacy Director workbook dashboard is explicitly retired without any transport", async () => {
  const module = await isolatedModule("app/api/director/route.js", { NextResponse: Response });
  const response = await module.GET();
  assert.equal(response.status, 410);
  assert.equal((await response.json()).replacement, "/api/director/production-overview");
});

for (const format of ["BB", "SC", "SI"]) {
  test(`API: canonical frozen-2026 live-match read preserves ${format} admin contract without Google`, async () => {
    const playerCount = format === "SI" ? 2 : 4;
    const participants = Array.from({ length: playerCount }, (_, index) => ({ player_id: `SYNTHETIC-P${index + 1}`, team_side: index < playerCount / 2 ? 1 : 2, player_slot: index % (playerCount / 2) + 1 }));
    const view = { tournament: { tournament_id: "2026", tournament_year: 2026 }, teams: [{ team_side: 1, name: "Synthetic One" }, { team_side: 2, name: "Synthetic Two" }], players: participants,
      matches: [{ match: { match_id: "2026-R1-1", round_number: 1, format, status: "LIVE", permission_revision: 7, scoring_locked: false }, participants, scores: [], round: { round_number: 1, format }, snapshot: { course_id: "SYNTHETIC-COURSE" }, presentation: { display_match_number: "1" } }] };
    const matrix = { ok: true, decisions: [{ match_id: "2026-R1-1", action: "START_SCORING", can_score: true, permission_revision: 7 }] };
    const deps = routeDependencies({ readTournamentLiveView: async (target) => { assert.equal(target, "2026"); return { payload: { ok: true, data: view } }; },
      readMatchAuthorizationMatrix: async (target) => { assert.equal(target, "2026"); return { payload: matrix }; },
      readProductionCurrentTournamentRuntime: async () => ({ tournamentId: "2026" }),
      productionLiveMatchAdminDataFromSupabaseView });
    const module = await isolatedModule("app/api/live-matches/route.js", deps);
    const response = await module.GET(new Request("http://localhost.invalid/api/live-matches"));
    assert.equal(response.status, 200);
    const body = (await response.json()).data;
    const match = body.matches[0];
    assert.equal(body.tournamentId, "2026"); assert.equal(match.Format, format);
    assert.equal(match["Match ID"], "2026-R1-1"); assert.equal(match["Course ID"], "SYNTHETIC-COURSE");
    assert.equal(match["Access Active"], true); assert.equal(match["Access Version"], 7);
    assert.equal(match["Team 1 Player 1"], "SYNTHETIC-P1"); assert.equal(match["Team 2 Player 1"], `SYNTHETIC-P${playerCount / 2 + 1}`);
    assert.equal(match["Access Code Hash"], undefined); assert.equal(match["Access Token Hash"], undefined);
    assert.deepEqual(body.scoringAuthorityContract, { version: "synthetic-contract" });
  });
}

const readState = { workers_enabled: true, scoring_authority: "SUPABASE", current_tournament_read_authority: "SUPABASE", participant_identity_authority: "SUPABASE", scoring_ingress_state: "OPEN" };
test("UNIT: disabled/failed historical Google consumers cannot degrade healthy internal workers", () => {
  const workers = { worker_controls: { SCORING_GOOGLE_OUTBOX: { enabled: false }, ROUND_SCORECARDS_ARCHIVE: { enabled: false }, ODDS_GOOGLE_MIRROR: { enabled: false }, FUTURE_MATCH_GOOGLE_COMPATIBILITY: { enabled: false }, COMPETITION_DERIVED: { enabled: true }, INTELLIGENCE_DERIVED: { enabled: true }, CALCUTTA_V1_CALCULATION: { enabled: true } }, outbox_counts: { PENDING: 100, FAILED: 20 }, archive_counts: { BLOCKED: 10 }, required_pending_count: 0 };
  const model = buildProductionDirectorOverview({ readState, workers });
  assert.equal(model.workers.healthy, true); assert.equal(model.workers.pending, 0);
  assert.equal(model.workers.googleRuntime, "RETIRED");
  assert.ok(model.workers.items.every(({ id }) => !/GOOGLE|ARCHIVE/.test(id)));
  assert.equal(model.readinessIssues.some(({ id }) => id === "workers-disabled" || id === "workers-pending"), false);
});
test("UNIT: absence of internal worker evidence remains NOT_OBSERVED, never fabricated healthy", () => {
  const model = buildProductionDirectorOverview({ readState, workers: { worker_controls: { SCORING_GOOGLE_OUTBOX: { enabled: false } }, outbox_counts: { FAILED: 50 } } });
  assert.equal(model.workers.state, "NOT_OBSERVED"); assert.equal(model.workers.healthy, false);
  assert.equal(model.readinessIssues.some(({ id }) => id === "workers-disabled"), false);
});
test("UNIT: disabled or backlogged required internal family remains visible after retirement", () => {
  const disabled = buildProductionDirectorOverview({ readState, workers: { worker_controls: { COMPETITION_DERIVED: { enabled: false } } } });
  assert.equal(disabled.workers.healthy, false); assert.equal(disabled.workers.state, "ATTENTION");
  const backlog = buildProductionDirectorOverview({ readState, workers: { worker_controls: { COMPETITION_DERIVED: { enabled: true } }, required_pending_count: 3 } });
  assert.equal(backlog.workers.pending, 3); assert.equal(backlog.workers.state, "WORKING");
});

test("UNIT: enabled controls without internal queue measurement are not healthy evidence", () => {
  const model = buildProductionDirectorOverview({ readState, workers: { worker_controls: { COMPETITION_DERIVED: { enabled: true } }, outbox_counts: { PENDING: 0 }, archive_counts: { PENDING: 0 } } });
  assert.equal(model.workers.enabled, true);
  assert.equal(model.workers.healthy, false);
  assert.equal(model.workers.state, "NOT_OBSERVED");
  assert.equal(model.readinessIssues.some(({ id }) => id === "workers-unavailable"), true);
});

test("API: canonical Final confirmation survives a failed readback without any Google fallback", async () => {
  const deps = routeDependencies({ readScoringMatchView: async () => { throw Object.assign(new Error("synthetic read unavailable"), { code: "SCORING_FINAL_READ_UNAVAILABLE" }); } });
  const module = await isolatedModule("app/api/scoring/current/route.js", deps);
  const response = await module.POST(new Request("http://localhost.invalid/api/scoring/current", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "confirm", clientMutationId: "synthetic-final" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).result, { hole: { "Hole Number": 1 }, matchRevision: 2 });
  await Promise.all(deps.scheduled.map((operation) => operation()));
  assert.deepEqual(deps.calls.filter(({ name }) => ["competition", "intelligence", "calcutta"].includes(name)).map(({ name }) => name), ["competition", "intelligence", "calcutta"]);
});

for (const view of [{ ok: false, code: "READ_UNAVAILABLE" }, { ok: true, data: { tournament: { tournament_id: "OTHER-YEAR" } } }]) {
  test(`API: canonical match read ${view.ok ? "scope mismatch" : "failure"} fails closed without fallback`, async () => {
    let authorizationMatrixReads = 0;
    const deps = routeDependencies({
      readTournamentLiveView: async () => ({ payload: view }),
      readMatchAuthorizationMatrix: async () => { authorizationMatrixReads += 1; return { payload: { ok: true } }; },
    });
    const module = await isolatedModule("app/api/live-matches/route.js", deps);
    const response = await module.GET(new Request("http://localhost.invalid/api/live-matches"));
    assert.equal(response.status, 500);
    assert.equal(authorizationMatrixReads, 0);
    assert.equal(deps.calls.some(({ name }) => name === "canonical-lifecycle"), false);
  });
}
