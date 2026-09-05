import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publishedOddsFreshness } from "../lib/published-odds-supabase.js";

const source = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
const migration = "supabase/production_migrations/202609040087_production_odds_publication_withdrawal_v1.sql";

test("087 separates current public authority from immutable Odds history and installs inertly", async () => {
  const sql = await source(migration);
  assert.match(sql, /create table scoring_authority\.odds_publication_public_pointer_v1/);
  assert.match(sql, /create table production_control\.odds_publication_withdrawal_events_v1/);
  assert.match(sql, /create table production_control\.odds_publication_withdrawal_receipts_v1/);
  assert.match(sql, /publication_state in \('UNPUBLISHED', 'PUBLISHED', 'WITHDRAWN'\)/);
  assert.match(sql, /Seed only an equivalent public pointer\. No existing row or flag changes/);
  assert.doesNotMatch(sql.split("-- Seed only an equivalent public pointer")[0], /update scoring_authority\.odds_published_snapshots/);
  assert.match(sql, /historical_publication_preserved', true/);
  assert.match(sql, /original_adoption_kind/);
  assert.match(sql, /ODDS_WITHDRAWAL_EVIDENCE_IMMUTABLE/);
  assert.match(sql, /before update or delete[\s\S]*odds_publication_withdrawal_events_v1/);
  assert.match(sql, /grant execute on function public\.withdraw_production_odds_publication_v1\(jsonb\)\s+to service_role/);
  assert.doesNotMatch(sql, /to authenticated|to anon/);
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
});

test("withdrawal is CAS-bound, idempotent, job-safe, and clears only public authority", async () => {
  const sql = await source(migration);
  for (const value of [
    "expected_annual_pointer_revision",
    "expected_publication_pointer_revision",
    "expected_publication_revision",
    "expected_snapshot_id",
    "operation_request_id",
    "request_canonical_json",
    "request_payload_hash",
  ]) assert.match(sql, new RegExp(value));
  assert.match(sql, /ODDS_WITHDRAWAL_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /ODDS_WITHDRAWAL_PREDECESSOR_STALE/);
  assert.match(sql, /ODDS_WITHDRAWAL_CALCULATION_IN_PROGRESS/);
  assert.match(sql, /job\.status in \('PENDING', 'RUNNING', 'RETRYABLE'\)/);
  assert.match(sql, /job\.status = 'SUCCEEDED' and job\.publication_status = 'READY'/);
  assert.match(sql, /set\s+is_current_official = false/);
  assert.match(sql, /publication_state = 'WITHDRAWN',[\s\S]*current_snapshot_id = null/);
  assert.doesNotMatch(sql, /delete from scoring_authority\.odds_published_snapshots/);
  assert.doesNotMatch(sql, /update scoring_authority\.odds_publication_current set/);
});

test("Setup, public readers, future revision sequence, and Director transport use the withdrawal lifecycle", async () => {
  const [sql, server, transport, endpoint, page, insights, director, consoleModel, freshness] = await Promise.all([
    source(migration),
    source("lib/production-odds-publication-server.js"),
    source("lib/production-odds-calculation-server.js"),
    source("app/api/director/odds-publication/route.js"),
    source("app/odds-center/page.js"),
    source("app/api/leaderboards/insights/route.js"),
    source("app/admin/director/ProductionDirectorOperations.js"),
    source("lib/production-director-console.js"),
    source("lib/published-odds-supabase.js"),
  ]);
  assert.match(sql, /odds_publication_blocks_setup_v1/);
  assert.match(sql, /annual_odds_publication_projection_pre_withdrawal_v1/);
  assert.match(sql, /last_publication_revision/);
  assert.match(transport, /"withdraw_production_odds_publication_v1"/);
  assert.match(server, /productionOddsWithdrawalRequest/);
  assert.match(server, /withdrawProductionOddsPublication/);
  assert.match(server, /canonicalJson\(canonical\)/);
  assert.match(endpoint, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(endpoint, /production-director-entitlement/);
  assert.match(endpoint, /impersonating === true/);
  assert.match(endpoint, /withDataAuthorityRequestScope/);
  assert.match(page, /Updated championship projections will be available after the tournament matchups are set\./);
  assert.match(insights, /publication\.status === "UNPUBLISHED"/);
  assert.match(freshness, /CURRENT_PUBLICATION_WITHDRAWN/);
  assert.match(director, /Withdraw Current Publication/);
  assert.match(director, /createClientMutationOperationIdentityRegistry/);
  assert.match(consoleModel, /No current publication/);
  assert.match(consoleModel, /Historical publications|withdrawalReason/);
});

test("Phase A source contains no operational withdrawal identity or Production revision-1 target", async () => {
  const files = await Promise.all([
    migration,
    "lib/production-odds-publication-server.js",
    "app/api/director/odds-publication/route.js",
    "app/admin/director/ProductionDirectorOperations.js",
  ].map(source));
  const text = files.join("\n");
  assert.doesNotMatch(text, /65f54c41-2dc3-4b2c-8570-a4d23056649a/);
  assert.doesNotMatch(text, /revision\s*1\s*withdraw/i);
  assert.doesNotMatch(text, /TOURNAMENT_SETUP_CHANGED.*operation_request_id.*[0-9a-f]{8}-/s);
});

test("withdrawn Supabase projection is an intentional no-current state, not corrupt freshness", () => {
  const view = {
    history_count: 1,
    publication: {
      authority: "SUPABASE",
      state: "WITHDRAWN",
      snapshot_id: null,
      publication_revision: 1,
      publication_pointer_revision: 2,
      predecessor_snapshot_id: "00000000-0000-4000-8000-000000000002",
      freshness: "CURRENT",
      withdrawal: { reason_code: "TOURNAMENT_SETUP_CHANGED" },
    },
    snapshots: [{
      publication_state_revision: 1,
      is_current_official: false,
      publication_verified: true,
      publication_lifecycle: "WITHDRAWN",
    }],
  };
  const value = publishedOddsFreshness(view);
  assert.equal(value.status, "UNPUBLISHED");
  assert.equal(value.current, false);
  assert.equal(value.stale, false);
  assert.deepEqual(value.reasons, ["CURRENT_PUBLICATION_WITHDRAWN"]);
  assert.equal(value.publicationRevision, 1);
  assert.equal(value.publicationPointerRevision, 2);
  assert.equal(value.predecessorSnapshotId,
    "00000000-0000-4000-8000-000000000002");
});

test("server withdrawal request is canonical, exact-retry stable, and verified", () => {
  const script = `
    import {
      productionOddsWithdrawalRequest,
      withdrawProductionOddsPublication,
    } from "./lib/production-odds-publication-server.js";
    const values = {
      expectedPublicationPointerRevision: 1,
      expectedPublicationRevision: 1,
      expectedPublicationSnapshotId: "00000000-0000-4000-8000-000000000002",
      actorAuthUserId: "00000000-0000-4000-8000-000000000001",
      actorPlayerId: "cb01",
      reasonCode: "TOURNAMENT_SETUP_CHANGED",
    };
    const runtimeContext = { frozen2026: true, runtime: {
      tournamentId: "2026", tournamentYear: 2026, pointerRevision: 12,
    }};
    const calls = [];
    const rpc = async (name, input) => {
      calls.push({ name, input });
      return { payload: { ok: true,
        code: "PRODUCTION_ODDS_PUBLICATION_WITHDRAWN",
        idempotent: calls.length > 1,
        publication_state: "WITHDRAWN", current_publication: false,
        current_snapshot_id: null, publication_revision: 1,
        withdrawn_snapshot_id: values.expectedPublicationSnapshotId,
        publication_pointer_revision: 2,
        historical_publication_preserved: true,
        calculation_created: false, publication_created: false,
        google_writes: 0,
      }};
    };
    const first = productionOddsWithdrawalRequest({ ...values,
      tournamentId: "2026", expectedAnnualPointerRevision: 12 });
    const second = productionOddsWithdrawalRequest({ ...values,
      tournamentId: "2026", expectedAnnualPointerRevision: 12 });
    await withdrawProductionOddsPublication({ ...values,
      operationRequestId: "00000000-0000-4000-8000-000000000003",
      runtimeContext, rpc });
    await withdrawProductionOddsPublication({ ...values,
      operationRequestId: "00000000-0000-4000-8000-000000000003",
      runtimeContext, rpc });
    process.stdout.write(JSON.stringify({ first, second, calls }));
  `;
  const child = spawnSync(process.execPath, [
    "--conditions=react-server", "--input-type=module", "-e", script,
  ], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const value = JSON.parse(child.stdout);
  assert.deepEqual(value.first, value.second);
  assert.match(value.first.payloadHash, /^[0-9a-f]{64}$/);
  assert.equal(value.calls.length, 2);
  assert.equal(value.calls[0].name, "withdraw_production_odds_publication_v1");
  assert.deepEqual(value.calls[0].input, value.calls[1].input);
  assert.equal(value.calls[0].input.expected_annual_pointer_revision, 12);
  assert.equal(value.calls[0].input.authorization.player_id, "CB01");
  assert.equal(value.calls[0].input.request_canonical_json,
    value.first.canonicalJson);
  assert.equal(value.calls[0].input.request_payload_hash,
    value.first.payloadHash);
});
