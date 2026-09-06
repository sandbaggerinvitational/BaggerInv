import XCTest

@MainActor
final class BaggerInvScorePolishUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testCanonicalWinnerReplacesGenericHeaderCopyWithoutChangingLayout() {
        var baselineHeight: CGFloat = 0
        var baselineResultHeight: CGFloat = 0
        for genericResult in [false, true] {
            let app = XCUIApplication()
            app.launchArguments = ["--bagger-ui-testing", "--bagger-ui-test-scenario", "score.completed",
                                   "--bagger-ui-test-known-course-asset", "--bagger-ui-test-scorecard-team-assets",
                                   "--bagger-ui-test-open-scorecard"]
            if genericResult { app.launchArguments += ["--bagger-ui-test-generic-scorecard-result"] }
            app.launch()
            let header = app.descendants(matching: .any).matching(identifier: "scorecard.header").firstMatch
            XCTAssertTrue(header.waitForExistence(timeout: 5))
            let result = app.staticTexts["scorecard.header.result"]
            XCTAssertEqual(result.label, genericResult ? "The Pickles 7 UP through 18" : "The Pickles win 3 & 2")
            XCTAssertEqual(app.staticTexts["scorecard.header.official"].label, "Official")
            XCTAssertGreaterThanOrEqual(result.frame.minX, 0)
            XCTAssertLessThanOrEqual(result.frame.maxX, app.frame.width)
            if genericResult {
                XCTAssertEqual(header.frame.height, baselineHeight, accuracy: 1)
                XCTAssertEqual(result.frame.height, baselineResultHeight, accuracy: 1)
                print("CANONICAL_NAMED_RESULT_HEADER_HEIGHT=\(header.frame.height); RESULT_HEIGHT=\(result.frame.height)")
                capture(app, "Scorecard-canonical-winning-team-copy")
            } else {
                baselineHeight = header.frame.height
                baselineResultHeight = result.frame.height
            }
            app.terminate()
        }
    }

    func testScorecardIdentityHeaderHeightAndReviewNavigation() {
        let app = launchPicker(twoStates: true, knownCourseAsset: true)
        reach(app.buttons["score.scorecard.quick"], app).tap()
        let header = app.descendants(matching: .any).matching(identifier: "scorecard.header").firstMatch
        XCTAssertTrue(header.waitForExistence(timeout: 5))
        print("SCORECARD_IDENTITY_HEADER_HEIGHT=\(header.frame.height)")
        XCTAssertLessThanOrEqual(header.frame.height, 232, "Keep the replacement within five points of the 227.33-point baseline.")
        XCTAssertEqual(app.staticTexts["scorecard.header.context"].label, "Round 1 · Best Ball")
        XCTAssertEqual(app.staticTexts["scorecard.header.matchNumber"].label, "Match 4 of 6")
        XCTAssertEqual(app.staticTexts["scorecard.header.course"].label, "Ocean Course · Gold")
        XCTAssertEqual(app.staticTexts["scorecard.header.players.1"].label, "Pines players: Alex Morgan · Jordan Lee")
        XCTAssertEqual(app.staticTexts["scorecard.header.players.2"].label, "Dunes players: Taylor Kim · Cameron Diaz")
        XCTAssertEqual(app.staticTexts["scorecard.header.result"].label, "Pines 1 UP · Thru 6")
        XCTAssertEqual(app.staticTexts["scorecard.header.official"].label, "Official")
        XCTAssertFalse(app.staticTexts["Official server values only"].exists)
        capture(app, "Scorecard-identity-header-routine")
        app.buttons["scorecard.hole.1"].tap()
        XCTAssertTrue(app.staticTexts["score.correction.title"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["score.correction.title"].label, "CORRECTING HOLE 1")
        XCTAssertTrue(app.buttons["score.hole.1"].isSelected)
        app.terminate()
    }

    func testScorecardHeaderAllFormatsAndFinalUseCanonicalIdentityWithoutGuessedMatchNumber() {
        for (scenario, format, result) in [("active-bb", "Best Ball", "Pines 1 UP · Thru 6"),
                                           ("active-sc", "Scramble", "Pines 1 UP · Thru 6"),
                                           ("active-si", "Singles", "Pines 1 UP · Thru 6"),
                                           ("completed", "Best Ball", "Pines win 3 & 2")] {
            let app = launch(scenario, fullScenario: true, knownCourseAsset: true)
            reach(app.buttons["score.scorecard.quick"], app).tap()
            XCTAssertTrue(app.staticTexts["scorecard.header.context"].waitForExistence(timeout: 5))
            XCTAssertEqual(app.staticTexts["scorecard.header.context"].label, "Round 2 · \(format)")
            XCTAssertFalse(app.staticTexts["scorecard.header.matchNumber"].exists)
            XCTAssertEqual(app.staticTexts["scorecard.header.team.1"].label, "Pines")
            XCTAssertEqual(app.staticTexts["scorecard.header.team.2"].label, "Dunes")
            XCTAssertEqual(app.staticTexts["scorecard.header.result"].label, result)
            XCTAssertEqual(app.staticTexts.matching(identifier: "scorecard.header.result").count, 1)
            XCTAssertEqual(app.staticTexts["scorecard.header.official"].label, "Official")
            capture(app, "Scorecard-header-\(scenario)")
            app.terminate()
        }
    }

    func testScorecardHeaderLongNamesAccessibilityXXXLRemainContainedAndReadable() {
        let app = XCUIApplication()
        app.launchArguments = ["--bagger-ui-testing", "--bagger-ui-test-scenario", "score.long-content",
                               "--bagger-ui-test-known-course-asset", "--bagger-ui-test-open-scorecard",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        let header = app.descendants(matching: .any).matching(identifier: "scorecard.header").firstMatch
        XCTAssertTrue(header.waitForExistence(timeout: 5))
        for id in ["context", "course", "team.1", "team.2", "players.1", "players.2", "result", "official"] {
            let value = app.staticTexts["scorecard.header.\(id)"]
            XCTAssertTrue(value.exists)
            XCTAssertGreaterThanOrEqual(value.frame.minX, 0)
            XCTAssertLessThanOrEqual(value.frame.maxX, app.frame.width)
        }
        XCTAssertTrue(app.staticTexts["scorecard.header.players.1"].label.contains("Alexandria Montgomery-Wellington the Third · Christopher Bartholomew Kensington"))
        capture(app, "Scorecard-header-long-names-XXXL-top")
        let page = app.scrollViews["scorecard.screen"]
        let players = app.staticTexts["scorecard.header.players.1"]
        for _ in 0..<10 where !players.isHittable { page.swipeUp(velocity: .slow) }
        XCTAssertTrue(players.isHittable)
        capture(app, "Scorecard-header-long-names-XXXL-players")
        app.terminate()
    }

    func testPhysicalScorecardEntryUsesCanonicalAssetFallbacksAndOrdinaryBackRoute() {
        let app = XCUIApplication()
        app.launchArguments = ["--bagger-ui-testing", "--bagger-ui-test-scenario", "score.active-bb",
                               "--bagger-ui-test-score-picker", "--bagger-ui-test-known-course-asset",
                               "--bagger-ui-test-scorecard-team-assets", "--bagger-ui-test-open-scorecard"]
        app.launch()
        let header = app.descendants(matching: .any).matching(identifier: "scorecard.header").firstMatch
        XCTAssertTrue(header.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["scorecard.header.matchNumber"].label, "Match 4 of 6")
        XCTAssertEqual(app.staticTexts["scorecard.header.team.1"].label, "The Pickles")
        XCTAssertEqual(app.staticTexts["scorecard.header.team.2"].label, "Lipp it and Rip it")
        XCTAssertEqual(app.staticTexts["scorecard.header.result"].label, "The Pickles 1 UP · Thru 6")
        print("SCORECARD_KNOWN_ASSET_HEADER_HEIGHT=\(header.frame.height)")
        XCTAssertLessThan(header.frame.height, 260)
        capture(app, "Scorecard-header-physical-known-assets")
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["score.chooseMatch"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["score.hole.7"].isSelected)
        app.terminate()
    }

    func testCanonicalCourseLogoIsInlineWithoutIncreasingContextHeightAcrossFormats() {
        for format in ["bb", "sc", "si"] {
            var fallbackHeight: CGFloat = 0
            for knownAsset in [false, true] {
                let app = launch(format, knownCourseAsset: knownAsset)
                let text = app.staticTexts["score.courseText"]
                let row = app.descendants(matching: .any).matching(identifier: "score.courseContext").firstMatch
                let context = app.descendants(matching: .any).matching(identifier: "score.matchContext").firstMatch
                XCTAssertEqual(text.label, "Ocean Course · Gold")
                XCTAssertEqual(row.frame.height, text.frame.height, accuracy: 1,
                               "The decorative logo must fit inside the existing text line, not add height.")
                if knownAsset { XCTAssertEqual(context.frame.height, fallbackHeight, accuracy: 1) }
                else { fallbackHeight = context.frame.height }
                XCTAssertEqual(app.staticTexts.matching(identifier: "score.courseText").count, 1)
                XCTAssertEqual(app.images.matching(NSPredicate(format: "label CONTAINS %@", "Ocean Course")).count, 0,
                               "The adjacent text, not the decorative logo, announces the course once.")
                XCTAssertTrue(app.buttons["score.hole.7"].isSelected)
                capture(app, "Course-logo-\(format)-\(knownAsset ? "canonical" : "fallback")")
                app.terminate()
            }
        }
    }

    func testCanonicalCourseLogoPreservesLargeAndAccessibilityXXXLText() {
        for size in ["UICTContentSizeCategoryXXXL", "UICTContentSizeCategoryAccessibilityXXXL"] {
            let app = launch("bb", size: size, knownCourseAsset: true)
            let text = app.staticTexts["score.courseText"]
            let row = app.descendants(matching: .any).matching(identifier: "score.courseContext").firstMatch
            reach(text, app)
            XCTAssertEqual(text.label, "Ocean Course · Gold")
            XCTAssertGreaterThanOrEqual(row.frame.minX, 0)
            XCTAssertLessThanOrEqual(row.frame.maxX, app.frame.width)
            XCTAssertEqual(row.frame.height, text.frame.height, accuracy: 1)
            capture(app, "Course-logo-\(size)")
            app.terminate()
        }
    }

    func testRoutinePickerFixtureShowsCourseLogoWithoutChangingApprovedMatchSwitch() {
        let app = launchPicker(twoStates: true, knownCourseAsset: true)
        XCTAssertEqual(app.staticTexts["score.courseText"].label, "Ocean Course · Gold")
        XCTAssertTrue(app.buttons["score.hole.7"].isSelected)
        capture(app, "Course-logo-physical-routine")
        app.buttons["score.chooseMatch"].tap()
        let scramble = app.buttons["score.matchPicker.choice.fixture-score-sc"]
        XCTAssertTrue(scramble.waitForExistence(timeout: 5))
        scramble.tap()
        XCTAssertTrue(app.buttons["score.hole.18"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["score.hole.18"].isSelected)
        XCTAssertEqual(app.staticTexts["score.courseText"].label, "Ocean Course · Gold")
        app.terminate()
    }

    func testOrdinaryScoreVerticalMeasurement() {
        for format in ["bb", "sc", "si"] {
            let app = XCUIApplication()
            app.launchArguments = ["--bagger-ui-testing", "--bagger-ui-test-scenario", "score.active-\(format)"]
            app.launch()
            app.tabBars.buttons["Score"].tap()
            let screen = app.scrollViews["score.screen"]
            XCTAssertTrue(screen.waitForExistence(timeout: 5))
            let context = app.descendants(matching: .any).matching(identifier: "score.matchContext").firstMatch
            let startY = context.frame.minY
            let save = app.buttons["score.saveNext"]
            let lastKey = app.buttons["score.keypad.plus"]
            var swipes = 0
            let first = XCTAttachment(screenshot: app.screenshot())
            first.name = "Score-\(format)-initial"; first.lifetime = .keepAlways; add(first)
            while !save.isHittable && swipes < 12 {
                screen.swipeUp(velocity: .slow); swipes += 1
            }
            XCTAssertTrue(save.isHittable)
            XCTAssertGreaterThanOrEqual(save.frame.height, 56)
            let measuredHeight = save.frame.maxY - context.frame.minY
            print("SCORE_DENSITY format=\(format) viewport=\(screen.frame.height) initialContextY=\(startY) contextThroughSave=\(measuredHeight) swipesToSave=\(swipes)")
            if lastKey.exists {
                let contentHeight = lastKey.frame.maxY - context.frame.minY
                print("SCORE_KEYPAD_DENSITY format=\(format) contextThroughLastKey=\(contentHeight) lastKeyInitiallyHittable=\(lastKey.isHittable)")
                reach(lastKey, app).tap() // fixture-only local entry; never Save
                XCTAssertTrue(save.isHittable)
            }
            let last = XCTAttachment(screenshot: app.screenshot())
            last.name = "Score-\(format)-save"; last.lifetime = .keepAlways; add(last)
            app.terminate()
        }
    }

    func testDirectEntrySelectionAdjustmentClearAndNoImplicitSave() {
        let app = launch("bb")
        let first = app.buttons["score.input.side1.slot1"]
        XCTAssertTrue(first.isSelected)
        let keyPosition = app.buttons["score.keypad.5"].frame.minY
        for (key, next) in [("4", "side1.slot2"), ("5", "side2.slot1"), ("6", "side2.slot2")] {
            reach(app.buttons["score.keypad.\(key)"], app).tap()
            XCTAssertTrue(app.buttons["score.input.\(next)"].isSelected)
            XCTAssertEqual(app.buttons["score.keypad.5"].frame.minY, keyPosition, accuracy: 0.5,
                           "Entering a new score must not move the keypad beneath the golfer's hand.")
        }
        reach(app.buttons["score.keypad.10"], app).tap()
        XCTAssertTrue((app.buttons["score.input.side2.slot2"].value as? String ?? "").contains("10, Edited"))
        XCTAssertTrue(app.buttons["score.saveNext"].isEnabled)
        XCTAssertTrue(app.buttons["score.hole.7"].isSelected)
        reach(first, app).tap()
        reach(app.buttons["score.keypad.plus"], app).tap()
        XCTAssertTrue(first.isSelected)
        XCTAssertTrue((first.value as? String ?? "").contains("5, Edited"))
        reach(app.buttons["score.keypad.clear"], app).tap()
        XCTAssertTrue((first.value as? String ?? "").contains("not entered"))
        XCTAssertFalse(app.buttons["score.saveNext"].isEnabled)
        reach(app.buttons["score.keypad.plus"], app).tap()
        XCTAssertTrue((first.value as? String ?? "").contains("11, Edited"))
        XCTAssertTrue(first.isSelected)
        XCTAssertEqual(app.keyboards.count, 0)
        app.terminate()
    }

    func testCorrectionClearRequiresCompleteExplicitSaveAndKeepsOfficial() {
        let app = launch("bb")
        reach(app.buttons["score.scorecard.quick"], app).tap()
        XCTAssertTrue(app.scrollViews["scorecard.screen"].waitForExistence(timeout: 5))
        app.buttons["scorecard.hole.1"].tap()
        XCTAssertEqual(app.staticTexts["score.correction.title"].label, "CORRECTING HOLE 1")
        let first = app.buttons["score.input.side1.slot1"]
        reach(first, app).tap()
        reach(app.buttons["score.keypad.clear"], app).tap()
        XCTAssertFalse(app.buttons["score.saveNext"].isEnabled)
        reach(app.buttons["score.keypad.6"], app).tap()
        XCTAssertTrue(first.isSelected)
        XCTAssertTrue((first.value as? String ?? "").contains("6, Edited"))
        app.buttons["score.saveNext"].tap()
        XCTAssertTrue(app.buttons["Save Correction"].waitForExistence(timeout: 3))
        app.buttons["Keep Editing"].tap()
        XCTAssertTrue(app.buttons["score.hole.1"].isSelected)
        XCTAssertTrue((first.value as? String ?? "").contains("6, Edited"))
        app.terminate()
    }

    func testAllFormatsDefaultLargeAndAccessibilityXXXLRemainContained() {
        for format in ["bb", "sc", "si"] {
            for size in ["UICTContentSizeCategoryL", "UICTContentSizeCategoryXXXL", "UICTContentSizeCategoryAccessibilityXXXL"] {
                let app = launch(format, size: size)
                let keys = format == "bb" ? ["side1.slot1", "side1.slot2", "side2.slot1", "side2.slot2"] : ["side1.slot1", "side2.slot1"]
                for key in keys {
                    let target = reach(app.buttons["score.input.\(key)"], app)
                    XCTAssertGreaterThanOrEqual(target.frame.height, 56)
                    XCTAssertGreaterThanOrEqual(target.frame.minX, 0)
                    XCTAssertLessThanOrEqual(target.frame.maxX, app.frame.width)
                    XCTAssertTrue((target.value as? String ?? "").contains("Hole 7"))
                    if format == "sc" { XCTAssertFalse((target.value as? String ?? "").contains("HCP")) }
                }
                for key in ["1", "5", "9", "minus", "10", "plus"] {
                    let button = reach(app.buttons["score.keypad.\(key)"], app)
                    XCTAssertGreaterThanOrEqual(button.frame.height, 56)
                    XCTAssertGreaterThanOrEqual(button.frame.width, 56)
                    XCTAssertLessThanOrEqual(button.frame.maxX, app.frame.width)
                }
                let capture = XCTAttachment(screenshot: app.screenshot())
                capture.name = "Score-\(format)-\(size)"; capture.lifetime = .keepAlways; add(capture)
                XCTAssertTrue(app.buttons["score.saveNext"].isHittable)
                XCTAssertEqual(app.keyboards.count, 0)
                app.terminate()
            }
        }
    }

    func testLongNamesRetainFullAccessibleIdentity() {
        let app = launch("long-content", size: "UICTContentSizeCategoryAccessibilityXXXL", fullScenario: true)
        let target = reach(app.buttons["score.input.side1.slot1"], app)
        XCTAssertTrue(target.label.contains("Alexandria Montgomery-Wellington the Third"))
        XCTAssertGreaterThanOrEqual(target.frame.height, 56)
        XCTAssertLessThanOrEqual(target.frame.maxX, app.frame.width)
        reach(app.buttons["score.keypad.plus"], app)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Score-long-names-XXXL"; capture.lifetime = .keepAlways; add(capture)
        app.terminate()
    }

    func testScorecardSharedGrammarLocalScrollAndReturnForEveryFormat() {
        for format in ["bb", "sc", "si"] {
            let app = launch(format)
            reach(app.buttons["score.scorecard.quick"], app).tap()
            let page = app.scrollViews["scorecard.screen"]
            XCTAssertTrue(page.waitForExistence(timeout: 5))
            for (nine, firstHole, lastHole) in [("front", 1, 9), ("back", 10, 18)] {
                let prefix = "scorecard.grid.\(nine)"
                let first = app.descendants(matching: .any).matching(identifier: "\(prefix).cell.holes.hole.\(firstHole)").firstMatch
                for _ in 0..<10 where !first.exists || first.frame.minY > app.frame.height * 0.45 {
                    page.swipeUp(velocity: .slow)
                }
                XCTAssertTrue(first.exists)
                let identities = app.descendants(matching: .any).matching(identifier: "\(prefix).identities").firstMatch
                let x = identities.frame.minX
                let columns = app.scrollViews["\(prefix).scroll"]
                XCTAssertLessThan(columns.frame.width, 9 * first.frame.width)
                XCTAssertLessThanOrEqual(columns.frame.maxX, app.frame.width)
                columns.swipeLeft(velocity: .slow)
                let last = app.descendants(matching: .any).matching(identifier: "\(prefix).cell.holes.hole.\(lastHole)").firstMatch
                XCTAssertTrue(last.exists)
                XCTAssertEqual(identities.frame.minX, x, accuracy: 0.5)
                XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "\(prefix).label.result").firstMatch.exists)
                XCTAssertFalse(app.descendants(matching: .any).matching(identifier: "\(prefix).label.status").firstMatch.exists)
                let screenshot = XCTAttachment(screenshot: app.screenshot())
                screenshot.name = "Scorecard-\(format)-\(nine)"; screenshot.lifetime = .keepAlways; add(screenshot)
            }
            app.navigationBars.buttons.firstMatch.tap()
            XCTAssertTrue(app.buttons["score.hole.7"].isSelected)
            app.terminate()
        }
    }

    func testPhysicalPolishCanonicalResultCorrectionAndSharedLiveForEachFormat() {
        for format in ["bb", "sc", "si"] {
            let app = launch(format)
            let live = app.descendants(matching: .any).matching(identifier: "score.status.live").firstMatch
            XCTAssertEqual(live.label, "Match status: Live")
            XCTAssertFalse(app.staticTexts["score.holeResult.result"].exists, "Unplayed holes must not manufacture a winner.")
            reach(app.buttons["score.scorecard.quick"], app).tap()
            XCTAssertTrue(app.scrollViews["scorecard.screen"].waitForExistence(timeout: 5))
            app.buttons["scorecard.hole.1"].tap()
            let result = app.staticTexts["score.holeResult.result"]
            XCTAssertEqual(result.label, "Winner: Pines")
            XCTAssertEqual(app.staticTexts["score.holeResult.net"].label, "Pines Net 3 · Dunes Net 5")
            XCTAssertEqual(app.staticTexts["score.holeResult.authority"].label, "Official")
            XCTAssertEqual(app.staticTexts["score.correction.title"].label, "CORRECTING HOLE 1")
            XCTAssertEqual(app.staticTexts["score.correction.message"].label, "Official scores stay unchanged until saved and confirmed.")
            let first = app.buttons["score.input.side1.slot1"]
            XCTAssertTrue(first.isSelected)
            XCTAssertTrue((first.value as? String ?? "").contains("Official"))
            XCTAssertGreaterThanOrEqual(first.frame.height, 56)
            if format == "sc" { XCTAssertFalse((first.value as? String ?? "").contains("HCP")) }
            let capture = XCTAttachment(screenshot: app.screenshot())
            capture.name = "Physical-polish-\(format)-result-correction"; capture.lifetime = .keepAlways; add(capture)
            app.terminate()
        }
    }

    func testPhysicalPolishCompactCompletionRemainsDeliberate() {
        let app = launch("finalization-ready", fullScenario: true)
        let card = app.descendants(matching: .any).matching(identifier: "score.finalization").firstMatch
        let screen = app.scrollViews["score.screen"]
        let save = app.buttons["score.saveNext"]
        for _ in 0..<12 {
            if card.exists && card.frame.maxY <= save.frame.minY - 4 { break }
            screen.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(card.exists)
        XCTAssertLessThan(card.frame.height, 140, "Routine ready-state completion should stay compact.")
        let message = app.staticTexts["score.finalization.message"]
        XCTAssertTrue(message.label.contains("Online-only; confirmation required"))
        let finalize = app.buttons["score.finalize"]
        XCTAssertTrue(finalize.isHittable)
        XCTAssertGreaterThanOrEqual(finalize.frame.height, 44)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Physical-polish-compact-completion"; capture.lifetime = .keepAlways; add(capture)
        print("SCORE_COMPLETION_HEIGHT=\(card.frame.height)")
        finalize.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Finalize this Match?")).firstMatch.waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Canonical scoring state confirms this Match is final")).firstMatch.exists)
        app.terminate() // No confirmation or scoring mutation in this presentation test.
    }

    func testFreshAuthorizedMatchPickerShowsOnlyWritableChoicesAndSwitchesExactly() {
        let app = launchPicker()
        XCTAssertGreaterThanOrEqual(app.buttons["score.chooseMatch"].frame.height, 44)
        app.buttons["score.chooseMatch"].tap()
        let bb = app.buttons["score.matchPicker.choice.fixture-score-bb"]
        let sc = app.buttons["score.matchPicker.choice.fixture-score-sc"]
        XCTAssertTrue(sc.waitForExistence(timeout: 5))
        XCTAssertTrue(bb.label.contains("Current"))
        XCTAssertTrue(bb.label.contains("Round 1")); XCTAssertTrue(bb.label.contains("Best Ball"))
        XCTAssertTrue(sc.label.contains("Round 2")); XCTAssertTrue(sc.label.contains("Scramble"))
        XCTAssertTrue(sc.label.contains("4 of 6")); XCTAssertTrue(sc.label.contains("9:30 AM"))
        XCTAssertFalse(app.buttons["score.matchPicker.choice.fixture-score-si"].exists)
        capture(app, "Authorized-Match-picker")
        sc.tap()
        XCTAssertTrue(app.buttons["score.chooseMatch"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["score.chooseMatch"].label.contains("Scramble"))
        XCTAssertFalse((app.buttons["score.input.side1.slot1"].value as? String ?? "").contains("HCP"))
        XCTAssertFalse(app.buttons["score.input.side1.slot2"].exists)
        capture(app, "Authorized-Match-switched-Scramble")
        app.terminate()
    }

    func testMatchPickerPreservesEditsUntilExplicitDiscardAndNeverMovesThemToAnotherMatch() {
        let app = launchPicker()
        reach(app.buttons["score.keypad.4"], app).tap()
        reach(app.buttons["score.chooseMatch"], app).tap()
        XCTAssertTrue(app.buttons["Keep Editing"].waitForExistence(timeout: 3))
        app.buttons["Keep Editing"].tap()
        XCTAssertTrue((app.buttons["score.input.side1.slot1"].value as? String ?? "").contains("4, Edited"))
        app.buttons["score.chooseMatch"].tap()
        app.buttons["Discard and Choose"].tap()
        let sc = app.buttons["score.matchPicker.choice.fixture-score-sc"]
        XCTAssertTrue(sc.waitForExistence(timeout: 5)); sc.tap()
        XCTAssertTrue(app.buttons["score.chooseMatch"].waitForExistence(timeout: 5))
        app.buttons["score.chooseMatch"].tap()
        let bb = app.buttons["score.matchPicker.choice.fixture-score-bb"]
        XCTAssertTrue(bb.waitForExistence(timeout: 5)); bb.tap()
        XCTAssertTrue(app.buttons["score.chooseMatch"].waitForExistence(timeout: 5))
        XCTAssertTrue((app.buttons["score.input.side1.slot1"].value as? String ?? "").contains("not entered"))
        XCTAssertFalse(app.buttons["score.saveNext"].isEnabled)
        app.terminate()
    }

    func testRevokedPickerChoiceFailsClosedWithoutSwitchingVisibleMatch() {
        let app = launchPicker(revoked: true)
        app.buttons["score.chooseMatch"].tap()
        let sc = app.buttons["score.matchPicker.choice.fixture-score-sc"]
        XCTAssertTrue(sc.waitForExistence(timeout: 5)); sc.tap()
        XCTAssertTrue(app.buttons["score.matchPicker.retry"].waitForExistence(timeout: 5))
        XCTAssertFalse(sc.exists)
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["score.chooseMatch"].label.contains("Best Ball"))
        XCTAssertFalse(app.buttons["score.saveNext"].isEnabled)
        app.terminate()
    }

    func testHole18CorrectionHasPriorityUntilReviewOrDirtyEditsAreResolved() {
        let app = launch("finalization-ready", fullScenario: true)
        let first = app.buttons["score.input.side1.slot1"]
        reach(first, app).tap()
        XCTAssertTrue(app.staticTexts["score.correction.title"].label.contains("CORRECTING HOLE 18"))
        XCTAssertFalse(app.buttons["score.finalize"].exists)
        XCTAssertEqual(app.buttons["score.saveNext"].label, "Save Correction")
        XCTAssertGreaterThanOrEqual(app.buttons["score.correction.done"].frame.height, 44)
        capture(app, "Hole-18-active-review-no-Finalize")
        reach(app.buttons["score.correction.done"], app).tap()
        XCTAssertTrue(app.buttons["score.finalize"].exists)
        reach(first, app).tap()
        reach(app.buttons["score.keypad.6"], app).tap()
        XCTAssertTrue(app.buttons["score.saveNext"].isEnabled)
        XCTAssertFalse(app.buttons["score.finalize"].exists)
        XCTAssertFalse(app.buttons["score.correction.done"].exists)
        capture(app, "Hole-18-dirty-correction-primary")
        reach(app.buttons["score.discard"], app).tap()
        XCTAssertTrue(app.buttons["score.finalize"].exists)
        XCTAssertFalse(app.buttons["score.saveNext"].isEnabled)
        app.terminate() // Local review/discard only; no Save/finalization.
    }

    func testTwoStatePhysicalFixtureKeepsRoutineAndHole18ReviewNetworkFree() {
        let app = launchPicker(twoStates: true)
        XCTAssertTrue(app.buttons["score.hole.7"].isSelected)
        XCTAssertFalse(app.buttons["score.saveNext"].isEnabled)
        capture(app, "Physical-two-state-routine-Hole-7")
        app.buttons["score.chooseMatch"].tap()
        let sc = app.buttons["score.matchPicker.choice.fixture-score-sc"]
        XCTAssertTrue(sc.waitForExistence(timeout: 5)); sc.tap()
        XCTAssertTrue(app.buttons["score.chooseMatch"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["score.hole.18"].isSelected)
        XCTAssertTrue(app.buttons["score.finalize"].exists)
        reach(app.buttons["score.input.side1.slot1"], app).tap()
        XCTAssertFalse(app.buttons["score.finalize"].exists)
        XCTAssertEqual(app.buttons["score.saveNext"].label, "Save Correction")
        capture(app, "Physical-two-state-Scramble-Hole-18-review")
        reach(app.buttons["score.correction.done"], app).tap()
        XCTAssertTrue(app.buttons["score.finalize"].exists)
        app.terminate()
    }

    func testAuthorizedPickerAccessibilityXXXLRemainsContained() {
        let app = launchPicker(size: "UICTContentSizeCategoryAccessibilityXXXL")
        reach(app.buttons["score.chooseMatch"], app).tap()
        let bb = app.buttons["score.matchPicker.choice.fixture-score-bb"]
        XCTAssertTrue(bb.waitForExistence(timeout: 5))
        XCTAssertTrue(bb.label.contains("Best Ball")); XCTAssertTrue(bb.label.contains("Pines"))
        XCTAssertLessThanOrEqual(bb.frame.maxX, app.frame.width)
        XCTAssertGreaterThanOrEqual(bb.frame.minX, 0)
        XCTAssertGreaterThanOrEqual(bb.frame.height, 44)
        capture(app, "Authorized-picker-Accessibility-XXXL")
        app.terminate()
    }

    private func launchPicker(revoked: Bool = false, twoStates: Bool = false, size: String? = nil, knownCourseAsset: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--bagger-ui-testing", "--bagger-ui-test-scenario", "score.active-bb", "--bagger-ui-test-score-picker"]
        if revoked { app.launchArguments += ["--bagger-ui-test-picker-revoked"] }
        if twoStates { app.launchArguments += ["--bagger-ui-test-score-picker-two-states"] }
        if knownCourseAsset { app.launchArguments += ["--bagger-ui-test-known-course-asset"] }
        if let size { app.launchArguments += ["-UIPreferredContentSizeCategoryName", size] }
        app.launch()
        XCTAssertTrue(app.buttons["score.chooseMatch"].waitForExistence(timeout: 5))
        return app
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }

    private func launch(_ format: String, size: String? = nil, fullScenario: Bool = false, knownCourseAsset: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--bagger-ui-testing", "--bagger-ui-test-scenario", fullScenario ? "score.\(format)" : "score.active-\(format)"]
        if knownCourseAsset { app.launchArguments += ["--bagger-ui-test-known-course-asset"] }
        if let size { app.launchArguments += ["-UIPreferredContentSizeCategoryName", size] }
        app.launch(); app.tabBars.buttons["Score"].tap()
        XCTAssertTrue(app.scrollViews["score.screen"].waitForExistence(timeout: 5))
        return app
    }

    @discardableResult private func reach(_ target: XCUIElement, _ app: XCUIApplication) -> XCUIElement {
        let screen = app.scrollViews["score.screen"]
        for _ in 0..<16 where !fullyHittable(target, app) {
            guard target.exists, !target.frame.isEmpty else {
                screen.swipeUp(velocity: .slow)
                continue
            }
            let save = app.buttons["score.saveNext"]
            let top = screen.frame.minY + 8
            let bottom = min(screen.frame.maxY - 8, save.exists ? save.frame.minY - 4 : screen.frame.maxY - 8)
            // Move by the actual occluded distance. A full-screen swipe can
            // oscillate past a tall XXXL player row above the fixed Save dock.
            let distance: CGFloat
            if target.frame.maxY > bottom { distance = -min(180, max(32, target.frame.maxY - bottom + 8)) }
            else if target.frame.minY < top { distance = min(180, max(32, top - target.frame.minY + 8)) }
            else { distance = target.frame.midY < (top + bottom) / 2 ? 48 : -48 }
            let start = app.coordinate(withNormalizedOffset: .zero)
                .withOffset(CGVector(dx: screen.frame.maxX - 6, dy: (top + bottom) / 2))
            start.press(forDuration: 0.01, thenDragTo: start.withOffset(CGVector(dx: 0, dy: distance)))
        }
        XCTAssertTrue(target.exists); XCTAssertTrue(fullyHittable(target, app))
        return target
    }

    private func fullyHittable(_ target: XCUIElement, _ app: XCUIApplication) -> Bool {
        guard target.isHittable else { return false }
        guard target.identifier.hasPrefix("score.keypad.") || target.identifier.hasPrefix("score.input.") else { return true }
        let save = app.buttons["score.saveNext"]
        // XCTest may call a partly exposed key hittable even when its tap
        // center is underneath the fixed Save dock on the shorter Pro screen.
        return !save.exists || target.frame.maxY <= save.frame.minY - 4
    }
}
