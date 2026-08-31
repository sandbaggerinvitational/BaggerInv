import XCTest

@MainActor
final class BaggerInvLeadersUITests: XCTestCase {
    private enum Product: String {
        case score
        case players
        case netSkins
        case calcutta

        static let allCasesForTest: [Self] = [.score, .players, .netSkins, .calcutta]

        var identifier: String { "leaders.product.\(rawValue)" }

        var contentLabel: String {
            switch self {
            case .score: "Tournament Score"
            case .players: "Player Leaders"
            case .netSkins: "Net Skins"
            case .calcutta: "Calcutta"
            }
        }
    }

    private enum Variant: String {
        case standard
        case cachedOffline = "cached-offline"
        case calcuttaUnpublished = "calcutta-unpublished"
        case calcuttaFinal = "calcutta-final"
        case publicationRevoked = "publication-revoked"
        case partialFailure = "partial-failure"
        case longContent = "long-content"
        case scoreTie = "score-tie"
        case scoreFinal = "score-final"
        case netSkinsNotConfigured = "net-skins-not-configured"
        case netSkinsConfigured = "net-skins-configured"
        case netSkinsInProgress = "net-skins-in-progress"
        case netSkinsUnavailable = "net-skins-unavailable"
        case netSkinsOfficialEmpty = "net-skins-official-empty"
        case netSkinsMultiRound = "net-skins-multi-round"
        case playersDeep = "players-deep"
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testLeadersDefaultsToScoreWithTournamentAndCanonicalRoundScores() {
        let app = launch(.standard)

        assertExists("leaders.selector", in: app)
        XCTAssertTrue(
            element("leaders.product.score", in: app).isSelected,
            "Leaders did not default to Score."
        )
        assertReachable("leaders.score", in: app)
        assertLabelReachable("Tournament Score", in: app)
        assertLabelReachable("8 and a half points", in: app)
        assertLabelReachable("Round Scores", in: app)
        assertLabelReachable("ROUND 1", in: app)
        assertLabelReachable("ROUND 2", in: app)
        assertLabelReachable("ROUND 3", in: app)
        XCTAssertTrue(
            labelElement("Scores available when play begins", in: app).exists,
            "The future Round fabricated a score instead of showing its canonical upcoming state."
        )
    }

    func testTournamentScoreTieAndFinalVariantsRemainCanonical() {
        let tied = launch(.scoreTie)
        assertLabelReachable("Tournament Score", in: tied)
        let tiedTeamRows = tied.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS[c] %@", "8 points"))
        XCTAssertGreaterThanOrEqual(
            tiedTeamRows.count,
            2,
            "The canonical tie fixture did not preserve both equal team scores."
        )
        XCTAssertFalse(
            labelElement("winner", in: tied).exists,
            "Native presentation invented a winner for the tied canonical score."
        )
        assertLabelReachable("Tournament tied", in: tied)
        tied.terminate()

        let final = launch(.scoreFinal)
        assertLabelReachable("Tournament Score", in: final)
        XCTAssertTrue(
            labelElement("Final", in: final).waitForExistence(timeout: 3),
            "The final fixture did not expose its canonical final status."
        )
        assertLabelReachable("ROUND 3", in: final)
        assertLabelReachable("Champions", in: final)
    }

    func testPlayersUseTopTenThenExpandWithoutDuplicatingYourPosition() {
        let app = launch(.playersDeep, startingProduct: .players)

        assertExactLabelReachable("Your Position", in: app)
        assertLabelReachable("Rank 12, Alex Morgan", in: app)
        let yourPosition = labelElement("Rank 12, Alex Morgan", in: app)
        XCTAssertTrue(yourPosition.label.localizedCaseInsensitiveContains("you"))
        let showAll = app.buttons["Show All 12"]
        for _ in 0..<12 where !showAll.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(showAll.exists)
        XCTAssertTrue(showAll.isHittable)
        showAll.tap()

        assertLabelReachable("Rank 12, Alex Morgan", in: app)
        XCTAssertFalse(exactLabelElement("Your Position", in: app).exists)
        assertLabelReachable("Show Top 10", in: app)
    }

    func testPlayersPreserveCanonicalOrderAndEmphasizeAuthenticatedGolfer() {
        let app = launch(.standard, startingProduct: .players)

        XCTAssertTrue(element("leaders.product.players", in: app).isSelected)
        assertLabelReachable("Player Leaders", in: app)
        let first = labelElement("Rank 1, Jordan Lee", in: app)
        let authenticated = labelElement("Rank 2, Alex Morgan", in: app)
        let tied = labelElement("Rank 2, Taylor Brooks", in: app)
        XCTAssertTrue(first.waitForExistence(timeout: 3))
        XCTAssertTrue(authenticated.exists)
        XCTAssertTrue(tied.exists)
        XCTAssertLessThan(
            first.frame.minY,
            authenticated.frame.minY,
            "The signed-in golfer was reordered ahead of the canonical leader."
        )
        XCTAssertLessThan(
            authenticated.frame.minY,
            tied.frame.minY,
            "Canonical tied-rank ordering changed in native presentation."
        )
        XCTAssertTrue(
            (authenticated.label).localizedCaseInsensitiveContains("you"),
            "The authenticated golfer was not identified without relying on color."
        )
    }

    func testNetSkinsOfficialResultsShowCanonicalSummaryAndWinningHoles() {
        let app = launch(.standard, startingProduct: .netSkins)

        XCTAssertTrue(element("leaders.product.netSkins", in: app).isSelected)
        assertLabelReachable("Net Skins", in: app)
        assertLabelReachable("Round 2", in: app)
        assertExactLabelReachable("Official Results", in: app)
        assertLabelReachable("Official", in: app)
        assertLabelReachable("Hole 7", in: app)
        assertLabelReachable("Hole 14", in: app)
    }

    func testNetSkinsNonOfficialStatesDoNotFabricateResults() {
        let variants: [(Variant, String)] = [
            (.netSkinsNotConfigured, "Not Configured"),
            (.netSkinsConfigured, "Configured"),
            (.netSkinsInProgress, "In Progress"),
            (.netSkinsUnavailable, "Unavailable"),
        ]

        for (variant, expectedStatus) in variants {
            XCTContext.runActivity(named: variant.rawValue) { _ in
                let app = launch(variant, startingProduct: .netSkins)
                assertLabelReachable("Net Skins", in: app)
                XCTAssertTrue(
                    labelElement(expectedStatus, in: app).waitForExistence(timeout: 3),
                    "Net Skins did not present the canonical \(expectedStatus) state."
                )
                XCTAssertFalse(
                    exactLabelElement("Official Results", in: app).exists,
                    "A non-official Net Skins state exposed an official-results card."
                )
                app.terminate()
            }
        }
    }

    func testNetSkinsOfficialEmptyStateIsIntentional() {
        let app = launch(.netSkinsOfficialEmpty, startingProduct: .netSkins)

        assertExactLabelReachable("Official Results", in: app)
        assertLabelReachable("No skins awarded", in: app)
        XCTAssertFalse(exactLabelElement("Leaderboard", in: app).exists)
    }

    func testNetSkinsRoundSelectorUsesCanonicalRoundProducts() {
        let app = launch(.netSkinsMultiRound, startingProduct: .netSkins)
        let roundOne = element("leaders.netSkins.round.1", in: app)
        let roundTwo = element("leaders.netSkins.round.2", in: app)

        XCTAssertTrue(roundOne.waitForExistence(timeout: 3))
        XCTAssertTrue(roundTwo.exists)
        XCTAssertTrue(roundTwo.isSelected)
        roundOne.tap()
        XCTAssertTrue(roundOne.isSelected)
        assertLabelReachable("Round 1 · Best Ball", in: app)
    }

    func testCalcuttaPublishedAndUnpublishedParticipantViews() {
        let published = launch(.standard, startingProduct: .calcutta)
        assertLabelReachable("Published · In Progress", in: published)
        assertLabelReachable("Market", in: published)
        assertLabelReachable("Current Projection", in: published)
        assertLabelReachable("Owner Portfolios", in: published)
        assertReachable("leaders.calcutta.golfer.fixture-player-a", in: published)
        XCTAssertTrue(
            element("leaders.calcutta.golfer.fixture-player-a", in: published)
                .label.localizedCaseInsensitiveContains("you")
        )
        published.terminate()

        let unpublished = launch(.calcuttaUnpublished, startingProduct: .calcutta)
        assertLabelReachable("Unpublished", in: unpublished)
        XCTAssertTrue(
            labelElement("haven’t been published", in: unpublished).exists,
            "The unpublished Calcutta state did not explain the publication boundary."
        )
        XCTAssertFalse(exactLabelElement("Market", in: unpublished).exists)
        XCTAssertFalse(exactLabelElement("Current Projection", in: unpublished).exists)
        XCTAssertFalse(exactLabelElement("Final Results", in: unpublished).exists)
        XCTAssertFalse(exactLabelElement("Owner Portfolios", in: unpublished).exists)
    }

    func testCalcuttaPublishedDetailsExposeCanonicalRoundAndInvestmentFacts() {
        let app = launch(.standard, startingProduct: .calcutta)

        tapButtonLabelReachable("Round Performance", in: app)
        let roundID = "leaders.calcutta.round.fixture-round-1"
        assertReachable(roundID, in: app)
        let round = element(roundID, in: app)
        for fact in ["Gross 72", "Net 70", "Payout 50%", "Guaranteed $500.0625"] {
            XCTAssertTrue(round.label.contains(fact), "The canonical Round row omitted \(fact).")
        }

        tapButtonLabelReachable("1 investment", in: app)
        let investmentID = "leaders.calcutta.investment.fixture-player-a.fixture-player-a"
        assertReachable(investmentID, in: app)
        let investment = element(investmentID, in: app)
        for fact in [
            "Cost $156.328125",
            "Guaranteed $312.5390625",
            "$468.8671875",
            "Net $312.5390625",
            "ROI 200.025%",
        ] {
            XCTAssertTrue(investment.label.contains(fact), "The canonical investment row omitted \(fact).")
        }
    }

    func testCalcuttaFinalStateIsExplicitlyDistinguishedFromInProgress() {
        let app = launch(.calcuttaFinal, startingProduct: .calcutta)

        assertLabelReachable("Published · Final", in: app)
        XCTAssertTrue(
            labelElement("Published · Final", in: app).waitForExistence(timeout: 3),
            "The final Calcutta fixture did not preserve its canonical lifecycle state."
        )
        assertLabelReachable("Final Results", in: app)
        XCTAssertTrue(
            labelElement("Final Results", in: app).exists,
            "Final Calcutta values were not explicitly labeled as final."
        )
    }

    func testPublicationRevocationHidesPreviouslyPublishableFinancialSections() {
        let app = launch(.publicationRevoked, startingProduct: .calcutta)

        assertLabelReachable("Unpublished", in: app)
        XCTAssertFalse(labelElement("Published · In Progress", in: app).exists)
        XCTAssertFalse(exactLabelElement("Market", in: app).exists)
        XCTAssertFalse(exactLabelElement("Current Projection", in: app).exists)
        XCTAssertFalse(exactLabelElement("Owner Portfolios", in: app).exists)
    }

    func testProductFailureIsLocalizedAndOtherLeadersProductsRemainUsable() {
        let app = launch(.partialFailure, startingProduct: .netSkins)

        assertLabelReachable("Try Again", in: app)
        XCTAssertFalse(exactLabelElement("Official Results", in: app).exists)

        select(.score, in: app)
        assertLabelReachable("Tournament Score", in: app)
        assertLabelReachable("Round Scores", in: app)

        select(.players, in: app)
        assertLabelReachable("Player Leaders", in: app)

        select(.calcutta, in: app)
        assertLabelReachable("Published · In Progress", in: app)
        assertLabelReachable("Market", in: app)
    }

    func testCachedOfflineStateRemainsVisibleAndExplicitForEveryProduct() {
        let app = launch(.cachedOffline)

        for product in Product.allCasesForTest {
            select(product, in: app)
            assertLabelReachable("Offline · showing last update", in: app)
            switch product {
            case .score:
                assertLabelReachable("Tournament Score", in: app)
            case .players:
                assertLabelReachable("Player Leaders", in: app)
            case .netSkins:
                assertExactLabelReachable("Official Results", in: app)
            case .calcutta:
                XCTAssertTrue(
                    labelElement("financial values may have changed", in: app).exists,
                    "Cached Calcutta did not explicitly warn that its financial values may be stale."
                )
                assertLabelReachable("Published · In Progress", in: app)
                assertLabelReachable("Market", in: app)
            }
        }
    }

    func testRapidProductSwitchingPreservesUsableState() {
        let app = launch(.standard)
        let sequence: [Product] = [.players, .netSkins, .calcutta, .score, .calcutta, .players, .score]

        for product in sequence {
            select(product, in: app)
            assertLabelReachable(product.contentLabel, in: app)
        }

        assertLabelReachable("Tournament Score", in: app)
        assertLabelReachable("Round Scores", in: app)
    }

    func testLongNamesAndLargeFinancialValuesRemainReachable() {
        let app = launch(.longContent, startingProduct: .players)

        XCTAssertTrue(
            labelElement("Maximilian Alexander Montgomery-Wellington", in: app)
                .waitForExistence(timeout: 3),
            "The long Player name was not exposed."
        )
        select(.score, in: app)
        assertLabelReachable("Tournament Score", in: app)
        XCTAssertTrue(
            labelElement("Mighty Briny Pickle Preservation Society", in: app).exists,
            "The long team name was not exposed."
        )

        select(.calcutta, in: app)
        assertLabelReachable("Published · In Progress", in: app)
        assertLabelReachable("Market", in: app)
        assertLabelReachable("1,234,567.875", in: app)
        assertLabelReachable("345,678.125", in: app)
        XCTAssertTrue(
            labelElement("Montgomery-Wellington", in: app).exists,
            "The long Calcutta owner name was not exposed."
        )
    }

    func testAccessibilityXXXLAdaptsSelectorAndKeepsEveryProductReachable() throws {
        let app = launch(
            .longContent,
            additionalArguments: [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityXXXL",
            ]
        )

        assertExists("leaders.selector", in: app)
        for product in Product.allCasesForTest {
            let button = element(product.identifier, in: app)
            XCTAssertTrue(button.waitForExistence(timeout: 3), "The \(product.rawValue) selector was clipped away.")
            XCTAssertTrue(button.isHittable, "The \(product.rawValue) selector was not usable at accessibility XXXL.")
            select(product, in: app)
            assertLabelReachable(product.contentLabel, in: app)
        }

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.textClipped])
        }
    }

    private func launch(
        _ variant: Variant,
        startingProduct: Product? = nil,
        additionalArguments: [String] = []
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "--bagger-ui-testing",
            "--bagger-ui-test-scenario",
            "today.standard",
            "--bagger-start-leaders",
            "--bagger-leaders-fixture",
            variant.rawValue,
        ]
        if let startingProduct {
            app.launchArguments += ["--bagger-leaders-product", startingProduct.rawValue]
        }
        app.launchArguments += additionalArguments
        app.launch()

        XCTAssertTrue(
            element("app.shell", in: app).waitForExistence(timeout: 10),
            "The deterministic Leaders fixture shell did not launch."
        )
        XCTAssertTrue(app.tabBars.buttons["Leaders"].isSelected, "The fixture did not open on Leaders.")
        assertExists("tab.leaders", in: app)
        assertExists("leaders.screen", in: app)
        return app
    }

    private func select(_ product: Product, in app: XCUIApplication) {
        let button = element(product.identifier, in: app)
        if !button.exists || !button.isHittable {
            scrollToTop(in: app)
            let screen = leadersScrollView(in: app)
            for _ in 0..<4 where !button.isHittable {
                screen.swipeUp()
            }
        }
        XCTAssertTrue(button.waitForExistence(timeout: 3), "The \(product.rawValue) selector was missing.")
        XCTAssertTrue(button.isHittable, "The \(product.rawValue) selector was not tappable.")
        button.tap()
        XCTAssertTrue(button.isSelected, "The \(product.rawValue) product did not become selected.")
        assertLabelReachable(product.contentLabel, in: app)
    }

    private func scrollToTop(in app: XCUIApplication) {
        let screen = leadersScrollView(in: app)
        for _ in 0..<8 {
            screen.swipeDown()
        }
    }

    private func assertReachable(_ identifier: String, in app: XCUIApplication) {
        let target = element(identifier, in: app)
        if target.waitForExistence(timeout: 1) { return }

        let screen = leadersScrollView(in: app)
        for _ in 0..<12 where !target.exists {
            screen.swipeUp()
        }
        XCTAssertTrue(target.exists, "The Leaders element \(identifier) was not reachable by scrolling.")
    }

    private func assertLabelReachable(_ fragment: String, in app: XCUIApplication) {
        let target = labelElement(fragment, in: app)
        if target.waitForExistence(timeout: 1) { return }

        let screen = leadersScrollView(in: app)
        for _ in 0..<12 where !target.exists {
            screen.swipeUp()
        }
        XCTAssertTrue(target.exists, "Leaders content containing \(fragment) was not reachable by scrolling.")
    }

    private func assertExactLabelReachable(_ label: String, in app: XCUIApplication) {
        let target = exactLabelElement(label, in: app)
        if target.waitForExistence(timeout: 1) { return }

        let screen = leadersScrollView(in: app)
        for _ in 0..<12 where !target.exists {
            screen.swipeUp()
        }
        XCTAssertTrue(target.exists, "Leaders content labeled \(label) was not reachable by scrolling.")
    }

    private func tapButtonLabelReachable(_ fragment: String, in app: XCUIApplication) {
        let target = app.buttons
            .matching(NSPredicate(format: "label CONTAINS[c] %@", fragment))
            .firstMatch
        if !target.waitForExistence(timeout: 1) || !target.isHittable {
            for _ in 0..<12 where !target.isHittable {
                app.swipeUp()
            }
        }
        XCTAssertTrue(target.exists, "Leaders control containing \(fragment) was not reachable by scrolling.")
        XCTAssertTrue(target.isHittable, "Leaders control containing \(fragment) was not tappable.")
        target.tap()
    }

    private func leadersScrollView(in app: XCUIApplication) -> XCUIElement {
        let identified = app.scrollViews["leaders.screen"]
        if identified.exists { return identified }
        let fallback = app.scrollViews.firstMatch
        XCTAssertTrue(fallback.exists, "The Leaders scroll view was unavailable.")
        return fallback
    }

    private func assertExists(
        _ identifier: String,
        in app: XCUIApplication,
        timeout: TimeInterval = 5
    ) {
        XCTAssertTrue(
            element(identifier, in: app).waitForExistence(timeout: timeout),
            "Expected Leaders accessibility identifier \(identifier) was missing."
        )
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    private func labelElement(_ fragment: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS[c] %@", fragment))
            .firstMatch
    }

    private func exactLabelElement(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label ==[c] %@", label))
            .firstMatch
    }
}
