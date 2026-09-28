#!/usr/bin/env node
// Enhanced SQL proof, exclusively on a newly created private Unix-socket DB.
// This is deliberately separate from latency samples: nested plan logging adds cost.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolatedCluster, createDatabase, destroyIsolatedCluster,
  sqlResult, repositoryRoot } from "../../test/support/reliability/postgres17.mjs";
import { installRelease139Schema, installRelease139FunctionCandidates,
  } from "../../test/support/reliability/release139-schema.mjs";
import { seedSyntheticTournament } from "../../test/support/reliability/synthetic-tournament.mjs";
import { benchmarkOperations } from "../../test/support/reliability/benchmark-operations.mjs";
import { initializeBenchmarkScaleVariants, benchmarkDatabaseForOperation }
  from "../../test/support/reliability/benchmark-fixtures.mjs";
import { measurementEnvironment } from "../../test/support/reliability/measurement-metadata.mjs";
import { validateBenchmarkResult } from "../../test/support/reliability/benchmark-result-validation.mjs";
import { summarizePlanStatements } from "../../test/support/reliability/plan-evidence.mjs";

if (process.argv.length !== 2) throw new Error("No connection strings or arguments accepted");
const digest = value => createHash("sha256").update(value).digest("hex");

function balancedObject(text, start) {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("Truncated auto_explain JSON");
}

function extractPlans(text) {
  const plans = [];
  for (const match of text.matchAll(/duration:\s+([0-9.]+)\s+ms\s+plan:\s*/g)) {
    const start = match.index + match[0].length;
    assert.equal(text[start], "{", "auto_explain JSON required");
    const plan = JSON.parse(balancedObject(text, start));
    plans.push({ durationMs: Number(match[1]), ...plan });
  }
  return plans;
}

function compactPlan(node) {
  const keep = ["Node Type", "Parent Relationship", "Relation Name", "Alias", "Index Name",
    "Join Type", "Scan Direction", "Plan Rows", "Plan Width", "Total Cost",
    "Actual Rows", "Actual Loops", "Rows Removed by Filter", "Rows Removed by Index Recheck",
    "Rows Removed by Join Filter", "Shared Hit Blocks", "Shared Read Blocks",
    "Temp Read Blocks", "Temp Written Blocks", "Sort Method", "Sort Space Used", "Sort Space Type"];
  return Object.fromEntries([
    ...keep.filter(key => node[key] !== undefined).map(key => [key, node[key]]),
    ...(node.Plans ? [["Plans", node.Plans.map(compactPlan)]] : []),
  ]);
}

function scanNodes(node, result = []) {
  if (node["Relation Name"] || /Sort|Aggregate|Join/.test(node["Node Type"] || "")) result.push(node);
  for (const child of node.Plans || []) scanNodes(child, result);
  return result;
}

const selected = new Set(["score-write", "score-readback", "participant-today", "matches", "leaders",
  "prepare-match", "round-open", "round-lock", "round-resume", "finalize", "director-current",
  "net-skins-read", "net-skins-calculation", "calcutta-read", "calcutta-calculation", "odds-read", "odds-calculation"]);
const cluster = await createIsolatedCluster();
const results = { schemaVersion: 1, generatedAt: new Date().toISOString(),
  proofLayer: "SQL", production: false, scales: [],
  method: "auto_explain with log_nested_statements/analyze/buffers enabled only for the measured invocation; setup is excluded. Query text is hashed and omitted; plans retain relation/index/row/buffer structure.",
  limitations: ["Plan runs are instrumented, not comparable latency samples.",
    "Repeated plans are grouped by exact query hash and plan shape, retaining invocation counts and per-node numeric ranges; one highest-duration observation represents each group.",
    "Nested logged statement count is not network query count or unique rows scanned.",
    "Aggregate node row counts include repeated work; no sum is advertised as unique rows examined.",
    "ROLLBACK excludes durable commit cost. Provider admission substitutions are identical to the benchmark fixture.",
    "Small-table sequential scans are not inherently regressions. Review growth and selectivity, not scan labels alone."],
};
try {
  createDatabase(cluster, "rel139_template");
  await installRelease139Schema(cluster, "rel139_template");
  installRelease139FunctionCandidates(cluster, "rel139_template");
  seedSyntheticTournament(cluster, "rel139_template");
  results.environment = measurementEnvironment(cluster, "rel139_template");
  for (const scale of [1, 10]) {
    const databases = initializeBenchmarkScaleVariants(cluster, scale);
    const operations = [];
    for (const operation of benchmarkOperations.filter(value => selected.has(value.id))) {
      const { database, fixtureVariant } = benchmarkDatabaseForOperation(operation.id, databases);
      const result = sqlResult(cluster, database, `begin;
        ${operation.setupSql || ""}
        load 'auto_explain';
        set local client_min_messages=log;
        set local auto_explain.log_min_duration=0;
        set local auto_explain.log_analyze=on;
        set local auto_explain.log_buffers=on;
        set local auto_explain.log_timing=off;
        set local auto_explain.log_nested_statements=on;
        set local auto_explain.log_format=json;
        ${operation.sql};
        set local auto_explain.log_min_duration=-1;
        rollback;`);
      const plans = extractPlans(result.stderr || "");
      let semantic = null;
      let failure = result.status === 0 && !result.error ? null : "SQL plan invocation did not complete successfully.";
      if (failure === null) {
        try { semantic = validateBenchmarkResult(operation, result.stdout); }
        catch (error) { failure = error.message; }
      }
      if (failure === null && plans.length === 0) failure = "No query plans were captured.";
      const statements = plans.map(entry => {
        const plan = compactPlan(entry.Plan);
        const nodes = scanNodes(plan);
        return { querySha256: digest(entry["Query Text"] || ""),
          durationMsWithPlanLogging: entry.durationMs,
          sequentialScans: nodes.filter(node => node["Node Type"] === "Seq Scan").map(node => node["Relation Name"]),
          relations: [...new Set(nodes.map(node => node["Relation Name"]).filter(Boolean))],
          temporaryWrittenBlocks: entry.Plan["Temp Written Blocks"] ?? 0,
          plan };
      });
      operations.push({ id: operation.id, operation: operation.label, coverage: operation.coverage,
        fixtureVariant: operation.fixtureVariant || fixtureVariant,
        success: failure === null,
        semantic, loggedStatements: statements.length,
        failure,
        distinctQueryPlanShapes: summarizePlanStatements(statements) });
      process.stdout.write(`PLAN ${scale}x ${operation.id}: ${statements.length} statements\n`);
    }
    results.scales.push({ scale, operations });
  }
} finally { await destroyIsolatedCluster(cluster); }
const output = path.join(repositoryRoot, "docs/reliability/performance/QUERY-PLAN-RESULTS.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(results, null, 2) + "\n");
process.stdout.write(`${output}\n`);
if (results.scales.some(scale => scale.operations.some(operation => !operation.success))) process.exitCode = 1;
