import Foundation

enum MobileHistoryStatus: String, Codable, Equatable, Sendable {
    case upcoming
    case inProgress
    case final
}

struct MobileHistoryTeamResult: Codable, Equatable, Sendable {
    let teamId: String
    let name: String
    let side: Int
    @MobileRequiredNullable var points: Double?
}

struct MobileHistoryFinalScore: Codable, Equatable, Sendable {
    @MobileRequiredNullable var teamOnePoints: Double?
    @MobileRequiredNullable var teamTwoPoints: Double?
    let label: String
}

struct MobileHistoryTournamentSummary: Codable, Equatable, Sendable {
    let tournamentId: String
    let year: Int
    let name: String
    @MobileRequiredNullable var editionTitle: String?
    @MobileRequiredNullable var destination: String?
    @MobileRequiredNullable var startDate: MobileCalendarDate?
    @MobileRequiredNullable var endDate: MobileCalendarDate?
    let status: MobileHistoryStatus
    let teams: [MobileHistoryTeamResult]
    @MobileRequiredNullable var champion: MobileHistoryTeamResult?
    @MobileRequiredNullable var runnerUp: MobileHistoryTeamResult?
    @MobileRequiredNullable var finalScore: MobileHistoryFinalScore?
    let detailAvailable: Bool
    let revision: String
}

struct MobileHistoryData: MobileReadPayload {
    let tournaments: [MobileHistoryTournamentSummary]

    var contextBinding: MobileReadContextBinding { .authenticatedRequest }

    var isStructurallyCompatible: Bool {
        tournaments.count <= 32 &&
        tournaments.allSatisfy(\.isStructurallyCompatible)
    }
}

typealias MobileHistoryArchiveData = MobileHistoryData
typealias MobileHistoryResponse = MobileReadResponse<MobileHistoryData>
typealias MobileHistoryArchiveResponse = MobileHistoryResponse

struct MobileHistoryPlayerReference: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
}

struct MobileHistoryRosterPlayer: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    @MobileRequiredNullable var handicap: Double?
    let isCaptain: Bool
}

struct MobileHistoryTeam: Codable, Equatable, Sendable {
    let teamId: String
    let name: String
    let side: Int
    @MobileRequiredNullable var points: Double?
    @MobileRequiredNullable var captain: MobileHistoryPlayerReference?
    @MobileRequiredNullable var averageHandicap: Double?
    let roster: [MobileHistoryRosterPlayer]
}

struct MobileHistoryCourse: Codable, Equatable, Sendable {
    @MobileRequiredNullable var courseId: String?
    @MobileRequiredNullable var name: String?
    @MobileRequiredNullable var location: String?
    @MobileRequiredNullable var tee: String?
    @MobileRequiredNullable var par: Double?
    @MobileRequiredNullable var yardage: Double?
}

struct MobileHistoryRound: Codable, Equatable, Sendable {
    let roundNumber: Int
    let name: String
    let status: MobileHistoryStatus
    @MobileRequiredNullable var format: String?
    @MobileRequiredNullable var course: MobileHistoryCourse?
    let teamStandings: [MobileHistoryTeamResult]
    let matchIds: [String]
}

struct MobileHistorySide: Codable, Equatable, Sendable {
    let side: Int
    let participants: [MobileHistoryPlayerReference]
}

struct MobileHistoryResult: Codable, Equatable, Sendable {
    @MobileRequiredNullable var summary: String?
    @MobileRequiredNullable var winner: String?
    @MobileRequiredNullable var teamOnePoints: Double?
    @MobileRequiredNullable var teamTwoPoints: Double?
}

struct MobileHistoryMatch: Codable, Equatable, Sendable {
    let matchId: String
    @MobileRequiredNullable var matchNumber: Int?
    let status: MobileHistoryStatus
    @MobileRequiredNullable var format: String?
    @MobileRequiredNullable var course: MobileHistoryCourse?
    let sides: [MobileHistorySide]
    @MobileRequiredNullable var result: MobileHistoryResult?
    let scorecardIds: [String]
}

struct MobileHistoryStanding: Codable, Equatable, Sendable {
    let rank: Int
    let playerId: String
    let displayName: String
    @MobileRequiredNullable var teamName: String?
    @MobileRequiredNullable var points: Double?
    @MobileRequiredNullable var wins: Double?
    @MobileRequiredNullable var losses: Double?
    @MobileRequiredNullable var ties: Double?
}

struct MobileHistoryAward: Codable, Equatable, Sendable {
    let awardId: String
    let title: String
    @MobileRequiredNullable var recipient: String?
    @MobileRequiredNullable var playerId: String?
}

struct MobileHistoryHole: Codable, Equatable, Sendable {
    @MobileRequiredNullable var holeNumber: Int?
    @MobileRequiredNullable var grossScore: Int?
    @MobileRequiredNullable var par: Int?
    @MobileRequiredNullable var strokeIndex: Int?
    @MobileRequiredNullable var strokesReceived: Int?
    @MobileRequiredNullable var netScore: Int?
}

enum MobileHistoryScorecardEntityType: String, Codable, Equatable, Sendable {
    case individual = "INDIVIDUAL"
    case team = "TEAM"
}

struct MobileHistoryScorecard: Codable, Equatable, Sendable {
    let scorecardId: String
    let matchId: String
    let entityType: MobileHistoryScorecardEntityType
    @MobileRequiredNullable var playerId: String?
    @MobileRequiredNullable var teamId: String?
    let participantPlayerIds: [String]
    let status: String
    @MobileRequiredNullable var grossTotal: Double?
    @MobileRequiredNullable var netTotal: Double?
    let holes: [MobileHistoryHole]
}

struct MobileHistoryDetailData: MobileReadPayload {
    let tournament: MobileHistoryTournamentSummary
    let teams: [MobileHistoryTeam]
    let rounds: [MobileHistoryRound]
    let matches: [MobileHistoryMatch]
    let standings: [MobileHistoryStanding]
    let awards: [MobileHistoryAward]
    let scorecards: [MobileHistoryScorecard]

    var contextBinding: MobileReadContextBinding { .authenticatedRequest }

    var isStructurallyCompatible: Bool {
        tournament.isStructurallyCompatible &&
        teams.count == 2 &&
        teams.allSatisfy(\.isStructurallyCompatible) &&
        rounds.count <= 8 &&
        rounds.allSatisfy(\.isStructurallyCompatible) &&
        matches.count <= 64 &&
        matches.allSatisfy(\.isStructurallyCompatible) &&
        standings.count <= 128 &&
        standings.allSatisfy(\.isStructurallyCompatible) &&
        awards.count <= 64 &&
        awards.allSatisfy(\.isStructurallyCompatible) &&
        scorecards.count <= 256 &&
        scorecards.allSatisfy(\.isStructurallyCompatible)
    }
}

typealias MobileHistoryDetailResponse = MobileReadResponse<MobileHistoryDetailData>

private extension MobileHistoryTournamentSummary {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(tournamentId) &&
        (2017...2026).contains(year) &&
        MobileParticipantContentValidation.text(name, maximum: 200) &&
        MobileParticipantContentValidation.text(editionTitle, maximum: 200) &&
        MobileParticipantContentValidation.text(destination, maximum: 240) &&
        teams.count == 2 &&
        teams.allSatisfy(\.isStructurallyCompatible) &&
        (champion?.isStructurallyCompatible ?? true) &&
        (runnerUp?.isStructurallyCompatible ?? true) &&
        (finalScore?.isStructurallyCompatible ?? true) &&
        MobileParticipantContentValidation.text(revision, maximum: 128, allowEmpty: true)
    }
}

private extension MobileHistoryTeamResult {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(teamId) &&
        MobileParticipantContentValidation.text(name, maximum: 160) &&
        (1...2).contains(side) &&
        MobileParticipantContentValidation.finite(points)
    }
}

private extension MobileHistoryFinalScore {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.finite(teamOnePoints) &&
        MobileParticipantContentValidation.finite(teamTwoPoints) &&
        MobileParticipantContentValidation.text(label, maximum: 160)
    }
}

private extension MobileHistoryPlayerReference {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(playerId) &&
        MobileParticipantContentValidation.text(displayName, maximum: 160)
    }
}

private extension MobileHistoryRosterPlayer {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(playerId) &&
        MobileParticipantContentValidation.text(displayName, maximum: 160) &&
        MobileParticipantContentValidation.finite(handicap)
    }
}

private extension MobileHistoryTeam {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(teamId) &&
        MobileParticipantContentValidation.text(name, maximum: 160) &&
        (1...2).contains(side) &&
        MobileParticipantContentValidation.finite(points) &&
        (captain?.isStructurallyCompatible ?? true) &&
        MobileParticipantContentValidation.finite(averageHandicap) &&
        roster.count <= 64 &&
        roster.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobileHistoryCourse {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.text(courseId, maximum: 128) &&
        MobileParticipantContentValidation.text(name, maximum: 160) &&
        MobileParticipantContentValidation.text(location, maximum: 240) &&
        MobileParticipantContentValidation.text(tee, maximum: 80) &&
        MobileParticipantContentValidation.finite(par) &&
        MobileParticipantContentValidation.finite(yardage)
    }
}

private extension MobileHistoryRound {
    var isStructurallyCompatible: Bool {
        (1...8).contains(roundNumber) &&
        MobileParticipantContentValidation.text(name, maximum: 120) &&
        MobileParticipantContentValidation.text(format, maximum: 16) &&
        (course?.isStructurallyCompatible ?? true) &&
        teamStandings.count == 2 &&
        teamStandings.allSatisfy(\.isStructurallyCompatible) &&
        matchIds.count <= 32 &&
        Set(matchIds).count == matchIds.count &&
        matchIds.allSatisfy { MobileParticipantContentValidation.id($0) }
    }
}

private extension MobileHistorySide {
    var isStructurallyCompatible: Bool {
        (1...2).contains(side) &&
        participants.count <= 4 && participants.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobileHistoryResult {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.text(summary, maximum: 240) &&
        MobileParticipantContentValidation.text(winner, maximum: 160) &&
        MobileParticipantContentValidation.finite(teamOnePoints) &&
        MobileParticipantContentValidation.finite(teamTwoPoints)
    }
}

private extension MobileHistoryMatch {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(matchId) &&
        (matchNumber.map { (1...32).contains($0) } ?? true) &&
        MobileParticipantContentValidation.text(format, maximum: 16) &&
        (course?.isStructurallyCompatible ?? true) &&
        sides.count == 2 &&
        sides.allSatisfy(\.isStructurallyCompatible) &&
        (result?.isStructurallyCompatible ?? true) &&
        scorecardIds.count <= 8 &&
        Set(scorecardIds).count == scorecardIds.count &&
        scorecardIds.allSatisfy {
            MobileParticipantContentValidation.text($0, maximum: 256)
        }
    }
}

private extension MobileHistoryStanding {
    var isStructurallyCompatible: Bool {
        (1...128).contains(rank) &&
        MobileParticipantContentValidation.id(playerId) &&
        MobileParticipantContentValidation.text(displayName, maximum: 160) &&
        MobileParticipantContentValidation.text(teamName, maximum: 160) &&
        MobileParticipantContentValidation.finite(points) &&
        MobileParticipantContentValidation.finite(wins) &&
        MobileParticipantContentValidation.finite(losses) &&
        MobileParticipantContentValidation.finite(ties)
    }
}

private extension MobileHistoryAward {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.text(awardId, maximum: 160) &&
        MobileParticipantContentValidation.text(title, maximum: 160) &&
        MobileParticipantContentValidation.text(recipient, maximum: 160) &&
        MobileParticipantContentValidation.text(playerId, maximum: 128)
    }
}

private extension MobileHistoryHole {
    var isStructurallyCompatible: Bool {
        (holeNumber.map { (1...18).contains($0) } ?? true) &&
        (grossScore.map { (1...20).contains($0) } ?? true) &&
        (par.map { (3...6).contains($0) } ?? true) &&
        (strokeIndex.map { (1...18).contains($0) } ?? true) &&
        (strokesReceived.map { (0...6).contains($0) } ?? true) &&
        (netScore.map { (-5...20).contains($0) } ?? true)
    }
}

private extension MobileHistoryScorecard {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.text(scorecardId, maximum: 256) &&
        MobileParticipantContentValidation.id(matchId) &&
        MobileParticipantContentValidation.text(playerId, maximum: 128) &&
        MobileParticipantContentValidation.text(teamId, maximum: 128) &&
        participantPlayerIds.count <= 4 &&
        Set(participantPlayerIds).count == participantPlayerIds.count &&
        participantPlayerIds.allSatisfy { MobileParticipantContentValidation.id($0) } &&
        MobileParticipantContentValidation.text(status, maximum: 32) &&
        MobileParticipantContentValidation.finite(grossTotal) &&
        MobileParticipantContentValidation.finite(netTotal) &&
        holes.count <= 18 && holes.allSatisfy(\.isStructurallyCompatible)
    }
}
