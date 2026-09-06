import Foundation

/// Match IDs are bounded opaque Unicode strings, never display labels or paths.
enum MobileOpaqueMatchID {
    static func isValid(_ value: String) -> Bool {
        // Swift Strings contain valid Unicode scalars; JSONDecoder rejects
        // malformed surrogate escapes before an ID can reach this validator.
        (1...200).contains(value.unicodeScalars.count) &&
        !value.unicodeScalars.contains(where: { $0.value == 0 }) &&
        value != "." && value != ".."
    }

    /// Swift String equality folds canonically equivalent Unicode spellings.
    /// The server identifier must instead retain its exact logical bytes.
    static func isEqual(_ lhs: String?, _ rhs: String?) -> Bool {
        switch (lhs, rhs) {
        case let (lhs?, rhs?): return lhs.utf8.elementsEqual(rhs.utf8)
        case (nil, nil): return true
        default: return false
        }
    }
}

enum MobileMatchDetailHoleState: String, Codable, Equatable, Sendable {
    case unplayed
    case halved
    case sideOne
    case sideTwo
}

enum MobileMatchDetailScoreScope: String, Codable, Equatable, Sendable {
    case players
    case team
}

enum MobileMatchDetailScorecardState: String, Codable, Equatable, Sendable {
    case unavailable
    case inProgress
    case confirmed
}

enum MobileMatchDetailFlowStatus: String, Codable, Equatable, Sendable {
    case notStarted
    case allSquare
    case leading
    case final
}

struct MobileMatchDetailTournament: Codable, Equatable, Sendable {
    let tournamentId: String
    let name: String
    @MobileRequiredNullable var year: Int?
    @MobileRequiredNullable var status: String?
    let timeZone: String
    @MobileRequiredNullable var location: String?

    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(tournamentId) &&
        MobileParticipantContentValidation.text(name, maximum: 300) &&
        (year.map { (1900...2200).contains($0) } ?? true) &&
        MobileParticipantContentValidation.text(status, maximum: 100) &&
        MobileParticipantContentValidation.text(timeZone, maximum: 100) &&
        TimeZone(identifier: timeZone) != nil &&
        MobileParticipantContentValidation.text(location, maximum: 300)
    }
}

struct MobileMatchDetailRound: Codable, Equatable, Sendable {
    let roundNumber: Int
    @MobileRequiredNullable var name: String?
    let format: MobileScoringFormat
    let formatName: String

    var isStructurallyCompatible: Bool {
        (1...32).contains(roundNumber) &&
        MobileParticipantContentValidation.text(name, maximum: 200) &&
        format.isKnown &&
        MobileParticipantContentValidation.text(formatName, maximum: 100)
    }
}

struct MobileMatchDetailCourse: Codable, Equatable, Sendable {
    @MobileRequiredNullable var courseId: String?
    let name: String
    @MobileRequiredNullable var tee: String?
    @MobileRequiredNullable var yardage: Int?
    @MobileRequiredNullable var par: Double?
    @MobileRequiredNullable var rating: Double?
    @MobileRequiredNullable var slope: Int?

    var isStructurallyCompatible: Bool {
        (courseId.map { MobileParticipantContentValidation.id($0) } ?? true) &&
        MobileParticipantContentValidation.text(name, maximum: 300) &&
        MobileParticipantContentValidation.text(tee, maximum: 100) &&
        (yardage.map { (1...20_000).contains($0) } ?? true) &&
        MobileParticipantContentValidation.finite(par, minimum: 1, maximum: 100) &&
        MobileParticipantContentValidation.finite(rating, minimum: 1, maximum: 100) &&
        (slope.map { (1...300).contains($0) } ?? true)
    }
}

struct MobileMatchDetailTeeTime: Codable, Equatable, Sendable {
    @MobileRequiredNullable var localTime: MobileLocalTime?
    let label: String
    let timeZone: String

    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.text(label, maximum: 100, allowEmpty: true) &&
        MobileParticipantContentValidation.text(timeZone, maximum: 100) &&
        TimeZone(identifier: timeZone) != nil
    }
}

struct MobileMatchDetailParticipant: Codable, Equatable, Sendable {
    let playerId: String
    let displayName: String
    let teamSide: Int
    let isAuthenticatedPlayer: Bool
    @MobileRequiredNullable var playingHandicap: Double?
    @MobileRequiredNullable var strokesReceived: Int?

    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(playerId) &&
        MobileParticipantContentValidation.text(displayName, maximum: 300) &&
        (teamSide == 1 || teamSide == 2) &&
        MobileParticipantContentValidation.finite(playingHandicap) &&
        (strokesReceived.map { $0 >= 0 } ?? true)
    }
}

struct MobileMatchDetailTeam: Codable, Equatable, Sendable {
    let side: Int
    let teamId: String
    let name: String
    @MobileRequiredNullable var playingHandicap: Double?
    @MobileRequiredNullable var strokesReceived: Int?
    let participants: [MobileMatchDetailParticipant]

    var isStructurallyCompatible: Bool {
        (side == 1 || side == 2) &&
        MobileParticipantContentValidation.id(teamId) &&
        MobileParticipantContentValidation.text(name, maximum: 300) &&
        MobileParticipantContentValidation.finite(playingHandicap) &&
        (strokesReceived.map { $0 >= 0 } ?? true) &&
        (1...2).contains(participants.count) &&
        participants.allSatisfy { $0.teamSide == side && $0.isStructurallyCompatible } &&
        Set(participants.map(\.playerId)).count == participants.count
    }

    func isStructurallyCompatible(format: MobileScoringFormat) -> Bool {
        guard isStructurallyCompatible else { return false }
        switch format {
        case .bestBall:
            return participants.count == 2 && playingHandicap == nil && strokesReceived == nil
        case .scramble:
            return participants.count == 2 && participants.allSatisfy { $0.strokesReceived == nil }
        case .singles:
            return participants.count == 1 && playingHandicap == nil && strokesReceived == nil
        case .unknown:
            return false
        }
    }
}

struct MobileMatchDetailAuthenticatedPlayer: Codable, Equatable, Sendable {
    let involved: Bool
    @MobileRequiredNullable var teamSide: Int?
    let partnerPlayerIds: [String]
    let opponentPlayerIds: [String]

    var isStructurallyCompatible: Bool {
        (teamSide == nil || teamSide == 1 || teamSide == 2) &&
        partnerPlayerIds.count <= 1 &&
        opponentPlayerIds.count <= 2 &&
        partnerPlayerIds.allSatisfy { MobileParticipantContentValidation.id($0) } &&
        opponentPlayerIds.allSatisfy { MobileParticipantContentValidation.id($0) } &&
        Set(partnerPlayerIds).count == partnerPlayerIds.count &&
        Set(opponentPlayerIds).count == opponentPlayerIds.count &&
        Set(partnerPlayerIds).isDisjoint(with: Set(opponentPlayerIds))
    }

    func isStructurallyCompatible(teams: [MobileMatchDetailTeam]) -> Bool {
        guard isStructurallyCompatible else { return false }
        let authenticated = teams.flatMap(\.participants).filter(\.isAuthenticatedPlayer)
        if !involved {
            return teamSide == nil && authenticated.isEmpty &&
                partnerPlayerIds.isEmpty && opponentPlayerIds.isEmpty
        }
        guard let teamSide,
              authenticated.count == 1,
              authenticated[0].teamSide == teamSide,
              let ownTeam = teams.first(where: { $0.side == teamSide }),
              let otherTeam = teams.first(where: { $0.side != teamSide })
        else { return false }
        let authenticatedID = authenticated[0].playerId
        return partnerPlayerIds == ownTeam.participants
            .map(\.playerId)
            .filter { $0 != authenticatedID } &&
            opponentPlayerIds == otherTeam.participants.map(\.playerId)
    }
}

struct MobileMatchDetailProgress: Codable, Equatable, Sendable {
    let currentHole: Int
    let holesPlayed: Int
    let holesRemaining: Int
    @MobileRequiredNullable var statusText: String?

    var isStructurallyCompatible: Bool {
        (0...18).contains(currentHole) &&
        (0...18).contains(holesPlayed) &&
        (0...18).contains(holesRemaining) &&
        holesPlayed + holesRemaining == 18 &&
        MobileParticipantContentValidation.text(statusText, maximum: 500)
    }
}

struct MobileMatchDetailResult: Codable, Equatable, Sendable {
    let summary: String
    @MobileRequiredNullable var notation: String?
    @MobileRequiredNullable var winnerSide: Int?
    @MobileRequiredNullable var winnerTeamId: String?

    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.text(summary, maximum: 500) &&
        MobileParticipantContentValidation.text(notation, maximum: 100) &&
        (winnerSide == nil || winnerSide == 1 || winnerSide == 2) &&
        (winnerTeamId.map { MobileParticipantContentValidation.id($0) } ?? true) &&
        ((winnerSide == nil) == (winnerTeamId == nil))
    }

    func isStructurallyCompatible(teams: [MobileMatchDetailTeam]) -> Bool {
        guard isStructurallyCompatible else { return false }
        guard let winnerSide else { return true }
        return teams.first(where: { $0.side == winnerSide })?.teamId == winnerTeamId
    }
}

struct MobileMatchDetailNavigation: Codable, Equatable, Sendable {
    let roundMatchIndex: Int
    let roundMatchCount: Int
    @MobileRequiredNullable var previousMatchId: String?
    @MobileRequiredNullable var nextMatchId: String?
    @MobileRequiredNullable var myMatchId: String?
    let isMyMatch: Bool

    var isStructurallyCompatible: Bool {
        (1...64).contains(roundMatchIndex) &&
        (1...64).contains(roundMatchCount) &&
        roundMatchIndex <= roundMatchCount &&
        (previousMatchId.map { MobileOpaqueMatchID.isValid($0) } ?? true) &&
        (nextMatchId.map { MobileOpaqueMatchID.isValid($0) } ?? true) &&
        (myMatchId.map { MobileOpaqueMatchID.isValid($0) } ?? true) &&
        (roundMatchIndex == 1 ? previousMatchId == nil : previousMatchId != nil) &&
        (roundMatchIndex == roundMatchCount ? nextMatchId == nil : nextMatchId != nil)
    }

    func isStructurallyCompatible(matchId: String, participantInvolved: Bool) -> Bool {
        guard isStructurallyCompatible,
              !MobileOpaqueMatchID.isEqual(previousMatchId, matchId),
              !MobileOpaqueMatchID.isEqual(nextMatchId, matchId),
              isMyMatch == participantInvolved
        else { return false }
        if isMyMatch {
            return MobileOpaqueMatchID.isEqual(myMatchId, matchId)
        }
        return !MobileOpaqueMatchID.isEqual(myMatchId, matchId)
    }
}

struct MobileMatchDetailPlayerHoleScore: Codable, Equatable, Sendable {
    let playerId: String
    @MobileRequiredNullable var gross: Int?
    @MobileRequiredNullable var strokes: Int?

    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(playerId) &&
        (gross.map { (1...20).contains($0) } ?? true) &&
        (strokes.map { (0...20).contains($0) } ?? true)
    }

    var containsScore: Bool { gross != nil || strokes != nil }
}

struct MobileMatchDetailTeamHoleScore: Codable, Equatable, Sendable {
    @MobileRequiredNullable var gross: Int?
    @MobileRequiredNullable var strokes: Int?

    var isStructurallyCompatible: Bool {
        (gross.map { (1...20).contains($0) } ?? true) &&
        (strokes.map { (0...20).contains($0) } ?? true)
    }

    var containsScore: Bool { gross != nil || strokes != nil }
}

struct MobileMatchDetailPlayerSideScore: Codable, Equatable, Sendable {
    let side: Int
    let scope: MobileMatchDetailScoreScope
    let playerScores: [MobileMatchDetailPlayerHoleScore]
    @MobileRequiredNullable var teamScore: MobileMatchDetailTeamHoleScore?
    @MobileRequiredNullable var netScore: Int?

    var isStructurallyCompatible: Bool {
        (side == 1 || side == 2) &&
        scope == .players &&
        (1...2).contains(playerScores.count) &&
        playerScores.allSatisfy(\.isStructurallyCompatible) &&
        Set(playerScores.map(\.playerId)).count == playerScores.count &&
        teamScore == nil &&
        (netScore.map { (-20...20).contains($0) } ?? true)
    }

    var containsScore: Bool {
        playerScores.contains(where: \.containsScore) || netScore != nil
    }
}

struct MobileMatchDetailTeamSideScore: Codable, Equatable, Sendable {
    let side: Int
    let scope: MobileMatchDetailScoreScope
    let playerScores: [MobileMatchDetailPlayerHoleScore]
    @MobileRequiredNullable var teamScore: MobileMatchDetailTeamHoleScore?
    @MobileRequiredNullable var netScore: Int?

    var isStructurallyCompatible: Bool {
        (side == 1 || side == 2) &&
        scope == .team &&
        playerScores.isEmpty &&
        (teamScore?.isStructurallyCompatible ?? true) &&
        (netScore.map { (-20...20).contains($0) } ?? true)
    }

    var containsScore: Bool {
        (teamScore?.containsScore ?? false) || netScore != nil
    }
}

enum MobileMatchDetailSideScore: Codable, Equatable, Sendable {
    case players(MobileMatchDetailPlayerSideScore)
    case team(MobileMatchDetailTeamSideScore)

    private enum CodingKeys: String, CodingKey {
        case scope
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(MobileMatchDetailScoreScope.self, forKey: .scope) {
        case .players:
            self = .players(try MobileMatchDetailPlayerSideScore(from: decoder))
        case .team:
            self = .team(try MobileMatchDetailTeamSideScore(from: decoder))
        }
    }

    func encode(to encoder: any Encoder) throws {
        switch self {
        case .players(let score):
            try score.encode(to: encoder)
        case .team(let score):
            try score.encode(to: encoder)
        }
    }

    var side: Int {
        switch self {
        case .players(let score): score.side
        case .team(let score): score.side
        }
    }

    var scope: MobileMatchDetailScoreScope {
        switch self {
        case .players: .players
        case .team: .team
        }
    }

    var playerScores: [MobileMatchDetailPlayerHoleScore] {
        switch self {
        case .players(let score): score.playerScores
        case .team(let score): score.playerScores
        }
    }

    var teamScore: MobileMatchDetailTeamHoleScore? {
        switch self {
        case .players(let score): score.teamScore
        case .team(let score): score.teamScore
        }
    }

    var netScore: Int? {
        switch self {
        case .players(let score): score.netScore
        case .team(let score): score.netScore
        }
    }

    var containsScore: Bool {
        switch self {
        case .players(let score): score.containsScore
        case .team(let score): score.containsScore
        }
    }

    func isStructurallyCompatible(
        expectedSide: Int,
        format: MobileScoringFormat,
        expectedPlayerIds: [String]
    ) -> Bool {
        guard side == expectedSide else { return false }
        switch (format, self) {
        case (.bestBall, .players(let score)):
            return score.isStructurallyCompatible &&
                score.playerScores.map(\.playerId) == expectedPlayerIds &&
                score.playerScores.count == 2
        case (.singles, .players(let score)):
            return score.isStructurallyCompatible &&
                score.playerScores.map(\.playerId) == expectedPlayerIds &&
                score.playerScores.count == 1
        case (.scramble, .team(let score)):
            return score.isStructurallyCompatible && expectedPlayerIds.count == 2
        case (.unknown, _), (.bestBall, _), (.scramble, _), (.singles, _):
            return false
        }
    }
}

struct MobileMatchDetailHole: Codable, Equatable, Sendable {
    let holeNumber: Int
    @MobileRequiredNullable var par: Int?
    @MobileRequiredNullable var yardage: Int?
    @MobileRequiredNullable var strokeIndex: Int?
    let state: MobileMatchDetailHoleState
    let official: Bool
    @MobileRequiredNullable var winningSide: Int?
    let sideOne: MobileMatchDetailSideScore
    let sideTwo: MobileMatchDetailSideScore
    @MobileRequiredNullable var resultLabel: String?
    @MobileRequiredNullable var runningResult: String?
    @MobileRequiredNullable var story: String?
    @MobileRequiredNullable var updatedAt: MobileTimestamp?

    var isStructurallyCompatible: Bool {
        (1...18).contains(holeNumber) &&
        (par.map { (1...10).contains($0) } ?? true) &&
        (yardage.map { (1...1_000).contains($0) } ?? true) &&
        (strokeIndex.map { (1...18).contains($0) } ?? true) &&
        (winningSide == nil || winningSide == 1 || winningSide == 2) &&
        MobileParticipantContentValidation.text(resultLabel, maximum: 300) &&
        MobileParticipantContentValidation.text(runningResult, maximum: 200) &&
        MobileParticipantContentValidation.text(story, maximum: 500) &&
        stateAndOfficialAreCompatible
    }

    private var stateAndOfficialAreCompatible: Bool {
        switch state {
        case .unplayed:
            return !official && winningSide == nil && resultLabel == nil &&
                runningResult == nil && updatedAt == nil &&
                !sideOne.containsScore && !sideTwo.containsScore
        case .halved:
            return official && winningSide == nil
        case .sideOne:
            return official && winningSide == 1
        case .sideTwo:
            return official && winningSide == 2
        }
    }

    func isStructurallyCompatible(format: MobileScoringFormat, teams: [MobileMatchDetailTeam]) -> Bool {
        guard isStructurallyCompatible,
              let teamOne = teams.first(where: { $0.side == 1 }),
              let teamTwo = teams.first(where: { $0.side == 2 })
        else { return false }
        return sideOne.isStructurallyCompatible(
            expectedSide: 1,
            format: format,
            expectedPlayerIds: teamOne.participants.map(\.playerId)
        ) && sideTwo.isStructurallyCompatible(
            expectedSide: 2,
            format: format,
            expectedPlayerIds: teamTwo.participants.map(\.playerId)
        )
    }
}

struct MobileMatchDetailScorecard: Codable, Equatable, Sendable {
    let state: MobileMatchDetailScorecardState
    let complete: Bool
    @MobileRequiredNullable var confirmedAt: MobileTimestamp?
    let holes: [MobileMatchDetailHole]

    var isStructurallyCompatible: Bool {
        holes.count == 18 &&
        holes.map(\.holeNumber) == Array(1...18) &&
        holes.allSatisfy(\.isStructurallyCompatible) &&
        stateAndConfirmationAreCompatible
    }

    private var stateAndConfirmationAreCompatible: Bool {
        switch state {
        case .unavailable:
            return !complete && confirmedAt == nil
        case .inProgress:
            return confirmedAt == nil
        case .confirmed:
            return complete && confirmedAt != nil
        }
    }

    func isStructurallyCompatible(format: MobileScoringFormat, teams: [MobileMatchDetailTeam]) -> Bool {
        isStructurallyCompatible && holes.allSatisfy {
            $0.isStructurallyCompatible(format: format, teams: teams)
        }
    }
}

struct MobileMatchDetailFlowSegment: Codable, Equatable, Sendable {
    let status: MobileMatchDetailFlowStatus
    @MobileRequiredNullable var winnerSide: Int?
    @MobileRequiredNullable var result: String?
    let holesRecorded: Int

    var isStructurallyCompatible: Bool {
        (0...18).contains(holesRecorded) &&
        (winnerSide == nil || winnerSide == 1 || winnerSide == 2) &&
        MobileParticipantContentValidation.text(result, maximum: 200) &&
        stateIsStructurallyCompatible
    }

    private var stateIsStructurallyCompatible: Bool {
        switch status {
        case .notStarted:
            return winnerSide == nil && result == nil && holesRecorded == 0
        case .allSquare:
            return winnerSide == nil && result?.isEmpty == false && holesRecorded >= 1
        case .leading:
            return winnerSide != nil && result?.isEmpty == false && holesRecorded >= 1
        case .final:
            return result?.isEmpty == false && holesRecorded >= 1
        }
    }
}

struct MobileMatchDetailFlow: Codable, Equatable, Sendable {
    let front: MobileMatchDetailFlowSegment
    let back: MobileMatchDetailFlowSegment
    let overall: MobileMatchDetailFlowSegment

    var isStructurallyCompatible: Bool {
        front.isStructurallyCompatible &&
        back.isStructurallyCompatible &&
        overall.isStructurallyCompatible &&
        front.holesRecorded <= 9 &&
        back.holesRecorded <= 9 &&
        overall.holesRecorded == front.holesRecorded + back.holesRecorded
    }
}

struct MobileMatchDetailClinch: Codable, Equatable, Sendable {
    let holeNumber: Int
    let winnerSide: Int
    let winnerTeamId: String
    let summary: String

    var isStructurallyCompatible: Bool {
        (1...18).contains(holeNumber) &&
        (winnerSide == 1 || winnerSide == 2) &&
        MobileParticipantContentValidation.id(winnerTeamId) &&
        MobileParticipantContentValidation.text(summary, maximum: 500)
    }

    func isStructurallyCompatible(teams: [MobileMatchDetailTeam]) -> Bool {
        isStructurallyCompatible &&
        teams.first(where: { $0.side == winnerSide })?.teamId == winnerTeamId
    }
}

struct MobileMatchDetailStats: Codable, Equatable, Sendable {
    let holesPlayed: Int
    let sideOneHolesWon: Int
    let halved: Int
    let sideTwoHolesWon: Int
    let biggestLead: Int
    let leadChanges: Int
    let holesRemaining: Int

    var isStructurallyCompatible: Bool {
        [
            holesPlayed, sideOneHolesWon, halved, sideTwoHolesWon,
            biggestLead, leadChanges, holesRemaining,
        ].allSatisfy { (0...18).contains($0) } &&
        sideOneHolesWon + halved + sideTwoHolesWon == holesPlayed &&
        holesPlayed + holesRemaining == 18 &&
        biggestLead <= holesPlayed
    }
}

struct MobileMatchDetailFreshness: Codable, Equatable, Sendable {
    @MobileRequiredNullable var updatedAt: MobileTimestamp?
    @MobileRequiredNullable var confirmedAt: MobileTimestamp?
}

struct MobileMatchDetailMatch: Codable, Equatable, Sendable {
    let matchId: String
    @MobileRequiredNullable var displayMatchNumber: String?
    let round: MobileMatchDetailRound
    let status: MobileMatchStatus
    @MobileRequiredNullable var course: MobileMatchDetailCourse?
    @MobileRequiredNullable var teeTime: MobileMatchDetailTeeTime?
    let teams: [MobileMatchDetailTeam]
    let authenticatedPlayer: MobileMatchDetailAuthenticatedPlayer
    let progress: MobileMatchDetailProgress
    @MobileRequiredNullable var result: MobileMatchDetailResult?
    let navigation: MobileMatchDetailNavigation
    let scorecard: MobileMatchDetailScorecard
    let flow: MobileMatchDetailFlow
    @MobileRequiredNullable var clinch: MobileMatchDetailClinch?
    let stats: MobileMatchDetailStats
    let freshness: MobileMatchDetailFreshness

    var isStructurallyCompatible: Bool {
        MobileOpaqueMatchID.isValid(matchId) &&
        MobileParticipantContentValidation.text(displayMatchNumber, maximum: 100, allowEmpty: false) &&
        round.isStructurallyCompatible &&
        (course?.isStructurallyCompatible ?? true) &&
        (teeTime?.isStructurallyCompatible ?? true) &&
        teams.count == 2 &&
        teams.map(\.side) == [1, 2] &&
        Set(teams.map(\.teamId)).count == 2 &&
        teams.allSatisfy { $0.isStructurallyCompatible(format: round.format) } &&
        Set(teams.flatMap(\.participants).map(\.playerId)).count == teams.flatMap(\.participants).count &&
        authenticatedPlayer.isStructurallyCompatible(teams: teams) &&
        progress.isStructurallyCompatible &&
        (result?.isStructurallyCompatible(teams: teams) ?? true) &&
        navigation.isStructurallyCompatible(
            matchId: matchId,
            participantInvolved: authenticatedPlayer.involved
        ) &&
        scorecard.isStructurallyCompatible(format: round.format, teams: teams) &&
        flow.isStructurallyCompatible &&
        (clinch?.isStructurallyCompatible(teams: teams) ?? true) &&
        stats.isStructurallyCompatible &&
        lifecycleIsStructurallyCompatible &&
        progressAndStatsAreStructurallyCompatible
    }

    private var lifecycleIsStructurallyCompatible: Bool {
        switch status {
        case .scheduled:
            return result == nil &&
                progress.currentHole == 0 &&
                progress.holesPlayed == 0 &&
                progress.holesRemaining == 18 &&
                progress.statusText == nil &&
                scorecard.state == .unavailable &&
                !scorecard.complete &&
                scorecard.confirmedAt == nil &&
                scorecard.holes.allSatisfy { $0.state == .unplayed && !$0.official } &&
                flow.front.status == .notStarted &&
                flow.back.status == .notStarted &&
                flow.overall.status == .notStarted &&
                clinch == nil &&
                stats == MobileMatchDetailStats(
                    holesPlayed: 0,
                    sideOneHolesWon: 0,
                    halved: 0,
                    sideTwoHolesWon: 0,
                    biggestLead: 0,
                    leadChanges: 0,
                    holesRemaining: 18
                ) &&
                freshness.confirmedAt == nil
        case .inProgress:
            return result != nil &&
                scorecard.state == .inProgress &&
                scorecard.confirmedAt == nil &&
                freshness.confirmedAt == nil
        case .completed:
            return result != nil &&
                scorecard.state == .confirmed &&
                scorecard.complete &&
                scorecard.confirmedAt != nil &&
                freshness.confirmedAt != nil &&
                scorecard.confirmedAt == freshness.confirmedAt
        }
    }

    private var progressAndStatsAreStructurallyCompatible: Bool {
        progress.holesPlayed == stats.holesPlayed &&
        progress.holesRemaining == stats.holesRemaining &&
        scorecard.holes.filter { $0.state != .unplayed }.count == progress.holesPlayed &&
        flow.overall.holesRecorded == progress.holesPlayed
    }

    func isCompatible(expectedMatchId: String, expectedPlayerId: String) -> Bool {
        guard isStructurallyCompatible,
              MobileOpaqueMatchID.isEqual(matchId, expectedMatchId),
              MobileParticipantContentValidation.id(expectedPlayerId)
        else { return false }
        let authenticated = teams.flatMap(\.participants).filter(\.isAuthenticatedPlayer)
        return authenticatedPlayer.involved
            ? authenticated.count == 1 && authenticated[0].playerId == expectedPlayerId
            : authenticated.isEmpty
    }
}

struct MobileMatchDetailData: MobileReadPayload {
    let tournament: MobileMatchDetailTournament
    let match: MobileMatchDetailMatch

    var contextBinding: MobileReadContextBinding {
        .tournament(tournament.tournamentId)
    }

    var isStructurallyCompatible: Bool {
        tournament.isStructurallyCompatible && match.isStructurallyCompatible
    }

    var revocableParticipantRepresentationKeys: Set<String> {
        var keys: Set<String> = []
        if match.result != nil { keys.insert("result:\(match.matchId)") }
        if match.scorecard.state == .confirmed {
            keys.insert("confirmed-scorecard:\(match.matchId)")
        }
        if match.clinch != nil { keys.insert("clinch:\(match.matchId)") }
        for hole in match.scorecard.holes where hole.official {
            keys.insert("official-hole:\(match.matchId):\(hole.holeNumber)")
        }
        return keys
    }
}

typealias MobileMatchDetailResponse = MobileReadResponse<MobileMatchDetailData>
