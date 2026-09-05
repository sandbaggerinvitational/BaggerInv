import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeProductionTournamentSetupPayload,
  normalizeProductionTournamentSetupMutation,
} from "../lib/production-tournament-setup-contract.js";

const source = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
const migration = "supabase/production_migrations/202609040086_production_identical_legacy_course_adoption_v1.sql";

test("086 leaves the shared dependency guard, scoring writes and public RPC surface untouched", async () => {
  const sql = await source(migration);
  const previous = await source("supabase/production_migrations/202608300063_production_tournament_setup_v1.sql");
  assert.doesNotMatch(sql, /create (?:or replace )?function (?:public\.|production_control\.tournament_setup_dependency_codes_v1)/);
  assert.doesNotMatch(sql, /grant execute|drop (?:table|function)|truncate/i);
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /ODDS_PUBLICATION_REVIEW_REQUIRED/);
  assert.match(sql, /j\.status in \('PENDING', 'RUNNING', 'RETRYABLE'\)/);
  assert.match(sql, /j\.status = 'SUCCEEDED' and j\.publication_status = 'READY'/);
  assert.match(sql, /where code #>> '\{\}' <> 'ODDS_PUBLICATION_DEPENDENCY'/);
  assert.match(sql, /actual_rounds is distinct from rounds_value/);
  assert.match(sql, /prepared_setup_revision is not null/);
  assert.match(sql, /handicap_v1_match_is_unstarted/);
  assert.match(sql, /snapshot\.rating is distinct from/);
  assert.match(sql, /snapshot\.slope is distinct from/);
  assert.match(sql, /snapshot\.par is distinct from/);
  assert.match(sql, /legacy_course_adoption_holes_v1\(snapshot\.hole_definitions\)/);
  assert.match(sql, /order by m\.match_id for update/);
  const publishLock = sql.indexOf("pg_advisory_xact_lock(731132026057");
  const jobsLock = sql.indexOf("pg_advisory_xact_lock(731102026031");
  const dependencyRead = sql.indexOf("dependencies := production_control.tournament_setup_dependency_codes_v1");
  assert.ok(publishLock < jobsLock && jobsLock < dependencyRead);
  // The complete materialization write block is verbatim from 063. Only the
  // gate and safe response metadata change, not the tables/facts it writes.
  const writeBlock = (text) => text.split("create or replace function production_control.apply_tournament_setup_course_v1(")[1]
    .split("    insert into scoring_authority.tournament_setup_course_tees_v1 (")[1]
    .split("  return pg_catalog.jsonb_build_object(")[0];
  assert.equal(writeBlock(sql), writeBlock(previous));
  const outsideFunctions = sql.replace(/create (?:or replace )?function[\s\S]*?\$\$;/g, "");
  assert.doesNotMatch(outsideFunctions, /\b(insert|update|delete|alter table|select|perform)\b/i);
  assert.doesNotMatch(sql, /f7aa6913|033c650f|CPGC01|OCGC01|2026-R2|2026-R3/);
});

const payload = () => ({
  contractVersion: "production-tournament-setup-v1", revision: 1,
  teams: [], roster: [], rounds: [],
  courses: [{ courseId: "CPGC01", name: "CPGC01", tee: "Black", roundNumbers: [2],
    complete: true, setupManaged: false, setupRevision: null, rating: 72.7, slope: 138, par: 72, holes: [] }],
  matches: [{ matchId: "2026-R2-1", roundNumber: 2, courseId: "CPGC01", tee: "Black",
    courseName: "Cougar Point Golf Course" }],
});

test("Director course labels reuse one existing response keyed by exact Course ID/tee", () => {
  const input = payload();
  const before = structuredClone(input);
  const course = normalizeProductionTournamentSetupPayload(input).courses[0];
  assert.equal(course.name, "Cougar Point Golf Course");
  assert.equal(course.setupManaged, false);
  assert.equal(course.rating, "72.7");
  assert.deepEqual(input, before);
  input.courses[0].setupManaged = true;
  input.courses[0].setupRevision = 2;
  input.courses[0].name = "Configured course name";
  const managed = normalizeProductionTournamentSetupPayload(input).courses[0];
  assert.equal(managed.name, "Configured course name");
  assert.equal(managed.setupManaged, true);
  assert.equal(managed.setupRevision, 2);
});

test("ambiguous or wrong-identity retained labels do not override canonical course presentation", () => {
  for (const other of [{ tee: "Gold" }, { courseId: "OTHER" }]) {
    const input = payload(); input.matches[0] = { ...input.matches[0], ...other };
    assert.equal(normalizeProductionTournamentSetupPayload(input).courses[0].name, "CPGC01");
  }
  const input = payload();
  input.matches.push({ ...input.matches[0], matchId: "2026-R2-2", courseName: "Conflict" });
  input.matches.push({ ...input.matches[0], matchId: "2026-R2-3" });
  assert.equal(normalizeProductionTournamentSetupPayload(input).courses[0].name, "CPGC01");
});

test("adoption receipt renders only allowlisted readable warnings, including exact retries", async () => {
  for (const idempotent of [false, true]) {
    const result = normalizeProductionTournamentSetupMutation({ ok: true, revision: 2,
      action: "UPSERT_COURSE", idempotent, warnings: ["ODDS_PUBLICATION_REVIEW_REQUIRED", "private-internal-data"] });
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /Published Odds remain unchanged/);
    assert.match(result.warnings[0], /pairings/);
    assert.doesNotMatch(JSON.stringify(result), /private-internal-data|ODDS_PUBLICATION_REVIEW_REQUIRED/);
  }
  assert.deepEqual(normalizeProductionTournamentSetupMutation({ ok: true, revision: 1 }).warnings, []);
  const panel = await source("app/admin/director/ProductionTournamentSetupPanel.js");
  assert.match(panel, /<Blockers warnings=\{receipt\.warnings\}/);
  assert.match(panel, /Setup-managed/);
  assert.match(panel, /Imported course complete/);
  assert.doesNotMatch(panel, /certify_identical_legacy_course_adoption|supabase\.from\(/);
});
