import { calculateMatchPoints } from "./live-hole-scoring.js";
import { gameCenterHoles, gameCenterNavigation, gameCenterPoints, gameCenterState, gameCenterStats, liveMatchResult } from "./game-center.js";
import { scoringShadowRpc } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => typeof value === "boolean" ? value : /^(true|yes|1|active|open)$/i.test(clean(value));
const formatName = (value) => ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[clean(value).toUpperCase()] || clean(value);
const statusName = (value) => clean(value).toUpperCase() === "FINAL" ? "Final" : clean(value).toUpperCase() === "LIVE" ? "Live" : "Scheduled";

export async function readGameCenterView(matchId, options = {}) {
  return scoringShadowRpc("read_game_center_view", {
    target_match_id: clean(matchId),
    target_tournament_id: clean(options.tournamentId),
  }, {
    ...options,
    timeoutMs: options.timeoutMs || 8_000,
  });
}

export async function replaceGameCenterPresentations(input, options = {}) {
  return scoringShadowRpc("replace_preview_game_center_presentations", { input }, {
    ...options,
    timeoutMs: options.timeoutMs || 15_000,
  });
}

function rowRecords(sheet) {
  return (sheet?.records || []).map(({ record }) => record);
}

export function buildGameCenterPresentationImport({ sheets = {}, sourceWorkbookId, requestedBy = "Game Center presentation refresh" } = {}) {
  const matches = rowRecords(sheets["Live Matches"]);
  const tournaments = rowRecords(sheets.Tournaments);
  const teams = rowRecords(sheets["Team Names"] || sheets.Teams);
  const courses = rowRecords(sheets.Courses);
  if (!matches.length) throw new Error("The Preview workbook has no Live Matches for Game Center presentation import.");
  const tournamentYear = number(matches[0].Year);
  const tournamentId = clean(matches[0]["Tournament ID"] || tournamentYear);
  const tournament = tournaments.find((row) =>
    clean(row["Tournament ID"]) === tournamentId || number(row.Year) === tournamentYear
  ) || {};
  const teamFor = (side) => teams.find((row) =>
    number(row.Year) === tournamentYear && number(clean(row["Team Side"]).replace(/\D/g, "")) === side
  ) || {};
  const teamOne = teamFor(1);
  const teamTwo = teamFor(2);
  const courseById = new Map(courses.map((row) => [clean(row["Course ID"]), row]));
  const rows = matches.map((match, index) => {
    const course = courseById.get(clean(match["Course ID"])) || {};
    const displayMatchNumber = clean(match.Match || match["Match Number"]);
    return {
      match_id: clean(match["Match ID"]),
      tournament_id: tournamentId,
      course_name: clean(course["Course Name"] || course.Course || match.Course || match["Course ID"]),
      course_logo: clean(course["Course Logo"] || course["Logo Filename"]),
      course_yardage: clean(course.Yardage || course["Total Yardage"]),
      tee_time: clean(match["Tee Time"]),
      starting_hole: clean(match["Starting Hole"]),
      display_match_number: displayMatchNumber,
      match_sort_order: number(displayMatchNumber, index + 1),
      team_1_logo: clean(teamOne["Team Logo"] || teamOne["Logo Filename"]),
      team_1_primary_color: clean(teamOne["Primary Color"]),
      team_1_secondary_color: clean(teamOne["Secondary Color"]),
      team_2_logo: clean(teamTwo["Team Logo"] || teamTwo["Logo Filename"]),
      team_2_primary_color: clean(teamTwo["Primary Color"]),
      team_2_secondary_color: clean(teamTwo["Secondary Color"]),
      tournament_location: clean(tournament.Destination || tournament.Location),
      tournament_logo: clean(tournament["Tournament Logo Filename"] || tournament["Logo Filename"]),
      tournament_status: clean(tournament["Tournament Status"] || "Live"),
      tournament_time_zone: clean(tournament["Time Zone"] || tournament.Timezone || "America/Chicago"),
      source_updated_at: clean(match["Updated At"]),
    };
  });
  if (rows.some((row) => !row.match_id)) throw new Error("Every Game Center presentation row requires a stable Match ID.");
  if (new Set(rows.map((row) => row.match_id)).size !== rows.length) throw new Error("Game Center presentation import contains duplicate Match IDs.");
  return {
    environment: "PREVIEW",
    source_workbook_id: clean(sourceWorkbookId),
    requested_by: clean(requestedBy),
    tournament_id: tournamentId,
    rows,
  };
}

export function expectedGameCenterView(authorityImport = {}, presentationImport = {}, matchId = "") {
  const payload = authorityImport.payload || authorityImport;
  const id = clean(matchId);
  const match = (payload.matches || []).find((row) => row.match_id === id);
  if (!match) return null;
  const snapshot = (payload.snapshots || []).find((row) => row.snapshot_id === match.scoring_snapshot_id) || {};
  const presentations = presentationImport.rows || [];
  const presentation = presentations.find((row) => row.match_id === id) || {};
  const players = new Map((payload.players || []).map((row) => [row.player_id, row]));
  const ordered = (payload.matches || []).map((row) => ({
    ...row,
    presentation: presentations.find((item) => item.match_id === row.match_id) || {},
  })).sort((left, right) => number(left.round_number) - number(right.round_number) ||
    number(left.presentation.match_sort_order) - number(right.presentation.match_sort_order) || left.match_id.localeCompare(right.match_id));
  const index = ordered.findIndex((row) => row.match_id === id);
  const roundMatches = ordered.filter((row) => number(row.round_number) === number(match.round_number));
  const roundIndex = roundMatches.findIndex((row) => row.match_id === id);
  const destination = (row) => row ? ({ id: row.match_id,
    label: `Round ${row.round_number}, Match ${row.presentation.display_match_number}` }) : null;
  return {
    tournament: payload.tournament,
    round: (payload.rounds || []).find((row) => number(row.round_number) === number(match.round_number)) || {},
    match,
    snapshot,
    teams: payload.teams || [],
    participants: (payload.match_participants || []).filter((row) => row.match_id === id).map((row) => ({
      ...row, display_name: players.get(row.player_id)?.display_name || row.player_id,
    })),
    permissions: (payload.permissions || []).filter((row) => row.match_id === id),
    holes: (payload.match_holes || []).filter((row) => row.match_id === id),
    scores: (payload.hole_scores || []).filter((row) => row.match_id === id),
    presentation,
    navigation: {
      previous: destination(ordered[index - 1]),
      next: destination(ordered[index + 1]),
      position: { round: number(match.round_number), index: roundIndex + 1, total: roundMatches.length },
    },
    query_ms: 0,
  };
}

function playerView(row = {}) {
  return {
    id: clean(row.player_id),
    name: clean(row.display_name || row.player_id),
    playingHcp: row.playing_handicap == null ? null : number(row.playing_handicap),
    stroke: row.final_strokes == null ? null : number(row.final_strokes),
    slot: number(row.player_slot),
  };
}

function grossCell(value) {
  return Array.isArray(value) ? value.map(Number).join("/") : clean(value);
}

export function gameCenterDataFromSupabaseView(view = {}, currentPlayerId = "") {
  const tournamentRow = view.tournament || {};
  const matchRow = view.match || {};
  const snapshot = view.snapshot || {};
  const presentation = view.presentation || {};
  const teams = Object.fromEntries((view.teams || []).map((team) => [number(team.team_side), team]));
  const participants = view.participants || [];
  const permissions = view.permissions || [];
  const scores = (view.scores || []).map((score) => ({
    "Match ID": score.match_id,
    "Hole Number": number(score.hole_number),
    "Team 1 Gross Scores": grossCell(score.team_1_gross_scores),
    "Team 2 Gross Scores": grossCell(score.team_2_gross_scores),
    "Team 1 Strokes": score.team_1_strokes,
    "Team 2 Strokes": score.team_2_strokes,
    "Team 1 Net Score": number(score.team_1_net_score),
    "Team 2 Net Score": number(score.team_2_net_score),
    "Hole Winner": clean(score.hole_winner),
    "Updated At": clean(score.updated_at),
    Revision: number(score.hole_revision),
  }));
  const courseHoles = (view.holes || []).map((hole) => ({
    "Hole Number": number(hole.hole_number),
    "Stroke Index": number(hole.stroke_index),
    Par: number(hole.par),
    Yardage: hole.yardage == null ? "" : number(hole.yardage),
  }));
  const teamNames = { 1: clean(teams[1]?.name || "Team 1"), 2: clean(teams[2]?.name || "Team 2") };
  const holeResults = scores.map((score) => ({ holeNumber: number(score["Hole Number"]), winner: clean(score["Hole Winner"]) }));
  const points = calculateMatchPoints(matchRow.format, holeResults);
  const participantSide = (playerId) => number(participants.find((player) => clean(player.player_id) === clean(playerId))?.team_side);
  const status = statusName(matchRow.status);
  const teamPlayers = (side) => participants.filter((player) => number(player.team_side) === side)
    .sort((left, right) => number(left.player_slot) - number(right.player_slot)).map(playerView);
  const playerNames = Object.fromEntries(participants.map((player) => [clean(player.player_id), clean(player.display_name || player.player_id)]));
  const tournament = {
    id: clean(tournamentRow.tournament_id),
    year: number(tournamentRow.tournament_year),
    name: clean(tournamentRow.name),
    location: clean(presentation.tournament_location),
    logo: clean(presentation.tournament_logo),
    status: clean(presentation.tournament_status || "Live"),
    timeZone: clean(presentation.tournament_time_zone || "America/Chicago"),
    teamOne: { id: clean(teams[1]?.team_id), name: teamNames[1], logo: clean(presentation.team_1_logo), primaryColor: clean(presentation.team_1_primary_color), secondaryColor: clean(presentation.team_1_secondary_color) },
    teamTwo: { id: clean(teams[2]?.team_id), name: teamNames[2], logo: clean(presentation.team_2_logo), primaryColor: clean(presentation.team_2_primary_color), secondaryColor: clean(presentation.team_2_secondary_color) },
  };
  const match = {
    id: clean(matchRow.match_id),
    round: number(matchRow.round_number),
    match: clean(presentation.display_match_number),
    format: clean(matchRow.format),
    Format: clean(matchRow.format),
    formatName: formatName(matchRow.format),
    course: { id: clean(snapshot.course_id), name: clean(presentation.course_name || snapshot.course_id), logo: clean(presentation.course_logo), tee: clean(snapshot.tee) },
    teeTime: clean(presentation.tee_time),
    startingHole: clean(presentation.starting_hole),
    status,
    "Match Status": status,
    scoringLocked: truthy(matchRow.scoring_locked),
    scoringEnabled: !truthy(matchRow.scoring_locked) && clean(matchRow.status).toUpperCase() !== "FINAL",
    currentHole: number(matchRow.current_hole),
    scoredHoles: number(matchRow.scored_holes),
    holesRemaining: number(matchRow.holes_remaining),
    team1HolesWon: number(matchRow.team_1_holes_won),
    team2HolesWon: number(matchRow.team_2_holes_won),
    liveStatusText: clean(matchRow.running_result),
    matchupWinner: clean(matchRow.result_winner || points.overallWinner),
    frontWinner: clean(points.frontWinner),
    backWinner: clean(points.backWinner),
    overallWinner: clean(points.overallWinner),
    team1Points: number(points.team1Points),
    team2Points: number(points.team2Points),
    team1Players: teamPlayers(1),
    team2Players: teamPlayers(2),
    team1PlayingHcp: snapshot.team_configuration?.team_1_playing_handicap ?? null,
    team2PlayingHcp: snapshot.team_configuration?.team_2_playing_handicap ?? null,
    team1Stroke: snapshot.team_configuration?.team_1_strokes ?? null,
    team2Stroke: snapshot.team_configuration?.team_2_strokes ?? null,
    finalizedAt: clean(matchRow.finalized_at),
    updatedAt: clean(matchRow.updated_at || matchRow.authority_updated_at),
    matchRevision: number(matchRow.match_revision),
  };
  const display = {
    courseName: match.course.name,
    formatName: match.formatName,
    matchName: `Match ${match.match || match.id}`,
    teamNames,
    teams: {
      1: { name: teamNames[1], logo: presentation.team_1_logo || "" },
      2: { name: teamNames[2], logo: presentation.team_2_logo || "" },
    },
    course: {
      name: match.course.name,
      logo: clean(presentation.course_logo),
      tee: clean(snapshot.tee),
      yardage: clean(presentation.course_yardage),
      par: snapshot.par == null ? "" : clean(snapshot.par),
      rating: snapshot.rating == null ? "" : clean(snapshot.rating),
      slope: snapshot.slope == null ? "" : clean(snapshot.slope),
    },
    playerNames,
  };
  const rounds = view.navigation?.rounds || [];
  const normalizedHoles = gameCenterHoles(scores, courseHoles);
  const pointsView = gameCenterPoints(match, scores);
  return {
    tournament,
    match,
    display,
    holeScores: scores,
    courseHoles,
    holes: normalizedHoles,
    points: pointsView,
    stats: gameCenterStats(normalizedHoles),
    state: gameCenterState(match, scores),
    result: liveMatchResult(match, scores, teamNames),
    permissions,
    navigation: view.navigation?.previous !== undefined ? view.navigation : gameCenterNavigation(rounds, match.id),
    canConfirm: clean(matchRow.status).toUpperCase() !== "FINAL" && number(matchRow.scored_holes) === 18,
    queryMs: number(view.query_ms),
    participantSide: participantSide(currentPlayerId),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function gameCenterParityProjection(data = {}) {
  return stable({
    tournament: {
      id: data.tournament?.id, year: data.tournament?.year, name: data.tournament?.name,
      location: data.tournament?.location, logo: data.tournament?.logo,
    },
    match: {
      id: data.match?.id, round: data.match?.round, match: data.match?.match, format: data.match?.format,
      status: data.match?.status, scoringLocked: data.match?.scoringLocked,
      currentHole: data.match?.currentHole, scoredHoles: data.match?.scoredHoles,
      holesRemaining: data.match?.holesRemaining, runningResult: data.match?.liveStatusText,
      finalResult: data.result, scorecardComplete: data.stats?.played === 18,
      team1Players: data.match?.team1Players, team2Players: data.match?.team2Players,
    },
    teams: data.display?.teams,
    course: data.display?.course,
    holes: (data.holes || []).map((hole) => ({
      number: hole.number, gross1: hole.team1Gross, gross2: hole.team2Gross,
      strokes1: hole.team1Strokes, strokes2: hole.team2Strokes,
      net1: hole.team1Net, net2: hole.team2Net, winner: hole.winner,
      par: hole.par, yardage: hole.yardage, strokeIndex: hole.strokeIndex,
    })),
    points: data.points,
    permissions: (data.permissions || []).map((permission) => ({
      playerId: permission.player_id, canScore: permission.can_score,
      permissionRevision: number(permission.permission_revision),
    })).sort((left, right) => left.playerId.localeCompare(right.playerId)),
    navigation: data.navigation,
  });
}

export function compareGameCenterParity(expected, actual) {
  const left = JSON.stringify(gameCenterParityProjection(expected));
  const right = JSON.stringify(gameCenterParityProjection(actual));
  return { pass: left === right, expected: left === right ? undefined : JSON.parse(left), actual: left === right ? undefined : JSON.parse(right) };
}
