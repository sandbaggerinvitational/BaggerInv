import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("Step 11.6 browser control owns WAF and Drive ACL rehearsal continuation", async () => {
  const client = await read(
    "app/admin/step11-6-production-google-writer-fence/WriterFenceClient.js",
  );

  for (const action of [
    "inspect-drive-acl-rehearsal",
    "downgrade-drive-acl-rehearsal",
    "restore-drive-acl-rehearsal",
  ]) assert.match(client, new RegExp(`post\\(\\"${action}\\"`));

  for (const action of [
    "install-vercel-waf-provider-fence",
    "reattest-vercel-waf-provider-fence",
    "restore-vercel-waf-provider-baseline",
  ]) assert.match(client, new RegExp(`\\"${action}\\"`));
  assert.match(client, /async function executeWafProvider/);

  for (const retiredAction of ["inspect", "rehearse", "restore"]) {
    assert.doesNotMatch(client, new RegExp(`post\\(\\"${retiredAction}\\"`));
  }
  for (const retiredCopy of [
    "Apply Rehearsal Fence",
    "Apply and restore",
    "Restore exact rehearsal fence",
    "installing the exact rehearsal protections",
  ]) assert.doesNotMatch(client, new RegExp(retiredCopy, "i"));

  assert.match(client, /Downgrade legacy Drive writer to reader/);
  assert.match(client, /Continue ACL settlement/);
  assert.match(client, /settlementRemainingWaitSeconds/);
  assert.match(client, /wafInstallRequestId/);
  assert.match(client, /wafReattestRequestId/);
  assert.match(client, /wafRestoreRequestId/);
  assert.match(client, /criticalWafObservationId/);
  assert.match(client, /criticalWafQuiesceStage/);
  assert.match(client, /RESTORE_REATTEST/);
  assert.match(client, /!wafReattestationComplete \|\|\s*!verifiedQuiesce \|\|/);
  assert.match(client, /Restore legacy Drive writer permission/);
  assert.match(client, /Restore exact Vercel WAF baseline/);
  assert.doesNotMatch(client, /protected[- ]range/i);
  assert.match(client, /priorEvidenceIdForCycle/);
  assert.match(client, /quiesceRefreshPending/);
});

test("quiesce receipt adapter binds the exact durable critical-WAF observation", async () => {
  const receipt = await read(
    "lib/production-google-writer-fence-receipt-server.js",
  );
  assert.match(receipt, /async function criticalWafQuiesceBinding/);
  assert.match(receipt, /input\.criticalWafEpochId/);
  assert.match(receipt, /input\.criticalWafObservationId/);
  assert.match(receipt, /input\.criticalWafQuiesceStage/);
  assert.match(receipt, /critical_active_observation_id/);
  assert.match(receipt, /latest_critical_reattest_observation_id/);
  assert.match(receipt, /stage === "INSTALL" && status !== "ACTIVE_UNBOUND"/);
  assert.match(receipt, /stage === "RESTORE_REATTEST" && status !== "FENCE_BOUND"/);
  const begin = receipt.slice(
    receipt.indexOf("begin: async ({ input, environment, normalized, probes"),
    receipt.indexOf("finalize: async ({ input, environment, normalized, probes"),
  );
  const finalize = receipt.slice(
    receipt.indexOf("finalize: async ({ input, environment, normalized, probes"),
    receipt.indexOf("inspect: async ({ input, environment })", receipt.indexOf(
      "finalize: async ({ input, environment, normalized, probes",
    )),
  );
  for (const stage of [begin, finalize]) {
    assert.match(stage, /criticalWafQuiesceBinding\(/);
    assert.match(stage, /\.\.\.criticalWafBinding/);
  }
});

// Retired behavior: Retired Drive/protected-range executor route is disconnected, so its old action dispatch source is absent; preserve maintenance-only tooling and no runtime dispatch. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.
