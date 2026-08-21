import { createHash } from "node:crypto";

import { parseNumericValue } from "./formatters.js";
import { legacyHistoryMatchPlayerIds } from "./legacy-history-player-identity.js";
import { validateGhostMatchRows } from "./ghost-match.js";
import { officialStrokeValue } from "./scorecard-analytics.js";
import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

export const COMPLETED_HISTORY_FIRST_YEAR = 2017;
export const COMPLETED_HISTORY_LAST_YEAR = 2025;
export const COMPLETED_HISTORY_CONTRACT_VERSION = "completed-history-v1";
export const COMPLETED_HISTORY_IMPORTER_VERSION = "step6a-importer-v1";
export const COMPLETED_HISTORY_CORRECTION_SET_VERSION = "legacy-history-corrections-v1";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const integer = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};
const numeric = (value) => parseNumericValue(value);
const boolean = (value) => ["TRUE", "YES", "Y", "1"].includes(upper(value));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function completedHistoryCanonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function completedHistoryFingerprint(value) {
  return createHash("sha256").update(completedHistoryCanonicalJson(value)).digest("hex");
}

export const COMPLETED_HISTORY_CORRECTIONS = Object.freeze([
  {
    id: "2019-production-points-and-team-identity",
    year: 2019,
    entity: "TOURNAMENT_AND_MATCHES",
    action: "REJECT_STALE_BUNDLED_FALLBACK",
    canonical: { finalScore: "37-28", winningTeamId: "JJSINGH" },
    evidence: "docs/history-2017-2022-step3c-evidence-audit.md",
  },
  {
    id: "2020-production-match-points",
    year: 2020,
    entity: "TOURNAMENT_AND_MATCHES",
    action: "REJECT_STALE_BUNDLED_FALLBACK",
    canonical: { finalScore: "47-31" },
    evidence: "docs/history-2017-2022-step3c-evidence-audit.md",
  },
  {
    id: "2023-r3-7-production-result",
    year: 2023,
    entity: "MATCH",
    key: "2023-R3-7",
    action: "REJECT_STALE_BUNDLED_FALLBACK",
    canonical: { participants: ["SS01", "JP01"], winner: "TEAM_1", points: [2, 1] },
    evidence: "docs/history-player-career-step4a-authority-audit.md",
  },
  {
    id: "2023-pete-dye-course-appearance-alias",
    year: 2023,
    entity: "COURSE_APPEARANCE",
    key: "PDC02",
    action: "NORMALIZE_STABLE_IDENTITY",
    canonical: { stableCourseId: "PDC01" },
    evidence: "test/course-archive-organization.test.mjs",
  },
  {
    id: "2023-round-3-scorecard-course-context",
    year: 2023,
    entity: "SCORECARD",
    key: "ROUND_3",
    action: "RESOLVE_UNIQUE_ROUND_FORMAT_COURSE",
    canonical: {
      sourceCourseId: "PDC02",
      roundNumber: 3,
      courseId: "DRC01",
      requireCompleteHoleConfiguration: true,
    },
    evidence: "lib/history-2023-projection.js",
  },
  {
    id: "2024-round-2-match-4-stroke-semantics",
    year: 2024,
    entity: "MATCH_HANDICAP",
    key: "2024-R2-4",
    action: "PRESERVE_PRESENT_BLANK_AS_ZERO",
    canonical: { team1Strokes: 1, team2Strokes: 0, winner: "HALVED" },
    evidence: "test/history-step3b1-2024-migration.test.mjs",
  },
  {
    id: "2024-course-tee-complete-hole-resolution",
    year: 2024,
    entity: "COURSE_HOLE_CONFIGURATION",
    action: "REQUIRE_UNIQUE_COMPLETE_TEE_CONFIGURATION",
    canonical: { appearances: 3, holesPerAppearance: 18 },
    evidence: "test/history-step3b1a-2024-net-semantics.test.mjs",
  },
  {
    id: "2025-production-team-and-award-source",
    year: 2025,
    entity: "TOURNAMENT",
    action: "REJECT_STALE_BUNDLED_FALLBACK",
    canonical: { team2Id: "CRISPYBOYS", awards: 1 },
    evidence: "production historical workbook",
  },
  {
    id: "legacy-singles-player-two-placeholder",
    years: [2020, 2021, 2022, 2023, 2024, 2025],
    entity: "MATCH_PARTICIPANT",
    action: "IGNORE_NON_PARTICIPANT_SLOT",
    canonical: { singlesParticipantSlots: [1] },
    evidence: "lib/legacy-history-player-identity.js",
  },
]);

export const COMPLETED_HISTORY_CORRECTION_SET_FINGERPRINT = completedHistoryFingerprint({
  version: COMPLETED_HISTORY_CORRECTION_SET_VERSION,
  corrections: COMPLETED_HISTORY_CORRECTIONS,
});

export function isCompletedHistoryYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= COMPLETED_HISTORY_FIRST_YEAR && year <= COMPLETED_HISTORY_LAST_YEAR;
}

function rowYear(row) {
  return Number(row?.Year ?? row?.year);
}

function roundNumber(value) {
  const parsed = Number(clean(value).replace(/\D/g, ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function teamSide(value) {
  const match = clean(value).match(/(?:team\s*)?([12])$/i);
  return match ? Number(match[1]) : null;
}

function formatCode(value) {
  const format = upper(value);
  if (["BB", "BEST BALL", "BESTBALL", "2 VS 2"].includes(format)) return "BB";
  if (["SC", "SCRAMBLE", "2-MAN SCRAMBLE", "2 MAN SCRAMBLE"].includes(format)) return "SC";
  if (["SI", "SINGLES", "SINGLE"].includes(format)) return "SI";
  return format;
}

function winnerSide(value) {
  const normalized = upper(value).replace(/[^A-Z0-9]/g, "");
  if (["TEAM1", "1"].includes(normalized)) return "TEAM_1";
  if (["TEAM2", "2"].includes(normalized)) return "TEAM_2";
  if (["HALVED", "TIE", "TIED", "PUSH"].includes(normalized)) return "HALVED";
  return null;
}

function sourceRow(row = {}) {
  return Object.fromEntries(Object.entries(row));
}

function parseDates(label, year) {
  const months = {
    JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
    JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
  };
  const match = clean(label).match(/^([A-Za-z]+)\s+(\d{1,2})\s*[-–—]\s*(?:(?:([A-Za-z]+)\s+)?)(\d{1,2}),\s*(\d{4})$/);
  if (!match) return { startDate: null, endDate: null };
  const startMonth = months[upper(match[1])];
  const endMonth = months[upper(match[3] || match[1])];
  const parsedYear = Number(match[5] || year);
  if (!startMonth || !endMonth || parsedYear !== Number(year)) return { startDate: null, endDate: null };
  const iso = (month, day) => `${parsedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { startDate: iso(startMonth, Number(match[2])), endDate: iso(endMonth, Number(match[4])) };
}

function scopedRows(source, key, year) {
  return (Array.isArray(source?.[key]) ? source[key] : []).filter((row) => rowYear(row) === year);
}

function correctionApplies(correction, year) {
  return correction.year === year || correction.years?.includes(year);
}

function matchIdsForYear(matches) {
  return new Set(matches.map((row) => clean(row?.["Match ID"])).filter(Boolean));
}

function referencedPlayerIds({ roster, matches, awards, ghostRows }) {
  const ids = new Set(roster.map((row) => clean(row?.["Player ID"])).filter(Boolean));
  for (const row of matches) {
    for (const side of [1, 2]) {
      for (const id of legacyHistoryMatchPlayerIds(row, side)) ids.add(id);
    }
  }
  for (const row of awards) if (clean(row?.Winner)) ids.add(clean(row.Winner));
  for (const row of ghostRows) if (clean(row?.["Player ID"])) ids.add(clean(row["Player ID"]));
  return ids;
}

function scopeSource(source, year) {
  if (!isCompletedHistoryYear(year)) throw new Error("A completed History year from 2017 through 2025 is required.");
  const tournaments = scopedRows(source, "tournaments", year);
  const teams = scopedRows(source, "teamNames", year);
  const matches = scopedRows(source, "matches", year);
  const rules = scopedRows(source, "rules", year);
  const awards = scopedRows(source, "awards", year);
  const courses = scopedRows(source, "courses", year);
  const roster = scopedRows(source, "handicaps", year);
  const scorecards = scopedRows(source, "roundScorecards", year);
  const roundDefinitions = (source?.rounds || []).map(sourceRow);
  const matchIds = matchIdsForYear(matches);
  const ghostRows = (source?.ghostMatches || []).filter((row) => matchIds.has(clean(row?.["Match ID"])));
  const playerIds = referencedPlayerIds({ roster, matches, awards, ghostRows });
  const players = (source?.players || []).filter((row) => playerIds.has(clean(row?.["Player ID"])));
  const courseIds = new Set([
    ...courses.map((row) => upper(row?.["Course ID"])),
    ...scorecards.map((row) => upper(row?.["Course ID"])),
  ].filter(Boolean));
  const courseHoles = (source?.courseHoles || []).filter((row) => courseIds.has(upper(row?.["Course ID"])));
  return { tournaments, teams, matches, rules, awards, courses, roster, scorecards, ghostRows, players, courseHoles, roundDefinitions };
}

function sourceFingerprintInput(scope, year) {
  const collections = Object.fromEntries(Object.entries(scope).map(([key, rows]) => [
    key,
    rows.map(sourceRow).sort((left, right) => completedHistoryCanonicalJson(left).localeCompare(completedHistoryCanonicalJson(right))),
  ]));
  return {
    contract: "legacy-history-source-v1",
    workbookId: PRODUCTION_SPREADSHEET_ID,
    year,
    collections,
  };
}

function stableCourseId(year, sourceCourseId) {
  const sourceId = upper(sourceCourseId);
  const correction = COMPLETED_HISTORY_CORRECTIONS.find((item) =>
    correctionApplies(item, Number(year)) &&
    item.entity === "COURSE_APPEARANCE" &&
    upper(item.key) === sourceId &&
    clean(item.canonical?.stableCourseId)
  );
  return upper(correction?.canonical?.stableCourseId || sourceId);
}

function canonicalPlayers(scope) {
  return scope.players.map((row) => ({
    player_id: clean(row["Player ID"]),
    display_name: clean(row["Display Name"] || `${clean(row.First)} ${clean(row.Last)}`),
    first_name: clean(row.First) || null,
    last_name: clean(row.Last) || null,
    slug: clean(row.Slug) || null,
    source_alias: clean(row["Display Name"]) || null,
  })).sort((left, right) => left.player_id.localeCompare(right.player_id));
}

function canonicalTeams(scope, year) {
  return scope.teams.map((row) => ({
    tournament_id: String(year),
    team_id: clean(row["Team ID"]),
    team_side: teamSide(row["Team Side"]),
    name: clean(row["Team Names"]),
    captain_player_id: clean(row.Captain) || null,
    logo: clean(row["Team Logo"]) || null,
    primary_color: clean(row["Primary Color"]) || null,
    secondary_color: clean(row["Secondary Color"]) || null,
    motto: clean(row.Motto) || null,
    description: clean(row.Description) || null,
  })).sort((left, right) => left.team_side - right.team_side);
}

function canonicalRoster(scope, year, teams, playerMap) {
  const teamBySide = new Map(teams.map((team) => [team.team_side, team]));
  return scope.roster.map((row, index) => {
    const playerId = clean(row["Player ID"]);
    const side = teamSide(row["Team Side"]);
    const team = teamBySide.get(side);
    const player = playerMap.get(playerId);
    if (!team || !player) throw new Error(`${year} roster identity ${playerId || "(missing)"} does not resolve.`);
    const handicap = numeric(row["Tournament Handicap"]);
    return {
      tournament_id: String(year),
      player_id: playerId,
      team_id: team.team_id,
      team_side: side,
      roster_order: index + 1,
      tournament_handicap: handicap,
      handicap_state: handicap === null ? "UNAVAILABLE" : "RECORDED",
      handicap_method: clean(row["Handicap Method"]) || null,
      captain: team.captain_player_id === playerId,
      governor: null,
      source_roster_key: `${year}:${playerId}`,
    };
  });
}

function canonicalCourses(scope, year) {
  const appearances = scope.courses.map((row) => {
    const round = roundNumber(row.Round);
    const sourceId = upper(row["Course ID"]);
    const stableId = stableCourseId(year, sourceId);
    const tee = clean(row["Tee Played"]);
    const holeRows = scope.courseHoles
      .filter((hole) => upper(hole["Course ID"]) === sourceId && upper(hole.Tee) === upper(tee))
      .sort((left, right) => Number(left["Hole Number"]) - Number(right["Hole Number"]));
    const holes = holeRows.map((hole) => ({
      hole_number: integer(hole["Hole Number"]),
      yardage: integer(hole.Yardage),
      par: integer(hole.Par),
      stroke_index: integer(hole["Stroke Index"]),
    }));
    const completeSequence = (values) =>
      values.length === 18 && values.every((value, index) => value === index + 1);
    const completeHoleConfiguration = holes.length === 18 &&
      completeSequence(holes.map((hole) => hole.hole_number).sort((left, right) => left - right)) &&
      completeSequence(holes.map((hole) => hole.stroke_index).sort((left, right) => left - right)) &&
      holes.every((hole) => Number.isFinite(hole.par) && hole.par > 0);
    if (holes.length && !completeHoleConfiguration) {
      throw new Error(`${year} Round ${round} has an incomplete or ambiguous Course Holes configuration.`);
    }
    return {
      appearance_id: `${year}-R${round}`,
      tournament_id: String(year),
      year,
      round_number: round,
      source_course_id: sourceId,
      course_id: stableId,
      course_name: clean(row.Course),
      city: clean(row.City) || null,
      state: clean(row.State) || null,
      destination: clean(row.Destination) || null,
      tee: tee || null,
      slope: integer(row.Slope),
      rating: numeric(row.Rating),
      yardage: integer(row.Yardage),
      par: integer(row.Par),
      designer: clean(row.Designer) || null,
      website: clean(row.Website) || null,
      logo: clean(row["Course Logo"]) || null,
      profile_image: clean(row["Course Profile Image"]) || null,
      hole_configuration_state: completeHoleConfiguration ? "COMPLETE" : "UNAVAILABLE",
      holes,
    };
  }).sort((left, right) => left.round_number - right.round_number);
  const courses = [...new Map(appearances.map((appearance) => [appearance.course_id, {
    course_id: appearance.course_id,
    name: appearance.course_name,
    city: appearance.city,
    state: appearance.state,
  }])).values()].sort((left, right) => left.course_id.localeCompare(right.course_id));
  return { courses, appearances };
}

function canonicalRounds(scope, year, appearances) {
  const formatNames = new Map((scope.roundDefinitions || []).map((row) => [formatCode(row["Format ID"]), clean(row.Name)]));
  const appearanceByRound = new Map(appearances.map((item) => [item.round_number, item]));
  return scope.rules.map((row) => {
    const round = roundNumber(row.Round);
    const format = formatCode(row.Format);
    const pointsAvailable = numeric(row["Points Available"]);
    return {
      tournament_id: String(year),
      round_number: round,
      format,
      name: formatNames.get(format) || format,
      team_size: integer(row["Team Size"]),
      course_appearance_id: appearanceByRound.get(round)?.appearance_id || null,
      points_available: pointsAvailable,
      scoring_contract: {
        front_used: boolean(row["Front 9 Used"]),
        back_used: boolean(row["Back 9 Used"]),
        overall_used: boolean(row["Overall Used"]),
        front_points: numeric(row["Front 9 Points"]),
        back_points: numeric(row["Back 9 Points"]),
        overall_points: numeric(row["Overall Points"]),
        evidence_state: pointsAvailable === null ? "UNAVAILABLE" : "RECORDED",
      },
    };
  }).sort((left, right) => left.round_number - right.round_number);
}

function canonicalMatchParticipants(match, format, rosterByPlayer) {
  return [1, 2].flatMap((side) => legacyHistoryMatchPlayerIds(match, side).map((playerId, index) => {
    if (!rosterByPlayer.has(playerId)) throw new Error(`${clean(match["Match ID"])} participant ${playerId} is not in the year roster.`);
    const slot = index + 1;
    const playingHandicap = numeric(match[`Team ${side} Player ${slot} Playing HCP`]);
    const appliedStroke = officialStrokeValue(match, side, slot);
    return {
      match_id: clean(match["Match ID"]),
      player_id: playerId,
      team_side: side,
      player_slot: slot,
      playing_handicap: playingHandicap,
      playing_handicap_state: playingHandicap === null ? "UNAVAILABLE" : "RECORDED",
      applied_strokes: appliedStroke,
      applied_strokes_state: appliedStroke === null ? "UNAVAILABLE" : "RECORDED",
      format,
    };
  }));
}

function canonicalScorecards(scope, year, matchMap, teamBySide, appearanceByRound) {
  return scope.scorecards.map((row) => {
    const matchId = clean(row["Match ID"]);
    const match = matchMap.get(matchId);
    if (!match) throw new Error(`${year} scorecard ${matchId} has no canonical match.`);
    const round = roundNumber(row.Round);
    const appearance = appearanceByRound.get(round);
    if (!appearance || formatCode(row.Format) !== match.format) {
      throw new Error(`${matchId} scorecard course context is not uniquely resolvable.`);
    }
    const sourceCourseId = upper(row["Course ID"]);
    const exactCourseContext = sourceCourseId === appearance.source_course_id;
    const correction = COMPLETED_HISTORY_CORRECTIONS.find((item) =>
      correctionApplies(item, Number(year)) &&
      item.entity === "SCORECARD" &&
      Number(item.canonical?.roundNumber) === round &&
      upper(item.canonical?.sourceCourseId) === sourceCourseId &&
      upper(item.canonical?.courseId) === appearance.course_id
    );
    const correctedCourseContext = Boolean(correction) &&
      (!correction.canonical?.requireCompleteHoleConfiguration || appearance.holes.length === 18);
    if (!exactCourseContext && !correctedCourseContext) {
      throw new Error(`${matchId} scorecard Course ID ${sourceCourseId || "(missing)"} does not match its canonical round course.`);
    }
    const scoreType = upper(row["Score Type"]) === "TEAM" ? "TEAM" : "INDIVIDUAL";
    const playerId = scoreType === "INDIVIDUAL" ? clean(row["Player ID"]) : null;
    const teamId = scoreType === "TEAM" ? clean(row["Team ID"]) : null;
    if (scoreType === "INDIVIDUAL" && !match.participant_ids.includes(playerId)) {
      throw new Error(`${matchId} scorecard player ${playerId} is not a match participant.`);
    }
    if (scoreType === "TEAM" && ![teamBySide.get(1)?.team_id, teamBySide.get(2)?.team_id].includes(teamId)) {
      throw new Error(`${matchId} scorecard team ${teamId} is not a tournament team.`);
    }
    const holes = Array.from({ length: 18 }, (_, index) => numeric(row[`Hole ${index + 1}`]));
    const recordedHoleCount = holes.filter((value) => value !== null).length;
    const declared = upper(row["Scorecard Status"]);
    const availability = recordedHoleCount === 18 && ["COMPLETE", "VERIFIED", ""].includes(declared)
      ? "COMPLETE"
      : recordedHoleCount > 0 ? "PARTIAL" : "UNAVAILABLE";
    return {
      scorecard_id: `${matchId}|${scoreType}|${playerId || teamId}`,
      match_id: matchId,
      year,
      round_number: round,
      format: match.format,
      score_type: scoreType,
      player_id: playerId,
      team_id: teamId,
      source_course_id: sourceCourseId,
      course_id: appearance.course_id,
      course_appearance_id: appearance.appearance_id,
      availability,
      source_status: declared || null,
      recorded_hole_count: recordedHoleCount,
      holes,
      source: clean(row.Source) || null,
      notes: clean(row.Notes) || null,
    };
  }).sort((left, right) => left.scorecard_id.localeCompare(right.scorecard_id));
}

function scorecardCoverage(matches, scorecards, teams) {
  const teamIds = teams.map((team) => team.team_id);
  return matches.map((match) => {
    const cards = scorecards.filter((card) => card.match_id === match.match_id);
    const expectedIds = match.format === "SC"
      ? teamIds.map((teamId) => `${match.match_id}|TEAM|${teamId}`)
      : match.participant_ids.map((playerId) => `${match.match_id}|INDIVIDUAL|${playerId}`);
    const cardById = new Map(cards.map((card) => [card.scorecard_id, card]));
    const expectedCards = expectedIds.map((id) => cardById.get(id)).filter(Boolean);
    const complete = expectedCards.filter((card) => card.availability === "COMPLETE").length;
    const partial = expectedCards.filter((card) => card.availability === "PARTIAL").length;
    const unavailable = expectedIds.length - complete - partial;
    const state = complete === expectedIds.length && expectedIds.length > 0
      ? "COMPLETE"
      : complete > 0 || partial > 0 ? "PARTIAL" : "UNAVAILABLE";
    return {
      match_id: match.match_id,
      evidence_depth: state === "COMPLETE" ? "COMPLETE_SCORECARD" : state === "PARTIAL" ? "PARTIAL_SCORECARD" : "RESULT_ONLY",
      scorecard_state: state,
      expected_scorecards: expectedIds.length,
      complete_scorecards: complete,
      partial_scorecards: partial,
      unavailable_scorecards: unavailable,
    };
  });
}

function canonicalMatches(scope, year, rounds, appearances, roster) {
  const roundMap = new Map(rounds.map((round) => [round.round_number, round]));
  const appearanceByRound = new Map(appearances.map((appearance) => [appearance.round_number, appearance]));
  const rosterByPlayer = new Map(roster.map((row) => [row.player_id, row]));
  const participants = [];
  const matches = scope.matches.map((row) => {
    const matchId = clean(row["Match ID"]);
    const round = integer(row.Round);
    const format = formatCode(row.Format);
    if (!matchId || !roundMap.has(round) || roundMap.get(round).format !== format) {
      throw new Error(`${year} match ${matchId || "(missing)"} has an invalid round/format contract.`);
    }
    const matchParticipants = canonicalMatchParticipants(row, format, rosterByPlayer);
    participants.push(...matchParticipants);
    const team1Points = numeric(row["Team 1 Points"]);
    const team2Points = numeric(row["Team 2 Points"]);
    const winner = winnerSide(row["Matchup Winner"] || row["18-Hole Winner"]);
    if (!winner) throw new Error(`${matchId} has no official result.`);
    if ((team1Points === null) !== (team2Points === null)) throw new Error(`${matchId} has a partial team-point allocation.`);
    if ([team1Points, team2Points].some((points) => points !== null && !Number.isInteger(points * 2))) {
      throw new Error(`${matchId} points are not exact half-point facts.`);
    }
    const roundPoints = roundMap.get(round).points_available;
    if (team1Points !== null && roundPoints !== null && team1Points + team2Points !== roundPoints) {
      throw new Error(`${matchId} points do not conserve the configured match total.`);
    }
    const pointsLeader = team1Points === null ? null
      : team1Points === team2Points ? "HALVED"
      : team1Points > team2Points ? "TEAM_1"
      : "TEAM_2";
    const appearance = appearanceByRound.get(round);
    return {
      match_id: matchId,
      tournament_id: String(year),
      year,
      round_number: round,
      match_number: integer(row.Match),
      display_order: round * 100 + integer(row.Match, 0),
      format,
      course_id: appearance?.course_id || null,
      course_appearance_id: appearance?.appearance_id || null,
      lifecycle: "FINAL",
      source_match_status: clean(row["Match Status"]) || null,
      winner_side: winner,
      result_text: clean(row["Matchup Winner"] || row["18-Hole Winner"]),
      team_1_points: team1Points,
      team_2_points: team2Points,
      point_state: team1Points === null ? "UNAVAILABLE" : "RECORDED",
      result_semantics: {
        winner_contract: "SOURCE_MATCHUP_RESULT",
        points_contract: "NASSAU_TOURNAMENT_CONTRIBUTION",
        points_leader: pointsLeader,
        winner_points_alignment: pointsLeader === null ? "UNAVAILABLE"
          : pointsLeader === winner ? "ALIGNED" : "LEGACY_SOURCE_DIVERGENCE",
      },
      segments: {
        front: winnerSide(row["Front 9 Winner"]),
        back: winnerSide(row["Back 9 Winner"]),
        overall: winnerSide(row["18-Hole Winner"]),
      },
      team_handicaps: {
        team_1_playing_handicap: numeric(row["Team 1 Playing HCP"]),
        team_1_strokes: officialStrokeValue(row, 1),
        team_2_playing_handicap: numeric(row["Team 2 Playing HCP"]),
        team_2_strokes: officialStrokeValue(row, 2),
      },
      participant_ids: matchParticipants.map((participant) => participant.player_id),
      evidence_depth: "RESULT_ONLY",
      scorecard_state: "UNAVAILABLE",
      notes: clean(row.Notes) || null,
    };
  }).sort((left, right) => left.display_order - right.display_order);
  return { matches, participants };
}

function tournamentResult({ tournamentRow, year, teams, matches, rounds }) {
  const team1PointsAvailable = matches.every((match) => match.team_1_points !== null && match.team_2_points !== null);
  const team1Points = team1PointsAvailable ? matches.reduce((sum, match) => sum + match.team_1_points, 0) : null;
  const team2Points = team1PointsAvailable ? matches.reduce((sum, match) => sum + match.team_2_points, 0) : null;
  const winningTeamName = clean(tournamentRow["Winning Team"]);
  const runnerUpName = clean(tournamentRow["Runner-Up Team"]);
  const champion = teams.find((team) => team.name === winningTeamName);
  const runnerUp = teams.find((team) => team.name === runnerUpName);
  if (!champion || !runnerUp || champion.team_side === runnerUp.team_side) {
    throw new Error(`${year} champion and runner-up do not resolve to distinct canonical teams.`);
  }
  const sidePoints = (side) => side === 1 ? team1Points : team2Points;
  const officialFinal = team1PointsAvailable
    ? { champion_points: sidePoints(champion.team_side), runner_up_points: sidePoints(runnerUp.team_side) }
    : { champion_points: null, runner_up_points: null };
  const configuredPoints = rounds.every((round) => round.points_available !== null)
    ? rounds.reduce((sum, round) => sum + matches.filter((match) => match.round_number === round.round_number).length * round.points_available, 0)
    : null;
  const awardedPoints = team1PointsAvailable ? team1Points + team2Points : null;
  if (configuredPoints !== null && awardedPoints !== configuredPoints) {
    throw new Error(`${year} awarded points ${awardedPoints} do not reconcile with configured points ${configuredPoints}.`);
  }
  const storedFinal = clean(tournamentRow["Final Score"]);
  if (team1PointsAvailable && storedFinal) {
    const parsed = storedFinal.split(/\s*[-–—]\s*/).map(numeric);
    if (parsed.length !== 2 || parsed[0] !== officialFinal.champion_points || parsed[1] !== officialFinal.runner_up_points) {
      throw new Error(`${year} stored Final does not reconcile with canonical match facts.`);
    }
  }
  return {
    availability: team1PointsAvailable ? "RECORDED" : "UNAVAILABLE",
    champion_team_id: champion.team_id,
    runner_up_team_id: runnerUp.team_id,
    champion_points: officialFinal.champion_points,
    runner_up_points: officialFinal.runner_up_points,
    team_1_points: team1Points,
    team_2_points: team2Points,
    awarded_points: awardedPoints,
    configured_points: configuredPoints,
    stored_final: storedFinal || null,
    reconciles: team1PointsAvailable ? true : null,
  };
}

function canonicalAwards(scope, year, playerMap, rosterByPlayer) {
  return scope.awards.map((row) => {
    const winnerPlayerId = clean(row.Winner);
    if (!playerMap.has(winnerPlayerId) || !rosterByPlayer.has(winnerPlayerId)) {
      throw new Error(`${year} award winner ${winnerPlayerId || "(missing)"} does not resolve to the year roster.`);
    }
    const awardName = clean(row.Award);
    const awardId = upper(awardName).replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    return {
      award_id: awardId,
      tournament_id: String(year),
      award_name: awardName,
      winner_type: "PLAYER",
      winner_player_id: winnerPlayerId,
      source_winner: winnerPlayerId,
    };
  }).sort((left, right) => left.award_id.localeCompare(right.award_id));
}

function canonicalRecordEligibility(scope, matches, participants) {
  const matchMap = new Map(matches.map((match) => [match.match_id, match]));
  const excluded = new Set(scope.ghostRows.map((row) => `${clean(row["Match ID"])}|${clean(row["Player ID"])}`));
  for (const row of scope.ghostRows) {
    const matchId = clean(row["Match ID"]);
    const playerId = clean(row["Player ID"]);
    const match = matchMap.get(matchId);
    if (!match || !match.participant_ids.includes(playerId)) {
      throw new Error(`Ghost Match exclusion ${matchId}/${playerId} does not resolve to a canonical participant.`);
    }
  }
  return participants.map((participant) => {
    const key = `${participant.match_id}|${participant.player_id}`;
    const eligible = !excluded.has(key);
    return {
      match_id: participant.match_id,
      player_id: participant.player_id,
      include_official_record: eligible,
      include_scorecard_analytics: true,
      reason: eligible ? "CANONICAL_OFFICIAL_MATCH" : "LEGACY_GHOST_MATCH_PARTICIPANT_EXCLUSION",
    };
  }).sort((left, right) => `${left.match_id}|${left.player_id}`.localeCompare(`${right.match_id}|${right.player_id}`));
}

function assertKnownCorrections(year, payload) {
  if (year === 2019) {
    if (payload.tournament.result.champion_points !== 37 || payload.tournament.result.runner_up_points !== 28 || payload.tournament.result.champion_team_id !== "JJSINGH") {
      throw new Error("2019 canonical correction assertions failed.");
    }
  }
  if (year === 2020 && (payload.tournament.result.champion_points !== 47 || payload.tournament.result.runner_up_points !== 31)) {
    throw new Error("2020 canonical correction assertions failed.");
  }
  if (year === 2023) {
    const match = payload.matches.find((item) => item.match_id === "2023-R3-7");
    if (!match || match.winner_side !== "TEAM_1" || match.team_1_points !== 2 || match.team_2_points !== 1 || !match.participant_ids.includes("SS01") || !match.participant_ids.includes("JP01")) {
      throw new Error("2023-R3-7 canonical correction assertions failed.");
    }
    const roundThreeCards = payload.scorecards.filter((card) => card.round_number === 3);
    if (roundThreeCards.some((card) => card.course_id !== "DRC01")) {
      throw new Error("2023 Round 3 scorecard course correction assertions failed.");
    }
  }
  if (year === 2024) {
    const match = payload.matches.find((item) => item.match_id === "2024-R2-4");
    if (!match || match.winner_side !== "HALVED" || match.team_handicaps.team_1_strokes !== 1 || match.team_handicaps.team_2_strokes !== 0) {
      throw new Error("2024-R2-4 canonical stroke correction assertions failed.");
    }
    if (payload.course_appearances.length !== 3 || payload.course_appearances.some((appearance) => appearance.holes.length !== 18)) {
      throw new Error("2024 Course Holes correction assertions failed.");
    }
  }
  if (year === 2025 && (!payload.teams.some((team) => team.team_id === "CRISPYBOYS") || payload.awards.length !== 1)) {
    throw new Error("2025 canonical source correction assertions failed.");
  }
}

export function buildCompletedHistoryYearContract({ source, year, requestedBy = "preview-director" } = {}) {
  const targetYear = Number(year);
  const scope = scopeSource(source, targetYear);
  if (scope.tournaments.length !== 1) throw new Error(`${targetYear} requires exactly one tournament row.`);
  if (scope.teams.length !== 2) throw new Error(`${targetYear} requires exactly two team rows.`);
  if (scope.rules.length !== 3 || scope.courses.length !== 3) throw new Error(`${targetYear} requires exactly three round and course facts.`);
  if (!scope.matches.length || new Set(scope.matches.map((row) => clean(row["Match ID"]))).size !== scope.matches.length) {
    throw new Error(`${targetYear} match identities are incomplete or duplicated.`);
  }
  const ghostWarnings = validateGhostMatchRows({ rows: scope.ghostRows, matches: scope.matches, players: scope.players });
  if (ghostWarnings.length) throw new Error(`${targetYear} Ghost Match evidence is invalid: ${ghostWarnings[0].code}.`);

  const players = canonicalPlayers(scope);
  const playerMap = new Map(players.map((player) => [player.player_id, player]));
  const teams = canonicalTeams(scope, targetYear);
  const roster = canonicalRoster(scope, targetYear, teams, playerMap);
  const rosterByPlayer = new Map(roster.map((row) => [row.player_id, row]));
  const tournamentRow = scope.tournaments[0];
  if (roster.length !== integer(tournamentRow["Team Size"])) throw new Error(`${targetYear} roster count does not match Tournament Team Size.`);
  const { courses, appearances } = canonicalCourses(scope, targetYear);
  const rounds = canonicalRounds(scope, targetYear, appearances);
  const matchBuild = canonicalMatches(scope, targetYear, rounds, appearances, roster);
  const matchMap = new Map(matchBuild.matches.map((match) => [match.match_id, match]));
  const teamBySide = new Map(teams.map((team) => [team.team_side, team]));
  const appearanceByRound = new Map(appearances.map((appearance) => [appearance.round_number, appearance]));
  const scorecards = canonicalScorecards(scope, targetYear, matchMap, teamBySide, appearanceByRound);
  const coverage = scorecardCoverage(matchBuild.matches, scorecards, teams);
  const coverageByMatch = new Map(coverage.map((item) => [item.match_id, item]));
  const matches = matchBuild.matches.map((match) => ({ ...match, ...coverageByMatch.get(match.match_id) }));
  const result = tournamentResult({ tournamentRow, year: targetYear, teams, matches, rounds });
  const dates = parseDates(tournamentRow.Dates, targetYear);
  const awards = canonicalAwards(scope, targetYear, playerMap, rosterByPlayer);
  const recordEligibility = canonicalRecordEligibility(scope, matches, matchBuild.participants);
  const corrections = COMPLETED_HISTORY_CORRECTIONS
    .filter((correction) => correctionApplies(correction, targetYear))
    .map((correction) => ({
      ...correction,
      application: correction.action === "REJECT_STALE_BUNDLED_FALLBACK"
        ? "SOURCE_GUARD"
        : correction.action === "IGNORE_NON_PARTICIPANT_SLOT"
          ? "CONTRACT_RULE"
          : "APPLIED_NORMALIZATION",
    }));
  const sourceFingerprint = completedHistoryFingerprint(sourceFingerprintInput(scope, targetYear));
  const recordedHoleValues = scorecards.reduce((sum, card) => sum + card.recorded_hole_count, 0);
  const payload = {
    contract_version: COMPLETED_HISTORY_CONTRACT_VERSION,
    importer_version: COMPLETED_HISTORY_IMPORTER_VERSION,
    correction_set_version: COMPLETED_HISTORY_CORRECTION_SET_VERSION,
    correction_set_fingerprint: COMPLETED_HISTORY_CORRECTION_SET_FINGERPRINT,
    environment: "PREVIEW",
    project_ref: "idgigvjjqkfbqjeredpb",
    source_workbook_id: PRODUCTION_SPREADSHEET_ID,
    source_year: targetYear,
    source_fingerprint: sourceFingerprint,
    requested_by: clean(requestedBy) || "preview-director",
    tournament: {
      tournament_id: String(targetYear),
      year: targetYear,
      name: clean(tournamentRow["Tournament Name"] || tournamentRow.Annual),
      annual_label: clean(tournamentRow.Annual) || null,
      dates_label: clean(tournamentRow.Dates) || null,
      start_date: dates.startDate,
      end_date: dates.endDate,
      destination: clean(tournamentRow.Destination) || null,
      status: "FINAL",
      team_size: integer(tournamentRow["Team Size"]),
      hero_image: clean(tournamentRow["Hero Image"]) || null,
      result,
    },
    teams,
    players,
    roster,
    rounds,
    courses,
    course_appearances: appearances,
    matches,
    match_participants: matchBuild.participants,
    scorecards,
    awards,
    record_eligibility: recordEligibility,
    corrections,
    counts: {
      tournaments: 1,
      teams: teams.length,
      players: players.length,
      roster: roster.length,
      rounds: rounds.length,
      course_appearances: appearances.length,
      stable_courses: courses.length,
      matches: matches.length,
      match_participants: matchBuild.participants.length,
      point_allocated_matches: matches.filter((match) => match.point_state === "RECORDED").length,
      legacy_result_point_divergences: matches.filter((match) =>
        match.result_semantics.winner_points_alignment === "LEGACY_SOURCE_DIVERGENCE"
      ).length,
      awards: awards.length,
      record_eligibility: recordEligibility.length,
      record_exclusions: recordEligibility.filter((row) => !row.include_official_record).length,
      scorecards: scorecards.length,
      complete_scorecards: scorecards.filter((card) => card.availability === "COMPLETE").length,
      partial_scorecards: scorecards.filter((card) => card.availability === "PARTIAL").length,
      unavailable_scorecards: scorecards.filter((card) => card.availability === "UNAVAILABLE").length,
      complete_match_scorecards: coverage.filter((item) => item.scorecard_state === "COMPLETE").length,
      partial_match_scorecards: coverage.filter((item) => item.scorecard_state === "PARTIAL").length,
      unavailable_match_scorecards: coverage.filter((item) => item.scorecard_state === "UNAVAILABLE").length,
      recorded_hole_values: recordedHoleValues,
      course_hole_rows: appearances.reduce((sum, appearance) => sum + appearance.holes.length, 0),
    },
    parity: {
      tournament_result_reconciles: result.reconciles,
      match_ids_unique: true,
      roster_ids_unique: new Set(roster.map((row) => row.player_id)).size === roster.length,
      player_identity_unresolved: 0,
      course_appearances_unresolved: 0,
      ghost_warnings: 0,
      scorecard_orphans: 0,
    },
  };
  assertKnownCorrections(targetYear, payload);
  const { requested_by: _requestedBy, ...canonicalPayload } = payload;
  const payloadFingerprint = completedHistoryFingerprint(canonicalPayload);
  return { ...payload, payload_fingerprint: payloadFingerprint };
}

export function completedHistoryYearCertificationSummary(payload = {}) {
  const result = payload?.tournament?.result || {};
  return {
    year: Number(payload.source_year),
    sourceFingerprint: clean(payload.source_fingerprint),
    payloadFingerprint: clean(payload.payload_fingerprint),
    counts: payload.counts || {},
    finalScore: result.availability === "RECORDED"
      ? `${result.champion_points}-${result.runner_up_points}`
      : "UNAVAILABLE",
    championTeamId: clean(result.champion_team_id),
    champion: payload.teams?.find((team) => team.team_id === result.champion_team_id)?.name || "",
    corrections: (payload.corrections || []).map((correction) => correction.id),
  };
}

/**
 * Convert the source-certified contract into the normalized database envelope.
 * This is intentionally a mechanical boundary: no scoring or identity facts
 * are recalculated here, and the source/payload fingerprints continue to name
 * the immutable application contract built above.
 */
export function completedHistoryImportEnvelope(payload = {}, {
  authorization,
  correction = null,
} = {}) {
  const year = Number(payload.source_year);
  if (!isCompletedHistoryYear(year) || !payload?.tournament?.result) {
    throw new Error("A complete certified History payload is required.");
  }
  const teamById = new Map((payload.teams || []).map((team) => [team.team_id, team]));
  const playerById = new Map((payload.players || []).map((player) => [player.player_id, player]));
  const rosterByPlayer = new Map((payload.roster || []).map((row) => [row.player_id, row]));
  const participantsByMatch = new Map();
  const roundByNumber = new Map((payload.rounds || []).map((round) => [round.round_number, round]));
  for (const participant of payload.match_participants || []) {
    if (!participantsByMatch.has(participant.match_id)) participantsByMatch.set(participant.match_id, []);
    participantsByMatch.get(participant.match_id).push(participant);
  }
  const result = payload.tournament.result;
  const championTeam = teamById.get(result.champion_team_id);
  const databasePayload = {
    tournament: {
      tournament_id: String(year),
      tournament_year: year,
      name: payload.tournament.name,
      start_date: payload.tournament.start_date,
      end_date: payload.tournament.end_date,
      destination: payload.tournament.destination,
      timezone: null,
      lifecycle: "FINAL",
      score_availability: result.availability,
      official_team_1_points: result.team_1_points,
      official_team_2_points: result.team_2_points,
      total_awarded_points: result.awarded_points,
      expected_configured_points: result.configured_points,
      champion_team_side: championTeam?.team_side || null,
      champion_team_id: result.champion_team_id,
      team_size: payload.tournament.team_size,
      source_payload: {
        annual_label: payload.tournament.annual_label,
        dates_label: payload.tournament.dates_label,
        hero_image: payload.tournament.hero_image,
        runner_up_team_id: result.runner_up_team_id,
        stored_final: result.stored_final,
      },
    },
    teams: (payload.teams || []).map((team) => ({
      team_id: team.team_id,
      team_side: team.team_side,
      name: team.name,
      captain_player_id: team.captain_player_id,
      logo_key: team.logo,
      presentation_identity: {
        primary_color: team.primary_color,
        secondary_color: team.secondary_color,
        motto: team.motto,
        description: team.description,
      },
      source_payload: { tournament_id: team.tournament_id },
    })),
    players: (payload.players || []).map((player) => ({
      player_id: player.player_id,
      display_name: player.display_name,
      source_payload: {
        first_name: player.first_name,
        last_name: player.last_name,
        slug: player.slug,
        source_alias: player.source_alias,
      },
    })),
    roster: (payload.roster || []).map((row) => ({
      player_id: row.player_id,
      display_name: playerById.get(row.player_id)?.display_name,
      team_id: row.team_id,
      team_side: row.team_side,
      participation_status: "ACTIVE",
      is_captain: row.captain === true,
      is_governor: row.governor === null || row.governor === undefined ? null : row.governor === true,
      tournament_handicap: row.tournament_handicap,
      source_roster_key: row.source_roster_key,
      source_payload: {
        roster_order: row.roster_order,
        handicap_state: row.handicap_state,
        handicap_method: row.handicap_method,
        captain_state: "RECORDED",
        governor_state: row.governor === null || row.governor === undefined ? "UNAVAILABLE" : "RECORDED",
      },
    })),
    rounds: (payload.rounds || []).map((round) => ({
      round_number: round.round_number,
      format: round.format,
      name: round.name,
      team_size: round.team_size,
      points_per_match: round.points_available,
      handicap_allowance: null,
      course_appearance_id: round.course_appearance_id,
      scoring_semantics: round.scoring_contract,
      source_payload: {},
    })),
    courses: (payload.courses || []).map((course) => ({
      course_id: course.course_id,
      canonical_name: course.name,
      canonical_location: [course.city, course.state].filter(Boolean).join(", ") || null,
      identity_payload: { city: course.city, state: course.state },
    })),
    course_appearances: (payload.course_appearances || []).map((appearance) => ({
      appearance_id: appearance.appearance_id,
      round_number: appearance.round_number,
      course_id: appearance.course_id,
      source_course_id: appearance.source_course_id,
      display_name: appearance.course_name,
      location: [appearance.city, appearance.state].filter(Boolean).join(", ") || null,
      tee: appearance.tee,
      rating: appearance.rating,
      slope: appearance.slope,
      yardage: appearance.yardage,
      par: appearance.par,
      hole_definitions: appearance.holes,
      source_payload: {
        destination: appearance.destination,
        designer: appearance.designer,
        website: appearance.website,
        logo: appearance.logo,
        profile_image: appearance.profile_image,
        hole_configuration_state: appearance.hole_configuration_state,
      },
    })),
    matches: (payload.matches || []).map((match) => ({
      match_id: match.match_id,
      round_number: match.round_number,
      format: match.format,
      course_appearance_id: match.course_appearance_id,
      lifecycle: "FINAL",
      completion_state: "LEGACY_FINAL",
      scorecard_coverage: match.scorecard_state,
      result: match.result_text,
      result_winner: match.winner_side === "TEAM_1" ? "Team 1" : match.winner_side === "TEAM_2" ? "Team 2" : "Halved",
      team_1_points: match.team_1_points,
      team_2_points: match.team_2_points,
      points_available: match.point_state === "RECORDED" ? roundByNumber.get(match.round_number)?.points_available ?? null : null,
      points_availability: match.point_state,
      source_match_key: match.match_id,
      source_payload: {
        match_number: match.match_number,
        display_order: match.display_order,
        segments: match.segments,
        result_semantics: match.result_semantics,
        team_handicaps: match.team_handicaps,
        source_match_status: match.source_match_status,
        notes: match.notes,
      },
    })),
    match_participants: (payload.match_participants || []).map((participant) => ({
      match_id: participant.match_id,
      player_id: participant.player_id,
      team_side: participant.team_side,
      player_slot: participant.player_slot,
      tournament_handicap: rosterByPlayer.get(participant.player_id)?.tournament_handicap ?? null,
      applied_handicap: participant.playing_handicap,
      applied_strokes: participant.applied_strokes,
      source_payload: {
        playing_handicap_state: participant.playing_handicap_state,
        applied_strokes_state: participant.applied_strokes_state,
      },
    })),
    scorecards: (payload.scorecards || []).map((scorecard) => {
      const participants = participantsByMatch.get(scorecard.match_id) || [];
      const participant = scorecard.player_id
        ? participants.find((row) => row.player_id === scorecard.player_id)
        : null;
      const team = scorecard.team_id ? teamById.get(scorecard.team_id) : null;
      return {
        scorecard_id: scorecard.scorecard_id,
        match_id: scorecard.match_id,
        entity_kind: scorecard.score_type === "TEAM" ? "TEAM" : "PLAYER",
        player_id: scorecard.player_id,
        team_side: participant?.team_side || team?.team_side || null,
        player_slot: participant?.player_slot || null,
        coverage_status: scorecard.availability,
        recorded_holes: scorecard.recorded_hole_count,
        hole_values: scorecard.holes,
        score_semantics: {
          score_type: scorecard.score_type,
          team_id: scorecard.team_id,
          course_id: scorecard.course_id,
          course_appearance_id: scorecard.course_appearance_id,
        },
        source_payload: {
          source_course_id: scorecard.source_course_id,
          source_status: scorecard.source_status,
          source: scorecard.source,
          notes: scorecard.notes,
        },
      };
    }),
    awards: (payload.awards || []).map((award) => ({
      award_id: award.award_id,
      award_type: award.award_id,
      label: award.award_name,
      recipient_kind: award.winner_type,
      winner_player_id: award.winner_player_id,
      winner_team_id: null,
      recipient_display: playerById.get(award.winner_player_id)?.display_name || award.source_winner,
      source_payload: { source_winner: award.source_winner },
    })),
    record_eligibility: (payload.record_eligibility || []).map((row) => ({
      match_id: row.match_id,
      player_id: row.player_id,
      is_record_eligible: row.include_official_record !== false,
      reason_code: row.reason,
      source_payload: { include_scorecard_analytics: row.include_scorecard_analytics !== false },
    })),
    corrections: (payload.corrections || []).map((correction) => ({
      correction_id: correction.id,
      category: correction.entity,
      description: correction.action,
      evidence: { reference: correction.evidence },
      source_payload: {
        key: correction.key || null,
        canonical: correction.canonical || null,
        application: correction.application || "APPLIED_NORMALIZATION",
      },
    })),
  };
  const authorized = authorization || {};
  return {
    environment: "PREVIEW",
    project_ref: payload.project_ref,
    source_workbook_id: payload.source_workbook_id,
    tournament_id: String(year),
    tournament_year: year,
    actor_id: clean(payload.requested_by),
    director_authorization: authorized,
    source_fingerprint: payload.source_fingerprint,
    payload_fingerprint: payload.payload_fingerprint,
    import_contract_version: payload.contract_version,
    correction_set_version: payload.correction_set_version,
    importer_version: payload.importer_version,
    source_counts: payload.counts,
    certification: payload.parity,
    payload: databasePayload,
    ...(correction ? { correction } : {}),
  };
}
