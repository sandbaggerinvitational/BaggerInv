import Foundation

enum MobileRecordValue: Codable, Equatable, Sendable {
    case number(Double)
    case text(String)

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else {
            self = .text(try container.decode(String.self))
        }
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .number(let value): try container.encode(value)
        case .text(let value): try container.encode(value)
        }
    }

    var isStructurallyCompatible: Bool {
        switch self {
        case .number(let value): value.isFinite
        case .text(let value): value.count <= 128
        }
    }
}

enum MobileRecordHolderEntityType: String, Codable, Equatable, Sendable {
    case player = "PLAYER"
    case teamPerformance = "TEAM_PERFORMANCE"
    case courseHole = "COURSE_HOLE"
    case matchPerformance = "MATCH_PERFORMANCE"
}

enum MobileRecordSource: String, Codable, Equatable, Sendable {
    case official = "OFFICIAL"
    case scorecard = "SCORECARD"
    case matchProgression = "MATCH_PROGRESSION"
}

enum MobileRecordDirection: String, Codable, Equatable, Sendable {
    case highest
    case lowest
}

enum MobileRecordCategoryID: String, Codable, Equatable, Sendable {
    case allTime = "ALL_TIME"
    case individual = "INDIVIDUAL"
    case team = "TEAM"
    case courseHole = "COURSE_HOLE"
    case advanced = "ADVANCED"
    case matchPlay = "MATCH_PLAY"
    case matchProgression = "MATCH_PROGRESSION"
}

struct MobileRecordsCoverage: Codable, Equatable, Sendable {
    let firstCompleteMatchYear: Int
    let scorecardHistoryComplete: Bool
    let note: String
}

struct MobileRecordHolder: Codable, Equatable, Sendable {
    let entityType: MobileRecordHolderEntityType
    let playerIds: [String]
    @MobileRequiredNullable var displayName: String?
    let participantNames: [String]
    @MobileRequiredNullable var teamId: String?
    @MobileRequiredNullable var teamName: String?
    @MobileRequiredNullable var courseId: String?
    @MobileRequiredNullable var courseName: String?
    @MobileRequiredNullable var holeNumber: Int?
    @MobileRequiredNullable var matchId: String?
    @MobileRequiredNullable var year: Int?
    @MobileRequiredNullable var roundNumber: Int?
    @MobileRequiredNullable var format: String?
    @MobileRequiredNullable var value: MobileRecordValue?
    @MobileRequiredNullable var valueDisplay: String?
    @MobileRequiredNullable var secondaryValue: Double?
}

struct MobileRecord: Codable, Equatable, Sendable {
    let recordId: String
    let title: String
    let source: MobileRecordSource
    let direction: MobileRecordDirection
    @MobileRequiredNullable var unit: String?
    let decimals: Int
    let signed: Bool
    let aggregate: Bool
    @MobileRequiredNullable var eligibilityNote: String?
    @MobileRequiredNullable var value: MobileRecordValue?
    @MobileRequiredNullable var valueDisplay: String?
    let tied: Bool
    let holders: [MobileRecordHolder]
}

struct MobileRecordCategory: Codable, Equatable, Sendable {
    let categoryId: MobileRecordCategoryID
    let title: String
    let order: Int
    let records: [MobileRecord]
}

struct MobileRecordsData: MobileReadPayload {
    let coverage: MobileRecordsCoverage
    let categories: [MobileRecordCategory]

    var contextBinding: MobileReadContextBinding { .authenticatedRequest }

    var isStructurallyCompatible: Bool {
        (2017...2026).contains(coverage.firstCompleteMatchYear) &&
        MobileParticipantContentValidation.text(coverage.note, maximum: 240) &&
        categories.count <= 10 &&
        categories.allSatisfy(\.isStructurallyCompatible)
    }
}

typealias MobileRecordsResponse = MobileReadResponse<MobileRecordsData>

private extension MobileRecordCategory {
    var isStructurallyCompatible: Bool {
        (0...9).contains(order) &&
        MobileParticipantContentValidation.text(title, maximum: 120) &&
        records.count <= 128 &&
        records.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobileRecord {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(recordId) &&
        MobileParticipantContentValidation.text(title, maximum: 200) &&
        MobileParticipantContentValidation.text(unit, maximum: 40) &&
        (0...8).contains(decimals) &&
        MobileParticipantContentValidation.text(eligibilityNote, maximum: 240) &&
        (value?.isStructurallyCompatible ?? true) &&
        MobileParticipantContentValidation.text(valueDisplay, maximum: 160) &&
        holders.count <= 32 &&
        holders.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobileRecordHolder {
    var isStructurallyCompatible: Bool {
        playerIds.count <= 4 &&
        Set(playerIds).count == playerIds.count &&
        playerIds.allSatisfy { MobileParticipantContentValidation.id($0) } &&
        MobileParticipantContentValidation.text(displayName, maximum: 200) &&
        participantNames.count <= 4 &&
        participantNames.allSatisfy {
            MobileParticipantContentValidation.text($0, maximum: 160)
        } &&
        MobileParticipantContentValidation.text(teamId, maximum: 128) &&
        MobileParticipantContentValidation.text(teamName, maximum: 160) &&
        MobileParticipantContentValidation.text(courseId, maximum: 128) &&
        MobileParticipantContentValidation.text(courseName, maximum: 160) &&
        (holeNumber.map { (1...18).contains($0) } ?? true) &&
        MobileParticipantContentValidation.text(matchId, maximum: 128) &&
        (year.map { (2017...2026).contains($0) } ?? true) &&
        (roundNumber.map { (1...8).contains($0) } ?? true) &&
        MobileParticipantContentValidation.text(format, maximum: 16) &&
        (value?.isStructurallyCompatible ?? true) &&
        MobileParticipantContentValidation.text(valueDisplay, maximum: 160) &&
        MobileParticipantContentValidation.finite(secondaryValue)
    }
}
