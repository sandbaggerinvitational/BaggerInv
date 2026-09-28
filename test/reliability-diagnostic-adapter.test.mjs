import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDiagnosticRunner,
  DiagnosticPolicyError,
} from "../lib/reliability-diagnostic-policy.js";
import {
  createDiagnosticQueryClientExecutor,
  DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL,
} from "../tools/reliability/diagnostic-query-client-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(
  path.join(root, "tools/reliability/diagnostic-operations.json"),
  "utf8",
));
const invocation = {
  operationName: "current_match_summary",
  mode: "tournament",
  environment: "production",
  parameters: { tournamentId: "2026", matchId: "R3-M01" },
};

function code(error) {
  return error instanceof DiagnosticPolicyError ? error.code : "";
}

function fakeConnection(queryImpl) {
  const calls = [];
  let releases = 0;
  return {
    calls,
    get releases() { return releases; },
    client: {
      async query(config) {
        calls.push(config);
        return queryImpl(config, calls.length - 1);
      },
      release() { releases += 1; },
    },
  };
}

test("query-client adapter applies a read-only transaction and local budgets before catalog SQL", async () => {
  const connection = fakeConnection(async (config) => (
    config.text.startsWith("SELECT m.match_id")
      ? { rows: [{ match_id: "R3-M01" }] }
      : { rows: [] }
  ));
  let connects = 0;
  const runner = createDiagnosticRunner({
    catalog,
    execute: createDiagnosticQueryClientExecutor({
      connect: async () => {
        connects += 1;
        return connection.client;
      },
    }),
  });

  const result = await runner.run(invocation);
  assert.equal(result.rowCount, 1);
  assert.equal(connects, 1);
  assert.deepEqual(
    connection.calls.map((call) => call.text),
    [
      DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.begin,
      DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.budgets,
      catalog.operations.current_match_summary.sql,
      DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.commit,
    ],
  );
  assert.deepEqual(connection.calls[1].values, ["1500ms", "250ms"]);
  assert.deepEqual(connection.calls[2].values, ["2026", "R3-M01"]);
  assert.equal(connection.calls[2].signal instanceof AbortSignal, true);
  assert.equal(connection.releases, 1);
});

test("policy rejection occurs before the adapter can acquire a connection", async () => {
  let connects = 0;
  const runner = createDiagnosticRunner({
    catalog,
    execute: createDiagnosticQueryClientExecutor({
      connect: async () => {
        connects += 1;
        throw new Error("must not connect");
      },
    }),
  });

  await assert.rejects(
    runner.run({ ...invocation, operationName: "arbitrary_sql" }),
    (error) => code(error) === "UNKNOWN_OPERATION",
  );
  assert.equal(connects, 0);
});

test("query error rolls back and releases without committing", async () => {
  const failure = new Error("synthetic query failure");
  const connection = fakeConnection(async (config) => {
    if (config.text === catalog.operations.current_match_summary.sql) throw failure;
    return { rows: [] };
  });
  const runner = createDiagnosticRunner({
    catalog,
    execute: createDiagnosticQueryClientExecutor({
      connect: async () => connection.client,
    }),
  });

  await assert.rejects(runner.run(invocation), (error) => error === failure);
  assert.deepEqual(
    connection.calls.map((call) => call.text),
    [
      DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.begin,
      DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.budgets,
      catalog.operations.current_match_summary.sql,
      DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.rollback,
    ],
  );
  assert.equal(connection.releases, 1);
});

test("timeout keeps the runner locked until an abort-ignoring query settles, then rolls back", async () => {
  const shortCatalog = structuredClone(catalog);
  shortCatalog.operations.current_match_summary.budget.timeoutMs = 15;

  let releaseFirstQuery;
  const firstQuery = new Promise((resolve) => { releaseFirstQuery = resolve; });
  let operationCalls = 0;
  const connection = fakeConnection(async (config) => {
    if (config.text !== shortCatalog.operations.current_match_summary.sql) {
      return { rows: [] };
    }
    operationCalls += 1;
    if (operationCalls === 1) return firstQuery;
    return { rows: [] };
  });
  const runner = createDiagnosticRunner({
    catalog: shortCatalog,
    execute: createDiagnosticQueryClientExecutor({
      connect: async () => connection.client,
    }),
  });

  const first = runner.run(invocation);
  await assert.rejects(first, (error) => code(error) === "TIME_BUDGET_EXCEEDED");
  await assert.rejects(
    runner.run(invocation),
    (error) => code(error) === "CONCURRENCY_LIMIT",
  );

  releaseFirstQuery({ rows: [] });
  while (connection.releases < 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const firstTransaction = connection.calls.map((call) => call.text);
  assert.ok(firstTransaction.includes(DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.rollback));
  assert.ok(!firstTransaction.includes(DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.commit));

  const recovered = await runner.run(invocation);
  assert.equal(recovered.rowCount, 0);
  assert.equal(connection.releases, 2);
});

test("failed rollback discards the client while preserving the operation error", async () => {
  const operationFailure = new Error("synthetic operation failure");
  const rollbackFailure = new Error("synthetic rollback failure");
  let releaseReason;
  const calls = [];
  const client = {
    async query(config) {
      calls.push(config);
      if (config.text === catalog.operations.current_match_summary.sql) {
        throw operationFailure;
      }
      if (config.text === DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.rollback) {
        throw rollbackFailure;
      }
      return { rows: [] };
    },
    release(reason) { releaseReason = reason; },
  };
  const runner = createDiagnosticRunner({
    catalog,
    execute: createDiagnosticQueryClientExecutor({
      connect: async () => client,
    }),
  });

  await assert.rejects(runner.run(invocation), (error) => error === operationFailure);
  assert.equal(releaseReason, rollbackFailure);
  assert.equal(
    calls.at(-1).text,
    DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.rollback,
  );
});

test("indeterminate commit discards the client even after rollback responds", async () => {
  const commitFailure = new Error("synthetic commit transport failure");
  let releaseReason;
  const calls = [];
  const client = {
    async query(config) {
      calls.push(config);
      if (config.text === DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.commit) {
        throw commitFailure;
      }
      if (config.text === catalog.operations.current_match_summary.sql) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    release(reason) { releaseReason = reason; },
  };
  const runner = createDiagnosticRunner({
    catalog,
    execute: createDiagnosticQueryClientExecutor({
      connect: async () => client,
    }),
  });

  await assert.rejects(runner.run(invocation), (error) => error === commitFailure);
  assert.equal(releaseReason, commitFailure);
  assert.deepEqual(
    calls.slice(-2).map((call) => call.text),
    [
      DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.commit,
      DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL.rollback,
    ],
  );
});
