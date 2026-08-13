import { calculateMatchPoints } from "./live-hole-scoring.js";
import { gameCenterDataFromSupabaseView, readGameCenterView } from "./game-center-supabase.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const valueOrBlank = (value) => value === null || value === undefined || value === "" ? "" : Number(value);
const truthy = (value) => typeof value === "boolean" ? value : /^(true|yes|1|active|locked)$/i.test(clean(value));
const statusName = (value) => clean(value).toUpperCase() === "FINAL" ? "Final"
  : clean(value).toUpperCase() === "LIVE" ? "Live" : "Upcoming";

function grossCell(value) {
  return Array.isArray(value) ? value.map(Number).join("/") : clean(value);
}

function playerFields(participants = [], side) {
  return Object.fromEntries(participants
    .filter((participant) => number(participant.team_side) === side)
    .sort((left, right) => number(left.player_slot) - number(right.player_slot))
    .flatMap((participant) => {
      const prefix = `Team ${side} Player ${number(participant.player_slot)}`;
      return [
        [prefix, clean(participant.player_id)],
        [`${prefix} Handicap Index`, valueOrBlank(participant.handicap_index)],
        [`${prefix} Course HCP`, valueOrBlank(participant.course_handicap)],
        [`${prefix} Playing HCP`, valueOrBlank(participant.playing_handicap)],
        [`${prefix} Stroke`, valueOrBlank(participant.final_strokes)],
      ];
    }));
}

function scoreRows(view = {}) {
  const holes = new Map((view.holes || []).map((hole) => [number(hole.hole_number), hole]));
  return (view.scores || []).map((score) => {
    const hole = holes.get(number(score.hole_number)) || {};
    return {
      "Hole Score ID": `${clean(score.match_id)}-H${number(score.hole_number)}`,
      "Match ID": clean(score.match_id),
      "Hole Number": number(score.hole_number),
      "Stroke Index": number(hole.stroke_index),
      Format: clean(view.match?.format),
      "Team 1 Gross Scores": grossCell(score.team_1_gross_scores),
      "Team 2 Gross Scores": grossCell(score.team_2_gross_scores),
      "Team 1 Strokes": score.team_1_strokes || [],
      "Team 2 Strokes": score.team_2_strokes || [],
      "Team 1 Net Score": number(score.team_1_net_score),
      "Team 2 Net Score": number(score.team_2_net_score),
      "Hole Winner": clean(score.hole_winner),
      Revision: number(score.hole_revision),
      "Updated At": clean(score.updated_at),
      "Updated By": clean(score.actor_id || "Authorized participant"),
    };
  }).sort((left, right) => number(left["Hole Number"]) - number(right["Hole Number"]));
}

export function scoringMatchDataFromSupabaseView(view = {}, {
  currentPlayerId = "",
  authorizationVerified = false,
  writable = false,
} = {}) {
  const base = gameCenterDataFromSupabaseView(view, currentPlayerId);
  const tournament = view.tournament || {};
  const round = view.round || {};
  const canonical = view.match || {};
  const snapshot = view.snapshot || {};
  const presentation = view.presentation || {};
  const teams = Object.fromEntries((view.teams || []).map((team) => [number(team.team_side), team]));
  const participants = view.participants || [];
  const scores = scoreRows(view);
  const holeResults = scores.map((score) => ({
    holeNumber: number(score["Hole Number"]),
    winner: clean(score["Hole Winner"]),
  }));
  const points = calculateMatchPoints(canonical.format, holeResults);
  const lifecycle = clean(canonical.status).toUpperCase();
  const status = statusName(lifecycle);
  const locked = canonical.scoring_locked === true;
  const scorecardComplete = canonical.scorecard_complete === true;
  const unresolvedMutations = number(canonical.unresolved_mutations);
  const matchRevision = number(canonical.match_revision);
  const permissionRevision = number(canonical.permission_revision, 1);
  const canWrite = Boolean(authorizationVerified && writable && lifecycle !== "FINAL" && !locked);
  const match = {
    ...base.match,
    "Match ID": clean(canonical.match_id),
    "Tournament ID": clean(canonical.tournament_id || tournament.tournament_id),
    Year: number(tournament.tournament_year),
    Round: number(canonical.round_number),
    Match: clean(presentation.display_match_number),
    "Match Name": `Match ${clean(presentation.display_match_number || canonical.match_id)}`,
    Format: clean(canonical.format || round.format),
    "Course ID": clean(snapshot.course_id),
    Tee: clean(snapshot.tee),
    "Tee Played": clean(snapshot.tee),
    "Course Rating": valueOrBlank(snapshot.rating),
    "Slope Rating": valueOrBlank(snapshot.slope),
    Par: valueOrBlank(snapshot.par),
    "Tee Time": clean(presentation.tee_time),
    "Starting Hole": clean(presentation.starting_hole),
    "Team 1 Team ID": clean(teams[1]?.team_id),
    "Team 2 Team ID": clean(teams[2]?.team_id),
    "Team 1 Playing HCP": valueOrBlank(snapshot.team_configuration?.team_1_playing_handicap),
    "Team 2 Playing HCP": valueOrBlank(snapshot.team_configuration?.team_2_playing_handicap),
    "Team 1 Stroke": valueOrBlank(snapshot.team_configuration?.team_1_strokes),
    "Team 2 Stroke": valueOrBlank(snapshot.team_configuration?.team_2_strokes),
    ...playerFields(participants, 1),
    ...playerFields(participants, 2),
    "Match Status": status,
    "Scoring Locked": locked,
    "Current Hole": number(canonical.current_hole),
    "Team 1 Holes Won": number(canonical.team_1_holes_won),
    "Team 2 Holes Won": number(canonical.team_2_holes_won),
    "Holes Remaining": number(canonical.holes_remaining, 18),
    "Match Status Text": clean(canonical.running_result),
    "Front 9 Winner": clean(points.frontWinner),
    "Back 9 Winner": clean(points.backWinner),
    "18-Hole Winner": clean(canonical.result_winner || points.overallWinner),
    "Matchup Winner": clean(canonical.result_winner || points.overallWinner),
    "Team 1 Points": points.team1Points,
    "Team 2 Points": points.team2Points,
    "Scorecard Complete": scorecardComplete,
    "Unresolved Mutations": unresolvedMutations,
    "Finalized At": clean(canonical.finalized_at),
    "Updated At": clean(canonical.authority_updated_at || canonical.updated_at),
    "Updated By": "Supabase scoring authority",
    Revision: matchRevision,
    matchRevision,
    permissionRevision,
  };
  const courseHoles = (view.holes || []).map((hole) => ({
    "Course ID": clean(snapshot.course_id),
    Tee: clean(snapshot.tee),
    "Hole Number": number(hole.hole_number),
    "Stroke Index": number(hole.stroke_index),
    Par: number(hole.par),
    Yardage: hole.yardage == null ? "" : number(hole.yardage),
  })).sort((left, right) => number(left["Hole Number"]) - number(right["Hole Number"]));
  return {
    ...base,
    tournament: base.tournament,
    match,
    courseHoles,
    holeScores: scores,
    canConfirm: scorecardComplete && scores.length === 18 && unresolvedMutations === 0 && canWrite,
    authority: {
      source: "supabase",
      authorizationVerified: Boolean(authorizationVerified),
      writable: canWrite,
      matchRevision,
      permissionRevision,
      status: lifecycle,
      scoringLocked: locked,
      scorecardComplete,
      unresolvedMutations,
      scoringSnapshotId: clean(canonical.scoring_snapshot_id),
      scoringSnapshotRevision: number(snapshot.snapshot_revision),
      scoringSnapshotFingerprint: clean(snapshot.canonical_hash),
    },
  };
}

export async function readScoringMatchView(matchId, options = {}) {
  const readView = options.readView || readGameCenterView;
  const startedAt = performance.now();
  const read = await readView(clean(matchId), options.rpcOptions || {});
  if (!read.payload?.ok || !read.payload?.data?.match) {
    const error = new Error("Authoritative scoring state is temporarily unavailable.");
    error.code = read.payload?.code || "SCORING_VIEW_UNAVAILABLE";
    error.status = error.code === "MATCH_NOT_FOUND" ? 404 : 503;
    throw error;
  }
  const adapterStartedAt = performance.now();
  const data = scoringMatchDataFromSupabaseView(read.payload.data, options);
  return {
    data,
    diagnostics: {
      source: "supabase",
      postgresQueryMs: number(read.payload.data.query_ms),
      supabaseRequestMs: number(read.durationMs),
      adapterMs: Math.max(0, performance.now() - adapterStartedAt),
      totalMs: Math.max(0, performance.now() - startedAt),
      googleRequests: 0,
      googleRanges: 0,
    },
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function scoringReadParityProjection(data = {}) {
  const match = data.match || {};
  return stable({
    match: {
      id: match["Match ID"], tournamentId: match["Tournament ID"], year: number(match.Year),
      round: number(match.Round), match: clean(match.Match), format: clean(match.Format),
      courseId: clean(match["Course ID"]), tee: clean(match.Tee || match["Tee Played"]),
      status: clean(match["Match Status"]), scoringLocked: truthy(match["Scoring Locked"]),
      currentHole: number(match["Current Hole"]), holesRemaining: number(match["Holes Remaining"], 18),
      team1HolesWon: number(match["Team 1 Holes Won"]), team2HolesWon: number(match["Team 2 Holes Won"]),
      statusText: clean(match["Match Status Text"]), matchupWinner: clean(match["Matchup Winner"]),
      revision: number(match.Revision || match.matchRevision),
      teamIds: [clean(match["Team 1 Team ID"]), clean(match["Team 2 Team ID"])],
      participants: [1, 2].flatMap((side) => [1, 2].map((slot) => ({
        side, slot, id: clean(match[`Team ${side} Player ${slot}`]),
        handicapIndex: valueOrBlank(match[`Team ${side} Player ${slot} Handicap Index`]),
        courseHcp: valueOrBlank(match[`Team ${side} Player ${slot} Course HCP`]),
        playingHcp: valueOrBlank(match[`Team ${side} Player ${slot} Playing HCP`]),
        strokes: valueOrBlank(match[`Team ${side} Player ${slot} Stroke`]),
      })).filter((player) => player.id)),
    },
    display: data.display,
    courseHoles: (data.courseHoles || []).map((hole) => ({
      number: number(hole["Hole Number"]), par: number(hole.Par), strokeIndex: number(hole["Stroke Index"]),
      yardage: valueOrBlank(hole.Yardage),
    })),
    holeScores: (data.holeScores || []).map((score) => ({
      number: number(score["Hole Number"]), team1Gross: grossCell(score["Team 1 Gross Scores"]),
      team2Gross: grossCell(score["Team 2 Gross Scores"]), team1Strokes: score["Team 1 Strokes"] || [],
      team2Strokes: score["Team 2 Strokes"] || [], team1Net: number(score["Team 1 Net Score"]),
      team2Net: number(score["Team 2 Net Score"]), winner: clean(score["Hole Winner"]), revision: number(score.Revision),
    })),
    canConfirm: Boolean(data.canConfirm),
  });
}

export function compareScoringReadParity(expected, actual) {
  const left = scoringReadParityProjection(expected);
  const right = scoringReadParityProjection(actual);
  return { pass: JSON.stringify(left) === JSON.stringify(right), expected: left, actual: right };
}
