import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildOddsWorkbookPublicationRecords } from "../lib/google-sheets-write.js";

const snapshot = (phase, phaseOrder, publishedAt, probability = 50) => ({
  year: 2026,
  phase,
  phaseOrder,
  publishedAt,
  iterations: 10_000,
  totalPointsAvailable: 72,
  teams: [
    { side: 1, name: "The Pickles", probability, americanOdds: "+100", expectedPoints: 36 },
    { side: 2, name: "Lipp it and Rip it", probability: 100 - probability, americanOdds: "+100", expectedPoints: 36 },
  ],
  players: [
    { id: "CB01", name: "Clay Beltran", teamSide: 1, probability: 20, rawProbability: 20.123, rank: 1,
      americanOdds: "+400", expectedPoints: 5, expectedRecord: "2.0-1.0-0.0", averageFinish: 3 },
  ],
});

test("Google reporting plan is pure, field-complete, and replaces only the rehearsed milestone", () => {
  const prior = [
    snapshot("Pre-Tournament", 0, "2026-07-01T12:00:00.000Z", 40),
    snapshot("Round 3 Pairings Announced", 3, "2026-08-09T12:16:00.461Z", 45),
  ];
  const original = structuredClone(prior);
  const candidate = snapshot("Round 3 Pairings Announced", 3, "2026-08-21T12:00:00.000Z", 55);
  const plan = buildOddsWorkbookPublicationRecords(candidate, prior);
  assert.deepEqual(prior, original);
  assert.equal(plan.snapshots.length, 2);
  assert.equal(plan.snapshots.at(-1).publishedAt, candidate.publishedAt);
  assert.equal(plan.records["Odds Control"][0]["Current Official Phase"], candidate.phase);
  assert.equal(plan.records["Odds Snapshots"].length, 2);
  assert.equal(plan.records["Odds Team Results"].length, 4);
  assert.equal(plan.records["Odds Player Results"].length, 2);
  assert.equal(JSON.parse(plan.records["Odds Snapshots"].at(-1)["Snapshot JSON"]).players[0].rawProbability, 20.123);
  assert.equal(JSON.parse(plan.records["Odds Snapshots"].at(-1)["Snapshot JSON"]).players[0].rank, 1);
});

test("Preview publication rehearsal executes real lifecycle operations and rolls every database change back", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202608210001_preview_championship_odds_publication_rehearsal.sql", import.meta.url), "utf8");
  assert.match(migration, /rehearsal boolean:=coalesce/);
  assert.match(migration, /publication_result:=public\.publish_preview_championship_odds\(input-'rehearsal'\)/);
  assert.match(migration, /raise exception using errcode='P4B01'/);
  assert.match(migration, /exception when sqlstate 'P4B01'/);
  assert.match(migration, /official_state_unchanged/);
  assert.match(migration, /'google_writes',0/);
  assert.match(migration, /failed_delivery:=public\.complete_preview_championship_odds_google_mirror/);
  assert.match(migration, /retry_claim:=public\.claim_preview_championship_odds_google_mirror/);
  assert.match(migration, /duplicate_publication:=public\.publish_preview_championship_odds/);
  assert.match(migration, /duplicate_claim:=public\.claim_preview_championship_odds_google_mirror/);
});

test("mirror delivery is claimed, retryable, checkpointed, and idempotent", async () => {
  const [migration, supersession, baseMigration, mirror, publisher] = await Promise.all([
    readFile(new URL("../supabase/migrations/202608210001_preview_championship_odds_publication_rehearsal.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608210002_preview_championship_odds_mirror_supersession.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608120038_preview_championship_odds_inputs_publication.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/championship-odds-google-mirror.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/odds/publish/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /status='RUNNING',attempt_count=attempt_count\+1/);
  assert.match(migration, /ODDS_GOOGLE_MIRROR_IN_PROGRESS/);
  assert.match(migration, /ODDS_GOOGLE_MIRROR_ALREADY_VERIFIED/);
  assert.match(migration, /'changed',false,'duplicate',true/);
  assert.match(baseMigration, /unique \(snapshot_id\)/);
  assert.match(supersession, /status in \('PENDING','RUNNING','SUCCEEDED','FAILED','SUPERSEDED'\)/);
  assert.match(supersession, /snapshot_row\.is_current_official is not true/);
  assert.match(supersession, /odds_google_mirror_supersession/);
  assert.match(mirror, /claimSupabaseOddsGoogleMirror/);
  assert.match(mirror, /publishOddsSnapshot\(snapshot\)/);
  assert.match(mirror, /verifyPublishedOddsSnapshot\(snapshot\)/);
  assert.match(mirror, /status: "FAILED"/);
  assert.match(mirror, /retryable: true/);
  assert.match(publisher, /deliverSupabaseOddsGoogleMirror/);
  assert.match(publisher, /source\.publicationAuthority === "google"/);
});

test("Director rehearsal route is Preview-only, read-only for Google, and protects real retry behind Supabase authority", async () => {
  const [route, readiness] = await Promise.all([
    readFile(new URL("../app/api/odds/publication-operations/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/director/game-center-readiness/GameCenterReadinessClient.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /Run non-destructive rehearsal/);
  assert.match(route, /searchParams\.get\("ui"\) === "1"/);
  assert.match(route, /request\.formData\(\)/);
  assert.match(route, /rehearseSupabaseOddsSnapshot/);
  assert.match(route, /buildOddsWorkbookPublicationRecords/);
  assert.match(route, /googleWrites: 0/);
  assert.doesNotMatch(route, /publishOddsSnapshot/);
  assert.match(route, /sources\.publicationAuthority !== "supabase"/);
  assert.match(route, /retry-google-mirror/);
  assert.match(readiness, /Certify Odds Publication Lifecycle/);
  assert.match(readiness, /\/api\/odds\/publication-operations/);
  assert.match(readiness, /action: "rehearse"/);
});

test("migration keeps all Odds publication operations service-only", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202608210001_preview_championship_odds_publication_rehearsal.sql", import.meta.url), "utf8");
  for (const fn of [
    "claim_preview_championship_odds_google_mirror",
    "complete_preview_championship_odds_google_mirror",
    "read_preview_championship_odds_publication_diagnostics",
    "publish_preview_championship_odds",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}.*service_role`));
  }
});
