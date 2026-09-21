export function playerRoundSource() {
  const tournamentId = "future-cup";
  const teams = [{ team_id: "green", team_side: 1, name: "Green" }, { team_id: "gold", team_side: 2, name: "Gold" }];
  const players = ["A", "B", "C", "D"].map((player_id, index) => ({ player_id, display_name: `Player ${player_id}`,
    team_side: index < 2 ? 1 : 2, participation_status: "ACTIVE", email: "DO-NOT-EXPOSE@example.invalid" }));
  const rounds = ["BB", "SC", "SI"].map((format, index) => ({ round_number: index + 1, format, name: `Round ${index + 1}` }));
  const matches = rounds.map((round) => {
    const match_id = ` exact/${round.format}#:%🌲 `;
    const singles = round.format === "SI";
    const participants = players.filter((p) => !singles || ["A", "C"].includes(p.player_id)).map((p) => ({
      player_id: p.player_id, display_name: p.display_name, team_side: p.team_side,
      player_slot: ["A", "C"].includes(p.player_id) ? 1 : 2,
      playing_handicap: 0, final_strokes: 0, match_id, tournament_id: tournamentId,
    }));
    const scores = Array.from({ length: 18 }, (_, index) => {
      const hole_number = index + 1;
      const hole_winner = index < 5 ? "Team 1" : index < 9 ? "Halved" : "Team 2";
      const one = hole_winner === "Team 2" ? 5 : 4, two = hole_winner === "Team 1" ? 5 : 4;
      const count = round.format === "BB" ? 2 : 1;
      return { hole_number, hole_winner, match_id,
        team_1_gross_scores: Array(count).fill(one), team_2_gross_scores: Array(count).fill(two),
        team_1_strokes: Array(count).fill(0), team_2_strokes: Array(count).fill(0), team_1_net_score: one, team_2_net_score: two };
    });
    return { match: { match_id, tournament_id: tournamentId, round_number: round.round_number,
      format: round.format, status: "FINAL", scored_holes: 18, scorecard_complete: true, scoring_locked: true },
      round, participants, scores,
      holes: Array.from({ length: 18 }, (_, index) => ({ hole_number: index + 1, par: 4, stroke_index: index + 1 })),
      snapshot: { course_id: `course-${round.format}`, tee: "Gold", team_configuration: { team_1_strokes: 0, team_2_strokes: 0 } },
      presentation: { display_match_number: "5", course_name: "Canonical Course", team_1_logo: "green.png", team_2_logo: "gold.png" } };
  });
  return { tournament: { tournament_id: tournamentId, tournament_year: 2030, name: "Future Cup" }, teams, players, rounds, matches };
}
