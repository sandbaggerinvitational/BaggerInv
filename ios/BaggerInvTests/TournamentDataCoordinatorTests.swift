import XCTest
@testable import BaggerInv

@MainActor
final class TournamentDataCoordinatorTests: XCTestCase {
    func testActivationLoadsAllSixProductsWithoutRepeatingSessionResolution() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)

        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()

        XCTAssertEqual(coordinator.today.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(coordinator.matches.state.value, TestFixtures.matchesResponse.data)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.netSkins.state.value, TestFixtures.netSkinsResponse.data)
        XCTAssertEqual(coordinator.calcutta.state.value, TestFixtures.calcuttaResponse.data)
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        XCTAssertEqual(api.readCallCount, 6)
        XCTAssertEqual(api.participantCallCount, 0)
        let cacheByteCount = await coordinator.activeCacheByteCount()
        XCTAssertGreaterThan(try XCTUnwrap(cacheByteCount), 0)
    }

    func testTodaySurfaceRefreshKeepsOptionalLeadersProductsLazy() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )

        await coordinator.refreshTodaySurface()

        XCTAssertEqual(api.readCallCount, 4)
        XCTAssertEqual(coordinator.today.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(coordinator.matches.state.value, TestFixtures.matchesResponse.data)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        XCTAssertEqual(coordinator.netSkins.state, .empty)
        XCTAssertEqual(coordinator.calcutta.state, .empty)
    }

    func testHistoryDetailCacheAndNetworkStayLazyUntilOneValidatedYearIsRequested() async throws {
        let cache = LazyHistoryCoordinatorCache()
        let api = MockMobileAPI()
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )

        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )

        let startupReads = await cache.recordedReadFilenames()
        XCTAssertTrue(startupReads.allSatisfy {
            !["passport.json", "guide.json", "history.json", "records.json", "odds.json"].contains($0)
        })
        let activationHistoryReads = await cache.historyDetailReadYears()
        XCTAssertEqual(activationHistoryReads, [])
        XCTAssertEqual(api.historyDetailCallYears, [])

        await coordinator.loadHistoryDetail(year: 2025)

        let requestedHistoryReads = await cache.historyDetailReadYears()
        XCTAssertEqual(requestedHistoryReads, [2025])
        XCTAssertEqual(api.historyDetailCallYears, [2025])
        XCTAssertEqual(coordinator.historyDetails[2025]?.state.value, TestFixtures.historyDetailResponse.data)
        XCTAssertEqual(coordinator.historyDetails[2024]?.state, .empty)

        await coordinator.loadHistoryDetail(year: 2016)
        let invalidYearHistoryReads = await cache.historyDetailReadYears()
        XCTAssertEqual(invalidYearHistoryReads, [2025])
        XCTAssertEqual(api.historyDetailCallYears, [2025])
    }

    func testRelaunchRevalidatesRecentGuideCacheButSequentialDestinationsShareRequest() async throws {
        let cache = LazyHistoryCoordinatorCache()
        let seedAPI = MockMobileAPI()
        let seed = TournamentDataCoordinator(
            api: seedAPI,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await seed.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        XCTAssertEqual(seed.guide.state, .empty)
        XCTAssertEqual(seedAPI.guideCallCount, 0)

        await seed.refreshGuide()
        XCTAssertEqual(seed.guide.state.value, TestFixtures.guideResponse.data)
        XCTAssertEqual(seed.guide.state.source, .network)
        XCTAssertEqual(seedAPI.guideCallCount, 1)
        await seed.deactivate(deleteCache: false)

        let revalidationAPI = MockMobileAPI()
        revalidationAPI.guideValue = .notModified(etag: "\"guide-revision-1\"")
        let restored = TournamentDataCoordinator(
            api: revalidationAPI,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now.addingTimeInterval(60) }
        )
        await restored.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        XCTAssertEqual(restored.guide.state, .empty)
        XCTAssertEqual(revalidationAPI.guideCallCount, 0)

        await restored.loadGuide()

        XCTAssertEqual(restored.guide.state.value, TestFixtures.guideResponse.data)
        XCTAssertEqual(restored.guide.state.source, .diskCache)
        XCTAssertEqual(restored.guide.state.freshness, .fresh)
        XCTAssertEqual(revalidationAPI.guideCallCount, 1)

        await restored.loadGuide()
        XCTAssertEqual(revalidationAPI.guideCallCount, 1, "Sequential Guide destinations duplicated one representation request")
    }

    func testForegroundRevalidatesVisitedMoreAndHistoryYearButNotUnvisitedProducts() async throws {
        let cache = LazyHistoryCoordinatorCache()
        let api = MockMobileAPI()
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )

        await coordinator.refreshForForeground()
        XCTAssertEqual(api.guideCallCount, 0)
        XCTAssertEqual(api.historyDetailCallYears, [])

        await coordinator.loadGuide()
        await coordinator.loadHistoryDetail(year: 2025)
        XCTAssertEqual(api.guideCallCount, 1)
        XCTAssertEqual(api.historyDetailCallYears, [2025])

        await coordinator.refreshForForeground()

        XCTAssertEqual(api.guideCallCount, 2)
        XCTAssertEqual(api.historyDetailCallYears, [2025, 2025])
        XCTAssertEqual(coordinator.records.state, .empty)
        XCTAssertEqual(coordinator.odds.state, .empty)
        XCTAssertEqual(coordinator.historyDetails[2024]?.state, .empty)
        let readFilenames = await cache.recordedReadFilenames()
        XCTAssertFalse(readFilenames.contains("records.json"))
        XCTAssertFalse(readFilenames.contains("odds.json"))
        XCTAssertFalse(readFilenames.contains("historyDetail-2024.json"))
    }

    func testConcurrentScoreAndPlayersRefreshesShareOneLeadersRequest() async throws {
        let cache = CoordinatorMemoryCache()
        let api = SuspendedLeadersMobileAPI()
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )

        let scoreRefresh = Task { @MainActor in await coordinator.leaders.refresh() }
        for _ in 0..<1_000 where !api.isLeadersRequestSuspended {
            await Task.yield()
        }
        XCTAssertTrue(api.isLeadersRequestSuspended)
        let playersRefresh = Task { @MainActor in await coordinator.leaders.refresh() }
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(api.leadersCallCount, 1)

        api.releaseLeadersRequest()
        await scoreRefresh.value
        await playersRefresh.value

        XCTAssertEqual(api.leadersCallCount, 1)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.leaders.state.freshness, .fresh)
    }

    func testChangedLeadersResponseAtomicallyUpdatesAndReloadsTheSharedRepresentation() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let initial = leadersResponse(
            revision: "leaders-atomic-1",
            overallPoints: (4, 3),
            roundStatus: .inProgress,
            roundPoints: (2.5, 1.5),
            playerPoints: (3, 2)
        )
        let changed = leadersResponse(
            revision: "leaders-atomic-2",
            overallPoints: (8.5, 7.5),
            roundStatus: .final,
            roundPoints: (3.5, 2.5),
            playerPoints: (5, 4.5)
        )
        api.leadersValue = .modified(initial, etag: #""leaders-atomic-1""#)
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )

        await coordinator.leaders.refresh()

        XCTAssertEqual(coordinator.leaders.state.value, initial.data)
        XCTAssertEqual(coordinator.leaders.state.revision, initial.meta.revision)
        let initialEntryCount = await cache.storedEntryCount()
        XCTAssertEqual(initialEntryCount, 1)

        api.leadersValue = .modified(changed, etag: #""leaders-atomic-2""#)
        await coordinator.leaders.refresh()

        let updated = try XCTUnwrap(coordinator.leaders.state.value)
        XCTAssertEqual(updated, changed.data)
        XCTAssertEqual(updated.teamStandings, changed.data.teamStandings)
        XCTAssertEqual(updated.roundStandings, changed.data.roundStandings)
        XCTAssertEqual(updated.playerStandings, changed.data.playerStandings)
        XCTAssertEqual(coordinator.leaders.state.revision, changed.meta.revision)
        XCTAssertEqual(coordinator.leaders.state.source, .network)
        XCTAssertEqual(coordinator.leaders.state.freshness, .fresh)
        XCTAssertEqual(api.leadersCallCount, 2)
        let updatedEntryCount = await cache.storedEntryCount()
        XCTAssertEqual(updatedEntryCount, 1, "The shared /leaders representation split across cache records.")

        let reloadedAPI = MockMobileAPI()
        let reloaded = TournamentDataCoordinator(
            api: reloadedAPI,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await reloaded.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )

        let restored = try XCTUnwrap(reloaded.leaders.state.value)
        XCTAssertEqual(restored, changed.data)
        XCTAssertEqual(restored.teamStandings, changed.data.teamStandings)
        XCTAssertEqual(restored.roundStandings, changed.data.roundStandings)
        XCTAssertEqual(restored.playerStandings, changed.data.playerStandings)
        XCTAssertEqual(reloaded.leaders.state.revision, changed.meta.revision)
        XCTAssertEqual(reloaded.leaders.state.source, .diskCache)
        XCTAssertEqual(reloaded.leaders.state.freshness, .cached)
        XCTAssertEqual(reloadedAPI.readCallCount, 0)
    }

    func testDeactivationCancelsReadsClearsMemoryAndDeletesActivePartition() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()

        await coordinator.deactivate(deleteCache: true)

        XCTAssertEqual(coordinator.today.state, .empty)
        XCTAssertEqual(coordinator.matches.state, .empty)
        XCTAssertEqual(coordinator.leaders.state, .empty)
        XCTAssertEqual(coordinator.netSkins.state, .empty)
        XCTAssertEqual(coordinator.calcutta.state, .empty)
        XCTAssertEqual(coordinator.schedule.state, .empty)
        XCTAssertEqual(coordinator.scoring.state, .idle)
        let removalCount = await cache.partitionRemovalCount()
        let byteCount = await cache.totalStoredByteCount()
        XCTAssertEqual(removalCount, 1)
        XCTAssertEqual(byteCount, 0)
    }

    func testAccountSwitchUsesDifferentPartitionAndDeletesPreviousData() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()
        let firstDigests = await cache.partitionDigests()

        await coordinator.activate(
            authUserID: "different-auth-user",
            participant: TestFixtures.participant
        )

        let secondDigests = await cache.partitionDigests()
        XCTAssertTrue(firstDigests.isDisjoint(with: secondDigests))
        let removalCount = await cache.partitionRemovalCount()
        XCTAssertEqual(removalCount, 1)
    }

    func testEnvironmentReattestationSuspendsReadsAndRehydratesOnlyAfterResume() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()
        XCTAssertEqual(api.readCallCount, 6)

        await coordinator.suspendForEnvironmentReattestation()

        XCTAssertEqual(coordinator.today.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(coordinator.matches.state.value, TestFixtures.matchesResponse.data)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.netSkins.state.value, TestFixtures.netSkinsResponse.data)
        XCTAssertEqual(coordinator.calcutta.state.value, TestFixtures.calcuttaResponse.data)
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        let retainedBytes = await cache.totalStoredByteCount()
        XCTAssertGreaterThan(retainedBytes, 0)

        await coordinator.resumeAfterEnvironmentReattestation()

        XCTAssertEqual(coordinator.today.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(coordinator.matches.state.value, TestFixtures.matchesResponse.data)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.netSkins.state.value, TestFixtures.netSkinsResponse.data)
        XCTAssertEqual(coordinator.calcutta.state.value, TestFixtures.calcuttaResponse.data)
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        XCTAssertEqual(api.readCallCount, 6, "Resume must not loop the failing request automatically.")

        await coordinator.deactivate(deleteCache: true)
        let deletedBytes = await cache.totalStoredByteCount()
        XCTAssertEqual(deletedBytes, 0)
    }

    func testEnvironmentReattestationHidesAndRestoresPreviouslyActiveScoringReader() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()
        let cacheWritesBeforeScoring = await cache.totalWriteCount()

        await coordinator.scoring.refresh()
        XCTAssertEqual(coordinator.scoring.state.phase, .ready)
        XCTAssertEqual(api.scoringCallCount, 1)
        let cacheWritesAfterScoring = await cache.totalWriteCount()
        XCTAssertEqual(
            cacheWritesAfterScoring,
            cacheWritesBeforeScoring,
            "The no-store scoring reader must never persist into the Step 2B read cache."
        )

        await coordinator.suspendForEnvironmentReattestation()
        XCTAssertEqual(coordinator.scoring.state, .idle)

        await coordinator.resumeAfterEnvironmentReattestation()
        XCTAssertEqual(coordinator.scoring.state.phase, .ready)
        XCTAssertEqual(api.scoringCallCount, 2)
    }

    func testEnvironmentSuspensionCancelsEveryInFlightReadAndPreventsLateCachePublication() async throws {
        let cache = CoordinatorMemoryCache()
        let api = SuspendingReadMobileAPI()
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            now: { TestFixtures.now }
        )
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()
        XCTAssertEqual(api.readCallCount, 6)
        let writesBeforeSuspension = await cache.totalWriteCount()

        api.suspendNextReadBatch()
        let refresh = Task { @MainActor in await coordinator.refreshAll() }
        for _ in 0..<1_000 where api.suspendedReadCount < 6 {
            await Task.yield()
        }
        XCTAssertEqual(api.suspendedReadCount, 6)

        let suspension = Task { @MainActor in
            await coordinator.suspendForEnvironmentReattestation()
        }
        for _ in 0..<1_000 where api.cancellationRequestCount < 6 {
            await Task.yield()
        }
        XCTAssertEqual(api.cancellationRequestCount, 6)
        api.releaseSuspendedReads()
        await suspension.value
        await refresh.value

        let writesAfterSuspension = await cache.totalWriteCount()
        XCTAssertEqual(writesAfterSuspension, writesBeforeSuspension)
        XCTAssertEqual(coordinator.today.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(coordinator.matches.state.value, TestFixtures.matchesResponse.data)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.netSkins.state.value, TestFixtures.netSkinsResponse.data)
        XCTAssertEqual(coordinator.calcutta.state.value, TestFixtures.calcuttaResponse.data)
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        XCTAssertFalse(coordinator.today.state.isRefreshing)
        XCTAssertFalse(coordinator.matches.state.isRefreshing)
        XCTAssertFalse(coordinator.leaders.state.isRefreshing)
        XCTAssertFalse(coordinator.netSkins.state.isRefreshing)
        XCTAssertFalse(coordinator.calcutta.state.isRefreshing)
        XCTAssertFalse(coordinator.schedule.state.isRefreshing)

        await coordinator.resumeAfterEnvironmentReattestation()
        await coordinator.refreshAll()

        XCTAssertEqual(api.readCallCount, 18)
        let writesAfterResume = await cache.totalWriteCount()
        XCTAssertEqual(writesAfterResume, writesBeforeSuspension + 6)
        XCTAssertEqual(coordinator.today.state.freshness, .fresh)
        XCTAssertEqual(coordinator.matches.state.freshness, .fresh)
        XCTAssertEqual(coordinator.leaders.state.freshness, .fresh)
        XCTAssertEqual(coordinator.netSkins.state.freshness, .fresh)
        XCTAssertEqual(coordinator.calcutta.state.freshness, .fresh)
        XCTAssertEqual(coordinator.schedule.state.freshness, .fresh)
    }

    func testForegroundScoringRefreshDoesNotWaitForSuspendedLeadersProducts() async throws {
        let cache = CoordinatorMemoryCache()
        let api = SuspendingReadMobileAPI()
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.scoring.refresh()
        XCTAssertEqual(api.scoringCallCount, 1)

        api.suspendNextReadBatch()
        let foreground = Task { @MainActor in await coordinator.refreshForForeground() }
        for _ in 0..<1_000 where api.suspendedReadCount < 6 {
            await Task.yield()
        }
        XCTAssertEqual(api.suspendedReadCount, 6)
        for _ in 0..<1_000 where api.scoringCallCount < 2 {
            await Task.yield()
        }

        XCTAssertEqual(
            api.scoringCallCount,
            2,
            "Optional Leaders revalidation delayed the scoring-critical foreground refresh."
        )
        api.releaseSuspendedReads()
        await foreground.value
    }

    func testDeactivateWinsAgainstSuspendedActivationWithoutStaleRepositoryReactivation() async throws {
        let cache = CoordinatorMemoryCache()
        await cache.suspendNextRead()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        let activation = Task { @MainActor in
            await coordinator.activate(
                authUserID: TestFixtures.authSession.userID,
                participant: TestFixtures.participant
            )
        }
        for _ in 0..<1_000 where !(await cache.hasSuspendedRead()) {
            await Task.yield()
        }
        let didSuspendRead = await cache.hasSuspendedRead()
        XCTAssertTrue(didSuspendRead)

        await coordinator.deactivate(deleteCache: true)
        await cache.releaseSuspendedRead()
        await activation.value
        await coordinator.refreshAll()

        XCTAssertEqual(coordinator.today.state, .empty)
        XCTAssertEqual(coordinator.matches.state, .empty)
        XCTAssertEqual(coordinator.leaders.state, .empty)
        XCTAssertEqual(coordinator.netSkins.state, .empty)
        XCTAssertEqual(coordinator.calcutta.state, .empty)
        XCTAssertEqual(coordinator.schedule.state, .empty)
        XCTAssertEqual(api.readCallCount, 0)
    }

    func testCacheCleanupRetriesOnceAndSurfacesOnlyPersistentFailure() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()
        await cache.failNextPartitionRemovals(1)

        await coordinator.deactivate(deleteCache: true)

        let removalAttempts = await cache.partitionRemovalAttempts()
        let retainedBytes = await cache.totalStoredByteCount()
        XCTAssertEqual(removalAttempts, 2)
        XCTAssertEqual(retainedBytes, 0)
        XCTAssertFalse(coordinator.cacheCleanupIssue)
    }

    func testPersistentCacheCleanupFailureRemainsInaccessibleAndRetriesNextActivation() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()
        await cache.failNextPartitionRemovals(2)

        await coordinator.deactivate(deleteCache: true)

        XCTAssertTrue(coordinator.cacheCleanupIssue)
        XCTAssertEqual(coordinator.today.state, .empty)
        let retainedBytes = await cache.totalStoredByteCount()
        XCTAssertGreaterThan(retainedBytes, 0)

        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )

        XCTAssertFalse(coordinator.cacheCleanupIssue)
        let deletedBytes = await cache.totalStoredByteCount()
        XCTAssertEqual(deletedBytes, 0)
    }

    func testRepeatedPersistentCleanupFailureReportsEveryRefusedActivation() async throws {
        let cache = CoordinatorMemoryCache()
        let api = MockMobileAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        var invalidationCount = 0
        coordinator.setAccessInvalidationHandler { invalidationCount += 1 }
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.refreshAll()
        await cache.failNextPartitionRemovals(6)
        await coordinator.deactivate(deleteCache: true)

        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )

        XCTAssertEqual(invalidationCount, 2)
        XCTAssertTrue(coordinator.cacheCleanupIssue)
        XCTAssertEqual(coordinator.today.state, .empty)
        XCTAssertEqual(api.readCallCount, 6)
    }

    private func makeCoordinator(
        api: MockMobileAPI,
        cache: CoordinatorMemoryCache
    ) -> TournamentDataCoordinator {
        return TournamentDataCoordinator(
            api: api,
            credentialProvider: CoordinatorCredentialProvider(),
            cache: cache,
            now: { TestFixtures.now }
        )
    }

    private func leadersResponse(
        revision: String,
        overallPoints: (Double, Double),
        roundStatus: MobileRoundStandingStatus,
        roundPoints: (Double, Double),
        playerPoints: (Double, Double)
    ) -> MobileLeadersResponse {
        let previewTeam = MobileReadTeam(teamId: "team-preview-1", name: "Preview Team")
        let otherTeam = MobileReadTeam(teamId: "team-preview-2", name: "Other Team")
        return MobileLeadersResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileLeadersData(
                tournament: TestFixtures.readTournament,
                teamStandings: [
                    MobileTeamStanding(
                        rank: 1,
                        teamId: "team-preview-1",
                        name: previewTeam.name,
                        points: overallPoints.0,
                        record: "4-1-0",
                        remainingMatches: 1
                    ),
                    MobileTeamStanding(
                        rank: 2,
                        teamId: "team-preview-2",
                        name: otherTeam.name,
                        points: overallPoints.1,
                        record: "3-2-0",
                        remainingMatches: 1
                    ),
                ],
                roundStandings: [
                    MobileRoundStanding(
                        roundNumber: 2,
                        roundName: "Second Round",
                        status: roundStatus,
                        teamStandings: [
                            MobileTeamStanding(
                                rank: 1,
                                teamId: "team-preview-1",
                                name: previewTeam.name,
                                points: roundPoints.0,
                                record: "2-0-0",
                                remainingMatches: 0
                            ),
                            MobileTeamStanding(
                                rank: 2,
                                teamId: "team-preview-2",
                                name: otherTeam.name,
                                points: roundPoints.1,
                                record: "0-2-0",
                                remainingMatches: 0
                            ),
                        ]
                    ),
                ],
                playerStandings: [
                    MobilePlayerStanding(
                        rank: 1,
                        playerId: TestFixtures.participant.player.playerId,
                        displayName: TestFixtures.participant.player.displayName,
                        team: previewTeam,
                        points: playerPoints.0,
                        record: "3-0-0"
                    ),
                    MobilePlayerStanding(
                        rank: 2,
                        playerId: "player-preview-2",
                        displayName: "Other Golfer",
                        team: otherTeam,
                        points: playerPoints.1,
                        record: "2-1-0"
                    ),
                ]
            ),
            meta: MobileReadMeta(
                generatedAt: TestFixtures.readMeta.generatedAt,
                revision: revision
            )
        )
    }
}

@MainActor
private final class CoordinatorCredentialProvider: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: TestFixtures.authSession.accessToken,
            certification: TestFixtures.certificationToken
        )
    }
}

private actor LazyHistoryCoordinatorCache: ReadCacheStoring {
    private var values: [String: Data] = [:]
    private var detailReadYears: [Int] = []
    private var readFilenames: [String] = []

    func read(product: MobileReadProduct, partition: ReadCachePartition) throws -> Data? {
        guard product != .historyDetail else { throw ReadCacheError.invalidCacheKey }
        return values[storageKey(filename: "\(product.rawValue).json", partition: partition)]
    }

    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) throws {
        guard product != .historyDetail else { throw ReadCacheError.invalidCacheKey }
        values[storageKey(filename: "\(product.rawValue).json", partition: partition)] = data
    }

    func remove(product: MobileReadProduct, partition: ReadCachePartition) throws {
        guard product != .historyDetail else { throw ReadCacheError.invalidCacheKey }
        values.removeValue(forKey: storageKey(filename: "\(product.rawValue).json", partition: partition))
    }

    func read(key: MobileReadCacheKey, partition: ReadCachePartition) -> Data? {
        readFilenames.append(key.filename)
        if let year = key.historyYear { detailReadYears.append(year) }
        return values[storageKey(filename: key.filename, partition: partition)]
    }

    func write(_ data: Data, key: MobileReadCacheKey, partition: ReadCachePartition) {
        values[storageKey(filename: key.filename, partition: partition)] = data
    }

    func remove(key: MobileReadCacheKey, partition: ReadCachePartition) {
        values.removeValue(forKey: storageKey(filename: key.filename, partition: partition))
    }

    func remove(partition: ReadCachePartition) {
        let prefix = "\(partition.digest)|"
        values = values.filter { !$0.key.hasPrefix(prefix) }
    }

    func byteCount(partition: ReadCachePartition) -> Int {
        let prefix = "\(partition.digest)|"
        return values.filter { $0.key.hasPrefix(prefix) }.values.reduce(0) { $0 + $1.count }
    }

    func historyDetailReadYears() -> [Int] { detailReadYears }
    func recordedReadFilenames() -> [String] { readFilenames }

    private func storageKey(filename: String, partition: ReadCachePartition) -> String {
        "\(partition.digest)|\(filename)"
    }
}

private actor CoordinatorMemoryCache: ReadCacheStoring {
    private var values: [String: Data] = [:]
    private var writeCount = 0
    private var removedPartitions = 0
    private var partitionRemovalAttemptCount = 0
    private var partitionRemovalFailuresRemaining = 0
    private var shouldSuspendNextRead = false
    private var readSuspended = false
    private var readContinuation: CheckedContinuation<Void, Never>?

    func read(product: MobileReadProduct, partition: ReadCachePartition) async -> Data? {
        if shouldSuspendNextRead {
            shouldSuspendNextRead = false
            readSuspended = true
            await withCheckedContinuation { continuation in
                readContinuation = continuation
            }
            readSuspended = false
        }
        return values[key(product: product, partition: partition)]
    }

    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) {
        writeCount += 1
        values[key(product: product, partition: partition)] = data
    }

    func remove(product: MobileReadProduct, partition: ReadCachePartition) {
        values.removeValue(forKey: key(product: product, partition: partition))
    }

    func remove(partition: ReadCachePartition) throws {
        partitionRemovalAttemptCount += 1
        if partitionRemovalFailuresRemaining > 0 {
            partitionRemovalFailuresRemaining -= 1
            throw CoordinatorCacheError.plannedRemovalFailure
        }
        removedPartitions += 1
        let prefix = "\(partition.digest)|"
        values = values.filter { !$0.key.hasPrefix(prefix) }
    }

    func byteCount(partition: ReadCachePartition) -> Int {
        let prefix = "\(partition.digest)|"
        return values.filter { $0.key.hasPrefix(prefix) }.values.reduce(0) { $0 + $1.count }
    }

    func partitionRemovalCount() -> Int { removedPartitions }
    func partitionRemovalAttempts() -> Int { partitionRemovalAttemptCount }
    func totalStoredByteCount() -> Int { values.values.reduce(0) { $0 + $1.count } }
    func totalWriteCount() -> Int { writeCount }
    func storedEntryCount() -> Int { values.count }

    func failNextPartitionRemovals(_ count: Int) {
        partitionRemovalFailuresRemaining = count
    }

    func suspendNextRead() {
        shouldSuspendNextRead = true
    }

    func hasSuspendedRead() -> Bool { readSuspended }

    func releaseSuspendedRead() {
        readContinuation?.resume()
        readContinuation = nil
    }

    func partitionDigests() -> Set<String> {
        Set(values.keys.compactMap { $0.split(separator: "|").first.map(String.init) })
    }

    private func key(product: MobileReadProduct, partition: ReadCachePartition) -> String {
        "\(partition.digest)|\(product.rawValue)"
    }
}

private enum CoordinatorCacheError: Error {
    case plannedRemovalFailure
}

@MainActor
private final class SuspendingReadMobileAPI: MobileAPIServing {
    private(set) var readCallCount = 0
    private(set) var scoringCallCount = 0
    private(set) var suspendedReadCount = 0
    private(set) var cancellationRequestCount = 0
    private var shouldSuspendReads = false
    private var suspendedContinuations: [CheckedContinuation<Void, Never>] = []

    func suspendNextReadBatch() {
        shouldSuspendReads = true
    }

    func releaseSuspendedReads() {
        shouldSuspendReads = false
        let continuations = suspendedContinuations
        suspendedContinuations.removeAll()
        continuations.forEach { $0.resume() }
    }

    func health() async throws -> MobileHealthResponse { TestFixtures.health }

    func requestOTP(identifier: String, captchaToken: String) async throws -> OTPRequestAcknowledgement {
        TestFixtures.otpAcknowledgement
    }

    func certify(challengeId: String, accessToken: String) async throws -> OTPCertificationAcknowledgement {
        TestFixtures.certificationAcknowledgement
    }

    func participantSession(accessToken: String, certification: String) async throws -> ParticipantSession {
        TestFixtures.participant
    }

    func today(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileTodayResponse> {
        await suspendReadIfRequested()
        return .modified(TestFixtures.todayResponse, etag: "\"fixture-revision-1\"")
    }

    func matches(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileMatchesResponse> {
        await suspendReadIfRequested()
        return .modified(TestFixtures.matchesResponse, etag: "\"fixture-revision-1\"")
    }

    func leaders(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileLeadersResponse> {
        await suspendReadIfRequested()
        return .modified(TestFixtures.leadersResponse, etag: "\"fixture-revision-1\"")
    }

    func netSkins(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileNetSkinsResponse> {
        await suspendReadIfRequested()
        return .modified(TestFixtures.netSkinsResponse, etag: "\"fixture-net-skins-revision-1\"")
    }

    func calcutta(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileCalcuttaResponse> {
        await suspendReadIfRequested()
        return .modified(TestFixtures.calcuttaResponse, etag: "\"fixture-calcutta-revision-1\"")
    }

    func schedule(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileScheduleResponse> {
        await suspendReadIfRequested()
        return .modified(TestFixtures.scheduleResponse, etag: "\"fixture-revision-1\"")
    }

    func scoringCurrent(
        accessToken: String,
        certification: String,
        matchID: String?
    ) async throws -> MobileScoringCurrentResponse {
        scoringCallCount += 1
        return TestFixtures.scoringResponse
    }

    private func suspendReadIfRequested() async {
        readCallCount += 1
        guard shouldSuspendReads else { return }
        suspendedReadCount += 1
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                suspendedContinuations.append(continuation)
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.cancellationRequestCount += 1
            }
        }
    }
}

@MainActor
private final class SuspendedLeadersMobileAPI: MobileAPIServing {
    private(set) var leadersCallCount = 0
    private(set) var isLeadersRequestSuspended = false
    private var leadersContinuation: CheckedContinuation<Void, Never>?

    func releaseLeadersRequest() {
        leadersContinuation?.resume()
        leadersContinuation = nil
        isLeadersRequestSuspended = false
    }

    func health() async throws -> MobileHealthResponse { TestFixtures.health }

    func requestOTP(identifier: String, captchaToken: String) async throws -> OTPRequestAcknowledgement {
        TestFixtures.otpAcknowledgement
    }

    func certify(challengeId: String, accessToken: String) async throws -> OTPCertificationAcknowledgement {
        TestFixtures.certificationAcknowledgement
    }

    func participantSession(accessToken: String, certification: String) async throws -> ParticipantSession {
        TestFixtures.participant
    }

    func today(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileTodayResponse> {
        .modified(TestFixtures.todayResponse, etag: "\"fixture-revision-1\"")
    }

    func matches(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileMatchesResponse> {
        .modified(TestFixtures.matchesResponse, etag: "\"fixture-revision-1\"")
    }

    func leaders(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileLeadersResponse> {
        leadersCallCount += 1
        isLeadersRequestSuspended = true
        await withCheckedContinuation { continuation in
            leadersContinuation = continuation
        }
        return .modified(TestFixtures.leadersResponse, etag: "\"fixture-revision-1\"")
    }

    func schedule(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileScheduleResponse> {
        .modified(TestFixtures.scheduleResponse, etag: "\"fixture-revision-1\"")
    }
}
