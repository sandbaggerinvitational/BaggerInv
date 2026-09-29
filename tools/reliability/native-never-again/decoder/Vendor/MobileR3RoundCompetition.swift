import Foundation

/// Server-completed Singles field. Null ranks are membership, never tied-last.
struct MobileR3RoundCompetition: Codable, Equatable, Sendable {
    let roundNumber: Int
    let format: MobileLeadersRoundFormat
    let netBasis: MobileRoundScorecard.NetBasis
    let rows: [Row]
    enum Availability: String, Codable, Sendable { case competition, unscored }
    struct Row: Codable, Equatable, Sendable, Identifiable {
        var id: String { playerId }
        let playerId: String
        let displayName: String
        let matchId: String
        let roundNumber: Int
        @MobileRequiredNullable var displayMatchNumber: String?
        let team: MobilePlayerRoundPerformance.Team
        let fieldOrder: Int
        let status: MobilePlayerRoundPerformance.Status
        let officialFinal: Bool
        @MobileRequiredNullable var rank: Int?
        @MobileRequiredNullable var tied: Bool?
        @MobileRequiredNullable var points: Double?
        @MobileRequiredNullable var netScore: Double?
        let availability: Availability

        var isStructurallyCompatible: Bool {
            guard (1...500).contains(playerId.unicodeScalars.count), (1...500).contains(displayName.unicodeScalars.count),
                  MobileOpaqueMatchID.isValid(matchId), roundNumber == 3, team.isValid,
                  (1...256).contains(fieldOrder), displayMatchNumber.map({ $0.unicodeScalars.count <= 500 }) ?? true,
                  [points, netScore].allSatisfy({ $0.map(\.isFinite) ?? true }) else { return false }
            switch availability {
            case .unscored: return rank == nil && tied == nil && points == nil && netScore == nil
            case .competition: return rank.map { (1...256).contains($0) } == true && tied != nil && (points != nil || netScore != nil)
            }
        }
        func boundPerformance(in values: [MobilePlayerRoundPerformance]) -> MobilePlayerRoundPerformance? {
            let matches = values.filter { $0.playerId == playerId && Data($0.matchId.utf8) == Data(matchId.utf8) && $0.roundNumber == 3 && $0.format == .singles }
            guard matches.count == 1, let p = matches.first,
                  p.team == team, p.sidePlayers.count == 1, p.sidePlayers[0].playerId == playerId,
                  p.sidePlayers[0].displayName == displayName, p.scores.scope == .player,
                  p.status == status, p.displayMatchNumber == displayMatchNumber,
                  p.scorecard.map({ $0.scope == .player && $0.playerId == playerId && $0.netBasis == .matchup }) ?? true else { return nil }
            return p
        }
    }
    var isStructurallyCompatible: Bool {
        roundNumber == 3 && format == .singles && rows.count <= 256 && rows.allSatisfy(\.isStructurallyCompatible) &&
        Set(rows.map(\.playerId)).count == rows.count && Set(rows.map(\.fieldOrder)).count == rows.count
    }
}

extension MobileLeadersData {
    var hasCompatibleR3Competition: Bool {
        guard let competition = r3RoundCompetition else { return true }
        guard competition.isStructurallyCompatible, let performance = playerRoundPerformance else { return false }
        let field = performance.filter { $0.roundNumber == 3 && $0.format == .singles }
        return field.count == competition.rows.count && Set(field.map(\.playerId)) == Set(competition.rows.map(\.playerId)) &&
            competition.rows.allSatisfy { $0.boundPerformance(in: field) != nil }
    }
}
