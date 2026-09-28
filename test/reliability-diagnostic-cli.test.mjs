import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "tools/reliability/diagnostic-runner.mjs");

test("CLI emits a validated plan and never executes a database query", () => {
  const result = spawnSync(process.execPath, [
    cli,
    "--operation", "current_ingress_authority",
    "--mode", "tournament",
    "--environment", "production",
    "--params", JSON.stringify({ tournamentId: "2026" }),
  ], { cwd: root, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "VALIDATED_PLAN_ONLY");
  assert.equal(output.executionEnabled, false);
  assert.equal(output.plan.controls.readOnly, true);
  assert.equal(output.plan.controls.connectionLimit, 1);
});

test("CLI rejects raw SQL and execute flags", () => {
  for (const args of [
    ["--sql", "SELECT 1"],
    ["--execute"],
    ["--catalog", "/tmp/untrusted-catalog.json"],
  ]) {
    const result = spawnSync(process.execPath, [
      cli,
      "--operation", "current_ingress_authority",
      "--mode", "tournament",
      "--environment", "production",
      "--params", JSON.stringify({ tournamentId: "2026" }),
      ...args,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).status, "REJECTED");
  }
});
