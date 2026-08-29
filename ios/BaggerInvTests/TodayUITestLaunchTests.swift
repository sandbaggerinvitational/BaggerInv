#if DEBUG
import XCTest
@testable import BaggerInv

final class TodayUITestLaunchTests: XCTestCase {
    func testAcceptanceProbesRequireExplicitDebugLaunchArgument() {
        XCTAssertFalse(BaggerAcceptanceProbes.isEnabled(arguments: []))
        XCTAssertTrue(BaggerAcceptanceProbes.isEnabled(arguments: [BaggerAcceptanceProbes.launchArgument]))
    }

    func testOrdinaryLaunchCannotEnterFixtureMode() {
        XCTAssertDisabled(TodayUITestLaunch.resolve(arguments: ["BaggerInv"]))
    }

    func testExplicitKnownFixtureIsAccepted() {
        let launch = TodayUITestLaunch.resolve(arguments: [
            "BaggerInv",
            "--bagger-ui-testing",
            "--bagger-ui-test-scenario",
            "today.cached-offline",
        ])

        guard case .scenario(let scenario) = launch else {
            return XCTFail("Expected an explicitly selected fixture scenario.")
        }
        XCTAssertEqual(scenario, .cachedOffline)
    }

    func testExplicitSignedOutFixtureIsAccepted() {
        let launch = TodayUITestLaunch.resolve(arguments: [
            "BaggerInv",
            "--bagger-ui-testing",
            "--bagger-ui-test-scenario",
            "auth.signed-out",
        ])

        guard case .scenario(let scenario) = launch else {
            return XCTFail("Expected the explicit signed-out fixture scenario.")
        }
        XCTAssertEqual(scenario, .signedOut)
    }

    func testExplicitMatchesFixtureIsAccepted() {
        let launch = TodayUITestLaunch.resolve(arguments: [
            "BaggerInv",
            "--bagger-ui-testing",
            "--bagger-ui-test-scenario",
            "matches.cached-offline",
        ])

        guard case .scenario(let scenario) = launch else {
            return XCTFail("Expected the explicit Matches fixture scenario.")
        }
        XCTAssertEqual(scenario, .matchesCachedOffline)
    }

    func testMissingOrUnknownScenarioFailsClosedInsteadOfLaunchingLive() {
        XCTAssertInvalid(TodayUITestLaunch.resolve(arguments: [
            "BaggerInv",
            "--bagger-ui-testing",
        ]))
        XCTAssertInvalid(TodayUITestLaunch.resolve(arguments: [
            "BaggerInv",
            "--bagger-ui-testing",
            "--bagger-ui-test-scenario",
            "unknown",
        ]))
    }

    private func XCTAssertDisabled(
        _ launch: TodayUITestLaunch,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard case .disabled = launch else {
            return XCTFail("Expected fixture mode to remain disabled.", file: file, line: line)
        }
    }

    private func XCTAssertInvalid(
        _ launch: TodayUITestLaunch,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard case .invalid = launch else {
            return XCTFail("Expected fixture launch to fail closed.", file: file, line: line)
        }
    }
}
#endif
