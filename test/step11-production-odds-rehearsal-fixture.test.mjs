import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_ODDS_REHEARSAL_FIXTURE_CONTRACT,
  buildProductionOddsRehearsalInputs,
  productionOddsRehearsalFixtureEvidence,
} from "../lib/production-odds-rehearsal-fixture.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { simulateTournamentOdds } from "../lib/tournament-odds.js";

const candidateSha = "a".repeat(40);
const candidateHostname = "bagger-production-step11-odds.vercel.app";

function scope(overrides = {}) {
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: "2026",
    tournament_year: 2026,
    deployment_commit: candidateSha,
    operation_mode: "STEP11_REHEARSAL",
    candidate_hostname: candidateHostname,
    ...overrides,
  };
}

function pendingProductionInputs() {
  const historical = Object.fromEntries(["A1", "A2", "B1", "B2"].map((id, index) => [id, {
    sandbaggerRatings: { OVERALL: { rating: 1450 + index * 20, matches: 12 } },
  }]));
  return {
    sheets: {
      tournaments: [{ Year: 2026, "Tournament ID": "2026" }],
      liveTournaments: [{ Year: 2026, "Team 1 Name": "Alpha", "Team 2 Name": "Bravo" }],
      players: [
        { "Player ID": "A1", "Display Name": "Alpha One" },
        { "Player ID": "A2", "Display Name": "Alpha Two" },
        { "Player ID": "B1", "Display Name": "Bravo One" },
        { "Player ID": "B2", "Display Name": "Bravo Two" },
      ],
      handicaps: [
        { Year: 2026, "Team Side": "Team 1", "Player ID": "A1" },
        { Year: 2026, "Team Side": "Team 1", "Player ID": "A2" },
        { Year: 2026, "Team Side": "Team 2", "Player ID": "B1" },
        { Year: 2026, "Team Side": "Team 2", "Player ID": "B2" },
      ],
      teamNames: [
        { Year: 2026, "Team Side": "Team 1", "Team Names": "Alpha" },
        { Year: 2026, "Team Side": "Team 2", "Team Names": "Bravo" },
      ],
      tournamentRules: [1, 3].map((round) => ({
        Year: 2026,
        Round: round,
        Format: round === 1 ? "BB" : "SI",
        "Points Available": 3,
      })),
      matches: [{
        Year: 2026,
        Round: 1,
        Format: "BB",
        "Match ID": "2026-R1-1",
      }],
    },
    historical,
    metadata: { pairingFingerprint: "1".repeat(64), settingsFingerprint: "2".repeat(64) },
    configuration: { pairing_fingerprint: "1".repeat(64) },
  };
}

test("pending Production pairings become a pure deterministic calculation-only fixture", () => {
  const source = pendingProductionInputs();
  const before = structuredClone(source);
  const first = buildProductionOddsRehearsalInputs(source, { scope: scope() });
  const second = buildProductionOddsRehearsalInputs(source, { scope: scope() });

  assert.deepEqual(source, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.sheets.matches[0], {
    ...source.sheets.matches[0],
    "Team 1 Player 1": "A1",
    "Team 1 Player 2": "A2",
    "Team 2 Player 1": "B1",
    "Team 2 Player 2": "B2",
  });
  const fixture = first.metadata.productionRehearsalFixture;
  assert.equal(fixture.contractVersion, PRODUCTION_ODDS_REHEARSAL_FIXTURE_CONTRACT);
  assert.equal(fixture.pairingMode, "SYNTHETIC_PENDING_PAIRINGS");
  assert.equal(fixture.canonicalPairingsMutated, false);
  assert.equal(fixture.databasePairingWrites, 0);
  assert.equal(fixture.externalGoogleWrites, 0);
  assert.equal(fixture.publicationEligible, false);
  assert.equal(fixture.mirrorEligible, false);
  assert.match(fixture.namespace, /^STEP11_ODDS_[0-9a-f]{40}_[0-9a-f]{16}$/);
  assert.deepEqual(productionOddsRehearsalFixtureEvidence(first, scope()), {
    contract: PRODUCTION_ODDS_REHEARSAL_FIXTURE_CONTRACT,
    fingerprint: fixture.fixtureFingerprint,
    namespace: fixture.namespace,
    canonicalPairingFingerprint: "1".repeat(64),
    rehearsalPairingFingerprint: fixture.rehearsalEnginePairingFingerprint,
  });

  const result = simulateTournamentOdds({
    ...first,
    phase: "Pre-Tournament",
    iterations: 100,
    publishedAt: "2026-08-25T12:00:00.000Z",
  });
  assert.equal(result.iterations, 100);
  assert.equal(result.teams.length, 2);
  assert.equal(result.players.length, 4);
});

test("partial Production pairings fail closed instead of being completed or overwritten", () => {
  const source = pendingProductionInputs();
  source.sheets.matches[0]["Team 1 Player 1"] = "A1";
  assert.throws(
    () => buildProductionOddsRehearsalInputs(source, { scope: scope() }),
    { code: "PRODUCTION_ODDS_REHEARSAL_PARTIAL_PAIRINGS_UNSUPPORTED" },
  );
});

test("fixture evidence is bound to the exact candidate SHA and hostname", () => {
  const prepared = buildProductionOddsRehearsalInputs(pendingProductionInputs(), { scope: scope() });
  for (const changed of [
    { deployment_commit: "b".repeat(40) },
    { candidate_hostname: "other-production-candidate.vercel.app" },
    { operation_mode: "PRODUCTION_CUTOVER" },
    { source_workbook_id: "preview-workbook" },
  ]) {
    assert.throws(
      () => productionOddsRehearsalFixtureEvidence(prepared, scope(changed)),
      (error) => [
        "PRODUCTION_ODDS_REHEARSAL_EXACT_SCOPE_REQUIRED",
        "PRODUCTION_ODDS_REHEARSAL_FIXTURE_INVALID",
      ].includes(error.code),
    );
  }
});

test("the rehearsal fixture builder has no persistence, publication, mirror, or Google transport", async () => {
  const source = await readFile(new URL(
    "../lib/production-odds-rehearsal-fixture.js",
    import.meta.url,
  ), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|scoringShadowRpc\s*\(|productionOddsCalculationRpc\s*\(/);
  assert.doesNotMatch(source, /publishSupabaseOddsSnapshot|markOddsCalculationPublished|GoogleMirror/);
  assert.doesNotMatch(source, /sheets\.googleapis|docs\.google\.com|google-sheets-write/);
});
