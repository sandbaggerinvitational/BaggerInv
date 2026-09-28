// UNIT / FAILURE_INJECTION only. No PostgreSQL binary, database or network runs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { BenchmarkResultError, collectTimedSqlSamples, validateBenchmarkResult }
  from "./support/reliability/benchmark-result-validation.mjs";

const rpc = { id: "test-rpc", coverage: "ACTUAL_RPC_ROLLBACK" };
const validateRpc = output => validateBenchmarkResult(rpc, output);
const fullNet = () => ({
  policy: "production-full-course-handicap-v1", tournamentId: "2026", matches: [{
    policy: "production-full-course-handicap-v1", tournamentId: "2026", matchId: "2026-R3-1",
    roundNumber: 3, format: "SI", authorityAvailable: true,
    entries: [{ entityId: "P01", teamSide: 1,
      holes: Array.from({ length: 18 }, (_, index) => ({ hole: index + 1 })) }],
  }],
});
const calcutta = () => ({
  tournament_id: "2026", calculation_policy: "production-full-course-handicap-v1",
  rounds: [{ round_number: 3, format: "SI" }],
  matches: [{ match_id: "2026-R3-1", round_number: 3, participants: [{ player_id: "P01" }] }],
  holes: [{ match_id: "2026-R3-1", hole_number: 1 }], full_net_authority: fullNet(),
});
const frame = (index, payload, timing = `Time: ${index}.25 ms`, marker = "SAMPLE") =>
  `${marker}_${index}_BEGIN\n${payload}\n${timing ? `${timing}\n` : ""}${marker}_${index}_END\n`;
const collected = (stdout, extra = {}, options = {}) => collectTimedSqlSamples(
  { status: 0, stdout, stderr: "", ...extra },
  { count: 2, marker: "SAMPLE", validateResult: validateRpc, ...options },
);

test("BENCH-RESULT canonical score samples reject replay and semantic no-op", () => {
  const operation = { id: "score-write", coverage: "ACTUAL_RPC_ROLLBACK" };
  for (const payload of [{ ok: true }, { ok: true, code: "NO_CHANGE" },
    { ok: true, code: "ACCEPTED", idempotent: true },
    { ok: true, code: "ACCEPTED", semantic_noop: true }]) {
    assert.throws(() => validateBenchmarkResult(operation, JSON.stringify(payload)),
      error => error.code === "BENCHMARK_SCORE_NOT_WRITTEN");
  }
  assert.equal(validateBenchmarkResult(operation, '{"ok":true,"code":"ACCEPTED"}').ok, true);
});

test("BENCH-RESULT RPC success requires explicit true and no partial failures", () => {
  for (const value of ["", "null", "true", "[]", "{}", '{"ok":"true"}', '{"ok":false}',
    '{"ok":true,"failures":["private failure"]}', '{"ok":true,"failures":1}',
    '{"ok":true}\n{"ok":true}', "not-json-private-payload"]) {
    assert.throws(() => validateRpc(value), BenchmarkResultError);
  }
  assert.deepEqual(validateRpc('{"ok":true,"code":"ACCEPTED","private":"not emitted"}'),
    { contract: "RPC_OK_TRUE", ok: true, code: "ACCEPTED", failures: 0 });
  assert.equal(validateBenchmarkResult({ id: "leaders", coverage: "ACTUAL_SQL_FUNCTION" }, '{"ok":true}').ok, true);
  assert.throws(() => validateBenchmarkResult({ id: "leaders", coverage: "ACTUAL_SQL_FUNCTION" }, "null"));
});

test("BENCH-RESULT SQL helper outputs require reviewed structures and exact scalar types", () => {
  const netOperation = { id: "net-skins-calculation", coverage: "ACTUAL_SQL_INPUT_ASSEMBLY_ONLY" };
  const calcuttaOperation = { id: "calcutta-calculation", coverage: "ACTUAL_SQL_INPUT_ASSEMBLY_ONLY" };
  assert.equal(validateBenchmarkResult(netOperation, JSON.stringify(fullNet())).matchCount, 1);
  assert.equal(validateBenchmarkResult(calcuttaOperation, JSON.stringify(calcutta())).matchCount, 1);
  for (const mutate of [
    value => { value.tournamentId = "2027"; },
    value => { value.policy = "wrong"; },
    value => { value.matches = []; },
    value => { value.matches[0].entries = []; },
    value => { value.matches[0].entries[0].holes.pop(); },
    value => { value.matches[0].entries[0].holes[1].hole = 1; },
  ]) {
    const value = fullNet(); mutate(value);
    assert.throws(() => validateBenchmarkResult(netOperation, JSON.stringify(value)), BenchmarkResultError);
  }
  for (const field of ["tournament_id", "calculation_policy", "rounds", "matches", "holes", "full_net_authority"]) {
    const value = calcutta(); delete value[field];
    assert.throws(() => validateBenchmarkResult(calcuttaOperation, JSON.stringify(value)), BenchmarkResultError);
  }
  for (const id of ["late-r3-compatibility-old", "late-r3-compatibility-fixed"]) {
    assert.equal(validateBenchmarkResult({ id }, "t").booleanValue, true);
    assert.equal(validateBenchmarkResult({ id }, "f").booleanValue, false);
    for (const invalid of ["", "null", "0", "false", "{}", "t\nf"]) {
      assert.throws(() => validateBenchmarkResult({ id }, invalid), BenchmarkResultError);
    }
  }
  assert.throws(() => validateBenchmarkResult({ id: "unreviewed", coverage: "ACTUAL_SQL_FUNCTION" }, "{}"),
    error => error.code === "BENCHMARK_RESULT_CONTRACT_MISSING");
});

test("BENCH-SAMPLES validates every payload while preserving original stdout or stderr timings", () => {
  const first = '{"ok":true,"note":"Time: 888 ms"}';
  const second = '{"ok":true}';
  const seen = [];
  assert.deepEqual(collected(frame(1, first) + frame(2, second), {}, {
    validateResult(output, index) { seen.push(index); return validateRpc(output); },
  }), [1.25, 2.25]);
  assert.deepEqual(seen, [0, 1]);
  assert.deepEqual(collected(frame(1, first, "") + frame(2, second, ""),
    { stderr: "NOTICE: ignored diagnostic\nTime: 1.25 ms\nTime: 2.25 ms (00:00.002)\n" }), [1.25, 2.25]);
});

test("BENCH-SAMPLES never returns successful timings for a failed or malformed later sample", () => {
  for (const payload of ["null", "{}", "private-malformed-payload", '{"ok":false}', '{"ok":true,"failures":["private"]}']) {
    assert.throws(() => collected(frame(1, '{"ok":true}') + frame(2, payload)), error => {
      assert.equal(error instanceof BenchmarkResultError, true);
      assert.match(error.message, /sample 2 failed semantic validation/);
      assert.doesNotMatch(error.message, /private|malformed-payload/);
      assert.equal(Object.hasOwn(error, "result"), false);
      return true;
    });
  }
});

test("BENCH-SAMPLES rejects framing, result-count and timing ambiguity without exposing payloads", () => {
  const first = frame(1, '{"ok":true}');
  const second = frame(2, '{"ok":true}');
  for (const output of [first, second + first, first + second + "unexpected-private-output\n",
    first + second.replace("SAMPLE_2_END", "wrong"),
    frame(1, '{"ok":true}', "Time: 1 ms\nTime: 2 ms") + second,
    frame(1, '{"ok":true}', "") + second,
    first + frame(2, '{"ok":true}\n{"ok":true}')]) {
    assert.throws(() => collected(output), error => {
      assert.equal(error instanceof BenchmarkResultError, true);
      assert.doesNotMatch(error.message, /unexpected-private-output/);
      return true;
    });
  }
  assert.throws(() => collected(first + second, { stderr: "Time: 1 ms\nTime: 2 ms\n" }));
  assert.throws(() => collected(first + second, { status: 1, stderr: "private failure" }), error => {
    assert.equal(error.code, "BENCHMARK_SQL_PROCESS_FAILED");
    assert.doesNotMatch(error.message, /private failure/);
    assert.equal(Object.hasOwn(error, "result"), false);
    return true;
  });
  assert.throws(() => collected(first + second, {}, { validateResult: undefined }));
  assert.throws(() => collected(first + second, {}, { validateResult: () => false }));
  assert.throws(() => collected(first + second, {}, { validateResult: () => { throw new Error("private result"); } }),
    error => !error.message.includes("private result"));
});

test("BENCH-SAMPLES actual timing helper retains SQL and validates captured output before returning", () => {
  // Load only this function with an injected process runner: no PostgreSQL
  // discovery or execution, and no relaxation of its real owned-cluster guard.
  const source = readFileSync(new URL("./support/reliability/postgres17.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export function timedSqlSamples(");
  const end = source.indexOf("\nexport function sqlFile(", start);
  const statement = "select public.fixture_rpc('{}'::jsonb)";
  let invocation;
  const timed = vm.runInNewContext(source.slice(start, end).replace(/^export /, "") + "; timedSqlSamples;", {
    assert, process: { pid: 17 }, databaseNamePattern: /^[a-z][a-z0-9_]*$/,
    assertOwnedCluster: cluster => assert.equal(cluster.owned, true),
    binaries: { psql: "owned-psql" }, cleanEnvironment: () => ({}), collectTimedSqlSamples,
    runResult(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stderr: "", stdout:
        frame(1, '{"ok":true}', "Time: 1.25 ms", "BAGGER_LOCAL_SAMPLE_17") +
        frame(2, '{"ok":true}', "Time: 2.25 ms", "BAGGER_LOCAL_SAMPLE_17") };
    },
  });
  const values = timed({ owned: true, socket: "/private/owned/socket", port: 60001 }, "fixture", statement, 2,
    { setup: "set local request.jwt.claim.role='service_role';", validateResult: validateRpc });
  assert.deepEqual([...values], [1.25, 2.25]);
  assert.equal(invocation.options.input.split(statement + ";").length - 1, 2);
  assert.match(invocation.options.input, /\\timing on\nselect public\.fixture_rpc/);
  assert.doesNotMatch(invocation.options.input, /\\o |copy |explain |jsonb_build_object/i);
  assert.deepEqual([...invocation.args.slice(4, 6)], ["-h", "/private/owned/socket"]);
});
