import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ODDS_PHASES } from "../lib/tournament-odds.js";
import { projectionPresentationLabel } from "../lib/projection-phases.js";

const expected = [
  ["Pre-Tournament", "Opening Championship Projection"],
  ["After Round 1", "Round 2 Pairings Projection"],
  ["After Round 2", "Championship Outlook"],
  ["Round 3 Pairings Announced", "Championship Singles Projection"],
  ["Final Results", "Tournament Recap"],
];

test("every presentation milestone submits its unchanged internal phase identifier", () => {
  assert.deepEqual(ODDS_PHASES, expected.map(([phase]) => phase));
  for (const [phase, label] of expected) assert.equal(projectionPresentationLabel(phase), label);
});

test("all milestones share one publication handler and payload contract", async () => {
  const source = await readFile(new URL("../app/odds-center/admin/OddsAdmin.js", import.meta.url), "utf8");
  assert.match(source, /const endpoint = previewMode \? "\/api\/odds\/publish-preview" : "\/api\/odds\/publish"/);
  assert.match(source, /const requestPayload = \{ phase, iterations, \.\.\.\(previewMode \? \{ jobId: calculationJob\?\.job_id \} : \{\}\) \}/);
  assert.match(source, /"\/api\/odds\/calculations"/);
  assert.match(source, /ready for Director publication/);
  assert.match(source, /body: requestBody/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /ODDS_PHASES\.includes\(phase\)/);
  assert.match(source, /httpStatus: "No response received"/);
  assert.match(source, /responseBody: "No response body received"/);
  assert.match(source, /error\.stack \|\| requestStack/);
});

test("the long-running publication route is not terminated at the platform default", async () => {
  const route = await readFile(new URL("../app/api/odds/publish/route.js", import.meta.url), "utf8");
  assert.match(route, /export const maxDuration = 60/);
});
