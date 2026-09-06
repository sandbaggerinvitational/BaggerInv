import XCTest
@testable import BaggerInv

@MainActor
final class ScoreMatchSelectionIntegrationTests: XCTestCase {
    func testSelectionUsesExistingFreshScoringStoreAndLeavesQueuedMatchPartitionsUntouched() async throws {
        let api = ScoreMatchSelectionFixtureAPI()
        let identity = ScoringQueueIdentityPartition(authUserId: ScoreMatchSelectionFixtureAPI.authID,
                                                    playerId: api.playerID, tournamentId: api.tournamentID)
        let records = [
            CoordinatorQueueFixtures.record(matchId: ScoreMatchSelectionFixtureAPI.bb, sequence: 1, identity: identity),
            CoordinatorQueueFixtures.record(matchId: ScoreMatchSelectionFixtureAPI.sc, sequence: 2, identity: identity)
        ]
        let queue = InMemoryScoringQueueRepository(records: records)
        let cache = SelectionReadCache()
        let activity = NativeApplicationActivity(isActive: false)
        let coordinator = TournamentDataCoordinator(api: api, credentialProvider: ScoreMatchSelectionFixtureCredentials(),
            cache: cache, scoringQueueRepository: queue, applicationActivity: activity, now: { CoordinatorQueueFixtures.now })
        await coordinator.activate(authUserID: identity.authUserId, participant: participant(api))
        activity.update(isActive: true)
        await coordinator.scoring.refresh()
        let before = await queue.snapshot()
        await coordinator.scoreMatchSelection.refresh()
        try await coordinator.selectScoreMatch(ScoreMatchSelectionFixtureAPI.sc)
        XCTAssertEqual(coordinator.scoring.state.phase, .ready)
        XCTAssertEqual(coordinator.scoring.state.scoring?.match.matchId, ScoreMatchSelectionFixtureAPI.sc)
        XCTAssertEqual(Array(api.scoringIDs.suffix(2)), [ScoreMatchSelectionFixtureAPI.sc, ScoreMatchSelectionFixtureAPI.sc])
        let after = await queue.snapshot()
        XCTAssertEqual(after, before)
        XCTAssertEqual(Set(after.map(\.partition.matchId)), Set([ScoreMatchSelectionFixtureAPI.bb, ScoreMatchSelectionFixtureAPI.sc]))
        let cacheWrites = await cache.writes
        XCTAssertEqual(cacheWrites, 0, "Picker authorization must not be persisted in the read cache.")
        let saveCalls = await queue.saveCalls
        XCTAssertEqual(saveCalls, 0)
        await coordinator.deactivate(deleteCache: false)
    }

    func testRevocationOnFinalCanonicalReadCannotLeaveWritableSelectedState() async throws {
        let api = ScoreMatchSelectionFixtureAPI(), activity = NativeApplicationActivity(isActive: false)
        let coordinator = TournamentDataCoordinator(api: api, credentialProvider: ScoreMatchSelectionFixtureCredentials(),
                                                    cache: SelectionReadCache(), applicationActivity: activity)
        await coordinator.activate(authUserID: ScoreMatchSelectionFixtureAPI.authID, participant: participant(api))
        activity.update(isActive: true)
        await coordinator.scoring.refresh()
        await coordinator.scoreMatchSelection.refresh()
        api.onScoringRead = { id in
            if id == ScoreMatchSelectionFixtureAPI.sc && api.scoringIDs.filter({ $0 == id }).count == 3 {
                api.scoringErrors[id] = MobileAPIClientError.server(code: .scoringNotAuthorized, status: 403)
            }
        }
        do { try await coordinator.selectScoreMatch(ScoreMatchSelectionFixtureAPI.sc); XCTFail("Revoked") } catch {}
        XCTAssertEqual(coordinator.scoring.state.phase, .authorizationRequired)
        XCTAssertNil(coordinator.scoring.state.scoring)
        XCTAssertFalse(ScoringPresenter.make(state: coordinator.scoring.state).canCreateDurableIntent)
        await coordinator.deactivate(deleteCache: false)
    }

    func testBackgroundLifecycleInvalidatesChoicesBeforeSelectionCanContinue() async {
        let api = ScoreMatchSelectionFixtureAPI(), activity = NativeApplicationActivity(isActive: false)
        let coordinator = TournamentDataCoordinator(api: api, credentialProvider: ScoreMatchSelectionFixtureCredentials(),
                                                    cache: SelectionReadCache(), applicationActivity: activity)
        await coordinator.activate(authUserID: ScoreMatchSelectionFixtureAPI.authID, participant: participant(api))
        activity.update(isActive: true)
        await coordinator.scoreMatchSelection.refresh()
        XCTAssertEqual(coordinator.scoreMatchSelection.choices.count, 2)
        coordinator.prepareForApplicationInactivity()
        XCTAssertTrue(coordinator.scoreMatchSelection.choices.isEmpty)
        do { try await coordinator.selectScoreMatch(ScoreMatchSelectionFixtureAPI.sc); XCTFail("Requires new verification") } catch {}
        await coordinator.deactivate(deleteCache: false)
    }

    private func participant(_ api: ScoreMatchSelectionFixtureAPI) -> ParticipantSession {
        .init(player: .init(playerId: api.playerID, displayName: "Fixture golfer", team: .init(teamId: "fixture-team", name: "Fixture")),
              tournament: .init(tournamentId: api.tournamentID, name: "Fixture tournament", year: 2026))
    }
}

private actor SelectionReadCache: ReadCacheStoring {
    private(set) var writes = 0
    func read(product: MobileReadProduct, partition: ReadCachePartition) -> Data? { nil }
    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) { writes += 1 }
    func remove(product: MobileReadProduct, partition: ReadCachePartition) {}
    func remove(partition: ReadCachePartition) {}
    func byteCount(partition: ReadCachePartition) -> Int { 0 }
}
