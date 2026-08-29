import XCTest

@MainActor
final class BaggerInvTodayUITests: XCTestCase {
    private enum Scenario: String {
        case standard = "today.standard"
        case live = "today.live"
        case final = "today.final"
        case noCurrentMatch = "today.no-current-match"
        case cachedOffline = "today.cached-offline"
        case emptyOffline = "today.empty-offline"
        case longContent = "today.long-content"
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testShellDefaultsToTodayAndExposesMajorSections() {
        let app = launch(.standard)

        assertExists("app.shell", in: app)
        assertExists("tab.today", in: app)
        assertExists("today.screen", in: app)
        XCTAssertTrue(app.tabBars.buttons["Today"].isSelected, "Today was not the default selected tab.")

        assertSection("today.tournamentContext", in: app)
        assertSection("today.matchHero", in: app)
        assertSection("today.yourMatches", in: app)
        assertSection("today.tournamentScore", in: app)
        assertSection("today.schedule", in: app)
    }

    func testCanonicalMatchStatusAndNoCurrentMatchVariants() {
        let variants: [(Scenario, String)] = [
            (.standard, "Current match, Upcoming"),
            (.live, "Current match, Live"),
            (.final, "Current match, Final"),
        ]

        for (scenario, expectedLabel) in variants {
            XCTContext.runActivity(named: scenario.rawValue) { _ in
                let app = launch(scenario)
                assertSection("today.matchHero", in: app)
                XCTAssertTrue(
                    element(label: expectedLabel, in: app).waitForExistence(timeout: 3),
                    "The fixture did not present the canonical \(expectedLabel) state."
                )
                app.terminate()
            }
        }

        let app = launch(.noCurrentMatch)
        assertSection("today.matchHero", in: app)
        XCTAssertTrue(
            element(labelContaining: "No current match", in: app).waitForExistence(timeout: 3),
            "The no-current-match fixture did not render its controlled empty state."
        )
    }

    func testCachedOfflineKeepsTodayVisibleWithPersistentStatus() {
        let app = launch(.cachedOffline)

        assertExists("today.offlineStatus", in: app)
        XCTAssertTrue(
            element(labelContaining: "Offline", in: app).waitForExistence(timeout: 3),
            "The cached-offline state did not explain that saved data remains visible."
        )
        assertSection("today.matchHero", in: app)
        assertSection("today.yourMatches", in: app)
        assertSection("today.tournamentScore", in: app)
        assertSection("today.schedule", in: app)
        XCTAssertFalse(element(labelContaining: "Today isn’t available right now", in: app).exists)
    }

    func testNoCacheOfflineShowsControlledUnavailableStateAndRetry() {
        let app = launch(.emptyOffline)

        XCTAssertTrue(
            element(labelContaining: "Today isn’t available right now", in: app)
                .waitForExistence(timeout: 5),
            "The no-cache state did not explain that Today was unavailable."
        )
        let retry = element("today.retry", in: app)
        XCTAssertTrue(retry.waitForExistence(timeout: 3), "The no-cache state did not offer a retry control.")
        XCTAssertTrue(retry.isEnabled, "The no-cache retry control was disabled.")
        XCTAssertFalse(element("today.offlineStatus", in: app).exists)
    }

    func testFiveTabShellUsesRestrainedPlaceholdersOutsideToday() {
        let app = launch(.standard)

        assertTab("Today", identifier: "tab.today", in: app)
        assertPlaceholderTab("Matches", identifier: "tab.matches", placeholder: "placeholder.matches", in: app)
        assertPlaceholderTab("Score", identifier: "tab.score", placeholder: "placeholder.score", in: app)
        assertPlaceholderTab("Leaders", identifier: "tab.leaders", placeholder: "placeholder.leaders", in: app)
        assertPlaceholderTab("More", identifier: "tab.more", placeholder: "placeholder.more", in: app)

        app.tabBars.buttons["Today"].tap()
        assertExists("tab.today", in: app)
        assertExists("today.screen", in: app)
    }

    func testLongContentRemainsReachableAndPassesBasicAccessibilityAudit() throws {
        let app = launch(.longContent)

        XCTAssertTrue(
            element(labelContaining: "Exceptionally Long Bagger Invitational", in: app)
                .waitForExistence(timeout: 3),
            "The long tournament name was not exposed to accessibility."
        )
        assertSection("today.matchHero", in: app)
        assertSection("today.schedule", in: app)

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.textClipped])
        }

        app.terminate()
        let accessibilitySizeApp = launch(
            .longContent,
            additionalArguments: [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityXXXL",
            ]
        )
        assertSection("today.tournamentContext", in: accessibilitySizeApp)
        assertSection("today.matchHero", in: accessibilitySizeApp)
        assertSection("today.schedule", in: accessibilitySizeApp)
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
            "The deterministic \(scenario.rawValue) fixture app shell did not launch."
        )
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5), "The five-tab app shell was not interactive.")
        XCTAssertTrue(app.tabBars.buttons["Today"].isSelected, "The fixture did not open on Today.")
        return app
    }

    private func assertPlaceholderTab(
        _ name: String,
        identifier: String,
        placeholder: String,
        in app: XCUIApplication
    ) {
        let button = app.tabBars.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 3), "The \(name) tab was missing.")
        button.tap()
        XCTAssertTrue(button.isSelected, "The \(name) tab did not become selected.")
        assertExists(identifier, in: app)
        assertExists(placeholder, in: app)
    }

    private func assertTab(_ name: String, identifier: String, in app: XCUIApplication) {
        let button = app.tabBars.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 3), "The \(name) tab was missing.")
        XCTAssertTrue(button.isSelected, "The \(name) tab was not selected.")
        assertExists(identifier, in: app)
    }

    private func assertSection(_ identifier: String, in app: XCUIApplication) {
        let section = element(identifier, in: app)
        if section.waitForExistence(timeout: 1) { return }

        let scrollView = app.scrollViews["today.screen"].exists
            ? app.scrollViews["today.screen"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(scrollView.exists, "The Today scroll view was unavailable while finding \(identifier).")

        for _ in 0..<8 where !section.exists {
            scrollView.swipeUp()
        }
        XCTAssertTrue(section.exists, "The Today section \(identifier) was not reachable by scrolling.")
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

    private func element(label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }

    private func element(labelContaining fragment: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS[c] %@", fragment))
            .firstMatch
    }
}
