import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  certifyProductionFutureGoogleWriter,
  PRODUCTION_FUTURE_GOOGLE_WRITER_CERTIFICATION_ACTIONS,
} from "../lib/production-future-google-writer-certification-server.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608300072_production_annual_google_writer_certification_v1.sql",
  import.meta.url,
);
const routeUrl = new URL(
  "../app/api/director/future-tournaments/google-writer/route.js",
  import.meta.url,
);
const actor = Object.freeze({
  actorAuthUserId: "00000000-0000-4000-8000-000000000001",
  actorPlayerId: "CB01",
});

test("annual writer certifier exposes only the two staged owner operations", () => {
  assert.deepEqual(PRODUCTION_FUTURE_GOOGLE_WRITER_CERTIFICATION_ACTIONS, [
    "adopt-destination",
    "certify-writer-target",
  ]);
});

test("server derives the exact Production destination and never forwards a caller workbook", async () => {
  let captured;
  const result = await certifyProductionFutureGoogleWriter({
    action: "adopt-destination",
    ...actor,
    targetTournamentId: "2027",
    expectedResourceRevision: 1,
    expectedSetupRevision: 4,
    operationRequestId: "10000000-0000-4000-8000-000000000001",
    reason: "Adopt certified annual Google destination",
    destinationWorkbookId: "preview-attacker-workbook",
    sourceWorkbookId: "preview-attacker-workbook",
  }, {
    env: {},
    getActivation: () => ({ phase: "OBSERVATION" }),
    rpc: async (name, input) => {
      captured = { name, input };
      return { payload: {
        ok: true,
        code: "PRODUCTION_FUTURE_GOOGLE_DESTINATION_ADOPTED",
        action: "ADOPT_ANNUAL_GOOGLE_DESTINATION",
        targetTournamentId: "2027",
        googleWrites: 0,
      } };
    },
  });
  assert.equal(
    captured.name,
    "adopt_production_future_google_destination_v1",
  );
  assert.equal(captured.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(captured.input.project_url, PRODUCTION_SUPABASE_URL);
  assert.equal(captured.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal("destination_workbook_id" in captured.input, false);
  assert.equal("annual_destination_workbook_id" in captured.input, false);
  assert.match(captured.input.request_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(result.googleWrites, 0);
});

test("post-promotion certification binds only exact server-bounded revisions", async () => {
  let captured;
  await certifyProductionFutureGoogleWriter({
    action: "certify-writer-target",
    ...actor,
    targetTournamentId: "2027",
    expectedResourceRevision: 2,
    expectedSetupRevision: 4,
    expectedPromotionRevision: 1,
    operationRequestId: "10000000-0000-4000-8000-000000000002",
    reason: "Certify annual Google writer target",
  }, {
    env: {},
    getActivation: () => ({ phase: "OBSERVATION" }),
    rpc: async (name, input) => {
      captured = { name, input };
      return { payload: {
        ok: true,
        code: "PRODUCTION_FUTURE_GOOGLE_WRITER_TARGET_CERTIFIED",
        action: "CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET",
        targetTournamentId: "2027",
        jobsClaimed: 0,
        googleWrites: 0,
      } };
    },
  });
  assert.equal(
    captured.name,
    "certify_production_future_google_writer_target_v1",
  );
  assert.equal(captured.input.expected_resource_revision, 2);
  assert.equal(captured.input.expected_setup_revision, 4);
  assert.equal(captured.input.expected_promotion_revision, 1);
  assert.equal(captured.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
});

test("migration is inert, owner/service scoped, deterministic, and never claims a job", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const installation = sql.slice(0, sql.indexOf(
    "create or replace function public.adopt_production_future_google_destination_v1",
  ));
  assert.match(sql, /202608300072_production_annual_google_writer_certification_v1/i);
  assert.match(sql, /assert_future_runtime_service_scope_v2\(\s*input, true, true\s*\)/i);
  assert.match(sql, /scope\.google_workbook_id/i);
  assert.match(sql, /future_google_writer_implementation_fingerprint_v2/i);
  assert.match(sql, /future_google_writer_generation_id_v2/i);
  assert.match(sql, /future_runtime_hash_v2\([\s\S]*targetTournamentId/i);
  assert.match(sql, /sync_future_google_writer_job_v2/i);
  assert.match(sql, /'jobsClaimed', 0/i);
  assert.match(sql, /'googleWrites', 0/i);
  assert.doesNotMatch(installation,
    /insert\s+into\s+production_control\.future_google_writer_(?:generations|targets)_v2/i);
  assert.doesNotMatch(sql,
    /perform\s+public\.claim_production_future_match_google_compatibility_v2/i);
  assert.match(sql,
    /grant execute on function[\s\S]*adopt_production_future_google_destination_v1\(jsonb\)[\s\S]*to service_role/i);
  assert.doesNotMatch(sql,
    /grant execute on function[\s\S]*adopt_production_future_google_destination_v1\(jsonb\)[\s\S]*to authenticated/i);
});

test("nested Director API is same-origin guarded and does not forward destination input", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.match(route,
    /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /production-director-entitlement/);
  assert.match(route, /targetTournamentId: input\.targetTournamentId/);
  assert.doesNotMatch(route,
    /destinationWorkbookId:\s*input\.|sourceWorkbookId:\s*input\./);
  assert.match(route, /googleRequests: 0/);
});
