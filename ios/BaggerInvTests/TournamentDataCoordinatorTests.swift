import XCTest
@testable import BaggerInv

@MainActor
final class TournamentDataCoordinatorTests: XCTestCase {
    func testActivationLoadsAllFourProductsWithoutRepeatingSessionResolution() async throws {
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
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        XCTAssertEqual(api.readCallCount, 4)
        XCTAssertEqual(api.participantCallCount, 0)
        let cacheByteCount = await coordinator.activeCacheByteCount()
        XCTAssertGreaterThan(try XCTUnwrap(cacheByteCount), 0)
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
        XCTAssertEqual(api.readCallCount, 4)

        await coordinator.suspendForEnvironmentReattestation()

        XCTAssertEqual(coordinator.today.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(coordinator.matches.state.value, TestFixtures.matchesResponse.data)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        let retainedBytes = await cache.totalStoredByteCount()
        XCTAssertGreaterThan(retainedBytes, 0)

        await coordinator.resumeAfterEnvironmentReattestation()

        XCTAssertEqual(coordinator.today.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(coordinator.matches.state.value, TestFixtures.matchesResponse.data)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        XCTAssertEqual(api.readCallCount, 4, "Resume must not loop the failing request automatically.")

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
        XCTAssertEqual(api.readCallCount, 4)
        let writesBeforeSuspension = await cache.totalWriteCount()

        api.suspendNextReadBatch()
        let refresh = Task { @MainActor in await coordinator.refreshAll() }
        for _ in 0..<1_000 where api.suspendedReadCount < 4 {
            await Task.yield()
        }
        XCTAssertEqual(api.suspendedReadCount, 4)

        let suspension = Task { @MainActor in
            await coordinator.suspendForEnvironmentReattestation()
        }
        for _ in 0..<1_000 where api.cancellationRequestCount < 4 {
            await Task.yield()
        }
        XCTAssertEqual(api.cancellationRequestCount, 4)
        api.releaseSuspendedReads()
        await suspension.value
        await refresh.value

        let writesAfterSuspension = await cache.totalWriteCount()
        XCTAssertEqual(writesAfterSuspension, writesBeforeSuspension)
        XCTAssertEqual(coordinator.today.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(coordinator.matches.state.value, TestFixtures.matchesResponse.data)
        XCTAssertEqual(coordinator.leaders.state.value, TestFixtures.leadersResponse.data)
        XCTAssertEqual(coordinator.schedule.state.value, TestFixtures.scheduleResponse.data)
        XCTAssertFalse(coordinator.today.state.isRefreshing)
        XCTAssertFalse(coordinator.matches.state.isRefreshing)
        XCTAssertFalse(coordinator.leaders.state.isRefreshing)
        XCTAssertFalse(coordinator.schedule.state.isRefreshing)

        await coordinator.resumeAfterEnvironmentReattestation()
        await coordinator.refreshAll()

        XCTAssertEqual(api.readCallCount, 12)
        let writesAfterResume = await cache.totalWriteCount()
        XCTAssertEqual(writesAfterResume, writesBeforeSuspension + 4)
        XCTAssertEqual(coordinator.today.state.freshness, .fresh)
        XCTAssertEqual(coordinator.matches.state.freshness, .fresh)
        XCTAssertEqual(coordinator.leaders.state.freshness, .fresh)
        XCTAssertEqual(coordinator.schedule.state.freshness, .fresh)
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
        XCTAssertEqual(api.readCallCount, 4)
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

    func schedule(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileScheduleResponse> {
        await suspendReadIfRequested()
        return .modified(TestFixtures.scheduleResponse, etag: "\"fixture-revision-1\"")
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
