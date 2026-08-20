import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MOBILE_API_ERROR_CODES } from "../lib/mobile-api-v1.js";
import { runMobileScoringPostCommit } from "../lib/mobile-v1-scoring-post-commit.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const contract = async (name) => JSON.parse(await source(`contracts/mobile/v1/${name}`));

function exactKeys(value, required) {
  assert.deepEqual(Object.keys(value).sort(), [...required].sort());
}

test("Step 1C schemas are versioned, strict, and aligned with representative Codable fixtures", async () => {
  const names = [
    "scoring-shared.schema.json",
    "scoring-current.schema.json",
    "scoring-hole-request.schema.json",
    "scoring-hole-response.schema.json",
    "scoring-finalize-request.schema.json",
    "scoring-finalize-response.schema.json",
  ];
  const schemas = await Promise.all(names.map(contract));
  for (const schema of schemas) assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");

  const [current, holeRequest, holeResponse, finalizeRequest, finalizeResponse] = schemas.slice(1);
  assert.equal(current.additionalProperties, false);
  assert.equal(holeRequest.additionalProperties, false);
  assert.equal(holeResponse.additionalProperties, false);
  assert.equal(finalizeRequest.additionalProperties, false);
  assert.equal(finalizeResponse.additionalProperties, false);

  const fixtures = await contract("scoring-fixtures.json");
  assert.equal(fixtures.synthetic, true);
  exactKeys(fixtures.holeMutation.request, holeRequest.required);
  exactKeys(fixtures.holeMutation.accepted, holeResponse.required);
  exactKeys(fixtures.finalization.request, finalizeRequest.required);
  exactKeys(fixtures.finalization.accepted, finalizeResponse.required);
  for (const value of Object.values(fixtures.current)) exactKeys(value, current.required);
  assert.equal(fixtures.current.authorizedActive.data.scoring.permission.canScore, true);
  assert.equal(fixtures.current.readOnly.data.scoring.permission.readOnly, true);
  assert.equal(fixtures.current.noAuthorizedMatch.data.scoring, null);
  assert.equal(fixtures.current.finalized.data.scoring.match.status, "completed");
  assert.equal(fixtures.holeMutation.accepted.data.hole.net.teamOne, 3);
  assert.equal(fixtures.holeMutation.staleRevision.error.code, "REVISION_CONFLICT");
  assert.equal(fixtures.finalization.accepted.data.match.scoringLocked, true);
});

test("scoring fixtures and documentation contain no Production PII, credentials, or browser scoring secrets", async () => {
  const [fixtures, docs] = await Promise.all([
    source("contracts/mobile/v1/scoring-fixtures.json"),
    source("contracts/mobile/v1/README.md"),
  ]);
  for (const forbidden of ["@", "+1555", "sb_secret_", "SUPABASE_SCORING_MIRROR_SECRET_KEY", "sbi-scoring", "Bearer eyJ", "service_role"]) {
    assert.equal(fixtures.includes(forbidden), false);
  }
  for (const term of [
    "GET /scoring/current",
    "POST /scoring/hole",
    "POST /scoring/finalize",
    "No separate native scoring credential",
    "expectedMatchRevision",
    "expectedHoleRevision",
    "IDEMPOTENCY_CONFLICT",
    "REVISION_CONFLICT",
    "private, no-store",
    "explicit participant finalization",
    "offline intent",
    "Match/mutation record exists",
  ]) assert.match(docs, new RegExp(term));
});

test("the error schema exactly tracks the stable mobile v1 vocabulary and bounded conflict data", async () => {
  const schema = await contract("error.schema.json");
  assert.deepEqual(schema.properties.error.properties.code.enum, MOBILE_API_ERROR_CODES);
  assert.equal(schema.properties.data.additionalProperties, false);
  assert.deepEqual(schema.properties.data.required, ["matchId", "refreshRequired"]);
  assert.equal(schema.properties.data.properties.refreshRequired.const, true);
});

test("mobile routes stay thin, Bearer-only, no-store adapters over shared authority", async () => {
  const [current, hole, finalize, routeHelper, scoring, postCommit] = await Promise.all([
    source("app/api/mobile/v1/scoring/current/route.js"),
    source("app/api/mobile/v1/scoring/hole/route.js"),
    source("app/api/mobile/v1/scoring/finalize/route.js"),
    source("lib/mobile-v1-scoring-route.js"),
    source("lib/mobile-v1-scoring.js"),
    source("lib/mobile-v1-scoring-post-commit.js"),
  ]);
  for (const route of [current, hole, finalize]) {
    assert.match(route, /mobileV1ScoringResponse/);
    assert.doesNotMatch(route, /cookies|playerPassport|scoringToken|verifyScoringSession|console\./i);
  }
  assert.match(routeHelper, /resolveMobileBearerIdentity/);
  assert.match(routeHelper, /private, no-store, max-age=0/);
  assert.match(routeHelper, /MAX_JSON_BYTES = 16_384/);
  assert.match(scoring, /persistParticipantScore/);
  assert.match(scoring, /MATCH_ACCESS_ACTIONS\.START_SCORING/);
  assert.doesNotMatch(scoring, /submitCanonicalHoleScore|finalizeCanonicalMatch|calculateLiveHole|calculateMatchPoints|console\.|cookie/i);
  for (const worker of ["drainGoogleOutbox", "drainScorecardArchiveJobs", "recalculateCompetitionDerivedTournament",
    "recalculateIntelligenceDerivedTournament", "recalculateCalcuttaTournament"]) assert.match(postCommit, new RegExp(worker));
});

test("successful mobile mutations reuse every existing post-commit publication worker without changing acknowledgement", async () => {
  const calls = [];
  const worker = (name, reject = false) => async (...args) => {
    calls.push({ name, args });
    if (reject) throw new Error("synthetic worker delay");
    return { ok: true };
  };
  const settled = await runMobileScoringPostCommit({ tournamentId: "FIXTURE-2026" }, {
    drainGoogleOutbox: worker("outbox"),
    drainScorecardArchiveJobs: worker("archive", true),
    recalculateCompetitionDerivedTournament: worker("competition"),
    recalculateIntelligenceDerivedTournament: worker("intelligence"),
    recalculateCalcuttaTournament: worker("calcutta"),
  });
  assert.deepEqual(calls.map((call) => call.name), ["outbox", "archive", "competition", "intelligence", "calcutta"]);
  assert.equal(settled.length, 5);
  assert.equal(settled[1].status, "rejected");
  assert.equal(calls[0].args[0].actor, "Mobile v1 scoring worker");
  assert.equal(calls[2].args[0], "FIXTURE-2026");
  assert.equal(calls[2].args[1].calculatedBy, "Mobile v1 scoring worker");
});

test("canonical acknowledgement enrichment is mobile-only and preserves browser scoring response shape", async () => {
  const [adapter, currentBrowserRoute, matchBrowserRoute, mobile] = await Promise.all([
    source("lib/scoring-persistence-adapter.js"),
    source("app/api/scoring/current/route.js"),
    source("app/api/scoring/matches/[matchId]/route.js"),
    source("lib/mobile-v1-scoring.js"),
  ]);
  assert.match(adapter, /includeCanonicalAcknowledgement = false/);
  assert.match(mobile, /includeCanonicalAcknowledgement: true/);
  assert.doesNotMatch(currentBrowserRoute, /includeCanonicalAcknowledgement/);
  assert.doesNotMatch(matchBrowserRoute, /includeCanonicalAcknowledgement/);
});
