import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("one existing Match edit batches the pairing and audit rows into one Sheets mutation", async () => {
  const writer = await source("lib/google-sheets-write.js");
  const transaction = writer.slice(
    writer.indexOf("async function saveExistingMatchCmsRecord"),
    writer.indexOf("export async function saveCmsRecord")
  );
  assert.match(transaction, /readSheets\(\[schema\.tab, "Admin Audit Log"\]\)/);
  assert.equal((transaction.match(/await google\("\/values:batchUpdate"/g) || []).length, 1);
  assert.match(transaction, /metric\("workbookWrites", 2\)/);
  assert.match(transaction, /readProtectedFieldValues[\s\S]*readProtectedFieldValues/);
  assert.doesNotMatch(transaction, /appendAdminAudit|requireTabHeaders|writeSheetFields/);
});

test("Save Matches guards duplicate submissions and does not reload the CMS after an edit", async () => {
  const client = await source("app/admin/CmsManager.js");
  assert.match(client, /const pendingSubmission = useRef\(null\)/);
  assert.match(client, /if \(pendingSubmission\.current\) return pendingSubmission\.current/);
  assert.match(client, /x-save-transaction-id/);
  assert.match(client, /action === "save" && resource === "matches" && editingKey/);
  assert.match(client, /current\.rows\.map\(\(item\) => item\.__key === editingKey \? saved : item\)/);
});

test("CMS save instrumentation reports every transaction fan-out category", async () => {
  const route = await source("app/api/admin/cms/route.js");
  const writer = await source("lib/google-sheets-write.js");
  assert.match(route, /withWorkbookWriteDiagnostics/);
  assert.match(route, /incomingHttpRequests/);
  assert.match(route, /duplicateSubmissions/);
  assert.match(route, /cacheInvalidations/);
  assert.match(route, /downstreamOperations/);
  assert.match(route, /Admin CMS save transaction/);
  assert.match(route, /error\?\.workbookDiagnostics/);
  assert.match(route, /saveTransactions\.get\(transactionId\)/);
  assert.match(route, /MATCH_REVALIDATED_PATHS = \["\/home", "\/admin", "\/players", "\/live"\]/);
  for (const metric of ["httpRequests", "sheetsApiCalls", "workbookWrites", "retryLoops"]) {
    assert.match(writer, new RegExp(metric));
  }
});
