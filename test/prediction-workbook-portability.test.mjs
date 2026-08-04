import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("prediction workbook discovery uses authenticated logical worksheet names", async () => {
  const source = await read("lib/prediction-data.js");
  assert.match(source, /readWorkbookSheetTitles/);
  assert.match(source, /readWorkbookSheetsByName/);
  assert.match(source, /source: matchedName \? "authenticated-name"/);
  assert.doesNotMatch(source, /pubhtml|csvUrlByGid|discoverPublishedSheetGids|Tab gid not discovered/);
});

test("the authenticated workbook reader batches A1 ranges by worksheet title", async () => {
  const source = await read("lib/google-sheets-write.js");
  assert.match(source, /export async function readWorkbookSheetTitles/);
  assert.match(source, /export async function readWorkbookSheetsByName\(tabs\)/);
  assert.match(source, /query\.append\("ranges", `\$\{tab\}!A:ZZ`\)/);
});
