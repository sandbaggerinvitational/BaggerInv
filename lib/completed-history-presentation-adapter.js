import { createHash } from "node:crypto";

import { buildScorecardAnalytics } from "./scorecard-analytics.js";
import { isCompletedHistoryYear } from "./completed-history-contract.js";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const numeric = (value) => {
  if (value === null || value === undefined || clean(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const integer = (value) => {
  const parsed = numeric(value);
  return parsed === null ? null : Math.trunc(parsed);
};
const slugify = (value) => clean(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
const titleFormat = (value) => ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[upper(value)] || clean(value);
const sideLabel = (value) => `Team ${Number(value)}`;
const statusLabel = (value) => upper(value) === "FINAL" ? "Complete" : clean(value) || "Complete";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function formatNumber(value) {
  const parsed = numeric(value);
  if (parsed === null) return "";
  return String(parsed).replace(/\.0+$/, "");
}

function normalizedWinner(value) {
  const winner = upper(value).replace(/[^A-Z0-9]/g, "");
  if (["TEAM1", "1"].includes(winner)) return "Team 1";
  if (["TEAM2", "2"].includes(winner)) return "Team 2";
  if (["HALVED", "TIE", "TIED", "PUSH"].includes(winner)) return "Halved";
  return clean(value) || null;
}

function displayWinner(value, firstTeam, secondTeam) {
  const winner = normalizedWinner(value);
  if (winner === "Team 1") return firstTeam?.name || "Team 1";
  if (winner === "Team 2") return secondTeam?.name || "Team 2";
  return winner || "Not recorded";
}

function playerRows(data) {
  const rosterByPlayer = new Map(list(data.roster).map((row) => [clean(row.player_id), row]));
  const players = new Map();
  for (const row of [...list(data.players), ...list(data.roster)]) {
    const playerId = clean(row.player_id);
    if (!playerId) continue;
    const displayName = clean(row.display_name || players.get(playerId)?.["Display Name"] || playerId);
    const source = object(row.source_payload);
    const slug = slugify(source.slug || displayName);
    players.set(playerId, {
      "Player ID": playerId,
      "Display Name": displayName,
      Slug: slug,
      slug,
      active: true,
      sourceRosterKey: clean(rosterByPlayer.get(playerId)?.source_roster_key),
    });
  }
  return players;
}

function teamRows(data, players) {
  const roster = list(data.roster);
  return list(data.teams)
    .map((row) => {
      const side = Number(row.team_side);
      const presentation = object(row.presentation_identity);
      const teamRoster = roster
        .filter((item) => Number(item.team_side) === side)
        .sort((left, right) =>
          (numeric(object(left.source_payload).roster_order) ?? Number.MAX_SAFE_INTEGER) -
          (numeric(object(right.source_payload).roster_order) ?? Number.MAX_SAFE_INTEGER) ||
          clean(left.display_name).localeCompare(clean(right.display_name))
        )
        .map((item) => ({
          player: players.get(clean(item.player_id)),
          handicap: numeric(item.tournament_handicap),
          rosterOrder: numeric(object(item.source_payload).roster_order),
        }))
        .filter((item) => item.player);
      const handicaps = teamRoster.map((item) => item.handicap).filter(Number.isFinite);
      const captainId = clean(row.captain_player_id || roster.find((item) => Number(item.team_side) === side && item.is_captain)?.player_id);
      return {
        year: Number(data.tournament?.tournament_year),
        side: sideLabel(side),
        sideNumber: side,
        id: clean(row.team_id),
        name: clean(row.name),
        logo: clean(row.logo_key),
        primaryColor: clean(presentation.primary_color),
        secondaryColor: clean(presentation.secondary_color),
        motto: clean(presentation.motto),
        description: clean(presentation.description),
        captainId,
        captainRecordedName: players.get(captainId)?.["Display Name"] || "",
        captain: players.get(captainId) || null,
        roster: teamRoster,
        averageHandicap: teamRoster.length && handicaps.length === teamRoster.length
          ? handicaps.reduce((sum, value) => sum + value, 0) / handicaps.length
          : null,
      };
    })
    .sort((left, right) => left.sideNumber - right.sideNumber);
}

function courseRows(data) {
  const roundByNumber = new Map(list(data.rounds).map((row) => [Number(row.round_number), row]));
  return list(data.course_appearances)
    .map((row) => {
      const round = Number(row.round_number);
      const source = object(row.source_payload);
      const locationParts = clean(row.location).split(",").map((item) => clean(item));
      return {
        Year: Number(data.tournament?.tournament_year),
        Round: `Round ${round}`,
        "Round ID": `R${round}`,
        "Course ID": clean(row.course_id),
        "Source Course ID": clean(row.source_course_id),
        Course: clean(row.display_name || row.canonical_name),
        City: locationParts[0] || "",
        State: locationParts.slice(1).join(", "),
        Destination: clean(source.destination || data.tournament?.destination),
        "Tee Played": clean(row.tee),
        Rating: numeric(row.rating),
        Slope: integer(row.slope),
        Yardage: integer(row.yardage),
        Par: integer(row.par),
        Designer: clean(source.designer),
        Website: clean(source.website),
        "Course Logo": clean(source.logo),
        "Course Profile Image": clean(source.profile_image),
        Format: upper(roundByNumber.get(round)?.format),
        holeDefinitions: list(row.hole_definitions),
        holeConfigurationState: clean(source.hole_configuration_state),
      };
    })
    .sort((left, right) => Number(clean(left.Round).replace(/\D/g, "")) - Number(clean(right.Round).replace(/\D/g, "")));
}

function publicMatchRows(data, teams, players, courses) {
  const participantRows = list(data.match_participants);
  const courseByAppearance = new Map(list(data.course_appearances).map((row) => [clean(row.appearance_id), row]));
  const coursePresentationByRound = new Map(courses.map((row) => [Number(clean(row.Round).replace(/\D/g, "")), row]));
  return list(data.matches)
    .map((row) => {
      const source = object(row.source_payload);
      const segments = object(source.segments);
      const handicaps = object(source.team_handicaps);
      const participants = participantRows
        .filter((item) => clean(item.match_id) === clean(row.match_id))
        .sort((left, right) => Number(left.team_side) - Number(right.team_side) || Number(left.player_slot) - Number(right.player_slot));
      const sidePlayers = (side) => participants
        .filter((item) => Number(item.team_side) === side)
        .map((item) => ({
          id: clean(item.player_id),
          name: players.get(clean(item.player_id))?.["Display Name"] || clean(item.player_id),
          slug: players.get(clean(item.player_id))?.slug || "",
          playingHcp: numeric(item.applied_handicap),
          stroke: numeric(item.applied_strokes),
        }));
      const round = Number(row.round_number);
      const courseAppearance = courseByAppearance.get(clean(row.course_appearance_id));
      const course = coursePresentationByRound.get(round);
      const matchNumber = integer(source.match_number) ?? integer(clean(row.match_id).split("-").at(-1));
      return {
        id: clean(row.match_id),
        year: Number(data.tournament?.tournament_year),
        match: matchNumber,
        matchNumber,
        round,
        format: upper(row.format),
        formatName: titleFormat(row.format),
        status: clean(source.source_match_status) || statusLabel(row.lifecycle),
        lifecycle: upper(row.lifecycle),
        teeTime: clean(source.tee_time),
        notes: clean(source.notes),
        course: {
          id: clean(courseAppearance?.course_id || course?.["Course ID"]),
          name: clean(courseAppearance?.display_name || course?.Course),
          tee: clean(courseAppearance?.tee || course?.["Tee Played"]),
        },
        team1Players: sidePlayers(1),
        team2Players: sidePlayers(2),
        team1PlayingHcp: numeric(handicaps.team_1_playing_handicap),
        team2PlayingHcp: numeric(handicaps.team_2_playing_handicap),
        team1Stroke: numeric(handicaps.team_1_strokes),
        team2Stroke: numeric(handicaps.team_2_strokes),
        frontWinner: normalizedWinner(segments.front),
        backWinner: normalizedWinner(segments.back),
        overallWinner: normalizedWinner(segments.overall),
        matchupWinner: normalizedWinner(row.result_winner),
        team1Points: numeric(row.team_1_points),
        team2Points: numeric(row.team_2_points),
        finalResult: clean(row.result),
        scorecardCoverage: clean(row.scorecard_coverage),
        completionState: clean(row.completion_state),
      };
    })
    .sort((left, right) => left.round - right.round || left.match - right.match || left.id.localeCompare(right.id));
}

function rawMatchRows(data, matches) {
  return matches.map((match) => ({
    Year: match.year,
    Round: match.round,
    Match: match.match,
    "Match ID": match.id,
    Format: match.format,
    "Match Status": match.status,
    "Course ID": match.course.id,
    "Team 1 Player 1": match.team1Players[0]?.id || "",
    "Team 1 Player 2": match.team1Players[1]?.id || "",
    "Team 2 Player 1": match.team2Players[0]?.id || "",
    "Team 2 Player 2": match.team2Players[1]?.id || "",
    "Team 1 Player 1 Playing HCP": match.team1Players[0]?.playingHcp ?? "",
    "Team 1 Player 2 Playing HCP": match.team1Players[1]?.playingHcp ?? "",
    "Team 2 Player 1 Playing HCP": match.team2Players[0]?.playingHcp ?? "",
    "Team 2 Player 2 Playing HCP": match.team2Players[1]?.playingHcp ?? "",
    "Team 1 Player 1 Stroke": match.team1Players[0]?.stroke ?? "",
    "Team 1 Player 2 Stroke": match.team1Players[1]?.stroke ?? "",
    "Team 2 Player 1 Stroke": match.team2Players[0]?.stroke ?? "",
    "Team 2 Player 2 Stroke": match.team2Players[1]?.stroke ?? "",
    "Team 1 Playing HCP": match.team1PlayingHcp ?? "",
    "Team 2 Playing HCP": match.team2PlayingHcp ?? "",
    "Team 1 Stroke": match.team1Stroke ?? "",
    "Team 2 Stroke": match.team2Stroke ?? "",
    "Front 9 Winner": match.frontWinner || "",
    "Back 9 Winner": match.backWinner || "",
    "18-Hole Winner": match.overallWinner || "",
    "Matchup Winner": match.matchupWinner || "",
    "Team 1 Points": match.team1Points ?? "",
    "Team 2 Points": match.team2Points ?? "",
    Notes: match.notes,
  }));
}

function rawScorecardRows(data, players, teams) {
  const teamBySide = new Map(teams.map((team) => [team.sideNumber, team]));
  return list(data.scorecards).map((row) => {
    const semantics = object(row.score_semantics);
    const source = object(row.source_payload);
    const status = upper(row.coverage_status) === "UNAVAILABLE" ? "MISSING" : upper(row.coverage_status);
    const team = teamBySide.get(Number(row.team_side));
    return {
      Year: Number(data.tournament?.tournament_year),
      Round: list(data.matches).find((match) => clean(match.match_id) === clean(row.match_id))?.round_number,
      "Match ID": clean(row.match_id),
      Format: upper(list(data.matches).find((match) => clean(match.match_id) === clean(row.match_id))?.format),
      "Score Type": upper(row.entity_kind) === "TEAM" ? "TEAM" : "INDIVIDUAL",
      "Player ID": clean(row.player_id),
      "Team ID": clean(semantics.team_id || team?.id),
      "Course ID": clean(semantics.course_id || source.source_course_id),
      "Scorecard Status": status,
      Source: clean(source.source),
      Notes: clean(source.notes),
      ...Object.fromEntries(Array.from({ length: 18 }, (_, index) => [
        `Hole ${index + 1}`,
        list(row.hole_values)[index] ?? "",
      ])),
      _playerName: players.get(clean(row.player_id))?.["Display Name"] || "",
      _teamName: team?.name || "",
    };
  });
}

function scorecardAnalytics(data, players, teams, courses, rawMatches) {
  const rawScorecards = rawScorecardRows(data, players, teams);
  const courseHoles = courses.flatMap((course) => list(course.holeDefinitions).map((hole) => ({
    "Course ID": course["Course ID"],
    Tee: course["Tee Played"],
    "Hole Number": hole.hole_number,
    Yardage: hole.yardage,
    Par: hole.par,
    "Stroke Index": hole.stroke_index,
  })));
  const analytics = buildScorecardAnalytics({
    roundScorecards: rawScorecards,
    matches: rawMatches,
    courseHoles,
    courses,
    teamNames: teams.map((team) => ({
      Year: Number(data.tournament?.tournament_year),
      "Team ID": team.id,
      "Team Side": team.side,
      "Team Names": team.name,
    })),
    players: [...players.values()],
  });
  return {
    ...analytics,
    canonicalCareerScorecards: analytics.scorecards,
    history2023NetProjectionScorecards: analytics.scorecards,
    history2024NetProjectionScorecards: analytics.scorecards,
    rawScorecards,
  };
}

function leaderboardRows(data, players, teams, matches) {
  const eligibility = new Map(list(data.record_eligibility).map((row) => [
    `${clean(row.match_id)}|${clean(row.player_id)}`,
    row.is_record_eligible !== false,
  ]));
  const participantRows = list(data.match_participants);
  const rows = new Map();
  const ensure = (participant) => {
    const playerId = clean(participant.player_id);
    if (!rows.has(playerId)) {
      const team = teams.find((item) => item.sideNumber === Number(participant.team_side));
      rows.set(playerId, {
        id: playerId,
        player: players.get(playerId),
        identityResolved: Boolean(players.get(playerId)),
        teamSide: Number(participant.team_side),
        teamName: team?.name || sideLabel(participant.team_side),
        wins: 0,
        losses: 0,
        halves: 0,
        points: 0,
        pointsTracked: false,
      });
    }
    return rows.get(playerId);
  };
  for (const match of matches) {
    const canonical = list(data.matches).find((item) => clean(item.match_id) === match.id);
    const pointsTracked = numeric(canonical?.team_1_points) !== null && numeric(canonical?.team_2_points) !== null;
    for (const participant of participantRows.filter((item) => clean(item.match_id) === match.id)) {
      if (eligibility.get(`${match.id}|${clean(participant.player_id)}`) === false) continue;
      const row = ensure(participant);
      row.pointsTracked = row.pointsTracked || pointsTracked;
      const side = Number(participant.team_side);
      const won = match.matchupWinner === sideLabel(side);
      const halved = match.matchupWinner === "Halved";
      if (won) row.wins += 1;
      else if (halved) row.halves += 1;
      else row.losses += 1;
      if (pointsTracked) {
        const teamPoints = side === 1 ? match.team1Points : match.team2Points;
        row.points += match.format === "SI" ? teamPoints : teamPoints / 2;
      }
    }
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      winPercentage: row.wins + row.losses + row.halves
        ? (row.wins + row.halves * 0.5) / (row.wins + row.losses + row.halves) * 100
        : 0,
    }))
    .sort((left, right) => {
      const pointsTracked = left.pointsTracked || right.pointsTracked;
      return pointsTracked
        ? right.points - left.points || right.wins - left.wins || left.losses - right.losses || clean(left.player?.["Display Name"]).localeCompare(clean(right.player?.["Display Name"]))
        : right.winPercentage - left.winPercentage || right.wins - left.wins || left.losses - right.losses || right.halves - left.halves || clean(left.player?.["Display Name"]).localeCompare(clean(right.player?.["Display Name"]));
    });
}

function tournamentRow(data, teams, courses, players) {
  const row = object(data.tournament);
  const source = object(row.source_payload);
  const year = Number(row.tournament_year);
  const championTeam = teams.find((team) => team.id === clean(row.champion_team_id)) || null;
  const runnerUpTeam = teams.find((team) => team.id === clean(source.runner_up_team_id)) ||
    teams.find((team) => team.id !== championTeam?.id) || null;
  const scoreAvailable = upper(row.score_availability) === "RECORDED";
  const championPoints = championTeam?.sideNumber === 1
    ? numeric(row.official_team_1_points)
    : numeric(row.official_team_2_points);
  const runnerUpPoints = runnerUpTeam?.sideNumber === 1
    ? numeric(row.official_team_1_points)
    : numeric(row.official_team_2_points);
  const finalScore = scoreAvailable && championPoints !== null && runnerUpPoints !== null
    ? `${formatNumber(championPoints)} - ${formatNumber(runnerUpPoints)}`
    : "";
  const awards = list(data.awards).map((award) => ({
    Award: clean(award.label || award.award_type),
    Winner: clean(award.winner_player_id || award.winner_team_id),
    winnerPlayer: players.get(clean(award.winner_player_id)) || null,
  }));
  return {
    Year: year,
    year,
    id: clean(row.tournament_id || year),
    "Tournament ID": clean(row.tournament_id || year),
    "Tournament Name": clean(row.name),
    Annual: clean(source.annual_label),
    editionTitle: clean(source.annual_label),
    Dates: clean(source.dates_label),
    Destination: clean(row.destination),
    "Hero Image": clean(source.hero_image),
    logoFileName: clean(source.annual_image),
    "Final Score": finalScore,
    lifecycle: upper(row.lifecycle),
    complete: upper(row.lifecycle) === "FINAL",
    scoreAvailability: upper(row.score_availability),
    teams,
    teamOne: teams.find((team) => team.sideNumber === 1) || null,
    teamTwo: teams.find((team) => team.sideNumber === 2) || null,
    team1: teams.find((team) => team.sideNumber === 1) || null,
    team2: teams.find((team) => team.sideNumber === 2) || null,
    championTeamId: championTeam?.id || null,
    runnerUpTeamId: runnerUpTeam?.id || null,
    championTeam,
    runnerUpTeam,
    courses,
    awards,
    startDate: row.start_date,
    endDate: row.end_date,
    revisionId: clean(data.revision?.revision_id),
  };
}

function roundArchives(data, tournament, matches) {
  const rounds = list(data.rounds);
  return rounds.map((roundRow, index) => {
    const round = Number(roundRow.round_number);
    const course = tournament.courses.find((item) => Number(clean(item.Round).replace(/\D/g, "")) === round);
    const roundMatches = matches.filter((match) => match.round === round);
    const recorded = roundMatches.length > 0 && roundMatches.every((match) => match.team1Points !== null && match.team2Points !== null);
    const teamOnePoints = recorded ? roundMatches.reduce((sum, match) => sum + match.team1Points, 0) : null;
    const teamTwoPoints = recorded ? roundMatches.reduce((sum, match) => sum + match.team2Points, 0) : null;
    const teamOne = { ...tournament.teamOne, points: teamOnePoints };
    const teamTwo = { ...tournament.teamTwo, points: teamTwoPoints };
    const roundWinner = !recorded ? "Not recorded"
      : teamOnePoints === teamTwoPoints ? "Halved"
      : teamOnePoints > teamTwoPoints ? teamOne.name : teamTwo.name;
    const availableRounds = rounds.map((item) => ({
      id: `R${Number(item.round_number)}`,
      number: Number(item.round_number),
      label: `Round ${Number(item.round_number)}`,
    }));
    return {
      year: tournament.year,
      round,
      tournament,
      course,
      format: upper(roundRow.format),
      teamOne,
      teamTwo,
      roundWinner,
      matches: roundMatches,
      availableRounds,
      previousRound: index > 0 ? availableRounds[index - 1] : null,
      nextRound: index < availableRounds.length - 1 ? availableRounds[index + 1] : null,
    };
  });
}

function teamSeasons(tournament, archives) {
  return tournament.teams.map((team) => {
    return {
      ...team,
      tournament,
      // Preserve the existing completed-team route contract: it presents the
      // certified roster/captain/handicaps and does not add a new match section.
      // The bounded year view still retains these facts for Round/Champions.
      roundGroups: [],
      canonicalRoundGroups: archives.map((archive) => ({
        number: archive.round,
        label: `Round ${archive.round}`,
        format: archive.format,
        lifecycle: "FINAL",
        course: archive.course,
        opponent: tournament.teams.find((item) => item.sideNumber !== team.sideNumber) || null,
        selectedTeamPoints: team.sideNumber === 1 ? archive.teamOne.points : archive.teamTwo.points,
        opponentTeamPoints: team.sideNumber === 1 ? archive.teamTwo.points : archive.teamOne.points,
        matches: archive.matches,
      })),
    };
  });
}

export function buildCompletedHistoryPresentation(data = {}) {
  const year = Number(data?.tournament?.tournament_year);
  if (!isCompletedHistoryYear(year)) throw new Error("A certified completed History year is required.");
  const players = playerRows(data);
  const teams = teamRows(data, players);
  if (teams.length !== 2 || !teams.every((team) => team.roster.length)) {
    throw new Error(`${year} completed History team/roster presentation is incomplete.`);
  }
  const courses = courseRows(data);
  const matches = publicMatchRows(data, teams, players, courses);
  const rawMatches = rawMatchRows(data, matches);
  const tournament = tournamentRow(data, teams, courses, players);
  const analytics = scorecardAnalytics(data, players, teams, courses, rawMatches);
  const leaderboard = leaderboardRows(data, players, teams, matches);
  const archives = roundArchives(data, tournament, matches);
  const seasons = teamSeasons(tournament, archives);
  const roundPoints = archives.map((archive) => ({
    round: archive.round,
    roundLabel: `Round ${archive.round}`,
    course: archive.course?.Course || "",
    format: archive.format,
    pointsAvailable: archive.teamOne.points === null || archive.teamTwo.points === null
      ? null
      : archive.teamOne.points + archive.teamTwo.points,
  }));
  const playerDirectory = [...players.values()];
  const recordEligibility = list(data.record_eligibility).map((row) => ({
    matchId: clean(row.match_id),
    playerId: clean(row.player_id),
    includeOfficialRecord: row.is_record_eligible !== false,
    reasonCode: clean(row.reason_code),
    includeScorecardAnalytics: object(row.source_payload).include_scorecard_analytics !== false,
  }));
  return {
    source: "supabase",
    year,
    tournament,
    tournaments: [tournament],
    players: playerDirectory,
    playerDirectory,
    teams: seasons,
    matches,
    rawMatches,
    rounds: archives,
    roundPoints,
    leaderboardRows: leaderboard,
    scorecardAnalytics: analytics,
    analytics,
    recordEligibility,
    corrections: list(data.corrections),
    revision: object(data.revision),
    diagnostics: {
      adapterContract: "completed-history-presentation-v1",
      adapterFingerprint: fingerprint({
        revisionId: clean(data.revision?.revision_id),
        year,
        tournament,
        matches,
        scorecards: list(data.scorecards).map((row) => ({
          id: clean(row.scorecard_id),
          coverage: clean(row.coverage_status),
          holes: list(row.hole_values),
        })),
      }),
      googleForegroundRequests: 0,
      counts: {
        teams: teams.length,
        roster: teams.reduce((sum, team) => sum + team.roster.length, 0),
        rounds: archives.length,
        matches: matches.length,
        scorecards: list(data.scorecards).length,
      },
    },
  };
}

export function completedHistoryTournamentPageModel(view = {}) {
  return {
    tournament: view.tournament || null,
    roundPoints: list(view.roundPoints),
    leaderboardRows: list(view.leaderboardRows),
    previousYear: Number(view.year) > 2017 ? Number(view.year) - 1 : null,
    nextYear: Number(view.year) < 2025 ? Number(view.year) + 1 : 2026,
    scorecardAnalytics: view.scorecardAnalytics || view.analytics || null,
    tournamentMatches: list(view.rawMatches),
    playerDirectory: list(view.playerDirectory),
  };
}

export function completedHistoryRoundPageModel(view = {}, round) {
  const archive = list(view.rounds).find((item) => Number(item.round) === Number(round));
  return archive ? {
    archive,
    scorecardAnalytics: view.scorecardAnalytics || view.analytics || null,
    tournamentMatches: list(view.rawMatches).filter((match) => Number(match.Round) === Number(round)),
    playerDirectory: list(view.playerDirectory),
  } : null;
}

export function completedHistoryTeamPageModel(view = {}, side) {
  const requested = clean(side).toLowerCase();
  return list(view.teams).find((team) =>
    clean(team.side).toLowerCase() === requested ||
    clean(team.id).toLowerCase() === requested
  ) || null;
}

export function completedHistoryResolvePlayer(view = {}, slug) {
  const requested = slugify(slug);
  return list(view.playerDirectory).find((player) => player.slug === requested) || null;
}
