import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [server, route] = await Promise.all([
  readFile(new URL("../lib/production-net-skins-server.js", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/production-net-skins-v1/route.js", import.meta.url), "utf8"),
]);

test("Production Net Skins server exposes only the exact reviewed RPC allowlist", () => {
  assert.match(server, /^import "server-only";/);
  for (const rpc of [
    "inspect_production_cutover_authority",
    "configure_production_net_skins_v1",
    "enqueue_production_net_skins_v1_recalculation",
    "claim_production_net_skins_v1_recalculation",
    "complete_production_net_skins_v1_recalculation",
    "fail_production_net_skins_v1_recalculation",
  ]) assert.match(server, new RegExp(`"${rpc}"`));
  assert.match(server, /PRODUCTION_SUPABASE_PROJECT_REF/);
  assert.match(server, /PRODUCTION_SUPABASE_URL/);
  assert.match(server, /PRODUCTION_GOOGLE_WORKBOOK_ID/);
  assert.match(server, /PRODUCTION_TOURNAMENT_ID/);
  assert.match(server, /vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID/);
  assert.match(server, /vercel_team_id: PRODUCTION_VERCEL_TEAM_ID/);
  assert.match(server, /vercel_environment: "production"/);
  assert.match(server, /requiredPhase: "OBSERVATION"/);
  assert.match(server, /expected_epoch_id: epochId/);
  assert.match(server, /read_contract: "ACTIVE_CUTOVER"/);
  assert.match(server, /cutover_phase: activation\.maintenanceDeploymentCapability\?\.allowed[\s\S]*activation\.maintenanceDeploymentCapability\.ceiling[\s\S]*activation\.phase/);
  assert.match(server, /\^PRODUCTION_NET_SKINS_\[A-Z0-9_\]/);
  assert.match(server, /safeRpcFailureCode\(payload\)/);
  assert.doesNotMatch(server, /google-sheets|sheets\.googleapis|docs\.google\.com/);
});

test("Director configuration is fixed to the approved V1 rules and optimistic revision", () => {
  assert.match(server, /eligibleRoundNumbers = EXACT_ROUNDS/);
  assert.match(server, /rounds\.length !== EXACT_ROUNDS\.length/);
  assert.match(server, /publication_policy: "OFFICIAL_ONLY"/);
  assert.match(server, /expected_configuration_revision: exactInteger/);
  assert.match(server, /authorization: \{[\s\S]*auth_user_id: authUserId[\s\S]*player_id: playerId[\s\S]*role: "DIRECTOR"/);
  assert.match(server, /operationFingerprint\(requestFingerprint, "CONFIGURE"\)/);
});

test("Production worker reuses the shared JS engine and has claim, complete, and safe failure paths", () => {
  assert.match(server, /calculateNetSkinsFromSupabaseView/);
  assert.match(server, /established display-number compatibility adapter/);
  assert.match(server, /result_state: resultPayload\.finalized === true \? "OFFICIAL" : "PROVISIONAL"/);
  assert.match(server, /engine_version: NET_SKINS_ENGINE_VERSION/);
  assert.match(server, /complete_production_net_skins_v1_recalculation/);
  assert.match(server, /fail_production_net_skins_v1_recalculation/);
  assert.match(server, /Net Skins recalculation is temporarily unavailable\./);
  assert.doesNotMatch(server, /paid|unpaid|collection|payment|balance|settlement/i);
});

test("Director route is Production-only, same-origin, entitlement-bound, and has no GET", () => {
  assert.match(route, /assertProductionCutoverActivation\(\{ requiredPhase: "OBSERVATION" \}\)/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /authorizePreviewDirector\(\{[\s\S]*allowBootstrap: false/);
  assert.match(route, /new Set\(\["configure", "enqueue", "process"\]\)/);
  assert.match(route, /eligibleRoundNumbers: \[1, 2, 3\]/);
  assert.doesNotMatch(route, /export async function GET|export const GET/);
  assert.doesNotMatch(route, /Google|google-sheets|Passport|Calcutta/);
});
