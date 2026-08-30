import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  directorAccessDiscoveryEnvironment,
  directorAccessDiscoveryResponse,
  resolveDirectorAccessDiscovery,
} from "../lib/director-access-discovery.js";
import {
  PRODUCTION_DIRECTOR_SECTIONS,
  buildProductionDirectorOverview,
  productionDirectorAuthorizationFailure,
  readProductionDirectorOverview,
} from "../lib/production-director-console.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const view = {
  tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
  players: Array.from({ length: 24 }, (_, index) => ({ player_id: `P${index + 1}`, participation_status: "ACTIVE" })),
  matches: [{ match: { match_id: "2026-R1-1", round_number: 1, match_number: 1, status: "LIVE", updated_at: "2026-09-24T15:00:00Z" } }],
};

const live = {
  tournament: { id: "2026", year: 2026, name: "Sandbagger Invitational", location: "Pinehurst", dates: "Sep 24–27", status: "Live", currentRound: 1 },
  rounds: [{ number: 1, label: "Opening Four-Ball", format: "Best Ball", status: "LIVE" }],
};

const readState = {
  ok: true,
  activation_state: "ACTIVE",
  read_cutover_phase: "OBSERVATION",
  current_tournament_read_authority: "SUPABASE",
  scoring_authority: "SUPABASE",
  participant_identity_authority: "SUPABASE",
  scoring_ingress_enabled: true,
  workers_enabled: true,
};

test("Production Director discovery is enabled by the existing Production entitlement gate", async () => {
  const environment = directorAccessDiscoveryEnvironment({
    previewEnabled: false,
    production: { production: true, enabled: true, reason: "production-director-entitlement-ready" },
  });
  assert.deepEqual(environment, {
    enabled: true,
    mode: "production",
    reason: "production-director-entitlement-ready",
  });
  let authorizeInput;
  const authorized = await resolveDirectorAccessDiscovery({
    request: { url: "https://baggerinv.com/api/director/access" },
    environment,
    authorizeDirector: async (input) => {
      authorizeInput = input;
      return { status: "active", source: "production-director-entitlement" };
    },
  });
  assert.equal(authorized.status, 200);
  assert.equal(authorizeInput.allowBootstrap, false);
  assert.deepEqual(authorized.body, {
    authorized: true,
    source: "production-director-entitlement",
    linked: undefined,
  });
});

test("ordinary participants do not discover Director navigation and Preview discovery remains isolated", async () => {
  const unauthorized = await resolveDirectorAccessDiscovery({
    environment: { enabled: true, mode: "production" },
    authorizeDirector: async () => ({ status: "inactive" }),
  });
  assert.equal(unauthorized.status, 200);
  assert.deepEqual(unauthorized.body, { authorized: false, source: undefined, linked: undefined });
  assert.deepEqual(directorAccessDiscoveryEnvironment({
    previewEnabled: true,
    production: { production: false, enabled: false },
  }), {
    enabled: true,
    mode: "preview",
    reason: "preview-director-entitlement-ready",
  });
});

test("Director authorization outages and Production data outages remain distinct", async () => {
  assert.equal(
    directorAccessDiscoveryResponse({ status: "unavailable" }).body.code,
    "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
  );
  assert.equal(
    productionDirectorAuthorizationFailure({ status: "unavailable" }).code,
    "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
  );
  await assert.rejects(() => readProductionDirectorOverview({ dependencies: {
    readTournamentLiveView: async () => { throw Object.assign(new Error("read failed"), { code: "TOURNAMENT_READ_UNAVAILABLE" }); },
    tournamentLiveDataFromSupabaseView: () => live,
    inspectEnrollment: async () => ({ payload: { ok: true } }),
    inspectReadState: async () => readState,
    inspectWorkers: async () => ({ payload: { ok: true } }),
    readOdds: async () => ({ payload: { ok: true, data: {} } }),
    readNetSkins: async () => ({}),
    readCalcutta: async () => ({}),
  } }), (error) => error.code === "DIRECTOR_DATA_UNAVAILABLE" &&
    error.causeCode === "TOURNAMENT_READ_UNAVAILABLE");
});

test("Production overview reads Supabase contracts without touching Preview, Passport, or workbook readiness", async () => {
  let previewReadinessCalls = 0;
  let passportCalls = 0;
  let workbookCalls = 0;
  const data = await readProductionDirectorOverview({ dependencies: {
    readTournamentLiveView: async () => ({ payload: { ok: true, data: view } }),
    tournamentLiveDataFromSupabaseView: () => live,
    inspectEnrollment: async () => ({ payload: { ok: true, activeRosterCount: 24, enrolledCount: 18, notEnrolledCount: 6, invalidEnrolledCount: 0 } }),
    inspectReadState: async () => readState,
    inspectWorkers: async () => ({ payload: { ok: true, ingress: { state: "OPEN" }, worker_controls: {
      SCORING_GOOGLE_OUTBOX: { enabled: true }, ROUND_SCORECARDS_ARCHIVE: { enabled: true },
    }, outbox_counts: { DELIVERED: 12 }, archive_counts: { COMPLETE: 3 } } }),
    readOdds: async () => ({ payload: { ok: true, data: { snapshots: [{ is_current_official: true, milestone: "OPENING", published_at: "2026-09-23T10:00:00Z" }] } } }),
    readNetSkins: async () => ({ netSkinsState: { state: "CONFIGURED", available: true } }),
    readCalcutta: async () => ({ calcuttaState: { state: "OPEN", available: true } }),
    readHandicaps: async () => ({ ok: true, revision_number: 7 }),
    readTournamentReadiness: async () => { previewReadinessCalls += 1; },
    inspectPassport: async () => { passportCalls += 1; },
    readWorkbook: async () => { workbookCalls += 1; },
  } });
  assert.equal(data.mode, "production");
  assert.equal(data.tournament.rosterCount, 24);
  assert.equal(data.enrollment.enrolled, 18);
  assert.equal(data.authority.scoring.value, "SUPABASE");
  assert.equal(data.authority.ingress.value, "OPEN");
  assert.equal(data.workers.healthy, true);
  assert.equal(data.publications.odds.state, "PUBLISHED");
  assert.deepEqual(data.handicaps, { available: true, currentRevision: 7 });
  assert.deepEqual([previewReadinessCalls, passportCalls, workbookCalls], [0, 0, 0]);
});

test("Production console foundation exposes the bounded navigation and hides legacy editors", async () => {
  assert.deepEqual(PRODUCTION_DIRECTOR_SECTIONS.map((section) => section.label), [
    "Overview", "Players & Access", "Handicaps", "Tournament Setup", "Tournament Day", "Odds & Side Games", "Draft & Guide", "System / Audit",
  ]);
  const [consoleSource, page, productionRoute, legacyDashboard] = await Promise.all([
    source("app/admin/director/ProductionDirectorConsole.js"),
    source("app/admin/director/page.js"),
    source("app/api/director/production-overview/route.js"),
    source("app/admin/director/DirectorDashboard.js"),
  ]);
  for (const hidden of [
    "Round Pairings", "Match Management", "Course Tees", "Preview As",
    "Reset Preview Tournament", "Open Full Admin", "Player Passport", "Workbook Connected",
  ]) assert.doesNotMatch(consoleSource, new RegExp(hidden), hidden);
  assert.match(consoleSource, /data-production-console-slot="handicaps"[\s\S]*WeeklyHandicapPanel/);
  assert.match(consoleSource, /section === "players-access"[\s\S]*ProductionPlayersAccessPanel/);
  assert.match(page, /production\.production && !production\.enabled[\s\S]*allowBootstrap: !production\.production[\s\S]*ProductionDirectorConsole[\s\S]*DirectorDashboard/);
  assert.match(productionRoute, /authorization\.source !== "production-director-entitlement"/);
  assert.match(productionRoute, /DIRECTOR_DATA_UNAVAILABLE/);
  assert.match(legacyDashboard, /DirectorOperationsHub/);
  assert.match(legacyDashboard, /data\.qaTools \? <OperationsSection id="preview-tools"/);
});

test("post-cutover SCORING_COMMITTED state reports normal maintenance while ingress is open", () => {
  const model = buildProductionDirectorOverview({
    view,
    live,
    readState: { ...readState, activation_state: "SCORING_COMMITTED" },
    enrollment: { activeRosterCount: 24, enrolledCount: 1, notEnrolledCount: 23, invalidEnrolledCount: 0 },
    workers: { ingress: { state: "OPEN" }, worker_controls: {
      SCORING_GOOGLE_OUTBOX: { enabled: true }, ROUND_SCORECARDS_ARCHIVE: { enabled: true },
    } },
  });
  assert.deepEqual(model.authority.maintenance, { value: "NORMAL", label: "Normal" });
});

test("overview model marks legacy Production controls and Preview tooling unavailable by construction", () => {
  const model = buildProductionDirectorOverview({
    view,
    live,
    readState,
    enrollment: { activeRosterCount: 24, enrolledCount: 24, notEnrolledCount: 0, invalidEnrolledCount: 0 },
    workers: { ingress: { state: "OPEN" }, worker_controls: {
      SCORING_GOOGLE_OUTBOX: { enabled: true }, ROUND_SCORECARDS_ARCHIVE: { enabled: true },
    } },
    odds: { snapshots: [] },
    netSkins: { netSkinsState: { state: "CONFIGURED", available: true } },
    calcutta: { calcuttaState: { state: "OPEN", available: true } },
  });
  assert.equal(model.capabilities.legacyProductionEditors, false);
  assert.equal(model.capabilities.previewTools, false);
  assert.equal(model.capabilities.productionOverview, true);
  assert.equal(model.capabilities.handicapManagement, true);
  assert.deepEqual(model.handicaps, { available: false, currentRevision: null });
});
