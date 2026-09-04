import XCTest
@testable import BaggerInv

final class MatchesPresentationTests: XCTestCase {
    func testGroupsRoundsInCanonicalServerOrderAndDefaultsToCurrentRound() throws {
        let presentation = makePresentation(
            currentRound: 2,
            matches: [
                makeMatch(id: "round-three-first", round: 3),
                makeMatch(id: "round-one", round: 1),
                makeMatch(id: "round-three-second", round: 3),
                makeMatch(id: "round-two", round: 2),
            ]
        )

        XCTAssertEqual(presentation.availableRoundIDs, [.number(3), .number(1), .number(2)])
        XCTAssertEqual(
            presentation.round(withID: .number(3))?.matches.map(\.matchID),
            ["round-three-first", "round-three-second"]
        )
        XCTAssertEqual(presentation.defaultRoundID, .number(2))
        XCTAssertEqual(presentation.availability, .content)
    }

    func testMissingCurrentRoundChoosesNearestNumberThenCanonicalFirstOnTie() {
        let nearest = makePresentation(
            currentRound: 4,
            matches: [makeMatch(id: "one", round: 1), makeMatch(id: "five", round: 5)]
        )
        XCTAssertEqual(nearest.defaultRoundID, .number(5))

        let tied = makePresentation(
            currentRound: 4,
            matches: [makeMatch(id: "five", round: 5), makeMatch(id: "three", round: 3)]
        )
        XCTAssertEqual(tied.defaultRoundID, .number(5))

        let namedOnly = makePresentation(
            currentRound: nil,
            matches: [makeMatch(id: "named", round: nil, roundName: "Championship")]
        )
        XCTAssertEqual(namedOnly.defaultRoundID, .name("Championship"))
    }

    func testSelectionIsRetainedThenFallsBackToCurrentNearestOrFirst() {
        let presentation = makePresentation(
            currentRound: 2,
            matches: [
                makeMatch(id: "one", round: 1),
                makeMatch(id: "two", round: 2),
                makeMatch(id: "three", round: 3),
            ]
        )
        XCTAssertEqual(presentation.resolvedRoundID(preferred: .number(3)), .number(3))
        XCTAssertEqual(presentation.resolvedRoundID(preferred: .number(99)), .number(2))

        let noExactCurrent = makePresentation(
            currentRound: 5,
            matches: [makeMatch(id: "two", round: 2), makeMatch(id: "seven", round: 7)]
        )
        XCTAssertEqual(noExactCurrent.resolvedRoundID(preferred: .number(99)), .number(7))

        let noNumbers = makePresentation(
            currentRound: nil,
            matches: [
                makeMatch(id: "alpha", round: nil, roundName: "Alpha"),
                makeMatch(id: "omega", round: nil, roundName: "Omega"),
            ]
        )
        XCTAssertEqual(noNumbers.resolvedRoundID(preferred: .number(99)), .name("Alpha"))
    }

    func testYourMatchUsesCanonicalRelationshipAndFirstServerOrderedInvolvedMatch() throws {
        let unrelatedAuthenticatedFlag = makeMatch(
            id: "unrelated",
            round: 2,
            involved: false,
            authenticatedSide: nil
        )
        let first = makeMatch(id: "first-involved", round: 2, involved: true, authenticatedSide: 2)
        let second = makeMatch(id: "second-involved", round: 2, involved: true, authenticatedSide: 1)

        let presentation = makePresentation(
            currentRound: 2,
            matches: [unrelatedAuthenticatedFlag, first, second]
        )
        let round = try XCTUnwrap(presentation.round(withID: .number(2)))

        XCTAssertEqual(round.yourMatch?.matchID, "first-involved")
        XCTAssertTrue(round.hasMultipleInvolvedMatches)
        XCTAssertEqual(round.matches.map(\.matchID), ["unrelated", "first-involved", "second-involved"])
        XCTAssertEqual(round.yourMatch?.ownSide?.side, 2)
        XCTAssertEqual(round.yourMatch?.opponentSide?.side, 1)
    }

    func testStatusProgressAndTrustedFormatMappingsUseOnlyCanonicalFields() throws {
        let matches = [
            makeMatch(id: "scheduled", round: 1, status: .scheduled, format: "BB"),
            makeMatch(id: "live", round: 1, status: .inProgress, format: "SC", currentHole: 7),
            makeMatch(id: "final", round: 1, status: .completed, format: "SI", resultSummary: "Won 2 & 1"),
            makeMatch(id: "unknown", round: 1, status: .scheduled, format: "Alternate Shot"),
            makeMatch(id: "bad-hole", round: 1, status: .inProgress, format: nil, currentHole: 99),
        ]
        let round = try XCTUnwrap(makePresentation(currentRound: 1, matches: matches).rounds.first)

        XCTAssertEqual(round.matches.map(\.status), [.upcoming, .live, .final, .upcoming, .live])
        XCTAssertEqual(round.matches.map(\.formatText), ["Best Ball", "Scramble", "Singles", "Alternate Shot", nil])
        XCTAssertNil(round.matches[0].progressText)
        XCTAssertEqual(round.matches[1].progressText, "Through 7")
        XCTAssertEqual(round.matches[2].resultText, "Won 2 & 1")
        XCTAssertNil(round.matches[4].progressText)
    }

    func testRoundFormatModePromotesOnlyCompleteUniformCanonicalFormats() throws {
        let uniform = try XCTUnwrap(
            makePresentation(
                currentRound: 1,
                matches: [
                    makeMatch(id: "uniform-one", round: 1, format: "BB"),
                    makeMatch(id: "uniform-two", round: 1, format: "BB"),
                ]
            ).rounds.first
        )
        XCTAssertEqual(uniform.formatMode, .uniform("Best Ball"))
        XCTAssertEqual(uniform.contextTitle, "Round 1 · Best Ball")
        XCTAssertFalse(uniform.showsPerMatchFormat)

        let mixed = try XCTUnwrap(
            makePresentation(
                currentRound: 1,
                matches: [
                    makeMatch(id: "mixed-one", round: 1, format: "BB"),
                    makeMatch(id: "mixed-two", round: 1, format: "SC"),
                ]
            ).rounds.first
        )
        XCTAssertEqual(mixed.formatMode, .mixed)
        XCTAssertEqual(mixed.contextTitle, "Round 1")
        XCTAssertTrue(mixed.showsPerMatchFormat)

        let incomplete = try XCTUnwrap(
            makePresentation(
                currentRound: 1,
                matches: [
                    makeMatch(id: "known", round: 1, format: "BB"),
                    makeMatch(id: "missing", round: 1, format: nil),
                ]
            ).rounds.first
        )
        XCTAssertEqual(incomplete.formatMode, .mixed)
        XCTAssertTrue(incomplete.showsPerMatchFormat)

        let unavailable = try XCTUnwrap(
            makePresentation(
                currentRound: 1,
                matches: [
                    makeMatch(id: "missing-one", round: 1, format: nil),
                    makeMatch(id: "missing-two", round: 1, format: nil),
                ]
            ).rounds.first
        )
        XCTAssertEqual(unavailable.formatMode, .unavailable)
        XCTAssertEqual(unavailable.contextTitle, "Round 1")
        XCTAssertFalse(unavailable.showsPerMatchFormat)
    }

    func testRoundContextDoesNotRepeatFormatAlreadyPresentInCanonicalTitle() throws {
        let round = try XCTUnwrap(
            makePresentation(
                currentRound: 3,
                matches: [makeMatch(id: "singles", round: 3, roundName: "Singles", format: "SI")]
            ).rounds.first
        )

        XCTAssertEqual(round.title, "Round 3 · Singles")
        XCTAssertEqual(round.formatMode, .uniform("Singles"))
        XCTAssertEqual(round.contextTitle, "Round 3 · Singles")
    }

    func testCanonicalCourseTeamIDsAndDisplayMatchNumberPassThroughWithoutNameMatching() throws {
        let presentation = makePresentation(
            currentRound: 2,
            matches: [
                makeMatch(
                    id: "owned",
                    round: 2,
                    involved: true,
                    authenticatedSide: 2,
                    displayMatchNumber: "17A",
                    sideOneTeamID: "PICKLES",
                    sideTwoTeamID: "LIPPIT"
                ),
                makeMatch(
                    id: "uninvolved",
                    round: 2,
                    sideOneTeamID: "PICKLES",
                    sideTwoTeamID: "LIPPIT"
                ),
            ]
        )
        let owned = try XCTUnwrap(presentation.match(withID: "owned"))
        let uninvolved = try XCTUnwrap(presentation.match(withID: "uninvolved"))

        XCTAssertEqual(owned.displayMatchNumber, "17A")
        XCTAssertEqual(owned.courseID, "course-1")
        XCTAssertEqual(owned.teams.map(\.teamID), ["PICKLES", "LIPPIT"])
        XCTAssertEqual(uninvolved.teams.map(\.teamID), ["PICKLES", "LIPPIT"])
    }

    func testBestBallAndSinglesUseParticipantPlayingHandicapAndStrokeSemantics() throws {
        let round = try XCTUnwrap(
            makePresentation(
                currentRound: 1,
                matches: [
                    makeMatch(id: "bb", round: 1, format: "Best Ball"),
                    makeMatch(id: "si", round: 1, format: "Singles"),
                ]
            ).rounds.first
        )

        for match in round.matches {
            XCTAssertNil(match.teams[0].golfContext)
            XCTAssertEqual(match.teams[0].participants[0].golfContext?.compactText, "HCP 7.5 · No strokes")
            XCTAssertEqual(match.teams[0].participants[1].golfContext?.compactText, "HCP 11.0 · +4 strokes")
            XCTAssertEqual(match.teams[1].participants[0].golfContext?.compactText, "HCP 5.5 · No strokes")
            XCTAssertEqual(match.teams[1].participants[1].golfContext?.compactText, "HCP 12.0 · +2 strokes")
        }
    }

    func testScrambleUsesOnlySideLevelTeamPlayingHandicapAndTeamStrokes() throws {
        let match = try XCTUnwrap(
            makePresentation(
                currentRound: 2,
                matches: [makeMatch(id: "sc", round: 2, format: "Scramble")]
            ).match(withID: "sc")
        )

        XCTAssertTrue(match.teams.flatMap(\.participants).allSatisfy { $0.golfContext == nil })
        XCTAssertEqual(match.teams[0].golfContext?.compactText, "Team HCP 3.5 · No strokes")
        XCTAssertEqual(match.teams[1].golfContext?.compactText, "Team HCP 4.3 · +2 strokes")
        XCTAssertEqual(
            match.teams[0].golfContext?.accessibilityText,
            "Team Playing Handicap 3.5, No team strokes"
        )
        XCTAssertEqual(
            match.teams[1].golfContext?.accessibilityText,
            "Team Playing Handicap 4.3, 2 team strokes"
        )
    }

    func testPreservesCanonicalServerOrderWithoutLexicographicDisplayNumberSorting() throws {
        var matches: [MobileMatchesMatch] = []
        for number in 1...12 {
            let match = makeMatch(
                id: "singles-\(number)",
                round: 3,
                format: "Singles",
                involved: number == 7,
                authenticatedSide: number == 7 ? 1 : nil,
                displayMatchNumber: String(number)
            )
            matches.append(match)
        }
        let presentation = makePresentation(currentRound: 3, matches: matches)
        let round = try XCTUnwrap(presentation.round(withID: .number(3)))
        let expectedNumbers = (1...12).map { String($0) }
        let expectedIDs = (1...12).map { "singles-\($0)" }
        let presentedNumbers = round.matches.map { $0.displayMatchNumber }
        let presentedIDs = round.matches.map { $0.matchID }
        let authenticatedIndex = round.matches.firstIndex { $0.authenticatedPlayerInvolved }

        XCTAssertEqual(presentedNumbers, expectedNumbers.map(Optional.some))
        XCTAssertEqual(presentedIDs, expectedIDs)
        XCTAssertEqual(authenticatedIndex, 6)
        XCTAssertEqual(round.yourMatch?.matchID, "singles-7")
    }

    func testGolfContextPreservesNullAndFormatsCanonicalNegativeAndLongDecimals() throws {
        let match = try XCTUnwrap(
            makePresentation(
                currentRound: 3,
                matches: [
                    makeMatch(
                        id: "precision",
                        round: 3,
                        format: "SI",
                        participantHandicaps: [[-0.5, 12.34567], [nil, 0]],
                        participantStrokes: [[0, 1], [nil, 0]]
                    ),
                ]
            ).match(withID: "precision")
        )

        XCTAssertEqual(match.teams[0].participants[0].golfContext?.compactText, "HCP (0.5) · No strokes")
        XCTAssertEqual(match.teams[0].participants[1].golfContext?.compactText, "HCP 12.3 · +1 stroke")
        XCTAssertNil(match.teams[1].participants[0].golfContext)
        XCTAssertEqual(match.teams[1].participants[1].golfContext?.compactText, "HCP 0.0 · No strokes")
    }

    func testResultFallbackFormatsOnlyCanonicalPointsAndOptionalDetailIsNullSafe() throws {
        let pointsOnly = makeMatch(
            id: "points",
            round: 1,
            status: .completed,
            resultSummary: nil,
            winner: "teamOne",
            teamOnePoints: 1.5,
            teamTwoPoints: 0.5
        )
        let noOptionalDetail = makeMatch(
            id: "null-safe",
            round: 1,
            status: .scheduled,
            course: nil,
            teeTime: nil
        )
        let round = try XCTUnwrap(
            makePresentation(currentRound: 1, matches: [pointsOnly, noOptionalDetail]).rounds.first
        )

        XCTAssertEqual(round.matches[0].resultText, "1½ – ½")
        XCTAssertEqual(round.matches[0].resultWinner, "teamOne")
        XCTAssertEqual(round.matches[0].teamOnePointsText, "1½")
        XCTAssertEqual(round.matches[0].teamTwoPointsText, "½")
        XCTAssertNil(round.matches[1].courseName)
        XCTAssertNil(round.matches[1].tee)
        XCTAssertNil(round.matches[1].teeTimeLabel)
        XCTAssertNil(round.matches[1].courseAndTeeText)
        XCTAssertNil(round.matches[1].resultText)
    }

    func testWinnerOnlyResultUsesCanonicalWinnerWithoutInventingPoints() throws {
        let teamWinner = makeMatch(
            id: "team-winner",
            round: 1,
            status: .completed,
            resultSummary: nil,
            winner: "teamTwo"
        )
        let canonicalWinner = makeMatch(
            id: "canonical-winner",
            round: 1,
            status: .completed,
            resultSummary: nil,
            winner: "Rippers"
        )
        let halved = makeMatch(
            id: "halved",
            round: 1,
            status: .completed,
            resultSummary: nil,
            winner: "halved"
        )
        let round = try XCTUnwrap(
            makePresentation(
                currentRound: 1,
                matches: [teamWinner, canonicalWinner, halved]
            ).rounds.first
        )

        XCTAssertEqual(round.matches[0].resultText, "Side 2 wins")
        XCTAssertEqual(round.matches[1].resultText, "Rippers")
        XCTAssertEqual(round.matches[2].resultText, "Halved")
    }

    func testTeamAndParticipantOrderAndAuthenticatedEmphasisArePreserved() throws {
        let match = makeMatch(id: "sides", round: 2, involved: true, authenticatedSide: 1)
        let presented = try XCTUnwrap(
            makePresentation(currentRound: 2, matches: [match]).match(withID: "sides")
        )

        XCTAssertEqual(presented.teams.map(\.side), [1, 2])
        XCTAssertEqual(presented.teams[0].participants.map(\.displayName), ["Preview Golfer", "Side 1 Partner"])
        XCTAssertTrue(presented.teams[0].participants[0].isAuthenticatedPlayer)
        XCTAssertFalse(presented.teams[1].participants.contains(where: \.isAuthenticatedPlayer))
    }

    func testTypedDestinationLooksUpCanonicalOpaqueMatchIDAndMissingIDFailsSafely() throws {
        let opaqueID = "match:round/2#opaque"
        let presentation = makePresentation(
            currentRound: 2,
            matches: [makeMatch(id: opaqueID, round: 2)]
        )

        XCTAssertEqual(
            presentation.match(for: .match(matchID: opaqueID))?.matchID,
            opaqueID
        )
        XCTAssertNil(presentation.match(for: .match(matchID: "missing")))
        XCTAssertNil(presentation.round(withID: .number(99)))
    }

    func testFreshnessAndAvailabilityPreserveCachedOfflineAndNoCacheStates() {
        let cached = makePresentation(
            currentRound: 1,
            matches: [makeMatch(id: "cached", round: 1)],
            source: .diskCache,
            freshness: .refreshing,
            isRefreshing: true
        )
        XCTAssertEqual(cached.availability, .content)
        XCTAssertEqual(cached.freshness, .refreshing)
        XCTAssertEqual(cached.freshnessBanner?.kind, .cached)
        XCTAssertTrue(cached.isRefreshing)
        XCTAssertTrue(cached.revisionIsPresent)

        let offline = makePresentation(
            currentRound: 1,
            matches: [makeMatch(id: "offline", round: 1)],
            source: .diskCache,
            freshness: .offline
        )
        XCTAssertEqual(offline.freshness, .offline)
        XCTAssertEqual(offline.freshnessBanner?.kind, .offline)

        let empty = makePresentation(currentRound: 1, matches: [])
        XCTAssertEqual(empty.availability, .empty)
        XCTAssertNil(empty.defaultRoundID)

        let unavailable = MatchesPresenter.make(
            participant: TestFixtures.participant,
            state: state(value: nil, source: nil, freshness: .offline)
        )
        XCTAssertEqual(unavailable.availability, .unavailable)
        XCTAssertTrue(unavailable.rounds.isEmpty)
        XCTAssertNil(unavailable.freshness)
        XCTAssertEqual(unavailable.tournamentID, TestFixtures.participant.tournament.tournamentId)
    }

    func testRoundTitleUsesCanonicalNumberAndNameWithoutDuplicateCopy() throws {
        let presentation = makePresentation(
            currentRound: 2,
            matches: [
                makeMatch(id: "duplicate", round: 2, roundName: "Round 2"),
                makeMatch(id: "named", round: nil, roundName: "Championship"),
                makeMatch(id: "combined", round: 4, roundName: "Singles Finale"),
                makeMatch(id: "unspecified", round: nil, roundName: nil),
            ]
        )

        XCTAssertEqual(presentation.rounds.map(\.title), [
            "Round 2",
            "Championship",
            "Round 4 · Singles Finale",
            "Round",
        ])
    }

    private func makePresentation(
        currentRound: Int?,
        matches: [MobileMatchesMatch],
        source: MobileReadSource? = .network,
        freshness: MobileReadFreshness = .fresh,
        isRefreshing: Bool = false
    ) -> MatchesPresentation {
        let tournament = MobileReadTournament(
            tournamentId: TestFixtures.participant.tournament.tournamentId,
            name: TestFixtures.participant.tournament.name,
            year: TestFixtures.participant.tournament.year,
            status: "Live",
            currentRound: currentRound,
            timeZone: "America/Chicago"
        )
        return MatchesPresenter.make(
            participant: TestFixtures.participant,
            state: state(
                value: MobileMatchesData(tournament: tournament, matches: matches),
                source: source,
                freshness: freshness,
                isRefreshing: isRefreshing
            )
        )
    }

    private func state(
        value: MobileMatchesData?,
        source: MobileReadSource?,
        freshness: MobileReadFreshness,
        isRefreshing: Bool = false
    ) -> MobileReadState<MobileMatchesData> {
        MobileReadState(
            value: value,
            source: source,
            freshness: freshness,
            isRefreshing: isRefreshing,
            revision: value == nil ? nil : "matches-presentation-revision",
            generatedAt: value == nil ? nil : TestFixtures.readMeta.generatedAt,
            fetchedAt: value == nil ? nil : TestFixtures.now,
            validatedAt: value == nil ? nil : TestFixtures.now,
            lastSafeError: freshness == .offline || freshness == .failed ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: nil,
            cachePersistenceIssue: false
        )
    }

    private func makeMatch(
        id: String,
        round: Int?,
        roundName: String? = nil,
        status: MobileMatchStatus = .scheduled,
        format: String? = "BB",
        involved: Bool = false,
        authenticatedSide: Int? = nil,
        currentHole: Int? = nil,
        resultSummary: String? = nil,
        winner: String? = nil,
        teamOnePoints: Double? = nil,
        teamTwoPoints: Double? = nil,
        displayMatchNumber: String? = "1",
        course: MobileMatchCourse? = MobileMatchCourse(
            courseId: "course-1",
            name: "Ocean Course",
            tee: "Blue"
        ),
        teeTime: MobileMatchTeeTime? = MobileMatchTeeTime(
            localTime: try! MobileLocalTime("09:30:00"),
            label: "9:30 AM",
            timeZone: "America/Chicago"
        ),
        sideOneTeamID: String = "team-one",
        sideTwoTeamID: String = "team-two",
        participantHandicaps: [[Double?]]? = nil,
        participantStrokes: [[Int?]]? = nil,
        teamHandicaps: [Double?]? = nil,
        teamStrokes: [Int?]? = nil
    ) -> MobileMatchesMatch {
        let effectiveSide = involved ? (authenticatedSide ?? 1) : nil
        let contexts = golfContexts(
            format: format,
            participantHandicaps: participantHandicaps,
            participantStrokes: participantStrokes,
            teamHandicaps: teamHandicaps,
            teamStrokes: teamStrokes
        )
        let teamOne = makeSide(
            side: 1,
            teamID: sideOneTeamID,
            authenticatedSide: effectiveSide,
            participantHandicaps: contexts.participantHandicaps[0],
            participantStrokes: contexts.participantStrokes[0],
            teamHandicap: contexts.teamHandicaps[0],
            teamStrokes: contexts.teamStrokes[0]
        )
        let teamTwo = makeSide(
            side: 2,
            teamID: sideTwoTeamID,
            authenticatedSide: effectiveSide,
            participantHandicaps: contexts.participantHandicaps[1],
            participantStrokes: contexts.participantStrokes[1],
            teamHandicap: contexts.teamHandicaps[1],
            teamStrokes: contexts.teamStrokes[1]
        )
        let ownParticipants = effectiveSide == 1 ? teamOne.participants : effectiveSide == 2 ? teamTwo.participants : []
        let opponentParticipants = effectiveSide == 1 ? teamTwo.participants : effectiveSide == 2 ? teamOne.participants : []

        return MobileMatchesMatch(
            matchId: id,
            displayMatchNumber: displayMatchNumber,
            round: MobileMatchRound(
                roundNumber: round,
                name: roundName ?? round.map { "Round \($0)" },
                format: format
            ),
            status: status,
            course: course,
            teeTime: teeTime,
            teams: [teamOne, teamTwo],
            authenticatedPlayer: MobileAuthenticatedPlayerRelationship(
                involved: involved,
                teamSide: effectiveSide,
                partnerPlayerIds: ownParticipants.filter { !$0.isAuthenticatedPlayer }.map(\.playerId),
                opponentPlayerIds: opponentParticipants.map(\.playerId)
            ),
            progress: status == .inProgress ? MobileMatchProgress(currentHole: currentHole) : nil,
            result: status == .completed ? MobileMatchResult(
                summary: resultSummary,
                winner: winner,
                teamOnePoints: teamOnePoints,
                teamTwoPoints: teamTwoPoints
            ) : nil
        )
    }

    private func makeSide(
        side: Int,
        teamID: String,
        authenticatedSide: Int?,
        participantHandicaps: [Double?],
        participantStrokes: [Int?],
        teamHandicap: Double?,
        teamStrokes: Int?
    ) -> MobileMatchesTeam {
        let authenticated = authenticatedSide == side
        return MobileMatchesTeam(
            side: side,
            teamId: teamID,
            name: "Side \(side)",
            playingHandicap: teamHandicap,
            strokesReceived: teamStrokes,
            participants: [
                MobileMatchesParticipant(
                    playerId: authenticated ? TestFixtures.participant.player.playerId : "side-\(side)-player",
                    displayName: authenticated ? TestFixtures.participant.player.displayName : "Side \(side) Player",
                    teamSide: side,
                    isAuthenticatedPlayer: authenticated,
                    playingHandicap: participantHandicaps[0],
                    strokesReceived: participantStrokes[0]
                ),
                MobileMatchesParticipant(
                    playerId: "side-\(side)-partner",
                    displayName: "Side \(side) Partner",
                    teamSide: side,
                    isAuthenticatedPlayer: false,
                    playingHandicap: participantHandicaps[1],
                    strokesReceived: participantStrokes[1]
                ),
            ]
        )
    }

    private func golfContexts(
        format: String?,
        participantHandicaps: [[Double?]]?,
        participantStrokes: [[Int?]]?,
        teamHandicaps: [Double?]?,
        teamStrokes: [Int?]?
    ) -> (
        participantHandicaps: [[Double?]],
        participantStrokes: [[Int?]],
        teamHandicaps: [Double?],
        teamStrokes: [Int?]
    ) {
        let participantDefaults: [[Double?]] = format == nil
            ? [[nil, nil], [nil, nil]]
            : [[7.5, 11], [5.5, 12]]
        let participantStrokeDefaults: [[Int?]]
        let teamHandicapDefaults: [Double?]
        let teamStrokeDefaults: [Int?]
        switch format?.uppercased() {
        case "BB", "BEST BALL", "SI", "SINGLES":
            participantStrokeDefaults = [[0, 4], [0, 2]]
            teamHandicapDefaults = [nil, nil]
            teamStrokeDefaults = [nil, nil]
        case "SC", "SCRAMBLE":
            participantStrokeDefaults = [[nil, nil], [nil, nil]]
            teamHandicapDefaults = [3.5, 4.25]
            teamStrokeDefaults = [0, 2]
        default:
            participantStrokeDefaults = [[nil, nil], [nil, nil]]
            teamHandicapDefaults = [nil, nil]
            teamStrokeDefaults = [nil, nil]
        }
        return (
            participantHandicaps ?? participantDefaults,
            participantStrokes ?? participantStrokeDefaults,
            teamHandicaps ?? teamHandicapDefaults,
            teamStrokes ?? teamStrokeDefaults
        )
    }
}
