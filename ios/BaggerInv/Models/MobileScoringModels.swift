import Foundation

struct MobileScoringCurrentResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let apiVersion: String
    let data: MobileScoringCurrentData
    let meta: MobileScoringMeta

    var isContractCompatible: Bool {
        ok && apiVersion == "v1" && (data.scoring?.isStructurallyCompatible ?? true)
    }
}

struct MobileScoringCurrentData: Codable, Equatable, Sendable {
    @MobileRequiredNullable var scoring: MobileScoringCurrent?
}

struct MobileScoringMeta: Codable, Equatable, Sendable {
    let generatedAt: MobileTimestamp
}

struct MobileScoringHoleRequest: Codable, Equatable, Sendable {
    let matchId: String
    let holeNumber: Int
    let teamOneGrossScores: [Int]
    let teamTwoGrossScores: [Int]
    let mutationId: String
    let expectedMatchRevision: Int
    let expectedHoleRevision: Int

    var isContractCompatible: Bool {
        MobileScoringIdentifier.isValid(matchId) &&
        (1...18).contains(holeNumber) &&
        MobileScoringGross.isValid(teamOneGrossScores) &&
        MobileScoringGross.isValid(teamTwoGrossScores) &&
        MobileScoringIdentifier.isValid(mutationId) &&
        expectedMatchRevision >= 0 &&
        expectedHoleRevision >= 0
    }
}

struct MobileScoringHoleResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let apiVersion: String
    let data: MobileScoringHoleAcknowledgement
    let meta: MobileScoringMeta

    var isContractCompatible: Bool {
        ok && apiVersion == "v1" && data.isStructurallyCompatible
    }

    func isContractCompatible(for request: MobileScoringHoleRequest) -> Bool {
        isContractCompatible &&
        request.isContractCompatible &&
        data.matchId == request.matchId &&
        data.mutationId == request.mutationId &&
        data.hole.holeNumber == request.holeNumber
    }
}

struct MobileScoringHoleAcknowledgement: Codable, Equatable, Sendable {
    let mutationId: String
    let accepted: Bool
    let idempotent: Bool
    let semanticNoop: Bool
    let matchId: String
    let hole: MobileScoringHoleScore
    let match: MobileScoringAcknowledgedMatch
    let refreshRequired: Bool

    var isStructurallyCompatible: Bool {
        MobileScoringIdentifier.isValid(mutationId) &&
        accepted &&
        MobileScoringIdentifier.isValid(matchId) &&
        hole.isStructurallyCompatible &&
        match.isStructurallyCompatible &&
        !refreshRequired
    }
}

struct MobileScoringAcknowledgedMatch: Codable, Equatable, Sendable {
    let revision: Int
    let status: MobileScoringAcknowledgedMatchStatus
    let currentHole: Int
    let holesRemaining: Int
    let scorecardComplete: Bool
    @MobileRequiredNullable var statusText: String?

    var isStructurallyCompatible: Bool {
        revision >= 0 &&
        (0...18).contains(currentHole) &&
        (0...18).contains(holesRemaining)
    }
}

enum MobileScoringAcknowledgedMatchStatus: String, Codable, Equatable, Sendable {
    case inProgress
    case readyToFinalize
}

struct MobileScoringCurrent: Codable, Equatable, Sendable {
    let match: MobileScoringMatch
    let player: MobileScoringPlayer
    let sides: [MobileScoringSide]
    let course: MobileScoringCourse
    let scores: [MobileScoringHoleScore]
    let progress: MobileScoringProgress
    let permission: MobileScoringPermission
    let snapshot: MobileScoringSnapshot

    var isStructurallyCompatible: Bool {
        match.isStructurallyCompatible &&
        player.isStructurallyCompatible &&
        sides.count == 2 &&
        Set(sides.map(\.side)) == Set([1, 2]) &&
        sides.allSatisfy(\.isStructurallyCompatible) &&
        course.isStructurallyCompatible &&
        scores.count <= 18 &&
        scores.allSatisfy(\.isStructurallyCompatible) &&
        progress.isStructurallyCompatible &&
        permission.isStructurallyCompatible &&
        snapshot.isStructurallyCompatible
    }
}

struct MobileScoringMatch: Codable, Equatable, Sendable {
    let matchId: String
    @MobileRequiredNullable var roundNumber: Int?
    let format: MobileScoringFormat
    let status: MobileMatchStatus
    let matchRevision: Int
    let permissionRevision: Int
    @MobileRequiredNullable var result: MobileScoringWinner?

    var isStructurallyCompatible: Bool {
        MobileScoringIdentifier.isValid(matchId) &&
        matchRevision >= 0 &&
        permissionRevision >= 0
    }
}

enum MobileScoringFormat: Equatable, Hashable, Sendable, Codable {
    case bestBall
    case scramble
    case singles
    case unknown(String)

    init(from decoder: any Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        switch value {
        case "BB": self = .bestBall
        case "SC": self = .scramble
        case "SI": self = .singles
        default: self = .unknown(value)
        }
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var rawValue: String {
        switch self {
        case .bestBall: "BB"
        case .scramble: "SC"
        case .singles: "SI"
        case .unknown(let value): value
        }
    }

    var isKnown: Bool {
        switch self {
        case .bestBall, .scramble, .singles: true
        case .unknown: false
        }
    }
}

enum MobileScoringWinner: String, Codable, Equatable, Sendable {
    case teamOne
    case teamTwo
    case halved
}

struct MobileScoringPlayer: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    @MobileRequiredNullable var teamSide: Int?

    var isStructurallyCompatible: Bool {
        !playerId.isEmpty && !displayName.isEmpty && (teamSide == nil || teamSide == 1 || teamSide == 2)
    }
}

struct MobileScoringSide: Codable, Equatable, Sendable {
    let side: Int
    @MobileRequiredNullable var teamId: String?
    let name: String
    let participants: [MobileScoringParticipant]

    var isStructurallyCompatible: Bool {
        (side == 1 || side == 2) &&
        participants.count >= 1 &&
        participants.count <= 2 &&
        participants.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileScoringParticipant: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    let slot: Int
    let isAuthenticatedPlayer: Bool
    @MobileRequiredNullable var handicapIndex: Double?
    @MobileRequiredNullable var courseHandicap: Double?
    @MobileRequiredNullable var playingHandicap: Double?
    @MobileRequiredNullable var strokes: Double?

    var isStructurallyCompatible: Bool {
        !playerId.isEmpty && !displayName.isEmpty && (slot == 1 || slot == 2)
    }
}

struct MobileScoringCourse: Codable, Equatable, Sendable {
    @MobileRequiredNullable var courseId: String?
    @MobileRequiredNullable var name: String?
    @MobileRequiredNullable var tee: String?
    @MobileRequiredNullable var rating: Double?
    @MobileRequiredNullable var slope: Double?
    @MobileRequiredNullable var par: Double?
    let holes: [MobileScoringCourseHole]

    var isStructurallyCompatible: Bool {
        holes.count <= 18 && holes.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileScoringCourseHole: Codable, Equatable, Sendable {
    let holeNumber: Int
    @MobileRequiredNullable var par: Double?
    @MobileRequiredNullable var strokeIndex: Double?
    @MobileRequiredNullable var yardage: Double?

    var isStructurallyCompatible: Bool { (1...18).contains(holeNumber) }
}

struct MobileScoringHoleScore: Codable, Equatable, Sendable {
    let holeNumber: Int
    let revision: Int
    let gross: MobileScoringGross
    let strokes: MobileScoringStrokes
    let net: MobileScoringNet
    @MobileRequiredNullable var winner: MobileScoringWinner?
    @MobileRequiredNullable var updatedAt: MobileTimestamp?

    var isStructurallyCompatible: Bool {
        (1...18).contains(holeNumber) &&
        revision >= 0 &&
        gross.isStructurallyCompatible &&
        strokes.isStructurallyCompatible
    }
}

struct MobileScoringGross: Codable, Equatable, Sendable {
    let teamOne: [Int]
    let teamTwo: [Int]

    var isStructurallyCompatible: Bool {
        Self.isValid(teamOne) && Self.isValid(teamTwo)
    }

    static func isValid(_ values: [Int]) -> Bool {
        values.count >= 1 && values.count <= 2 && values.allSatisfy { (1...20).contains($0) }
    }
}

struct MobileScoringStrokes: Codable, Equatable, Sendable {
    let teamOne: [Double]
    let teamTwo: [Double]

    var isStructurallyCompatible: Bool {
        teamOne.count <= 2 && teamTwo.count <= 2
    }
}

struct MobileScoringNet: Codable, Equatable, Sendable {
    @MobileRequiredNullable var teamOne: Double?
    @MobileRequiredNullable var teamTwo: Double?
}

struct MobileScoringProgress: Codable, Equatable, Sendable {
    let currentHole: Int
    let holesRemaining: Int
    let scorecardComplete: Bool
    @MobileRequiredNullable var statusText: String?

    var isStructurallyCompatible: Bool {
        (0...18).contains(currentHole) && (0...18).contains(holesRemaining)
    }
}

struct MobileScoringPermission: Codable, Equatable, Sendable {
    let canScore: Bool
    let readOnly: Bool
    let canFinalize: Bool
    @MobileRequiredNullable var reason: MobileScoringPermissionReason?

    var isStructurallyCompatible: Bool {
        !(canScore && readOnly)
    }
}

enum MobileScoringPermissionReason: String, Codable, Equatable, Sendable {
    case matchFinalized
    case matchLocked
    case matchNotActive
    case permissionRevoked
    case permissionChanged
    case notAuthorized
}

struct MobileScoringSnapshot: Codable, Equatable, Sendable {
    @MobileRequiredNullable var snapshotId: String?
    let revision: Int

    var isStructurallyCompatible: Bool { revision >= 0 }
}

enum MobileScoringIdentifier {
    static func isValid(_ value: String) -> Bool {
        value.count <= 128 &&
        value.range(of: #"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"#, options: .regularExpression) != nil
    }
}

extension MobileErrorData {
    var isBoundedScoringMutationContext: Bool {
        MobileScoringIdentifier.isValid(matchId) &&
        (currentMatchRevision.map { $0 >= 0 } ?? true) &&
        (currentHoleRevision.map { $0 >= 0 } ?? true) &&
        (currentPermissionRevision.map { $0 >= 0 } ?? true) &&
        (scoredHoles.map { (0...18).contains($0) } ?? true) &&
        refreshRequired
    }
}
