import XCTest

@MainActor
final class BaggerInvMatchGameCenterUITests: XCTestCase {
    private enum Scenario: String, CaseIterable {
        case bestBallUpcoming = "best-ball-upcoming"
        case bestBallLive = "best-ball-live"
        case bestBallFinal = "best-ball-final"
        case scrambleUpcoming = "scramble-upcoming"
        case scrambleLive = "scramble-live"
        case scrambleLiveCompletePending = "scramble-live-complete-pending"
        case scrambleFinal = "scramble-final"
        case singlesUpcoming = "singles-upcoming"
        case singlesLive = "singles-live"
        case singlesFinal = "singles-final"
        case singlesOffline = "singles-offline"

        var matchID: String {
            switch self {
            case .bestBallUpcoming: "fixture-r1-upcoming"
            case .bestBallLive: "fixture-r1-live"
            case .bestBallFinal: "fixture-r1-final"
            case .scrambleUpcoming: "fixture-r2-owned"
            case .scrambleLive: "fixture-r2-live"
            case .scrambleLiveCompletePending: "fixture-r2-live-complete-pending"
            case .scrambleFinal: "fixture-r2-final"
            case .singlesUpcoming: "fixture-r3-scheduled"
            case .singlesLive: "fixture-r3-live"
            case .singlesFinal: "fixture-r3-final"
            case .singlesOffline: "fixture-r3-offline"
            }
        }

        var format: String {
            switch self {
            case .bestBallUpcoming, .bestBallLive, .bestBallFinal: "Best Ball"
            case .scrambleUpcoming, .scrambleLive, .scrambleLiveCompletePending, .scrambleFinal:
                "Scramble"
            case .singlesUpcoming, .singlesLive, .singlesFinal, .singlesOffline: "Singles"
            }
        }

        var round: Int {
            switch self {
            case .bestBallUpcoming, .bestBallLive, .bestBallFinal: 1
            case .scrambleUpcoming, .scrambleLive, .scrambleLiveCompletePending, .scrambleFinal: 2
            case .singlesUpcoming, .singlesLive, .singlesFinal, .singlesOffline: 3
            }
        }

        var index: Int {
            switch self {
            case .bestBallUpcoming, .scrambleUpcoming, .singlesUpcoming: 1
            case .bestBallLive, .scrambleLive, .scrambleLiveCompletePending, .singlesLive: 2
            case .bestBallFinal, .scrambleFinal, .singlesFinal, .singlesOffline: 3
            }
        }

        var status: String {
            switch self {
            case .bestBallUpcoming, .scrambleUpcoming, .singlesUpcoming: "Upcoming"
            case .bestBallLive, .scrambleLive, .scrambleLiveCompletePending, .singlesLive: "Live"
            case .bestBallFinal, .scrambleFinal, .singlesFinal, .singlesOffline: "Final"
            }
        }

        var isUpcoming: Bool { index == 1 }

        var isOwned: Bool {
            switch self {
            case .bestBallLive, .scrambleUpcoming, .scrambleLiveCompletePending, .scrambleFinal,
                 .singlesLive, .singlesFinal, .singlesOffline:
                true
            case .bestBallUpcoming, .bestBallFinal, .scrambleLive,
                 .singlesUpcoming:
                false
            }
        }

        var isSupplemental: Bool {
            self == .scrambleLiveCompletePending || self == .singlesOffline
        }
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testEveryDirectFixturePreservesCanonicalFormatLifecycleAndIdentity() {
        for scenario in Scenario.allCases where !scenario.isSupplemental {
            XCTContext.runActivity(named: scenario.rawValue) { _ in
                let app = launch(scenario)

                XCTAssertTrue(app.tabBars.buttons["Matches"].isSelected)
                assertExists("matches.detail.\(scenario.matchID)", in: app)
                assertExists("match.gameCenter.tournament", in: app)
                assertSemanticText(
                    "match.gameCenter.context",
                    contains: ["Round \(scenario.round)", scenario.format, "Match \(scenario.index) of 3"],
                    in: app
                )
                assertSemanticText(
                    "matches.detail.status",
                    contains: [scenario.status],
                    in: app,
                    reachable: true
                )
                assertReachable("match.gameCenter.scoreboard", in: app)
                assertSemanticText(
                    "match.gameCenter.scoreboard.team.1",
                    contains: ["The Pickles"],
                    in: app,
                    reachable: true
                )
                assertSemanticText(
                    "match.gameCenter.scoreboard.team.2",
                    contains: ["Lipp it and Rip it"],
                    in: app,
                    reachable: true
                )
                assertReadOnlyGameCenter(in: app)

                app.terminate()
            }
        }
    }

    func testUpcomingOwnedAndNonOwnedStatesPreserveCourseAndHolePreview() {
        let nonOwned = launch(.bestBallUpcoming)
        assertReachable("match.gameCenter.backToMyMatch", in: nonOwned)
        XCTAssertFalse(element("match.gameCenter.previous", in: nonOwned).isEnabled)
        XCTAssertTrue(element("match.gameCenter.next", in: nonOwned).isEnabled)
        assertReachable("match.gameCenter.holeTracker", in: nonOwned)
        let upcomingHole = reachableElement("match.gameCenter.hole.18", in: nonOwned, requireHittable: true)
        XCTAssertTrue(upcomingHole.isEnabled)
        upcomingHole.tap()
        XCTAssertTrue(upcomingHole.isSelected)
        assertSemanticText("match.gameCenter.selectedHole", contains: ["Hole 18"], in: nonOwned, reachable: true)
        assertSemanticText("match.gameCenter.selectedHole.facts", contains: ["Par", "456", "Stroke Index", "18"], in: nonOwned, reachable: true)
        assertReachable("match.gameCenter.selectedHole.awaitingScores", in: nonOwned)
        assertReachable("match.gameCenter.flow", in: nonOwned)
        let upcomingScorecard = reachableButton(labelContaining: "Hole-by-Hole Scorecard", in: nonOwned)
        upcomingScorecard.tap()
        assertSemanticText("match.gameCenter.scorecard.front", contains: ["Not played"], in: nonOwned, reachable: true)
        upcomingScorecard.tap()
        assertReachable("match.gameCenter.course", in: nonOwned)
        XCTAssertFalse(element("match.gameCenter.stats", in: nonOwned).exists)
        nonOwned.terminate()

        let owned = launch(.scrambleUpcoming)
        XCTAssertFalse(element("match.gameCenter.backToMyMatch", in: owned).exists)
        assertSemanticText(
            "match.gameCenter.scoreboard.team.1",
            contains: ["Team Playing Handicap 3.0", "2 team strokes", "your team"],
            in: owned
        )
        assertSemanticText(
            "match.gameCenter.scoreboard.team.2",
            contains: ["Team Playing Handicap 1.0", "No team strokes"],
            in: owned
        )
        assertReachable("match.gameCenter.holeTracker", in: owned)
        assertReachable("match.gameCenter.selectedHole.awaitingScores", in: owned)
        assertReachable("match.gameCenter.flow", in: owned)
        assertReachable("match.gameCenter.scorecard", in: owned)
        assertReachable("match.gameCenter.course", in: owned)
        assertReadOnlyGameCenter(in: owned)
    }

    func testUnplayedHoleSelectionPreservesCourseFactsWithoutInventingScoresForEveryFormat() {
        for scenario in [Scenario.bestBallLive, .scrambleLive, .singlesLive, .singlesUpcoming] {
            XCTContext.runActivity(named: scenario.rawValue) { _ in
                let app = launch(scenario)
                let hole = reachableElement("match.gameCenter.hole.18", in: app, requireHittable: true)
                assertMinimumTouchTarget(hole, message: "Unplayed Hole 18 for \(scenario.rawValue)")
                XCTAssertTrue(hole.isEnabled)
                hole.tap()
                XCTAssertTrue(hole.isSelected)
                assertSemanticText("match.gameCenter.selectedHole", contains: ["Hole 18"], in: app, reachable: true)
                assertSemanticText("match.gameCenter.selectedHole.facts", contains: ["Par", "456", "Stroke Index", "18"], in: app, reachable: true)
                assertSemanticText("match.gameCenter.selectedHole.result", contains: ["Not played"], in: app, reachable: true)
                assertReachable("match.gameCenter.selectedHole.awaitingScores", in: app)
                XCTAssertFalse(element("match.gameCenter.selectedHole.side.1.card", in: app).exists)
                XCTAssertFalse(element("match.gameCenter.selectedHole.side.2.card", in: app).exists)
                assertReadOnlyGameCenter(in: app)
                app.terminate()
            }
        }
    }

    func testAuthoritative404RendersUnavailableWithoutStaleProtectedDetail() {
        let app = launch(.singlesFinal, additionalArguments: ["--bagger-match-detail-revoked"])

        assertExists("match.gameCenter.retry", in: app)
        XCTAssertTrue(app.staticTexts["This Match is unavailable for your current tournament access."].exists)
        for identifier in [
            "match.gameCenter.tournament", "match.gameCenter.scoreboard",
            "match.gameCenter.holeTracker", "match.gameCenter.selectedHole",
            "match.gameCenter.scorecard", "match.gameCenter.stats",
            "match.gameCenter.course", "match.gameCenter.freshness",
        ] {
            XCTAssertFalse(element(identifier, in: app).exists, "Revoked Match rendered \(identifier)")
        }
        assertReadOnlyGameCenter(in: app)
    }

    func testFinalClinchDefaultsToCanonicalHoleAndLaterHoleKeepsCanonicalStory() {
        let app = launch(.scrambleFinal)
        let clinchingHole = reachableElement("match.gameCenter.hole.13", in: app, requireHittable: true)
        XCTAssertTrue(clinchingHole.isSelected)
        XCTAssertTrue(clinchingHole.label.contains("clinching hole"))
        let laterHole = reachableElement("match.gameCenter.hole.18", in: app, requireHittable: true)
        XCTAssertTrue(laterHole.label.contains("current hole"))
        laterHole.tap()
        XCTAssertTrue(laterHole.isSelected)
        XCTAssertTrue(clinchingHole.label.contains("clinching hole"))
        XCTAssertFalse(clinchingHole.isSelected)
        assertSemanticText("match.gameCenter.selectedHole.result", contains: ["already decided on Hole 13"], in: app, reachable: true)
        assertReadOnlyGameCenter(in: app)
    }

    func testAllMatchFlowSegmentsCanBeSelected() {
        let app = launch(.scrambleFinal)
        for segment in ["front", "back", "overall"] {
            let control = reachableElement("match.gameCenter.flow.\(segment)", in: app, requireHittable: true)
            assertMinimumTouchTarget(control, message: "\(segment) Match Flow")
            control.tap()
            XCTAssertTrue(control.isSelected)
            assertSemanticText("match.gameCenter.flow.detail", contains: [segment], in: app, reachable: true)
        }
        assertReachable("match.gameCenter.clinch", in: app)
        assertReadOnlyGameCenter(in: app)
    }

    func testHoleTrackerKeepsIndependentTargetsAndTwoRowsOnSupportedPhoneWidths() {
        let app = launch(.bestBallLive)
        _ = reachableElement("match.gameCenter.hole.1", in: app, requireHittable: true)
        let holes = (1...18).map { element("match.gameCenter.hole.\($0)", in: app) }
        let frames = holes.map(\.frame)
        let window = app.windows.firstMatch.frame

        for (index, hole) in holes.enumerated() {
            XCTAssertTrue(hole.exists, "Hole \(index + 1) is missing")
            XCTAssertTrue(hole.isHittable, "Hole \(index + 1) is not tappable")
            assertMinimumTouchTarget(hole, message: "Hole \(index + 1)")
            XCTAssertGreaterThanOrEqual(frames[index].minX, window.minX - 0.01)
            XCTAssertLessThanOrEqual(frames[index].maxX, window.maxX + 0.01)
            for other in 0..<index {
                let overlap = frames[index].intersection(frames[other])
                XCTAssertTrue(overlap.isNull || overlap.width * overlap.height < 0.01,
                              "Hole \(index + 1) overlaps Hole \(other + 1)")
            }
        }
        if window.width >= 396 {
            for index in 0..<9 {
                XCTAssertEqual(frames[index].midY, frames[0].midY, accuracy: 0.01)
                XCTAssertEqual(frames[index + 9].midY, frames[9].midY, accuracy: 0.01)
            }
            XCTAssertGreaterThanOrEqual(frames[9].minY, frames[0].maxY)
        }
        assertReadOnlyGameCenter(in: app)
    }

    func testCourseInformationBottomClearsTheTabBarForEveryFormat() {
        for scenario in [Scenario.bestBallLive, .scrambleFinal, .singlesFinal] {
            XCTContext.runActivity(named: scenario.rawValue) { _ in
                let app = launch(scenario)
                let finalMetric = reachableElement(
                    "match.gameCenter.course.metric.slope", in: app, requireHittable: true
                )
                let tabBar = app.tabBars.firstMatch
                XCTAssertTrue(tabBar.exists)
                XCTAssertLessThanOrEqual(finalMetric.frame.maxY, tabBar.frame.minY + 0.01,
                                         "Course Information was obscured by the tab bar")
                assertSemanticText("match.gameCenter.course", contains: ["Yardage", "Par", "Rating", "Slope"],
                                   in: app, reachable: true)
                assertReadOnlyGameCenter(in: app)
                app.terminate()
            }
        }
    }

    func testVisualEvidenceForCompleteNativeGameCenterModules() {
        for scenario in [Scenario.bestBallLive, .scrambleFinal, .singlesFinal] {
            let app = launch(scenario, acceptanceProbes: false)
            func capture(_ section: String) {
                let attachment = XCTAttachment(screenshot: app.screenshot())
                attachment.name = "GameCenter-\(scenario.rawValue)-\(section)"
                attachment.lifetime = .keepAlways
                add(attachment)
            }
            capture("top")
            captureAnchor("match.gameCenter.hole.13", in: app)
            capture("hole-tracker")
            captureAnchor("match.gameCenter.selectedHole.facts", in: app)
            capture("selected-hole")
            // Move below the selector first so every format also exercises
            // recovery from overscroll, not just downward navigation.
            captureAnchor("match.gameCenter.scorecard.toggle", in: app)
            captureAnchor("match.gameCenter.flow.overall", in: app)
            capture("match-flow")
            captureAnchor("match.gameCenter.scorecard.toggle", in: app).tap()
            XCTAssertTrue(element("match.gameCenter.scorecard.front", in: app).exists)
            captureAnchor("match.gameCenter.scorecard.front.label.holes", in: app)
            capture("scorecard")
            captureAnchor("match.gameCenter.scorecard.toggle", in: app).tap()
            XCTAssertFalse(element("match.gameCenter.scorecard.front", in: app).exists)
            captureAnchor("match.gameCenter.course.metric.slope", in: app)
            capture("stats-and-course")
            assertReadOnlyGameCenter(in: app)
            app.terminate()
        }
    }

    func testScorecardCanCollapseAndReopenWithoutLosingOfficialRows() {
        for scenario in [Scenario.bestBallLive, .scrambleFinal, .singlesFinal] {
            let app = launch(scenario)
            let disclosure = reachableButton(labelContaining: "Hole-by-Hole Scorecard", in: app)
            disclosure.tap()
            let row = reachableElement("match.gameCenter.scorecard.front.cell.par.hole.3", in: app, requireHittable: true)
            XCTAssertTrue(row.isHittable)

            // DisclosureGroup's accessibility button can include its expanded
            // content bounds. Target the actual visible title, as a user does,
            // instead of trying to fit eighteen rows into one viewport.
            let header = app.staticTexts["Hole-by-Hole Scorecard"].firstMatch
            XCTAssertTrue(header.exists)
            let scroll = app.scrollViews.firstMatch
            let top = app.navigationBars.firstMatch.frame.maxY
            let bottom = app.tabBars.firstMatch.frame.minY
            for _ in 0..<18 {
                let frame = header.frame
                if header.isHittable, frame.minY > top, frame.maxY < bottom { break }
                if frame.minY <= top { scroll.swipeDown() } else { scroll.swipeUp() }
            }
            XCTAssertGreaterThan(header.frame.minY, top)
            XCTAssertLessThan(header.frame.maxY, bottom)
            header.tap()
            XCTAssertFalse(element("match.gameCenter.scorecard.front", in: app).exists)
            header.tap()
            XCTAssertTrue(element("match.gameCenter.scorecard.front", in: app).waitForExistence(timeout: 3))
            assertReadOnlyGameCenter(in: app)
            app.terminate()
        }
    }

    func testLiveBestBallScrambleAndSinglesExposeCanonicalHoleIntelligence() {
        let scenarios: [(scenario: Scenario, through: Int)] = [
            (.bestBallLive, 12),
            (.scrambleLive, 9),
            (.singlesLive, 7),
        ]
        for item in scenarios {
            let scenario = item.scenario
            XCTContext.runActivity(named: scenario.rawValue) { _ in
                let app = launch(scenario)

                assertSemanticText(
                    "match.gameCenter.scoreboard.progress",
                    contains: ["Through \(item.through)"],
                    in: app,
                    reachable: true
                )
                assertReachable("match.gameCenter.holeTracker", in: app)
                let selectedHole = reachableElement(
                    "match.gameCenter.hole.\(item.through)",
                    in: app,
                    requireHittable: true
                )
                assertMinimumTouchTarget(selectedHole, message: "Selected hole for \(scenario.rawValue)")
                XCTAssertTrue(selectedHole.isSelected, "Canonical current hole did not expose selected semantics.")

                if scenario != .scrambleLive {
                    let holeOne = reachableElement(
                        "match.gameCenter.hole.1",
                        in: app,
                        requireHittable: true
                    )
                    assertMinimumTouchTarget(holeOne, message: "Hole 1 for \(scenario.rawValue)")
                    holeOne.tap()
                    XCTAssertTrue(holeOne.isSelected, "Hole 1 did not retain selected semantics.")
                }

                assertReachable("match.gameCenter.selectedHole", in: app)
                assertSemanticText(
                    "match.gameCenter.selectedHole.side.1.card",
                    contains: ["The Pickles", "Gross", "Net"],
                    in: app,
                    reachable: true
                )
                assertSemanticText(
                    "match.gameCenter.selectedHole.side.2.card",
                    contains: ["Lipp it and Rip it", "Gross", "stroke", "Net"],
                    in: app,
                    reachable: true
                )
                if scenario == .bestBallLive {
                    assertSemanticText(
                        "match.gameCenter.selectedHole.side.1.card",
                        contains: [
                            "Gross unavailable",
                            "applied strokes unavailable",
                            "no applied strokes",
                        ],
                        in: app,
                        reachable: true
                    )
                }
                assertReachable("match.gameCenter.flow", in: app)
                assertReachable("match.gameCenter.scorecard", in: app)
                assertReachable("match.gameCenter.stats", in: app)
                assertReachable("match.gameCenter.course", in: app)
                assertReadOnlyGameCenter(in: app)

                app.terminate()
            }
        }
    }

    func testFinalScorecardDisclosureAndCanonicalScrambleClinchAreReadOnly() {
        let app = launch(.scrambleFinal)

        assertSemanticText("matches.detail.status", contains: ["Final"], in: app)
        let scorecardButton = reachableButton(labelContaining: "Final Scorecard", in: app)
        scorecardButton.tap()
        assertReachable("match.gameCenter.scorecard.front", in: app)
        assertSemanticText(
            "match.gameCenter.scorecard",
            contains: ["Confirmed scores", "Scorecard confirmed"],
            in: app,
            reachable: true
        )
        assertReadOnlyGameCenter(in: app)
        app.terminate()

        let clinchApp = launch(.scrambleFinal)
        assertReachable("match.gameCenter.clinch", in: clinchApp)
        assertSemanticText(
            "match.gameCenter.clinch",
            contains: ["The Pickles", "Hole 13", "clinched"],
            in: clinchApp,
            reachable: true
        )
        assertReadOnlyGameCenter(in: clinchApp)
    }

    func testHalvedAndHoleEighteenFinalResultsPreserveDistinctCanonicalSemantics() {
        let halved = launch(.bestBallFinal)
        assertSemanticText(
            "match.gameCenter.scoreboard.result",
            contains: ["Halved"],
            in: halved,
            reachable: true
        )
        assertReadOnlyGameCenter(in: halved)
        halved.terminate()

        let holeEighteenDecision = launch(.singlesFinal)
        assertSemanticText(
            "match.gameCenter.scoreboard.result",
            contains: ["1 UP"],
            in: holeEighteenDecision,
            reachable: true
        )
        assertReachable("match.gameCenter.flow", in: holeEighteenDecision)
        XCTAssertFalse(
            element("match.gameCenter.clinch", in: holeEighteenDecision).exists,
            "A normal Hole 18 decision was incorrectly presented as an early clinch."
        )
        assertReadOnlyGameCenter(in: holeEighteenDecision)
    }

    func testLiveCompletePendingKeepsLiveClinchWithoutConfirmedScorecardCopy() {
        let app = launch(.scrambleLiveCompletePending)

        assertSemanticText(
            "matches.detail.status",
            contains: ["Live"],
            excludes: ["Final"],
            in: app,
            reachable: true
        )
        assertSemanticText(
            "match.gameCenter.clinch",
            contains: ["The Pickles", "Hole 13", "clinched"],
            in: app,
            reachable: true
        )
        assertSemanticText(
            "match.gameCenter.scorecard",
            contains: ["Official scores in progress"],
            excludes: ["Confirmed scores", "Scorecard confirmed"],
            in: app,
            reachable: true
        )
        XCTAssertEqual(
            app.staticTexts.matching(labelContaining: "Scorecard confirmed").count,
            0,
            "A live Match awaiting confirmation exposed confirmed-state copy."
        )
        assertReadOnlyGameCenter(in: app)
    }

    func testPreviousNextAndBackToMyMatchReplaceTheCanonicalDetail() {
        let app = launch(.bestBallLive)

        let previous = element("match.gameCenter.previous", in: app)
        XCTAssertTrue(previous.waitForExistence(timeout: 3))
        XCTAssertTrue(previous.isEnabled)
        previous.tap()
        assertExists("matches.detail.fixture-r1-upcoming", in: app)
        XCTAssertFalse(element("match.gameCenter.previous", in: app).isEnabled)

        let next = element("match.gameCenter.next", in: app)
        XCTAssertTrue(next.isEnabled)
        next.tap()
        assertExists("matches.detail.fixture-r1-live", in: app)
        element("match.gameCenter.next", in: app).tap()
        assertExists("matches.detail.fixture-r1-final", in: app)
        XCTAssertFalse(element("match.gameCenter.next", in: app).isEnabled)

        let backToMyMatch = reachableElement(
            "match.gameCenter.backToMyMatch",
            in: app,
            requireHittable: true
        )
        backToMyMatch.tap()
        assertExists("matches.detail.fixture-r1-live", in: app)
        XCTAssertFalse(element("match.gameCenter.backToMyMatch", in: app).exists)
        assertReadOnlyGameCenter(in: app)
    }

    func testSiblingNavigationResetsHoleFlowAndScorecardPresentationState() {
        let app = launch(.bestBallLive)

        assertDefaultPresentationState(
            selectedHole: 12,
            in: app,
            message: "Live Match did not start from its canonical default presentation state."
        )
        selectFrontFlowAndExpandScorecard(in: app)
        scrollToTop(in: app, untilHittable: "match.gameCenter.next")
        element("match.gameCenter.next", in: app).tap()
        assertExists("matches.detail.fixture-r1-final", in: app)
        assertDefaultPresentationState(
            selectedHole: 18,
            in: app,
            message: "Next Match retained presentation state from the prior Match."
        )

        selectFrontFlowAndExpandScorecard(in: app)
        scrollToTop(in: app, untilHittable: "match.gameCenter.previous")
        element("match.gameCenter.previous", in: app).tap()
        assertExists("matches.detail.fixture-r1-live", in: app)
        assertDefaultPresentationState(
            selectedHole: 12,
            in: app,
            message: "Previous Match retained presentation state from the prior Match."
        )
        assertReadOnlyGameCenter(in: app)
    }

    func testBestBallAndSinglesUseParticipantPlayingHandicapSemantics() {
        for scenario in [Scenario.bestBallLive, .singlesFinal] {
            XCTContext.runActivity(named: scenario.rawValue) { _ in
                let app = launch(scenario)
                assertSemanticText(
                    "match.gameCenter.scoreboard.team.1",
                    contains: ["Playing Handicap", "No strokes"],
                    excludes: ["Course Handicap", "Team Playing Handicap"],
                    in: app
                )
                assertSemanticText(
                    "match.gameCenter.scoreboard.team.2",
                    contains: ["Playing Handicap", "1 stroke"],
                    excludes: ["Course Handicap", "Team Playing Handicap"],
                    in: app
                )
                assertReadOnlyGameCenter(in: app)
                app.terminate()
            }
        }
    }

    func testScrambleKeepsParticipantNamesButShowsOnlyTeamHandicapAndStrokes() {
        let app = launch(.scrambleUpcoming)
        assertSemanticText(
            "match.gameCenter.scoreboard.team.1",
            contains: ["Clay Beltran", "Jordan Lee", "Team Playing Handicap 3.0", "2 team strokes"],
            excludes: ["Playing Handicap (2.8)", "Playing Handicap 11.3", "HCP 0.0"],
            in: app
        )
        assertSemanticText(
            "match.gameCenter.scoreboard.team.2",
            contains: ["Taylor Kim", "Cameron Diaz", "Team Playing Handicap 1.0", "No team strokes"],
            excludes: ["Playing Handicap 8.0", "HCP 0.0"],
            in: app
        )
        assertReadOnlyGameCenter(in: app)
    }

    func testProfileOpensNativePassportAndReturnsToExactMatch() {
        let app = launch(.bestBallLive)
        let profile = element("matches.detail.profile", in: app)
        XCTAssertTrue(profile.waitForExistence(timeout: 3))
        XCTAssertTrue(profile.isHittable)
        profile.tap()

        assertExists("passport.screen", in: app)
        XCTAssertTrue(app.tabBars.buttons["More"].isSelected)
        navigateBack(in: app)
        assertExists("more.screen", in: app)
        // Passport follows the established More-tab flow. Returning to the
        // caller's tab must preserve that tab's exact Match navigation stack.
        app.tabBars.buttons["Matches"].tap()
        assertExists("matches.detail.fixture-r1-live", in: app)
        assertReadOnlyGameCenter(in: app)
    }

    func testAccessibilityXXXLKeepsNavigationAndHoleControlsUsable() throws {
        let app = launch(
            .bestBallLive,
            additionalArguments: [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityXXXL",
            ]
        )

        assertExists("matches.detail.profile", in: app)
        for identifier in ["match.gameCenter.previous", "match.gameCenter.next"] {
            let control = element(identifier, in: app)
            XCTAssertTrue(control.waitForExistence(timeout: 3), identifier)
            XCTAssertGreaterThanOrEqual(control.frame.height, 44, identifier)
        }
        let firstHole = reachableElement(
            "match.gameCenter.hole.1",
            in: app,
            requireHittable: true
        )
        assertMinimumTouchTarget(firstHole, message: "Hole 1 at accessibility XXXL")
        firstHole.tap()
        XCTAssertTrue(firstHole.label.localizedCaseInsensitiveContains("official"), firstHole.label)
        XCTAssertTrue(firstHole.label.localizedCaseInsensitiveContains("selected"), firstHole.label)

        assertSemanticText("match.gameCenter.selectedHole.facts", contains: ["Par", "Stroke Index"],
                           in: app, reachable: true)
        for segment in ["front", "back", "overall"] {
            let control = reachableElement("match.gameCenter.flow.\(segment)", in: app, requireHittable: true)
            assertMinimumTouchTarget(control, message: "\(segment) Match Flow at accessibility XXXL")
            XCTAssertGreaterThanOrEqual(control.frame.minX, app.windows.firstMatch.frame.minX)
            XCTAssertLessThanOrEqual(control.frame.maxX, app.windows.firstMatch.frame.maxX)
            control.tap()
            XCTAssertTrue(control.isSelected)
        }

        let scorecard = reachableButton(labelContaining: "Hole-by-Hole Scorecard", in: app)
        scorecard.tap()
        assertSemanticText(
            "match.gameCenter.scorecard.front",
            contains: [
                "Gross unavailable",
                "applied strokes unavailable",
                "no applied strokes",
            ],
            in: app,
            reachable: true
        )
        assertReadOnlyGameCenter(in: app)
        app.terminate()

        if #available(iOS 17.0, *) {
            let auditApp = launch(
                .bestBallLive,
                additionalArguments: [
                    "-UIPreferredContentSizeCategoryName",
                    "UICTContentSizeCategoryAccessibilityXXXL",
                ],
                acceptanceProbes: false
            )
            try auditApp.performAccessibilityAudit(for: [.textClipped])
        }
    }

    func testOfflineSavedMatchRemainsVisibleWithExplicitStaleContext() {
        let app = launch(.singlesOffline)

        assertSemanticText(
            "match.gameCenter.freshness",
            contains: ["Offline", "last saved Match details"],
            in: app,
            reachable: true
        )
        assertReachable("match.gameCenter.scoreboard", in: app)
        assertReachable("match.gameCenter.holeTracker", in: app)
        assertReachable("match.gameCenter.scorecard", in: app)
        assertReadOnlyGameCenter(in: app)
    }

    func testTodayMatchNavigationReturnsToTodayAfterCanonicalSiblingReplacement() {
        let app = launchToday()

        let currentMatch = reachableElement(
            "today.currentMatch.fixture-r2-owned",
            in: app,
            requireHittable: true,
            scrollViewIdentifier: "today.screen"
        )
        currentMatch.tap()
        assertExists("matches.detail.fixture-r2-owned", in: app)
        assertExists("matches.detail.profile", in: app)
        navigateBack(in: app)
        assertExists("today.screen", in: app)
        XCTAssertTrue(app.tabBars.buttons["Today"].isSelected)

        reachableElement(
            "today.currentMatch.fixture-r2-owned",
            in: app,
            requireHittable: true,
            scrollViewIdentifier: "today.screen"
        ).tap()
        let next = element("match.gameCenter.next", in: app)
        XCTAssertTrue(next.waitForExistence(timeout: 3))
        XCTAssertTrue(next.isEnabled)
        next.tap()
        assertExists("matches.detail.fixture-r2-live", in: app)
        navigateBack(in: app)
        assertExists("today.screen", in: app)
        XCTAssertTrue(app.tabBars.buttons["Today"].isSelected)

        let personalMatch = reachableElement(
            "today.personalMatch.fixture-r1-final",
            in: app,
            requireHittable: true,
            scrollViewIdentifier: "today.screen"
        )
        personalMatch.tap()
        assertExists("matches.detail.fixture-r1-final", in: app)
        navigateBack(in: app)
        assertExists("today.screen", in: app)
        XCTAssertTrue(app.tabBars.buttons["Today"].isSelected)
    }

    private func launch(
        _ scenario: Scenario,
        additionalArguments: [String] = [],
        acceptanceProbes: Bool = true
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["--bagger-ui-testing"]
        if acceptanceProbes {
            app.launchArguments += ["--bagger-acceptance-probes"]
        }
        app.launchArguments += [
            "--bagger-ui-test-scenario",
            "today.canonical-assets",
            "--bagger-match-detail-scenario",
            scenario.rawValue,
        ]
        app.launchArguments += additionalArguments
        app.launch()

        XCTAssertTrue(
            element("app.shell", in: app).waitForExistence(timeout: 10),
            "The deterministic Match Game Center fixture shell did not launch."
        )
        if additionalArguments.contains("--bagger-match-detail-revoked") {
            XCTAssertTrue(element("match.gameCenter.retry", in: app).waitForExistence(timeout: 6))
        } else if acceptanceProbes {
            XCTAssertTrue(
                element("matches.detail.\(scenario.matchID)", in: app).waitForExistence(timeout: 6),
                "Direct fixture navigation did not open \(scenario.matchID)."
            )
        } else {
            XCTAssertTrue(
                element("matches.detail.profile", in: app).waitForExistence(timeout: 6),
                "Direct fixture navigation did not expose the native Match toolbar."
            )
        }
        return app
    }

    private func launchToday() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "--bagger-ui-testing",
            "--bagger-acceptance-probes",
            "--bagger-ui-test-scenario",
            "today.canonical-assets",
        ]
        app.launch()

        XCTAssertTrue(element("app.shell", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(element("today.screen", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Today"].isSelected)
        return app
    }

    private func assertReadOnlyGameCenter(in app: XCUIApplication) {
        for identifier in [
            "score.screen",
            "score.controls",
            "score.saveNext",
            "score.finalize",
            "score.finalization",
            "scorecard.screen",
        ] {
            XCTAssertFalse(
                element(identifier, in: app).exists,
                "Read-only Match Detail exposed scoring control \(identifier)."
            )
        }
        for label in ["Finalize Match", "Save & Next", "Submit Score", "Correct Score"] {
            XCTAssertFalse(
                app.buttons[label].exists,
                "Read-only Match Detail exposed mutation action \(label)."
            )
        }
        XCTAssertEqual(app.webViews.count, 0, "Native Match Detail exposed a web rendering surface.")
    }

    private func assertExists(
        _ identifier: String,
        in app: XCUIApplication,
        timeout: TimeInterval = 5
    ) {
        XCTAssertTrue(
            element(identifier, in: app).waitForExistence(timeout: timeout),
            "Expected accessibility identifier \(identifier) was missing."
        )
    }

    private func assertReachable(_ identifier: String, in app: XCUIApplication) {
        _ = reachableElement(identifier, in: app)
    }

    /// Screenshot anchors are small, real UI elements. Unlike an entire expanded
    /// section, their bounds can fit between the navigation and tab bars.
    @discardableResult
    private func captureAnchor(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        let target = element(identifier, in: app)
        let screen = app.scrollViews["matches.detail"].exists
            ? app.scrollViews["matches.detail"] : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists)
        for _ in 0..<32 {
            let top = max(screen.frame.minY, app.navigationBars.firstMatch.frame.maxY) + 8
            let bottom = min(screen.frame.maxY, app.tabBars.firstMatch.frame.minY) - 8
            let height = bottom - top
            guard height > 100 else {
                XCTFail("No usable Game Center viewport for \(identifier).")
                return target
            }
            let frame = target.exists ? target.frame : .zero
            if target.exists, target.isHittable, frame.minY >= top, frame.maxY <= bottom {
                return target
            }
            let above = target.exists && frame.minY < top
            let distance = target.exists ? (above ? top - frame.minY : frame.maxY - bottom) : height
            let drag = min(height * 0.35, max(44, distance + 12))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let x = screen.frame.minX + screen.frame.width * 0.45
            let middle = (top + bottom) / 2
            let start = origin.withOffset(CGVector(dx: x, dy: middle))
            let end = origin.withOffset(CGVector(dx: x, dy: middle + (above ? drag : -drag)))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.05)
        }
        XCTFail("Screenshot anchor \(identifier) was not fully visible after bounded bidirectional scrolling.")
        return target
    }

    @discardableResult
    private func reachableElement(
        _ identifier: String,
        in app: XCUIApplication,
        requireHittable: Bool = false,
        scrollViewIdentifier: String = "matches.detail"
    ) -> XCUIElement {
        let target = element(identifier, in: app)
        if target.waitForExistence(timeout: 1), !requireHittable || target.isHittable {
            return target
        }

        let screen = app.scrollViews[scrollViewIdentifier].exists
            ? app.scrollViews[scrollViewIdentifier]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists, "Match Game Center scroll view was unavailable while finding \(identifier).")
        for _ in 0..<14 where !target.exists || (requireHittable && !target.isHittable) {
            screen.swipeUp()
        }
        XCTAssertTrue(target.exists, "Match Game Center element \(identifier) was not reachable.")
        if requireHittable {
            XCTAssertTrue(target.isHittable, "Match Game Center element \(identifier) was not tappable.")
        }
        return target
    }

    private func reachableButton(
        labelContaining value: String,
        in app: XCUIApplication
    ) -> XCUIElement {
        let button = app.buttons.matching(labelContaining: value).firstMatch
        if button.waitForExistence(timeout: 1), button.isHittable { return button }

        let screen = app.scrollViews["matches.detail"].exists
            ? app.scrollViews["matches.detail"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists)
        for _ in 0..<14 where !button.exists || !button.isHittable {
            screen.swipeUp()
        }
        XCTAssertTrue(button.exists, "Button containing \(value) was not reachable.")
        XCTAssertTrue(button.isHittable, "Button containing \(value) was not tappable.")
        return button
    }

    private func assertSemanticText(
        _ identifier: String,
        contains expectedValues: [String],
        excludes excludedValues: [String] = [],
        in app: XCUIApplication,
        reachable: Bool = false
    ) {
        let target = reachable
            ? reachableElement(identifier, in: app)
            : element(identifier, in: app)
        XCTAssertTrue(target.waitForExistence(timeout: 3), identifier)
        let matches = app.descendants(matching: .any).matching(identifier: identifier)
        let text = semanticText(of: matches.allElementsBoundByIndex)
        for value in expectedValues {
            XCTAssertTrue(
                text.localizedCaseInsensitiveContains(value),
                "\(identifier) did not contain \(value): \(text)"
            )
        }
        for value in excludedValues {
            XCTAssertFalse(
                text.localizedCaseInsensitiveContains(value),
                "\(identifier) unexpectedly contained \(value): \(text)"
            )
        }
    }

    private func semanticText(of elements: [XCUIElement]) -> String {
        var values: [String] = []
        func collect(_ snapshot: any XCUIElementSnapshot) {
            values.append(contentsOf: [snapshot.label, snapshot.value as? String]
                .compactMap { $0 }.filter { !$0.isEmpty })
            snapshot.children.forEach(collect)
        }
        do {
            // Read one coherent accessibility tree rather than re-querying the
            // app separately for every cell in the expanded golf scorecard.
            for element in elements { collect(try element.snapshot()) }
        } catch {
            XCTFail("Could not read semantic presentation snapshot: \(error)")
        }
        return values.joined(separator: " · ")
    }

    private func navigateBack(in app: XCUIApplication) {
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "Match Game Center had no native Back control.")
        back.tap()
    }

    private func assertMinimumTouchTarget(_ element: XCUIElement, message: String) {
        // XCTest occasionally reports a 44-point frame as 43.99999999999994.
        let pixelTolerance = 0.01
        XCTAssertGreaterThanOrEqual(element.frame.width, 44 - pixelTolerance, "\(message) width")
        XCTAssertGreaterThanOrEqual(element.frame.height, 44 - pixelTolerance, "\(message) height")
    }

    private func selectFrontFlowAndExpandScorecard(in app: XCUIApplication) {
        scrollToTop(in: app, untilHittable: "match.gameCenter.previous")
        let front = reachableElement(
            "match.gameCenter.flow.front",
            in: app,
            requireHittable: true
        )
        front.tap()
        XCTAssertTrue(front.isSelected)

        let disclosure = reachableButton(labelContaining: "Hole-by-Hole Scorecard", in: app)
        disclosure.tap()
        assertReachable("match.gameCenter.scorecard.front", in: app)
    }

    private func assertDefaultPresentationState(
        selectedHole: Int,
        in app: XCUIApplication,
        message: String
    ) {
        let defaultHole = reachableElement(
            "match.gameCenter.hole.\(selectedHole)",
            in: app,
            requireHittable: true
        )
        XCTAssertTrue(defaultHole.isSelected, message)

        let overall = reachableElement(
            "match.gameCenter.flow.overall",
            in: app,
            requireHittable: true
        )
        XCTAssertTrue(overall.isSelected, message)

        assertReachable("match.gameCenter.scorecard", in: app)
        XCTAssertFalse(
            element("match.gameCenter.scorecard.front", in: app).exists,
            "\(message) Scorecard remained expanded."
        )
    }

    private func scrollToTop(
        in app: XCUIApplication,
        untilHittable identifier: String
    ) {
        let target = element(identifier, in: app)
        let screen = app.scrollViews["matches.detail"].exists
            ? app.scrollViews["matches.detail"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists)
        for _ in 0..<14 where !target.exists || !target.isHittable {
            screen.swipeDown()
        }
        XCTAssertTrue(target.exists, "Match Game Center element \(identifier) was not reachable from below.")
        XCTAssertTrue(target.isHittable, "Match Game Center element \(identifier) was not tappable from below.")
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }
}

private extension XCUIElementQuery {
    func matching(labelContaining value: String) -> XCUIElementQuery {
        matching(NSPredicate(format: "label CONTAINS[c] %@", value))
    }
}
