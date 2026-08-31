import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProductionDirectorOverview,
  buildProductionTournamentDay,
  productionMatchControlActions,
} from "../lib/production-director-console.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const mutationContract = {
  version: "scoring-mutation-authority-v1",
  scoringAuthority: "supabase",
  authorityGeneration: "authority-generation",
  admissionGeneration: "admission-generation",
  activationRevision: 118,
  admissionRevision: 26,
  deploymentId: "dpl_production",
  deploymentCommit: "a".repeat(40),
};

function fixture({ status = "UPCOMING", locked = false, scoredHoles = 0, complete = false, unresolved = 0, result = "Scheduled", permissions = "active", scoringReady = true } = {}) {
  const players = [
    { player_id: "CB01", display_name: "Clay", team_side: 1 },
    { player_id: "AM01", display_name: "Alex", team_side: 2 },
  ];
  const match = {
    match_id: "2026-R1-1", tournament_id: "2026", round_number: 1, match_number: 1,
    status, format: "BB", scoring_locked: locked, current_hole: scoredHoles,
    scored_holes: scoredHoles, holes_remaining: 18 - scoredHoles,
    running_result: result, result_winner: complete ? "Team 1" : "",
    scorecard_complete: complete, unresolved_mutations: unresolved,
    scoring_ready: scoringReady,
    scoring_readiness_reasons: scoringReady ? [] : ["Scoring snapshot needs preparation."],
    match_revision: 7, permission_revision: 4, updated_at: "2026-09-24T15:00:00Z",
  };
  const permissionRows = permissions === "missing" ? [] : players.map((player, index) => ({
    match_id: match.match_id,
    player_id: player.player_id,
    permission_revision: 4,
    can_score: permissions === "active" || (permissions === "mixed" && index === 0),
    revoked_at: permissions === "active" || (permissions === "mixed" && index === 0) ? null : "2026-09-24T14:00:00Z",
  }));
  return {
    live: { rounds: [{ number: 1, label: "Opening Four-Ball", format: "Best Ball", status, matches: [{
      id: match.match_id, round: 1, match: "1", format: "BB", formatName: "Best Ball", status,
      course: { id: "PINE", name: "Pinehurst", tee: "Blue" }, teeTime: "8:00 AM", startingHole: "1",
      team1Players: [{ id: "CB01", name: "Clay" }], team2Players: [{ id: "AM01", name: "Alex" }],
      currentHole: scoredHoles, scoredHoles, holesRemaining: 18 - scoredHoles, scoringLocked: locked,
      liveStatusText: result, matchRevision: 7,
    }] }] },
    view: { matches: [{ match, participants: players, presentation: { display_match_number: "1" } }] },
    scoringState: { matches: [match], permissions: permissionRows },
  };
}

test("Tournament Day exposes only legal state-aware controls and keeps scoring lock separate from access", () => {
  const upcoming = buildProductionTournamentDay({ ...fixture(), mutationContract });
  assert.equal(upcoming.available, true);
  assert.deepEqual(upcoming.rounds[0].matches[0].actions, ["mark-live", "scoring-lock", "access-revoke"]);
  assert.equal(upcoming.rounds[0].matches[0].accessState, "ACTIVE");

  const notReady = buildProductionTournamentDay({ ...fixture({ scoringReady: false }), mutationContract });
  assert.deepEqual(notReady.rounds[0].matches[0].actions, ["scoring-lock", "access-revoke"]);
  assert.match(notReady.rounds[0].matches[0].warnings[0], /snapshot needs preparation/i);

  const locked = buildProductionTournamentDay({ ...fixture({ status: "LIVE", locked: true, permissions: "revoked" }), mutationContract });
  assert.deepEqual(locked.rounds[0].matches[0].actions, ["scoring-unlock"]);
  assert.equal(locked.rounds[0].matches[0].accessState, "REVOKED");

  const missing = buildProductionTournamentDay({ ...fixture({ status: "LIVE", locked: true, permissions: "missing" }), mutationContract });
  assert.deepEqual(missing.rounds[0].matches[0].actions, []);
  assert.equal(missing.rounds[0].matches[0].accessState, "NEEDS_SETUP");
  assert.match(missing.rounds[0].matches[0].warnings[0], /needs setup/i);
});

test("Finalize and Reopen controls follow the installed scorecard predicates", () => {
  assert.deepEqual(productionMatchControlActions({
    status: "LIVE", scoringLocked: false, accessState: "ACTIVE", permissionComplete: true,
    scoredHoles: 17, scorecardComplete: false, unresolvedMutations: 0, result: "Team 1 2 up",
  }), ["scoring-lock", "access-revoke"]);
  assert.deepEqual(productionMatchControlActions({
    status: "LIVE", scoringLocked: false, accessState: "ACTIVE", permissionComplete: true,
    scoredHoles: 18, scorecardComplete: true, unresolvedMutations: 0, result: "Team 1 2 up", resultWinner: "Team 1",
  }), ["scoring-lock", "access-revoke", "finalize"]);
  assert.deepEqual(productionMatchControlActions({
    status: "LIVE", scoringLocked: false, accessState: "ACTIVE", permissionComplete: true,
    scoredHoles: 18, scorecardComplete: true, unresolvedMutations: 0, result: "Complete", resultWinner: "",
  }), ["scoring-lock", "access-revoke"]);
  assert.deepEqual(productionMatchControlActions({
    status: "LIVE", scoringLocked: false, accessState: "ACTIVE", permissionComplete: true,
    scoredHoles: 18, scorecardComplete: true, unresolvedMutations: 1, result: "Team 1",
  }), ["scoring-lock", "access-revoke"]);
  assert.deepEqual(productionMatchControlActions({ status: "FINAL", scoringLocked: true, accessState: "REVOKED", permissionComplete: true }), ["reopen"]);
});

test("Production model reports safe Odds, Net Skins, Calcutta, projection, and worker status without fabricating facts", () => {
  const current = fixture({ status: "LIVE" });
  const data = buildProductionDirectorOverview({
    ...current,
    live: { ...current.live, tournament: { id: "2026", year: 2026, name: "Sandbagger Invitational", status: "Live", currentRound: 1 } },
    readState: { scoring_authority: "SUPABASE", current_tournament_read_authority: "SUPABASE", participant_identity_authority: "SUPABASE", scoring_ingress_enabled: true, workers_enabled: true },
    mutationContract,
    workers: { ingress: { state: "OPEN" }, worker_controls: { SCORING_GOOGLE_OUTBOX: { enabled: true }, ROUND_SCORECARDS_ARCHIVE: { enabled: true } }, outbox_counts: { DELIVERED: 3 }, archive_counts: { VERIFIED: 2, SUPERSEDED: 1 } },
    oddsPublication: { state: "PUBLISHED", publication_revision: 4, published_snapshot_id: "snapshot", published_at: "2026-09-24T12:00:00Z", freshness: "CURRENT", authority: "SUPABASE" },
    netSkins: { netSkinsState: { state: "NOT_CONFIGURED", available: true, configurationRevision: 0, resultRevision: 0 }, netSkins: { rounds: [] } },
    calcutta: { state: "NOT_CONFIGURED", publication_state: "UNPUBLISHED", configuration_revision: 1, auction_revision: 0, publication_revision: 0, result_revision: null },
    predictionSettings: { revision: 8, validationStatus: "VALID", synchronizedAt: "2026-09-23T12:00:00Z" },
    draft: { drafts: [{ year: 2026, status: "CONFIGURED", picks: [{ id: 1 }], projection: { revision: 5, synchronizedAt: "2026-09-22T12:00:00Z" } }] },
    guide: { metadata: { revision: 9, publishedAt: "2026-09-21T12:00:00Z" } },
  });
  assert.equal(data.publications.odds.authority, "SUPABASE");
  assert.equal(data.publications.netSkins.state, "NOT_CONFIGURED");
  assert.equal(data.publications.calcutta.state, "NOT_CONFIGURED");
  assert.equal(data.publications.calcutta.auctionRevision, 0);
  assert.equal(data.projections.draft.pickCount, 1);
  assert.equal(data.workers.pending, 0);
});

test("Tournament Day UI reuses certified APIs, preserves idempotency, threads stale revisions, and waits for receipts", async () => {
  const [ui, directorRoute, liveRoute, adapter] = await Promise.all([
    source("app/admin/director/ProductionDirectorOperations.js"),
    source("app/api/director/route.js"),
    source("app/api/live-matches/route.js"),
    source("lib/scoring-persistence-adapter.js"),
  ]);
  assert.match(ui, /createClientMutationOperationIdentityRegistry/);
  assert.match(ui, /\/api\/director\/tournament-setup/);
  assert.match(ui, /setup\?\.scoringReady === true/);
  assert.match(ui, /Scoring readiness is temporarily unavailable\. Mark Live is paused\./);
  assert.match(ui, /priorWarnings = match\.warnings\.filter/);
  assert.match(ui, /"match-mark-live"/);
  assert.match(ui, /"match-lock-scoring"/);
  assert.match(ui, /"match-unlock-scoring"/);
  assert.match(ui, /"access-generate"/);
  assert.match(ui, /"access-disable"/);
  assert.match(ui, /"match-finalize"/);
  assert.match(ui, /"match-reopen"/);
  assert.match(ui, /expectedMatchRevision: pending\.match\.matchRevision/);
  assert.match(ui, /expectedPermissionRevision: pending\.match\.permissionRevision/);
  assert.match(ui, /Promise\.all\(\[refresh\(\), loadSetupReadiness\(\)\]\)/);
  assert.match(ui, /Controls are paused because the latest authoritative match revisions are unavailable/);
  assert.match(ui, /Scoring is locked and participant scoring access is revoked/);
  assert.match(ui, /Scoring is unlocked and participant scoring access is activated/);
  assert.match(directorRoute, /expectedMatchRevision: input\.expectedMatchRevision/);
  assert.match(directorRoute, /receipt: lifecycle\.result/);
  assert.match(liveRoute, /expectedPermissionRevision/);
  assert.match(adapter, /expected_match_revision: expectedMatchRevision == null/);
  assert.match(adapter, /permission_revision: expectedPermissionRevision == null/);
  assert.match(adapter, /PRODUCTION_MATCH_NOT_SCORING_READY:[\s\S]*prepare a current scoring snapshot/);
});

test("Odds UI is Supabase-publication-only and Prediction Settings authoring never auto-publishes", async () => {
  const [ui, publishRoute, syncRoute] = await Promise.all([
    source("app/admin/director/ProductionDirectorOperations.js"),
    source("app/api/odds/publish/route.js"),
    source("app/api/admin/production-director-synchronization/route.js"),
  ]);
  assert.match(ui, /\/api\/admin\/production-odds-calculations/);
  assert.match(ui, /\/api\/odds\/publish/);
  assert.match(ui, /job\.publicationEligible === true/);
  assert.match(ui, /upper\(job\.status\) === "RETRYABLE"/);
  assert.match(ui, /ProductionPredictionSettingsEditor/);
  assert.doesNotMatch(ui, /domain="PREDICTION_SETTINGS"/);
  assert.doesNotMatch(ui, /publication-operations|odds\/prediction-settings|Google Odds publication/i);
  assert.match(publishRoute, /googlePublication: "RETIRED"/);
  assert.match(syncRoute, /PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED/);
  assert.doesNotMatch(syncRoute, /publishProductionOdds|\/api\/odds\/publish/);
});

test("side-game, Draft, Guide, and System panels honor missing-operation boundaries", async () => {
  const ui = await source("app/admin/director/ProductionDirectorOperations.js");
  assert.match(ui, /Net Skins will become configurable once tournament pairings and handicap inputs are complete/);
  assert.match(ui, /No 2026 financial facts have been entered/);
  assert.match(ui, /Director-private Calcutta review/);
  assert.match(ui, /Rules & payout allocation/);
  assert.match(ui, /domain="DRAFT"/);
  assert.match(ui, /domain="GUIDE"/);
  assert.match(ui, /\["STALE", "UNAVAILABLE"\]/);
  assert.match(ui, /correctionReason/);
  assert.match(ui, /Publish Exact Auction Revision/);
  assert.match(ui, /failed sync preserves the previous revision/i);
  assert.match(ui, /No generic enable, disable, or unbounded retry is exposed/);
  assert.match(ui, /Allowlisted Director and tournament activity only/);
  assert.match(ui, /Raw audit payloads, internal identifiers, and infrastructure evidence are never returned/);
  assert.doesNotMatch(ui, /service.role|service_role|secret key|access token|request_fingerprint|payload_hash|raw SQL/i);
});

test("Production authorization and Preview isolation remain on existing routes with no shared password", async () => {
  const [overviewRoute, syncRoute, netRoute, calcuttaRoute, consoleSource] = await Promise.all([
    source("app/api/director/production-overview/route.js"),
    source("app/api/admin/production-director-synchronization/route.js"),
    source("app/api/admin/production-net-skins-v1/route.js"),
    source("app/api/admin/production-calcutta-v1/route.js"),
    source("app/admin/director/ProductionDirectorConsole.js"),
  ]);
  assert.match(overviewRoute, /production-director-entitlement/);
  for (const route of [syncRoute, netRoute, calcuttaRoute]) {
    assert.match(route, /VERCEL_ENV/);
    assert.match(route, /assertProductionCutoverRequest/);
    assert.match(route, /allowBootstrap: false/);
  }
  assert.doesNotMatch(consoleSource, /password|sharedSecret|x-admin-secret/i);
  assert.match(consoleSource, /WeeklyHandicapPanel/);
});
