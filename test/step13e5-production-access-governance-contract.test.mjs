import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalProductionGovernanceReason,
  canonicalProductionGovernanceSlug,
  mergeProductionPlayerAccessGovernance,
  normalizeProductionAccessGovernancePayload,
} from "../lib/production-access-governance-contract.js";
import {
  normalizeProductionPlayerAccessPayload,
} from "../lib/production-director-players-access.js";

const actor = {
  actorAuthUserId: "11111111-1111-4111-8111-111111111111",
  actorPlayerId: "CB01",
};
const operationRequestId = "22222222-2222-4222-8222-222222222222";

async function importGovernanceServer() {
  const source = await readFile(new URL("../lib/production-access-governance-server.js", import.meta.url), "utf8");
  const contractUrl = new URL("../lib/production-access-governance-contract.js", import.meta.url).href;
  const transformed = source
    .replace('import "server-only";\n', "")
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-cutover-activation-contract\.js";/,
      'function assertProductionCutoverActivation() { return { readCutoverPhase: "OBSERVATION" }; }',
    )
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-foundation-resource-contract\.js";/,
      `const PRODUCTION_GOOGLE_WORKBOOK_ID = "production-workbook";
const PRODUCTION_SUPABASE_PROJECT_REF = "production-project";
const PRODUCTION_SUPABASE_URL = "https://production-project.supabase.co";
const PRODUCTION_TOURNAMENT_ID = "2026";`,
    )
    .replace(
      /import \{ recordDataAuthorityTransport \} from "\.\/data-authority-request\.js";/,
      "function recordDataAuthorityTransport() {}",
    )
    .replace('from "./production-access-governance-contract.js";', `from "${contractUrl}";`);
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

test("governance read normalization merges only the bounded Player model", () => {
  const governance = normalizeProductionAccessGovernancePayload({
    ok: true,
    contractVersion: "production-access-governance-v1",
    revision: 3,
    ownerAdoptionRequired: false,
    actor: { playerId: "CB01", owner: true },
    capabilities: { createPlayer: true, setGlobalStatus: true, withdrawMembership: true },
    membershipAdd: { supported: false, state: "TEAM_ASSIGNMENT_REQUIRED", reason: "Team assignment is required." },
    players: [{
      playerId: "CB01",
      displayName: "Clay Beltran",
      profile: {
        firstName: "Clay",
        lastName: "Beltran",
        slug: "clay-beltran",
        globalStatus: "ACTIVE",
        revision: 2,
        canSetGlobalStatus: true,
        authUserId: "33333333-3333-4333-8333-333333333333",
      },
      membership: {
        exists: true,
        status: "ACTIVE",
        revision: 4,
        canWithdraw: false,
        blockers: ["ACTIVE_ADMIN_ENTITLEMENT"],
        readiness: ["COMPLETED_HISTORY_PRESERVED"],
        dependencyCounts: { matchAssignments: 3, completedHistory: 7 },
      },
      governance: { ownerStatus: "ACTIVE", directorStatus: "ACTIVE", canRevoke: false },
      email: "must-not-reach-browser@baggerinv.com",
    }],
    audit: [],
  });
  const merged = mergeProductionPlayerAccessGovernance({
    contractVersion: "production-players-access-v1",
    revision: 9,
    summary: {},
    capabilities: {},
    players: [{
      playerId: "CB01",
      displayName: "Clay Beltran",
      membership: { exists: true, status: "ACTIVE" },
      directorStatus: "ACTIVE",
    }],
    audit: [],
    deferred: [],
  }, governance);
  assert.equal(merged.contractVersion, "production-players-access-v1");
  assert.equal(merged.governanceRevision, 3);
  assert.equal(merged.actor.owner, true);
  assert.equal(merged.players[0].profile.slug, "clay-beltran");
  assert.equal(merged.players[0].membership.revision, 4);
  assert.equal(merged.players[0].membership.dependencyCounts.matchAssignments, 3);
  assert.equal(merged.players[0].directorStatus, "OWNER");
  assert.equal(JSON.stringify(merged).includes("must-not-reach-browser"), false);
  assert.equal(JSON.stringify(merged).includes("33333333-3333-4333-8333-333333333333"), false);

  const browserProjection = normalizeProductionPlayerAccessPayload({
    ok: true,
    data: merged,
  });
  assert.equal(browserProjection.governanceRevision, 3);
  assert.equal(browserProjection.actor.owner, true);
  assert.equal(browserProjection.capabilities["set-global-status"], true);
  assert.equal(browserProjection.players[0].profile.slug, "clay-beltran");
  assert.equal(browserProjection.players[0].membership.revision, 4);
  assert.equal(browserProjection.players[0].governance.ownerStatus, "ACTIVE");
});

test("governance server binds exact Production scope and action-specific revisions", async () => {
  const { readProductionAccessGovernance, mutateProductionAccessGovernance } = await importGovernanceServer();
  let readCall;
  await readProductionAccessGovernance(actor, {
    env: {},
    getActivation: () => ({}),
    rpc: async (name, input) => {
      readCall = { name, input };
      return { payload: {
        ok: true,
        contractVersion: "production-access-governance-v1",
        revision: 0,
        actor: { playerId: "CB01", owner: false },
        players: [],
      } };
    },
  });
  assert.equal(readCall.name, "read_production_access_governance_v1");
  assert.equal(readCall.input.environment, "PRODUCTION");
  assert.equal(readCall.input.project_ref, "production-project");
  assert.equal(readCall.input.source_workbook_id, "production-workbook");
  assert.equal(readCall.input.actor_auth_user_id, actor.actorAuthUserId);
  assert.equal(readCall.input.authorization.auth_user_id, actor.actorAuthUserId);
  assert.equal(readCall.input.authorization.player_id, "CB01");

  const calls = [];
  const options = {
    env: {},
    getActivation: () => ({}),
    rpc: async (name, input) => {
      calls.push({ name, input });
      return { payload: {
        ok: true,
        code: "PRODUCTION_ACCESS_GOVERNANCE_UPDATED",
        revision: input.expected_revision + 1,
        playerId: input.player_id || "JD01",
      } };
    },
  };
  const common = { ...actor, expectedRevision: 0, operationRequestId };
  await mutateProductionAccessGovernance({
    ...common,
    action: "create-player",
    firstName: "Jane",
    lastName: "Doe",
    displayName: "Jane Doe",
    slug: "",
    globalStatus: "ACTIVE",
  }, options);
  await mutateProductionAccessGovernance({
    ...common,
    action: "set-global-status",
    playerId: "JD01",
    globalStatus: "ALUMNI",
    expectedProfileRevision: 1,
  }, options);
  await mutateProductionAccessGovernance({
    ...common,
    action: "withdraw-membership",
    playerId: "JD01",
    reason: "No longer participating.",
    expectedMembershipRevision: 2,
  }, options);
  assert.deepEqual(calls.map(({ input }) => input.action), [
    "CREATE_PLAYER", "SET_GLOBAL_STATUS", "WITHDRAW_MEMBERSHIP",
  ]);
  assert.equal(calls[0].input.slug, "jane-doe");
  assert.equal(calls[1].input.expected_profile_revision, 1);
  assert.equal(calls[2].input.expected_membership_revision, 2);
  assert.match(calls[0].input.request_payload_hash, /^[0-9a-f]{64}$/);
});

test("unsafe governance values fail before a Production RPC", async () => {
  assert.equal(canonicalProductionGovernanceSlug("", "Jane Doe"), "jane-doe");
  assert.throws(() => canonicalProductionGovernanceSlug("bad slug", "Jane Doe"), /lowercase profile slug/i);
  assert.throws(() => canonicalProductionGovernanceReason("email me at person@real.example"), /non-sensitive/i);
  const { mutateProductionAccessGovernance } = await importGovernanceServer();
  const common = { ...actor, expectedRevision: 0, operationRequestId, playerId: "CB02" };
  await assert.rejects(
    mutateProductionAccessGovernance({
      ...common,
      action: "grant-director",
      reason: "Approved for operations.",
      confirmed: false,
    }, { env: {}, getActivation: () => ({}), rpc: async () => assert.fail("RPC must not run") }),
    (error) => error.code === "ACCESS_GOVERNANCE_CONFIRMATION_REQUIRED" && error.status === 400,
  );
  await assert.rejects(
    mutateProductionAccessGovernance({
      ...common,
      action: "set-global-status",
      globalStatus: "ALUMNI",
    }, { env: {}, getActivation: () => ({}), rpc: async () => assert.fail("RPC must not run") }),
    (error) => error.code === "ACCESS_GOVERNANCE_PROFILE_REVISION_REQUIRED" && error.status === 400,
  );
});
