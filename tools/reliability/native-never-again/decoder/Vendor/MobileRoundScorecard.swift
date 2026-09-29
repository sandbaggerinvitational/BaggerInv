import Foundation

/// Certified matchup read facts. No handicap allocation or score arithmetic belongs here.
struct MobileRoundScorecard: Codable, Equatable, Sendable {
    enum NetBasis: String, Codable, Sendable { case matchup = "MATCHUP" }
    enum Scope: String, Codable, Sendable { case player = "PLAYER", team = "TEAM" }
    enum State: String, Codable, Sendable { case official, inProgress, incomplete, unavailable }
    let tournamentId: String
    let roundNumber: Int
    let matchId: String
    let format: MobileLeadersRoundFormat
    let netBasis: NetBasis
    let scope: Scope
    @MobileRequiredNullable var playerId: String?
    let team: MobilePlayerRoundPerformance.Team
    let players: [MobilePlayerRoundPerformance.Player]
    let course: Course
    let state: State
    let official: Bool
    let complete: Bool
    let holes: [Hole]
    let totals: Totals
    var summary: Summary? = nil
    var matchStrokes: Int? = nil

    /// Optional additive read projection. Missing summaries are never reconstructed.
    struct Summary: Codable, Equatable, Sendable {
        let out: Values
        let `in`: Values
        let total: Values
        struct Values: Codable, Equatable, Sendable {
            @MobileRequiredNullable var par: Int?
            @MobileRequiredNullable var gross: Int?
            @MobileRequiredNullable var net: Int?
            var isValid: Bool { (par.map { $0 >= 1 } ?? true) && (gross.map { $0 >= 1 } ?? true) }
        }
    }

    struct Course: Codable, Equatable, Sendable {
        @MobileRequiredNullable var courseId: String?
        @MobileRequiredNullable var name: String?
        @MobileRequiredNullable var tee: String?
    }
    struct Hole: Codable, Equatable, Sendable {
        let holeNumber: Int
        @MobileRequiredNullable var par: Int?
        @MobileRequiredNullable var gross: Int?
        @MobileRequiredNullable var appliedStrokes: Int?
        @MobileRequiredNullable var net: Int?
        var hasAllValues: Bool { par != nil && gross != nil && appliedStrokes != nil && net != nil }
        var isValid: Bool {
            (1...18).contains(holeNumber) && (par.map { (1...9).contains($0) } ?? true) &&
            (gross.map { (1...20).contains($0) } ?? true) && (appliedStrokes.map { $0 >= 0 } ?? true)
        }
    }
    struct Totals: Codable, Equatable, Sendable {
        @MobileRequiredNullable var frontGross: Int?
        @MobileRequiredNullable var frontNet: Int?
        @MobileRequiredNullable var backGross: Int?
        @MobileRequiredNullable var backNet: Int?
        @MobileRequiredNullable var totalGross: Int?
        @MobileRequiredNullable var totalNet: Int?
        var values: [Int?] { [frontGross, frontNet, backGross, backNet, totalGross, totalNet] }
    }

    func isCompatible(with performance: MobilePlayerRoundPerformance) -> Bool {
        guard (1...500).contains(tournamentId.unicodeScalars.count),
              roundNumber == performance.roundNumber, format == performance.format,
              Data(matchId.utf8) == Data(performance.matchId.utf8), team == performance.team,
              holes.count <= 18, holes.allSatisfy(\.isValid),
              Set(holes.map(\.holeNumber)).count == holes.count,
              zip(holes, holes.dropFirst()).allSatisfy({ $0.holeNumber < $1.holeNumber }),
              [course.courseId, course.name, course.tee].allSatisfy({ $0.map { (1...500).contains($0.unicodeScalars.count) } ?? true }),
              totals.frontGross == nil, totals.backGross == nil,
              totals.totalGross.map({ $0 >= 18 }) ?? true,
              matchStrokes.map({ $0 >= 0 }) ?? true,
              summaryIsCompatible,
              complete == (holes.count == 18 && holes.allSatisfy(\.hasAllValues)),
              official == (state == .official) else { return false }
        if format == .scramble {
            guard scope == .team, playerId == nil, players == performance.sidePlayers,
                  players.count == 2, performance.partner != nil else { return false }
        } else {
            guard scope == .player, playerId == performance.playerId,
                  players == performance.sidePlayers.filter({ $0.playerId == performance.playerId }) else { return false }
        }
        if official {
            return complete && performance.official && performance.scores.state == .completed &&
                totals.frontNet != nil && totals.backNet != nil &&
                totals.totalGross.map(Double.init) == performance.scores.grossScore &&
                totals.totalNet.map(Double.init) == performance.scores.netScore
        }
        return totals.values.allSatisfy { $0 == nil } &&
            (state != .unavailable || holes.allSatisfy { $0.gross == nil })
    }

    private var summaryIsCompatible: Bool {
        guard let summary else { return true }
        guard [summary.out, summary.in, summary.total].allSatisfy(\.isValid) else { return false }
        // Compare supplied facts only; no hole aggregation or stroke/Net arithmetic.
        guard summary.out.net == totals.frontNet, summary.in.net == totals.backNet,
              summary.total.gross == totals.totalGross, summary.total.net == totals.totalNet else { return false }
        if !official {
            return [summary.out, summary.in, summary.total].allSatisfy { $0.gross == nil && $0.net == nil }
        }
        return true
    }
}
