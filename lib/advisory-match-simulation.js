import { allocateStrokes, formatCode, pick } from "./prediction-engine.js";
import { simulateMatch } from "./match-simulator.js";

export const ADVISORY_HOLE_CONTRACT = "advisory-course-holes-v1";
const list = value => Array.isArray(value) ? value : [];
const clean = value => String(value ?? "").trim();
const numeric = value => value === null || value === undefined || clean(value) === "" ? NaN : Number(value);

/** Validate real course definitions, never synthesize missing holes or indices. */
export function completeAdvisoryHoles(rows, par) {
  const holes = list(rows).map(h => ({
    "Hole Number": numeric(h.hole_number ?? h["Hole Number"]),
    Par: numeric(h.par ?? h.Par),
    "Stroke Index": numeric(h.stroke_index ?? h["Stroke Index"]),
    Yardage: h.yardage ?? h.Yardage ?? null,
  })).sort((a, b) => a["Hole Number"] - b["Hole Number"]);
  if (holes.length !== 18 || holes.some((h, i) => h["Hole Number"] !== i + 1 ||
      !Number.isInteger(h.Par) || h.Par < 3 || h.Par > 6 ||
      !Number.isInteger(h["Stroke Index"]) || h["Stroke Index"] < 1 || h["Stroke Index"] > 18) ||
      new Set(holes.map(h => h["Stroke Index"])).size !== 18 ||
      holes.reduce((sum, h) => sum + h.Par, 0) !== numeric(par)) return [];
  return holes;
}

/** Ephemeral projection from the existing canonical Supabase read, not a snapshot.
 * Keep the shared prediction/Odds bundle untouched. An empty strictly unstarted
 * record cannot mask complete agreeing course facts from the same round/tee.
 */
export function buildAdvisoryCourseProjections(state = {}) {
  const year = numeric(state?.tournament?.tournament_year);
  const tournamentId = clean(state?.tournament?.tournament_id);
  if (!Number.isInteger(year) || !tournamentId) return [];
  const groups = new Map();
  for (const record of list(state.matches)) {
    const match = record.match || {}, s = record.snapshot || {};
    if (clean(match.tournament_id) !== tournamentId) continue;
    const courseId = clean(s.course_id), tee = clean(s.tee), round = numeric(match.round_number);
    if (!courseId || !tee || !Number.isInteger(round)) continue;
    const key = JSON.stringify([round, courseId, tee]);
    const metadata = { rating: numeric(s.rating), slope: numeric(s.slope), par: numeric(s.par) };
    const group = groups.get(key) || { contract: ADVISORY_HOLE_CONTRACT, year, round, courseId, tee, ...metadata,
      state: "UNAVAILABLE", holes: [], conflict: false };
    groups.set(key, group);
    if (!Number.isFinite(metadata.rating) || metadata.rating <= 0 || metadata.slope < 55 || metadata.slope > 155 ||
        !Number.isFinite(metadata.slope) || metadata.rating !== group.rating || metadata.slope !== group.slope || metadata.par !== group.par) group.conflict = true;
    const rows = list(record.holes);
    const emptyUnstarted = rows.length === 0 && match.status === "UPCOMING" &&
      match.scored_holes === 0 && match.unresolved_mutations === 0 && match.scoring_locked === false &&
      !match.finalized_at && !match.scorecard_complete && !match.clinched &&
      numeric(match.team_1_points ?? 0) === 0 && numeric(match.team_2_points ?? 0) === 0 &&
      !clean(match.result_winner) && list(record.scores).length === 0;
    if (emptyUnstarted) continue;
    const holes = completeAdvisoryHoles(rows, metadata.par);
    if (!holes.length || (group.holes.length && JSON.stringify(group.holes) !== JSON.stringify(holes))) group.conflict = true;
    else group.holes = holes;
  }
  return [...groups.values()].map(({ conflict, ...group }) => ({ ...group,
    state: conflict ? "CONFLICT" : group.holes.length === 18 ? "READY" : "UNAVAILABLE",
    holes: conflict ? [] : group.holes,
  }));
}

export function selectAdvisoryHoles(projections, { year, course, tee, scorecard }, legacyHoles = []) {
  const par = pick(scorecard, "Par");
  // Legacy/Google tooling can use its existing hole read, but an explicitly
  // unavailable Supabase projection must never fall back to historical rows.
  if (!Array.isArray(projections)) return completeAdvisoryHoles(legacyHoles, par);
  const round = numeric(clean(pick(course, "Round")).replace(/^Round\s*/i, ""));
  const candidates = projections.filter(p => p.year === year && p.round === round &&
    p.courseId === clean(pick(course, "Course ID")) && p.tee === tee);
  if (candidates.length !== 1) return [];
  const p = candidates[0];
  if (p.state !== "READY" || p.rating !== numeric(pick(scorecard, "Course Rating", "Rating")) ||
      p.slope !== numeric(pick(scorecard, "Slope Rating", "Slope")) || p.par !== numeric(par)) return [];
  return completeAdvisoryHoles(p.holes, par);
}

export function advisoryStrokeMaps(format, play, holes) {
  if (!play || holes.length !== 18) return null;
  const code = formatCode(format);
  if (code === "SC") return { teamA: allocateStrokes(play.strokesA, holes), teamB: allocateStrokes(play.strokesB, holes) };
  const size = code === "SI" ? 1 : 2;
  if (play.playerStrokes?.length !== size * 2) return null;
  const maps = play.playerStrokes.map(strokes => allocateStrokes(strokes, holes));
  return { teamA: holes.map((_, i) => Math.max(...maps.slice(0, size).map(m => m[i]))),
    teamB: holes.map((_, i) => Math.max(...maps.slice(size).map(m => m[i]))) };
}

/** Canonicalize only the sampling perspective, not the simulation mathematics.
 * The same physical matchup samples once in either UI perspective.
 */
export function simulateAdvisoryMatch({ playerIds, ...options }) {
  const size = formatCode(options.format) === "SI" ? 1 : 2;
  const a = playerIds.slice(0, size).sort().join("|"), b = playerIds.slice(size).sort().join("|");
  const reversed = a > b;
  const swap = values => ({ ...values, teamA: values.teamB, teamB: values.teamA });
  const prediction = reversed ? swap(options.prediction) : options.prediction;
  const strokeMaps = reversed ? swap(options.strokeMaps) : options.strokeMaps;
  const result = simulateMatch({ ...options, prediction, strokeMaps,
    teamNames: reversed ? [...options.teamNames].reverse() : options.teamNames,
    seed: JSON.stringify([options.seed, [a, b].sort(), prediction.teamA, prediction.tie, prediction.teamB, strokeMaps]),
  });
  if (!reversed) return result;
  return { ...result, winProbability: swap(result.winProbability), expectedPoints: swap(result.expectedPoints),
    segmentProbabilities: Object.fromEntries(Object.entries(result.segmentProbabilities).map(([key, values]) => [key, swap(values)])),
    likelyResults: result.likelyResults.map(row => ({ ...row, key: formatCode(options.format) === "SI"
      ? row.key.replace(/^teamA\|/, "REVERSE|").replace(/^teamB\|/, "teamA|").replace(/^REVERSE\|/, "teamB|")
      : String(result.maximumPoints - Number(row.key)) })),
  };
}
