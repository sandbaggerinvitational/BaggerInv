import Foundation

struct MobileCalendarDate: Codable, Equatable, Hashable, Sendable, CustomStringConvertible {
    let rawValue: String

    init(_ rawValue: String) throws {
        guard Self.isValid(rawValue) else { throw MobileReadModelError.invalidCalendarDate }
        self.rawValue = rawValue
    }

    init(from decoder: any Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var description: String { rawValue }

    private static func isValid(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
            return false
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return false }
        let components = DateComponents(
            calendar: calendar,
            timeZone: calendar.timeZone,
            year: parts[0],
            month: parts[1],
            day: parts[2]
        )
        guard let date = calendar.date(from: components) else { return false }
        let resolved = calendar.dateComponents([.year, .month, .day], from: date)
        return resolved.year == parts[0] && resolved.month == parts[1] && resolved.day == parts[2]
    }
}

struct MobileLocalTime: Codable, Equatable, Hashable, Sendable, CustomStringConvertible {
    let rawValue: String

    init(_ rawValue: String) throws {
        guard rawValue.range(of: #"^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$"#, options: .regularExpression) != nil else {
            throw MobileReadModelError.invalidLocalTime
        }
        self.rawValue = rawValue
    }

    init(from decoder: any Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var description: String { rawValue }
}

struct MobileTimestamp: Codable, Equatable, Hashable, Sendable, CustomStringConvertible {
    let rawValue: String
    let date: Date

    init(_ rawValue: String) throws {
        guard let date = Self.parse(rawValue) else { throw MobileReadModelError.invalidTimestamp }
        self.rawValue = rawValue
        self.date = date
    }

    init(from decoder: any Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var description: String { rawValue }

    private static func parse(_ value: String) -> Date? {
        guard value.hasSuffix("Z") else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = fractional.date(from: value) { return parsed }
        let wholeSeconds = ISO8601DateFormatter()
        wholeSeconds.formatOptions = [.withInternetDateTime]
        return wholeSeconds.date(from: value)
    }
}

enum MobileReadModelError: Error, Equatable {
    case invalidCalendarDate
    case invalidLocalTime
    case invalidTimestamp
}

/// A JSON field that must be present even when its contract value is `null`.
///
/// Swift's synthesized `Decodable` normally treats a missing optional key and
/// an explicit `null` as the same value. Mobile v1 deliberately distinguishes
/// them: nullable fields remain required members of the response shape.
@propertyWrapper
struct MobileRequiredNullable<Value: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
    private let value: Value?

    var wrappedValue: Value? { value }

    init(wrappedValue: Value?) {
        value = wrappedValue
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        value = container.decodeNil() ? nil : try container.decode(Value.self)
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        if let value {
            try container.encode(value)
        } else {
            try container.encodeNil()
        }
    }
}

struct MobileReadMeta: Codable, Equatable, Sendable {
    let generatedAt: MobileTimestamp
    @MobileRequiredNullable var revision: String?
}

protocol MobileReadPayload: Codable, Equatable, Sendable {
    var tournamentID: String { get }
    var isStructurallyCompatible: Bool { get }
}

protocol MobileReadResponseValidating: Decodable, Sendable {
    var isReadContractCompatible: Bool { get }
}

struct MobileReadResponse<Payload: MobileReadPayload>: Codable, Equatable, Sendable, MobileReadResponseValidating {
    let ok: Bool
    let apiVersion: String
    let data: Payload
    let meta: MobileReadMeta

    var isReadContractCompatible: Bool {
        ok && apiVersion == "v1" && data.isStructurallyCompatible
    }

    func isCompatible(expectedTournamentID: String) -> Bool {
        isReadContractCompatible &&
        !expectedTournamentID.isEmpty &&
        data.tournamentID == expectedTournamentID
    }
}

struct MobileReadTournament: Codable, Equatable, Sendable {
    let tournamentId: String
    let name: String
    @MobileRequiredNullable var year: Int?
    @MobileRequiredNullable var status: String?
    @MobileRequiredNullable var currentRound: Int?
    let timeZone: String

    var isStructurallyCompatible: Bool {
        !tournamentId.isEmpty && !timeZone.isEmpty && TimeZone(identifier: timeZone) != nil
    }
}

struct MobileReadTeam: Codable, Equatable, Sendable {
    @MobileRequiredNullable var teamId: String?
    let name: String
}

struct MobileReadPlayer: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    @MobileRequiredNullable var team: MobileReadTeam?

    var isStructurallyCompatible: Bool {
        !playerId.isEmpty && !displayName.isEmpty
    }
}

struct MobileScheduleEvent: Codable, Equatable, Sendable {
    @MobileRequiredNullable var eventId: String?
    @MobileRequiredNullable var date: MobileCalendarDate?
    @MobileRequiredNullable var startAt: MobileTimestamp?
    @MobileRequiredNullable var endAt: MobileTimestamp?
    @MobileRequiredNullable var localStartTime: MobileLocalTime?
    @MobileRequiredNullable var localEndTime: MobileLocalTime?
    let title: String
    @MobileRequiredNullable var subtitle: String?
    @MobileRequiredNullable var location: String?
    @MobileRequiredNullable var type: String?
}

enum MobileMatchStatus: String, Codable, Equatable, Sendable {
    case scheduled
    case inProgress
    case completed
}

struct MobileMatchRound: Codable, Equatable, Sendable {
    let roundNumber: Int?
    let name: String?
    let format: String?
}

struct MobileMatchCourse: Codable, Equatable, Sendable {
    let courseId: String?
    let name: String?
    let tee: String?
}

struct MobileMatchTeeTime: Codable, Equatable, Sendable {
    let localTime: MobileLocalTime?
    let label: String
    let timeZone: String
}

struct MobileMatchParticipant: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    let teamSide: Int
    let isAuthenticatedPlayer: Bool

    var isStructurallyCompatible: Bool {
        !playerId.isEmpty && !displayName.isEmpty && (teamSide == 1 || teamSide == 2)
    }
}

struct MobileMatchTeam: Codable, Equatable, Sendable {
    let side: Int
    let name: String?
    let participants: [MobileMatchParticipant]

    var isStructurallyCompatible: Bool {
        (side == 1 || side == 2) && participants.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileAuthenticatedPlayerRelationship: Codable, Equatable, Sendable {
    let involved: Bool
    let teamSide: Int?
    let partnerPlayerIds: [String]
    let opponentPlayerIds: [String]

    var isStructurallyCompatible: Bool {
        let sideIsValid = teamSide == nil || teamSide == 1 || teamSide == 2
        let involvementIsConsistent = involved ? teamSide != nil : teamSide == nil
        return sideIsValid && involvementIsConsistent &&
            partnerPlayerIds.allSatisfy { !$0.isEmpty } &&
            opponentPlayerIds.allSatisfy { !$0.isEmpty }
    }
}

struct MobileMatchProgress: Codable, Equatable, Sendable {
    let currentHole: Int?
}

struct MobileMatchResult: Codable, Equatable, Sendable {
    let summary: String?
    let winner: String?
    let teamOnePoints: Double?
    let teamTwoPoints: Double?
}

struct MobileMatch: Codable, Equatable, Sendable {
    let matchId: String
    let round: MobileMatchRound
    let status: MobileMatchStatus
    @MobileRequiredNullable var course: MobileMatchCourse?
    @MobileRequiredNullable var teeTime: MobileMatchTeeTime?
    let teams: [MobileMatchTeam]
    let authenticatedPlayer: MobileAuthenticatedPlayerRelationship
    @MobileRequiredNullable var progress: MobileMatchProgress?
    @MobileRequiredNullable var result: MobileMatchResult?

    var isStructurallyCompatible: Bool {
        let lifecycleIsConsistent: Bool
        switch status {
        case .scheduled:
            lifecycleIsConsistent = progress == nil && result == nil
        case .inProgress:
            lifecycleIsConsistent = progress != nil && result == nil
        case .completed:
            lifecycleIsConsistent = progress == nil && result != nil
        }
        let authenticatedParticipants = teams.flatMap(\.participants).filter(\.isAuthenticatedPlayer)
        let relationshipIsConsistent = authenticatedPlayer.involved
            ? authenticatedParticipants.count == 1 && authenticatedParticipants.first?.teamSide == authenticatedPlayer.teamSide
            : authenticatedParticipants.isEmpty
        return !matchId.isEmpty &&
        teams.count == 2 &&
        Set(teams.map(\.side)) == Set([1, 2]) &&
        teams.allSatisfy(\.isStructurallyCompatible) &&
        authenticatedPlayer.isStructurallyCompatible &&
        lifecycleIsConsistent &&
        relationshipIsConsistent &&
        (teeTime.map { !$0.timeZone.isEmpty && TimeZone(identifier: $0.timeZone) != nil } ?? true)
    }
}

struct MobileTodayData: MobileReadPayload {
    let tournament: MobileReadTournament
    let player: MobileReadPlayer
    @MobileRequiredNullable var currentMatch: MobileMatch?
    let immediateSchedule: [MobileScheduleEvent]

    var tournamentID: String { tournament.tournamentId }
    var isStructurallyCompatible: Bool {
        tournament.isStructurallyCompatible &&
        player.isStructurallyCompatible &&
        immediateSchedule.count <= 3 &&
        (currentMatch.map { $0.isStructurallyCompatible && $0.authenticatedPlayer.involved } ?? true)
    }
}

struct MobileMatchesData: MobileReadPayload {
    let tournament: MobileReadTournament
    let matches: [MobileMatch]

    var tournamentID: String { tournament.tournamentId }
    var isStructurallyCompatible: Bool {
        tournament.isStructurallyCompatible && matches.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileTeamStanding: Codable, Equatable, Sendable {
    @MobileRequiredNullable var rank: Int?
    let teamId: String
    let name: String
    @MobileRequiredNullable var points: Double?
    let record: String
    @MobileRequiredNullable var remainingMatches: Int?
}

struct MobilePlayerStanding: Codable, Equatable, Sendable {
    @MobileRequiredNullable var rank: Int?
    let playerId: String
    let displayName: String
    let team: MobileReadTeam
    @MobileRequiredNullable var points: Double?
    let record: String
}

struct MobileLeadersData: MobileReadPayload {
    let tournament: MobileReadTournament
    let teamStandings: [MobileTeamStanding]
    let playerStandings: [MobilePlayerStanding]

    var tournamentID: String { tournament.tournamentId }
    var isStructurallyCompatible: Bool {
        tournament.isStructurallyCompatible &&
        teamStandings.allSatisfy { !$0.teamId.isEmpty } &&
        playerStandings.allSatisfy { !$0.playerId.isEmpty && !$0.displayName.isEmpty }
    }
}

struct MobileScheduleData: MobileReadPayload {
    let tournamentId: String
    let timeZone: String
    let events: [MobileScheduleEvent]

    var tournamentID: String { tournamentId }
    var isStructurallyCompatible: Bool {
        !tournamentId.isEmpty && !timeZone.isEmpty && TimeZone(identifier: timeZone) != nil
    }
}

typealias MobileTodayResponse = MobileReadResponse<MobileTodayData>
typealias MobileMatchesResponse = MobileReadResponse<MobileMatchesData>
typealias MobileLeadersResponse = MobileReadResponse<MobileLeadersData>
typealias MobileScheduleResponse = MobileReadResponse<MobileScheduleData>
