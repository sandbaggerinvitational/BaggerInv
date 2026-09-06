import XCTest
@testable import BaggerInv

@MainActor
final class ScorecardIdentityHeaderPresentationTests: XCTestCase {
    func testSameMatchDisplayPositionComesOnlyFromExistingContext() throws {
        let state = ScoringUITestFixtures.state(for: .scoreActiveBestBall)
        let scoring = try XCTUnwrap(state.scoring)
        let score = ScoringPresenter.make(state: state)
        let context = ScoreMatchDisplayContext(match: ScoreMatchSelectionFixtureAPI.listing(scoring), isCached: false)
        let header = ScorecardIdentityHeaderPresentation(score: score, context: context)
        XCTAssertEqual(header.roundAndFormat, "Round 2 · Best Ball")
        XCTAssertEqual(header.matchNumberText, "Match 4 of 6")
        XCTAssertNil(ScorecardIdentityHeaderPresentation(score: score, context: nil).matchNumberText)
    }

    func testDifferentExactMatchCannotSupplyDisplayNumber() throws {
        let state = ScoringUITestFixtures.state(for: .scoreActiveBestBall)
        let context = ScoreMatchDisplayContext(match: ScoreMatchSelectionFixtureAPI.listing(try XCTUnwrap(state.scoring)), isCached: false)
        let score = try changedScore { object in
            var match = object["match"] as! [String: Any]
            match["matchId"] = "fixture-scoring-match "
            object["match"] = match
        }
        XCTAssertNil(ScorecardIdentityHeaderPresentation(score: score, context: context).matchNumberText)
        XCTAssertEqual(score.matchID, "fixture-scoring-match ")
    }

    func testSideAndPlayerOrderIsRetainedForEveryFormat() {
        for scenario in [TodayUITestScenario.scoreActiveBestBall, .scoreActiveScramble, .scoreActiveSingles] {
            let score = ScoringPresenter.make(state: ScoringUITestFixtures.state(for: scenario))
            let header = ScorecardIdentityHeaderPresentation(score: score, context: nil)
            XCTAssertEqual(header.sides, score.sides)
            XCTAssertEqual(header.playerNames(for: header.sides[0]), scenario == .scoreActiveSingles ? "Alex Morgan" : "Alex Morgan · Jordan Lee")
            XCTAssertEqual(header.playerNames(for: header.sides[1]), scenario == .scoreActiveSingles ? "Taylor Kim" : "Taylor Kim · Cameron Diaz")
        }
    }

    func testCurrentAndFinalCanonicalStatusAreShownOnceWithoutDerivation() {
        for (scenario, expected) in [(TodayUITestScenario.scoreActiveBestBall, "Pines 1 UP · Thru 6"), (.scoreCompleted, "Pines win 3 & 2")] {
            let score = ScoringPresenter.make(state: ScoringUITestFixtures.state(for: scenario))
            let header = ScorecardIdentityHeaderPresentation(score: score, context: nil)
            XCTAssertEqual(header.resultText, expected)
        }
    }

    func testOnlyCanonicalResultFallbackAndNoManufacturedWinner() throws {
        for (result, expected) in [("teamOne", "Winner: Pines"), ("halved", "Result: Halved")] {
            let score = try changedScore { object in
                var progress = object["progress"] as! [String: Any]; progress["statusText"] = NSNull(); object["progress"] = progress
                var match = object["match"] as! [String: Any]; match["result"] = result; object["match"] = match
            }
            XCTAssertEqual(ScorecardIdentityHeaderPresentation(score: score, context: nil).resultText, expected)
        }
        let absent = try changedScore { object in
            var progress = object["progress"] as! [String: Any]; progress["statusText"] = NSNull(); object["progress"] = progress
        }
        XCTAssertNil(ScorecardIdentityHeaderPresentation(score: absent, context: nil).resultText)
    }

    func testGenericStatusUsesOnlyCanonicalWinningSideNameAndPreservesSuffix() throws {
        for (winner, status, expected) in [
            ("teamOne", "Team 1 7 UP through 18", "The Pickles 7 UP through 18"),
            ("teamTwo", "Team 2 win 3 & 2", "Lipp it and Rip it win 3 & 2")
        ] {
            let score = try resultScore(winner: winner, status: status)
            let grid = ScoreGolfScorecardPresentation.make(score)
            XCTAssertEqual(ScorecardIdentityHeaderPresentation(score: score, context: nil).resultText, expected)
            XCTAssertEqual(score.statusText, status, "The canonical status remains untouched.")
            XCTAssertEqual(ScoreGolfScorecardPresentation.make(score), grid)
        }
    }

    func testHalvedAndAlreadyNamedStatusRemainCanonical() throws {
        for (winner, status) in [("halved", "Halved"), ("halved", "Match Halved through 18"),
                                ("teamOne", "The Pickles 7 UP through 18")] {
            let score = try resultScore(winner: winner, status: status)
            XCTAssertEqual(ScorecardIdentityHeaderPresentation(score: score, context: nil).resultText, status)
        }
    }

    func testMissingOrConflictingWinnerNeverInfersIdentityFromStatusOrHoleScores() throws {
        for winner: String? in [nil, "teamTwo", "halved"] {
            let score = try resultScore(winner: winner, status: "Team 1 7 UP through 18")
            XCTAssertEqual(ScorecardIdentityHeaderPresentation(score: score, context: nil).resultText, "Team 1 7 UP through 18")
        }
    }

    func testMissingBlankOrAmbiguousWinningSidePreservesSafeStatusFallback() throws {
        for name: String? in [nil, "", " \t\n"] {
            let score = try resultScore(winner: "teamOne", status: "Team 1 7 UP through 18", firstName: name)
            XCTAssertEqual(ScorecardIdentityHeaderPresentation(score: score, context: nil).resultText, "Team 1 7 UP through 18")
        }
        let score = try resultScore(winner: "teamOne", status: "Team 1 7 UP through 18", duplicateFirstSide: true)
        XCTAssertEqual(ScorecardIdentityHeaderPresentation(score: score, context: nil).resultText, "Team 1 7 UP through 18")
    }

    func testOnlyExactLeadingSidePlaceholderIsReplaced() throws {
        for status in ["Team 10 7 UP through 18", "Result: Team 1 7 UP through 18", "Team 2 7 UP through 18", "Team 1"] {
            let score = try resultScore(winner: "teamOne", status: status)
            XCTAssertEqual(ScorecardIdentityHeaderPresentation(score: score, context: nil).resultText, status)
        }
    }

    private func resultScore(winner: String?, status: String, firstName: String? = "The Pickles",
                             duplicateFirstSide: Bool = false) throws -> ScoringPresentation {
        try changedScore { object in
            var match = object["match"] as! [String: Any]
            match["result"] = winner.map { $0 as Any } ?? NSNull()
            object["match"] = match
            var progress = object["progress"] as! [String: Any]
            progress["statusText"] = status
            object["progress"] = progress
            var sides = object["sides"] as! [[String: Any]]
            sides[1]["name"] = "Lipp it and Rip it"
            if let firstName { sides[0]["name"] = firstName } else { sides.removeFirst() }
            if duplicateFirstSide { sides.append(sides[0]) }
            object["sides"] = sides
        }
    }

    func testCanonicalAssetsAndUnknownFallbackNeverGuessFromName() throws {
        let known = try changedScore { object in
            var course = object["course"] as! [String: Any]; course["courseId"] = "OCGC01"; object["course"] = course
        }
        let header = ScorecardIdentityHeaderPresentation(score: known, context: nil)
        XCTAssertEqual(header.courseAndTeeText, "Ocean Course · Gold")
        XCTAssertEqual(BaggerAsset.courseLogo(courseID: header.courseID!).reference?.catalogName, "course_ocgc01_logo")
        XCTAssertEqual(BaggerAsset.team(teamID: "PICKLES").reference?.catalogName, "team_pickles")
        let fallback = ScorecardIdentityHeaderPresentation(score: ScoringPresenter.make(state: ScoringUITestFixtures.state(for: .scoreActiveBestBall)), context: nil)
        XCTAssertNil(BaggerAsset.courseLogo(courseID: fallback.courseID!).reference)
        XCTAssertEqual(fallback.courseAndTeeText, header.courseAndTeeText)
        XCTAssertNil(BaggerAsset.team(teamID: fallback.sides[0].teamID!).reference)
    }

    func testHeaderDoesNotAlterGridOrCanonicalAuthority() {
        for scenario in [TodayUITestScenario.scoreActiveBestBall, .scoreActiveScramble, .scoreActiveSingles, .scoreCompleted, .scoreCorrectionPending] {
            let score = ScoringPresenter.make(state: ScoringUITestFixtures.state(for: scenario))
            let nines = ScoreGolfScorecardPresentation.make(score)
            let version = score.canonicalVersion
            _ = ScorecardIdentityHeaderPresentation(score: score, context: nil)
            XCTAssertEqual(ScoreGolfScorecardPresentation.make(score), nines)
            XCTAssertEqual(score.canonicalVersion, version)
        }
    }

    func testLongNamesRemainFullAndInCanonicalOrder() {
        let score = ScoringPresenter.make(state: ScoringUITestFixtures.state(for: .scoreLongContent))
        let header = ScorecardIdentityHeaderPresentation(score: score, context: nil)
        XCTAssertEqual(header.playerNames(for: header.sides[0]), "Alexandria Montgomery-Wellington the Third · Christopher Bartholomew Kensington")
    }

    private func changedScore(_ change: (inout [String: Any]) -> Void) throws -> ScoringPresentation {
        var state = ScoringUITestFixtures.state(for: .scoreActiveBestBall)
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(try XCTUnwrap(state.scoring))) as! [String: Any]
        change(&object)
        state.scoring = try JSONDecoder().decode(MobileScoringCurrent.self, from: JSONSerialization.data(withJSONObject: object))
        return ScoringPresenter.make(state: state)
    }
}
