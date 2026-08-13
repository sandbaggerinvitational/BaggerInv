import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateIntelligenceDerivedFromData,
  INTELLIGENCE_ENGINE_KEYS,
  tournamentFinalRecapGate,
} from "../lib/intelligence-derived-supabase.js";
import {
  finalRecapReadEnvironment,
  projectionEditorialReadEnvironment,
  tournamentIntelligenceReadEnvironment,
} from "../lib/intelligence-derived-read-source.js";

const snapshot = (phase, order, probabilities = [60, 40]) => ({ year: 2026, phase, phaseOrder: order,
  publishedAt: `2026-08-${String(order + 1).padStart(2, "0")}T12:00:00Z`, teams: [
    { name: "The Pickles", probability: 60 }, { name: "Lipp it and Rip it", probability: 40 },
  ], players: [
    { id: "P1", name: "Player One", probability: probabilities[0], americanOdds: -150, expectedPoints: 4, averageFinish: 1 },
    { id: "P2", name: "Player Two", probability: probabilities[1], americanOdds: 150, expectedPoints: 3, averageFinish: 2 },
  ] });

function core({ final = false, complete = false } = {}) {
  const matches = Array.from({ length: 24 }, (_, index) => ({ id: `M${index + 1}`, status: final ? "FINAL" : "LIVE" }));
  return { tournament: { id: "2026", name: "Sandbagger Invitational", teamOne: { name: "The Pickles", score: 20.5 }, teamTwo: { name: "Lipp it and Rip it", score: 15.5 } },
    rounds: [{ number: 1, matches }], leaderboard: [
      { id: "P1", player: "Player One", name: "Player One", team: "The Pickles", points: 4, wins: 4, losses: 0 },
      { id: "P2", player: "Player Two", name: "Player Two", team: "Lipp it and Rip it", points: 3, wins: 3, losses: 1 },
    ], sourceFingerprint: "a".repeat(64), sourceRevision: { matches: matches.map((match) => ({ matchId: match.id, scorecardComplete: complete })) } };
}

test("derived engines retain separate keys and deterministic payloads", () => {
  assert.deepEqual(INTELLIGENCE_ENGINE_KEYS, ["TOURNAMENT_INTELLIGENCE", "PROJECTION_EDITORIAL", "TOURNAMENT_FINAL_RECAP"]);
  const input = { core: core(), snapshots: [snapshot("Pre-Tournament", 0), snapshot("After Round 1", 1, [70, 30])],
    oddsMetadata: { currentPublicationId: "pub", currentRevision: 2, currentPayloadHash: "b".repeat(64), history: [] } };
  const first = calculateIntelligenceDerivedFromData(input);
  const second = calculateIntelligenceDerivedFromData(input);
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.equal(first.intelligence.payloadHash, second.intelligence.payloadHash);
  assert.equal(first.editorial.payloadHash, second.editorial.payloadHash);
  assert.equal(first.recap.result, null);
});

test("final recap fails closed until 24 matches, complete cards, official result, and Final Results Odds", () => {
  assert.equal(tournamentFinalRecapGate(core(), []).eligible, false);
  assert.equal(tournamentFinalRecapGate(core({ final: true, complete: true }), [snapshot("Round 3 Pairings Announced", 3)]).eligible, false);
  const finalSnapshot = snapshot("Final Results", 4);
  assert.equal(tournamentFinalRecapGate(core({ final: true, complete: true }), [finalSnapshot]).eligible, true);
  const calculated = calculateIntelligenceDerivedFromData({ core: core({ final: true, complete: true }), snapshots: [snapshot("Pre-Tournament", 0), finalSnapshot], oddsMetadata: {} });
  assert.ok(calculated.recap.result);
  assert.equal(calculated.recap.payloadHash, calculateIntelligenceDerivedFromData({ core: core({ final: true, complete: true }), snapshots: [snapshot("Pre-Tournament", 0), finalSnapshot], oddsMetadata: {} }).recap.payloadHash);
});

test("source flags are Preview-only and fail closed outside isolated Preview", () => {
  const preview = { VERCEL_ENV: "preview", GOOGLE_SHEETS_ID: "preview", PREVIEW_SCORING_SHEET_ID: "preview",
    SUPABASE_SCORING_MIRROR_URL: "https://example.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "secret",
    TOURNAMENT_INTELLIGENCE_READ_SOURCE: "supabase", PROJECTION_EDITORIAL_READ_SOURCE: "supabase", FINAL_RECAP_READ_SOURCE: "supabase" };
  assert.equal(tournamentIntelligenceReadEnvironment(preview).resolved, "supabase");
  assert.equal(projectionEditorialReadEnvironment(preview).resolved, "supabase");
  assert.equal(finalRecapReadEnvironment(preview).resolved, "supabase");
  assert.equal(tournamentIntelligenceReadEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "application");
});

test("migration is service-only and Final Recap is gated", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608120041_preview_intelligence_derived_state.sql", import.meta.url), "utf8");
  assert.match(sql, /TOURNAMENT_INTELLIGENCE/);
  assert.match(sql, /PROJECTION_EDITORIAL/);
  assert.match(sql, /TOURNAMENT_FINAL_RECAP/);
  assert.match(sql, /FINAL_RECAP_GATE_REQUIRED/);
  assert.match(sql, /revoke all on function public\.write_intelligence_derived_bundle\(jsonb\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.write_intelligence_derived_bundle\(jsonb\) to service_role/);
});
