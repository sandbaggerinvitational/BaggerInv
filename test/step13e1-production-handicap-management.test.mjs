import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalProductionHandicapDecimal,
  canonicalProductionHandicapEntries,
  productionHandicapPayloadHash,
  PRODUCTION_HANDICAP_REVISION_CONTRACT,
} from "../lib/production-handicap-contract.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Production handicap decimals remain exact signed base-10 values", () => {
  assert.equal(PRODUCTION_HANDICAP_REVISION_CONTRACT, "production-handicap-revision-v1");
  assert.equal(canonicalProductionHandicapDecimal("+8.1000"), "8.1");
  assert.equal(canonicalProductionHandicapDecimal("-0.000"), "0");
  assert.equal(
    canonicalProductionHandicapDecimal("-12.345678901234567890123456789"),
    "-12.345678901234567890123456789",
  );
  assert.throws(
    () => canonicalProductionHandicapDecimal("1e2"),
    (error) => error.code === "PRODUCTION_HANDICAP_DECIMAL_REQUIRED",
  );
});

test("full-roster entry canonicalization is stable and rejects duplicate Player IDs", () => {
  const entries = canonicalProductionHandicapEntries([
    { playerId: "cb01", proposedHandicap: "8.10" },
    { playerId: "AM01", proposedHandicap: "-0.25" },
  ]);
  assert.deepEqual(entries.map((entry) => [entry.player_id, entry.tournament_handicap]), [
    ["AM01", "-0.25"],
    ["CB01", "8.1"],
  ]);
  assert.throws(
    () => canonicalProductionHandicapEntries([
      { playerId: "CB01", proposedHandicap: "8" },
      { playerId: "cb01", proposedHandicap: "9" },
    ]),
    (error) => error.code === "PRODUCTION_HANDICAP_DUPLICATE_PLAYER",
  );
});

test("idempotency payload hashing is key-order stable and payload-sensitive", () => {
  const left = productionHandicapPayloadHash({ revision: 4, entries: [{ player: "CB01", handicap: "8.1" }] });
  const reordered = productionHandicapPayloadHash({ entries: [{ handicap: "8.1", player: "CB01" }], revision: 4 });
  const changed = productionHandicapPayloadHash({ revision: 4, entries: [{ player: "CB01", handicap: "8.2" }] });
  assert.match(left, /^[0-9a-f]{64}$/);
  assert.equal(left, reordered);
  assert.notEqual(left, changed);
});

test("the Production route uses Director entitlement, same-origin mutation, fixed Supabase RPCs, and no Google fallback", async () => {
  const [route, server] = await Promise.all([
    source("app/api/director/handicaps/route.js"),
    source("lib/production-handicap-management-server.js"),
  ]);
  assert.match(route, /authorization\.source !== "production-director-entitlement"/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /new Set\(\["stage", "validate", "approve"\]\)/);
  assert.match(route, /fallbackUsed: false/);
  assert.match(route, /googleRequests: 0/);
  for (const rpc of [
    "read_production_handicap_revision_v1",
    "read_production_handicap_revision_history_v1",
    "stage_production_handicap_revision_v1",
    "validate_production_handicap_revision_v1",
    "approve_production_handicap_revision_v1",
  ]) assert.match(server, new RegExp(`"${rpc}"`));
  for (const fixed of [
    "PRODUCTION_SUPABASE_PROJECT_REF",
    "PRODUCTION_SUPABASE_URL",
    "PRODUCTION_GOOGLE_WORKBOOK_ID",
    "PRODUCTION_TOURNAMENT_ID",
  ]) assert.match(server, new RegExp(fixed));
  assert.doesNotMatch(server, /google-sheets|passport|PREVIEW_SUPABASE|x-admin-secret/i);
});

test("the server sends exact decimal strings and requires a complete staged roster plus explicit approval confirmation", async () => {
  const server = await source("lib/production-handicap-management-server.js");
  assert.match(server, /entries: canonicalProductionHandicapEntries\(entries\)/);
  assert.match(server, /operation_request_id: requestId/);
  assert.match(server, /request_payload_hash: productionHandicapPayloadHash/);
  assert.match(server, /PRODUCTION_HANDICAP_APPROVAL_CONFIRMATION_REQUIRED/);
  assert.match(server, /effective_date: exactDate\(confirmation\.effectiveDate\)/);
  assert.match(server, /changed_player_count: Number\(confirmation\.changedPlayerCount\)/);
  assert.match(server, /affected_match_count: Number\(confirmation\.affectedMatchCount\)/);
  assert.match(server, /unstarted_refresh_count: Number\(confirmation\.refreshableMatchCount\)/);
  assert.match(server, /started_preserved_count: Number\(confirmation\.frozenMatchCount\)/);
  assert.match(server, /DIRECTOR_WEEKLY_HANDICAP_REVIEW/);
});
