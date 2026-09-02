import { buildLeaderboard, buildScoreLeaderboard } from "./leaderboards-core-engine.js";
import { playerPerformanceRows, rankPlayerRows, roundCompetitionRows, teamStandings } from "./mobile-leaderboards.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { tournamentLiveDataFromSupabaseView } from "./tournament-live-supabase.js";
import { getStrokesOnHole } from "./scorecard-net.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const upper = (value) => clean(value).toUpperCase();
const displayNumber = (value) => value === null || value === undefined || value === "" ? null : number(value);

export async function readLeaderboardsCoreView(tournamentId = "", options = {}) {
  return scoringShadowRpc("read_leaderboards_core_view", { target_tournament_id: clean(tournamentId) }, {
    ...options, timeoutMs: options.timeoutMs || 8_000,
  });
}

function playerPresentation(source = {}) {
  return {
    slug: clean(source.Slug || source.slug),
    photo: clean(source.Photo || source["Photo Filename"] || source["Player Photo Filename"] || source.photo),
    captain: /^(true|yes|1)$/i.test(clean(source.Captain || source.captain)),
  };
}

function playerMapFrom(view = {}) {
  return Object.fromEntries((view.players || []).map((row) => {
    const canonicalPresentation = playerPresentation(row.source_payload || {});
    const importedPresentation = playerPresentation(row.presentation || {});
    const presentation = {
      slug: importedPresentation.slug || canonicalPresentation.slug,
      photo: importedPresentation.photo || canonicalPresentation.photo,
      captain: importedPresentation.captain || canonicalPresentation.captain,
    };
    return [clean(row.player_id), {
      name: clean(row.display_name || row.player_id),
      slug: presentation.slug,
      photo: presentation.photo,
      captain: presentation.captain,
      active: upper(row.participation_status) === "ACTIVE",
      teamSide: number(row.team_side),
      tournamentHandicap: row.tournament_source_payload?.["Tournament Handicap"] ?? null,
    }];
  }));
}

function teamMapFrom(data = {}) {
  const tournament = data.tournament || {};
  return {
    1: { id: clean(tournament.teamOne?.id), name: clean(tournament.teamOne?.name || "Team 1"), logo: clean(tournament.teamOne?.logo) },
    2: { id: clean(tournament.teamTwo?.id), name: clean(tournament.teamTwo?.name || "Team 2"), logo: clean(tournament.teamTwo?.logo) },
  };
}

/**
 * Resolve canonical tournament Team presentation from the same bounded
 * Supabase view used by current Live and leaderboard surfaces. Stable Team IDs
 * come from scoring_authority.teams; logo/color presentation comes from the
 * tournament's certified match presentation, with the canonical Team payload
 * retained as a safe Supabase fallback when no match presentation is present.
 */
export function canonicalTeamPresentationFromLeaderboardsView(view = {}) {
  const presentations = (view.matches || []).map((entry) => entry?.presentation || {});
  const firstPresentation = presentations.find((row) => clean(row.team_1_logo) || clean(row.team_2_logo))
    || presentations[0]
    || {};
  return (view.teams || []).map((team) => {
    const side = number(team.team_side);
    const source = team.source_payload || {};
    return {
      id: clean(team.team_id),
      side,
      name: clean(team.name),
      logo: clean(firstPresentation[`team_${side}_logo`] || source["Team Logo"] || source["Logo Filename"] || source.logo),
      primaryColor: clean(firstPresentation[`team_${side}_primary_color`] || source["Primary Color"] || source.primary_color),
      secondaryColor: clean(firstPresentation[`team_${side}_secondary_color`] || source["Secondary Color"] || source.secondary_color),
    };
  }).filter((team) => team.id && [1, 2].includes(team.side));
}

function normalizedMatchRow(entry = {}, display = {}) {
  const match = entry.match || {};
  const snapshot = entry.snapshot || {};
  const presentation = entry.presentation || {};
  const row = {
    "Match ID": clean(match.match_id),
    Round: number(match.round_number),
    Match: clean(presentation.display_match_number || match.match_id),
    Format: upper(match.format),
    "Course ID": clean(snapshot.course_id),
    Tee: clean(snapshot.tee),
  };
  for (const participant of entry.participants || []) {
    const side = number(participant.team_side);
    const slot = number(participant.player_slot);
    const projected = (display[`team${side}Players`] || []).find((row) => clean(row.id) === clean(participant.player_id)) || {};
    row[`Team ${side} Player ${slot}`] = clean(participant.player_id);
    row[`Team ${side} Player ${slot} Playing HCP`] = Object.hasOwn(projected, "playingHcp")
      ? projected.playingHcp : participant.playing_handicap;
    row[`Team ${side} Player ${slot} Stroke`] = Object.hasOwn(projected, "stroke")
      ? projected.stroke : participant.final_strokes;
  }
  const teamConfiguration = snapshot.team_configuration || {};
  for (const side of [1, 2]) {
    row[`Team ${side} Playing HCP`] = display[`team${side}PlayingHcp`] ?? teamConfiguration[`team_${side}_playing_handicap`] ?? null;
    row[`Team ${side} Stroke`] = display[`team${side}Stroke`] ?? teamConfiguration[`team_${side}_strokes`] ?? null;
  }
  return row;
}

function normalizedHoleRows(entries = []) {
  return entries.flatMap((entry) => (entry.scores || []).map((score) => ({
    "Match ID": clean(entry.match?.match_id),
    "Hole Number": number(score.hole_number),
    "Team 1 Gross Scores": score.team_1_gross_scores,
    "Team 2 Gross Scores": score.team_2_gross_scores,
    "Team 1 Strokes": score.team_1_strokes,
    "Team 2 Strokes": score.team_2_strokes,
    "Team 1 Net Score": displayNumber(score.team_1_net_score),
    "Team 2 Net Score": displayNumber(score.team_2_net_score),
    "Hole Winner": clean(score.hole_winner),
    Revision: number(score.hole_revision),
  })));
}

function normalizedCourseHoles(entries = []) {
  return entries.flatMap((entry) => (entry.holes || []).map((hole) => ({
    "Match ID": clean(entry.match?.match_id),
    "Course ID": clean(entry.snapshot?.course_id),
    Tee: clean(entry.snapshot?.tee),
    "Hole Number": number(hole.hole_number),
    "Stroke Index": number(hole.stroke_index),
    Par: number(hole.par),
    Yardage: hole.yardage == null ? "" : number(hole.yardage),
  })));
}

function scoreRowFor(scoreLeaderboard, entry, side, participant) {
  const format = upper(entry.match?.format);
  if (format === "SC") return scoreLeaderboard.find((row) =>
    row.id === `${clean(entry.match?.match_id)}:team-${side}` && number(row.round) === number(entry.match?.round_number));
  return scoreLeaderboard.find((row) => row.id === clean(participant?.player_id) && number(row.round) === number(entry.match?.round_number));
}

export function validateLeaderboardsCoreAttribution(view = {}, scoreLeaderboard = [], { matchRows = [], courseHoles = [] } = {}) {
  const issues = [];
  let participantSlots = 0;
  let scoredHoles = 0;
  let matchAppliedStrokeCells = 0;
  let leaderboardStrokeCells = 0;
  const formats = new Set();
  const matchMap = new Map(matchRows.map((row) => [clean(row["Match ID"]), row]));
  for (const entry of view.matches || []) {
    const matchId = clean(entry.match?.match_id);
    const format = upper(entry.match?.format);
    formats.add(format);
    const participants = entry.participants || [];
    participantSlots += participants.length;
    for (const side of [1, 2]) {
      const sidePlayers = participants.filter((row) => number(row.team_side) === side)
        .sort((left, right) => number(left.player_slot) - number(right.player_slot));
      const slots = sidePlayers.map((row) => number(row.player_slot));
      if (new Set(slots).size !== slots.length || slots.some((slot, index) => slot !== index + 1)) {
        issues.push({ code: "PLAYER_SLOT_ORDER", matchId, side, slots });
      }
      for (const score of entry.scores || []) {
        scoredHoles += side === 1 ? 1 : 0;
        const gross = Array.isArray(score[`team_${side}_gross_scores`]) ? score[`team_${side}_gross_scores`].map(Number) : [];
        const strokes = Array.isArray(score[`team_${side}_strokes`]) ? score[`team_${side}_strokes`].map(Number) : [];
        const expectedValues = format === "SC" ? 1 : sidePlayers.length;
        if (gross.length !== expectedValues || strokes.length !== expectedValues) {
          issues.push({ code: "SCORE_SLOT_COUNT", matchId, hole: number(score.hole_number), side,
            expected: expectedValues, gross: gross.length, strokes: strokes.length });
          continue;
        }
        matchAppliedStrokeCells += strokes.length;
        const comparisonPlayers = format === "SC" ? [sidePlayers[0] || null] : sidePlayers;
        comparisonPlayers.forEach((participant, index) => {
          const derived = scoreRowFor(scoreLeaderboard, entry, side, participant)?.scorecard
            ?.find((row) => number(row.hole) === number(score.hole_number));
          const matchRow = matchMap.get(matchId) || {};
          const hole = courseHoles.find((row) => clean(row["Match ID"]) === matchId &&
            number(row["Hole Number"]) === number(score.hole_number));
          const strokeIndex = number(hole?.["Stroke Index"]);
          const allocation = format === "SC"
            ? (clean(matchRow[`Team ${side} Stroke`]) || matchRow[`Team ${side} Playing HCP`])
            : (clean(matchRow[`Team ${side} Player ${index + 1} Stroke`]) || matchRow[`Team ${side} Player ${index + 1} Playing HCP`]);
          const expectedNet = format === "SC" ? displayNumber(score[`team_${side}_net_score`])
            : gross[index] - getStrokesOnHole(allocation, strokeIndex);
          const expectedStrokes = gross[index] - expectedNet;
          leaderboardStrokeCells += 1;
          if (!derived || number(derived.gross, NaN) !== gross[index] || number(derived.net, NaN) !== expectedNet ||
              number(derived.strokes, NaN) !== expectedStrokes) {
            issues.push({ code: "SCORE_ATTRIBUTION", matchId, hole: number(score.hole_number), side,
              playerId: clean(participant?.player_id), expected: { gross: gross[index], strokes: expectedStrokes, net: expectedNet },
              actual: derived ? { gross: derived.gross, strokes: derived.strokes, net: derived.net } : null });
          }
        });
      }
    }
  }
  return { pass: issues.length === 0, issues, participantSlots, scoredHoles, matchAppliedStrokeCells,
    leaderboardStrokeCells, formats: [...formats].sort() };
}

export function leaderboardsCoreDataFromSupabaseView(view = {}, { includeCurrentMatchLifecycle = false } = {}) {
  const calculationStartedAt = performance.now();
  const rawLive = tournamentLiveDataFromSupabaseView(view);
  const matchDisplay = view.tournament_presentation?.presentation?.tournamentMatchDisplay || {};
  const live = {
    ...rawLive,
    rounds: (rawLive.rounds || []).map((round) => ({ ...round, matches: (round.matches || []).map((match) => {
      const projected = matchDisplay[match.id] || {};
      return { ...match,
        currentHole: Object.hasOwn(projected, "currentHole") ? number(projected.currentHole) : match.currentHole,
        // Match presentation is allowed to preserve legacy display details, but
        // the canonical current lifecycle alone decides whether a result is
        // official. In particular, an inactive Final archive must not make a
        // subsequently reopened match appear Final in shared leaderboard reads.
        archiveFinal: match.archiveFinal,
      };
    }) })),
  };
  const entries = view.matches || [];
  const playerMap = playerMapFrom(view);
  const teams = teamMapFrom(live);
  const matchRows = entries.map((entry) => normalizedMatchRow(entry, matchDisplay[clean(entry.match?.match_id)] || {}));
  const matchMap = new Map(matchRows.map((row) => [clean(row["Match ID"]), row]));
  const holeRows = normalizedHoleRows(entries);
  const courseHoles = normalizedCourseHoles(entries);
  const scoreLeaderboard = buildScoreLeaderboard(holeRows, matchMap, courseHoles, playerMap);
  const matches = (live.rounds || []).flatMap((round) => round.matches || []);
  const activeTournamentPlayers = Object.entries(playerMap)
    .filter(([, player]) => player.active && [1, 2].includes(number(player.teamSide)))
    .map(([id, player]) => ({ id, teamSide: number(player.teamSide) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const leaderboard = buildLeaderboard(matches, playerMap, teams, { seedPlayers: activeTournamentPlayers });
  const roundLeaderboards = Object.fromEntries((live.rounds || []).map((round) => [
    round.number,
    buildLeaderboard(round.matches || [], playerMap, teams),
  ]));
  const slotVerification = validateLeaderboardsCoreAttribution(view, scoreLeaderboard, { matchRows, courseHoles });
  // The overall board is roster-seeded before pairings exist, so cache and
  // parity revisions must bind the same canonical membership inputs instead
  // of relying only on match/hole revisions from the RPC.
  const sourceRevision = {
    ...(view.source_revision || {}),
    activeRoster: activeTournamentPlayers.map((player) => ({
      playerId: player.id,
      participationStatus: "ACTIVE",
      teamSide: player.teamSide,
    })),
  };
  const sourceFingerprint = scoringShadowPayloadHash(sourceRevision);
  const currentMatchLifecycle = includeCurrentMatchLifecycle ? rawLive.rounds.map((round) => ({
    round: round.number,
    matches: (round.matches || []).map((match) => ({
      id: match.id,
      status: match.status,
      scoringEnabled: match.scoringEnabled,
      scoringLocked: match.scoringLocked,
      currentHole: match.currentHole,
      playerIds: [...(match.team1Players || []), ...(match.team2Players || [])].map((player) => clean(player.id)),
    })),
  })) : undefined;
  return {
    ...live,
    ...(currentMatchLifecycle ? { currentMatchLifecycle } : {}),
    leaderboard,
    scoreLeaderboard,
    roundLeaderboards,
    players: Object.entries(playerMap).filter(([, player]) => player.active).map(([id, player]) => ({ id, ...player })),
    sourceFingerprint,
    sourceRevision,
    revision: sourceFingerprint,
    slotVerification,
    queryMs: number(view.query_ms),
    calculationMs: performance.now() - calculationStartedAt,
  };
}

export function expectedLeaderboardsCoreView(authorityImport = {}, presentationImport = {}, homePresentation = null) {
  const payload = authorityImport.payload || authorityImport;
  const tournamentId = clean(payload.tournament?.tournament_id);
  const presentations = presentationImport.rows || [];
  const players = new Map((payload.players || []).map((row) => [clean(row.player_id), row]));
  return {
    tournament: payload.tournament,
    teams: payload.teams || [],
    players: (payload.tournament_players || []).filter((row) => row.tournament_id === tournamentId && upper(row.participation_status) === "ACTIVE")
      .map((row) => ({ ...players.get(clean(row.player_id)), ...row, tournament_source_payload: row.source_payload,
        presentation: homePresentation?.presentation?.leaderboardsPlayers?.[clean(row.player_id)] || {} })),
    rounds: payload.rounds || [],
    matches: (payload.matches || []).filter((row) => row.tournament_id === tournamentId).map((match) => ({
      match,
      round: (payload.rounds || []).find((row) => number(row.round_number) === number(match.round_number)) || {},
      snapshot: (payload.snapshots || []).find((row) => row.snapshot_id === match.scoring_snapshot_id) || {},
      presentation: presentations.find((row) => row.match_id === match.match_id) || {},
      participants: (payload.match_participants || []).filter((row) => row.match_id === match.match_id).map((row) => ({
        ...row, display_name: players.get(clean(row.player_id))?.display_name || row.player_id,
        source_payload: players.get(clean(row.player_id))?.source_payload || {},
      })),
      holes: (payload.match_holes || []).filter((row) => row.match_id === match.match_id),
      scores: (payload.hole_scores || []).filter((row) => row.match_id === match.match_id),
    })),
    tournament_presentation: homePresentation,
    source_revision: {
      tournamentId,
      matches: (payload.matches || []).filter((row) => row.tournament_id === tournamentId).map((row) => ({
        matchId: row.match_id, matchRevision: number(row.match_revision), status: row.status,
        scoringLocked: row.scoring_locked === true, scorecardComplete: row.scorecard_complete === true,
        finalizedAt: row.finalized_at || null,
      })).sort((left, right) => left.matchId.localeCompare(right.matchId)),
      holes: (payload.hole_scores || []).map((row) => ({ matchId: row.match_id, holeNumber: number(row.hole_number),
        holeRevision: number(row.hole_revision) })).sort((left, right) => left.matchId.localeCompare(right.matchId) || left.holeNumber - right.holeNumber),
    },
    query_ms: 0,
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function scoreValue(value) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value);
}

function parityLifecycle(value) {
  const status = upper(value);
  if (["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(status)) return "FINAL";
  if (["LIVE", "REOPENED", "OPEN", "IN PROGRESS", "IN-PROGRESS"].includes(status)) return "LIVE";
  if (["UPCOMING", "SCHEDULED", "NOT STARTED", "NOT-STARTED"].includes(status)) return "UPCOMING";
  return status;
}

export function leaderboardsCoreParityProjection(data = {}) {
  const rounds = data.rounds || [];
  const overallPlayers = rankPlayerRows(playerPerformanceRows(data.leaderboard || [], data.scoreLeaderboard || [], rounds), "points");
  return stable({
    tournament: { id: clean(data.tournament?.id), year: number(data.tournament?.year),
      teamOne: { name: clean(data.tournament?.teamOne?.name), score: scoreValue(data.tournament?.teamOne?.score) },
      teamTwo: { name: clean(data.tournament?.teamTwo?.name), score: scoreValue(data.tournament?.teamTwo?.score) } },
    teams: ["overall", ...rounds.map((round) => String(round.number))].map((scope) => ({
      scope,
      rows: teamStandings(rounds, data.tournament || {}, scope).map((row) => ({ side: row.side, rank: row.rank,
        name: row.name, points: scoreValue(row.points), wins: row.wins, losses: row.losses, halves: row.halves,
        remaining: row.remaining, record: row.record })),
    })),
    players: overallPlayers.map((row) => ({ id: row.id, rank: row.displayRank, points: scoreValue(row.points),
      wins: row.wins, losses: row.losses, halves: row.halves, winPct: scoreValue(row.winPct),
      grossAvg: scoreValue(row.grossAvg), netAvg: scoreValue(row.netAvg), teamSide: row.teamSide })),
    roundPlayers: rounds.map((round) => ({ round: round.number, format: round.format,
      rows: roundCompetitionRows(data.scoreLeaderboard || [], round.number, round.format,
        data.roundLeaderboards?.[round.number] || [], round.matches || []).map((row) => ({
          id: row.id, playerIds: row.playerIds, entityType: row.entityType, rank: row.displayRank,
          points: scoreValue(row.points), gross: scoreValue(row.gross), net: scoreValue(row.net),
          netToPar: scoreValue(row.netToPar), holes: row.holes, officialFinal: row.officialFinal,
        })) })),
    matches: rounds.flatMap((round) => (round.matches || []).map((match) => ({
      id: match.id, round: round.number, format: match.format, status: parityLifecycle(match.status),
      currentHole: match.currentHole,
      team1Points: parityLifecycle(match.status) === "FINAL" ? scoreValue(match.team1Points) : null,
      team2Points: parityLifecycle(match.status) === "FINAL" ? scoreValue(match.team2Points) : null,
      frontWinner: match.frontWinner, backWinner: match.backWinner, overallWinner: match.overallWinner,
      matchupWinner: match.matchupWinner, archiveFinal: parityLifecycle(match.status) === "FINAL",
    }))).sort((left, right) => left.id.localeCompare(right.id)),
  });
}

export function compareLeaderboardsCoreParity(expected, actual) {
  const left = JSON.stringify(leaderboardsCoreParityProjection(expected));
  const right = JSON.stringify(leaderboardsCoreParityProjection(actual));
  return { pass: left === right, expected: left === right ? undefined : JSON.parse(left), actual: left === right ? undefined : JSON.parse(right) };
}
