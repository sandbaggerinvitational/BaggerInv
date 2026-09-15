import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await source("supabase/production_migrations/202609040084_production_starting_hole_retirement_v1.sql");
const contract = await source("lib/production-tournament-setup-contract.js");
const setupUi = await source("app/admin/director/ProductionTournamentSetupPanel.js");
const tournamentDayUi = await source("app/admin/director/ProductionDirectorOperations.js");
const directorModel = await source("lib/production-director-console.js");
const publicMatchCard = await source("app/PublicMatchCard.js");
const scoreEntry = await source("app/score/ScoreEntry.js");
const archive = await source("lib/finalized-match-archive.js");

test("migration 084 is additive, inert, and preserves the legacy evidence column", () => {
  assert.match(migration, /^-- Phase B\.1:/);
  assert.match(migration, /\bbegin;[\s\S]*\bcommit;\s*$/i);
  assert.match(migration, /alter column starting_hole drop default/i);
  assert.match(migration, /alter column starting_hole drop not null/i);
  assert.doesNotMatch(migration, /update\s+scoring_authority\.[a-z0-9_]+\s+set\s+starting_hole/i);
  assert.doesNotMatch(migration, /truncate\s|drop\s+column/i);
  assert.match(migration, /new\.tournament_id = '2026'[\s\S]*new\.starting_hole := null/i);
});

test("current match mutation no longer accepts or synthesizes starting-hole input", () => {
  assert.doesNotMatch(contract, /starting_hole:\s*boundedInteger/);
  assert.doesNotMatch(contract, /startingHole:\s*safeInteger/);
  const replacement = migration.slice(migration.indexOf(
    "create or replace function production_control.apply_tournament_setup_match_v1",
  ));
  assert.doesNotMatch(replacement, /target_start(?:ing_hole)?/i);
  assert.doesNotMatch(replacement, /payload->>'starting_(?:hole|Hole)'|payload->>'startingHole'/i);
  assert.match(replacement, /target_tee_time, null, next_revision/);
  assert.match(replacement, /coalesce\(target_tee_time::text, ''\), ''/);
  assert.doesNotMatch(replacement, /'startingHole'/);
});

test("current Director setup and Tournament Day surfaces present tee time without a starting-hole control", async () => {
  assert.doesNotMatch(setupUi, /Starting hole|startingHole|· Start /);
  const workspace = await source("app/admin/director/RoundPairingWorkspace.js");
  const { evaluate } = await import("./fixtures/release-gate-behavior.mjs");
  const expression = workspace.match(/onClick=\{\(\)=>stage\('upsert-match',([^]*?)\)\}>Review Match Details/);
  assert.ok(expression);
  let staged;
  await evaluate(`stage('upsert-match',${expression[1]});`, { stage: (...args) => { staged = args; }, round: 2,
    match: { matchId: "M2", matchNumber: 1 }, d: { metadata: { courseId: "C1", teeTime: "07:40:00" } } });
  assert.equal(staged[0], "upsert-match");
  assert.deepEqual(staged[1], { matchId: "M2", roundNumber: 2, matchNumber: 1, courseId: "C1", teeTime: "07:40:00" });
  assert.doesNotMatch(workspace, /startingHole|Starting hole/);
  assert.doesNotMatch(tournamentDayUi, /Hole \$\{match\.startingHole\}|match\.startingHole/);
  assert.match(tournamentDayUi, /<dt>Tee time<\/dt>/);
  assert.doesNotMatch(directorModel, /startingHole:\s*clean\(display\.startingHole\)/);
});

test("current scoring presentation uses canonical hole order and public Match Center never advertises Start 1", () => {
  assert.doesNotMatch(publicMatchCard, /startingHole|Starting Hole|Start 1/);
  assert.doesNotMatch(scoreEntry, /startingHole|Starting Hole/);
  assert.match(scoreEntry, /Hole \{holeNumber\} of 18/);
  const scoringContext = migration.slice(migration.indexOf(
    "create or replace function production_control.apply_tournament_setup_scoring_context_v1",
  ));
  assert.doesNotMatch(scoringContext, /starting_hole|startingHole/);
  assert.match(scoringContext, /'holes', holes_value,\s*'participants', participant_manifest/);
});

test("retained finalized archive keeps prior starting-hole evidence without creating a default", () => {
  assert.match(archive, /"Starting Hole"/);
  assert.match(archive, /previous\["Starting Hole"\]/);
  assert.doesNotMatch(migration, /starting_hole\s*=\s*(?:1|'1')/i);
});
