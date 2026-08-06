import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Mission Control exposes one searchable collapsible operations console", () => {
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  const consoleSource = source("app/admin/director/DirectorOperationsConsole.js");
  for (const section of ["Competition", "Preview Tools", "Operational Log"]) {
    assert.match(dashboard, new RegExp(`title=\\"${section}\\"`));
  }
  assert.match(dashboard, /DirectorOperationsHub/);
  assert.match(consoleSource, /Search player, match, Calcutta, Net Skins/);
  for (const resultType of ["Match", "Calcutta", "Net Skins", "Notification", "Player Profile"]) assert.match(consoleSource, new RegExp(resultType));
  assert.match(consoleSource, /DirectorBottomSheet/);
  assert.match(consoleSource, /dynamic\(\(\) => import\("\.\/DirectorOperationEditors\.js"\)/);
});

test("new operations reuse the verified Director transaction and read-back pipeline", () => {
  const route = source("app/api/director/route.js");
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  for (const action of ["match-management", "calcutta-management", "net-skins-eligibility"]) {
    assert.match(route, new RegExp(action));
    assert.match(editors, new RegExp(action));
  }
  assert.match(route, /const authorization = await authorize\(request\)/);
  assert.match(route, /verifyDirectorReadBack/);
  assert.match(route, /invalidateTournamentDataCache/);
  assert.match(dashboard, /const response = await directorFetch\("\/api\/director"/);
});

test("operational editors mount on demand and close only after verified success", () => {
  const consoleSource = source("app/admin/director/DirectorOperationsConsole.js");
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  const css = source("app/admin/director/director.module.css");
  assert.match(consoleSource, /active\?\.type === "match"/);
  assert.match(consoleSource, /const success = await saveOperation[\s\S]*if \(success\) close\(\)/);
  assert.match(dashboard, /setToast\("✓ Changes Saved"\)/);
  assert.match(css, /operationSheetScroller\{[^}]*overflow-y:auto/);
  assert.match(css, /operationSheet>header/);
  assert.match(css, /min-height:44px/);
});

test("Mission Control writes remain field-scoped and protected-map aware", () => {
  const writes = source("lib/google-sheets-write.js");
  assert.match(writes, /updateDirectorMatchManagement/);
  assert.match(writes, /writableFields\("Live Matches"\)/);
  assert.match(writes, /writeSheetFields\("Live Matches"/);
  assert.match(writes, /writeSheetFields\("Calcutta Purchases"/);
  assert.match(writes, /writeSheetFields\("Calcutta Ownership"/);
  assert.match(writes, /appendSheetFields\("Calcutta Ownership"/);
  assert.match(writes, /tab: "Net Skins", sheet, fields: \["Eligible"\]/);
  assert.doesNotMatch(writes, /updateDirector(?:MatchManagement|Calcutta|NetSkins)[\s\S]{0,2500}(?:appendDimension|insertDimension|addSheet)/);
});

test("Starting Hole is capability-gated by both the protected map and active sheet header", () => {
  const writes = source("lib/google-sheets-write.js");
  const workbookMap = source("lib/workbook-protection.js");
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  assert.match(writes, /startingHole: sheets\["Live Matches"\]\.headers\.includes\("Starting Hole"\) && writableFields\("Live Matches"\)\.includes\("Starting Hole"\)/);
  const liveMap = workbookMap.slice(workbookMap.indexOf('"Live Matches"'), workbookMap.indexOf("Matches: merge"));
  assert.match(liveMap, /columns\(WRITABLE,[^\n]*"Starting Hole"/);
  assert.match(editors, /operations\.capabilities\.startingHole \? \{ "Starting Hole": clean\(match\.startingHole\) \} : \{\}/);
  assert.match(editors, /operations\.capabilities\.startingHole \? <label>Starting Hole/);
  assert.doesNotMatch(editors, /Starting Hole is not writable|capabilityNote/);
});

test("Net Skins eligibility is edited, batch-written, and verified across configured rounds", () => {
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  const writes = source("lib/google-sheets-write.js");
  const route = source("app/api/director/route.js");
  assert.match(editors, /skinsBulkEditor/);
  assert.match(editors, /Round \{item\.round\} • \{item\.format\}/);
  assert.match(editors, /role="switch"/);
  assert.match(editors, /Unsaved Changes/);
  assert.match(editors, /data-highlighted=\{highlightedRound === item\.round/);
  assert.match(editors, /aria-label=\{`Unsaved Changes\. \$\{pending\.length\} update/);
  assert.doesNotMatch(editors, /<span>\{eligible \? "Eligible" : "Ineligible"\}<\/span>/);
  assert.match(editors, /Save Changes/);
  assert.match(editors, /updates: pending\.map/);
  assert.match(writes, /fields: \["Eligible"\]/);
  assert.match(writes, /replaceScopedRuntimeRecordSets/);
  assert.match(writes, /action: "Bulk Eligibility Updated"/);
  assert.match(route, /Array\.isArray\(input\.updates\)/);
  assert.match(route, /updates\.every/);
});

test("Calcutta ownership is edited and verified as one complete group", () => {
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  const writes = source("lib/google-sheets-write.js");
  const route = source("app/api/director/route.js");
  assert.match(editors, /\+ Add Another Owner/);
  assert.match(editors, /Ownership Total/);
  assert.match(editors, /Ready to Save/);
  assert.match(editors, /Need \$\{100 - total\}% more/);
  assert.match(editors, /Reduce ownership by \$\{total - 100\}%/);
  assert.match(editors, /ownerSelectRefs\.current\[pendingOwnerFocus\.current\]\?\.focus/);
  assert.match(editors, /ownershipPercentInput/);
  assert.match(editors, /aria-label=\{`Remove owner \$\{index \+ 1\}`\}/);
  assert.match(editors, /Ownership percentages must total exactly 100%/);
  assert.match(editors, /Each owner may only appear once/);
  assert.match(editors, /operation: "owner-group"/);
  assert.match(editors, /Save Changes/);
  assert.match(writes, /input\.operation === "owner-group"/);
  assert.match(writes, /replaceScopedRuntimeRecordSets/);
  assert.match(writes, /belongsToScope: \(record\) => String\(record\.Year\) === year && String\(record\["Golfer Player ID"\]\) === golferPlayerId/);
  assert.match(route, /input\.operation === "owner-group"/);
  assert.match(route, /actual\.length === expected\.length/);
});
