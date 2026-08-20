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
  for (const action of ["match-management", "round-pairings", "calcutta-management", "net-skins-eligibility"]) {
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
  assert.match(consoleSource, /const success = await saveOperation[\s\S]*if \(success\) \{ setPairingsDirty\(false\); setActive\(null\); \}/);
  assert.match(dashboard, /setToast\("✓ Changes Saved"\)/);
  assert.match(css, /operationSheetScroller\{[^}]*overflow-y:auto/);
  assert.match(css, /operationSheet>header/);
  assert.match(css, /min-height:44px/);
});

test("Round Pairings uses the active-year team roster and one verified batch mutation", () => {
  const consoleSource = source("app/admin/director/DirectorOperationsConsole.js");
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  const writes = source("lib/google-sheets-write.js");
  const route = source("app/api/director/route.js");
  assert.match(consoleSource, /Round Pairings/);
  assert.match(consoleSource, /Unsaved Pairing Changes/);
  assert.match(editors, /pairingSlotsForFormat/);
  assert.match(editors, /player\.side\) === side/);
  assert.match(editors, /Save Round Pairings/);
  assert.match(editors, /const updates = changedMatches\.map[\s\S]*roundPairingDraft/);
  assert.match(writes, /const rosterRows = records\("Handicaps"\)/);
  assert.match(writes, /allPlayers\.filter\(\(player\) => rosterById\.has\(player\.id\)\)/);
  assert.match(writes, /record\["Team Names"\]/);
  assert.match(writes, /updateDirectorRoundPairings/);
  assert.match(writes, /writeSheetFieldBatch\("Live Matches"/);
  assert.match(writes, /action: "Round Pairings Updated"/);
  assert.match(route, /action === "round-pairings"/);
  assert.match(route, /verifyActionReadBack/);
});

test("Round Pairings renders every format as an always-editable lineup sheet", () => {
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  const css = source("app/admin/director/director.module.css");
  const pairings = editors.slice(editors.indexOf("export function RoundPairingsManagement"), editors.indexOf("export function CourseTeesManagement"));
  assert.match(pairings, /roundPairingCard/);
  assert.match(pairings, /roundPairingSides/);
  assert.match(pairings, /pairingSlotsForFormat\(match\.format\)/);
  assert.match(pairings, /Save Round Pairings/);
  assert.doesNotMatch(pairings, /<details|<summary|>Edit</);
  assert.match(css, /\.roundPairingSides\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:430px\)\{\.roundPairingSides\{grid-template-columns:1fr/);
  assert.match(css, /\.roundPairingSides select\{[^}]*min-height:46px/);
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

test("Calcutta purchase and ownership are edited and verified as one transaction", () => {
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
  assert.match(editors, /operation: "calcutta-session"/);
  assert.match(editors, /purchasePrice: Number\(price\), owners:/);
  assert.doesNotMatch(editors, /operation: "purchase"/);
  assert.match(editors, /Purchase Price modified/);
  assert.match(editors, /Ownership updated/);
  assert.match(editors, /owner change/);
  assert.match(editors, /Save Changes/);
  assert.match(writes, /input\.operation === "calcutta-session"/);
  assert.match(writes, /replaceScopedRuntimeRecordSets/);
  assert.match(writes, /tab: "Calcutta Purchases", sheet: purchaseSheet, fields: \["Purchase Price"\]/);
  assert.match(writes, /tab: "Calcutta Ownership", sheet: ownershipSheet/);
  assert.match(writes, /belongsToScope: \(record\) => String\(record\.Year\) === year && String\(record\["Golfer Player ID"\]\) === golferPlayerId/);
  assert.match(route, /input\.operation === "calcutta-session"/);
  assert.match(route, /purchaseVerified/);
  assert.match(route, /actual\.length === expected\.length/);
});

test("Match Management exposes contextual lifecycle controls through the verified Director pipeline", () => {
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  const consoleSource = source("app/admin/director/DirectorOperationsConsole.js");
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  const route = source("app/api/director/route.js");
  const writes = source("lib/google-sheets-write.js");

  assert.match(editors, /Match Controls/);
  assert.match(editors, /Scoring Access/);
  for (const label of ["Unlock Scoring", "Lock Scoring", "Mark Live", "Mark Final", "Reopen Match"]) assert.match(editors, new RegExp(label));
  assert.match(editors, /Finalize Match\?/);
  assert.match(editors, /Reopen Match\?/);
  assert.match(editors, /final && operations\.capabilities\.matchStatus/);
  assert.match(editors, /!final && operations\.capabilities\.scoringAccess && !unlocked/);
  assert.match(editors, /!final && operations\.capabilities\.scoringAccess && unlocked/);
  assert.match(consoleSource, /operate=\{operateMatch\}/);
  assert.match(dashboard, /operateMatch=\{async/);

  assert.match(route, /match-unlock-scoring[\s\S]*enableLiveMatchAccess/);
  assert.match(route, /match-lock-scoring[\s\S]*disableLiveMatchAccess/);
  assert.match(route, /match-mark-live[\s\S]*markLiveMatch\(input\.matchId, updatedBy\)/);
  assert.match(route, /match-finalize[\s\S]*finalizeLiveMatch\(input\.matchId, \{\}, updatedBy\)/);
  assert.match(route, /match-reopen[\s\S]*reopenLiveMatch\(input\.matchId, updatedBy\)/);
  assert.match(route, /verifyDirectorReadBack/);
  assert.match(route, /operationsAction = \[[^\]]*"match-finalize"[^\]]*"match-reopen"/);
  assert.match(writes, /scoringUnlocked: truthy\(record\["Access Active"\]\) && !accessExpired\(record\) && !\/\^Final\$\/i\.test/);
  assert.match(writes, /Only a Scheduled match can be marked Live\. Use Reopen Match for a Final result\./);
});

test("match status and scoring access remain separate authoritative capabilities", () => {
  const writes = source("lib/google-sheets-write.js");
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  assert.match(writes, /matchStatus: sheets\["Live Matches"\]\.headers\.includes\("Match Status"\) && writableFields\("Live Matches"\)\.includes\("Match Status"\)/);
  assert.match(writes, /scoringAccess: MATCH_ACCESS_HEADERS\.every/);
  assert.match(editors, /const unlocked = match\.scoringUnlocked === true/);
  assert.doesNotMatch(editors, /unlocked\s*=\s*live|live\s*=\s*unlocked/);
});
