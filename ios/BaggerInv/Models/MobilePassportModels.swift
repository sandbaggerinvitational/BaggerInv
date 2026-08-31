import Foundation

enum MobilePassportFormat: String, Codable, Equatable, Hashable, Sendable {
    case bestBall = "BB"
    case scramble = "SC"
    case singles = "SI"
}

enum MobilePassportRoundStatus: String, Codable, Equatable, Sendable {
    case scheduled
    case inProgress
    case completed
}

enum MobilePassportScoringEntity: String, Codable, Equatable, Sendable {
    case player
    case team
}

enum MobilePassportTournamentResult: String, Codable, Equatable, Sendable {
    case champion
    case runnerUp
    case completed
    case upcoming
}

enum MobilePassportMatchOutcome: String, Codable, Equatable, Sendable {
    case win
    case loss
    case half
    case unknown
}

enum MobilePassportRankingMetric: String, Codable, Equatable, Hashable, Sendable {
    case careerPoints
    case matchWins
    case winPercentage
    case holeDifferential
    case birdies
    case averageGross
}

enum MobilePassportHonor: String, Codable, Equatable, Hashable, Sendable {
    case champion
    case sandbaggerOfYear
    case pointsChampion
}

enum MobilePassportCaptainResult: String, Codable, Equatable, Sendable {
    case champion = "Champion"
    case runnerUp = "Runner-Up"
    case completed = "Completed"
    case upcoming = "Upcoming"
}

struct MobilePassportTeam: Codable, Equatable, Sendable {
    @MobileRequiredNullable var teamId: String?
    let name: String
    @MobileRequiredNullable var side: Int?
}

struct MobilePassportPlayerReference: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
}

struct MobilePassportRecord: Codable, Equatable, Sendable {
    let wins: Int
    let losses: Int
    let halves: Int
    let matches: Int
    @MobileRequiredNullable var points: Double?
    let recordedPointMatches: Int
}

struct MobilePassportSegmentRecord: Codable, Equatable, Sendable {
    let won: Int
    let lost: Int
    let halved: Int
}

struct MobilePassportCareerYears: Codable, Equatable, Sendable {
    @MobileRequiredNullable var firstYear: Int?
    @MobileRequiredNullable var lastYear: Int?
    let current: Bool
}

struct MobilePassportPlayer: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    let active: Bool
    let careerYears: MobilePassportCareerYears
    @MobileRequiredNullable var portraitAssetKey: String?
    @MobileRequiredNullable var team: MobilePassportTeam?
}

struct MobilePassportCurrentTournamentRecord: Codable, Equatable, Sendable {
    let wins: Int
    let losses: Int
    let halves: Int
    let points: Double
}

struct MobilePassportCurrentRound: Codable, Equatable, Sendable {
    let roundNumber: Int
    let format: MobilePassportFormat
    let status: MobilePassportRoundStatus
    @MobileRequiredNullable var throughHole: Int?
    let holesPlayed: Int
    let scoringEntity: MobilePassportScoringEntity
    @MobileRequiredNullable var gross: Double?
    @MobileRequiredNullable var net: Double?
    @MobileRequiredNullable var rank: Int?
    let tied: Bool
    @MobileRequiredNullable var points: Double?
}

struct MobilePassportCurrentTournament: Codable, Equatable, Sendable {
    let tournamentId: String
    let name: String
    @MobileRequiredNullable var year: Int?
    @MobileRequiredNullable var status: String?
    @MobileRequiredNullable var currentRound: Int?
    @MobileRequiredNullable var tournamentHandicap: Double?
    @MobileRequiredNullable var team: MobilePassportTeam?
    @MobileRequiredNullable var record: MobilePassportCurrentTournamentRecord?
    @MobileRequiredNullable var standing: Int?
    @MobileRequiredNullable var teamStanding: Int?
    let rounds: [MobilePassportCurrentRound]
}

struct MobilePassportCareerSummary: Codable, Equatable, Sendable {
    let record: MobilePassportRecord
    let winPercentage: Double
    let appearances: Int
    let championships: Int
    let runnerUpFinishes: Int
    @MobileRequiredNullable var averageHandicap: Double?
}

struct MobilePassportHonors: Codable, Equatable, Sendable {
    let championshipYears: [Int]
    let sandbaggerOfYearYears: [Int]
    let pointsChampionYears: [Int]
    let boardOfGovernors: Bool
    let handicapCommittee: Bool
}

struct MobilePassportRanking: Codable, Equatable, Sendable {
    let metric: MobilePassportRankingMetric
    @MobileRequiredNullable var rank: Int?
}

struct MobilePassportSample: Codable, Equatable, Sendable {
    let completeScorecards: Int
    let scoringHoles: Int
    let matchPlayHoles: Int
}

struct MobilePassportHolePerformance: Codable, Equatable, Sendable {
    let sample: MobilePassportSample
    let totalHolesPlayed: Int
    let holesWon: Int
    let holesLost: Int
    let holesHalved: Int
    let holeDifferential: Int
    let frontNineHolesWon: Int
    let backNineHolesWon: Int
    let closingHolesWon: Int
    let birdies: Int
    let eagles: Int
    let pars: Int
    let bogeys: Int
    let doubleBogeysOrWorse: Int
    @MobileRequiredNullable var averageGrossScore: Double?
    @MobileRequiredNullable var averageNetScore: Double?
    @MobileRequiredNullable var averagePar3Score: Double?
    @MobileRequiredNullable var averagePar4Score: Double?
    @MobileRequiredNullable var averagePar5Score: Double?
    @MobileRequiredNullable var averageFrontNineScore: Double?
    @MobileRequiredNullable var averageBackNineScore: Double?
    @MobileRequiredNullable var birdieRate: Double?
    @MobileRequiredNullable var parRate: Double?
    @MobileRequiredNullable var bogeyRate: Double?
    @MobileRequiredNullable var doubleBogeyOrWorseRate: Double?
}

struct MobilePassportMatchProgression: Codable, Equatable, Sendable {
    let matches: Int
    let largestLeadHeld: Int
    let largestComebackCompleted: Int
    let matchesWonAfterTrailing: Int
    let largestLeadBlown: Int
    let mostLeadChangesExperienced: Int
    let totalLeadChangesExperienced: Int
    let mostConsecutiveHolesWon: Int
    let mostConsecutiveHolesLost: Int
    let mostClosingHolesWon: Int
    let totalClosingHolesWon: Int
    let frontNine: MobilePassportSegmentRecord
    let backNine: MobilePassportSegmentRecord
    let closing: MobilePassportSegmentRecord
}

struct MobilePassportTournamentHistory: Codable, Equatable, Sendable {
    let tournamentId: String
    let year: Int
    @MobileRequiredNullable var team: MobilePassportTeam?
    let result: MobilePassportTournamentResult
    let record: MobilePassportRecord
    @MobileRequiredNullable var points: Double?
    @MobileRequiredNullable var averageScore: Double?
    let scorecardSample: Int
    let wasCaptain: Bool
    let honors: [MobilePassportHonor]
}

struct MobilePassportCourse: Codable, Equatable, Sendable {
    @MobileRequiredNullable var courseId: String?
    let name: String
}

struct MobilePassportMatchSegment: Codable, Equatable, Sendable {
    let label: String
    @MobileRequiredNullable var winner: String?
    @MobileRequiredNullable var winnerSide: Int?
}

struct MobilePassportFormatMatch: Codable, Equatable, Sendable {
    let matchId: String
    let year: Int
    let roundNumber: Int
    @MobileRequiredNullable var matchNumber: Int?
    let outcome: MobilePassportMatchOutcome
    let partner: [MobilePassportPlayerReference]
    let opponents: [MobilePassportPlayerReference]
    @MobileRequiredNullable var team: MobilePassportTeam?
    @MobileRequiredNullable var opposingTeam: MobilePassportTeam?
    @MobileRequiredNullable var winner: String?
    @MobileRequiredNullable var winnerSide: Int?
    @MobileRequiredNullable var course: MobilePassportCourse?
    let segments: [MobilePassportMatchSegment]
}

struct MobilePassportFormatPerformance: Codable, Equatable, Sendable {
    let format: MobilePassportFormat
    let label: String
    let scoringLabel: String
    let record: MobilePassportRecord
    let winPercentage: Double
    @MobileRequiredNullable var scoringAverage: Double?
    let scoringSample: Int
    @MobileRequiredNullable var firstYear: Int?
    @MobileRequiredNullable var latestYear: Int?
    let matches: [MobilePassportFormatMatch]
}

struct MobilePassportRecordHeld: Codable, Equatable, Sendable {
    let recordId: String
    let title: String
}

struct MobilePassportCaptainSeason: Codable, Equatable, Sendable {
    let year: Int
    @MobileRequiredNullable var team: MobilePassportTeam?
    let result: MobilePassportCaptainResult
}

struct MobilePassportCaptainLegacy: Codable, Equatable, Sendable {
    let record: MobilePassportRecord
    let championships: Int
    let seasons: [MobilePassportCaptainSeason]
}

struct MobilePassportRival: Codable, Equatable, Sendable {
    let player: MobilePassportPlayerReference
    let record: MobilePassportRecord
}

struct MobilePassportDraftHistory: Codable, Equatable, Sendable {
    let year: Int
    let pick: Int
    let teamName: String
    @MobileRequiredNullable var finish: Int?
    @MobileRequiredNullable var draftValueScore: Double?
}

struct MobilePassportPartner: Codable, Equatable, Sendable {
    let rank: Int
    let tied: Bool
    let player: MobilePassportPlayerReference
    let record: MobilePassportRecord
}

struct MobilePassportCareer: Codable, Equatable, Sendable {
    let summary: MobilePassportCareerSummary
    let honors: MobilePassportHonors
    let rankings: [MobilePassportRanking]
    let holePerformance: MobilePassportHolePerformance
    let matchProgression: MobilePassportMatchProgression
    let tournamentHistory: [MobilePassportTournamentHistory]
    let formatPerformance: [MobilePassportFormatPerformance]
    let recordsHeld: [MobilePassportRecordHeld]
    let captainLegacy: MobilePassportCaptainLegacy
    @MobileRequiredNullable var biggestRival: MobilePassportRival?
    let draftHistory: [MobilePassportDraftHistory]
    let topPartners: [MobilePassportPartner]
}

struct MobilePassportData: MobileReadPayload {
    let contractVersion: String
    let player: MobilePassportPlayer
    let currentTournament: MobilePassportCurrentTournament
    let career: MobilePassportCareer

    var contextBinding: MobileReadContextBinding {
        .participant(
            playerID: player.playerId,
            tournamentID: currentTournament.tournamentId
        )
    }

    var isStructurallyCompatible: Bool {
        contractVersion == "mobile-passport-v1" &&
        player.isStructurallyCompatible &&
        currentTournament.isStructurallyCompatible &&
        career.isStructurallyCompatible
    }
}

typealias MobilePassportResponse = MobileReadResponse<MobilePassportData>

private extension MobilePassportPlayer {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(playerId) &&
        MobileParticipantContentValidation.text(displayName, maximum: 160) &&
        active &&
        careerYears.isStructurallyCompatible &&
        (portraitAssetKey.map { value in
            value.count <= 128 &&
            !value.contains("..") &&
            value.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9._'-]{0,127}$"#,
                options: .regularExpression
            ) != nil
        } ?? true) &&
        (team?.isStructurallyCompatible ?? true)
    }
}

private extension MobilePassportTeam {
    var isStructurallyCompatible: Bool {
        (teamId.map { MobileParticipantContentValidation.id($0) } ?? true) &&
        MobileParticipantContentValidation.text(name, maximum: 160) &&
        (side.map { (1...2).contains($0) } ?? true)
    }
}

private extension MobilePassportPlayerReference {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(playerId) &&
        MobileParticipantContentValidation.text(displayName, maximum: 160)
    }
}

private extension MobilePassportRecord {
    var isStructurallyCompatible: Bool {
        wins >= 0 && losses >= 0 && halves >= 0 && matches >= 0 &&
        MobileParticipantContentValidation.finite(points) &&
        recordedPointMatches >= 0
    }
}

private extension MobilePassportSegmentRecord {
    var isStructurallyCompatible: Bool {
        won >= 0 && lost >= 0 && halved >= 0
    }
}

private extension MobilePassportCareerYears {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.year(firstYear) &&
        MobileParticipantContentValidation.year(lastYear)
    }
}

private extension MobilePassportCurrentTournamentRecord {
    var isStructurallyCompatible: Bool {
        wins >= 0 && losses >= 0 && halves >= 0 && points.isFinite
    }
}

private extension MobilePassportCurrentTournament {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(tournamentId) &&
        MobileParticipantContentValidation.text(name, maximum: 160) &&
        MobileParticipantContentValidation.year(year) &&
        MobileParticipantContentValidation.text(status, maximum: 64) &&
        (currentRound.map { $0 >= 1 } ?? true) &&
        MobileParticipantContentValidation.finite(tournamentHandicap) &&
        (team?.isStructurallyCompatible ?? true) &&
        (record?.isStructurallyCompatible ?? true) &&
        (standing.map { $0 >= 1 } ?? true) &&
        (teamStanding.map { $0 >= 1 } ?? true) &&
        rounds.count <= 18 &&
        rounds.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobilePassportCurrentRound {
    var isStructurallyCompatible: Bool {
        roundNumber >= 1 &&
        (throughHole.map { (1...18).contains($0) } ?? true) &&
        (0...18).contains(holesPlayed) &&
        MobileParticipantContentValidation.finite(gross) &&
        MobileParticipantContentValidation.finite(net) &&
        (rank.map { $0 >= 1 } ?? true) &&
        MobileParticipantContentValidation.finite(points)
    }
}

private extension MobilePassportCareerSummary {
    var isStructurallyCompatible: Bool {
        record.isStructurallyCompatible &&
        MobileParticipantContentValidation.finite(winPercentage, minimum: 0, maximum: 100) &&
        appearances >= 0 && championships >= 0 && runnerUpFinishes >= 0 &&
        MobileParticipantContentValidation.finite(averageHandicap)
    }
}

private extension MobilePassportHonors {
    var isStructurallyCompatible: Bool {
        [championshipYears, sandbaggerOfYearYears, pointsChampionYears].allSatisfy { years in
            years.count <= 64 &&
            Set(years).count == years.count &&
            years.allSatisfy { (2000...2200).contains($0) }
        }
    }
}

private extension MobilePassportRanking {
    var isStructurallyCompatible: Bool {
        rank.map { $0 >= 1 } ?? true
    }
}

private extension MobilePassportSample {
    var isStructurallyCompatible: Bool {
        completeScorecards >= 0 && scoringHoles >= 0 && matchPlayHoles >= 0
    }
}

private extension MobilePassportHolePerformance {
    var isStructurallyCompatible: Bool {
        sample.isStructurallyCompatible &&
        totalHolesPlayed >= 0 && holesWon >= 0 && holesLost >= 0 && holesHalved >= 0 &&
        frontNineHolesWon >= 0 && backNineHolesWon >= 0 && closingHolesWon >= 0 &&
        birdies >= 0 && eagles >= 0 && pars >= 0 && bogeys >= 0 &&
        doubleBogeysOrWorse >= 0 &&
        MobileParticipantContentValidation.finite(averageGrossScore) &&
        MobileParticipantContentValidation.finite(averageNetScore) &&
        MobileParticipantContentValidation.finite(averagePar3Score) &&
        MobileParticipantContentValidation.finite(averagePar4Score) &&
        MobileParticipantContentValidation.finite(averagePar5Score) &&
        MobileParticipantContentValidation.finite(averageFrontNineScore) &&
        MobileParticipantContentValidation.finite(averageBackNineScore) &&
        MobileParticipantContentValidation.finite(birdieRate, minimum: 0, maximum: 100) &&
        MobileParticipantContentValidation.finite(parRate, minimum: 0, maximum: 100) &&
        MobileParticipantContentValidation.finite(bogeyRate, minimum: 0, maximum: 100) &&
        MobileParticipantContentValidation.finite(doubleBogeyOrWorseRate, minimum: 0, maximum: 100)
    }
}

private extension MobilePassportMatchProgression {
    var isStructurallyCompatible: Bool {
        matches >= 0 && largestLeadHeld >= 0 && largestComebackCompleted >= 0 &&
        matchesWonAfterTrailing >= 0 && largestLeadBlown >= 0 &&
        mostLeadChangesExperienced >= 0 && totalLeadChangesExperienced >= 0 &&
        mostConsecutiveHolesWon >= 0 && mostConsecutiveHolesLost >= 0 &&
        mostClosingHolesWon >= 0 && totalClosingHolesWon >= 0 &&
        frontNine.isStructurallyCompatible && backNine.isStructurallyCompatible &&
        closing.isStructurallyCompatible
    }
}

private extension MobilePassportTournamentHistory {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(tournamentId) &&
        (2000...2200).contains(year) &&
        (team?.isStructurallyCompatible ?? true) &&
        record.isStructurallyCompatible &&
        MobileParticipantContentValidation.finite(points) &&
        MobileParticipantContentValidation.finite(averageScore) &&
        scorecardSample >= 0 && honors.count <= 3 && Set(honors).count == honors.count
    }
}

private extension MobilePassportCourse {
    var isStructurallyCompatible: Bool {
        (courseId.map { MobileParticipantContentValidation.id($0) } ?? true) &&
        MobileParticipantContentValidation.text(name, maximum: 160, allowEmpty: true)
    }
}

private extension MobilePassportMatchSegment {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.text(label, maximum: 80) &&
        MobileParticipantContentValidation.text(winner, maximum: 160) &&
        (winnerSide.map { (0...2).contains($0) } ?? true)
    }
}

private extension MobilePassportFormatMatch {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(matchId) &&
        (2000...2200).contains(year) && roundNumber >= 1 &&
        (matchNumber.map { $0 >= 1 } ?? true) &&
        partner.count <= 3 && partner.allSatisfy(\.isStructurallyCompatible) &&
        opponents.count <= 4 && opponents.allSatisfy(\.isStructurallyCompatible) &&
        (team?.isStructurallyCompatible ?? true) &&
        (opposingTeam?.isStructurallyCompatible ?? true) &&
        MobileParticipantContentValidation.text(winner, maximum: 160) &&
        (winnerSide.map { (0...2).contains($0) } ?? true) &&
        (course?.isStructurallyCompatible ?? true) &&
        segments.count <= 3 && segments.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobilePassportFormatPerformance {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.text(label, maximum: 80) &&
        MobileParticipantContentValidation.text(scoringLabel, maximum: 80) &&
        record.isStructurallyCompatible &&
        MobileParticipantContentValidation.finite(winPercentage, minimum: 0, maximum: 100) &&
        MobileParticipantContentValidation.finite(scoringAverage) && scoringSample >= 0 &&
        MobileParticipantContentValidation.year(firstYear) &&
        MobileParticipantContentValidation.year(latestYear) &&
        matches.count <= 128 && matches.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobilePassportRecordHeld {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(recordId) &&
        MobileParticipantContentValidation.text(title, maximum: 240)
    }
}

private extension MobilePassportCaptainSeason {
    var isStructurallyCompatible: Bool {
        (2000...2200).contains(year) && (team?.isStructurallyCompatible ?? true)
    }
}

private extension MobilePassportCaptainLegacy {
    var isStructurallyCompatible: Bool {
        record.isStructurallyCompatible && championships >= 0 &&
        seasons.count <= 64 && seasons.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobilePassportRival {
    var isStructurallyCompatible: Bool {
        player.isStructurallyCompatible && record.isStructurallyCompatible
    }
}

private extension MobilePassportDraftHistory {
    var isStructurallyCompatible: Bool {
        (2000...2200).contains(year) && pick >= 1 &&
        MobileParticipantContentValidation.text(teamName, maximum: 160) &&
        (finish.map { $0 >= 1 } ?? true) &&
        MobileParticipantContentValidation.finite(draftValueScore)
    }
}

private extension MobilePassportPartner {
    var isStructurallyCompatible: Bool {
        rank >= 1 && player.isStructurallyCompatible && record.isStructurallyCompatible
    }
}

private extension MobilePassportCareer {
    var isStructurallyCompatible: Bool {
        summary.isStructurallyCompatible && honors.isStructurallyCompatible &&
        rankings.count == 6 && rankings.allSatisfy(\.isStructurallyCompatible) &&
        holePerformance.isStructurallyCompatible && matchProgression.isStructurallyCompatible &&
        tournamentHistory.count <= 64 && tournamentHistory.allSatisfy(\.isStructurallyCompatible) &&
        formatPerformance.count == 3 && formatPerformance.allSatisfy(\.isStructurallyCompatible) &&
        recordsHeld.count <= 64 && recordsHeld.allSatisfy(\.isStructurallyCompatible) &&
        captainLegacy.isStructurallyCompatible &&
        (biggestRival?.isStructurallyCompatible ?? true) &&
        draftHistory.count <= 64 && draftHistory.allSatisfy(\.isStructurallyCompatible) &&
        topPartners.count <= 8 && topPartners.allSatisfy(\.isStructurallyCompatible)
    }
}
