// Proof layer: UNIT. Does not invoke PostgreSQL or infer runtime performance.
import assert from "node:assert/strict";
import test from "node:test";
import { summarizePlanStatements } from "./support/reliability/plan-evidence.mjs";

test("plan evidence retains shape regressions, invocation counts and node-work ranges", () => {
  const statement = (type, rows, duration, query = "one") => ({ querySha256: query,
    durationMsWithPlanLogging: duration, sequentialScans: type === "Seq Scan" ? ["history"] : [],
    relations: ["history"], temporaryWrittenBlocks: rows === 1000 ? 8 : 0,
    plan: { "Node Type": type, "Relation Name": "history", "Actual Rows": rows,
      "Actual Loops": 1, "Shared Hit Blocks": rows + 1 } });
  const result = summarizePlanStatements([
    statement("Index Scan", 1, 1), statement("Index Scan", 3, 2),
    statement("Seq Scan", 1000, 10), statement("Index Scan", 1, 1, "other"),
  ]);
  assert.equal(result.length, 3);
  assert.equal(result.reduce((sum, group) => sum + group.invocations, 0), 4);
  assert.deepEqual(result[0].nodeMetricRanges["root.Actual Rows"], { min: 1, max: 3 });
  assert.equal(result[0].plan["Actual Rows"], 3);
  assert.equal(result[1].maximumTemporaryWrittenBlocks, 8);
  assert.deepEqual(result[1].sequentialScans, ["history"]);
  assert.notEqual(result[0].shapeSha256, result[1].shapeSha256);
  assert.deepEqual(summarizePlanStatements([]), []);
});
