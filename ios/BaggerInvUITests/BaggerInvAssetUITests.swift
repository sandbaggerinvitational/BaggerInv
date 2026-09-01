import XCTest

@MainActor
final class BaggerInvAssetUITests: XCTestCase {
    func testDesignSystemGalleryRendersSemanticPrimitives() {
        continueAfterFailure = false
        let app = launchGallery()

        XCTAssertTrue(element("design.gallery", in: app).waitForExistence(timeout: 5))
        reveal("design.gallery.colors", in: app)
        reveal("design.gallery.typography", in: app)
        revealInteractive("Primary Action", in: app)
        XCTAssertTrue(app.buttons["Primary Action"].isEnabled)
        revealInteractive("Secondary Action", in: app)
        XCTAssertTrue(app.buttons["Secondary Action"].isEnabled)
        revealButton("Disabled Action", in: app)
        XCTAssertFalse(app.buttons["Disabled Action"].isEnabled)
        revealInteractive("Selected", in: app)
        XCTAssertTrue(app.buttons["Selected"].isSelected)
        reveal("design.status.live", in: app)
        reveal("design.status.official", in: app)
        reveal("design.status.offline", in: app)
        reveal("design.status.needsReview", in: app)
        reveal("design.gallery.rows", in: app)
        reveal("design.gallery.states", in: app)
        revealInteractive("View Schedule", in: app)
        reveal("design.gallery.identity", in: app)
    }

    func testDesignSystemGalleryRemainsReachableAtAccessibilityXXXL() throws {
        continueAfterFailure = false
        let app = launchGallery(accessibilityXXXL: true)

        XCTAssertTrue(element("design.gallery", in: app).waitForExistence(timeout: 5))
        revealInteractive("Primary Action", in: app, attempts: 50)
        revealInteractive("Selected", in: app, attempts: 50)
        reveal("design.gallery.states", in: app, attempts: 70)
        reveal("design.gallery.identity", in: app, attempts: 70)

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [.textClipped])
        }
    }

    func testAssetGalleryRendersRepresentativeIdentityAssetsAndFallbacks() {
        continueAfterFailure = false
        let app = launchGallery()

        XCTAssertTrue(element("asset.gallery", in: app).waitForExistence(timeout: 5))
        reveal("asset.brand.brand_bagger_primary", in: app)
        reveal("asset.tournament.tournament_2026_logo", in: app)
        reveal("asset.team.team_pickles", in: app)
        reveal("asset.player.player_cb01", in: app)
        reveal("asset.course.course_ocgc01_logo", in: app)
        reveal("asset.fallback.player", in: app)
        reveal("asset.fallback.team", in: app)
        reveal("asset.fallback.course", in: app)
        reveal("asset.fallback.tournament", in: app)
    }

    func testAssetGalleryFallbacksRemainUsableAtAccessibilityXXXL() {
        continueAfterFailure = false
        let app = launchGallery(accessibilityXXXL: true)

        XCTAssertTrue(element("asset.gallery", in: app).waitForExistence(timeout: 5))
        reveal("asset.fallback.player", in: app)
        XCTAssertTrue(element("asset.fallback.player", in: app).isHittable)
        reveal("asset.fallback.course", in: app)
        reveal("asset.fallback.tournament", in: app)
    }

    private func launchGallery(accessibilityXXXL: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--bagger-asset-gallery"]
        if accessibilityXXXL {
            app.launchArguments += [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
            ]
        }
        app.launch()
        return app
    }

    private func reveal(_ identifier: String, in app: XCUIApplication, attempts: Int = 40) {
        let target = element(identifier, in: app)
        for _ in 0..<attempts where !target.exists {
            app.swipeUp()
        }
        XCTAssertTrue(target.exists, identifier)
    }

    private func revealInteractive(_ label: String, in app: XCUIApplication, attempts: Int = 40) {
        let target = app.buttons[label]
        for _ in 0..<attempts where !target.exists || !target.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(target.exists, label)
        XCTAssertTrue(target.isHittable, label)
    }

    private func revealButton(_ label: String, in app: XCUIApplication, attempts: Int = 40) {
        let target = app.buttons[label]
        for _ in 0..<attempts where !target.exists {
            app.swipeUp()
        }
        XCTAssertTrue(target.exists, label)
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }
}
