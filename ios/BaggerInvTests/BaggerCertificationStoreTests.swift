import XCTest
@testable import BaggerInv

@MainActor
final class BaggerCertificationStoreTests: XCTestCase {
    func testWriteAndReadCertificationBindsTokenToAuthUser() throws {
        let keychain = InMemorySecureStore()
        let store = BaggerCertificationStore(keychain: keychain, expirySafetyMargin: 60)

        try store.save(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresInSeconds: 43_200,
            now: TestFixtures.now
        )
        let restored = try store.credential(
            for: TestFixtures.authSession.userID,
            now: TestFixtures.now.addingTimeInterval(60)
        )

        XCTAssertEqual(restored?.token, TestFixtures.certificationToken)
        XCTAssertEqual(restored?.userID, TestFixtures.authSession.userID)
        XCTAssertEqual(
            restored?.expiresAt,
            TestFixtures.now.addingTimeInterval(43_140)
        )
        XCTAssertEqual(keychain.writeCount, 1)
    }

    func testExpiredCertificationIsRejectedAndDeleted() throws {
        let keychain = InMemorySecureStore()
        let store = BaggerCertificationStore(keychain: keychain, expirySafetyMargin: 60)
        try store.save(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresInSeconds: 120,
            now: TestFixtures.now
        )

        let restored = try store.credential(
            for: TestFixtures.authSession.userID,
            now: TestFixtures.now.addingTimeInterval(60)
        )

        XCTAssertNil(restored)
        XCTAssertEqual(keychain.deleteCount, 1)
    }

    func testAnotherAuthAccountCannotReuseCertification() throws {
        let keychain = InMemorySecureStore()
        let store = BaggerCertificationStore(keychain: keychain)
        try store.save(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresInSeconds: 43_200,
            now: TestFixtures.now
        )

        let restored = try store.credential(
            for: "different-auth-user",
            now: TestFixtures.now
        )

        XCTAssertNil(restored)
        XCTAssertEqual(keychain.deleteCount, 1)
    }

    func testDeleteRemovesCertification() throws {
        let keychain = InMemorySecureStore()
        let store = BaggerCertificationStore(keychain: keychain)
        try store.save(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresInSeconds: 43_200,
            now: TestFixtures.now
        )

        try store.delete()

        XCTAssertNil(try store.credential(for: TestFixtures.authSession.userID, now: TestFixtures.now))
        XCTAssertEqual(keychain.deleteCount, 1)
    }

    func testInvalidCertificationIsNeverWritten() throws {
        let keychain = InMemorySecureStore()
        let store = BaggerCertificationStore(keychain: keychain)

        XCTAssertThrowsError(
            try store.save(
                token: "unsigned",
                userID: TestFixtures.authSession.userID,
                expiresInSeconds: 43_200,
                now: TestFixtures.now
            )
        ) { error in
            XCTAssertEqual(error as? CertificationStoreError, .invalidCredential)
        }
        XCTAssertEqual(keychain.writeCount, 0)
    }

    func testMalformedStoredDataIsRejectedAndDeleted() throws {
        let keychain = InMemorySecureStore()
        try keychain.write(
            Data("not-json-and-not-a-token".utf8),
            service: BaggerCertificationStore.service,
            account: BaggerCertificationStore.account
        )
        let store = BaggerCertificationStore(keychain: keychain)

        let restored = try store.credential(
            for: TestFixtures.authSession.userID,
            now: TestFixtures.now
        )

        XCTAssertNil(restored)
        XCTAssertEqual(keychain.deleteCount, 1)
    }
}
