#!/usr/bin/env node
// Local proof collector. Does not connect to providers, run benchmarks, or deploy.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
if (args.some(value => !["--sql"].includes(value))) throw new Error("Supported option: --sql (isolated local PostgreSQL only)");
const run = (command, parameters, options = {}) => spawnSync(command, parameters, {
  cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...options,
});
const git = parameters => {
  const value = run("git", parameters);
  if (value.status !== 0) throw new Error("Local Git metadata unavailable");
  return value.stdout.trim();
};
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const suites = [
  ["PRESERVATION", "INTEGRATION", "test/reliability-preservation.test.mjs"],
  ["TELEMETRY", "UNIT", "test/reliability-observability.test.mjs"],
  ["TELEMETRY_REVIEW", "UNIT", "test/reliability-observability-review.test.mjs"],
  ["TELEMETRY_API", "API", "test/reliability-observability-api.test.mjs"],
  ["TELEMETRY_EQUIVALENCE", "INTEGRATION", "test/reliability-telemetry-protected-equivalence.test.mjs"],
  ["DIAGNOSTIC_POLICY", "UNIT", "test/reliability-diagnostic-policy.test.mjs"],
  ["DIAGNOSTIC_CLI", "INTEGRATION", "test/reliability-diagnostic-cli.test.mjs"],
  ["DIAGNOSTIC_ADAPTER", "INTEGRATION", "test/reliability-diagnostic-adapter.test.mjs"],
  ["NATIVE_REPRODUCTION", "PERSISTENCE", "test/reliability-native.test.mjs"],
  ["PREPARATION_READBACK", "INTEGRATION", "test/reliability-readback.test.mjs"],
  ["BENCHMARK_SAFETY", "UNIT", "test/reliability-benchmark-harness.test.mjs"],
  ["BENCHMARK_REMOTE_REJECTION", "INTEGRATION", "test/reliability-benchmark-safety.test.mjs"],
  ["BENCHMARK_RESULT_VALIDATION", "UNIT", "test/reliability-benchmark-results.test.mjs"],
  ["QUERY_PLAN_EVIDENCE", "UNIT", "test/reliability-query-plan-evidence.test.mjs"],
];
if (args.includes("--sql")) suites.push(
  ["SQL_NEVER_AGAIN", "SQL", "test/reliability-sql-never-again-postgres.integration.test.mjs"],
  ["SCORE_HISTORY_NEVER_AGAIN", "SQL", "test/reliability-score-history-postgres.integration.test.mjs"],
  ["CORRELATION_SQL_RECEIPT", "INTEGRATION", "test/reliability-correlation-postgres.integration.test.mjs"],
);

const evidence = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  headSha: git(["rev-parse", "HEAD"]), branch: git(["branch", "--show-current"]),
  worktreeHadChanges: git(["status", "--porcelain"]).length > 0,
  environment: { scope: "LOCAL_ONLY", platform: process.platform, architecture: process.arch, node: process.version },
  production: { queried: false, mutated: false, deployed: false },
  build11Implemented: false, tournamentReady: false,
  suites: [], artifacts: [],
  limitations: [
    "Reproduction PASS means the historical defect was demonstrated, not fixed.",
    "API wrapper executes two child tests with react-server; it is not hosted or physical proof.",
    "A missing native simulator checkout produces an explicit skip, never physical PASS.",
    "This collector does not run the application build, broad legacy suite, benchmark, or physical tests.",
    "HEAD alone does not identify uncommitted source; file digests below identify exact tested input.",
  ],
};
// Include untracked foundation files, never environment files or credentials.
const sourcePaths = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--",
  "app", "lib", "test", "tools", "supabase/production_migrations",
  "supabase/production_incremental", "candidates", "package.json", "package-lock.json"]);
if (sourcePaths.status !== 0) throw new Error("Source inventory unavailable");
evidence.sourceFiles = [...new Set(sourcePaths.stdout.split("\0").filter(Boolean))].sort()
  .map(filename => ({ file: filename, sha256: hash(readFileSync(path.join(root, filename))) }));
evidence.sourceDigest = hash(JSON.stringify(evidence.sourceFiles));

for (const [id, layer, file] of suites) {
  const startedAt = new Date().toISOString();
  const result = run(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", file], { timeout: 1200000 });
  const output = result.stdout || "";
  const count = label => Number(output.match(new RegExp(`^# ${label} (\\d+)$`, "m"))?.[1] || 0);
  evidence.suites.push({ id, layer, file, startedAt, endedAt: new Date().toISOString(),
    exitCode: result.status, result: result.status === 0 ? "PASS" : "FAIL",
    tests: count("tests"), pass: count("pass"), fail: count("fail"), skipped: count("skipped"),
    outputSha256: hash(output + (result.stderr || "")),
    failedTests: [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]),
    limitation: id === "NATIVE_REPRODUCTION" ? "Historical defect reproduction; candidate behavior remains expected RED" : null,
  });
  process.stdout.write(`${id}: ${result.status === 0 ? "PASS" : "FAIL"}; ${count("pass")} pass, ${count("skipped")} skip\n`);
}
for (const file of [
  "docs/reliability/performance/BENCHMARK-RESULTS.json",
  "docs/reliability/performance/SIDEGAME-PROCESSORS.json",
  "docs/reliability/performance/QUERY-PLAN-RESULTS.json",
  "docs/reliability/performance/TELEMETRY-OVERHEAD.json",
  "docs/reliability/testing/NEVER-AGAIN-CATALOG.json",
  "docs/reliability/observability/OPERATIONAL-EVENT-SCHEMA.json",
  "docs/reliability/testing/evidence/NA-2026-006-build10.json",
  "docs/reliability/testing/evidence/NA-2026-007-build10-simulator.json",
  "docs/reliability/phase1/BUILD-EVIDENCE.json",
  "docs/reliability/phase1/REGRESSION-RESULTS.json",
]) {
  if (existsSync(path.join(root, file))) evidence.artifacts.push({ file, sha256: hash(readFileSync(path.join(root, file))) });
}
evidence.sqlRequested = args.includes("--sql");
if (!evidence.sqlRequested) evidence.limitations.push("SQL suite NOT RUN by this invocation; use --sql for an isolated PostgreSQL execution.");
evidence.result = evidence.suites.some(suite => suite.result === "FAIL") ? "FAIL" :
  (!evidence.sqlRequested || evidence.suites.some(suite => suite.skipped)) ? "PARTIAL" : "PASS";
const output = path.join(root, "docs/reliability/phase1/LOCAL-EVIDENCE.json");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
process.stdout.write(`${output}\n`);
process.exitCode = evidence.result === "FAIL" ? 1 : 0;
