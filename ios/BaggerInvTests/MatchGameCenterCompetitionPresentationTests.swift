import XCTest
@testable import BaggerInv

final class MatchGameCenterCompetitionPresentationTests: XCTestCase {
    func testSelectedHoleUsesCanonicalStoryOnceInsteadOfRepeatingWinnerAndRunningResult() throws {
        let original = try match().scorecard.holes[0]
        let story = "Lipp it and Rip it won Hole 10. The lead increases to 4 UP."
        let hole = copy(original, resultLabel: "Lipp it and Rip it", runningResult: "4 UP", story: story)

        XCTAssertEqual(MatchGameCenterCompetitionPresentation.narrative(for: hole), story)
        XCTAssertNil(MatchGameCenterCompetitionPresentation.secondaryResult(for: hole))
    }

    func testSelectedHoleWithoutStoryKeepsDistinctCanonicalResultAndRunningResult() throws {
        let original = try match().scorecard.holes[0]
        let hole = copy(original, resultLabel: "Hole halved", runningResult: "All square", story: nil)

        XCTAssertEqual(MatchGameCenterCompetitionPresentation.narrative(for: hole), "Hole halved")
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.secondaryResult(for: hole), "All square")
        let repeated = copy(original, resultLabel: "All square", runningResult: "All square", story: nil)
        XCTAssertNil(MatchGameCenterCompetitionPresentation.secondaryResult(for: repeated))
    }

    func testContextOnlyCanonicalStoryDoesNotHideTheSuppliedWinner() throws {
        let original = try match().scorecard.holes[0]
        let hole = copy(original, resultLabel: "The Pickles", runningResult: "1 UP", story: "This hole is official.")
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.narrative(for: hole), "The Pickles\nThis hole is official.")
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.secondaryResult(for: hole), "1 UP")
    }

    func testSelectedHoleBestBallPreservesCanonicalPlayerOrderingGrossAndAppliedStrokes() throws {
        let side = try match(format: .bestBall).scorecard.holes[0].sideOne
        let rows = MatchGameCenterCompetitionPresentation.scoreRows(for: side)

        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows.map(\.name), side.playerScores.map(\.displayName))
        XCTAssertEqual(rows.map(\.gross), side.playerScores.map(\.gross))
        XCTAssertEqual(rows.map(\.strokes), side.playerScores.map(\.strokes))
    }

    func testSelectedHoleSinglesUsesOneCanonicalPlayerRowPerSide() throws {
        let hole = try match(format: .singles).scorecard.holes[0]
        for side in [hole.sideOne, hole.sideTwo] {
            let rows = MatchGameCenterCompetitionPresentation.scoreRows(for: side)
            XCTAssertEqual(rows.count, 1)
            XCTAssertEqual(rows.first?.name, side.playerScores.first?.displayName)
        }
    }

    func testSelectedHoleScrambleDisplaysCanonicalTeamScoreWithoutInventingPlayerScores() throws {
        let hole = try match(format: .scramble).scorecard.holes[0]
        for side in [hole.sideOne, hole.sideTwo] {
            let rows = MatchGameCenterCompetitionPresentation.scoreRows(for: side)
            XCTAssertTrue(side.playerScores.isEmpty)
            XCTAssertEqual(rows.count, 1)
            XCTAssertEqual(rows[0].name, "Team score")
            XCTAssertEqual(rows[0].gross, side.teamGross)
            XCTAssertEqual(rows[0].strokes, side.teamStrokes)
        }
    }

    func testAppliedStrokeMarkersOmitZeroAndPreserveExactSignedCanonicalIntegers() {
        XCTAssertNil(MatchGameCenterCompetitionPresentation.compactStrokeMarker(nil))
        XCTAssertNil(MatchGameCenterCompetitionPresentation.compactStrokeMarker(0))
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.compactStrokeMarker(1), "(+1)")
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.compactStrokeMarker(2), "(+2)")
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.compactStrokeMarker(-1), "(-1)")
    }

    func testMatchFlowResolvesBothCanonicalTeamIdentitiesBySideNotArrayPosition() throws {
        let teams = try match().teams
        let reversed = Array(teams.reversed())
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.team(side: 1, teams: reversed), teams[0])
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.team(side: 2, teams: reversed), teams[1])
    }

    func testClinchNarrativeIsUnchangedAndOnlyAppearsInOverallWhenCanonicalClinchExists() {
        let clinch = MatchDetailClinchPresentation(
            holeNumber: 13,
            winnerSide: 1,
            winnerTeamID: "canonical-team-one",
            winnerTeamName: "The Pickles",
            summary: "The Pickles clinched on Hole 13"
        )
        XCTAssertNil(MatchGameCenterCompetitionPresentation.clinchNarrative(clinch, selection: .front))
        XCTAssertNil(MatchGameCenterCompetitionPresentation.clinchNarrative(clinch, selection: .back))
        XCTAssertEqual(
            MatchGameCenterCompetitionPresentation.clinchNarrative(clinch, selection: .overall),
            clinch.summary
        )
        XCTAssertNil(MatchGameCenterCompetitionPresentation.clinchNarrative(nil, selection: .overall))
    }

    func testMatchStatsBindCanonicalValuesToBothTeamLogosAndKeepHalvedNeutral() throws {
        let teams = try match().teams
        let stats = MatchDetailStatsPresentation(
            holesPlayed: 18, sideOneHolesWon: 6, halved: 10, sideTwoHolesWon: 2,
            biggestLead: 4, leadChanges: 1, holesRemaining: 0
        )
        let primary = MatchGameCenterCompetitionPresentation.primaryStats(stats, teams: Array(teams.reversed()))

        XCTAssertEqual(primary.map(\.id), ["side.1", "halved", "side.2"])
        XCTAssertEqual(primary.map(\.value), [6, 10, 2])
        XCTAssertEqual(primary.map(\.teamID), [teams[0].teamID, nil, teams[1].teamID])
        XCTAssertEqual(primary.map(\.teamName), [teams[0].name, nil, teams[1].name])
        XCTAssertEqual(primary[0].accessibilityLabel, "\(teams[0].name), 6 holes won")
        XCTAssertEqual(primary[1].accessibilityLabel, "10 holes halved")
        XCTAssertEqual(primary[2].accessibilityLabel, "\(teams[1].name), 2 holes won")
    }

    func testLongTeamAndPlayerNamesArePreservedForVisibleRowsAndVoiceOver() throws {
        let original = try match()
        let name = "The Extremely Long Invitational Team Name"
        let playerName = "Alexandra Catherine Montgomery-Wellington"
        let team = MatchDetailTeamPresentation(
            side: 1, teamID: "long-team", name: name, golfContext: nil, players: []
        )
        let side = MatchDetailHoleSidePresentation(
            side: 1, teamID: team.teamID, teamName: name, scope: .players,
            playerScores: [.init(playerID: "long-player", displayName: playerName, gross: 5, strokes: 1)],
            teamGross: nil, teamStrokes: nil, netScore: 4
        )
        XCTAssertEqual(MatchGameCenterCompetitionPresentation.scoreRows(for: side)[0].name, playerName)
        let primary = MatchGameCenterCompetitionPresentation.primaryStats(original.stats, teams: [team, original.teams[1]])
        XCTAssertEqual(primary[0].teamName, name)
        XCTAssertTrue(primary[0].accessibilityLabel.contains(name))
    }

    private func match(format: MobileScoringFormat = .bestBall) throws -> MatchDetailMatchPresentation {
        let response = MatchDetailFixtureFactory.response(format: format, status: .inProgress, holesPlayed: 7)
        var state = MobileReadState<MobileMatchDetailData>.empty
        state.value = response.data
        state.source = .network
        state.freshness = .fresh
        return try XCTUnwrap(MatchDetailPresenter.make(
            state: state, requestedMatchID: response.data.match.matchId, now: TestFixtures.now
        ).match)
    }

    private func copy(
        _ hole: MatchDetailHolePresentation,
        resultLabel: String?,
        runningResult: String?,
        story: String?
    ) -> MatchDetailHolePresentation {
        MatchDetailHolePresentation(
            holeNumber: hole.holeNumber, par: hole.par, yardage: hole.yardage, strokeIndex: hole.strokeIndex,
            outcome: hole.outcome, isOfficial: hole.isOfficial, winningSide: hole.winningSide,
            resultLabel: resultLabel, runningResult: runningResult, story: story, updatedAt: hole.updatedAt,
            sideOne: hole.sideOne, sideTwo: hole.sideTwo
        )
    }
}
