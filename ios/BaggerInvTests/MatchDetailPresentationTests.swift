import Foundation
import XCTest
@testable import BaggerInv

final class MatchDetailPresentationTests: XCTestCase {
    func testCourseSnapshotFormattingDoesNotRoundCanonicalPrecision() {
        XCTAssertEqual(MatchGameCenterFormatter.number(71.925), "71.925")
        XCTAssertEqual(MatchGameCenterFormatter.number(72), "72")
        XCTAssertEqual(MatchGameCenterFormatter.number(71.123456789), "71.123456789")
    }

    func testBestBallUpcomingMapsCanonicalContextIdentityAndNavigation() throws {
        let response = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .scheduled,
            matchID: "best-ball-upcoming"
        )

        let presented = try XCTUnwrap(presentation(response).match)

        XCTAssertEqual(presented.matchID, "best-ball-upcoming")
        XCTAssertEqual(presented.displayMatchNumber, "2")
        XCTAssertEqual(presented.roundNumber, 1)
        XCTAssertEqual(presented.format, .bestBall)
        XCTAssertEqual(presented.formatName, "Best Ball")
        XCTAssertEqual(presented.status, .upcoming)
        XCTAssertEqual(presented.contextEyebrow, "ROUND 1 · MATCH 2 OF 3")
        XCTAssertEqual(presented.teams.map(\.teamID), [
            MatchDetailFixtureFactory.teamOneID,
            MatchDetailFixtureFactory.teamTwoID,
        ])
        XCTAssertEqual(presented.teams.flatMap(\.players).map(\.playerID), [
            MatchDetailFixtureFactory.playerOneID,
            MatchDetailFixtureFactory.playerTwoID,
            MatchDetailFixtureFactory.playerThreeID,
            MatchDetailFixtureFactory.playerFourID,
        ])
        XCTAssertTrue(presented.authenticatedPlayerInvolved)
        XCTAssertEqual(presented.authenticatedPlayerSide, 1)
        XCTAssertEqual(presented.navigation.previousMatchID, "match-prev")
        XCTAssertEqual(presented.navigation.nextMatchID, "match-next")
        XCTAssertEqual(presented.navigation.myMatchID, "best-ball-upcoming")
        XCTAssertTrue(presented.navigation.isMyMatch)
        XCTAssertEqual(presented.scorecard.state, .unavailable)
        XCTAssertEqual(presented.defaultSelectedHoleNumber, 1)
        XCTAssertEqual(presented.headlineResult, "Upcoming")

        let tournament = try XCTUnwrap(presentation(response).tournament)
        XCTAssertEqual(tournament.tournamentID, MatchDetailFixtureFactory.tournamentID)
        XCTAssertEqual(tournament.name, "Preview Invitational")
        XCTAssertEqual(tournament.year, 2026)
        XCTAssertEqual(tournament.location, "Kiawah Island")
    }

    func testBestBallLivePassesThroughCanonicalHoleFactsWithoutCalculatingNet() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(
                format: .bestBall,
                status: .inProgress,
                holesPlayed: 7
            )
        )
        try mutateHole(in: &object, at: 0) { hole in
            var sideOne = try XCTUnwrap(hole["sideOne"] as? [String: Any])
            var playerScores = try XCTUnwrap(sideOne["playerScores"] as? [[String: Any]])
            playerScores[0]["gross"] = 5
            playerScores[0]["strokes"] = 2
            sideOne["playerScores"] = playerScores
            sideOne["netScore"] = 13
            hole["sideOne"] = sideOne
            hole["resultLabel"] = "Canonical Pickles hole"
            hole["runningResult"] = "3 UP"
            hole["story"] = "Server-projected hole story"
        }
        let response = try decode(object)
        XCTAssertTrue(response.isReadContractCompatible)

        let presented = try XCTUnwrap(presentation(response).match)
        let hole = try XCTUnwrap(presented.hole(number: 1))

        XCTAssertEqual(presented.status, .live)
        XCTAssertEqual(presented.defaultSelectedHoleNumber, 7)
        XCTAssertEqual(hole.outcome, .sideOne)
        XCTAssertTrue(hole.isOfficial)
        XCTAssertEqual(hole.winningSide, 1)
        XCTAssertEqual(hole.resultLabel, "Canonical Pickles hole")
        XCTAssertEqual(hole.runningResult, "3 UP")
        XCTAssertEqual(hole.story, "Server-projected hole story")
        XCTAssertEqual(hole.sideOne.scope, .players)
        XCTAssertEqual(hole.sideOne.playerScores[0].gross, 5)
        XCTAssertEqual(hole.sideOne.playerScores[0].strokes, 2)
        XCTAssertEqual(hole.sideOne.netScore, 13)
        XCTAssertNotEqual(hole.sideOne.netScore, 5 - 2)
        XCTAssertEqual(presented.flow.overall.status, .leading)
        XCTAssertEqual(presented.flow.overall.winnerSide, 1)
        XCTAssertEqual(presented.flow.overall.winnerTeamName, "The Pickles")
        XCTAssertEqual(presented.flow.overall.result, "Side One leads")
        XCTAssertEqual(presented.flow.overall.holesRecorded, 7)
    }

    func testScrambleLiveUsesCanonicalTeamScopeAndDoesNotCalculateNet() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(
                format: .scramble,
                status: .inProgress,
                holesPlayed: 9
            )
        )
        try mutateHole(in: &object, at: 0) { hole in
            var sideTwo = try XCTUnwrap(hole["sideTwo"] as? [String: Any])
            sideTwo["teamScore"] = ["gross": 7, "strokes": 2]
            sideTwo["netScore"] = -4
            hole["sideTwo"] = sideTwo
        }
        let response = try decode(object)
        XCTAssertTrue(response.isReadContractCompatible)

        let presented = try XCTUnwrap(presentation(response).match)
        let hole = try XCTUnwrap(presented.hole(number: 1))

        XCTAssertEqual(presented.format, .scramble)
        XCTAssertEqual(presented.roundNumber, 2)
        XCTAssertEqual(presented.teams[0].golfContext?.scope, .team)
        XCTAssertEqual(presented.teams[0].golfContext?.playingHandicap, 3.25)
        XCTAssertEqual(presented.teams[0].golfContext?.strokesReceived, 0)
        XCTAssertEqual(presented.teams[0].golfContext?.compactText, "Team HCP 3.3 · No strokes")
        XCTAssertEqual(
            presented.teams[1].golfContext?.accessibilityText,
            "Team Playing Handicap 1.0, 2 team strokes"
        )
        XCTAssertEqual(response.data.match.teams[0].participants[0].playingHandicap, 4.25)
        XCTAssertTrue(presented.teams.flatMap(\.players).allSatisfy { $0.golfContext == nil })
        XCTAssertEqual(hole.sideTwo.scope, .team)
        XCTAssertTrue(hole.sideTwo.playerScores.isEmpty)
        XCTAssertEqual(hole.sideTwo.teamGross, 7)
        XCTAssertEqual(hole.sideTwo.teamStrokes, 2)
        XCTAssertEqual(hole.sideTwo.netScore, -4)
        XCTAssertNotEqual(hole.sideTwo.netScore, 7 - 2)
    }

    func testSinglesFinalMapsCanonicalResultConfirmationAndOnePlayerPerSide() throws {
        let response = MatchDetailFixtureFactory.response(
            format: .singles,
            status: .completed,
            holesPlayed: 18
        )

        let presented = try XCTUnwrap(presentation(response).match)

        XCTAssertEqual(presented.format, .singles)
        XCTAssertEqual(presented.roundNumber, 3)
        XCTAssertEqual(presented.status, .final)
        XCTAssertEqual(presented.teams.map { $0.players.count }, [1, 1])
        XCTAssertEqual(presented.resultSummary, "The Pickles won")
        XCTAssertEqual(presented.resultNotation, "1 UP")
        XCTAssertEqual(presented.resultWinnerSide, 1)
        XCTAssertEqual(presented.resultWinnerTeamID, MatchDetailFixtureFactory.teamOneID)
        XCTAssertEqual(presented.headlineResult, "The Pickles won")
        XCTAssertEqual(presented.scorecard.state, .confirmed)
        XCTAssertTrue(presented.scorecard.isComplete)
        XCTAssertEqual(presented.scorecard.confirmedAt, MatchDetailFixtureFactory.confirmedAt)
        XCTAssertNotNil(presented.scorecard.confirmationText)
        XCTAssertEqual(presented.defaultSelectedHoleNumber, 18)
        XCTAssertEqual(presented.flow.overall.status, .final)
    }

    func testPlayingHandicapAndStrokesMapByCanonicalFormatScope() throws {
        let bestBall = try XCTUnwrap(presentation(
            MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        ).match)
        let scramble = try XCTUnwrap(presentation(
            MatchDetailFixtureFactory.response(format: .scramble, status: .scheduled)
        ).match)
        let singles = try XCTUnwrap(presentation(
            MatchDetailFixtureFactory.response(format: .singles, status: .scheduled)
        ).match)

        XCTAssertNil(bestBall.teams[0].golfContext)
        XCTAssertEqual(bestBall.teams[0].players[0].golfContext?.scope, .participant)
        XCTAssertEqual(bestBall.teams[0].players[0].golfContext?.playingHandicap, 4.25)
        XCTAssertEqual(bestBall.teams[0].players[0].golfContext?.strokesReceived, 0)
        XCTAssertEqual(bestBall.teams[0].players[0].golfContext?.compactText, "HCP 4.3 · No strokes")

        XCTAssertEqual(scramble.teams[0].golfContext?.scope, .team)
        XCTAssertEqual(scramble.teams[0].golfContext?.playingHandicap, 3.25)
        XCTAssertEqual(scramble.teams[1].golfContext?.strokesReceived, 2)
        XCTAssertTrue(scramble.teams.flatMap(\.players).allSatisfy { $0.golfContext == nil })

        XCTAssertNil(singles.teams[0].golfContext)
        XCTAssertEqual(singles.teams[0].players[0].golfContext?.scope, .participant)
        XCTAssertEqual(singles.teams[0].players[0].golfContext?.playingHandicap, 4.25)
        XCTAssertFalse(
            [bestBall, scramble, singles]
                .flatMap(\.teams)
                .compactMap(\.golfContext?.accessibilityText)
                .contains { $0.localizedCaseInsensitiveContains("course handicap") }
        )
    }

    func testScrambleOmitsZeroIndividualHandicapWhilePreservingNamesAndTeamContext() throws {
        let response = try zeroParticipantHandicapResponse(format: .scramble)
        XCTAssertTrue(response.isReadContractCompatible)
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let original = try encoder.encode(response)
        let presented = try XCTUnwrap(presentation(response).match)

        for (canonicalTeam, team) in zip(response.data.match.teams, presented.teams) {
            XCTAssertEqual(team.players.map(\.playerID), canonicalTeam.participants.map(\.playerId))
            XCTAssertEqual(team.players.map(\.displayName), canonicalTeam.participants.map(\.displayName))
            XCTAssertEqual(
                team.players.map(\.isAuthenticatedPlayer),
                canonicalTeam.participants.map(\.isAuthenticatedPlayer)
            )
            XCTAssertTrue(canonicalTeam.participants.allSatisfy { $0.playingHandicap == 0 })
            XCTAssertTrue(team.players.allSatisfy { $0.golfContext == nil })
            XCTAssertEqual(team.golfContext?.playingHandicap, canonicalTeam.playingHandicap)
            XCTAssertEqual(team.golfContext?.strokesReceived, canonicalTeam.strokesReceived)
        }
        XCTAssertEqual(presented.teams[0].golfContext?.compactText, "Team HCP 3.0 · No strokes")
        XCTAssertEqual(presented.teams[1].golfContext?.compactText, "Team HCP 3.0 · +2 strokes")
        XCTAssertEqual(
            presented.teams[1].golfContext?.accessibilityText,
            "Team Playing Handicap 3.0, 2 team strokes"
        )
        XCTAssertEqual(try encoder.encode(response), original, "Presentation must not mutate canonical data.")
    }

    func testScrambleHidesEveryParticipantHandicapWithoutMutatingCanonicalValuesOrTeamContext() throws {
        let handicaps: [Double?] = [0, 15.84336283, -0.875, nil]
        let names = [["Clay Beltran", "Matthew Smith"], ["Patrick Noonan", "Robert Murphy"]]
        let teamNames = ["The Pickles", "Lipp it and Rip it"]
        for handicap in handicaps {
            var object = try MatchDetailFixtureFactory.jsonObject(
                from: MatchDetailFixtureFactory.response(format: .scramble, status: .scheduled)
            )
            var data = try XCTUnwrap(object["data"] as? [String: Any])
            var match = try XCTUnwrap(data["match"] as? [String: Any])
            var teams = try XCTUnwrap(match["teams"] as? [[String: Any]])
            for index in teams.indices {
                var participants = try XCTUnwrap(teams[index]["participants"] as? [[String: Any]])
                for playerIndex in participants.indices {
                    participants[playerIndex]["displayName"] = names[index][playerIndex]
                    participants[playerIndex]["playingHandicap"] = handicap.map { $0 as Any } ?? NSNull()
                }
                teams[index]["participants"] = participants
                teams[index]["name"] = teamNames[index]
                teams[index]["playingHandicap"] = index == 0 ? 3.0 : 1.0
                teams[index]["strokesReceived"] = index == 0 ? 2 : 0
            }
            match["teams"] = teams
            data["match"] = match
            object["data"] = data
            let response = try decode(object)
            XCTAssertTrue(response.isReadContractCompatible)
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            let original = try encoder.encode(response)
            let presented = try XCTUnwrap(presentation(response).match)

            for (canonical, team) in zip(response.data.match.teams, presented.teams) {
                XCTAssertTrue(canonical.participants.allSatisfy { $0.playingHandicap == handicap })
                XCTAssertEqual(team.name, canonical.name)
                XCTAssertEqual(team.players.map(\.playerID), canonical.participants.map(\.playerId))
                XCTAssertEqual(team.players.map(\.displayName), canonical.participants.map(\.displayName))
                XCTAssertEqual(team.players.map(\.isAuthenticatedPlayer), canonical.participants.map(\.isAuthenticatedPlayer))
                XCTAssertTrue(team.players.allSatisfy { $0.golfContext == nil })
                XCTAssertEqual(team.golfContext?.playingHandicap, canonical.playingHandicap)
                XCTAssertEqual(team.golfContext?.strokesReceived, canonical.strokesReceived)
            }
            XCTAssertEqual(presented.teams.map(\.name), teamNames)
            XCTAssertEqual(presented.teams.map { $0.players.map(\.displayName) }, names)
            XCTAssertEqual(presented.teams[0].golfContext?.compactText, "Team HCP 3.0 · +2 strokes")
            XCTAssertEqual(presented.teams[1].golfContext?.compactText, "Team HCP 1.0 · No strokes")
            XCTAssertEqual(try encoder.encode(response), original, "Presentation must not mutate canonical data.")
        }
    }

    func testScrambleTeamHandicapAndStrokeGrammarMatchesHeroWithoutChangingCanonicalPrecision() throws {
        let cases: [(Double, Int, String, String)] = [
            (3.0, 2, "Team HCP 3.0 · +2 strokes", "Team Playing Handicap 3.0, 2 team strokes"),
            (1.0, 0, "Team HCP 1.0 · No strokes", "Team Playing Handicap 1.0, No team strokes"),
            (3.0, 1, "Team HCP 3.0 · +1 stroke", "Team Playing Handicap 3.0, 1 team stroke"),
            (3.25, 2, "Team HCP 3.3 · +2 strokes", "Team Playing Handicap 3.3, 2 team strokes"),
            (-0.875, 1, "Team HCP (0.9) · +1 stroke", "Team Playing Handicap (0.9), 1 team stroke"),
        ]
        for (handicap, strokes, text, accessibilityText) in cases {
            var object = try MatchDetailFixtureFactory.jsonObject(
                from: zeroParticipantHandicapResponse(format: .scramble)
            )
            var data = try XCTUnwrap(object["data"] as? [String: Any])
            var match = try XCTUnwrap(data["match"] as? [String: Any])
            var teams = try XCTUnwrap(match["teams"] as? [[String: Any]])
            for index in teams.indices {
                teams[index]["playingHandicap"] = handicap
                teams[index]["strokesReceived"] = strokes
            }
            match["teams"] = teams
            data["match"] = match
            object["data"] = data
            let response = try decode(object)
            XCTAssertTrue(response.isReadContractCompatible)
            let presented = try XCTUnwrap(presentation(response).match)

            for (canonical, team) in zip(response.data.match.teams, presented.teams) {
                let context = try XCTUnwrap(team.golfContext)
                let heroContext = MatchesGolfContextPresentation(
                    scope: .team, playingHandicap: canonical.playingHandicap,
                    strokesReceived: canonical.strokesReceived
                )
                XCTAssertEqual(context, heroContext)
                XCTAssertEqual(context.playingHandicap, handicap)
                XCTAssertEqual(context.strokesReceived, strokes)
                XCTAssertEqual(context.compactText, text)
                XCTAssertEqual(context.accessibilityText, accessibilityText)
                XCTAssertEqual(team.players.map(\.displayName), canonical.participants.map(\.displayName))
                XCTAssertTrue(team.players.allSatisfy { $0.golfContext == nil })
            }
        }
    }

    func testMissingScrambleTeamHandicapIsNotInventedFromTeamStrokesOrParticipantHandicaps() throws {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(format: .scramble, status: .scheduled)
        )
        var data = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(data["match"] as? [String: Any])
        var teams = try XCTUnwrap(match["teams"] as? [[String: Any]])
        for index in teams.indices { teams[index]["playingHandicap"] = NSNull() }
        match["teams"] = teams
        data["match"] = match
        object["data"] = data
        let response = try decode(object)
        XCTAssertTrue(response.isReadContractCompatible)
        let presented = try XCTUnwrap(presentation(response).match)

        XCTAssertTrue(presented.teams.allSatisfy { $0.golfContext?.playingHandicap == nil })
        XCTAssertEqual(presented.teams[0].golfContext?.compactText, "No strokes")
        XCTAssertEqual(presented.teams[1].golfContext?.compactText, "+2 strokes")
        XCTAssertTrue(response.data.match.teams.flatMap(\.participants).contains { $0.playingHandicap != nil })
    }

    func testBestBallAndSinglesKeepZeroIndividualHandicapAndCanonicalStrokes() throws {
        for format in [MobileScoringFormat.bestBall, .singles] {
            let response = try zeroParticipantHandicapResponse(format: format)
            XCTAssertTrue(response.isReadContractCompatible)
            let presented = try XCTUnwrap(presentation(response).match)

            for (canonicalTeam, team) in zip(response.data.match.teams, presented.teams) {
                XCTAssertNil(team.golfContext)
                for (canonicalPlayer, player) in zip(canonicalTeam.participants, team.players) {
                    XCTAssertEqual(player.displayName, canonicalPlayer.displayName)
                    let expected = MatchesGolfContextPresentation(
                        scope: .participant,
                        playingHandicap: canonicalPlayer.playingHandicap,
                        strokesReceived: canonicalPlayer.strokesReceived
                    )
                    XCTAssertEqual(player.golfContext, expected)
                    XCTAssertEqual(player.golfContext?.compactText, expected.compactText)
                    XCTAssertEqual(player.golfContext?.accessibilityText, expected.accessibilityText)
                    XCTAssertTrue(try XCTUnwrap(player.golfContext?.compactText).hasPrefix("HCP 0.0"))
                }
            }
        }
    }

    private func zeroParticipantHandicapResponse(format: MobileScoringFormat) throws -> MobileMatchDetailResponse {
        var object = try MatchDetailFixtureFactory.jsonObject(
            from: MatchDetailFixtureFactory.response(format: format, status: .scheduled)
        )
        var data = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(data["match"] as? [String: Any])
        var teams = try XCTUnwrap(match["teams"] as? [[String: Any]])
        for index in teams.indices {
            var participants = try XCTUnwrap(teams[index]["participants"] as? [[String: Any]])
            for playerIndex in participants.indices { participants[playerIndex]["playingHandicap"] = 0.0 }
            teams[index]["participants"] = participants
            if format == .scramble { teams[index]["playingHandicap"] = 3.0 }
        }
        match["teams"] = teams
        data["match"] = match
        object["data"] = data
        return try decode(object)
    }

    func testCompletedEarlyClinchStatsAndOfficialStatePassThrough() throws {
        let response = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .completed,
            holesPlayed: 13,
            clinchHole: 13
        )

        let presented = try XCTUnwrap(presentation(response).match)
        let clinch = try XCTUnwrap(presented.clinch)

        XCTAssertEqual(clinch.holeNumber, 13)
        XCTAssertEqual(clinch.winnerSide, 1)
        XCTAssertEqual(clinch.winnerTeamID, MatchDetailFixtureFactory.teamOneID)
        XCTAssertEqual(clinch.winnerTeamName, "The Pickles")
        XCTAssertEqual(clinch.summary, "The Pickles clinched the Match")
        XCTAssertEqual(presented.stats.holesPlayed, 13)
        XCTAssertEqual(presented.stats.sideOneHolesWon, 13)
        XCTAssertEqual(presented.stats.halved, 0)
        XCTAssertEqual(presented.stats.sideTwoHolesWon, 0)
        XCTAssertEqual(presented.stats.biggestLead, 13)
        XCTAssertEqual(presented.stats.leadChanges, 0)
        XCTAssertEqual(presented.stats.holesRemaining, 5)
        XCTAssertEqual(presented.scorecard.holes.filter(\.isOfficial).count, 13)
        XCTAssertEqual(presented.latestPlayedHoleNumber, 13)
        XCTAssertEqual(presented.defaultSelectedHoleNumber, 13)
    }

    func testLiveCompleteScorecardPreservesClinchWithoutClaimingConfirmation() throws {
        let response = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .inProgress,
            holesPlayed: 18,
            clinchHole: 13,
            scorecardComplete: true
        )

        let presented = try XCTUnwrap(presentation(response).match)

        XCTAssertEqual(presented.status, .live)
        XCTAssertEqual(presented.scorecard.state, .inProgress)
        XCTAssertTrue(presented.scorecard.isComplete)
        XCTAssertNil(presented.scorecard.confirmedAt)
        XCTAssertNil(presented.scorecard.confirmationText)
        XCTAssertEqual(presented.scorecard.state.title, "Official scores in progress")
        XCTAssertEqual(presented.clinch?.holeNumber, 13)
        XCTAssertEqual(presented.flow.overall.status, .final)
        XCTAssertEqual(presented.defaultSelectedHoleNumber, 18)
    }

    func testUpcomingLiveAndFinalLifecycleMappingUsesCanonicalStatus() throws {
        let upcoming = try XCTUnwrap(presentation(
            MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        ).match)
        let live = try XCTUnwrap(presentation(
            MatchDetailFixtureFactory.response(
                format: .scramble,
                status: .inProgress,
                holesPlayed: 9
            )
        ).match)
        let final = try XCTUnwrap(presentation(
            MatchDetailFixtureFactory.response(
                format: .singles,
                status: .completed,
                holesPlayed: 18
            )
        ).match)

        XCTAssertEqual([upcoming.status, live.status, final.status], [.upcoming, .live, .final])
        XCTAssertEqual([upcoming.statusKind, live.statusKind, final.statusKind], [.upcoming, .live, .final])
        XCTAssertEqual(upcoming.defaultSelectedHoleNumber, 1)
        XCTAssertEqual(live.defaultSelectedHoleNumber, 9)
        XCTAssertEqual(final.defaultSelectedHoleNumber, 18)
        XCTAssertEqual(upcoming.progressHolesRemaining, 18)
        XCTAssertEqual(live.progressHolesRemaining, 9)
        XCTAssertEqual(final.progressHolesRemaining, 0)
    }

    func testAllFormatsAndLifecyclesPreserveEveryCanonicalFlowSegmentAndHoleRecord() throws {
        for format in [MobileScoringFormat.bestBall, .scramble, .singles] {
            for status in [MobileMatchStatus.scheduled, .inProgress, .completed] {
                let response = MatchDetailFixtureFactory.response(
                    format: format,
                    status: status,
                    holesPlayed: status == .scheduled ? 0 : (status == .completed ? 18 : 7)
                )
                let presented = try XCTUnwrap(presentation(response).match)
                let canonical = response.data.match
                let segments: [(MatchDetailFlowSelection, MobileMatchDetailFlowSegment)] = [
                    (.front, canonical.flow.front),
                    (.back, canonical.flow.back),
                    (.overall, canonical.flow.overall),
                ]
                for (selection, source) in segments {
                    let displayed = presented.flow.segment(for: selection)
                    XCTAssertEqual(displayed.result, source.result)
                    XCTAssertEqual(displayed.winnerSide, source.winnerSide)
                    XCTAssertEqual(displayed.holesRecorded, source.holesRecorded)
                }
                XCTAssertEqual(presented.scorecard.holes.count, 18)
                for (displayed, source) in zip(presented.scorecard.holes, canonical.scorecard.holes) {
                    XCTAssertEqual(displayed.holeNumber, source.holeNumber)
                    XCTAssertEqual(displayed.par, source.par)
                    XCTAssertEqual(displayed.yardage, source.yardage)
                    XCTAssertEqual(displayed.strokeIndex, source.strokeIndex)
                    XCTAssertEqual(displayed.isOfficial, source.official)
                    XCTAssertEqual(displayed.resultLabel, source.resultLabel)
                    XCTAssertEqual(displayed.runningResult, source.runningResult)
                    XCTAssertEqual(displayed.story, source.story)
                    XCTAssertEqual(displayed.sideOne.netScore, source.sideOne.netScore)
                    XCTAssertEqual(displayed.sideTwo.netScore, source.sideTwo.netScore)
                }
            }
        }
    }

    func testCourseAndTeeFactsPassThroughWithoutPresentationInference() throws {
        let response = MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        let presented = try XCTUnwrap(presentation(response).match)
        let course = try XCTUnwrap(presented.course)

        XCTAssertEqual(course.courseID, "course-preview-1")
        XCTAssertEqual(course.name, "Turtle Point Golf Course")
        XCTAssertEqual(course.tee, "Tournament")
        XCTAssertEqual(course.yardage, 6_725)
        XCTAssertEqual(course.par, 72)
        XCTAssertEqual(course.rating, 73.1)
        XCTAssertEqual(course.slope, 137)
        XCTAssertEqual(presented.teeTimeLabel, "8:30 AM")
    }

    func testHoleAccessibilityUsesCanonicalWinnerOfficialAndSelectionSemantics() throws {
        let response = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .inProgress,
            holesPlayed: 7
        )
        let presented = try XCTUnwrap(presentation(response).match)
        let played = try XCTUnwrap(presented.hole(number: 1))
        let unplayed = try XCTUnwrap(presented.hole(number: 8))

        XCTAssertEqual(
            played.accessibilityLabel(teams: presented.teams, selected: true),
            "Hole 1, won by The Pickles, official, selected"
        )
        XCTAssertEqual(
            unplayed.accessibilityLabel(teams: presented.teams, selected: false),
            "Hole 8, not played"
        )
    }

    func testFreshnessBannersPreserveCachedStaleOfflineAndFreshSemantics() {
        let response = MatchDetailFixtureFactory.response(format: .bestBall, status: .scheduled)
        let cached = presentation(response, source: .diskCache, freshness: .refreshing, isRefreshing: true)
        let stale = presentation(response, source: .diskCache, freshness: .stale)
        let offline = presentation(response, source: .diskCache, freshness: .offline)
        let fresh = presentation(response, source: .network, freshness: .fresh)

        XCTAssertEqual(cached.freshnessBanner?.kind, .cached)
        XCTAssertEqual(cached.freshnessBanner?.message, "Showing saved Match details while Bagger refreshes.")
        XCTAssertTrue(cached.isRefreshing)
        XCTAssertEqual(stale.freshnessBanner?.kind, .stale)
        XCTAssertEqual(
            stale.freshnessBanner?.message,
            "Showing the last saved Match details. Refresh is temporarily unavailable."
        )
        XCTAssertEqual(offline.freshnessBanner?.kind, .offline)
        XCTAssertEqual(offline.freshnessBanner?.message, "Offline — showing the last saved Match details.")
        XCTAssertNil(fresh.freshnessBanner)
    }

    func testCurrentAndClinchingHoleAccessibilityRemainDistinctFromSelection() throws {
        let response = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .completed,
            holesPlayed: 18,
            clinchHole: 13
        )
        let presented = try XCTUnwrap(presentation(response).match)
        let clinching = try XCTUnwrap(presented.hole(number: 13))
        let current = try XCTUnwrap(presented.hole(number: presented.progressCurrentHole))

        XCTAssertEqual(
            clinching.accessibilityLabel(teams: presented.teams, selected: false, clinching: true),
            "Hole 13, won by The Pickles, official, clinching hole"
        )
        XCTAssertEqual(
            current.accessibilityLabel(teams: presented.teams, selected: false, current: true),
            "Hole 18, won by The Pickles, official, current hole"
        )
    }

    func testUpcomingAndLiveUnplayedHolesPreservePublishedCourseFacts() throws {
        for status in [MobileMatchStatus.scheduled, .inProgress] {
            let response = MatchDetailFixtureFactory.response(
                format: .bestBall,
                status: status,
                holesPlayed: status == .scheduled ? 0 : 7
            )
            let presented = try XCTUnwrap(presentation(response).match)
            let unplayed = try XCTUnwrap(presented.hole(number: 18))
            let canonical = try XCTUnwrap(response.data.match.scorecard.holes.last)

            XCTAssertEqual(unplayed.outcome, .unplayed)
            XCTAssertFalse(unplayed.isOfficial)
            XCTAssertEqual(unplayed.par, canonical.par)
            XCTAssertEqual(unplayed.yardage, canonical.yardage)
            XCTAssertEqual(unplayed.strokeIndex, canonical.strokeIndex)
            XCTAssertNil(unplayed.sideOne.netScore)
            XCTAssertNil(unplayed.sideTwo.netScore)
            XCTAssertEqual(unplayed.accessibilityLabel(teams: presented.teams, selected: true),
                           "Hole 18, not played, selected")
        }
    }

    func testFinalDefaultsToCanonicalClinchEvenWhenLaterHolesAreRecorded() throws {
        let response = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .completed,
            holesPlayed: 18,
            clinchHole: 13
        )
        let presented = try XCTUnwrap(presentation(response).match)

        XCTAssertEqual(presented.latestPlayedHoleNumber, 18)
        XCTAssertEqual(presented.defaultSelectedHoleNumber, 13)
        XCTAssertEqual(presented.clinch?.holeNumber, 13)
    }

    func testAuthoritative404RevocationRemovesAllProtectedPresentation() throws {
        let response = MatchDetailFixtureFactory.response(
            format: .singles,
            status: .completed,
            holesPlayed: 18
        )
        XCTAssertEqual(presentation(response).availability, .content)
        var revoked = MobileReadState<MobileMatchDetailData>.empty
        revoked.freshness = .failed
        revoked.lastHTTPStatus = 404
        revoked.lastServerCode = .matchNotFound
        revoked.lastSafeError = .unavailable

        let presented = MatchDetailPresenter.make(
            state: revoked,
            requestedMatchID: response.data.match.matchId,
            now: TestFixtures.now
        )

        XCTAssertEqual(presented.availability, .unavailable)
        XCTAssertNil(presented.match)
        XCTAssertNil(presented.tournament)
        XCTAssertNil(presented.freshnessBanner)
        XCTAssertFalse(presented.isRefreshing)
    }

    func testAuthoritative404CannotRenderAnAccidentallyRetainedValueAsFreshStaleOrOffline() {
        let response = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .inProgress,
            holesPlayed: 7
        )
        for freshness in [MobileReadFreshness.fresh, .cached, .stale, .offline] {
            var revoked = state(response, source: .diskCache, freshness: freshness)
            revoked.lastHTTPStatus = 404
            revoked.lastServerCode = .matchNotFound

            let presented = MatchDetailPresenter.make(
                state: revoked,
                requestedMatchID: response.data.match.matchId,
                now: TestFixtures.now
            )

            XCTAssertEqual(presented.availability, .unavailable)
            XCTAssertNil(presented.match)
            XCTAssertNil(presented.tournament)
            XCTAssertNil(presented.freshnessBanner)
        }
    }

    func testTransient503WithMisleadingNotFoundCodeRetainsEligibleStalePresentation() {
        let response = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .inProgress,
            holesPlayed: 7
        )
        var transient = state(response, source: .diskCache, freshness: .stale)
        transient.lastHTTPStatus = 503
        transient.lastServerCode = .matchNotFound

        let presented = MatchDetailPresenter.make(
            state: transient,
            requestedMatchID: response.data.match.matchId,
            now: TestFixtures.now
        )

        XCTAssertEqual(presented.availability, .content)
        XCTAssertNotNil(presented.match)
        XCTAssertEqual(presented.freshnessBanner?.kind, .stale)
    }

    func testOpaqueMatchPresentationRequiresExactIdentifierBytes() {
        let canonicalID = "match:caf\u{00E9}/2#opaque"
        let differentID = "match:cafe\u{0301}/2#opaque"
        let response = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .scheduled,
            matchID: canonicalID
        )
        XCTAssertEqual(canonicalID, differentID, "Swift String equality deliberately folds this pair")
        XCTAssertEqual(presentation(response).availability, .content)
        let mismatched = MatchDetailPresenter.make(
            state: state(response),
            requestedMatchID: differentID,
            now: TestFixtures.now
        )

        XCTAssertEqual(mismatched.availability, .loadError)
        XCTAssertNil(mismatched.match)
    }

    func testMissingOrMismatchedCanonicalMatchFailsPresentationSafely() {
        let empty = MatchDetailPresenter.make(
            state: .empty,
            requestedMatchID: "requested-match",
            now: TestFixtures.now
        )
        let response = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .scheduled,
            matchID: "different-match"
        )
        let mismatched = MatchDetailPresenter.make(
            state: state(response),
            requestedMatchID: "requested-match",
            now: TestFixtures.now
        )

        XCTAssertEqual(empty.availability, .loading)
        XCTAssertNil(empty.match)
        XCTAssertEqual(mismatched.availability, .loadError)
        XCTAssertNil(mismatched.tournament)
        XCTAssertNil(mismatched.match)
    }

    private func presentation(
        _ response: MobileMatchDetailResponse,
        source: MobileReadSource? = .network,
        freshness: MobileReadFreshness = .fresh,
        isRefreshing: Bool = false
    ) -> MatchDetailPresentation {
        MatchDetailPresenter.make(
            state: state(
                response,
                source: source,
                freshness: freshness,
                isRefreshing: isRefreshing
            ),
            requestedMatchID: response.data.match.matchId,
            now: TestFixtures.now
        )
    }

    private func state(
        _ response: MobileMatchDetailResponse,
        source: MobileReadSource? = .network,
        freshness: MobileReadFreshness = .fresh,
        isRefreshing: Bool = false
    ) -> MobileReadState<MobileMatchDetailData> {
        MobileReadState(
            value: response.data,
            source: source,
            freshness: freshness,
            isRefreshing: isRefreshing,
            revision: response.meta.revision,
            generatedAt: response.meta.generatedAt,
            fetchedAt: TestFixtures.now,
            validatedAt: TestFixtures.now,
            lastSafeError: freshness == .offline || freshness == .failed ? .transport : nil,
            lastServerCode: nil,
            lastHTTPStatus: 200,
            cachePersistenceIssue: false
        )
    }

    private func mutateHole(
        in object: inout [String: Any],
        at index: Int,
        mutation: (inout [String: Any]) throws -> Void
    ) throws {
        var data = try XCTUnwrap(object["data"] as? [String: Any])
        var match = try XCTUnwrap(data["match"] as? [String: Any])
        var scorecard = try XCTUnwrap(match["scorecard"] as? [String: Any])
        var holes = try XCTUnwrap(scorecard["holes"] as? [[String: Any]])
        try mutation(&holes[index])
        scorecard["holes"] = holes
        match["scorecard"] = scorecard
        data["match"] = match
        object["data"] = data
    }

    private func decode(_ object: [String: Any]) throws -> MobileMatchDetailResponse {
        try JSONDecoder().decode(
            MobileMatchDetailResponse.self,
            from: JSONSerialization.data(withJSONObject: object)
        )
    }
}
