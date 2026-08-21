import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PUBLICATION_STAGES, createPublicationTrace, validateProjectionSnapshot } from "../lib/projection-publication-diagnostics.js";
import { americanOdds, ODDS_ENGINE_VERSION, ODDS_PUBLICATION_CONTRACT_VERSION } from "../lib/tournament-odds.js";

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

test("snapshot validation enforces the prospective full-precision rank contract without imposing it on legacy publications", () => {
  const base = { year: 2026, phase: "Round 3 Pairings Announced", publishedAt: new Date().toISOString(), iterations: 10_000, totalPointsAvailable: 72 };
  const legacy = { ...base, teams: [{ name: "Pickles", probability: 50 }], players: [{ id: "p", name: "Player", probability: .4 }] };
  assert.equal(validateProjectionSnapshot(legacy), legacy);
  const current = { ...base, engineVersion: ODDS_ENGINE_VERSION, publicationContractVersion: ODDS_PUBLICATION_CONTRACT_VERSION,
    teams: [{ name: "Pickles", rawProbability: 50, probability: 50, americanOdds: americanOdds(50) }],
    players: [
      { id: "higher", name: "Higher", rawProbability: .44, probability: .4, americanOdds: americanOdds(.44), rank: 1 },
      { id: "lower", name: "Lower", rawProbability: .36, probability: .4, americanOdds: americanOdds(.36), rank: 2 },
    ] };
  assert.equal(validateProjectionSnapshot(current), current);
  assert.throws(() => validateProjectionSnapshot({ ...current, players: current.players.slice().reverse() }), /full-precision contract|ordered by full-precision/i);
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
