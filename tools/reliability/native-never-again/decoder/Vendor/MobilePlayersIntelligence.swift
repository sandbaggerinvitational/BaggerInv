import Foundation

enum MobilePlayerMetric: String, Codable, CaseIterable, Sendable {
    case points, wins, winPct, grossAvg, netAvg
}

struct MobilePlayerMetricDefinition: Codable, Equatable, Sendable, Identifiable {
    enum Direction: String, Codable, Sendable { case ascending, descending }
    let id: MobilePlayerMetric
    let label: String
    let direction: Direction
}

struct MobilePlayerMetricFacts: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    let team: MobileReadTeam
    let points: Double
    let wins: Int
    let losses: Int
    let halves: Int
    let matchesPlayed: Int
    let record: String
    @MobileRequiredNullable var winPct: Double?
    @MobileRequiredNullable var grossAvg: Double?
    @MobileRequiredNullable var netAvg: Double?
    let matchIds: [String]

    var isStructurallyCompatible: Bool {
        playersBoundedText(playerId) && playersBoundedText(displayName) && !team.name.isEmpty &&
        points.isFinite && [wins, losses, halves, matchesPlayed].allSatisfy { $0 >= 0 } &&
        (winPct.map { $0.isFinite && (0...100).contains($0) } ?? true) &&
        [grossAvg, netAvg].allSatisfy { $0.map(\.isFinite) ?? true } &&
        matchIds.count <= 64 && matchIds.allSatisfy(MobileOpaqueMatchID.isValid) &&
        Set(matchIds.map { Data($0.utf8) }).count == matchIds.count
    }
}

struct MobilePlayerRankingEntry: Codable, Equatable, Sendable {
    let playerId: String
    @MobileRequiredNullable var rank: Int?
    let tied: Bool
}

struct MobilePlayerRanking: Codable, Equatable, Sendable {
    let metric: MobilePlayerMetric
    let order: [MobilePlayerRankingEntry]
}

struct MobilePlayerMetricScope: Codable, Equatable, Sendable {
    let players: [MobilePlayerMetricFacts]
    let rankings: [MobilePlayerRanking]

    var isStructurallyCompatible: Bool {
        let ids = Set(players.map(\.playerId))
        return players.count <= 256 && ids.count == players.count &&
        players.allSatisfy(\.isStructurallyCompatible) && rankings.count <= 5 &&
        Set(rankings.map(\.metric)).count == rankings.count && rankings.allSatisfy { ranking in
            ranking.order.count == players.count &&
            Set(ranking.order.map(\.playerId)) == ids &&
            ranking.order.allSatisfy { $0.rank.map { $0 >= 1 } ?? true }
        }
    }
}

struct MobilePlayerRoundMetrics: Codable, Equatable, Sendable {
    let roundNumber: Int
    let players: [MobilePlayerMetricFacts]
    let rankings: [MobilePlayerRanking]
    var scope: MobilePlayerMetricScope { .init(players: players, rankings: rankings) }
}

struct MobilePlayerMatchReference: Codable, Equatable, Sendable {
    var presentationID: Data { Data(matchId.utf8) }
    let matchId: String
    let roundNumber: Int
    @MobileRequiredNullable var displayMatchNumber: String?
    let participantIds: [String]

    var isStructurallyCompatible: Bool {
        MobileOpaqueMatchID.isValid(matchId) && roundNumber >= 1 &&
        (displayMatchNumber.map { $0.unicodeScalars.count <= 500 } ?? true) &&
        !participantIds.isEmpty && participantIds.count <= 4 &&
        participantIds.allSatisfy { playersBoundedText($0) } &&
        Set(participantIds).count == participantIds.count
    }
}

struct MobilePlayersIntelligence: Codable, Equatable, Sendable {
    let metrics: [MobilePlayerMetricDefinition]
    let overall: MobilePlayerMetricScope
    let rounds: [MobilePlayerRoundMetrics]
    let matchReferences: [MobilePlayerMatchReference]

    /// Validate identity/reference relationships, not golf statistics. Never
    /// check a record/percentage by recomputing it or create ranking authority.
    var isStructurallyCompatible: Bool {
        let advertised = Set(metrics.map(\.id))
        guard metrics.count <= 5, advertised.count == metrics.count,
              metrics.allSatisfy({ playersBoundedText($0.label) }),
              overall.isStructurallyCompatible,
              Set(overall.rankings.map(\.metric)) == advertised,
              rounds.count <= 12, Set(rounds.map(\.roundNumber)).count == rounds.count,
              matchReferences.count <= 64,
              Set(matchReferences.map { Data($0.matchId.utf8) }).count == matchReferences.count,
              matchReferences.allSatisfy(\.isStructurallyCompatible)
        else { return false }
        let references = Dictionary(uniqueKeysWithValues: matchReferences.map { (Data($0.matchId.utf8), $0) })
        func validReferences(_ scope: MobilePlayerMetricScope, round: Int?) -> Bool {
            scope.players.allSatisfy { player in
                player.matchIds.allSatisfy { id in
                    guard let reference = references[Data(id.utf8)] else { return false }
                    return reference.participantIds.contains(player.playerId) &&
                        (round.map { $0 == reference.roundNumber } ?? true)
                }
            }
        }
        return validReferences(overall, round: nil) && rounds.allSatisfy {
            $0.roundNumber >= 1 && $0.scope.isStructurallyCompatible &&
            Set($0.rankings.map(\.metric)) == advertised && validReferences($0.scope, round: $0.roundNumber)
        }
    }
}

private func playersBoundedText(_ value: String) -> Bool {
    !value.isEmpty && value.unicodeScalars.count <= 500
}
