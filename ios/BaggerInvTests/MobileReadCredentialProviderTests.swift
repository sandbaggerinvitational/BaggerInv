import XCTest
@testable import BaggerInv

@MainActor
final class MobileReadCredentialProviderTests: XCTestCase {
    func testObtainsFreshSupabaseSessionAndBoundCertificationPerRequest() async throws {
        let auth = MockAuthService()
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let provider = NativeMobileReadCredentialProvider(
            auth: auth,
            certificationStore: store,
            now: { TestFixtures.now }
        )

        let first = try await provider.credentials(expectedAuthUserID: TestFixtures.authSession.userID)
        let second = try await provider.credentials(expectedAuthUserID: TestFixtures.authSession.userID)

        XCTAssertEqual(first.authUserID, TestFixtures.authSession.userID)
        XCTAssertEqual(first.accessToken, TestFixtures.authSession.accessToken)
        XCTAssertEqual(first.certification, TestFixtures.certificationToken)
        XCTAssertEqual(second.authUserID, first.authUserID)
        XCTAssertEqual(store.credentialCallCount, 2)
    }

    func testAuthAccountSwitchFailsBeforeCertificationCanBeReused() async {
        let auth = MockAuthService()
        auth.validSessionValue = SupabaseAuthSession(
            accessToken: "different-session-token",
            userID: "different-auth-user",
            accessTokenExpiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let store = MockCertificationStore()
        let provider = NativeMobileReadCredentialProvider(
            auth: auth,
            certificationStore: store,
            now: { TestFixtures.now }
        )

        do {
            _ = try await provider.credentials(expectedAuthUserID: TestFixtures.authSession.userID)
            XCTFail("Expected identity mismatch")
        } catch {
            XCTAssertEqual(error as? MobileReadCredentialError, .authIdentityChanged)
        }
        XCTAssertEqual(store.credentialCallCount, 0)
    }

    func testMissingOrExpiredCertificationFailsClosed() async {
        let auth = MockAuthService()
        let store = MockCertificationStore()
        store.credentialValue = nil
        let provider = NativeMobileReadCredentialProvider(
            auth: auth,
            certificationStore: store,
            now: { TestFixtures.now }
        )

        do {
            _ = try await provider.credentials(expectedAuthUserID: TestFixtures.authSession.userID)
            XCTFail("Expected missing certification")
        } catch {
            XCTAssertEqual(error as? MobileReadCredentialError, .certificationUnavailable)
        }
    }

    func testTransientAuthSessionFailureRemainsDistinguishableFromInvalidAuthentication() async {
        let auth = MockAuthService()
        auth.validSessionError = StubError.planned
        let provider = NativeMobileReadCredentialProvider(
            auth: auth,
            certificationStore: MockCertificationStore(),
            now: { TestFixtures.now }
        )

        do {
            _ = try await provider.credentials(expectedAuthUserID: TestFixtures.authSession.userID)
            XCTFail("Expected session failure")
        } catch {
            XCTAssertEqual(error as? MobileReadCredentialError, .authSessionUnavailable)
        }
    }

    func testMissingAuthSessionMapsToDefiniteAuthenticationFailure() async {
        let auth = MockAuthService()
        auth.validSessionError = SupabaseAuthServiceError.sessionMissing
        let provider = NativeMobileReadCredentialProvider(
            auth: auth,
            certificationStore: MockCertificationStore(),
            now: { TestFixtures.now }
        )

        do {
            _ = try await provider.credentials(expectedAuthUserID: TestFixtures.authSession.userID)
            XCTFail("Expected missing session")
        } catch {
            XCTAssertEqual(error as? MobileReadCredentialError, .authSessionMissing)
        }
    }

    func testCertificationStoreFailureMapsToFailClosedCredentialError() async {
        let store = MockCertificationStore()
        store.credentialError = StubError.planned
        let provider = NativeMobileReadCredentialProvider(
            auth: MockAuthService(),
            certificationStore: store,
            now: { TestFixtures.now }
        )

        do {
            _ = try await provider.credentials(expectedAuthUserID: TestFixtures.authSession.userID)
            XCTFail("Expected certification store failure")
        } catch {
            XCTAssertEqual(error as? MobileReadCredentialError, .certificationUnavailable)
        }
    }
}
