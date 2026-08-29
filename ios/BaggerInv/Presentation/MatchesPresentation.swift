import Foundation
import OSLog

enum MatchesContentAvailability: Equatable, Sendable {
    case loading
    case content
    case empty
    case unavailable
}

enum MatchesPresentedFreshness: Equatable, Sendable {
    case current
    case cached
    case refreshing
    case stale
    case offline
}

enum MatchesFreshnessBannerKind: Equatable, Sendable {
    case cached
    case stale
    case offline
}

struct MatchesFreshnessBanner: Equatable, Sendable {
    let kind: MatchesFreshnessBannerKind
    let lastValidated: Date?
}

/// A stable, participant-safe Round identity derived only from canonical Round
/// fields. Match IDs are deliberately never parsed to infer Round membership.
enum MatchesRoundID: Hashable, Sendable {
    case number(Int)
    case name(String)
    case unspecified

    var number: Int? {
        guard case .number(let value) = self else { return nil }
        return value
    }
}

enum MatchesMatchStatusPresentation: String, Equatable, Hashable, Sendable {
    case upcoming = "Upcoming"
    case live = "Live"
    case final = "Final"
}

struct MatchesParticipantPresentation: Identifiable, Equatable, Hashable, Sendable {
    let playerID: String
    let displayName: String
    let isAuthenticatedPlayer: Bool

    var id: String { playerID }
}

struct MatchesSidePresentation: Identifiable, Equatable, Hashable, Sendable {
    let side: Int
    let name: String?
    let participants: [MatchesParticipantPresentation]

    var id: Int { side }

    var displayName: String {
        name ?? "Team \(side)"
    }
}

struct MatchesMatchPresentation: Identifiable, Equatable, Hashable, Sendable {
    let matchID: String
    let roundID: MatchesRoundID
    let roundText: String
    let formatText: String?
    let status: MatchesMatchStatusPresentation
    let courseName: String?
    let tee: String?
    let teeTimeLabel: String?
    let teams: [MatchesSidePresentation]
    let authenticatedPlayerInvolved: Bool
    let authenticatedPlayerSide: Int?
    let progressText: String?
    let resultText: String?
    let resultWinner: String?
    let teamOnePointsText: String?
    let teamTwoPointsText: String?

    var id: String { matchID }

    var ownSide: MatchesSidePresentation? {
        guard authenticatedPlayerInvolved, let authenticatedPlayerSide else { return nil }
        return teams.first { $0.side == authenticatedPlayerSide }
    }

    var opponentSide: MatchesSidePresentation? {
        guard authenticatedPlayerInvolved, let authenticatedPlayerSide else { return nil }
        return teams.first { $0.side != authenticatedPlayerSide }
    }

    var courseAndTeeText: String? {
        let value = [courseName, tee].compactMap { $0 }.joined(separator: " · ")
        return value.isEmpty ? nil : value
    }
}

struct MatchesRoundPresentation: Identifiable, Equatable, Hashable, Sendable {
    let id: MatchesRoundID
    let title: String
    let matches: [MatchesMatchPresentation]
    let yourMatch: MatchesMatchPresentation?
    let hasMultipleInvolvedMatches: Bool
}

enum MatchesDestination: Hashable, Sendable {
    case match(matchID: String)
}

struct MatchesPresentation: Equatable, Sendable {
    let tournamentID: String
    let tournamentName: String
    let tournamentYear: Int?
    let canonicalCurrentRound: Int?
    let availability: MatchesContentAvailability
    let rounds: [MatchesRoundPresentation]
    let selectedRoundID: MatchesRoundID?
    let freshness: MatchesPresentedFreshness?
    let freshnessBanner: MatchesFreshnessBanner?
    let isRefreshing: Bool
    let revisionIsPresent: Bool

    var availableRoundIDs: [MatchesRoundID] {
        rounds.map(\.id)
    }

    var defaultRoundID: MatchesRoundID? {
        resolvedRoundID(preferred: nil)
    }

    var selectedRound: MatchesRoundPresentation? {
        round(withID: selectedRoundID)
    }

    func round(withID id: MatchesRoundID?) -> MatchesRoundPresentation? {
        guard let id else { return nil }
        return rounds.first { $0.id == id }
    }

    func match(withID id: String) -> MatchesMatchPresentation? {
        for round in rounds {
            if let match = round.matches.first(where: { $0.matchID == id }) {
                return match
            }
        }
        return nil
    }

    func match(for destination: MatchesDestination) -> MatchesMatchPresentation? {
        switch destination {
        case .match(let matchID):
            return match(withID: matchID)
        }
    }

    /// Keeps an active selection when possible. If refreshed data removes it,
    /// canonical current Round wins, then the nearest numbered Round, then the
    /// first Round in server order.
    func resolvedRoundID(preferred: MatchesRoundID?) -> MatchesRoundID? {
        guard !rounds.isEmpty else { return nil }

        if let preferred, rounds.contains(where: { $0.id == preferred }) {
            return preferred
        }

        if let canonicalCurrentRound,
           let exact = rounds.first(where: { $0.id == .number(canonicalCurrentRound) })
        {
            return exact.id
        }

        let numericAnchor = canonicalCurrentRound ?? preferred?.number
        if let numericAnchor,
           let nearest = rounds.enumerated()
               .compactMap({ index, round -> (index: Int, distance: Int, id: MatchesRoundID)? in
                   guard let number = round.id.number else { return nil }
                   return (index, Int(number.distance(to: numericAnchor).magnitude), round.id)
               })
               .min(by: { lhs, rhs in
                   lhs.distance == rhs.distance ? lhs.index < rhs.index : lhs.distance < rhs.distance
               })
        {
            return nearest.id
        }

        return rounds[0].id
    }
}

enum MatchesPresenter {
    private static let logger = Logger(subsystem: "BaggerInv", category: "MatchesPresentation")

    static func make(
        participant: ParticipantSession,
        state: MobileReadState<MobileMatchesData>,
        selectedRoundID: MatchesRoundID? = nil
    ) -> MatchesPresentation {
        make(
            state: state,
            selectedRoundID: selectedRoundID,
            fallbackTournament: (
                id: participant.tournament.tournamentId,
                name: participant.tournament.name,
                year: participant.tournament.year
            )
        )
    }

    /// State-only entry point used by the live repository-backed UI. Session
    /// fallback context is unnecessary once `/matches` has a value.
    static func make(
        state: MobileReadState<MobileMatchesData>,
        selectedRoundID: MatchesRoundID? = nil
    ) -> MatchesPresentation {
        make(state: state, selectedRoundID: selectedRoundID, fallbackTournament: nil)
    }

    static func match(id: String, in presentation: MatchesPresentation) -> MatchesMatchPresentation? {
        presentation.match(withID: id)
    }

    private static func make(
        state: MobileReadState<MobileMatchesData>,
        selectedRoundID: MatchesRoundID?,
        fallbackTournament: (id: String, name: String, year: Int?)?
    ) -> MatchesPresentation {
        guard let data = state.value else {
            return MatchesPresentation(
                tournamentID: fallbackTournament?.id ?? "",
                tournamentName: fallbackTournament?.name ?? "",
                tournamentYear: fallbackTournament?.year,
                canonicalCurrentRound: nil,
                availability: unavailableOrLoading(state),
                rounds: [],
                selectedRoundID: nil,
                freshness: nil,
                freshnessBanner: nil,
                isRefreshing: state.isRefreshing,
                revisionIsPresent: false
            )
        }

        var groups: [(id: MatchesRoundID, source: MobileMatchRound, matches: [MatchesMatchPresentation])] = []
        for match in data.matches {
            let roundID = roundID(match.round)
            let presentedMatch = matchPresentation(match, roundID: roundID)
            if let index = groups.firstIndex(where: { $0.id == roundID }) {
                groups[index].matches.append(presentedMatch)
            } else {
                groups.append((roundID, match.round, [presentedMatch]))
            }
        }

        let rounds = groups.map { group in
            let involved = group.matches.filter(\.authenticatedPlayerInvolved)
#if DEBUG
            if involved.count > 1 {
                logger.warning("Multiple involved matches were returned for one Round; using first canonical match.")
            }
#endif
            return MatchesRoundPresentation(
                id: group.id,
                title: roundText(group.source),
                matches: group.matches,
                yourMatch: involved.first,
                hasMultipleInvolvedMatches: involved.count > 1
            )
        }

        let base = MatchesPresentation(
            tournamentID: data.tournament.tournamentId,
            tournamentName: data.tournament.name,
            tournamentYear: data.tournament.year,
            canonicalCurrentRound: data.tournament.currentRound,
            availability: rounds.isEmpty ? .empty : .content,
            rounds: rounds,
            selectedRoundID: nil,
            freshness: presentedFreshness(state),
            freshnessBanner: freshnessBanner(state),
            isRefreshing: state.isRefreshing,
            revisionIsPresent: state.revision != nil
        )
        let resolvedSelection = base.resolvedRoundID(preferred: selectedRoundID)
        return MatchesPresentation(
            tournamentID: base.tournamentID,
            tournamentName: base.tournamentName,
            tournamentYear: base.tournamentYear,
            canonicalCurrentRound: base.canonicalCurrentRound,
            availability: base.availability,
            rounds: base.rounds,
            selectedRoundID: resolvedSelection,
            freshness: base.freshness,
            freshnessBanner: base.freshnessBanner,
            isRefreshing: base.isRefreshing,
            revisionIsPresent: base.revisionIsPresent
        )
    }

    static func formatText(_ rawFormat: String?) -> String? {
        guard let format = nonempty(rawFormat) else { return nil }
        switch format.uppercased() {
        case "BB": return "Best Ball"
        case "SC": return "Scramble"
        case "SI": return "Singles"
        default: return format
        }
    }

    private static func matchPresentation(
        _ match: MobileMatch,
        roundID: MatchesRoundID
    ) -> MatchesMatchPresentation {
        let status: MatchesMatchStatusPresentation
        switch match.status {
        case .scheduled: status = .upcoming
        case .inProgress: status = .live
        case .completed: status = .final
        }

        let progressText: String?
        if match.status == .inProgress,
           let currentHole = match.progress?.currentHole,
           (1...18).contains(currentHole)
        {
            progressText = "Through \(currentHole)"
        } else {
            progressText = nil
        }

        let teamOnePoints = finitePoints(match.result?.teamOnePoints)
        let teamTwoPoints = finitePoints(match.result?.teamTwoPoints)
        let resultSummary = nonempty(match.result?.summary)
        let resultWinner = nonempty(match.result?.winner)
        let resultText: String?
        if let resultSummary {
            resultText = resultSummary
        } else if let teamOnePoints, let teamTwoPoints {
            resultText = "\(TodayPointsFormatter.string(for: teamOnePoints)) – \(TodayPointsFormatter.string(for: teamTwoPoints))"
        } else if let resultWinner {
            resultText = winnerText(resultWinner, teams: match.teams)
        } else {
            resultText = nil
        }

        return MatchesMatchPresentation(
            matchID: match.matchId,
            roundID: roundID,
            roundText: roundText(match.round),
            formatText: formatText(match.round.format),
            status: status,
            courseName: nonempty(match.course?.name),
            tee: nonempty(match.course?.tee),
            teeTimeLabel: teeTimeText(match.teeTime),
            teams: match.teams.map(sidePresentation),
            authenticatedPlayerInvolved: match.authenticatedPlayer.involved,
            authenticatedPlayerSide: match.authenticatedPlayer.teamSide,
            progressText: progressText,
            resultText: resultText,
            resultWinner: resultWinner,
            teamOnePointsText: teamOnePoints.map { TodayPointsFormatter.string(for: $0) },
            teamTwoPointsText: teamTwoPoints.map { TodayPointsFormatter.string(for: $0) }
        )
    }

    private static func sidePresentation(_ side: MobileMatchTeam) -> MatchesSidePresentation {
        MatchesSidePresentation(
            side: side.side,
            name: nonempty(side.name),
            participants: side.participants.map {
                MatchesParticipantPresentation(
                    playerID: $0.playerId,
                    displayName: $0.displayName,
                    isAuthenticatedPlayer: $0.isAuthenticatedPlayer
                )
            }
        )
    }

    private static func roundID(_ round: MobileMatchRound) -> MatchesRoundID {
        if let number = round.roundNumber { return .number(number) }
        if let name = nonempty(round.name) { return .name(name) }
        return .unspecified
    }

    private static func roundText(_ round: MobileMatchRound) -> String {
        let name = nonempty(round.name)
        if let number = round.roundNumber {
            let numbered = "Round \(number)"
            guard let name, name.caseInsensitiveCompare(numbered) != .orderedSame else {
                return numbered
            }
            return "\(numbered) · \(name)"
        }
        return name ?? "Round"
    }

    private static func teeTimeText(_ teeTime: MobileMatchTeeTime?) -> String? {
        guard let teeTime else { return nil }
        if let label = nonempty(teeTime.label) { return label }
        return teeTime.localTime.map { TodayClockFormatter.string(for: $0) }
    }

    private static func finitePoints(_ points: Double?) -> Double? {
        guard let points, points.isFinite else { return nil }
        return points
    }

    private static func winnerText(_ winner: String, teams: [MobileMatchTeam]) -> String {
        switch winner.lowercased() {
        case "teamone", "team1", "1":
            return "\(sideName(1, teams: teams)) wins"
        case "teamtwo", "team2", "2":
            return "\(sideName(2, teams: teams)) wins"
        case "tie", "tied", "halved", "draw":
            return "Halved"
        default:
            return winner
        }
    }

    private static func sideName(_ side: Int, teams: [MobileMatchTeam]) -> String {
        guard let name = nonempty(teams.first(where: { $0.side == side })?.name) else {
            return "Team \(side)"
        }
        return name
    }

    private static func nonempty(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func unavailableOrLoading(
        _ state: MobileReadState<MobileMatchesData>
    ) -> MatchesContentAvailability {
        switch state.freshness {
        case .empty, .cached, .refreshing:
            return .loading
        case .fresh, .stale, .offline, .failed:
            return .unavailable
        }
    }

    private static func presentedFreshness(
        _ state: MobileReadState<MobileMatchesData>
    ) -> MatchesPresentedFreshness {
        switch state.freshness {
        case .fresh: return .current
        case .cached: return .cached
        case .refreshing: return .refreshing
        case .stale, .failed: return .stale
        case .offline: return .offline
        case .empty: return state.source == .diskCache ? .cached : .current
        }
    }

    private static func freshnessBanner(
        _ state: MobileReadState<MobileMatchesData>
    ) -> MatchesFreshnessBanner? {
        let kind: MatchesFreshnessBannerKind?
        switch state.freshness {
        case .offline:
            kind = .offline
        case .stale, .failed:
            kind = .stale
        case .cached:
            kind = .cached
        case .refreshing where state.source == .diskCache:
            kind = .cached
        case .empty, .fresh, .refreshing:
            kind = nil
        }
        guard let kind else { return nil }
        return MatchesFreshnessBanner(kind: kind, lastValidated: state.validatedAt)
    }
}
