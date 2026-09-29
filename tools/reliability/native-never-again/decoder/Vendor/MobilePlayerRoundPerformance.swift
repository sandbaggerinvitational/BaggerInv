import Foundation

/// Certified read projection. These values are never reconstructed from holes,
/// aggregate statistics, or Match Detail on the client.
struct MobilePlayerRoundPerformance: Codable, Equatable, Sendable, Identifiable {
    enum Status: String, Codable, Sendable { case upcoming, inProgress, final }
    struct Identity: Hashable { let playerID: String; let matchID: Data }
    var id: Identity { .init(playerID: playerId, matchID: Data(matchId.utf8)) }
    let playerId: String
    let roundNumber: Int
    let format: MobileLeadersRoundFormat
    let matchId: String
    @MobileRequiredNullable var displayMatchNumber: String?
    let status: Status
    let official: Bool
    let team: Team
    let opponent: Team
    let sidePlayers: [Player]
    let opponents: [Player]
    @MobileRequiredNullable var partner: Player?
    let segments: [Segment]
    @MobileRequiredNullable var pointsEarned: Double?
    let scores: Scores
    var scorecard: MobileRoundScorecard? = nil

    struct Team: Codable, Equatable, Sendable {
        let teamId: String
        let name: String
        var isValid: Bool { bounded(teamId) && bounded(name) }
    }
    struct Player: Codable, Equatable, Sendable {
        let playerId: String
        let displayName: String
        let slot: Int
        var isValid: Bool { bounded(playerId) && bounded(displayName) && (1...2).contains(slot) }
    }
    struct Segment: Codable, Equatable, Sendable, Identifiable {
        enum ID: String, Codable, Sendable { case front, back, overall }
        enum Label: String, Codable, Sendable { case front = "Front", back = "Back", overall = "Overall" }
        enum State: String, Codable, Sendable { case won, lost, halved, leading, trailing, allSquare, pending, unavailable }
        enum Display: String, Codable, Sendable {
            case won = "Won", lost = "Lost", halved = "Halved", leading = "Leading", trailing = "Trailing"
            case allSquare = "All Square", pending = "Pending", unavailable = "Unavailable"
        }
        let id: ID
        let label: Label
        let state: State
        let display: Display
        let descriptiveOnly: Bool
        let official: Bool
        @MobileRequiredNullable var winnerTeamId: String?
    }
    struct Scores: Codable, Equatable, Sendable {
        enum Scope: String, Codable, Sendable { case player, team }
        enum State: String, Codable, Sendable { case completed, pending, incomplete, unavailable }
        let scope: Scope
        let state: State
        @MobileRequiredNullable var grossScore: Double?
        @MobileRequiredNullable var netScore: Double?
        var isValid: Bool {
            if state == .completed { return grossScore?.isFinite == true && netScore?.isFinite == true }
            return grossScore == nil && netScore == nil
        }
    }

    var isStructurallyCompatible: Bool {
        bounded(playerId) && roundNumber > 0 && MobileOpaqueMatchID.isValid(matchId) &&
        (displayMatchNumber.map { $0.unicodeScalars.count <= 500 } ?? true) &&
        team.isValid && opponent.isValid && team.teamId != opponent.teamId &&
        (1...2).contains(sidePlayers.count) && (1...2).contains(opponents.count) &&
        sidePlayers.allSatisfy(\.isValid) && opponents.allSatisfy(\.isValid) &&
        Set(sidePlayers.map(\.playerId)).count == sidePlayers.count &&
        Set(opponents.map(\.playerId)).count == opponents.count &&
        sidePlayers.contains(where: { $0.playerId == playerId }) &&
        !opponents.contains(where: { $0.playerId == playerId }) &&
        (partner.map { $0.isValid && $0.playerId != playerId && sidePlayers.contains($0) } ?? true) &&
        segments.map(\.id) == [.front, .back, .overall] &&
        segments.allSatisfy { $0.winnerTeamId.map { bounded($0) } ?? true } &&
        (pointsEarned.map { $0.isFinite && $0 >= 0 } ?? true) &&
        (official || pointsEarned == nil) && scores.isValid &&
        (format == .scramble ? scores.scope == .team : scores.scope == .player && partner == nil) &&
        (scorecard.map { $0.isCompatible(with: self) } ?? true)
    }
}

private func bounded(_ value: String) -> Bool { (1...500).contains(value.unicodeScalars.count) }

extension MobileLeadersData {
    var hasCompatibleRoundPerformance: Bool {
        guard let rows = playerRoundPerformance else { return true }
        return rows.count <= 256 && rows.allSatisfy(\.isStructurallyCompatible) &&
            rows.allSatisfy { $0.scorecard.map { $0.tournamentId == tournament.tournamentId } ?? true } &&
            Set(rows.map(\.id)).count == rows.count
    }
}
