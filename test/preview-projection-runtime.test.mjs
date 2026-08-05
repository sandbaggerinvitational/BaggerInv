import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Preview projection publishing uses the plan maximum without changing Production", async () => {
  const [productionRoute, previewRoute] = await Promise.all([
    read("app/api/odds/publish/route.js"),
    read("app/api/odds/publish-preview/route.js"),
  ]);

  assert.match(productionRoute, /export const maxDuration = 60/);
  assert.match(previewRoute, /export const maxDuration = 800/);
  assert.match(previewRoute, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(previewRoute, /publishOfficialProjection\(request\)/);
});

test("Director clients select the Preview-only long-running route", async () => {
  const [admin, directorDashboard, adminCenter] = await Promise.all([
    read("app/odds-center/admin/OddsAdmin.js"),
    read("app/admin/director/DirectorDashboard.js"),
    read("app/admin/AdminCenter.js"),
  ]);

  assert.match(admin, /previewMode \? "\/api\/odds\/publish-preview" : "\/api\/odds\/publish"/);
  assert.match(directorDashboard, /previewMode=\{Boolean\(data\.qaTools\)\}/);
  assert.match(adminCenter, /previewMode=\{previewMode\}/);
});
