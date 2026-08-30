import XCTest
@testable import BaggerInv

@MainActor
final class ScoringCurrentStoreTests: XCTestCase {
    func testActivateLoadsCanonicalScoringIntoMemoryWithCurrentCredentials() async throws {
        let harness = makeHarness()

        await harness.store.activate(authUserID: TestFixtures.authSession.userID)

        XCTAssertEqual(harness.store.state.phase, .ready)
        XCTAssertEqual(harness.store.state.scoring, TestFixtures.scoringResponse.data.scoring)
        XCTAssertEqual(harness.store.state.generatedAt, TestFixtures.scoringResponse.meta.generatedAt)
        XCTAssertFalse(harness.store.state.isRefreshing)
        XCTAssertEqual(harness.api.scoringCallCount, 1)
        XCTAssertEqual(harness.api.scoringAccessToken, TestFixtures.authSession.accessToken)
        XCTAssertEqual(harness.api.scoringCertification, TestFixtures.certificationToken)
        XCTAssertNil(harness.api.scoringMatchID)
    }

    func testIntentionalNullScoringPublishesNoMatchState() async throws {
        let harness = makeHarness()
        harness.api.scoringValue = MobileScoringCurrentResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileScoringCurrentData(scoring: nil),
            meta: TestFixtures.scoringResponse.meta
        )

        await harness.store.activate(authUserID: TestFixtures.authSession.userID)

        XCTAssertEqual(harness.store.state.phase, .noMatch)
        XCTAssertNil(harness.store.state.scoring)
        XCTAssertNil(harness.store.state.lastSafeError)
    }

    func testTransportFailureRetainsOnlyInMemoryOfficialSnapshotForOrientation() async throws {
        let harness = makeHarness()
        await harness.store.activate(authUserID: TestFixtures.authSession.userID)
        harness.api.scoringError = MobileAPIClientError.transportUnavailable

        await harness.store.refresh()

        XCTAssertEqual(harness.store.state.scoring, TestFixtures.scoringResponse.data.scoring)
        XCTAssertEqual(harness.store.state.phase, .offline)
        XCTAssertEqual(harness.store.state.lastSafeError, .transport)
        XCTAssertTrue(harness.store.state.isOrientationOnly)
    }

    func testAuthenticationFailureClearsSnapshotAndNotifiesSessionOwner() async throws {
        let harness = makeHarness()
        await harness.store.activate(authUserID: TestFixtures.authSession.userID)
        var invalidationCount = 0
        harness.store.setAccessInvalidationHandler { invalidationCount += 1 }
        harness.api.scoringError = MobileAPIClientError.server(code: .unauthorized, status: 401)

        await harness.store.refresh()

        XCTAssertNil(harness.store.state.scoring)
        XCTAssertEqual(harness.store.state.phase, .authenticationRequired)
        XCTAssertEqual(harness.store.state.lastSafeError, .authentication)
        XCTAssertEqual(invalidationCount, 1)
    }

    func testScoringScopedAuthorizationFailureDoesNotSignOutGlobalSession() async throws {
        let harness = makeHarness()
        await harness.store.activate(authUserID: TestFixtures.authSession.userID)
        var invalidationCount = 0
        harness.store.setAccessInvalidationHandler { invalidationCount += 1 }
        harness.api.scoringError = MobileAPIClientError.server(code: .scoringNotAuthorized, status: 403)

        await harness.store.refresh()

        XCTAssertNil(harness.store.state.scoring)
        XCTAssertEqual(harness.store.state.phase, .authorizationRequired)
        XCTAssertEqual(harness.store.state.lastServerCode, .scoringNotAuthorized)
        XCTAssertEqual(invalidationCount, 0)
    }

    func testMobileAPIUnavailableRequestsEnvironmentReattestationWithoutDiskFallback() async throws {
        let harness = makeHarness()
        await harness.store.activate(authUserID: TestFixtures.authSession.userID)
        var reattestationCount = 0
        harness.store.setAuthorityRevalidationHandler { reattestationCount += 1 }
        harness.api.scoringError = MobileAPIClientError.server(code: .mobileAPIUnavailable, status: 503)

        await harness.store.refresh()

        XCTAssertEqual(harness.store.state.phase, .unavailable)
        XCTAssertEqual(harness.store.state.scoring, TestFixtures.scoringResponse.data.scoring)
        XCTAssertTrue(harness.store.state.isOrientationOnly)
        XCTAssertEqual(reattestationCount, 1)
    }

    func testTwoConcurrentRefreshesShareOneScoringRequest() async throws {
        let harness = makeHarness()
        harness.api.scoringDelayNanoseconds = 100_000_000
        await harness.store.activate(
            authUserID: TestFixtures.authSession.userID,
            beginRefresh: false
        )

        async let first: Void = harness.store.refresh()
        async let second: Void = harness.store.refresh()
        _ = await (first, second)

        XCTAssertEqual(harness.api.scoringCallCount, 1)
        XCTAssertEqual(harness.store.state.phase, .ready)
    }

    func testCancellationDoesNotPublishOrPersistPartialState() async throws {
        let harness = makeHarness()
        harness.api.scoringDelayNanoseconds = 60_000_000_000
        await harness.store.activate(
            authUserID: TestFixtures.authSession.userID,
            beginRefresh: false
        )
        let refresh = Task { await harness.store.refresh() }
        for _ in 0..<1_000 where harness.api.scoringCallCount == 0 {
            await Task.yield()
        }

        await harness.store.cancelRefresh()
        await refresh.value

        XCTAssertEqual(harness.api.scoringCallCount, 1)
        XCTAssertNil(harness.store.state.scoring)
        XCTAssertEqual(harness.store.state.phase, .idle)
        XCTAssertEqual(harness.store.state.lastSafeError, .cancelled)
        XCTAssertFalse(harness.store.state.isRefreshing)
    }

    func testScopedResponseWithDifferentCanonicalMatchFailsClosed() async throws {
        let harness = makeHarness()

        await harness.store.activate(
            authUserID: TestFixtures.authSession.userID,
            matchID: "different-match"
        )

        XCTAssertNil(harness.store.state.scoring)
        XCTAssertEqual(harness.store.state.phase, .unavailable)
        XCTAssertEqual(harness.store.state.lastSafeError, .contract)
    }

    func testDeactivationCancelsAndErasesOnlyInMemoryScoringState() async throws {
        let harness = makeHarness()
        await harness.store.activate(authUserID: TestFixtures.authSession.userID)

        await harness.store.deactivate()

        XCTAssertEqual(harness.store.state, .idle)
    }

    func testEnvironmentSuspensionImmediatelyHidesCanonicalSnapshot() async throws {
        let harness = makeHarness()
        await harness.store.activate(authUserID: TestFixtures.authSession.userID)

        await harness.store.suspendForEnvironmentReattestation()

        XCTAssertEqual(harness.store.state, .idle)
    }

    func testQueueCanonicalRefreshPublishesIntoTheAlreadyOwnedMatch() async throws {
        let harness = makeHarness()
        let matchID = try XCTUnwrap(TestFixtures.scoringResponse.data.scoring?.match.matchId)
        await harness.store.activate(
            authUserID: TestFixtures.authSession.userID,
            playerID: TestFixtures.participant.player.playerId,
            matchID: matchID,
            beginRefresh: false
        )

        harness.store.applyCanonicalQueueRefresh(TestFixtures.scoringResponse)

        XCTAssertEqual(harness.store.state.phase, .ready)
        XCTAssertEqual(harness.store.state.scoring, TestFixtures.scoringResponse.data.scoring)
        XCTAssertEqual(harness.store.state.generatedAt, TestFixtures.scoringResponse.meta.generatedAt)
        XCTAssertNil(harness.store.state.lastSafeError)
    }

    func testQueueCanonicalRefreshCannotReplaceAnotherActiveMatch() async throws {
        let harness = makeHarness()
        await harness.store.activate(
            authUserID: TestFixtures.authSession.userID,
            playerID: TestFixtures.participant.player.playerId,
            matchID: "different-match",
            beginRefresh: false
        )

        harness.store.applyCanonicalQueueRefresh(TestFixtures.scoringResponse)

        XCTAssertEqual(harness.store.state, .idle)
    }

    private func makeHarness() -> (
        store: ScoringCurrentStore,
        api: MockMobileAPI,
        auth: MockAuthService,
        certification: MockCertificationStore
    ) {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        let certification = MockCertificationStore()
        certification.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let provider = NativeMobileReadCredentialProvider(
            auth: auth,
            certificationStore: certification,
            now: { TestFixtures.now }
        )
        return (
            ScoringCurrentStore(api: api, credentialProvider: provider),
            api,
            auth,
            certification
        )
    }
}
