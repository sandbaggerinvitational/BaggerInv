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
        guard value.hasSuffix("Z") || value.hasSuffix("+00:00") || value.hasSuffix("+0000") else {
            return nil
        }
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

enum MobileReadContextBinding: Equatable, Sendable {
    case authenticatedRequest
    case observer(subjectID: String, tournamentID: String)
    case tournament(String)
    case participant(playerID: String, tournamentID: String)

    func isCompatible(expectedTournamentID: String, expectedPlayerID: String?) -> Bool {
        guard !expectedTournamentID.isEmpty else { return false }
        switch self {
        case .observer(let subjectID, let tournamentID):
            return UUID(uuidString: subjectID) != nil && tournamentID == expectedTournamentID && (expectedPlayerID.map { $0 == "observer-\(subjectID)" } ?? true)
        case .authenticatedRequest:
            return true
        case .tournament(let tournamentID):
            return !tournamentID.isEmpty && tournamentID == expectedTournamentID
        case .participant(let playerID, let tournamentID):
            guard !playerID.isEmpty,
                  !tournamentID.isEmpty,
                  tournamentID == expectedTournamentID
            else { return false }
            return expectedPlayerID.map { !$0.isEmpty && $0 == playerID } ?? true
        }
    }
}

protocol MobileReadPayload: Codable, Equatable, Sendable {
    var contextBinding: MobileReadContextBinding { get }
    var isStructurallyCompatible: Bool { get }
    var revocableParticipantRepresentationKeys: Set<String> { get }
}

extension MobileReadPayload {
    var revocableParticipantRepresentationKeys: Set<String> { [] }
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
        guard isReadContractCompatible,
              data.contextBinding.isCompatible(
                  expectedTournamentID: expectedTournamentID,
                  expectedPlayerID: nil
              )
        else { return false }
        return true
    }

    func isCompatible(expectedTournamentID: String, expectedPlayerID: String) -> Bool {
        guard isCompatible(expectedTournamentID: expectedTournamentID),
              !expectedPlayerID.isEmpty,
              data.contextBinding.isCompatible(
                  expectedTournamentID: expectedTournamentID,
                  expectedPlayerID: expectedPlayerID
              )
        else { return false }
        return true
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
    var dayLabel: String? = nil
    var details: String? = nil
    var roundId: String? = nil
    var courseId: String? = nil
    var courseName: String? = nil
    var displayOrder: Double? = nil
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
    let player: MobileReadPlayer?
    var observer: MobileObserverReference? = nil
    @MobileRequiredNullable var currentMatch: MobileMatch?
    let immediateSchedule: [MobileScheduleEvent]

    var contextBinding: MobileReadContextBinding {
        observer.map { .observer(subjectID: $0.subjectId, tournamentID: tournament.tournamentId) } ?? .participant(playerID: player?.playerId ?? "", tournamentID: tournament.tournamentId)
    }
    var isStructurallyCompatible: Bool {
        tournament.isStructurallyCompatible &&
        ((observer?.isCompatible == true && player == nil && currentMatch == nil) || (observer == nil && player?.isStructurallyCompatible == true)) &&
        immediateSchedule.count <= 3 &&
        (currentMatch.map { $0.isStructurallyCompatible && $0.authenticatedPlayer.involved } ?? true)
    }
}

/// Strict participant Match-list DTOs. `/today.currentMatch` intentionally
/// retains the smaller `MobileMatch` shape, while `/matches` requires these
/// additive identity and golf-intelligence fields even when their values are
/// canonically `null`.
struct MobileMatchesParticipant: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    let teamSide: Int
    let isAuthenticatedPlayer: Bool
    @MobileRequiredNullable var playingHandicap: Double?
    @MobileRequiredNullable var strokesReceived: Int?
    /// Additive display authority. Missing on older servers means unavailable, not rounded PH.
    var courseHandicap: Double? = nil

    var isStructurallyCompatible: Bool {
        !playerId.isEmpty &&
        !displayName.isEmpty &&
        (teamSide == 1 || teamSide == 2) &&
        (courseHandicap.map(\.isFinite) ?? true) &&
        (playingHandicap.map(\.isFinite) ?? true) &&
        (strokesReceived.map { $0 >= 0 } ?? true)
    }
}

struct MobileMatchesTeam: Codable, Equatable, Sendable {
    let side: Int
    let teamId: String
    @MobileRequiredNullable var name: String?
    @MobileRequiredNullable var playingHandicap: Double?
    @MobileRequiredNullable var strokesReceived: Int?
    let participants: [MobileMatchesParticipant]

    var isStructurallyCompatible: Bool {
        (side == 1 || side == 2) &&
        !teamId.isEmpty &&
        participants.count <= 2 &&
        (playingHandicap.map(\.isFinite) ?? true) &&
        (strokesReceived.map { $0 >= 0 } ?? true) &&
        participants.allSatisfy(\.isStructurallyCompatible)
    }
}

struct MobileMatchesMatch: Codable, Equatable, Sendable {
    let matchId: String
    @MobileRequiredNullable var displayMatchNumber: String?
    let round: MobileMatchRound
    let status: MobileMatchStatus
    @MobileRequiredNullable var course: MobileMatchCourse?
    @MobileRequiredNullable var teeTime: MobileMatchTeeTime?
    let teams: [MobileMatchesTeam]
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
            ? authenticatedParticipants.count == 1 &&
                authenticatedParticipants.first?.teamSide == authenticatedPlayer.teamSide
            : authenticatedParticipants.isEmpty

        let formatSemanticsAreCompatible: Bool
        switch round.format?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "SC", "SCRAMBLE":
            formatSemanticsAreCompatible = teams.allSatisfy {
                $0.participants.allSatisfy { $0.strokesReceived == nil }
            }
        case "BB", "BEST BALL", "SI", "SINGLES":
            formatSemanticsAreCompatible = teams.allSatisfy {
                $0.playingHandicap == nil && $0.strokesReceived == nil
            }
        default:
            formatSemanticsAreCompatible = true
        }

        return MobileOpaqueMatchID.isValid(matchId) &&
        (displayMatchNumber.map { !$0.isEmpty } ?? true) &&
        teams.count == 2 &&
        Set(teams.map(\.side)) == Set([1, 2]) &&
        teams.allSatisfy(\.isStructurallyCompatible) &&
        authenticatedPlayer.isStructurallyCompatible &&
        lifecycleIsConsistent &&
        relationshipIsConsistent &&
        formatSemanticsAreCompatible &&
        (teeTime.map { !$0.timeZone.isEmpty && TimeZone(identifier: $0.timeZone) != nil } ?? true)
    }
}

struct MobileMatchesData: MobileReadPayload {
    let tournament: MobileReadTournament
    let matches: [MobileMatchesMatch]

    var contextBinding: MobileReadContextBinding {
        .tournament(tournament.tournamentId)
    }
    var isStructurallyCompatible: Bool {
        tournament.isStructurallyCompatible &&
        matches.count <= 64 &&
        matches.allSatisfy(\.isStructurallyCompatible)
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

enum MobileRoundStandingStatus: String, Codable, Equatable, Sendable {
    case upcoming
    case inProgress
    case final
}

enum MobileLeadersRoundFormat: String, Codable, Equatable, Sendable {
    case bestBall = "BB"
    case scramble = "SC"
    case singles = "SI"
}

struct MobileLeadersRoundCourse: Codable, Equatable, Sendable {
    @MobileRequiredNullable var courseId: String?
    @MobileRequiredNullable var name: String?
    @MobileRequiredNullable var tee: String?

    var isStructurallyCompatible: Bool {
        [courseId, name, tee].allSatisfy { $0.map { $0.unicodeScalars.count <= 500 } ?? true }
    }
}

struct MobileRoundStanding: Codable, Equatable, Sendable {
    let roundNumber: Int
    let roundName: String
    let status: MobileRoundStandingStatus
    let teamStandings: [MobileTeamStanding]
    // Additive certified context. Old cached responses may omit these fields.
    var format: MobileLeadersRoundFormat? = nil
    var formatDisplayName: String? = nil
    var course: MobileLeadersRoundCourse? = nil

    var isStructurallyCompatible: Bool {
        roundNumber >= 1 &&
        (formatDisplayName.map { $0.unicodeScalars.count <= 500 } ?? true) &&
        (course?.isStructurallyCompatible ?? true) &&
        teamStandings.allSatisfy(\.isStructurallyCompatible)
    }
}

extension MobileRoundStanding {
    init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        roundNumber = try values.decode(Int.self, forKey: .roundNumber)
        roundName = try values.decode(String.self, forKey: .roundName)
        status = try values.decode(MobileRoundStandingStatus.self, forKey: .status)
        teamStandings = try values.decode([MobileTeamStanding].self, forKey: .teamStandings)
        format = try values.decodeIfPresent(MobileLeadersRoundFormat.self, forKey: .format)
        formatDisplayName = try values.decodeIfPresent(String.self, forKey: .formatDisplayName)
        // The course object is optional, but when supplied it cannot be null;
        // its three members are required-nullable in the certified schema.
        course = values.contains(.course) ? try values.decode(MobileLeadersRoundCourse.self, forKey: .course) : nil
    }
}

struct MobileLeadersData: MobileReadPayload {
    let tournament: MobileReadTournament
    let teamStandings: [MobileTeamStanding]
    let roundStandings: [MobileRoundStanding]
    let playerStandings: [MobilePlayerStanding]
    var playerIntelligence: MobilePlayersIntelligence? = nil
    var playerRoundPerformance: [MobilePlayerRoundPerformance]? = nil
    var r1RoundCompetition: MobileR1RoundCompetition? = nil
    var r2PairCompetition: MobileR2PairCompetition? = nil
    var r3RoundCompetition: MobileR3RoundCompetition? = nil

    var contextBinding: MobileReadContextBinding {
        .tournament(tournament.tournamentId)
    }
    var isStructurallyCompatible: Bool {
        tournament.isStructurallyCompatible &&
        teamStandings.allSatisfy(\.isStructurallyCompatible) &&
        roundStandings.allSatisfy(\.isStructurallyCompatible) &&
        playerStandings.allSatisfy(\.isStructurallyCompatible) &&
        (playerIntelligence?.isStructurallyCompatible ?? true) && hasCompatibleRoundPerformance && hasCompatibleR1Competition && hasCompatibleR2Competition && hasCompatibleR3Competition
    }
}

extension MobileLeadersData {
    init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        tournament = try values.decode(MobileReadTournament.self, forKey: .tournament)
        teamStandings = try values.decode([MobileTeamStanding].self, forKey: .teamStandings)
        roundStandings = try values.decode([MobileRoundStanding].self, forKey: .roundStandings)
        playerStandings = try values.decode([MobilePlayerStanding].self, forKey: .playerStandings)
        // Omitted in older cache entries; a present malformed/null object is
        // not silently downgraded to legacy data.
        playerIntelligence = values.contains(.playerIntelligence)
            ? try values.decode(MobilePlayersIntelligence.self, forKey: .playerIntelligence) : nil
        playerRoundPerformance = values.contains(.playerRoundPerformance)
            ? try values.decode([MobilePlayerRoundPerformance].self, forKey: .playerRoundPerformance) : nil
        // This additive field explicitly permits null when R1 Best Ball is
        // unavailable. A present malformed object must still fail decoding.
        r1RoundCompetition = try values.decodeIfPresent(MobileR1RoundCompetition.self, forKey: .r1RoundCompetition)
        r2PairCompetition = try values.decodeIfPresent(MobileR2PairCompetition.self, forKey: .r2PairCompetition)
        r3RoundCompetition = try values.decodeIfPresent(MobileR3RoundCompetition.self, forKey: .r3RoundCompetition)
    }
}

private extension MobileTeamStanding {
    var isStructurallyCompatible: Bool {
        !teamId.isEmpty &&
        !name.isEmpty &&
        (rank.map { $0 >= 1 } ?? true) &&
        (points.map(\.isFinite) ?? true) &&
        (remainingMatches.map { $0 >= 0 } ?? true)
    }
}

private extension MobilePlayerStanding {
    var isStructurallyCompatible: Bool {
        !playerId.isEmpty &&
        !displayName.isEmpty &&
        !team.name.isEmpty &&
        (rank.map { $0 >= 1 } ?? true) &&
        (points.map(\.isFinite) ?? true)
    }
}

struct MobileScheduleData: MobileReadPayload {
    let tournamentId: String
    let timeZone: String
    let events: [MobileScheduleEvent]
    var publicationState: String? = nil
    var publishedAt: MobileTimestamp? = nil

    var contextBinding: MobileReadContextBinding { .tournament(tournamentId) }
    var isStructurallyCompatible: Bool {
        !tournamentId.isEmpty && !timeZone.isEmpty && TimeZone(identifier: timeZone) != nil
            && (publicationState == nil || publicationState == "PUBLISHED"
                || (publicationState == "UNPUBLISHED" && events.isEmpty && publishedAt == nil))
    }
}

typealias MobileTodayResponse = MobileReadResponse<MobileTodayData>
typealias MobileMatchesResponse = MobileReadResponse<MobileMatchesData>
typealias MobileLeadersResponse = MobileReadResponse<MobileLeadersData>
typealias MobileScheduleResponse = MobileReadResponse<MobileScheduleData>

struct MobileObserverReference: Codable, Equatable, Sendable {
    let subjectId: String
    var isCompatible: Bool { UUID(uuidString: subjectId) != nil }
    func isExclusive(of playerID: String?) -> Bool { isCompatible && playerID == nil }
}
