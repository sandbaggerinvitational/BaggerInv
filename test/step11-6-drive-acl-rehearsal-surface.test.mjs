import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("Step 11.6 browser control exposes only the Drive ACL rehearsal actions", async () => {
  const client = await read(
    "app/admin/step11-6-production-google-writer-fence/WriterFenceClient.js",
  );

  for (const action of [
    "inspect-drive-acl-rehearsal",
    "downgrade-drive-acl-rehearsal",
    "restore-drive-acl-rehearsal",
  ]) assert.match(client, new RegExp(`post\\(\\"${action}\\"`));

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
  assert.match(client, /Restore legacy Drive writer permission/);
  assert.doesNotMatch(client, /protected[- ]range/i);
  assert.match(client, /priorEvidenceIdForCycle/);
  assert.match(client, /quiesceRefreshPending/);
});

test("Production server import surface cannot dispatch the retired protected-range executor", async () => {
  const [barrel, route, core] = await Promise.all([
    read("lib/production-google-writer-fence-rehearsal-server.js"),
    read("app/api/admin/step11-6-production-google-writer-fence/route.js"),
    read("lib/production-google-writer-fence-rehearsal.js"),
  ]);

  assert.doesNotMatch(barrel, /executeProductionGoogleWriterFenceRehearsal/);
  assert.doesNotMatch(route, /executeProductionGoogleWriterFenceRehearsal/);

  const retiredExportStart = core.indexOf(
    "export async function executeProductionGoogleWriterFenceRehearsal(",
  );
  if (retiredExportStart >= 0) {
    const nextFunction = core.indexOf(
      "\nexport async function executeProductionGoogleWriterProviderFence(",
      retiredExportStart,
    );
    assert.ok(nextFunction > retiredExportStart);
    const retiredExport = core.slice(retiredExportStart, nextFunction);
    assert.match(retiredExport, /STEP11_6_PROTECTED_RANGE_REHEARSAL_RETIRED/);
    assert.match(retiredExport, /throw fenceError\(/);
    assert.doesNotMatch(
      retiredExport,
      /executeProductionGoogleWriterFenceRehearsalWithDependencies/,
    );
  }

  for (const [external, internal] of [
    ["inspect-drive-acl-rehearsal", "inspect"],
    ["downgrade-drive-acl-rehearsal", "install"],
    ["restore-drive-acl-rehearsal", "abort-install"],
  ]) assert.match(route, new RegExp(`\\[\\"${external}\\", \\"${internal}\\"\\]`));

  for (const retiredAction of ["inspect", "rehearse", "restore"]) {
    assert.doesNotMatch(route, new RegExp(`\\[\\"${retiredAction}\\"`));
  }
});
