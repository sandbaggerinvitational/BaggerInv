import UIKit
import XCTest
@testable import BaggerInv

final class BaggerAssetTests: XCTestCase {
    func testKnownPlayerIDAndExactCanonicalKeyResolvePortrait() {
        XCTAssertEqual(
            BaggerAsset.player(playerID: "CB01", assetKey: "clay-beltran-pic").reference,
            BaggerAssetReference(catalogName: "player_cb01", semantic: .identity)
        )
        XCTAssertEqual(
            BaggerAsset.player(playerID: " co01 ", assetKey: "connor-o'reilly-pic").reference?.catalogName,
            "player_co01"
        )
    }

    func testPlayerResolutionFailsClosedWithoutDisplayNameGuessing() {
        XCTAssertNil(BaggerAsset.player(playerID: "Clay Beltran").reference)
        XCTAssertNil(BaggerAsset.player(playerID: "UNKNOWN").reference)
        XCTAssertEqual(BaggerAsset.player(playerID: "UNKNOWN").fallback, .initials)
        XCTAssertNil(BaggerAsset.player(playerID: "CB01", assetKey: "another-player-pic").reference)
    }

    func testKnownAndUnknownTeamMappings() {
        XCTAssertEqual(BaggerAsset.team(teamID: "PICKLES").reference?.catalogName, "team_pickles")
        XCTAssertEqual(
            BaggerAsset.team(teamID: "LIPPIT", assetKey: "lippit-logo").reference?.catalogName,
            "team_lippit"
        )
        XCTAssertNil(BaggerAsset.team(teamID: "PINES").reference)
        XCTAssertEqual(BaggerAsset.team(teamID: "PINES").fallback, .initials)
    }

    func testCourseMappingUsesReviewedAliasesOnly() {
        XCTAssertEqual(
            BaggerAsset.courseLogo(courseID: "OCGC01", assetKey: "ocean-course-logo").reference?.catalogName,
            "course_ocgc01_logo"
        )
        XCTAssertEqual(BaggerAsset.courseLogo(courseID: "ARGC01").reference?.catalogName, "course_argc01_logo")
        XCTAssertEqual(BaggerAsset.courseLogo(courseID: "SRGC01").reference?.catalogName, "course_argc01_logo")
        XCTAssertEqual(BaggerAsset.courseLogo(courseID: "SRGC02").reference?.catalogName, "course_argc01_logo")
        XCTAssertEqual(BaggerAsset.courseLogo(courseID: "PDC02").reference?.catalogName, "course_pdc01_logo")
        XCTAssertEqual(BaggerAsset.courseLogo(courseID: "UNKNOWN").fallback, .systemSymbol("flag.fill"))
    }

    func testTournamentMappingUsesCanonicalYearAndExactKey() {
        XCTAssertEqual(
            BaggerAsset.tournamentLogo(year: 2026, assetKey: "sandbagger-2026").reference?.catalogName,
            "tournament_2026_logo"
        )
        XCTAssertNil(BaggerAsset.tournamentLogo(year: 2027).reference)
        XCTAssertEqual(BaggerAsset.tournamentLogo(year: 2027).fallback, .primaryBrand)
    }

    func testWireKeyMismatchAndUnsafeValuesNeverResolve() {
        let invalidKeys = [
            "../clay-beltran-pic",
            "/images/players/clay-beltran-pic",
            "https://example.com/clay-beltran-pic",
            "clay-beltran-pic.webp",
        ]

        for key in invalidKeys {
            XCTAssertNil(BaggerAsset.player(playerID: "CB01", assetKey: key).reference, key)
        }
    }

    func testManifestCoverageCountsAreStable() {
        XCTAssertEqual(BaggerAssetManifest.playerEntries.count, 27)
        XCTAssertEqual(BaggerAssetManifest.teamEntries.count, 17)
        XCTAssertEqual(BaggerAssetManifest.courseEntries.count, 30)
        XCTAssertEqual(Set(BaggerAssetManifest.courseEntries.map(\.catalogName)).count, 25)
        XCTAssertEqual(BaggerAssetManifest.tournamentEntries.count, 10)
        XCTAssertEqual(Set(BaggerAssetManifest.allEntries.map(\.canonicalID)).count, 85)
    }

    func testCanonicalIDsAreUniqueWithinEachFamily() {
        for entries in [
            BaggerAssetManifest.playerEntries,
            BaggerAssetManifest.teamEntries,
            BaggerAssetManifest.courseEntries,
            BaggerAssetManifest.tournamentEntries,
        ] {
            XCTAssertEqual(entries.count, Set(entries.map(\.canonicalID)).count)
        }
    }

    func testOnlyDocumentedCourseAliasesShareCatalogResources() {
        let shared = Dictionary(grouping: BaggerAssetManifest.allEntries, by: \.catalogName)
            .filter { $0.value.count > 1 }

        XCTAssertEqual(Set(shared.keys), BaggerAssetManifest.intentionalSharedCatalogNames)
        XCTAssertEqual(Set(shared["course_argc01_logo", default: []].map(\.canonicalID)), ["ARGC01", "SRGC01", "SRGC02"])
        XCTAssertEqual(Set(shared["course_rsf01_logo", default: []].map(\.canonicalID)), ["RSF01", "RSN01"])
        XCTAssertEqual(Set(shared["course_gtw01_logo", default: []].map(\.canonicalID)), ["GTW01", "GTB01"])
        XCTAssertEqual(Set(shared["course_pdc01_logo", default: []].map(\.canonicalID)), ["PDC01", "PDC02"])
    }

    func testEveryManifestCatalogResourceLoadsFromApplicationBundle() {
        for catalogName in Set(BaggerAssetManifest.allEntries.map(\.catalogName)).sorted() {
            XCTAssertNotNil(
                UIImage(named: catalogName, in: Bundle.main, compatibleWith: nil),
                "Missing compiled catalog asset \(catalogName)"
            )
        }
    }

    func testSelectedAssetsAreIdentityImagesAndBrandIsAvailable() {
        XCTAssertEqual(BaggerAsset.primaryBrand.catalogName, "brand_bagger_primary")
        XCTAssertEqual(BaggerAsset.primaryBrand.semantic, .identity)
        XCTAssertEqual(BaggerAsset.player(playerID: "AM01").reference?.semantic, .identity)
        XCTAssertEqual(BaggerAsset.team(teamID: "PICKLES").reference?.semantic, .identity)
    }
}
