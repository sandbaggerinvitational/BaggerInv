import { buildAdvisoryCourseProjections, completeAdvisoryHoles } from "./advisory-match-simulation.js";
import { courseHandicap } from "./prediction-engine.js";

const list = value => Array.isArray(value) ? value : [];
const number = value => value == null || String(value).trim() === "" ? NaN : Number(value);
const unstarted = entry => {
  const m=entry.match || {};
  return m.status === "UPCOMING" && m.scoring_locked === false && m.scored_holes === 0 &&
    m.unresolved_mutations === 0 && number(m.current_hole) === 0 && !list(entry.scores).length &&
    !m.finalized_at && !m.scorecard_complete && !m.clinched && !m.result_winner &&
    [m.team_1_points,m.team_2_points,m.team_1_holes_won,m.team_2_holes_won].every(v=>number(v??0)===0);
};

/** Presentation only: legacy PWA "Playing HCP" actually displayed full Course
 * Handicap to one decimal, before integer PH rounding and without an allowance.
 * Copy the validated canonical Course Handicap; never replace playingHcp/stroke.
 * Default/native/scoring DTOs do not opt into this projection.
 */
export function matchCenterPlayerHandicapDisplays(view = {}) {
  const result = new Map();
  const roster = new Map(list(view.players).map(p => [p.player_id, p]));
  // Complete retained course definitions may supply an empty, strictly
  // unstarted active-hole array. Compare both when present; never repair data.
  const courseEvidence = list(view.matches).flatMap(e => [e,
    ...(list(e.snapshot?.hole_definitions).length ? [{...e,holes:e.snapshot.hole_definitions}] : [])]);
  const courses = new Map(buildAdvisoryCourseProjections({...view,matches:courseEvidence}).map(c =>
    [JSON.stringify([c.round, c.courseId, c.tee]), c]));
  for (const entry of list(view.matches)) {
    const m = entry.match || {}, s = entry.snapshot || {};
    if (!["BB", "SI"].includes(m.format)) continue;
    const displays = new Map();
    result.set(m.match_id, displays);
    const size = m.format === "BB" ? 2 : 1;
    const participants = [...list(entry.participants)].sort((a, b) =>
      number(a.team_side) - number(b.team_side) || number(a.player_slot) - number(b.player_slot));
    const course = courses.get(JSON.stringify([number(m.round_number), s.course_id, s.tee]));
    if (m.tournament_id !== view.tournament?.tournament_id || s.format !== m.format ||
        !s.snapshot_id || s.snapshot_id !== m.scoring_snapshot_id ||
        participants.length !== size * 2 || new Set(participants.map(p => p.player_id)).size !== size * 2 ||
        participants.some((p, i) => number(p.team_side) !== Math.floor(i / size) + 1 || number(p.player_slot) !== i % size + 1) ||
        course?.state !== "READY" ||
        (list(entry.holes).length ? completeAdvisoryHoles(entry.holes, s.par).length !== 18 : !unstarted(entry))) continue;
    const pc = s.participant_configuration || {}, tc = s.team_configuration || {};
    const frozen = [...list(pc.team_1), ...list(pc.team_2)];
    const hasFrozen = Boolean(s.handicap_revision_id) ||
      Boolean(pc.handicap_context_contract || tc.handicap_context_contract);
    if (hasFrozen) {
      // Never recompute a prepared/started match from today's approved handicap.
      if (frozen.length !== participants.length || list(pc.all_ids).length !== participants.length ||
          participants.some((p, i) => frozen[i].id !== p.player_id || pc.all_ids[i] !== p.player_id ||
            number(frozen[i].team) !== number(p.team_side) || number(frozen[i].slot) !== number(p.player_slot) ||
            !Number.isFinite(number(p.course_handicap)) ||
            number(frozen[i].course_handicap) !== number(p.course_handicap))) continue;
    } else {
      // Legacy import snapshots can retain obsolete partial participant lists.
      // They are not prepared handicap contexts (no bound revision/contract).
      if (!unstarted(entry) || roster.size !== list(view.players).length) continue;
      if (participants.some(p => {
        const player = roster.get(p.player_id);
        const teams = list(view.teams).filter(t => number(t.team_side) === number(p.team_side));
        const approved = number(player?.tournament_source_payload?.["Tournament Handicap"]);
        return player?.participation_status !== "ACTIVE" || number(player.team_side) !== number(p.team_side) ||
          teams.length !== 1 || !player.team_id || player.team_id !== teams[0].team_id ||
          !Number.isFinite(approved) || approved !== number(p.handicap_index) ||
          !Number.isFinite(number(p.course_handicap)) ||
          Math.abs(courseHandicap(approved, course.rating, course.slope, course.par) - number(p.course_handicap)) > 1e-8;
      })) continue;
    }
    for (const p of participants) displays.set(p.player_id, number(p.course_handicap));
  }
  return result;
}

export function withMatchCenterDisplayHandicaps(match, displays) {
  if (!displays) return match; // SC and legacy/default readers remain untouched.
  const players = side => list(side).map(p => ({ ...p, displayHandicap: displays.get(p.id) ?? null }));
  return { ...match, team1Players: players(match.team1Players), team2Players: players(match.team2Players) };
}
