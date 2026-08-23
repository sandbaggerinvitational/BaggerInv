import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const controlSql = fs.readFileSync(
  path.join(root, "supabase/production_migrations/202608230001_production_control_plane.sql"),
  "utf8",
);
const domainSql = fs.readFileSync(
  path.join(root, "supabase/production_migrations/202608230002_production_final_domain_schema.sql"),
  "utf8",
);
const allSql = `${controlSql}\n${domainSql}`;

test("Production baseline contains only exact Production resources", () => {
  assert.match(allSql, /ymqhhtxaywtqllynrmxe/);
  assert.match(allSql, /1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4/);
  assert.match(allSql, /https:\/\/baggerinv\.com/);
  assert.doesNotMatch(allSql, /idgigvjjqkfbqjeredpb/);
  assert.doesNotMatch(allSql, /1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
  assert.doesNotMatch(allSql, /mock-tour|\.vercel\.app\/api\/cron/i);
  assert.match(allSql, /endpoint_url = 'https:\/\/baggerinv\.com\/api\/cron\/guide-sync'/);
  assert.match(allSql, /endpoint_url = 'https:\/\/baggerinv\.com\/api\/cron\/round-scorecards-archive'/);
});

test("Production baseline omits rehearsal and legacy mutation surfaces", () => {
  assert.doesNotMatch(domainSql, /preview_|scoring_dry_run|single_participant|impersonation/i);
  assert.doesNotMatch(domainSql, /\brehearsal\b|unscoped_/i);
  assert.doesNotMatch(domainSql, /insert\s+into\s+auth\./i);
  assert.doesNotMatch(domainSql, /cron\.|net\.http_/i);
});

test("Production S1 omits the incomplete Preview phone-login proof contract and every dependent caller", () => {
  for (const name of [
    "authorize_participant_phone_login_proof",
    "authorize_participant_phone_login_verification",
    "begin_participant_phone_login",
    "complete_participant_phone_login",
    "read_participant_phone_login_state",
    "record_participant_phone_login_send",
  ]) {
    assert.doesNotMatch(domainSql, new RegExp(`\\b${name}\\b`, "i"));
  }
});

test("Production foundation is structurally dormant", () => {
  for (const flag of [
    "public_supabase_reads_enabled",
    "scoring_ingress_enabled",
    "google_writes_enabled",
    "auth_user_creation_enabled",
    "odds_publication_enabled",
    "workers_enabled",
  ]) {
    assert.match(controlSql, new RegExp(`${flag} boolean not null default false check \\(not ${flag}\\)`));
  }
  assert.match(controlSql, /scoring_authority text not null default 'GOOGLE'/);
  assert.match(controlSql, /participant_identity_authority text not null default 'PASSPORT'/);
  assert.match(controlSql, /enabled boolean not null default false check \(not enabled\)/);
  assert.doesNotMatch(allSql, /grant\s+(?:all|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated|service_role)/i);
  assert.match(domainSql, /revoke all on table "scoring_authority"\."matches" from public, anon, authenticated, service_role;/i);
});

test("Operational triggers exist but are disabled until explicit authority activation", () => {
  const triggerNames = [
    "tournament_storylines_net_skins_change",
    "net_skins_hole_score_recalculation",
    "tournament_storylines_score_change",
    "calcutta_official_match_change",
    "capture_scorecard_archive_transition",
    "net_skins_match_lifecycle_recalculation",
    "tournament_derived_match_change",
    "odds_google_mirror_supersession",
  ];
  for (const name of triggerNames) {
    assert.match(domainSql, new RegExp(`create trigger ${name}\\b`, "i"));
    assert.match(domainSql, new RegExp(`disable trigger "${name}"`, "i"));
  }
});

test("Every retained SECURITY DEFINER function has a fixed search_path and no browser execution", () => {
  const definitions = domainSql.split(/CREATE OR REPLACE FUNCTION /i).slice(1);
  const securityDefiners = definitions.filter((definition) => /SECURITY DEFINER/i.test(definition));
  assert.ok(securityDefiners.length > 0);
  for (const definition of securityDefiners) {
    assert.match(definition, /SET search_path TO /i);
  }
  assert.match(domainSql, /revoke all on all functions in schema scoring_authority, participant_identity from public, anon, authenticated, service_role;/i);
});

test("Production import provenance cannot omit or cross tournament scope", () => {
  assert.match(controlSql, /tournament_id text not null/);
  assert.match(controlSql, /tournament_year integer not null/);
  assert.match(controlSql, /foreign key \(tournament_id, tournament_year, source_workbook_id\)/i);
  assert.match(controlSql, /domain = 'COMPLETED_HISTORY' and tournament_year between 2017 and 2025/i);
  assert.match(controlSql, /domain <> 'COMPLETED_HISTORY' and tournament_year = 2026 and tournament_id = '2026'/i);
});
