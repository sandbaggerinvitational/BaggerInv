import XCTest

@MainActor
final class BaggerInvAssetUITests: XCTestCase {
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
        XCTAssertTrue(element("asset.fallback.course", in: app).exists)
        XCTAssertTrue(element("asset.fallback.tournament", in: app).exists)
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

    private func reveal(_ identifier: String, in app: XCUIApplication) {
        let target = element(identifier, in: app)
        for _ in 0..<24 where !target.exists || !target.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(target.exists, identifier)
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }
}
