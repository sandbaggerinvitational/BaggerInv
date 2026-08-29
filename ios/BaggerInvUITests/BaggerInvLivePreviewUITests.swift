import UIKit
import XCTest

@MainActor
final class BaggerInvLivePreviewUITests: XCTestCase {
    private let otpPasteboardSentinel = "BAGGER_STEP2A_WAITING_FOR_OTP"

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

        let app = XCUIApplication()
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

        let initialParticipantDiagnostic = assertAuthenticated(in: app, timeout: 45)
        print("STEP2A_AUTHENTICATED")

        app.terminate()
        app.launch()

        let restoredParticipantDiagnostic = assertAuthenticated(in: app, timeout: 45)
        if restoredParticipantDiagnostic != initialParticipantDiagnostic {
            XCTFail("The restored canonical participant diagnostic did not match the initial session.")
        }
        print("STEP2A_SESSION_RESTORED")

        let signOut = app.buttons["Sign Out"]
        XCTAssertTrue(signOut.isHittable, "The native Sign Out button was not available.")
        signOut.tap()
        assertSignedOutBootstrap(in: app)

        app.terminate()
        app.launch()
        assertSignedOutBootstrap(in: app)
        print("STEP2A_SIGNED_OUT")
    }

    /// Exercises the temporary signed-out layout on a second Simulator without
    /// requesting an OTP or entering an approved participant identifier.
    func testSignedOutLayoutAndKeyboard() {
        let app = XCUIApplication()
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

        if challengeControl.exists && challengeControl.isHittable {
            challengeControl.tap()
        } else {
            // The managed Turnstile widget exposes different accessibility trees
            // across WebKit releases. Its only interactive surface is centered in
            // this dedicated, non-scrolling challenge view.
            webView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
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
            app.staticTexts["Signed In"].waitForExistence(timeout: timeout),
            "The native authenticated diagnostic did not appear."
        )

        let apiStatus = app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS[c] 'API' AND label CONTAINS[c] 'Connected'"))
            .firstMatch
        XCTAssertTrue(apiStatus.exists, "The API Connected diagnostic was missing.")

        let identityStatus = app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS[c] 'Identity' AND label CONTAINS[c] 'Certified'"))
            .firstMatch
        XCTAssertTrue(identityStatus.exists, "The Identity Certified diagnostic was missing.")

        let participantDiagnostic = app.staticTexts
            .matching(NSPredicate(format: "label BEGINSWITH[c] 'PLAYER ID'"))
            .firstMatch
        XCTAssertTrue(participantDiagnostic.exists, "The canonical Player diagnostic was missing.")

        let label = participantDiagnostic.label.trimmingCharacters(in: .whitespacesAndNewlines)
        if label.caseInsensitiveCompare("PLAYER ID") == .orderedSame || label.isEmpty {
            XCTFail("The canonical Player diagnostic was empty.")
        }
        return label
    }
}

private enum LivePreviewQAError: Error {
    case otpTimedOut
    case pasteUnavailable
}
