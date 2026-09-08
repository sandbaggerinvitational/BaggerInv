// Synthetic committed mobile contract fixtures; no participant data.
export function rawFixture({
  format = "BB",
  status = "LIVE",
  owned = true,
  winners = ["Team 1", "Halved", "Team 2", "Team 1"],
  clinched = false,
  matchId = "2026-R1-2",
} = {}) {
  const playerCount = format === "SI" ? 1 : 2;
  const participantRows = [1, 2].flatMap((side) => Array.from({ length: playerCount }, (_, index) => ({
    player_id: `P${side}${index + 1}`,
    display_name: `Side ${side} Player ${index + 1}`,
    team_side: side,
    player_slot: index + 1,
    playing_handicap: side === 1 ? 17.25 + index : 12.9 + index,
    final_strokes: side === 1 ? 4 + index : index,
    is_authenticated_player: false,
  })));
  if (owned) {
    participantRows[0].player_id = "P1";
    participantRows[0].display_name = "Preview Golfer";
    participantRows[0].is_authenticated_player = true;
  }
  const expectedScores = format === "BB" ? 2 : 1;
  const scores = winners.map((winner, index) => ({
    hole_number: index + 1,
    team_1_gross_scores: Array.from({ length: expectedScores }, (_, slot) => 4 + slot),
    team_2_gross_scores: Array.from({ length: expectedScores }, (_, slot) => 5 + slot),
    team_1_strokes: Array.from({ length: expectedScores }, (_, slot) => slot),
    team_2_strokes: Array.from({ length: expectedScores }, () => 0),
    team_1_net_score: 4,
    team_2_net_score: 5,
    hole_winner: winner,
    updated_at: `2026-09-03T12:${String(index).padStart(2, "0")}:00.000Z`,
  }));
  const sideOneWins = winners.filter((winner) => winner === "Team 1").length;
  const sideTwoWins = winners.filter((winner) => winner === "Team 2").length;
  const final = status === "FINAL";
  const resultWinner = final
    ? sideOneWins === sideTwoWins ? "Halved" : sideOneWins > sideTwoWins ? "Team 1" : "Team 2"
    : "";
  return {
    ok: true,
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
    round: { round_number: 1, name: "Round 1", format, status },
    match: {
      match_id: matchId,
      round_number: 1,
      format,
      status,
      scored_holes: scores.length,
      current_hole: scores.length,
      holes_remaining: 18 - scores.length,
      team_1_holes_won: sideOneWins,
      team_2_holes_won: sideTwoWins,
      running_result: scores.length ? `Team 1 ${Math.abs(sideOneWins - sideTwoWins)} UP through ${scores.length}` : "Scheduled",
      result_winner: resultWinner,
      clinched,
      scorecard_complete: final,
      authority_updated_at: "2026-09-03T13:00:00.000Z",
      finalized_at: final ? "2026-09-03T13:01:00.000Z" : null,
    },
    presentation: {
      course_name: "The Ocean Course",
      course_logo: "ocean-course-logo",
      course_yardage: "6793",
      tee_time: "10:10 AM",
      starting_hole: "1",
      display_match_number: "2",
      team_1_logo: "pickles-logo",
      team_1_primary_color: "#00563f",
      team_1_secondary_color: "#c8a44d",
      team_2_logo: "lipp-logo",
      team_2_primary_color: "#123456",
      team_2_secondary_color: "#abcdef",
      tournament_location: "Kiawah Island",
      tournament_logo: "sandbagger-2026",
      tournament_status: "Live",
      tournament_time_zone: "America/New_York",
      source_updated_at: "2026-09-03T12:59:00.000Z",
      updated_at: "2026-09-03T12:59:30.000Z",
    },
    snapshot: {
      format,
      course_id: "OCEAN",
      tee: "Gold",
      rating: 74.7,
      slope: 150,
      par: 72,
      team_configuration: {
        team_1_playing_handicap: format === "SC" ? 3.25 : null,
        team_2_playing_handicap: format === "SC" ? 1 : null,
        team_1_strokes: format === "SC" ? 2 : null,
        team_2_strokes: format === "SC" ? 0 : null,
      },
    },
    teams: [
      { team_id: "PICKLES", team_side: 1, name: "The Pickles" },
      { team_id: "LIPP", team_side: 2, name: "Lipp it and Rip it" },
    ],
    participants: participantRows,
    holes: Array.from({ length: 18 }, (_, index) => ({
      hole_number: index + 1,
      stroke_index: index + 1,
      par: index % 3 === 0 ? 5 : 4,
      yardage: 350 + index * 5,
    })),
    scores,
    navigation: {
      round_match_index: 2,
      round_match_count: 6,
      previous_match_id: "2026-R1-1",
      next_match_id: "2026-R1-3",
      my_match_id: owned ? matchId : "2026-R1-4",
      is_my_match: owned,
    },
  };
}

function team(side, suffix = side) {
  return { id: `T${suffix}`, name: `Team ${suffix}`, sideNumber: side, roster: [{
    player: { "Player ID": `P${side}`, "Display Name": `Player ${side}` },
    handicap: side,
  }] };
}

export function currentHistory() {
  const teams = [team(1), team(2)];
  const match = {
    id: "2026-R1-1", match: 1, round: 1, format: "BB", lifecycle: "LIVE",
    course: { id: "C1", name: "Ocean" },
    team1Players: [{ id: "P1", name: "Player 1" }],
    team2Players: [{ id: "P2", name: "Player 2" }],
    team1Points: null, team2Points: null,
  };
  return {
    source: "supabase", year: 2026, sourceFingerprint: "c".repeat(64),
    tournament: { id: "2026", name: "2026 Bagger", lifecycle: "IN_PROGRESS", complete: false, teams },
    teams,
    rounds: [{ round: 1, format: "BB", course: { "Course ID": "C1", Course: "Ocean" },
      teamOne: { ...teams[0], points: null }, teamTwo: { ...teams[1], points: null }, matches: [match] }],
    matches: [match], leaderboardRows: [], analytics: { scorecards: [] },
  };
}

export function archiveRows() {
  return Array.from({ length: 9 }, (_, index) => {
    const year = 2017 + index;
    return {
      tournament_id: String(year), tournament_year: year, revision_id: `revision-${year}`,
      tournament: { name: `${year} Bagger`, lifecycle: "FINAL", destination: "Kiawah",
        official_team_1_points: 8.5, official_team_2_points: 7.5,
        champion_team_side: 1, champion_team_id: `${year}-T1` },
      teams: [
        { team_id: `${year}-T1`, team_side: 1, name: "Pickles" },
        { team_id: `${year}-T2`, team_side: 2, name: "Rippers" },
      ],
    };
  });
}

export function oddsView(state = "PUBLISHED") {
  const published = state === "PUBLISHED";
  const payload = {
    year: 2026, phase: "After Round 1", phaseOrder: 1,
    publishedAt: "2026-08-30T12:00:00.000Z", iterations: 10_000,
    totalPointsAvailable: 72,
    teams: [
      { side: 1, name: "Pickles", probability: 60, americanOdds: "-150", expectedPoints: 38.25 },
      { side: 2, name: "Rippers", probability: 40, americanOdds: "+150", expectedPoints: 33.75 },
    ],
    players: [{ id: "P1", name: "Player One", teamSide: 1, probability: 20,
      americanOdds: "+400", expectedPoints: 5.25, expectedRecord: "2-1-0", averageFinish: 3.2 }],
  };
  return {
    scope: "ODDS", tournament_id: "2026",
    publication: published
      ? { state, revision: 4, published_at: payload.publishedAt, current_milestone: payload.phase }
      : { state, revision: 5, published_at: null, current_milestone: null },
    snapshots: published ? [{ milestone: payload.phase, phase_order: 1,
      published_at: payload.publishedAt, payload, is_current_official: true,
      publication_verified: true }] : [],
  };
}
