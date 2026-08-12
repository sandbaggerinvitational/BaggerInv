import { finalizedMatchResult } from "./match-result.js";
import { calculateMatchPoints } from "./live-hole-scoring.js";
import { scoringShadowRpc } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const formatName = (value) => ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[clean(value).toUpperCase()] || clean(value);
const statusName = (value) => clean(value).toUpperCase() === "FINAL" ? "Final"
  : clean(value).toUpperCase() === "LIVE" ? "Live" : "Scheduled";

export async function readMyMatchView({ tournamentId, playerId }, options = {}) {
  return scoringShadowRpc("read_my_match_view", {
    target_tournament_id: clean(tournamentId),
    target_player_id: clean(playerId),
  }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

export function expectedMyMatchView(authorityImport = {}, presentationImport = {}, playerIdValue = "") {
  const payload = authorityImport.payload || authorityImport;
  const playerId = clean(playerIdValue);
  const tournament = payload.tournament || {};
  const tournamentPlayer = (payload.tournament_players || []).find((row) =>
    row.tournament_id === tournament.tournament_id && row.player_id === playerId
  );
  if (!tournamentPlayer) return null;
  const participants = payload.match_participants || [];
  const matchIds = new Set(participants.filter((row) => row.player_id === playerId).map((row) => row.match_id));
  const presentations = presentationImport.rows || [];
  const players = new Map((payload.players || []).map((row) => [row.player_id, row]));
  const matches = (payload.matches || []).filter((row) => matchIds.has(row.match_id)).map((match) => ({
    match,
    round: (payload.rounds || []).find((row) => number(row.round_number) === number(match.round_number)) || {},
    snapshot: (payload.snapshots || []).find((row) => row.snapshot_id === match.scoring_snapshot_id) || {},
    presentation: presentations.find((row) => row.match_id === match.match_id) || {},
    participants: participants.filter((row) => row.match_id === match.match_id).map((row) => ({
      ...row,
      display_name: players.get(row.player_id)?.display_name || row.player_id,
    })),
    permission: (payload.permissions || []).find((row) => row.match_id === match.match_id && row.player_id === playerId) || null,
    scores: (payload.hole_scores || []).filter((row) => row.match_id === match.match_id),
  }));
  const nonFinalRounds = (payload.matches || []).filter((row) => clean(row.status).toUpperCase() !== "FINAL")
    .map((row) => number(row.round_number));
  return {
    tournament,
    player: players.get(playerId) || { player_id: playerId, display_name: playerId },
    tournament_player: tournamentPlayer,
    team: (payload.teams || []).find((row) => row.team_id === tournamentPlayer.team_id) || {},
    teams: payload.teams || [],
    current_round: nonFinalRounds.length ? Math.max(...nonFinalRounds) : Math.max(0, ...(payload.rounds || []).map((row) => number(row.round_number))),
    context_revision: number(authorityImport.contextRevision),
    matches,
    query_ms: 0,
  };
}

function scoreRows(rows = []) {
  return rows.map((score) => ({
    "Hole Number": number(score.hole_number),
    "Team 1 Gross Scores": Array.isArray(score.team_1_gross_scores) ? score.team_1_gross_scores.join("/") : clean(score.team_1_gross_scores),
    "Team 2 Gross Scores": Array.isArray(score.team_2_gross_scores) ? score.team_2_gross_scores.join("/") : clean(score.team_2_gross_scores),
    "Team 1 Strokes": score.team_1_strokes,
    "Team 2 Strokes": score.team_2_strokes,
    "Team 1 Net Score": number(score.team_1_net_score),
    "Team 2 Net Score": number(score.team_2_net_score),
    "Hole Winner": clean(score.hole_winner),
    Revision: number(score.hole_revision),
  })).sort((left, right) => left["Hole Number"] - right["Hole Number"]);
}

export function myMatchDataFromSupabaseView(view = {}) {
  const tournamentRow = view.tournament || {};
  const playerRow = view.player || {};
  const tournamentPlayer = view.tournament_player || {};
  const teams = new Map((view.teams || []).map((team) => [number(team.team_side), team]));
  const playerSide = number(tournamentPlayer.team_side);
  const playerTeam = teams.get(playerSide) || view.team || {};
  const matches = (view.matches || []).map((entry) => {
    const match = entry.match || {};
    const presentation = entry.presentation || {};
    const snapshot = entry.snapshot || {};
    const participants = entry.participants || [];
    const permission = entry.permission || {};
    const ownSide = number(participants.find((row) => clean(row.player_id) === clean(playerRow.player_id))?.team_side, playerSide);
    const opponentSide = ownSide === 1 ? 2 : 1;
    const ownTeam = teams.get(ownSide) || {};
    const opponentTeam = teams.get(opponentSide) || {};
    const teamLogo = (side) => clean(side === 1 ? presentation.team_1_logo : presentation.team_2_logo);
    const names = (side) => participants.filter((row) => number(row.team_side) === side)
      .sort((left, right) => number(left.player_slot) - number(right.player_slot))
      .map((row) => clean(row.display_name || row.player_id));
    const scores = scoreRows(entry.scores);
    const holeResults = scores.map((row) => ({ holeNumber: row["Hole Number"], winner: row["Hole Winner"] }));
    const points = calculateMatchPoints(match.format, holeResults);
    const teamNames = { 1: clean(teams.get(1)?.name || "Team 1"), 2: clean(teams.get(2)?.name || "Team 2") };
    const final = clean(match.status).toUpperCase() === "FINAL";
    const winnerSide = clean(match.result_winner || points.overallWinner);
    const winner = /halved|tie/i.test(winnerSide) ? "Halved"
      : winnerSide === "Team 1" ? teamNames[1]
      : winnerSide === "Team 2" ? teamNames[2]
      : number(points.team1Points) === number(points.team2Points) ? "Halved"
      : number(points.team1Points) > number(points.team2Points) ? teamNames[1] : teamNames[2];
    const canScore = permission.can_score === true && match.scoring_locked !== true && !final;
    const result = final ? {
      label: winner === "Halved" ? `Match halved ${number(points.team1Points)}–${number(points.team2Points)}`
        : `${winner} win ${number(points.team1Points)}–${number(points.team2Points)}`,
      officialResult: finalizedMatchResult({ status: "Final", liveStatusText: match.running_result,
        overallWinner: match.result_winner, team1Points: points.team1Points, team2Points: points.team2Points }, scores, teamNames),
      winner,
      statusText: clean(match.running_result),
      teamOnePoints: number(points.team1Points),
      teamTwoPoints: number(points.team2Points),
      teamOneHoles: number(match.team_1_holes_won),
      teamTwoHoles: number(match.team_2_holes_won),
      playerPoints: ownSide === 1 ? number(points.team1Points) : number(points.team2Points),
    } : null;
    return {
      selector: "",
      matchId: clean(match.match_id),
      round: number(match.round_number),
      match: clean(presentation.display_match_number),
      format: formatName(match.format),
      course: clean(presentation.course_name || snapshot.course_id),
      courseLogo: clean(presentation.course_logo),
      courseId: clean(snapshot.course_id),
      tee: clean(snapshot.tee),
      teeTime: clean(presentation.tee_time),
      status: statusName(match.status),
      accessActive: permission.can_score === true,
      accessVersion: number(permission.permission_revision || match.permission_revision),
      scoringEnabled: canScore,
      currentHole: number(match.current_hole),
      holesRecorded: number(match.scored_holes, scores.length),
      holesRemaining: number(match.holes_remaining, Math.max(0, 18 - scores.length)),
      matchRevision: number(match.match_revision),
      updatedAt: clean(match.updated_at || match.authority_updated_at),
      team: { side: ownSide, name: clean(ownTeam.name), logo: teamLogo(ownSide) },
      opponentTeam: { side: opponentSide, name: clean(opponentTeam.name), logo: teamLogo(opponentSide) },
      partnerNames: names(ownSide).filter((name) => name !== clean(playerRow.display_name)),
      opponentNames: names(opponentSide),
      participantNames: names(ownSide),
      result,
    };
  });
  return {
    player: {
      id: clean(playerRow.player_id),
      name: clean(playerRow.display_name || playerRow.player_id),
      slug: clean(playerRow.source_payload?.Slug),
      teamName: clean(playerTeam.name),
      teamLogo: clean(playerSide === 1 ? view.matches?.[0]?.presentation?.team_1_logo : view.matches?.[0]?.presentation?.team_2_logo),
      tournamentHandicap: tournamentPlayer.source_payload?.["Tournament Handicap"] ?? null,
    },
    tournament: {
      id: clean(tournamentRow.tournament_id),
      year: number(tournamentRow.tournament_year),
      name: clean(tournamentRow.name),
      status: clean(view.matches?.[0]?.presentation?.tournament_status || "Live"),
      currentRound: clean(view.current_round),
      timeZone: clean(view.matches?.[0]?.presentation?.tournament_time_zone || "America/Chicago"),
      logo: clean(view.matches?.[0]?.presentation?.tournament_logo || `sandbagger-${number(tournamentRow.tournament_year)}`),
    },
    matches,
    snapshot: null,
    identityContext: {
      playerId: clean(playerRow.player_id),
      tournament: { id: clean(tournamentRow.tournament_id) },
      team: { id: clean(tournamentPlayer.team_id) },
      membership: { active: clean(tournamentPlayer.participation_status).toUpperCase() === "ACTIVE" },
      matches: matches.map((match) => ({ matchId: match.matchId, canScore: match.accessActive,
        permissionRevision: match.accessVersion })),
      contextRevision: number(view.context_revision),
    },
    queryMs: number(view.query_ms),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function myMatchParityProjection(data = {}) {
  return stable({
    player: { id: data.player?.id, name: data.player?.name, teamName: data.player?.teamName },
    tournament: data.tournament,
    matches: (data.matches || []).map((match) => ({
      matchId: match.matchId, round: match.round, match: match.match, format: match.format,
      course: match.course, courseLogo: match.courseLogo, courseId: match.courseId, tee: match.tee, teeTime: match.teeTime,
      status: match.status, accessActive: match.accessActive, accessVersion: match.accessVersion,
      scoringEnabled: match.scoringEnabled, currentHole: match.currentHole, holesRecorded: match.holesRecorded,
      holesRemaining: match.holesRemaining, matchRevision: match.matchRevision,
      team: match.team, opponentTeam: match.opponentTeam,
      participantNames: match.participantNames, opponentNames: match.opponentNames, result: match.result,
    })).sort((left, right) => left.matchId.localeCompare(right.matchId)),
  });
}

export function compareMyMatchParity(expected, actual) {
  const left = JSON.stringify(myMatchParityProjection(expected));
  const right = JSON.stringify(myMatchParityProjection(actual));
  return { pass: left === right, expected: left === right ? undefined : JSON.parse(left), actual: left === right ? undefined : JSON.parse(right) };
}
