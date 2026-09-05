import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildTournamentAwardsMutation,
  canonicalTournamentAwards,
  normalizeProductionTournamentAwardsPayload,
} from "../../lib/production-tournament-awards-contract.js";

const migrationUrl = new URL(
  "../../supabase/production_migrations/202609050089_production_tournament_awards_v1.sql",
  import.meta.url,
);
const compatibilityMigrationUrl = new URL(
  "../../supabase/production_migrations/202609050090_production_tournament_awards_service_scope_v1.sql",
  import.meta.url,
);
const tournamentSetupMigrationUrl = new URL(
  "../../supabase/production_migrations/202608300063_production_tournament_setup_v1.sql",
  import.meta.url,
);
const handicapMigrationUrl = new URL(
  "../../supabase/production_migrations/202608290058_production_handicap_revisions_v1.sql",
  import.meta.url,
);
const panelUrl = new URL(
  "../../app/admin/director/ProductionTournamentAwardsPanel.js",
  import.meta.url,
);
const setupPanelUrl = new URL(
  "../../app/admin/director/ProductionTournamentSetupPanel.js",
  import.meta.url,
);
const routeUrl = new URL(
  "../../app/api/director/tournament-awards/route.js",
  import.meta.url,
);
const serverUrl = new URL(
  "../../lib/production-tournament-awards-server.js",
  import.meta.url,
);
const [sql, compatibilitySql, tournamentSetupSql, handicapSql, panel, setupPanel, route, server] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(compatibilityMigrationUrl, "utf8"),
  readFile(tournamentSetupMigrationUrl, "utf8"),
  readFile(handicapMigrationUrl, "utf8"),
  readFile(panelUrl, "utf8"),
  readFile(setupPanelUrl, "utf8"),
  readFile(routeUrl, "utf8"),
  readFile(serverUrl, "utf8"),
]);

const id = "123e4567-e89b-42d3-a456-426614174000";
const operationId = "123e4567-e89b-42d3-a456-426614174001";

test("Awards contract supports pending, Player, Team, and bounded text winners", () => {
  const awards = canonicalTournamentAwards([
    { awardId: id, title: "Tournament MVP", displayOrder: 1, recipientKind: "UNAVAILABLE", publicationState: "DRAFT" },
    { awardId: "123e4567-e89b-42d3-a456-426614174002", title: "Team Honor", displayOrder: 2, recipientKind: "TEAM", winnerTeamId: "PICKLES", publicationState: "PUBLISHED" },
    { awardId: "123e4567-e89b-42d3-a456-426614174003", title: "Player Honor", displayOrder: 3, recipientKind: "PLAYER", winnerPlayerId: "CB01", publicationState: "PUBLISHED" },
    { awardId: "123e4567-e89b-42d3-a456-426614174004", title: "Special Recognition", displayOrder: 4, recipientKind: "TEXT", recipientDisplay: "Tournament volunteers", publicationState: "PUBLISHED" },
  ]);
  assert.deepEqual(awards.map((award) => award.recipientKind), ["UNAVAILABLE", "TEAM", "PLAYER", "TEXT"]);
  assert.throws(() => canonicalTournamentAwards([
    { awardId: id, title: "Pending", displayOrder: 1, recipientKind: "UNAVAILABLE", publicationState: "PUBLISHED" },
  ]), /Assign a winner/);
  assert.throws(() => canonicalTournamentAwards([
    { awardId: id, title: "<script>", displayOrder: 1 },
  ]), /valid award title/i);
});

test("stable identities, deterministic order, and optimistic mutation metadata are required", () => {
  const mutation = buildTournamentAwardsMutation({
    expectedRevision: 0,
    operationRequestId: operationId,
    awards: [{ awardId: id, title: "Tournament MVP", displayOrder: 1 }],
  });
  assert.equal(mutation.operation, "SAVE_PRODUCTION_TOURNAMENT_AWARDS_V1");
  assert.equal(mutation.expected_revision, 0);
  assert.equal(mutation.awards[0].award_id, id);
  assert.throws(() => canonicalTournamentAwards([
    { awardId: id, title: "One", displayOrder: 1 },
    { awardId: id, title: "Two", displayOrder: 2 },
  ]), /unique stable identity/i);
  assert.throws(() => canonicalTournamentAwards([
    { awardId: id, title: "One", displayOrder: 1 },
    { awardId: "123e4567-e89b-42d3-a456-426614174009", title: "Two", displayOrder: 1 },
  ]), /unique display position/i);
});

test("empty current Awards state is a successful revision-zero projection", () => {
  const value = normalizeProductionTournamentAwardsPayload({
    ok: true, tournamentId: "2026", revision: 0, awards: [], roster: [], teams: [], history: [], audit: [],
  });
  assert.equal(value.revision, 0);
  assert.deepEqual(value.awards, []);
});

test("089 installs inert private revision storage and bounded service-only RPCs", () => {
  assert.match(sql, /^-- Production Director Tournament Awards V1[\s\S]*\nbegin;/);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\s*$/);
  const beforeRpc = sql.slice(0, sql.indexOf("create function public.read_production_tournament_awards_v1"));
  assert.doesNotMatch(beforeRpc, /\ninsert\s+into\s+/i);
  for (const table of [
    "tournament_award_revisions_v1",
    "tournament_award_items_v1",
    "tournament_awards_current_v1",
    "tournament_award_operation_receipts_v1",
    "tournament_award_audit_events_v1",
  ]) {
    assert.match(sql, new RegExp(`create table production_control\\.${table} \\(`));
    assert.match(sql, new RegExp(`alter table production_control\\.${table}[\\s\\S]*?enable row level security;`));
  }
  assert.match(sql, /before update or delete on production_control\.tournament_award_revisions_v1/);
  assert.match(sql, /before update or delete on production_control\.tournament_award_items_v1/);
  assert.match(sql, /before update or delete on\s+production_control\.tournament_award_operation_receipts_v1/);
  assert.match(sql, /from public, anon, authenticated, service_role;/);
  assert.match(sql, /to service_role;/);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|all) on (?:table )?production_control\.tournament_award/i);
});

test("090 replaces only the incompatible role check with the established private scope contract", () => {
  assert.match(compatibilitySql, /^-- Production Director Tournament Awards V1\.1[\s\S]*\nbegin;/);
  assert.match(compatibilitySql, /notify pgrst, 'reload schema';\ncommit;\s*$/);
  assert.match(compatibilitySql, /create or replace function production_control\.assert_tournament_awards_runtime_v1\(/);
  assert.match(compatibilitySql, /perform production_control\.assert_exact_cutover_resource_scope\(input, false\);/);
  assert.match(compatibilitySql, /perform production_control\.assert_production_scoring_actor\(input, true\);/);
  const helperBody = compatibilitySql.slice(
    compatibilitySql.indexOf("as $assert_tournament_awards_runtime$"),
    compatibilitySql.indexOf("$assert_tournament_awards_runtime$;", compatibilitySql.indexOf("as $assert_tournament_awards_runtime$") + 1),
  );
  assert.doesNotMatch(helperBody, /request\.jwt\.claim\.role/);
  assert.doesNotMatch(compatibilitySql, /\b(?:insert|update|delete|truncate)\b/i);
  assert.doesNotMatch(compatibilitySql, /grant execute/i);
  assert.match(compatibilitySql, /from public, anon, authenticated, service_role;/);

  assert.match(tournamentSetupSql, /assert_player_access_runtime_v1\([\s\S]*production-players-access-v1/);
  assert.match(handicapSql, /assert_exact_cutover_resource_scope\(input, false\);[\s\S]*assert_production_scoring_actor\(input, true\);/);

  const readBody = sql.slice(
    sql.indexOf("create function public.read_production_tournament_awards_v1"),
    sql.indexOf("create function public.save_production_tournament_awards_v1"),
  );
  const writeBody = sql.slice(sql.indexOf("create function public.save_production_tournament_awards_v1"));
  assert.match(readBody, /assert_tournament_awards_runtime_v1\(input\)/);
  assert.match(writeBody, /assert_tournament_awards_runtime_v1\(input\)/);
});

test("SQL validation preserves current-roster and stable-Team identity boundaries", () => {
  assert.match(sql, /recipient_kind in \('PLAYER', 'TEAM', 'TEXT', 'UNAVAILABLE'\)/);
  assert.match(sql, /membership\.participation_status = 'ACTIVE'/);
  assert.match(sql, /membership\.tournament_id = target/);
  assert.match(sql, /team\.tournament_id = target and team\.team_id = team_value/);
  assert.match(sql, /TOURNAMENT_AWARDS_PENDING_PUBLICATION_INVALID/);
  assert.match(sql, /TOURNAMENT_AWARDS_PUBLISHED_REMOVAL_INVALID/);
  assert.match(sql, /value->>'publication_state'='PUBLISHED'/);
  assert.match(sql, /tournament_awards_archive_projection_v1/);
  assert.match(sql, /completed_history_awards shape/);
  assert.doesNotMatch(sql, /tournament_award_recipient_v1/);
  assert.match(sql, /left join scoring_authority\.players winner_player/);
  assert.match(sql, /left join scoring_authority\.teams winner_team/);
});

test("mutation is CAS/idempotent, database-hashed, and audit metadata is sanitized", () => {
  assert.match(sql, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(/);
  assert.ok(sql.indexOf("pg_advisory_xact_lock") < sql.indexOf("into prior"));
  assert.match(sql, /TOURNAMENT_AWARDS_REVISION_STALE/);
  assert.match(sql, /TOURNAMENT_AWARDS_OPERATION_REQUEST_CONFLICT/);
  assert.match(sql, /tournament_awards_hash_v1\(/);
  assert.match(sql, /declared_request_payload_hash=declared_hash/);
  assert.match(sql, /database_request_payload_hash=database_hash/);
  assert.match(sql, /'idempotent',true/);
  const auditTable = sql.slice(sql.indexOf("create table production_control.tournament_award_audit_events_v1"), sql.indexOf("alter table production_control.tournament_award_revisions_v1"));
  assert.doesNotMatch(auditTable, /winner|title|description|payload_hash/i);
  assert.match(sql, /'itemCount',item_count_value,'publishedCount',published_count_value/);
});

test("Director route uses Production Auth, same-origin mutation, and Supabase-only transport", () => {
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /source !== "production-director-entitlement"/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /googleRequests: 0/);
  assert.match(server, /recordDataAuthorityTransport\("supabase"/);
  assert.match(server, /const RPCS = new Set\(\[/);
  assert.match(server, /const result = \{ apikey: secret, "content-type": "application\/json" \}/);
  assert.match(server, /if \(!secret\.startsWith\("sb_secret_"\)\) result\.authorization/);
  assert.ok(route.indexOf("const access = await authorize(request)") < route.indexOf("readProductionTournamentAwards(actor(access.identity))"));
  assert.ok(route.indexOf("const access = await authorize(request, { mutation: true })") < route.indexOf("saveProductionTournamentAwards({ ...input"));
  assert.doesNotMatch(server, /google-sheets|googleapis|fetchGoogle/i);
});

test("Director UI is accessible, non-drag-only, and nested in Tournament Setup", () => {
  assert.match(setupPanel, /\["awards", "Awards"\]/);
  assert.match(setupPanel, /<ProductionTournamentAwardsPanel/);
  assert.match(panel, /No tournament awards configured\./);
  assert.match(panel, /Move Up/);
  assert.match(panel, /Move Down/);
  assert.doesNotMatch(panel, /draggable|onDrag/);
  assert.match(panel, /<label>/);
  assert.match(panel, /type="button"/);
  assert.match(panel, /role=\{phase === "failure" \? "alert" : "status"\}/);
});
