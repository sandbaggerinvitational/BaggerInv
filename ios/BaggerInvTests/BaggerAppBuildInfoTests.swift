import XCTest
@testable import BaggerInv

final class BaggerAppBuildInfoTests: XCTestCase {
    func testBuildInfoUsesConfiguredVersionAndBuild() {
        let info = BaggerAppBuildInfo.current(values: [
            "CFBundleShortVersionString": "1.2.3",
            "CFBundleVersion": "456",
        ])

        XCTAssertEqual(info.version, "1.2.3")
        XCTAssertEqual(info.build, "456")
        XCTAssertEqual(info.versionAndBuildText, "Version 1.2.3 (456)")
    }

    func testBuildInfoFailsClosedForMissingOrBlankValues() {
        XCTAssertEqual(BaggerAppBuildInfo.current(values: [:]).versionAndBuildText, "Version Unknown (Unknown)")
        XCTAssertEqual(
            BaggerAppBuildInfo.current(values: [
                "CFBundleShortVersionString": "  ",
                "CFBundleVersion": 9,
            ]).versionAndBuildText,
            "Version Unknown (Unknown)"
        )
    }
}
