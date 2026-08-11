import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildScoringAuthorityDryRunFixture,
  dryRunMutationInput,
  resolveScoringAuthorityCourseSnapshot,
  scoringDryRunAuthorization,
} from "../lib/scoring-authority-dry-run.js";
import { scoringAuthority } from "../lib/scoring-authority.js";

const courseHoles = Array.from({ length: 18 }, (_, index) => ({
  "Hole Number": index + 1,
  "Stroke Index": 18 - index,
  Par: index % 3 === 0 ? 5 : 4,
  Yardage: 350 + index * 10,
}));

function match(format = "SI") {
  return {
    "Match ID": `2026-${format}-1`, "Tournament ID": "T2026", Year: 2026, Round: format === "BB" ? 1 : format === "SC" ? 2 : 3,
    Format: format, "Course ID": "OCEAN", Tee: "Gold", Revision: 8, "Access Version": 3,
    "Updated At": "2026-08-10T12:00:00.000Z", "Scoring Rules Version": "sandbagger-2026-v1",
    "Team 1 Player 1": "P1", "Team 1 Player 1 Handicap Index": 4.2, "Team 1 Player 1 Course HCP": 5,
    "Team 1 Player 1 Playing HCP": 4, "Team 1 Player 1 Stroke": 0,
    "Team 2 Player 1": "P2", "Team 2 Player 1 Handicap Index": 8.2, "Team 2 Player 1 Course HCP": 9,
    "Team 2 Player 1 Playing HCP": 8, "Team 2 Player 1 Stroke": 4,
    ...(format === "BB" ? {
      "Team 1 Player 2": "P3", "Team 1 Player 2 Playing HCP": 12, "Team 1 Player 2 Stroke": 8,
      "Team 2 Player 2": "P4", "Team 2 Player 2 Playing HCP": 10, "Team 2 Player 2 Stroke": 6,
    } : {}),
    "Team 1 Stroke": 0, "Team 2 Stroke": 4,
  };
}

test("authority flag stays Google unless a server-only Preview isolation gate is complete", () => {
  const safe = { VERCEL_ENV: "preview", SCORING_AUTHORITY: "supabase", PREVIEW_SCORING_SHEET_ID: "preview", GOOGLE_SHEETS_SPREADSHEET_ID: "preview" };
  assert.equal(scoringAuthority(safe), "supabase");
  assert.equal(scoringAuthority({ ...safe, VERCEL_ENV: "production" }), "google");
  assert.equal(scoringAuthority({ ...safe, GOOGLE_SHEETS_SPREADSHEET_ID: "production" }), "google");
  assert.equal(scoringAuthority({ ...safe, SCORING_AUTHORITY: "google" }), "google");
});

test("dry-run fixture captures immutable scoring configuration for all formats", () => {
  for (const format of ["BB", "SC", "SI"]) {
    const fixture = buildScoringAuthorityDryRunFixture({
      match: match(format), course: { "Course ID": "OCEAN", Rating: 71.9, Slope: 136, Par: 72 }, courseHoles,
      round: { "Handicap Allowance": format === "BB" ? 90 : 100, "Scoring Rules Version": "sandbagger-2026-v1" },
    });
    assert.equal(fixture.format, format);
    assert.equal(fixture.status, "LIVE");
    assert.equal(fixture.scoring_snapshot.holes.length, 18);
    assert.deepEqual(fixture.scoring_snapshot.holes[0], { hole_number: 1, stroke_index: 18, par: 5, yardage: 350 });
    assert.equal(fixture.scoring_snapshot.course.tee, "Gold");
    assert.equal(fixture.scoring_snapshot.course.rating, 71.9);
    assert.equal(fixture.scoring_snapshot.scoring_rules_version, "sandbagger-2026-v1");
    assert.equal(fixture.scoring_snapshot.participants.all_ids.length, format === "BB" ? 4 : 2);
    assert.equal(fixture.scoring_snapshot.participants.team_2[0].final_strokes, 4);
  }
});

test("historical scoring participants fall back to the current authoritative course and tee identity", () => {
  const current = match("BB");
  const historical = { ...current, "Course ID": "", Tee: "", "Team 1 Player 2 Stroke": 13 };
  const resolved = resolveScoringAuthorityCourseSnapshot({
    historicalMatch: historical,
    currentMatch: current,
    courses: [{ "Course ID": "OCEAN", Year: 2026, Tee: "Gold", Rating: 71.9 }],
    courseHoles: courseHoles.map((hole) => ({ ...hole, "Course ID": "OCEAN", Tee: "Gold" })),
  });
  assert.equal(resolved.courseId, "OCEAN");
  assert.equal(resolved.tee, "Gold");
  assert.equal(resolved.courseHoles.length, 18);
  assert.equal(resolved.match["Team 1 Player 2 Stroke"], 13, "historical scoring allocation remains immutable");
});

test("course identity resolves from authoritative year and format when match rows omit it", () => {
  const current = { ...match("BB"), "Course ID": "", Tee: "" };
  const historical = { ...current, "Team 1 Player 2 Stroke": 13 };
  const resolved = resolveScoringAuthorityCourseSnapshot({
    historicalMatch: historical,
    currentMatch: current,
    courses: [
      { "Course ID": "OCEAN", Year: 2026, Format: "Singles", "Tee Played": "Gold" },
      { "Course ID": "TURTLE", Year: 2026, Format: "Best Ball", "Tee Played": "Gold" },
    ],
    courseHoles: courseHoles.map((hole) => ({ ...hole, "Course ID": "TURTLE", Tee: "Gold" })),
  });
  assert.equal(resolved.courseId, "TURTLE");
  assert.equal(resolved.tee, "Gold");
  assert.equal(resolved.match["Team 1 Player 2 Stroke"], 13);
  assert.equal(resolved.courseHoles.length, 18);
});

test("dry-run mutation carries independent expected match/hole revisions and trusted Passport context", () => {
  const fixture = buildScoringAuthorityDryRunFixture({ match: match("SI"), courseHoles, course: {}, round: {} });
  const input = dryRunMutationInput({ fixtureSet: "fixture", fixture, holeNumber: 7, team1: [4], team2: [5], expectedMatchRevision: 9, expectedHoleRevision: 2, mutationKey: "same-key" });
  assert.equal(input.expected_match_revision, 9);
  assert.equal(input.expected_hole_revision, 2);
  assert.deepEqual(input.authorization, scoringDryRunAuthorization(fixture));
  assert.equal(input.authorization.passport_verified, true);
  assert.equal(input.authorization.permission_revision, 3);
});

test("Phase 2 dry-run migration enforces isolation, cross-instance locking, revisions, idempotency, and atomic outbox", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608110001_preview_scoring_authority_dry_run.sql", import.meta.url), "utf8");
  assert.match(sql, /create schema if not exists scoring_dry_run/i);
  assert.match(sql, /for update/i, "match rows serialize transactions across database clients");
  assert.match(sql, /expected_match_revision/i);
  assert.match(sql, /expected_hole_revision/i);
  assert.match(sql, /MATCH_REVISION_CONFLICT/);
  assert.match(sql, /HOLE_REVISION_CONFLICT/);
  assert.match(sql, /IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /primary key \(fixture_set, match_id, mutation_key\)/i);
  assert.match(sql, /insert into scoring_dry_run\.audit_events/i);
  assert.match(sql, /insert into scoring_dry_run\.google_outbox/i);
  assert.match(sql, /SCORECARD_INCOMPLETE/);
  assert.match(sql, /UNRESOLVED_MUTATIONS/);
  assert.match(sql, /alter table scoring_dry_run\.matches enable row level security/i);
  assert.match(sql, /revoke all on all tables in schema scoring_dry_run from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.submit_hole_score_dry_run\(jsonb\) to service_role/i);
});

test("dry-run RPC preserves post-clinch scoring and prevents a non-contiguous false clinch", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608110001_preview_scoring_authority_dry_run.sql", import.meta.url), "utf8");
  assert.match(sql, /contiguous and clinch_hole is not null/i);
  assert.match(sql, /scorecard_complete.*complete_value/is);
  assert.doesNotMatch(sql, /clinched_value[^;]+MATCH_FINAL/is, "clinch state is not a write-blocking lifecycle guard");
});

test("Preview administrative route is Director-gated and leaves participant scoring authority untouched", async () => {
  const route = await readFile(new URL("../app/api/director/scoring-shadow/phase2-dry-run/route.js", import.meta.url), "utf8");
  assert.match(route, /VERCEL_ENV !== "preview"/);
  assert.match(route, /assertScoringShadowAdministrativeEnvironment/);
  assert.match(route, /inspectTournamentDirectorToken/);
  assert.match(route, /Tournament Director access is required/);
  assert.doesNotMatch(route, /SCORING_AUTHORITY\s*=\s*["']supabase/i);
  assert.match(route, /saveLiveHoleScore/, "Google timing samples retain the existing authoritative pipeline");
});

test("Google scoring diagnostics separate pre-read, write, invalidation, verification, and audit timing", async () => {
  const source = await readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8");
  for (const metric of ["googlePreReadMs", "googleWriteMs", "cacheInvalidationMs", "verificationReadbackMs", "auditAppendMs"]) {
    assert.match(source, new RegExp(metric));
  }
});
