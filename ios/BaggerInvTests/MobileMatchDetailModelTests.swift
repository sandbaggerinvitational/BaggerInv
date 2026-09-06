import Foundation
import XCTest
@testable import BaggerInv

final class MobileMatchDetailModelTests: XCTestCase {
    func testOpaqueMatchIDsDecodeAndBindWithoutParsingOrNormalization() throws {
        for matchID in OpaqueMatchIDFixtures.validIDs {
            let response = MatchDetailFixtureFactory.response(matchID: matchID)
            let decoded = try JSONDecoder().decode(MobileMatchDetailResponse.self, from: JSONEncoder().encode(response))
            XCTAssertTrue(decoded.isReadContractCompatible)
            XCTAssertEqual(Data(decoded.data.match.matchId.utf8), Data(matchID.utf8))
            XCTAssertTrue(decoded.data.match.isCompatible(
                expectedMatchId: matchID,
                expectedPlayerId: MatchDetailFixtureFactory.playerOneID
            ))
        }
    }

    func testOpaqueMatchIDSchemaBoundsReject201ScalarsDespiteSingleGrapheme() {
        XCTAssertTrue(MatchDetailFixtureFactory.response(matchID: String(repeating: "🏌", count: 200)).isReadContractCompatible)
        XCTAssertFalse(MatchDetailFixtureFactory.response(matchID: "").isReadContractCompatible)
        XCTAssertFalse(MatchDetailFixtureFactory.response(
            matchID: "e" + String(repeating: "\u{301}", count: 200)
        ).isReadContractCompatible)
    }

    func testCanonicalOpaqueIDExclusionsFailDetailAndNavigationValidation() throws {
        for matchID in OpaqueMatchIDFixtures.invalidIDs {
            XCTAssertFalse(MobileOpaqueMatchID.isValid(matchID))
            let response = MatchDetailFixtureFactory.response(matchID: matchID)
            let decoded = try JSONDecoder().decode(MobileMatchDetailResponse.self, from: JSONEncoder().encode(response))
            XCTAssertFalse(decoded.isReadContractCompatible)
            for field in ["previousMatchId", "nextMatchId", "myMatchId"] {
                var object = try MatchDetailFixtureFactory.jsonObject(from: MatchDetailFixtureFactory.response())
                var data = try XCTUnwrap(object["data"] as? [String: Any])
                var match = try XCTUnwrap(data["match"] as? [String: Any])
                var navigation = try XCTUnwrap(match["navigation"] as? [String: Any])
                navigation[field] = matchID
                match["navigation"] = navigation
                data["match"] = match
                object["data"] = data
                let invalid = try JSONDecoder().decode(MobileMatchDetailResponse.self,
                    from: JSONSerialization.data(withJSONObject: object))
                XCTAssertFalse(invalid.isReadContractCompatible)
            }
        }
    }

    func testMalformedJSONSurrogatesCannotBecomeRepairedMatchDetailIDs() throws {
        let data = try JSONEncoder().encode(MatchDetailFixtureFactory.response(matchID: "opaque-sentinel"))
        let json = String(decoding: data, as: UTF8.self)
        for escapes in OpaqueMatchIDFixtures.malformedJSONSurrogateEscapes {
            let invalidJSON = json.replacingOccurrences(of: "opaque-sentinel", with: escapes)
            XCTAssertThrowsError(try JSONDecoder().decode(MobileMatchDetailResponse.self, from: Data(invalidJSON.utf8)))
        }
    }

    func testValidJSONSurrogatePairsCountAsOneScalarEachWithoutNormalization() throws {
        let data = try JSONEncoder().encode(MatchDetailFixtureFactory.response(matchID: "opaque-sentinel"))
        let json = String(decoding: data, as: UTF8.self).replacingOccurrences(
            of: "opaque-sentinel", with: String(repeating: #"\uD83C\uDFCC"#, count: 200)
        )
        let decoded = try JSONDecoder().decode(MobileMatchDetailResponse.self, from: Data(json.utf8))
        XCTAssertTrue(decoded.isReadContractCompatible)
        XCTAssertEqual(decoded.data.match.matchId.unicodeScalars.count, 200)
        XCTAssertEqual(decoded.data.match.matchId.utf16.count, 400)
        XCTAssertEqual(Data(decoded.data.match.matchId.utf8), Data(String(repeating: "🏌", count: 200).utf8))
    }

    func testMatchBindingRejectsNormalizationEquivalentButDifferentID() {
        let match = MatchDetailFixtureFactory.response(matchID: "café").data.match
        XCTAssertTrue(match.isCompatible(
            expectedMatchId: "café",
            expectedPlayerId: MatchDetailFixtureFactory.playerOneID
        ))
        XCTAssertFalse(match.isCompatible(
            expectedMatchId: "cafe\u{301}",
            expectedPlayerId: MatchDetailFixtureFactory.playerOneID
        ))
    }

    func testOpaqueNavigationIDsRetainExactCanonicalNeighborAndOwnedBindings() {
        let navigation = MobileMatchDetailNavigation(
            roundMatchIndex: 2,
            roundMatchCount: 3,
            previousMatchId: "match:round/2#previous",
            nextMatchId: "match with reserved characters ?%&+",
            myMatchId: "match:round/2#opaque",
            isMyMatch: true
        )
        XCTAssertTrue(navigation.isStructurallyCompatible(matchId: "match:round/2#opaque", participantInvolved: true))
        let distinctSpellings = MobileMatchDetailNavigation(
            roundMatchIndex: 2,
            roundMatchCount: 3,
            previousMatchId: "cafe\u{301}",
            nextMatchId: "match:round/2#next",
            myMatchId: "café",
            isMyMatch: true
        )
        XCTAssertTrue(distinctSpellings.isStructurallyCompatible(matchId: "café", participantInvolved: true))
        XCTAssertFalse(distinctSpellings.isStructurallyCompatible(matchId: "cafe\u{301}", participantInvolved: true))
    }

    func testBestBallDecodesStrictLifecycleAndPreservesNullVersusZero() throws {
        let response = MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        let data = try JSONEncoder().encode(response)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let responseData = try XCTUnwrap(object["data"] as? [String: Any])
        let match = try XCTUnwrap(responseData["match"] as? [String: Any])
        let teams = try XCTUnwrap(match["teams"] as? [[String: Any]])
        let participants = try XCTUnwrap(teams.first?["participants"] as? [[String: Any]])

        XCTAssertTrue(match["course"] is [String: Any])
        XCTAssertTrue(match["result"] is NSNull)
        XCTAssertEqual(participants.first?["strokesReceived"] as? Int, 0)

        let decoded = try JSONDecoder().decode(MobileMatchDetailResponse.self, from: data)
        XCTAssertTrue(decoded.isReadContractCompatible)
        XCTAssertEqual(decoded.data.match.round.format, .bestBall)
        XCTAssertEqual(decoded.data.match.scorecard.holes.count, 18)
        XCTAssertEqual(decoded.data.match.teams[0].participants[0].strokesReceived, 0)
        XCTAssertNil(decoded.data.match.result)
        XCTAssertNil(decoded.data.match.scorecard.confirmedAt)
    }

    func testRequiredNullableMemberCannotBeOmitted() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        )
        var dataObject = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(dataObject["match"] as? [String: Any])
        match.removeValue(forKey: "course")
        dataObject["match"] = match
        object["data"] = dataObject

        XCTAssertThrowsError(
            try JSONDecoder().decode(
                MobileMatchDetailResponse.self,
                from: JSONSerialization.data(withJSONObject: object)
            )
        )
    }

    func testBestBallUsesTwoCanonicalPlayerScoresPerSide() {
        let match = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .inProgress,
            holesPlayed: 7
        ).data.match

        XCTAssertTrue(match.isStructurallyCompatible)
        XCTAssertEqual(match.teams.map(\.participants.count), [2, 2])
        for hole in match.scorecard.holes {
            XCTAssertEqual(hole.sideOne.scope, .players)
            XCTAssertEqual(hole.sideTwo.scope, .players)
            XCTAssertEqual(hole.sideOne.playerScores.count, 2)
            XCTAssertEqual(hole.sideTwo.playerScores.count, 2)
            XCTAssertNil(hole.sideOne.teamScore)
            XCTAssertNil(hole.sideTwo.teamScore)
        }
    }

    func testScrambleUsesCanonicalTeamHandicapAndTeamScoreScope() {
        let match = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .inProgress,
            holesPlayed: 9
        ).data.match

        XCTAssertTrue(match.isStructurallyCompatible)
        XCTAssertEqual(match.teams[0].playingHandicap, 3.25)
        XCTAssertEqual(match.teams[0].strokesReceived, 0)
        XCTAssertEqual(match.teams[1].playingHandicap, 1.0)
        XCTAssertEqual(match.teams[1].strokesReceived, 2)
        XCTAssertTrue(match.teams.flatMap(\.participants).allSatisfy { $0.strokesReceived == nil })
        for hole in match.scorecard.holes {
            XCTAssertEqual(hole.sideOne.scope, .team)
            XCTAssertEqual(hole.sideTwo.scope, .team)
            XCTAssertTrue(hole.sideOne.playerScores.isEmpty)
            XCTAssertTrue(hole.sideTwo.playerScores.isEmpty)
        }
    }

    func testSinglesUsesOneCanonicalPlayerScorePerSide() {
        let match = MatchDetailFixtureFactory.response(
            format: .singles,
            status: .inProgress,
            holesPlayed: 5
        ).data.match

        XCTAssertTrue(match.isStructurallyCompatible)
        XCTAssertEqual(match.teams.map(\.participants.count), [1, 1])
        XCTAssertTrue(match.teams.allSatisfy { $0.playingHandicap == nil && $0.strokesReceived == nil })
        XCTAssertTrue(match.scorecard.holes.allSatisfy {
            $0.sideOne.scope == .players &&
            $0.sideTwo.scope == .players &&
            $0.sideOne.playerScores.count == 1 &&
            $0.sideTwo.playerScores.count == 1
        })
    }

    func testScheduledInProgressAndCompletedLifecycleRepresentationsAreCompatible() {
        let scheduled = MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        let inProgress = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .inProgress,
            holesPlayed: 8
        )
        let completed = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .completed,
            holesPlayed: 18
        )

        XCTAssertTrue(scheduled.isReadContractCompatible)
        XCTAssertTrue(inProgress.isReadContractCompatible)
        XCTAssertTrue(completed.isReadContractCompatible)
        XCTAssertEqual(scheduled.data.match.scorecard.state, .unavailable)
        XCTAssertEqual(inProgress.data.match.scorecard.state, .inProgress)
        XCTAssertEqual(completed.data.match.scorecard.state, .confirmed)
        XCTAssertEqual(completed.data.match.scorecard.holes.count, 18)
        XCTAssertNotNil(completed.data.match.scorecard.confirmedAt)
    }

    func testLiveCompleteScorecardCanRetainEarlyClinchWhileConfirmationIsPending() {
        let response = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .inProgress,
            holesPlayed: 18,
            clinchHole: 13,
            scorecardComplete: true
        )
        let match = response.data.match

        XCTAssertTrue(response.isReadContractCompatible)
        XCTAssertEqual(match.status, .inProgress)
        XCTAssertEqual(match.scorecard.state, .inProgress)
        XCTAssertTrue(match.scorecard.complete)
        XCTAssertNil(match.scorecard.confirmedAt)
        XCTAssertNil(match.freshness.confirmedAt)
        XCTAssertEqual(match.clinch?.holeNumber, 13)
        XCTAssertEqual(match.flow.overall.status, .final)
        XCTAssertFalse(
            response.data.revocableParticipantRepresentationKeys.contains(
                "confirmed-scorecard:\(match.matchId)"
            )
        )
    }

    func testLifecycleMismatchFailsStructuralContract() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        )
        var dataObject = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(dataObject["match"] as? [String: Any])
        match["status"] = "completed"
        dataObject["match"] = match
        object["data"] = dataObject

        let decoded = try JSONDecoder().decode(
            MobileMatchDetailResponse.self,
            from: JSONSerialization.data(withJSONObject: object)
        )
        XCTAssertFalse(decoded.isReadContractCompatible)
    }

    func testNavigationPreservesCanonicalRoundNeighborsAndMyMatch() {
        let match = MatchDetailFixtureFactory.response(
            format: .singles,
            status: .scheduled,
            matchID: "round-3-match-10"
        ).data.match

        XCTAssertEqual(match.navigation.roundMatchIndex, 2)
        XCTAssertEqual(match.navigation.roundMatchCount, 3)
        XCTAssertEqual(match.navigation.previousMatchId, "match-prev")
        XCTAssertEqual(match.navigation.nextMatchId, "match-next")
        XCTAssertEqual(match.navigation.myMatchId, "round-3-match-10")
        XCTAssertTrue(match.navigation.isMyMatch)
        XCTAssertTrue(match.isCompatible(
            expectedMatchId: "round-3-match-10",
            expectedPlayerId: MatchDetailFixtureFactory.playerOneID
        ))
        XCTAssertFalse(match.isCompatible(
            expectedMatchId: "round-3-match-11",
            expectedPlayerId: MatchDetailFixtureFactory.playerOneID
        ))
    }

    func testInvalidNavigationCannotBecomeCanonical() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(format: .singles, status: .scheduled)
        )
        var dataObject = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(dataObject["match"] as? [String: Any])
        var navigation = try XCTUnwrap(match["navigation"] as? [String: Any])
        navigation["previousMatchId"] = match["matchId"]
        match["navigation"] = navigation
        dataObject["match"] = match
        object["data"] = dataObject

        let decoded = try JSONDecoder().decode(
            MobileMatchDetailResponse.self,
            from: JSONSerialization.data(withJSONObject: object)
        )
        XCTAssertFalse(decoded.isReadContractCompatible)
    }

    func testCompletedEarlyClinchAndRevocableOfficialFactsAreBounded() {
        let response = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .completed,
            holesPlayed: 13,
            clinchHole: 13
        )
        let match = response.data.match

        XCTAssertTrue(response.isReadContractCompatible)
        XCTAssertEqual(match.clinch?.holeNumber, 13)
        XCTAssertEqual(match.clinch?.winnerSide, 1)
        XCTAssertEqual(match.clinch?.winnerTeamId, MatchDetailFixtureFactory.teamOneID)
        XCTAssertEqual(match.stats.holesPlayed, 13)
        XCTAssertEqual(match.stats.holesRemaining, 5)
        XCTAssertTrue(response.data.revocableParticipantRepresentationKeys.contains("result:\(match.matchId)"))
        XCTAssertTrue(response.data.revocableParticipantRepresentationKeys.contains("clinch:\(match.matchId)"))
        XCTAssertTrue(response.data.revocableParticipantRepresentationKeys.contains("confirmed-scorecard:\(match.matchId)"))
        XCTAssertEqual(
            response.data.revocableParticipantRepresentationKeys.filter { $0.hasPrefix("official-hole:") }.count,
            13
        )
    }

    func testScorecardRequiresExactlyOrderedEighteenHoles() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(
                format: .singles,
                status: .completed,
                holesPlayed: 18
            )
        )
        var dataObject = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(dataObject["match"] as? [String: Any])
        var scorecard = try XCTUnwrap(match["scorecard"] as? [String: Any])
        var holes = try XCTUnwrap(scorecard["holes"] as? [[String: Any]])
        holes.swapAt(0, 1)
        scorecard["holes"] = holes
        match["scorecard"] = scorecard
        dataObject["match"] = match
        object["data"] = dataObject

        let decoded = try JSONDecoder().decode(
            MobileMatchDetailResponse.self,
            from: JSONSerialization.data(withJSONObject: object)
        )
        XCTAssertEqual(decoded.data.match.scorecard.holes.count, 18)
        XCTAssertFalse(decoded.isReadContractCompatible)
    }

    func testAuthenticatedPlayerCompatibilityRejectsWrongCanonicalPlayer() {
        let match = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .inProgress,
            holesPlayed: 4
        ).data.match

        XCTAssertTrue(match.isCompatible(
            expectedMatchId: match.matchId,
            expectedPlayerId: MatchDetailFixtureFactory.playerOneID
        ))
        XCTAssertFalse(match.isCompatible(expectedMatchId: match.matchId, expectedPlayerId: "other-player"))
    }

    func testUnknownFormatDecodesButFailsClosed() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        )
        var dataObject = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(dataObject["match"] as? [String: Any])
        var round = try XCTUnwrap(match["round"] as? [String: Any])
        round["format"] = "FUTURE_FORMAT"
        match["round"] = round
        dataObject["match"] = match
        object["data"] = dataObject

        let decoded = try JSONDecoder().decode(
            MobileMatchDetailResponse.self,
            from: JSONSerialization.data(withJSONObject: object)
        )
        XCTAssertEqual(decoded.data.match.round.format, .unknown("FUTURE_FORMAT"))
        XCTAssertFalse(decoded.isReadContractCompatible)
    }

    func testInvalidCanonicalTimeZoneFailsClosedBeforeTimestampFormatting() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(format: .bestBall, status: .completed)
        )
        var dataObject = try XCTUnwrap(object["data"] as? [String: Any])
        var tournament = try XCTUnwrap(dataObject["tournament"] as? [String: Any])
        tournament["timeZone"] = "Not/A_Canonical_Zone"
        dataObject["tournament"] = tournament
        object["data"] = dataObject

        let decoded = try JSONDecoder().decode(
            MobileMatchDetailResponse.self,
            from: JSONSerialization.data(withJSONObject: object)
        )
        XCTAssertFalse(decoded.isReadContractCompatible)
    }
}

enum MatchDetailFixtureFactory {
    static let tournamentID = "tournament-preview-1"
    static let playerOneID = "player-preview-1"
    static let playerTwoID = "player-preview-2"
    static let playerThreeID = "player-preview-3"
    static let playerFourID = "player-preview-4"
    static let teamOneID = "team-preview-1"
    static let teamTwoID = "team-preview-2"
    static let generatedAt = try! MobileTimestamp("2026-09-04T15:00:00.000Z")
    static let confirmedAt = try! MobileTimestamp("2026-09-04T16:00:00.000Z")

    static func response(
        format: MobileScoringFormat = .bestBall,
        status: MobileMatchStatus = .scheduled,
        matchID: String = "match-preview-2",
        tournamentID: String = tournamentID,
        authenticatedPlayerID: String = playerOneID,
        authenticatedInvolved: Bool = true,
        holesPlayed requestedHolesPlayed: Int? = nil,
        clinchHole: Int? = nil,
        scorecardComplete requestedScorecardComplete: Bool? = nil,
        revision: String = "match-detail-revision-1"
    ) -> MobileMatchDetailResponse {
        let holesPlayed: Int = requestedHolesPlayed ?? {
            switch status {
            case .scheduled: 0
            case .inProgress: 7
            case .completed: 18
            }
        }()
        let scorecardComplete = requestedScorecardComplete ?? (status == .completed)
        let sideOneIDs: [String]
        let sideTwoIDs: [String]
        switch format {
        case .singles:
            sideOneIDs = [authenticatedPlayerID]
            sideTwoIDs = [playerThreeID]
        case .bestBall, .scramble, .unknown:
            sideOneIDs = [authenticatedPlayerID, playerTwoID]
            sideTwoIDs = [playerThreeID, playerFourID]
        }

        let teams = [
            team(
                side: 1,
                teamID: teamOneID,
                name: "The Pickles",
                playerIDs: sideOneIDs,
                authenticatedPlayerID: authenticatedPlayerID,
                authenticatedInvolved: authenticatedInvolved,
                format: format
            ),
            team(
                side: 2,
                teamID: teamTwoID,
                name: "Lipp It and Rip It",
                playerIDs: sideTwoIDs,
                authenticatedPlayerID: authenticatedPlayerID,
                authenticatedInvolved: authenticatedInvolved,
                format: format
            ),
        ]
        let holes = (1...18).map { holeNumber in
            hole(
                number: holeNumber,
                played: holeNumber <= holesPlayed,
                format: format,
                teams: teams
            )
        }
        let frontCount = min(holesPlayed, 9)
        let backCount = max(holesPlayed - 9, 0)
        let confirmation = status == .completed ? confirmedAt : nil
        let matchDecided = status == .completed || clinchHole != nil
        let result: MobileMatchDetailResult? = status == .scheduled
            ? nil
            : MobileMatchDetailResult(
                summary: matchDecided ? "The Pickles won" : "The Pickles lead",
                notation: matchDecided ? (clinchHole == nil ? "1 UP" : "6 & 5") : "2 UP",
                winnerSide: matchDecided ? 1 : nil,
                winnerTeamId: matchDecided ? teamOneID : nil
            )
        let ownParticipantIDs = teams[0].participants.map(\.playerId)
        let opposingParticipantIDs = teams[1].participants.map(\.playerId)

        return MobileMatchDetailResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileMatchDetailData(
                tournament: MobileMatchDetailTournament(
                    tournamentId: tournamentID,
                    name: "Preview Invitational",
                    year: 2026,
                    status: "Live",
                    timeZone: "America/Chicago",
                    location: "Kiawah Island"
                ),
                match: MobileMatchDetailMatch(
                    matchId: matchID,
                    displayMatchNumber: "2",
                    round: MobileMatchDetailRound(
                        roundNumber: format == .singles ? 3 : (format == .scramble ? 2 : 1),
                        name: "Round",
                        format: format,
                        formatName: formatName(format)
                    ),
                    status: status,
                    course: MobileMatchDetailCourse(
                        courseId: "course-preview-1",
                        name: "Turtle Point Golf Course",
                        tee: "Tournament",
                        yardage: 6_725,
                        par: 72,
                        rating: 73.1,
                        slope: 137
                    ),
                    teeTime: MobileMatchDetailTeeTime(
                        localTime: try! MobileLocalTime("08:30:00"),
                        label: "8:30 AM",
                        timeZone: "America/Chicago"
                    ),
                    teams: teams,
                    authenticatedPlayer: MobileMatchDetailAuthenticatedPlayer(
                        involved: authenticatedInvolved,
                        teamSide: authenticatedInvolved ? 1 : nil,
                        partnerPlayerIds: authenticatedInvolved
                            ? ownParticipantIDs.filter { $0 != authenticatedPlayerID }
                            : [],
                        opponentPlayerIds: authenticatedInvolved ? opposingParticipantIDs : []
                    ),
                    progress: MobileMatchDetailProgress(
                        currentHole: holesPlayed,
                        holesPlayed: holesPlayed,
                        holesRemaining: 18 - holesPlayed,
                        statusText: status == .scheduled ? nil : (status == .completed ? "Final" : "2 UP")
                    ),
                    result: result,
                    navigation: MobileMatchDetailNavigation(
                        roundMatchIndex: 2,
                        roundMatchCount: 3,
                        previousMatchId: "match-prev",
                        nextMatchId: "match-next",
                        myMatchId: authenticatedInvolved ? matchID : "match-owned",
                        isMyMatch: authenticatedInvolved
                    ),
                    scorecard: MobileMatchDetailScorecard(
                        state: scorecardState(status),
                        complete: scorecardComplete,
                        confirmedAt: confirmation,
                        holes: holes
                    ),
                    flow: MobileMatchDetailFlow(
                        front: flowSegment(
                            holesRecorded: frontCount,
                            matchDecided: matchDecided
                        ),
                        back: flowSegment(
                            holesRecorded: backCount,
                            matchDecided: matchDecided
                        ),
                        overall: flowSegment(
                            holesRecorded: holesPlayed,
                            matchDecided: matchDecided
                        )
                    ),
                    clinch: clinchHole.map {
                        MobileMatchDetailClinch(
                            holeNumber: $0,
                            winnerSide: 1,
                            winnerTeamId: teamOneID,
                            summary: "The Pickles clinched the Match"
                        )
                    },
                    stats: MobileMatchDetailStats(
                        holesPlayed: holesPlayed,
                        sideOneHolesWon: holesPlayed,
                        halved: 0,
                        sideTwoHolesWon: 0,
                        biggestLead: holesPlayed,
                        leadChanges: 0,
                        holesRemaining: 18 - holesPlayed
                    ),
                    freshness: MobileMatchDetailFreshness(
                        updatedAt: status == .scheduled ? nil : generatedAt,
                        confirmedAt: confirmation
                    )
                )
            ),
            meta: MobileReadMeta(generatedAt: generatedAt, revision: revision)
        )
    }

    static func jsonObject(from response: MobileMatchDetailResponse) throws -> [String: Any] {
        let data = try JSONEncoder().encode(response)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw FixtureError.invalidObject
        }
        return object
    }

    private static func team(
        side: Int,
        teamID: String,
        name: String,
        playerIDs: [String],
        authenticatedPlayerID: String,
        authenticatedInvolved: Bool,
        format: MobileScoringFormat
    ) -> MobileMatchDetailTeam {
        let players = playerIDs.enumerated().map { index, playerID in
            MobileMatchDetailParticipant(
                playerId: playerID,
                displayName: "Preview Player \(side)-\(index + 1)",
                teamSide: side,
                isAuthenticatedPlayer: authenticatedInvolved && playerID == authenticatedPlayerID,
                playingHandicap: Double(side * 4 + index) + 0.25,
                strokesReceived: format == .scramble ? nil : (index == 0 ? 0 : side + index)
            )
        }
        return MobileMatchDetailTeam(
            side: side,
            teamId: teamID,
            name: name,
            playingHandicap: format == .scramble ? (side == 1 ? 3.25 : 1.0) : nil,
            strokesReceived: format == .scramble ? (side == 1 ? 0 : 2) : nil,
            participants: players
        )
    }

    private static func hole(
        number: Int,
        played: Bool,
        format: MobileScoringFormat,
        teams: [MobileMatchDetailTeam]
    ) -> MobileMatchDetailHole {
        MobileMatchDetailHole(
            holeNumber: number,
            par: number % 3 == 0 ? 3 : 4,
            yardage: 350 + number,
            strokeIndex: number,
            state: played ? .sideOne : .unplayed,
            official: played,
            winningSide: played ? 1 : nil,
            sideOne: sideScore(side: 1, played: played, format: format, team: teams[0]),
            sideTwo: sideScore(side: 2, played: played, format: format, team: teams[1]),
            resultLabel: played ? "Side One" : nil,
            runningResult: played ? "1 UP" : nil,
            story: played ? "Canonical official hole result" : nil,
            updatedAt: played ? generatedAt : nil
        )
    }

    private static func sideScore(
        side: Int,
        played: Bool,
        format: MobileScoringFormat,
        team: MobileMatchDetailTeam
    ) -> MobileMatchDetailSideScore {
        if format == .scramble {
            return .team(MobileMatchDetailTeamSideScore(
                side: side,
                scope: .team,
                playerScores: [],
                teamScore: MobileMatchDetailTeamHoleScore(
                    gross: played ? 4 : nil,
                    strokes: played ? 0 : nil
                ),
                netScore: played ? 4 : nil
            ))
        }
        return .players(MobileMatchDetailPlayerSideScore(
            side: side,
            scope: .players,
            playerScores: team.participants.map {
                MobileMatchDetailPlayerHoleScore(
                    playerId: $0.playerId,
                    gross: played ? 4 : nil,
                    strokes: played ? 0 : nil
                )
            },
            teamScore: nil,
            netScore: played ? 4 : nil
        ))
    }

    private static func flowSegment(
        holesRecorded: Int,
        matchDecided: Bool
    ) -> MobileMatchDetailFlowSegment {
        guard holesRecorded > 0 else {
            return MobileMatchDetailFlowSegment(
                status: .notStarted,
                winnerSide: nil,
                result: nil,
                holesRecorded: 0
            )
        }
        return MobileMatchDetailFlowSegment(
            status: matchDecided ? .final : .leading,
            winnerSide: 1,
            result: matchDecided ? "Side One won" : "Side One leads",
            holesRecorded: holesRecorded
        )
    }

    private static func scorecardState(_ status: MobileMatchStatus) -> MobileMatchDetailScorecardState {
        switch status {
        case .scheduled: .unavailable
        case .inProgress: .inProgress
        case .completed: .confirmed
        }
    }

    private static func formatName(_ format: MobileScoringFormat) -> String {
        switch format {
        case .bestBall: "Best Ball"
        case .scramble: "Scramble"
        case .singles: "Singles"
        case .unknown(let value): value
        }
    }

    private enum FixtureError: Error {
        case invalidObject
    }
}
