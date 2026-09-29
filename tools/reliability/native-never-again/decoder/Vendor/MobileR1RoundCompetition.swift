import Foundation

/// The certified R1 helper output, in authoritative server order. Validation
/// checks shape/bindings only, never reconstructs a ranking or a golf value.
struct MobileR1RoundCompetition: Codable, Equatable, Sendable {
    let roundNumber: Int
    let format: MobileLeadersRoundFormat
    let rows: [Row]

    struct Row: Codable, Equatable, Sendable, Identifiable {
        var id: String { playerId }
        let playerId: String
        let rank: Int
        let tied: Bool
        @MobileRequiredNullable var points: Double?
        @MobileRequiredNullable var netScore: Double?
        let officialFinal: Bool

        var isStructurallyCompatible: Bool {
            (1...500).contains(playerId.unicodeScalars.count) && (1...256).contains(rank) &&
            [points, netScore].allSatisfy { $0.map(\.isFinite) ?? true }
        }
    }

    var isStructurallyCompatible: Bool {
        roundNumber == 1 && format == .bestBall && rows.count <= 256 &&
        Set(rows.map(\.playerId)).count == rows.count && rows.allSatisfy(\.isStructurallyCompatible)
    }
}

extension MobileLeadersData {
    var hasCompatibleR1Competition: Bool {
        guard let competition = r1RoundCompetition else { return true }
        guard competition.isStructurallyCompatible, let intelligence = playerIntelligence else { return false }
        let identities = Set(intelligence.overall.players.map(\.playerId))
        let participants = Set(intelligence.matchReferences.filter { $0.roundNumber == 1 }.flatMap(\.participantIds))
        return competition.rows.allSatisfy { identities.contains($0.playerId) && participants.contains($0.playerId) }
    }
}
