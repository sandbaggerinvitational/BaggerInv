import XCTest

/// Deterministic presentation-only acceptance. These fixtures never use live
/// authentication, backend reads, or the physical scoring queue.
@MainActor
final class BaggerInvMatchGameCenterPolishUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testColdFirstOpenShowsLoadingUntilContentNeverUnavailable() {
        let app = launch("best-ball-live", extra: ["--bagger-match-detail-cold-load"], waitForContent: false)
        XCTAssertTrue(element("match.gameCenter.loading", app).waitForExistence(timeout: 8))
        let deadline = Date().addingTimeInterval(25)
        var loadingSamples = 0
        while Date() < deadline {
            XCTAssertFalse(element("match.gameCenter.unavailable", app).exists)
            XCTAssertFalse(element("match.gameCenter.loadError", app).exists)
            XCTAssertFalse(app.staticTexts["Match isn’t available right now"].exists)
            if element("match.gameCenter.tournament", app).exists { break }
            if element("match.gameCenter.loading", app).exists { loadingSamples += 1 }
            RunLoop.current.run(until: Date().addingTimeInterval(0.15))
        }
        XCTAssertGreaterThan(loadingSamples, 0)
        XCTAssertTrue(element("match.gameCenter.tournament", app).exists)
        XCTAssertFalse(element("match.gameCenter.unavailable", app).exists)
        XCTAssertFalse(element("match.gameCenter.loading", app).exists)
    }

    func testBestBallScorecardHasOrderedTeamsPlayersAndCanonicalNet() {
        let app = launch("best-ball-live")
        openScorecard(app)
        let keys = ["side.1.team", "side.1.player.0", "side.1.player.1", "side.1.net",
                    "side.2.team", "side.2.player.0", "side.2.player.1", "side.2.net"]
        assertRowOrder(keys, app)
        let cell = element("match.gameCenter.scorecard.front.cell.side.1.player.0.hole.1", app)
        XCTAssertTrue(cell.exists)
        XCTAssertTrue(cell.label.localizedCaseInsensitiveContains("Hole 1"))
        XCTAssertTrue(cell.label.localizedCaseInsensitiveContains("gross"))
        XCTAssertTrue(cell.label.localizedCaseInsensitiveContains("stroke"))
        XCTAssertTrue(element("match.gameCenter.scorecard.front.cell.side.2.net.hole.1", app).exists)
        XCTAssertTrue(element("match.gameCenter.scorecard.back.cell.side.1.player.0.hole.10", app).exists)
        assertLocalScrollAndAnchoredLabels(app)
        assertDisclosure(app)
    }

    func testScrambleScorecardUsesOnlyCanonicalTeamScoreRows() {
        let app = launch("scramble-final")
        openScorecard(app)
        assertRowOrder(["side.1.team", "side.1.gross", "side.1.net", "side.2.team", "side.2.gross", "side.2.net"], app)
        for side in [1, 2] {
            XCTAssertFalse(element("match.gameCenter.scorecard.front.label.side.\(side).player.0", app).exists)
            let cell = element("match.gameCenter.scorecard.front.cell.side.\(side).gross.hole.1", app)
            XCTAssertTrue(cell.exists)
            XCTAssertTrue(cell.label.localizedCaseInsensitiveContains("gross"))
        }
        assertDisclosure(app)
    }

    func testSinglesScorecardHasOnePlayerPerSideWithoutFakeSecondRows() {
        let app = launch("singles-final")
        openScorecard(app)
        for side in [1, 2] {
            XCTAssertTrue(element("match.gameCenter.scorecard.front.label.side.\(side).player.0", app).exists)
            XCTAssertFalse(element("match.gameCenter.scorecard.front.label.side.\(side).player.1", app).exists)
        }
        XCTAssertTrue(element("match.gameCenter.scorecard.back.cell.side.2.player.0.hole.18", app).exists)
        assertDisclosure(app)
    }

    func testSelectedHoleLongNamesHaveEqualSideGeometryAndAlignedNet() {
        let app = launch("best-ball-live")
        let first = reach("match.gameCenter.selectedHole.side.1.card", app)
        let second = element("match.gameCenter.selectedHole.side.2.card", app)
        waitForStableGeometry([first, second])
        XCTAssertEqual(first.frame.height, second.frame.height, accuracy: 1)
        XCTAssertEqual(first.frame.minY, second.frame.minY, accuracy: 1)
        let titleOne = element("match.gameCenter.selectedHole.side.1.title", app)
        let titleTwo = element("match.gameCenter.selectedHole.side.2.title", app)
        XCTAssertEqual(titleOne.frame.minY, titleTwo.frame.minY, accuracy: 1)
        XCTAssertEqual(titleOne.frame.height, titleTwo.frame.height, accuracy: 1)
        let netOne = element("match.gameCenter.selectedHole.side.1.net", app)
        let netTwo = element("match.gameCenter.selectedHole.side.2.net", app)
        XCTAssertEqual(netOne.frame.minY, netTwo.frame.minY, accuracy: 1)
        XCTAssertFalse(app.staticTexts["Hole Result"].exists)
        capture("BB-selected-hole-alignment", app)
    }

    func testFlowAndStatsPreserveBothTeamIdentitiesAndOverallOnlyClinch() {
        let app = launch("scramble-final")
        for segment in ["front", "back", "overall"] {
            let button = reach("match.gameCenter.flow.\(segment)", app)
            XCTAssertGreaterThanOrEqual(button.frame.height, 43.99)
            button.tap()
            XCTAssertTrue(button.isSelected)
            let detail = element("match.gameCenter.flow.detail", app)
            let text = semantic(detail)
            XCTAssertTrue(text.localizedCaseInsensitiveContains("The Pickles"))
            XCTAssertTrue(text.localizedCaseInsensitiveContains("Lipp it and Rip it"))
            XCTAssertTrue(text.localizedCaseInsensitiveContains("holes recorded"))
            XCTAssertEqual(element("match.gameCenter.clinch", app).exists, segment == "overall")
        }
        let first = reach("match.gameCenter.stats.side.1", app)
        let second = element("match.gameCenter.stats.side.2", app)
        waitForStableGeometry([first, second])
        XCTAssertEqual(first.frame.height, second.frame.height, accuracy: 1)
        XCTAssertTrue(semantic(first).localizedCaseInsensitiveContains("The Pickles"))
        XCTAssertTrue(semantic(second).localizedCaseInsensitiveContains("Lipp it and Rip it"))
        capture("SC-stats-identity", app)
    }

    func testAccessibilityXXXLPolishAndLocalScorecardScrollForAllFormats() throws {
        for scenario in ["best-ball-live", "scramble-final", "singles-final"] {
            let app = launch(scenario, extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"], acceptanceProbes: false)
            _ = reach("match.gameCenter.selectedHole.side.1.card", app)
            assertInsidePage(element("match.gameCenter.selectedHole.side.1.card", app), app)
            capture("\(scenario)-XXXL-selected", app)
            for side in [1, 2] {
                let player = reach("match.gameCenter.selectedHole.side.\(side).player.0", app)
                assertInsidePage(player, app)
                capture("\(scenario)-XXXL-side-\(side)-scores", app)
                let net = reach("match.gameCenter.selectedHole.side.\(side).net", app)
                assertInsidePage(net, app)
                XCTAssertTrue(semantic(net).localizedCaseInsensitiveContains("net"))
            }
            _ = reach("match.gameCenter.flow.overall", app)
            XCTAssertGreaterThanOrEqual(element("match.gameCenter.flow.overall", app).frame.height, 43.99)
            openScorecard(app)
            assertLocalScrollAndAnchoredLabels(app)
            capture("\(scenario)-XXXL-scorecard", app)
            if #available(iOS 17.0, *) {
                try app.performAccessibilityAudit(for: [.textClipped])
            }
            app.terminate()
        }
    }

    func testAccessibilityXXXLHoleTilesKeepScaledResultsOnContrastingSurfaces() throws {
        let app = launch("best-ball-live", extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"], acceptanceProbes: false)
        let first = reach("match.gameCenter.hole.1", app)
        let second = element("match.gameCenter.hole.2", app)
        let third = element("match.gameCenter.hole.3", app)
        waitForStableGeometry([first, second, third])
        for tile in [first, second, third] {
            XCTAssertGreaterThanOrEqual(tile.frame.width, 44)
            XCTAssertGreaterThanOrEqual(tile.frame.height, 44)
            assertInsidePage(tile, app)
        }
        XCTAssertLessThanOrEqual(first.frame.maxX, second.frame.minX + 1)
        XCTAssertLessThanOrEqual(second.frame.maxX, third.frame.minX + 1)
        first.tap()
        XCTAssertTrue(first.isSelected)
        XCTAssertTrue(first.label.localizedCaseInsensitiveContains("official"))
        XCTAssertTrue(first.label.localizedCaseInsensitiveContains("The Pickles"))
        capture("BB-XXXL-hole-tiles", app)
        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.textClipped])
        }
    }

    func testVisualEvidenceForPolishedModulesAcrossAllFormats() {
        for scenario in ["best-ball-live", "scramble-final", "singles-final"] {
            let app = launch(scenario)
            capture("\(scenario)-top", app)
            _ = reach("match.gameCenter.scorecardAction.open", app)
            capture("\(scenario)-hero-utility", app)
            _ = reach("match.gameCenter.selectedHole.side.1.card", app)
            capture("\(scenario)-selected-hole", app)
            _ = reach("match.gameCenter.flow.overall", app)
            capture("\(scenario)-flow", app)
            openScorecard(app)
            _ = reach("match.gameCenter.scorecard.front.label.side.2.team", app)
            capture("\(scenario)-front-scorecard", app)
            _ = reach("match.gameCenter.scorecard.back.label.side.2.team", app)
            capture("\(scenario)-back-scorecard", app)
            reach("match.gameCenter.scorecard.toggle", app).tap()
            _ = reach("match.gameCenter.stats.side.1", app)
            capture("\(scenario)-stats", app)
            _ = reach("match.gameCenter.course.metric.slope", app)
            capture("\(scenario)-course-clearance", app)
            app.terminate()
        }
    }

    private func launch(_ scenario: String, extra: [String] = [], waitForContent: Bool = true, acceptanceProbes: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--bagger-ui-testing",
                               "--bagger-ui-test-scenario", "today.canonical-assets",
                               "--bagger-match-detail-scenario", scenario] + extra
        // Invisible acceptance probes deliberately carry tiny text frames.
        // Accessibility audits must inspect only the real production elements.
        if acceptanceProbes { app.launchArguments.append("--bagger-acceptance-probes") }
        app.launch()
        XCTAssertTrue(element("app.shell", app).waitForExistence(timeout: 10))
        if waitForContent {
            XCTAssertTrue(element("match.gameCenter.tournament", app).waitForExistence(timeout: 10))
        }
        return app
    }

    private func openScorecard(_ app: XCUIApplication) {
        let toggle = reach("match.gameCenter.scorecard.toggle", app)
        XCTAssertGreaterThanOrEqual(toggle.frame.height, 43.99)
        toggle.tap()
        XCTAssertTrue(element("match.gameCenter.scorecard.front", app).waitForExistence(timeout: 4))
    }

    private func assertRowOrder(_ keys: [String], _ app: XCUIApplication) {
        var lastY = -Double.infinity
        for key in keys {
            let label = element("match.gameCenter.scorecard.front.label.\(key)", app)
            XCTAssertTrue(label.exists, key)
            XCTAssertGreaterThan(label.frame.height, 0, key)
            XCTAssertGreaterThan(Double(label.frame.minY), lastY, key)
            lastY = Double(label.frame.minY)
        }
    }

    private func assertLocalScrollAndAnchoredLabels(_ app: XCUIApplication) {
        let label = reach("match.gameCenter.scorecard.front.label.side.1.team", app)
        let before = label.frame
        let scroll = app.scrollViews["match.gameCenter.scorecard.front.scroll"]
        XCTAssertTrue(scroll.exists)
        XCTAssertLessThanOrEqual(scroll.frame.maxX, app.frame.maxX + 1)
        let column = element("match.gameCenter.scorecard.front.cell.holes.hole.1", app)
        XCTAssertTrue(column.exists)
        let columnX = column.frame.minX
        swipeLocalScorecard(scroll, app: app, left: true)
        XCTAssertEqual(label.frame.minX, before.minX, accuracy: 1)
        XCTAssertEqual(label.frame.minY, before.minY, accuracy: 1)
        XCTAssertLessThan(column.frame.minX, columnX - 1, "Score columns did not actually scroll")
        XCTAssertTrue(element("match.gameCenter.scorecard.front", app).exists)
        swipeLocalScorecard(scroll, app: app, left: false)
    }

    private func swipeLocalScorecard(_ scroll: XCUIElement, app: XCUIApplication, left: Bool) {
        let top = app.navigationBars.firstMatch.frame.maxY + 4
        let bottom = app.tabBars.firstMatch.frame.minY - 4
        let visible = scroll.frame.intersection(CGRect(x: app.frame.minX, y: top, width: app.frame.width, height: bottom - top))
        XCTAssertGreaterThan(visible.height, 20)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let start = origin.withOffset(CGVector(dx: left ? visible.maxX - 12 : visible.minX + 12, dy: visible.midY))
        let end = origin.withOffset(CGVector(dx: left ? visible.minX + 12 : visible.maxX - 12, dy: visible.midY))
        start.press(forDuration: 0.1, thenDragTo: end)
    }

    private func waitForStableGeometry(_ views: [XCUIElement]) {
        let deadline = Date().addingTimeInterval(5)
        var previous: [CGRect] = []
        while Date() < deadline {
            let frames = views.filter(\.exists).map(\.frame)
            if frames.count == views.count, frames.allSatisfy({ $0.height > 0 }), frames == previous { return }
            previous = frames
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTFail("Presentation geometry did not settle")
    }

    private func assertDisclosure(_ app: XCUIApplication) {
        let toggle = reach("match.gameCenter.scorecard.toggle", app)
        toggle.tap()
        XCTAssertFalse(element("match.gameCenter.scorecard.front", app).exists)
        toggle.tap()
        XCTAssertTrue(element("match.gameCenter.scorecard.front", app).waitForExistence(timeout: 3))
    }

    private func assertInsidePage(_ view: XCUIElement, _ app: XCUIApplication) {
        XCTAssertGreaterThanOrEqual(view.frame.minX, app.frame.minX - 1)
        XCTAssertLessThanOrEqual(view.frame.maxX, app.frame.maxX + 1)
    }

    private func element(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    @discardableResult
    private func reach(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        let target = element(id, app)
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<26 {
            guard target.exists else { scroll.swipeUp(); continue }
            let frame = target.frame
            let top = app.navigationBars.firstMatch.frame.maxY + 3
            let bottom = app.tabBars.firstMatch.frame.minY - 3
            if target.isHittable, frame.minY >= top, frame.minY < bottom { return target }
            let startY: CGFloat = frame.minY < top ? 0.3 : 0.65
            let endY: CGFloat = frame.minY < top ? 0.65 : 0.3
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: startY))
                .press(forDuration: 0.1, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: endY)))
        }
        XCTAssertTrue(target.exists && target.isHittable, "Not reachable: \(id)")
        return target
    }

    private func semantic(_ target: XCUIElement) -> String {
        func collect(_ snapshot: any XCUIElementSnapshot) -> [String] {
            [snapshot.label, snapshot.value as? String].compactMap { $0 }
                + snapshot.children.flatMap(collect)
        }
        do { return collect(try target.snapshot()).joined(separator: ", ") }
        catch { XCTFail("Could not read semantic presentation snapshot: \(error)"); return "" }
    }

    private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Polish-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
