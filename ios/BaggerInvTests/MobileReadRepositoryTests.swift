import XCTest
@testable import BaggerInv

@MainActor
final class MobileReadRepositoryTests: XCTestCase {
    func testColdCacheNetwork200PublishesAndPersistsCanonicalValue() async throws {
        let harness = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])

        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()

        XCTAssertEqual(harness.repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(harness.repository.state.source, .network)
        XCTAssertEqual(harness.repository.state.freshness, .fresh)
        XCTAssertEqual(harness.repository.state.revision, "fixture-revision-1")
        let writeCount = await harness.cache.writeCount
        let persisted = await harness.cache.storedData(product: .today, partition: harness.context.cachePartition)
        XCTAssertEqual(writeCount, 1)
        XCTAssertNotNil(persisted)
    }

    func testWarmCachePublishesBeforeRevalidationAnd304RetainsDTO() async throws {
        var clock = TestFixtures.now
        let cache = InMemoryReadCache()
        let initialFetcher = ScriptedTodayFetcher(results: [
            .modified(TestFixtures.todayResponse, etag: "W/\"revision-1\"")
        ])
        let initialRepository = makeRepository(cache: cache, fetcher: initialFetcher, now: { clock })
        let activeContext = try context()
        await initialRepository.activate(activeContext, beginRefresh: false)
        await initialRepository.refresh()
        let fetchedAt = initialRepository.state.fetchedAt
        let generatedAt = initialRepository.state.generatedAt

        let fetcher = ScriptedTodayFetcher(results: [.notModified(etag: "W/\"revision-1\"")])
        clock = TestFixtures.now.addingTimeInterval(120)
        let repository = makeRepository(cache: cache, fetcher: fetcher, now: { clock })
        await repository.activate(activeContext, beginRefresh: false)

        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(repository.state.source, .diskCache)
        XCTAssertEqual(repository.state.freshness, .cached)

        await repository.refresh()

        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(repository.state.freshness, .fresh)
        XCTAssertEqual(fetcher.receivedETags, ["W/\"revision-1\""])
        XCTAssertEqual(repository.state.fetchedAt, fetchedAt)
        XCTAssertEqual(repository.state.generatedAt, generatedAt)
        XCTAssertEqual(repository.state.validatedAt, clock)
    }

    func testChanged200AtomicallyReplacesCachedDTOAndRevision() async throws {
        let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()

        let changed = changedTodayResponse(revision: "fixture-revision-2", tournamentName: "Updated Preview")
        let fetcher = ScriptedTodayFetcher(results: [.modified(changed, etag: "\"revision-2\"")])
        let repository = makeRepository(cache: initial.cache, fetcher: fetcher)
        await repository.activate(initial.context, beginRefresh: false)
        await repository.refresh()

        XCTAssertEqual(repository.state.value?.tournament.name, "Updated Preview")
        XCTAssertEqual(repository.state.revision, "fixture-revision-2")

        let restored = makeRepository(cache: initial.cache, fetcher: ScriptedTodayFetcher(results: []))
        await restored.activate(initial.context, beginRefresh: false)
        XCTAssertEqual(restored.state.value?.tournament.name, "Updated Preview")
    }

    func testOfflineWithCacheRetainsValueAndMarksOffline() async throws {
        let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()

        let repository = makeRepository(
            cache: initial.cache,
            fetcher: ScriptedTodayFetcher(results: [.failure(MobileAPIClientError.transportUnavailable)])
        )
        await repository.activate(initial.context, beginRefresh: false)
        await repository.refresh()

        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(repository.state.freshness, .offline)
        XCTAssertEqual(repository.state.lastSafeError, .transport)
    }

    func testNoCacheOfflineProducesControlledUnavailableState() async throws {
        let harness = try makeHarness(results: [.failure(MobileAPIClientError.transportUnavailable)])

        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()

        XCTAssertNil(harness.repository.state.value)
        XCTAssertEqual(harness.repository.state.freshness, .failed)
        XCTAssertEqual(harness.repository.state.lastSafeError, .transport)
    }

    func testCorruptCacheIsDiscardedAndRefetched() async throws {
        let harness = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await harness.cache.setRaw(Data("not-json".utf8), product: .today, partition: harness.context.cachePartition)

        await harness.repository.activate(harness.context, beginRefresh: false)
        XCTAssertNil(harness.repository.state.value)
        let removeProductCount = await harness.cache.removeProductCount
        XCTAssertEqual(removeProductCount, 1)

        await harness.repository.refresh()
        XCTAssertEqual(harness.repository.state.value, TestFixtures.todayResponse.data)
    }

    func testWrongCacheSchemaVersionIsDiscardedAndRefetched() async throws {
        let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()
        let stored = await initial.cache.storedData(product: .today, partition: initial.context.cachePartition)
        let data = try XCTUnwrap(stored)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        object["cacheSchemaVersion"] = 999
        await initial.cache.setRaw(try JSONSerialization.data(withJSONObject: object), product: .today, partition: initial.context.cachePartition)

        let repository = makeRepository(
            cache: initial.cache,
            fetcher: ScriptedTodayFetcher(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        )
        await repository.activate(initial.context, beginRefresh: false)

        XCTAssertNil(repository.state.value)
        await repository.refresh()
        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
    }

    func testWrongIdentityAndTournamentPartitionsNeverReturnCachedValue() async throws {
        let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()

        let otherIdentity = try context(authUserID: "other-auth", tournamentID: initial.context.tournamentID)
        let identityRepository = makeRepository(cache: initial.cache, fetcher: ScriptedTodayFetcher(results: []))
        await identityRepository.activate(otherIdentity, beginRefresh: false)
        XCTAssertNil(identityRepository.state.value)

        let otherTournament = try context(authUserID: initial.context.authUserID, tournamentID: "other-tournament")
        let tournamentRepository = makeRepository(cache: initial.cache, fetcher: ScriptedTodayFetcher(results: []))
        await tournamentRepository.activate(otherTournament, beginRefresh: false)
        XCTAssertNil(tournamentRepository.state.value)
    }

    func testSignOutDeactivationClearsMemoryAndDeletesPartition() async throws {
        let harness = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()

        await harness.repository.deactivate(deleteCache: true)

        XCTAssertEqual(harness.repository.state, .empty)
        let persisted = await harness.cache.storedData(product: .today, partition: harness.context.cachePartition)
        XCTAssertNil(persisted)
    }

    func test304WithoutCachePerformsOneUnconditionalRefetch() async throws {
        let fetcher = ScriptedTodayFetcher(results: [
            .notModified(etag: "\"revision-1\""),
            .modified(TestFixtures.todayResponse, etag: "\"revision-1\""),
        ])
        let harness = try makeHarness(fetcher: fetcher)

        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()

        XCTAssertEqual(fetcher.callCount, 2)
        XCTAssertEqual(fetcher.receivedETags, [nil, nil])
        XCTAssertEqual(harness.repository.state.value, TestFixtures.todayResponse.data)
    }

    func test304WithoutSentValidatorPerformsOneUnconditionalRefetch() async throws {
        let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: nil)])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()

        let fetcher = ScriptedTodayFetcher(results: [
            .notModified(etag: nil),
            .modified(TestFixtures.todayResponse, etag: "\"revision-1\""),
        ])
        let repository = makeRepository(cache: initial.cache, fetcher: fetcher)
        await repository.activate(initial.context, beginRefresh: false)
        await repository.refresh()

        XCTAssertEqual(fetcher.callCount, 2)
        XCTAssertEqual(fetcher.receivedETags, [nil, nil])
        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(repository.state.freshness, .fresh)
    }

    func testTwoConcurrentRefreshesShareOneNetworkRequest() async throws {
        let fetcher = ScriptedTodayFetcher(
            results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")],
            delayNanoseconds: 100_000_000
        )
        let harness = try makeHarness(fetcher: fetcher)
        await harness.repository.activate(harness.context, beginRefresh: false)

        async let first: Void = harness.repository.refresh()
        async let second: Void = harness.repository.refresh()
        _ = await (first, second)

        XCTAssertEqual(fetcher.callCount, 1)
        XCTAssertEqual(harness.repository.state.value, TestFixtures.todayResponse.data)
    }

    func testCancellingOneConsumerDoesNotCorruptSharedRefresh() async throws {
        let fetcher = ScriptedTodayFetcher(
            results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")],
            delayNanoseconds: 100_000_000
        )
        let harness = try makeHarness(fetcher: fetcher)
        await harness.repository.activate(harness.context, beginRefresh: false)

        let first = Task { await harness.repository.refresh() }
        let second = Task { await harness.repository.refresh() }
        first.cancel()
        await second.value

        XCTAssertEqual(fetcher.callCount, 1)
        XCTAssertEqual(harness.repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(harness.repository.state.freshness, .fresh)
    }

    func testExplicitRefreshCancellationKeepsCacheAndAllowsLaterRefresh() async throws {
        let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()

        let fetcher = ScriptedTodayFetcher(
            results: [
                .modified(changedTodayResponse(revision: "cancelled"), etag: "\"cancelled\""),
                .modified(changedTodayResponse(revision: "completed"), etag: "\"completed\""),
            ],
            delayNanoseconds: 200_000_000
        )
        let repository = makeRepository(cache: initial.cache, fetcher: fetcher)
        await repository.activate(initial.context, beginRefresh: false)
        let refresh = Task { await repository.refresh() }
        while fetcher.callCount == 0 { await Task.yield() }

        await repository.cancelRefresh()
        await refresh.value

        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertNotEqual(repository.state.revision, "cancelled")

        await repository.refresh()
        XCTAssertEqual(repository.state.revision, "completed")
        XCTAssertEqual(repository.state.freshness, .fresh)
    }

    func test401AndCertification403FailClosedAndNotifyAuthOwner() async throws {
        for error in [
            MobileAPIClientError.server(code: .invalidToken, status: 401),
            MobileAPIClientError.server(code: .authCertificationFailed, status: 403),
        ] {
            let harness = try makeHarness(results: [.failure(error)])
            var invalidationCount = 0
            harness.repository.setAccessInvalidationHandler { invalidationCount += 1 }
            await harness.repository.activate(harness.context, beginRefresh: false)

            await harness.repository.refresh()

            XCTAssertNil(harness.repository.state.value)
            XCTAssertEqual(harness.repository.state.freshness, .failed)
            XCTAssertEqual(invalidationCount, 1)
        }
    }

    func test429And503RetainSafeCacheWithoutRetryStorm() async throws {
        for error in [
            MobileAPIClientError.unexpectedStatus(429),
            MobileAPIClientError.server(code: .internalError, status: 503),
        ] {
            let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
            await initial.repository.activate(initial.context, beginRefresh: false)
            await initial.repository.refresh()
            let fetcher = ScriptedTodayFetcher(results: [.failure(error)])
            let repository = makeRepository(cache: initial.cache, fetcher: fetcher)
            await repository.activate(initial.context, beginRefresh: false)

            await repository.refresh()

            XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
            XCTAssertEqual(repository.state.freshness, .stale)
            XCTAssertEqual(fetcher.callCount, 1)
        }
    }

    func testReadServiceUnavailableRetainsSafeCacheAndRequestsAuthorityRevalidation() async throws {
        let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()
        let repository = makeRepository(
            cache: initial.cache,
            fetcher: ScriptedTodayFetcher(results: [
                .failure(MobileAPIClientError.server(code: .mobileAPIUnavailable, status: 503)),
            ])
        )
        var revalidationCount = 0
        repository.setAuthorityRevalidationHandler { revalidationCount += 1 }
        await repository.activate(initial.context, beginRefresh: false)

        await repository.refresh()

        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(repository.state.freshness, .stale)
        XCTAssertEqual(repository.state.lastSafeError, .unavailable)
        XCTAssertEqual(repository.state.lastServerCode, .mobileAPIUnavailable)
        XCTAssertEqual(revalidationCount, 1)
    }

    func testTransientAuthSessionRefreshFailureRetainsEligibleOfflineCache() async throws {
        let initial = try makeHarness(results: [
            .modified(TestFixtures.todayResponse, etag: "\"revision-1\"")
        ])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()

        let repository = makeRepository(
            cache: initial.cache,
            fetcher: ScriptedTodayFetcher(results: []),
            credentialProvider: FailingReadCredentialProvider(error: .authSessionUnavailable)
        )
        var invalidationCount = 0
        repository.setAccessInvalidationHandler { invalidationCount += 1 }
        await repository.activate(initial.context, beginRefresh: false)

        await repository.refresh()

        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(repository.state.freshness, .offline)
        XCTAssertEqual(repository.state.lastSafeError, .transport)
        XCTAssertEqual(invalidationCount, 0)
    }

    func testDefiniteCredentialFailuresInvalidateParticipantAccess() async throws {
        for credentialError in [
            MobileReadCredentialError.authSessionMissing,
            .authIdentityChanged,
            .certificationUnavailable,
        ] {
            let repository = makeRepository(
                cache: InMemoryReadCache(),
                fetcher: ScriptedTodayFetcher(results: []),
                credentialProvider: FailingReadCredentialProvider(error: credentialError)
            )
            var invalidationCount = 0
            repository.setAccessInvalidationHandler { invalidationCount += 1 }
            let activeContext = try context()
            await repository.activate(activeContext, beginRefresh: false)

            await repository.refresh()

            XCTAssertNil(repository.state.value)
            XCTAssertEqual(repository.state.freshness, .failed)
            XCTAssertEqual(repository.state.lastSafeError, .authentication)
            XCTAssertEqual(invalidationCount, 1)
        }
    }

    func testDecodingContractFailureDoesNotOverwriteValidCache() async throws {
        let initial = try makeHarness(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        await initial.repository.activate(initial.context, beginRefresh: false)
        await initial.repository.refresh()
        let incompatible = changedTodayResponse(revision: "bad", tournamentID: "wrong-tournament")
        let repository = makeRepository(
            cache: initial.cache,
            fetcher: ScriptedTodayFetcher(results: [.modified(incompatible, etag: "\"bad\"")])
        )
        await repository.activate(initial.context, beginRefresh: false)

        await repository.refresh()

        XCTAssertEqual(repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(repository.state.freshness, .stale)
        XCTAssertEqual(repository.state.lastSafeError, .contract)
    }

    func testCacheWriteFailureDoesNotTurnValidNetworkDTOIntoLoadFailure() async throws {
        let cache = InMemoryReadCache()
        await cache.failWrites(with: StubError.planned)
        let fetcher = ScriptedTodayFetcher(results: [.modified(TestFixtures.todayResponse, etag: "\"revision-1\"")])
        let harness = try makeHarness(cache: cache, fetcher: fetcher)

        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()

        XCTAssertEqual(harness.repository.state.value, TestFixtures.todayResponse.data)
        XCTAssertEqual(harness.repository.state.freshness, .fresh)
        XCTAssertTrue(harness.repository.state.cachePersistenceIssue)
    }

    func testGuidePublishedToUnpublished200ReplacesVisibleAndPersistedRepresentation() async throws {
        let cache = InMemoryReadCache()
        let activeContext = try context()
        let published = guideResponse(published: true)
        let unpublished = guideResponse(published: false)
        let fetcher = ScriptedParticipantFetcher<MobileGuideResponse>(results: [
            .modified(published, etag: "\"guide-published\""),
            .modified(unpublished, etag: "\"guide-unpublished\""),
        ])
        let repository = makeParticipantRepository(
            product: .guide,
            cache: cache,
            fetcher: fetcher
        )
        await repository.activate(activeContext, beginRefresh: false)

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.publicationState, .published)
        XCTAssertEqual(repository.state.value?.tournament?.name, "Sensitive Published Guide")

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.publicationState, .unpublished)
        XCTAssertNil(repository.state.value?.tournament)
        XCTAssertTrue(repository.state.value?.overview.isEmpty ?? false)
        XCTAssertEqual(repository.state.lastHTTPStatus, 200)

        let persisted = await cache.storedData(
            product: .guide,
            partition: activeContext.cachePartition
        )
        let persistedData = try XCTUnwrap(persisted)
        XCTAssertFalse(String(decoding: persistedData, as: UTF8.self).contains("Sensitive Published Guide"))

        let relaunched = makeParticipantRepository(
            product: .guide,
            cache: cache,
            fetcher: ScriptedParticipantFetcher<MobileGuideResponse>(results: [])
        )
        await relaunched.activate(activeContext, beginRefresh: false)
        XCTAssertEqual(relaunched.state.source, .diskCache)
        XCTAssertEqual(relaunched.state.value?.publicationState, .unpublished)
        XCTAssertNil(relaunched.state.value?.tournament)
    }

    func testOddsPublishedToUnpublished200ReplacesVisibleAndPersistedRepresentation() async throws {
        let cache = InMemoryReadCache()
        let activeContext = try context()
        let published = oddsResponse(published: true)
        let unpublished = oddsResponse(published: false)
        let fetcher = ScriptedParticipantFetcher<MobileOddsResponse>(results: [
            .modified(published, etag: "\"odds-published\""),
            .modified(unpublished, etag: "\"odds-unpublished\""),
        ])
        let repository = makeParticipantRepository(
            product: .odds,
            cache: cache,
            fetcher: fetcher
        )
        await repository.activate(activeContext, beginRefresh: false)

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.publication.state, .published)
        XCTAssertEqual(repository.state.value?.snapshots.first?.teams.first?.name, "Sensitive Odds Team")

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.publication.state, .unpublished)
        XCTAssertNil(repository.state.value?.publication.currentPhase)
        XCTAssertTrue(repository.state.value?.snapshots.isEmpty ?? false)
        XCTAssertEqual(repository.state.lastHTTPStatus, 200)

        let persisted = await cache.storedData(
            product: .odds,
            partition: activeContext.cachePartition
        )
        let persistedData = try XCTUnwrap(persisted)
        XCTAssertFalse(String(decoding: persistedData, as: UTF8.self).contains("Sensitive Odds Team"))

        let relaunched = makeParticipantRepository(
            product: .odds,
            cache: cache,
            fetcher: ScriptedParticipantFetcher<MobileOddsResponse>(results: [])
        )
        await relaunched.activate(activeContext, beginRefresh: false)
        XCTAssertEqual(relaunched.state.source, .diskCache)
        XCTAssertEqual(relaunched.state.value?.publication.state, .unpublished)
        XCTAssertTrue(relaunched.state.value?.snapshots.isEmpty ?? false)
    }

    private func makeHarness(
        results: [ScriptedTodayFetcher.Result] = [],
        cache: InMemoryReadCache = InMemoryReadCache(),
        fetcher: ScriptedTodayFetcher? = nil
    ) throws -> RepositoryHarness {
        let fetcher = fetcher ?? ScriptedTodayFetcher(results: results)
        let repository = makeRepository(cache: cache, fetcher: fetcher)
        return RepositoryHarness(
            repository: repository,
            cache: cache,
            fetcher: fetcher,
            context: try context()
        )
    }

    private func makeRepository(
        cache: InMemoryReadCache,
        fetcher: ScriptedTodayFetcher,
        now: @escaping () -> Date = { TestFixtures.now },
        credentialProvider: any MobileReadCredentialProviding = StubReadCredentialProvider()
    ) -> MobileReadRepository<MobileTodayResponse> {
        MobileReadRepository(
            product: .today,
            cache: cache,
            credentialProvider: credentialProvider,
            now: now
        ) { credentials, etag in
            try await fetcher.fetch(credentials: credentials, etag: etag)
        }
    }

    private func makeParticipantRepository<Response: MobileReadPayloadResponse>(
        product: MobileReadProduct,
        cache: InMemoryReadCache,
        fetcher: ScriptedParticipantFetcher<Response>
    ) -> MobileReadRepository<Response> {
        MobileReadRepository(
            product: product,
            cache: cache,
            credentialProvider: StubReadCredentialProvider(),
            now: { TestFixtures.now }
        ) { credentials, etag in
            try await fetcher.fetch(credentials: credentials, etag: etag)
        }
    }

    private func context(
        authUserID: String = TestFixtures.authSession.userID,
        tournamentID: String = TestFixtures.participant.tournament.tournamentId
    ) throws -> ActiveMobileReadContext {
        ActiveMobileReadContext(
            cachePartition: try ReadCachePartition(
                environment: "preview",
                authUserID: authUserID,
                playerID: TestFixtures.participant.player.playerId,
                tournamentID: tournamentID
            ),
            authUserID: authUserID,
            playerID: TestFixtures.participant.player.playerId,
            tournamentID: tournamentID
        )
    }

    private func changedTodayResponse(
        revision: String,
        tournamentID: String = TestFixtures.participant.tournament.tournamentId,
        tournamentName: String = TestFixtures.participant.tournament.name
    ) -> MobileTodayResponse {
        MobileTodayResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileTodayData(
                tournament: MobileReadTournament(
                    tournamentId: tournamentID,
                    name: tournamentName,
                    year: 2026,
                    status: "Live",
                    currentRound: 2,
                    timeZone: "America/Chicago"
                ),
                player: TestFixtures.todayResponse.data.player,
                currentMatch: nil,
                immediateSchedule: []
            ),
            meta: MobileReadMeta(
                generatedAt: try! MobileTimestamp("2027-01-15T08:05:00.000Z"),
                revision: revision
            )
        )
    }

    private func guideResponse(published: Bool) -> MobileGuideResponse {
        MobileGuideResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileGuideData(
                contractVersion: "guide-v1",
                tournamentId: TestFixtures.participant.tournament.tournamentId,
                publicationState: published ? .published : .unpublished,
                publishedAt: published
                    ? try! MobileTimestamp("2027-01-15T08:00:00.000Z")
                    : nil,
                tournament: published
                    ? MobileGuideTournament(
                        tournamentId: TestFixtures.participant.tournament.tournamentId,
                        year: 2026,
                        name: "Sensitive Published Guide",
                        editionTitle: nil,
                        dates: nil,
                        location: nil,
                        timeZone: "America/Chicago",
                        logoAssetKey: nil,
                        heroAssetKey: nil,
                        mobileHeroAssetKey: nil
                    )
                    : nil,
                overview: [],
                rules: MobileGuideRules(roundFormats: [], items: []),
                courses: [],
                dining: [],
                localGuide: [],
                contacts: []
            ),
            meta: MobileReadMeta(
                generatedAt: TestFixtures.readMeta.generatedAt,
                revision: published ? "guide-published" : "guide-unpublished"
            )
        )
    }

    private func oddsResponse(published: Bool) -> MobileOddsResponse {
        let timestamp = try! MobileTimestamp("2027-01-15T08:00:00.000Z")
        let snapshots = published
            ? [
                MobileOddsSnapshot(
                    phase: .preTournament,
                    phaseOrder: 0,
                    label: "Pre-Tournament",
                    isCurrent: true,
                    publishedAt: timestamp,
                    iterations: 10_000,
                    totalPointsAvailable: 20,
                    teams: [
                        MobileOddsTeam(
                            side: 1,
                            teamId: "team-preview-1",
                            name: "Sensitive Odds Team",
                            probability: 55,
                            americanOdds: "+120",
                            expectedPoints: 11
                        ),
                        MobileOddsTeam(
                            side: 2,
                            teamId: "team-preview-2",
                            name: "Other Team",
                            probability: 45,
                            americanOdds: "-110",
                            expectedPoints: 9
                        ),
                    ],
                    players: [
                        MobileOddsPlayer(
                            rank: 1,
                            playerId: TestFixtures.participant.player.playerId,
                            displayName: TestFixtures.participant.player.displayName,
                            teamSide: 1,
                            probability: 12.5,
                            americanOdds: "+700",
                            expectedPoints: 3,
                            expectedRecord: "2-1-0",
                            averageFinish: 1.5
                        ),
                    ]
                ),
            ]
            : []
        return MobileOddsResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileOddsData(
                publication: MobileOddsPublication(
                    state: published ? .published : .unpublished,
                    revision: published ? 1 : 2,
                    publishedAt: published ? timestamp : nil,
                    currentPhase: published ? .preTournament : nil
                ),
                snapshots: snapshots
            ),
            meta: MobileReadMeta(
                generatedAt: TestFixtures.readMeta.generatedAt,
                revision: published ? "odds-published" : "odds-unpublished"
            )
        )
    }
}

private struct RepositoryHarness {
    let repository: MobileReadRepository<MobileTodayResponse>
    let cache: InMemoryReadCache
    let fetcher: ScriptedTodayFetcher
    let context: ActiveMobileReadContext
}

@MainActor
private final class StubReadCredentialProvider: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: TestFixtures.authSession.accessToken,
            certification: TestFixtures.certificationToken
        )
    }
}

@MainActor
private final class FailingReadCredentialProvider: MobileReadCredentialProviding {
    private let error: MobileReadCredentialError

    init(error: MobileReadCredentialError) {
        self.error = error
    }

    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        throw error
    }
}

@MainActor
private final class ScriptedTodayFetcher {
    enum Result {
        case modified(MobileTodayResponse, etag: String?)
        case notModified(etag: String?)
        case failure(any Error)
    }

    private var results: [Result]
    private let delayNanoseconds: UInt64
    private(set) var callCount = 0
    private(set) var receivedETags: [String?] = []

    init(results: [Result], delayNanoseconds: UInt64 = 0) {
        self.results = results
        self.delayNanoseconds = delayNanoseconds
    }

    func fetch(
        credentials: MobileReadCredentials,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileTodayResponse> {
        callCount += 1
        receivedETags.append(etag)
        guard !results.isEmpty else { throw MobileAPIClientError.transportUnavailable }
        let result = results.removeFirst()
        if delayNanoseconds > 0 {
            try await Task.sleep(nanoseconds: delayNanoseconds)
        }
        switch result {
        case .modified(let response, let etag): return .modified(response, etag: etag)
        case .notModified(let etag): return .notModified(etag: etag)
        case .failure(let error): throw error
        }
    }
}

@MainActor
private final class ScriptedParticipantFetcher<Response: MobileReadPayloadResponse> {
    private var results: [MobileConditionalRead<Response>]

    init(results: [MobileConditionalRead<Response>]) {
        self.results = results
    }

    func fetch(
        credentials: MobileReadCredentials,
        etag: String?
    ) async throws -> MobileConditionalRead<Response> {
        guard !results.isEmpty else { throw MobileAPIClientError.transportUnavailable }
        return results.removeFirst()
    }
}

private actor InMemoryReadCache: ReadCacheStoring {
    private var values: [String: Data] = [:]
    private var writeError: (any Error)?
    private(set) var writeCount = 0
    private(set) var removeProductCount = 0

    func read(product: MobileReadProduct, partition: ReadCachePartition) -> Data? {
        values[key(product: product, partition: partition)]
    }

    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) throws {
        if let writeError { throw writeError }
        writeCount += 1
        values[key(product: product, partition: partition)] = data
    }

    func remove(product: MobileReadProduct, partition: ReadCachePartition) {
        removeProductCount += 1
        values.removeValue(forKey: key(product: product, partition: partition))
    }

    func remove(partition: ReadCachePartition) {
        let prefix = "\(partition.digest)|"
        values = values.filter { !$0.key.hasPrefix(prefix) }
    }

    func byteCount(partition: ReadCachePartition) -> Int {
        let prefix = "\(partition.digest)|"
        return values.filter { $0.key.hasPrefix(prefix) }.values.reduce(0) { $0 + $1.count }
    }

    func storedData(product: MobileReadProduct, partition: ReadCachePartition) -> Data? {
        values[key(product: product, partition: partition)]
    }

    func setRaw(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) {
        values[key(product: product, partition: partition)] = data
    }

    func failWrites(with error: any Error) {
        writeError = error
    }

    private func key(product: MobileReadProduct, partition: ReadCachePartition) -> String {
        "\(partition.digest)|\(product.rawValue)"
    }
}
