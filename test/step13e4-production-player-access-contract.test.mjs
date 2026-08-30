import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalProductionBulkEnrollment,
  canonicalProductionLoginPreference,
  canonicalProductionPlayerEmail,
  canonicalProductionPlayerId,
  canonicalProductionPlayerPhone,
  productionPlayerAccessPayloadHash,
} from "../lib/production-player-access-contract.js";
import { readFile } from "node:fs/promises";

const actor = {
  actorAuthUserId: "11111111-1111-4111-8111-111111111111",
  actorPlayerId: "CB01",
};
const operationRequestId = "22222222-2222-4222-8222-222222222222";

async function importPlayerAccessServer() {
  const source = await readFile(new URL("../lib/production-player-access-server.js", import.meta.url), "utf8");
  const contractUrl = new URL("../lib/production-player-access-contract.js", import.meta.url).href;
  const presenterUrl = new URL("../lib/production-director-players-access.js", import.meta.url).href;
  const transformed = source
    .replace('import "server-only";\n', "")
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-cutover-activation-contract\.js";/,
      `function assertProductionCutoverActivation() { return { state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }; }`,
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
    .replace('from "./production-player-access-contract.js";', `from "${contractUrl}";`)
    .replace('from "./production-director-players-access.js";', `from "${presenterUrl}";`);
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

test("Player access contract normalizes stable IDs and safe identifiers", () => {
  assert.equal(canonicalProductionPlayerId(" cb02 "), "CB02");
  assert.equal(canonicalProductionPlayerEmail(" Player@RealDomain.com "), "player@realdomain.com");
  assert.equal(canonicalProductionPlayerPhone("+1 (202) 555-0123"), "+12025550123");
  assert.equal(canonicalProductionLoginPreference("email_primary"), "EMAIL_PRIMARY");
  assert.equal(canonicalProductionLoginPreference("phone_primary"), "PHONE_PRIMARY");
  assert.throws(() => canonicalProductionPlayerEmail("person@example.com"), /Placeholder/i);
  assert.throws(() => canonicalProductionPlayerEmail("fake.person@realdomain.com"), /Placeholder/i);
  assert.throws(() => canonicalProductionPlayerPhone("202-55"), /country code/i);
  assert.throws(() => canonicalProductionLoginPreference("AUTO"), /Email Primary/i);
});

test("atomic bulk enrollment is canonical, sorted, and collision rejecting", () => {
  assert.deepEqual(canonicalProductionBulkEnrollment([
    { playerId: "CB03", phone: "+1 202 555 0199" },
    { playerId: "cb02", email: "Second@RealDomain.com" },
  ]), [
    { player_id: "CB02", email: "second@realdomain.com", phone_e164: null },
    { player_id: "CB03", email: null, phone_e164: "+12025550199" },
  ]);
  assert.throws(() => canonicalProductionBulkEnrollment([
    { playerId: "CB02", email: "same@realdomain.com" },
    { playerId: "CB03", email: "same@realdomain.com" },
  ]), /email.*unique/i);
  assert.throws(() => canonicalProductionBulkEnrollment([
    { playerId: "CB02", phone: "+1 202 555 0100" },
    { playerId: "CB03", phone: "+1 202 555 0100" },
  ]), /phone.*unique/i);
});

test("payload hashing is stable across object-key order", () => {
  assert.equal(
    productionPlayerAccessPayloadHash({ b: 2, a: { d: 4, c: 3 } }),
    productionPlayerAccessPayloadHash({ a: { c: 3, d: 4 }, b: 2 }),
  );
});

test("Production read uses only the allowlisted Supabase RPC and exact Director scope", async () => {
  const { readProductionPlayersAccess } = await importPlayerAccessServer();
  let call;
  const data = await readProductionPlayersAccess(actor, {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (name, input) => {
      call = { name, input };
      return { payload: { ok: true, data: {
        contractVersion: "production-players-access-v1",
        tournamentId: "2026",
        revision: 0,
        players: [{
          playerId: "CB02",
          displayName: "Second Player",
          maskedEmail: "s***@r***.com",
          email: "second@real-domain.com",
          phone: "+12025550123",
          authUserId: "33333333-3333-4333-8333-333333333333",
        }],
      } } };
    },
  });
  assert.equal(data.players.length, 1);
  assert.equal(data.players[0].maskedEmail, "s***@r***.com");
  assert.equal(JSON.stringify(data).includes("second@real-domain.com"), false);
  assert.equal(JSON.stringify(data).includes("+12025550123"), false);
  assert.equal(JSON.stringify(data).includes("33333333-3333-4333-8333-333333333333"), false);
  assert.equal(call.name, "read_production_players_access_v1");
  assert.equal(call.input.environment, "PRODUCTION");
  assert.equal(call.input.project_ref, "ymqhhtxaywtqllynrmxe");
  assert.equal(call.input.tournament_id, "2026");
  assert.equal(call.input.authorization.auth_user_id, actor.actorAuthUserId);
  assert.equal(call.input.authorization.player_id, "CB01");
  assert.equal(call.input.authorization.role, "DIRECTOR");
});

test("email approval is revisioned and does not request Auth provisioning", async () => {
  const { mutateProductionPlayersAccess } = await importPlayerAccessServer();
  let call;
  const result = await mutateProductionPlayersAccess({
    action: "approve-email",
    ...actor,
    playerId: "cb02",
    email: "Second@RealDomain.com",
    expectedRevision: 4,
    operationRequestId,
  }, {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (name, input) => {
      call = { name, input };
      return { payload: { ok: true, revision: 5, authUsersCreated: 0, otpSent: false } };
    },
  });
  assert.equal(result.revision, 5);
  assert.equal(call.name, "mutate_production_players_access_v1");
  assert.equal(call.input.action, "APPROVE_EMAIL");
  assert.equal(call.input.player_id, "CB02");
  assert.equal(call.input.email, "second@realdomain.com");
  assert.equal(call.input.expected_revision, 4);
  assert.match(call.input.request_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(call.input, "create_auth_user"), false);
  assert.equal(Object.hasOwn(call.input, "send_otp"), false);
});

test("phone readiness, preference, suspension, resumption, and bulk use bounded actions", async () => {
  const { mutateProductionPlayersAccess } = await importPlayerAccessServer();
  const observed = [];
  const options = {
    env: {},
    getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
    rpc: async (_name, input) => {
      observed.push(input);
      return { payload: { ok: true, revision: input.expected_revision + 1 } };
    },
  };
  const base = { ...actor, expectedRevision: 1, operationRequestId };
  await mutateProductionPlayersAccess({ ...base, action: "approve-phone", playerId: "CB02", phone: "+1 202 555 0123" }, options);
  await mutateProductionPlayersAccess({ ...base, action: "set-login-preference", playerId: "CB02", preferredLoginMethod: "EMAIL_PRIMARY" }, options);
  await mutateProductionPlayersAccess({ ...base, action: "suspend-access", playerId: "CB02" }, options);
  await mutateProductionPlayersAccess({ ...base, action: "resume-access", playerId: "CB02" }, options);
  await mutateProductionPlayersAccess({ ...base, action: "bulk-enroll", entries: [
    { playerId: "CB02", email: "second@realdomain.com" },
  ] }, options);
  assert.deepEqual(observed.map((input) => input.action), [
    "APPROVE_PHONE", "SET_LOGIN_PREFERENCE", "SUSPEND_ACCESS", "RESUME_ACCESS", "BULK_ENROLL",
  ]);
  assert.equal(observed[0].phone_e164, "+12025550123");
  assert.equal(observed[1].preferred_login_method, "EMAIL_PRIMARY");
  assert.deepEqual(observed[4].entries, [
    { player_id: "CB02", email: "second@realdomain.com", phone_e164: null },
  ]);
});

test("typed revision and state conflicts remain HTTP 409 while malformed input is 400", async () => {
  const { mutateProductionPlayersAccess } = await importPlayerAccessServer();
  const base = {
    action: "approve-phone",
    ...actor,
    playerId: "CB02",
    phone: "+1 202 555 0123",
    expectedRevision: 1,
    operationRequestId,
  };
  for (const code of [
    "PLAYER_ACCESS_REVISION_STALE",
    "PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED",
    "PLAYER_ACCESS_PHONE_CLAIM_IN_FLIGHT",
  ]) {
    await assert.rejects(
      mutateProductionPlayersAccess(base, {
        env: {},
        getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
        rpc: async () => ({ payload: { ok: false, code } }),
      }),
      (error) => error.code === code && error.status === 409,
    );
  }
  await assert.rejects(
    mutateProductionPlayersAccess(base, {
      env: {},
      getActivation: () => ({ state: "SCORING_COMMITTED", readCutoverPhase: "OBSERVATION" }),
      rpc: async () => ({ payload: { ok: false, code: "PLAYER_ACCESS_PHONE_INVALID" } }),
    }),
    (error) => error.code === "PLAYER_ACCESS_PHONE_INVALID" && error.status === 400,
  );
});
