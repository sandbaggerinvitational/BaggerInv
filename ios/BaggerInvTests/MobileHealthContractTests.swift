import XCTest
@testable import BaggerInv

final class MobileHealthContractTests: XCTestCase {
    func testExactCertifiedIsolatedPreviewHealthPasses() throws {
        let data = try TestFixtures.jsonData(TestFixtures.healthObject())

        let response = try MobileHealthContract.decodeAndValidate(data)

        XCTAssertEqual(response, TestFixtures.health)
        XCTAssertTrue(response.isExactIsolatedPreview)
    }

    func testProductionEnvironmentFailsClosed() throws {
        let data = try TestFixtures.jsonData(
            TestFixtures.healthObject(environment: "production")
        )

        assertIncompatible(data)
    }

    func testProductionShadowFailsClosed() throws {
        let data = try TestFixtures.jsonData(
            TestFixtures.healthObject(authorityOverrides: ["productionShadow": true])
        )

        assertIncompatible(data)
    }

    func testWrongAuthorityFailsClosed() throws {
        let data = try TestFixtures.jsonData(
            TestFixtures.healthObject(authorityOverrides: ["identity": "production"])
        )

        assertIncompatible(data)
    }

    func testWrongAPIVersionFailsClosed() throws {
        let data = try TestFixtures.jsonData(
            TestFixtures.healthObject(apiVersion: "v2")
        )

        assertIncompatible(data)
    }

    func testUnknownHealthFieldFailsClosed() throws {
        let data = try TestFixtures.jsonData(
            TestFixtures.healthObject(rootExtras: ["fallback": "production"])
        )

        assertIncompatible(data)
    }

    private func assertIncompatible(_ data: Data, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(
            try MobileHealthContract.decodeAndValidate(data),
            file: file,
            line: line
        ) { error in
            XCTAssertEqual(error as? MobileContractError, .incompatibleHealth, file: file, line: line)
        }
    }
}
