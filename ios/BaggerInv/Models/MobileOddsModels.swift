import Foundation

enum MobileOddsPhase: String, Codable, Equatable, Hashable, Sendable {
    case preTournament = "Pre-Tournament"
    case afterRoundOne = "After Round 1"
    case afterRoundTwo = "After Round 2"
    case roundThreePairings = "Round 3 Pairings Announced"
    case finalResults = "Final Results"
}

enum MobileOddsPublicationState: String, Codable, Equatable, Sendable {
    case unpublished = "UNPUBLISHED"
    case published = "PUBLISHED"
}

struct MobileOddsPublication: Codable, Equatable, Sendable {
    let state: MobileOddsPublicationState
    let revision: Int
    @MobileRequiredNullable var publishedAt: MobileTimestamp?
    @MobileRequiredNullable var currentPhase: MobileOddsPhase?
}

struct MobileOddsTeam: Codable, Equatable, Sendable {
    let side: Int
    @MobileRequiredNullable var teamId: String?
    let name: String
    let probability: Double
    let americanOdds: String
    let expectedPoints: Double
}

struct MobileOddsPlayer: Codable, Equatable, Sendable {
    let rank: Int
    let playerId: String
    let displayName: String
    let teamSide: Int
    let probability: Double
    let americanOdds: String
    let expectedPoints: Double
    let expectedRecord: String
    let averageFinish: Double
}

struct MobileOddsSnapshot: Codable, Equatable, Sendable {
    let phase: MobileOddsPhase
    let phaseOrder: Int
    let label: String
    let isCurrent: Bool
    let publishedAt: MobileTimestamp
    let iterations: Int
    let totalPointsAvailable: Double
    let teams: [MobileOddsTeam]
    let players: [MobileOddsPlayer]
}

struct MobileOddsData: MobileReadPayload {
    let publication: MobileOddsPublication
    let snapshots: [MobileOddsSnapshot]

    var contextBinding: MobileReadContextBinding { .authenticatedRequest }

    var revocableParticipantRepresentationKeys: Set<String> {
        publication.state == .published ? ["odds:published"] : []
    }

    var isStructurallyCompatible: Bool {
        guard (0...9_007_199_254_740_991).contains(publication.revision),
              snapshots.count <= 5,
              snapshots.allSatisfy(\.isStructurallyCompatible),
              Set(snapshots.map(\.phase)).count == snapshots.count,
              zip(snapshots, snapshots.dropFirst()).allSatisfy({ pair in
                  pair.0.phaseOrder < pair.1.phaseOrder
              })
        else { return false }

        switch publication.state {
        case .unpublished:
            return publication.publishedAt == nil &&
                publication.currentPhase == nil &&
                snapshots.isEmpty
        case .published:
            let current = snapshots.filter(\.isCurrent)
            return publication.publishedAt != nil &&
                (publication.publishedAt?.rawValue.count ?? 0) <= 40 &&
                !snapshots.isEmpty &&
                current.count == 1 &&
                current.first?.phase == publication.currentPhase
        }
    }
}

typealias MobileOddsResponse = MobileReadResponse<MobileOddsData>

private extension MobileOddsSnapshot {
    var isStructurallyCompatible: Bool {
        (0...4).contains(phaseOrder) &&
        MobileParticipantContentValidation.text(label, maximum: 160) &&
        publishedAt.rawValue.count <= 40 &&
        (1...100_000_000).contains(iterations) &&
        totalPointsAvailable.isFinite && totalPointsAvailable >= 0 &&
        teams.count == 2 &&
        teams.allSatisfy(\.isStructurallyCompatible) &&
        (1...64).contains(players.count) &&
        players.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobileOddsTeam {
    var isStructurallyCompatible: Bool {
        (1...2).contains(side) &&
        (teamId.map { MobileParticipantContentValidation.id($0) } ?? true) &&
        MobileParticipantContentValidation.text(name, maximum: 160) &&
        probability.isFinite && (0...100).contains(probability) &&
        expectedPoints.isFinite && expectedPoints >= 0 &&
        americanOdds.range(
            of: #"^(?:[+-][0-9]{1,6}|[+-]∞)$"#,
            options: .regularExpression
        ) != nil
    }
}

private extension MobileOddsPlayer {
    var isStructurallyCompatible: Bool {
        (1...64).contains(rank) &&
        MobileParticipantContentValidation.id(playerId) &&
        MobileParticipantContentValidation.text(displayName, maximum: 160) &&
        (1...2).contains(teamSide) &&
        probability.isFinite && (0...100).contains(probability) &&
        expectedPoints.isFinite && expectedPoints >= 0 &&
        averageFinish.isFinite && averageFinish >= 1 &&
        americanOdds.range(
            of: #"^(?:[+-][0-9]{1,6}|[+-]∞)$"#,
            options: .regularExpression
        ) != nil &&
        MobileParticipantContentValidation.text(expectedRecord, maximum: 64) &&
        expectedRecord.range(
            of: #"^\d+(?:\.\d+)?-\d+(?:\.\d+)?-\d+(?:\.\d+)?$"#,
            options: .regularExpression
        ) != nil
    }
}
