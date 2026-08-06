import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Mission Control exposes one searchable collapsible operations console", () => {
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  const consoleSource = source("app/admin/director/DirectorOperationsConsole.js");
  for (const section of ["Competition", "Match Management", "Calcutta", "Net Skins", "Notifications", "Preview Tools", "Operational Log"]) {
    assert.match(dashboard, new RegExp(`title=\\"${section}\\"`));
  }
  assert.match(dashboard, /DirectorSearch/);
  assert.match(consoleSource, /Search player, match, Calcutta, Net Skins/);
  for (const resultType of ["Match & Pairing", "Calcutta", "Net Skins", "Notification", "Player Profile"]) assert.match(consoleSource, new RegExp(resultType));
  assert.match(consoleSource, /className=\{styles\.operationsSection\}/);
});

test("new operations reuse the verified Director transaction and read-back pipeline", () => {
  const route = source("app/api/director/route.js");
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  for (const action of ["match-management", "calcutta-management", "net-skins-eligibility"]) {
    assert.match(route, new RegExp(action));
    assert.match(dashboard, new RegExp(action));
  }
  assert.match(route, /const authorization = await authorize\(request\)/);
  assert.match(route, /verifyDirectorReadBack/);
  assert.match(route, /invalidateTournamentDataCache/);
  assert.match(dashboard, /const response = await directorFetch\("\/api\/director"/);
});

test("Mission Control writes remain field-scoped and protected-map aware", () => {
  const writes = source("lib/google-sheets-write.js");
  assert.match(writes, /updateDirectorMatchManagement/);
  assert.match(writes, /writableFields\("Live Matches"\)/);
  assert.match(writes, /writeSheetFields\("Live Matches"/);
  assert.match(writes, /writeSheetFields\("Calcutta Purchases"/);
  assert.match(writes, /writeSheetFields\("Calcutta Ownership"/);
  assert.match(writes, /appendSheetFields\("Calcutta Ownership"/);
  assert.match(writes, /writeSheetFields\("Net Skins"/);
  assert.doesNotMatch(writes, /updateDirector(?:MatchManagement|Calcutta|NetSkins)[\s\S]{0,2500}(?:appendDimension|insertDimension|addSheet)/);
});

test("Starting Hole is capability-gated by both the protected map and active sheet header", () => {
  const writes = source("lib/google-sheets-write.js");
  const workbookMap = source("lib/workbook-protection.js");
  assert.match(writes, /startingHole: sheets\["Live Matches"\]\.headers\.includes\("Starting Hole"\) && writableFields\("Live Matches"\)\.includes\("Starting Hole"\)/);
  const liveMap = workbookMap.slice(workbookMap.indexOf('"Live Matches"'), workbookMap.indexOf("Matches: merge"));
  assert.match(liveMap, /columns\(WRITABLE,[^\n]*"Starting Hole"/);
});
