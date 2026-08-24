import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  adaptProductionShadowCandidatePayload,
  productionShadowCandidateRpcTranslation,
} from "../lib/production-shadow-read-adapters.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const reads = [
  ["read_tournament_live_view", {}, "read_production_candidate_current_view", "TOURNAMENT_LIVE"],
  ["read_leaderboards_core_view", {}, "read_production_candidate_current_view", "LEADERBOARDS"],
  ["read_preview_2026_historical_view", {}, "read_production_candidate_current_view", "HISTORY_2026"],
  ["read_participant_home_view", { target_player_id: "CP01" }, "read_production_candidate_current_view", "PARTICIPANT_HOME"],
  ["read_my_match_view", { target_player_id: "CP01" }, "read_production_candidate_current_view", "MY_MATCH"],
  ["read_game_center_view", { target_match_id: "2026-R1-M1" }, "read_production_candidate_current_view", "GAME_CENTER"],
  ["read_match_authorization_matrix", {}, "read_production_candidate_current_view", "MATCH_AUTHORIZATION"],
  ["read_net_skins_input_view", {}, "read_production_candidate_current_view", "NET_SKINS_INPUT"],
  ["read_net_skins_result_view", {}, "read_production_candidate_current_view", "NET_SKINS_RESULT"],
  ["read_calcutta_configuration_view", {}, "read_production_candidate_current_view", "CALCUTTA_CONFIGURATION"],
  ["read_published_odds_view", {}, "read_production_candidate_current_view", "PUBLISHED_ODDS"],
  ["read_championship_odds_inputs", {}, "read_production_candidate_current_view", "ODDS_INPUT"],
];

test("ordinary candidate adapters translate only to exact Production read RPCs", () => {
  for (const [original, body, expectedRpc, surface] of reads) {
    const translated = productionShadowCandidateRpcTranslation(original, body);
    assert.equal(translated.functionName, expectedRpc, original);
    assert.equal(translated.body.input.surface, surface, original);
    assert.equal(translated.body.input.environment, "PRODUCTION", original);
    assert.equal(translated.body.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF, original);
    assert.equal(translated.body.input.project_url, PRODUCTION_SUPABASE_URL, original);
    assert.equal(translated.body.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID, original);
    assert.equal(translated.body.input.tournament_id, "2026", original);
    assert.equal(translated.body.input.tournament_year, 2026, original);
  }
  for (const forbidden of [
    "submit_hole_score_authoritative",
    "publish_preview_championship_odds",
    "request_preview_odds_calculation_job",
    "claim_preview_google_outbox",
    "import_preview_completed_history_year",
    "replace_preview_scoring_authority_import",
  ]) assert.equal(productionShadowCandidateRpcTranslation(forbidden, {}), null, forbidden);
});

test("Production projection translations carry exact immutable read contracts", () => {
  const guide = productionShadowCandidateRpcTranslation("read_current_guide_projection", {});
  assert.equal(guide.functionName, "read_production_guide_projection");
  assert.equal(guide.body.input.domain, "GUIDE");
  assert.equal(guide.body.input.contract_version, "guide-projection-v1");
  assert.ok(guide.body.input.source_tabs.includes("Important Contacts"));

  const draft = productionShadowCandidateRpcTranslation("read_preview_draft_view", {
    target_scope: "PLAYER", target_player_id: "CP01",
  });
  assert.equal(draft.functionName, "read_production_draft_projection");
  assert.deepEqual(draft.request, { scope: "PLAYER", year: null, playerId: "CP01" });

  const player = productionShadowCandidateRpcTranslation("read_preview_secondary_history_players", {});
  assert.equal(player.functionName, "read_production_player_editorial");
  assert.deepEqual(player.body.input.source_tabs, ["Players"]);
});

test("Production projection payloads retain existing public adapter contracts", () => {
  const envelope = {
    ok: true,
    data: {
      revision_id: "revision-1",
      revision_number: 4,
      contract_version: "guide-projection-v1",
      source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
      source_fingerprint: "s".repeat(64),
      payload_fingerprint: "p".repeat(64),
      validation_status: "VALID",
      imported_at: "2026-08-23T00:00:00.000Z",
      payload: { schemaVersion: "guide-projection-v1", content: { dining: [], courses: [] } },
    },
  };
  const guide = adaptProductionShadowCandidatePayload(envelope, { adapter: "GUIDE_PROJECTION" });
  assert.equal(guide.data.content.schemaVersion, "guide-projection-v1");
  assert.equal(guide.data.projection_revision, 4);
  assert.equal(guide.data.delivery_fingerprint, "p".repeat(64));

  const drafts = adaptProductionShadowCandidatePayload({
    ok: true,
    data: {
      ...envelope.data,
      contract_version: "draft-projection-v1",
      payload: { drafts: [
        { tournament_year: 2025, picks: [{ player_id: "AA01" }] },
        { tournament_year: 2026, picks: [{ player_id: "CP01" }] },
      ] },
    },
  }, { adapter: "DRAFT_PROJECTION", request: { scope: "PLAYER", playerId: "CP01" } });
  assert.equal(drafts.data.drafts.length, 1);
  assert.equal(drafts.data.drafts[0].year, 2026);
  assert.deepEqual(drafts.data.drafts[0].normalized_picks, [{ player_id: "CP01" }]);
});

test("Production 2026 History translation restores immutable adapter fields without calculating", () => {
  const payload = adaptProductionShadowCandidatePayload({
    ok: true,
    data: {
      tournament: { tournament_id: "2026", tournament_year: 2026 },
      teams: [], players: [], rounds: [],
      tournament_presentation: { source_fingerprint: "f".repeat(64), presentation: {} },
      matches: [{
        match: { match_id: "2026-R1-M1", format: "BB", status: "PENDING" },
        snapshot: { snapshot_id: "snapshot-1", format: "BB" },
        holes: [{ hole_number: 1, par: 4, stroke_index: 1 }],
        participants: [],
      }],
      finalized_snapshots: [],
    },
  }, { adapter: "HISTORY_2026" });
  assert.equal(payload.data.matches[0].scoring_snapshot.snapshot_id, "snapshot-1");
  assert.deepEqual(payload.data.matches[0].scoring_snapshot.hole_definitions,
    [{ hole_number: 1, par: 4, stroke_index: 1 }]);
  assert.deepEqual(payload.data.home_presentation, payload.data.tournament_presentation);
  assert.deepEqual(payload.data.counts, {
    players: 0, rounds: 0, teams: 0, matches: 1,
    final_matches: 0, live_matches: 1, current_finalized_snapshots: 0,
  });
});

test("migration 011 is service-role-only, exact-scope, and contains no write workflow", async () => {
  const sql = await readFile(new URL("../supabase/production_migrations/202608230011_production_candidate_read_views.sql", import.meta.url), "utf8");
  assert.match(sql, /auth\.role\(\).*service_role/s);
  assert.match(sql, /ymqhhtxaywtqllynrmxe/);
  assert.match(sql, /1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4/);
  assert.match(sql, /scope\.scoring_authority <> 'GOOGLE'/);
  assert.match(sql, /scope\.participant_identity_authority <> 'PASSPORT'/);
  assert.match(sql, /scope\.public_supabase_reads_enabled/);
  assert.match(sql, /scope\.scoring_ingress_enabled/);
  assert.match(sql, /revoke all on function public\.read_production_candidate_current_view\(jsonb\)[\s\S]*from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant execute on function public\.read_production_candidate_current_view\(jsonb\) to service_role;/);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?(?:scoring_authority|participant_identity)\./i);
  assert.doesNotMatch(sql, /(?:perform|return)\s+public\.(?:publish|claim|checkpoint|recalculate|enqueue|import|write|replace|submit|finalize|reopen)_/i);
});

test("candidate website and PWA server routes bind source selection to the exact request", async () => {
  const pages = [
    "app/page.js", "app/live/page.js", "app/home/page.js", "app/odds-center/page.js",
    "app/history/page.js", "app/players/page.js", "app/records/page.js", "app/statistics/page.js",
    "app/ratings/page.js", "app/compare/page.js", "app/courses/page.js", "app/draft/page.js",
    "app/war-room/page.js", "app/war-room/lineup-optimizer/page.js",
    "app/war-room/team-intelligence/page.js", "app/me/page.js", "app/my-match/page.js",
    "app/game-center/[matchId]/page.js",
  ];
  for (const file of pages) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /applicationPageEnvironment/, file);
    assert.match(source, /await applicationPageEnvironment\(\)/, file);
  }

  const routes = [
    "app/api/tournament/live/route.js", "app/api/tournament/foundation/route.js",
    "app/api/participant/home/route.js", "app/api/my-match/route.js",
    "app/api/game-center/[matchId]/route.js", "app/api/leaderboards/core/route.js",
    "app/api/leaderboards/net-skins/route.js", "app/api/leaderboards/calcutta/route.js",
    "app/api/leaderboards/insights/route.js", "app/api/tournament/secondary/route.js",
  ];
  for (const file of routes) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /applicationRequestEnvironment/, file);
    assert.match(source, /applicationRequestEnvironment\(request\)/, file);
  }
});
