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
        matches: [MobileMatch],
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
        course: MobileMatchCourse? = MobileMatchCourse(
            courseId: "course-1",
            name: "Ocean Course",
            tee: "Blue"
        ),
        teeTime: MobileMatchTeeTime? = MobileMatchTeeTime(
            localTime: try! MobileLocalTime("09:30:00"),
            label: "9:30 AM",
            timeZone: "America/Chicago"
        )
    ) -> MobileMatch {
        let effectiveSide = involved ? (authenticatedSide ?? 1) : nil
        let teamOne = makeSide(side: 1, authenticatedSide: effectiveSide)
        let teamTwo = makeSide(side: 2, authenticatedSide: effectiveSide)
        let ownParticipants = effectiveSide == 1 ? teamOne.participants : effectiveSide == 2 ? teamTwo.participants : []
        let opponentParticipants = effectiveSide == 1 ? teamTwo.participants : effectiveSide == 2 ? teamOne.participants : []

        return MobileMatch(
            matchId: id,
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

    private func makeSide(side: Int, authenticatedSide: Int?) -> MobileMatchTeam {
        let authenticated = authenticatedSide == side
        return MobileMatchTeam(
            side: side,
            name: "Side \(side)",
            participants: [
                MobileMatchParticipant(
                    playerId: authenticated ? TestFixtures.participant.player.playerId : "side-\(side)-player",
                    displayName: authenticated ? TestFixtures.participant.player.displayName : "Side \(side) Player",
                    teamSide: side,
                    isAuthenticatedPlayer: authenticated
                ),
                MobileMatchParticipant(
                    playerId: "side-\(side)-partner",
                    displayName: "Side \(side) Partner",
                    teamSide: side,
                    isAuthenticatedPlayer: false
                ),
            ]
        )
    }
}
