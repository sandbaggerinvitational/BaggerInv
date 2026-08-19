import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { directorGuideStatusPresentation, guideLastRefreshedAt } from "../lib/director-guide-status.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Mission Control Guide status uses the reliable projection contract without claiming continuous Google freshness", () => {
  const status = {
    state: "CURRENT",
    current: { last_verified_at: "2026-08-19T15:22:00Z" },
    lastSuccess: { completed_at: "2026-08-19T15:21:58Z" },
  };
  assert.equal(guideLastRefreshedAt(status), "2026-08-19T15:21:58Z");
  assert.deepEqual(directorGuideStatusPresentation(status), {
    label: "Participant Guide verified",
    tone: "ready",
    lastRefreshedAt: "2026-08-19T15:21:58Z",
  });
  assert.equal(directorGuideStatusPresentation({ ...status, state: "STALE" }).label, "Refresh recommended");
  assert.equal(directorGuideStatusPresentation({ ...status, state: "UNPUBLISHED" }).label, "Refresh required");
  assert.equal(directorGuideStatusPresentation({ ...status, state: "FAILED_REFRESH" }).label, "Refresh failed");
  assert.equal(directorGuideStatusPresentation(status, { phase: "refreshing" }).label, "Refreshing…");
  assert.equal(directorGuideStatusPresentation(status, { phase: "failure" }).label, "Refresh failed");
});

test("Mission Control visibly surfaces the existing Participant Guide operation under Operations systems", async () => {
  const [dashboard, control] = await Promise.all([
    source("app/admin/director/DirectorDashboard.js"),
    source("app/admin/director/DirectorGuideRefreshControl.js"),
  ]);
  const operationsSystems = dashboard.indexOf("Operations systems");
  const guideControl = dashboard.indexOf("<DirectorGuideRefreshControl");
  const previewTools = dashboard.indexOf('id="preview-tools"');
  assert.ok(operationsSystems >= 0 && guideControl > operationsSystems && previewTools > guideControl);
  assert.match(dashboard, /data\.qaTools \? <DirectorGuideRefreshControl/);
  assert.match(control, /Tournament Guide/);
  assert.match(control, /Refresh Participant Guide/);
  assert.match(control, /Last refreshed/);
  assert.doesNotMatch(control, /Participant Guide up to date/);
});

test("Mission Control Guide refresh reuses the protected route, reloads status, and prevents duplicate submissions", async () => {
  const control = await source("app/admin/director/DirectorGuideRefreshControl.js");
  assert.match(control, /fetch\("\/api\/director\/guide-content"/);
  assert.match(control, /cache: "no-store"/);
  assert.match(control, /directorFetch\("\/api\/director\/guide-content"/);
  assert.match(control, /method: "POST"/);
  assert.match(control, /JSON\.stringify\(\{ action: "refresh" \}\)/);
  assert.match(control, /if \(requestInFlight\.current\) return/);
  assert.match(control, /requestInFlight\.current = true/);
  assert.match(control, /disabled=\{phase === "refreshing"\}/);
  assert.match(control, /loadStatus\(\)\.then\(\(\) => true\)/);
  assert.match(control, /role=\{phase === "failure"/);
  assert.doesNotMatch(control, /router\.|window\.location|location\.href/);
});

test("Mission Control Guide refresh keeps Preview-only Director authorization and the canonical sync service", async () => {
  const route = await source("app/api/director/guide-content/route.js");
  assert.match(route, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(route, /authorizePreviewDirector\(\{ request, allowBootstrap: true \}\)/);
  assert.match(route, /Tournament Director access is required/);
  assert.match(route, /assertGuideSyncEnvironment\(\{ triggerType: "MANUAL" \}\)/);
  assert.match(route, /synchronizeGuideContent\(\{/);
  assert.doesNotMatch(route, /readWorkbookSheetsByName|GUIDE_SYNC_WORKER_SECRET/);
});
