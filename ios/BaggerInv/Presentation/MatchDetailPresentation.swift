import Foundation

enum MatchDetailContentAvailability: Equatable, Sendable {
    case loading
    case content
    case unavailable
    case loadError
}

enum MatchDetailFreshnessBannerKind: Equatable, Sendable {
    case cached
    case stale
    case offline
}

struct MatchDetailFreshnessBannerPresentation: Equatable, Sendable {
    let kind: MatchDetailFreshnessBannerKind
    let message: String
}

enum MatchDetailHoleOutcomePresentation: Equatable, Sendable {
    case unplayed
    case halved
    case sideOne
    case sideTwo
}

enum MatchDetailScoreScopePresentation: Equatable, Sendable {
    case players
    case team
}

enum MatchDetailFlowSelection: String, CaseIterable, Identifiable, Sendable {
    case front = "Front"
    case back = "Back"
    case overall = "Overall"

    var id: String { rawValue }
}

enum MatchDetailFlowStatusPresentation: Equatable, Sendable {
    case notStarted
    case allSquare
    case leading
    case final
}

enum MatchDetailScorecardStatePresentation: Equatable, Sendable {
    case unavailable
    case inProgress
    case confirmed

    var title: String {
        switch self {
        case .unavailable: "Not available"
        case .inProgress: "Official scores in progress"
        case .confirmed: "Confirmed scores"
        }
    }
}

struct MatchDetailTournamentPresentation: Equatable, Sendable {
    let tournamentID: String
    let name: String
    let year: Int?
    let status: String?
    let timeZone: String
    let location: String?
}

struct MatchDetailPlayerPresentation: Identifiable, Equatable, Sendable {
    let playerID: String
    let displayName: String
    let isAuthenticatedPlayer: Bool
    let golfContext: MatchesGolfContextPresentation?

    var id: String { playerID }
}

struct MatchDetailTeamPresentation: Identifiable, Equatable, Sendable {
    let side: Int
    let teamID: String
    let name: String
    let golfContext: MatchesGolfContextPresentation?
    let players: [MatchDetailPlayerPresentation]

    var id: Int { side }
}

struct MatchDetailPlayerHoleScorePresentation: Identifiable, Equatable, Sendable {
    let playerID: String
    let displayName: String
    let gross: Int?
    let strokes: Int?

    var id: String { playerID }
}

struct MatchDetailHoleSidePresentation: Equatable, Sendable {
    let side: Int
    let teamID: String
    let teamName: String
    let scope: MatchDetailScoreScopePresentation
    let playerScores: [MatchDetailPlayerHoleScorePresentation]
    let teamGross: Int?
    let teamStrokes: Int?
    let netScore: Int?
}

struct MatchDetailHolePresentation: Identifiable, Equatable, Sendable {
    let holeNumber: Int
    let par: Int?
    let yardage: Int?
    let strokeIndex: Int?
    let outcome: MatchDetailHoleOutcomePresentation
    let isOfficial: Bool
    let winningSide: Int?
    let resultLabel: String?
    let runningResult: String?
    let story: String?
    let updatedAt: MobileTimestamp?
    let sideOne: MatchDetailHoleSidePresentation
    let sideTwo: MatchDetailHoleSidePresentation

    var id: Int { holeNumber }

    var isPlayed: Bool { outcome != .unplayed }

    func accessibilityLabel(
        teams: [MatchDetailTeamPresentation],
        selected: Bool,
        current: Bool = false,
        clinching: Bool = false
    ) -> String {
        var parts = ["Hole \(holeNumber)"]
        switch outcome {
        case .unplayed:
            parts.append("not played")
        case .halved:
            parts.append("halved")
        case .sideOne, .sideTwo:
            if let winningSide,
               let team = teams.first(where: { $0.side == winningSide })
            {
                parts.append("won by \(team.name)")
            } else {
                parts.append("result posted")
            }
        }
        if isOfficial { parts.append("official") }
        if current { parts.append("current hole") }
        if clinching { parts.append("clinching hole") }
        if selected { parts.append("selected") }
        return parts.joined(separator: ", ")
    }
}

struct MatchDetailFlowSegmentPresentation: Equatable, Sendable {
    let status: MatchDetailFlowStatusPresentation
    let winnerSide: Int?
    let winnerTeamName: String?
    let result: String?
    let holesRecorded: Int

    var statusText: String {
        switch status {
        case .notStarted: "Not started"
        case .allSquare: "All square"
        case .leading: "Leading"
        case .final: "Final"
        }
    }
}

struct MatchDetailFlowPresentation: Equatable, Sendable {
    let front: MatchDetailFlowSegmentPresentation
    let back: MatchDetailFlowSegmentPresentation
    let overall: MatchDetailFlowSegmentPresentation

    func segment(for selection: MatchDetailFlowSelection) -> MatchDetailFlowSegmentPresentation {
        switch selection {
        case .front: front
        case .back: back
        case .overall: overall
        }
    }
}

struct MatchDetailClinchPresentation: Equatable, Sendable {
    let holeNumber: Int
    let winnerSide: Int
    let winnerTeamID: String
    let winnerTeamName: String
    let summary: String
}

struct MatchDetailStatsPresentation: Equatable, Sendable {
    let holesPlayed: Int
    let sideOneHolesWon: Int
    let halved: Int
    let sideTwoHolesWon: Int
    let biggestLead: Int
    let leadChanges: Int
    let holesRemaining: Int
}

struct MatchDetailCoursePresentation: Equatable, Sendable {
    let courseID: String?
    let name: String
    let tee: String?
    let yardage: Int?
    let par: Double?
    let rating: Double?
    let slope: Int?
}

struct MatchDetailNavigationPresentation: Equatable, Sendable {
    let roundMatchIndex: Int
    let roundMatchCount: Int
    let previousMatchID: String?
    let nextMatchID: String?
    let myMatchID: String?
    let isMyMatch: Bool
}

struct MatchDetailScorecardPresentation: Equatable, Sendable {
    let state: MatchDetailScorecardStatePresentation
    let isComplete: Bool
    let confirmedAt: MobileTimestamp?
    let confirmationText: String?
    let holes: [MatchDetailHolePresentation]
}

struct MatchDetailMatchPresentation: Equatable, Sendable {
    let matchID: String
    let displayMatchNumber: String?
    let roundNumber: Int
    let roundName: String?
    let formatName: String
    let format: MobileScoringFormat
    let status: MatchesMatchStatusPresentation
    let course: MatchDetailCoursePresentation?
    let teeTimeLabel: String?
    let teams: [MatchDetailTeamPresentation]
    let authenticatedPlayerInvolved: Bool
    let authenticatedPlayerSide: Int?
    let progressCurrentHole: Int
    let progressHolesPlayed: Int
    let progressHolesRemaining: Int
    let progressStatusText: String?
    let resultSummary: String?
    let resultNotation: String?
    let resultWinnerSide: Int?
    let resultWinnerTeamID: String?
    let navigation: MatchDetailNavigationPresentation
    let scorecard: MatchDetailScorecardPresentation
    let flow: MatchDetailFlowPresentation
    let clinch: MatchDetailClinchPresentation?
    let stats: MatchDetailStatsPresentation
    let freshnessText: String?

    var contextEyebrow: String {
        let matchLabel = displayMatchNumber.map { "MATCH \($0)" } ?? "MATCH \(navigation.roundMatchIndex)"
        return "ROUND \(roundNumber) · \(matchLabel) OF \(navigation.roundMatchCount)"
    }

    var statusKind: BaggerStatusKind {
        switch status {
        case .upcoming: .upcoming
        case .live: .live
        case .final: .final
        }
    }

    var headlineResult: String {
        if let resultSummary, !resultSummary.isEmpty { return resultSummary }
        if let resultNotation, !resultNotation.isEmpty { return resultNotation }
        if let progressStatusText, !progressStatusText.isEmpty { return progressStatusText }
        switch status {
        case .upcoming: return "Upcoming"
        case .live: return "Live"
        case .final: return "Final"
        }
    }

    var latestPlayedHoleNumber: Int? {
        scorecard.holes.last(where: \.isPlayed)?.holeNumber
    }

    var defaultSelectedHoleNumber: Int? {
        switch status {
        case .upcoming:
            return scorecard.holes.first?.holeNumber
        case .live:
            if let current = scorecard.holes.first(where: {
                $0.holeNumber == progressCurrentHole
            }) {
                return current.holeNumber
            }
            return latestPlayedHoleNumber ?? scorecard.holes.first?.holeNumber
        case .final:
            if let clinch, hole(number: clinch.holeNumber) != nil {
                return clinch.holeNumber
            }
            return latestPlayedHoleNumber ?? scorecard.holes.first?.holeNumber
        }
    }

    func hole(number: Int?) -> MatchDetailHolePresentation? {
        guard let number else { return nil }
        return scorecard.holes.first { $0.holeNumber == number }
    }
}

struct MatchDetailPresentation: Equatable, Sendable {
    let requestedMatchID: String
    let availability: MatchDetailContentAvailability
    let tournament: MatchDetailTournamentPresentation?
    let match: MatchDetailMatchPresentation?
    let freshnessBanner: MatchDetailFreshnessBannerPresentation?
    let isRefreshing: Bool
}

enum MatchDetailPresenter {
    static func make(
        state: MobileReadState<MobileMatchDetailData>,
        requestedMatchID: String,
        now: Date = Date()
    ) -> MatchDetailPresentation {
        // Authoritative revocation is never an offline/stale presentation. Keep
        // this rendering boundary fail-closed even if a caller accidentally
        // retains a prior value alongside the canonical not-found response.
        let canonicallyUnavailable = state.lastHTTPStatus == 404
        let accessInvalidated = state.lastSafeError == .authentication ||
            state.lastSafeError == .authorization ||
            state.lastHTTPStatus == 401 || state.lastHTTPStatus == 403
        guard !canonicallyUnavailable,
              !accessInvalidated,
              let data = state.value,
              MobileOpaqueMatchID.isEqual(data.match.matchId, requestedMatchID)
        else {
            let availability: MatchDetailContentAvailability
            if canonicallyUnavailable {
                availability = .unavailable
            } else if accessInvalidated || state.value != nil {
                // An identity mismatch must hide the protected representation,
                // but it is not evidence that this Match returned a 404.
                availability = .loadError
            } else if state.isRefreshing {
                availability = .loading
            } else {
                // A cold repository remains valueless while resolving its
                // cache and while the first request is in flight. None of
                // those ordinary phases establishes participant-safe absence.
                switch state.freshness {
                case .empty, .cached, .refreshing:
                    availability = .loading
                case .fresh, .stale, .offline, .failed:
                    availability = .loadError
                }
            }
            return MatchDetailPresentation(
                requestedMatchID: requestedMatchID,
                availability: availability,
                tournament: nil,
                match: nil,
                freshnessBanner: nil,
                isRefreshing: state.isRefreshing
            )
        }

        let teams = data.match.teams.map { team in
            MatchDetailTeamPresentation(
                side: team.side,
                teamID: team.teamId,
                name: team.name,
                golfContext: data.match.round.format == .scramble
                    ? golfContext(scope: .team, handicap: team.playingHandicap, strokes: team.strokesReceived)
                    : nil,
                players: team.participants.map { player in
                    MatchDetailPlayerPresentation(
                        playerID: player.playerId,
                        displayName: player.displayName,
                        isAuthenticatedPlayer: player.isAuthenticatedPlayer,
                        // Scramble presents handicap/strokes at team scope only,
                        // regardless of the canonical participant handicap value.
                        golfContext: data.match.round.format == .scramble
                            ? nil : golfContext(
                            scope: .participant,
                            handicap: player.playingHandicap,
                            strokes: data.match.round.format == .scramble ? nil : player.strokesReceived
                        )
                    )
                }
            )
        }
        let playerNames = Dictionary(
            uniqueKeysWithValues: teams.flatMap(\.players).map { ($0.playerID, $0.displayName) }
        )
        let teamNames = Dictionary(uniqueKeysWithValues: teams.map { ($0.side, $0.name) })
        let holes = data.match.scorecard.holes.map { hole in
            MatchDetailHolePresentation(
                holeNumber: hole.holeNumber,
                par: hole.par,
                yardage: hole.yardage,
                strokeIndex: hole.strokeIndex,
                outcome: holeOutcome(hole.state),
                isOfficial: hole.official,
                winningSide: hole.winningSide,
                resultLabel: hole.resultLabel,
                runningResult: hole.runningResult,
                story: hole.story,
                updatedAt: hole.updatedAt,
                sideOne: sideScore(hole.sideOne, teams: teams, playerNames: playerNames),
                sideTwo: sideScore(hole.sideTwo, teams: teams, playerNames: playerNames)
            )
        }
        let timeZone = TimeZone(identifier: data.tournament.timeZone) ?? .current
        let confirmationText = data.match.scorecard.confirmedAt.map {
            "Scorecard confirmed · \(absoluteDate($0.date, timeZone: timeZone))"
        }
        let match = MatchDetailMatchPresentation(
            matchID: data.match.matchId,
            displayMatchNumber: data.match.displayMatchNumber,
            roundNumber: data.match.round.roundNumber,
            roundName: data.match.round.name,
            formatName: data.match.round.formatName,
            format: data.match.round.format,
            status: status(data.match.status),
            course: data.match.course.map {
                MatchDetailCoursePresentation(
                    courseID: $0.courseId,
                    name: $0.name,
                    tee: $0.tee,
                    yardage: $0.yardage,
                    par: $0.par,
                    rating: $0.rating,
                    slope: $0.slope
                )
            },
            teeTimeLabel: data.match.teeTime?.label,
            teams: teams,
            authenticatedPlayerInvolved: data.match.authenticatedPlayer.involved,
            authenticatedPlayerSide: data.match.authenticatedPlayer.teamSide,
            progressCurrentHole: data.match.progress.currentHole,
            progressHolesPlayed: data.match.progress.holesPlayed,
            progressHolesRemaining: data.match.progress.holesRemaining,
            progressStatusText: data.match.progress.statusText,
            resultSummary: data.match.result?.summary,
            resultNotation: data.match.result?.notation,
            resultWinnerSide: data.match.result?.winnerSide,
            resultWinnerTeamID: data.match.result?.winnerTeamId,
            navigation: MatchDetailNavigationPresentation(
                roundMatchIndex: data.match.navigation.roundMatchIndex,
                roundMatchCount: data.match.navigation.roundMatchCount,
                previousMatchID: data.match.navigation.previousMatchId,
                nextMatchID: data.match.navigation.nextMatchId,
                myMatchID: data.match.navigation.myMatchId,
                isMyMatch: data.match.navigation.isMyMatch
            ),
            scorecard: MatchDetailScorecardPresentation(
                state: scorecardState(data.match.scorecard.state),
                isComplete: data.match.scorecard.complete,
                confirmedAt: data.match.scorecard.confirmedAt,
                confirmationText: confirmationText,
                holes: holes
            ),
            flow: MatchDetailFlowPresentation(
                front: flowSegment(data.match.flow.front, teamNames: teamNames),
                back: flowSegment(data.match.flow.back, teamNames: teamNames),
                overall: flowSegment(data.match.flow.overall, teamNames: teamNames)
            ),
            clinch: data.match.clinch.map {
                MatchDetailClinchPresentation(
                    holeNumber: $0.holeNumber,
                    winnerSide: $0.winnerSide,
                    winnerTeamID: $0.winnerTeamId,
                    winnerTeamName: teamNames[$0.winnerSide] ?? "Team \($0.winnerSide)",
                    summary: $0.summary
                )
            },
            stats: MatchDetailStatsPresentation(
                holesPlayed: data.match.stats.holesPlayed,
                sideOneHolesWon: data.match.stats.sideOneHolesWon,
                halved: data.match.stats.halved,
                sideTwoHolesWon: data.match.stats.sideTwoHolesWon,
                biggestLead: data.match.stats.biggestLead,
                leadChanges: data.match.stats.leadChanges,
                holesRemaining: data.match.stats.holesRemaining
            ),
            freshnessText: data.match.freshness.updatedAt.map {
                "Updated \(relativeDate($0.date, now: now))"
            }
        )

        return MatchDetailPresentation(
            requestedMatchID: requestedMatchID,
            availability: .content,
            tournament: MatchDetailTournamentPresentation(
                tournamentID: data.tournament.tournamentId,
                name: data.tournament.name,
                year: data.tournament.year,
                status: data.tournament.status,
                timeZone: data.tournament.timeZone,
                location: data.tournament.location
            ),
            match: match,
            freshnessBanner: freshnessBanner(state),
            isRefreshing: state.isRefreshing
        )
    }

    private static func golfContext(
        scope: MatchesGolfContextScope,
        handicap: Double?,
        strokes: Int?
    ) -> MatchesGolfContextPresentation? {
        guard handicap != nil || strokes != nil else { return nil }
        return MatchesGolfContextPresentation(
            scope: scope,
            playingHandicap: handicap,
            strokesReceived: strokes
        )
    }

    private static func status(_ status: MobileMatchStatus) -> MatchesMatchStatusPresentation {
        switch status {
        case .scheduled: .upcoming
        case .inProgress: .live
        case .completed: .final
        }
    }

    private static func holeOutcome(_ state: MobileMatchDetailHoleState) -> MatchDetailHoleOutcomePresentation {
        switch state {
        case .unplayed: .unplayed
        case .halved: .halved
        case .sideOne: .sideOne
        case .sideTwo: .sideTwo
        }
    }

    private static func scorecardState(
        _ state: MobileMatchDetailScorecardState
    ) -> MatchDetailScorecardStatePresentation {
        switch state {
        case .unavailable: .unavailable
        case .inProgress: .inProgress
        case .confirmed: .confirmed
        }
    }

    private static func sideScore(
        _ score: MobileMatchDetailSideScore,
        teams: [MatchDetailTeamPresentation],
        playerNames: [String: String]
    ) -> MatchDetailHoleSidePresentation {
        let team = teams.first { $0.side == score.side }
        return MatchDetailHoleSidePresentation(
            side: score.side,
            teamID: team?.teamID ?? "",
            teamName: team?.name ?? "Team \(score.side)",
            scope: score.scope == .team ? .team : .players,
            playerScores: score.playerScores.map {
                MatchDetailPlayerHoleScorePresentation(
                    playerID: $0.playerId,
                    displayName: playerNames[$0.playerId] ?? "Player",
                    gross: $0.gross,
                    strokes: $0.strokes
                )
            },
            teamGross: score.teamScore?.gross,
            teamStrokes: score.teamScore?.strokes,
            netScore: score.netScore
        )
    }

    private static func flowSegment(
        _ segment: MobileMatchDetailFlowSegment,
        teamNames: [Int: String]
    ) -> MatchDetailFlowSegmentPresentation {
        MatchDetailFlowSegmentPresentation(
            status: flowStatus(segment.status),
            winnerSide: segment.winnerSide,
            winnerTeamName: segment.winnerSide.flatMap { teamNames[$0] },
            result: segment.result,
            holesRecorded: segment.holesRecorded
        )
    }

    private static func flowStatus(
        _ status: MobileMatchDetailFlowStatus
    ) -> MatchDetailFlowStatusPresentation {
        switch status {
        case .notStarted: .notStarted
        case .allSquare: .allSquare
        case .leading: .leading
        case .final: .final
        }
    }

    private static func freshnessBanner(
        _ state: MobileReadState<MobileMatchDetailData>
    ) -> MatchDetailFreshnessBannerPresentation? {
        switch state.freshness {
        case .cached:
            return .init(kind: .cached, message: "Showing saved Match details while Bagger refreshes.")
        case .refreshing where state.source == .diskCache:
            return .init(kind: .cached, message: "Showing saved Match details while Bagger refreshes.")
        case .stale, .failed:
            return .init(kind: .stale, message: "Showing the last saved Match details. Refresh is temporarily unavailable.")
        case .offline:
            return .init(kind: .offline, message: "Offline — showing the last saved Match details.")
        case .empty, .fresh, .refreshing:
            return nil
        }
    }

    private static func relativeDate(_ date: Date, now: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: now)
    }

    private static func absoluteDate(_ date: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "MMM d 'at' h:mm a"
        return formatter.string(from: date)
    }
}
