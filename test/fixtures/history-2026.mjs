import { getStrokesOnHole } from "../../lib/scorecard-net.js";

export const HOLMAN_2026_R3_4_GROSS = Object.freeze([
  4, 5, 5, 3, 5, 4, 5, 3, 3, 4, 5, 3, 4, 3, 4, 5, 3, 5,
]);

export const MEMO_2026_R3_4_GROSS = Object.freeze([
  3, 5, 5, 3, 5, 4, 5, 2, 4, 3, 5, 4, 4, 2, 4, 5, 3, 5,
]);

export const JACK_KEFFLER_2026_R1_6_GROSS = Object.freeze([
  5, 4, 5, 4, 5, 4, 5, 4, 4, 5, 4, 5, 4, 5, 4, 5, 4, 4,
]);

export const cloneHistoryFixture = (value) => structuredClone(value);

const formatForRound = (roundNumber) => roundNumber === 1 ? "BB" : roundNumber === 2 ? "SC" : "SI";
const courseForRound = (roundNumber) => ({
  1: { course_id: "TPGC01", name: "Turtle Point", tee: "Blue", rating: 71.2, slope: 132 },
  2: { course_id: "CPGC01", name: "Cougar Point", tee: "Blue", rating: 70.8, slope: 129 },
  3: { course_id: "OCGC01", name: "The Ocean Course", tee: "Gold", rating: 73.2, slope: 141 },
})[roundNumber];

function player(playerId, displayName, teamSide, playerSlot, finalStrokes) {
  return {
    player_id: playerId,
    display_name: displayName,
    slug: displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    team_side: teamSide,
    player_slot: playerSlot,
    handicap_index: finalStrokes,
    course_handicap: finalStrokes,
    playing_handicap: finalStrokes,
    final_strokes: finalStrokes,
  };
}

const PICKLES_ROSTER = Object.freeze([
  "PK01", "PK02", "PK03", "HM01", "PK05", "PK06",
  "PK07", "PK08", "PK09", "PK10", "PK11", "JK02",
]);
const LIPPIT_ROSTER = Object.freeze([
  "LP01", "LP02", "LP03", "MS01", "LP05", "LP06",
  "LP07", "LP08", "LP09", "LP10", "LP11", "LP12",
]);
const PLAYER_NAMES = Object.freeze({
  HM01: "Holman",
  MS01: "Memo Saldana",
  JK02: "Jack Keffler",
});

function rosterPlayer(playerId, side, slot) {
  const finalStrokes = playerId === "JK02" ? 13 : side * 2 + slot;
  return player(playerId, PLAYER_NAMES[playerId] || `Player ${playerId}`, side, slot, finalStrokes);
}

function defaultParticipants(roundNumber, matchNumber, format) {
  if (format === "SI") {
    const index = matchNumber - 1;
    return [
      rosterPlayer(PICKLES_ROSTER[index], 1, 1),
      rosterPlayer(LIPPIT_ROSTER[index], 2, 1),
    ];
  }
  const first = (matchNumber - 1) * 2;
  return [
    rosterPlayer(PICKLES_ROSTER[first], 1, 1),
    rosterPlayer(PICKLES_ROSTER[first + 1], 1, 2),
    rosterPlayer(LIPPIT_ROSTER[first], 2, 1),
    rosterPlayer(LIPPIT_ROSTER[first + 1], 2, 2),
  ];
}

function grossArrays(roundNumber, matchNumber, format, participants, holeNumber) {
  if (roundNumber === 3 && matchNumber === 4) {
    return [[HOLMAN_2026_R3_4_GROSS[holeNumber - 1]], [MEMO_2026_R3_4_GROSS[holeNumber - 1]]];
  }
  const sideOne = format === "BB"
    ? [4 + (holeNumber % 2), 5 - (holeNumber % 2)]
    : [4 + ((holeNumber + matchNumber) % 2)];
  const sideTwo = format === "BB"
    ? [5 - (holeNumber % 2), 4 + (holeNumber % 2)]
    : [5 - ((holeNumber + matchNumber) % 2)];
  if (roundNumber === 1 && matchNumber === 6) sideOne[1] = JACK_KEFFLER_2026_R1_6_GROSS[holeNumber - 1];
  return [sideOne, sideTwo];
}

function strokesForSide(format, participants, side, holeNumber, teamStrokes) {
  if (format === "SC") return [getStrokesOnHole(teamStrokes[side - 1], holeNumber)];
  return participants
    .filter((participant) => participant.team_side === side)
    .sort((left, right) => left.player_slot - right.player_slot)
    .map((participant) => getStrokesOnHole(participant.final_strokes, holeNumber));
}

function holesForMatch(roundNumber, matchNumber, format, participants, teamStrokes) {
  return Array.from({ length: 18 }, (_, index) => {
    const holeNumber = index + 1;
    const [team1Gross, team2Gross] = grossArrays(roundNumber, matchNumber, format, participants, holeNumber);
    const team1Strokes = strokesForSide(format, participants, 1, holeNumber, teamStrokes);
    const team2Strokes = strokesForSide(format, participants, 2, holeNumber, teamStrokes);
    const team1Net = Math.min(...team1Gross.map((gross, slot) => gross - team1Strokes[slot]));
    const team2Net = Math.min(...team2Gross.map((gross, slot) => gross - team2Strokes[slot]));
    return {
      hole_number: holeNumber,
      hole_revision: 10 + holeNumber,
      par: holeNumber % 3 === 0 ? 3 : holeNumber % 5 === 0 ? 5 : 4,
      stroke_index: holeNumber,
      yardage: 350 + holeNumber * 7,
      team_1_gross_scores: team1Gross,
      team_2_gross_scores: team2Gross,
      team_1_strokes: team1Strokes,
      team_2_strokes: team2Strokes,
      team_1_net_score: team1Net,
      team_2_net_score: team2Net,
      hole_winner: team1Net === team2Net ? "Halved" : team1Net < team2Net ? "Team 1" : "Team 2",
    };
  });
}

export function makeHistoryMatch({ roundNumber, matchNumber, status = "FINAL", snapshotRevision = 1 } = {}) {
  const format = formatForRound(roundNumber);
  const matchId = `2026-R${roundNumber}-${matchNumber}`;
  const participants = defaultParticipants(roundNumber, matchNumber, format);
  const course = courseForRound(roundNumber);
  const teamStrokes = [3, 5];
  const holes = holesForMatch(roundNumber, matchNumber, format, participants, teamStrokes);
  const matchRevision = snapshotRevision * 100 + roundNumber * 20 + matchNumber;
  const finalized = status === "FINAL";
  const result = {
    scorecard_complete: finalized,
    completed_holes: finalized ? 18 : 0,
    team_1_holes_won: holes.filter((hole) => hole.hole_winner === "Team 1").length,
    team_2_holes_won: holes.filter((hole) => hole.hole_winner === "Team 2").length,
    halved_holes: holes.filter((hole) => hole.hole_winner === "Halved").length,
    front_result: "Team 1",
    back_result: "Halved",
    overall_result: "Team 1",
    result_winner: "Team 1",
    team_1_points: 2.5,
    team_2_points: 0.5,
  };
  const match = {
    match_id: matchId,
    tournament_id: "2026",
    round_number: roundNumber,
    format,
    status,
    lifecycle: status,
    scorecard_complete: finalized,
    scored_holes: finalized ? 18 : 0,
    display_match_number: String(matchNumber),
    match_revision: matchRevision,
    scoring_snapshot_id: `${matchId}:SCORING`,
    result_winner: finalized ? result.result_winner : "",
    running_result: finalized ? "Team 1 wins" : "Scheduled",
    team_1_points: finalized ? result.team_1_points : 0,
    team_2_points: finalized ? result.team_2_points : 0,
    finalized_at: finalized ? `2026-08-${String(roundNumber + 9).padStart(2, "0")}T18:00:00Z` : null,
  };
  const holeDefinitions = holes.map(({ hole_number, par, stroke_index, yardage }) => ({
    hole_number, par, stroke_index, yardage,
  }));
  const scoringSnapshot = {
    snapshot_id: match.scoring_snapshot_id,
    snapshot_revision: 3,
    tournament_id: "2026",
    match_id: matchId,
    format,
    course_id: course.course_id,
    tee: course.tee,
    rating: course.rating,
    slope: course.slope,
    par: holeDefinitions.reduce((sum, hole) => sum + hole.par, 0),
    canonical_hash: `${roundNumber}`.repeat(64).slice(0, 64),
    team_configuration: {
      team_1_strokes: teamStrokes[0],
      team_2_strokes: teamStrokes[1],
    },
    hole_definitions: holeDefinitions,
  };
  const wrapper = {
    match,
    presentation: {
      match_id: matchId,
      display_match_number: String(matchNumber),
      course_name: course.name,
      course_logo: `${course.course_id.toLowerCase()}.png`,
      tee_time: `${8 + roundNumber}:${String(matchNumber * 5).padStart(2, "0")} AM`,
      starting_hole: "1",
    },
    scoring_snapshot: scoringSnapshot,
    participants,
  };
  const snapshot = finalized ? {
    snapshot_id: `${matchId}:FINAL:${snapshotRevision}`,
    tournament_id: "2026",
    match_id: matchId,
    snapshot_revision: snapshotRevision,
    match_revision: matchRevision,
    scoring_snapshot_id: scoringSnapshot.snapshot_id,
    scoring_snapshot_revision: scoringSnapshot.snapshot_revision,
    source_fingerprint: `${(roundNumber + matchNumber).toString(16)}`.repeat(64).slice(0, 64),
    payload_hash: `${(roundNumber * 3 + matchNumber).toString(16)}`.repeat(64).slice(0, 64),
    state: "CURRENT",
    finalized_at: match.finalized_at,
    payload: {
      schema_version: "round-scorecards-v1",
      tournament: { tournament_id: "2026", year: 2026, name: "2026 Sandbagger Invitational" },
      round: { round_number: roundNumber, format, name: `Round ${roundNumber}` },
      match: {
        match_id: matchId,
        display_number: String(matchNumber),
        format,
        status: "FINAL",
        match_revision: matchRevision,
        result_winner: result.result_winner,
        running_result: match.running_result,
        finalized_at: match.finalized_at,
      },
      course: {
        course_id: course.course_id,
        tee: course.tee,
        rating: course.rating,
        slope: course.slope,
        par: scoringSnapshot.par,
        scoring_snapshot_id: scoringSnapshot.snapshot_id,
        scoring_snapshot_revision: scoringSnapshot.snapshot_revision,
        configuration_fingerprint: scoringSnapshot.canonical_hash,
      },
      teams: [
        { team_id: "PICKLES", team_side: 1, name: "The Pickles" },
        { team_id: "LIPPIT", team_side: 2, name: "Lipp it and Rip it" },
      ],
      participants,
      holes,
      hole_revision_set: Object.fromEntries(holes.map((hole) => [hole.hole_number, hole.hole_revision])),
      result,
      source_fingerprint: `${(roundNumber + matchNumber).toString(16)}`.repeat(64).slice(0, 64),
    },
  } : null;
  return { wrapper, snapshot };
}

export function makeHistory2026Aggregate() {
  const wrappers = [];
  const finalizedSnapshots = [];
  for (let matchNumber = 1; matchNumber <= 6; matchNumber += 1) {
    for (const roundNumber of [1, 2]) {
      const { wrapper, snapshot } = makeHistoryMatch({ roundNumber, matchNumber, status: "FINAL" });
      wrappers.push(wrapper);
      finalizedSnapshots.push(snapshot);
    }
  }
  for (let matchNumber = 1; matchNumber <= 12; matchNumber += 1) {
    const status = matchNumber <= 5 ? "FINAL" : "LIVE";
    const { wrapper, snapshot } = makeHistoryMatch({ roundNumber: 3, matchNumber, status });
    wrappers.push(wrapper);
    if (snapshot) finalizedSnapshots.push(snapshot);
  }
  wrappers.sort((left, right) => left.match.round_number - right.match.round_number ||
    Number(left.match.display_match_number) - Number(right.match.display_match_number));
  const playerMap = new Map();
  for (const wrapper of wrappers) {
    for (const participant of wrapper.participants) {
      if (!playerMap.has(participant.player_id)) {
        playerMap.set(participant.player_id, {
          player_id: participant.player_id,
          display_name: participant.display_name,
          slug: participant.slug,
          tournament_handicap: participant.handicap_index,
        });
      }
    }
  }
  return {
    tournament: {
      tournament_id: "2026",
      tournament_year: 2026,
      name: "2026 Sandbagger Invitational",
      destination: "Kiawah Island",
      location: "Kiawah Island, South Carolina",
      status: "LIVE",
    },
    rounds: [
      { tournament_id: "2026", round_number: 1, format: "BB", name: "Best Ball", course_id: "TPGC01" },
      { tournament_id: "2026", round_number: 2, format: "SC", name: "Scramble", course_id: "CPGC01" },
      { tournament_id: "2026", round_number: 3, format: "SI", name: "Singles", course_id: "OCGC01" },
    ],
    teams: [
      { tournament_id: "2026", team_id: "PICKLES", team_side: 1, name: "The Pickles", logo: "pickles.png" },
      { tournament_id: "2026", team_id: "LIPPIT", team_side: 2, name: "Lipp it and Rip it", logo: "lippit.png" },
    ],
    players: [...playerMap.values()].sort((left, right) => left.player_id.localeCompare(right.player_id)),
    matches: wrappers,
    finalized_snapshots: finalizedSnapshots,
    home_presentation: {
      tournament_id: "2026",
      tournament_location: "Kiawah Island",
      tournament_time_zone: "America/New_York",
    },
    tournament_presentation: {
      presentation: {
        tournament: {
          tournament_id: "2026",
          year: 2026,
          name: "2026 Sandbagger Invitational",
          location: "Kiawah Island, South Carolina",
          time_zone: "America/New_York",
        },
      },
      source_fingerprint: "d".repeat(64),
      imported_at: "2026-08-13T12:00:00Z",
    },
  };
}

export function makeGuideProjection() {
  return {
    revision: 7,
    contentFingerprint: "f".repeat(64),
    content: {
      courses: [1, 2, 3].map((roundNumber) => {
        const course = courseForRound(roundNumber);
        return {
          courseId: course.course_id,
          name: course.name,
          tee: course.tee,
          logo: `${course.course_id.toLowerCase()}.png`,
          location: "Kiawah Island, South Carolina",
          rounds: [roundNumber],
        };
      }),
    },
  };
}
