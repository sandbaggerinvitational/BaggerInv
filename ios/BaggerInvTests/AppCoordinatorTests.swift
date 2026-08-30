import XCTest
@testable import BaggerInv

final class AppCoordinatorTests: XCTestCase {
    @MainActor
    func testBootstrapWithoutSupabaseSessionEndsSignedOut() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store)

        await coordinator.bootstrap()

        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertEqual(api.healthCallCount, 1)
        XCTAssertEqual(auth.restoreCallCount, 1)
        XCTAssertEqual(api.participantCallCount, 0)
    }

    @MainActor
    func testBootstrapHealthFailureFailsClosedBeforeSessionRestore() async {
        let api = MockMobileAPI()
        api.healthError = StubError.planned
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let coordinator = makeCoordinator(api: api, auth: auth)

        await coordinator.bootstrap()

        XCTAssertEqual(coordinator.state, .environmentUnavailable)
        XCTAssertEqual(auth.restoreCallCount, 0)
        XCTAssertEqual(api.participantCallCount, 0)
    }

    @MainActor
    func testRawSupabaseSessionWithoutBaggerProofCannotRestoreParticipant() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = nil
        let coordinator = makeCoordinator(api: api, auth: auth, store: store)

        await coordinator.bootstrap()

        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertEqual(store.requestedUserID, TestFixtures.authSession.userID)
        XCTAssertEqual(auth.signOutCallCount, 1)
        XCTAssertEqual(store.deleteCallCount, 1)
        XCTAssertEqual(api.participantCallCount, 0)
    }

    @MainActor
    func testBootstrapWithBoundCertificationRestoresCanonicalParticipant() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let coordinator = makeCoordinator(api: api, auth: auth, store: store)

        await coordinator.bootstrap()

        XCTAssertEqual(coordinator.state, .authenticated(TestFixtures.participant))
        XCTAssertEqual(api.sessionAccessToken, TestFixtures.authSession.accessToken)
        XCTAssertEqual(api.sessionCertification, TestFixtures.certificationToken)
    }

    @MainActor
    func testRestoredCanonicalSessionActivatesExactReadCachePartitionContext() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store, data: data)

        await coordinator.bootstrap()

        XCTAssertEqual(data.activateCallCount, 1)
        XCTAssertEqual(data.activatedAuthUserID, TestFixtures.authSession.userID)
        XCTAssertEqual(data.activatedParticipant, TestFixtures.participant)
    }

    @MainActor
    func testQueueAccessInvalidationWhileLoadingParticipantCannotFinishAuthenticated() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let data = MockTournamentDataLifecycle()
        data.suspendNextActivationCall()
        let coordinator = makeCoordinator(
            api: api,
            auth: auth,
            store: store,
            data: data
        )
        let bootstrap = Task { await coordinator.bootstrap() }

        for _ in 0..<100 where !data.hasSuspendedActivation() {
            await Task.yield()
        }
        XCTAssertTrue(data.hasSuspendedActivation())
        XCTAssertEqual(coordinator.state, .loadingParticipant)

        await coordinator.handleReadAccessInvalidation()
        data.resumeSuspendedActivation()
        await bootstrap.value

        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertEqual(auth.signOutCallCount, 1)
        XCTAssertEqual(store.deleteCallCount, 1)
        XCTAssertGreaterThanOrEqual(data.deactivateCallCount, 1)
    }

    @MainActor
    func testBeginSignInNormalizesEmailAndRequiresCaptcha() {
        let coordinator = makeCoordinator()

        coordinator.beginSignIn(email: "  Golfer@Example.Test  ")

        XCTAssertEqual(coordinator.state, .solvingCaptcha(email: "golfer@example.test"))
    }

    @MainActor
    func testSuccessfulCaptchaRequestsOTPAndStoresOnlyOpaqueChallengeContext() async {
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api)
        coordinator.beginSignIn(email: "golfer@example.test")
        let captchaToken = String(repeating: "c", count: 32)

        await coordinator.completeCaptcha(token: captchaToken, email: "golfer@example.test")

        let expectedContext = OTPChallengeContext(
            email: "golfer@example.test",
            challengeId: TestFixtures.challengeID,
            expiresAt: TestFixtures.now.addingTimeInterval(900),
            resendAt: TestFixtures.now.addingTimeInterval(60)
        )
        XCTAssertEqual(coordinator.state, .awaitingOTP(expectedContext))
        XCTAssertEqual(api.requestedIdentifier, "golfer@example.test")
        XCTAssertEqual(api.requestedCaptchaToken, captchaToken)
    }

    @MainActor
    func testVerifiedOTPRequiresCertificationBeforeCanonicalParticipantLoads() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store)
        let context = challengeContext()

        await coordinator.verifyOTP(code: " 123456 ", context: context)

        XCTAssertEqual(auth.verifiedEmail, context.email)
        XCTAssertEqual(auth.verifiedCode, "123456")
        XCTAssertEqual(api.certifiedChallengeID, context.challengeId)
        XCTAssertEqual(api.certifiedAccessToken, TestFixtures.authSession.accessToken)
        XCTAssertEqual(store.savedToken, TestFixtures.certificationToken)
        XCTAssertEqual(store.savedUserID, TestFixtures.authSession.userID)
        XCTAssertEqual(api.participantCallCount, 1)
        XCTAssertEqual(coordinator.state, .authenticated(TestFixtures.participant))
    }

    @MainActor
    func testFreshAuthenticationActivatesReadsOnlyAfterCanonicalParticipantResolution() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store, data: data)

        await coordinator.verifyOTP(code: "123456", context: challengeContext())

        XCTAssertEqual(api.participantCallCount, 1)
        XCTAssertEqual(data.activateCallCount, 1)
        XCTAssertEqual(data.activatedAuthUserID, TestFixtures.authSession.userID)
        XCTAssertEqual(data.activatedParticipant, TestFixtures.participant)
    }

    @MainActor
    func testCertificationFailureDiscardsSupabaseSessionAndNeverLoadsParticipant() async {
        let api = MockMobileAPI()
        api.certificationError = StubError.planned
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store)

        await coordinator.verifyOTP(code: "123456", context: challengeContext())

        guard case .authenticationError(let presentation) = coordinator.state else {
            XCTFail("Expected a controlled authentication error")
            return
        }
        XCTAssertEqual(presentation.recovery, .signedOut)
        XCTAssertEqual(auth.signOutCallCount, 1)
        XCTAssertEqual(store.deleteCallCount, 1)
        XCTAssertEqual(api.participantCallCount, 0)
    }

    @MainActor
    func testUnmappedParticipantResponseFailsClosedWithoutInventingPlayer() async {
        let api = MockMobileAPI()
        api.participantError = MobileAPIClientError.server(code: .participantNotFound, status: 404)
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store)

        await coordinator.verifyOTP(code: "123456", context: challengeContext())

        guard case .authenticationError(let presentation) = coordinator.state else {
            XCTFail("Expected a controlled participant-link error")
            return
        }
        XCTAssertEqual(presentation.recovery, .signedOut)
        XCTAssertEqual(auth.signOutCallCount, 1)
        XCTAssertEqual(store.deleteCallCount, 1)
        XCTAssertNotEqual(coordinator.state, .authenticated(TestFixtures.participant))
    }

    @MainActor
    func testExpiredOTPNeverReachesSupabaseOrCertification() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        let coordinator = makeCoordinator(api: api, auth: auth)
        let expired = OTPChallengeContext(
            email: "golfer@example.test",
            challengeId: TestFixtures.challengeID,
            expiresAt: TestFixtures.now,
            resendAt: TestFixtures.now
        )

        await coordinator.verifyOTP(code: "123456", context: expired)

        guard case .authenticationError(let presentation) = coordinator.state else {
            XCTFail("Expected an expired-code error")
            return
        }
        XCTAssertEqual(presentation.recovery, .retryOTP(expired))
        XCTAssertEqual(auth.verificationCallCount, 0)
        XCTAssertEqual(api.certificationCallCount, 0)
    }

    @MainActor
    func testSignOutClearsBothProtectedCredentialStoresAndParticipantState() async {
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let coordinator = makeCoordinator(auth: auth, store: store)
        coordinator.beginSignIn(email: "golfer@example.test")

        await coordinator.signOut()

        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertEqual(auth.signOutCallCount, 1)
        XCTAssertEqual(store.deleteCallCount, 1)
    }

    @MainActor
    func testSignOutDeactivatesAndDeletesDisposableReadCache() async {
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(auth: auth, store: store, data: data)

        await coordinator.signOut()

        XCTAssertEqual(data.deactivateCallCount, 1)
        XCTAssertEqual(data.deleteCacheValues, [true])
        XCTAssertEqual(auth.signOutCallCount, 1)
        XCTAssertEqual(store.deleteCallCount, 1)
    }

    @MainActor
    func testSignOutWithUnresolvedScoringIntentRequiresExplicitConfirmation() async {
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let data = MockTournamentDataLifecycle()
        data.unresolvedScoringIntentCountValue = 2
        let coordinator = makeCoordinator(auth: auth, store: store, data: data)

        await coordinator.requestSignOut()

        XCTAssertEqual(
            coordinator.scoringQueueSignOutPresentation,
            ScoringQueueSignOutPresentation(unresolvedCount: 2)
        )
        XCTAssertEqual(data.prepareScoringQueueForSignOutCallCount, 1)
        XCTAssertEqual(auth.signOutCallCount, 0)
        XCTAssertEqual(store.deleteCallCount, 0)
        XCTAssertNotEqual(coordinator.state, .signedOut)
    }

    @MainActor
    func testSignOutFailsClosedWhenDurableQueueCountCannotBeRead() async {
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let data = MockTournamentDataLifecycle()
        data.unresolvedScoringIntentCountValue = nil
        let coordinator = makeCoordinator(auth: auth, store: store, data: data)

        await coordinator.requestSignOut()

        XCTAssertEqual(
            coordinator.scoringQueueSignOutPresentation,
            ScoringQueueSignOutPresentation(unresolvedCount: nil)
        )
        XCTAssertEqual(data.prepareScoringQueueForSignOutCallCount, 1)
        XCTAssertEqual(auth.signOutCallCount, 0)
        XCTAssertEqual(store.deleteCallCount, 0)
        XCTAssertNotEqual(coordinator.state, .signedOut)
    }

    @MainActor
    func testCancellingScoringQueueSignOutWarningPreservesSessionAndResumesQueue() async {
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let data = MockTournamentDataLifecycle()
        data.unresolvedScoringIntentCountValue = 1
        let coordinator = makeCoordinator(auth: auth, store: store, data: data)
        await coordinator.requestSignOut()

        await coordinator.cancelSignOut()

        XCTAssertNil(coordinator.scoringQueueSignOutPresentation)
        XCTAssertEqual(data.cancelScoringQueueSignOutPreparationCallCount, 1)
        XCTAssertEqual(auth.signOutCallCount, 0)
        XCTAssertEqual(store.deleteCallCount, 0)
        XCTAssertNotEqual(coordinator.state, .signedOut)
    }

    @MainActor
    func testConfirmedSignOutRetainsQueueButClearsSecretsAndParticipantState() async {
        let auth = MockAuthService()
        let store = MockCertificationStore()
        let data = MockTournamentDataLifecycle()
        data.unresolvedScoringIntentCountValue = 3
        let coordinator = makeCoordinator(auth: auth, store: store, data: data)
        await coordinator.requestSignOut()

        await coordinator.confirmSignOutWithUnresolvedScores()

        XCTAssertNil(coordinator.scoringQueueSignOutPresentation)
        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertGreaterThanOrEqual(data.prepareScoringQueueForSignOutCallCount, 1)
        XCTAssertEqual(data.deactivateCallCount, 1)
        XCTAssertEqual(data.deleteCacheValues, [true], "Only the disposable read cache should be deleted.")
        XCTAssertEqual(auth.signOutCallCount, 1)
        XCTAssertEqual(store.deleteCallCount, 1)
    }

    @MainActor
    func testEnvironmentFailureHidesAndDeletesEligibleParticipantCache() async {
        let api = MockMobileAPI()
        api.healthError = StubError.planned
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, data: data)

        await coordinator.bootstrap()

        XCTAssertEqual(coordinator.state, .environmentUnavailable)
        XCTAssertEqual(data.deactivateCallCount, 1)
        XCTAssertEqual(data.deleteCacheValues, [true])
        XCTAssertEqual(data.activateCallCount, 0)
    }

    @MainActor
    func testForegroundRefreshRunsOnlyWhileAuthenticated() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store, data: data)

        await coordinator.refreshTournamentDataForForeground()
        XCTAssertEqual(data.foregroundRefreshCallCount, 0)

        await coordinator.bootstrap()
        await coordinator.refreshTournamentDataForForeground()
        XCTAssertEqual(data.foregroundRefreshCallCount, 1)
    }

    @MainActor
    func testForegroundAuthorityFailureHidesParticipantReadsAndFailsEnvironmentClosed() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store, data: data)
        await coordinator.bootstrap()
        api.healthError = MobileContractError.incompatibleHealth

        await coordinator.refreshTournamentDataForForeground()

        XCTAssertEqual(coordinator.state, .environmentUnavailable)
        XCTAssertEqual(data.deactivateCallCount, 1)
        XCTAssertEqual(data.deleteCacheValues, [true])
        XCTAssertEqual(auth.signOutCallCount, 0)
    }

    @MainActor
    func testForegroundTransportFailureRetainsAuthenticatedStateAndEligibleCache() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store, data: data)
        await coordinator.bootstrap()
        api.healthError = MobileAPIClientError.transportUnavailable

        await coordinator.refreshTournamentDataForForeground()

        XCTAssertEqual(coordinator.state, .authenticated(TestFixtures.participant))
        XCTAssertEqual(data.deactivateCallCount, 0)
        XCTAssertEqual(data.foregroundRefreshCallCount, 0)
        XCTAssertEqual(auth.signOutCallCount, 0)
    }

    @MainActor
    func testReadUnavailableReattestationKeepsAuthenticatedStateWhenAuthorityPasses() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store, data: data)
        await coordinator.bootstrap()

        await coordinator.revalidateReadAuthorityAfterUnavailableResponse()

        XCTAssertEqual(coordinator.state, .authenticated(TestFixtures.participant))
        XCTAssertEqual(api.healthCallCount, 2)
        XCTAssertEqual(data.deactivateCallCount, 0)
        XCTAssertEqual(data.suspendCallCount, 1)
        XCTAssertEqual(data.resumeCallCount, 1)
    }

    @MainActor
    func testReadUnavailableReattestationFailsClosedWhenAuthorityNoLongerPasses() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store, data: data)
        await coordinator.bootstrap()
        api.healthError = StubError.planned

        await coordinator.revalidateReadAuthorityAfterUnavailableResponse()

        XCTAssertEqual(coordinator.state, .environmentUnavailable)
        XCTAssertEqual(api.healthCallCount, 2)
        XCTAssertEqual(data.deactivateCallCount, 1)
        XCTAssertEqual(data.deleteCacheValues, [true])
        XCTAssertEqual(data.suspendCallCount, 1)
        XCTAssertEqual(data.resumeCallCount, 0)
        XCTAssertEqual(auth.signOutCallCount, 0)
    }

    @MainActor
    func testSignOutDuringAuthorityReattestationCannotRestoreParticipantOrReadsLate() async {
        let api = MockMobileAPI()
        let auth = MockAuthService()
        auth.restoredSessionValue = TestFixtures.authSession
        let store = MockCertificationStore()
        store.credentialValue = StoredBaggerCertification(
            token: TestFixtures.certificationToken,
            userID: TestFixtures.authSession.userID,
            expiresAt: TestFixtures.now.addingTimeInterval(3_600)
        )
        let data = MockTournamentDataLifecycle()
        let coordinator = makeCoordinator(api: api, auth: auth, store: store, data: data)
        await coordinator.bootstrap()
        api.suspendNextHealth()
        let revalidation = Task { @MainActor in
            await coordinator.revalidateReadAuthorityAfterUnavailableResponse()
        }
        for _ in 0..<1_000 where !api.hasSuspendedHealth() {
            await Task.yield()
        }
        XCTAssertTrue(api.hasSuspendedHealth())

        await coordinator.signOut()
        api.resumeSuspendedHealth()
        await revalidation.value

        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertEqual(data.suspendCallCount, 1)
        XCTAssertEqual(data.resumeCallCount, 0)
        XCTAssertEqual(data.deactivateCallCount, 1)
        XCTAssertEqual(auth.signOutCallCount, 1)
    }

    @MainActor
    func testSignOutInvalidatesInFlightVerificationBeforeCertification() async {
        let api = MockMobileAPI()
        let auth = SuspendingAuthService()
        let store = MockCertificationStore()
        let coordinator = AppCoordinator(
            environment: TestFixtures.environment,
            api: api,
            auth: auth,
            certificationStore: store,
            now: { TestFixtures.now }
        )

        let verification = Task {
            await coordinator.verifyOTP(code: "123456", context: challengeContext())
        }
        await Task.yield()

        await coordinator.signOut()
        auth.finishVerification()
        await verification.value

        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertEqual(api.certificationCallCount, 0)
        XCTAssertEqual(api.participantCallCount, 0)
        XCTAssertGreaterThanOrEqual(auth.signOutCallCount, 1)
        XCTAssertGreaterThanOrEqual(store.deleteCallCount, 1)
    }

    @MainActor
    private func makeCoordinator(
        api: MockMobileAPI = MockMobileAPI(),
        auth: MockAuthService = MockAuthService(),
        store: MockCertificationStore = MockCertificationStore(),
        data: MockTournamentDataLifecycle? = nil
    ) -> AppCoordinator {
        AppCoordinator(
            environment: TestFixtures.environment,
            api: api,
            auth: auth,
            certificationStore: store,
            tournamentDataLifecycle: data,
            now: { TestFixtures.now }
        )
    }

    private func challengeContext() -> OTPChallengeContext {
        OTPChallengeContext(
            email: "golfer@example.test",
            challengeId: TestFixtures.challengeID,
            expiresAt: TestFixtures.now.addingTimeInterval(900),
            resendAt: TestFixtures.now.addingTimeInterval(60)
        )
    }
}
