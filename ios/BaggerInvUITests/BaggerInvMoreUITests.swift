import XCTest

@MainActor
final class BaggerInvMoreUITests: XCTestCase {
    private enum Scenario: String {
        case more = "more.standard"
        case signOutWarning = "more.signout-warning"
        case schedule = "schedule.standard"
        case scheduleCachedOffline = "schedule.cached-offline"
        case scheduleEmpty = "schedule.empty"
        case today = "today.standard"
        case passportEmpty = "more.passport-empty"
        case guideUnpublished = "more.guide-unpublished"
        case oddsUnpublished = "more.odds-unpublished"
        case historyCurrent = "more.history-current"
        case recordsTied = "more.records-tied"
        case longContent = "more.long-content"
        case cachedOffline = "more.cached-offline"
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testMoreDirectoryExposesEveryNativeDestinationAndSection() {
        let app = launch(.more)

        for section in ["tournament", "my-bagger", "competition", "local", "app"] {
            assertReachable("more.section.\(section)", in: app)
        }
        for destination in [
            "schedule", "tournament-guide", "courses", "rules", "passport", "history",
            "records", "odds", "dining", "local-guide", "contacts", "settings",
        ] {
            assertReachable("more.destination.\(destination)", in: app)
        }
    }

    func testEveryDirectoryRowRoutesToANativeScreen() {
        let routes: [(String, String)] = [
            ("schedule", "schedule.screen"),
            ("tournament-guide", "guide.screen"),
            ("courses", "courses.screen"),
            ("rules", "rules.screen"),
            ("passport", "passport.screen"),
            ("history", "history.screen"),
            ("records", "records.screen"),
            ("odds", "odds.screen"),
            ("dining", "dining.screen"),
            ("local-guide", "localGuide.screen"),
            ("contacts", "contacts.screen"),
            ("settings", "settings.screen"),
        ]
        let app = launch(.more)

        for (destination, expectedScreen) in routes {
            XCTContext.runActivity(named: destination) { _ in
                let row = reachable("more.destination.\(destination)", in: app, requireHittable: true)
                row.tap()
                XCTAssertTrue(
                    element(expectedScreen, in: app).waitForExistence(timeout: 5),
                    "The \(destination) row did not open its native destination."
                )
                navigateBackToMore(in: app)
            }
        }
    }

    func testPassportShowsCanonicalModulesAndNativeDrillDowns() {
        let app = launch(.more)
        openHomeDestination("passport", in: app)

        assertReachable("passport.hero", in: app)
        assertReachable("passport.currentTournament", in: app)
        assertReachable("passport.careerSummary", in: app)
        assertReachable("passport.holePerformance", in: app)
        assertReachable("passport.matchProgression", in: app)
        assertReachable("passport.draft.2026", in: app)
        let tiedRoundRank = reachable("passport.metric.round-2-rank", in: app)
        XCTAssertTrue(tiedRoundRank.label.localizedCaseInsensitiveContains("tied for rank 2"))
        let tiedPartner = reachable("passport.partner.fixture-player-d", in: app)
        XCTAssertTrue(tiedPartner.label.localizedCaseInsensitiveContains("tied for rank 2"))
        XCTAssertFalse(element(labelContaining: "Player ID", in: app).exists)

        openNestedDestination(
            "passport.open.tournamentHistory",
            screen: "passport.history.screen",
            in: app
        )
        assertReachable("passport.history.2026", in: app)
        navigateBack(named: "Player Passport", in: app)

        openNestedDestination("passport.open.format.SC", screen: "passport.format.screen", in: app)
        let match = reachable("passport.format.match.fixture-sc-match", in: app)
        XCTAssertTrue(match.label.localizedCaseInsensitiveContains("Pines vs Dunes"))
        XCTAssertTrue(match.label.localizedCaseInsensitiveContains("Winner"))
        XCTAssertTrue(match.label.localizedCaseInsensitiveContains("Overall"))
        navigateBack(named: "Player Passport", in: app)

        openNestedDestination(
            "passport.open.captainLegacy",
            screen: "passport.captain.screen",
            in: app
        )
        assertReachable("passport.captain.2024", in: app)
    }

    func testGuideProductsShowCanonicalContentAndIndividualExternalActions() {
        let app = launch(.more)
        openHomeDestination("tournament-guide", in: app)
        assertReachable("guide.hero", in: app)
        assertReachable("guide.overview.welcome", in: app)
        assertReachable("guide.open.courses", in: app)
        navigateBackToMore(in: app)

        openHomeDestination("courses", in: app)
        reachable("courses.course.ocean-course", in: app, requireHittable: true).tap()
        XCTAssertTrue(element("course.detail.ocean-course", in: app).waitForExistence(timeout: 5))
        assertReachable("course.assignment.ocean-round-one", in: app)
        assertReachable("course.action.ocean-course-website", in: app)
        assertReachable("course.action.ocean-course-directions", in: app)
        navigateBack(named: "Courses", in: app)
        navigateBackToMore(in: app)

        openHomeDestination("rules", in: app)
        assertReachable("rules.format.1", in: app)
        assertReachable("rules.rule.pace-of-play", in: app)
        navigateBackToMore(in: app)

        openHomeDestination("dining", in: app)
        assertReachable("dining.entry.welcome-dinner", in: app)
        navigateBackToMore(in: app)

        openHomeDestination("local-guide", in: app)
        assertReachable("localGuide.entry.island-shuttle", in: app)
        assertReachable("localGuide.action.island-shuttle.island-shuttle-phone", in: app)
        assertReachable("localGuide.action.island-shuttle.island-shuttle-directions", in: app)
        assertReachable("localGuide.action.island-shuttle.island-shuttle-website", in: app)
        navigateBackToMore(in: app)

        openHomeDestination("contacts", in: app)
        assertReachable("contacts.entry.tournament-director", in: app)
        for action in ["call", "text", "email", "website"] {
            assertReachable(
                "contacts.action.tournament-director.tournament-director-\(action)",
                in: app
            )
        }
    }

    func testHistoryRecordsAndOddsShowCanonicalFixtureDetail() {
        let app = launch(.more)
        openHomeDestination("history", in: app)
        let archiveYear = reachable("history.year.2026", in: app, requireHittable: true)
        XCTAssertTrue(archiveYear.label.localizedCaseInsensitiveContains("Champion: Pines"))
        XCTAssertTrue(archiveYear.label.localizedCaseInsensitiveContains("Runner-up: Dunes"))
        XCTAssertTrue(archiveYear.label.contains("Pines"))
        XCTAssertTrue(archiveYear.label.contains("Dunes"))
        archiveYear.tap()
        XCTAssertTrue(element("history.detail.screen", in: app).waitForExistence(timeout: 5))
        assertReachable("history.team.fixture-team-green", in: app)
        assertReachable("history.round.1", in: app)
        assertReachable("history.match.fixture-history-match", in: app)
        assertReachable("history.scorecard.fixture-scorecard", in: app)
        XCTAssertTrue(
            element("history.scorecard.fixture-scorecard", in: app).label.contains("Alex Morgan")
        )
        navigateBack(named: "Tournament History", in: app)
        navigateBackToMore(in: app)

        openHomeDestination("records", in: app)
        assertReachable("records.coverage", in: app)
        assertReachable("records.category.INDIVIDUAL", in: app)
        assertReachable("records.record.career-wins", in: app)
        let scorecardRecord = reachable("records.record.low-round-even", in: app, requireHittable: true)
        scorecardRecord.tap()
        let scorecardHolder = app.staticTexts
            .matching(identifier: "records.record.low-round-even")
            .matching(NSPredicate(format: "label CONTAINS %@", "Even"))
            .firstMatch
        XCTAssertTrue(scorecardHolder.waitForExistence(timeout: 3))
        XCTAssertTrue(scorecardHolder.label.contains("Alex Morgan"))
        navigateBackToMore(in: app)

        openHomeDestination("odds", in: app)
        assertReachable("odds.snapshot.After Round 1", in: app)
        assertReachable("odds.publishedAt.After Round 1", in: app)
        assertReachable("odds.team.fixture-team-green", in: app)
        let projections = app.buttons["Player Projections"]
        XCTAssertTrue(projections.waitForExistence(timeout: 3))
        projections.tap()
        let player = reachable("odds.player.fixture-player-a", in: app)
        XCTAssertTrue(player.label.contains("+257"))
        XCTAssertTrue(player.label.localizedCaseInsensitiveContains("expected points"))
    }

    func testScheduleCommunicatesEndedNowAndNextWithoutColor() {
        let app = launch(.schedule)

        XCTAssertTrue(element("schedule.screen", in: app).waitForExistence(timeout: 5))
        assertEvent("fixture-breakfast", contains: "Ended", in: app)
        assertEvent("fixture-round", contains: "Now", in: app)
        assertEvent("fixture-dinner", contains: "Next", in: app)
        assertReachable("schedule.event.fixture-singles", in: app)
    }

    func testCachedOfflineScheduleKeepsEventsAndPersistentStatus() {
        let app = launch(.scheduleCachedOffline)

        assertReachable("schedule.offlineStatus", in: app)
        XCTAssertTrue(element("schedule.offlineStatus", in: app).label.localizedCaseInsensitiveContains("Offline"))
        assertReachable("schedule.event.fixture-round", in: app)
        assertReachable("schedule.event.fixture-dinner", in: app)
    }

    func testEmptyScheduleUsesCanonicalPublishedEmptyCopy() {
        let app = launch(.scheduleEmpty)

        let empty = reachable("schedule.empty", in: app)
        XCTAssertTrue(
            empty.label.contains("No schedule events are published yet."),
            "The native Schedule did not preserve the controlled empty-state copy."
        )
        XCTAssertFalse(element("schedule.retry", in: app).exists)
    }

    func testTodayViewFullScheduleMovesToMoreScheduleStack() {
        let app = launch(.today)

        let button = reachable("today.fullSchedule", in: app, requireHittable: true)
        button.tap()
        XCTAssertTrue(app.tabBars.buttons["More"].isSelected)
        XCTAssertTrue(element("schedule.screen", in: app).waitForExistence(timeout: 5))
    }

    func testSettingsUsesProtectedSignOutFlow() {
        let app = launch(.signOutWarning)
        reachable("more.destination.settings", in: app, requireHittable: true).tap()
        XCTAssertTrue(element("settings.screen", in: app).waitForExistence(timeout: 5))
        assertReachable("settings.previewEnvironment", in: app)
        assertReachable("settings.version", in: app)
        assertReachable("settings.passport", in: app)

        reachable("settings.signOut", in: app, requireHittable: true).tap()
        XCTAssertTrue(app.staticTexts["Unresolved scores"].waitForExistence(timeout: 3))
        XCTAssertTrue(element(labelContaining: "2 scores", in: app).exists)
        let keepWorking = app.buttons.matching(identifier: "score.signOut.keepWorking").firstMatch
        XCTAssertTrue(keepWorking.waitForExistence(timeout: 3))
        keepWorking.tap()
        XCTAssertTrue(element("settings.screen", in: app).waitForExistence(timeout: 3))

        reachable("settings.signOut", in: app, requireHittable: true).tap()
        let confirm = app.buttons.matching(identifier: "score.signOut.confirm").firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        XCTAssertTrue(element("score.signOut.confirmed", in: app).waitForExistence(timeout: 3))
    }

    func testControlledUnpublishedEmptyCurrentAndTiedVariants() {
        let emptyPassport = launch(.passportEmpty)
        openHomeDestination("passport", in: emptyPassport)
        XCTAssertTrue(element("passport.screen", in: emptyPassport).waitForExistence(timeout: 5))
        XCTAssertTrue(element(labelContaining: "New Golfer", in: emptyPassport).exists)
        reachable("passport.open.tournamentHistory", in: emptyPassport, requireHittable: true).tap()
        assertReachable("passport.history.empty", in: emptyPassport)

        let unpublishedGuide = launch(.guideUnpublished)
        openHomeDestination("tournament-guide", in: unpublishedGuide)
        let guideState = reachable("guide.unpublished", in: unpublishedGuide)
        XCTAssertTrue(guideState.label.localizedCaseInsensitiveContains("not published"))

        let unpublishedOdds = launch(.oddsUnpublished)
        openHomeDestination("odds", in: unpublishedOdds)
        let oddsState = reachable("odds.unpublished", in: unpublishedOdds)
        XCTAssertTrue(oddsState.label.localizedCaseInsensitiveContains("not available"))

        let currentHistory = launch(.historyCurrent)
        openHomeDestination("history", in: currentHistory)
        let currentYear = reachable("history.year.2026", in: currentHistory)
        XCTAssertTrue(currentYear.label.localizedCaseInsensitiveContains("In Progress"))

        let tiedRecords = launch(.recordsTied)
        openHomeDestination("records", in: tiedRecords)
        let tiedRecord = reachable("records.record.career-wins", in: tiedRecords)
        XCTAssertTrue(tiedRecord.label.localizedCaseInsensitiveContains("Tied"))
    }

    func testCachedOfflineFreshnessPersistsIntoPassportAndCourseDetails() {
        let app = launch(.cachedOffline)
        openHomeDestination("passport", in: app)
        reachable("passport.open.tournamentHistory", in: app, requireHittable: true).tap()
        XCTAssertTrue(element("passport.history.screen", in: app).waitForExistence(timeout: 5))
        let passportFreshness = reachable("passport.freshness", in: app)
        XCTAssertTrue(passportFreshness.label.localizedCaseInsensitiveContains("Offline"))
        navigateBack(named: "Player Passport", in: app)
        navigateBackToMore(in: app)

        openHomeDestination("courses", in: app)
        reachable("courses.course.ocean-course", in: app, requireHittable: true).tap()
        XCTAssertTrue(element("course.detail.ocean-course", in: app).waitForExistence(timeout: 5))
        let coursesFreshness = reachable("courses.freshness", in: app)
        XCTAssertTrue(coursesFreshness.label.localizedCaseInsensitiveContains("Offline"))
    }

    func testMoreAndScheduleRemainUsableAtAccessibilityXXXL() throws {
        let app = launch(
            .longContent,
            additionalArguments: [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityXXXL",
            ]
        )
        assertReachable("more.destination.schedule", in: app)
        assertReachable("more.destination.settings", in: app)
        for (destination, screen, content) in [
            ("passport", "passport.screen", "passport.hero"),
            ("rules", "rules.screen", "rules.format.1"),
            ("history", "history.screen", "history.year.2026"),
            ("odds", "odds.screen", "odds.snapshot.After Round 1"),
        ] {
            openHomeDestination(destination, in: app)
            XCTAssertTrue(element(screen, in: app).waitForExistence(timeout: 5))
            assertReachable(content, in: app)
            if destination == "history" {
                reachable("history.year.2026", in: app, requireHittable: true).tap()
                XCTAssertTrue(element("history.detail.screen", in: app).waitForExistence(timeout: 5))
                assertReachable("history.standing.fixture-player-a", in: app)
                if #available(iOS 17.0, *) {
                    try app.performAccessibilityAudit(for: [.textClipped])
                }
                navigateBack(named: "Tournament History", in: app)
            } else if #available(iOS 17.0, *) {
                try app.performAccessibilityAudit(for: [.textClipped])
            }
            navigateBackToMore(in: app)
        }
    }

    private func launch(
        _ scenario: Scenario,
        additionalArguments: [String] = []
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "--bagger-ui-testing",
            "--bagger-ui-test-scenario",
            scenario.rawValue,
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryL",
        ]
        app.launchArguments += additionalArguments
        app.launch()

        XCTAssertTrue(element("app.shell", in: app).waitForExistence(timeout: 10))
        if scenario == .today {
            XCTAssertTrue(app.tabBars.buttons["Today"].isSelected)
        } else {
            XCTAssertTrue(app.tabBars.buttons["More"].isSelected)
        }
        return app
    }

    private func assertEvent(
        _ eventID: String,
        contains status: String,
        in app: XCUIApplication
    ) {
        let event = reachable("schedule.event.\(eventID)", in: app)
        XCTAssertTrue(
            event.label.localizedCaseInsensitiveContains(status),
            "Schedule event \(eventID) did not expose its \(status) state to accessibility."
        )
    }

    private func navigateBackToMore(in app: XCUIApplication) {
        var back = app.navigationBars.buttons["More"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "A native destination did not expose a More back button.")
        back.tap()
        if !element("more.screen", in: app).waitForExistence(timeout: 3) {
            // A system notification can consume a synthesized device tap even
            // after XCTest reports the navigation control as hittable. Retry
            // only when the destination is still visibly on screen.
            back = app.navigationBars.buttons["More"].firstMatch
            if back.waitForExistence(timeout: 2), back.isHittable {
                back.tap()
            }
        }
        XCTAssertTrue(element("more.screen", in: app).waitForExistence(timeout: 5))
    }

    private func openHomeDestination(_ destination: String, in app: XCUIApplication) {
        let identifier = "more.destination.\(destination)"
        var target = reachable(identifier, in: app, requireHittable: true)
        let scrollView = app.scrollViews.firstMatch

        // At accessibility sizes a directory card can be taller than a
        // standard row. XCTest may call it hittable while its midpoint is
        // still underneath a navigation or tab bar, so move the midpoint into
        // the unobscured viewport before pressing it.
        for _ in 0..<4 where scrollView.exists {
            let navigationBottom = app.navigationBars.firstMatch.frame.maxY
            let tabBarTop = app.tabBars.firstMatch.frame.minY
            if target.frame.midY < navigationBottom + 24 {
                scrollView.swipeDown(velocity: .slow)
            } else if target.frame.midY > tabBarTop - 24 {
                scrollView.swipeUp(velocity: .slow)
            } else {
                break
            }
            target = element(identifier, in: app)
            XCTAssertTrue(target.waitForExistence(timeout: 2))
        }

        target.press(forDuration: 0.05)
    }

    private func openNestedDestination(
        _ identifier: String,
        screen: String,
        in app: XCUIApplication,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        for _ in 0..<2 {
            var destination = reachable(identifier, in: app, requireHittable: true)
            let navigationBottom = app.navigationBars.firstMatch.frame.maxY
            let tabBarTop = app.tabBars.firstMatch.frame.minY
            let scrollView = app.scrollViews.firstMatch
            if scrollView.exists, destination.frame.midY < navigationBottom + 24 {
                scrollView.swipeDown(velocity: .slow)
                destination = element(identifier, in: app)
            } else if scrollView.exists, destination.frame.midY > tabBarTop - 24 {
                scrollView.swipeUp(velocity: .slow)
                destination = element(identifier, in: app)
            }
            XCTAssertTrue(destination.waitForExistence(timeout: 2))
            // Long, scrollable Passport pages can still be decelerating when the
            // destination first becomes hittable. Keep it clear of the bars,
            // then use a short press so an otherwise valid tap is not lost.
            destination.press(forDuration: 0.05)
            if element(screen, in: app).waitForExistence(timeout: 5) { return }
        }
        XCTFail("Native destination \(identifier) did not open \(screen).", file: file, line: line)
    }

    private func navigateBack(named title: String, in app: XCUIApplication) {
        let back = app.navigationBars.buttons[title].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "The \(title) back button was missing.")
        back.tap()
    }

    private func assertReachable(
        _ identifier: String,
        in app: XCUIApplication,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(
            reachable(identifier, in: app).exists,
            "Expected \(identifier) to be reachable.",
            file: file,
            line: line
        )
    }

    private func reachable(
        _ identifier: String,
        in app: XCUIApplication,
        requireHittable: Bool = false
    ) -> XCUIElement {
        let target = element(identifier, in: app)
        if target.waitForExistence(timeout: 1), !requireHittable || target.isHittable { return target }

        for _ in 0..<8 {
            app.swipeDown()
            if target.exists, !requireHittable || target.isHittable { return target }
        }
        for _ in 0..<16 {
            app.swipeUp()
            if target.exists, !requireHittable || target.isHittable { return target }
        }
        return target
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    private func element(labelContaining fragment: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS[c] %@", fragment))
            .firstMatch
    }
}
