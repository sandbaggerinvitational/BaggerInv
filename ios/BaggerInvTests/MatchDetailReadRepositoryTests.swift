import Foundation
import XCTest
@testable import BaggerInv

@MainActor
final class MatchDetailReadRepositoryTests: XCTestCase {
    private let accessToken = "match-detail-access-token-never-log"
    private let certification = "match-detail-certification-never-log"

    func testAPIUsesExactBoundedProtectedPathAndRoundTripsETag() async throws {
        let response = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .inProgress,
            matchID: "round-1:match.2",
            holesPlayed: 6
        )
        let returnedETag = #"W/\"match-detail-2\""#
        let sentETag = #"\"match-detail-1\""#
        let transport = MatchDetailHTTPTransport(steps: [
            .response(
                status: 200,
                data: try JSONEncoder().encode(response),
                headers: ["ETag": returnedETag]
            ),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        let result = try await client.matchDetail(
            matchID: "round-1:match.2",
            accessToken: accessToken,
            certification: certification,
            etag: sentETag
        )

        let recordedRequests = await transport.requests()
        let request = try XCTUnwrap(recordedRequests.first)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url?.path, "/api/mobile/v1/matches/round-1:match.2")
        XCTAssertNil(request.url?.query)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(accessToken)")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Bagger-Certification"), certification)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Cache-Control"), "no-cache")
        XCTAssertEqual(request.value(forHTTPHeaderField: "If-None-Match"), sentETag)
        guard case .modified(let decoded, let validator) = result else {
            return XCTFail("Expected a modified Match Detail representation")
        }
        XCTAssertEqual(decoded, response)
        XCTAssertEqual(validator, returnedETag)
    }

    func testAPIAccepts304WithoutBodyAndPreservesReturnedValidator() async throws {
        let returnedETag = #"W/\"match-detail-unchanged\""#
        let transport = MatchDetailHTTPTransport(steps: [
            .response(status: 304, data: Data(), headers: ["ETag": returnedETag]),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        let result = try await client.matchDetail(
            matchID: "match-preview-2",
            accessToken: accessToken,
            certification: certification,
            etag: #"\"match-detail-cached\""#
        )

        guard case .notModified(let validator) = result else {
            return XCTFail("Expected an HTTP 304 representation")
        }
        XCTAssertEqual(validator, returnedETag)
    }

    func testAPIRejectsInvalidMatchIDAndMissingProtectedCredentialsBeforeTransport() async throws {
        let transport = MatchDetailHTTPTransport(steps: [])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        for unsafeID in ["", ".", "..", "match\u{0}id", String(repeating: "m", count: 201)] {
            do {
                _ = try await client.matchDetail(
                    matchID: unsafeID,
                    accessToken: accessToken,
                    certification: certification,
                    etag: nil
                )
                XCTFail("Unsafe Match ID must fail before transport")
            } catch {
                XCTAssertEqual(error as? MobileAPIClientError, .invalidURL)
            }
        }

        do {
            _ = try await client.matchDetail(
                matchID: "match-preview-2",
                accessToken: "",
                certification: certification,
                etag: nil
            )
            XCTFail("Missing bearer must fail before transport")
        } catch {
            XCTAssertEqual(error as? MobileAPIClientError, .missingBearer)
        }
        do {
            _ = try await client.matchDetail(
                matchID: "match-preview-2",
                accessToken: accessToken,
                certification: "",
                etag: nil
            )
            XCTFail("Missing certification must fail before transport")
        } catch {
            XCTAssertEqual(error as? MobileAPIClientError, .missingCertification)
        }

        let requestCount = await transport.requestCount()
        XCTAssertEqual(requestCount, 0)
    }

    func testAPIRejectsResponseLargerThan256KiBBeforeDecode() async throws {
        let transport = MatchDetailHTTPTransport(steps: [
            .response(status: 200, data: Data(repeating: 0x20, count: 256 * 1_024 + 1), headers: [:]),
        ])
        let client = MobileAPIClient(baseURL: NativeEnvironment.previewAPIURL, transport: transport)

        do {
            _ = try await client.matchDetail(
                matchID: "match-preview-2",
                accessToken: accessToken,
                certification: certification,
                etag: nil
            )
            XCTFail("An oversized Match Detail response must fail closed")
        } catch {
            XCTAssertEqual(error as? MobileContractError, .incompatibleResponse)
        }
    }

    func testDynamicCacheKeyBindsExactMatchIDAndUsesOpaqueFilename() throws {
        let first = try MobileReadCacheKey(matchID: "round-3-match-10")
        let second = try MobileReadCacheKey(matchID: "round-3-match-11")

        XCTAssertEqual(first.product, .matchDetail)
        XCTAssertEqual(first.matchID, "round-3-match-10")
        XCTAssertNil(first.historyYear)
        XCTAssertNotEqual(first.filename, second.filename)
        XCTAssertTrue(first.filename.hasPrefix("matchDetail-"))
        XCTAssertTrue(first.filename.hasSuffix(".json"))
        XCTAssertFalse(first.filename.contains("round-3-match-10"))
        XCTAssertEqual(first, try JSONDecoder().decode(
            MobileReadCacheKey.self,
            from: JSONEncoder().encode(first)
        ))
        let reserved = try MobileReadCacheKey(matchID: "match:round/3#opaque")
        XCTAssertEqual(reserved.matchID, "match:round/3#opaque")
        XCTAssertNotEqual(reserved.filename, first.filename)
        XCTAssertThrowsError(try MobileReadCacheKey(matchID: "."))
        XCTAssertThrowsError(try MobileReadCacheKey(matchID: ".."))
        XCTAssertThrowsError(try MobileReadCacheKey(matchID: "match\u{0}id"))
    }

    func testPartitionIncludesEnvironmentAuthPlayerAndTournament() throws {
        let base = try context()
        let differentEnvironment = try context(environment: "preview-two")
        let differentAuth = try context(authUserID: "auth-user-2")
        let differentPlayer = try context(playerID: "player-preview-2")
        let differentTournament = try context(tournamentID: "tournament-preview-2")

        XCTAssertNotEqual(base.cachePartition, differentEnvironment.cachePartition)
        XCTAssertNotEqual(base.cachePartition, differentAuth.cachePartition)
        XCTAssertNotEqual(base.cachePartition, differentPlayer.cachePartition)
        XCTAssertNotEqual(base.cachePartition, differentTournament.cachePartition)
    }

    func testCold200PublishesAndPersistsExactMatchRepresentation() async throws {
        let cache = MatchDetailMemoryCache()
        let response = MatchDetailFixtureFactory.response(
            format: .bestBall,
            status: .inProgress,
            holesPlayed: 6
        )
        let fetcher = ScriptedMatchDetailFetcher(steps: [
            .modified(response, etag: #"\"match-detail-1\""#),
        ])
        let harness = try makeHarness(cache: cache, fetcher: fetcher)

        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()

        XCTAssertEqual(harness.repository.state.value, response.data)
        XCTAssertEqual(harness.repository.state.source, .network)
        XCTAssertEqual(harness.repository.state.freshness, .fresh)
        XCTAssertEqual(harness.repository.state.lastHTTPStatus, 200)
        let stored = await cache.storedData(key: harness.key, partition: harness.context.cachePartition)
        let lastWrittenKey = await cache.lastWrittenKey()
        XCTAssertNotNil(stored)
        XCTAssertEqual(lastWrittenKey, harness.key)
    }

    func testWarmCacheAppearsBefore304RevalidationAndRoundTripsValidator() async throws {
        let cache = MatchDetailMemoryCache()
        let context = try context()
        let response = MatchDetailFixtureFactory.response(
            format: .singles,
            status: .completed,
            holesPlayed: 18
        )
        let initialFetcher = ScriptedMatchDetailFetcher(steps: [
            .modified(response, etag: #"W/\"match-detail-1\""#),
        ])
        let initial = try makeRepository(
            matchID: response.data.match.matchId,
            cache: cache,
            fetcher: initialFetcher
        )
        await initial.activate(context, beginRefresh: false)
        await initial.refresh()
        let fetchedAt = initial.state.fetchedAt

        let revalidation = ScriptedMatchDetailFetcher(steps: [
            .notModified(etag: #"W/\"match-detail-1\""#),
        ])
        let restored = try makeRepository(
            matchID: response.data.match.matchId,
            cache: cache,
            fetcher: revalidation
        )
        await restored.activate(context, beginRefresh: false)

        XCTAssertEqual(restored.state.value, response.data)
        XCTAssertEqual(restored.state.source, .diskCache)
        XCTAssertEqual(restored.state.freshness, .cached)

        await restored.refresh()

        XCTAssertEqual(restored.state.value, response.data)
        XCTAssertEqual(restored.state.freshness, .fresh)
        XCTAssertEqual(restored.state.lastHTTPStatus, 304)
        XCTAssertEqual(restored.state.fetchedAt, fetchedAt)
        XCTAssertEqual(revalidation.receivedETags, [#"W/\"match-detail-1\""#])
    }

    func testChanged200AtomicallyReplacesCachedRepresentation() async throws {
        let cache = MatchDetailMemoryCache()
        let context = try context()
        let initialResponse = MatchDetailFixtureFactory.response(
            status: .inProgress,
            holesPlayed: 4,
            revision: "revision-1"
        )
        let changedResponse = MatchDetailFixtureFactory.response(
            status: .inProgress,
            holesPlayed: 8,
            revision: "revision-2"
        )
        let fetcher = ScriptedMatchDetailFetcher(steps: [
            .modified(initialResponse, etag: #"\"revision-1\""#),
            .modified(changedResponse, etag: #"\"revision-2\""#),
        ])
        let repository = try makeRepository(cache: cache, fetcher: fetcher)
        await repository.activate(context, beginRefresh: false)

        await repository.refresh()
        await repository.refresh()

        XCTAssertEqual(repository.state.value?.match.progress.holesPlayed, 8)
        XCTAssertEqual(repository.state.revision, "revision-2")
        XCTAssertEqual(fetcher.receivedETags, [nil, #"\"revision-1\""#])

        let relaunched = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [])
        )
        await relaunched.activate(context, beginRefresh: false)
        XCTAssertEqual(relaunched.state.value?.match.progress.holesPlayed, 8)
    }

    func testOfflineWithCacheRetainsEligibleValueAndWithoutCacheFailsCleanly() async throws {
        let cache = MatchDetailMemoryCache()
        let context = try context()
        let response = MatchDetailFixtureFactory.response(status: .inProgress, holesPlayed: 5)
        let online = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [
                .modified(response, etag: #"\"match-detail-1\""#),
            ])
        )
        await online.activate(context, beginRefresh: false)
        await online.refresh()

        let offline = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [.failure(.transportUnavailable)])
        )
        await offline.activate(context, beginRefresh: false)
        await offline.refresh()
        XCTAssertEqual(offline.state.value, response.data)
        XCTAssertEqual(offline.state.freshness, .offline)
        XCTAssertEqual(offline.state.lastSafeError, .transport)

        let emptyOffline = try makeRepository(
            matchID: "match-without-cache",
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [.failure(.transportUnavailable)])
        )
        await emptyOffline.activate(context, beginRefresh: false)
        await emptyOffline.refresh()
        XCTAssertNil(emptyOffline.state.value)
        XCTAssertEqual(emptyOffline.state.freshness, .failed)
        XCTAssertEqual(emptyOffline.state.lastSafeError, .transport)
    }

    func testConcurrentRefreshesDeduplicateOneMatchRequest() async throws {
        let fetcher = ScriptedMatchDetailFetcher(
            steps: [.modified(MatchDetailFixtureFactory.response(), etag: #"\"one\""#)],
            delayNanoseconds: 100_000_000
        )
        let harness = try makeHarness(fetcher: fetcher)
        await harness.repository.activate(harness.context, beginRefresh: false)

        async let first: Void = harness.repository.refresh()
        async let second: Void = harness.repository.refresh()
        _ = await (first, second)

        XCTAssertEqual(fetcher.callCount, 1)
        XCTAssertNotNil(harness.repository.state.value)
    }

    func testExplicitCancellationCannotPublishCancelledResponseAndLaterRefreshRecovers() async throws {
        let cancelled = MatchDetailFixtureFactory.response(
            status: .inProgress,
            holesPlayed: 3,
            revision: "cancelled"
        )
        let recovered = MatchDetailFixtureFactory.response(
            status: .inProgress,
            holesPlayed: 7,
            revision: "recovered"
        )
        let fetcher = ScriptedMatchDetailFetcher(
            steps: [
                .modified(cancelled, etag: #"\"cancelled\""#),
                .modified(recovered, etag: #"\"recovered\""#),
            ],
            delayNanoseconds: 200_000_000
        )
        let harness = try makeHarness(fetcher: fetcher)
        await harness.repository.activate(harness.context, beginRefresh: false)
        let refresh = Task { await harness.repository.refresh() }
        while fetcher.callCount == 0 { await Task.yield() }

        await harness.repository.cancelRefresh()
        await refresh.value

        XCTAssertNil(harness.repository.state.value)
        XCTAssertNotEqual(harness.repository.state.revision, "cancelled")
        await harness.repository.refresh()
        XCTAssertEqual(harness.repository.state.revision, "recovered")
        XCTAssertEqual(harness.repository.state.value?.match.progress.holesPlayed, 7)
    }

    func testWrongMatchTournamentAndAuthenticatedIdentityFailClosedWithoutPersistence() async throws {
        let cases: [(String, MobileMatchDetailResponse, ActiveMobileReadContext)] = [
            (
                "wrong Match",
                MatchDetailFixtureFactory.response(matchID: "different-match"),
                try context()
            ),
            (
                "wrong tournament",
                MatchDetailFixtureFactory.response(tournamentID: "different-tournament"),
                try context()
            ),
            (
                "wrong Player",
                MatchDetailFixtureFactory.response(authenticatedPlayerID: "different-player"),
                try context()
            ),
        ]

        for (label, response, activeContext) in cases {
            let cache = MatchDetailMemoryCache()
            let fetcher = ScriptedMatchDetailFetcher(steps: [.modified(response, etag: #"\"wrong\""#)])
            let repository = try makeRepository(cache: cache, fetcher: fetcher)
            await repository.activate(activeContext, beginRefresh: false)
            await repository.refresh()

            XCTAssertNil(repository.state.value, label)
            XCTAssertEqual(repository.state.freshness, .failed, label)
            XCTAssertEqual(repository.state.lastSafeError, .contract, label)
            let key = try MobileReadCacheKey(matchID: MatchDetailFixtureFactory.response().data.match.matchId)
            let stored = await cache.storedData(key: key, partition: activeContext.cachePartition)
            XCTAssertNil(stored, label)
        }
    }

    func testCopiedEnvelopeForDifferentMatchIDIsRejectedAndRemoved() async throws {
        let cache = MatchDetailMemoryCache()
        let context = try context()
        let firstID = "match-preview-2"
        let secondID = "match-preview-3"
        let first = try makeRepository(
            matchID: firstID,
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [
                .modified(MatchDetailFixtureFactory.response(matchID: firstID), etag: #"\"first\""#),
            ])
        )
        await first.activate(context, beginRefresh: false)
        await first.refresh()
        let firstKey = try MobileReadCacheKey(matchID: firstID)
        let secondKey = try MobileReadCacheKey(matchID: secondID)
        let firstRaw = await cache.storedData(key: firstKey, partition: context.cachePartition)
        let raw = try XCTUnwrap(firstRaw)
        await cache.setRaw(raw, key: secondKey, partition: context.cachePartition)

        let second = try makeRepository(
            matchID: secondID,
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [])
        )
        await second.activate(context, beginRefresh: false)

        XCTAssertNil(second.state.value)
        let secondRaw = await cache.storedData(key: secondKey, partition: context.cachePartition)
        let removalCount = await cache.removeKeyCount()
        XCTAssertNil(secondRaw)
        XCTAssertGreaterThanOrEqual(removalCount, 1)
    }

    func testIdentityAndTournamentPartitionsCannotSeeExistingMatchCache() async throws {
        let cache = MatchDetailMemoryCache()
        let originalContext = try context()
        let original = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [
                .modified(MatchDetailFixtureFactory.response(), etag: #"\"one\""#),
            ])
        )
        await original.activate(originalContext, beginRefresh: false)
        await original.refresh()

        for isolatedContext in [
            try context(authUserID: "another-auth"),
            try context(playerID: "another-player"),
            try context(tournamentID: "another-tournament"),
        ] {
            let isolated = try makeRepository(
                cache: cache,
                fetcher: ScriptedMatchDetailFetcher(steps: [])
            )
            await isolated.activate(isolatedContext, beginRefresh: false)
            XCTAssertNil(isolated.state.value)
        }
    }

    func testSignOutStyleDeactivationDeletesDisposablePartition() async throws {
        let cache = MatchDetailMemoryCache()
        let harness = try makeHarness(cache: cache, fetcher: ScriptedMatchDetailFetcher(steps: [
            .modified(MatchDetailFixtureFactory.response(), etag: #"\"one\""#),
        ]))
        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()
        try await cache.write(
            Data("other disposable read".utf8),
            key: MobileReadCacheKey(product: .today),
            partition: harness.context.cachePartition
        )

        await harness.repository.deactivate(deleteCache: true)

        XCTAssertEqual(harness.repository.state, .empty)
        let remainingBytes = await cache.byteCount(partition: harness.context.cachePartition)
        let partitionRemovalCount = await cache.removePartitionCount()
        XCTAssertEqual(remainingBytes, 0)
        XCTAssertEqual(partitionRemovalCount, 1)
    }

    func testCanonicalVisibilityRevocationReplacesOfficialCachedFacts() async throws {
        let cache = MatchDetailMemoryCache()
        let context = try context()
        let official = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .completed,
            holesPlayed: 13,
            clinchHole: 13,
            revision: "official"
        )
        let revoked = MatchDetailFixtureFactory.response(
            format: .scramble,
            status: .scheduled,
            holesPlayed: 0,
            revision: "revoked"
        )
        let repository = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [
                .modified(official, etag: #"\"official\""#),
                .modified(revoked, etag: #"\"revoked\""#),
            ])
        )
        await repository.activate(context, beginRefresh: false)
        await repository.refresh()
        XCTAssertNotNil(repository.state.value?.match.result)
        XCTAssertNotNil(repository.state.value?.match.clinch)

        await repository.refresh()

        XCTAssertNil(repository.state.value?.match.result)
        XCTAssertNil(repository.state.value?.match.clinch)
        XCTAssertTrue(repository.state.value?.revocableParticipantRepresentationKeys.isEmpty ?? false)
        let relaunched = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [])
        )
        await relaunched.activate(context, beginRefresh: false)
        XCTAssertEqual(relaunched.state.revision, "revoked")
        XCTAssertNil(relaunched.state.value?.match.result)
        XCTAssertNil(relaunched.state.value?.match.clinch)
    }

    func testCanonicalMatchNotFoundWithdrawsCachedRepresentation() async throws {
        let cache = MatchDetailMemoryCache()
        let context = try context()
        let online = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [
                .modified(MatchDetailFixtureFactory.response(), etag: #"\"official\""#),
            ])
        )
        await online.activate(context, beginRefresh: false)
        await online.refresh()
        XCTAssertNotNil(online.state.value)

        let withdrawn = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [
                .failure(.server(code: .matchNotFound, status: 404)),
            ])
        )
        await withdrawn.activate(context, beginRefresh: false)
        XCTAssertNotNil(withdrawn.state.value)

        await withdrawn.refresh()

        XCTAssertNil(withdrawn.state.value)
        XCTAssertEqual(withdrawn.state.freshness, .failed)
        XCTAssertEqual(withdrawn.state.lastSafeError, .unavailable)
        XCTAssertEqual(withdrawn.state.lastServerCode, .matchNotFound)
        XCTAssertEqual(withdrawn.state.lastHTTPStatus, 404)
        let key = try MobileReadCacheKey(matchID: "match-preview-2")
        let persisted = await cache.storedData(key: key, partition: context.cachePartition)
        XCTAssertNil(persisted)
    }

    func testCorruptDynamicCacheIsDiscardedWithoutAffectingOtherMatch() async throws {
        let cache = MatchDetailMemoryCache()
        let context = try context()
        let firstKey = try MobileReadCacheKey(matchID: "match-preview-2")
        let secondKey = try MobileReadCacheKey(matchID: "match-preview-3")
        await cache.setRaw(Data("not-json".utf8), key: firstKey, partition: context.cachePartition)
        await cache.setRaw(Data("other-match".utf8), key: secondKey, partition: context.cachePartition)
        let repository = try makeRepository(
            cache: cache,
            fetcher: ScriptedMatchDetailFetcher(steps: [])
        )

        await repository.activate(context, beginRefresh: false)

        XCTAssertNil(repository.state.value)
        let removedFirst = await cache.storedData(key: firstKey, partition: context.cachePartition)
        let preservedSecond = await cache.storedData(key: secondKey, partition: context.cachePartition)
        XCTAssertNil(removedFirst)
        XCTAssertEqual(
            preservedSecond,
            Data("other-match".utf8)
        )
    }

    func test404ClearsPublishedContentBeforeBlockedDiskRemoval() async throws {
        let cache = MatchDetailMemoryCache()
        let harness = try makeHarness(cache: cache, fetcher: ScriptedMatchDetailFetcher(steps: [
            .modified(MatchDetailFixtureFactory.response(), etag: #""cached""#),
            .failure(.server(code: .matchNotFound, status: 404)),
        ]))
        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()
        XCTAssertNotNil(harness.repository.state.value)
        await cache.blockNextRemoval()

        let refresh = Task { await harness.repository.refresh() }
        while !(await cache.hasSuspendedRemoval()) { await Task.yield() }

        XCTAssertNil(harness.repository.state.value)
        XCTAssertNil(harness.repository.state.revision)
        XCTAssertFalse(harness.repository.state.isRefreshing)
        XCTAssertEqual(harness.repository.state.lastHTTPStatus, 404)
        XCTAssertEqual(harness.repository.state.freshness, .failed)
        let presentation = MatchDetailPresenter.make(
            state: harness.repository.state,
            requestedMatchID: "match-preview-2"
        )
        XCTAssertEqual(presentation.availability, .unavailable)
        XCTAssertNil(presentation.match)
        let stillOnDisk = await cache.storedData(key: harness.key, partition: harness.context.cachePartition)
        XCTAssertNotNil(stillOnDisk, "The UI must clear before the blocked delete can complete.")

        await cache.resumeRemoval()
        await refresh.value
        let removed = await cache.storedData(key: harness.key, partition: harness.context.cachePartition)
        XCTAssertNil(removed)
    }

    func test404FailedRemovalQuarantinesExactEntryAcrossReopenAndOffline() async throws {
        let cache = MatchDetailMemoryCache()
        let fetcher = ScriptedMatchDetailFetcher(steps: [
            .modified(MatchDetailFixtureFactory.response(), etag: #""cached""#),
            .failure(.unexpectedStatus(404)),
            .failure(.transportUnavailable),
            .modified(MatchDetailFixtureFactory.response(revision: "visible-again"), etag: #""new""#),
        ])
        let harness = try makeHarness(cache: cache, fetcher: fetcher)
        var accessInvalidations = 0
        harness.repository.setAccessInvalidationHandler { accessInvalidations += 1 }
        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()
        let otherKey = try MobileReadCacheKey(matchID: "other-match")
        let matchesKey = MobileReadCacheKey(product: .matches)
        await cache.setRaw(Data("other Match".utf8), key: otherKey, partition: harness.context.cachePartition)
        await cache.setRaw(Data("Matches list".utf8), key: matchesKey, partition: harness.context.cachePartition)
        await cache.setRemovalFailure(true)

        await harness.repository.refresh()

        XCTAssertNil(harness.repository.state.value)
        XCTAssertTrue(harness.repository.state.cachePersistenceIssue)
        XCTAssertEqual(accessInvalidations, 0, "Exact Match revocation is not sign-out.")
        let partitionRemovals = await cache.removePartitionCount()
        let otherData = await cache.storedData(key: otherKey, partition: harness.context.cachePartition)
        let matchesData = await cache.storedData(key: matchesKey, partition: harness.context.cachePartition)
        XCTAssertEqual(partitionRemovals, 0)
        XCTAssertEqual(otherData, Data("other Match".utf8))
        XCTAssertEqual(matchesData, Data("Matches list".utf8))

        await harness.repository.deactivate(deleteCache: false)
        await harness.repository.activate(harness.context, beginRefresh: false)
        XCTAssertNil(harness.repository.state.value)
        XCTAssertEqual(harness.repository.state.lastHTTPStatus, 404)
        await harness.repository.refresh()
        XCTAssertNil(harness.repository.state.value)
        XCTAssertEqual(harness.repository.state.freshness, .failed)
        XCTAssertNil(fetcher.receivedETags.last!)

        await cache.setRemovalFailure(false)
        await harness.repository.refresh()
        XCTAssertEqual(harness.repository.state.revision, "visible-again")
        XCTAssertNil(fetcher.receivedETags.last!, "Only a new canonical 200 can restore eligibility.")
        await harness.repository.deactivate(deleteCache: false)
        await harness.repository.activate(harness.context, beginRefresh: false)
        XCTAssertEqual(harness.repository.state.revision, "visible-again")
    }

    func test404FencesDelayedActivationFromRepublishingWithdrawnValue() async throws {
        let cache = MatchDetailMemoryCache()
        let context = try context()
        let initial = try makeRepository(cache: cache, fetcher: ScriptedMatchDetailFetcher(steps: [
            .modified(MatchDetailFixtureFactory.response(), etag: #""cached""#),
        ]))
        await initial.activate(context, beginRefresh: false)
        await initial.refresh()
        let repository = try makeRepository(cache: cache, fetcher: ScriptedMatchDetailFetcher(steps: [
            .failure(.server(code: .matchNotFound, status: 404)),
        ]))
        await cache.blockNextRead()
        let activation = Task { await repository.activate(context, beginRefresh: false) }
        while !(await cache.hasSuspendedRead()) { await Task.yield() }

        await repository.refresh()
        XCTAssertEqual(repository.state.lastHTTPStatus, 404)
        await cache.resumeRead()
        await activation.value

        XCTAssertNil(repository.state.value)
        XCTAssertEqual(repository.state.freshness, .failed)
        XCTAssertEqual(repository.state.lastHTTPStatus, 404)
    }

    func test404DelayedRemovalCannotClearANewerTournamentActivation() async throws {
        let cache = MatchDetailMemoryCache()
        let firstContext = try context()
        let secondContext = try context(tournamentID: "new-tournament")
        let repository = try makeRepository(cache: cache, fetcher: ScriptedMatchDetailFetcher(steps: [
            .modified(MatchDetailFixtureFactory.response(), etag: #""cached""#),
            .failure(.server(code: .matchNotFound, status: 404)),
            .modified(MatchDetailFixtureFactory.response(
                tournamentID: "new-tournament", revision: "new-tournament"
            ), etag: #""new""#),
        ]))
        await repository.activate(firstContext, beginRefresh: false)
        await repository.refresh()
        await cache.blockNextRemoval()
        let refresh = Task { await repository.refresh() }
        while !(await cache.hasSuspendedRemoval()) { await Task.yield() }
        let deactivation = Task { await repository.deactivate(deleteCache: false) }
        while repository.isActive { await Task.yield() }

        await repository.activate(secondContext, beginRefresh: false)
        await repository.refresh()
        XCTAssertEqual(repository.state.revision, "new-tournament")
        await cache.resumeRemoval()
        await refresh.value
        await deactivation.value

        XCTAssertEqual(repository.state.revision, "new-tournament")
        XCTAssertEqual(repository.state.freshness, .fresh)
        let key = try MobileReadCacheKey(matchID: "match-preview-2")
        let secondData = await cache.storedData(key: key, partition: secondContext.cachePartition)
        XCTAssertNotNil(secondData)
    }

    func testTimeoutAndTransientServerFailureRetainEligibleCachedMatch() async throws {
        let cache = MatchDetailMemoryCache()
        let response = MatchDetailFixtureFactory.response()
        let harness = try makeHarness(cache: cache, fetcher: ScriptedMatchDetailFetcher(steps: [
            .modified(response, etag: #""cached""#),
            .timeout,
            .failure(.unexpectedStatus(503)),
            .failure(.server(code: .mobileAPIUnavailable, status: 503)),
            .failure(.server(code: .matchNotFound, status: 503)),
        ]))
        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()
        await harness.repository.refresh()
        XCTAssertEqual(harness.repository.state.value, response.data)
        XCTAssertEqual(harness.repository.state.freshness, .offline)
        for _ in 0..<3 {
            await harness.repository.refresh()
            XCTAssertEqual(harness.repository.state.value, response.data)
            XCTAssertEqual(harness.repository.state.freshness, .stale)
        }
        let removals = await cache.removeKeyCount()
        XCTAssertEqual(removals, 0)
    }

    func testWarmCacheWrongTournamentAndIdentityResponsesFailClosed() async throws {
        for response in [
            MatchDetailFixtureFactory.response(tournamentID: "wrong-tournament"),
            MatchDetailFixtureFactory.response(authenticatedPlayerID: "wrong-player"),
        ] {
            let cache = MatchDetailMemoryCache()
            let harness = try makeHarness(cache: cache, fetcher: ScriptedMatchDetailFetcher(steps: [
                .modified(MatchDetailFixtureFactory.response(), etag: #""cached""#),
                .modified(response, etag: #""incompatible""#),
            ]))
            await harness.repository.activate(harness.context, beginRefresh: false)
            await harness.repository.refresh()
            XCTAssertNotNil(harness.repository.state.value)
            await harness.repository.refresh()
            XCTAssertNil(harness.repository.state.value)
            XCTAssertEqual(harness.repository.state.lastSafeError, .contract)
            let stored = await cache.storedData(key: harness.key, partition: harness.context.cachePartition)
            XCTAssertNil(stored)
        }
    }

    func testWarmCacheRejectedCanonicalDTOFailsClosedInsteadOfRetainingStaleProtectedContent() async throws {
        let cache = MatchDetailMemoryCache()
        let harness = try makeHarness(cache: cache, fetcher: ScriptedMatchDetailFetcher(steps: [
            .modified(MatchDetailFixtureFactory.response(), etag: #""cached""#),
            .incompatibleCanonicalResponse,
            .failure(.transportUnavailable),
        ]))
        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()
        XCTAssertNotNil(harness.repository.state.value)
        let otherKey = try MobileReadCacheKey(matchID: "other-match")
        await cache.setRaw(Data("other Match".utf8), key: otherKey, partition: harness.context.cachePartition)

        await harness.repository.refresh()

        XCTAssertNil(harness.repository.state.value)
        XCTAssertEqual(harness.repository.state.lastSafeError, .contract)
        XCTAssertEqual(harness.repository.state.freshness, .failed)
        let removed = await cache.storedData(key: harness.key, partition: harness.context.cachePartition)
        let preserved = await cache.storedData(key: otherKey, partition: harness.context.cachePartition)
        XCTAssertNil(removed)
        XCTAssertEqual(preserved, Data("other Match".utf8))
        let presentation = MatchDetailPresenter.make(state: harness.repository.state, requestedMatchID: "match-preview-2")
        XCTAssertEqual(presentation.availability, .loadError)
        XCTAssertNil(presentation.match)

        await harness.repository.deactivate(deleteCache: false)
        await harness.repository.activate(harness.context, beginRefresh: false)
        await harness.repository.refresh()
        XCTAssertNil(harness.repository.state.value)
        XCTAssertEqual(harness.repository.state.freshness, .failed)
    }

    func testDisk404QuarantineSurvivesFailedPhysicalDeleteAndStoreRecreation() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("MatchDetailRevocation-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let manager = MatchDetailRevocationFileManager(failQuarantineDeletion: true)
        let cache = try DiskReadCacheStore(rootDirectory: root, fileManager: manager)
        let partition = try context().cachePartition
        let revokedKey = try MobileReadCacheKey(matchID: "revoked-match")
        let otherKey = try MobileReadCacheKey(matchID: "other-match")
        let matchesKey = MobileReadCacheKey(product: .matches)
        try await cache.write(Data("revoked".utf8), key: revokedKey, partition: partition)
        try await cache.write(Data("other".utf8), key: otherKey, partition: partition)
        try await cache.write(Data("Matches".utf8), key: matchesKey, partition: partition)

        do {
            try await cache.remove(key: revokedKey, partition: partition)
            XCTFail("Physical deletion should report the injected storage failure.")
        } catch {
            XCTAssertEqual(error as? ReadCacheError, .storageUnavailable)
        }

        let originalURL = await cache.fileURL(key: revokedKey, partition: partition)
        XCTAssertFalse(FileManager.default.fileExists(atPath: originalURL.path))
        let reopened = try DiskReadCacheStore(rootDirectory: root)
        let revoked = try await reopened.read(key: revokedKey, partition: partition)
        let other = try await reopened.read(key: otherKey, partition: partition)
        let matches = try await reopened.read(key: matchesKey, partition: partition)
        XCTAssertNil(revoked)
        XCTAssertEqual(other, Data("other".utf8))
        XCTAssertEqual(matches, Data("Matches".utf8))
    }

    func testDisk404MarkerDeniesOldPathAfterRenameAndDeletionFailure() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("MatchDetailRevocation-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let manager = MatchDetailRevocationFileManager(failCanonicalDeletion: true, failEntryRename: true)
        let cache = try DiskReadCacheStore(rootDirectory: root, fileManager: manager)
        let partition = try context().cachePartition
        let key = try MobileReadCacheKey(matchID: "revoked-match")
        try await cache.write(Data("old protected representation".utf8), key: key, partition: partition)

        do {
            try await cache.remove(key: key, partition: partition)
            XCTFail("Deletion should report the injected storage failure.")
        } catch {
            XCTAssertEqual(error as? ReadCacheError, .storageUnavailable)
        }

        let reopened = try DiskReadCacheStore(rootDirectory: root)
        let oldData = try await reopened.read(key: key, partition: partition)
        XCTAssertNil(oldData, "The durable exact-key marker must deny the retained old file.")
        try await reopened.write(Data("new canonical representation".utf8), key: key, partition: partition)
        let recovered = try await reopened.read(key: key, partition: partition)
        XCTAssertEqual(recovered, Data("new canonical representation".utf8))
    }

    private func makeHarness(
        cache: MatchDetailMemoryCache = MatchDetailMemoryCache(),
        fetcher: ScriptedMatchDetailFetcher
    ) throws -> MatchDetailRepositoryHarness {
        let matchID = MatchDetailFixtureFactory.response().data.match.matchId
        return MatchDetailRepositoryHarness(
            repository: try makeRepository(matchID: matchID, cache: cache, fetcher: fetcher),
            cache: cache,
            fetcher: fetcher,
            key: try MobileReadCacheKey(matchID: matchID),
            context: try context()
        )
    }

    private func makeRepository(
        matchID: String = "match-preview-2",
        cache: MatchDetailMemoryCache,
        fetcher: ScriptedMatchDetailFetcher
    ) throws -> MobileReadRepository<MobileMatchDetailResponse> {
        MobileReadRepository(
            cacheKey: try MobileReadCacheKey(matchID: matchID),
            cache: cache,
            credentialProvider: MatchDetailCredentialProvider(),
            now: { Date(timeIntervalSince1970: 1_800_000_000) },
            responseValidator: { response, context in
                response.isCompatible(
                    expectedTournamentID: context.tournamentID,
                    expectedPlayerID: context.playerID
                ) && response.data.match.isCompatible(
                    expectedMatchId: matchID,
                    expectedPlayerId: context.playerID
                )
            },
            canonicalRevocationPredicate: { error in
                guard let apiError = error as? MobileAPIClientError else { return false }
                switch apiError {
                case .unexpectedStatus(let status):
                    return status == 404
                case .server(_, let status):
                    return status == 404
                default:
                    return false
                }
            }
        ) { credentials, etag in
            try await fetcher.fetch(credentials: credentials, etag: etag)
        }
    }

    private func context(
        environment: String = "preview",
        authUserID: String = "auth-user-preview-1",
        playerID: String = MatchDetailFixtureFactory.playerOneID,
        tournamentID: String = MatchDetailFixtureFactory.tournamentID
    ) throws -> ActiveMobileReadContext {
        ActiveMobileReadContext(
            cachePartition: try ReadCachePartition(
                environment: environment,
                authUserID: authUserID,
                playerID: playerID,
                tournamentID: tournamentID
            ),
            authUserID: authUserID,
            playerID: playerID,
            tournamentID: tournamentID
        )
    }
}

private struct MatchDetailRepositoryHarness {
    let repository: MobileReadRepository<MobileMatchDetailResponse>
    let cache: MatchDetailMemoryCache
    let fetcher: ScriptedMatchDetailFetcher
    let key: MobileReadCacheKey
    let context: ActiveMobileReadContext
}

@MainActor
private final class MatchDetailCredentialProvider: MobileReadCredentialProviding {
    func credentials(expectedAuthUserID: String) async throws -> MobileReadCredentials {
        MobileReadCredentials(
            authUserID: expectedAuthUserID,
            accessToken: "match-detail-access-token-never-log",
            certification: "match-detail-certification-never-log"
        )
    }
}

@MainActor
private final class ScriptedMatchDetailFetcher {
    enum Step {
        case modified(MobileMatchDetailResponse, etag: String?)
        case notModified(etag: String?)
        case failure(MobileAPIClientError)
        case timeout
        case incompatibleCanonicalResponse
    }

    private var steps: [Step]
    private let delayNanoseconds: UInt64
    private(set) var callCount = 0
    private(set) var receivedETags: [String?] = []

    init(steps: [Step], delayNanoseconds: UInt64 = 0) {
        self.steps = steps
        self.delayNanoseconds = delayNanoseconds
    }

    func fetch(
        credentials: MobileReadCredentials,
        etag: String?
    ) async throws -> MobileConditionalRead<MobileMatchDetailResponse> {
        callCount += 1
        receivedETags.append(etag)
        guard !steps.isEmpty else { throw MobileAPIClientError.transportUnavailable }
        let step = steps.removeFirst()
        if delayNanoseconds > 0 {
            try await Task.sleep(nanoseconds: delayNanoseconds)
        }
        switch step {
        case .modified(let response, let etag):
            return MobileConditionalRead.modified(response, etag: etag)
        case .notModified(let etag):
            return MobileConditionalRead.notModified(etag: etag)
        case .failure(let error): throw error
        case .timeout: throw URLError(.timedOut)
        case .incompatibleCanonicalResponse: throw MobileContractError.incompatibleResponse
        }
    }
}

private actor MatchDetailMemoryCache: ReadCacheStoring {
    private struct Address: Hashable {
        let partition: String
        let key: MobileReadCacheKey
    }

    private var values: [Address: Data] = [:]
    private var writes: [MobileReadCacheKey] = []
    private var keyRemovals = 0
    private var partitionRemovals = 0
    private var removalFails = false
    private var shouldBlockRemoval = false
    private var removalContinuation: CheckedContinuation<Void, Never>?
    private var shouldBlockRead = false
    private var readContinuation: CheckedContinuation<Void, Never>?

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
        let key = MobileReadCacheKey(product: product)
        writes.append(key)
        values[Address(partition: partition.digest, key: key)] = data
    }

    func remove(product: MobileReadProduct, partition: ReadCachePartition) throws {
        guard product != .historyDetail, product != .matchDetail else {
            throw ReadCacheError.invalidCacheKey
        }
        keyRemovals += 1
        values.removeValue(forKey: Address(
            partition: partition.digest,
            key: MobileReadCacheKey(product: product)
        ))
    }

    func read(key: MobileReadCacheKey, partition: ReadCachePartition) async -> Data? {
        let snapshot = values[Address(partition: partition.digest, key: key)]
        if shouldBlockRead {
            shouldBlockRead = false
            await withCheckedContinuation { readContinuation = $0 }
        }
        return snapshot
    }

    func write(_ data: Data, key: MobileReadCacheKey, partition: ReadCachePartition) {
        writes.append(key)
        values[Address(partition: partition.digest, key: key)] = data
    }

    func remove(key: MobileReadCacheKey, partition: ReadCachePartition) async throws {
        keyRemovals += 1
        if shouldBlockRemoval {
            shouldBlockRemoval = false
            await withCheckedContinuation { removalContinuation = $0 }
        }
        if removalFails { throw ReadCacheError.storageUnavailable }
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

    func storedData(key: MobileReadCacheKey, partition: ReadCachePartition) -> Data? {
        values[Address(partition: partition.digest, key: key)]
    }

    func setRaw(_ data: Data, key: MobileReadCacheKey, partition: ReadCachePartition) {
        values[Address(partition: partition.digest, key: key)] = data
    }

    func lastWrittenKey() -> MobileReadCacheKey? { writes.last }
    func removeKeyCount() -> Int { keyRemovals }
    func removePartitionCount() -> Int { partitionRemovals }
    func setRemovalFailure(_ value: Bool) { removalFails = value }
    func blockNextRemoval() { shouldBlockRemoval = true }
    func hasSuspendedRemoval() -> Bool { removalContinuation != nil }
    func resumeRemoval() {
        removalContinuation?.resume()
        removalContinuation = nil
    }
    func blockNextRead() { shouldBlockRead = true }
    func hasSuspendedRead() -> Bool { readContinuation != nil }
    func resumeRead() {
        readContinuation?.resume()
        readContinuation = nil
    }
}

private actor MatchDetailHTTPTransport: HTTPTransporting {
    enum Step: Sendable {
        case response(status: Int, data: Data, headers: [String: String])
    }

    private var steps: [Step]
    private var recorded: [URLRequest] = []

    init(steps: [Step]) {
        self.steps = steps
    }

    func data(for request: URLRequest) async throws -> HTTPTransportResult {
        recorded.append(request)
        guard !steps.isEmpty else { throw MobileAPIClientError.transportUnavailable }
        let step = steps.removeFirst()
        switch step {
        case .response(let status, let data, let headers):
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            return HTTPTransportResult(data: data, response: response)
        }
    }

    func requests() -> [URLRequest] { recorded }
    func requestCount() -> Int { recorded.count }
}

private final class MatchDetailRevocationFileManager: FileManager, @unchecked Sendable {
    // Configure immutable failure behavior before transferring this manager
    // into the cache actor. The test never accesses it after that transfer.
    private let failQuarantineDeletion: Bool
    private let failCanonicalDeletion: Bool
    private let failEntryRename: Bool

    init(
        failQuarantineDeletion: Bool = false,
        failCanonicalDeletion: Bool = false,
        failEntryRename: Bool = false
    ) {
        self.failQuarantineDeletion = failQuarantineDeletion
        self.failCanonicalDeletion = failCanonicalDeletion
        self.failEntryRename = failEntryRename
        super.init()
    }

    override func moveItem(at srcURL: URL, to dstURL: URL) throws {
        if failEntryRename, dstURL.lastPathComponent.hasPrefix(".pending-delete-entry-") {
            throw ReadCacheError.storageUnavailable
        }
        try super.moveItem(at: srcURL, to: dstURL)
    }

    override func removeItem(at URL: URL) throws {
        if failQuarantineDeletion, URL.lastPathComponent.hasPrefix(".pending-delete-entry-") {
            throw ReadCacheError.storageUnavailable
        }
        if failCanonicalDeletion, URL.lastPathComponent.hasPrefix("matchDetail-") {
            throw ReadCacheError.storageUnavailable
        }
        try super.removeItem(at: URL)
    }
}
