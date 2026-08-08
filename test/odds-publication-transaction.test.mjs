import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("official projection reporting views publish in one field-scoped Sheets mutation", async () => {
  const source = await read("lib/google-sheets-write.js");
  const start = source.indexOf("export async function publishOddsSnapshot");
  const end = source.indexOf("const AUDIT_HEADERS", start);
  const publication = source.slice(start, end);
  assert.match(publication, /replaceRuntimeRecordSets\(\[/);
  assert.match(publication, /Odds Snapshots/);
  assert.match(publication, /Odds Control/);
  assert.match(publication, /Odds Team Results/);
  assert.match(publication, /Odds Player Results/);
  assert.doesNotMatch(publication, /replaceRuntimeRecords\(/);
  assert.match(source, /await google\("\/values:batchUpdate"/);
  assert.match(source, /normalizeWorkbookProducerRecord\(tab, updates\)/);
  assert.match(source, /validateFieldWrite\(tab, sheet\.headers, normalized\)/);
  assert.match(publication, /normalizeWorkbookProducerRecord\("Odds Player Results"/);
});

test("Preview publication logs exact server diagnostics while returning generic copy", async () => {
  const route = await read("app/api/odds/publish/route.js");
  for (const field of ["stepReached", "workbookOperation", "simulationPhase", "worksheet", "function", "rootCause", "stack", "transactionRollback"]) assert.match(route, new RegExp(field));
  assert.match(route, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(route, /console\.error\("Championship projection publication failed", details\)/);
  assert.match(route, /Championship projections could not be published\. Please try again\./);
});
