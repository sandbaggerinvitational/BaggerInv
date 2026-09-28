// Proof layer: UNIT and INTEGRATION (in-memory HTTP boundary, no database).
import assert from "node:assert/strict";
import test from "node:test";
import { withOperationalRoute, observedJsonRpc, setOperationalContext, emitOperationalEvent, operationalPhase,
  observeOperationalAuthority, classifyOperationalError, recordOperationalError, TELEMETRY_DOMAINS } from "../lib/operational-telemetry.js";

const requestId = "b8a4f924-7a1e-4e5f-b709-fd8b54c507c2";
const mutationId = "6d20df35-44cd-43ee-b0ec-6d3a00a780eb";
function fixture(handler, options = {}) {
  const events = [];
  return { events, run: withOperationalRoute({ route: "/api/scoring/current", domain: "SCORING" }, handler,
    { env: {}, sink: event => events.push(event), ...options }) };
}
const request = headers => new Request("https://example.invalid/api/scoring/current?email=private@example.invalid", { headers });
function transport(payload = { ok: true }, status = 200, capture = []) {
  return async (url, init) => { capture.push({ url, init }); return Response.json(payload, { status }); };
}
const rpc = (fetchImpl, input = {}) => observedJsonRpc({ fetchImpl, input, url: "https://example.invalid/rest/v1/rpc/submit_production_hole_score",
  init: { method: "POST", body: JSON.stringify({ input }), headers: { authorization: "Bearer SECRET_NEVER_LOG", apikey: "sb_secret_never_log" } },
  domain: "SCORING", queryFamily: "submit_production_hole_score" });

test("OBS-001 UNIT generates a UUID and preserves a safe incoming attempt ID", async () => {
  const { run, events } = fixture(() => Response.json({ ok: true }));
  const generated = await run(request());
  assert.match(generated.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
  const preserved = await run(request({ "x-request-id": requestId }));
  assert.equal(preserved.headers.get("x-request-id"), requestId);
  assert.equal(events.at(-1).request_id, requestId);
  assert.equal(events.at(-1).route, "/api/scoring/current");
});

test("OBS-002 SECURITY rejects untrusted/oversized correlation IDs and never logs request URLs", async () => {
  for (const unsafe of ["private@example.invalid", "Bearer_secret", "x".repeat(2048), "00000000-0000-0000-0000-000000000000"]) {
    const { run, events } = fixture(() => Response.json({ ok: true }));
    await run(request({ "x-request-id": unsafe, authorization: "Bearer TOP_SECRET", cookie: "session=PRIVATE" }));
    assert.notEqual(events[0].request_id, unsafe);
    assert.doesNotMatch(JSON.stringify(events), /private@|TOP_SECRET|PRIVATE|Bearer_secret/);
  }
});

test("OBS-003 INTEGRATION request → RPC → receipt association → response keeps mutation distinct", async () => {
  const calls = [];
  const input = { mutation_key: mutationId, operation_id: "r3-recovery-1", match_id: "2026-R3-4", round: 3 };
  const { run, events } = fixture(async () => {
    setOperationalContext(input);
    await operationalPhase("authorization", async () => true, "AUTHORIZATION");
    const { payload } = await rpc(transport({ ok: true, mutation_id: mutationId, activation_revision: 238 }, 200, calls), input);
    return Response.json(payload);
  }, { env: { BAGGER_TELEMETRY_RELEASE_ID: "139", VERCEL_GIT_COMMIT_SHA: "b".repeat(40) } });
  const response = await run(request({ "x-request-id": requestId }));
  assert.equal(calls[0].init.headers["x-request-id"], requestId);
  assert.deepEqual(JSON.parse(calls[0].init.body).input, input);
  assert.equal(response.headers.get("x-request-id"), requestId);
  const event = events.find(value => value.event === "RPC");
  assert.equal(event.request_id, requestId);
  assert.equal(event.mutation_id, mutationId);
  assert.notEqual(event.correlation_id, event.mutation_id);
  assert.equal(event.operation_id, "r3-recovery-1");
  assert.equal(event.outcome, "COMMITTED");
  assert.equal(event.canonical_readback, "NOT_OBSERVED");
  assert.equal(event.activation, 238);
  assert.equal(event.release, 139);
  assert.equal(event.sha, "b".repeat(40));
  assert.equal(event.domain, "SCORING");
  assert.doesNotMatch(JSON.stringify(events), /SECRET_NEVER_LOG|sb_secret_never_log/);
});

test("OBS-004 UNIT same mutation can have distinct request attempts", async () => {
  const { run, events } = fixture(async () => { await rpc(transport(), { mutation_key: mutationId }); return Response.json({ ok: true }); });
  await run(request()); await run(request());
  const rpcs = events.filter(event => event.event === "RPC");
  assert.equal(rpcs[0].mutation_id, rpcs[1].mutation_id);
  assert.notEqual(rpcs[0].request_id, rpcs[1].request_id);
});

test("OBS-005 INTEGRATION PostgreSQL 57014 is classified before generic application mapping", async () => {
  const { run, events } = fixture(async () => {
    const { response } = await rpc(transport({ code: "57014", message: "sensitive SQL parameter" }, 500));
    return Response.json({ code: "ROUND_WRITE_FAILED" }, { status: response.status });
  });
  await run(request());
  const event = events.find(value => value.event === "RPC");
  assert.equal(event.sqlstate, "57014"); assert.equal(event.error_class, "DATABASE_TIMEOUT");
  assert.equal(event.outcome, "NOT_COMMITTED");
  assert.doesNotMatch(JSON.stringify(events), /sensitive SQL parameter/);
});

test("OBS-006 FAILURE_INJECTION lost transport response emits UNKNOWN without changing thrown error", async () => {
  const lost = new TypeError("secret-bearing connection failed");
  const { run, events } = fixture(async () => { await rpc(async () => { throw lost; }, { mutation_key: mutationId }); });
  await assert.rejects(run(request()), error => error === lost);
  assert.equal(events.find(value => value.event === "RPC").outcome, "UNKNOWN");
  assert.doesNotMatch(JSON.stringify(events), /secret-bearing/);
});

test("OBS-007 UNIT a gateway 503 or invalid JSON cannot prove non-commit", async () => {
  for (const fetch of [transport({ error: "gateway" }, 503), async () => new Response("not json", { status: 200 })]) {
    const { run, events } = fixture(async () => { await rpc(fetch); return Response.json({ ok: false }); });
    await run(request());
    assert.equal(events.find(value => value.event === "RPC").outcome, "UNKNOWN");
  }
});

test("OBS-008 UNIT canonical denial stays NOT_COMMITTED and has domain error", async () => {
  const { run, events } = fixture(async () => { await rpc(transport({ ok: false, code: "SCORING_REVISION_CONFLICT" })); return Response.json({}, { status: 409 }); });
  await run(request());
  const event = events.find(value => value.event === "RPC");
  assert.equal(event.outcome, "NOT_COMMITTED"); assert.equal(event.domain_error_code, "SCORING_REVISION_CONFLICT");
});

test("OBS-009 FAILURE_INJECTION sink throw/rejection cannot fail acknowledged score", async () => {
  for (const sink of [() => { throw new Error("sink failed"); }, () => Promise.reject(new Error("sink failed"))]) {
    const { run } = fixture(async () => { await rpc(transport()); return Response.json({ ok: true }); }, { sink });
    assert.deepEqual(await (await run(request())).json(), { ok: true });
  }
});

test("OBS-010 UNIT telemetry is bounded to 64 events and always retains request summary", async () => {
  const { run, events } = fixture(() => { for (let index = 0; index < 1000; index++) emitOperationalEvent({ phase: "test" }); return Response.json({ ok: true }); });
  await run(request());
  assert.equal(events.length, 64); assert.equal(events.at(-1).event, "REQUEST"); assert.equal(events.at(-1).dropped_events, 937);
});

test("OBS-011 UNIT concurrent request scopes do not leak IDs or authority", async () => {
  const { run, events } = fixture(async request => {
    await new Promise(resolve => setImmediate(resolve));
    observeOperationalAuthority({ activationRevision: request.headers.get("x-request-id") === requestId ? 238 : 239 });
    return Response.json({ ok: true });
  });
  await Promise.all([run(request({ "x-request-id": requestId })), run(request())]);
  assert.equal(events.find(event => event.request_id === requestId).activation, 238);
  assert.equal(events.find(event => event.request_id !== requestId).activation, 239);
});

test("OBS-012 SECURITY attribute allowlist excludes payload, headers, PII, SQL and error text", async () => {
  const secret = "NEVER_EMIT_THIS_VALUE";
  const { run, events } = fixture(() => {
    setOperationalContext({ matchId: "2026-R3-9", email: secret, authorization: secret, password: secret });
    emitOperationalEvent({ event: "OUTCOME", outcome: "COMMITTED", rawSql: secret, payload: secret, headers: secret,
      query_family: secret + "@", mutation_id: "sb_secret_do_not_emit", domain_error_code: secret, sqlstate: secret });
    recordOperationalError({ message: secret, details: secret, stack: secret, code: secret }, 503);
    return Response.json({ ok: true });
  });
  await run(request());
  assert.doesNotMatch(JSON.stringify(events), /NEVER_EMIT_THIS_VALUE|sb_secret_do_not_emit/);
  assert.equal(events[0].match_id, "2026-R3-9");
});

test("OBS-013 UNIT optional metadata is absent rather than guessed", async () => {
  const { run, events } = fixture(() => Response.json({ ok: true })); await run(request());
  assert.equal(events[0].release, null); assert.equal(events[0].activation, null); assert.equal(events[0].sha, null);
});

test("OBS-014 UNIT every required domain is distinct and typed failures preserve meaning", () => {
  assert.equal(new Set(TELEMETRY_DOMAINS).size, 11);
  for (const [code, expected] of [["08006", "DATABASE_UNAVAILABLE"], ["57P01", "DATABASE_UNAVAILABLE"], ["53300", "DATABASE_UNAVAILABLE"],
    ["TOURNAMENT_SETUP_DEPENDENCY_BLOCKED", "DEPENDENCY_BLOCKED"], ["ROUND_OUTCOME_UNKNOWN", "UNKNOWN_OUTCOME"],
    ["MOBILE_API_UNAVAILABLE", "FEATURE_UNAVAILABLE"], ["AUTH_INVALID", "AUTH_INVALID"]]) assert.equal(classifyOperationalError({ code }).error_class, expected);
});

test("OBS-015 UNIT telemetry disabled does not alter headers, result or idempotency", async () => {
  const { run, events } = fixture(async () => { await rpc(transport(), { mutation_key: mutationId }); return Response.json({ ok: true }); }, { enabled: false });
  const response = await run(request()); assert.equal(response.status, 200); assert.equal(events.length, 0); assert.ok(response.headers.get("x-request-id"));
});

test("OBS-018 INTEGRATION a claimed job joins its calculation and completion without exposing job input", async () => {
  const job = "9349b4b5-c65d-4b88-93ec-468c971db9d2";
  const { run, events } = fixture(async () => {
    await observedJsonRpc({ fetchImpl: transport({ ok: true, job: { job_id: job, private_payload: "NEVER_EMIT_JOB_INPUT" } }),
      url: "https://example.invalid/rpc/claim", init: { headers: {}, method: "POST" },
      domain: "CALCUTTA", queryFamily: "claim_production_calcutta_v1_recalculation" });
    await operationalPhase("calculate", async () => true, "CALCUTTA");
    return Response.json({ ok: true });
  });
  await run(request());
  assert.equal(events.find(event => event.event === "RPC").job_id, job);
  assert.equal(events.find(event => event.phase === "calculate").job_id, job);
  assert.doesNotMatch(JSON.stringify(events), /NEVER_EMIT_JOB_INPUT|private_payload/);
});
