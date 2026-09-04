import XCTest

@MainActor
final class BaggerInvMatchesUITests: XCTestCase {
    private enum Scenario: String {
        case standard = "matches.standard"
        case noUserMatch = "matches.no-user-match"
        case cachedOffline = "matches.cached-offline"
        case emptyOffline = "matches.empty-offline"
        case longContent = "matches.long-content"
        case canonicalAssets = "matches.canonical-assets"
        case missingAssets = "matches.missing-assets"
        case mixedFormat = "matches.mixed-format"
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
        assertReachableLabel("matches.hero.side.1", contains: ["Pickles"], in: app)
        assertReachableLabel("matches.hero.side.2", contains: ["Lipp it and Rip it"], in: app)
        for identifier in [
            "matches.appIdentity",
            "matches.headerTitle",
            "matches.profile",
            "matches.tournamentMasthead",
            "matches.preview",
            "matches.roundContext",
        ] {
            assertExists(identifier, in: app)
        }
        XCTAssertTrue(
            element("matches.round.number.2", in: app).isSelected,
            "The canonical current Round was not selected by default."
        )
        assertLabel("matches.roundContext", contains: ["Round 2", "Scramble"], in: app)
    }

    func testRoundSwitchUpdatesContentAndNoUserMatchState() {
        let app = launch(.standard)
        let roundThree = element("matches.round.number.3", in: app)
        XCTAssertTrue(roundThree.waitForExistence(timeout: 3), "Round 3 was unavailable.")
        roundThree.tap()

        XCTAssertTrue(roundThree.isSelected, "Round 3 did not become selected.")
        assertReachable("matches.hero", in: app)
        assertReachable("matches.card.fixture-r3-scheduled", in: app)
        assertReachable("matches.card.fixture-r3-live", in: app)
        assertReachable("matches.card.fixture-r3-final", in: app)
        assertLabel("matches.roundContext", contains: ["Round 3", "Singles"], in: app)
        assertNoManufacturedPlus(in: app)

        app.terminate()
        let noUserApp = launch(.noUserMatch)
        assertReachable("matches.hero.empty", in: noUserApp)
        assertReachable("matches.allMatches", in: noUserApp)
    }

    func testHeroAndCTAOpenTheSameExactCanonicalMatchDetail() {
        let app = launch(.standard)

        reachableElement("matches.hero", in: app, requireHittable: true).tap()
        assertExists("matches.detail.fixture-r2-owned", in: app)
        navigateBackToMatches(in: app)

        let cta = reachableElement("matches.hero.cta", in: app)
        cta.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        assertExists("matches.detail.fixture-r2-owned", in: app)
    }

    func testOwnedAndNonOwnedRowsOpenExactDetailAndBackRetainsSelectedRound() {
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
        assertExists("matches.detail.fixture-r1-final", in: app)
        assertExists("matches.detail.status", in: app)
        assertExists("matches.detail.sides", in: app)
        assertExists("matches.detail.result", in: app)

        navigateBackToMatches(in: app)
        XCTAssertTrue(
            element("matches.round.number.1", in: app).isSelected,
            "Returning from Match Detail reset the selected Round."
        )

        reachableElement("matches.card.fixture-r1-live", in: app, requireHittable: true).tap()
        assertExists("matches.detail.fixture-r1-live", in: app)
        navigateBackToMatches(in: app)
        XCTAssertTrue(element("matches.round.number.1", in: app).isSelected)
    }

    func testAllThreeRoundsExposeDenseCanonicalContextWithoutManufacturedPlusSigns() {
        let app = launch(.standard)

        assertLabel("matches.roundContext", contains: ["Round 2", "Scramble"], in: app)
        assertReachableLabel(
            "matches.hero.fixture-r2-owned.matchNumber",
            contains: ["Your Match", "Match 3"],
            in: app
        )
        assertReachableLabel(
            "matches.hero.side.1",
            contains: ["Team Playing Handicap 3.5", "No team strokes"],
            in: app
        )
        assertReachableLabel(
            "matches.hero.side.2",
            contains: ["Team Playing Handicap 4.3", "2 team strokes"],
            in: app
        )
        assertReachable("matches.card.fixture-r2-owned.yourMatch", in: app)
        assertReachable("matches.card.fixture-r2-owned.course", in: app)
        assertReachableLabel(
            "matches.card.fixture-r2-owned",
            contains: [
                "Pickles",
                "Lipp it and Rip it",
                "Team Playing Handicap 3.5",
                "No team strokes",
                "Team Playing Handicap 4.3",
                "2 team strokes",
            ],
            in: app
        )
        assertReachable("matches.card.fixture-r2-final.result", in: app)

        let roundOne = element("matches.round.number.1", in: app)
        roundOne.tap()
        assertLabel("matches.roundContext", contains: ["Round 1", "Best Ball"], in: app)
        assertReachableLabel(
            "matches.card.fixture-r1-final.band.time",
            contains: ["Match 1", "9:20 AM"],
            in: app
        )
        assertReachableLabel(
            "matches.card.fixture-r1-final",
            contains: [
                "Playing Handicap 7.5",
                "No strokes",
                "Playing Handicap 11.0",
                "4 strokes",
            ],
            in: app
        )
        assertReachable("matches.card.fixture-r1-final.course", in: app)
        assertReachable("matches.card.fixture-r1-final.result", in: app)
        assertReachable("matches.card.fixture-r1-live", in: app)

        let roundThree = element("matches.round.number.3", in: app)
        roundThree.tap()
        assertLabel("matches.roundContext", contains: ["Round 3", "Singles"], in: app)
        for matchID in ["fixture-r3-scheduled", "fixture-r3-live", "fixture-r3-final"] {
            assertReachable("matches.card.\(matchID).side.1", in: app)
            assertReachable("matches.card.\(matchID).vs", in: app)
            assertReachable("matches.card.\(matchID).side.2", in: app)
        }
        assertReachableLabel(
            "matches.card.fixture-r3-scheduled",
            contains: ["Playing Handicap 7.5", "No strokes"],
            in: app
        )
        assertNoManufacturedPlus(in: app)
    }

    func testSharedStatusesAndDenseRowBandsRemainSemanticallySeparated() {
        let app = launch(.standard)

        assertReachableLabel(
            "matches.hero.fixture-r2-owned.status",
            contains: ["Upcoming"],
            in: app
        )
        assertReachableLabel(
            "matches.card.fixture-r2-owned.status",
            contains: ["Upcoming"],
            in: app
        )

        assertSemanticBands(
            for: "fixture-r2-live",
            expectedStatus: "Live",
            in: app
        )
        assertSemanticBands(
            for: "fixture-r2-final",
            expectedStatus: "Final",
            in: app
        )
    }

    func testMixedFormatRoundRetainsNecessaryPerMatchFormat() {
        let app = launch(.mixedFormat)

        assertLabel("matches.roundContext", excludes: ["Scramble", "Best Ball"], in: app)
        XCTAssertTrue(element(labelContaining: "Scramble", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element(labelContaining: "Best Ball", in: app).waitForExistence(timeout: 3))
    }

    func testCanonicalAndMissingAssetsPreserveMatchesIdentityStructure() {
        let canonical = launch(.canonicalAssets)
        for identifier in [
            "matches.profile",
            "matches.hero",
            "matches.card.fixture-r2-owned.course",
        ] {
            assertReachable(identifier, in: canonical)
        }
        assertReachableLabel(
            "matches.card.fixture-r2-owned",
            contains: ["Pickles", "Lipp it and Rip it"],
            in: canonical
        )

        canonical.terminate()
        let fallback = launch(.missingAssets)
        for identifier in [
            "matches.profile",
            "matches.hero",
            "matches.card.fixture-r2-owned.course",
        ] {
            assertReachable(identifier, in: fallback)
        }
        assertReachableLabel(
            "matches.card.fixture-r2-owned",
            contains: ["Pickles", "Lipp it and Rip it"],
            in: fallback
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
        element("matches.round.number.1", in: app).tap()
        let longResult = reachableElement("matches.card.fixture-r1-final.result", in: app)
        XCTAssertTrue(longResult.label.contains("Golden Coastal Dunes"), longResult.label)
        assertReachable("matches.card.fixture-r1-final.course", in: app)

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
        for round in 1...3 {
            let pill = element("matches.round.number.\(round)", in: largeApp)
            XCTAssertTrue(pill.waitForExistence(timeout: 3))
            XCTAssertGreaterThanOrEqual(pill.frame.height, 44)
        }
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
            "--bagger-acceptance-probes",
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

    private func assertLabel(
        _ identifier: String,
        contains expectedValues: [String] = [],
        excludes excludedValues: [String] = [],
        in app: XCUIApplication
    ) {
        let target = element(identifier, in: app)
        XCTAssertTrue(target.waitForExistence(timeout: 3), identifier)
        for value in expectedValues {
            XCTAssertTrue(target.label.localizedCaseInsensitiveContains(value), "\(identifier): \(target.label)")
        }
        for value in excludedValues {
            XCTAssertFalse(target.label.localizedCaseInsensitiveContains(value), "\(identifier): \(target.label)")
        }
    }

    private func assertNoManufacturedPlus(in app: XCUIApplication) {
        let plusText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", " + "))
        XCTAssertEqual(plusText.count, 0, "Stacked Player names still contain a manufactured + separator.")
    }

    private func assertSemanticBands(
        for matchID: String,
        expectedStatus: String,
        in app: XCUIApplication
    ) {
        let row = reachableElement("matches.card.\(matchID)", in: app, requireHittable: true)
        XCTAssertTrue(row.isHittable, "The whole Match row must remain the navigation target.")

        for identifier in [
            "matches.card.\(matchID).band.time",
            "matches.card.\(matchID).side.1",
            "matches.card.\(matchID).vs",
            "matches.card.\(matchID).side.2",
            "matches.card.\(matchID).course",
            "matches.card.\(matchID).result",
        ] {
            assertReachable(identifier, in: app)
        }
        assertReachableLabel(
            "matches.card.\(matchID).status",
            contains: [expectedStatus],
            in: app
        )

        let course = app.staticTexts
            .matching(identifier: "matches.card.\(matchID).course")
            .firstMatch
        XCTAssertTrue(course.waitForExistence(timeout: 3))
        XCTAssertTrue(course.label.localizedCaseInsensitiveContains("Cougar Point Golf Course"), course.label)
        XCTAssertTrue(course.label.localizedCaseInsensitiveContains("Black"), course.label)

        let result = element("matches.card.\(matchID).result", in: app)
        XCTAssertFalse(
            result.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            "The result/progress band must retain its own semantic content."
        )
    }

    private func assertReachableLabel(
        _ identifier: String,
        contains expectedValues: [String],
        in app: XCUIApplication
    ) {
        let target = reachableElement(identifier, in: app)
        for value in expectedValues {
            XCTAssertTrue(
                target.label.localizedCaseInsensitiveContains(value),
                "\(identifier): \(target.label)"
            )
        }
    }

    private func navigateBackToMatches(in app: XCUIApplication) {
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "Match Detail had no Back control.")
        back.tap()
        assertExists("matches.screen", in: app)
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    private func element(labelContaining value: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS[c] %@", value))
            .firstMatch
    }
}
