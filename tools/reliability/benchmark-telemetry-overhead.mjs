#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { observedJsonRpc, withOperationalRoute } from "../../lib/operational-telemetry.js";
import {
  createDatabase, createIsolatedCluster, destroyIsolatedCluster, jsonLiteral,
  repositoryRoot, sql,
} from "../../test/support/reliability/postgres17.mjs";
import {
  installCertifiedSqlRepairs, installRelease139FunctionCandidates,
  installRelease139Schema, release139Sha,
} from "../../test/support/reliability/release139-schema.mjs";
import { seedSyntheticSideGameHistory } from "../../test/support/reliability/synthetic-history.mjs";
import { reusableScoreInput } from "../../test/support/reliability/benchmark-operations.mjs";
import { seedSyntheticTournament } from "../../test/support/reliability/synthetic-tournament.mjs";
import { measurementEnvironment } from "../../test/support/reliability/measurement-metadata.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  assert.ok(process.argv[index + 1], `${name} requires a value`);
  return process.argv[index + 1];
}

for (let index = 2; index < process.argv.length; index += 2) {
  assert.equal(process.argv[index], "--samples", "Unsupported overhead benchmark option");
  assert.ok(process.argv[index + 1], "--samples requires a value");
}

const samples = Number(option("--samples", "30"));
assert.ok(Number.isInteger(samples) && samples >= 20 && samples <= 100);
const output = path.join(repositoryRoot, "docs", "reliability", "performance",
  "TELEMETRY-OVERHEAD.json");

function percentile(values, value) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * value / 100) - 1];
}

function summarize(values) {
  return {
    samples: values.length,
    medianMs: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: values.length >= 100 ? percentile(values, 99) : null,
    p99Status: values.length >= 100 ? "MEASURED" : "INSUFFICIENT_SAMPLE",
    maxMs: Math.max(...values),
  };
}

const cluster = await createIsolatedCluster();
try {
  createDatabase(cluster, "telemetry_overhead");
  await installRelease139Schema(cluster, "telemetry_overhead");
  installRelease139FunctionCandidates(cluster, "telemetry_overhead");
  seedSyntheticTournament(cluster, "telemetry_overhead");
  seedSyntheticSideGameHistory(cluster, "telemetry_overhead", 1);
  installCertifiedSqlRepairs(cluster, "telemetry_overhead");

  const environment = measurementEnvironment(cluster, "telemetry_overhead");
  const values = { uninstrumented: [], disabled: [], enabled: [] };
  let serializedEventBytes = 0;
  let serializedEvents = 0;
  const fetchImpl = async () => {
    const payload = JSON.parse(sql(cluster, "telemetry_overhead", `begin;
      select public.submit_production_hole_score(${jsonLiteral(reusableScoreInput)});
      rollback;`));
    return Response.json(payload);
  };
  const handlers = {
    uninstrumented: async () => {
      const response = await fetchImpl();
      const payload = await response.json().catch(() => null);
      return Response.json(payload);
    },
  };
  for (const mode of ["disabled", "enabled"]) {
      handlers[mode] = withOperationalRoute({
        route: "/api/mobile/v1/scoring/hole", domain: "SCORING", feature: "score_write",
      }, async () => {
        const { payload } = await observedJsonRpc({
          fetchImpl, url: "http://local.invalid/rest/v1/rpc/submit_production_hole_score",
          init: { method: "POST", headers: { "content-type": "application/json" } },
          domain: "SCORING", queryFamily: "submit_production_hole_score",
          input: reusableScoreInput, mutation: true,
        });
        return Response.json(payload);
      }, {
        enabled: mode === "enabled",
        env: {},
        sink: (event) => { serializedEvents++; serializedEventBytes += Buffer.byteLength(JSON.stringify(event)); },
      });
  }
  // Warm each path before sampling and rotate order to avoid always granting
  // one mode the warmest database cache. No random ordering or live transport.
  for (const handler of Object.values(handlers)) {
    for (let warmup = 0; warmup < 2; warmup++) {
      const response = await handler(new Request("http://local.invalid/api/mobile/v1/scoring/hole"));
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.code, "ACCEPTED", "Warmup must execute a canonical mutation");
    }
  }
  serializedEventBytes = 0; serializedEvents = 0;
  const modes = Object.keys(handlers);
  for (let index = 0; index < samples; index += 1) {
    const order = [...modes.slice(index % modes.length), ...modes.slice(0, index % modes.length)];
    for (const mode of order) {
      const started = performance.now();
      const response = await handlers[mode](new Request("http://local.invalid/api/mobile/v1/scoring/hole"));
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.code, "ACCEPTED", "Every overhead sample must execute a canonical mutation");
      values[mode].push(performance.now() - started);
    }
  }
  const uninstrumented = summarize(values.uninstrumented);
  const disabled = summarize(values.disabled);
  const enabled = summarize(values.enabled);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    release: 139,
    sha: release139Sha,
    classification: "INTEGRATION_LOCAL_SQL_PLUS_SIMULATED_HTTP_TRANSPORT",
    deployedApiMeasured: false,
    network: false,
    environment,
    scale: 1,
    method: "Rotating uninstrumented/disabled/enabled order after two warmups per mode; fetch adapter runs exact score SQL under BEGIN/ROLLBACK. Uninstrumented mode omits AsyncLocalStorage/correlation/events. Enabled sink serializes events and discards bytes without disk/network I/O.",
    uninstrumented, disabled, enabled,
    medianDeltaMs: enabled.medianMs - uninstrumented.medianMs,
    p95DeltaMs: enabled.p95Ms - uninstrumented.p95Ms,
    emissionOnlyMedianDeltaMs: enabled.medianMs - disabled.medianMs,
    serializedEventBytes, serializedEvents,
    interpretation: "Local wrapper plus RPC integration overhead; SQL child-process scheduling noise is included. Does not measure hosted console delivery or every route/auth/post-commit span. Negative differences are noise, not an optimization claim. No approved overhead budget yet.",
  }, null, 2)}\n`);
  process.stdout.write(`${output}\n`);
} finally {
  await destroyIsolatedCluster(cluster);
}
