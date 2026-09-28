// Proof layer: UNIT / INTEGRATION. No database or network is opened.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDatabase, destroyIsolatedCluster, openSqlSession, sql, sqlResult, sqlFile,
  timedSqlSamples } from "./support/reliability/postgres17.mjs";

test("BENCH-SAFE-001 every SQL entrypoint rejects a caller-created remote cluster", async () => {
  const forged = { marker: Symbol("isolated-reliability-cluster"),
    directory: "/tmp/bagger-reliability-pg17-forged", socket: "production.example.invalid",
    port: 5432, data: "/tmp/forged", started: true };
  for (const invoke of [
    () => createDatabase(forged, "probe"),
    () => sql(forged, "probe", "select 1"),
    () => sqlResult(forged, "probe", "select 1"),
    () => timedSqlSamples(forged, "probe", "select 1", 1),
    () => sqlFile(forged, "probe", "/tmp/anything.sql"),
    () => openSqlSession(forged, "probe"),
  ]) assert.throws(invoke, /isolated cluster object required/);
  await assert.rejects(destroyIsolatedCluster(forged), /isolated cluster object required/);
});

test("BENCH-SAFE-002 remote connection CLI arguments fail before database creation", () => {
  const script = fileURLToPath(new URL("../tools/reliability/benchmark-history.mjs", import.meta.url));
  for (const flag of ["--database-url", "--host", "--connection", "--production"]) {
    const result = spawnSync(process.execPath, [script, flag, "production.example.invalid"], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8", timeout: 10000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported benchmark option/);
    assert.doesNotMatch(result.stderr, /initdb|pg_ctl|database system/);
  }
});
