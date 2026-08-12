import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MATCH_ACCESS_ACTIONS,
  compareMatchAuthorizationMatrix,
  expectedMatchAuthorizationDecision,
  expectedMatchAuthorizationMatrix,
} from "../lib/match-authorization-supabase.js";
import { matchAuthorizationEnvironment, requireMatchAuthorizationSource } from "../lib/match-authorization-source.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewEnv = {
  VERCEL_ENV: "preview",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
};

function fixture() {
  const players = ["CB01", "HM01", "OTHER", "INACTIVE"].map((player_id) => ({ player_id, display_name: player_id }));
  const matches = [
    { match_id: "LIVE", tournament_id: "2026", status: "LIVE", scoring_locked: false, permission_revision: 2 },
    { match_id: "FINAL", tournament_id: "2026", status: "FINAL", scoring_locked: true, permission_revision: 3 },
    { match_id: "LOCKED", tournament_id: "2026", status: "LIVE", scoring_locked: true, permission_revision: 4 },
    { match_id: "REVOKED", tournament_id: "2026", status: "LIVE", scoring_locked: false, permission_revision: 5 },
    { match_id: "ZERO", tournament_id: "2026", status: "UPCOMING", scoring_locked: false, permission_revision: 1, scored_holes: 0 },
  ];
  const participantIds = ["LIVE", "FINAL", "LOCKED", "REVOKED", "ZERO"];
  return { payload: {
    tournament: { tournament_id: "2026" },
    players,
    tournament_players: players.map((row) => ({ tournament_id: "2026", player_id: row.player_id,
      participation_status: row.player_id === "INACTIVE" ? "INACTIVE" : "ACTIVE" })),
    matches,
    match_participants: participantIds.flatMap((match_id) => [
      { match_id, player_id: "CB01" }, { match_id, player_id: "HM01" },
    ]),
    permissions: participantIds.flatMap((match_id) => ["CB01", "HM01"].map((player_id) => {
      const match = matches.find((row) => row.match_id === match_id);
      return { match_id, player_id, can_score: !["FINAL", "REVOKED"].includes(match_id),
        permission_revision: match.permission_revision, revoked_at: match_id === "REVOKED" ? "2026-08-12T00:00:00Z" : "" };
    })),
  } };
}

const decide = (input) => expectedMatchAuthorizationDecision(fixture(), { tournamentId: "2026", playerId: "CB01", ...input });

test("match authorization source is Preview-only, server-controlled, and fails closed", () => {
  assert.equal(matchAuthorizationEnvironment(previewEnv).resolved, "supabase");
  assert.equal(matchAuthorizationEnvironment({ ...previewEnv, VERCEL_ENV: "production", GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID }).resolved, "google");
  assert.equal(matchAuthorizationEnvironment({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }).blocked, true);
  assert.throws(() => requireMatchAuthorizationSource({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }), /unavailable/);
});

test("FINAL participant can read the scorecard but cannot score", () => {
  const view = decide({ matchId: "FINAL", action: MATCH_ACCESS_ACTIONS.VIEW_FINAL_SCORECARD });
  assert.equal(view.allowed, true);
  assert.equal(view.read_only, true);
  assert.equal(view.can_score, false);
  assert.equal(decide({ matchId: "FINAL", action: MATCH_ACCESS_ACTIONS.START_SCORING }).code, "MATCH_FINAL");
});

test("START_SCORING preserves lifecycle, lock, permission, and revision guards", () => {
  assert.equal(decide({ matchId: "LIVE", action: MATCH_ACCESS_ACTIONS.START_SCORING }).allowed, true);
  assert.equal(decide({ matchId: "LOCKED", action: MATCH_ACCESS_ACTIONS.START_SCORING }).code, "MATCH_LOCKED");
  assert.equal(decide({ matchId: "REVOKED", action: MATCH_ACCESS_ACTIONS.START_SCORING }).code, "SCORING_PERMISSION_REVOKED");
  assert.equal(decide({ matchId: "ZERO", action: MATCH_ACCESS_ACTIONS.START_SCORING }).code, "MATCH_NOT_SCOREABLE");
  const changed = fixture();
  changed.payload.permissions.find((row) => row.match_id === "LIVE" && row.player_id === "CB01").permission_revision = 1;
  assert.equal(expectedMatchAuthorizationDecision(changed, { tournamentId: "2026", playerId: "CB01", matchId: "LIVE", action: "START_SCORING" }).code, "SCORING_PERMISSION_STALE");
});

test("membership and match participation remain independent authorization gates", () => {
  assert.equal(expectedMatchAuthorizationDecision(fixture(), { tournamentId: "2026", playerId: "OTHER", matchId: "LIVE", action: "VIEW_MATCH" }).code, "NOT_MATCH_PARTICIPANT");
  assert.equal(expectedMatchAuthorizationDecision(fixture(), { tournamentId: "2026", playerId: "INACTIVE", matchId: "LIVE", action: "VIEW_MATCH" }).code, "TOURNAMENT_MEMBERSHIP_INACTIVE");
});

test("Preview impersonation authorizes the effective HM01 context, not linked CB01 Auth", async () => {
  const route = await source("app/api/player-passport/matches/route.js");
  assert.match(route, /playerPassportEffectivePlayerId\(session\)/);
  assert.match(route, /authorizeMatchAccess\(\{ tournamentId: session\.tournamentId, playerId, matchId, action \}\)/);
  assert.doesNotMatch(route, /verifyParticipantAuthClaims/);
  assert.equal(expectedMatchAuthorizationDecision(fixture(), { tournamentId: "2026", playerId: "HM01", matchId: "LIVE", action: "START_SCORING" }).allowed, true);
});

test("matrix parity covers all active players, matches, and explicit actions", () => {
  const expected = expectedMatchAuthorizationMatrix(fixture());
  assert.equal(expected.length, 3 * 5 * 4);
  assert.equal(compareMatchAuthorizationMatrix(expected, structuredClone(expected)).pass, true);
  const changed = structuredClone(expected);
  changed[0].allowed = !changed[0].allowed;
  assert.equal(compareMatchAuthorizationMatrix(expected, changed).pass, false);
});

test("RPC and matrix stay service-only without permissive participant policies", async () => {
  const migration = await source("supabase/migrations/202608120021_preview_match_authorization.sql");
  assert.match(migration, /create or replace function public\.authorize_match_access/);
  assert.match(migration, /create or replace function public\.read_match_authorization_matrix/);
  assert.match(migration, /revoke all on function public\.authorize_match_access\(text,text,text,text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.authorize_match_access\(text,text,text,text\) to service_role/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
});

test("Supabase route has structured denials, no Google fallback, and stable session semantics", async () => {
  const route = await source("app/api/player-passport/matches/route.js");
  const supabaseBranch = route.slice(route.indexOf('if (source.resolved === "supabase")'), route.indexOf("} else {\n      access = await authorizePassportMatch"));
  assert.match(route, /AUTHORIZATION_UNAVAILABLE/);
  assert.match(route, /NOT_MATCH_PARTICIPANT/);
  assert.match(route, /X-Match-Authorization-Google-Requests/);
  assert.match(route, /createScoringSession/);
  assert.doesNotMatch(supabaseBranch, /authorizePassportMatch|readSheet|readSheets/);
});

test("all POST callers declare their scoring versus final-read intent", async () => {
  const [score, gameCenter, home] = await Promise.all([
    source("app/score/ScoreEntry.js"), source("app/game-center/GameCenter.js"), source("app/PersonalizedPlayerHome.js"),
  ]);
  assert.match(score, /VIEW_FINAL_SCORECARD/);
  assert.match(score, /START_SCORING/);
  assert.match(gameCenter, /requestedAction: "START_SCORING"/);
  assert.match(home, /requestedAction: "START_SCORING"/);
  assert.doesNotMatch(gameCenter, /response\.ok \? "\/score"/);
});

test("Director parity exercises 24 players, every action, and independent timing classes", async () => {
  const [route, readiness] = await Promise.all([
    source("app/api/director/scoring-authority/route.js"),
    source("app/admin/director/game-center-readiness/GameCenterReadinessClient.js"),
  ]);
  assert.match(route, /action === "match-authorization-parity"/);
  assert.match(route, /expectedMatchAuthorizationMatrix/);
  assert.match(route, /players\.length === 24/);
  assert.match(route, /fullAuthorization: benchmarkSummary/);
  assert.match(readiness, /Verify Match Authorization Parity/);
});
