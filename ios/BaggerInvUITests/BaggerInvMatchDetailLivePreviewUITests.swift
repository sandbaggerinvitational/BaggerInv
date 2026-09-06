import UIKit
import XCTest

/// Explicitly gated, restored-session-only native acceptance. No OTP, sign-out,
/// scoring action, backend mutation, token extraction, or authentication logging.
@MainActor
final class BaggerInvMatchDetailLivePreviewUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    /// Authentication only: explicit single-use authorization is supplied by a
    /// temporary xctestrun configuration with all automatic captures disabled.
    /// The user completes CAPTCHA and enters/verifies the OTP directly in the
    /// normal app. This harness never reads either secret, resends, or scores.
    func testAuthorizedSinglePreviewOTPWithUserEntry() throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["BAGGER_STEP2J3B_AUTH_CAPTURE_DISABLED"] == "1" else {
            throw XCTSkip("Authentication requires a capture-disabled runner.")
        }
        let app = XCUIApplication()
        if environment["BAGGER_STEP2J3B_AUTH_PRIVACY_PREFLIGHT"] == "1" {
            app.launchArguments = ["--bagger-ui-testing", "--bagger-ui-test-scenario", "auth.signed-out"]
            app.launch()
            print("STEP2J3B_AUTH_PRIVACY_PREFLIGHT_COMPLETE_NO_OTP")
            return
        }
        guard environment["BAGGER_STEP2J3B_SINGLE_OTP_AUTHORIZED"] == "1",
              let email = environment["BAGGER_STEP2J3B_APPROVED_EMAIL"],
              email.lowercased() == "beltran.clay@gmail.com"
        else { throw XCTSkip("One approved Preview OTP has not been authorized.") }

        app.launchArguments = ["--bagger-acceptance-probes"]
        app.launch()
        let field = app.textFields["Approved participant email"]
        let bootstrapDeadline = Date().addingTimeInterval(40)
        while Date() < bootstrapDeadline, !field.exists, !element("today.screen", app).exists {
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        guard field.exists else {
            print("STEP2J3B_AUTH_NO_OTP_REQUESTED_NOT_AT_SIGNIN")
            return
        }
        // Only the approved email is typed by automation. Never send an OTP
        // through XCTest typing, clipboard, launch arguments, or files.
        field.tap()
        field.typeText(email)
        let send = app.buttons["Send Code"]
        guard send.isHittable else {
            print("STEP2J3B_AUTH_NO_OTP_REQUESTED_SEND_UNAVAILABLE")
            return
        }
        send.tap() // Exactly one request attempt; no retry/resend path.
        print("STEP2J3B_AUTH_USER_SECURITY_CHECK_REQUIRED")

        let deadline = Date().addingTimeInterval(15 * 60)
        var announcedOTP = false
        while Date() < deadline {
            if !announcedOTP, app.textFields["One-time sign-in code"].exists {
                announcedOTP = true
                print("STEP2J3B_AUTH_OTP_REQUEST_ACKNOWLEDGED_ENTER_DIRECTLY_IN_SIMULATOR")
            }
            if element("today.screen", app).exists {
                print("STEP2J3B_AUTHENTICATED_READY_FOR_READ_ONLY_QA")
                return
            }
            RunLoop.current.run(until: Date().addingTimeInterval(1))
        }
        print("STEP2J3B_AUTH_STOPPED_USER_ENTRY_TIMEOUT_NO_RESEND")
    }

    func testRestoredPreviewGameCenterReadOnly() throws {
        let key = "BAGGER_STEP2J3B_RESTORED_MATCH_DETAIL_QA"
        let authorization = ProcessInfo.processInfo.environment[key] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: key) as? String)
        guard authorization == "1" else {
            throw XCTSkip("Explicit restored Preview Match Detail acceptance is not enabled.")
        }
        let app = XCUIApplication()
        app.launchArguments = ["--bagger-acceptance-probes"]
        app.launch()
        guard element("today.screen", app).waitForExistence(timeout: 40) else {
            throw XCTSkip("No reusable native Preview session. Stop and request OTP authorization.")
        }
        XCTAssertFalse(app.textFields["Approved participant email"].exists)
        openMatches(app)
        let rounds = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'matches.round.'")
        ).allElementsBoundByIndex.map(\.identifier)
        XCTAssertGreaterThanOrEqual(rounds.count, 3)
        var formats = Set<String>()
        for round in rounds {
            selectRound(round, app)
            openOwnedMatch(app)
            let owned = waitForRead(app, owned: true)
            for format in ["BB", "SC", "SI"] where owned.contains("format \(format);") {
                formats.insert(format)
            }
            let beforeNotModified = readCounter("not modified", summary: owned)
            refreshDetail(app)
            waitUntil("Conditional Match Detail revalidation did not return 304") {
                let summary = self.readSummary(app)
                return summary.contains("status 304") &&
                    self.readCounter("not modified", summary: summary) > beforeNotModified
            }
            let next = reachable("match.gameCenter.next", app)
            let previous = reachable("match.gameCenter.previous", app)
            let sibling = next.isEnabled ? next : previous
            XCTAssertTrue(sibling.isEnabled && sibling.isHittable)
            sibling.tap()
            _ = waitForRead(app, owned: false)
            let backToMine = reachable("match.gameCenter.backToMyMatch", app)
            XCTAssertTrue(backToMine.isHittable)
            backToMine.tap()
            _ = waitForRead(app, owned: true)
            app.navigationBars.buttons.firstMatch.tap()
            XCTAssertTrue(element("matches.screen", app).waitForExistence(timeout: 8))
        }
        XCTAssertEqual(formats, Set(["BB", "SC", "SI"]))

        // Relaunch is essential: an in-memory repository cannot satisfy this
        // disk-cache-first assertion. The app alone retains its normal Keychain.
        app.terminate()
        app.launch()
        XCTAssertTrue(element("today.screen", app).waitForExistence(timeout: 40))
        openMatches(app)
        guard let firstRound = rounds.first else { return }
        selectRound(firstRound, app)
        openOwnedMatch(app)
        let restored = waitForRead(app, owned: true)
        XCTAssertFalse(restored.contains("cache loads 0"), "Relaunch did not load eligible Match Detail disk cache.")
        XCTAssertFalse(app.buttons["score.saveNext"].exists)
        XCTAssertFalse(app.buttons["score.finalize"].exists)
        print("STEP2J3B_NATIVE_RESTORED_READ_QA: OWNED/NONOWNED BB/SC/SI NAVIGATION OPAQUE_ID ETAG304 CACHED_FIRST VERIFIED")
    }

    private func element(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[id]
    }

    private func openMatches(_ app: XCUIApplication) {
        let tab = app.tabBars.buttons["Matches"]
        XCTAssertTrue(tab.waitForExistence(timeout: 10))
        tab.tap()
        XCTAssertTrue(element("matches.roundSelector", app).waitForExistence(timeout: 30))
    }

    private func selectRound(_ id: String, _ app: XCUIApplication) {
        for _ in 0..<6 { app.scrollViews.firstMatch.swipeDown() }
        let round = app.buttons[id]
        let selector = element("matches.roundSelector", app)
        for _ in 0..<4 where !round.isHittable { selector.swipeLeft() }
        for _ in 0..<4 where !round.isHittable { selector.swipeRight() }
        XCTAssertTrue(round.isHittable)
        round.tap()
        XCTAssertTrue(round.isSelected)
    }

    private func openOwnedMatch(_ app: XCUIApplication) {
        let button = reachable("matches.hero.cta", app)
        XCTAssertTrue(button.isHittable)
        button.tap()
        XCTAssertTrue(element("match.gameCenter.readAcceptance", app).waitForExistence(timeout: 15))
    }

    private func readSummary(_ app: XCUIApplication) -> String {
        element("match.gameCenter.readAcceptance", app).value as? String ?? ""
    }

    private func readCounter(_ key: String, summary: String) -> Int {
        let prefix = key + " "
        for component in summary.split(separator: ";") {
            let value = component.trimmingCharacters(in: .whitespaces)
            if value.hasPrefix(prefix), let count = Int(value.dropFirst(prefix.count)) { return count }
        }
        return -1
    }

    @discardableResult
    private func waitForRead(_ app: XCUIApplication, owned: Bool) -> String {
        waitUntil("Native canonical Match Detail did not reach fresh, identity-bound content") {
            let summary = self.readSummary(app)
            return summary.contains("content true;") && summary.contains("freshness fresh;") &&
                summary.contains("round trip true;") && summary.contains("owned \(owned);")
        }
        XCTAssertTrue(element("match.gameCenter.tournament", app).exists)
        return readSummary(app)
    }

    private func refreshDetail(_ app: XCUIApplication) {
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<5 { scroll.swipeDown() }
        let start = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
        let end = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85))
        start.press(forDuration: 0.1, thenDragTo: end)
    }

    private func reachable(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        let target = element(id, app)
        for _ in 0..<10 where !target.isHittable { app.scrollViews.firstMatch.swipeUp() }
        for _ in 0..<10 where !target.isHittable { app.scrollViews.firstMatch.swipeDown() }
        XCTAssertTrue(target.exists, "Required Game Center control was not reachable: \(id)")
        return target
    }

    private func waitUntil(_ message: String, condition: @escaping () -> Bool) {
        let deadline = Date().addingTimeInterval(40)
        while Date() < deadline {
            if condition() { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTFail(message)
    }
}
