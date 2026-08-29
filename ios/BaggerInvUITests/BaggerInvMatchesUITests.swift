import XCTest

@MainActor
final class BaggerInvMatchesUITests: XCTestCase {
    private enum Scenario: String {
        case standard = "matches.standard"
        case noUserMatch = "matches.no-user-match"
        case cachedOffline = "matches.cached-offline"
        case emptyOffline = "matches.empty-offline"
        case longContent = "matches.long-content"
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testMatchesTabOpensWithRoundSelectorHeroAndCanonicalList() {
        let app = launch(.standard)

        assertExists("matches.screen", in: app)
        assertExists("matches.roundSelector", in: app)
        assertExists("matches.hero", in: app)
        assertExists("matches.allMatches", in: app)
        XCTAssertTrue(
            element("matches.round.number.2", in: app).isSelected,
            "The canonical current Round was not selected by default."
        )
    }

    func testRoundSwitchUpdatesContentAndNoUserMatchState() {
        let app = launch(.standard)
        let roundThree = element("matches.round.number.3", in: app)
        XCTAssertTrue(roundThree.waitForExistence(timeout: 3), "Round 3 was unavailable.")
        roundThree.tap()

        XCTAssertTrue(roundThree.isSelected, "Round 3 did not become selected.")
        assertReachable("matches.hero.empty", in: app)
        assertReachable("matches.card.fixture-r3-scheduled", in: app)

        app.terminate()
        let noUserApp = launch(.noUserMatch)
        assertReachable("matches.hero.empty", in: noUserApp)
        assertReachable("matches.allMatches", in: noUserApp)
    }

    func testMatchDetailOpensAndBackRetainsSelectedRound() {
        let app = launch(.standard)
        let roundOne = element("matches.round.number.1", in: app)
        XCTAssertTrue(roundOne.waitForExistence(timeout: 3), "Round 1 was unavailable.")
        roundOne.tap()
        XCTAssertTrue(roundOne.isSelected)

        let card = reachableElement(
            "matches.card.fixture-r1-final",
            in: app,
            requireHittable: true
        )
        XCTAssertTrue(card.isHittable, "The selected Round Match was not tappable.")
        card.tap()

        assertExists("matches.detail", in: app)
        assertExists("matches.detail.status", in: app)
        assertExists("matches.detail.sides", in: app)
        assertExists("matches.detail.result", in: app)

        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "Match Detail had no Back control.")
        back.tap()
        assertExists("matches.screen", in: app)
        XCTAssertTrue(
            element("matches.round.number.1", in: app).isSelected,
            "Returning from Match Detail reset the selected Round."
        )
    }

    func testCachedOfflineRetainsMatchesAndStaleNotice() {
        let app = launch(.cachedOffline)

        assertExists("matches.offlineStatus", in: app)
        assertExists("matches.hero", in: app)
        assertReachable("matches.allMatches", in: app)
        XCTAssertFalse(element("matches.retry", in: app).exists)
    }

    func testNoCacheOfflineShowsControlledRetryWithoutFabricatedMatches() {
        let app = launch(.emptyOffline)

        assertExists("matches.retry", in: app)
        XCTAssertFalse(element("matches.hero", in: app).exists)
        XCTAssertFalse(element("matches.allMatches", in: app).exists)
    }

    func testLongContentAndAccessibilityXXXLRemainUsable() throws {
        let app = launch(.longContent)
        assertReachable("matches.hero", in: app)
        assertReachable("matches.allMatches", in: app)

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.textClipped])
        }

        app.terminate()
        let largeApp = launch(
            .longContent,
            additionalArguments: [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityXXXL",
            ]
        )
        assertExists("matches.roundSelector", in: largeApp)
        assertReachable("matches.hero", in: largeApp)
        assertReachable("matches.allMatches", in: largeApp)
        if #available(iOS 17.0, *) {
            try largeApp.performAccessibilityAudit(for: [.textClipped])
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
        ]
        app.launchArguments += additionalArguments
        app.launch()

        XCTAssertTrue(
            element("app.shell", in: app).waitForExistence(timeout: 10),
            "The deterministic Matches fixture shell did not launch."
        )
        let matchesTab = app.tabBars.buttons["Matches"]
        XCTAssertTrue(matchesTab.waitForExistence(timeout: 5), "The Matches tab was missing.")
        matchesTab.tap()
        XCTAssertTrue(matchesTab.isSelected, "The Matches tab did not become selected.")
        XCTAssertTrue(
            element("matches.screen", in: app).waitForExistence(timeout: 5),
            "The native Matches destination did not appear."
        )
        return app
    }

    private func assertReachable(_ identifier: String, in app: XCUIApplication) {
        _ = reachableElement(identifier, in: app)
    }

    @discardableResult
    private func reachableElement(
        _ identifier: String,
        in app: XCUIApplication,
        requireHittable: Bool = false
    ) -> XCUIElement {
        let target = element(identifier, in: app)
        if target.waitForExistence(timeout: 1), !requireHittable || target.isHittable {
            return target
        }

        let screen = app.scrollViews["matches.screen"].exists
            ? app.scrollViews["matches.screen"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists, "The Matches scroll view was unavailable while finding \(identifier).")
        for _ in 0..<10 where !target.exists || (requireHittable && !target.isHittable) {
            screen.swipeUp()
        }
        XCTAssertTrue(target.exists, "The Matches element \(identifier) was not reachable.")
        if requireHittable {
            XCTAssertTrue(target.isHittable, "The Matches element \(identifier) was not tappable.")
        }
        return target
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

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }
}
