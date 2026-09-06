import XCTest

/// Step 2J.3C pre-review deterministic scorecard QA; never authenticates or writes scores.
@MainActor
final class BaggerInvCanonicalScorecardUITests: XCTestCase {
    private let base = "match.gameCenter.scorecard"
    override func setUp() { super.setUp(); continueAfterFailure = false }

    func testBestBallCompletedPrintedGrammarAcrossBothNines() throws {
        let app = launch("best-ball-final", stress: true)
        open(app)
        XCTAssertTrue(semantic(element("\(base).official", app)).contains("confirmed"))
        for nine in ["front", "back"] {
            assertRows(["holes", "par", "side.1.team", "side.1.player.0", "side.1.player.1", "side.1.net",
                        "side.2.team", "side.2.player.0", "side.2.player.1", "side.2.net", "result", "status"], nine, app)
            try inspectNine(nine, app: app, captureName: "BB-final-\(nine)")
        }
        assertParity(app)
    }

    func testScrambleSharesGrammarWithoutParticipantRows() throws {
        let app = launch("scramble-final", stress: true)
        open(app)
        for nine in ["front", "back"] {
            assertRows(["holes", "par", "side.1.team", "side.1.gross", "side.1.net",
                        "side.2.team", "side.2.gross", "side.2.net", "result", "status"], nine, app)
            XCTAssertFalse(element("\(base).\(nine).label.side.1.player.0", app).exists)
            try inspectNine(nine, app: app, captureName: "SC-final-\(nine)")
        }
        assertParity(app)
    }

    func testSinglesSharesGrammarWithoutPartnerRows() throws {
        let app = launch("singles-final")
        open(app)
        for nine in ["front", "back"] {
            for side in [1, 2] {
                XCTAssertTrue(element("\(base).\(nine).label.side.\(side).player.0", app).exists)
                XCTAssertFalse(element("\(base).\(nine).label.side.\(side).player.1", app).exists)
            }
            try inspectNine(nine, app: app, captureName: "SI-final-\(nine)")
        }
        assertParity(app)
    }

    func testInProgressAndMissingValuesStayCanonical() throws {
        let app = launch("best-ball-live")
        open(app)
        XCTAssertFalse(semantic(element("\(base).official", app)).localizedCaseInsensitiveContains("confirmed"))
        let missing = element("\(base).front.cell.side.1.player.0.hole.1", app)
        XCTAssertTrue(missing.label.contains("gross unavailable"))
        XCTAssertTrue(missing.label.contains("applied strokes unavailable"))
        try inspectNine("front", app: app, captureName: "BB-in-progress")
        let unplayed = element("\(base).back.cell.result.hole.18", app)
        XCTAssertTrue(unplayed.label.contains("not played"))
    }

    func testUnavailableStateAndDisclosureRemainSeparateFromFinalLifecycle() {
        let app = launch("best-ball-upcoming")
        reach("\(base).toggle", app).tap()
        XCTAssertTrue(element("\(base).front", app).exists)
        XCTAssertTrue(element("\(base).front.cell.status.hole.1", app).label.contains("not played"))
        capture("unavailable-expanded", app)
        reach("\(base).toggle", app).tap()
        XCTAssertFalse(element("\(base).front", app).exists)
        XCTAssertTrue(element("\(base).official", app).exists)
        capture("unavailable-collapsed", app)
    }

    func testConfirmedDisclosurePreservesTimestampAndFortyFourPointTarget() {
        let app = launch("scramble-final")
        open(app)
        let official = semantic(element("\(base).official", app))
        XCTAssertTrue(official.localizedCaseInsensitiveContains("confirmed"))
        let toggle = reach("\(base).toggle", app)
        XCTAssertGreaterThanOrEqual(toggle.frame.height, 44)
        toggle.tap()
        XCTAssertFalse(element("\(base).front", app).exists)
        XCTAssertEqual(semantic(element("\(base).official", app)), official)
        capture("confirmed-collapsed", app)
        toggle.tap()
        XCTAssertTrue(element("\(base).front", app).exists)
    }

    func testLargeTypeRetainsCompactIdentityAndSingleLineCells() throws {
        let app = launch("best-ball-final", stress: true, size: "UICTContentSizeCategoryXXXL")
        open(app)
        try inspectNine("front", app: app, captureName: "BB-large-front")
        try inspectNine("back", app: app, captureName: "BB-large-back")
        assertParity(app)
    }

    func testAccessibilityXXXLScorecardForEveryFormat() throws {
        for scenario in ["best-ball-final", "scramble-final", "singles-final"] {
            let app = launch(scenario, stress: true, size: "UICTContentSizeCategoryAccessibilityXXXL")
            open(app)
            for nine in ["front", "back"] {
                try inspectNine(nine, app: app, captureName: "\(scenario)-XXXL-\(nine)")
            }
            assertParity(app)
            app.terminate()
        }
    }

    private func launch(_ scenario: String, stress: Bool = false, size: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--bagger-ui-testing", "--bagger-ui-test-scenario", "today.canonical-assets",
                               "--bagger-match-detail-scenario", scenario]
        if stress { app.launchArguments.append("--bagger-scorecard-stress-fixture") }
        if let size { app.launchArguments += ["-UIPreferredContentSizeCategoryName", size] }
        // No invisible debug acceptance probes: inspect the actual scorecard.
        app.launch()
        XCTAssertTrue(element("match.gameCenter.tournament", app).waitForExistence(timeout: 10))
        return app
    }

    private func open(_ app: XCUIApplication) {
        reach("match.gameCenter.scorecardAction.open", app).tap()
        XCTAssertTrue(element("\(base).front", app).waitForExistence(timeout: 5))
        _ = reach("\(base).front.label.holes", app)
    }

    private func inspectNine(_ nine: String, app: XCUIApplication, captureName: String) throws {
        let prefix = "\(base).\(nine)"
        let identity = reach("\(prefix).label.holes", app)
        let identityFrame = element("\(prefix).identities", app).frame
        XCTAssertLessThanOrEqual(identityFrame.width, app.frame.width * 0.30)
        let scroll = app.scrollViews["\(prefix).scroll"]
        XCTAssertGreaterThan(scroll.frame.width, 80)
        XCTAssertLessThanOrEqual(scroll.frame.maxX, app.frame.maxX + 1)
        XCTAssertGreaterThanOrEqual(element(base, app).frame.minX, app.frame.minX)
        XCTAssertLessThanOrEqual(element(base, app).frame.maxX, app.frame.maxX)
        let firstHole = nine == "front" ? 1 : 10
        let lastHole = nine == "front" ? 9 : 18
        let first = element("\(prefix).cell.holes.hole.\(firstHole)", app)
        let last = element("\(prefix).cell.holes.hole.\(lastHole)", app)
        XCTAssertGreaterThanOrEqual(first.frame.width, 62)
        XCTAssertGreaterThan(last.frame.maxX, scroll.frame.maxX, "Local scroll should be necessary")
        let firstX = first.frame.minX
        let fixedX = identity.frame.minX
        capture("\(captureName)-start", app)
        swipe(scroll, app: app, left: true)
        XCTAssertLessThan(first.frame.minX, firstX - 1, "Hole columns must actually move")
        XCTAssertEqual(identity.frame.minX, fixedX, accuracy: 1, "Identity must remain anchored")
        swipe(scroll, app: app, left: false)
        // Native inertial swipes are not exact pixel inverses. Reach the real
        // leading edge before checking alignment; retain the one-point bound.
        for _ in 0..<4 {
            if abs(first.frame.minX - firstX) <= 1 { break }
            swipe(scroll, app: app, left: false)
        }
        XCTAssertEqual(first.frame.minX, firstX, accuracy: 1, "Reverse scrolling must restore the starting column")
        for _ in 0..<20 {
            if last.frame.maxX <= scroll.frame.maxX + 1 && last.frame.minX >= scroll.frame.minX - 1 { break }
            swipe(scroll, app: app, left: true)
        }
        XCTAssertLessThanOrEqual(last.frame.maxX, scroll.frame.maxX + 1, "Last hole must be reachable")
        XCTAssertGreaterThanOrEqual(last.frame.minX, scroll.frame.minX - 1)
        capture("\(captureName)-last-holes", app)
        XCTAssertEqual(identity.frame.minX, fixedX, accuracy: 1)
        _ = reach("\(prefix).label.status", app)
        let status = element("\(prefix).cell.status.hole.\(lastHole)", app)
        let gross = element("\(prefix).row.par", app)
        XCTAssertEqual(status.frame.height, gross.frame.height, accuracy: 1,
                       "Match status cannot grow vertically")
        XCTAssertTrue(status.label.localizedCaseInsensitiveContains("match status"))
        XCTAssertFalse(semantic(element(prefix, app)).contains("HCP"))
        capture("\(captureName)-results", app)
        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.textClipped])
        }
    }

    private func assertRows(_ rows: [String], _ nine: String, _ app: XCUIApplication) {
        let frames = rows.map { element("\(base).\(nine).label.\($0)", app).frame }
        for index in 1..<frames.count {
            XCTAssertGreaterThan(frames[index].minY, frames[index - 1].minY)
        }
    }

    private func assertParity(_ app: XCUIApplication) {
        for row in ["holes", "par", "side.1.team", "side.2.team", "result", "status"] {
            let front = element("\(base).front.label.\(row)", app).frame
            let back = element("\(base).back.label.\(row)", app).frame
            XCTAssertEqual(front.height, back.height, accuracy: 1)
            XCTAssertEqual(front.width, back.width, accuracy: 1)
        }
        let front = element("\(base).front.cell.holes.hole.1", app).frame
        let back = element("\(base).back.cell.holes.hole.10", app).frame
        XCTAssertEqual(front.width, back.width, accuracy: 1)
        XCTAssertEqual(front.height, back.height, accuracy: 1)
    }

    private func swipe(_ scroll: XCUIElement, app: XCUIApplication, left: Bool) {
        let top = app.navigationBars.firstMatch.frame.maxY + 4
        let bottom = app.tabBars.firstMatch.frame.minY - 4
        let visible = scroll.frame.intersection(CGRect(x: app.frame.minX, y: top,
                                                       width: app.frame.width, height: bottom - top))
        XCTAssertGreaterThan(visible.height, 15)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let start = origin.withOffset(CGVector(dx: left ? visible.maxX - 8 : visible.minX + 8, dy: visible.midY))
        let end = origin.withOffset(CGVector(dx: left ? visible.minX + 8 : visible.maxX - 8, dy: visible.midY))
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0)
    }

    @discardableResult private func reach(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        let target = element(id, app)
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<35 {
            guard target.exists else {
                scroll.swipeUp()
                continue
            }
            let frame = target.frame
            let top = app.navigationBars.firstMatch.frame.maxY + 3
            let bottom = app.tabBars.firstMatch.frame.minY - 3
            if target.exists && frame.minY >= top && frame.maxY <= bottom { return target }
            let up = !target.exists || frame.maxY > bottom
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.45, dy: up ? 0.65 : 0.3))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.45, dy: up ? 0.3 : 0.65)))
        }
        XCTFail("Could not bring scorecard element into viewport: \(id)")
        return target
    }

    private func element(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    private func semantic(_ target: XCUIElement) -> String {
        func collect(_ snapshot: any XCUIElementSnapshot) -> [String] {
            [snapshot.label, snapshot.value as? String].compactMap { $0 } + snapshot.children.flatMap(collect)
        }
        do { return collect(try target.snapshot()).joined(separator: ", ") }
        catch { XCTFail("Could not inspect scorecard accessibility"); return "" }
    }
    private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Scorecard-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
