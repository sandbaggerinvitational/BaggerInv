// Proof layer: API / INTEGRATION. Isolate Next's server-only export condition;
// applying react-server to the whole suite breaks unrelated React DOM tests.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("OBS-API actual route and canonical adapter telemetry in isolated server runtime", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--test", "--test-reporter=tap",
    fileURLToPath(new URL("../tools/reliability/fixtures/observability-api.fixture.mjs", import.meta.url))], {
    // No provider credentials or deployment settings inherited by the fixture.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, BAGGER_OPERATIONAL_TELEMETRY_ENABLED: "true" },
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 2\b/);
  assert.match(result.stdout, /# fail 0\b/);
});
