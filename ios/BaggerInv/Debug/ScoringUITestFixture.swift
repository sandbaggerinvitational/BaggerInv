#if DEBUG
import Foundation

enum ScoringUITestFixtures {
    static func state(for scenario: TodayUITestScenario) -> ScoringCurrentState {
        if scenario == .scoreNoMatch {
            return ScoringCurrentState(
                scoring: nil,
                generatedAt: generatedAt,
                phase: .noMatch,
                isRefreshing: false,
                lastSafeError: nil,
                lastServerCode: nil,
                lastHTTPStatus: nil
            )
        }

        let format: MobileScoringFormat
        switch scenario {
        case .scoreActiveScramble: format = .scramble
        case .scoreActiveSingles: format = .singles
        case .scoreUnknownFormat: format = .unknown("ALT")
        default: format = .bestBall
        }

        let status: MobileMatchStatus = scenario == .scoreCompleted ? .completed :
            scenario == .scoreUpcomingBestBall ? .scheduled : .inProgress
        let isReadOnly = scenario == .scoreReadOnly || status != .inProgress
        let readyToFinalize = scenario == .scoreFinalizationReady ||
            scenario == .scoreFinalizationUnknown
        let scoring = makeScoring(
            format: format,
            status: status,
            readOnly: isReadOnly,
            longContent: scenario == .scoreLongContent,
            mixedHoles: scenario == .scoreMixedHoles ||
                scenario == .scoreCompleted ||
                scenario == .scoreCorrectionPending,
            readyToFinalize: readyToFinalize
        )

        return ScoringCurrentState(
            scoring: scoring,
            generatedAt: generatedAt,
            phase: scenario == .scoreOffline || scenario == .scoreDurableOffline ? .offline : .ready,
            isRefreshing: false,
            lastSafeError: scenario == .scoreOffline || scenario == .scoreDurableOffline ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: nil
        )
    }

    static func finalizedWorkflowState() -> ScoringCurrentState {
        ScoringCurrentState(
            scoring: makeScoring(
                format: .bestBall,
                status: .completed,
                readOnly: true,
                longContent: false,
                mixedHoles: true,
                readyToFinalize: false
            ),
            generatedAt: generatedAt,
            phase: .ready,
            isRefreshing: false,
            lastSafeError: nil,
            lastServerCode: nil,
            lastHTTPStatus: nil
        )
    }

    private static let generatedAt = try! MobileTimestamp("2026-09-24T12:00:00.000Z")

    static func finalizationReview(format: MobileScoringFormat) -> MobileScoringCurrent {
        makeScoring(format: format, status: .inProgress, readOnly: false,
                    longContent: false, mixedHoles: false, readyToFinalize: true)
    }

    private static func makeScoring(
        format: MobileScoringFormat,
        status: MobileMatchStatus,
        readOnly: Bool,
        longContent: Bool,
        mixedHoles: Bool,
        readyToFinalize: Bool
    ) -> MobileScoringCurrent {
        // Singles has exactly one canonical participant per side. The old UI
        // fixture retained both BB players and correctly failed the edit gate.
        let sides = fixtureSides(longContent: longContent).map { side in
            MobileScoringSide(side: side.side, teamId: side.teamId, name: side.name,
                              participants: format == .singles ? Array(side.participants.prefix(1)) : side.participants)
        }
        let holes = (1...18).map { number in
            MobileScoringCourseHole(
                holeNumber: number,
                par: Double([4, 4, 3, 5][(number - 1) % 4]),
                strokeIndex: Double(number),
                yardage: Double(145 + number * 17)
            )
        }
        let scorecardComplete = status == .completed || readyToFinalize
        let scoredThrough = scorecardComplete ? 18 : mixedHoles ? 12 : 6
        let scores = (1...scoredThrough).map { number in
            officialScore(holeNumber: number, format: format)
        }
        let final = status == .completed
        let resultTeam = ProcessInfo.processInfo.arguments.contains("--bagger-ui-test-scorecard-team-assets")
            ? sides[0].name : "Pines"
        let genericResult = ProcessInfo.processInfo.arguments.contains("--bagger-ui-test-generic-scorecard-result")
        return MobileScoringCurrent(
            match: MobileScoringMatch(
                matchId: "fixture-scoring-match",
                roundNumber: 2,
                format: format,
                status: status,
                matchRevision: 17,
                permissionRevision: 4,
                result: final ? .teamOne : nil
            ),
            player: MobileScoringPlayer(
                playerId: "fixture-player-a",
                displayName: longContent ? "Alexandria Montgomery-Wellington the Third" : "Alex Morgan",
                teamSide: 1
            ),
            sides: sides,
            course: MobileScoringCourse(
                courseId: ProcessInfo.processInfo.arguments.contains("--bagger-ui-test-known-course-asset")
                    ? "OCGC01" : "fixture-ocean-course",
                name: longContent
                    ? "The Exceptionally Long Ocean Course at Kiawah Island Resort"
                    : "Ocean Course",
                tee: longContent ? "Championship Tournament Tees" : "Gold",
                rating: 74.8,
                slope: 144,
                par: 72,
                holes: holes
            ),
            scores: scores,
            progress: MobileScoringProgress(
                currentHole: scorecardComplete ? 18 : 7,
                holesRemaining: scorecardComplete ? 0 : 12,
                scorecardComplete: scorecardComplete,
                statusText: final ? (genericResult ? "Team 1 7 UP through 18" : "\(resultTeam) win 3 & 2") : "\(resultTeam) 1 UP · Thru 6"
            ),
            permission: MobileScoringPermission(
                canScore: !readOnly,
                readOnly: readOnly,
                canFinalize: readyToFinalize,
                reason: final ? .matchFinalized : readOnly ? .matchLocked : nil
            ),
            snapshot: MobileScoringSnapshot(snapshotId: "fixture-snapshot-v1", revision: 9)
        )
    }

    private static func fixtureSides(longContent: Bool) -> [MobileScoringSide] {
        let canonicalAssets = ProcessInfo.processInfo.arguments.contains("--bagger-ui-test-scorecard-team-assets")
        return [
            MobileScoringSide(
                side: 1,
                teamId: canonicalAssets ? "PICKLES" : "fixture-team-green",
                name: canonicalAssets ? "The Pickles" : longContent ? "The Evergreen Pines Invitational Team" : "Pines",
                participants: [
                    participant(
                        id: "fixture-player-a",
                        name: longContent ? "Alexandria Montgomery-Wellington the Third" : "Alex Morgan",
                        slot: 1,
                        authenticated: true,
                        strokes: 1
                    ),
                    participant(
                        id: "fixture-player-b",
                        name: longContent ? "Christopher Bartholomew Kensington" : "Jordan Lee",
                        slot: 2,
                        authenticated: false,
                        strokes: 0
                    ),
                ]
            ),
            MobileScoringSide(
                side: 2,
                teamId: canonicalAssets ? "LIPPIT" : "fixture-team-gold",
                name: canonicalAssets ? "Lipp it and Rip it" : longContent ? "The Golden Coastal Dunes Invitational Team" : "Dunes",
                participants: [
                    participant(
                        id: "fixture-player-c",
                        name: longContent ? "Maximilian Theodore Rutherford-Smythe" : "Taylor Kim",
                        slot: 1,
                        authenticated: false,
                        strokes: 0
                    ),
                    participant(
                        id: "fixture-player-d",
                        name: longContent ? "Benjamin Alexander Worthington" : "Cameron Diaz",
                        slot: 2,
                        authenticated: false,
                        strokes: 1
                    ),
                ]
            ),
        ]
    }

    private static func participant(
        id: String,
        name: String,
        slot: Int,
        authenticated: Bool,
        strokes: Double
    ) -> MobileScoringParticipant {
        MobileScoringParticipant(
            playerId: id,
            displayName: name,
            slot: slot,
            isAuthenticatedPlayer: authenticated,
            handicapIndex: 8.4 + Double(slot),
            courseHandicap: 10 + Double(slot),
            playingHandicap: 8 + Double(slot),
            strokes: strokes
        )
    }

    private static func officialScore(
        holeNumber: Int,
        format: MobileScoringFormat
    ) -> MobileScoringHoleScore {
        let gross: MobileScoringGross
        let strokes: MobileScoringStrokes
        switch format {
        case .bestBall, .unknown:
            gross = MobileScoringGross(teamOne: [4, 5], teamTwo: [5, 4])
            strokes = MobileScoringStrokes(teamOne: [1, 0], teamTwo: [0, 1])
        case .scramble, .singles:
            gross = MobileScoringGross(teamOne: [4], teamTwo: [5])
            strokes = MobileScoringStrokes(teamOne: [1], teamTwo: [0])
        }
        return MobileScoringHoleScore(
            holeNumber: holeNumber,
            revision: holeNumber,
            gross: gross,
            strokes: strokes,
            net: MobileScoringNet(teamOne: 3, teamTwo: 5),
            winner: .teamOne,
            updatedAt: try! MobileTimestamp("2026-09-24T12:00:00.000Z")
        )
    }
}
#endif
