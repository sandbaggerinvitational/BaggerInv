import XCTest

@MainActor
final class BaggerInvTodayUITests: XCTestCase {
    private enum Scenario: String {
        case standard = "today.standard"
        case live = "today.live"
        case final = "today.final"
        case noCurrentMatch = "today.no-current-match"
        case cachedOffline = "today.cached-offline"
        case stale = "today.stale"
        case emptyOffline = "today.empty-offline"
        case longContent = "today.long-content"
        case canonicalAssets = "today.canonical-assets"
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
        assertExists("today.previewIndicator", in: app)
        let appIdentity = app.staticTexts["today.appIdentity"].firstMatch
        XCTAssertTrue(appIdentity.waitForExistence(timeout: 3))
        XCTAssertTrue(appIdentity.label.contains("The Bagger"))
        XCTAssertTrue(app.tabBars.buttons["Today"].isSelected, "Today was not the default selected tab.")

        assertSection("today.tournamentContext", in: app)
        let lifecycle = element("today.tournamentLifecycle", in: app)
        XCTAssertTrue(lifecycle.waitForExistence(timeout: 3))
        XCTAssertTrue(lifecycle.label.contains("Round 2"))
        XCTAssertTrue(lifecycle.label.contains("Live"))
        XCTAssertFalse(
            element(labelContaining: "Bagger Invitational · 2026", in: app).exists,
            "The redundant app/tournament eyebrow remained visible."
        )
        assertSection("today.currentMatch.fixture-r2-owned", in: app)
        assertSection("today.yourMatches", in: app)
        assertSection("today.tournamentScore", in: app)
        assertSection("today.schedule", in: app)
        assertScoreTeam(
            "fixture-team-green",
            contains: ["Pines", "8½", "6-2-1", "your team", "leads"],
            in: app
        )
        assertScoreTeam(
            "fixture-team-gold",
            contains: ["Dunes", "7½", "5-3-1"],
            in: app
        )
    }

    func testCanonicalMatchStatusAndNoCurrentMatchVariants() {
        let variants: [(Scenario, String)] = [
            (.standard, "Status Upcoming"),
            (.live, "Status Live"),
            (.final, "Status Final"),
        ]

        for (scenario, expectedStatus) in variants {
            XCTContext.runActivity(named: scenario.rawValue) { _ in
                let app = launch(scenario)
                let match = reachableElement("today.currentMatch.fixture-r2-owned", in: app)
                XCTAssertTrue(
                    match.label.contains(expectedStatus),
                    "The fixture did not present the canonical \(expectedStatus) state."
                )
                XCTAssertTrue(match.label.contains("Round 2"))
                XCTAssertTrue(match.label.contains("Scramble"))
                XCTAssertTrue(match.label.contains("Cougar Point"))
                XCTAssertTrue(match.label.contains("View Match Details"))
                app.terminate()
            }
        }

        let app = launch(.noCurrentMatch)
        XCTAssertTrue(
            element(labelContaining: "No current match", in: app).waitForExistence(timeout: 3),
            "The no-current-match fixture did not render its controlled empty state."
        )
    }

    func testCurrentAndPersonalMatchesOpenTheirExactExistingMatchDetail() {
        let app = launch(
            .standard,
            additionalArguments: ["--bagger-acceptance-probes"]
        )

        reachableElement(
            "today.currentMatch.fixture-r2-owned",
            in: app,
            requireHittable: true
        ).tap()
        XCTAssertTrue(app.tabBars.buttons["Matches"].isSelected)
        assertMatchDetail(
            matchID: "fixture-r2-owned",
            format: "Scramble",
            course: "Cougar Point",
            player: "Alex Morgan",
            in: app
        )
        app.navigationBars.buttons.firstMatch.tap()
        assertExists("matches.screen", in: app)

        let personalMatches = [
            (matchID: "fixture-r1-final", format: "Best Ball", course: "Turtle Point"),
            (matchID: "fixture-r2-owned", format: "Scramble", course: "Cougar Point"),
            (matchID: "fixture-r3-scheduled", format: "Singles", course: "Ocean Course"),
        ]
        for expected in personalMatches {
            app.tabBars.buttons["Today"].tap()
            assertExists("today.screen", in: app)
            reachableElement(
                "today.personalMatch.\(expected.matchID)",
                in: app,
                requireHittable: true
            ).tap()
            XCTAssertTrue(app.tabBars.buttons["Matches"].isSelected)
            assertMatchDetail(
                matchID: expected.matchID,
                format: expected.format,
                course: expected.course,
                player: "Alex Morgan",
                in: app
            )
            app.navigationBars.buttons.firstMatch.tap()
            assertExists("matches.screen", in: app)
        }
    }

    func testTournamentScoreAlwaysOpensLeadersScoreProduct() {
        let app = launch(.standard)
        app.tabBars.buttons["Leaders"].tap()
        let calcutta = element("leaders.product.calcutta", in: app)
        XCTAssertTrue(calcutta.waitForExistence(timeout: 3))
        calcutta.tap()
        XCTAssertTrue(calcutta.isSelected)

        app.tabBars.buttons["Today"].tap()
        reachableElement("today.openLeaders", in: app, requireHittable: true).tap()

        XCTAssertTrue(app.tabBars.buttons["Leaders"].isSelected)
        XCTAssertTrue(element("leaders.product.score", in: app).isSelected)
        assertExists("leaders.score", in: app)
    }

    func testProfilePortraitOpensAuthenticatedNativePassport() {
        let app = launch(.standard)
        let profile = app.buttons["today.profile"]
        XCTAssertTrue(profile.waitForExistence(timeout: 3))
        XCTAssertTrue(profile.isHittable)
        XCTAssertTrue(profile.label.contains("Alex Morgan"))
        profile.tap()

        assertExists("passport.screen", in: app)
        XCTAssertTrue(app.tabBars.buttons["More"].isSelected)
        let hero = element("passport.hero", in: app)
        XCTAssertTrue(hero.waitForExistence(timeout: 3))
        XCTAssertTrue(hero.label.contains("Alex Morgan"))
    }

    func testCanonicalIdentityTreatmentsAndUnknownFallbackFixtureRemainAvailable() {
        let app = launch(.canonicalAssets)
        assertExists("today.tournamentMark", in: app)
        assertExists("today.profile", in: app)
        assertSection("today.currentMatch.fixture-r2-owned", in: app)
        assertSection("today.currentMatch.courseIdentity", in: app)
        assertSection("today.currentMatch.side.1", in: app)
        assertSection("today.currentMatch.side.2", in: app)
        assertSection("today.tournamentScore.team.PICKLES", in: app)
        assertSection("today.tournamentScore.team.LIPPIT", in: app)

        // Catalog-name resolution is covered by BaggerAssetTests. Today keeps the
        // underlying images decorative, so UI acceptance targets the stable identity
        // wrappers instead of exposing implementation labels to VoiceOver.
        XCTAssertTrue(app.buttons["today.profile"].label.contains("Clay Beltran"))

        app.terminate()
        let fallbackApp = launch(.longContent)
        assertExists("today.tournamentMark", in: fallbackApp)
        assertExists("today.profile", in: fallbackApp)
        assertSection("today.currentMatch.fixture-r2-owned", in: fallbackApp)
        assertSection("today.currentMatch.courseIdentity", in: fallbackApp)
        assertSection("today.currentMatch.side.1", in: fallbackApp)
        assertSection("today.currentMatch.side.2", in: fallbackApp)
        assertSection("today.tournamentScore.team.UNKNOWN_TEAM_A", in: fallbackApp)
        assertSection("today.tournamentScore.team.UNKNOWN_TEAM_B", in: fallbackApp)
        XCTAssertTrue(
            fallbackApp.buttons["today.profile"].label.contains("Clayton Alexander Beltran-Montgomery"),
            "The unknown-player fixture did not preserve its fallback identity."
        )
    }

    func testCachedOfflineKeepsTodayVisibleWithPersistentStatus() {
        let app = launch(.cachedOffline)

        assertExists("today.offlineStatus", in: app)
        XCTAssertTrue(
            element(labelContaining: "Offline", in: app).waitForExistence(timeout: 3),
            "The cached-offline state did not explain that saved data remains visible."
        )
        assertSection("today.currentMatch.fixture-r2-owned", in: app)
        assertSection("today.yourMatches", in: app)
        assertSection("today.tournamentScore", in: app)
        assertSection("today.schedule", in: app)
        assertExists("today.openLeaders", in: app)
        XCTAssertFalse(element(labelContaining: "Today isn’t available right now", in: app).exists)
    }

    func testStaleKeepsCanonicalTodayVisibleWithRefreshGuidance() {
        let app = launch(.stale)

        assertExists("today.offlineStatus", in: app)
        XCTAssertTrue(
            element(labelContaining: "Showing the last update", in: app).waitForExistence(timeout: 3),
            "The stale state did not explain that its canonical values need revalidation."
        )
        assertSection("today.currentMatch.fixture-r2-owned", in: app)
        assertSection("today.tournamentScore", in: app)
        assertSection("today.schedule", in: app)
        assertExists("today.openLeaders", in: app)
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

    func testFiveTabShellUsesNativeProductDestinations() {
        let app = launch(.standard)

        assertTab("Today", identifier: "tab.today", in: app)

        let matches = app.tabBars.buttons["Matches"]
        XCTAssertTrue(matches.waitForExistence(timeout: 3), "The Matches tab was missing.")
        matches.tap()
        XCTAssertTrue(matches.isSelected, "The Matches tab did not become selected.")
        assertExists("tab.matches", in: app)
        assertExists("matches.screen", in: app)

        let score = app.tabBars.buttons["Score"]
        XCTAssertTrue(score.waitForExistence(timeout: 3), "The Score tab was missing.")
        score.tap()
        XCTAssertTrue(score.isSelected, "The Score tab did not become selected.")
        assertExists("tab.score", in: app)
        assertExists("score.screen", in: app)
        let leaders = app.tabBars.buttons["Leaders"]
        XCTAssertTrue(leaders.waitForExistence(timeout: 3), "The Leaders tab was missing.")
        leaders.tap()
        XCTAssertTrue(leaders.isSelected, "The Leaders tab did not become selected.")
        assertExists("tab.leaders", in: app)
        assertExists("leaders.screen", in: app)
        let more = app.tabBars.buttons["More"]
        XCTAssertTrue(more.waitForExistence(timeout: 3), "The More tab was missing.")
        more.tap()
        XCTAssertTrue(more.isSelected, "The More tab did not become selected.")
        assertExists("tab.more", in: app)
        assertExists("more.screen", in: app)

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

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.textClipped])
        }

        assertSection("today.currentMatch.fixture-r2-owned", in: app)
        assertSection("today.schedule", in: app)

        app.terminate()
        let accessibilitySizeApp = launch(
            .longContent,
            additionalArguments: [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityXXXL",
            ]
        )
        let profile = accessibilitySizeApp.buttons["today.profile"]
        XCTAssertTrue(profile.waitForExistence(timeout: 3))
        XCTAssertTrue(profile.isHittable)
        XCTAssertGreaterThanOrEqual(profile.frame.height, 44)
        XCTAssertTrue(profile.label.contains("Clayton Alexander Beltran-Montgomery"))
        XCTAssertTrue(
            accessibilitySizeApp.staticTexts["today.appIdentity"].firstMatch.waitForExistence(timeout: 3)
        )
        assertSection("today.tournamentContext", in: accessibilitySizeApp)
        assertSection("today.tournamentLifecycle", in: accessibilitySizeApp)
        let accessibilityMatch = reachableElement(
            "today.currentMatch.fixture-r2-owned",
            in: accessibilitySizeApp
        )
        XCTAssertFalse(
            accessibilityMatch.label.isEmpty,
            "The accessibility XXXL Match hero lost its coherent VoiceOver summary."
        )
        XCTAssertTrue(accessibilityMatch.label.contains("Status Upcoming"))
        XCTAssertGreaterThanOrEqual(accessibilityMatch.frame.height, 44)
        assertSection("today.yourMatches", in: accessibilitySizeApp)
        for matchID in ["fixture-r1-final", "fixture-r2-owned", "fixture-r3-scheduled"] {
            let row = reachableElement(
                "today.personalMatch.\(matchID)",
                in: accessibilitySizeApp,
                requireHittable: true
            )
            XCTAssertGreaterThanOrEqual(row.frame.height, 44)
            XCTAssertFalse(row.label.isEmpty)
        }
        assertSection("today.tournamentScore", in: accessibilitySizeApp)
        assertScoreTeam(
            "UNKNOWN_TEAM_A",
            contains: ["Evergreen Invitational Pickle Society", "8½", "6-2-1", "leads"],
            in: accessibilitySizeApp
        )
        assertScoreTeam(
            "UNKNOWN_TEAM_B",
            contains: ["Golden Coastal Links and Dunes Club", "7½", "5-3-1"],
            in: accessibilitySizeApp
        )
        let leaders = reachableElement("today.openLeaders", in: accessibilitySizeApp, requireHittable: true)
        XCTAssertGreaterThanOrEqual(leaders.frame.height, 44)
        assertSection("today.schedule", in: accessibilitySizeApp)
        let schedule = reachableElement("today.fullSchedule", in: accessibilitySizeApp, requireHittable: true)
        XCTAssertGreaterThanOrEqual(schedule.frame.height, 44)
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

    private func assertTab(_ name: String, identifier: String, in app: XCUIApplication) {
        let button = app.tabBars.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 3), "The \(name) tab was missing.")
        XCTAssertTrue(button.isSelected, "The \(name) tab was not selected.")
        assertExists(identifier, in: app)
    }

    private func assertMatchDetail(
        matchID: String,
        format: String,
        course: String,
        player: String,
        in app: XCUIApplication
    ) {
        assertExists("matches.detail.\(matchID)", in: app)
        XCTAssertTrue(
            element(labelContaining: format, in: app).waitForExistence(timeout: 3),
            "Match Detail for \(matchID) did not preserve the canonical format \(format)."
        )
        XCTAssertTrue(
            element(labelContaining: course, in: app).waitForExistence(timeout: 3),
            "Match Detail for \(matchID) did not preserve the canonical course \(course)."
        )
        XCTAssertTrue(
            element(labelContaining: player, in: app).waitForExistence(timeout: 3),
            "Match Detail for \(matchID) did not preserve the authenticated player \(player)."
        )
    }

    private func assertSection(_ identifier: String, in app: XCUIApplication) {
        _ = reachableElement(identifier, in: app)
    }

    private func assertScoreTeam(
        _ teamID: String,
        contains expectedValues: [String],
        in app: XCUIApplication
    ) {
        let team = reachableElement("today.tournamentScore.team.\(teamID)", in: app)
        for expectedValue in expectedValues {
            XCTAssertTrue(
                team.label.localizedCaseInsensitiveContains(expectedValue),
                "Tournament Score team \(teamID) did not expose \(expectedValue)."
            )
        }
    }

    @discardableResult
    private func reachableElement(
        _ identifier: String,
        in app: XCUIApplication,
        requireHittable: Bool = false
    ) -> XCUIElement {
        let section = element(identifier, in: app)
        if section.waitForExistence(timeout: 1), !requireHittable || section.isHittable {
            return section
        }

        let scrollView = app.scrollViews["today.screen"].exists
            ? app.scrollViews["today.screen"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(scrollView.exists, "The Today scroll view was unavailable while finding \(identifier).")

        for _ in 0..<12 where !section.exists || (requireHittable && !section.isHittable) {
            scrollView.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(section.exists, "The Today section \(identifier) was not reachable by scrolling.")
        if requireHittable {
            XCTAssertTrue(section.isHittable, "The Today element \(identifier) was not tappable.")
        }
        return section
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
