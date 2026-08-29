import UIKit
import XCTest

@MainActor
final class BaggerInvLivePreviewUITests: XCTestCase {
    private let otpPasteboardSentinel = "BAGGER_STEP2A_WAITING_FOR_OTP"
    private let cacheAuditReleaseSentinel = "BAGGER_STEP2B_CACHE_AUDIT_COMPLETE"
    private let acceptanceProbeArgument = "--bagger-acceptance-probes"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    override func tearDown() {
        UIPasteboard.general.string = otpPasteboardSentinel
        super.tearDown()
    }

    /// Runs the one intentionally live Step 2A Preview acceptance flow.
    ///
    /// The approved participant email must be supplied to the UI-test runner as
    /// `BAGGER_STEP2A_QA_EMAIL`. The OTP is accepted only through the Simulator
    /// pasteboard and is never printed, persisted by this test, or placed in a
    /// fixture.
    func testLivePreviewAuthenticationRestorationAndSignOut() throws {
        guard let email = approvedPreviewEmail() else {
            throw XCTSkip("Set BAGGER_STEP2A_QA_EMAIL to run the authorized live Preview test.")
        }

        UIPasteboard.general.string = otpPasteboardSentinel

        let app = acceptanceApp()
        app.launch()

        assertSignedOutBootstrap(in: app)

        let emailField = app.textFields["Approved participant email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5), "The native email field did not appear.")
        UIPasteboard.general.string = email
        try pasteCurrentPasteboard(into: emailField, in: app)
        UIPasteboard.general.string = otpPasteboardSentinel

        let sendCode = app.buttons["Send Code"]
        XCTAssertTrue(sendCode.isHittable, "The native Send Code button was not available.")
        sendCode.tap()

        let otpField = completeTurnstileAndWaitForOTPEntry(in: app)
        print("STEP2A_OTP_SENT_AND_AWAITING_CODE")

        try waitForOTPPasteboardValue(timeout: 10 * 60)
        try pasteCurrentPasteboard(into: otpField, in: app)
        UIPasteboard.general.string = otpPasteboardSentinel

        let verify = app.buttons["Verify"]
        XCTAssertTrue(verify.isHittable, "The native Verify button was not enabled.")
        verify.tap()

        let initialCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        print("STEP2A_AUTHENTICATED")

        app.terminate()
        app.launch()

        let restoredCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        XCTAssertTrue(
            restoredCanonicalParticipant == initialCanonicalParticipant,
            "Relaunch did not restore the same canonical participant context."
        )
        print("STEP2A_SESSION_RESTORED")

        signOut(in: app)
        assertSignedOutBootstrap(in: app)

        app.terminate()
        app.launch()
        assertSignedOutBootstrap(in: app)
        print("STEP2A_SIGNED_OUT")
    }

    /// Exercises the temporary signed-out layout on a second Simulator without
    /// requesting an OTP or entering an approved participant identifier.
    func testSignedOutLayoutAndKeyboard() {
        let app = signedOutFixtureApp()
        app.launch()

        assertSignedOutBootstrap(in: app)

        let emailField = app.textFields["Approved participant email"]
        emailField.tap()
        XCTAssertTrue(
            app.keyboards.firstMatch.waitForExistence(timeout: 5),
            "The native email keyboard did not appear."
        )
        emailField.typeText("layout@example.invalid")

        XCTAssertTrue(app.buttons["Send Code"].exists, "Send Code was clipped from the signed-out layout.")
        XCTAssertTrue(
            app.descendants(matching: .any)
                .matching(NSPredicate(format: "label ==[c] 'Preview environment'"))
                .firstMatch.exists,
            "PREVIEW was no longer visible while the keyboard was presented."
        )
    }

    /// Runs the one intentionally live Step 2B Preview read/cache acceptance flow.
    /// It uses the same user-mediated OTP boundary as Step 2A, then verifies all
    /// four read products, termination/relaunch cache eligibility, ETag-backed
    /// revalidation, and sign-out cleanup without printing participant payloads.
    func testLivePreviewReadCacheFoundation() throws {
        let liveReadAuthorization = ProcessInfo.processInfo.environment["BAGGER_STEP2B_LIVE_READ_QA"] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: "BAGGER_STEP2B_LIVE_READ_QA") as? String)
        guard liveReadAuthorization == "1" else {
            throw XCTSkip("Set BAGGER_STEP2B_LIVE_READ_QA=1 only for an explicitly authorized live read-cache run.")
        }
        guard let email = approvedPreviewEmail() else {
            throw XCTSkip("Set BAGGER_STEP2A_QA_EMAIL to run the authorized live Preview test.")
        }

        UIPasteboard.general.string = otpPasteboardSentinel
        let app = acceptanceApp()
        app.launch()
        assertSignedOutBootstrap(in: app)

        let emailField = app.textFields["Approved participant email"]
        UIPasteboard.general.string = email
        try pasteCurrentPasteboard(into: emailField, in: app)
        UIPasteboard.general.string = otpPasteboardSentinel
        app.buttons["Send Code"].tap()

        let otpField = completeTurnstileAndWaitForOTPEntry(in: app)
        print("STEP2B_OTP_SENT_AND_AWAITING_CODE")
        try waitForOTPPasteboardValue(timeout: 10 * 60)
        try pasteCurrentPasteboard(into: otpField, in: app)
        UIPasteboard.general.string = otpPasteboardSentinel

        let coldStart = Date()
        app.buttons["Verify"].tap()
        let initialCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        assertTodayProducts(in: app, expectedSource: "network", timeout: 45)
        print(String(format: "STEP2B_COLD_PRODUCTS_READY_SECONDS=%.3f", Date().timeIntervalSince(coldStart)))

        app.terminate()
        let warmStart = Date()
        app.launch()
        let restoredCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        XCTAssertEqual(
            restoredCanonicalParticipant,
            initialCanonicalParticipant,
            "Relaunch did not restore the same canonical participant context."
        )
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        print(String(format: "STEP2B_WARM_CACHE_AND_REVALIDATION_SECONDS=%.3f", Date().timeIntervalSince(warmStart)))
        print("STEP2B_CACHE_READY_FOR_INSPECTION")

        try waitForCacheAuditRelease(timeout: 5 * 60)
        pullToRefreshToday(in: app)
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        print("STEP2B_EXPLICIT_REVALIDATION_COMPLETE")

        signOut(in: app)
        assertSignedOutBootstrap(in: app)
        app.terminate()
        app.launch()
        assertSignedOutBootstrap(in: app)
        print("STEP2B_SIGN_OUT_CACHE_ISOLATION_COMPLETE")
    }

    /// Read-only live validation for a securely restored Step 2A session. This
    /// test never opens CAPTCHA, requests an OTP, signs out, or mutates scoring.
    func testRestoredPreviewReadProductsWithoutAuthenticationMutation() throws {
        let restoredReadAuthorization = ProcessInfo.processInfo.environment["BAGGER_STEP2B_RESTORED_READ_QA"] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: "BAGGER_STEP2B_RESTORED_READ_QA") as? String)
        guard restoredReadAuthorization == "1" else {
            throw XCTSkip(
                "Set BAGGER_STEP2B_RESTORED_READ_QA=1 only when a restorable Preview session is known to exist."
            )
        }
        let app = acceptanceApp()
        app.launch()
        guard app.descendants(matching: .any)["today.screen"].waitForExistence(timeout: 30) else {
            throw XCTSkip("No restorable Preview session is currently available.")
        }
        _ = assertAuthenticated(in: app, timeout: 5)
        pullToRefreshToday(in: app)
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        print("STEP2B_RESTORED_READ_PRODUCTS_COMPLETE")
    }

    /// Continues the Step 2C live acceptance from an already certified Preview
    /// session. This path never opens CAPTCHA, requests an OTP, or calls a
    /// scoring route. It exists so a harness-only interruption cannot require a
    /// second real authentication request.
    func testRestoredPreviewTodayShellRestorationRefreshAndSignOut() throws {
        let restoredTodayAuthorization = ProcessInfo.processInfo.environment["BAGGER_STEP2C_RESTORED_TODAY_QA"] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: "BAGGER_STEP2C_RESTORED_TODAY_QA") as? String)
        guard restoredTodayAuthorization == "1" else {
            throw XCTSkip(
                "Set BAGGER_STEP2C_RESTORED_TODAY_QA=1 only for an explicitly authorized restored-session run."
            )
        }

        let app = acceptanceApp()
        app.launch()

        let initialCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        assertFiveTabShell(in: app)

        app.terminate()
        app.launch()

        let restoredCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        XCTAssertEqual(
            restoredCanonicalParticipant,
            initialCanonicalParticipant,
            "Relaunch did not restore the same canonical participant context."
        )
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        print("STEP2C_RESTORED_TODAY_READY")
        print("STEP2C_CACHE_READY_FOR_INSPECTION")

        try waitForCacheAuditRelease(timeout: 5 * 60)
        pullToRefreshToday(in: app)
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        print("STEP2C_EXPLICIT_REVALIDATION_COMPLETE")

        signOut(in: app)
        assertSignedOutBootstrap(in: app)
        app.terminate()
        app.launch()
        assertSignedOutBootstrap(in: app)
        print("STEP2C_SIGN_OUT_COMPLETE")
    }

    /// Physical-device Step 2C acceptance for an existing certified Preview
    /// session. This intentionally preserves authentication so offline and
    /// subsequent real-device checks do not require another OTP.
    func testPhysicalPreviewTodayShellRestorationAndRefresh() throws {
        let physicalTodayAuthorization = ProcessInfo.processInfo.environment["BAGGER_STEP2C_PHYSICAL_TODAY_QA"] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: "BAGGER_STEP2C_PHYSICAL_TODAY_QA") as? String)
        guard physicalTodayAuthorization == "1" else {
            throw XCTSkip(
                "Set BAGGER_STEP2C_PHYSICAL_TODAY_QA=1 only for an explicitly authorized physical-device run."
            )
        }

        let app = acceptanceApp()
        app.launch()

        let initialCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        assertFiveTabShell(in: app)

        app.terminate()
        app.launch()

        let restoredCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        XCTAssertTrue(
            restoredCanonicalParticipant == initialCanonicalParticipant,
            "The physical relaunch did not restore the same canonical participant context."
        )
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        pullToRefreshToday(in: app)
        assertTodayProducts(in: app, expectedSource: nil, timeout: 45)
        print("STEP2C_PHYSICAL_TODAY_COMPLETE")
    }

    /// Physical-device Step 2D acceptance for the existing certified Preview
    /// session. This is read-only: it never opens CAPTCHA, requests an OTP,
    /// signs out, or calls a scoring route.
    func testPhysicalPreviewMatchesRestorationRefreshAndDetail() throws {
        let authorization = ProcessInfo.processInfo.environment["BAGGER_STEP2D_PHYSICAL_MATCHES_QA"] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: "BAGGER_STEP2D_PHYSICAL_MATCHES_QA") as? String)
        guard authorization == "1" else {
            throw XCTSkip(
                "Set BAGGER_STEP2D_PHYSICAL_MATCHES_QA=1 only for an explicitly authorized physical-device run."
            )
        }

        let app = acceptanceApp()
        app.launch()

        let initialCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        openMatches(in: app)
        assertMatchesProduct(in: app, timeout: 45)
        let selectedRoundIdentifier = exerciseRoundSelectionAndMatchDetail(in: app)
        pullToRefreshMatches(in: app, timeout: 45)
        XCTAssertTrue(
            app.descendants(matching: .any)[selectedRoundIdentifier].isSelected,
            "Pull to refresh did not retain the selected Round."
        )
        assertMatchesProduct(in: app, timeout: 45)

        app.terminate()
        app.launch()

        let restoredCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        XCTAssertEqual(
            restoredCanonicalParticipant,
            initialCanonicalParticipant,
            "The physical relaunch did not restore the same canonical participant context."
        )
        openMatches(in: app)
        assertMatchesProduct(in: app, timeout: 45)
        print("STEP2D_PHYSICAL_MATCHES_COMPLETE")
    }

    /// One explicitly authorized Step 2E Preview acceptance. It reuses a
    /// restored certified session when available; otherwise it performs the
    /// same user-mediated one-OTP boundary as the earlier native milestones.
    /// It reads scoring-current, exercises only ephemeral UI drafts, and never
    /// invokes a scoring mutation.
    func testLivePreviewScoringReadAndEphemeralDraft() throws {
        let authorization = ProcessInfo.processInfo.environment["BAGGER_STEP2E_LIVE_SCORING_QA"] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: "BAGGER_STEP2E_LIVE_SCORING_QA") as? String)
        guard authorization == "1" else {
            throw XCTSkip(
                "Set BAGGER_STEP2E_LIVE_SCORING_QA=1 only for an explicitly authorized live scoring-read run."
            )
        }

        UIPasteboard.general.string = otpPasteboardSentinel
        let app = acceptanceApp()
        app.launch()

        if app.textFields["Approved participant email"].waitForExistence(timeout: 12) {
            guard let email = approvedPreviewEmail() else {
                throw XCTSkip("Set BAGGER_STEP2A_QA_EMAIL for the authorized Preview participant.")
            }
            let emailField = app.textFields["Approved participant email"]
            UIPasteboard.general.string = email
            try pasteCurrentPasteboard(into: emailField, in: app)
            UIPasteboard.general.string = otpPasteboardSentinel
            app.buttons["Send Code"].tap()

            let otpField = completeTurnstileAndWaitForOTPEntry(in: app)
            print("STEP2E_OTP_SENT_AND_AWAITING_CODE")
            try waitForOTPPasteboardValue(timeout: 10 * 60)
            try pasteCurrentPasteboard(into: otpField, in: app)
            UIPasteboard.general.string = otpPasteboardSentinel
            app.buttons["Verify"].tap()
        }

        let initialCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        let firstReadStart = Date()
        let didCreateDraft = assertLiveScoringRead(in: app, exerciseEphemeralDraft: true)
        print(String(format: "STEP2E_SCORING_CURRENT_READY_SECONDS=%.3f", Date().timeIntervalSince(firstReadStart)))

        app.terminate()
        app.launch()

        let restoredCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        XCTAssertTrue(
            restoredCanonicalParticipant == initialCanonicalParticipant,
            "Relaunch did not restore the same canonical participant context."
        )
        _ = assertLiveScoringRead(in: app, exerciseEphemeralDraft: false)
        if didCreateDraft {
            XCTAssertFalse(
                app.descendants(matching: .any)["score.draftNotice"].exists,
                "An ephemeral Step 2E draft falsely survived app termination."
            )
        }
        print("STEP2E_SCORING_READ_RESTORED_NO_MUTATION")
    }

    /// Physical-device Step 2E acceptance for an existing certified Preview
    /// session. This remains read-only at the API boundary and leaves the
    /// session available for user-mediated offline verification.
    func testPhysicalPreviewScoringReadAndScorecard() throws {
        let authorization = ProcessInfo.processInfo.environment["BAGGER_STEP2E_PHYSICAL_SCORING_QA"] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: "BAGGER_STEP2E_PHYSICAL_SCORING_QA") as? String)
        guard authorization == "1" else {
            throw XCTSkip(
                "Set BAGGER_STEP2E_PHYSICAL_SCORING_QA=1 only for an explicitly authorized physical-device run."
            )
        }

        let app = acceptanceApp()
        app.launch()
        let initialCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        _ = assertLiveScoringRead(in: app, exerciseEphemeralDraft: true)

        app.terminate()
        app.launch()
        let restoredCanonicalParticipant = assertAuthenticated(in: app, timeout: 45)
        XCTAssertTrue(
            restoredCanonicalParticipant == initialCanonicalParticipant,
            "The physical relaunch did not restore the same canonical participant context."
        )
        _ = assertLiveScoringRead(in: app, exerciseEphemeralDraft: false)
        XCTAssertFalse(app.descendants(matching: .any)["score.draftNotice"].exists)
        print("STEP2E_PHYSICAL_SCORING_READ_COMPLETE")
    }

    private func approvedPreviewEmail() -> String? {
        let suppliedValue = ProcessInfo.processInfo.environment["BAGGER_STEP2A_QA_EMAIL"] ??
            (Bundle(for: Self.self).object(forInfoDictionaryKey: "BAGGER_STEP2A_QA_EMAIL") as? String)
        guard let value = suppliedValue?.trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty,
            value.contains("@")
        else {
            return nil
        }
        return value
    }

    @discardableResult
    private func assertLiveScoringRead(
        in app: XCUIApplication,
        exerciseEphemeralDraft: Bool
    ) -> Bool {
        let scoreTab = app.tabBars.buttons["Score"]
        XCTAssertTrue(scoreTab.waitForExistence(timeout: 8), "The native Score tab was unavailable.")
        scoreTab.tap()
        XCTAssertTrue(scoreTab.isSelected, "The native Score tab was not selected.")

        let screen = app.descendants(matching: .any)["score.screen"]
        XCTAssertTrue(screen.waitForExistence(timeout: 10), "The native Score screen did not appear.")
        XCTAssertTrue(
            app.descendants(matching: .any)["score.matchContext"].waitForExistence(timeout: 45),
            "The approved Preview participant did not resolve an owned canonical scoring context."
        )
        let scrollView = app.scrollViews["score.screen"].exists
            ? app.scrollViews["score.screen"]
            : app.scrollViews.firstMatch
        let holeNavigator = app.descendants(matching: .any)["score.holeNavigator"]
        for _ in 0..<8 where !holeNavigator.exists {
            scrollView.swipeUp()
        }
        XCTAssertTrue(
            holeNavigator.waitForExistence(timeout: 8),
            "The canonical hole navigator was missing."
        )

        let saveAndNext = app.descendants(matching: .any)["score.saveNext"]
        for _ in 0..<14 where !saveAndNext.exists {
            scrollView.swipeUp()
        }
        if saveAndNext.exists {
            XCTAssertFalse(saveAndNext.isEnabled, "Save & Next enabled an official mutation in Step 2E.")
        }

        var createdDraft = false
        if exerciseEphemeralDraft {
            let increment = app.buttons
                .matching(NSPredicate(format: "label BEGINSWITH[c] 'Increase ' AND label ENDSWITH[c] ' gross score'"))
                .firstMatch
            for _ in 0..<14 where !increment.exists || !increment.isHittable {
                scrollView.swipeDown()
            }
            if increment.exists, increment.isEnabled, increment.isHittable {
                increment.tap()
                XCTAssertTrue(
                    app.descendants(matching: .any)["score.draftNotice"].waitForExistence(timeout: 5),
                    "The local score interaction did not expose its Not saved state."
                )
                createdDraft = true
            }
        }

        let scorecard = app.descendants(matching: .any)["score.scorecard.quick"]
        for _ in 0..<16 where !scorecard.exists || !scorecard.isHittable {
            scrollView.swipeUp()
        }
        XCTAssertTrue(scorecard.isHittable, "The official native Scorecard was not reachable.")
        scorecard.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["scorecard.screen"].waitForExistence(timeout: 8),
            "The official native Scorecard did not open."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["scorecard.hole.1"].waitForExistence(timeout: 8),
            "The official Scorecard did not expose canonical hole rows."
        )
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(screen.waitForExistence(timeout: 5), "Back did not return to Score.")
        return createdDraft
    }

    private func acceptanceApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments.append(acceptanceProbeArgument)
        return app
    }

    private func signedOutFixtureApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "--bagger-ui-testing",
            "--bagger-ui-test-scenario",
            "auth.signed-out",
        ]
        return app
    }

    private func assertSignedOutBootstrap(in app: XCUIApplication) {
        // PreviewBadge intentionally exposes "Preview environment" as its
        // accessibility label while rendering PREVIEW visually. Query the full
        // hierarchy so this remains stable if SwiftUI changes the element role.
        let previewIndicator = app.descendants(matching: .any)
            .matching(NSPredicate(
                format: "label ==[c] 'Preview environment' OR label ==[c] 'PREVIEW' OR value ==[c] 'PREVIEW'"
            ))
            .firstMatch
        XCTAssertTrue(previewIndicator.waitForExistence(timeout: 30), "PREVIEW was not visible.")

        let signInHeading = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label ==[c] 'Sign in to Bagger'"))
            .firstMatch
        XCTAssertTrue(
            signInHeading.waitForExistence(timeout: 30),
            "The native signed-out screen did not appear."
        )

        XCTAssertTrue(
            app.textFields["Approved participant email"].waitForExistence(timeout: 5),
            "The signed-out participant email field did not appear."
        )
    }

    private func completeTurnstileAndWaitForOTPEntry(in app: XCUIApplication) -> XCUIElement {
        let otpField = app.textFields["One-time sign-in code"]
        if otpField.waitForExistence(timeout: 12) {
            return otpField
        }

        XCTAssertTrue(
            app.staticTexts["Request verification"].exists,
            "The native Turnstile screen did not appear."
        )

        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 10), "The tightly scoped Turnstile web view did not appear.")

        let challengeControl = webView.descendants(matching: .any)
            .matching(NSPredicate(
                format: "label CONTAINS[c] 'verify' OR label CONTAINS[c] 'human' OR label CONTAINS[c] 'checkbox'"
            ))
            .firstMatch

        let challengeControlLoaded = challengeControl.waitForExistence(timeout: 15)
        if otpField.exists {
            return otpField
        }

        if challengeControlLoaded && challengeControl.isHittable {
            challengeControl.tap()
        } else {
            // The managed Turnstile widget exposes different accessibility trees
            // across WebKit releases. The checkbox sits on the leading side of
            // the centered widget in this dedicated, non-scrolling challenge view.
            webView.coordinate(withNormalizedOffset: CGVector(dx: 0.28, dy: 0.5)).tap()
        }

        XCTAssertTrue(
            otpField.waitForExistence(timeout: 60),
            "Turnstile did not transition to the native OTP entry screen."
        )
        return otpField
    }

    private func waitForOTPPasteboardValue(timeout: TimeInterval) throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let candidate = UIPasteboard.general.string?
                .trimmingCharacters(in: .whitespacesAndNewlines),
                candidate != otpPasteboardSentinel,
                candidate.count == 6,
                candidate.allSatisfy(\.isNumber)
            {
                return
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }

        XCTFail("No six-digit OTP was supplied through the Simulator pasteboard before timeout.")
        throw LivePreviewQAError.otpTimedOut
    }

    private func waitForCacheAuditRelease(timeout: TimeInterval) throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if UIPasteboard.general.string == cacheAuditReleaseSentinel { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        XCTFail("The cache inspection release signal was not supplied before timeout.")
        throw LivePreviewQAError.cacheAuditTimedOut
    }

    private func assertTodayProducts(
        in app: XCUIApplication,
        expectedSource: String?,
        timeout: TimeInterval
    ) {
        let screen = app.descendants(matching: .any)["today.screen"]
        XCTAssertTrue(screen.waitForExistence(timeout: timeout), "The authenticated Today screen was missing.")

        for identifier in [
            "today.tournamentContext",
            "today.yourMatches",
            "today.tournamentScore",
            "today.schedule",
        ] {
            let element = app.descendants(matching: .any)
                .matching(identifier: identifier)
                .firstMatch
            let deadline = Date().addingTimeInterval(timeout)
            var reachedEligibleContent = false
            while Date() < deadline {
                let status = element.value as? String ?? ""
                let hasEligibleContent = status.localizedCaseInsensitiveContains("content") &&
                    status.localizedCaseInsensitiveContains("freshness fresh") &&
                    status.localizedCaseInsensitiveContains("revision present")
                let hasExpectedSource = expectedSource.map {
                    status.localizedCaseInsensitiveContains("source \($0)")
                } ?? true
                if element.exists, hasEligibleContent, hasExpectedSource {
                    reachedEligibleContent = true
                    break
                }
                screen.swipeUp()
                RunLoop.current.run(until: Date().addingTimeInterval(0.25))
            }
            XCTAssertTrue(
                reachedEligibleContent,
                "The participant-safe product \(identifier) did not reach fresh, revision-backed content."
            )
        }
    }

    private func assertFiveTabShell(in app: XCUIApplication) {
        let today = app.tabBars.buttons["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 5), "The live Today tab was missing.")

        let matches = app.tabBars.buttons["Matches"]
        XCTAssertTrue(matches.waitForExistence(timeout: 5), "The live Matches tab was missing.")
        matches.tap()
        XCTAssertTrue(matches.isSelected, "The live Matches tab did not become selected.")
        XCTAssertTrue(
            app.descendants(matching: .any)["matches.screen"].waitForExistence(timeout: 5),
            "The real native Matches destination was missing."
        )

        let score = app.tabBars.buttons["Score"]
        XCTAssertTrue(score.waitForExistence(timeout: 5), "The live Score tab was missing.")
        score.tap()
        XCTAssertTrue(score.isSelected, "The live Score tab did not become selected.")
        XCTAssertTrue(
            app.descendants(matching: .any)["score.screen"].waitForExistence(timeout: 10),
            "The real native Score destination was missing."
        )

        for tab in [
            (name: "Leaders", placeholder: "placeholder.leaders"),
            (name: "More", placeholder: "placeholder.more"),
        ] {
            let button = app.tabBars.buttons[tab.name]
            XCTAssertTrue(button.waitForExistence(timeout: 5), "The live \(tab.name) tab was missing.")
            button.tap()
            XCTAssertTrue(button.isSelected, "The live \(tab.name) tab did not become selected.")
            XCTAssertTrue(
                app.descendants(matching: .any)[tab.placeholder].waitForExistence(timeout: 5),
                "The restrained \(tab.name) placeholder was missing."
            )
        }

        today.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["today.screen"].waitForExistence(timeout: 5),
            "Today did not remain the live shell's real product destination."
        )
    }

    private func pullToRefreshToday(in app: XCUIApplication) {
        let screen = app.descendants(matching: .any)["today.screen"]
        XCTAssertTrue(screen.exists, "The Today screen was unavailable for refresh.")
        screen.swipeDown()
    }

    private func openMatches(in app: XCUIApplication) {
        let matches = app.tabBars.buttons["Matches"]
        XCTAssertTrue(matches.waitForExistence(timeout: 5), "The native Matches tab was unavailable.")
        matches.tap()
        XCTAssertTrue(matches.isSelected, "The native Matches tab was not selected.")
        XCTAssertTrue(
            app.descendants(matching: .any)["matches.screen"].waitForExistence(timeout: 5),
            "The native Matches destination did not appear."
        )
    }

    private func assertMatchesProduct(in app: XCUIApplication, timeout: TimeInterval) {
        let screen = app.descendants(matching: .any)["matches.screen"]
        XCTAssertTrue(screen.waitForExistence(timeout: timeout), "The native Matches screen was missing.")

        let deadline = Date().addingTimeInterval(timeout)
        var reachedEligibleContent = false
        while Date() < deadline {
            let status = screen.value as? String ?? ""
            if status.localizedCaseInsensitiveContains("content"),
               status.localizedCaseInsensitiveContains("freshness fresh"),
               status.localizedCaseInsensitiveContains("revision present")
            {
                reachedEligibleContent = true
                break
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        XCTAssertTrue(
            reachedEligibleContent,
            "The live Matches product did not reach fresh, revision-backed content."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["matches.roundSelector"].waitForExistence(timeout: 5),
            "The live Round selector was missing."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["matches.hero"].waitForExistence(timeout: 5),
            "The authenticated golfer's canonical Your Match hero was missing."
        )
        _ = reachableMatchesElement("matches.allMatches", in: app)
    }

    private func exerciseRoundSelectionAndMatchDetail(in app: XCUIApplication) -> String {
        let screen = app.scrollViews["matches.screen"].exists
            ? app.scrollViews["matches.screen"]
            : app.scrollViews.firstMatch
        for _ in 0..<6 {
            screen.swipeDown()
        }

        let roundButtons = app.buttons
            .matching(NSPredicate(format: "identifier BEGINSWITH 'matches.round.'"))
            .allElementsBoundByIndex
        XCTAssertGreaterThan(roundButtons.count, 1, "Live Preview did not expose multiple selectable Rounds.")
        guard let selectedRound = roundButtons.first(where: { !$0.isSelected }) else {
            XCTFail("No alternate live Round was available for selection.")
            return ""
        }
        let roundSelector = app.descendants(matching: .any)["matches.roundSelector"]
        for _ in 0..<4 where !selectedRound.isHittable {
            roundSelector.swipeLeft()
        }
        XCTAssertTrue(selectedRound.isHittable, "The alternate live Round was not tappable.")
        selectedRound.tap()
        XCTAssertTrue(selectedRound.isSelected, "The selected live Round did not update.")
        let selectedRoundIdentifier = selectedRound.identifier

        let card = app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH 'matches.card.'"))
            .firstMatch
        for _ in 0..<8 where !card.isHittable {
            screen.swipeUp()
        }
        XCTAssertTrue(card.isHittable, "No live participant-visible Match card was tappable.")
        card.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["matches.detail"].waitForExistence(timeout: 5),
            "Native Match Detail did not open."
        )

        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5), "Match Detail had no Back control.")
        back.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["matches.screen"].waitForExistence(timeout: 5),
            "Back did not return to the Matches screen."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)[selectedRoundIdentifier].isSelected,
            "Back from Match Detail did not retain the selected Round."
        )
        return selectedRoundIdentifier
    }

    private func pullToRefreshMatches(in app: XCUIApplication, timeout: TimeInterval) {
        let screen = app.scrollViews["matches.screen"].exists
            ? app.scrollViews["matches.screen"]
            : app.scrollViews.firstMatch
        XCTAssertTrue(screen.exists, "The Matches screen was unavailable for refresh.")
        for _ in 0..<8 {
            screen.swipeDown()
        }

        let priorStatus = screen.value as? String ?? ""
        let start = screen.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22))
        let end = screen.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.82))
        start.press(forDuration: 0.1, thenDragTo: end)

        let deadline = Date().addingTimeInterval(timeout)
        var observedRefreshTransition = false
        while Date() < deadline {
            let status = screen.value as? String ?? ""
            if status != priorStatus {
                observedRefreshTransition = true
                break
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertTrue(observedRefreshTransition, "The physical pull gesture did not initiate a Matches refresh.")
    }

    @discardableResult
    private func reachableMatchesElement(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        let element = app.descendants(matching: .any)[identifier]
        if element.waitForExistence(timeout: 1) { return element }
        let screen = app.scrollViews["matches.screen"].exists
            ? app.scrollViews["matches.screen"]
            : app.scrollViews.firstMatch
        for _ in 0..<8 where !element.exists {
            screen.swipeUp()
        }
        XCTAssertTrue(element.exists, "The live Matches element \(identifier) was not reachable.")
        return element
    }

    /// Pastes without passing the sensitive value to an XCTest typing command,
    /// which keeps both the email and OTP out of the XCTest activity transcript.
    private func pasteCurrentPasteboard(into field: XCUIElement, in app: XCUIApplication) throws {
        field.tap()
        field.press(forDuration: 1)

        let menuItem = app.menuItems["Paste"]
        if menuItem.waitForExistence(timeout: 3) {
            menuItem.tap()
            return
        }

        let button = app.buttons["Paste"]
        if button.waitForExistence(timeout: 2) {
            button.tap()
            return
        }

        XCTFail("The Simulator paste action was not available.")
        throw LivePreviewQAError.pasteUnavailable
    }

    private func assertAuthenticated(in app: XCUIApplication, timeout: TimeInterval) -> String {
        XCTAssertTrue(
            app.descendants(matching: .any)["app.shell"].waitForExistence(timeout: timeout),
            "The native authenticated app shell did not appear."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["today.screen"].waitForExistence(timeout: 5),
            "The authenticated Today destination did not appear."
        )
        XCTAssertFalse(app.textFields["Approved participant email"].exists)

        let account = app.buttons["account.menu"]
        XCTAssertTrue(account.waitForExistence(timeout: 5), "The canonical participant account control was missing.")
        let canonicalParticipant = account.value as? String ?? ""
        XCTAssertTrue(
            canonicalParticipant.contains("Canonical player ") &&
                canonicalParticipant.contains("; tournament "),
            "Canonical participant context was not exposed to the acceptance harness."
        )
        return canonicalParticipant
    }

    private func signOut(in app: XCUIApplication) {
        let account = app.buttons["account.menu"]
        XCTAssertTrue(account.waitForExistence(timeout: 5), "The native account menu was unavailable.")
        account.tap()
        let signOut = app.buttons["Sign Out"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 5), "The native Sign Out action was unavailable.")
        signOut.tap()
    }
}

private enum LivePreviewQAError: Error {
    case otpTimedOut
    case pasteUnavailable
    case cacheAuditTimedOut
}
