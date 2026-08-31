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

test("future-year panel uses the contract builder, scoped endpoint, and keeps unsupported lifecycle writers unavailable", async () => {
  const [panel, consoleSource] = await Promise.all([
    source("app/admin/director/ProductionFutureYearAdministrationPanel.js"),
    source("app/admin/director/ProductionDirectorConsole.js"),
  ]);
  assert.match(panel, /buildFutureYearAdministrationMutation/);
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
  assert.match(panel, /Activate tournament unavailable/);
  assert.match(panel, /google compatibility writer remain disabled by contract/i);
  assert.doesNotMatch(panel, /activate-tournament|close-tournament|archive-tournament|create-global-course|google-compatibility-writer/);
  assert.match(consoleSource, /section === "tournaments"[\s\S]*ProductionFutureYearAdministrationPanel/);
});
