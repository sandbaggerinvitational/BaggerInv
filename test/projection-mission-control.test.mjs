import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { championshipProjectionMissionStatus } from "../lib/projection-mission-control.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const round = (number, status) => ({ number, status, total: 6, final: status === "FINAL" ? 6 : 0 });

test("Mission Control advances projection milestones without changing publication phases", () => {
  const opening = { ready: true };
  const singles = { ready: true };
  const rounds = [round(1, "FINAL"), round(2, "LIVE"), round(3, "UPCOMING")];
  const status = championshipProjectionMissionStatus({
    snapshots: [{ phase: "Pre-Tournament", publishedAt: "2026-09-24T12:00:00Z" }],
    rounds,
    openingStatus: opening,
    roundThreeStatus: singles,
  });

  assert.equal(status.currentLabel, "Opening Championship Projection");
  assert.deepEqual(status.publishedPhases, ["Pre-Tournament"]);
  assert.equal(status.nextPhase, "After Round 1");
  assert.equal(status.nextLabel, "Round 2 Pairings Projection");
  assert.equal(status.ready, true);
});

test("Preview regeneration exposes published milestones without creating a second publisher", async () => {
  const [dashboard, publisher, publishRoute, workbook] = await Promise.all([
    source("app/admin/director/DirectorDashboard.js"),
    source("app/odds-center/admin/OddsAdmin.js"),
    source("app/api/odds/publish/route.js"),
    source("lib/google-sheets-write.js"),
  ]);
  assert.match(dashboard, /regenerationPhases=\{data\.qaTools \? data\.championshipProjections\.publishedPhases : \[\]\}/);
  assert.match(publisher, /Preview Regeneration/);
  assert.match(publisher, /Regenerate Official Projection/);
  assert.match(publisher, /regenerationPhases\.includes\(phase\)/);
  assert.match(publishRoute, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(workbook, /row\.phase === snapshot\.phase/);
  assert.match(workbook, /phaseOrder - b\.phaseOrder/);
});

test("next projection remains locked until its operational prerequisite is complete", () => {
  const status = championshipProjectionMissionStatus({
    snapshots: [{ phase: "After Round 1" }],
    rounds: [round(1, "FINAL"), round(2, "LIVE"), round(3, "UPCOMING")],
    openingStatus: { ready: true },
    roundThreeStatus: { ready: false, message: "Singles pairings incomplete." },
  });

  assert.equal(status.nextPhase, "After Round 2");
  assert.equal(status.ready, false);
  assert.match(status.reason, /Close Round 2/);
});

// Proof layer: UNIT/SOURCE. Actual PostgreSQL capability proof is indexed in CAPABILITY-GAPS.md.
test("UNIT canonical Odds publication remains an explicit Director-reviewed capability", async () => {
  const status=championshipProjectionMissionStatus({snapshots:[],rounds:[round(1,"UPCOMING")],openingStatus:{ready:true},roundThreeStatus:{ready:false}});
  assert.equal(status.nextPhase,"Pre-Tournament");assert.equal(status.ready,true);
  const ui=await source("app/admin/director/ProductionDirectorOperations.js");const route=await source("app/api/odds/publish/route.js");
  assert.match(ui,/ProductionOddsSnapshotReview/);assert.match(ui,/odds\/publish/);
  const canonical=route.slice(route.indexOf("async function publishProductionProjection"),route.indexOf("async function publishProjection"));
  assert.match(canonical,/authorizePreviewDirector/);assert.match(canonical,/publishProductionOddsCalculation/);
  assert.doesNotMatch(canonical,/publishOddsSnapshot\(|readWorkbookSheetsByName\(|withProductionGoogleAuthoringWrite\(/);
  const inputs=await source("app/api/odds/inputs/route.js");assert.match(inputs,/ODDS_LEGACY_IMPORT_RETIRED/);assert.doesNotMatch(inputs,/readGooglePredictionSettingsSheets/);
});
