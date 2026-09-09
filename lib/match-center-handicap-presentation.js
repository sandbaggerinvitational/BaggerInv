import { buildAdvisoryCourseProjections, completeAdvisoryHoles } from "./advisory-match-simulation.js";
import { courseHandicap, playingHandicaps } from "./prediction-engine.js";

const list = value => Array.isArray(value) ? value : [];
const clean = value => String(value ?? "").trim();
const numeric = value => value == null || clean(value) === "" ? NaN : Number(value);
const unavailable = () => ({ team1PlayingHcp: null, team2PlayingHcp: null,
  team1Stroke: null, team2Stroke: null, handicapPresentation: "UNAVAILABLE" });
const fields = (a, b, sa, sb, source) => ({ team1PlayingHcp: a, team2PlayingHcp: b,
  team1Stroke: sa, team2Stroke: sb, handicapPresentation: source });

function strictlyUnstarted(entry) {
  const m = entry.match;
  return m.status === "UPCOMING" && m.scoring_locked === false && m.scored_holes === 0 &&
    m.unresolved_mutations === 0 && numeric(m.current_hole) === 0 &&
    !m.finalized_at && !m.scorecard_complete && !m.clinched && !clean(m.result_winner) &&
    [m.team_1_points, m.team_2_points, m.team_1_holes_won, m.team_2_holes_won]
      .every(value => numeric(value ?? 0) === 0) && list(entry.scores).length === 0;
}

/** Read-only, opt-in Match Center projection. Never persisted or used to score.
 * The existing SQL-parity helpers own the math; this layer validates provenance
 * and completeness. Legacy display zeros are not authoritative team handicaps.
 */
export function matchCenterScrambleHandicaps(view = {}) {
  const result = new Map();
  const roster = new Map(list(view.players).map(player => [player.player_id, player]));
  const duplicateRoster = roster.size !== list(view.players).length;
  const courses = new Map(buildAdvisoryCourseProjections(view).map(course =>
    [JSON.stringify([course.round, course.courseId, course.tee]), course]));
  for (const entry of list(view.matches)) {
    const m = entry.match || {}, s = entry.snapshot || {};
    if (m.format !== "SC") continue;
    result.set(m.match_id, unavailable());
    const participants = [...list(entry.participants)].sort((a, b) =>
      a.team_side - b.team_side || a.player_slot - b.player_slot);
    if (m.tournament_id !== view.tournament?.tournament_id || s.format !== "SC" ||
        !clean(s.snapshot_id) || m.scoring_snapshot_id !== s.snapshot_id ||
        participants.length !== 4 || new Set(participants.map(p => p.player_id)).size !== 4 ||
        participants.some((p, i) => numeric(p.team_side) !== Math.floor(i / 2) + 1 || numeric(p.player_slot) !== i % 2 + 1)) continue;

    const pc = s.participant_configuration || {}, tc = s.team_configuration || {};
    const hasFrozenContext = list(pc.all_ids).length > 0 || list(pc.team_1).length > 0 ||
      list(pc.team_2).length > 0 || Boolean(tc.handicap_context_contract || pc.handicap_context_contract) ||
      tc.team_1_playing_handicap != null || tc.team_2_playing_handicap != null;
    if (hasFrozenContext) {
      // A prepared/started match retains its snapshot, never today's handicap.
      const frozen = [...list(pc.team_1), ...list(pc.team_2)];
      const values = [tc.team_1_playing_handicap, tc.team_2_playing_handicap,
        tc.team_1_strokes, tc.team_2_strokes].map(numeric);
      if (frozen.length === 4 && list(pc.all_ids).length === 4 &&
          participants.every((p, i) => frozen[i].id === p.player_id && pc.all_ids[i] === p.player_id &&
            numeric(frozen[i].team) === numeric(p.team_side) && numeric(frozen[i].slot) === numeric(p.player_slot)) &&
          values.every(Number.isInteger) && values[2] >= 0 && values[3] >= 0) {
        result.set(m.match_id, fields(...values, "SCORING_SNAPSHOT"));
      }
      continue;
    }
    if (!strictlyUnstarted(entry) || duplicateRoster) continue;
    const course = courses.get(JSON.stringify([numeric(m.round_number), clean(s.course_id), clean(s.tee)]));
    if (course?.state !== "READY" || completeAdvisoryHoles(entry.holes, s.par).length !== 18) continue;
    const exact = [];
    for (const p of participants) {
      const player = roster.get(p.player_id);
      const team = list(view.teams).filter(t => numeric(t.team_side) === numeric(p.team_side));
      const approved = numeric(player?.tournament_source_payload?.["Tournament Handicap"]);
      // Approval atomically updates this canonical membership projection and
      // unstarted match participants. A disagreement is unavailable, not guessed.
      if (player?.participation_status !== "ACTIVE" || numeric(player.team_side) !== numeric(p.team_side) ||
          team.length !== 1 || !clean(player.team_id) || player.team_id !== team[0].team_id ||
          !Number.isFinite(approved) || approved !== numeric(p.handicap_index)) break;
      const ch = courseHandicap(approved, course.rating, course.slope, course.par);
      if (!Number.isFinite(numeric(p.course_handicap)) || Math.abs(ch - numeric(p.course_handicap)) > 1e-8) break;
      exact.push(ch);
    }
    if (exact.length !== 4) continue;
    const play = playingHandicaps("SC", exact);
    result.set(m.match_id, fields(play.teamA, play.teamB, play.strokesA, play.strokesB, "PRESTART_READ_ONLY"));
  }
  return result;
}
