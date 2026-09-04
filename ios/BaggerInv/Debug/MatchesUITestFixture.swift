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
            value: data(for: scenario),
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

    private static func data(for scenario: TodayUITestScenario) -> MobileMatchesData {
        let hasAuthenticatedMatch = scenario != .matchesNoUserMatch
        let longContent = scenario == .matchesLongContent
        let missingAssets = scenario == .matchesMissingAssets
        let mixedFormat = scenario == .matchesMixedFormat
        let matchesScenario = scenario.rawValue.hasPrefix("matches.")
        let usesCanonicalParticipant = matchesScenario &&
            scenario != .matchesLongContent &&
            scenario != .matchesMissingAssets
        let authenticatedPlayerID: String
        let authenticatedPlayerName: String
        if usesCanonicalParticipant {
            authenticatedPlayerID = "CB01"
            authenticatedPlayerName = "Clay Beltran"
        } else if longContent || missingAssets {
            authenticatedPlayerID = "UNKNOWN_PLAYER"
            authenticatedPlayerName = longContent
                ? "Alexandria Montgomery-Wellington the Third"
                : "Unknown Asset Golfer"
        } else {
            authenticatedPlayerID = "fixture-player-a"
            authenticatedPlayerName = "Alex Morgan"
        }

        return MobileMatchesData(
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
                    displayMatchNumber: "1",
                    round: 1,
                    roundName: "Opening Round",
                    format: "Best Ball",
                    status: .completed,
                    authenticated: hasAuthenticatedMatch,
                    result: MobileMatchResult(
                        summary: longContent
                            ? "The Golden Coastal Dunes Invitational Team wins after 21 holes"
                            : "Lipp it and Rip it 2 & 1",
                        winner: "teamOne",
                        teamOnePoints: 2,
                        teamTwoPoints: 1
                    ),
                    courseID: courseID(round: 1, missingAssets: missingAssets),
                    courseName: courseName(round: 1, longContent: longContent),
                    tee: tee(round: 1, longContent: longContent),
                    authenticatedPlayerID: authenticatedPlayerID,
                    authenticatedPlayerName: authenticatedPlayerName,
                    missingAssets: missingAssets,
                    longContent: longContent
                ),
                match(
                    id: "fixture-r1-live",
                    displayMatchNumber: "2",
                    round: 1,
                    roundName: "Opening Round",
                    format: "Best Ball",
                    status: .inProgress,
                    progress: MobileMatchProgress(currentHole: 12),
                    courseID: courseID(round: 1, missingAssets: missingAssets),
                    courseName: courseName(round: 1, longContent: longContent),
                    tee: tee(round: 1, longContent: longContent),
                    authenticatedPlayerID: authenticatedPlayerID,
                    authenticatedPlayerName: authenticatedPlayerName,
                    missingAssets: missingAssets,
                    longContent: longContent
                ),
                match(
                    id: "fixture-r2-owned",
                    displayMatchNumber: "3",
                    round: 2,
                    roundName: "Second Round",
                    format: "Scramble",
                    status: .scheduled,
                    authenticated: hasAuthenticatedMatch,
                    courseID: courseID(round: 2, missingAssets: missingAssets),
                    courseName: courseName(round: 2, longContent: longContent),
                    tee: tee(round: 2, longContent: longContent),
                    authenticatedPlayerID: authenticatedPlayerID,
                    authenticatedPlayerName: authenticatedPlayerName,
                    missingAssets: missingAssets,
                    longContent: longContent
                ),
                match(
                    id: "fixture-r2-live",
                    displayMatchNumber: "4",
                    round: 2,
                    roundName: "Second Round",
                    format: mixedFormat ? "BB" : "SC",
                    status: .inProgress,
                    progress: MobileMatchProgress(currentHole: 7),
                    courseID: courseID(round: 2, missingAssets: missingAssets),
                    courseName: courseName(round: 2, longContent: longContent),
                    tee: tee(round: 2, longContent: longContent),
                    authenticatedPlayerID: authenticatedPlayerID,
                    authenticatedPlayerName: authenticatedPlayerName,
                    missingAssets: missingAssets,
                    longContent: longContent
                ),
                match(
                    id: "fixture-r2-final",
                    displayMatchNumber: "5",
                    round: 2,
                    roundName: "Second Round",
                    format: "Scramble",
                    status: .completed,
                    result: MobileMatchResult(
                        summary: nil,
                        winner: nil,
                        teamOnePoints: 1.5,
                        teamTwoPoints: 1.5
                    ),
                    courseID: courseID(round: 2, missingAssets: missingAssets),
                    courseName: courseName(round: 2, longContent: longContent),
                    tee: tee(round: 2, longContent: longContent),
                    authenticatedPlayerID: authenticatedPlayerID,
                    authenticatedPlayerName: authenticatedPlayerName,
                    missingAssets: missingAssets,
                    longContent: longContent
                ),
                match(
                    id: "fixture-r3-scheduled",
                    displayMatchNumber: "6",
                    round: 3,
                    roundName: "Singles",
                    format: "Singles",
                    status: .scheduled,
                    authenticated: hasAuthenticatedMatch,
                    courseID: courseID(round: 3, missingAssets: missingAssets),
                    courseName: courseName(round: 3, longContent: longContent),
                    tee: tee(round: 3, longContent: longContent),
                    participantCount: 1,
                    authenticatedPlayerID: authenticatedPlayerID,
                    authenticatedPlayerName: authenticatedPlayerName,
                    missingAssets: missingAssets,
                    longContent: longContent
                ),
                match(
                    id: "fixture-r3-live",
                    displayMatchNumber: "7",
                    round: 3,
                    roundName: "Singles",
                    format: "Singles",
                    status: .inProgress,
                    progress: MobileMatchProgress(currentHole: 15),
                    courseID: courseID(round: 3, missingAssets: missingAssets),
                    courseName: courseName(round: 3, longContent: longContent),
                    tee: tee(round: 3, longContent: longContent),
                    participantCount: 1,
                    authenticatedPlayerID: authenticatedPlayerID,
                    authenticatedPlayerName: authenticatedPlayerName,
                    missingAssets: missingAssets,
                    longContent: longContent
                ),
                match(
                    id: "fixture-r3-final",
                    displayMatchNumber: "8",
                    round: 3,
                    roundName: "Singles",
                    format: "Singles",
                    status: .completed,
                    result: MobileMatchResult(
                        summary: "Pickles 1 UP",
                        winner: "teamOne",
                        teamOnePoints: 1,
                        teamTwoPoints: 0
                    ),
                    courseID: courseID(round: 3, missingAssets: missingAssets),
                    courseName: courseName(round: 3, longContent: longContent),
                    tee: tee(round: 3, longContent: longContent),
                    participantCount: 1,
                    authenticatedPlayerID: authenticatedPlayerID,
                    authenticatedPlayerName: authenticatedPlayerName,
                    missingAssets: missingAssets,
                    longContent: longContent
                ),
            ]
        )
    }

    private static func match(
        id: String,
        displayMatchNumber: String,
        round: Int,
        roundName: String,
        format: String,
        status: MobileMatchStatus,
        authenticated: Bool = false,
        progress: MobileMatchProgress? = nil,
        result: MobileMatchResult? = nil,
        courseID: String,
        courseName: String,
        tee: String,
        participantCount: Int = 2,
        authenticatedPlayerID: String,
        authenticatedPlayerName: String,
        missingAssets: Bool,
        longContent: Bool
    ) -> MobileMatchesMatch {
        let ownName = authenticatedPlayerName
        let partnerName = longContent
            ? "Christopher Bartholomew Kensington"
            : "Jordan Lee"
        let opponentName = longContent
            ? "Maximilian Theodore Rutherford-Smythe"
            : "Taylor Kim"
        let opponentPartnerName = longContent
            ? "Benjamin Alexander Worthington"
            : "Cameron Diaz"

        let isScramble = format.uppercased() == "SC" || format.uppercased() == "SCRAMBLE"
        let teamOneGolf = teamGolfContext(
            matchID: id,
            side: 1,
            isScramble: isScramble,
            longContent: longContent
        )
        let teamTwoGolf = teamGolfContext(
            matchID: id,
            side: 2,
            isScramble: isScramble,
            longContent: longContent
        )

        return MobileMatchesMatch(
            matchId: id,
            displayMatchNumber: displayMatchNumber,
            round: MobileMatchRound(
                roundNumber: round,
                name: roundName,
                format: format
            ),
            status: status,
            course: MobileMatchCourse(
                courseId: courseID,
                name: courseName,
                tee: tee
            ),
            teeTime: MobileMatchTeeTime(
                localTime: try! MobileLocalTime(round == 2 ? "08:10:00" : "09:20:00"),
                label: round == 2 ? "8:10 AM" : "9:20 AM",
                timeZone: "America/Chicago"
            ),
            teams: [
                MobileMatchesTeam(
                    side: 1,
                    teamId: missingAssets ? "UNKNOWN_TEAM_1" : "PICKLES",
                    name: longContent ? "The Evergreen Pines Invitational Team" : "Pickles",
                    playingHandicap: teamOneGolf.handicap,
                    strokesReceived: teamOneGolf.strokes,
                    participants: Array([
                        participant(
                            playerId: authenticated ? authenticatedPlayerID : "fixture-player-e",
                            displayName: authenticated ? ownName : "Riley Chen",
                            teamSide: 1,
                            isAuthenticatedPlayer: authenticated,
                            format: format,
                            side: 1,
                            slot: 1,
                            longContent: longContent
                        ),
                        participant(
                            playerId: "fixture-player-b",
                            displayName: partnerName,
                            teamSide: 1,
                            isAuthenticatedPlayer: false,
                            format: format,
                            side: 1,
                            slot: 2,
                            longContent: longContent
                        ),
                    ].prefix(participantCount))
                ),
                MobileMatchesTeam(
                    side: 2,
                    teamId: missingAssets ? "UNKNOWN_TEAM_2" : "LIPPIT",
                    name: longContent ? "The Golden Coastal Dunes Invitational Team" : "Lipp it and Rip it",
                    playingHandicap: teamTwoGolf.handicap,
                    strokesReceived: teamTwoGolf.strokes,
                    participants: Array([
                        participant(
                            playerId: "fixture-player-c",
                            displayName: opponentName,
                            teamSide: 2,
                            isAuthenticatedPlayer: false,
                            format: format,
                            side: 2,
                            slot: 1,
                            longContent: longContent
                        ),
                        participant(
                            playerId: "fixture-player-d",
                            displayName: opponentPartnerName,
                            teamSide: 2,
                            isAuthenticatedPlayer: false,
                            format: format,
                            side: 2,
                            slot: 2,
                            longContent: longContent
                        ),
                    ].prefix(participantCount))
                ),
            ],
            authenticatedPlayer: MobileAuthenticatedPlayerRelationship(
                involved: authenticated,
                teamSide: authenticated ? 1 : nil,
                partnerPlayerIds: authenticated && participantCount > 1 ? ["fixture-player-b"] : [],
                opponentPlayerIds: authenticated
                    ? Array(["fixture-player-c", "fixture-player-d"].prefix(participantCount))
                    : []
            ),
            progress: progress,
            result: result
        )
    }

    private static func participant(
        playerId: String,
        displayName: String,
        teamSide: Int,
        isAuthenticatedPlayer: Bool,
        format: String,
        side: Int,
        slot: Int,
        longContent: Bool
    ) -> MobileMatchesParticipant {
        let isScramble = format.uppercased() == "SC" || format.uppercased() == "SCRAMBLE"
        let handicap: Double? = longContent && side == 1 && slot == 1
            ? 12.34567
            : side == 1 ? (slot == 1 ? 7.5 : 11.0) : (slot == 1 ? -0.5 : 2.25)
        let strokes: Int?
        if isScramble {
            strokes = nil
        } else if side == 1 {
            strokes = slot == 1 ? 0 : 4
        } else {
            strokes = slot == 1 ? 2 : nil
        }

        return MobileMatchesParticipant(
            playerId: playerId,
            displayName: displayName,
            teamSide: teamSide,
            isAuthenticatedPlayer: isAuthenticatedPlayer,
            playingHandicap: handicap,
            strokesReceived: strokes
        )
    }

    private static func teamGolfContext(
        matchID: String,
        side: Int,
        isScramble: Bool,
        longContent: Bool
    ) -> (handicap: Double?, strokes: Int?) {
        guard isScramble else { return (nil, nil) }
        if matchID.hasSuffix("final"), side == 2 { return (nil, nil) }
        let handicap = longContent && side == 1 ? 12.34567 : side == 1 ? 3.5 : 4.25
        return (handicap, side == 1 ? 0 : 2)
    }

    private static func courseID(round: Int, missingAssets: Bool) -> String {
        guard !missingAssets else { return "UNKNOWN_COURSE_\(round)" }
        switch round {
        case 1: return "TPGC01"
        case 2: return "CPGC01"
        default: return "OCGC01"
        }
    }

    private static func courseName(round: Int, longContent: Bool) -> String {
        if longContent {
            switch round {
            case 1: return "Turtle Point Golf Course at Kiawah Island Golf Resort"
            case 2: return "Cougar Point Golf Course at Kiawah Island Golf Resort"
            default: return "The Ocean Course at Kiawah Island Golf Resort Championship Layout"
            }
        }
        switch round {
        case 1: return "Turtle Point Golf Course"
        case 2: return "Cougar Point Golf Course"
        default: return "The Ocean Course"
        }
    }

    private static func tee(round: Int, longContent: Bool) -> String {
        if longContent { return "Championship Tournament Tees" }
        return round == 2 ? "Black" : "Gold"
    }
}
#endif
