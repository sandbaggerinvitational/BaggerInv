import Foundation

// Minimum external model surface required to compile the byte-exact Build 10
// queue files. The persistence path exercised by this harness does not create
// MobileScoringCurrent values; these declarations only satisfy signatures in
// the vendored repository.
enum NativeDeployment: Sendable {
    case preview
    case production
}

enum MobileMatchStatus: String, Codable, Equatable, Sendable {
    case inProgress = "in_progress"
}

struct MobileScoringCurrent: Equatable, Sendable {
    struct Match: Equatable, Sendable {
        let matchId: String
        let status: MobileMatchStatus
        let matchRevision: Int
        let permissionRevision: Int
    }

    struct Player: Equatable, Sendable {
        let playerId: String
    }

    struct Snapshot: Equatable, Sendable {
        let snapshotId: String?
        let revision: Int
    }

    struct Permission: Equatable, Sendable {
        let canScore: Bool
        let readOnly: Bool
    }

    struct Gross: Equatable, Sendable {
        let teamOne: [Int]
        let teamTwo: [Int]
    }

    struct Score: Equatable, Sendable {
        let holeNumber: Int
        let revision: Int
        let gross: Gross
    }

    let match: Match
    let player: Player
    let snapshot: Snapshot
    let permission: Permission
    let scores: [Score]
}
