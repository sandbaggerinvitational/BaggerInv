import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PUBLICATION_STAGES, createPublicationTrace, validateProjectionSnapshot } from "../lib/projection-publication-diagnostics.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("publication trace contains every required stage in order", () => {
  assert.deepEqual(PUBLICATION_STAGES, [
    "Workbook validation", "Input loading", "Pairing validation", "Simulation start", "Simulation complete",
    "Snapshot generation", "Team projections generated", "Player projections generated", "Snapshot validation",
    "Batch workbook write", "Workbook verification", "Cache invalidation", "Website refresh", "PWA refresh", "Publication complete",
  ]);
  const trace = createPublicationTrace();
  trace.start("Workbook validation", { worksheet: "Team Names" });
  trace.pass("Workbook validation");
  trace.start("Input loading", { function: "loadOddsInputs" });
  trace.fail(new Error("Load failed"));
  const result = trace.snapshot();
  assert.equal(result.stages[0].status, "PASS");
  assert.equal(result.stages[1].status, "FAIL");
  assert.equal(result.stages[1].reason, "Load failed");
  assert.equal(result.stages[2].status, "NOT REACHED");
});

test("snapshot validation rejects missing team or player projection output", () => {
  const base = { year: 2026, phase: "Pre-Tournament", publishedAt: new Date().toISOString(), iterations: 10_000, totalPointsAvailable: 72 };
  assert.throws(() => validateProjectionSnapshot({ ...base, teams: [], players: [] }), /no team projections/i);
  assert.throws(() => validateProjectionSnapshot({ ...base, teams: [{ name: "Pickles", probability: 50 }], players: [] }), /no player projections/i);
});

test("Preview Director UI renders trace timing and exact failure metadata", async () => {
  const [route, ui, writer] = await Promise.all([
    read("app/api/odds/publish/route.js"), read("app/odds-center/admin/OddsAdmin.js"), read("lib/google-sheets-write.js"),
  ]);
  for (const label of PUBLICATION_STAGES) assert.match(route, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const field of ["stepReached", "rootCause", "worksheet", "workbookOperation", "function", "exception", "stack", "trace"]) assert.match(route, new RegExp(field));
  assert.match(route, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(ui, /Publication Failed/);
  assert.match(ui, /elapsedMs/);
  assert.match(ui, /Stack trace/);
  assert.match(writer, /verifyPublishedOddsSnapshot/);
});
