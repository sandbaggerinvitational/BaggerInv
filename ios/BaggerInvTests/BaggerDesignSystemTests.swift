import SwiftUI
import UIKit
import XCTest
@testable import BaggerInv

@MainActor
final class BaggerDesignSystemTests: XCTestCase {
    func testCompatibilityPaletteResolvesThroughSemanticFoundation() {
        assertSameColor(BaggerPalette.canvas, BaggerDesign.Color.backgroundPrimary)
        assertSameColor(BaggerPalette.paper, BaggerDesign.Color.surfacePrimary)
        assertSameColor(BaggerPalette.ink, BaggerDesign.Color.textPrimary)
        assertSameColor(BaggerPalette.actionGreen, BaggerDesign.Color.brandAction)
        assertSameColor(BaggerPalette.goldText, BaggerDesign.Color.brandGoldText)
        assertSameColor(
            BaggerPalette.gold,
            SwiftUI.Color(red: 181 / 255, green: 138 / 255, blue: 37 / 255)
        )
        XCTAssertEqual(BaggerLayout.pageInset, 14)
        XCTAssertEqual(BaggerLayout.sectionSpacing, 14)
    }

    func testCoreTextCombinationsMeetOrdinaryTextContrast() {
        assertContrast(
            foreground: BaggerDesign.Color.textPrimary,
            background: BaggerDesign.Color.surfacePrimary,
            minimum: 4.5
        )
        assertContrast(
            foreground: BaggerDesign.Color.textSecondary,
            background: BaggerDesign.Color.surfacePrimary,
            minimum: 4.5
        )
        assertContrast(
            foreground: BaggerDesign.Color.brandGoldText,
            background: BaggerDesign.Color.surfacePrimary,
            minimum: 4.5
        )
        assertContrast(
            foreground: BaggerDesign.Color.textInverse,
            background: BaggerDesign.Color.brandAction,
            minimum: 4.5
        )
    }

    func testSpacingRadiusAndShadowScalesAreOrderedAndBounded() {
        let spacing = [
            BaggerDesign.Space.hairline,
            BaggerDesign.Space.xSmall,
            BaggerDesign.Space.small,
            BaggerDesign.Space.medium,
            BaggerDesign.Space.large,
            BaggerDesign.Space.xLarge,
            BaggerDesign.Space.xxLarge,
            BaggerDesign.Space.xxxLarge,
            BaggerDesign.Space.hero,
        ]
        XCTAssertEqual(spacing, spacing.sorted())
        XCTAssertEqual(Set(spacing).count, spacing.count)
        XCTAssertTrue(spacing.allSatisfy { $0 > 0 })

        let radii = [
            BaggerDesign.Radius.small,
            BaggerDesign.Radius.control,
            BaggerDesign.Radius.card,
            BaggerDesign.Radius.hero,
            BaggerDesign.Radius.pill,
        ]
        XCTAssertEqual(radii, radii.sorted())
        XCTAssertGreaterThan(BaggerDesign.Shadow.subtle.radius, BaggerDesign.Shadow.none.radius)
        XCTAssertGreaterThan(BaggerDesign.Shadow.raised.radius, BaggerDesign.Shadow.subtle.radius)
        XCTAssertGreaterThan(BaggerDesign.Shadow.raised.opacity, BaggerDesign.Shadow.subtle.opacity)
    }

    func testControlAndIdentitySizesPreserveAccessibilityAndScoringErgonomics() {
        XCTAssertGreaterThanOrEqual(BaggerDesign.Size.minimumTouchTarget, 44)
        XCTAssertGreaterThan(BaggerDesign.Size.scoreTouchTarget, BaggerDesign.Size.minimumTouchTarget)

        let avatarSizes = BaggerIdentitySize.allCases.map(\.dimension)
        let logoSizes = BaggerLogoSize.allCases.map(\.dimension)
        XCTAssertEqual(avatarSizes, avatarSizes.sorted())
        XCTAssertEqual(logoSizes, logoSizes.sorted())
        XCTAssertEqual(Set(avatarSizes).count, avatarSizes.count)
        XCTAssertEqual(Set(logoSizes).count, logoSizes.count)
    }

    func testEveryStatusHasParticipantCopyAndNonColorSignal() {
        XCTAssertEqual(Set(BaggerStatusKind.allCases.map(\.rawValue)).count, BaggerStatusKind.allCases.count)
        for status in BaggerStatusKind.allCases {
            XCTAssertFalse(status.defaultTitle.isEmpty, status.rawValue)
            XCTAssertFalse(status.systemImage.isEmpty, status.rawValue)
        }

        XCTAssertNotEqual(BaggerStatusKind.official.defaultTitle, BaggerStatusKind.savedOnIPhone.defaultTitle)
        XCTAssertNotEqual(BaggerStatusKind.published.defaultTitle, BaggerStatusKind.final.defaultTitle)
        XCTAssertNotEqual(BaggerStatusKind.offline.systemImage, BaggerStatusKind.needsReview.systemImage)
    }

    func testInitialsAreDeterministicUnicodeSafeAndPresentationOnly() {
        XCTAssertEqual(BaggerInitials.make(from: "Clay Beltran"), "CB")
        XCTAssertEqual(BaggerInitials.make(from: "  Alexandra   Example  "), "AE")
        XCTAssertEqual(BaggerInitials.make(from: "Élodie Ångström"), "ÉÅ")
        XCTAssertEqual(BaggerInitials.make(from: "李小龙"), "李小")
        XCTAssertEqual(BaggerInitials.make(from: ""), "?")

        XCTAssertNil(BaggerAsset.player(playerID: "Clay Beltran").reference)
        XCTAssertEqual(BaggerAsset.player(playerID: "Clay Beltran").fallback, .initials)
    }

    func testIdentityAccessibilityRequiresAnExplicitCallerDecision() {
        XCTAssertEqual(BaggerImageAccessibility.decorative, .decorative)
        XCTAssertEqual(
            BaggerImageAccessibility.identity(label: "Player portrait"),
            .identity(label: "Player portrait")
        )
        XCTAssertNotEqual(
            BaggerImageAccessibility.decorative,
            .identity(label: "Player portrait")
        )
    }

#if DEBUG
    func testDesignGalleryRequiresExplicitDebugLaunchArgument() {
        XCTAssertFalse(BaggerAssetGalleryLaunch.isEnabled(arguments: []))
        XCTAssertFalse(BaggerAssetGalleryLaunch.isEnabled(arguments: ["--bagger-ui-testing"]))
        XCTAssertTrue(
            BaggerAssetGalleryLaunch.isEnabled(arguments: [BaggerAssetGalleryLaunch.argument])
        )
    }
#endif

    private func assertContrast(
        foreground: SwiftUI.Color,
        background: SwiftUI.Color,
        minimum: Double,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let foregroundLuminance = relativeLuminance(foreground)
        let backgroundLuminance = relativeLuminance(background)
        let lighter = max(foregroundLuminance, backgroundLuminance)
        let darker = min(foregroundLuminance, backgroundLuminance)
        let ratio = (lighter + 0.05) / (darker + 0.05)
        XCTAssertGreaterThanOrEqual(ratio, minimum, "Contrast ratio was \(ratio)", file: file, line: line)
    }

    private func assertSameColor(
        _ first: SwiftUI.Color,
        _ second: SwiftUI.Color,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let left = rgba(first)
        let right = rgba(second)
        XCTAssertEqual(left.red, right.red, accuracy: 0.0001, file: file, line: line)
        XCTAssertEqual(left.green, right.green, accuracy: 0.0001, file: file, line: line)
        XCTAssertEqual(left.blue, right.blue, accuracy: 0.0001, file: file, line: line)
        XCTAssertEqual(left.alpha, right.alpha, accuracy: 0.0001, file: file, line: line)
    }

    private func relativeLuminance(_ color: SwiftUI.Color) -> Double {
        let components = rgba(color)
        return 0.2126 * linearized(components.red)
            + 0.7152 * linearized(components.green)
            + 0.0722 * linearized(components.blue)
    }

    private func linearized(_ component: Double) -> Double {
        component <= 0.04045
            ? component / 12.92
            : pow((component + 0.055) / 1.055, 2.4)
    }

    private func rgba(_ color: SwiftUI.Color) -> (red: Double, green: Double, blue: Double, alpha: Double) {
        let resolved = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        XCTAssertTrue(resolved.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
        return (Double(red), Double(green), Double(blue), Double(alpha))
    }
}
