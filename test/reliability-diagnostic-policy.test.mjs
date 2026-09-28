import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiagnosticPlan,
  createDiagnosticRunner,
  DiagnosticPolicyError,
  validateDiagnosticCatalog,
} from "../lib/reliability-diagnostic-policy.js";

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

function catalogWith(operationName, operation) {
  return { schemaVersion: 1, operations: { [operationName]: operation } };
}

function boundedDefinition(sql, allowedRelations) {
  return {
    description: "Policy rejection fixture.",
    modes: ["tournament"],
    sql,
    parameters: [
      { name: "tournamentId", position: 1, kind: "current-id", scopeColumn: "tournament_id" },
    ],
    allowedRelations,
    budget: {
      timeoutMs: 1000,
      lockTimeoutMs: 100,
      maxRows: 10,
      maxPayloadBytes: 4096,
    },
  };
}

test("the checked-in catalog is valid and produces a bounded read-only plan", () => {
  assert.equal(validateDiagnosticCatalog(catalog), true);
  const plan = buildDiagnosticPlan({ catalog, ...invocation });

  assert.equal(plan.operationName, "current_match_summary");
  assert.equal(plan.controls.readOnly, true);
  assert.equal(plan.controls.connectionLimit, 1);
  assert.equal(plan.controls.retryCount, 0);
  assert.ok(plan.controls.statementTimeoutMs <= 3000);
  assert.ok(plan.controls.maxRows <= 100);
  assert.deepEqual(plan.values, ["2026", "R3-M01"]);
  assert.ok(Object.isFrozen(plan));
});

test("only catalog operation names are accepted; raw SQL and unknown options fail closed", () => {
  assert.throws(
    () => buildDiagnosticPlan({ catalog, ...invocation, operationName: "select_anything" }),
    (error) => code(error) === "UNKNOWN_OPERATION",
  );
  assert.throws(
    () => buildDiagnosticPlan({ catalog, ...invocation, sql: "SELECT 1" }),
    (error) => code(error) === "UNKNOWN_OPTION",
  );
});

test("a representative historical JSON whole-dataset comparison is rejected", () => {
  const heavySql = [
    "SELECT jsonb_agg(jsonb_build_object('revision_id', r.revision_id))",
    "FROM scoring_authority.calcutta_result_revisions AS r",
    "WHERE r.tournament_id = $1 LIMIT 10",
  ].join(" ");
  const heavy = catalogWith(
    "known_heavy_history_comparison",
    boundedDefinition(heavySql, ["scoring_authority.calcutta_result_revisions"]),
  );

  assert.throws(
    () => validateDiagnosticCatalog(heavy),
    (error) => ["HEAVY_QUERY_SHAPE", "FORBIDDEN_RELATION"].includes(code(error)),
  );
});

test("EXPLAIN ANALYZE and administrative SQL are rejected before execution", () => {
  const explain = catalogWith(
    "explain_current_match",
    boundedDefinition(
      "EXPLAIN ANALYZE SELECT tournament_id FROM scoring_authority.matches WHERE tournament_id = $1 LIMIT 1",
      ["scoring_authority.matches"],
    ),
  );
  assert.throws(
    () => validateDiagnosticCatalog(explain),
    (error) => code(error) === "UNSAFE_SQL",
  );
});

test("maintenance mode is allowed only in verified isolated non-production", () => {
  assert.throws(
    () => buildDiagnosticPlan({
      catalog,
      ...invocation,
      mode: "maintenance",
      isolationVerified: true,
    }),
    (error) => code(error) === "MAINTENANCE_ISOLATION_REQUIRED",
  );
  assert.throws(
    () => buildDiagnosticPlan({
      catalog,
      ...invocation,
      mode: "maintenance",
      isolationVerified: true,
      allowProductionOverride: true,
    }),
    (error) => code(error) === "UNKNOWN_OPTION",
  );

  const plan = buildDiagnosticPlan({
    catalog,
    ...invocation,
    mode: "maintenance",
    environment: "isolated-non-production",
    isolationVerified: true,
  });
  assert.equal(plan.environment, "isolated-non-production");
});

test("missing, malformed, and extra current IDs are rejected", () => {
  assert.throws(
    () => buildDiagnosticPlan({
      catalog,
      ...invocation,
      parameters: { tournamentId: "2026" },
    }),
    (error) => code(error) === "INVALID_CURRENT_ID",
  );
  assert.throws(
    () => buildDiagnosticPlan({
      catalog,
      ...invocation,
      parameters: { tournamentId: "2026", matchId: "R3 M01" },
    }),
    (error) => code(error) === "INVALID_CURRENT_ID",
  );
  assert.throws(
    () => buildDiagnosticPlan({
      catalog,
      ...invocation,
      parameters: { tournamentId: "2026", matchId: "R3-M01", limit: 100000 },
    }),
    (error) => code(error) === "UNKNOWN_PARAMETER",
  );
});

test("runner enforces one in-flight operation and does not retry", async () => {
  let release;
  let calls = 0;
  const wait = new Promise((resolve) => { release = resolve; });
  const runner = createDiagnosticRunner({
    catalog,
    execute: async () => {
      calls += 1;
      await wait;
      return [{ match_id: "R3-M01" }];
    },
  });

  const first = runner.run(invocation);
  await assert.rejects(
    runner.run(invocation),
    (error) => code(error) === "CONCURRENCY_LIMIT",
  );
  release();
  const result = await first;
  assert.equal(result.rowCount, 1);
  assert.equal(calls, 1);
});

test("runner aborts at the operation time budget", async () => {
  const shortCatalog = structuredClone(catalog);
  shortCatalog.operations.current_match_summary.budget.timeoutMs = 15;
  const runner = createDiagnosticRunner({
    catalog: shortCatalog,
    execute: (plan, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("adapter cancelled")), { once: true });
    }),
  });

  await assert.rejects(
    runner.run(invocation),
    (error) => code(error) === "TIME_BUDGET_EXCEEDED",
  );
});

test("runner rejects row and payload overages after one execution", async () => {
  let calls = 0;
  const rowRunner = createDiagnosticRunner({
    catalog,
    execute: async () => {
      calls += 1;
      return [{}, {}];
    },
  });
  await assert.rejects(
    rowRunner.run(invocation),
    (error) => code(error) === "ROW_BUDGET_EXCEEDED",
  );

  const payloadRunner = createDiagnosticRunner({
    catalog,
    execute: async () => {
      calls += 1;
      return [{ match_id: "x".repeat(9000) }];
    },
  });
  await assert.rejects(
    payloadRunner.run(invocation),
    (error) => code(error) === "PAYLOAD_BUDGET_EXCEEDED",
  );
  assert.equal(calls, 2);
});

test("catalog validation rejects function calls, CTEs, and subqueries", () => {
  const functionCatalog = catalogWith(
    "function_current_match",
    boundedDefinition(
      "SELECT lower(m.match_id) FROM scoring_authority.matches AS m WHERE m.tournament_id = $1 LIMIT 1",
      ["scoring_authority.matches"],
    ),
  );
  assert.throws(
    () => validateDiagnosticCatalog(functionCatalog),
    (error) => code(error) === "FUNCTION_CALL_FORBIDDEN",
  );

  const cteCatalog = catalogWith(
    "cte_current_match",
    boundedDefinition(
      "WITH scoped AS (SELECT m.match_id FROM scoring_authority.matches AS m WHERE m.tournament_id = $1 LIMIT 1) SELECT scoped.match_id FROM scoped LIMIT 1",
      ["scoring_authority.matches"],
    ),
  );
  assert.throws(
    () => validateDiagnosticCatalog(cteCatalog),
    (error) => code(error) === "UNSAFE_SQL",
  );

  const subqueryCatalog = catalogWith(
    "subquery_current_match",
    boundedDefinition(
      "SELECT m.match_id FROM scoring_authority.matches AS m WHERE m.tournament_id = $1 AND m.match_id IN (SELECT h.match_id FROM scoring_authority.hole_scores AS h LIMIT 1) LIMIT 1",
      ["scoring_authority.matches", "scoring_authority.hole_scores"],
    ),
  );
  assert.throws(
    () => validateDiagnosticCatalog(subqueryCatalog),
    (error) => code(error) === "SUBQUERY_FORBIDDEN",
  );
});
