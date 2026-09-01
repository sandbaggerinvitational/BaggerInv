#if DEBUG
import Foundation

enum MatchesUITestFixtures {
    static func state(for scenario: TodayUITestScenario) -> MobileReadState<MobileMatchesData> {
        if scenario == .matchesEmptyOffline {
            return MobileReadState(
                value: nil,
                source: nil,
                freshness: .offline,
                isRefreshing: false,
                revision: nil,
                generatedAt: nil,
                fetchedAt: nil,
                validatedAt: nil,
                lastSafeError: .transport,
                lastServerCode: nil,
                lastHTTPStatus: nil,
                cachePersistenceIssue: false
            )
        }

        let isOffline = scenario == .matchesCachedOffline
        return MobileReadState(
            value: data(
                hasAuthenticatedMatch: scenario != .matchesNoUserMatch,
                longContent: scenario == .matchesLongContent
            ),
            source: isOffline ? .diskCache : .network,
            freshness: isOffline ? .offline : .fresh,
            isRefreshing: false,
            revision: "fixture-matches-revision",
            generatedAt: try! MobileTimestamp("2026-09-24T12:00:00.000Z"),
            fetchedAt: Date(timeIntervalSince1970: 1_800_000_000),
            validatedAt: Date(timeIntervalSince1970: 1_800_000_000),
            lastSafeError: isOffline ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: nil,
            cachePersistenceIssue: false
        )
    }

    private static func data(
        hasAuthenticatedMatch: Bool,
        longContent: Bool
    ) -> MobileMatchesData {
        MobileMatchesData(
            tournament: MobileReadTournament(
                tournamentId: "fixture-tournament",
                name: "Bagger Fixture Invitational",
                year: 2026,
                status: "Live",
                currentRound: 2,
                timeZone: "America/Chicago"
            ),
            matches: [
                match(
                    id: "fixture-r1-final",
                    round: 1,
                    roundName: "Opening Round",
                    format: "BB",
                    status: .completed,
                    authenticated: hasAuthenticatedMatch,
                    result: MobileMatchResult(
                        summary: "Won 2 & 1",
                        winner: "teamOne",
                        teamOnePoints: 2,
                        teamTwoPoints: 1
                    ),
                    longContent: longContent
                ),
                match(
                    id: "fixture-r2-owned",
                    round: 2,
                    roundName: "Second Round",
                    format: "SC",
                    status: .scheduled,
                    authenticated: hasAuthenticatedMatch,
                    longContent: longContent
                ),
                match(
                    id: "fixture-r2-live",
                    round: 2,
                    roundName: "Second Round",
                    format: "SC",
                    status: .inProgress,
                    progress: MobileMatchProgress(currentHole: 7),
                    longContent: longContent
                ),
                match(
                    id: "fixture-r2-final",
                    round: 2,
                    roundName: "Second Round",
                    format: "SC",
                    status: .completed,
                    result: MobileMatchResult(
                        summary: nil,
                        winner: nil,
                        teamOnePoints: 1.5,
                        teamTwoPoints: 1.5
                    ),
                    longContent: longContent
                ),
                match(
                    id: "fixture-r3-scheduled",
                    round: 3,
                    roundName: "Singles",
                    format: "SI",
                    status: .scheduled,
                    authenticated: hasAuthenticatedMatch,
                    longContent: longContent
                ),
            ]
        )
    }

    private static func match(
        id: String,
        round: Int,
        roundName: String,
        format: String,
        status: MobileMatchStatus,
        authenticated: Bool = false,
        progress: MobileMatchProgress? = nil,
        result: MobileMatchResult? = nil,
        longContent: Bool
    ) -> MobileMatch {
        let ownName = longContent
            ? "Alexandria Montgomery-Wellington the Third"
            : "Alex Morgan"
        let partnerName = longContent
            ? "Christopher Bartholomew Kensington"
            : "Jordan Lee"
        let opponentName = longContent
            ? "Maximilian Theodore Rutherford-Smythe"
            : "Taylor Kim"
        let opponentPartnerName = longContent
            ? "Benjamin Alexander Worthington"
            : "Cameron Diaz"

        return MobileMatch(
            matchId: id,
            round: MobileMatchRound(
                roundNumber: round,
                name: roundName,
                format: format
            ),
            status: status,
            course: MobileMatchCourse(
                courseId: "fixture-course-\(round)",
                name: longContent
                    ? "The Exceptionally Long Ocean Course at Kiawah Island Resort"
                    : round == 1 ? "Turtle Point" : round == 2 ? "Cougar Point" : "Ocean Course",
                tee: longContent ? "Championship Tournament Tees" : "Gold"
            ),
            teeTime: MobileMatchTeeTime(
                localTime: try! MobileLocalTime(round == 2 ? "08:10:00" : "09:20:00"),
                label: round == 2 ? "8:10 AM" : "9:20 AM",
                timeZone: "America/Chicago"
            ),
            teams: [
                MobileMatchTeam(
                    side: 1,
                    name: longContent ? "The Evergreen Pines Invitational Team" : "Pines",
                    participants: [
                        MobileMatchParticipant(
                            playerId: authenticated ? "fixture-player-a" : "fixture-player-e",
                            displayName: authenticated ? ownName : "Riley Chen",
                            teamSide: 1,
                            isAuthenticatedPlayer: authenticated
                        ),
                        MobileMatchParticipant(
                            playerId: "fixture-player-b",
                            displayName: partnerName,
                            teamSide: 1,
                            isAuthenticatedPlayer: false
                        ),
                    ]
                ),
                MobileMatchTeam(
                    side: 2,
                    name: longContent ? "The Golden Coastal Dunes Invitational Team" : "Dunes",
                    participants: [
                        MobileMatchParticipant(
                            playerId: "fixture-player-c",
                            displayName: opponentName,
                            teamSide: 2,
                            isAuthenticatedPlayer: false
                        ),
                        MobileMatchParticipant(
                            playerId: "fixture-player-d",
                            displayName: opponentPartnerName,
                            teamSide: 2,
                            isAuthenticatedPlayer: false
                        ),
                    ]
                ),
            ],
            authenticatedPlayer: MobileAuthenticatedPlayerRelationship(
                involved: authenticated,
                teamSide: authenticated ? 1 : nil,
                partnerPlayerIds: authenticated ? ["fixture-player-b"] : [],
                opponentPlayerIds: authenticated ? ["fixture-player-c", "fixture-player-d"] : []
            ),
            progress: progress,
            result: result
        )
    }
}
#endif
