import XCTest

@MainActor
final class BaggerInvScoreUITests: XCTestCase {
    private enum Scenario: String {
        case noMatch = "score.no-match"
        case activeBestBall = "score.active-bb"
        case activeScramble = "score.active-sc"
        case activeSingles = "score.active-si"
        case readOnly = "score.read-only"
        case completed = "score.completed"
        case unknownFormat = "score.unknown-format"
        case longContent = "score.long-content"
        case offline = "score.offline"
        case durableOffline = "score.durable-offline"
        case signOutWarning = "score.signout-warning"
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testScoreTabOpensWithCanonicalBestBallRows() {
        let app = launch(.activeBestBall)

        assertExists("score.screen", in: app)
        assertReachable("score.matchContext", in: app)
        assertReachable("score.holeNavigator", in: app)
        assertReachable("score.controls", in: app)
        _ = reachableButton("Alex Morgan gross score", in: app)
        _ = reachableButton("Jordan Lee gross score", in: app)
        _ = reachableButton("Taylor Kim gross score", in: app)
        _ = reachableButton("Cameron Diaz gross score", in: app)

        XCTAssertTrue(
            element("score.hole.7", in: app).isSelected,
            "Best Ball did not orient to the canonical current hole."
        )
        XCTAssertTrue(
            reachableElement("score.scorecard", in: app, requireHittable: true).isHittable,
            "The official Scorecard destination was unavailable."
        )
    }

    func testScrambleAndSinglesExposeOnlyTheirCanonicalRows() {
        let scramble = launch(.activeScramble)
        XCTAssertTrue(element(labelContaining: "Scramble", in: scramble).exists)
        _ = reachableButton("Pines gross score", in: scramble)
        _ = reachableButton("Dunes gross score", in: scramble)
        XCTAssertFalse(scramble.buttons["Jordan Lee gross score"].exists)
        XCTAssertFalse(scramble.buttons["Cameron Diaz gross score"].exists)
        scramble.terminate()

        let singles = launch(.activeSingles)
        XCTAssertTrue(element(labelContaining: "Singles", in: singles).exists)
        _ = reachableButton("Alex Morgan gross score", in: singles)
        _ = reachableButton("Taylor Kim gross score", in: singles)
        XCTAssertFalse(singles.buttons["Jordan Lee gross score"].exists)
        XCTAssertFalse(singles.buttons["Cameron Diaz gross score"].exists)
    }

    func testUnsupportedReadOnlyAndFinalStatesCannotEdit() {
        let unsupported = launch(.unknownFormat)
        assertReachable(labelContaining: "Read-only format", in: unsupported)
        XCTAssertFalse(element("score.controls", in: unsupported).exists)
        XCTAssertFalse(element("score.saveNext", in: unsupported).exists)
        assertReachable("score.scorecard", in: unsupported)
        unsupported.terminate()

        let readOnly = launch(.readOnly)
        assertReachable(labelContaining: "Read-only", in: readOnly)
        assertEditingDisabled(in: readOnly)
        readOnly.terminate()

        let final = launch(.completed)
        assertReachable(labelContaining: "Match Final", in: final)
        assertEditingDisabled(in: final)
    }

    func testHoleSelectionAndScorecardBackPreserveOrientation() {
        let app = launch(.activeBestBall)

        assertReachable("score.holeNavigator", in: app)
        XCTAssertTrue(element("score.hole.7", in: app).isSelected, "Hole 7 was not the canonical initial selection.")

        let nextHole = reachableElement("score.nextHole", in: app, requireHittable: true)
        XCTAssertTrue(nextHole.isEnabled, "The next-hole control was disabled before the final hole.")
        nextHole.tap()
        XCTAssertTrue(element("score.hole.8", in: app).isSelected, "Next did not advance to Hole 8.")
        let holeHeader = element("score.holeHeader", in: app)
        XCTAssertTrue(holeHeader.waitForExistence(timeout: 3), "The selected-hole header was unavailable.")
        XCTAssertTrue(
            holeHeader.label.localizedCaseInsensitiveContains("Hole 8"),
            "The selected-hole header did not update to Hole 8."
        )

        let previousHole = reachableElement("score.previousHole", in: app, requireHittable: true)
        XCTAssertTrue(previousHole.isEnabled, "The previous-hole control was disabled after advancing.")
        previousHole.tap()
        XCTAssertTrue(element("score.hole.7", in: app).isSelected, "Previous did not return to Hole 7.")

        let scorecard = reachableElement("score.scorecard.quick", in: app, requireHittable: true)
        scorecard.tap()
        assertExists("scorecard.screen", in: app)
        assertReachable("scorecard.hole.1", in: app, scrollViewIdentifier: "scorecard.screen")

        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "Scorecard did not expose a Back control.")
        back.tap()
        assertExists("score.screen", in: app)
        XCTAssertTrue(
            element("score.hole.7", in: app).isSelected,
            "Returning from Scorecard lost the selected-hole orientation."
        )
    }

    func testPersistenceFailureNeverAdvancesOrClaimsSaved() {
        let app = launch(.activeBestBall)

        enterCompleteBestBallDraft(in: app)
        scrollScoreToTop(in: app)
        let editedValue = reachableButton("Alex Morgan gross score", in: app)
        XCTAssertTrue(
            accessibilityValue(of: editedValue).localizedCaseInsensitiveContains("edited · not saved"),
            "The local draft was not clearly distinguished from an official score."
        )

        let saveAndNext = reachableElement("score.saveNext", in: app, requireHittable: true)
        saveAndNext.tap()
        assertReachable(labelContaining: "Not saved", in: app)
        XCTAssertTrue(element("score.hole.7", in: app).isSelected, "A failed durable save advanced to another hole.")

        app.terminate()
        let relaunched = launch(.activeBestBall)
        let restoredValue = reachableButton("Alex Morgan gross score", in: relaunched)
        XCTAssertTrue(
            accessibilityValue(of: restoredValue).localizedCaseInsensitiveContains("not entered"),
            "Relaunch did not restore the fixture's canonical, non-draft value."
        )
        XCTAssertFalse(element("score.draftNotice", in: relaunched).exists)
    }

    func testOfflineSnapshotKeepsCanonicalOrientationAndDraftControls() {
        let app = launch(.offline)

        assertExists("score.offline", in: app)
        XCTAssertTrue(
            element(labelContaining: "Offline", in: app).exists,
            "The offline scoring state was not communicated without relying on color."
        )
        assertReachable("score.matchContext", in: app)
        assertReachable("score.holeNavigator", in: app)
        XCTAssertTrue(reachableButton("Increase Alex Morgan gross score", in: app).isEnabled)
        assertReachable("score.scorecard", in: app)
    }

    func testDurableOfflineMultiHoleSaveSurvivesProcessRelaunch() {
        let queueID = "ui-multihole-\(UUID().uuidString.lowercased())"
        var app = launch(
            .durableOffline,
            additionalArguments: [
                "--bagger-ui-test-queue-id", queueID,
                "--bagger-ui-test-reset-scoring-queue",
            ]
        )

        enterCompleteBestBallDraft(in: app)
        saveAndWaitForHole(8, in: app)
        assertReliabilityCount(1, in: app)

        enterCompleteBestBallDraft(in: app)
        saveAndWaitForHole(9, in: app)
        assertReliabilityCount(2, in: app)
        XCTAssertTrue(
            element("score.reliability.status", in: app).label.localizedCaseInsensitiveContains("Offline"),
            "The durable offline queue did not expose its persistent offline status."
        )

        app.terminate()
        app = launch(
            .durableOffline,
            additionalArguments: ["--bagger-ui-test-queue-id", queueID]
        )

        assertReliabilityCount(2, in: app)
        XCTAssertTrue(element("score.hole.7", in: app).isSelected, "Relaunch did not restore canonical hole orientation.")
        assertReachable("score.queue.intent.7", in: app)
        XCTAssertTrue(
            element("score.queue.intent.7", in: app).label.localizedCaseInsensitiveContains("Not Official"),
            "A restored local queue record was represented as Official."
        )
    }

    func testNoMatchDoesNotInventScoringControls() {
        let app = launch(.noMatch)

        assertExists("score.empty", in: app)
        XCTAssertTrue(element(labelContaining: "No scoring match", in: app).exists)
        XCTAssertFalse(element("score.holeNavigator", in: app).exists)
        XCTAssertFalse(element("score.controls", in: app).exists)
        XCTAssertFalse(element("score.scorecard", in: app).exists)
    }

    func testUnresolvedScoreSignOutRequiresExplicitChoice() {
        let app = launch(.signOutWarning)

        openSignOut(in: app)
        XCTAssertTrue(app.staticTexts["Unresolved scores"].waitForExistence(timeout: 3))
        XCTAssertTrue(element(labelContaining: "2 scores", in: app).exists)
        let keepWorking = app.buttons.matching(identifier: "score.signOut.keepWorking").firstMatch
        XCTAssertTrue(keepWorking.waitForExistence(timeout: 3))
        let confirm = app.buttons.matching(identifier: "score.signOut.confirm").firstMatch
        XCTAssertTrue(confirm.exists)
        keepWorking.tap()
        XCTAssertTrue(element("app.shell", in: app).waitForExistence(timeout: 3))

        openSignOut(in: app)
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        let confirmed = element("score.signOut.confirmed", in: app)
        XCTAssertTrue(confirmed.waitForExistence(timeout: 3))
        XCTAssertTrue(confirmed.label.localizedCaseInsensitiveContains("retained"))
    }

    func testLongContentAndAccessibilityXXXLRemainUsable() throws {
        let app = launch(.longContent)
        assertReachable("score.matchContext", in: app)
        assertReachable("score.scorecard.quick", in: app)
        assertReachable("score.controls", in: app)
        scrollScoreToTop(in: app)

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
        assertReachable("score.matchContext", in: largeApp)
        assertReachable("score.scorecard.quick", in: largeApp)
        assertReachable("score.controls", in: largeApp)
        scrollScoreToTop(in: largeApp)
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
            "The deterministic scoring fixture shell did not launch."
        )
        let scoreTab = app.tabBars.buttons["Score"]
        XCTAssertTrue(scoreTab.waitForExistence(timeout: 5), "The Score tab was missing.")
        scoreTab.tap()
        XCTAssertTrue(scoreTab.isSelected, "The Score tab did not become selected.")
        XCTAssertTrue(
            element("score.screen", in: app).waitForExistence(timeout: 5),
            "The native Score destination did not appear."
        )
        return app
    }

    private func openSignOut(in app: XCUIApplication) {
        let account = app.buttons["account.menu"]
        XCTAssertTrue(account.waitForExistence(timeout: 3), "The account menu was unavailable.")
        account.tap()
        let signOut = app.buttons["Sign Out"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 3), "The Sign Out action was unavailable.")
        signOut.tap()
    }

    private func assertEditingDisabled(in app: XCUIApplication) {
        let decrease = reachableButton("Decrease Alex Morgan gross score", in: app)
        let value = reachableButton("Alex Morgan gross score", in: app)
        let increase = reachableButton("Increase Alex Morgan gross score", in: app)
        XCTAssertFalse(decrease.isEnabled, "A read-only score decrement control was enabled.")
        XCTAssertFalse(value.isEnabled, "A read-only gross-score selector was enabled.")
        XCTAssertFalse(increase.isEnabled, "A read-only score increment control was enabled.")
        XCTAssertFalse(element("score.saveNext", in: app).exists)
    }

    private func enterCompleteBestBallDraft(in app: XCUIApplication) {
        scrollScoreToTop(in: app)
        for name in ["Alex Morgan", "Jordan Lee", "Taylor Kim", "Cameron Diaz"] {
            let increment = reachableButton("Increase \(name) gross score", in: app)
            XCTAssertTrue(increment.isEnabled, "The \(name) score control was unexpectedly read-only.")
            increment.tap()
        }
        let save = reachableElement("score.saveNext", in: app, requireHittable: true)
        XCTAssertTrue(save.isEnabled, "Save & Next did not enable for a complete canonical slot-ordered draft.")
    }

    private func saveAndWaitForHole(_ hole: Int, in app: XCUIApplication) {
        reachableElement("score.saveNext", in: app, requireHittable: true).tap()
        let selected = element("score.hole.\(hole)", in: app)
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "isSelected == true"),
            object: selected
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [expectation], timeout: 5),
            .completed,
            "Durable Save & Next did not advance to Hole \(hole)."
        )
    }

    private func assertReliabilityCount(_ expected: Int, in app: XCUIApplication) {
        let count = reachableElement("score.reliability.count", in: app)
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "label CONTAINS[c] %@", "\(expected) local"),
            object: count
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [expectation], timeout: 5),
            .completed,
            "The Score screen did not expose \(expected) durable local score intent(s)."
        )
    }

    private func reachableButton(_ label: String, in app: XCUIApplication) -> XCUIElement {
        let button = app.buttons[label]
        if button.waitForExistence(timeout: 1), button.isHittable || !button.isEnabled {
            return button
        }

        let screen = app.scrollViews["score.screen"].exists
            ? app.scrollViews["score.screen"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists, "The Score scroll view was unavailable while finding \(label).")
        for _ in 0..<12 where !button.exists || (!button.isHittable && button.isEnabled) {
            screen.swipeUp()
        }
        XCTAssertTrue(button.exists, "The Score button \(label) was not reachable.")
        if button.isEnabled {
            XCTAssertTrue(button.isHittable, "The Score button \(label) was not tappable.")
        }
        return button
    }

    private func accessibilityValue(of element: XCUIElement) -> String {
        if let value = element.value as? String { return value }
        return String(describing: element.value)
    }

    private func assertReachable(
        _ identifier: String,
        in app: XCUIApplication,
        scrollViewIdentifier: String = "score.screen"
    ) {
        _ = reachableElement(identifier, in: app, scrollViewIdentifier: scrollViewIdentifier)
    }

    private func assertReachable(labelContaining fragment: String, in app: XCUIApplication) {
        let target = element(labelContaining: fragment, in: app)
        if target.waitForExistence(timeout: 1) { return }

        let screen = app.scrollViews["score.screen"].exists
            ? app.scrollViews["score.screen"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists, "The Score scroll view was unavailable while finding \(fragment).")
        for _ in 0..<12 where !target.exists {
            screen.swipeUp()
        }
        XCTAssertTrue(target.exists, "Score content containing \(fragment) was not reachable.")
    }

    private func scrollScoreToTop(in app: XCUIApplication) {
        let screen = app.scrollViews["score.screen"].exists
            ? app.scrollViews["score.screen"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists, "The Score scroll view was unavailable while returning to the top.")
        let topContent = element("score.matchContext", in: app)
        for _ in 0..<12 where !topContent.isHittable {
            screen.swipeDown()
        }
        XCTAssertTrue(topContent.exists, "The Score screen could not return to its top content.")
    }

    @discardableResult
    private func reachableElement(
        _ identifier: String,
        in app: XCUIApplication,
        scrollViewIdentifier: String = "score.screen",
        requireHittable: Bool = false
    ) -> XCUIElement {
        let target = element(identifier, in: app)
        if target.waitForExistence(timeout: 1), !requireHittable || target.isHittable {
            return target
        }

        let screen = app.scrollViews[scrollViewIdentifier].exists
            ? app.scrollViews[scrollViewIdentifier]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists, "The scroll view was unavailable while finding \(identifier).")
        for _ in 0..<30 where !target.exists || (requireHittable && !target.isHittable) {
            screen.swipeUp()
        }
        XCTAssertTrue(target.exists, "The Score element \(identifier) was not reachable.")
        if requireHittable {
            XCTAssertTrue(target.isHittable, "The Score element \(identifier) was not tappable.")
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

    private func element(labelContaining fragment: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS[c] %@", fragment))
            .firstMatch
    }
}
