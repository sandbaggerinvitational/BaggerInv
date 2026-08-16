import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Preview captain migration extends the existing canonical import RPC without replacing competition state", async () => {
  const migration = await source("supabase/migrations/202608150001_preview_canonical_team_captain_metadata.sql");
  assert.match(migration, /import_scope[^\n]+TEAM_METADATA/);
  assert.match(migration, /replace_preview_scoring_authority_import_full/);
  assert.match(migration, /CANONICAL_CAPTAIN_ROSTER_MISMATCH/);
  assert.match(migration, /set source_payload = case/);
  assert.match(migration, /competition_state_changed', false/);
  assert.doesNotMatch(migration, /update scoring_authority\.(matches|hole_scores|tournament_players|scoring_snapshots)/i);
  assert.match(migration, /revoke all on function public\.replace_preview_scoring_authority_import\(jsonb\)[\s\S]*from public, anon, authenticated/);
});

test("Director import action uses the canonical builder and same bounded import RPC for team metadata", async () => {
  const route = await source("app/api/director/scoring-authority/route.js");
  assert.match(route, /authoritativeImport\(requestedBy\)/);
  assert.match(route, /scope = "FULL"/);
  assert.match(route, /TEAM_METADATA/);
  assert.match(route, /replaceCanonicalScoringAuthorityImport\(importPayload\)/);
  assert.doesNotMatch(route, /captain_player_id\s*:\s*["']/i);
});

test("actual Team History render requests captain metadata and resolves captain by canonical Player ID", async () => {
  const [page, metadata] = await Promise.all([
    source("app/history/[year]/team/[side]/page.js"),
    source("lib/history-team-metadata.js"),
  ]);
  assert.match(page, /includeTournamentPlayerMetadata:\s*true/);
  assert.match(page, /team\.captainId === player\["Player ID"\]/);
  assert.match(page, /Team Captain/);
  assert.match(metadata, /explicitCaptainId\(team\.source_payload\)/);
  assert.doesNotMatch(metadata, /The Pickles|Lipp it and Rip it|MB01|TL01/);
});
