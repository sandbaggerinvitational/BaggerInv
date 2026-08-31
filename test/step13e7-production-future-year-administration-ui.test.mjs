import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PRODUCTION_DIRECTOR_SECTIONS } from "../lib/production-director-console.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Director Console exposes the bounded Future Tournaments annual-administration section", () => {
  assert.deepEqual(PRODUCTION_DIRECTOR_SECTIONS.find((section) => section.id === "tournaments"), {
    id: "tournaments", label: "Tournaments", href: "/admin/director?section=tournaments",
  });
});

test("future-year panel wires the bounded runtime preparation and keeps archive execution plan-only", async () => {
  const [panel, consoleSource] = await Promise.all([
    source("app/admin/director/ProductionFutureYearAdministrationPanel.js"),
    source("app/admin/director/ProductionDirectorConsole.js"),
  ]);
  assert.match(panel, /buildFutureYearAdministrationMutation/);
  assert.match(panel, /buildFutureRuntimeMutation/);
  assert.match(panel, /\/api\/director\/future-tournaments/);
  assert.match(panel, /targetTournamentId=\$\{encodeURIComponent\(targetTournamentId\)\}/);
  assert.match(panel, /Clone 2026 structure/);
  assert.match(panel, /Add a bounded team/);
  assert.match(panel, /playerCatalog/);
  assert.match(panel, /Add a certified round/);
  assert.match(panel, /courseLibrary/);
  assert.match(panel, /Audit timeline/);
  assert.match(panel, /useCallback\(async \(targetTournamentId = "", quiet = false\)/);
  assert.match(panel, /Generate deterministic match structure/);
  assert.match(panel, /Runtime match promotion/);
  assert.match(panel, /Configure scoring context/);
  assert.match(panel, /assign-future-course/);
  assert.match(panel, /Hole \| Par \| Stroke index \| Yardage/);
  assert.match(panel, /Future Handicaps/);
  assert.match(panel, /Future Tournament Director/);
  assert.match(panel, /grant-future-director/);
  assert.match(panel, /does not clone 2026 Director rights/);
  assert.match(panel, /Pairings & scoring snapshots/);
  assert.match(panel, /Review transition preparation/);
  assert.match(panel, /This panel never closes admission or commits the current pointer/);
  assert.match(panel, /Prepare archive plan/);
  assert.match(panel, /Archive execution unavailable/);
  assert.match(panel, /claimed and retried only by the certified worker/);
  assert.doesNotMatch(panel, /archive-tournament|completeCompatibilityJob|writeFutureMatchGoogleCompatibility/);
  assert.match(consoleSource, /section === "tournaments"[\s\S]*ProductionFutureYearAdministrationPanel/);
});
