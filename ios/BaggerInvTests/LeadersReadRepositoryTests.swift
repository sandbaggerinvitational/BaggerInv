import XCTest
@testable import BaggerInv

@MainActor
final class LeadersReadRepositoryTests: XCTestCase {
    func testNetSkinsCold200PersistsAndWarm304RetainsCanonicalValue() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let initialFetcher = ScriptedProductFetcher<MobileNetSkinsResponse>(steps: [
            .modified(TestFixtures.netSkinsResponse, etag: #"W/\"net-skins-1\""#),
        ])
        let initial = makeNetSkinsRepository(cache: cache, fetcher: initialFetcher)

        await initial.activate(context, beginRefresh: false)
        await initial.refresh()

        XCTAssertEqual(initial.state.value, TestFixtures.netSkinsResponse.data)
        XCTAssertEqual(initial.state.source, .network)
        XCTAssertEqual(initial.state.freshness, .fresh)
        XCTAssertEqual(initial.state.lastHTTPStatus, 200)
        let persisted = await cache.storedData(product: .netSkins, partition: context.cachePartition)
        XCTAssertNotNil(persisted)

        let revalidationFetcher = ScriptedProductFetcher<MobileNetSkinsResponse>(steps: [
            .notModified(etag: #"W/\"net-skins-1\""#),
        ])
        let restored = makeNetSkinsRepository(cache: cache, fetcher: revalidationFetcher)
        await restored.activate(context, beginRefresh: false)

        XCTAssertEqual(restored.state.value, TestFixtures.netSkinsResponse.data)
        XCTAssertEqual(restored.state.source, .diskCache)
        XCTAssertEqual(restored.state.freshness, .cached)

        await restored.refresh()

        XCTAssertEqual(restored.state.value, TestFixtures.netSkinsResponse.data)
        XCTAssertEqual(restored.state.freshness, .fresh)
        XCTAssertEqual(restored.state.lastHTTPStatus, 304)
        XCTAssertEqual(revalidationFetcher.receivedETags, [#"W/\"net-skins-1\""#])
    }

    func testCalcuttaCold200PersistsAndWarm304RetainsPublishedCanonicalValue() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let published = calcuttaResponse(published: true, publicationRevision: 1)
        let initialFetcher = ScriptedProductFetcher<MobileCalcuttaResponse>(steps: [
            .modified(published, etag: #"W/\"calcutta-1\""#),
        ])
        let initial = makeCalcuttaRepository(cache: cache, fetcher: initialFetcher)

        await initial.activate(context, beginRefresh: false)
        await initial.refresh()

        XCTAssertEqual(initial.state.value, published.data)
        XCTAssertEqual(initial.state.source, .network)
        XCTAssertEqual(initial.state.freshness, .fresh)
        XCTAssertNotNil(initial.state.value?.market)
        let persisted = await cache.storedData(product: .calcutta, partition: context.cachePartition)
        XCTAssertNotNil(persisted)

        let revalidationFetcher = ScriptedProductFetcher<MobileCalcuttaResponse>(steps: [
            .notModified(etag: #"W/\"calcutta-1\""#),
        ])
        let restored = makeCalcuttaRepository(cache: cache, fetcher: revalidationFetcher)
        await restored.activate(context, beginRefresh: false)

        XCTAssertEqual(restored.state.value, published.data)
        XCTAssertEqual(restored.state.source, .diskCache)
        XCTAssertEqual(restored.state.freshness, .cached)

        await restored.refresh()

        XCTAssertEqual(restored.state.value, published.data)
        XCTAssertEqual(restored.state.freshness, .fresh)
        XCTAssertEqual(restored.state.lastHTTPStatus, 304)
        XCTAssertEqual(revalidationFetcher.receivedETags, [#"W/\"calcutta-1\""#])
    }

    func testNetSkinsNormalChanged200PersistsAndRelaunchUsesReplacement() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let configured = netSkinsResponse(official: false)
        let fetcher = ScriptedProductFetcher<MobileNetSkinsResponse>(steps: [
            .modified(TestFixtures.netSkinsResponse, etag: #"\"net-skins-1\""#),
            .modified(configured, etag: #"\"net-skins-2\""#),
        ])
        let repository = makeNetSkinsRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        await repository.refresh()
        await repository.refresh()

        XCTAssertEqual(repository.state.value, configured.data)
        XCTAssertEqual(repository.state.source, .network)
        XCTAssertEqual(repository.state.freshness, .fresh)
        XCTAssertEqual(repository.state.lastHTTPStatus, 200)
        XCTAssertEqual(fetcher.receivedETags, [nil, #"\"net-skins-1\""#])

        let relaunched = makeNetSkinsRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [])
        )
        await relaunched.activate(context, beginRefresh: false)
        XCTAssertEqual(relaunched.state.value, configured.data)
        XCTAssertEqual(relaunched.state.source, .diskCache)
        XCTAssertEqual(relaunched.state.freshness, .cached)
    }

    func testCalcuttaPublishedToUnpublishedResponseImmediatelyRevokesProtectedValuesAndCache() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let published = calcuttaResponse(published: true, publicationRevision: 1)
        let unpublished = calcuttaResponse(published: false, publicationRevision: 2)
        let fetcher = ScriptedProductFetcher<MobileCalcuttaResponse>(steps: [
            .modified(published, etag: #"\"calcutta-published\""#),
            .modified(unpublished, etag: #"\"calcutta-unpublished\""#),
        ])
        let repository = makeCalcuttaRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.publicationState, .published)
        XCTAssertNotNil(repository.state.value?.market)

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.publicationState, .unpublished)
        XCTAssertEqual(repository.state.lastHTTPStatus, 200)
        XCTAssertFalse(repository.state.value?.published ?? true)
        XCTAssertNil(repository.state.value?.market)
        XCTAssertNil(repository.state.value?.result)

        let cacheOnly = makeCalcuttaRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [])
        )
        await cacheOnly.activate(context, beginRefresh: false)
        XCTAssertEqual(cacheOnly.state.value?.publicationState, .unpublished)
        XCTAssertNil(cacheOnly.state.value?.market)
        XCTAssertNil(cacheOnly.state.value?.result)
    }

    func testCalcuttaPublicationRevocationCannotResurrectPublishedCacheWhenReplacementWriteFails() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let published = calcuttaResponse(published: true, publicationRevision: 1)
        let unpublished = calcuttaResponse(published: false, publicationRevision: 2)
        let fetcher = ScriptedProductFetcher<MobileCalcuttaResponse>(steps: [
            .modified(published, etag: #""calcutta-published""#),
            .modified(unpublished, etag: #""calcutta-unpublished""#),
        ])
        let repository = makeCalcuttaRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.publicationState, .published)
        await cache.failWrites(with: MobileAPIClientError.transportUnavailable)

        await repository.refresh()

        XCTAssertEqual(repository.state.value?.publicationState, .unpublished)
        XCTAssertNil(repository.state.value?.market)
        XCTAssertNil(repository.state.value?.result)
        XCTAssertTrue(repository.state.cachePersistenceIssue)
        let persisted = await cache.storedData(product: .calcutta, partition: context.cachePartition)
        XCTAssertNil(persisted, "The older published representation remained eligible after revocation.")

        let relaunched = makeCalcuttaRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [])
        )
        await relaunched.activate(context, beginRefresh: false)
        XCTAssertNil(relaunched.state.value, "Relaunch resurrected revoked published Calcutta values.")
    }

    func testNetSkinsOfficialToConfiguredResponseImmediatelyHidesOfficialResults() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let official = netSkinsResponse(official: true)
        let configured = netSkinsResponse(official: false)
        let fetcher = ScriptedProductFetcher<MobileNetSkinsResponse>(steps: [
            .modified(official, etag: #"\"net-skins-official\""#),
            .modified(configured, etag: #"\"net-skins-configured\""#),
        ])
        let repository = makeNetSkinsRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.state, .official)
        XCTAssertNotNil(repository.state.value?.rounds.first?.officialResults)

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.state, .configured)
        XCTAssertFalse(repository.state.value?.published ?? true)
        XCTAssertNil(repository.state.value?.rounds.first?.officialResults)
    }

    func testMixedInProgressNetSkinsRevocationCannotResurrectOfficialRoundWhenReplacementWriteFails() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let mixedPublished = netSkinsResponse(official: true, aggregateState: .inProgress)
        let configured = netSkinsResponse(official: false)
        let fetcher = ScriptedProductFetcher<MobileNetSkinsResponse>(steps: [
            .modified(mixedPublished, etag: #""net-skins-mixed""#),
            .modified(configured, etag: #""net-skins-configured""#),
        ])
        let repository = makeNetSkinsRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        await repository.refresh()
        XCTAssertEqual(repository.state.value?.state, .inProgress)
        XCTAssertTrue(repository.state.value?.published ?? false)
        XCTAssertNotNil(repository.state.value?.rounds.first?.officialResults)
        await cache.failWrites(with: MobileAPIClientError.transportUnavailable)

        await repository.refresh()

        XCTAssertEqual(repository.state.value?.state, .configured)
        XCTAssertFalse(repository.state.value?.published ?? true)
        XCTAssertNil(repository.state.value?.rounds.first?.officialResults)
        XCTAssertTrue(repository.state.cachePersistenceIssue)
        let persisted = await cache.storedData(product: .netSkins, partition: context.cachePartition)
        XCTAssertNil(persisted)

        let relaunched = makeNetSkinsRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [])
        )
        await relaunched.activate(context, beginRefresh: false)
        XCTAssertNil(relaunched.state.value)
    }

    func testOneOfMultipleOfficialRoundsCannotResurfaceWhenReplacementWriteFails() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let bothOfficial = mixedNetSkinsResponse(
            officialRoundIDs: ["round-preview-1", "round-preview-2"],
            configuredRoundIDs: []
        )
        let firstRoundRevoked = mixedNetSkinsResponse(
            officialRoundIDs: ["round-preview-2"],
            configuredRoundIDs: ["round-preview-1"]
        )
        let fetcher = ScriptedProductFetcher<MobileNetSkinsResponse>(steps: [
            .modified(bothOfficial, etag: #""net-skins-two-official""#),
            .modified(firstRoundRevoked, etag: #""net-skins-one-official""#),
        ])
        let repository = makeNetSkinsRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        await repository.refresh()
        XCTAssertEqual(
            repository.state.value?.revocableParticipantRepresentationKeys,
            ["official-round:round-preview-1", "official-round:round-preview-2"]
        )
        await cache.failWrites(with: MobileAPIClientError.transportUnavailable)

        await repository.refresh()

        XCTAssertEqual(repository.state.value?.state, .inProgress)
        XCTAssertTrue(repository.state.value?.published ?? false)
        XCTAssertEqual(
            repository.state.value?.revocableParticipantRepresentationKeys,
            ["official-round:round-preview-2"]
        )
        XCTAssertNil(
            repository.state.value?.rounds.first(where: { $0.roundId == "round-preview-1" })?.officialResults
        )
        XCTAssertTrue(repository.state.cachePersistenceIssue)
        let persisted = await cache.storedData(product: .netSkins, partition: context.cachePartition)
        XCTAssertNil(persisted, "The cache retained a representation containing the revoked Round.")

        let relaunched = makeNetSkinsRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [])
        )
        await relaunched.activate(context, beginRefresh: false)
        XCTAssertNil(relaunched.state.value, "Relaunch resurrected the revoked official Round.")
    }

    func testTransientOfflineFailureRetainsEligibleCacheAndColdFailureShowsNoData() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let seed = makeCalcuttaRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [
                .modified(TestFixtures.calcuttaResponse, etag: #"\"calcutta-1\""#),
            ])
        )
        await seed.activate(context, beginRefresh: false)
        await seed.refresh()

        let warmOffline = makeCalcuttaRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [
                .failure(MobileAPIClientError.transportUnavailable),
            ])
        )
        await warmOffline.activate(context, beginRefresh: false)
        await warmOffline.refresh()
        XCTAssertEqual(warmOffline.state.value, TestFixtures.calcuttaResponse.data)
        XCTAssertEqual(warmOffline.state.freshness, .offline)
        XCTAssertEqual(warmOffline.state.lastSafeError, .transport)

        let emptyCache = LeadersMemoryCache()
        let coldOffline = makeNetSkinsRepository(
            cache: emptyCache,
            fetcher: ScriptedProductFetcher(steps: [
                .failure(MobileAPIClientError.transportUnavailable),
            ])
        )
        await coldOffline.activate(context, beginRefresh: false)
        await coldOffline.refresh()
        XCTAssertNil(coldOffline.state.value)
        XCTAssertEqual(coldOffline.state.freshness, .failed)
        XCTAssertEqual(coldOffline.state.lastSafeError, .transport)
    }

    func testParticipantAndTournamentMismatchesFailClosedWithoutPersistence() async throws {
        let cache = LeadersMemoryCache()
        let wrongPlayerContext = try makeContext(playerID: "different-player")
        let netSkins = makeNetSkinsRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [
                .modified(TestFixtures.netSkinsResponse, etag: #"\"net-skins-1\""#),
            ])
        )
        await netSkins.activate(wrongPlayerContext, beginRefresh: false)
        await netSkins.refresh()
        XCTAssertNil(netSkins.state.value)
        XCTAssertEqual(netSkins.state.lastSafeError, .contract)
        let netSkinsPersisted = await cache.storedData(
            product: .netSkins,
            partition: wrongPlayerContext.cachePartition
        )
        XCTAssertNil(netSkinsPersisted)

        let calcuttaWrongPlayer = makeCalcuttaRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [
                .modified(TestFixtures.calcuttaResponse, etag: #"\"calcutta-wrong-player\""#),
            ])
        )
        await calcuttaWrongPlayer.activate(wrongPlayerContext, beginRefresh: false)
        await calcuttaWrongPlayer.refresh()
        XCTAssertNil(calcuttaWrongPlayer.state.value)
        XCTAssertEqual(calcuttaWrongPlayer.state.lastSafeError, .contract)
        let calcuttaWrongPlayerPersisted = await cache.storedData(
            product: .calcutta,
            partition: wrongPlayerContext.cachePartition
        )
        XCTAssertNil(calcuttaWrongPlayerPersisted)

        let wrongTournamentContext = try makeContext(tournamentID: "different-tournament")
        let calcutta = makeCalcuttaRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [
                .modified(TestFixtures.calcuttaResponse, etag: #"\"calcutta-1\""#),
            ])
        )
        await calcutta.activate(wrongTournamentContext, beginRefresh: false)
        await calcutta.refresh()
        XCTAssertNil(calcutta.state.value)
        XCTAssertEqual(calcutta.state.lastSafeError, .contract)
        let calcuttaPersisted = await cache.storedData(
            product: .calcutta,
            partition: wrongTournamentContext.cachePartition
        )
        XCTAssertNil(calcuttaPersisted)

        let netSkinsWrongTournament = makeNetSkinsRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [
                .modified(TestFixtures.netSkinsResponse, etag: #"\"net-skins-wrong-tournament\""#),
            ])
        )
        await netSkinsWrongTournament.activate(wrongTournamentContext, beginRefresh: false)
        await netSkinsWrongTournament.refresh()
        XCTAssertNil(netSkinsWrongTournament.state.value)
        XCTAssertEqual(netSkinsWrongTournament.state.lastSafeError, .contract)
        let netSkinsWrongTournamentPersisted = await cache.storedData(
            product: .netSkins,
            partition: wrongTournamentContext.cachePartition
        )
        XCTAssertNil(netSkinsWrongTournamentPersisted)
    }

    func testConcurrentNetSkinsRefreshesDeduplicateToOneRequest() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let fetcher = ScriptedProductFetcher<MobileNetSkinsResponse>(steps: [
            .modified(TestFixtures.netSkinsResponse, etag: #"\"net-skins-1\""#),
        ])
        fetcher.suspendNextRequest()
        let repository = makeNetSkinsRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        let first = Task { @MainActor in await repository.refresh() }
        for _ in 0..<1_000 where !fetcher.isSuspended { await Task.yield() }
        XCTAssertTrue(fetcher.isSuspended)
        let second = Task { @MainActor in await repository.refresh() }
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(fetcher.callCount, 1)

        fetcher.releaseSuspendedRequest()
        await first.value
        await second.value

        XCTAssertEqual(fetcher.callCount, 1)
        XCTAssertEqual(repository.state.value, TestFixtures.netSkinsResponse.data)
    }

    func testConcurrentCalcuttaRefreshesDeduplicateToOneRequest() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        let response = calcuttaResponse(published: true, publicationRevision: 1)
        let fetcher = ScriptedProductFetcher<MobileCalcuttaResponse>(steps: [
            .modified(response, etag: #"\"calcutta-1\""#),
        ])
        fetcher.suspendNextRequest()
        let repository = makeCalcuttaRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        let first = Task { @MainActor in await repository.refresh() }
        for _ in 0..<1_000 where !fetcher.isSuspended { await Task.yield() }
        XCTAssertTrue(fetcher.isSuspended)
        let second = Task { @MainActor in await repository.refresh() }
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(fetcher.callCount, 1)

        fetcher.releaseSuspendedRequest()
        await first.value
        await second.value

        XCTAssertEqual(fetcher.callCount, 1)
        XCTAssertEqual(repository.state.value, response.data)
    }

    func testCorruptCalcuttaCacheIsRemovedWithoutBecomingVisible() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        await cache.setRaw(Data("not-json".utf8), product: .calcutta, partition: context.cachePartition)
        let repository = makeCalcuttaRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [])
        )

        await repository.activate(context, beginRefresh: false)

        XCTAssertEqual(repository.state, .empty)
        let persisted = await cache.storedData(product: .calcutta, partition: context.cachePartition)
        let removalCount = await cache.removeProductCount
        XCTAssertNil(persisted)
        XCTAssertEqual(removalCount, 1)
    }

    func testCorruptNetSkinsCacheIsRemovedWithoutBecomingVisible() async throws {
        let cache = LeadersMemoryCache()
        let context = try makeContext()
        await cache.setRaw(Data("not-json".utf8), product: .netSkins, partition: context.cachePartition)
        let repository = makeNetSkinsRepository(
            cache: cache,
            fetcher: ScriptedProductFetcher(steps: [])
        )

        await repository.activate(context, beginRefresh: false)

        XCTAssertEqual(repository.state, .empty)
        let persisted = await cache.storedData(product: .netSkins, partition: context.cachePartition)
        let removalCount = await cache.removeProductCount
        XCTAssertNil(persisted)
        XCTAssertEqual(removalCount, 1)
    }

    private func makeNetSkinsRepository(
        cache: LeadersMemoryCache,
        fetcher: ScriptedProductFetcher<MobileNetSkinsResponse>
    ) -> MobileReadRepository<MobileNetSkinsResponse> {
        MobileReadRepository(
            product: .netSkins,
            cache: cache,
            credentialProvider: LeadersCredentialProvider(),
            now: { TestFixtures.now }
        ) { credentials, etag in
            try await fetcher.fetch(credentials: credentials, etag: etag)
        }
    }

    private func makeCalcuttaRepository(
        cache: LeadersMemoryCache,
        fetcher: ScriptedProductFetcher<MobileCalcuttaResponse>
    ) -> MobileReadRepository<MobileCalcuttaResponse> {
        MobileReadRepository(
            product: .calcutta,
            cache: cache,
            credentialProvider: LeadersCredentialProvider(),
            now: { TestFixtures.now }
        ) { credentials, etag in
            try await fetcher.fetch(credentials: credentials, etag: etag)
        }
    }

    private func makeContext(
        playerID: String = TestFixtures.participant.player.playerId,
        tournamentID: String = TestFixtures.participant.tournament.tournamentId
    ) throws -> ActiveMobileReadContext {
        ActiveMobileReadContext(
            cachePartition: try ReadCachePartition(
                environment: "preview",
                authUserID: TestFixtures.authSession.userID,
                playerID: playerID,
                tournamentID: tournamentID
            ),
            authUserID: TestFixtures.authSession.userID,
            playerID: playerID,
            tournamentID: tournamentID
        )
    }

    private func netSkinsResponse(
        official: Bool,
        aggregateState: MobileNetSkinsState? = nil
    ) -> MobileNetSkinsResponse {
        let state: MobileNetSkinsState = aggregateState ?? (official ? .official : .configured)
        let roundState: MobileNetSkinsRoundState = official ? .official : .configured
        let resultRevision: Int? = official ? 1 : nil
        let participantID = TestFixtures.participant.player.playerId
        let entry = MobileNetSkinsEntry(
            entryId: "entry-preview-1",
            entryType: .individual,
            matchId: "match-preview-1",
            playerIds: [participantID]
        )
        let officialResults: MobileNetSkinsOfficialResults? = official
            ? MobileNetSkinsOfficialResults(
                pot: try! MobileCanonicalNumber(20),
                eligibleCount: 1,
                completedHoles: 18,
                skinsAwarded: 1,
                skinValue: try! MobileCanonicalNumber(20),
                complete: true,
                finalized: true,
                skins: [
                    MobileNetSkin(
                        skinId: "skin-preview-1",
                        holeNumber: 7,
                        matchId: "match-preview-1",
                        winnerEntryId: entry.entryId,
                        winnerPlayerIds: [participantID],
                        winningNetScore: try! MobileCanonicalNumber(3),
                        skinValue: try! MobileCanonicalNumber(20)
                    ),
                ],
                leaderboard: [
                    MobileNetSkinsLeaderboardRow(
                        rank: 1,
                        displayRank: "1",
                        entryId: entry.entryId,
                        playerIds: [participantID],
                        skinsWon: 1,
                        totalWinnings: try! MobileCanonicalNumber(20),
                        winningHoleNumbers: [7]
                    ),
                ]
            )
            : nil
        return MobileNetSkinsResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileNetSkinsData(
                contractVersion: "production-net-skins-v1",
                tournamentId: TestFixtures.participant.tournament.tournamentId,
                state: state,
                publicationPolicy: "OFFICIAL_ONLY",
                published: official,
                configurationRevision: 1,
                resultRevision: resultRevision,
                configurationFingerprint: String(repeating: "a", count: 64),
                revision: "net-skins-v1:1:\(resultRevision ?? 0):\(state.rawValue)",
                freshness: MobileNetSkinsFreshness(
                    stale: false,
                    configuredAt: nil,
                    calculatedAt: nil,
                    publishedAt: nil,
                    sourceFingerprint: nil
                ),
                rounds: [
                    MobileNetSkinsRound(
                        roundId: "round-preview-1",
                        roundNumber: 1,
                        format: .singles,
                        entryType: .individual,
                        matchIds: ["match-preview-1"],
                        buyInPerEntry: try! MobileCanonicalNumber(20),
                        eligibleEntryCount: 1,
                        eligiblePlayerIds: [participantID],
                        state: roundState,
                        configurationRevision: 1,
                        resultRevision: resultRevision,
                        configurationFingerprint: String(repeating: "a", count: 64),
                        freshness: MobileNetSkinsFreshness(
                            stale: false,
                            configuredAt: nil,
                            calculatedAt: nil,
                            publishedAt: nil,
                            sourceFingerprint: nil
                        ),
                        entries: [entry],
                        officialResults: officialResults
                    ),
                ],
                player: MobileNetSkinsPlayerContext(
                    playerId: participantID,
                    eligibleRoundIds: ["round-preview-1"],
                    entryIds: [entry.entryId]
                )
            ),
            meta: MobileReadMeta(
                generatedAt: TestFixtures.readMeta.generatedAt,
                revision: "net-skins-meta-\(official ? "official" : "configured")"
            )
        )
    }

    private func mixedNetSkinsResponse(
        officialRoundIDs: [String],
        configuredRoundIDs: [String]
    ) -> MobileNetSkinsResponse {
        let officialTemplate = netSkinsResponse(official: true, aggregateState: .inProgress).data
        let configuredTemplate = netSkinsResponse(official: false, aggregateState: .inProgress).data
        let orderedRoundIDs = configuredRoundIDs + officialRoundIDs
        let rounds = orderedRoundIDs.enumerated().map { offset, roundID in
            let source = officialRoundIDs.contains(roundID)
                ? officialTemplate.rounds[0]
                : configuredTemplate.rounds[0]
            return MobileNetSkinsRound(
                roundId: roundID,
                roundNumber: offset + 1,
                format: source.format,
                entryType: source.entryType,
                matchIds: source.matchIds,
                buyInPerEntry: source.buyInPerEntry,
                eligibleEntryCount: source.eligibleEntryCount,
                eligiblePlayerIds: source.eligiblePlayerIds,
                state: source.state,
                configurationRevision: source.configurationRevision,
                resultRevision: source.resultRevision,
                configurationFingerprint: source.configurationFingerprint,
                freshness: source.freshness,
                entries: source.entries,
                officialResults: source.officialResults
            )
        }
        let participantID = TestFixtures.participant.player.playerId
        let entryIDs = officialTemplate.rounds[0].entries.map(\.entryId)
        let data = MobileNetSkinsData(
            contractVersion: officialTemplate.contractVersion,
            tournamentId: officialTemplate.tournamentId,
            state: .inProgress,
            publicationPolicy: officialTemplate.publicationPolicy,
            published: !officialRoundIDs.isEmpty,
            configurationRevision: officialTemplate.configurationRevision,
            resultRevision: officialRoundIDs.isEmpty ? nil : 1,
            configurationFingerprint: officialTemplate.configurationFingerprint,
            revision: "net-skins-v1:1:\(officialRoundIDs.isEmpty ? 0 : 1):IN_PROGRESS",
            freshness: officialTemplate.freshness,
            rounds: rounds,
            player: MobileNetSkinsPlayerContext(
                playerId: participantID,
                eligibleRoundIds: orderedRoundIDs,
                entryIds: entryIDs
            )
        )
        return MobileNetSkinsResponse(
            ok: true,
            apiVersion: "v1",
            data: data,
            meta: MobileReadMeta(
                generatedAt: TestFixtures.readMeta.generatedAt,
                revision: "net-skins-meta-\(officialRoundIDs.joined(separator: "-"))"
            )
        )
    }

    private func calcuttaResponse(
        published: Bool,
        publicationRevision: Int
    ) -> MobileCalcuttaResponse {
        let participant = MobileCalcuttaPlayer(
            playerId: TestFixtures.participant.player.playerId,
            displayName: TestFixtures.participant.player.displayName
        )
        let market = published
            ? MobileCalcuttaMarket(
                pot: try! MobileNonnegativeDecimalString("123456.78"),
                purchases: [
                    MobileCalcuttaPurchase(
                        player: participant,
                        purchasePrice: try! MobileNonnegativeDecimalString("123456.78"),
                        owners: [
                            MobileCalcuttaOwner(
                                player: participant,
                                ownershipFraction: try! MobileOwnershipFractionString("1")
                            ),
                        ]
                    ),
                ]
            )
            : nil
        let publicationState: MobileCalcuttaPublicationState = published ? .published : .unpublished
        return MobileCalcuttaResponse(
            ok: true,
            apiVersion: "v1",
            data: MobileCalcuttaData(
                contractVersion: "production-calcutta-v1",
                tournamentId: TestFixtures.participant.tournament.tournamentId,
                state: .auctionComplete,
                publicationState: publicationState,
                published: published,
                currencyCode: "USD",
                configurationRevision: 1,
                auctionRevision: 1,
                publicationRevision: publicationRevision,
                resultRevision: nil,
                configurationFingerprint: String(repeating: "a", count: 64),
                auctionFingerprint: String(repeating: "b", count: 64),
                revision: "calcutta-v1:1:1:\(publicationRevision):0:AUCTION_COMPLETE:\(publicationState.rawValue)",
                freshness: MobileCalcuttaFreshness(
                    stale: false,
                    updating: false,
                    configuredAt: nil,
                    auctionUpdatedAt: nil,
                    publishedAt: nil,
                    calculatedAt: nil,
                    sourceFingerprint: nil
                ),
                market: market,
                result: nil,
                viewer: MobileCalcuttaViewer(playerId: participant.playerId)
            ),
            meta: MobileReadMeta(
                generatedAt: TestFixtures.readMeta.generatedAt,
                revision: "calcutta-meta-\(publicationRevision)"
            )
        )
    }
}

@MainActor
private final class LeadersCredentialProvider: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: TestFixtures.authSession.accessToken,
            certification: TestFixtures.certificationToken
        )
    }
}

@MainActor
private final class ScriptedProductFetcher<Response: Sendable> {
    enum Step {
        case modified(Response, etag: String?)
        case notModified(etag: String?)
        case failure(any Error)
    }

    private var steps: [Step]
    private var shouldSuspendNextRequest = false
    private var continuation: CheckedContinuation<Void, Never>?
    private(set) var callCount = 0
    private(set) var receivedETags: [String?] = []
    private(set) var isSuspended = false

    init(steps: [Step]) {
        self.steps = steps
    }

    func suspendNextRequest() {
        shouldSuspendNextRequest = true
    }

    func releaseSuspendedRequest() {
        continuation?.resume()
        continuation = nil
        isSuspended = false
    }

    func fetch(
        credentials: MobileReadCredentials,
        etag: String?
    ) async throws -> MobileConditionalRead<Response> {
        callCount += 1
        receivedETags.append(etag)
        if shouldSuspendNextRequest {
            shouldSuspendNextRequest = false
            isSuspended = true
            await withCheckedContinuation { continuation in
                self.continuation = continuation
            }
        }
        guard !steps.isEmpty else { throw MobileAPIClientError.transportUnavailable }
        switch steps.removeFirst() {
        case .modified(let response, let etag): return .modified(response, etag: etag)
        case .notModified(let etag): return .notModified(etag: etag)
        case .failure(let error): throw error
        }
    }
}

private actor LeadersMemoryCache: ReadCacheStoring {
    private var values: [String: Data] = [:]
    private var writeError: (any Error)?
    private(set) var removeProductCount = 0

    func read(product: MobileReadProduct, partition: ReadCachePartition) -> Data? {
        values[key(product: product, partition: partition)]
    }

    func write(_ data: Data, product: MobileReadProduct, partition: ReadCachePartition) throws {
        if let writeError { throw writeError }
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
