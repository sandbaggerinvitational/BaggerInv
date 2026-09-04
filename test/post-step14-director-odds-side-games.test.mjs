import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readProductionDirectorOverview } from "../lib/production-director-console.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function dependencies(overrides = {}) {
  return {
    readTournamentLiveView: async () => ({
      tournament: {
        tournament_id: "2026",
        tournament_year: 2026,
        name: "Sandbagger Invitational",
      },
      players: [],
      matches: [],
    }),
    tournamentLiveDataFromSupabaseView: () => ({
      tournament: {
        id: "2026",
        year: 2026,
        name: "Sandbagger Invitational",
        status: "UPCOMING",
      },
      rounds: [],
    }),
    inspectEnrollment: async () => null,
    inspectReadState: async () => ({
      scoring_authority: "SUPABASE",
      current_tournament_read_authority: "SUPABASE",
      participant_identity_authority: "SUPABASE",
      scoring_ingress_enabled: true,
      workers_enabled: true,
    }),
    inspectWorkers: async () => ({
      ingress: { state: "OPEN" },
      worker_controls: {
        SCORING_GOOGLE_OUTBOX: { enabled: true },
        ROUND_SCORECARDS_ARCHIVE: { enabled: true },
      },
      outbox_counts: { DELIVERED: 1 },
      archive_counts: { VERIFIED: 1 },
    }),
    readOdds: async () => null,
    readOddsPublication: async () => ({
      state: "PUBLISHED",
      publication_revision: 1,
      published_snapshot_id: "odds-snapshot",
      published_at: "2026-07-20T02:54:17.133Z",
      freshness: "CURRENT",
      authority: "SUPABASE",
    }),
    readPredictionSettings: async () => ({
      revision: 2,
      validationStatus: "VALID",
      synchronizedAt: "2026-08-24T02:31:24.443Z",
    }),
    readNetSkins: async () => ({
      netSkinsState: {
        available: true,
        state: "NOT_CONFIGURED",
        configurationRevision: 1,
        resultRevision: 0,
      },
      netSkins: { rounds: [] },
    }),
    readCalcutta: async () => ({
      state: "NOT_CONFIGURED",
      publication_state: "UNPUBLISHED",
      published: false,
      configuration_revision: 1,
      auction_revision: 0,
      publication_revision: 0,
      result_revision: null,
    }),
    readPrivateOperations: async () => ({
      contract_version: "production-director-private-operations-v1",
      tournament_id: "2026",
      net_skins: {
        state: "NOT_CONFIGURED",
        configuration_revision: 1,
        result_revision: null,
        readiness: {
          state: "NEEDS_SETUP",
          can_configure: false,
          total_matches: 24,
          ready_matches: 0,
          issues: [],
        },
        jobs: [],
      },
      calcutta: {
        state: "NOT_CONFIGURED",
        publication_state: "UNPUBLISHED",
        currency_code: "USD",
        configuration_revision: 1,
        auction_revision: 0,
        publication_revision: 0,
        result_revision: null,
        configuration: null,
        auction: null,
        publication: { revision: 0, state: "UNPUBLISHED", published_at: "" },
        result: null,
        jobs: [],
      },
      audit_timeline: [],
    }),
    ...overrides,
  };
}

test("Odds & Side Games renders its secure operation identity hook instead of throwing", async () => {
  const ui = await source("app/admin/director/ProductionDirectorOperations.js");
  const definition = ui.indexOf("function useRequestFingerprints()");
  const netSkins = ui.indexOf("function NetSkinsCard");
  const calcutta = ui.indexOf("function CalcuttaCard");

  assert.ok(definition >= 0, "the secure request-fingerprint hook must be defined");
  assert.ok(definition < netSkins && definition < calcutta);
  assert.equal((ui.match(/useRequestFingerprints/g) || []).length, 3);
  assert.match(ui, /globalThis\.crypto\?\.randomUUID/);
  assert.match(ui, /globalThis\.crypto\.subtle\.digest\(\s*"SHA-256"/);
  assert.match(ui, /values\.current\.set\(key, fingerprint\)/);
});

test("current Production Odds and legitimate unconfigured side games remain renderable", async () => {
  const data = await readProductionDirectorOverview({
    env: { VERCEL_ENV: "production" },
    actorAuthUserId: "22222222-2222-4222-8222-222222222222",
    actorPlayerId: "CB01",
    dependencies: dependencies(),
  });

  assert.equal(data.tournament.id, "2026");
  assert.equal(data.authority.reads.value, "SUPABASE");
  assert.deepEqual(data.publications.odds, {
    available: true,
    state: "PUBLISHED",
    label: "Published",
    publishedAt: "2026-07-20T02:54:17.133Z",
    revision: 1,
    snapshotId: "odds-snapshot",
    freshness: "CURRENT",
    authority: "SUPABASE",
    stale: false,
  });
  assert.equal(data.projections.predictionSettings.revision, 2);
  assert.equal(data.publications.netSkins.state, "NOT_CONFIGURED");
  assert.deepEqual(data.publications.netSkins.configuredRounds, []);
  assert.equal(data.privateOperations.netSkins.readiness.state, "NEEDS_SETUP");
  assert.deepEqual(data.privateOperations.netSkins.jobs, []);
  assert.equal(data.publications.calcutta.state, "NOT_CONFIGURED");
  assert.equal(data.publications.calcutta.publicationState, "UNPUBLISHED");
  assert.equal(data.privateOperations.calcutta.configuration, null);
  assert.deepEqual(data.privateOperations.calcutta.jobs, []);
});

test("an unavailable side-game read fails locally without hiding unrelated Director data", async () => {
  const data = await readProductionDirectorOverview({
    env: { VERCEL_ENV: "production" },
    actorAuthUserId: "22222222-2222-4222-8222-222222222222",
    actorPlayerId: "CB01",
    dependencies: dependencies({
      readNetSkins: async () => {
        throw Object.assign(new Error("temporarily unavailable"), {
          code: "PRODUCTION_NET_SKINS_READ_FAILED",
        });
      },
    }),
  });

  assert.equal(data.tournament.id, "2026");
  assert.equal(data.publications.odds.state, "PUBLISHED");
  assert.equal(data.publications.calcutta.state, "NOT_CONFIGURED");
  assert.equal(data.publications.netSkins.state, "UNAVAILABLE");
  assert.ok(data.readinessIssues.some((issue) => issue.id === "netSkins-unavailable"));
});

test("Director overview keeps entitlement, Preview isolation, and Supabase-only read boundaries", async () => {
  const [route, overview] = await Promise.all([
    source("app/api/director/production-overview/route.js"),
    source("lib/production-director-console.js"),
  ]);

  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /authorization\.source !== "production-director-entitlement"/);
  assert.match(route, /status: failure\.status/);
  assert.match(overview, /import\("\.\/published-odds-supabase\.js"\)/);
  assert.match(overview, /import\("\.\/production-net-skins-v1\.js"\)/);
  assert.match(overview, /import\("\.\/production-calcutta-server\.js"\)/);
  assert.doesNotMatch(overview, /import\("\.\/(?:google-sheets|google-read|google-loader)/);
});
