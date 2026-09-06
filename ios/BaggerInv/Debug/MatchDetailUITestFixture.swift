#if DEBUG
import Foundation

enum MatchDetailUITestScenario: String, CaseIterable {
    case bestBallUpcoming = "best-ball-upcoming"
    case bestBallLive = "best-ball-live"
    case bestBallFinal = "best-ball-final"
    case scrambleUpcoming = "scramble-upcoming"
    case scrambleLive = "scramble-live"
    case scrambleLiveCompletePending = "scramble-live-complete-pending"
    case scrambleFinal = "scramble-final"
    case singlesUpcoming = "singles-upcoming"
    case singlesLive = "singles-live"
    case singlesFinal = "singles-final"
    case singlesOffline = "singles-offline"

    var matchID: String {
        switch self {
        case .bestBallUpcoming: "fixture-r1-upcoming"
        case .bestBallLive: "fixture-r1-live"
        case .bestBallFinal: "fixture-r1-final"
        case .scrambleUpcoming: "fixture-r2-owned"
        case .scrambleLive: "fixture-r2-live"
        case .scrambleLiveCompletePending: "fixture-r2-live-complete-pending"
        case .scrambleFinal: "fixture-r2-final"
        case .singlesUpcoming: "fixture-r3-scheduled"
        case .singlesLive: "fixture-r3-live"
        case .singlesFinal: "fixture-r3-final"
        case .singlesOffline: "fixture-r3-offline"
        }
    }

    var format: MobileScoringFormat {
        switch self {
        case .bestBallUpcoming, .bestBallLive, .bestBallFinal: .bestBall
        case .scrambleUpcoming, .scrambleLive, .scrambleLiveCompletePending, .scrambleFinal: .scramble
        case .singlesUpcoming, .singlesLive, .singlesFinal, .singlesOffline: .singles
        }
    }

    var status: MobileMatchStatus {
        switch self {
        case .bestBallUpcoming, .scrambleUpcoming, .singlesUpcoming: .scheduled
        case .bestBallLive, .scrambleLive, .scrambleLiveCompletePending, .singlesLive: .inProgress
        case .bestBallFinal, .scrambleFinal, .singlesFinal, .singlesOffline: .completed
        }
    }

    var roundNumber: Int {
        switch format {
        case .bestBall: 1
        case .scramble: 2
        case .singles: 3
        case .unknown: 1
        }
    }

    var formatName: String {
        switch format {
        case .bestBall: "Best Ball"
        case .scramble: "Scramble"
        case .singles: "Singles"
        case .unknown: "Unknown"
        }
    }

    var index: Int {
        switch status {
        case .scheduled: 1
        case .inProgress: 2
        case .completed: 3
        }
    }

    var holesPlayed: Int {
        switch self {
        case .bestBallUpcoming, .scrambleUpcoming, .singlesUpcoming: 0
        case .bestBallLive: 12
        case .scrambleLive: 9
        case .scrambleLiveCompletePending: 18
        case .singlesLive: 7
        case .bestBallFinal, .scrambleFinal, .singlesFinal, .singlesOffline: 18
        }
    }

    var isOwned: Bool {
        switch self {
        case .bestBallLive, .scrambleUpcoming, .scrambleLiveCompletePending, .scrambleFinal,
             .singlesLive, .singlesFinal, .singlesOffline:
            true
        default: false
        }
    }

    var isOffline: Bool { self == .singlesOffline }

    var isCanonicalNavigationFixture: Bool {
        !isOffline && self != .scrambleLiveCompletePending
    }
}

enum MatchDetailUITestFixtures {
    static let argument = "--bagger-match-detail-scenario"
    private static var scorecardStressFixture: Bool {
        ProcessInfo.processInfo.arguments.contains("--bagger-scorecard-stress-fixture")
    }

    static let states: [String: MobileReadState<MobileMatchDetailData>] = Dictionary(
        uniqueKeysWithValues: MatchDetailUITestScenario.allCases.map { scenario in
            (scenario.matchID, state(for: scenario))
        }
    )

    static func startingMatchID(arguments: [String] = ProcessInfo.processInfo.arguments) -> String? {
        guard let index = arguments.firstIndex(of: argument),
              arguments.indices.contains(index + 1),
              let scenario = MatchDetailUITestScenario(rawValue: arguments[index + 1])
        else { return nil }
        return scenario.matchID
    }

    private static func state(for scenario: MatchDetailUITestScenario) -> MobileReadState<MobileMatchDetailData> {
        if scenario == .singlesFinal,
           ProcessInfo.processInfo.arguments.contains("--bagger-match-detail-revoked")
        {
            var revoked = MobileReadState<MobileMatchDetailData>.empty
            revoked.freshness = .failed
            revoked.lastSafeError = .unavailable
            revoked.lastServerCode = .matchNotFound
            revoked.lastHTTPStatus = 404
            return revoked
        }
        let data = data(for: scenario)
        precondition(data.isStructurallyCompatible, "Invalid deterministic Match Detail fixture")
        return MobileReadState(
            value: data,
            source: scenario.isOffline ? .diskCache : .network,
            freshness: scenario.isOffline ? .offline : .fresh,
            isRefreshing: false,
            revision: "fixture-\(scenario.rawValue)-r1",
            generatedAt: try! MobileTimestamp("2026-09-03T19:00:01.000Z"),
            fetchedAt: Date(timeIntervalSince1970: 1_788_460_801),
            validatedAt: Date(timeIntervalSince1970: 1_788_460_801),
            lastSafeError: scenario.isOffline ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: 200,
            cachePersistenceIssue: false
        )
    }

    private static func data(for scenario: MatchDetailUITestScenario) -> MobileMatchDetailData {
        let teams = teams(for: scenario)
        let holes = holes(for: scenario, teams: teams)
        let counts = holeCounts(holes)
        let isScheduled = scenario.status == .scheduled
        let isFinal = scenario.status == .completed
        let isConfirmationPending = scenario == .scrambleLiveCompletePending
        let isDecided = isFinal || isConfirmationPending
        let result = result(for: scenario)
        let confirmed = isFinal ? try! MobileTimestamp("2026-09-03T19:00:00.000Z") : nil

        return MobileMatchDetailData(
            tournament: MobileMatchDetailTournament(
                tournamentId: "fixture-tournament",
                name: "Sandbagger Invitational",
                year: 2026,
                status: "Live",
                timeZone: "America/New_York",
                location: "Kiawah Island"
            ),
            match: MobileMatchDetailMatch(
                matchId: scenario.matchID,
                displayMatchNumber: String(scenario.index),
                round: MobileMatchDetailRound(
                    roundNumber: scenario.roundNumber,
                    name: "Round \(scenario.roundNumber)",
                    format: scenario.format,
                    formatName: scenario.formatName
                ),
                status: scenario.status,
                course: scenario == .bestBallUpcoming ? nil : MobileMatchDetailCourse(
                    courseId: "OCGC01",
                    name: "The Ocean Course at Kiawah Island",
                    tee: "Tournament",
                    yardage: scenario == .scrambleLive ? nil : 6_793,
                    par: scenario == .scrambleLive ? nil : 72,
                    rating: scenario == .scrambleLive ? nil : 74.7,
                    slope: scenario == .scrambleLive ? nil : 150
                ),
                teeTime: scenario == .bestBallUpcoming ? nil : MobileMatchDetailTeeTime(
                    localTime: try! MobileLocalTime("08:10:00"),
                    label: "8:10 AM",
                    timeZone: "America/New_York"
                ),
                teams: teams,
                authenticatedPlayer: relationship(for: scenario, teams: teams),
                progress: MobileMatchDetailProgress(
                    currentHole: scenario.holesPlayed,
                    holesPlayed: scenario.holesPlayed,
                    holesRemaining: 18 - scenario.holesPlayed,
                    statusText: isScheduled
                        ? nil
                        : (isDecided ? result?.summary : "Through \(scenario.holesPlayed)")
                ),
                result: result,
                navigation: navigation(for: scenario),
                scorecard: MobileMatchDetailScorecard(
                    state: isScheduled ? .unavailable : (isFinal ? .confirmed : .inProgress),
                    complete: isFinal || isConfirmationPending,
                    confirmedAt: confirmed,
                    holes: holes
                ),
                flow: flow(for: scenario),
                clinch: scenario == .scrambleFinal || isConfirmationPending ? MobileMatchDetailClinch(
                    holeNumber: 13,
                    winnerSide: 1,
                    winnerTeamId: "PICKLES",
                    summary: "The Pickles clinched the Match on Hole 13."
                ) : nil,
                stats: MobileMatchDetailStats(
                    holesPlayed: scenario.holesPlayed,
                    sideOneHolesWon: counts.sideOne,
                    halved: counts.halved,
                    sideTwoHolesWon: counts.sideTwo,
                    biggestLead: scenario.holesPlayed == 0 ? 0 : min(3, scenario.holesPlayed),
                    leadChanges: scenario.holesPlayed < 3 ? 0 : 2,
                    holesRemaining: 18 - scenario.holesPlayed
                ),
                freshness: MobileMatchDetailFreshness(
                    updatedAt: isScheduled ? nil : try! MobileTimestamp("2026-09-03T18:58:00.000Z"),
                    confirmedAt: confirmed
                )
            )
        )
    }

    private static func teams(for scenario: MatchDetailUITestScenario) -> [MobileMatchDetailTeam] {
        let playerCount = scenario.format == .singles ? 1 : 2
        let authenticatedID = scenario.isOwned ? "CB01" : "P11"
        let longName = scenario == .bestBallLive
            ? "Christopher Bartholomew Montgomery-Wellington"
            : "Clay Beltran"
        let teamMode = scenario.format == .scramble

        let sideOnePlayers = (0..<playerCount).map { index in
            MobileMatchDetailParticipant(
                playerId: index == 0 ? authenticatedID : "P12",
                displayName: scorecardStressFixture
                    ? (index == 0 ? "Christopher Bartholomew Montgomery-Wellington" : "Christopher Morgan")
                    : (index == 0 ? (scenario.isOwned ? longName : "Alex Morgan") : "Jordan Lee"),
                teamSide: 1,
                isAuthenticatedPlayer: scenario.isOwned && index == 0,
                playingHandicap: index == 0 ? -2.75 : 11.25,
                strokesReceived: teamMode
                    ? nil
                    : (index == 0 ? 0 : (scenario == .bestBallLive ? 12 : 4))
            )
        }
        let sideTwoPlayers = (0..<playerCount).map { index in
            MobileMatchDetailParticipant(
                playerId: index == 0 ? "P21" : "P22",
                displayName: index == 0 ? "Taylor Kim" : "Cameron Diaz",
                teamSide: 2,
                isAuthenticatedPlayer: false,
                playingHandicap: index == 0 ? 8 : nil,
                strokesReceived: teamMode ? nil : (index == 0 ? 1 : nil)
            )
        }

        return [
            MobileMatchDetailTeam(
                side: 1,
                teamId: "PICKLES",
                name: "The Pickles",
                playingHandicap: teamMode ? 3 : nil,
                strokesReceived: teamMode ? 2 : nil,
                participants: sideOnePlayers
            ),
            MobileMatchDetailTeam(
                side: 2,
                teamId: "LIPPIT",
                name: scorecardStressFixture ? "Lipp it and Rip it Invitational" : "Lipp it and Rip it",
                playingHandicap: teamMode ? 1 : nil,
                strokesReceived: teamMode ? 0 : nil,
                participants: sideTwoPlayers
            ),
        ]
    }

    private static func relationship(
        for scenario: MatchDetailUITestScenario,
        teams: [MobileMatchDetailTeam]
    ) -> MobileMatchDetailAuthenticatedPlayer {
        guard scenario.isOwned else {
            return MobileMatchDetailAuthenticatedPlayer(
                involved: false,
                teamSide: nil,
                partnerPlayerIds: [],
                opponentPlayerIds: []
            )
        }
        return MobileMatchDetailAuthenticatedPlayer(
            involved: true,
            teamSide: 1,
            partnerPlayerIds: teams[0].participants.dropFirst().map(\.playerId),
            opponentPlayerIds: teams[1].participants.map(\.playerId)
        )
    }

    private static func navigation(for scenario: MatchDetailUITestScenario) -> MobileMatchDetailNavigation {
        let family = MatchDetailUITestScenario.allCases.filter {
            $0.format == scenario.format && $0.isCanonicalNavigationFixture
        }
        let navigationScenario: MatchDetailUITestScenario = switch scenario {
        case .singlesOffline: .singlesFinal
        case .scrambleLiveCompletePending: .scrambleLive
        default: scenario
        }
        let ownedMatchID = family.first(where: \.isOwned)?.matchID
        return MobileMatchDetailNavigation(
            roundMatchIndex: navigationScenario.index,
            roundMatchCount: family.count,
            previousMatchId: navigationScenario.index > 1 ? family[navigationScenario.index - 2].matchID : nil,
            nextMatchId: navigationScenario.index < family.count ? family[navigationScenario.index].matchID : nil,
            myMatchId: scenario.isOwned ? scenario.matchID : ownedMatchID,
            isMyMatch: scenario.isOwned
        )
    }

    private static func result(
        for scenario: MatchDetailUITestScenario
    ) -> MobileMatchDetailResult? {
        switch scenario {
        case .bestBallUpcoming, .scrambleUpcoming, .singlesUpcoming:
            return nil
        case .bestBallLive, .scrambleLive:
            return MobileMatchDetailResult(
                summary: "All Square",
                notation: "All Square",
                winnerSide: nil,
                winnerTeamId: nil
            )
        case .bestBallFinal:
            return MobileMatchDetailResult(
                summary: "Match Halved",
                notation: "Halved",
                winnerSide: nil,
                winnerTeamId: nil
            )
        case .scrambleLiveCompletePending, .scrambleFinal:
            return MobileMatchDetailResult(
                summary: "The Pickles 7 & 5",
                notation: "7 & 5",
                winnerSide: 1,
                winnerTeamId: "PICKLES"
            )
        case .singlesLive:
            return MobileMatchDetailResult(
                summary: "The Pickles 1 UP",
                notation: "1 UP",
                winnerSide: 1,
                winnerTeamId: "PICKLES"
            )
        case .singlesFinal, .singlesOffline:
            return MobileMatchDetailResult(
                summary: "The Pickles 1 UP",
                notation: "1 UP",
                winnerSide: 1,
                winnerTeamId: "PICKLES"
            )
        }
    }

    private static func holes(
        for scenario: MatchDetailUITestScenario,
        teams: [MobileMatchDetailTeam]
    ) -> [MobileMatchDetailHole] {
        (1...18).map { holeNumber in
            let played = holeNumber <= scenario.holesPlayed
            let state = outcome(for: scenario, holeNumber: holeNumber, played: played)
            let winningSide: Int? = state == .sideOne ? 1 : (state == .sideTwo ? 2 : nil)
            return MobileMatchDetailHole(
                holeNumber: holeNumber,
                par: 3 + (holeNumber % 3),
                yardage: 150 + (holeNumber * 17),
                strokeIndex: holeNumber,
                state: state,
                official: played,
                winningSide: winningSide,
                sideOne: sideScore(
                    side: 1,
                    format: scenario.format,
                    players: teams[0].participants,
                    played: played,
                    scenario: scenario,
                    holeNumber: holeNumber
                ),
                sideTwo: sideScore(
                    side: 2,
                    format: scenario.format,
                    players: teams[1].participants,
                    played: played,
                    scenario: scenario,
                    holeNumber: holeNumber
                ),
                resultLabel: played ? (winningSide == 1 ? "The Pickles" : (winningSide == 2 ? "Lipp it and Rip it" : "Halved")) : nil,
                runningResult: played ? (scorecardStressFixture
                    ? ["The Pickles 1 UP", "AS", "The Pickles 7 & 6", "The Pickles 15 UP", "Dormie"][(holeNumber - 1) % 5]
                    : "The Pickles 1 UP") : nil,
                story: played
                    ? ((scenario == .scrambleFinal || scenario == .scrambleLiveCompletePending) && holeNumber > 13
                        ? "The Match was already decided on Hole 13."
                        : "Canonical Hole \(holeNumber) result is official.")
                    : nil,
                updatedAt: played ? try! MobileTimestamp("2026-09-03T18:58:00.000Z") : nil
            )
        }
    }

    private static func outcome(
        for scenario: MatchDetailUITestScenario,
        holeNumber: Int,
        played: Bool
    ) -> MobileMatchDetailHoleState {
        guard played else { return .unplayed }
        if scenario == .bestBallFinal { return holeNumber.isMultiple(of: 2) ? .sideTwo : .sideOne }
        if scenario == .scrambleFinal || scenario == .scrambleLiveCompletePending {
            return holeNumber <= 7 ? .sideOne : .halved
        }
        if scenario == .singlesFinal || scenario == .singlesOffline {
            if holeNumber == 17 { return .halved }
            if holeNumber == 18 { return .sideOne }
            return holeNumber.isMultiple(of: 2) ? .sideTwo : .sideOne
        }
        switch holeNumber % 3 {
        case 1: return .sideOne
        case 2: return .halved
        default: return .sideTwo
        }
    }

    private static func sideScore(
        side: Int,
        format: MobileScoringFormat,
        players: [MobileMatchDetailParticipant],
        played: Bool,
        scenario: MatchDetailUITestScenario,
        holeNumber: Int
    ) -> MobileMatchDetailSideScore {
        if format == .scramble {
            return .team(
                MobileMatchDetailTeamSideScore(
                    side: side,
                    scope: .team,
                    playerScores: [],
                    teamScore: played ? MobileMatchDetailTeamHoleScore(
                        gross: side == 1 ? 4 : 5,
                        strokes: scorecardStressFixture ? (side == 1 ? 0 : 2) : (side == 1 ? 0 : 1)
                    ) : nil,
                    netScore: played ? 4 : nil
                )
            )
        }
        return .players(
            MobileMatchDetailPlayerSideScore(
                side: side,
                scope: .players,
                playerScores: players.enumerated().map { index, player in
                    let scoreUnavailable = scenario == .bestBallLive
                        && holeNumber == 1
                        && side == 1
                        && index == 0
                    return MobileMatchDetailPlayerHoleScore(
                        playerId: player.playerId,
                        gross: played && !scoreUnavailable ? (side == 1 ? 4 + index : 5 + index) : nil,
                        strokes: played && !scoreUnavailable
                            ? (scorecardStressFixture ? (side == 1 && index == 0 ? 0 : index + 1)
                               : (side == 2 && index == 0 ? 1 : 0)) : nil
                    )
                },
                teamScore: nil,
                netScore: played ? 4 : nil
            )
        )
    }

    private static func flow(for scenario: MatchDetailUITestScenario) -> MobileMatchDetailFlow {
        guard scenario.holesPlayed > 0 else {
            let empty = MobileMatchDetailFlowSegment(
                status: .notStarted,
                winnerSide: nil,
                result: nil,
                holesRecorded: 0
            )
            return MobileMatchDetailFlow(front: empty, back: empty, overall: empty)
        }
        let frontCount = min(9, scenario.holesPlayed)
        let backCount = max(0, scenario.holesPlayed - 9)
        let notStarted = MobileMatchDetailFlowSegment(
            status: .notStarted,
            winnerSide: nil,
            result: nil,
            holesRecorded: 0
        )
        switch scenario {
        case .bestBallLive, .scrambleLive:
            let front = MobileMatchDetailFlowSegment(
                status: .allSquare,
                winnerSide: nil,
                result: "All Square",
                holesRecorded: frontCount
            )
            let back = backCount == 0 ? notStarted : MobileMatchDetailFlowSegment(
                status: .allSquare,
                winnerSide: nil,
                result: "All Square",
                holesRecorded: backCount
            )
            return MobileMatchDetailFlow(
                front: front,
                back: back,
                overall: MobileMatchDetailFlowSegment(
                    status: .allSquare,
                    winnerSide: nil,
                    result: "All Square",
                    holesRecorded: scenario.holesPlayed
                )
            )
        case .singlesLive:
            let front = MobileMatchDetailFlowSegment(
                status: .leading,
                winnerSide: 1,
                result: "The Pickles 1 UP",
                holesRecorded: frontCount
            )
            return MobileMatchDetailFlow(
                front: front,
                back: notStarted,
                overall: front
            )
        case .bestBallFinal:
            return MobileMatchDetailFlow(
                front: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: 1,
                    result: "The Pickles 1 UP",
                    holesRecorded: 9
                ),
                back: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: 2,
                    result: "Lipp it and Rip it 1 UP",
                    holesRecorded: 9
                ),
                overall: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: nil,
                    result: "All Square",
                    holesRecorded: 18
                )
            )
        case .scrambleLiveCompletePending, .scrambleFinal:
            return MobileMatchDetailFlow(
                front: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: 1,
                    result: "The Pickles 7 UP",
                    holesRecorded: 9
                ),
                back: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: nil,
                    result: "All Square",
                    holesRecorded: 9
                ),
                overall: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: 1,
                    result: "The Pickles 7 & 5",
                    holesRecorded: 18
                )
            )
        case .singlesFinal, .singlesOffline:
            return MobileMatchDetailFlow(
                front: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: 1,
                    result: "The Pickles 1 UP",
                    holesRecorded: 9
                ),
                back: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: nil,
                    result: "All Square",
                    holesRecorded: 9
                ),
                overall: MobileMatchDetailFlowSegment(
                    status: .final,
                    winnerSide: 1,
                    result: "The Pickles 1 UP",
                    holesRecorded: 18
                )
            )
        case .bestBallUpcoming, .scrambleUpcoming, .singlesUpcoming:
            return MobileMatchDetailFlow(front: notStarted, back: notStarted, overall: notStarted)
        }
    }

    private static func holeCounts(
        _ holes: [MobileMatchDetailHole]
    ) -> (sideOne: Int, halved: Int, sideTwo: Int) {
        (
            holes.filter { $0.state == .sideOne }.count,
            holes.filter { $0.state == .halved }.count,
            holes.filter { $0.state == .sideTwo }.count
        )
    }
}
#endif
