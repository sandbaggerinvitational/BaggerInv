import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalProductionGovernanceConfirmation,
  canonicalProductionGovernanceDisplayName,
  canonicalProductionGovernanceGlobalStatus,
  canonicalProductionGovernanceName,
  canonicalProductionGovernanceOperationId,
  canonicalProductionGovernanceReason,
  canonicalProductionGovernanceRevision,
  canonicalProductionGovernanceSlug,
  mergeProductionPlayerAccessGovernance,
  normalizeProductionAccessGovernanceMutation,
  normalizeProductionAccessGovernancePayload,
  productionAccessGovernancePayloadHash,
} from "../lib/production-access-governance-contract.js";

const actor = Object.freeze({
  actorAuthUserId: "11111111-1111-4111-8111-111111111111",
  actorPlayerId: "CB01",
});
const operationRequestId = "22222222-2222-4222-8222-222222222222";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function importGovernanceServer() {
  const serverSource = await source("lib/production-access-governance-server.js");
  const contractUrl = new URL("../lib/production-access-governance-contract.js", import.meta.url).href;
  const transformed = serverSource
    .replace('import "server-only";\n', "")
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-cutover-activation-contract\.js";/,
      "function assertProductionCutoverActivation() { return { state: \"SCORING_COMMITTED\", readCutoverPhase: \"OBSERVATION\" }; }",
    )
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-foundation-resource-contract\.js";/,
      `const PRODUCTION_GOOGLE_WORKBOOK_ID = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const PRODUCTION_SUPABASE_PROJECT_REF = "ymqhhtxaywtqllynrmxe";
const PRODUCTION_SUPABASE_URL = "https://ymqhhtxaywtqllynrmxe.supabase.co";
const PRODUCTION_TOURNAMENT_ID = "2026";`,
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      "function recordDataAuthorityTransport() {}",
    )
    .replace('from "./production-access-governance-contract.js";', `from "${contractUrl}";`);
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

function governanceReadPayload(overrides = {}) {
  return {
    ok: true,
    contractVersion: "production-access-governance-v1",
    tournamentId: "2026",
    revision: 7,
    ownerAdoptionRequired: false,
    actor: { playerId: "CB01", owner: true },
    capabilities: {
      createPlayer: true,
      setGlobalStatus: true,
      withdrawMembership: true,
      reactivateMembership: true,
      grantDirector: true,
      revokeDirector: true,
    },
    players: [{
      playerId: "JD04",
      displayName: "Jane Doe",
      email: "jane@private.example",
      authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile: {
        firstName: "Jane",
        lastName: "Doe",
        slug: "jane-doe",
        globalStatus: "ACTIVE",
        revision: 2,
        canSetGlobalStatus: true,
      },
      membership: {
        exists: true,
        status: "ACTIVE",
        revision: 3,
        teamId: "USA",
        teamName: "Team USA",
        canWithdraw: true,
        blockers: [],
        readiness: ["CURRENT_DRAFT_SELECTION_PRESERVED"],
        dependencyCounts: { draft: 1, completedHistory: 4 },
      },
      governance: {
        ownerStatus: "NONE",
        directorStatus: "NOT_GRANTED",
        canGrant: true,
        canRevoke: false,
      },
    }],
    audit: [{
      eventId: "33333333-3333-4333-8333-333333333333",
      action: "PLAYER_CREATED",
      targetPlayerId: "JD04",
      actorPlayerId: "CB01",
      result: "CHANGED",
      occurredAt: "2026-08-30T12:00:00Z",
      metadata: {
        email: "must-not-cross-the-boundary@private.example",
        auth_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    }],
    ...overrides,
  };
}

test("access-governance values are canonical, bounded, and safe to hash", () => {
  assert.equal(canonicalProductionGovernanceName("  Jane   Anne  "), "Jane Anne");
  assert.equal(canonicalProductionGovernanceDisplayName("  Jane   Doe  "), "Jane Doe");
  assert.equal(canonicalProductionGovernanceSlug("", "Jáne Dœ"), "jane-d");
  assert.equal(canonicalProductionGovernanceSlug(" Jane-Doe "), "jane-doe");
  assert.equal(canonicalProductionGovernanceGlobalStatus(" alumni "), "ALUMNI");
  assert.equal(canonicalProductionGovernanceReason("  annual   roster review  "), "annual roster review");
  assert.equal(canonicalProductionGovernanceConfirmation(true), true);
  assert.equal(canonicalProductionGovernanceOperationId(operationRequestId), operationRequestId);
  assert.equal(canonicalProductionGovernanceRevision("4"), 4);
  assert.throws(() => canonicalProductionGovernanceReason("notify jane@private.example"), /non-sensitive/i);
  assert.throws(() => canonicalProductionGovernanceReason("Bearer eyJabcdefghijk"), /non-sensitive/i);
  assert.throws(() => canonicalProductionGovernanceReason("too short"), /non-sensitive/i);
  assert.throws(() => canonicalProductionGovernanceConfirmation(false), /Confirm/i);
  assert.throws(() => canonicalProductionGovernanceGlobalStatus("INACTIVE"), /Active or Alumni/i);
  assert.equal(
    productionAccessGovernancePayloadHash({ b: 2, a: { d: 4, c: 3 } }),
    productionAccessGovernancePayloadHash({ a: { c: 3, d: 4 }, b: 2 }),
  );
});

test("governance reads sort stable IDs and discard PII, Auth UUIDs, and unsafe audit metadata", () => {
  const normalized = normalizeProductionAccessGovernancePayload(governanceReadPayload());
  assert.equal(normalized.revision, 7);
  assert.equal(normalized.actor.owner, true);
  assert.equal(normalized.players[0].playerId, "JD04");
  assert.equal(normalized.players[0].membership.revision, 3);
  assert.equal(normalized.players[0].membership.dependencyCounts.draft, 1);
  assert.deepEqual(normalized.players[0].membership.readiness, ["CURRENT_DRAFT_SELECTION_PRESERVED"]);
  const serialized = JSON.stringify(normalized);
  assert.doesNotMatch(serialized, /jane@private\.example/);
  assert.doesNotMatch(serialized, /aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.doesNotMatch(serialized, /bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
  assert.doesNotMatch(serialized, /must-not-cross-the-boundary/);
});

test("governance merges with masked Player access without replacing its privacy projection", () => {
  const base = {
    contractVersion: "production-players-access-v1",
    revision: 11,
    capabilities: { "approve-email": true },
    players: [{
      playerId: "JD04",
      displayName: "Jane Doe",
      maskedEmail: "j***@r***.com",
      maskedPhone: "+••• ••• •12",
      membership: { status: "ACTIVE", teamId: "USA" },
    }],
    audit: [],
    deferred: [],
  };
  const merged = mergeProductionPlayerAccessGovernance(base, governanceReadPayload());
  assert.equal(merged.revision, 11, "Player-access and governance revisions remain distinct");
  assert.equal(merged.governanceRevision, 7);
  assert.equal(merged.players[0].maskedEmail, "j***@r***.com");
  assert.equal(merged.players[0].profile.slug, "jane-doe");
  assert.equal(merged.players[0].membership.teamId, "USA");
  assert.equal(merged.players[0].membership.revision, 3);
  assert.equal(merged.players[0].directorStatus, "NOT_GRANTED");
});

test("server read uses only the governance RPC and exact Production Director scope", async () => {
  const { readProductionAccessGovernance } = await importGovernanceServer();
  let observed;
  const result = await readProductionAccessGovernance(actor, {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (name, input) => {
      observed = { name, input };
      return { payload: governanceReadPayload() };
    },
  });
  assert.equal(result.players.length, 1);
  assert.equal(observed.name, "read_production_access_governance_v1");
  assert.equal(observed.input.contract_version, "production-access-governance-v1");
  assert.equal(observed.input.environment, "PRODUCTION");
  assert.equal(observed.input.project_ref, "ymqhhtxaywtqllynrmxe");
  assert.equal(observed.input.project_url, "https://ymqhhtxaywtqllynrmxe.supabase.co");
  assert.equal(observed.input.source_workbook_id, "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4");
  assert.equal(observed.input.tournament_id, "2026");
  assert.deepEqual(observed.input.authorization, {
    tournament_id: "2026",
    auth_user_id: actor.actorAuthUserId,
    player_id: "CB01",
    role: "DIRECTOR",
  });
});

test("server mutations forward bounded actions, global and per-row revisions, and no automatic resource flags", async () => {
  const { mutateProductionAccessGovernance } = await importGovernanceServer();
  const observed = [];
  const options = {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (name, input) => {
      observed.push({ name, input });
      return { payload: {
        ok: true,
        action: input.action,
        playerId: input.player_id || "JD04",
        revision: input.expected_revision + 1,
        profileRevision: (input.expected_profile_revision || 0) + 1,
        membershipRevision: (input.expected_membership_revision || 0) + 1,
        membershipCreated: false,
        teamChanged: false,
        authUserCreated: false,
      } };
    },
  };
  const common = { ...actor, expectedRevision: 8, operationRequestId };
  await mutateProductionAccessGovernance({
    ...common,
    action: "create-player",
    firstName: "Jane",
    lastName: "Doe",
    displayName: "Jane Doe",
    slug: "jane-doe",
    globalStatus: "ACTIVE",
  }, options);
  await mutateProductionAccessGovernance({
    ...common,
    action: "set-global-status",
    playerId: "JD04",
    globalStatus: "ALUMNI",
    expectedProfileRevision: 2,
  }, options);
  await mutateProductionAccessGovernance({
    ...common,
    action: "withdraw-membership",
    playerId: "JD04",
    reason: "Annual roster review",
    expectedMembershipRevision: 3,
  }, options);
  await mutateProductionAccessGovernance({
    ...common,
    action: "reactivate-membership",
    playerId: "JD04",
    reason: "Approved roster return",
    expectedMembershipRevision: 4,
  }, options);
  await mutateProductionAccessGovernance({
    ...common,
    action: "grant-director",
    playerId: "JD04",
    reason: "Approved tournament administration coverage",
    confirmed: true,
  }, options);
  await mutateProductionAccessGovernance({
    ...common,
    action: "revoke-director",
    playerId: "JD04",
    reason: "Administration coverage ended",
    confirmed: true,
  }, options);

  assert.deepEqual(observed.map(({ name }) => name), Array(6).fill("mutate_production_access_governance_v1"));
  assert.deepEqual(observed.map(({ input }) => input.action), [
    "CREATE_PLAYER",
    "SET_GLOBAL_STATUS",
    "WITHDRAW_MEMBERSHIP",
    "REACTIVATE_MEMBERSHIP",
    "GRANT_DIRECTOR",
    "REVOKE_DIRECTOR",
  ]);
  assert.equal(observed[1].input.expected_profile_revision, 2);
  assert.equal(observed[2].input.expected_membership_revision, 3);
  assert.equal(observed[3].input.expected_membership_revision, 4);
  assert.equal(observed[4].input.confirmed, true);
  for (const { input } of observed) {
    assert.equal(input.expected_revision, 8);
    assert.match(input.request_payload_hash, /^[0-9a-f]{64}$/);
    assert.equal(Object.hasOwn(input, "create_auth_user"), false);
    assert.equal(Object.hasOwn(input, "create_membership"), false);
    assert.equal(Object.hasOwn(input, "team_id"), false);
    assert.equal(Object.hasOwn(input, "handicap"), false);
  }
});

test("mutation responses preserve safe retries, warnings, and no-side-effect evidence", () => {
  const result = normalizeProductionAccessGovernanceMutation({
    ok: true,
    action: "REACTIVATE_MEMBERSHIP",
    playerId: "WD01",
    revision: 9,
    membershipRevision: 2,
    idempotent: true,
    membershipCreated: false,
    teamChanged: false,
    authUserCreated: false,
    readiness: {
      warnings: ["UNSTARTED_PAIRINGS_REQUIRE_SETUP_UPDATE", "COMPLETED_HISTORY_PRESERVED"],
      dependencyCounts: { unstartedPairings: 1, completedHistory: 2 },
    },
  });
  assert.equal(result.governanceRevision, 9);
  assert.equal(result.membershipRevision, 2);
  assert.equal(result.idempotent, true);
  assert.equal(result.membershipCreated, false);
  assert.equal(result.teamChanged, false);
  assert.equal(result.authUserCreated, false);
  assert.deepEqual(result.readiness.warnings, [
    "UNSTARTED_PAIRINGS_REQUIRE_SETUP_UPDATE",
    "COMPLETED_HISTORY_PRESERVED",
  ]);
});

test("route and UI keep governance Production-only, reviewed, Owner-gated, and Supabase-only", async () => {
  const [route, panel, server] = await Promise.all([
    source("app/api/director/players-access/route.js"),
    source("app/admin/director/ProductionPlayersAccessPanel.js"),
    source("lib/production-access-governance-server.js"),
  ]);

  assert.match(route, /VERCEL_ENV\)\.toLowerCase\(\) !== "production"/);
  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /result\.source !== "production-director-entitlement"/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /Promise\.all\(\[[\s\S]*readProductionPlayersAccess\(identity\)[\s\S]*readProductionAccessGovernance\(identity\)/);
  assert.match(route, /mergeProductionPlayerAccessGovernance\(playersAccess, governance\)/);
  assert.match(route, /const GOVERNANCE_ACTIONS = new Set\(\[[\s\S]*"create-player"[\s\S]*"revoke-director"/);
  assert.match(route, /expectedProfileRevision: input\.expectedProfileRevision/);
  assert.match(route, /expectedMembershipRevision: input\.expectedMembershipRevision/);
  assert.match(route, /fallbackUsed: false,[\s\S]*googleRequests: 0/);

  assert.match(server, /requiredPhase: "OBSERVATION"/);
  assert.match(server, /const RPCS = new Set\(\[[\s\S]*read_production_access_governance_v1[\s\S]*mutate_production_access_governance_v1/);
  assert.doesNotMatch(server + route, /google-sheets|readSheets|supabase\.auth\.admin|createUser\(/i);

  assert.match(panel, /createClientMutationOperationIdentityRegistry/);
  assert.match(panel, /expectedProfileRevision: Number\(selected\.profile\?\.revision \|\| 0\)/);
  assert.match(panel, /expectedMembershipRevision: Number\(selected\.membership\.revision \|\| 0\)/);
  assert.match(panel, /actorIsOwner && !ownerAdoptionRequired/);
  assert.match(panel, /I reviewed the target Player, current state, consequences, and immutable Production audit effect/);
  assert.match(panel, /does not add tournament membership, a team, a handicap, login identifiers, Auth access, scoring permission, or Director access/);
  assert.match(panel, /Team, handicap, pairings, login identifiers, Auth, and scoring permission are not assigned automatically/);
  assert.match(panel, /The adopted Production Owner cannot be revoked here/);
  assert.match(panel, /final-administrator protections remain server enforced/i);
  assert.match(panel, /Stored identifiers remain masked/);
});

test("migration exposes only service-role read/mutate RPCs and keeps Owner adoption separate", async () => {
  const sql = await source("supabase/production_migrations/202608300061_production_access_governance_v1.sql");
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /grant execute on function public\.read_production_access_governance_v1\(jsonb\)[\s\S]*to service_role/);
  assert.match(sql, /grant execute on function public\.mutate_production_access_governance_v1\(jsonb\)[\s\S]*to service_role/);
  assert.match(sql, /create or replace function public\.read_production_player_editorial\(input jsonb\)[\s\S]*production_control\.read_projection\([\s\S]*'PLAYER_EDITORIAL'[\s\S]*'player-public-profile-v1'/);
  assert.match(sql, /jsonb_array_elements\([\s\S]*result_value#>'\{data,payload,players\}'[\s\S]*with ordinality/);
  assert.match(sql, /left join production_control\.player_governance_profiles_v1 profile[\s\S]*jsonb_set\([\s\S]*'\{public_profile,Active\}'[\s\S]*profile\.global_status = 'ACTIVE'/);
  assert.match(sql, /grant execute on function public\.read_production_player_editorial\(jsonb\)[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /(?:insert into|update) production_control\.(?:projection_revisions|projection_current|player_editorial_facts)/i);
  assert.match(sql, /revoke all on function %s from public, anon, authenticated, service_role/);
  assert.match(sql, /public\.adopt_initial_production_owner_v1\(jsonb\)/);
  assert.doesNotMatch(sql, /grant execute on function public\.adopt_initial_production_owner_v1[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /insert into auth\.users|delete from scoring_authority\.players|delete from scoring_authority\.tournament_players/i);
  assert.match(sql, /ACCESS_GOVERNANCE_SELF_REVOKE_BLOCKED/);
  assert.match(sql, /ACCESS_GOVERNANCE_OWNER_REVOKE_BLOCKED/);
  assert.match(sql, /ACCESS_GOVERNANCE_FINAL_ADMIN_PROTECTED/);
});
