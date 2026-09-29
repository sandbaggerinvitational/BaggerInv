import Foundation

/// Certified pair competition output. Array order, Points, Net, ranks and ties
/// are server facts. Validation never re-ranks or reconstructs golf values.
struct MobileR2PairCompetition: Codable, Equatable, Sendable {
    let roundNumber: Int
    let format: MobileLeadersRoundFormat
    let netBasis: MobileRoundScorecard.NetBasis
    let rows: [Row]

    struct Row: Codable, Equatable, Sendable, Identifiable {
        var id: String { pairId }
        let pairId: String
        let matchId: String
        @MobileRequiredNullable var displayMatchNumber: String?
        let team: MobilePlayerRoundPerformance.Team
        let players: [MobilePlayerRoundPerformance.Player]
        let rank: Int
        let tied: Bool
        @MobileRequiredNullable var points: Double?
        @MobileRequiredNullable var teamNetScore: Double?
        let status: MobilePlayerRoundPerformance.Status
        let officialFinal: Bool

        var isStructurallyCompatible: Bool {
            (1...500).contains(pairId.unicodeScalars.count) && MobileOpaqueMatchID.isValid(matchId) &&
            (displayMatchNumber.map { $0.unicodeScalars.count <= 500 } ?? true) && team.isValid &&
            players.count == 2 && players.allSatisfy(\.isValid) && players.map(\.slot) == [1, 2] &&
            Set(players.map(\.playerId)).count == 2 && (1...128).contains(rank) &&
            [points, teamNetScore].allSatisfy { $0.map(\.isFinite) ?? true }
        }

        func boundPerformance(in values: [MobilePlayerRoundPerformance]) -> MobilePlayerRoundPerformance? {
            let matches = players.map { player in values.filter {
                $0.playerId == player.playerId && Data($0.matchId.utf8) == Data(matchId.utf8) &&
                $0.roundNumber == 2 && $0.format == .scramble
            } }
            guard matches.allSatisfy({ $0.count == 1 }) else { return nil }
            let pair = matches.map { $0[0] }
            guard pair.allSatisfy({ p in
                p.sidePlayers == players && p.team == team && p.scores.scope == .team &&
                p.partner == players.first(where: { $0.playerId != p.playerId }) &&
                p.status == status && p.displayMatchNumber == displayMatchNumber &&
                (p.scorecard.map { $0.scope == .team && $0.players == players } ?? true)
            }), pair[0].segments == pair[1].segments, pair[0].scores == pair[1].scores,
               pair[0].scorecard == pair[1].scorecard else { return nil }
            // Select an identical certified TEAM projection, not a partner's
            // individual Points. The view always uses competition.points.
            return pair[0]
        }
    }

    var isStructurallyCompatible: Bool {
        roundNumber == 2 && format == .scramble && rows.count <= 128 &&
        rows.allSatisfy(\.isStructurallyCompatible) && Set(rows.map(\.pairId)).count == rows.count &&
        Set(rows.flatMap { $0.players.map(\.playerId) }).count == rows.flatMap(\.players).count
    }
}

extension MobileLeadersData {
    var hasCompatibleR2Competition: Bool {
        guard let competition = r2PairCompetition else { return true }
        guard competition.isStructurallyCompatible, let performance = playerRoundPerformance else { return false }
        return competition.rows.allSatisfy { $0.boundPerformance(in: performance) != nil }
    }
}
