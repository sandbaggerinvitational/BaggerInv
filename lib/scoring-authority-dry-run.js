import { randomUUID } from "node:crypto";
import { scoringShadowRpc } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => /^(true|yes|1|locked)$/i.test(clean(value));

export function resolveScoringAuthorityCourseSnapshot({ historicalMatch = {}, currentMatch = {}, courses = [], courseHoles = [] } = {}) {
  const courseId = clean(historicalMatch["Course ID"] || currentMatch["Course ID"]);
  const tee = clean(historicalMatch.Tee || historicalMatch["Tee Played"] || currentMatch.Tee || currentMatch["Tee Played"]);
  const resolvedMatch = { ...historicalMatch, "Course ID": courseId, Tee: tee };
  const course = courses.find((item) => clean(item["Course ID"]).toUpperCase() === courseId.toUpperCase() && (!item.Year || number(item.Year) === number(resolvedMatch.Year))) || {};
  const holes = courseHoles.filter((item) => clean(item["Course ID"]).toUpperCase() === courseId.toUpperCase() && (!tee || !item.Tee || clean(item.Tee).toUpperCase() === tee.toUpperCase()));
  return { match: resolvedMatch, course, courseHoles: holes, courseId, tee };
}

function playerSnapshot(match, side, slot) {
  const id = clean(match[`Team ${side} Player ${slot}`]);
  if (!id) return null;
  return {
    id,
    team: side,
    slot,
    handicap_index: Number.isFinite(Number(match[`Team ${side} Player ${slot} Handicap Index`]))
      ? Number(match[`Team ${side} Player ${slot} Handicap Index`]) : null,
    course_handicap: Number.isFinite(Number(match[`Team ${side} Player ${slot} Course HCP`]))
      ? Number(match[`Team ${side} Player ${slot} Course HCP`]) : null,
    playing_handicap: number(match[`Team ${side} Player ${slot} Playing HCP`]),
    final_strokes: number(match[`Team ${side} Player ${slot} Stroke`]),
  };
}

export function buildScoringAuthorityDryRunFixture({
  match = {}, course = {}, courseHoles = [], round = {}, forceWritable = true,
} = {}) {
  const format = clean(match.Format).toUpperCase();
  const team1 = [1, 2].map((slot) => playerSnapshot(match, 1, slot)).filter(Boolean);
  const team2 = [1, 2].map((slot) => playerSnapshot(match, 2, slot)).filter(Boolean);
  const holes = courseHoles
    .filter((hole) => Number(hole["Hole Number"]) >= 1 && Number(hole["Hole Number"]) <= 18)
    .sort((left, right) => Number(left["Hole Number"]) - Number(right["Hole Number"]))
    .map((hole) => ({
      hole_number: Number(hole["Hole Number"]),
      stroke_index: Number(hole["Stroke Index"]),
      par: Number(hole.Par),
      yardage: Number(hole.Yardage),
    }));
  if (!["BB", "SC", "SI"].includes(format)) throw new Error(`Unsupported dry-run format: ${format || "missing"}.`);
  if (holes.length !== 18 || new Set(holes.map((hole) => hole.hole_number)).size !== 18 || holes.some((hole) => !Number.isInteger(hole.stroke_index))) {
    throw new Error(`Dry-run fixture ${clean(match["Match ID"])} requires 18 immutable hole definitions.`);
  }
  const allIds = [...team1, ...team2].map((player) => player.id);
  const allowance = Number(round["Handicap Allowance"] ?? match["Handicap Allowance"]);
  return {
    match_id: clean(match["Match ID"]),
    tournament_id: clean(match["Tournament ID"] || match.Year),
    tournament_year: number(match.Year),
    round_number: number(match.Round),
    format,
    scoring_rules_version: clean(match["Scoring Rules Version"] || round["Scoring Rules Version"] || "sandbagger-2026-v1"),
    status: forceWritable ? "LIVE" : (/^final/i.test(clean(match["Match Status"])) ? "FINAL" : "LIVE"),
    scoring_locked: forceWritable ? false : truthy(match["Scoring Locked"]),
    permission_revision: Math.max(1, number(match["Access Version"], 1)),
    match_revision: 0,
    scoring_snapshot: {
      captured_at: clean(match["Updated At"] || new Date().toISOString()),
      effective_at: clean(match["Updated At"] || ""),
      snapshot_revision: number(match.Revision),
      tournament: { id: clean(match["Tournament ID"] || match.Year), year: number(match.Year) },
      round: number(match.Round),
      match_id: clean(match["Match ID"]),
      format,
      scoring_rules_version: clean(match["Scoring Rules Version"] || round["Scoring Rules Version"] || "sandbagger-2026-v1"),
      handicap_allowance: Number.isFinite(allowance) ? allowance : null,
      match_netting_baseline: clean(match["Match Netting Baseline"] || "lowest-playing-handicap"),
      course: {
        course_id: clean(match["Course ID"] || course["Course ID"]),
        tee: clean(match.Tee || match["Tee Played"] || course["Tee Played"] || course.Tee),
        rating: number(course.Rating ?? course["Course Rating"]),
        slope: number(course.Slope ?? course["Slope Rating"]),
        par: number(course.Par),
      },
      holes,
      participants: { team_1: team1, team_2: team2, all_ids: allIds },
      teams: {
        team_1_strokes: number(match["Team 1 Stroke"]),
        team_2_strokes: number(match["Team 2 Stroke"]),
      },
    },
  };
}

export function scoringDryRunAuthorization(fixture, playerId = fixture?.scoring_snapshot?.participants?.all_ids?.[0]) {
  return {
    passport_verified: true,
    tournament_id: fixture.tournament_id,
    match_id: fixture.match_id,
    player_id: playerId,
    permission_revision: fixture.permission_revision,
    role: "PLAYER",
  };
}

export async function resetScoringAuthorityDryRun(fixtureSet, fixtures, options = {}) {
  return scoringShadowRpc("reset_scoring_authority_dry_run", {
    target_fixture_set: fixtureSet,
    fixtures,
  }, { ...options, timeoutMs: options.timeoutMs || 20_000 });
}

export async function submitScoringAuthorityDryRun(input, options = {}) {
  const startedAt = Date.now();
  const response = await scoringShadowRpc("submit_hole_score_dry_run", { input }, options);
  const rpcTotalMs = Date.now() - startedAt;
  const serverMs = number(response.payload?.timings?.server_transaction_ms);
  return {
    ...response,
    rpcTotalMs,
    commitResponseMs: Math.max(0, rpcTotalMs - serverMs),
  };
}

export async function finalizeScoringAuthorityDryRun(input, options = {}) {
  const startedAt = Date.now();
  const response = await scoringShadowRpc("finalize_match_dry_run", { input }, options);
  return { ...response, rpcTotalMs: Date.now() - startedAt };
}

export async function readScoringAuthorityDryRun(input, options = {}) {
  const startedAt = Date.now();
  const response = await scoringShadowRpc("read_scoring_authority_dry_run", { input }, options);
  return { ...response, rpcTotalMs: Date.now() - startedAt };
}

export async function recordScoringAuthorityDryRunSample(sample, options = {}) {
  return scoringShadowRpc("record_scoring_authority_dry_run_sample", { sample }, options);
}

export async function scoringAuthorityDryRunTimeoutProbe(delayMs, options = {}) {
  return scoringShadowRpc("scoring_authority_dry_run_timeout_probe", { delay_ms: delayMs }, options);
}

export function dryRunMutationInput({ fixtureSet, fixture, holeNumber, team1, team2, expectedMatchRevision = 0, expectedHoleRevision = 0, mutationKey = randomUUID(), playerId } = {}) {
  return {
    fixture_set: fixtureSet,
    match_id: fixture.match_id,
    hole_number: holeNumber,
    team_1_gross_scores: team1,
    team_2_gross_scores: team2,
    expected_match_revision: expectedMatchRevision,
    expected_hole_revision: expectedHoleRevision,
    mutation_key: mutationKey,
    authorization: scoringDryRunAuthorization(fixture, playerId),
  };
}
