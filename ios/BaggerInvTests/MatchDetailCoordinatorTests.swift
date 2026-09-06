import XCTest
@testable import BaggerInv

@MainActor
final class MatchDetailCoordinatorTests: XCTestCase {
    func testMatchDetailRepositoryIsLazyUntilExactMatchIsRequested() async throws {
        let cache = MatchDetailCoordinatorCache()
        let api = MatchDetailCoordinatorAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)

        await activate(coordinator)

        XCTAssertEqual(api.matchDetailRequests, [])
        let activationReads = await cache.matchDetailReadIDs()
        XCTAssertEqual(activationReads, [])

        let firstReference = try XCTUnwrap(
            coordinator.matchDetailRepository(matchID: "round-3:match.10")
        )
        let sameReference = try XCTUnwrap(
            coordinator.matchDetailRepository(matchID: "round-3:match.10")
        )
        XCTAssertTrue(firstReference === sameReference)
        XCTAssertEqual(api.matchDetailRequests, [])
        let constructionReads = await cache.matchDetailReadIDs()
        XCTAssertEqual(constructionReads, [])

        await coordinator.loadMatchDetail(matchID: "round-3:match.10")

        XCTAssertEqual(api.matchDetailRequests.map(\.matchID), ["round-3:match.10"])
        XCTAssertEqual(api.matchDetailRequests.first?.accessToken, TestFixtures.authSession.accessToken)
        XCTAssertEqual(api.matchDetailRequests.first?.certification, TestFixtures.certificationToken)
        let requestedReads = await cache.matchDetailReadIDs()
        XCTAssertEqual(requestedReads, ["round-3:match.10"])
        XCTAssertEqual(firstReference.state.value?.match.matchId, "round-3:match.10")
        XCTAssertEqual(firstReference.state.freshness, .fresh)
    }

    func testSwitchingMatchDetailDeactivatesPriorRepositoryWithoutPromotingOrPrefetchingNeighbors() async throws {
        let cache = MatchDetailCoordinatorCache()
        let api = MatchDetailCoordinatorAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await activate(coordinator)

        let first = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "match-canonical-2"))
        let second = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "match-canonical-10"))

        await coordinator.loadMatchDetail(matchID: "match-canonical-2")
        XCTAssertTrue(first.isActive)
        XCTAssertFalse(second.isActive)

        await coordinator.loadMatchDetail(matchID: "match-canonical-10")

        XCTAssertFalse(first.isActive)
        XCTAssertEqual(first.state, .empty)
        XCTAssertTrue(second.isActive)
        XCTAssertEqual(second.state.value?.match.matchId, "match-canonical-10")
        XCTAssertEqual(
            api.matchDetailRequests.map(\.matchID),
            ["match-canonical-2", "match-canonical-10"]
        )
        XCTAssertFalse(
            api.matchDetailRequests.map(\.matchID).contains("match-prev"),
            "Canonical navigation neighbors must remain lazy."
        )
        XCTAssertFalse(
            api.matchDetailRequests.map(\.matchID).contains("match-next"),
            "Canonical navigation neighbors must remain lazy."
        )
    }

    func testMatchDetailRejectsWrongTournamentAndWrongOwnedPlayerButAcceptsBoundedNonOwnedMatch() async throws {
        let cache = MatchDetailCoordinatorCache()
        let api = MatchDetailCoordinatorAPI()
        api.responses["wrong-tournament"] = .modified(
            MatchDetailFixtureFactory.response(
                matchID: "wrong-tournament",
                tournamentID: "other-tournament"
            ),
            etag: #""wrong-tournament""#
        )
        api.responses["wrong-player"] = .modified(
            MatchDetailFixtureFactory.response(
                matchID: "wrong-player",
                authenticatedPlayerID: "different-player"
            ),
            etag: #""wrong-player""#
        )
        api.responses["non-owned"] = .modified(
            MatchDetailFixtureFactory.response(
                matchID: "non-owned",
                authenticatedInvolved: false
            ),
            etag: #""non-owned""#
        )
        let coordinator = makeCoordinator(api: api, cache: cache)
        await activate(coordinator)

        await coordinator.loadMatchDetail(matchID: "wrong-tournament")
        let wrongTournament = try XCTUnwrap(
            coordinator.matchDetailRepository(matchID: "wrong-tournament")
        )
        XCTAssertNil(wrongTournament.state.value)
        XCTAssertEqual(wrongTournament.state.freshness, .failed)
        XCTAssertEqual(wrongTournament.state.lastSafeError, .contract)

        await coordinator.loadMatchDetail(matchID: "wrong-player")
        let wrongPlayer = try XCTUnwrap(
            coordinator.matchDetailRepository(matchID: "wrong-player")
        )
        XCTAssertNil(wrongPlayer.state.value)
        XCTAssertEqual(wrongPlayer.state.freshness, .failed)
        XCTAssertEqual(wrongPlayer.state.lastSafeError, .contract)

        await coordinator.loadMatchDetail(matchID: "non-owned")
        let nonOwned = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "non-owned"))
        XCTAssertEqual(nonOwned.state.value?.match.matchId, "non-owned")
        XCTAssertEqual(nonOwned.state.value?.match.authenticatedPlayer.involved, false)
        XCTAssertEqual(nonOwned.state.freshness, .fresh)

        let writtenIDs = await cache.matchDetailWriteIDs()
        XCTAssertEqual(writtenIDs, ["non-owned"])
    }

    func testForegroundRevalidationRefreshesOnlyTheActiveMatchDetail() async throws {
        let cache = MatchDetailCoordinatorCache()
        let api = MatchDetailCoordinatorAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await activate(coordinator)

        await coordinator.loadMatchDetail(matchID: "match-one")
        await coordinator.loadMatchDetail(matchID: "match-two")
        await coordinator.refreshForForeground()

        XCTAssertEqual(
            api.matchDetailRequests.map(\.matchID),
            ["match-one", "match-two", "match-two"]
        )
        let first = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "match-one"))
        let second = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "match-two"))
        XCTAssertFalse(first.isActive)
        XCTAssertTrue(second.isActive)
        XCTAssertEqual(second.state.freshness, .fresh)
    }

    func testLeavingAndReopeningSameMatchRendersCacheThenRevalidatesWithETag() async throws {
        let cache = MatchDetailCoordinatorCache()
        let api = MatchDetailCoordinatorAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await activate(coordinator)

        await coordinator.loadMatchDetail(matchID: "reopened-match")
        let repository = try XCTUnwrap(
            coordinator.matchDetailRepository(matchID: "reopened-match")
        )
        XCTAssertTrue(repository.isActive)
        XCTAssertEqual(repository.state.freshness, .fresh)

        coordinator.endViewingMatchDetail(matchID: "reopened-match")
        XCTAssertTrue(repository.isActive)
        XCTAssertEqual(repository.state.freshness, .fresh)
        await coordinator.refreshForForeground()
        XCTAssertEqual(
            api.matchDetailRequests.map(\.matchID),
            ["reopened-match"],
            "A cached but non-visible Match must not join foreground refresh fan-out."
        )

        await coordinator.loadMatchDetail(matchID: "reopened-match")

        XCTAssertTrue(repository.isActive)
        XCTAssertEqual(repository.state.freshness, .fresh)
        XCTAssertEqual(api.matchDetailRequests.map(\.matchID), ["reopened-match", "reopened-match"])
        XCTAssertEqual(
            api.matchDetailRequests.map(\.etag),
            [nil, #""match-detail-fixture""#]
        )
    }

    func testSignOutDeletesMatchReadPartitionWithoutChangingDurableScoringIntent() async throws {
        let cache = MatchDetailCoordinatorCache()
        let api = MatchDetailCoordinatorAPI()
        let identity = ScoringQueueIdentityPartition(
            authUserId: TestFixtures.authSession.userID,
            playerId: TestFixtures.participant.player.playerId,
            tournamentId: TestFixtures.participant.tournament.tournamentId
        )
        let queue = InMemoryScoringQueueRepository(records: [
            CoordinatorQueueFixtures.record(
                matchId: "durable-scoring-match",
                identity: identity
            ),
        ])
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: MatchDetailCoordinatorCredentialProvider(),
            cache: cache,
            scoringQueueRepository: queue,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        await activate(coordinator)
        await coordinator.loadMatchDetail(matchID: "viewed-match")
        let repository = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "viewed-match"))
        let queueBeforeSignOut = await queue.snapshot()
        let bytesBeforeSignOut = await cache.totalByteCount()
        XCTAssertGreaterThan(bytesBeforeSignOut, 0)

        await coordinator.deactivate(deleteCache: true)

        let queueAfterSignOut = await queue.snapshot()
        let bytesAfterSignOut = await cache.totalByteCount()
        let removals = await cache.partitionRemovalCount()
        XCTAssertEqual(repository.state, .empty)
        XCTAssertEqual(bytesAfterSignOut, 0)
        XCTAssertEqual(removals, 1)
        XCTAssertEqual(queueAfterSignOut, queueBeforeSignOut)
        XCTAssertEqual(queueAfterSignOut.map(\.localQueueRecordId), queueBeforeSignOut.map(\.localQueueRecordId))
    }

    func test404RevokesCoordinatorPresentationWithoutChangingOtherReadsOrScoringSQLite() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("MatchDetailScoringIsolation-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let databaseURL = root.appendingPathComponent("ScoringQueue/scoring-queue.sqlite3")
        let queue = try SQLiteScoringQueueRepository(databaseURL: databaseURL, now: { TestFixtures.now })
        let identity = ScoringQueueIdentityPartition(
            authUserId: TestFixtures.authSession.userID,
            playerId: TestFixtures.participant.player.playerId,
            tournamentId: TestFixtures.participant.tournament.tournamentId
        )
        _ = try await queue.save(CoordinatorQueueFixtures.input(
            partition: CoordinatorQueueFixtures.partition(matchId: "durable-scoring-match", identity: identity)
        ))
        let cache = MatchDetailCoordinatorCache()
        let api = MatchDetailCoordinatorAPI()
        let coordinator = TournamentDataCoordinator(
            api: api,
            credentialProvider: MatchDetailCoordinatorCredentialProvider(),
            cache: cache,
            scoringQueueRepository: queue,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
        var invalidations = 0
        coordinator.setAccessInvalidationHandler { invalidations += 1 }
        await activate(coordinator)
        await coordinator.matches.refresh()
        await coordinator.loadMatchDetail(matchID: "another-visible-match")
        await coordinator.loadMatchDetail(matchID: "withdrawn-match")
        let repository = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "withdrawn-match"))
        XCTAssertNotNil(repository.state.value)
        let partition = try ReadCachePartition(
            environment: "preview",
            authUserID: identity.authUserId,
            playerID: identity.playerId,
            tournamentID: identity.tournamentId
        )
        let otherKey = try MobileReadCacheKey(matchID: "another-visible-match")
        let otherBefore = try await cache.read(key: otherKey, partition: partition)
        let matchesBefore = coordinator.matches.state
        let matchesBytesBefore = try await cache.read(key: MobileReadCacheKey(product: .matches), partition: partition)
        let scoringBefore = try await queue.records(for: identity)
        let databaseBefore = try Data(contentsOf: databaseURL)
        let walURL = URL(fileURLWithPath: databaseURL.path + "-wal")
        let walBefore = try? Data(contentsOf: walURL)
        api.failures["withdrawn-match"] = .server(code: .matchNotFound, status: 404)

        await coordinator.refreshMatchDetail(matchID: "withdrawn-match")

        let sameRepository = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "withdrawn-match"))
        XCTAssertTrue(sameRepository === repository)
        XCTAssertNil(sameRepository.state.value)
        XCTAssertEqual(sameRepository.state.lastHTTPStatus, 404)
        let presentation = MatchDetailPresenter.make(state: sameRepository.state, requestedMatchID: "withdrawn-match")
        XCTAssertEqual(presentation.availability, .unavailable)
        XCTAssertNil(presentation.match)
        let otherAfter = try await cache.read(key: otherKey, partition: partition)
        let matchesBytesAfter = try await cache.read(key: MobileReadCacheKey(product: .matches), partition: partition)
        let removedData = try await cache.read(key: MobileReadCacheKey(matchID: "withdrawn-match"), partition: partition)
        let scoringAfter = try await queue.records(for: identity)
        let partitionRemovals = await cache.partitionRemovalCount()
        XCTAssertNil(removedData)
        XCTAssertNotNil(otherBefore)
        XCTAssertEqual(otherAfter, otherBefore)
        XCTAssertEqual(coordinator.matches.state, matchesBefore)
        XCTAssertEqual(matchesBytesAfter, matchesBytesBefore)
        XCTAssertEqual(scoringAfter, scoringBefore)
        XCTAssertEqual(try Data(contentsOf: databaseURL), databaseBefore)
        XCTAssertEqual(try? Data(contentsOf: walURL), walBefore)
        XCTAssertEqual(partitionRemovals, 0, "404 must not use the sign-out partition cleanup path.")
        XCTAssertEqual(invalidations, 0)

        coordinator.endViewingMatchDetail(matchID: "withdrawn-match")
        api.failures["withdrawn-match"] = .transportUnavailable
        await coordinator.loadMatchDetail(matchID: "withdrawn-match")
        XCTAssertNil(repository.state.value)
        XCTAssertNil(api.matchDetailRequests.last?.etag)
        await coordinator.loadMatchDetail(matchID: "another-visible-match")
        await coordinator.loadMatchDetail(matchID: "withdrawn-match")
        XCTAssertNil(repository.state.value, "Switching away and reopening must not resurrect the deleted Match.")
        await queue.close()
    }

    func testTransient503DoesNotBecomeAuthoritativeRevocationFromAnErrorCodeAlone() async throws {
        let cache = MatchDetailCoordinatorCache()
        let api = MatchDetailCoordinatorAPI()
        let coordinator = makeCoordinator(api: api, cache: cache)
        await activate(coordinator)
        await coordinator.loadMatchDetail(matchID: "retained-match")
        let repository = try XCTUnwrap(coordinator.matchDetailRepository(matchID: "retained-match"))
        let cached = try XCTUnwrap(repository.state.value)

        api.failures["retained-match"] = .server(code: .matchNotFound, status: 503)
        await coordinator.refreshMatchDetail(matchID: "retained-match")

        XCTAssertEqual(repository.state.value, cached)
        XCTAssertEqual(repository.state.freshness, .stale)
        XCTAssertEqual(repository.state.lastHTTPStatus, 503)
        let removals = await cache.partitionRemovalCount()
        XCTAssertEqual(removals, 0)
        XCTAssertNotNil(MatchDetailPresenter.make(
            state: repository.state, requestedMatchID: "retained-match"
        ).match)
    }

    private func makeCoordinator(
        api: MatchDetailCoordinatorAPI,
        cache: MatchDetailCoordinatorCache
    ) -> TournamentDataCoordinator {
        TournamentDataCoordinator(
            api: api,
            credentialProvider: MatchDetailCoordinatorCredentialProvider(),
            cache: cache,
            applicationActivity: NativeApplicationActivity(isActive: false),
            now: { TestFixtures.now }
        )
    }

    private func activate(_ coordinator: TournamentDataCoordinator) async {
        await coordinator.activate(
            authUserID: TestFixtures.authSession.userID,
            participant: TestFixtures.participant
        )
    }
}

@MainActor
private final class MatchDetailCoordinatorCredentialProvider: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: TestFixtures.authSession.accessToken,
            certification: TestFixtures.certificationToken
        )
    }
}

@MainActor
private final class MatchDetailCoordinatorAPI: MobileAPIServing {
    struct DetailRequest: Equatable {
        let matchID: String
        let accessToken: String
        let certification: String
        let etag: String?
    }

    private let base = MockMobileAPI()
    var responses: [String: MobileConditionalRead<MobileMatchDetailResponse>] = [:]
    var failures: [String: MobileAPIClientError] = [:]
    private(set) var matchDetailRequests: [DetailRequest] = []

    func health() async throws -> MobileHealthResponse { try await base.health() }

    func requestOTP(identifier: String, captchaToken: String) async throws -> OTPRequestAcknowledgement {
        try await base.requestOTP(identifier: identifier, captchaToken: captchaToken)
    }

    func certify(challengeId: String, accessToken: String) async throws -> OTPCertificationAcknowledgement {
        try await base.certify(challengeId: challengeId, accessToken: accessToken)
    }

    func participantSession(accessToken: String, certification: String) async throws -> ParticipantSession {
        try await base.participantSession(accessToken: accessToken, certification: certification)
    }

    func today(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileTodayResponse> {
        try await base.today(accessToken: accessToken, certification: certification, etag: etag)
    }

    func matches(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileMatchesResponse> {
        try await base.matches(accessToken: accessToken, certification: certification, etag: etag)
    }

    func matchDetail(
        matchID: String,
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileMatchDetailResponse> {
        matchDetailRequests.append(DetailRequest(
            matchID: matchID,
            accessToken: accessToken,
            certification: certification,
            etag: etag
        ))
        if let failure = failures[matchID] { throw failure }
        if let response = responses[matchID] { return response }
        if etag == #"\"match-detail-fixture\""# {
            return .notModified(etag: etag)
        }
        return .modified(
            MatchDetailFixtureFactory.response(matchID: matchID),
            etag: #""match-detail-fixture""#
        )
    }

    func leaders(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileLeadersResponse> {
        try await base.leaders(accessToken: accessToken, certification: certification, etag: etag)
    }

    func netSkins(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileNetSkinsResponse> {
        try await base.netSkins(accessToken: accessToken, certification: certification, etag: etag)
    }

    func calcutta(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileCalcuttaResponse> {
        try await base.calcutta(accessToken: accessToken, certification: certification, etag: etag)
    }

    func schedule(
        accessToken: String,
        certification: String,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileScheduleResponse> {
        try await base.schedule(accessToken: accessToken, certification: certification, etag: etag)
    }
}

private actor MatchDetailCoordinatorCache: ReadCacheStoring {
    private struct Address: Hashable {
        let partition: String
        let key: MobileReadCacheKey
    }

    private var values: [Address: Data] = [:]
    private var detailReads: [String] = []
    private var detailWrites: [String] = []
    private var partitionRemovals = 0

    func read(product: MobileReadProduct, partition: ReadCachePartition) throws -> Data? {
        guard product != .historyDetail, product != .matchDetail else {
            throw ReadCacheError.invalidCacheKey
        }
        return values[Address(partition: partition.digest, key: MobileReadCacheKey(product: product))]
    }

    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) throws {
        guard product != .historyDetail, product != .matchDetail else {
            throw ReadCacheError.invalidCacheKey
        }
        values[Address(partition: partition.digest, key: MobileReadCacheKey(product: product))] = data
    }

    func remove(product: MobileReadProduct, partition: ReadCachePartition) throws {
        guard product != .historyDetail, product != .matchDetail else {
            throw ReadCacheError.invalidCacheKey
        }
        values.removeValue(forKey: Address(
            partition: partition.digest,
            key: MobileReadCacheKey(product: product)
        ))
    }

    func read(key: MobileReadCacheKey, partition: ReadCachePartition) async throws -> Data? {
        if let matchID = key.matchID { detailReads.append(matchID) }
        return values[Address(partition: partition.digest, key: key)]
    }

    func write(_ data: Data, key: MobileReadCacheKey, partition: ReadCachePartition) async throws {
        if let matchID = key.matchID { detailWrites.append(matchID) }
        values[Address(partition: partition.digest, key: key)] = data
    }

    func remove(key: MobileReadCacheKey, partition: ReadCachePartition) async throws {
        values.removeValue(forKey: Address(partition: partition.digest, key: key))
    }

    func remove(partition: ReadCachePartition) {
        partitionRemovals += 1
        values = values.filter { $0.key.partition != partition.digest }
    }

    func byteCount(partition: ReadCachePartition) -> Int {
        values
            .filter { $0.key.partition == partition.digest }
            .values
            .reduce(0) { $0 + $1.count }
    }

    func matchDetailReadIDs() -> [String] { detailReads }
    func matchDetailWriteIDs() -> [String] { detailWrites }
    func partitionRemovalCount() -> Int { partitionRemovals }
    func totalByteCount() -> Int { values.values.reduce(0) { $0 + $1.count } }
}
