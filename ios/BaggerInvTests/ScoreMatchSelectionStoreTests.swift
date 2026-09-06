import XCTest
@testable import BaggerInv

@MainActor
final class ScoreMatchSelectionStoreTests: XCTestCase {
    private typealias API = ScoreMatchSelectionFixtureAPI
    private func harness(now: @escaping () -> Date = Date.init) -> (API, ScoreMatchSelectionStore, NativeApplicationActivity, ScoreMatchSelectionFixtureCredentials) {
        let api = API(), activity = NativeApplicationActivity(isActive: true), credentials = ScoreMatchSelectionFixtureCredentials()
        let store = ScoreMatchSelectionStore(api: api, credentials: credentials, activity: activity, now: now)
        store.activate(identity: .init(authUserId: API.authID, playerId: api.playerID, tournamentId: api.tournamentID))
        return (api, store, activity, credentials)
    }

    func testOnlyFreshServerWritableMatchesAppearNeverFinalReadOnly() async {
        let (api, store, _, _) = harness()
        await store.refresh()
        XCTAssertEqual(store.phase, .ready)
        XCTAssertEqual(store.choices.map(\.match.matchId), [API.bb, API.sc])
        XCTAssertEqual(api.scoringIDs, [API.bb, API.sc, API.si])
        XCTAssertEqual(api.etags.count, 1); XCTAssertNil(api.etags[0])
    }

    func testScopedDenialExcludesOnlyDeniedMatch() async {
        let (api, store, _, _) = harness()
        api.scoringErrors[API.sc] = MobileAPIClientError.server(code: .scoringNotAuthorized, status: 403)
        await store.refresh()
        XCTAssertEqual(store.phase, .ready)
        XCTAssertEqual(store.choices.map(\.match.matchId), [API.bb])
    }

    func testTransportFailureNeverPublishesPartiallyVerifiedChoices() async {
        let (api, store, _, _) = harness()
        api.scoringErrors[API.sc] = MobileAPIClientError.transportUnavailable
        await store.refresh()
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(store.choices.isEmpty)
    }

    func testCached304IndexCannotServeAsFreshDiscovery() async {
        let (api, store, _, _) = harness()
        api.returnNotModified = true
        await store.refresh()
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(store.choices.isEmpty)
        XCTAssertTrue(api.scoringIDs.isEmpty)
    }

    func testForeignTournamentFailsClosedBeforeScoringReads() async {
        let (api, store, _, _) = harness()
        api.tournamentID = "different-tournament"
        await store.refresh()
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(api.scoringIDs.isEmpty)
    }

    func testCredentialIdentityMismatchClearsChoicesAndInvalidatesAccess() async {
        let (_, store, _, credentials) = harness()
        var invalidations = 0
        store.setAccessInvalidationHandler { invalidations += 1 }
        credentials.authID = "different-auth"
        await store.refresh()
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(store.choices.isEmpty)
        XCTAssertEqual(invalidations, 1)
    }

    func testWrongCanonicalMatchIsNotRelabelledOrSelected() async {
        let (api, store, _, _) = harness()
        api.responses[API.bb] = api.responses[API.sc]
        await store.refresh()
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(store.choices.isEmpty)
    }

    func testDuplicateExactIDsFailClosed() async {
        let (api, store, _, _) = harness()
        api.listed.append(api.listed[0])
        await store.refresh()
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(api.scoringIDs.isEmpty)
    }

    func testSelectionRereadsExactIDRatherThanTrustingDisplayedPermission() async throws {
        let (api, store, _, _) = harness()
        await store.refresh()
        let before = api.responses
        try await store.verifySelection(matchID: API.sc)
        XCTAssertEqual(api.scoringIDs, [API.bb, API.sc, API.si, API.sc])
        XCTAssertTrue(store.canCommitSelection(matchID: API.sc))
        XCTAssertFalse(store.canCommitSelection(matchID: API.bb))
        XCTAssertTrue(store.choices.isEmpty)
        XCTAssertEqual(api.responses, before, "Discovery and selection do not change scores or canonical values.")
    }

    func testRevocationAfterDisplayStopsSelection() async {
        let (api, store, _, _) = harness()
        await store.refresh()
        api.scoringErrors[API.sc] = MobileAPIClientError.server(code: .scoringNotAuthorized, status: 403)
        do { try await store.verifySelection(matchID: API.sc); XCTFail("Revoked Match cannot be selected") } catch {}
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(store.choices.isEmpty)
        XCTAssertFalse(store.canCommitSelection(matchID: API.sc))
    }

    func testNeverListedMatchCannotBeSelected() async {
        let (api, store, _, _) = harness()
        await store.refresh()
        do { try await store.verifySelection(matchID: "unlisted"); XCTFail("Not authorized") } catch {}
        XCTAssertEqual(api.scoringIDs.count, 3)
    }

    func testExpiredChoiceIsRemovedAndCannotBeSelected() async {
        var now = Date()
        let (api, store, _, _) = harness(now: { now })
        await store.refresh()
        now = now.addingTimeInterval(31)
        do { try await store.verifySelection(matchID: API.bb); XCTFail("Expired") } catch {}
        XCTAssertEqual(store.phase, .expired); XCTAssertTrue(store.choices.isEmpty)
        XCTAssertEqual(api.scoringIDs.count, 3)
    }

    func testLateResponseAfterDismissCannotRestoreChoices() async {
        let (api, store, _, _) = harness()
        api.scoringDelay = 100_000_000
        let request = Task { await store.refresh() }
        for _ in 0..<1_000 where api.scoringIDs.isEmpty { await Task.yield() }
        store.invalidate()
        await request.value
        XCTAssertEqual(store.phase, .idle); XCTAssertTrue(store.choices.isEmpty)
    }

    func testApplicationInactivityFailsClosed() async {
        let (api, store, activity, _) = harness()
        api.onScoringRead = { _ in activity.update(isActive: false); store.invalidate() }
        await store.refresh()
        XCTAssertTrue(store.choices.isEmpty); XCTAssertFalse(store.canCommitSelection(matchID: API.bb))
    }

    func testSignOutDuringReadCannotResurrectProtectedChoices() async {
        let (api, store, _, _) = harness()
        api.onScoringRead = { _ in store.deactivate() }
        await store.refresh()
        XCTAssertTrue(store.choices.isEmpty); XCTAssertEqual(store.phase, .idle)
    }

    func testRefreshingClearsPreviouslyVerifiedChoicesBeforeAnyNewResult() async {
        let (api, store, _, _) = harness()
        await store.refresh()
        api.onScoringRead = { _ in XCTAssertTrue(store.choices.isEmpty); XCTAssertEqual(store.phase, .loading) }
        await store.refresh()
        XCTAssertEqual(store.choices.count, 2)
    }

    func testPublishedListCannotOutliveItsFirstPermissionCheck() async {
        var now = Date()
        let (api, store, _, _) = harness(now: { now })
        api.onScoringRead = { _ in now = now.addingTimeInterval(12) }
        await store.refresh()
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(store.choices.isEmpty)
    }

    func testEnvironmentFailureRequestsReattestationAndExposesNoChoices() async {
        let (api, store, _, _) = harness()
        var calls = 0
        store.setAuthorityRevalidationHandler { calls += 1 }
        api.readError = MobileAPIClientError.server(code: .mobileAPIUnavailable, status: 503)
        await store.refresh()
        XCTAssertEqual(calls, 1); XCTAssertTrue(store.choices.isEmpty)
    }

    func testTransientCredentialFailureDoesNotSignOutOrUseStaleChoices() async {
        let (_, store, _, credentials) = harness()
        var invalidations = 0
        store.setAccessInvalidationHandler { invalidations += 1 }
        await store.refresh()
        credentials.error = MobileReadCredentialError.authSessionUnavailable
        await store.refresh()
        XCTAssertEqual(store.phase, .unavailable); XCTAssertTrue(store.choices.isEmpty)
        XCTAssertEqual(invalidations, 0)
    }

    func testMovingWallClockBackwardCannotExtendPermissionChoiceLifetime() async {
        let api = API(), activity = NativeApplicationActivity(isActive: true)
        var date = Date(), elapsed: TimeInterval = 100
        let store = ScoreMatchSelectionStore(api: api, credentials: ScoreMatchSelectionFixtureCredentials(), activity: activity,
                                             now: { date }, uptime: { elapsed })
        store.activate(identity: .init(authUserId: API.authID, playerId: api.playerID, tournamentId: api.tournamentID))
        await store.refresh()
        date = date.addingTimeInterval(-3_600); elapsed += 31
        store.expireIfNeeded()
        XCTAssertEqual(store.phase, .expired); XCTAssertTrue(store.choices.isEmpty)
    }
}
