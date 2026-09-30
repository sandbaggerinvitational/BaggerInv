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

// Proof layer: UNIT/SOURCE. Actual PostgreSQL capability proof is indexed in CAPABILITY-GAPS.md.
test("UNIT canonical Director operations preserve revision and operation identity", async () => {
  const {buildTournamentSetupMutation}=await import("../lib/production-tournament-setup-contract.js");
  const request={expectedRevision:4,operationRequestId:"11111111-1111-4111-8111-111111111111",matchId:"M1"};
  const first=buildTournamentSetupMutation("prepare-scoring-context",request);
  assert.deepEqual(buildTournamentSetupMutation("prepare-scoring-context",request),first);
  assert.equal(first.operation_request_id,request.operationRequestId);assert.equal(first.expected_revision,4);
  assert.throws(()=>buildTournamentSetupMutation("prepare-scoring-context",{...request,operationRequestId:""}),{code:"TOURNAMENT_SETUP_OPERATION_REQUEST_ID_REQUIRED"});
  const server=source("lib/production-tournament-setup-server.js");
  assert.match(server,/read_production_tournament_setup_v1/);assert.match(server,/operation_request_id/);
  assert.doesNotMatch(server,/google-sheets-write|readWorkbook/);
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

// Proof layer: UNIT/SOURCE. Actual PostgreSQL capability proof is indexed in CAPABILITY-GAPS.md.
test("UNIT canonical round pairings preserve format slots and one revision-bound batch", async () => {
  const {buildTournamentSetupMutation}=await import("../lib/production-tournament-setup-contract.js");
  const participants=[{playerId:"P1",teamSide:1,playerSlot:1},{playerId:"P2",teamSide:2,playerSlot:1}];
  const request={expectedRevision:8,operationRequestId:"11111111-1111-4111-8111-111111111111",
    expectedHandicapRevisionId:"22222222-2222-4222-8222-222222222222",roundNumber:3,matches:[{matchId:"M1",format:"SI",participants}]};
  const result=buildTournamentSetupMutation("replace-round-pairings",request);
  assert.equal(result.operation,"REPLACE_ROUND_PAIRINGS");assert.equal(result.round_number,3);
  assert.equal(result.expected_handicap_revision_id,request.expectedHandicapRevisionId);
  assert.deepEqual(result.matches[0].participants,[{player_id:"P1",team_side:1,player_slot:1},{player_id:"P2",team_side:2,player_slot:1}]);
  assert.throws(()=>buildTournamentSetupMutation("replace-round-pairings",{...request,matches:[...request.matches,...request.matches]}),{code:"TOURNAMENT_SETUP_ROUND_MATCH_SET_INVALID"});
  assert.throws(()=>buildTournamentSetupMutation("replace-round-pairings",{...request,matches:[{...request.matches[0],participants:[participants[0]]}]}),{code:"TOURNAMENT_SETUP_PAIRING_COUNT_INVALID"});
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

// Proof layer: UNIT/SOURCE. Actual PostgreSQL capability proof is indexed in CAPABILITY-GAPS.md.
test("UNIT canonical Net Skins entries remain round-scoped and binding-aware", async () => {
  const {entryDraft,entrySaveRequest}=await import("../lib/net-skins-entry-workspace.js");
  const round={roundNumber:2,revision:5,fieldFingerprint:"a".repeat(64),configured:true,
    entrants:[{key:"PAIR1",bindingFingerprint:"b".repeat(64),entered:true},{key:"PAIR2",bindingFingerprint:"c".repeat(64),entered:false}]};
  const draft=entryDraft(round);draft.entries[1].entered=true;
  const request=entrySaveRequest(round,draft,"same-operation");
  assert.equal(request.roundNumber,2);assert.equal(request.expectedRevision,5);assert.equal(request.fieldFingerprint,round.fieldFingerprint);
  assert.equal(request.operationRequestId,"same-operation");assert.equal(request.entries[1].bindingFingerprint,"c".repeat(64));
  assert.equal(round.entrants[1].entered,false,"request assembly must not mutate authority");
  assert.deepEqual(entrySaveRequest(round,{...draft,configured:false},"other-operation").entries.map(e=>e.entered),[false,false]);
  const route=source("app/api/director/net-skins-entries/route.js");assert.match(route,/productionNetSkinsEntries/);assert.doesNotMatch(route,/google-sheets-write/);
});

// Proof layer: UNIT/SOURCE. Actual PostgreSQL capability proof is indexed in CAPABILITY-GAPS.md.
test("UNIT canonical Calcutta entry preserves exact price and complete ownership together", async () => {
  const {entryPayload,mergeEntry}=await import("../lib/calcutta-management-model.js");
  const players=["P1","P2","P3","P4"].map(player_id=>({player_id}));
  const entry={playerId:"P1",purchasePrice:"125.25",owners:[{buyerId:"P2",percentage:"60"},{buyerId:"P3",percentage:"40"}]};
  const payload=entryPayload(entry,players);
  assert.equal(payload.purchasePrice,"125.25");assert.deepEqual(payload.owners,[{buyerId:"P2",ownershipFraction:"0.6"},{buyerId:"P3",ownershipFraction:"0.4"}]);
  assert.throws(()=>entryPayload({...entry,owners:[entry.owners[0]]},players),/exactly 100%/);
  assert.throws(()=>entryPayload({...entry,owners:[entry.owners[0],entry.owners[0]]},players),/only once/);
  const merged=mergeEntry({purchases:[{player_id:"P4",purchase_price:"50"}],ownership:[{player_id:"P4",owner_player_id:"P2",ownership_fraction:"1"}]},payload);
  assert.equal(merged.purchases.length,2);assert.equal(merged.ownership.length,3);assert.equal(merged.purchases.find(p=>p.player_id==="P4").purchase_price,"50");
  const server=source("lib/calcutta-management-server.js");assert.match(server,/replaceProductionCalcuttaV1AuctionFacts/);assert.match(server,/canonicalEqual/);assert.doesNotMatch(server,/google-sheets-write/);
});

// Proof layer: UNIT/SOURCE. Actual PostgreSQL capability proof is indexed in CAPABILITY-GAPS.md.
test("UNIT canonical match controls honor complete scorecard, permissions, lock and Final state", async () => {
  const {productionMatchControlActions:actions}=await import("../lib/production-director-console.js");
  const complete={status:"LIVE",scoringLocked:false,permissionComplete:true,accessState:"ACTIVE",scorecardComplete:true,scoredHoles:18,unresolvedMutations:0,resultWinner:"Team 1"};
  assert.ok(actions(complete).includes("finalize"));
  for(const change of [{scoredHoles:17},{scorecardComplete:false},{unresolvedMutations:1},{scoringLocked:true},{resultWinner:""}])assert.equal(actions({...complete,...change}).includes("finalize"),false);
  assert.deepEqual(actions({...complete,status:"FINAL",scoringLocked:true}),["reopen"]);
  const route=source("app/api/director/route.js");assert.match(route,/persistDirectorMatchLifecycle/);assert.match(route,/receipt: lifecycle.result/);assert.doesNotMatch(route,/from .*google-sheets-write/);
});

test("match status and scoring access remain separate authoritative capabilities", () => {
  const writes = source("lib/google-sheets-write.js");
  const editors = source("app/admin/director/DirectorOperationEditors.js");
  assert.match(writes, /matchStatus: sheets\["Live Matches"\]\.headers\.includes\("Match Status"\) && writableFields\("Live Matches"\)\.includes\("Match Status"\)/);
  assert.match(writes, /scoringAccess: MATCH_ACCESS_HEADERS\.every/);
  assert.match(editors, /const unlocked = match\.scoringUnlocked === true/);
  assert.doesNotMatch(editors, /unlocked\s*=\s*live|live\s*=\s*unlocked/);
});
